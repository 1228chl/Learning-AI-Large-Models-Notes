# 简历 API 层：`resume.py` 深度解析

> 源文件：`backend/api/v1/resume.py`（共 228 行）

---

## 全文行号速查表

| 行号 | 内容 | 说明 |
|------|------|------|
| 1~2 | 模块 docstring + 路径注释 | 文件标识 |
| 4~7 | `import asyncio / os / uuid / datetime` | 标准库导入 |
| 9~14 | `from fastapi / sqlalchemy / backend...` | 框架与内部依赖导入 |
| 16~17 | `router = APIRouter()` + logger | 路由与日志 |
| 19~21 | `import threading` + `_graph_local = threading.local()` | 线程本地图实例 |
| 23~27 | `def _get_graph()` | 懒加载获取线程本地图 |
| 29~30 | `_background_tasks: set[asyncio.Task] = set()` | GC 保护集合（防 Task 被回收） |
| 31 | `RESUME_REVIEW_TIMEOUT_SECONDS = 15 * 60` | 审查超时阈值：15 分钟 |
| 34~45 | `async def _mark_review_failed()` | 幂等标记审查失败 |
| 48~131 | `async def upload_resume()` | POST /upload 主入口 |
| 48 | `@router.post("/upload", status_code=202)` | 202 Accepted 异步模式 |
| 54~55 | `if not ...endswith(".pdf")` | 文件格式校验 |
| 57~59 | `review_id / student_id / tenant_id` | 生成 ID + 取用户身份 |
| 62~67 | `MAX_PDF_SIZE` + 大小/空文件校验 | 三层文件校验 |
| 70~74 | `import tempfile` + 暂存临时目录 | 保存 PDF 到临时路径 |
| 77~86 | INSERT INTO resume_reviews | 写入初始记录（processing） |
| 89~95 | `initial_state = { ... }` | 准备初始 State |
| 97~120 | `def _on_task_done()` | 后台任务完成回调 |
| 122~125 | `create_task(graph.ainvoke())` | 启动后台任务 + GC 保护 + 回调 |
| 128~131 | `return {...}` | 立即返回（不等图执行） |
| 134~185 | `async def get_review()` | GET /reviews/{id} 轮询 |
| 138~146 | SELECT 查询 + `fetchone()` | 查询 DB，带越权过滤 |
| 148~149 | `if not row` → 404 | 记录不存在或越权 |
| 151~163 | processing 状态 + 超时兜底 | 超时自动标记 failed |
| 165~167 | failed 状态 | 返回错误信息 |
| 169~185 | done 状态 + JSONB 反序列化 | 返回评审结果 |
| 188~201 | `async def delete_review()` | DELETE /reviews/{id} |
| 192~199 | DELETE 带 student_id 过滤 | 只能删自己的 |
| 200~201 | `rowcount == 0` → 404 | 删除失败判定 |
| 204~227 | `async def list_reviews()` | GET /reviews 列表 |
| 208~219 | SQL 查询，JSONB 提取 weighted_score | LIMIT 50 倒序 |
| 221~227 | 组装返回 items + total | 返回摘要列表 |

---

## 一、函数签名

### 1.1 辅助函数 `_mark_review_failed`（第 34~45 行）

```python
# resume.py 第 34~45 行
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

- **输入**：`review_id`（审查记录 ID）、`error_msg`（失败原因）
- **输出**：`None`（只写 DB，不返回）
- **定位**：被 `_on_task_done` 和 `get_review` 超时兜底调用

### 1.2 上传接口 `upload_resume`（第 48~131 行）

```python
# resume.py 第 48~52 行
@router.post("/upload", status_code=202)         # 202 Accepted：已接受、正在处理
async def upload_resume(
    file: UploadFile = File(...),                # 上传的文件
    current_user: dict = Depends(get_current_user),   # 鉴权：拿到当前用户
):
    """上传 PDF 简历，触发异步审查，立即返回 review_id。"""
