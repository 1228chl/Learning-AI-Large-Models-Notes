# 试卷批改 Agent：HTTP 接口 `exam.py`

> 源文件：`backend/api/v1/exam.py`（共 522 行）
> 对应课件：6.12 HTTP 接口（exam.py）
> 前置依赖：`graph.py`、`dependencies.py`、`memory.py`

## 一、文件定位

`exam.py` 是试卷批改 Agent 的 HTTP API 层，提供 6 个端点：

```
POST   /submit                             → 学员提交试卷（异步后台批改）
GET    /my-submissions                     → 学员查询提交记录列表
GET    /my-submissions/{submission_id}     → 学员查询单次批改结果
GET    /pending-reviews                    → 教师获取待确认列表
GET    /submissions/{submission_id}/review → 教师查看预批改详情
POST   /submissions/{submission_id}/confirm → 教师确认发布（恢复 interrupt）
```

---

## 二、全局对象（第 21~25 行）

```python
# 模块级编译图（只执行一次，避免每次请求重新编译）
_graph = build_exam_graph()

# 持有 background task 引用，防止 asyncio GC 回收未完成的任务
_background_tasks: set[asyncio.Task] = set()
```

**`_graph` 模块级单例**：与 QA Agent 不同，这里图在模块导入时**编译一次**，所有请求共用同一个编译好的图对象。因为 Exam Agent 的图是纯线性链，节点内部没有状态，可以安全共享。

**`_background_tasks` 防止 GC**：`asyncio.create_task` 创建的任务如果没有强引用，Python GC 可能在任务执行中途回收它，导致批改过程悄悄中断。把任务引用存入 `set` 就建立了强引用，任务完成后在 `done_callback` 里从 set 中移除。

---

## 三、`POST /submit`：学员提交试卷（第 32~209 行）

### 3.1 函数签名

```python
@router.post("/submit", status_code=202)
async def submit_exam(
    exam_id: str      = Form(...),
    file:    UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
```

**`status_code=202`**：接受请求（Accepted），但处理尚未完成。客户端拿到 `submission_id` 后轮询结果。

**`Form` + `UploadFile`**：文件上传的标准 FastAPI 模式。`exam_id` 通过表单字段传入，`file` 通过文件上传字段传入。

### 3.2 文件格式检查（第 42~46 行）

```python
if not (file.filename or "").endswith(".docx"):
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="仅支持 .docx 格式",
    )
```

### 3.3 保存临时文件（第 52~55 行）

```python
submission_id = str(uuid.uuid4())
tmp_path = os.path.join(tempfile.gettempdir(), f"{submission_id}.docx")

content = await file.read()
with open(tmp_path, "wb") as f:
    f.write(content)
```

**`tempfile.gettempdir()`**：操作系统的临时目录。Windows 是 `C:\Users\xxx\AppData\Local\Temp`，Linux 是 `/tmp`。

### 3.4 验证试卷 ID（第 57~73 行）

```python
async with AsyncSessionLocal() as session:
    exam_row = (await session.execute(
        text("SELECT id FROM exams WHERE id = :exam_id AND tenant_id = :tenant_id"),
        {"exam_id": exam_id, "tenant_id": current_user["tenant_id"]},
    )).fetchone()

if not exam_row:
    if os.path.exists(tmp_path):
        os.remove(tmp_path)
    raise HTTPException(...)
```

**先验证再提交**：如果 `exam_id` 不存在，删除临时文件并返回 400，不写入任何 DB 记录。

### 3.5 重复提交检查（第 75~97 行）

```python
existing_id: str | None = None
async with AsyncSessionLocal() as session:
    row = (await session.execute(
        text("""
            SELECT id, status FROM exam_submissions
            WHERE exam_id = :exam_id AND student_id = :student_id
        """),
        {"exam_id": exam_id, "student_id": student_id},
    )).fetchone()

if row:
    _existing_id, _existing_status = str(row[0]), row[1]
    if _existing_status in ("pending_review", "reviewed", "published"):
        raise HTTPException(status_code=409, detail="...")
    existing_id = _existing_id
```

| 已有状态 | 处理 |
|:---------|:-----|
| `pending_review` / `reviewed` / `published` | 拒绝提交（409 Conflict） |
| `ai_processing` / `submitted` | 删除旧记录，允许重提 |

### 3.6 写入提交记录（第 99~120 行）

```python
async with AsyncSessionLocal() as session:
    async with session.begin():
        if existing_id:
            await session.execute(
                text("DELETE FROM exam_submissions WHERE id = :id"),
                {"id": existing_id},
            )
        await session.execute(
            text("""
                INSERT INTO exam_submissions
                    (id, tenant_id, exam_id, student_id, status, submitted_at)
                VALUES
                    (:id, :tenant_id, :exam_id, :student_id, 'ai_processing', NOW())
            """),
            {...},
        )
```

