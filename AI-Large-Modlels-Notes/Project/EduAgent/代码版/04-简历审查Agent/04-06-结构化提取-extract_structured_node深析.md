# 结构化提取：`extract_structured_node` 深度解析

> 源文件：`backend/agents/resume/nodes.py`
> 核心函数：`extract_structured_node`（**第 110~138 行**）
> 对应课件：4.6 结构化提取
> 前置依赖：`ResumeStructured`（`state.py`）、`EXTRACT_STRUCTURED_PROMPT`（`prompts.py`）、`get_structured_llm`（`llm_factory.py`）

---

## 一、全文行号速查表

先给一张行号地图，方便对照源码：

| 行号 | 内容 | 角色 |
|:----:|:-----|:-----|
| 110 | `async def extract_structured_node(state: ResumeState) -> dict:` | 函数定义 |
| 111 | `raw_text = state["raw_text"]` | 从 State 获取原始文本 |
| 112 | `text_for_llm = raw_text[:4000] if len(raw_text) > 4000 else raw_text` | 截断至 4000 字符 |
| 113 | `prompt = EXTRACT_STRUCTURED_PROMPT.format(resume_text=text_for_llm)` | 组装提示词 |
| 114 | `structured_llm = get_structured_llm("resume", ResumeStructured)` | 获取结构化 LLM |
| 115 | `structured_dict = None` | 初始化结果变量 |
| 116 | `for attempt in range(2):` | 最多 2 次重试 |
| 117 | `try:` | 开始尝试 |
| 118~121 | `result = await structured_llm.ainvoke([...])` | 调用 LLM 结构化输出 |
| 122 | `if result is None:` | 空响应检测 |
| 123 | `raise ValueError("structured output returned None")` | 抛出异常触发重试 |
| 124 | `structured_dict = result.model_dump()` | 模型转字典 |
| 125 | `break` | 成功跳出循环 |
| 126 | `except Exception as e:` | 捕获所有异常 |
| 127 | `if attempt == 0:` | 第一次失败 |
| 128 | `logger.warning("extract_structured.retry", ...)` | 记录重试日志 |
| 129 | `await asyncio.sleep(1)` | 等待 1 秒后重试 |
| 130 | `else:` | 第二次（末次）失败 |
| 131 | `logger.warning("extract_structured.failed", ...)` | 记录最终失败日志 |
| 132 | `if structured_dict is None:` | 所有重试均失败 |
| 133 | `structured_dict = ResumeStructured(name="未能提取").model_dump()` | 降级空结构 |
| 134 | `logger.info("extract_structured.done", ...)` | 记录成功日志 |
| 135 | `return {"structured": structured_dict}` | 写回 State |

---

## 二、函数签名与定位（第 110 行）

```python
# nodes.py 第 110 行
async def extract_structured_node(state: ResumeState) -> dict:
    """用 LLM Function Calling 把文本提取成结构化简历。"""
```

- **输入**：`state["raw_text"]`（上一步 `extract_text_node` 提取的纯文本）
- **输出**：`{"structured": dict}`（`ResumeStructured.model_dump()` 的有序字典）
- **定位**：流水线第 4 步，承上启下——上接 `extract_text_node` 产出纯文本，下启 `run_six_dimensions_node` 用结构化摘要做评分

---

## 三、为什么需要这个节点？

纯文本只能给人看，结构化 JSON 才能被程序消费——展示、搜索、评分、对比。

```
extract_text 产出（纯文本）：
  "张三  后端开发
   技能
   Java, Spring Boot, Redis
   项目经历
   电商系统  2023.06-12
   QPS 提升 30%"

extract_structured 产出（有序字典）：
  {
    "name": "张三",
    "target_position": "后端开发",
    "skills_list": ["Java", "Spring Boot", "Redis"],
    "projects": [{
      "name": "电商系统",
      "duration": "2023.06-2023.12",
      "description": "QPS 提升 30%",
      "highlights": ["QPS 提升 30%"]
    }]
  }
```

后续节点全部依赖这个结构化数据：

