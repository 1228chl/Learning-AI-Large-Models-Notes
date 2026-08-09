# 试卷批改 Agent：三轨并行（2）——简答题 LLM 评分

> 源文件：`backend/agents/exam/nodes.py` 第 319~425 行
> 对应课件：6.6 三轨并行-简答题LLM评分
> 前置依赖：`get_llm`、`get_structured_llm`、`SubjectiveReviewResult`、`SUBJECTIVE_THINK_PROMPT`、`SUBJECTIVE_REVIEW_PROMPT`

## 全文行号速查表

| 行号范围 | 函数/代码段 | 说明 |
|---------|-------------|------|
| 319~322 | 分区注释 | 节点：_run_subjective_track — 简答题 LLM 批改 |
| 324~327 | `_run_subjective_track` 签名 | 分组并行入口 |
| 330~377 | `_review_one_subjective` | 单题批改（Think + Review 两步，LLM 调用） |
| 380~425 | `_run_subjective_track` 主体 | 按 needs_review 分组，并行批改，单题降级 |

---

## 一、两步批改流程

简答题的核心挑战：学员可能用不同的表述正确回答了同一个知识点。直接让 LLM 对照得分点评分，面对"表述不同但实质正确"的情况容易误判扣分。

解决方案：**Think Tool 两步流程**。

```
┌── 第一步：推理（SUBJECTIVE_THINK_PROMPT）─────────────────────────┐
│  普通 LLM 调用（无结构化输出约束）                                  │
│  问：这道题的每个得分点，学员是否覆盖？有没有表述不同但实质正确的内容？ │
│  LLM 自由输出推理分析（reasoning_trace），例如：                    │
│  "学员提到了'对象创建由容器管理'，实质等同于得分点1的要求……"          │
└───────────────────────────────────────────────── reasoning_trace ┘
                            │
                            ▼
┌── 第二步：评分（SUBJECTIVE_REVIEW_PROMPT + reasoning_trace）───────┐
│  结构化 LLM 调用（with_structured_output(SubjectiveReviewResult)）  │
│  把第一步的推理追加到 Prompt 末尾，让 LLM 参考自己的分析再打分        │
│  输出：SubjectiveReviewResult（逐得分点评分 + confidence）          │
└────────────────────────────────────────────────────────────────────┘
```

**效果**：推理步骤迫使 LLM 先"思考"再"评分"，减少仅凭表面文字差异就扣分的情况。

---

## 二、`_review_one_subjective`：单题批改（第 321~377 行）

### 2.1 函数签名

```python
async def _review_one_subjective(q: dict) -> dict:
    """批改单道简答题，两步流程：先 Think Tool 推理，再结构化评分。"""
```

| 行号 | 代码 | 说明 |
|:-----|:-----|:-----|
| 321 | `async def _review_one_subjective(q: dict) -> dict:` | 异步函数，接收单道题的合并字典 |
| 322~323 | 文档字符串 | 说明两步流程 |
| 324~329 | 前置准备（scoring_points_text, student_answer_text） | 格式化得分点和学员答案 |
| 332~345 | Think Tool 推理 | 先自由推理再评分 |
| 348~362 | 结构化评分 | 调用 `with_structured_output` |
| 364~377 | 返回值 | 组装结果字典 |

### 2.2 前置准备（第 324~329 行）

```python
# 构造得分点描述文本
scoring_points_text = "\n".join([
    f"  {i + 1}. [{sp['score']}分] {sp['desc']}"
    for i, sp in enumerate(q["scoring_points"])
]) or "  （无预设得分点，请综合评分）"

student_answer_text = q["student_answer"] or "（学员未作答）"
```

**得分点文本格式化**：把 `scoring_points` 列表转成可读文本：

```
  1. [2分] 学员能说出 IOC 的概念
  2. [3分] 学员能说出 DI 的两种实现方式
```

**`or "  （无预设得分点，请综合评分）"`**：如果 `scoring_points` 为空，告诉 LLM 没有预设得分点，让它综合评分。

