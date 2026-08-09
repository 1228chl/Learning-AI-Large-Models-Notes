# 六维度并行评审：`run_six_dimensions_node` 深度解析

> 源文件：`backend/agents/resume/nodes.py`
> 核心函数：`run_six_dimensions_node`（**第 142~184 行**）
> 辅助函数：`_build_structured_summary`（**第 187~204 行**）、`_empty_dimension_score`（**第 207~210 行**）
> 对应课件：4.7 六维度并行评审
> 前置依赖：`DimensionScore`（`state.py`）、`SIX_DIMENSIONS`（`state.py`）、`DIMENSION_REVIEW_PROMPTS`（`prompts.py`）

---

## 一、全文行号速查表

先给一张行号地图，方便对照源码：

### 主函数 `run_six_dimensions_node`（第 142~184 行）

| 行号 | 内容 | 角色 |
|:----:|:-----|:-----|
| 142 | `async def run_six_dimensions_node(state: ResumeState) -> dict:` | 函数定义 |
| 143 | `raw_text = state["raw_text"]` | 获取原始文本 |
| 144 | `structured = state.get("structured") or {}` | 获取结构化数据 |
| 145 | `structured_summary = _build_structured_summary(structured)` | 压缩结构化摘要 |
| 147 | `async def review_one_dimension(dim: dict) -> dict:` | 内部评分函数定义 |
| 148 | `prompt_template = DIMENSION_REVIEW_PROMPTS.get(dim["key"], "")` | 获取维度提示词 |
| 149~150 | `if not prompt_template: return _empty_dimension_score(dim)` | 无提示词则降级 |
| 151~154 | `prompt = prompt_template.format(...)` | 组装评分提示词 |
| 155 | `last_exception = None` | 记录异常 |
| 156 | `for attempt in range(2):` | 最多 2 次重试 |
| 157 | `try:` | 开始尝试 |
| 158~162 | `structured_llm = get_structured_llm(...)` / `result = await ...` | 调用 LLM 评分 |
| 163 | `d = result.model_dump()` | 转字典 |
| 164 | `d["dimension"], d["weight"], d["key"] = dim["name"], dim["weight"], dim["key"]` | 代码层覆盖元数据 |
| 165 | `return d` | 返回评分结果 |
| 166~168 | `except Exception as e: last_exception = e; if attempt == 0: await asyncio.sleep(1)` | 重试等待 |
| 169 | `return _empty_dimension_score(dim)` | 全部失败降级 |
| 171~172 | `tasks = [review_one_dimension(dim) for dim in SIX_DIMENSIONS]` | 创建 6 个并发任务 |
| 173 | `dimension_scores = await asyncio.gather(*tasks)` | 6 路并行执行 |
| 174 | `weighted_score = sum(d["score"] * d["weight"] for d in dimension_scores)` | 计算加权总分 |
| 175~184 | `return {"dimension_scores": ..., "weighted_score": ...}` | 返回结果 |

### 辅助函数（第 187~210 行）

| 行号 | 内容 | 角色 |
|:----:|:-----|:-----|
| 187 | `def _build_structured_summary(structured: dict) -> str:` | 摘要函数定义 |
| 188~203 | 拼接姓名/意向/学历/技能/项目/工作经历 | 压缩结构化数据 |
| 204 | `return "\n".join(lines) if lines else "（结构化提取失败）"` | 返回摘要文本 |
| 207 | `def _empty_dimension_score(dim: dict) -> dict:` | 降级函数定义 |
| 208~210 | `return {"key": ..., "dimension": ..., "score": 50, "weight": ..., "issues": [...], "suggestions": []}` | 返回默认 50 分 |

---

## 二、函数签名与定位（第 142 行）

```python
# nodes.py 第 142 行
async def run_six_dimensions_node(state: ResumeState) -> dict:
    """六维度并行评审：asyncio.gather 同时评，算加权综合分。"""
```

- **输入**：`state["raw_text"]`（原始文本）+ `state["structured"]`（结构化简历）
- **输出**：`{"dimension_scores": list[dict], "weighted_score": float}`
- **定位**：流水线第 5 步，核心评审节点——上接 `extract_structured_node` 产出结构化简历，下启 `diagnose_issues_node` 用维度评分做问题诊断

---

## 三、为什么需要这个节点？

简历审查不能只看一个维度。一份简历可能项目深度很好但技术栈不匹配，或者表达清晰但量化数据不足。**多维度评分**让评审更全面、更客观。

### 3.1 六维度定义