```

- **输入**：`UploadFile`（PDF 文件）、`current_user`（鉴权后的用户）
- **输出**：`{review_id, status: "processing", message}`（202 立即返回）
- **定位**：整个简历审查 Agent 的**入口**

### 1.3 轮询接口 `get_review`（第 134~185 行）

```python
# resume.py 第 134~136 行
@router.get("/reviews/{review_id}")
async def get_review(review_id: str, current_user: dict = Depends(get_current_user)):
    """查询审查状态/结果。processing / done / failed / 404。"""
```

- **输入**：`review_id`、`current_user`
- **输出**：processing / done / failed / 404 四种结果
- **定位**：客户端轮询审查状态的核心接口

### 1.4 删除接口 `delete_review`（第 188~201 行）

```python
# resume.py 第 188~189 行
@router.delete("/reviews/{review_id}", status_code=204)
async def delete_review(review_id: str, current_user: dict = Depends(get_current_user)):
```

- **输入**：`review_id`、`current_user`
- **输出**：204 No Content（成功）或 404（不存在/越权）
- **定位**：删除本人的审查记录

### 1.5 列表接口 `list_reviews`（第 204~227 行）

```python
# resume.py 第 204~206 行
@router.get("/reviews")
async def list_reviews(current_user: dict = Depends(get_current_user)):
    """列出本人历史审查记录（摘要，按时间倒序）。"""
```

- **输入**：`current_user`
- **输出**：`{items: [...], total: n}` 摘要列表
- **定位**：历史记录展示

---

## 二、动机

`resume.py` 对外暴露 4 个 REST API，对内衔接 `graph.py` 的图执行引擎，是整个简历审查 Agent 的**门户**。它解决三个核心问题：

1. **异步化**：审查耗时 30-60 秒，不能同步等待，需 202 + 轮询
2. **持久化**：把审查进度和结果写入 PostgreSQL，供轮询查询
3. **可靠性**：处理超时、取消、异常、越权等边界情况

---

## 三、逐行精读

### 3.1 全局基础设施（第 19~31 行）

```python
# resume.py 第 19~31 行
# ── 线程本地图：每个线程一份独立的图实例，避免并发竞争 ──
import threading
_graph_local = threading.local()

def _get_graph():
    """获取线程本地的图实例（当前线程没有就编译一个）。"""
    if not hasattr(_graph_local, "graph"):
        _graph_local.graph = build_resume_graph()
    return _graph_local.graph

# ── GC 保护：模块级集合持有后台任务的强引用，防止被垃圾回收 ──
_background_tasks: set[asyncio.Task] = set()
RESUME_REVIEW_TIMEOUT_SECONDS = 15 * 60          # 审查超时阈值：15 分钟
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 19 | `# ── 线程本地图：...` | 注释，说明线程隔离目的 |
| 20 | `import threading` | 延迟导入 threading |
| 21 | `_graph_local = threading.local()` | 每个线程持有独立的图实例 |
| 23 | `def _get_graph():` | 懒加载工厂函数 |
| 24 | docstring | 说明"当前线程没有就编译一个" |
| 25 | `if not hasattr(_graph_local, "graph"):` | 检测当前线程是否已有实例 |
| 26 | `_graph_local.graph = build_resume_graph()` | 首次调用时编译并缓存 |
| 27 | `return _graph_local.graph` | 返回缓存实例 |
| 29 | `# ── GC 保护：...` | 注释，说明防回收目的 |
| 30 | `_background_tasks: set[asyncio.Task] = set()` | 模块级集合持有强引用 |
| 31 | `RESUME_REVIEW_TIMEOUT_SECONDS = 15 * 60` | 15 分钟超时阈值 |

**Python asyncio 经典陷阱**：`asyncio.create_task` 返回的 Task 对象如果没有变量引用它，Python 的 GC 会在下一轮回收时把它 cancel 掉。模块级集合持有强引用，确保任务存活。

