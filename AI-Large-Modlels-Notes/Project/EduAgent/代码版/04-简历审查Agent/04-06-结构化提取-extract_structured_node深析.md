# 结构化提取：`extract_structured_node` 深度解析

> 源文件：`backend/agents/resume/nodes.py` 第 110~138 行

## 一、函数签名与定位

```python
async def extract_structured_node(state: ResumeState) -> dict:
    """用 LLM Function Calling 把文本提取成结构化简历。"""
```

- **输入**：`state["raw_text"]`（上一步 PDF 提取的纯文本）
- **输出**：`{"structured": dict}`（`ResumeStructured.model_dump()` 的有序字典）
- **定位**：流水线第 ④ 步，承上启下——
  - 上接：`extract_text_node` 产出纯文本
  - 下启：`run_six_dimensions_node` 用结构化摘要做评分

## 二、为什么需要这个节点？

### 2.1 数据形态的飞跃

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
    }],
    "education": [...]
  }
```

纯文本只能给人看，结构化 JSON 才能被程序消费——展示、搜索、评分、对比。

### 2.2 后续节点的依赖

| 后续节点 | 依赖 structured 的哪个字段 |
|----------|--------------------------|
| `run_six_dimensions` | `_build_structured_summary(structured)` 生成摘要，省 token |
| `diagnose_issues` | 同上，定位问题所属维度 |
| `generate_summary` | 结构化摘要 + 目标岗位 |
| `save_results` | 写入 `resume_reviews.structured_data` JSONB 列 |
| 前端展示 | 渲染结构化简历 |

## 三、逐行精读

### 3.1 文本截断

```python
raw_text = state["raw_text"]
text_for_llm = raw_text[:4000] if len(raw_text) > 4000 else raw_text
```

**为什么是 4000？**

- 简历 PDF 转文本后通常 2000~6000 字符
- 4000 字符 ≈ 1000~1500 个中文字，覆盖 1~2 页简历的核心内容
- 超长简历里后面的证书/自我评价优先级较低，丢了影响不大
- 与上下文窗口的平衡：省 token 且保留足够信息

**风险意识**：`raw_text` 在 state 里仍然完整保留，后续节点各自按需截取（`run_six_dimensions` 截 3000，`diagnose_issues` 截 3000），互不影响。

### 3.2 组装 Prompt

```python
prompt = EXTRACT_STRUCTURED_PROMPT.format(resume_text=text_for_llm)
```

对应的提示词模板（`prompts.py` 第 12~22 行）：

```
请从以下简历文本中提取结构化信息。

【简历原文】
{resume_text}

提取要求：
- 完整保留项目描述的原始文字，不要改写或压缩
- 技术栈列表每项单独一个（如 Spring Boot、MySQL，不合并）
- 时间格式统一为 YYYY.MM - YYYY.MM（如写"至今"则保留"至今"）
- 无法提取的字段填空字符串，不要填"未知"或"无"
- 量化亮点：只提取含数字的句子（如"提升30%"、"10万DAU"）
```

**设计要点**：
- `{resume_text}` 单一占位符，简单清晰
- 5 条要求覆盖了提取任务的常见陷阱：不要改写原文、不要合并技术栈、时间格式统一、不要填"未知"、特殊提取量化亮点

### 3.3 获取结构化 LLM

```python
structured_llm = get_structured_llm("resume", ResumeStructured)
```

`LLMFactory.get_structured_llm` 的内部实现（`llm_factory.py` 第 122~132 行）：

```python
@classmethod
def get_structured_llm(cls, agent_type, output_schema, temperature=0):
    llm = cls.get_llm(agent_type, temperature=temperature)
    return llm.with_structured_output(output_schema, method="function_calling")