| 后续节点 | 依赖 structured 的哪个字段 |
|----------|--------------------------|
| `run_six_dimensions` | `_build_structured_summary(structured)` 生成摘要，省 token |
| `diagnose_issues` | 同上，定位问题所属维度 |
| `generate_summary` | 结构化摘要 + 目标岗位 |
| `save_results` | 写入 `resume_reviews.structured_data` JSONB 列 |

---

## 四、逐行精读（第 110~135 行）

### 4.1 文本截断（第 111~112 行）

```python
# nodes.py 第 111~112 行
raw_text = state["raw_text"]
text_for_llm = raw_text[:4000] if len(raw_text) > 4000 else raw_text
```

| 行号 | 代码 | 说明 |
|:----:|:-----|:-----|
| 111 | `raw_text = state["raw_text"]` | 从 State 字典中取出 `raw_text` 字段，这是上一节点 `extract_text_node` 写入的 PDF 纯文本 |
| 112 | `text_for_llm = raw_text[:4000] if len(raw_text) > 4000 else raw_text` | 超过 4000 字符则截断，否则原样使用 |

**为什么是 4000？**

- 简历 PDF 转文本后通常 2000~6000 字符
- 4000 字符约等于 1000~1500 个中文字，覆盖 1~2 页简历的核心内容
- 超长简历里后面的证书/自我评价优先级较低，丢了影响不大
- 与上下文窗口的平衡：省 token 且保留足够信息

**风险意识**：`raw_text` 在 state 里仍然完整保留，后续节点各自按需截取（`run_six_dimensions` 截 3000，`diagnose_issues` 截 3000），互不影响。

### 4.2 组装提示词（第 113 行）

```python
# nodes.py 第 113 行
prompt = EXTRACT_STRUCTURED_PROMPT.format(resume_text=text_for_llm)
```

| 行号 | 代码 | 说明 |
|:----:|:-----|:-----|
| 113 | `prompt = EXTRACT_STRUCTURED_PROMPT.format(resume_text=text_for_llm)` | 用 `text_for_llm` 填入模板的唯一占位符 `{resume_text}` |

对应的提示词模板（`prompts.py`）包含 5 条提取要求：

1. 完整保留项目描述的原始文字，不要改写或压缩
2. 技术栈列表每项单独一个（如 Spring Boot、MySQL，不合并）
3. 时间格式统一为 YYYY.MM - YYYY.MM（如写"至今"则保留"至今"）
4. 无法提取的字段填空字符串，不要填"未知"或"无"
5. 量化亮点：只提取含数字的句子（如"提升30%"、"10万DAU"）

### 4.3 获取结构化 LLM（第 114 行）

```python
# nodes.py 第 114 行
structured_llm = get_structured_llm("resume", ResumeStructured)
```

| 行号 | 代码 | 说明 |
|:----:|:-----|:-----|
| 114 | `structured_llm = get_structured_llm("resume", ResumeStructured)` | 通过工厂方法获取绑定了 `ResumeStructured` Schema 的结构化 LLM |

`LLMFactory.get_structured_llm` 的内部实现：

1. `get_llm("resume")` 查路由表，拿到 `deepseek-chat` 模型
2. `temperature=0` 确保提取任务的确定性
3. `with_structured_output(ResumeStructured, method="function_calling")` 把 Pydantic Schema 翻译成 JSON Schema，通过 Function Calling 约束 LLM 输出

### 4.4 调用 LLM + 重试循环（第 115~131 行）

```python
# nodes.py 第 115~131 行
structured_dict = None
for attempt in range(2):
    try:
        result = await structured_llm.ainvoke([
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content=prompt),
        ])
        if result is None:
            raise ValueError("structured output returned None")
        structured_dict = result.model_dump()
        break
    except Exception as e:
        if attempt == 0:
            logger.warning("extract_structured.retry", error=str(e))
            await asyncio.sleep(1)
        else:
            logger.warning("extract_structured.failed", error=str(e))
```