**为什么是 15 分钟而不是 5 分钟？** 整个图执行大约 30-60 秒，但 LLM 调用可能触发重试（2 次）和降级，整个过程可能延长到 2-3 分钟。15 分钟是一个安全边界，防止意外卡死。

### 3.2 辅助函数 `_mark_review_failed`（第 34~45 行）

```python
# resume.py 第 34~45 行
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

| 行号 | 代码 | 说明 |
|------|------|------|
| 34 | `async def _mark_review_failed(review_id, error_msg) -> None:` | 签名，返回 None |
| 35 | docstring | 强调幂等：仅当当前是 processing 才改 |
| 36 | `async with AsyncSessionLocal() as session:` | 打开异步会话 |
| 37~42 | `await session.execute(text(...), {...})` | 执行 UPDATE 语句 |
| 38~41 | SQL | `WHERE id AND status='processing'` 幂等条件 |
| 43 | param | `error_msg[:1000]` 截断防护 |
| 44 | `await session.commit()` | 提交事务 |

**幂等防护**：`WHERE status = 'processing'` 是关键的防护条件。考虑这个时序：

```
线程 A：save_results_node 把 status 设为 'done'
线程 B：_on_task_done 回调发现异常，调用 _mark_review_failed
```

如果没有 `WHERE status = 'processing'`，线程 B 会把已经 'done' 的记录覆盖成 'failed'。加上这个条件后，`UPDATE` 影响 0 行，不会覆盖已完成的审查。

**截断防护**：`error_msg[:1000]` 防止异常信息过长撑爆数据库或日志，截断到 1000 字符。

### 3.3 上传接口 `upload_resume`（第 48~131 行）

#### 3.3.1 文件格式校验（第 54~55 行）

```python
# resume.py 第 54~55 行
if not file.filename.lower().endswith(".pdf"):       # 只收 PDF
    raise HTTPException(status_code=400, detail="仅支持 PDF 格式")
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 54 | `if not file.filename.lower().endswith(".pdf"):` | ① 格式校验：仅 `.pdf` |
| 55 | `raise HTTPException(status_code=400, ...)` | 失败返回 400 Bad Request |

#### 3.3.2 大小与空文件校验（第 57~67 行）

```python
# resume.py 第 57~67 行
review_id  = str(uuid.uuid4())
student_id = current_user["user_id"]
tenant_id  = current_user["tenant_id"]

# 1. 读取并校验文件（用 await 读，避免阻塞事件循环）
MAX_PDF_SIZE = 20 * 1024 * 1024              # 20MB 上限
file_bytes = await file.read()
if len(file_bytes) > MAX_PDF_SIZE:
    raise HTTPException(status_code=413, detail="文件过大，最大支持 20MB")
if not file_bytes:
    raise HTTPException(status_code=400, detail="上传文件为空")
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 57 | `review_id = str(uuid.uuid4())` | 生成唯一审查 ID |
| 58 | `student_id = current_user["user_id"]` | 从鉴权信息取学员 ID |
| 59 | `tenant_id = current_user["tenant_id"]` | 多租户隔离 |
| 61 | `# 1. 读取并校验文件...` | 注释，标记校验阶段 |
| 62 | `MAX_PDF_SIZE = 20 * 1024 * 1024` | 20MB 上限常量 |
| 63 | `file_bytes = await file.read()` | 用 await 读，不阻塞事件循环 |
| 64 | `if len(file_bytes) > MAX_PDF_SIZE:` | ② 大小校验 |
| 65 | `raise HTTPException(status_code=413, ...)` | 413 Payload Too Large |
| 66 | `if not file_bytes:` | ③ 空文件校验 |
| 67 | `raise HTTPException(status_code=400, ...)` | 400 Bad Request |

**三层文件校验小结**：

| 校验 | 失败状态码 | 说明 |
|------|-----------|------|
| 格式 | 400 Bad Request | 仅 `.pdf` |
| 大小 | 413 Payload Too Large | 上限 20MB |
| 空文件 | 400 Bad Request | 内容为空 |