**`or "（学员未作答）"`**：如果学员没作答，把空字符串替换为显式提示，让 LLM 知悉不是"空答案"而是"未作答"。

### 2.3 第一步：Think Tool 推理（第 332~345 行）

```python
reasoning_trace = ""
try:
    think_prompt = SUBJECTIVE_THINK_PROMPT.format(
        question_content=q["content"],
        scoring_points=scoring_points_text,
        student_answer=student_answer_text,
    )
    think_llm  = get_llm("exam_subjective", temperature=0)
    think_resp = await think_llm.ainvoke([HumanMessage(content=think_prompt)])
    reasoning_trace = _get_message_content(think_resp).strip()
    logger.debug("subjective_think.done", question_no=q.get("question_no"))
except Exception as e:
    # 推理失败不影响主评分，降级为直接评分
    logger.warning("subjective_think.failed", error=str(e))
```

| 行号 | 代码 | 说明 |
|:-----|:-----|:-----|
| 332 | `reasoning_trace = ""` | 初始化为空，推理失败时保持空字符串 |
| 333~334 | `try:` | 尝试 LLM 推理 |
| 335~339 | `think_prompt = SUBJECTIVE_THINK_PROMPT.format(...)` | 拼接 Think Tool Prompt |
| 341 | `think_llm = get_llm("exam_subjective", temperature=0)` | 获取普通 LLM，temperature=0 保证确定性 |
| 342 | `think_resp = await think_llm.ainvoke(...)` | 调用 LLM 推理 |
| 343 | `reasoning_trace = _get_message_content(think_resp).strip()` | 提取推理内容 |
| 344 | `logger.debug(...)` | 记录推理完成日志 |
| 345~347 | `except Exception: logger.warning(...)` | 推理失败不阻断，降级为直接评分 |

**`get_llm("exam_subjective", temperature=0)`**：获取一个普通 LLM 实例（非结构化输出），`temperature=0` 保证输出确定性。

**`reasoning_trace = ""` 初始化为空**：如果推理失败，`reasoning_trace` 保持空字符串，第二步的评分 Prompt 不会追加推理上下文，退化到**直接评分**。

**`try/except` 降级**：推理步骤**不是必须的**——即使 LLM 推理失败，主评分流程仍然继续，只是不走两步流程。

### 2.4 第二步：结构化评分（第 348~362 行）

```python
think_context = (
    f"\n\n【批改前分析】\n{reasoning_trace}" if reasoning_trace else ""
)
review_prompt = SUBJECTIVE_REVIEW_PROMPT.format(
    question_content=q["content"],
    scoring_points=scoring_points_text,
    full_score=q["full_score"],
    student_answer=student_answer_text,
) + think_context

structured_llm = get_structured_llm("exam_subjective", SubjectiveReviewResult)
result: SubjectiveReviewResult = await structured_llm.ainvoke([
    SystemMessage(content=SYSTEM_PROMPT),
    HumanMessage(content=review_prompt),
])
```

**`think_context` 有条件追加**：只有推理成功（`reasoning_trace` 非空）时，才把推理内容追加到评分 Prompt 末尾。推理失败时直接评分。

**`get_structured_llm("exam_subjective", SubjectiveReviewResult)`**：获取结构化 LLM 实例，绑定 `SubjectiveReviewResult` schema。LLM 的输出被强制符合该 schema，Pydantic 自动校验。

**两条消息**：
- `SystemMessage(content=SYSTEM_PROMPT)`：人设（严谨公正的助教）
- `HumanMessage(content=review_prompt)`：评分任务（含推理上下文）

`★ Insight ─────────────────────────────────────`
**两步流程的设计本质**：
- 第一步：**无约束推理**——LLM 自由输出分析，不担心"格式对不对"
- 第二步：**有约束评分**——LLM 参考自己的分析，输出符合 schema 的结构化结果
- 先想后答，比直接让 LLM 输出结构化评分准确率更高
- 这对应了"System 1（直觉）→ System 2（分析）"的认知模型
`─────────────────────────────────────────────────`

