# 六维度并行评审：`run_six_dimensions_node` 深度解析

> 源文件：`backend/agents/resume/nodes.py` 第 142~178 行

## 一、函数签名与定位

```python
async def run_six_dimensions_node(state: ResumeState) -> dict:
    """六维度并行评审：asyncio.gather 同时评，算加权综合分。"""
```

- **输入**：`state["raw_text"]`（原始文本）+ `state["structured"]`（结构化简历）
- **输出**：`{"dimension_scores": list[dict], "weighted_score": float}`
- **定位**：流水线第⑤步，核心评审节点——
  - 上接：`extract_structured_node` 产出结构化简历
  - 下启：`diagnose_issues_node` 用维度评分做问题诊断

## 二、为什么需要这个节点？

简历审查不能只看一个维度。一份简历可能项目深度很好但技术栈不匹配，或者表达清晰但量化数据不足。**多维度评分**让评审更全面、更客观。

### 2.1 六维度定义

```python
SIX_DIMENSIONS = [
    {"key": "project_depth",  "name": "项目深度",   "weight": 0.30,
     "focus": "项目描述是否有量化数据、技术选型理由、个人贡献、难点解决"},
    {"key": "tech_match",     "name": "技术匹配度", "weight": 0.25,
     "focus": "技术栈是否与目标岗位匹配，技能描述是否有层次（熟练/了解/掌握）"},
    {"key": "expression",     "name": "表达规范性", "weight": 0.15,
     "focus": "动词开头、STAR 结构、无错别字、无主语省略歧义"},
    {"key": "structure",      "name": "简历结构",   "weight": 0.15,
     "focus": "模块完整性、排版逻辑、信息密度、重要内容是否放前面"},
    {"key": "quantification", "name": "量化程度",   "weight": 0.10,
     "focus": "性能指标、用户量、优化幅度等量化数据的使用情况"},
    {"key": "authenticity",   "name": "真实可信度", "weight": 0.05,
     "focus": "表述是否夸大、技术深度描述是否与经验年限匹配、时间线是否合理"},
]
```

### 2.2 权重设计逻辑

| 维度 | 权重 | 为什么是这个权重？ |
|------|------|-------------------|
| 项目深度 | 30% | 技术面试的核心考察点，面试官最看重 |
| 技术匹配度 | 25% | 决定候选人能否胜任岗位，HR 筛选的第一关 |
| 表达规范性 | 15% | 体现沟通能力，团队协作的基础 |
| 简历结构 | 15% | 影响 HR 阅读效率，第一印象 |
| 量化程度 | 10% | 区分"能做"和"能证明"的关键指标 |
| 真实可信度 | 5% | 底线维度，权重低但问题严重时一票否决 |

权重和 = 1.0，**项目深度 + 技术匹配度占了 55%**，这两个维度直接决定候选人是否适合目标岗位。

### 2.3 后续节点的依赖

| 后续节点 | 依赖 run_six_dimensions 的哪个字段 |
|----------|----------------------------------|
| `diagnose_issues` | `dimension_scores` 中的 `issues` 列表，按维度汇总原始问题 |
| `generate_summary` | `weighted_score` 综合评分 + `dimension_scores` 各维度分数 |
| `save_results` | 写入 `resume_reviews.scores` JSONB 列 |
| 前端展示 | 雷达图 + 各维度分数 + 加权总分 |

## 三、逐行精读

### 3.1 准备结构化摘要

```python
raw_text   = state["raw_text"]
structured = state.get("structured") or {}
structured_summary = _build_structured_summary(structured)
```

`_build_structured_summary` 把几十 KB 的结构化 JSON 浓缩成 3~5 行文本（`nodes.py` 第 181~198 行）：

```python
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

### 3.2 定义内部评分函数

```python
async def review_one_dimension(dim: dict) -> dict:
    prompt_template = DIMENSION_REVIEW_PROMPTS.get(dim["key"], "")
    if not prompt_template:
        return _empty_dimension_score(dim)
    prompt = prompt_template.format(
        resume_text=raw_text[:3000], structured_summary=structured_summary, focus=dim["focus"],
    )