**`async with session.begin()`**：事务包裹。`DELETE` + `INSERT` 在同一个事务中，要么全部成功，要么全部回滚。

### 3.7 初始 State（第 124~145 行）

```python
initial_state = {
    "messages":           [],
    "student_id":         current_user["user_id"],
    "tenant_id":          current_user["tenant_id"],
    "session_id":         submission_id,
    "exam_id":            exam_id,
    "submission_id":      submission_id,
    "word_file_path":     tmp_path,
    "parsed_questions":   [],
    "objective_results":  [],
    "subjective_results": [],
    "code_results":       [],
    "pre_review_summary": {},
    "weak_points":        [],
    "weak_points_summary": "",
    "teacher_decision":   None,
    "final_results":      [],
    "structured_output":  None,
    "fallback_used":      False,
    "teacher_notified":   False,
    "published":          False,
}
```

**所有字段都初始化**：即使不需要的字段也设为默认值，避免 LangGraph 运行时因缺少字段而报错。

### 3.8 后台任务 + done callback（第 147~196 行）

```python
def _on_task_done(t: asyncio.Task):
    _background_tasks.discard(t)
    task_failed = not t.cancelled() and t.exception() is not None

    if task_failed:
        ...

    async def _cleanup():
        if task_failed:
            # 批改失败时，把状态回滚为 submitted
            async with AsyncSessionLocal() as db_sess:
                async with db_sess.begin():
                    await db_sess.execute(
                        text("""
                            UPDATE exam_submissions
                            SET status = 'submitted', updated_at = NOW()
                            WHERE id = :sid AND status = 'ai_processing'
                        """),
                        {"sid": submission_id},
                    )
        # 无论成败都清理临时文件
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

    cleanup_task = asyncio.ensure_future(_cleanup())
    _background_tasks.add(cleanup_task)
    cleanup_task.add_done_callback(_background_tasks.discard)

task = asyncio.create_task(_graph.ainvoke(initial_state, config=config))
_background_tasks.add(task)
task.add_done_callback(_on_task_done)
```

**`_on_task_done` 回调**：任务完成时被调用，做两件事：

| 条件 | 操作 |
|:-----|:------|
| 任务失败 | 把 `status` 回滚到 `submitted`，允许学员重新提交 |
| 无论成败 | 删除临时 Word 文件 |

**`task_failed = not t.cancelled() and t.exception() is not None`**：判断任务是否真正失败（排除取消的情况）。

**`asyncio.ensure_future(_cleanup())`**：`_cleanup` 是异步函数，但 `_on_task_done` 是同步回调（asyncio done callback 不能是 async）。所以用 `ensure_future` 把异步函数包装成任务。

---

## 四、学员查询接口（第 216~341 行）

### 4.1 `GET /my-submissions`（第 216~247 行）

```python
@router.get("/my-submissions")
async def list_my_submissions(current_user: dict = Depends(get_current_user)):
```

联表查询 `exam_submissions` + `exams`，返回提交记录列表（含 `exam_title`、`status`、`submitted_at`），最多 20 条，按提交时间倒序。

### 4.2 `GET /my-submissions/{submission_id}`（第 250~341 行）

```python
@router.get("/my-submissions/{submission_id}")
async def get_my_submission(submission_id: str, current_user: dict = Depends(get_current_user)):
```

**状态分叉**：

| 状态 | 返回内容 |
|:-----|:---------|
| `ai_processing` / `pending_review` | 只返回 `status`，让学员继续轮询 |
| `published` | 从 `exam_reviews` 表读取完整批改结果 |

**已发布时的逻辑**：JOIN `exam_reviews` 和 `questions` 表，逐题组装 `by_question` 列表，同时计算总分和得分率。`ai_raw_result` 中解析出 `point_results` 和 `quality_feedback` 合并展示。

---

## 五、教师接口（第 348~406 行）

### 5.1 `GET /pending-reviews`（第 348~406 行）

```python
@router.get("/pending-reviews")
async def get_pending_reviews(current_user: dict = Depends(get_current_user)):
```

**联表查询**：JOIN `exam_submissions` + `users` + `exams`，筛选 `status='pending_review'`。

**从 MemorySaver 读取预批改结果**：