```python
# state.py 中定义
SIX_DIMENSIONS = [
    {"key": "project_depth",  "name": "项目深度",   "weight": 0.30,
     "focus": "项目描述是否有量化数据、技术选型理由、个人贡献、难点解决"},
    {"key": "tech_match",     "name": "技术匹配度", "weight": 0.25,
     "focus": "技术栈是否与目标岗位匹配，技能描述是否有层次"},
    {"key": "expression",     "name": "表达规范性", "weight": 0.15,
     "focus": "动词开头、STAR 结构、无错别字"},
    {"key": "structure",      "name": "简历结构",   "weight": 0.15,
     "focus": "模块完整性、排版逻辑、信息密度"},
    {"key": "quantification", "name": "量化程度",   "weight": 0.10,
     "focus": "性能指标、用户量、优化幅度等量化数据"},
    {"key": "authenticity",   "name": "真实可信度", "weight": 0.05,
     "focus": "表述是否夸大、技术深度与经验年限是否匹配"},
]
```

### 3.2 权重设计逻辑

| 维度 | 权重 | 为什么是这个权重？ |
|------|------|-------------------|
| 项目深度 | 30% | 技术面试的核心考察点，面试官最看重 |
| 技术匹配度 | 25% | 决定候选人能否胜任岗位，HR 筛选的第一关 |
| 表达规范性 | 15% | 体现沟通能力，团队协作的基础 |
| 简历结构 | 15% | 影响 HR 阅读效率，第一印象 |
| 量化程度 | 10% | 区分"能做"和"能证明"的关键指标 |
| 真实可信度 | 5% | 底线维度，权重低但问题严重时一票否决 |

权重和 = 1.0，**项目深度 + 技术匹配度占了 55%**，这两个维度直接决定候选人是否适合目标岗位。

---

## 四、逐行精读（第 142~210 行）

### 4.1 准备结构化摘要（第 143~145 行）

```python
# nodes.py 第 143~145 行
raw_text   = state["raw_text"]
structured = state.get("structured") or {}
structured_summary = _build_structured_summary(structured)
```

| 行号 | 代码 | 说明 |
|:----:|:-----|:-----|
| 143 | `raw_text = state["raw_text"]` | 从 State 获取完整原文 |
| 144 | `structured = state.get("structured") or {}` | 用 `get()` 带默认值，防止 structured 为 None（提取失败降级时） |
| 145 | `structured_summary = _build_structured_summary(structured)` | 把几十 KB 的结构化 JSON 浓缩成 3~5 行文本 |

### 4.2 辅助函数 `_build_structured_summary`（第 187~204 行）

```python
# nodes.py 第 187~204 行
def _build_structured_summary(structured: dict) -> str:
    """把结构化数据浓缩成几行摘要，供评审使用（省 token）。"""
    lines = []
    if structured.get("name"):
        lines.append(f"姓名：{structured['name']}")
    if structured.get("target_position"):
        lines.append(f"求职意向：{structured['target_position']}")
    if structured.get("education"):
        edu = structured["education"][0]
        lines.append(f"最高学历：{edu.get('school','')} {edu.get('major','')} {edu.get('degree','')}")
    if structured.get("skills_list"):
        lines.append(f"技术栈：{', '.join(structured['skills_list'][:10])}")
    if structured.get("projects"):
        proj_names = [p.get("name", "") for p in structured["projects"]]
        lines.append(f"项目数量：{len(structured['projects'])} 个（{', '.join(proj_names[:3])}）")
    if structured.get("work_experience"):
        lines.append(f"工作经历：{len(structured['work_experience'])} 段")
    return "\n".join(lines) if lines else "（结构化提取失败，请基于原文评审）"
```

| 行号 | 代码 | 说明 |
|:----:|:-----|:-----|
| 187 | `def _build_structured_summary(structured: dict) -> str:` | 私有函数，下划线前缀表示"内部使用" |
| 188 | `lines = []` | 逐行构建摘要 |
| 189~190 | `if structured.get("name"): lines.append(...)` | 只有 name 非空时才添加，防止空值 |
| 191~192 | `if structured.get("target_position"): lines.append(...)` | 求职意向 |
| 193~194 | `if structured.get("education"): edu = structured["education"][0]; lines.append(...)` | 只取最高学历（第一条），省 token |
| 195~196 | `if structured.get("skills_list"): lines.append(...)` | 技术栈只取前 10 个，防止过长 |
| 197~198 | `if structured.get("projects"): lines.append(...)` | 项目数量 + 前 3 个项目名 |
| 199~200 | `if structured.get("work_experience"): lines.append(...)` | 工作经历段数 |
| 204 | `return "\n".join(lines) if lines else "（结构化提取失败，请基于原文评审）"` | 如果所有字段都为空（结构化提取失败），返回提示文字，让后续 LLM 知道"没有结构化信息，请直接看原文" |