```

`review_one_dimension` 是定义在 `run_six_dimensions_node` 内部的嵌套函数，可以捕获外层作用域的 `raw_text` 和 `structured_summary`，不需要通过参数传递。

**每个维度的提示词模板使用 3 个占位符**：

| 占位符 | 来源 | 作用 |
|--------|------|------|
| `{resume_text}` | `raw_text[:3000]` | 简历原文（截断到 3000 字符） |
| `{structured_summary}` | `_build_structured_summary(structured)` | 结构化摘要 |
| `{focus}` | `SIX_DIMENSIONS[i]["focus"]` | 该维度的评审重点 |

**截断长度对比**：`extract_structured_node` 截 4000 字符，`run_six_dimensions` 截 3000 字符。评分任务的核心是"判断"而非"提取"，3000 字符足够 LLM 做判断，多截 1000 字只是浪费 token。

### 3.3 提示词模板

以 `project_depth` 维度为例（`prompts.py` 第 31~46 行）：

```python
DIMENSION_REVIEW_PROMPTS = {
    "project_depth": """请评审以下简历在【项目深度】维度的表现。

【评审重点】{focus}

【结构化摘要】
{structured_summary}

【简历原文（前3000字）】
{resume_text}

评分标准（0-100分）：
- 90-100：每个项目都有量化指标、明确的技术选型理由、清晰的个人贡献和难点解决
- 70-89： 大部分项目有量化数据，个人贡献基本清晰
- 50-69： 项目描述偏泛，缺少量化数据，个人贡献不明确
- 30-49： 项目描述流水账，看不出技术深度
- 0-29：  项目描述极度简陋或与岗位完全不相关""",
    # ... 其他 5 个维度类似
}
```

**评分标准设计特点**：

1. **5 级粒度**：每 20 分一档，覆盖从"优秀"到"极差"的完整区间
2. **行为锚定**：每级都有具体的可观察行为描述（如"每个项目都有量化指标"），而不是模糊的"非常好/好/一般/差"
3. **维度对齐**：同一维度的 5 级描述在同一维度上区分，不同维度间不混淆

### 3.4 调用 LLM + 重试

```python
last_exception = None

for attempt in range(2):                      # 最多 2 次尝试
    try:
        structured_llm = get_structured_llm("resume", DimensionScore)
        result: DimensionScore = await structured_llm.ainvoke([
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content=prompt),
        ])
        d = result.model_dump()
        d["dimension"], d["weight"], d["key"] = dim["name"], dim["weight"], dim["key"]
        return d
    except Exception as e:
        last_exception = e
        logger.warning("six_dimensions.attempt_failed", dimension=dim["name"], attempt=attempt + 1, error=str(e))
        if attempt == 0:                      # 第 1 次失败：等 1s 重试
            await asyncio.sleep(1)
        # 第 2 次失败：不等待，直接降级
# 所有尝试都失败，返回默认分数
logger.warning("six_dimensions.all_attempts_failed", dimension=dim["name"], error=str(last_exception))
return _empty_dimension_score(dim)
```

**关键细节：元数据由代码层覆盖**

`dimension`、`weight`、`key` 三个字段**不是 LLM 生成的**，而是代码层覆盖的。`DimensionScore` 的 Schema 定义（`state.py` 第 69~77 行）：

```python
class DimensionScore(BaseModel):
    dimension:   str       = Field(default="", description="维度名称（代码层覆盖，LLM 可留空）")
    score:       int       = Field(description="得分 0-100")
    weight:      float     = Field(default=0.0, description="权重（代码层覆盖，LLM 可填 0）")
    issues:      list[str] = Field(default_factory=list, description="该维度问题列表")
    suggestions: list[str] = Field(default_factory=list, description="改进建议列表")
```

为什么这样做？**维度名和权重是业务规则，不应该让 LLM 决定**。LLM 只负责评分和写问题，元数据由代码层注入，确保：

- 维度名统一（不会出现"项目深度"和"项目深"这种不一致）
- 权重准确（不会因为 LLM 输出波动而改变）
- 后续计算可靠（`weight` 字段是计算加权总分的关键）

### 3.5 并行执行

```python
tasks = [review_one_dimension(dim) for dim in SIX_DIMENSIONS]
dimension_scores = await asyncio.gather(*tasks)              # ← 6 路并行！
weighted_score = sum(d["score"] * d["weight"] for d in dimension_scores)
```

**这是全线性能关键路径**。6 个 LLM 调用**同时进行**，总耗时 = 最慢的一个维度，而不是 6 个之和：

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

如果串行执行，6 个维度总共需要约 13.6s。并行后降到 3.2s，**加速 4 倍以上**。

### 3.6 计算加权总分

```python
weighted_score = sum(d["score"] * d["weight"] for d in dimension_scores)
```

举例：

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

### 3.7 日志记录

```python
logger.info("six_dimensions.done", weighted_score=round(weighted_score, 2),
            scores={d["key"]: d["score"] for d in dimension_scores})
