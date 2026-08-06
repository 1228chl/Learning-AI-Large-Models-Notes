# 简历 API 层：`resume.py` 深度解析

> 源文件：`backend/api/v1/resume.py`（共 225 行）

## 一、文件定位与三层架构

```
┌─────────────────────────────────────┐
│  resume.py  ← 我们在这里            │ ← API 层（路由、鉴权、请求/响应）
├─────────────────────────────────────┤
│  graph.py → 8 个节点 → nodes.py    │ ← Agent 层（LangGraph 图执行）
├─────────────────────────────────────┤
│  init_db.sql → resume_reviews 表   │ ← 数据层（PostgreSQL JSONB）
└─────────────────────────────────────┘
```

`resume.py` 对外暴露 4 个 REST API，对内衔接 `graph.py` 的图执行引擎，是整个简历审查 Agent 的**门户**。

## 二、全局基础设施

### 2.1 线程本地图实例

```python
import threading
_graph_local = threading.local()

def _get_graph():
    """获取线程本地的图实例（当前线程没有就编译一个）。"""
    if not hasattr(_graph_local, "graph"):
        _graph_local.graph = build_resume_graph()
    return _graph_local.graph
```

`threading.local()` 确保每个线程持有独立的图实例，避免并发竞争。`_get_graph()` 写在 `resume.py` 而不是 `graph.py`，因为它是**调用方**的职责，不是图的装配职责。

### 2.2 GC 保护集合

```python
_background_tasks: set[asyncio.Task] = set()
```

Python asyncio 的一个经典陷阱：**未引用的 Task 会被垃圾回收**。`asyncio.create_task` 返回的 Task 对象如果没有变量引用它，Python 的 GC 会在下一轮回收时把它 cancel 掉。模块级集合持有强引用，确保任务存活。

### 2.3 超时阈值

```python
RESUME_REVIEW_TIMEOUT_SECONDS = 15 * 60  # 15 分钟
```

**为什么是 15 分钟而不是 5 分钟？** 整个图执行大约 30-60 秒，但 LLM 调用可能触发重试（2 次）和降级，整个过程可能延长到 2-3 分钟。15 分钟是一个安全边界，防止意外卡死。

---

## 三、辅助函数：`_mark_review_failed`

```python
async def _mark_review_failed(review_id: str, error_msg: str) -> None:
    """把仍处于 processing 的记录标记为 failed（幂等：仅当当前是 processing 才改）。"""
    async with AsyncSessionLocal() as session:
        await session.execute(
            text("""
                UPDATE resume_reviews
                SET status = 'failed', error_msg = :error_msg, updated_at = NOW()
                WHERE id = :review_id AND status = 'processing'
            """),
            {"review_id": review_id, "error_msg": error_msg[:1000]},
        )
        await session.commit()
```

### 3.1 幂等防护

`WHERE status = 'processing'` 是关键的防护条件。考虑这个时序：

```
线程 A：save_results_node 把 status 设为 'done'
线程 B：_on_task_done 回调发现异常，调用 _mark_review_failed
```

如果没有 `WHERE status = 'processing'`，线程 B 会把已经 'done' 的记录覆盖成 'failed'。加上这个条件后，`UPDATE` 影响 0 行，不会覆盖已完成的审查。

### 3.2 截断防护

`error_msg[:1000]` 防止异常信息过长撑爆数据库或日志，截断到 1000 字符。

---

## 四、核心接口：`upload_resume`

```python
@router.post("/upload", status_code=202)  # 202 Accepted：已接受、正在处理
async def upload_resume(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
```

这是整个简历审查 Agent 的**入口**。

### 4.1 为什么用 202 Accepted？

| 模式 | HTTP 状态码 | 适用场景 |
|------|------------|---------|
| 同步等待 | 200 OK | 简单操作，< 1 秒 |
| **异步轮询（本项目）** | **202 Accepted** | **耗时操作，30-60 秒** |
| WebSocket | 101 Switching Protocols | 实时推送，多轮交互 |

简历审查耗时 30-60 秒，客户端不可能一直挂着连接等，所以用 **202 + 轮询**。

### 4.2 三层文件校验

```python
if not file.filename.lower().endswith(".pdf"):       # ① 格式校验
    raise HTTPException(status_code=400, detail="仅支持 PDF 格式")

MAX_PDF_SIZE = 20 * 1024 * 1024                      # 20MB
file_bytes = await file.read()
if len(file_bytes) > MAX_PDF_SIZE:                    # ② 大小校验
    raise HTTPException(status_code=413, detail="文件过大，最大支持 20MB")
if not file_bytes:                                    # ③ 空文件校验
    raise HTTPException(status_code=400, detail="上传文件为空")
```

`await file.read()` 用 async 方式读取，不会阻塞事件循环。

| 校验 | 失败状态码 | 说明 |
|------|-----------|------|
| 格式 | 400 Bad Request | 仅 `.pdf` |
| 大小 | 413 Payload Too Large | 上限 20MB |
| 空文件 | 400 Bad Request | 内容为空 |