输出示例：

```
姓名：张三
求职意向：后端开发
最高学历：某大学 计算机 本科
技术栈：Java, Spring Boot, MySQL, Redis
项目数量：3 个（电商系统, 支付平台, 消息推送）
工作经历：2 段
```

**为什么需要这个摘要？** 省 token。6 个维度评分都要调用 LLM，每个调用都传一次完整的结构化 JSON（几十 KB）太浪费，浓缩成 5 行文本既保留了关键信息，又大幅减少了 token 消耗。

### 4.3 内部评分函数 `review_one_dimension`（第 147~169 行）

```python
# nodes.py 第 147~169 行
async def review_one_dimension(dim: dict) -> dict:
    prompt_template = DIMENSION_REVIEW_PROMPTS.get(dim["key"], "")
    if not prompt_template:
        return _empty_dimension_score(dim)
    prompt = prompt_template.format(
        resume_text=raw_text[:3000],
        structured_summary=structured_summary,
        focus=dim["focus"])
    last_exception = None
    for attempt in range(2):
        try:
            structured_llm = get_structured_llm("resume", DimensionScore)
            result = await structured_llm.ainvoke([
                SystemMessage(content=SYSTEM_PROMPT),
                HumanMessage(content=prompt),
            ])
            d = result.model_dump()
            d["dimension"], d["weight"], d["key"] = dim["name"], dim["weight"], dim["key"]
            return d
        except Exception as e:
            last_exception = e
            if attempt == 0:
                await asyncio.sleep(1)
    return _empty_dimension_score(dim)
```

| 行号 | 代码 | 说明 |
|:----:|:-----|:-----|
| 147 | `async def review_one_dimension(dim: dict) -> dict:` | 定义在 `run_six_dimensions_node` 内部的嵌套函数，可以捕获外层作用域的 `raw_text` 和 `structured_summary` |
| 148 | `prompt_template = DIMENSION_REVIEW_PROMPTS.get(dim["key"], "")` | 从提示词字典中按 `key` 获取对应维度的评分提示词模板 |
| 149~150 | `if not prompt_template: return _empty_dimension_score(dim)` | 如果找不到该维度的提示词（配置错误），直接降级，不调用 LLM |
| 151~154 | `prompt = prompt_template.format(resume_text=raw_text[:3000], structured_summary=structured_summary, focus=dim["focus"])` | 三个占位符：简历原文截断到 3000 字符，结构化摘要，维度评审重点 |

**截断长度对比**：`extract_structured_node` 截 4000 字符，`run_six_dimensions` 截 3000 字符。评分任务的核心是"判断"而非"提取"，3000 字符足够 LLM 做判断，多截 1000 字只是浪费 token。

| 行号 | 代码 | 说明 |
|:----:|:-----|:-----|
| 155 | `last_exception = None` | 记录最后一个异常，用于日志 |
| 156 | `for attempt in range(2):` | 最多 2 次尝试 |
| 157 | `try:` | 开始尝试 |
| 158 | `structured_llm = get_structured_llm("resume", DimensionScore)` | 获取绑定 `DimensionScore` Schema 的 LLM |
| 159~162 | `result = await structured_llm.ainvoke([SystemMessage(...), HumanMessage(...)])` | 调用 LLM 获取结构化评分 |
| 163 | `d = result.model_dump()` | 转字典 |
| 164 | `d["dimension"], d["weight"], d["key"] = dim["name"], dim["weight"], dim["key"]` | **关键设计**：元数据由代码层覆盖，不是 LLM 生成的 |
| 165 | `return d` | 返回完整的评分字典 |
| 166~168 | `except Exception as e: last_exception = e; if attempt == 0: await asyncio.sleep(1)` | 第一次失败等 1 秒重试，第二次不等待直接降级 |
| 169 | `return _empty_dimension_score(dim)` | 两次都失败，返回降级结果 |

**为什么元数据由代码层覆盖而不是 LLM 生成？** 维度名和权重是业务规则，LLM 只负责评分和写问题。这样确保维度名统一、权重准确、后续计算可靠。

### 4.4 辅助函数 `_empty_dimension_score`（第 207~210 行）

```python
# nodes.py 第 207~210 行
def _empty_dimension_score(dim: dict) -> dict:
    """维度评审失败时的降级结果。"""
    return {"key": dim["key"], "dimension": dim["name"], "score": 50,
            "weight": dim["weight"],
            "issues": ["该维度评审失败，建议人工复核"], "suggestions": []}
```