#### 3.3.3 暂存到临时目录（第 70~74 行）

```python
# resume.py 第 70~74 行
# 暂存到临时目录
import tempfile
tmp_path = os.path.join(tempfile.gettempdir(), f"{review_id}_upload.pdf")
with open(tmp_path, "wb") as f:
    f.write(file_bytes)
logger.info("upload_resume.file_saved", review_id=review_id, tmp_path=tmp_path)
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 70 | `# 暂存到临时目录` | 注释，标记暂存阶段 |
| 71 | `import tempfile` | 延迟导入 tempfile |
| 72 | `tmp_path = os.path.join(tempfile.gettempdir(), f"{review_id}_upload.pdf")` | 用 review_id 命名，避免冲突 |
| 73~74 | `with open(tmp_path, "wb") as f: f.write(file_bytes)` | 写入临时目录 |
| 75 | `logger.info(...)` | 记录文件保存日志 |

#### 3.3.4 写入 DB 初始记录（第 77~86 行）

```python
# resume.py 第 77~86 行
# 2. 写入 resume_reviews 初始记录（status=processing）
async with AsyncSessionLocal() as session:
    await session.execute(
        text("""
            INSERT INTO resume_reviews (id, tenant_id, student_id, pdf_minio_path, status)
            VALUES (:id, :tenant_id, :student_id, :pdf_minio_path, 'processing')
        """),
        {"id": review_id, "tenant_id": tenant_id, "student_id": student_id,
         "pdf_minio_path": f"resumes/{student_id}/{review_id}.pdf"},
    )
    await session.commit()
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 77 | `# 2. 写入...初始记录（status=processing）` | 注释，标记 DB 写入阶段 |
| 78 | `await session.execute(text(...), {...})` | 执行 INSERT |
| 79~82 | SQL | 插入初始记录，status='processing' |
| 83~84 | param | id / tenant_id / student_id / pdf_minio_path |
| 86 | `await session.commit()` | 提交事务 |

**为什么是 `processing` 而不是 `pending`？** 因为文件已经拿到，处理即将开始。`processing` 的含义是"正在处理中"，`pending` 暗示"还在排队"。

#### 3.3.5 准备初始 State（第 89~95 行）