### 4.3 暂存 + 写入初始记录

```python
tmp_path = os.path.join(tempfile.gettempdir(), f"{review_id}_upload.pdf")
with open(tmp_path, "wb") as f:
    f.write(file_bytes)

async with AsyncSessionLocal() as session:
    await session.execute(
        text("""
            INSERT INTO resume_reviews (id, tenant_id, student_id, pdf_minio_path, status)
            VALUES (:id, :tenant_id, :student_id, :pdf_minio_path, 'processing')
        """),
        ...
    )
    await session.commit()
```

两步：把 PDF 写到临时目录，在数据库插入一条 `status = 'processing'` 的记录。

**为什么是 `processing` 而不是 `pending`？** 因为文件已经拿到，处理即将开始。`processing` 的含义是"正在处理中"，`pending` 暗示"还在排队"。

### 4.4 准备初始 State

```python
initial_state = {
    "messages": [], "student_id": student_id, "tenant_id": tenant_id,
    "review_id": review_id, "pdf_minio_path": "", "pdf_local_path": tmp_path,
    "raw_text": "", "page_count": 0, "structured": None,
    "dimension_scores": [], "weighted_score": 0.0, "issues": [],
    "summary": None, "fallback_used": False, "structured_output": None,
}
```

`pdf_minio_path` 是空字符串——当前是本地模式，跳过 MinIO 上传。`pdf_local_path` 指向临时文件路径，会被 `download_pdf_node` 消费。

### 4.5 后台任务启动四步曲

```python
graph = _get_graph()                                   # ① 获取线程安全的图实例
task = asyncio.create_task(graph.ainvoke(initial_state)) # ② 创建后台任务
_background_tasks.add(task)                            # ③ GC 保护
task.add_done_callback(_on_task_done)                  # ④ 注册完成回调
```

### 4.6 完成回调 `_on_task_done`

```python
def _on_task_done(t: asyncio.Task):
    """任务结束回调：移除引用、清理临时文件、失败则标记 failed。"""
    _background_tasks.discard(t)                  # ① 释放引用
    if os.path.exists(tmp_path):                  # ② 清理临时文件（兜底）
        try:
            os.remove(tmp_path)
        except OSError:
            pass
    mark_failed_msg = None
    if t.cancelled():                             # ③ 被取消
        mark_failed_msg = "审查任务被服务重启中断，请重试。"
    else:
        exc = t.exception()                       # ④ 抛异常
        if exc:
            mark_failed_msg = f"审查任务执行失败：{exc}"
    if mark_failed_msg:                           # ⑤ 异步标记 failed
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(_mark_review_failed(review_id, mark_failed_msg))
        except RuntimeError:
            pass                                  # 循环已关闭：下次查询走超时兜底
```

回调涵盖 4 种完成路径：

| 路径 | 触发条件 | 处理方式 |
|------|---------|---------|
| ✅ 正常完成 | 图执行成功，`save_results_node` 写入 'done' | 只清理临时文件 |
| ❌ 被取消 | 服务重启/手动 cancel | 标记 `failed` |
| ❌ 异常 | LLM 调用失败、DB 连接失败 | 标记 `failed` |
| ❌ 循环已关闭 | 回调执行时事件循环已关闭 | 跳过失败标记（下次查询超时兜底） |

`_background_tasks.discard(t)` 用 `discard` 而不是 `remove`——`discard` 在元素不存在时不会抛异常，更安全。

---

## 五、轮询接口：`get_review`

```python
@router.get("/reviews/{review_id}")
async def get_review(review_id: str, current_user: dict = Depends(get_current_user)):
    """查询审查状态/结果。processing / done / failed / 404。"""
```

### 5.1 越权防护

```sql
WHERE id = :review_id AND student_id = :student_id
```

双重条件：既能找到记录，又能**防止越权**——学员只能查自己的审查结果。

### 5.2 超时兜底

```python
if row["status"] == "processing":
    last_ts = row["updated_at"] or row["created_at"]
    if isinstance(last_ts, datetime):
        elapsed = (datetime.now(timezone.utc) - last_ts).total_seconds()
        if elapsed >= RESUME_REVIEW_TIMEOUT_SECONDS:
            timeout_msg = "审查任务超时或被中断，请重新上传后重试。"
            await _mark_review_failed(review_id, timeout_msg)
            return {"review_id": review_id, "status": "failed", "error_msg": timeout_msg}
    return {"review_id": review_id, "status": "processing"}
```

`isinstance(last_ts, datetime)` 检查——防御性编程，防止数据库返回 `None` 导致减法报错。

### 5.3 结果反序列化

```python
def _to_dict(v):
    if v is None:
        return {}
    if isinstance(v, (dict, list)):
        return v
    import json as _json
    return _json.loads(v)
```

**为什么需要 `isinstance(v, (dict, list))` 检查？** 取决于 PostgreSQL 驱动：

