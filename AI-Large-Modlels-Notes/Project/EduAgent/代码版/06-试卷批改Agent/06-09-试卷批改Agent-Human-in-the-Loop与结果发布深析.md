# 试卷批改 Agent：Human-in-the-Loop 与结果发布

> 源文件：`backend/agents/exam/nodes.py` 第 740~953 行
> 对应课件：6.9 Human-in-the-Loop
> 关键依赖：`langgraph.types.interrupt`、`Command(resume=...)`

## 一、四个节点的数据流

```
analyze_weak_points → notify_teacher → teacher_review → apply_teacher_decision → publish_results → END
                           │                 │
                           ▼                 ▼
                    status=pending_review   interrupt() 暂停
                                          等待教师确认
                                           │
                                           ▼ (教师 POST /confirm)
                                    Command(resume=decision)
                                           │
                                           ▼
                                    apply_teacher_decision (合并)
                                           │
                                           ▼
                                    publish_results (写库)
```

| 节点 | 职责 | 关键操作 |
|:-----|:------|:---------|
| `notify_teacher_node` | 更新 DB 状态为 `pending_review` | `UPDATE exam_submissions` |
| `teacher_review_node` | `interrupt()` 暂停图，等教师决策 | `interrupt(display_data)` |
| `apply_teacher_decision_node` | 按教师决策合并分数 | `approve` 或 `modify` |
| `publish_results_node` | 写库发布 | `exam_reviews` 先删后插，更新 `status='published'` |

---

## 二、`interrupt()` 的工作原理（课件 6.9.1）

LangGraph 的 `interrupt()` 是实现 Human-in-the-Loop 的核心机制。教师视角的时间线：

```
[学员提交]      [AI 批改完成]              [教师审核]           [结果发布]
    │                  │                       │                    │
    ▼                  ▼                       ▼                    ▼
POST /submit     notify_teacher_node    GET /submissions/{id}/review
    │                  │               POST /submissions/{id}/confirm
    │           interrupt(display_data)        │
    │                  │               Command(resume=decision)
    │         ← 图在此冻结 →                   │
    │         State 存入 MemorySaver           │
    │                               graph.ainvoke 恢复执行
    │                               apply_teacher_decision_node
    │                               publish_results_node → END
```

**`interrupt()` 内部机制**（课件第 1951~1957 行）：

1. 执行到 `interrupt(value)` 时，LangGraph 抛出一个内部 `Interrupt` 异常
2. `graph.ainvoke` 捕获这个异常，把当前完整 State 保存到 MemorySaver（按 `thread_id` 存储）
3. `ainvoke` 返回（不是等待，而是真正返回），调用方的 `await _graph.ainvoke(...)` 完成
4. 图进入"暂停"状态，State 里包含中断点的位置信息（`next=["teacher_review"]`）
5. 后续调用 `graph.ainvoke(Command(resume=decision), config=config)` 时，LangGraph 从 MemorySaver 恢复 State，从 `teacher_review_node` 的 `interrupt()` 调用处继续，`decision` 作为 `interrupt()` 的返回值

**关键约束**：编译图时不传 `interrupt_before`，只在节点内调用 `interrupt()`。这是 LangGraph 1.0 的新 API，旧写法（`compile(interrupt_before=["teacher_review"])`）已废弃。

---

## 三、`notify_teacher_node`：更新状态（第 744~764 行）

```python
async def notify_teacher_node(state: ExamState) -> dict:
    """
    将提交状态推进到 pending_review，等待教师确认。
    """
    async with AsyncSessionLocal() as session:
        async with session.begin():
            await session.execute(
                text("""
                    UPDATE exam_submissions
                    SET status = 'pending_review', updated_at = NOW()
                    WHERE id = :submission_id
                """),
                {"submission_id": state["submission_id"]},
            )

    logger.info("notify_teacher.done", submission_id=state["submission_id"])
    return {"teacher_notified": True}
```

**只做一件事**：更新数据库状态为 `pending_review`。教师轮询 `GET /pending-reviews` 接口就能看到新提交。

**`return {"teacher_notified": True}`**：标记 State，表示教师已被告知。

---

## 四、`teacher_review_node`：暂停点（第 771~800 行）

### 4.1 构建 display_data