### 2.5 返回值（第 364~377 行）

```python
return {
    "question_id":    q["question_id"],
    "question_no":    q["question_no"],
    "question_type":  "short_answer",
    "knowledge_tag":  q.get("knowledge_tag", ""),
    "content":        q.get("content", ""),
    "student_answer": q["student_answer"],
    "score":          result.total_score,
    "full_score":     result.full_score,
    "needs_review":   result.confidence < 0.7,   # 低把握度标记教师复核
    "confidence":     result.confidence,
    "ai_feedback":    result.overall_comment,
    "point_results":  [p.model_dump() for p in result.point_results],
}
```

| 行号 | 代码 | 说明 |
|:-----|:-----|:-----|
| 364 | `return {` | 返回批改结果字典 |
| 365 | `"question_id": q["question_id"]` | 题目 ID |
| 366 | `"question_no": q["question_no"]` | 题号 |
| 367 | `"question_type": "short_answer"` | 题型固定为 short_answer |
| 368 | `"knowledge_tag": q.get("knowledge_tag", "")` | 知识点标签，缺省空串 |
| 370 | `"student_answer": q["student_answer"]` | 学员答案原样回显 |
| 371 | `"score": result.total_score` | LLM 算出的得分 |
| 372 | `"full_score": result.full_score` | 题目满分 |
| 373 | `"needs_review": result.confidence < 0.7` | 低把握度标记教师复核 |
| 374 | `"confidence": result.confidence` | LLM 评分把握度 |
| 375 | `"ai_feedback": result.overall_comment` | 整体评语 |
| 376 | `"point_results": [p.model_dump() for p in result.point_results]` | 逐得分点结果，Pydantic 转 dict |

**`needs_review: result.confidence < 0.7`**：LLM 对自己的评分把握度打分。阈值设为 0.7 而非 0.5，课件第 2003 行解释：

> 简答题评分有一定主观性，即使 LLM 有 70% 把握，教师也可能有不同判断，宁可多标几道让教师过目，也不要遗漏真正有争议的题目。

**`point_results: [p.model_dump() for p in result.point_results]`**：Pydantic 模型转 dict。`SubjectiveReviewResult` 的 `point_results` 是 `list[ScoringPointResult]`，需要 `.model_dump()` 转成普通 dict 才能存进 State。

---

## 三、`_run_subjective_track`：分组并行（第 380~425 行）

### 3.1 函数签名

```python
async def _run_subjective_track(questions: list[dict]) -> list[dict]:
    """
    简答题批改，每 3 题一组并行处理。

    并行策略：
        把 N 道简答题切成 ⌈N/3⌉ 个组，组内 asyncio.gather 并行，
        组间顺序执行。目的是避免同时发起几十个 LLM 请求导致 API 限速。
    """
```

### 3.2 分组策略（第 391~392 行）

```python
GROUP_SIZE = 3
groups = [questions[i:i + GROUP_SIZE] for i in range(0, len(questions), GROUP_SIZE)]
```

**`GROUP_SIZE = 3`**：每 3 题一组。为什么选 3 而不是全部并行？

课件第 2054 行：
> 如果一份试卷有 15 道简答题，全部并行就是 15 个 LLM 请求同时发出。DeepSeek API 有并发限制，超出后请求排队甚至失败。每组 3 题，组内并行（最多 3 个请求），组间顺序执行，实际上在"并发效率"和"API 稳定性"之间取了一个合理的平衡点。

```
组1 [题1, 题2, 题3] ──► asyncio.gather（3个并发请求）
                                    ↓ 全组完成
组2 [题4, 题5, 题6] ──► asyncio.gather
                                    ↓
...
```

### 3.3 组内执行（第 395~399 行）

```python
for group in groups:
    group_results = await asyncio.gather(
        *[_review_one_subjective(q) for q in group],
        return_exceptions=True,
    )
```

**`asyncio.gather` 并发**：组内 3 道题同时发起 LLM 请求，并行等待。

**`return_exceptions=True`**：即使某道题抛出异常，也不会中断其他两道题的评分。异常会作为返回值返回，而不是抛出。