```python
# resume.py 第 89~95 行
# 3. 准备初始 State，后台启动图执行
initial_state = {
    "messages": [], "student_id": student_id, "tenant_id": tenant_id,
    "review_id": review_id, "pdf_minio_path": "", "pdf_local_path": tmp_path,
    "raw_text": "", "page_count": 0, "structured": None,
    "dimension_scores": [], "weighted_score": 0.0, "issues": [],
    "summary": None, "fallback_used": False, "structured_output": None,
}
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 90 | `"messages": []` | 消息列表（当前未用） |
| 90 | `"student_id" / "tenant_id"` | 身份信息 |
| 91 | `"review_id"` | 审查 ID |
| 91 | `"pdf_minio_path": ""` | 空字符串——本地模式跳过 MinIO |
| 91 | `"pdf_local_path": tmp_path` | 指向临时文件，被 download 节点消费 |
| 92 | `"raw_text" / "page_count"` | 文本提取结果（初始空/0） |
| 93 | `"dimension_scores" / "weighted_score"` | 评分结果（初始空/0.0） |
| 94 | `"summary" / "fallback_used" / "structured_output"` | 评价/降级标记/快照 |

`pdf_minio_path` 是空字符串——当前是本地模式，跳过 MinIO 上传。`pdf_local_path` 指向临时文件路径，会被 `download_pdf_node` 消费。

#### 3.3.6 完成回调 `_on_task_done`（第 97~120 行）

```python
# resume.py 第 97~120 行
def _on_task_done(t: asyncio.Task):
    """任务结束回调：移除引用、清理临时文件、失败则标记 failed。"""
    _background_tasks.discard(t)                  # 从集合移除（释放强引用）
    if os.path.exists(tmp_path):                  # 清理临时 PDF
        try:
            os.remove(tmp_path)
        except OSError:
            pass
    mark_failed_msg = None
    if t.cancelled():                             # 任务被取消（如服务重启）
        mark_failed_msg = "审查任务被服务重启中断，请重试。"
        logger.warning("resume.background_task_cancelled", review_id=review_id)
    else:
        exc = t.exception()                       # 任务抛了异常
        if exc:
            mark_failed_msg = f"审查任务执行失败：{exc}"
            logger.error("resume.background_task_failed", review_id=review_id,
                         error=str(exc), exc_info=exc)
    if mark_failed_msg:                           # 异步把记录标记为 failed
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(_mark_review_failed(review_id, mark_failed_msg))
        except RuntimeError:
            pass                                  # 循环已关闭：下次查询走超时兜底
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 97 | `def _on_task_done(t: asyncio.Task):` | 回调签名，接收 Task |
| 98 | docstring | 说明三件事：移除引用、清理、标记 failed |
| 99 | `_background_tasks.discard(t)` | ① 释放强引用（discard 比 remove 安全） |
| 100~104 | `if os.path.exists(tmp_path): try remove` | ② 清理临时 PDF（兜底） |
| 105 | `mark_failed_msg = None` | 初始化失败标记 |
| 106~108 | `if t.cancelled(): mark_failed_msg = ...` | ③ 任务被取消（服务重启） |
| 109~114 | `else: exc = t.exception(); if exc:` | ④ 任务抛异常 |
| 115~120 | `if mark_failed_msg: loop.create_task(...)` | ⑤ 异步标记 failed |
| 119~120 | `except RuntimeError: pass` | 循环已关闭：下次查询超时兜底 |

回调涵盖 4 种完成路径：

| 路径 | 触发条件 | 处理方式 |
|------|---------|---------|
| ✅ 正常完成 | 图执行成功，`save_results_node` 写入 'done' | 只清理临时文件 |
| ❌ 被取消 | 服务重启/手动 cancel | 标记 `failed` |
| ❌ 异常 | LLM 调用失败、DB 连接失败 | 标记 `failed` |
| ❌ 循环已关闭 | 回调执行时事件循环已关闭 | 跳过失败标记（下次查询超时兜底） |

`_background_tasks.discard(t)` 用 `discard` 而不是 `remove`——`discard` 在元素不存在时不会抛异常，更安全。

#### 3.3.7 启动后台任务（第 122~125 行）

```python
# resume.py 第 122~125 行
graph = _get_graph()                              # 拿线程本地图
task = asyncio.create_task(graph.ainvoke(initial_state))   # 后台执行
_background_tasks.add(task)                       # GC 保护：持有强引用
task.add_done_callback(_on_task_done)             # 注册完成回调
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 122 | `graph = _get_graph()` | ① 获取线程安全的图实例 |
| 123 | `task = asyncio.create_task(graph.ainvoke(initial_state))` | ② 创建后台任务 |
| 124 | `_background_tasks.add(task)` | ③ GC 保护：持有强引用 |
| 125 | `task.add_done_callback(_on_task_done)` | ④ 注册完成回调 |

#### 3.3.8 立即返回（第 128~131 行）

```python
# resume.py 第 128~131 行
return {                                          # 立即返回（不等审查完成）
    "review_id": review_id, "status": "processing",
    "message": "简历已上传，正在审查中，预计 30-60 秒完成。",
}
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 128 | `return {` | 立即返回，不等图执行 |
| 129 | `"review_id" / "status": "processing"` | 客户端凭 review_id 轮询 |
| 130 | `"message": "预计 30-60 秒完成"` | 用户体验提示 |

### 3.4 轮询接口 `get_review`（第 134~185 行）