- `asyncpg`（默认）：自动把 JSONB 反序列化为 Python `dict`/`list`
- `psycopg2`（某些同步场景）：返回字符串，需要 `json.loads`

这个 `_to_dict` 兼容两种行为，**哪里都跑得通**。

---

## 六、删除接口：`delete_review`

```python
@router.delete("/reviews/{review_id}", status_code=204)
async def delete_review(review_id: str, current_user: dict = Depends(get_current_user)):
    """删除审查记录（WHERE 带 student_id，只能删自己的）。"""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            text("""
                DELETE FROM resume_reviews
                WHERE id = :review_id AND student_id = :student_id
            """),
            ...
        )
        await session.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="记录不存在")
```

`status_code=204 No Content`——删除成功不需要返回 body。`result.rowcount == 0` 判断是否真的删了行，没删到说明记录不存在或不属于自己，返回 404。

---

## 七、列表接口：`list_reviews`

```python
@router.get("/reviews")
async def list_reviews(current_user: dict = Depends(get_current_user)):
    """列出本人历史审查记录（摘要，按时间倒序）。"""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            text("""
                SELECT id, status, created_at,
                       (scores::jsonb ->> 'weighted_score')::float AS weighted_score
                FROM resume_reviews
                WHERE student_id = :student_id
                ORDER BY created_at DESC
                LIMIT 50
            """),
            ...
        )
```

**JSONB 的部分读取**：这里只取 `scores` 列中的 `weighted_score` 字段，用 `(scores::jsonb ->> 'weighted_score')::float` 语法。这正是 `save_results_node` 把 4 个 JSONB 列分开存储的好处——**不需要加载整个 `scores` 对象**，直接提取需要的字段。

`LIMIT 50` 防止历史记录过多导致响应太大。

---

## 八、完整数据流全景

```
客户端                              resume.py                                  图引擎
  │                                    │                                         │
  │  POST /upload (PDF)               │                                         │
  │ ──────────────────────────────────→ │                                         │
  │                                    │ ① 校验文件格式/大小/空                  │
  │                                    │ ② 暂存到临时目录                        │
  │                                    │ ③ INSERT INTO resume_reviews (processing) │
  │                                    │ ④ 准备初始 State                       │
  │                                    │ ⑤ create_task(graph.ainvoke())          │
  │                                    │ ⑥ add_done_callback(_on_task_done)      │
  │  ← {review_id, status: processing} │  ← 立即返回，不等图执行                 │
  │                                    │                                         │
  │                                    │         ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─        │
  │                                    │          后台异步执行                    │
  │                                    │         ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─        │
  │                                    │                                         │
  │  GET /reviews/{id}                 │                                         │
  │ ──────────────────────────────────→ │                                         │
  │  ← {status: "processing"}         │  超时兜底：超过 15 分钟 → failed        │
  │                                    │                                         │
  │  (等待 30-60 秒...)                │       ─ ─ ─ ─ ─ ─ ─ ─ ─ ─             │
  │                                    │         图执行完毕                      │
  │                                    │         ─ ─ ─ ─ ─ ─ ─ ─ ─ ─            │
  │                                    │                                         │
  │  GET /reviews/{id}                 │                                         │
  │ ──────────────────────────────────→ │                                         │
  │  ← {status: "done", scores, ...}   │  JSONB 自动反序列化                     │
  │                                    │                                         │
  │  展示评审结果                      │                                         │
```

---

## 九、`★` 设计亮点总结

### 9.1 202 Accepted + 轮询模式

最合适的异步模式选择——30-60 秒的耗时操作，既不用同步等待（阻塞连接），也不用 WebSocket（过度设计）。客户端只需轮询几次就能拿到结果。

### 9.2 三重容错

```
任务层：_on_task_done 捕获取消/异常 → 标记 failed
超时层：get_review 检测 15 分钟卡住 → 自动标记 failed
清理层：节点内清理 + 回调兜底清理 → 双重保障
```

### 9.3 GC 保护

`_background_tasks` 集合防止 asyncio Task 被垃圾回收——一个容易被忽视但线上必现的坑。

### 9.4 幂等防护

`_mark_review_failed` 的 `WHERE status = 'processing'` 确保不会覆盖已完成的审查。

### 9.5 越权防护

所有查询都带 `AND student_id = :student_id`，学员只能看到自己的数据。即使是列表查询也经过 `WHERE student_id = :student_id` 过滤。

### 9.6 JSONB 部分读取

`list_reviews` 用 `(scores::jsonb ->> 'weighted_score')::float` 只提取一个字段，不需要加载整个 JSONB 对象。

### 9.7 四种状态码

| 端点 | 状态码 | 含义 |
|------|--------|------|
| `POST /upload` | 202 Accepted | 已接受，异步处理中 |
| `GET /reviews/{id}` | 200 OK | 查询成功（含 processing/done/failed） |
| `DELETE /reviews/{id}` | 204 No Content | 删除成功，无 body |
| 各种错误 | 400 / 404 / 413 | 格式错误/不存在/文件过大 |