| 行号 | 代码 | 说明 |
|:----:|:-----|:-----|
| 207 | `def _empty_dimension_score(dim: dict) -> dict:` | 降级函数，接收维度配置 |
| 208~210 | `return {"key": ..., "dimension": ..., "score": 50, "weight": ..., "issues": [...], "suggestions": []}` | 默认 50 分（及格线） |

**为什么是 50 不是 0？** 给 0 分会严重拉低加权总分，导致整体评价失真；给 50 分是"中性"的——既不偏袒也不惩罚，人工复核时看到 50 分自然会警觉。

### 4.5 并行执行（第 171~174 行）

```python
# nodes.py 第 171~174 行
tasks = [review_one_dimension(dim) for dim in SIX_DIMENSIONS]
dimension_scores = await asyncio.gather(*tasks)
weighted_score = sum(d["score"] * d["weight"] for d in dimension_scores)
```

| 行号 | 代码 | 说明 |
|:----:|:-----|:-----|
| 171 | `tasks = [review_one_dimension(dim) for dim in SIX_DIMENSIONS]` | 为 6 个维度各创建一个协程任务，但不开始执行 |
| 172 | `dimension_scores = await asyncio.gather(*tasks)` | **6 路并行**！`asyncio.gather` 同时启动所有协程，总耗时 = 最慢的一个维度 |
| 173 | `weighted_score = sum(d["score"] * d["weight"] for d in dimension_scores)` | 计算加权总分 |

**这是全线性能关键路径**。6 个 LLM 调用同时进行，总耗时 ≈ 最慢维度耗时（约 3.2s），而不是 6 个之和（约 13.6s），**加速 4 倍以上**。

```
时间轴：
├── project_depth  ────██████████████████████████████████████████████████  (3.2s)
├── tech_match     ────████████████████████████                        (2.1s)
├── expression     ────████████████████                                (1.8s)
├── structure      ────████████████████████                            (2.0s)
├── quantification ────████████████████████████████████████████        (2.8s)
└── authenticity   ────████████████████                                (1.7s)
                        └──────── 总耗时 ≈ 3.2s ──────────┘
```

加权总分计算示例：

```
项目深度:    85 × 0.30 = 25.5
技术匹配度:  90 × 0.25 = 22.5
表达规范性:  70 × 0.15 = 10.5
简历结构:    75 × 0.15 = 11.25
量化程度:    60 × 0.10 = 6.0
真实可信度:  80 × 0.05 = 4.0
────────────────────────────
加权总分:              79.75
```

### 4.6 日志与返回值（第 175~184 行）

```python
# nodes.py 第 175~184 行
logger.info("six_dimensions.done", weighted_score=round(weighted_score, 2),
            scores={d["key"]: d["score"] for d in dimension_scores})
return {"dimension_scores": list(dimension_scores), "weighted_score": round(weighted_score, 2)}
```

| 行号 | 代码 | 说明 |
|:----:|:-----|:-----|
| 175~176 | `logger.info("six_dimensions.done", ...)` | 结构化日志，记录加权总分和每个维度分数 |
| 177~184 | `return {"dimension_scores": ..., "weighted_score": ...}` | 写回 State |

---

## 五、调用方式与依赖

### 5.1 调用链路

```
extract_structured_node
    │
    │  structured + raw_text
    ▼
run_six_dimensions_node  ←── 当前节点
    │
    │  dimension_scores + weighted_score
    ▼
diagnose_issues_node
```

### 5.2 依赖清单

| 依赖类型 | 具体依赖 | 用途 |
|---------|---------|------|
| State 读 | `state["raw_text"]` | 简历原文 |
| State 读 | `state["structured"]` | 结构化简历摘要 |
| State 写 | `state["dimension_scores"]` | 6 个维度的评分结果 |
| State 写 | `state["weighted_score"]` | 加权总分 |
| 外部常量 | `SIX_DIMENSIONS`（`state.py`） | 六维度配置（名称/权重/评审重点） |
| 外部常量 | `DIMENSION_REVIEW_PROMPTS`（`prompts.py`） | 各维度评分提示词模板 |
| 外部模型 | `DimensionScore`（`state.py`） | 评分输出 Schema |
| LLM 调用 | 6 次（最多 12 次含重试） | 并行调用 |

### 5.3 失败模式

