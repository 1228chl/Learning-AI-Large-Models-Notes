# 问题诊断：`diagnose_issues_node` 深度解析

> 源文件：`backend/agents/resume/nodes.py`
> 核心函数：`diagnose_issues_node`（**第 214~270 行**）
> 对应课件：4.8 问题诊断
> 前置依赖：`IssueList`/`IssueItem`（`state.py`）、`DIAGNOSE_THINK_PROMPT`/`DIAGNOSE_ISSUES_PROMPT`（`prompts.py`）

---

## 一、全文行号速查表

先给一张行号地图，方便对照源码：

| 行号 | 内容 | 角色 |
|:----:|:-----|:-----|
| 214 | `async def diagnose_issues_node(state: ResumeState) -> dict:` | 函数定义 |
| 215 | `dimension_scores = state.get("dimension_scores", [])` | 获取各维度评分 |
| 216 | `raw_text = state["raw_text"]` | 获取原始文本 |
| 217 | `structured = state.get("structured") or {}` | 获取结构化数据 |
| 219 | `all_raw_issues = []` | 收集原始问题列表 |
| 220~222 | `for dim in dimension_scores: for issue_text in dim.get("issues", []):` | 遍历各维度问题 |
| 223 | `all_raw_issues.append(f"[{dim['dimension']}] {issue_text}")` | 加维度前缀 |
| 224 | `raw_issues_text = "\n".join(...) or "（暂无）"` | 统一文本格式 |
| 226 | `reasoning_trace = ""` | Think 前置推理初始化 |
| 227 | `try:` | Think 可失败 |
| 228~230 | `dimension_scores_summary = "\n".join(...)` | 构建评分摘要 |
| 231~232 | `think_prompt = DIAGNOSE_THINK_PROMPT.format(...)` | 组装 Think 提示词 |
| 233 | `think_llm = get_llm("resume", temperature=0)` | 普通 LLM（非结构化） |
| 234 | `think_resp = await think_llm.ainvoke([HumanMessage(content=think_prompt)])` | 调用 Think |
| 235~237 | `reasoning_trace = (...).strip()` | 提取思考文本 |
| 238~239 | `except Exception as e: logger.warning("diagnose_think.failed", ...)` | Think 失败不阻塞 |
| 241 | `think_context = f"\n\n【诊断前宏观分析】\n{reasoning_trace}" if reasoning_trace else ""` | 拼接 Think 上下文 |
| 243~246 | `prompt = DIAGNOSE_ISSUES_PROMPT.format(...) + think_context` | 组装诊断提示词 |
| 248 | `try:` | 开始结构化诊断 |
| 249 | `structured_llm = get_structured_llm("resume", IssueList)` | 获取结构化 LLM |
| 250~252 | `result = await structured_llm.ainvoke([...])` | 调用 LLM |
| 253 | `issues = [item.model_dump() for item in result.items]` | 转列表 |
| 254 | `except Exception as e:` | 捕获异常 |
| 255~259 | `logger.warning(...)` / 降级 issues | 降级用维度原始问题 |
| 261 | `priority_order = {"high": 0, "medium": 1, "low": 2}` | 优先级排序映射 |
| 262 | `issues.sort(key=...)` | 按优先级排序 |
| 264 | `return {"issues": issues}` | 返回 |

---

## 二、函数签名与定位（第 214 行）

```python
# nodes.py 第 214 行
async def diagnose_issues_node(state: ResumeState) -> dict:
    """汇总维度问题 → Think 前置推理 → 结构化生成问题清单 → 按优先级排序。"""
```

- **输入**：`state["dimension_scores"]`（各维度评分）+ `state["raw_text"]` + `state["structured"]`
- **输出**：`{"issues": list[dict]}`（按优先级排序的问题清单，每条含 priority/dimension/description/location/suggestion）
- **定位**：流水线第 6 步，承上启下——上接 `run_six_dimensions_node` 产出各维度的评分和问题列表，下启 `generate_summary_node` 用高优先级问题生成整体评价

---

## 三、为什么需要这个节点？

