# 试卷批改 Agent：三轨组装、汇总与薄弱点分析

> 源文件：`backend/agents/exam/nodes.py` 第 530~737 行
> 对应课件：6.8 三轨组装与汇总
> 前置节点：`run_three_tracks_node` → `aggregate_results_node` → `analyze_weak_points_node`

## 一、三个节点的数据流

```
parse_word → load_questions_meta → run_three_tracks → aggregate_results → analyze_weak_points
                                        │                    │                   │
                                        ▼                    ▼                   ▼
                                  objective_results    pre_review_summary    weak_points
                                  subjective_results    (总分/需复核数)       weak_points_summary
                                  code_results
```

本节覆盖 3 个节点，它们串联了从"批改完"到"出结果"的完整流程：

| 节点 | 输入 | 输出 | 职责 |
|:-----|:-----|:-----|:------|
| `run_three_tracks_node` | `parsed_questions` | `objective/subjective/code_results` | 按题型分流，三轨并行批改 |
| `aggregate_results_node` | 三轨结果 | `pre_review_summary` | 合并、排序、统计总分和需复核数 |
| `analyze_weak_points_node` | `pre_review_summary` | `weak_points` + `weak_points_summary` | 两路分析知识薄弱点 |

---

## 二、`run_three_tracks_node`：三轨组装（第 535~588 行）

### 2.1 函数签名

```python
async def run_three_tracks_node(state: ExamState) -> dict:
    """
    三轨并行批改：
        第一轨：规则引擎（客观题：单选/多选/判断）
        第二轨：LLM 语义评分（简答题，按3题一组并行）
        第三轨：LLM 代码质量评估（代码题，顺序执行）

    asyncio.gather(return_exceptions=True)：
        某一轨抛异常不会中断其他轨，异常作为返回值处理。
        失败的轨结果置为空列表，其余轨正常写入 State。
    """
```

### 2.2 按题型分流（第 546~551 行）

```python
questions = state["parsed_questions"]

objective_qs  = [q for q in questions if q["question_type"] in
                 ("single_choice", "multi_choice", "judge")]
subjective_qs = [q for q in questions if q["question_type"] == "short_answer"]
code_qs       = [q for q in questions if q["question_type"] == "code"]
```

**三个列表推导式**按 `question_type` 分流，每道题只进入对应的轨道。

| 题型 | 轨道 | 批改方式 |
|:-----|:-----|:---------|
| `single_choice` / `multi_choice` / `judge` | 第一轨 | 规则引擎 |
| `short_answer` | 第二轨 | LLM 两步流程 |
| `code` | 第三轨 | LLM 五维度评估 |

### 2.3 三轨并行启动（第 561~566 行）

```python
raw = await asyncio.gather(
    _run_objective_track(objective_qs),
    _run_subjective_track(subjective_qs),
    _run_code_track(code_qs),
    return_exceptions=True,
)
```

**`asyncio.gather` 并发**：三轨同时启动，没有先后依赖。客观题几毫秒跑完，简答题等最慢的 LLM 调用。总耗时约等于最慢的一轨。

**`return_exceptions=True`**：任何一轨抛出异常，不会中断其他两轨。异常作为返回值出现在 `raw` 列表中。

### 2.4 异常处理（第 568~575 行）

```python
objective_results  = raw[0] if not isinstance(raw[0], Exception) else []
subjective_results = raw[1] if not isinstance(raw[1], Exception) else []
code_results       = raw[2] if not isinstance(raw[2], Exception) else []

for name, exc in zip(["objective", "subjective", "code"], raw):
    if isinstance(exc, Exception):
        logger.error(f"three_tracks.{name}_failed", error=str(exc))
```

**`isinstance(raw[i], Exception)` 检查**：`gather(return_exceptions=True)` 中，正常返回结果，异常返回 Exception 对象。逐轨检查，异常轨用空列表兜底。

**`logger.error` 记录失败**：失败只记录日志，不更新 State——`objective_results` 在 State 中保持空列表，不影响其他两轨的正常结果。

---

## 三、`aggregate_results_node`：汇总（第 595~627 行）

### 3.1 函数签名

```python
async def aggregate_results_node(state: ExamState) -> dict:
    """
    合并三轨结果，按题号排序，计算总分和需复核题数。

    pre_review_summary 是后续 HitL 展示给教师的核心数据结构。
    """
```

### 3.2 合并与排序（第 601~606 行）