| 场景 | 表现 |
|------|------|
| 所有维度正常 | 返回 6 个评分 + 加权总分 |
| 某个维度 LLM 调用失败 | 该维度重试 1 次，仍失败 → 降级 50 分 |
| 所有维度都失败 | 所有维度 50 分，加权总分 50 分 |
| `structured` 为空 | `_build_structured_summary` 返回提示文字，LLM 基于原文评审 |
| 某个维度提示词不存在 | 直接降级 50 分 |

---

## 六、`★` 设计亮点

### 6.1 `asyncio.gather` 六路并行

`★ Insight ─────────────────────────────────────`
**"6 个 LLM 调用同时进行，总耗时 = 最慢维度耗时"**：
- 串行执行 6 个维度需要约 13.6s，并行后降到 3.2s，加速 4 倍以上
- 每个维度有独立的 `try/except` 和重试逻辑，互不影响——维度 A 重试时，维度 B、C、D 仍在正常运行
- `asyncio.gather` 的容错性保证了：一个维度抛异常不会影响其他维度
- 这是全线性能关键路径，并行设计直接决定了用户体验
`─────────────────────────────────────────────────`

### 6.2 元数据与评分分离

`★ Insight ─────────────────────────────────────`
**"维度名和权重是业务规则，不应该让 LLM 决定"**：
- 代码层控制：`dimension` → "项目深度"（统一名称），`weight` → 0.30（固定权重），`key` → "project_depth"（程序标识）
- LLM 生成：`score`（评分）、`issues`（问题）、`suggestions`（建议）
- 这种分离确保了：业务逻辑不受 LLM 输出波动影响，后续计算（加权总分）可靠，前端展示字段名统一
- `d["dimension"], d["weight"], d["key"] = dim["name"], dim["weight"], dim["key"]` —— 这行代码是"元数据注入"的精确体现
`─────────────────────────────────────────────────`

### 6.3 评分标准的 5 级行为锚定

`★ Insight ─────────────────────────────────────`
**"不是模糊的 '请打 1-5 分'，而是每级都有具体可观察的行为描述"**：
- 每个维度 5 级评分标准（90-100 / 70-89 / 50-69 / 30-49 / 0-29），每级对应具体的可观察描述
- 行为锚定（Behavioral Anchoring）：如"90-100 分：每个项目都有量化指标、明确的技术选型理由"
- 这种设计减少了 LLM 在不同次调用之间的评分漂移，让评分更稳定、更可预期
- 权重配置化（`SIX_DIMENSIONS` 列表）为后续产品化留了空间——企业客户想要"技术匹配度占比更高"，改 `weight` 字段即可
`─────────────────────────────────────────────────`

---

## 七、边界情况处理

| 场景 | 表现 |
|------|------|
| 所有维度正常 | 返回 6 个评分 + 加权总分 |
| 某个维度 LLM 调用失败 | 该维度重试 1 次，仍失败 → 降级 50 分 |
| 所有维度都失败 | 所有维度 50 分，加权总分 50 分 |
| `structured` 为空 | `_build_structured_summary` 返回提示文字 |
| 某个维度提示词不存在 | `DIMENSION_REVIEW_PROMPTS.get()` 返回空 → 直接降级 50 分 |
| 单维度 LLM 返回空 score | LLM 必须给 score（Schema 必填），否则校验失败走重试 |

---

## 八、数据流全景

```
extract_structured_node
    │
    │  structured (有序字典)
    │  raw_text (全文)
    ▼
run_six_dimensions_node
    │
    │  ┌─ _build_structured_summary(structured)  →  5 行摘要
    │  │
    │  │  asyncio.gather(*tasks)
    │  │  ├── review_one_dimension(project_depth)   →  score: 85, issues: [...]
    │  │  ├── review_one_dimension(tech_match)      →  score: 90, issues: [...]
    │  │  ├── review_one_dimension(expression)      →  score: 70, issues: [...]
    │  │  ├── review_one_dimension(structure)       →  score: 75, issues: [...]
    │  │  ├── review_one_dimension(quantification)  →  score: 60, issues: [...]
    │  │  └── review_one_dimension(authenticity)    →  score: 80, issues: [...]
    │  │
    │  │  加权总分 = 85×0.30 + 90×0.25 + 70×0.15 + 75×0.15 + 60×0.10 + 80×0.05
    │  │           = 79.75
    │  │
    │  └─ 返回 {"dimension_scores": [...], "weighted_score": 79.75}
    │
    ▼
diagnose_issues_node
```

`run_six_dimensions_node` 是整个流水线的**核心数据枢纽**——它同时接收了前面的结构化提取结果，又为后面的问题诊断和整体评价提供了数据基础。