```python
display_data = {
    "submission_id":       state["submission_id"],
    "student_id":          state["student_id"],
    "pre_review_summary":  state.get("pre_review_summary", {}),
    "weak_points":         state.get("weak_points", []),
    "weak_points_summary": state.get("weak_points_summary", ""),
    "message":             "请检查 AI 预批改结果和知识薄弱点分析，确认无误后点击发布。",
}
```

**`display_data` 的用途**：`interrupt(display_data)` 中的 `display_data` 会作为图的"中断值"存入 MemorySaver。教师端通过 `GET /submissions/{id}/review` 读取图的当前 State（`graph.aget_state(config)`），从 State 中获取 `pre_review_summary` 和 `weak_points` 展示给教师。

课件第 2028 行：
> 实际上 `display_data` 里的数据和 State 里的字段有一定重复。直接读 State 是更规范的方式，`display_data` 更多是为了语义清晰——告诉维护者"这是暴露给教师看的数据"。

### 4.2 interrupt() 调用

```python
teacher_decision = interrupt(display_data)

logger.info(
    "teacher_review.resumed",
    submission_id=state["submission_id"],
    action=teacher_decision.get("action", "unknown"),
)

return {"teacher_decision": teacher_decision}
```

**`interrupt()` 执行时**：图冻结，State 保存，等待外部恢复。

**`interrupt()` 返回时**：教师通过 `POST /confirm` 传入 `Command(resume=decision)`，`interrupt()` 的返回值就是 `decision`。

**`return {"teacher_decision": teacher_decision}`**：把教师的决策存入 State，供后续 `apply_teacher_decision_node` 读取。

---

## 五、`apply_teacher_decision_node`：合并教师决策（第 807~845 行）

### 5.1 函数签名

```python
async def apply_teacher_decision_node(state: ExamState) -> dict:
    """
    将教师决策合并到批改结果中。

    approve：直接把 AI 分数作为最终分数
    modify： 按 modifications 列表覆盖指定题目的得分和评语
    """
```

### 5.2 两种决策模式

```python
decision      = state.get("teacher_decision", {})
action        = decision.get("action", "approve")
modifications = decision.get("modifications", [])

all_results = list(state.get("pre_review_summary", {}).get("by_question", []))

# 每道题先用 AI 分数初始化 final_score
for r in all_results:
    r["final_score"] = r.get("score", 0)
```

| 决策 | 含义 | 处理 |
|:-----|:------|:-----|
| `approve` | 全部通过 | 直接用 AI 分数作为 `final_score` |
| `modify` | 部分修改 | 按 `modifications` 覆盖指定题的分数和评语 |

**`final_score` 初始化**：先复制 AI 的 `score` 到 `final_score`，`modify` 时再覆盖。

### 5.3 modify 逻辑

```python
if action == "modify" and modifications:
    id_to_idx = {r["question_id"]: i for i, r in enumerate(all_results)}
    for mod in modifications:
        qid = mod.get("question_id")
        if qid in id_to_idx:
            idx = id_to_idx[qid]
            if "new_score" in mod:
                all_results[idx]["teacher_score"] = mod["new_score"]
                all_results[idx]["final_score"]   = mod["new_score"]
            if "comment" in mod:
                all_results[idx]["teacher_comment"] = mod["comment"]
            all_results[idx]["reviewed_by"] = decision.get("teacher_id", "")
```

**`id_to_idx` 索引**：把 `question_id` 到列表索引的映射，O(1) 查找，避免每修改一道题都线性扫描。

**`teacher_score` vs `final_score`**：`teacher_score` 记录教师给的分（用于追溯），`final_score` 是最终算分用的分数。在 `approve` 模式下 `teacher_score` 不存在，`final_score` 等于 AI 分数。

---

## 六、`publish_results_node`：发布结果（第 852~953 行）

### 6.1 函数签名

```python
async def publish_results_node(state: ExamState) -> dict:
    """
    将最终批改结果写入数据库，发布给学员。

    写入逻辑：
        exam_reviews  ── 先删后插（幂等），每道题一行
        exam_submissions ── 更新 status='published' + weak_points JSON
    """
```

### 6.2 先删后插（第 869~911 行）