```python
all_results = (
    state.get("objective_results", [])
    + state.get("subjective_results", [])
    + state.get("code_results", [])
)
all_results.sort(key=lambda x: x.get("question_no", 0))
```

**列表拼接**：三轨结果合并成一个列表。因为三轨输出结构完全一致（`question_id, score, full_score, needs_review, ai_feedback...`），可以直接 `+` 拼接。

**按题号排序**：`sort(key=lambda x: x.get("question_no", 0))` 保证题目按试卷顺序排列，前端展示时不会乱序。

### 3.3 统计汇总（第 608~619 行）

```python
total_score        = sum(r.get("score", 0) for r in all_results)
full_score         = sum(r.get("full_score", 0) for r in all_results)
score_rate         = round(total_score / full_score, 4) if full_score > 0 else 0.0
needs_review_count = sum(1 for r in all_results if r.get("needs_review", False))

summary = {
    "total_score":        total_score,
    "full_score":         full_score,
    "score_rate":         score_rate,
    "needs_review_count": needs_review_count,
    "by_question":        all_results,
}
```

| 统计项 | 计算方式 | 用途 |
|:-------|:---------|:-----|
| `total_score` | 各题得分求和 | 总分 |
| `full_score` | 各题满分求和 | 满分 |
| `score_rate` | 总分/满分，保留 4 位小数 | 得分率 |
| `needs_review_count` | 标记 `needs_review=True` 的题数 | 教师待复核数 |

**`score_rate` 防除零**：`if full_score > 0 else 0.0`——如果全卷满分是 0（理论上不会，但防御性编程）。

**`pre_review_summary`**：这是后续 HitL（Human-in-the-Loop）展示给教师的核心数据结构，包含总分和逐题详情。

---

## 四、`analyze_weak_points_node`：薄弱点分析（第 634~737 行）

### 4.1 两条路径的设计

薄弱点分析是**两路合并**的设计：

```
失分题列表
      │
      ├─ 有 knowledge_tag → 路径1：按标签直接聚合（规则，不用 LLM）
      │
      └─ 全部失分题 → 路径2：交给 LLM 推断知识点 + 生成 suggestion
```

**为什么两条路径？** 有标签的题目不需要 LLM——直接按标签聚合，准确、零成本。无标签的题目才需要 LLM 推断知识点归属。LLM 还为有标签的题目补充 `suggestion`（复习建议）。

### 4.2 函数签名

```python
async def analyze_weak_points_node(state: ExamState) -> dict:
    """
    分析学员知识薄弱点。

    路径1：有 knowledge_tag 的失分题 → 按标签直接聚合
    路径2：无 knowledge_tag 的失分题 → 全量失分题交 LLM 推断知识点 + 生成 suggestion
    两路合并，去重，按 wrong_count 降序排列。
    """
```

### 4.3 收集失分题（第 644~655 行）

```python
all_results = state.get("pre_review_summary", {}).get("by_question", [])

wrong_questions = [
    r for r in all_results
    if r.get("score", 0) < r.get("full_score", 1)
]

if not wrong_questions:
    return {
        "weak_points":         [],
        "weak_points_summary": "本次试卷全部答对，表现优秀！",
    }
```

**`score < full_score` 判定失分**：得分没拿满就算失分题。`score=0, full_score=2` → 失分；`score=2, full_score=2` → 满分。

**全部答对时快速返回**：`"本次试卷全部答对，表现优秀！"`——不用调 LLM，直接返回空列表和表扬文案。

### 4.4 路径1：有标签→规则聚合（第 657~674 行）

```python
tagged   = [r for r in wrong_questions if r.get("knowledge_tag")]
untagged = [r for r in wrong_questions if not r.get("knowledge_tag")]

tagged_weak: dict[str, dict] = {}
for r in tagged:
    tag = r["knowledge_tag"]
    if tag not in tagged_weak:
        tagged_weak[tag] = {
            "tag":          tag,
            "wrong_count":  0,
            "total_count":  0,
            "question_nos": [],
            "suggestion":   "",
        }
    tagged_weak[tag]["wrong_count"]  += 1
    tagged_weak[tag]["total_count"]  += 1
    tagged_weak[tag]["question_nos"].append(r["question_no"])
```

**`tagged_weak` 字典**：按 `knowledge_tag` 分组聚合，每个知识点统计失分题数、总题数、题号列表。

**`wrong_count == total_count`**：这里 `total_count` 只统计了该知识点下的失分题数，而不是所有题数。这是简化的统计方式——只算"出错的题"，等教师后台看更精确的数据。