`run_six_dimensions_node` 已经给出了每个维度的评分和问题列表，但这些问题是**独立评审**的产物——每个维度各说各的，缺少全局视角。

| 问题 | 六维度的局限 | diagnose_issues 的解决 |
|------|-------------|----------------------|
| **碎片化** | 6 个维度各自列问题，可能重复或矛盾 | 合并、去重、归纳共同模式 |
| **缺优先级** | 所有问题平铺，没有轻重缓急 | 按 high/medium/low 排序 |
| **缺定位** | 只说"有问题"，不说"在哪里" | 每条问题定位到具体位置（如"项目经历-电商系统-第2句"） |

后续节点依赖：

| 后续节点 | 依赖 issues 的哪个字段 |
|----------|----------------------|
| `generate_summary` | `high_issues`（高优先级问题的 description），用于生成改进方向 |
| `save_results` | 写入 `resume_reviews.issues` JSONB 列 |
| 前端展示 | 展示问题清单，按优先级高亮 |

---

## 四、逐行精读（第 214~264 行）

### 4.1 收集原始问题（第 215~224 行）

```python
# nodes.py 第 215~224 行
dimension_scores = state.get("dimension_scores", [])
raw_text         = state["raw_text"]
structured       = state.get("structured") or {}

all_raw_issues = []
for dim in dimension_scores:
    for issue_text in dim.get("issues", []):
        all_raw_issues.append(f"[{dim['dimension']}] {issue_text}")
raw_issues_text = "\n".join(f"- {i}" for i in all_raw_issues) or "（暂无）"
```

| 行号 | 代码 | 说明 |
|:----:|:-----|:-----|
| 215 | `dimension_scores = state.get("dimension_scores", [])` | 用 `get()` 带默认值，防止维度评分不存在时返回空列表 |
| 216 | `raw_text = state["raw_text"]` | 获取完整原文 |
| 217 | `structured = state.get("structured") or {}` | 防止 structured 为 None |
| 219 | `all_raw_issues = []` | 初始化收集器 |
| 220 | `for dim in dimension_scores:` | 遍历 6 个维度的评分结果 |
| 221 | `for issue_text in dim.get("issues", []):` | 遍历该维度的每个问题文本 |
| 222 | `all_raw_issues.append(f"[{dim['dimension']}] {issue_text}")` | 每条问题加上维度前缀 |

**为什么加维度前缀 `[维度名]`？** 后续 LLM 诊断时可以知道每条问题来自哪个维度，便于跨维度分析。

| 行号 | 代码 | 说明 |
|:----:|:-----|:-----|
| 224 | `raw_issues_text = "\n".join(f"- {i}" for i in all_raw_issues) or "（暂无）"` | 每条问题转成 `- ` 列表项，用换行连接；如果没有任何问题，置为"（暂无）" |

汇总后的文本格式：

```
- [项目深度] 项目描述缺少量化数据
- [技术匹配度] 技能描述没有掌握程度分级
- [表达规范性] 部分条目不是动词开头
```

### 4.2 Think 前置推理（第 226~239 行）

```python
# nodes.py 第 226~239 行
reasoning_trace = ""                              # Think 前置推理（可失败）
try:
    dimension_scores_summary = "\n".join(
        f"- {d['dimension']}：{d['score']}分 — 问题：{', '.join(d.get('issues', [])[:2])}"
        for d in dimension_scores
    )
    think_prompt = DIAGNOSE_THINK_PROMPT.format(
        dimension_scores_summary=dimension_scores_summary, raw_issues=raw_issues_text)
    think_llm = get_llm("resume", temperature=0)
    think_resp = await think_llm.ainvoke([HumanMessage(content=think_prompt)])
    reasoning_trace = (
        think_resp.text if hasattr(think_resp, "text") and not callable(think_resp.text)
        else str(think_resp.content)
    ).strip()
except Exception as e:
    logger.warning("diagnose_think.failed", error=str(e))
```