```python
# resume.py 第 134~146 行
@router.get("/reviews/{review_id}")
async def get_review(review_id: str, current_user: dict = Depends(get_current_user)):
    """查询审查状态/结果。processing / done / failed / 404。"""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            text("""
                SELECT id, status, scores, issues, summary, error_msg, created_at, updated_at
                FROM resume_reviews
                WHERE id = :review_id AND student_id = :student_id
            """),
            {"review_id": review_id, "student_id": current_user["user_id"]},
        )
        row = result.mappings().fetchone()
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 134 | `@router.get("/reviews/{review_id}")` | 轮询路由 |
| 135 | `async def get_review(review_id, current_user):` | 签名 |
| 137 | `async with AsyncSessionLocal() as session:` | 打开异步会话 |
| 138~145 | `await session.execute(text(...), {...})` | 执行 SELECT |
| 139~143 | SQL | `WHERE id AND student_id` 越权防护 |
| 146 | `row = result.mappings().fetchone()` | 取一行 |

**越权防护**：`WHERE id = :review_id AND student_id = :student_id` 双重条件：既能找到记录，又能**防止越权**——学员只能查自己的审查结果。

```python
# resume.py 第 148~149 行
if not row:                                       # 不存在或不属于自己
    raise HTTPException(status_code=404, detail="审查记录不存在")
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 148 | `if not row:` | 记录不存在或越权 |
| 149 | `raise HTTPException(status_code=404, ...)` | 404 不泄露是否存在 |

```python
# resume.py 第 151~163 行
if row["status"] == "processing":
    # 超时兜底：防止后台任务中断后长期卡 processing
    last_ts = row["updated_at"] or row["created_at"]
    if isinstance(last_ts, datetime):
        # 统一转为 aware datetime：数据库返回的 naive datetime 直接加上 UTC 时区
        if last_ts.tzinfo is None:
            last_ts = last_ts.replace(tzinfo=timezone.utc)
        elapsed = (datetime.now(timezone.utc) - last_ts).total_seconds()
        if elapsed >= RESUME_REVIEW_TIMEOUT_SECONDS:
            timeout_msg = "审查任务超时或被中断，请重新上传后重试。"
            await _mark_review_failed(review_id, timeout_msg)
            return {"review_id": review_id, "status": "failed", "error_msg": timeout_msg}
    return {"review_id": review_id, "status": "processing"}
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 151 | `if row["status"] == "processing":` | 仍在处理中 |
| 153 | `last_ts = row["updated_at"] or row["created_at"]` | 取最近时间戳 |
| 154 | `if isinstance(last_ts, datetime):` | 防御：防止 None 导致减法报错 |
| 156~157 | `if last_ts.tzinfo is None: last_ts.replace(tzinfo=utc)` | naive → aware 统一时区 |
| 158 | `elapsed = (now - last_ts).total_seconds()` | 计算已耗时 |
| 159 | `if elapsed >= RESUME_REVIEW_TIMEOUT_SECONDS:` | 超时阈值判定 |
| 160~162 | `await _mark_review_failed(...)` + 返回 failed | 超时兜底 |
| 163 | `return {...status: "processing"}` | 未超时，继续 processing |

`isinstance(last_ts, datetime)` 检查——防御性编程，防止数据库返回 `None` 导致减法报错。

```python
# resume.py 第 165~167 行
if row["status"] == "failed":
    return {"review_id": review_id, "status": "failed",
            "error_msg": row.get("error_msg") or "审查任务失败，请重新上传。"}
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 165 | `if row["status"] == "failed":` | 失败状态 |
| 166~167 | `return {...status: "failed"}` | 返回错误信息（空则给默认文案） |