| 行号 | 代码 | 说明 |
|:----:|:-----|:-----|
| 115 | `structured_dict = None` | 初始化为 `None`，作为"是否成功"的标志 |
| 116 | `for attempt in range(2):` | 最多 2 次尝试（0 和 1） |
| 117 | `try:` | 开始尝试块 |
| 118~121 | `result = await structured_llm.ainvoke([SystemMessage(...), HumanMessage(...)])` | 两条消息：`SystemMessage` 设定人设（职业顾问），`HumanMessage` 携带具体提取任务 |
| 122 | `if result is None:` | DeepSeek Function Calling 偶发返回 `None`——不是抛异常，而是 `ainvoke` 正常返回但值为 `None` |
| 123 | `raise ValueError("structured output returned None")` | 手动抛出异常，统一进入 `except` 分支处理 |
| 124 | `structured_dict = result.model_dump()` | 成功时把 Pydantic 模型转成普通字典，便于后续写入 State |
| 125 | `break` | 成功后跳出 `for` 循环，不再重试 |
| 126 | `except Exception as e:` | 捕获所有异常（网络超时、API 错误、空响应等） |
| 127 | `if attempt == 0:` | 第一次失败 |
| 128 | `logger.warning("extract_structured.retry", ...)` | 打 `warning` 级别日志，记录错误原因 |
| 129 | `await asyncio.sleep(1)` | 等 1 秒后再重试，避开瞬时网络抖动 |
| 130 | `else:` | 第二次（末次）失败 |
| 131 | `logger.warning("extract_structured.failed", ...)` | 打 `warning` 日志，放弃重试 |

**为什么需要重试？** DeepSeek Function Calling 偶发返回 `None`——不是抛异常，而是 `ainvoke` 正常返回但值为 `None`。这像是 API 层的"空响应"问题，不是模型本身报错。

**为什么不用指数退避？** 重试只有 1 次，等 1 秒够避开瞬时网络抖动。指数退避（1s → 2s → 4s）在只有 2 次尝试时没有意义。

### 4.5 降级兜底（第 132~133 行）

```python
# nodes.py 第 132~133 行
if structured_dict is None:
    structured_dict = ResumeStructured(name="未能提取").model_dump()
```

| 行号 | 代码 | 说明 |
|:----:|:-----|:-----|
| 132 | `if structured_dict is None:` | 两次尝试都失败，`structured_dict` 仍为 `None` |
| 133 | `structured_dict = ResumeStructured(name="未能提取").model_dump()` | 创建一个只填充了 `name="未能提取"` 的空结构，其余字段全部为默认值 |

降级结果示例：

```json
{"name": "未能提取", "phone": "", "email": "", "target_position": "",
 "education": [], "skills_list": [], "projects": [], ...}
```

**"优雅降级"（graceful degradation）**：后续节点仍然可以运行——`run_six_dimensions` 基于 `raw_text` 评分，`_build_structured_summary` 会返回"（结构化提取失败，请基于原文评审）"，整体流程不中断。

### 4.6 日志与返回值（第 134~135 行）

```python
# nodes.py 第 134~135 行
logger.info("extract_structured.done",
            name=structured_dict.get("name", ""),
            projects_count=len(structured_dict.get("projects", [])))
return {"structured": structured_dict}
```

| 行号 | 代码 | 说明 |
|:----:|:-----|:-----|
| 134 | `logger.info("extract_structured.done", ...)` | 结构化日志，记录姓名和项目数。方便搜索 "哪些简历提取失败了？" → 搜 `extract_structured.failed` |
| 135 | `return {"structured": structured_dict}` | 写回 State，`state["structured"]` 被更新为结构化字典 |

---

## 五、调用方式与依赖

### 5.1 调用链路

```
extract_text_node
    │
    │  raw_text (纯文本)
    ▼
extract_structured_node  ←── 当前节点
    │
    │  structured (有序字典)
    ▼
run_six_dimensions_node
```

### 5.2 依赖清单

| 依赖类型 | 具体依赖 | 用途 |
|---------|---------|------|
| State 读 | `state["raw_text"]` | 获取 PDF 纯文本 |
| State 写 | `state["structured"]` | 写入结构化简历字典 |
| 外部函数 | `get_structured_llm("resume", ResumeStructured)` | 获取带 Schema 绑定的 LLM |
| 外部函数 | `EXTRACT_STRUCTURED_PROMPT.format(...)` | 组装提取提示词 |
| 外部常量 | `SYSTEM_PROMPT` | 全局人设（职业顾问） |
| 外部模型 | `ResumeStructured`（`state.py`） | 输出 Schema |
| LLM 模型 | 路由表 `resume` → `deepseek-chat` | Function Calling 结构化输出 |