| 行号 | 代码 | 说明 |
|:----:|:-----|:-----|
| 226 | `reasoning_trace = ""` | 初始化为空字符串，Think 失败时保持空 |
| 227 | `try:` | Think 步骤可失败，用 try-except 包裹 |
| 228~230 | `dimension_scores_summary = "\n".join(...)` | 把 6 个维度的评分和每个维度的前 2 个问题压成文本 |
| 231~232 | `think_prompt = DIAGNOSE_THINK_PROMPT.format(...)` | 用评分摘要和问题列表填入 Think 提示词的两个占位符 |
| 233 | `think_llm = get_llm("resume", temperature=0)` | **关键**：用普通 LLM，不是结构化 LLM。思考分析需要自由输出 |
| 234 | `think_resp = await think_llm.ainvoke([HumanMessage(content=think_prompt)])` | 调用 Think |
| 235~237 | `reasoning_trace = (think_resp.text ... else str(think_resp.content)).strip()` | 兼容不同 SDK 的响应格式，提取文本内容并去除首尾空白 |
| 238~239 | `except Exception as e: logger.warning("diagnose_think.failed", ...)` | **Think 失败不阻塞**，打 warning 日志后继续 |

**核心机制："先想后答"（Think-then-Answer）**。Think 提示词让 LLM 先做宏观分析：

1. 这份简历最核心的短板是什么？（最多 2 个，直接影响竞争力）
2. 各维度问题之间是否存在共同模式或根本原因？
3. 声称的技能与实际项目经历描述之间是否存在明显落差？
4. 哪些问题最影响面试官的第一印象，应列为高优先级？

**关键设计**：
- Think 用普通 LLM（`get_llm`）而非结构化 LLM（`get_structured_llm`），思考分析需要自由输出，不被 Schema 约束
- 可能失败但不阻塞：`reasoning_trace` 默认空字符串，失败时整个诊断照常进行

### 4.3 拼接 Think 上下文（第 241 行）

```python
# nodes.py 第 241 行
think_context = f"\n\n【诊断前宏观分析】\n{reasoning_trace}" if reasoning_trace else ""
```

| 行号 | 代码 | 说明 |
|:----:|:-----|:-----|
| 241 | `think_context = f"\n\n【诊断前宏观分析】\n{reasoning_trace}" if reasoning_trace else ""` | Think 成功则在诊断 prompt 末尾追加宏观分析段；失败则不加任何内容 |

诊断 LLM 所以能看到：

```
【诊断前宏观分析】
这份简历的核心短板是项目描述缺乏量化数据，各维度问题之间存在一个共同模式：
候选人倾向于用"负责"、"参与"等笼统词汇描述项目，而非具体的技术选型理由和量化成果。
```

### 4.4 结构化生成问题清单（第 243~259 行）

```python
# nodes.py 第 243~259 行
prompt = DIAGNOSE_ISSUES_PROMPT.format(
    resume_text=raw_text[:3000],
    structured_summary=_build_structured_summary(structured),
    raw_issues=raw_issues_text,
) + think_context

try:
    structured_llm = get_structured_llm("resume", IssueList)
    result = await structured_llm.ainvoke([
        SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=prompt)])
    issues = [item.model_dump() for item in result.items]
except Exception as e:
    logger.warning("diagnose_issues.failed", error=str(e))
    issues = [                                    # 降级：用维度问题，统一 medium
        {"priority": "medium", "dimension": dim["dimension"], "description": issue,
         "location": "简历全文", "suggestion": "请参考评审建议修改"}
        for dim in dimension_scores for issue in dim.get("issues", [])
    ]
```

| 行号 | 代码 | 说明 |
|:----:|:-----|:-----|
| 243~246 | `prompt = DIAGNOSE_ISSUES_PROMPT.format(resume_text=raw_text[:3000], structured_summary=..., raw_issues=...) + think_context` | 三个占位符（原文/摘要/原始问题）+ 追加 Think 上下文 |
| 248 | `try:` | 开始结构化诊断 |
| 249 | `structured_llm = get_structured_llm("resume", IssueList)` | 获取绑定 `IssueList` Schema 的 LLM |
| 250~252 | `result = await structured_llm.ainvoke([SystemMessage(...), HumanMessage(...)])` | 调用 LLM |
| 253 | `issues = [item.model_dump() for item in result.items]` | 遍历 `IssueList.items`，把每个 `IssueItem` 转成字典 |
| 254 | `except Exception as e:` | 捕获异常 |
| 255 | `logger.warning("diagnose_issues.failed", ...)` | 记录失败日志 |
| 256~259 | `issues = [...降级列表...]` | **降级**：用各维度的原始问题，统一 medium 优先级 |