```python
# resume.py 第 169~185 行
# status == done：JSONB 列已被 asyncpg 自动反序列化为 dict/list，无需 json.loads
def _to_dict(v):
    if v is None:
        return {}
    if isinstance(v, (dict, list)):
        return v
    import json as _json
    return _json.loads(v)

scores_data = _to_dict(row["scores"])
return {
    "review_id": review_id, "status": "done",
    "weighted_score": scores_data.get("weighted_score", 0),
    "dimension_scores": scores_data.get("dimension_scores", []),
    "issues": _to_dict(row["issues"]) if not isinstance(row["issues"], list) else row["issues"],
    "summary": _to_dict(row["summary"]),
}
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 169 | `# status == done：...` | 注释，说明驱动差异 |
| 170 | `def _to_dict(v):` | 兼容 asyncpg / psycopg2 两种驱动 |
| 171~172 | `if v is None: return {}` | None → 空字典 |
| 173~174 | `if isinstance(v, (dict, list)): return v` | 已反序列化则直接用 |
| 175~176 | `import json as _json; return _json.loads(v)` | 字符串则 json.loads |
| 178 | `scores_data = _to_dict(row["scores"])` | 反序列化 scores |
| 180 | `"status": "done"` | 完成状态 |
| 181 | `weighted_score = scores_data.get("weighted_score", 0)` | 加权总分 |
| 182 | `dimension_scores = scores_data.get("dimension_scores", [])` | 六维评分 |
| 183 | `issues = _to_dict(row["issues"])` | 问题列表 |
| 184 | `summary = _to_dict(row["summary"])` | 综合评价 |

**为什么需要 `isinstance(v, (dict, list))` 检查？** 取决于 PostgreSQL 驱动：

- `asyncpg`（默认）：自动把 JSONB 反序列化为 Python `dict`/`list`
- `psycopg2`（某些同步场景）：返回字符串，需要 `json.loads`

这个 `_to_dict` 兼容两种行为，**哪里都跑得通**。

### 3.5 删除接口 `delete_review`（第 188~201 行）

```python
# resume.py 第 188~201 行
@router.delete("/reviews/{review_id}", status_code=204)
async def delete_review(review_id: str, current_user: dict = Depends(get_current_user)):
    """删除审查记录（WHERE 带 student_id，只能删自己的）。"""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            text("""
                DELETE FROM resume_reviews
                WHERE id = :review_id AND student_id = :student_id
            """),
            {"review_id": review_id, "student_id": current_user["user_id"]},
        )
        await session.commit()
    if result.rowcount == 0:                          # 没删到任何行 = 不存在/无权限
        raise HTTPException(status_code=404, detail="记录不存在")
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 188 | `@router.delete(...)` | DELETE 路由，204 No Content |
| 189 | `async def delete_review(...)` | 签名 |
| 191 | `async with AsyncSessionLocal() as session:` | 打开异步会话 |
| 192~198 | `await session.execute(text(...), {...})` | 执行 DELETE |
| 193~196 | SQL | `WHERE id AND student_id` 越权防护 |
| 199 | `await session.commit()` | 提交事务 |
| 200 | `if result.rowcount == 0:` | 没删到任何行 |
| 201 | `raise HTTPException(status_code=404, ...)` | 记录不存在或无权限 |

`status_code=204 No Content`——删除成功不需要返回 body。`result.rowcount == 0` 判断是否真的删了行，没删到说明记录不存在或不属于自己，返回 404。

### 3.6 列表接口 `list_reviews`（第 204~227 行）

```python
# resume.py 第 204~219 行
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
            {"student_id": current_user["user_id"]},
        )
        rows = result.mappings().all()
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 204 | `@router.get("/reviews")` | 列表路由 |
| 205 | `async def list_reviews(current_user)` | 签名 |
| 208~218 | `await session.execute(text(...), {...})` | 执行 SELECT |
| 209~216 | SQL | 摘要列 + JSONB 提取 |
| 211 | `(scores::jsonb ->> 'weighted_score')::float` | JSONB 部分读取 |
| 213 | `WHERE student_id = :student_id` | 越权防护 |
| 214 | `ORDER BY created_at DESC` | 时间倒序 |
| 215 | `LIMIT 50` | 防历史过多 |
| 219 | `rows = result.mappings().all()` | 取全部行 |