```

结构化日志记录加权总分和每个维度的分数。方便通过日志检索：
- "某份简历的评分是多少？" → 搜 `six_dimensions.done` + `review_id`
- "各维度平均分是多少？" → 统计 `scores` 字段
- "哪个维度最容易失败？" → 搜 `six_dimensions.attempt_failed` 或 `six_dimensions.all_attempts_failed`

### 3.8 降级兜底

```python
def _empty_dimension_score(dim: dict) -> dict:
    """维度评审失败时的降级结果。"""
    return {"key": dim["key"], "dimension": dim["name"], "score": 50, "weight": dim["weight"],
            "issues": ["该维度评审失败，建议人工复核"], "suggestions": []}
```

降级默认给 **50 分**（及格线）。为什么是 50 不是 0？

- 给 0 分会严重拉低加权总分，导致整体评价失真
- 给 50 分是"中性"的——既不偏袒也不惩罚，人工复核时看到 50 分自然会警觉
- 后续 `diagnose_issues` 节点会看到 `issues` 里有"该维度评审失败"的提示

## 四、完整的 `DimensionScore` Schema

```python
class DimensionScore(BaseModel):
    dimension:   str           # 维度名称（代码层覆盖）
    score:       int           # 得分 0-100（LLM 生成）
    weight:      float         # 权重（代码层覆盖）
    issues:      list[str]     # 该维度问题列表（LLM 生成）
    suggestions: list[str]     # 改进建议列表（LLM 生成）
```

**字段设计要点**：

- `dimension` 和 `weight` 有默认值，LLM 可以不填，由代码层覆盖
- `score` 是必填字段，LLM 必须给出
- `issues` 和 `suggestions` 是列表，默认空列表，LLM 可能什么都不说（满分简历）

## 五、`★` 设计亮点

### 5.1 三种不同粒度的文本输入

```
┌─────────────────────────────────────────────────────┐
│                 raw_text（全文，10KB+）               │
├─────────────────────────────────────────────────────┤
│                                                     │
│  raw_text[:3000]（截断文本，给 LLM 看原文上下文）        │
│                                                     │
├─────────────────────────────────────────────────────┤
│                                                     │
│  structured_summary（5行摘要，给 LLM 看结构化关键信息）    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

LLM 同时看到：
- **原文片段**（感受语言风格、细节）
- **结构化摘要**（快速了解候选人画像）

两者互补，让 LLM 既能看到"森林"（摘要），又能看到"树木"（原文细节）。

### 5.2 评分标准的 5 级行为锚定

每个维度都有 5 级评分标准（90-100 / 70-89 / 50-69 / 30-49 / 0-29），每级对应一个具体的可观察描述。这种设计比"请给 1-5 分"更精确：

```
❌ "请给项目深度打分 1-5 分"
   → LLM 可能乱给，不同次调用标准不一致

✅ "90-100 分：每个项目都有量化指标、明确的技术选型理由"
   → LLM 有明确的对标模板，评分更稳定
```

### 5.3 权重配置化

权重不是硬编码在评分逻辑里，而是定义在 `SIX_DIMENSIONS` 列表中。想调整权重只需要改一个数字，不需要改代码逻辑。

这为后续产品化留下了空间——比如企业客户想要"技术匹配度占比更高"，改 `weight` 字段即可。

### 5.4 并发 + 独立重试

每个维度有自己的重试逻辑，互不影响。维度 A 重试时，维度 B、C、D 仍然在正常运行：

```
维度 A 重试等待 1s 时：
├── project_depth  ────██████████████████████████████████████████████████  (3.2s)
├── tech_match     ────████████████████████████                        (2.1s) ✓ 已完成
        ↑ 重试等待 1s
├── expression     ────████████████████                                (1.8s) ✓ 已完成
├── structure      ────████████████████████                            (2.0s) ✓ 已完成
├── quantification ────████████████████████████████████████████        (2.8s) ✓ 已完成
└── authenticity   ────████████████████                                (1.7s) ✓ 已完成
```