诊断提示词（`DIAGNOSE_ISSUES_PROMPT`）包含 6 条输出要求：

1. 每条问题必须定位到简历的具体位置（如"项目经历-电商系统-第2句"）
2. 优先级判断标准：high（严重影响 HR 通过率）/ medium（影响竞争力）/ low（锦上添花）
3. 时间线推理规则（避免误判）：
   - 项目时间落在某段工作经历区间内，视为该公司的工作项目，属于正常，不得标记为矛盾
   - 只有当项目时间与所有工作经历区间均无交集时，才提示候选人补充项目来源说明（low 优先级）
   - 多个项目与同一段工作经历时间重叠，同样正常，不构成矛盾
4. 建议必须具体可操作（给出修改示例或明确指导）
5. 去除重复问题，合并相似问题
6. 总数控制在 5-15 条

**第 3 条特别重要**：这是专门针对"时间线误判"的规则。很多简历的项目时间会落在工作经历的时间段内（比如在 A 公司工作期间做了 B 项目），如果没有这条规则，LLM 很容易误判为"时间线矛盾"。

### 4.5 按优先级排序（第 261~262 行）

```python
# nodes.py 第 261~262 行
priority_order = {"high": 0, "medium": 1, "low": 2}
issues.sort(key=lambda x: priority_order.get(x.get("priority", "low"), 2))
```

| 行号 | 代码 | 说明 |
|:----:|:-----|:-----|
| 261 | `priority_order = {"high": 0, "medium": 1, "low": 2}` | 优先级到排序权重的映射，high 最小排最前 |
| 262 | `issues.sort(key=lambda x: priority_order.get(x.get("priority", "low"), 2))` | 按优先级排序；`get(..., 2)` 兜底：未知优先级按 low 处理 |

### 4.6 日志与返回值（第 264 行）

```python
# nodes.py 第 264 行
logger.info("diagnose_issues.done",
            total=len(issues),
            high=sum(1 for i in issues if i.get("priority") == "high"))
return {"issues": issues}
```

| 行号 | 代码 | 说明 |
|:----:|:-----|:-----|
| 264 | `logger.info("diagnose_issues.done", total=len(issues), high=...)` | 记录问题总数和高优先级问题数 |

---

## 五、调用方式与依赖

### 5.1 调用链路

```
run_six_dimensions_node
    │
    │  dimension_scores + raw_text + structured
    ▼
diagnose_issues_node  ←── 当前节点
    │
    │  issues (按优先级排序)
    ▼
generate_summary_node
```

### 5.2 依赖清单

| 依赖类型 | 具体依赖 | 用途 |
|---------|---------|------|
| State 读 | `state["dimension_scores"]` | 各维度评分和问题 |
| State 读 | `state["raw_text"]` | 简历原文 |
| State 读 | `state["structured"]` | 结构化简历摘要 |
| State 写 | `state["issues"]` | 按优先级排序的问题清单 |
| 外部函数 | `get_llm("resume")` | Think 前置推理（普通 LLM） |
| 外部函数 | `get_structured_llm("resume", IssueList)` | Answer 结构化输出 |
| 外部函数 | `_build_structured_summary(structured)` | 生成结构化摘要 |
| 外部常量 | `DIAGNOSE_THINK_PROMPT` / `DIAGNOSE_ISSUES_PROMPT` | 两阶段提示词 |
| 外部模型 | `IssueList` / `IssueItem`（`state.py`） | 输出 Schema |

### 5.3 LLM 调用次数

本节点**2 次串行 LLM 调用**（Think → Answer），与 `run_six_dimensions` 的 6 路并行不同：

| 阶段 | 模型 | 输出格式 | 目标 |
|------|------|---------|------|
| Think | 普通 LLM（无约束） | 自由文本 | 宏观分析、归纳模式 |
| Answer | 结构化 LLM（Schema 约束） | 结构化 JSON | 逐条问题、精确定位 |

