# 问题诊断：`diagnose_issues_node` 深度解析

> 源文件：`backend/agents/resume/nodes.py` 第 214~266 行

## 一、函数签名与定位

```python
async def diagnose_issues_node(state: ResumeState) -> dict:
    """汇总维度问题 → Think 前置推理 → 结构化生成问题清单 → 按优先级排序。"""
```

- **输入**：`state["dimension_scores"]`（各维度评分）+ `state["raw_text"]` + `state["structured"]`
- **输出**：`{"issues": list[dict]}`（按优先级排序的问题清单，每条含 priority/dimension/description/location/suggestion）
- **定位**：流水线第⑥步，承上启下——
  - 上接：`run_six_dimensions_node` 产出各维度的评分和问题列表
  - 下启：`generate_summary_node` 用高优先级问题生成整体评价

## 二、为什么需要这个节点？

`run_six_dimensions_node` 已经给出了每个维度的评分和问题列表，但这些问题是**独立评审**的产物——每个维度各说各的，缺少全局视角。

| 问题 | 六维度的局限 | diagnose_issues 的解决 |
|------|-------------|----------------------|
| **碎片化** | 6 个维度各自列问题，可能重复或矛盾 | 合并、去重、归纳共同模式 |
| **缺优先级** | 所有问题平铺，没有轻重缓急 | 按 high/medium/low 排序 |
| **缺定位** | 只说"有问题"，不说"在哪里" | 每条问题定位到具体位置（如"项目经历-电商系统-第2句"） |

### 2.1 后续节点的依赖

| 后续节点 | 依赖 issues 的哪个字段 |
|----------|----------------------|
| `generate_summary` | `high_issues`（高优先级问题的 description），用于生成改进方向 |
| `save_results` | 写入 `resume_reviews.issues` JSONB 列 |
| 前端展示 | 展示问题清单，按优先级高亮 |

## 三、逐行精读

### 3.1 收集原始问题

```python
dimension_scores = state.get("dimension_scores", [])
raw_text         = state["raw_text"]
structured       = state.get("structured") or {}

all_raw_issues = []
for dim in dimension_scores:
    for issue_text in dim.get("issues", []):
        all_raw_issues.append(f"[{dim['dimension']}] {issue_text}")
raw_issues_text = "\n".join(f"- {i}" for i in all_raw_issues) or "（暂无）"
```

把各维度的问题汇总成一条统一的文本，格式如：

```
- [项目深度] 项目描述缺少量化数据
- [技术匹配度] 技能描述没有掌握程度分级
- [表达规范性] 部分条目不是动词开头
```

**为什么加维度前缀 `[维度名]`？** 后续 LLM 诊断时可以知道每条问题来自哪个维度，便于跨维度分析。

### 3.2 Think 前置推理

```python
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

**核心机制："先想后答"（Think-then-Answer）**。

在正式生成问题清单之前，先让 LLM 做一次宏观分析。Think 提示词（`prompts.py` 第 196~210 行）：

```python
DIAGNOSE_THINK_PROMPT = """在生成简历问题诊断清单之前，请先进行宏观分析。

【六维度评分汇总】
{dimension_scores_summary}

【已识别的原始问题列表】
{raw_issues}

请分析以下几点（中文，5-8句话）：
1. 这份简历最核心的短板是什么？（最多2个，直接影响竞争力）
2. 各维度问题之间是否存在共同模式或根本原因？
3. 声称的技能与实际项目经历描述之间是否存在明显落差？
4. 哪些问题最影响面试官的第一印象，应列为高优先级？

直接输出分析内容，不加任何前缀标签。"""
```

**关键设计**：

- **Think 用的是普通 LLM，不是结构化 LLM**：`get_llm("resume")` 而不是 `get_structured_llm`。思考分析需要自由输出，不需要被 Schema 约束。
- **可能失败，但不阻塞**：`reasoning_trace` 默认空字符串，Think 失败时整个诊断照常进行，只是缺少宏观分析上下文。
- **输出直接拼接**：不加任何前缀标签，直接追加到诊断 prompt 后面。

### 3.3 拼接 Think 上下文

```python
think_context = f"\n\n【诊断前宏观分析】\n{reasoning_trace}" if reasoning_trace else ""
```

如果 Think 成功，在诊断 prompt 末尾追加一段宏观分析；如果失败，不加任何内容。这样诊断 LLM 能看到：

```
【各维度已发现问题（参考，可扩充）】
- [项目深度] 项目描述缺少量化数据
...