```

关键机制：

1. **`get_llm("resume")`** → 查路由表，拿到 `deepseek-chat` → 映射为 API 实际模型名 `deepseek-v4-flash`
2. **`temperature=0`** → 提取任务要确定性，不需要创造性
3. **`with_structured_output(ResumeStructured, method="function_calling")`** → 把 Pydantic Schema 翻译成 JSON Schema，通过 Function Calling 约束 LLM 输出

```
LLM 看到的（简化）：
{
  "functions": [{
    "name": "output_schema",
    "parameters": {
      "type": "object",
      "properties": {
        "name":        {"type": "string", "description": "姓名"},
        "phone":       {"type": "string", "description": "手机号"},
        "education":   {"type": "array", "items": {...}},
        "projects":    {"type": "array", "items": {...}},
        ...
      },
      "required": ["name"]
    }
  }]
}
```

LLM 返回的不是文字，而是直接一个 `ResumeStructured` 对象——不需要写正则/NER 来解析。

### 3.4 调用 LLM

```python
result = await structured_llm.ainvoke([
    SystemMessage(content=SYSTEM_PROMPT),
    HumanMessage(content=prompt),
])
```

**两条消息结构**：

| 角色 | 内容 | 作用 |
|------|------|------|
| `SystemMessage` | `SYSTEM_PROMPT` | 设定人设：经验丰富的职业顾问 |
| `HumanMessage` | `EXTRACT_STRUCTURED_PROMPT` | 具体任务：提取结构化简历 |

`SystemMessage` 是全局共享的（`SYSTEM_PROMPT` 在所有 resume 节点中复用）。这里的"职业顾问"人设对提取任务也有帮助——职业顾问自然知道从简历中提取哪些信息是重要的。

### 3.5 重试机制

```python
structured_dict = None
for attempt in range(2):
    try:
        result = await structured_llm.ainvoke([...])
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

**为什么需要重试？**

DeepSeek Function Calling 偶发返回 `None`——不是抛异常，而是 `ainvoke` 正常返回但值为 `None`。这像是 API 层的"空响应"问题，不是模型本身报错。

**重试策略**：

| 尝试次数 | 失败反应 |
|----------|----------|
| attempt 0 | 打 `warning` 日志，等 1 秒，重试 |
| attempt 1 | 打 `warning` 日志，放弃，走降级 |

**为什么不用指数退避？** 重试只有 1 次，等 1 秒够避开瞬时网络抖动。指数退避（1s → 2s → 4s）在只有 2 次尝试时没有意义。

### 3.6 降级兜底

```python
if structured_dict is None:
    structured_dict = ResumeStructured(name="未能提取").model_dump()
```

两次都失败时，创建一个**空结构**而不是抛异常：

```json
{"name": "未能提取", "phone": "", "email": "", "target_position": "",
 "education": [], "skills_list": [], "projects": [], ...}
```

**"优雅降级"（graceful degradation）**：后续节点仍然可以运行——`run_six_dimensions` 基于 `raw_text` 评分，`_build_structured_summary` 会返回"（结构化提取失败，请基于原文评审）"，整体流程不中断。

### 3.7 日志记录

```python
logger.info("extract_structured.done",
            name=structured_dict.get("name", ""),
            projects_count=len(structured_dict.get("projects", [])))
```

结构化日志，记录姓名和项目数。方便通过日志检索：
- "哪些简历提取失败了？" → 搜 `extract_structured.failed`
- "平均项目数是多少？" → 统计 `projects_count`
- "提取出的姓名对不对？" → 看 `name`

## 四、完整的 `ResumeStructured` Schema

```python
class ResumeStructured(BaseModel):
    name:            str                  # 姓名（必填）
    phone:           str  = ""            # 手机号
    email:           str  = ""            # 邮箱
    target_position: str  = ""            # 求职意向
    education:       list[EducationItem]  # 教育经历
    skills_raw:      str  = ""            # 技能栏原文
    skills_list:     list[str]            # 技术标签列表
    projects:        list[ProjectItem]    # 项目经历
    work_experience: list[WorkItem]       # 工作经历
    certificates:    list[str]            # 证书列表
    self_intro:      str  = ""            # 自我评价原文
```

嵌套模型：