`asyncio.gather` 的容错性保证了：一个维度抛异常不会影响其他维度。

### 5.5 元数据与评分分离

```
代码层控制（业务规则）：
  dimension → "项目深度"（统一名称）
  weight    → 0.30（固定权重）
  key       → "project_depth"（程序标识）

LLM 生成（AI 判断）：
  score      → 85（评分）
  issues     → ["缺少量化数据"]（问题）
  suggestions → ["补充 QPS/DAU"]（建议）
```

这种分离确保了：
- 业务逻辑不受 LLM 输出波动影响
- 后续计算（加权总分）可靠
- 前端展示字段名统一

## 六、与 `extract_structured_node` 的对比

| 维度 | `extract_structured_node` | `run_six_dimensions_node` |
|------|---------------------------|---------------------------|
| 输入 | `raw_text[:4000]` | `raw_text[:3000]` + `structured_summary` |
| 输出 | 一个结构化对象 | 6 个评分 + 1 个加权总分 |
| 并发 | 单次 LLM 调用 | 6 路并行 |
| LLM 调用次数 | 1 次（最多 2 次含重试） | 6 次（最多 12 次含重试） |
| 重试策略 | 重试 1 次 → 降级空结构 | 每个维度独立重试 1 次 → 降级 50 分 |
| 模型 | `get_structured_llm("resume", ResumeStructured)` | `get_structured_llm("resume", DimensionScore)` |
| 耗时 | ~1-3s | ~2-4s（并行，6 个维度中最慢的） |

## 七、边界情况处理

| 场景 | 表现 |
|------|------|
| 所有维度正常 | 返回 6 个评分 + 加权总分 |
| 某个维度 LLM 调用失败 | 该维度重试 1 次，仍失败 → 降级 50 分 |
| 所有维度都失败 | 所有维度 50 分，加权总分 50 分 |
| `structured` 为空 | `_build_structured_summary` 返回"（结构化提取失败，请基于原文评审）" |
| 某个维度提示词不存在 | `DIMENSION_REVIEW_PROMPTS.get(dim["key"], "")` 返回空 → 直接降级 50 分 |
| 简历内容非常短 | 正常评分，LLM 基于有限信息给出合理判断 |
| 简历内容超长 | 截断到 3000 字符，尾部内容可能丢失但评分不受影响 |
| 单维度 LLM 返回空 score | LLM 必须给 score（Schema 必填），否则校验失败，走重试 |

## 八、数据流全景

```
extract_structured_node
    │
    │  structured (有序字典)
    │  raw_text (全文)
    │
    ▼
run_six_dimensions_node
    │
    │  ┌─ _build_structured_summary(structured)  →  5行摘要
    │  │
    │  │  asyncio.gather(*tasks)
    │  │  ├── review_one_dimension(project_depth)   →  score: 85, issues: [...]
    │  │  ├── review_one_dimension(tech_match)      →  score: 90, issues: [...]
    │  │  ├── review_one_dimension(expression)      →  score: 70, issues: [...]
    │  │  ├── review_one_dimension(structure)       →  score: 75, issues: [...]
    │  │  ├── review_one_dimension(quantification)  →  score: 60, issues: [...]
    │  │  └── review_one_dimension(authenticity)    →  score: 80, issues: [...]
    │  │
    │  │  加权总分 = sum(score × weight)
    │  │         = 85×0.30 + 90×0.25 + 70×0.15 + 75×0.15 + 60×0.10 + 80×0.05
    │  │         = 79.75
    │  │
    │  └─ 返回 {"dimension_scores": [...], "weighted_score": 79.75}
    │
    ▼
diagnose_issues_node
    │
    │  用各维度的评分和问题列表做逐条诊断
    │
    ▼
generate_summary_node
    │
    │  用加权总分 + 高优先级问题生成整体评价
    │
    ▼
save_results_node
```

`run_six_dimensions_node` 是整个流水线的**核心数据枢纽**——它同时接收了前面的结构化提取结果，又为后面的问题诊断和整体评价提供了数据基础。