**JSONB 的部分读取**：这里只取 `scores` 列中的 `weighted_score` 字段，用 `(scores::jsonb ->> 'weighted_score')::float` 语法。这正是 `save_results_node` 把 4 个 JSONB 列分开存储的好处——**不需要加载整个 `scores` 对象**，直接提取需要的字段。

```python
# resume.py 第 221~227 行
items = [
    {"review_id": row["id"], "status": row["status"],
     "created_at": row["created_at"].isoformat() if row["created_at"] else None,
     "weighted_score": row["weighted_score"]}
    for row in rows
]
return {"items": items, "total": len(items)}
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 221~226 | `items = [...]` | 组装摘要列表 |
| 222 | `{"review_id", "status"}` | 记录 ID + 状态 |
| 223 | `created_at.isoformat()` | 时间转 ISO 字符串 |
| 224 | `weighted_score` | 加权总分 |
| 227 | `return {"items": items, "total": len(items)}` | 返回列表 + 总数 |

---

## 四、依赖关系

```
resume.py
  ├── build_resume_graph()          ← backend.agents.resume.graph
  ├── ResumeState (经 graph)         ← backend.agents.resume.state
  ├── AsyncSessionLocal             ← backend.dependencies
  ├── get_current_user              ← backend.dependencies
  └── get_logger                    ← backend.core.logger
```

---

## 五、完整数据流全景

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

## ★ Insight ─── 设计亮点

### 1. 202 Accepted + 轮询模式

最合适的异步模式选择——30-60 秒的耗时操作，既不用同步等待（阻塞连接），也不用 WebSocket（过度设计）。客户端只需轮询几次就能拿到结果。

```python
# resume.py 第 48 行 —— 202 语义：已接受，正在处理
@router.post("/upload", status_code=202)
```

### 2. 三重容错

```
任务层：_on_task_done 捕获取消/异常 → 标记 failed
超时层：get_review 检测 15 分钟卡住 → 自动标记 failed
清理层：节点内清理 + 回调兜底清理 → 双重保障
```

```python
# resume.py 第 106~120 行 —— 被取消 / 抛异常 / 循环关闭 三种路径
if t.cancelled():
    mark_failed_msg = "审查任务被服务重启中断，请重试。"
else:
    exc = t.exception()
    if exc:
        mark_failed_msg = f"审查任务执行失败：{exc}"
```

### 3. GC 保护

`_background_tasks` 集合防止 asyncio Task 被垃圾回收——一个容易被忽视但线上必现的坑。

```python
# resume.py 第 30 行 —— 模块级集合持有强引用
_background_tasks: set[asyncio.Task] = set()
```

### 4. 幂等防护

`_mark_review_failed` 的 `WHERE status = 'processing'` 确保不会覆盖已完成的审查。

```python
# resume.py 第 41 行 —— 幂等条件
WHERE id = :review_id AND status = 'processing'
```

### 5. 越权防护

所有查询都带 `AND student_id = :student_id`，学员只能看到自己的数据。即使是列表查询也经过 `WHERE student_id = :student_id` 过滤。

```python
# resume.py 第 142 行 / 第 195 行 / 第 213 行 —— 三处越权过滤
WHERE id = :review_id AND student_id = :student_id
```

### 6. JSONB 部分读取

`list_reviews` 用 `(scores::jsonb ->> 'weighted_score')::float` 只提取一个字段，不需要加载整个 JSONB 对象。

```python
# resume.py 第 211 行 —— JSONB 提取单个字段
(scores::jsonb ->> 'weighted_score')::float AS weighted_score
```

### 7. 四种状态码

| 端点 | 状态码 | 含义 |
|------|--------|------|
| `POST /upload` | 202 Accepted | 已接受，异步处理中 |
| `GET /reviews/{id}` | 200 OK | 查询成功（含 processing/done/failed） |
| `DELETE /reviews/{id}` | 204 No Content | 删除成功，无 body |
| 各种错误 | 400 / 404 / 413 | 格式错误/不存在/文件过大 |