```python
for r in final_results:
    # 先删后插：避免重复发布时产生重复记录
    await session.execute(
        text("""
            DELETE FROM exam_reviews
            WHERE submission_id = :submission_id
              AND question_id   = :question_id
        """),
        {"submission_id": submission_id, "question_id": r["question_id"]},
    )
    await session.execute(
        text("""
            INSERT INTO exam_reviews (
                id, submission_id, question_id, question_type,
                knowledge_tag, student_answer,
                ai_score, ai_feedback, ai_raw_result,
                teacher_score, teacher_comment, final_score,
                needs_review, reviewed_by, reviewed_at
            ) VALUES (
                :id, :submission_id, :question_id, :question_type,
                :knowledge_tag, :student_answer,
                :ai_score, :ai_feedback, :ai_raw_result,
                :teacher_score, :teacher_comment, :final_score,
                :needs_review, :reviewed_by, NOW()
            )
        """),
        {
            "id":              str(uuid.uuid4()),
            "submission_id":   submission_id,
            "question_id":     r["question_id"],
            "question_type":   r["question_type"],
            "knowledge_tag":   r.get("knowledge_tag", ""),
            "student_answer":  r.get("student_answer", ""),
            "ai_score":        r.get("score", 0),
            "ai_feedback":     r.get("ai_feedback", ""),
            "ai_raw_result":   json.dumps(r),           # 完整原始结果存 JSON
            "teacher_score":   r.get("teacher_score"),  # None 表示未修改
            "teacher_comment": r.get("teacher_comment"),
            "final_score":     r.get("final_score", r.get("score", 0)),
            "needs_review":    r.get("needs_review", False),
            "reviewed_by":     teacher_id,
        },
    )
```

**`DELETE + INSERT` 幂等**：先按 `submission_id + question_id` 删除旧记录，再插入新记录。这样即使重复发布（如教师点了两次发布），也不会产生重复记录。

**`ai_raw_result: json.dumps(r)`**：把整道题的完整批改结果（包括 `point_results`、`quality_feedback` 等）以 JSON 格式存入数据库。这是"审计日志"——以后可以追溯 AI 当时是怎么评的。

### 6.3 更新提交状态（第 914~929 行）

```python
await session.execute(
    text("""
        UPDATE exam_submissions
        SET status               = 'published',
            published_at         = NOW(),
            updated_at           = NOW(),
            weak_points          = :weak_points,
            weak_points_summary  = :weak_points_summary
        WHERE id = :submission_id
    """),
    {
        "submission_id":       submission_id,
        "weak_points":         json.dumps(weak_points),
        "weak_points_summary": state.get("weak_points_summary", ""),
    },
)
```

**`weak_points` 存 JSON**：薄弱点分析结果以 JSON 存入 `exam_submissions` 表的 `weak_points` 字段，供教师后台直接读取展示。

### 6.4 返回值（第 941~953 行）

```python
return {
    "published": True,
    "structured_output": {
        "submission_id":       submission_id,
        "final_score":         total_final,
        "full_score":          full_score,
        "score_rate":          round(total_final / full_score, 4) if full_score else 0,
        "weak_points":         weak_points,
        "weak_points_summary": state.get("weak_points_summary", ""),
        "published":           True,
    },
}
```

**`structured_output`**：供 API 层直接返回给教师确认接口，包含总分、得分率、薄弱点等关键信息。

---

## 七、`★` 设计亮点总结

### 7.1 `interrupt()` 实现 Human-in-the-Loop

LangGraph 的 `interrupt()` 让图在 `teacher_review_node` 处冻结，State 自动保存到 MemorySaver。教师通过 `GET` 接口查看预批改结果，`POST /confirm` 传入决策恢复流程。不需要外部状态管理，不依赖消息队列。

### 7.2 两种教师决策模式

| 模式 | 适用场景 | 实现 |
|:-----|:---------|:-----|
| `approve` | AI 批改结果满意 | 直接使用 AI 分数 |
| `modify` | 需要调整部分题目的分数 | 按 `modifications` 覆盖 |

### 7.3 先删后插的幂等发布

`DELETE + INSERT` 确保重复发布不产生重复记录。`exam_reviews` 表每道题只有一条记录，幂等安全。

### 7.4 `ai_raw_result` 完整审计日志

每道题的完整批改结果以 JSON 存入 `ai_raw_result` 字段，可追溯 AI 原始评分，为后续优化提供数据。

### 7.5 `structured_output` 统一接口

最终结果通过 `structured_output` 字段输出，API 层无需解析 State 即可直接返回给前端。