---

## 六、`★` 设计亮点

### 6.1 "先想后答"（Think-then-Answer）

`★ Insight ─────────────────────────────────────`
**"让 LLM 先做宏观分析，再逐条诊断，质量远高于直接列问题"**：
- 第 1 步 Think（普通 LLM，自由输出）：宏观分析简历的"病根"——核心短板、共同模式、技能落差、高优先级问题
- 第 2 步 Answer（结构化 LLM，Schema 约束输出）：逐条生成 `{priority, dimension, description, location, suggestion}`
- 与"人写规则 → 聚合 → 排序"的传统方案相比，简历问题千变万化，规则很难覆盖全，让 LLM 自己先想后答质量更高
- Think 用普通 LLM 而非结构化 LLM：Schema 约束会限制思考深度，自由输出才能发散分析
`─────────────────────────────────────────────────`

### 6.2 Think 失败不阻塞

`★ Insight ─────────────────────────────────────`
**"宁可没有宏观分析，也不能让整个流程中断"**：
- Think 步骤被包裹在 try-except 中，失败时 `reasoning_trace` 保持空字符串，诊断照常进行
- `think_context = ... if reasoning_trace else ""` —— 巧妙的条件拼接，成功才追加上下文，失败自动降级
- 这是"优雅降级"思路的体现：每个可能有外部依赖的步骤都有独立的保底路径
`─────────────────────────────────────────────────`

### 6.3 时间线推理规则写在提示词里

`★ Insight ─────────────────────────────────────`
**"从源头避免误判，而不是靠后处理修正"**：
- 简历时间线是 LLM 最容易误判的场景：项目时间落在工作经历区间内并不代表矛盾
- 规则直接写进提示词：项目落在工作经历区间 → 正常；项目与所有工作经历无交集 → 才提示补充说明（low 优先级）
- 相比"事后用日期比较修正"，在提示词里约束是零代码成本的方案，且能泛化到各种时间线组合
- 降级时仍保留数据：诊断失败不是返回空列表，而是把各维度的原始问题作为降级数据，让下游仍有数据可用
`─────────────────────────────────────────────────`

---

## 七、边界情况处理

| 场景 | 表现 |
|------|------|
| 正常 | 返回 5-15 条按优先级排序的问题 |
| Think 失败 | 跳过宏观分析，直接生成问题清单 |
| Answer 失败 | 降级：用各维度原始问题，统一 medium 优先级 |
| 无维度问题 | `raw_issues_text` 为"（暂无）"，LLM 基于原文自行诊断 |
| 问题超过 15 条 | 提示词要求 5-15 条，LLM 会去重合并 |
| 时间线正常 | 项目在工作经历范围内，不标记为矛盾 |
| 时间线异常 | 项目与所有工作经历无交集，标记为 low 优先级 |
| 结构化提取失败 | `_build_structured_summary` 返回提示文字 |
| 维度评分不存在 | `state.get("dimension_scores", [])` 返回空列表 |

---

## 八、数据流全景

```
run_six_dimensions_node
    │
    │  dimension_scores (6 个维度的评分 + 问题列表)
    │  raw_text (全文)
    │  structured (结构化简历)
    ▼
diagnose_issues_node
    │
    │  ① 收集原始问题
    │     all_raw_issues = [dim 的 issues 列表汇总]
    │
    │  ② Think 前置推理（可失败）
    │     宏观分析 → reasoning_trace
    │
    │  ③ 拼接 Think 上下文
    │     prompt = DIAGNOSE_ISSUES_PROMPT + think_context
    │
    │  ④ 结构化生成问题清单
    │     LLM → IssueList → model_dump()
    │
    │  ⑤ 按优先级排序
    │     high → medium → low
    │
    │  └─ 返回 {"issues": [...]}
    │
    ▼
generate_summary_node
```

`diagnose_issues_node` 是流水线中**唯一一个使用"先想后答"模式的节点**。它不是在堆砌问题，而是先用宏观视角分析简历的"病根"，再逐条开出"药方"。