【诊断前宏观分析】
这份简历的核心短板是项目描述缺乏量化数据，各维度问题之间存在一个共同模式：
候选人倾向于用"负责"、"参与"等笼统词汇描述项目，而非具体的技术选型理由和量化成果。
```

### 3.4 结构化生成问题清单

```python
prompt = DIAGNOSE_ISSUES_PROMPT.format(
    resume_text=raw_text[:3000],
    structured_summary=_build_structured_summary(structured),
    raw_issues=raw_issues_text,
) + think_context

try:
    structured_llm = get_structured_llm("resume", IssueList)
    result: IssueList = await structured_llm.ainvoke([
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

诊断 prompt（`DIAGNOSE_ISSUES_PROMPT`，`prompts.py` 第 139~162 行）包含 6 条输出要求：

```
1. 每条问题必须定位到简历的具体位置（如"项目经历-电商系统-第2句"）
2. 优先级判断标准：
   - high：严重影响 HR 通过率，如：无量化数据/项目描述空洞/关键技术缺失
   - medium：影响竞争力，如：表达不规范/技能描述层次不清
   - low：锦上添花，如：证书未列出/格式细节
3. 时间线推理规则（避免误判）：
   - 项目时间落在某段工作经历区间内，视为该公司的工作项目，属于正常，不得标记为矛盾
   - 只有当项目时间与所有工作经历区间均无交集时，才提示候选人补充项目来源说明（low 优先级）
   - 多个项目与同一段工作经历时间重叠，同样正常，不构成矛盾
4. 建议必须具体可操作（给出修改示例或明确指导）
5. 去除重复问题，合并相似问题
6. 总数控制在 5-15 条
```

**第 3 条特别重要**：这是专门针对"时间线误判"的规则。很多简历的项目时间会落在工作经历的时间段内（比如在 A 公司工作期间做了 B 项目），如果没有这条规则，LLM 很容易误判为"时间线矛盾"。

### 3.5 `IssueList` Schema

`IssueList` 是 `IssueItem` 的包装类（`state.py` 第 79~92 行）：

```python
class IssueItem(BaseModel):
    """单条诊断问题。"""
    priority:    str = Field(description="优先级：high / medium / low")
    dimension:   str = Field(description="所属维度")
    description: str = Field(description="问题描述（1句话）")
    location:    str = Field(description="问题在简历中的定位，如：项目经历-电商系统-第2句")
    suggestion:  str = Field(description="具体修改建议（可操作）")


class IssueList(BaseModel):
    """IssueItem 列表的包装类。
    为什么要包一层：with_structured_output 要求顶层是「对象」而非「裸列表」，
    所以不能直接让 LLM 返回 list[IssueItem]，要包成 {items: [...]}。"""
    items: list[IssueItem]
```

**为什么包一层 `IssueList`？** `with_structured_output` 要求顶层是"对象"而不是"裸列表"，所以不能直接返回 `list[IssueItem]`，必须包成 `{items: [...]}`。

### 3.6 按优先级排序

```python
priority_order = {"high": 0, "medium": 1, "low": 2}
issues.sort(key=lambda x: priority_order.get(x.get("priority", "low"), 2))
```

排序后，高优先级问题排在最前面，确保 `generate_summary_node` 和前端展示时能第一时间看到最关键的问题。

### 3.7 日志记录

```python
logger.info("diagnose_issues.done", total=len(issues),
            high=sum(1 for i in issues if i.get("priority") == "high"))
```

结构化日志记录问题总数和高优先级问题数。方便通过日志检索：
- "诊断生成了多少条问题？" → 统计 `total`
- "有多少严重问题？" → 统计 `high`
- "诊断失败了吗？" → 搜 `diagnose_issues.failed`

## 四、完整的 `IssueItem` Schema

```python
class IssueItem(BaseModel):
    priority:    str    # high / medium / low（优先级）
    dimension:   str    # 所属维度，如"项目深度"
    description: str    # 问题描述（1句话）
    location:    str    # 在简历中的定位，如"项目经历-电商系统-第2句"
    suggestion:  str    # 具体修改建议（可操作）
```

**字段设计要点**：

- `priority` 只有三个值：`high` / `medium` / `low`，简单清晰
- `location` 要求定位到"段落-项目-句子"级别，而不是笼统的"简历全文"
- `suggestion` 要求具体可操作（给出修改示例），而不是"请改进"

## 五、`★` 设计亮点

### 5.1 "先想后答"（Think-then-Answer）

这是本项目中最有意思的 Prompt Engineering 模式之一：

```
第 1 步：Think（普通 LLM，自由输出）
    ↓
  宏观分析：这份简历最核心的短板是什么？
           各维度问题是否存在共同模式？
           哪些问题最影响第一印象？
    ↓
第 2 步：Answer（结构化 LLM，Schema 约束输出）
    ↓
  问题清单：[{priority, dimension, description, location, suggestion}, ...]
```

**为什么两个步骤都用 LLM？**

典型的方案是"人写规则 → 聚合问题 → 排序"。但简历问题千变万化，规则很难覆盖全。让 LLM 自己先想后答，质量更高：

| 步骤 | 模型 | 输出格式 | 目标 |
|------|------|---------|------|
| Think | 普通 LLM（无约束） | 自由文本 | 宏观分析、归纳模式 |
| Answer | 结构化 LLM（Schema 约束） | 结构化 JSON | 逐条问题、精确定位 |

### 5.2 Think 失败不阻塞

Think 步骤被包裹在 try-except 中，失败时 `reasoning_trace` 保持空字符串，诊断照常进行。这是"优雅降级"的体现——宁可没有宏观分析，也不能让整个流程中断。

```
Think 成功 → 诊断 prompt 追加宏观分析 → 更精准的问题清单
Think 失败 → 诊断 prompt 不加宏观分析 → 仅基于原文和维度问题生成
```

### 5.3 时间线推理规则

这是提示词中非常细致的一个设计。简历时间线是 LLM 最容易误判的场景之一：

```
❌ LLM 常见误判：
   "项目时间 2023.06-2023.12 在工作经历 2021-2023 范围内 → 时间线矛盾"

✅ 正确逻辑：
   项目时间落在工作经历区间内 → 说明是该公司内部项目 → 正常，不得标记为矛盾
   只有项目时间与所有工作经历均无交集 → 才提示补充说明（low 优先级）
   多个项目与同一段工作经历重叠 → 同样正常，不构成矛盾
```

这个规则直接写在提示词里，从源头避免误判，而不是靠后处理修正。

### 5.4 降级时保留数据

诊断失败时，不是返回空列表，而是把各维度的原始问题作为降级数据：

```python
issues = [
    {"priority": "medium", "dimension": dim["dimension"], "description": issue,
     "location": "简历全文", "suggestion": "请参考评审建议修改"}
    for dim in dimension_scores for issue in dim.get("issues", [])
]
```

降级效果：
- `generate_summary_node` 仍然有数据可用
- 前端仍然能展示问题
- 只是缺少了优先级排序和精确定位

### 5.5 结构化输出 vs 自由文本

| 阶段 | 模型 | 输出 | 原因 |
|------|------|------|------|
| Think | 普通 LLM | 自由文本 | 分析需要发散思考，Schema 约束会限制思考深度 |
| Answer | 结构化 LLM | 结构化 JSON | 问题清单需要被程序消费，JSON 格式保证后续节点可以解析 |

## 六、与 `run_six_dimensions_node` 的对比

| 维度 | `run_six_dimensions_node` | `diagnose_issues_node` |
|------|---------------------------|----------------------|
| 输入 | `raw_text[:3000]` + `structured_summary` | `raw_text[:3000]` + `structured_summary` + `dimension_scores` |
| 输出 | 6 个评分 + 加权总分 | 5-15 条逐条问题清单 |
| LLM 调用 | 1 次/维度 × 6 维度 = 6 次并行 | 2 次串行（Think → Answer） |
| 模型 | 结构化 LLM（DimensionScore） | Think: 普通 LLM → Answer: 结构化 LLM（IssueList） |
| 重试策略 | 各维度独立重试，互不影响 | Think 失败跳过，Answer 失败降级 |
| 排序 | 维度固定顺序 | 按优先级 high→medium→low |
| 平均耗时 | ~2-4s（6 路并行） | ~3-6s（2 次串行 LLM） |

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
| 结构化提取失败 | `_build_structured_summary` 返回"（结构化提取失败，请基于原文评审）" |
| 维度评分不存在 | `state.get("dimension_scores", [])` 返回空列表 |

## 八、数据流全景

```
run_six_dimensions_node
    │
    │  dimension_scores (6 个维度的评分 + 问题列表)
    │  raw_text (全文)
    │  structured (结构化简历)
    │
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
    │
    │  用高优先级问题 + 加权总分生成整体评价
    │
    ▼
save_results_node
```

`diagnose_issues_node` 是流水线中**唯一一个使用"先想后答"模式的节点**。它不是在堆砌问题，而是先用宏观视角分析简历的"病根"，再逐条开出"药方"。