### 5.3 失败模式

| 场景 | 表现 |
|------|------|
| LLM 正常返回 | 正确提取所有字段 |
| LLM 返回 None（偶发） | 重试 1 次，仍失败则降级空结构 |
| 网络超时/API 异常 | 同上 |
| 两次重试均失败 | 降级 `{"name": "未能提取"}` 空结构，不阻塞流程 |

---

## 六、`★` 设计亮点

### 6.1 结构化输出取代文本解析

`★ Insight ─────────────────────────────────────`
**"与其写正则解析 LLM 的自由文本，不如让 LLM 直接输出结构化对象"**：
- 传统方案：LLM 输出文字 → 正则/NER 提取 → 拼 JSON，每个字段都要写不同的解析规则，LLM 输出格式稍微变化就崩
- 本项目方案：LLM 调用 Function Calling → 直接返回 `ResumeStructured` 对象，不需要任何解析代码
- 字段名、类型、嵌套结构都在 Schema 里定义，LLM 自动遵守——这是"Schema-as-Contract"模式
- `Field(description=...)` 不仅是 Pydantic 元数据，还会被翻译成 JSON Schema 的 `description` 字段，直接作为 LLM 的指令
`─────────────────────────────────────────────────`

### 6.2 重试搭在降级上

`★ Insight ─────────────────────────────────────`
**"重试耗尽不抛异常，降级空结构让流程继续"**：
- 典型的重试模式：重试耗尽 → 抛异常 → 整个流程中断
- 本项目的模式：重试耗尽 → 降级空结构 → 后续节点继续运行
- 三层保障：第 1 层重试 1 次（瞬时抖动），第 2 层空结构兜底（LLM 持续不可用），第 3 层后续节点基于 `raw_text` 运行（全部节点不中断）
- `name` 是 `ResumeStructured` 的唯一必填字段——"提取失败"的标志就是 name 拿不到，其他字段可空
`─────────────────────────────────────────────────`

### 6.3 截断与全量保留的平衡

`★ Insight ─────────────────────────────────────`
**"给 LLM 的文本要截断，但原始数据要保留"**：
- 给 LLM 看的文本截断到 4000 字符（省 token、聚焦核心内容）
- `raw_text` 在 State 中完整保留，后续节点各自按需截取（3000、2000 不等）
- 每个节点独立决定截断长度，互不影响——这是"关注点分离"的体现
- `skills_raw` 保留原文 + `skills_list` 解析后的列表，两者共存，既能看原文又能程序化使用
`─────────────────────────────────────────────────`

---

## 七、边界情况处理

| 场景 | 表现 |
|------|------|
| 简历内容正常 | 正确提取所有字段 |
| 简历内容超长（>4000 字符） | 截断前 4000 字符，后续内容丢失 |
| LLM 返回 None（偶发） | 重试 1 次，仍失败则降级空结构 |
| 简历内容极短（几句话） | 正常提取，大多数字段为空 |
| 简历为英文 | 同样提取，字段内容为英文 |
| 无项目经历 | `projects` 返回空列表 |
| 目标岗位缺失 | `target_position` 为空字符串 |
| 两次重试均失败 | 降级 `{"name": "未能提取"}` 空结构 |

---

## 八、数据流全景

```
extract_text_node                    extract_structured_node
    │                                        │
    │  raw_text (纯文本)                      │  structured (有序字典)
    │  "张三  后端开发                         │  {"name": "张三",
    │   技能                                   │   "target_position": "后端开发",
    │   Java, Spring Boot, Redis              │   "skills_list": ["Java","Spring Boot","Redis"],
    │   项目经历                               │   "projects": [{"name": "电商系统", ...}],
    │   电商系统  2023.06-12                   │   "education": [...],
    │   QPS 提升 30%"                          │   ...}
    │                                        │
    └──────────────────┬─────────────────────┘
                       │
          ┌────────────┼────────────┐
          │            │            │
          ▼            ▼            ▼
   run_six_dimensions  diagnose     generate_summary
   (结构化摘要评分)    (问题定位)    (生成评价)
          │            │            │
          └────────────┼────────────┘
                       ▼
                save_results
           (写入 resume_reviews 表)
```