### 3.4 逐题检查 + 降级（第 400~423 行）

```python
for q, result in zip(group, group_results):
    if isinstance(result, Exception):
        # 单题失败降级：标记 needs_review=True，不阻断整批
        logger.warning(
            "subjective_track.question_failed",
            question_id=q["question_id"],
            error=str(result),
        )
        all_results.append({
            "question_id":    q["question_id"],
            "question_no":    q["question_no"],
            "question_type":  "short_answer",
            "knowledge_tag":  q.get("knowledge_tag", ""),
            "content":        q.get("content", ""),
            "student_answer": q["student_answer"],
            "score":          0,
            "full_score":     q["full_score"],
            "needs_review":   True,
            "confidence":     0.0,
            "ai_feedback":    "AI 评分失败，已标记需教师人工批改",
            "point_results":  [],
        })
    else:
        all_results.append(result)
```

**`isinstance(result, Exception)`**：`asyncio.gather(return_exceptions=True)` 中，协程正常返回结果，异常返回 Exception 对象。通过 `isinstance` 判断是否异常。

**降级结构**：失败的题目用特殊结构填充：

| 字段 | 降级值 | 含义 |
|:-----|:-------|:-----|
| `score` | `0` | 暂给 0 分 |
| `needs_review` | `True` | 强制教师复核 |
| `confidence` | `0.0` | LLM 完全没把握 |
| `ai_feedback` | `"AI 评分失败..."` | 提示教师人工批改 |
| `point_results` | `[]` | 空得分点列表 |

**单题失败不阻断整批**：这是关键设计——15 道题里有 1 道 LLM 调用失败，不影响其他 14 道。失败的标记为 `needs_review=True`，教师人工补批。

---

## 四、调用方式与依赖

### 4.1 谁调用它？

`_run_subjective_track` 由 `run_three_tracks_node` 在 `asyncio.gather` 中调用，与客观轨、代码轨并行：

```python
# nodes.py run_three_tracks_node 内部
p_objective, p_subjective, p_code = await asyncio.gather(
    _run_objective_track(objective_questions),
    _run_subjective_track(subjective_questions),
    _run_code_track(code_questions),
)
```

### 4.2 依赖的资源

| 依赖 | 用途 |
|------|------|
| `get_llm("exam")` | 普通 LLM 调用（Think Tool 推理） |
| `get_structured_llm("exam", SubjectiveReviewResult)` | 结构化 LLM 调用（评分） |
| `SUBJECTIVE_THINK_PROMPT` | 批改前推理 Prompt |
| `SUBJECTIVE_REVIEW_PROMPT` | 结构化评分 Prompt |
| `SYSTEM_PROMPT` | 系统人设 |

### 4.3 输入输出

| 方向 | 内容 |
|------|------|
| 输入 | `questions: list[dict]`（含 `scoring_points`, `student_answer`, `full_score`） |
| 输出 | `list[dict]`（每题的 `score, needs_review, ai_feedback, point_results...`） |

---

## 五、`★` 设计亮点总结

### 4.1 Think Tool 两步流程

先自由推理再结构化评分，减少 LLM 误判。推理失败时自动降级为直接评分，不阻断流程。

### 4.2 `needs_review` 阈值 0.7

简答题评分主观性强，阈值设为 0.7 而非 0.5——宁可多标几道让教师过目，也不要遗漏真正有争议的题目。

### 4.3 每 3 题一组并行

组内 `asyncio.gather` 并发（最多 3 个 LLM 请求），组间顺序执行。平衡并发效率与 API 限速。

### 4.4 单题降级不阻断

`return_exceptions=True` + `isinstance` 检查，单题失败只影响该题，填入降级结构并标记 `needs_review=True`，教师人工补批。

### 4.5 统一的输出结构

`_run_objective_track`、`_run_subjective_track`、`_run_code_track` 三轨输出结构一致（`question_id, score, needs_review, ai_feedback...`），后续汇总节点无需区分题型即可统一处理。