```python
thread_id = await _get_thread_id(submission_id)
config    = {"configurable": {"thread_id": thread_id}}
snapshot  = await _graph.aget_state(config)
if snapshot and snapshot.values:
    sv         = snapshot.values
    summary    = sv.get("pre_review_summary", {})
    pre_review = {
        "total_score":        summary.get("total_score", 0),
        "full_score":         summary.get("full_score", 0),
        "needs_review_count": summary.get("needs_review_count", 0),
    }
    weak_points = sv.get("weak_points", [])
```

**`_graph.aget_state(config)`**：读取 MemorySaver 中保存的图 State。图在 `teacher_review_node` 处 `interrupt`，State 包含完整的 `pre_review_summary` 和 `weak_points`。

### 5.2 `GET /submissions/{submission_id}/review`（第 413~436 行）

```python
@router.get("/submissions/{submission_id}/review")
async def get_submission_review(submission_id: str, current_user: dict = Depends(get_current_user)):
```

直接读取 MemorySaver 中的 State 快照，返回 `pre_review_summary`、`weak_points`、`weak_points_summary` 给教师展示。

---

## 六、`POST /confirm`：教师确认发布（第 450~501 行）

### 6.1 请求模型

```python
class ConfirmRequest(BaseModel):
    action:        str
    modifications: list[dict] = []
```

| 字段 | 类型 | 说明 |
|:-----|:-----|:------|
| `action` | `str` | `"approve"` 或 `"modify"` |
| `modifications` | `list[dict]` | `modify` 时传，每项含 `question_id`、`new_score`、`comment` |

### 6.2 核心逻辑

```python
@router.post("/submissions/{submission_id}/confirm")
async def confirm_review(submission_id: str, req: ConfirmRequest, current_user: dict = Depends(get_current_user)):

    thread_id = await _get_thread_id(submission_id)
    config    = {"configurable": {"thread_id": thread_id}}

    decision = {
        "action":        req.action,
        "modifications": req.modifications,
        "teacher_id":    current_user["user_id"],
    }

    # Command(resume=decision) 让图从 teacher_review_node 的 interrupt() 处继续
    result = await _graph.ainvoke(Command(resume=decision), config=config)
```

**`Command(resume=decision)`**：LangGraph 的恢复机制。不是从头执行图，而是：

1. 从 MemorySaver 加载 `thread_id` 对应的 State
2. 找到 `interrupt()` 调用的位置（`teacher_review_node`）
3. 让 `interrupt()` 返回 `decision`
4. 继续执行 `teacher_review_node` 后面的代码
5. 沿图边继续：`apply_teacher_decision → publish_results → END`

---

## 七、辅助函数（第 508~522 行）

```python
async def _get_thread_id(submission_id: str) -> str:
    """从 exam_submissions 读 student_id，拼出 MemorySaver 的 thread_id"""
    from backend.core.memory import build_thread_id
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                text("SELECT student_id FROM exam_submissions WHERE id = :sid"),
                {"sid": submission_id},
            )
            row = result.fetchone()
            if row:
                return build_thread_id(str(row[0]), submission_id)
    except Exception as e:
        logger.warning("exam.get_thread_id_failed", submission_id=submission_id, error=str(e))
    return f"student_unknown_session_{submission_id}"
```

**`thread_id` 的构造规则**：`build_thread_id(student_id, submission_id)`。因为 `submission_id` 足以唯一标识一次提交，但加上 `student_id` 可以防止跨学员访问。

---

## 八、`★` 设计亮点总结

### 8.1 模块级图单例

`_graph = build_exam_graph()` 在模块导入时编译一次，之后所有请求共用。省去每次请求编译图的开销（QA Agent 则每次请求都编译，因为图中有条件分支需要新鲜实例）。

### 8.2 `_background_tasks` 防 GC

`asyncio.create_task` 创建的后台任务必须有强引用，否则 Python GC 可能在任务中途回收它。`_background_tasks: set[asyncio.Task]` 持有引用，done callback 中自动移除。

### 8.3 优雅降级：失败回滚

后台任务失败时，`_on_task_done` 回调把 `exam_submissions.status` 回滚到 `submitted`，允许学员重新提交。临时文件无论成败都清理。

### 8.4 `Command(resume=)` 恢复 interrupt

`POST /confirm` 用 `Command(resume=decision)` 恢复中断的图，`teacher_review_node` 的 `interrupt()` 返回教师决策，继续执行后续节点。

### 8.5 MemorySaver 读取暂停状态

`GET /pending-reviews` 和 `GET /submissions/{id}/review` 通过 `_graph.aget_state(config)` 读取 MemorySaver 中的 State，获取 AI 预批改结果，无需额外存储。

### 8.6 状态分叉响应

学员查询接口按 `status` 分叉：未发布时只返回状态让学员轮询，已发布时返回完整批改结果。避免在 `ai_processing` 状态时返回空数据。