```
ResumeStructured
├── name, phone, email, target_position
├── education: list[EducationItem]
│   ├── school, major, degree, duration
│   └── gpa? (可选)
├── skills_raw, skills_list
├── projects: list[ProjectItem]
│   ├── name, role, duration
│   ├── tech_stack: list[str]
│   ├── description
│   └── highlights: list[str]  ← 量化亮点
├── work_experience: list[WorkItem]
│   ├── company, position, duration
│   ├── tech_stack: list[str]
│   └── description
├── certificates: list[str]
└── self_intro
```

**字段设计要点**：

- `name` 是唯一必填字段。为什么？"提取失败"的标志就是 name 拿不到，其他字段可空
- `skills_raw` 保留原文 + `skills_list` 解析后的列表。两者共存，既能看原文又能程序化使用
- `highlights` 是 `ProjectItem` 的量化亮点——专门提取含数字的句子，供后续评审使用
- 所有可选字段都有 `default=""` 或 `default_factory=list`，LLM 提取不到时不会报错

## 五、`★` 设计亮点

### 5.1 结构化输出取代文本解析

传统方案：LLM 输出文字 → 正则/NER 提取 → 拼 JSON

```
❌ LLM 输出 "姓名是张三" → 正则 "姓名[：:]\s*(\S+)" → "张三"
❌ 每个字段都要写不同的解析规则
❌ LLM 输出格式稍微变化就崩
```

本项目方案：LLM 直接输出结构化对象

```
✅ LLM 调用 Function Calling → 直接返回 ResumeStructured 对象
✅ 不需要任何解析代码
✅ 字段名、类型、嵌套结构都在 Schema 里定义，LLM 自动遵守
```

### 5.2 `description` 即提示词

```python
class EducationItem(BaseModel):
    school:   str = Field(description="学校名称")
    major:    str = Field(description="专业名称")
    degree:   str = Field(description="学历：本科/专科/硕士等")
    duration: str = Field(description="在校时间，如 2020.09 - 2024.06")
```

每个 `Field(description=...)` 不仅是 Pydantic 的元数据，还会通过 `with_structured_output` 被翻译成 JSON Schema 的 `description` 字段，**直接作为 LLM 的指令**。这比在 prompt 里写"请提取学校名称"更精确、更结构化。

### 5.3 重试搭在降级上

典型的重试模式：

```
重试耗尽 → 抛异常 → 整个流程中断 ❌
```

本项目的模式：

```
重试耗尽 → 降级空结构 → 后续节点继续运行 ✅
```

三层保障：

| 层 | 机制 | 保护范围 |
|----|------|----------|
| 第 1 层 | 重试 1 次 | 瞬时网络抖动/API 空响应 |
| 第 2 层 | 空结构兜底 | LLM 持续不可用 |
| 第 3 层 | 后续节点基于 raw_text 运行 | 全部节点不中断 |

## 六、与 `_sync_extract_text` 的对比

| 维度 | `_sync_extract_text` | `extract_structured_node` |
|------|----------------------|---------------------------|
| 输入 | PDF 文件路径 | 纯文本 `raw_text` |
| 输出 | 纯文本 | 结构化 JSON |
| 技术栈 | PyMuPDF（C 库） | DeepSeek Function Calling |
| 耗时 | < 10ms | 1~3 秒（LLM 调用） |
| 失败模式 | 抛异常 | 降级空结构 |
| 是否可重试 | 否（重试成本低，直接重跑） | 是（1 次重试 + 降级） |

## 七、边界情况处理

| 场景 | 表现 |
|------|------|
| 简历内容正常 | 正确提取所有字段 |
| 简历内容超长（>4000 字符） | 截断前 4000 字符，后续内容丢失 |
| LLM 返回 None（偶发） | 重试 1 次，仍失败则降级空结构 |
| LLM 返回异常 | 同上 |
| 简历内容极短（几句话） | 正常提取，大多数字段为空 |
| 简历为英文 | 同样提取，字段内容为英文 |
| 无项目经历 | `projects` 返回空列表，`_build_structured_summary` 跳过项目部分 |
| 目标岗位缺失 | `target_position` 为空字符串，`generate_summary` 使用默认值"后端开发" |

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