### 4.5 路径2：全量失分题→LLM（第 676~701 行）

```python
questions_for_llm = tagged + untagged
if questions_for_llm:
    wrong_desc = "\n".join([
        f"第{r['question_no']}题（{r['question_type']}，{r['score']}/{r['full_score']}分）："
        f"\n  题目：{r.get('content', r.get('ai_feedback', ''))[:200]}"
        f"\n  AI反馈：{r.get('ai_feedback', '')[:150]}"
        for r in questions_for_llm
    ])

    prompt         = WEAK_POINTS_ANALYSIS_PROMPT.format(wrong_questions=wrong_desc)
    structured_llm = get_structured_llm("exam_subjective", WeakPointsReport)

    try:
        report: WeakPointsReport = await structured_llm.ainvoke([
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content=prompt),
        ])
        llm_weak_points = [wp.model_dump() for wp in report.weak_points]
        llm_summary     = report.overall_summary
    except Exception as e:
        logger.warning("analyze_weak_points.llm_failed", error=str(e))
        llm_summary = "薄弱点分析失败，请教师根据错题情况人工判断。"
```

**`wrong_desc` 格式化**：把失分题列表拼成可读文本，每条包含：题号、题型、得分、题目内容、AI 反馈。每条内容截断到 200/150 字符，防止超过 LLM 上下文窗口。

**`WEAK_POINTS_ANALYSIS_PROMPT`**：使用课件 6.2.3 定义的 Prompt，要求 LLM 输出 `WeakPointsReport`（`list[WeakPoint]` + `overall_summary`）。

**`get_structured_llm("exam_subjective", WeakPointsReport)`**：与简答题评分用同一个模型配置，但绑定不同的 schema。

**`llm_weak_points = [wp.model_dump() for wp in report.weak_points]`**：Pydantic 模型转 dict，存入 State。

### 4.6 合并两路，去重（第 703~726 行）

```python
merged_tags       = set(tagged_weak.keys())
final_weak_points = []

for llm_wp in llm_weak_points:
    tag = llm_wp.get("tag", "")
    if tag in tagged_weak:
        # 规则聚合的知识点，用 LLM 补充 suggestion
        tagged_weak[tag]["suggestion"] = llm_wp.get("suggestion", "")
    elif tag not in merged_tags:
        # 纯 LLM 推断的知识点（无标签题目）
        final_weak_points.append(llm_wp)
        merged_tags.add(tag)

# 规则聚合结果（补充了 suggestion）加入最终列表
for wp in tagged_weak.values():
    if not wp["suggestion"]:
        wp["suggestion"] = f"建议重点复习 {wp['tag']} 相关知识点。"
    final_weak_points.append(wp)

# 按 wrong_count 降序排列
final_weak_points.sort(key=lambda x: x.get("wrong_count", 0), reverse=True)
```

**合并逻辑**：

| 情况 | LLM 输出 vs 规则聚合 | 处理 |
|:-----|:--------------------|:-----|
| LLM 的知识点标签已在规则聚合中 | `tag in tagged_weak` | 用 LLM 的 `suggestion` 补充到规则结果 |
| LLM 的知识点标签是新发现的 | `tag not in merged_tags` | 直接加入最终列表 |
| 规则聚合的结果 | 遍历 `tagged_weak.values()` | 补充缺失的 `suggestion`，全部加入 |

**`merged_tags` 集合**：跟踪已处理的知识点标签，防止重复。

**`sort(..., reverse=True)`**：按 `wrong_count` 降序，最薄弱的知识点排在最前面。

---

## 五、`★` 设计亮点总结

### 5.1 三轨完全并行

`asyncio.gather` 同时启动三轨，无数据依赖。最慢的 LLM 轨决定总耗时，快轨（规则引擎）不影响整体速度。

### 5.2 逐轨异常隔离

`return_exceptions=True` + `isinstance` 检查，某轨失败只影响该轨，其他轨正常写入。失败轨用空列表兜底。

### 5.3 统一输出结构

三轨结果结构一致，可以直接 `+` 拼接、统一排序、统一统计。这是前面三轨设计时预埋的约定。

### 5.4 薄弱点两路合并

有标签题用规则聚合（准确、零成本），无标签题用 LLM 推断（补充），LLM 的 `suggestion` 回流到规则结果。两路去重后按失分数量排序，最薄弱的知识点最靠前。

### 5.5 全部答对快速返回

没有失分题时直接返回表扬文案，不调 LLM，省成本、省延迟。