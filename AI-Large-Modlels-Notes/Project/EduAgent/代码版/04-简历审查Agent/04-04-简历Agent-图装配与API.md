# 简历审查 Agent：图装配与 API — 从零理解

> 对应源码：`backend/agents/resume/graph.py`（47 行）+ `backend/api/v1/resume.py`（228 行）
> 本文按模板规范，为每个函数/接口提供精确行号、逐行精读与设计亮点。

---

## 一、LangGraph 图基础

LangGraph 把 Agent 工作流建模成一个**有向图**：

```
节点（Node）= 一个处理步骤（如 extract_text）
边（Edge）  = 节点之间的依赖关系
State       = 贯穿全图的"工单"
```

简历审查 Agent 的图是最简单的形式——**直线流水线**，没有分支、没有条件边、没有 `interrupt`，也没有 `checkpointer`。

---

## 〇、全文行号速查表

### graph.py（47 行）

| 行号范围 | 函数/符号 | 作用 |
|---------|----------|------|
| 1~17 | import | 导入 StateGraph、State、8 个节点函数 |
| 20~47 | `build_resume_graph()` | 构建并编译图 |
| 26~33 | `builder.add_node(...)` | 注册 8 个节点 |
| 36~44 | `builder.add_edge(...)` | 顺次连边 |
| 47 | `builder.compile()` | 编译 |

### resume.py（228 行）

| 行号范围 | 函数/接口 | 作用 |
|---------|----------|------|
| 1~31 | import + 全局变量 | 模块导入、线程本地图、GC 保护集合 |
| 23~27 | `_get_graph()` | 获取线程本地的图实例 |
| 34~45 | `_mark_review_failed()` | 标记审查失败（幂等） |
| 48~131 | `POST /upload` | 上传简历，触发异步审查 |
| 134~185 | `GET /reviews/{review_id}` | 查询审查结果/状态 |
| 188~201 | `DELETE /reviews/{review_id}` | 删除审查记录 |
| 204~227 | `GET /reviews` | 历史列表 |

---

## 二、为什么需要图装配 + API 层？

### 2.1 图装配（graph.py）—— 串起 8 个节点

`nodes.py` 定义了 8 个独立节点，但每个节点不知道自己的执行顺序。`graph.py` 负责把 8 个节点串成一条直线流水线：

```
START → upload_to_minio → download_pdf → extract_text → extract_structured
      → run_six_dimensions → diagnose_issues → generate_summary → save_results → END
```

简历审查是**一次性任务**：上传 PDF → 审查 → 返回结果，不需要分支、不需要循环、不需要中断恢复。所以图是最简单的直线形式，没有条件边、没有 `interrupt`、没有 `checkpointer`。

### 2.2 API 层（resume.py）—— 暴露为 HTTP 接口

`graph.py` 编译后的图是 Python 对象，但前端只能发 HTTP 请求。`resume.py` 把图包装成 RESTful API：

```
前端（HTTP 上传 PDF）→ resume.py（REST API）→ graph.py（LangGraph 图）→ nodes.py（节点执行）
```

`resume.py` 额外负责：
- **异步后台任务**：审查耗时 30~60 秒，不能同步等待，用 `asyncio.create_task` 后台执行
- **GC 保护**：后台任务引用被模块级 `set` 持有，防止垃圾回收
- **超时兜底**：`GET /reviews/{id}` 检测 processing 超时（15 分钟），自动标记为 failed
- **数据隔离**：SQL 查询都带 `student_id` 过滤，只能查自己的记录

---

## 四、graph.py：图装配

### 签名与动机

`build_resume_graph()` 是整条流水线的装配入口：创建 `StateGraph(ResumeState)`、注册 8 个节点、顺次连边、编译。**不传 checkpointer**，因为简历审查是一次性任务，不需要断点恢复。

### 逐行精读：导入区

```python
# graph.py 第 1~17 行
```

| 行号 | 代码 | 说明 |
|-----|------|------|
| 1 | `"""简历审查 Agent - 图定义"""` | 模块文档串 |
| 3 | `# backend/agents/resume/graph.py` | 路径注释 |
| 5 | `from langgraph.graph import StateGraph, START, END` | 核心：图构造器与特殊节点 |
| 7 | `from backend.agents.resume.state import ResumeState` | 图的状态类型 |
| 8 | `from backend.agents.resume.nodes import (` | 导入节点函数 |
| 9 | `upload_to_minio_node,` | 节点① |
| 10 | `download_pdf_node,` | 节点② |
| 11 | `extract_text_node,` | 节点③ |
| 12 | `extract_structured_node,` | 节点④ |
| 13 | `run_six_dimensions_node,` | 节点⑤ |
| 14 | `diagnose_issues_node,` | 节点⑥ |
| 15 | `generate_summary_node,` | 节点⑦ |
| 16 | `save_results_node,` | 节点⑧ |
| 17 | `)` | 结束导入 |

### 逐行精读：`build_resume_graph()`

```python
# graph.py 第 20~47 行
```

| 行号 | 代码 | 说明 |
|-----|------|------|
| 20 | `def build_resume_graph():` | 函数签名，无参数 |
| 21 | `"""构建并编译简历审查 Agent 的状态图。` | 文档串 |
| 22 | `特点：无分支、无 interrupt、无 checkpointer（一次性任务），六维度并行是性能关键路径。"""` | 明确设计约束 |
| 23 | `builder = StateGraph(ResumeState)` | 创建图，绑定 `ResumeState` 作为全图状态类型 |
| 25 | `# ① 注册 8 个节点（节点名 → 节点函数）` | 注释 |
| 26 | `builder.add_node("upload_to_minio", upload_to_minio_node)` | 节点① |
| 27 | `builder.add_node("download_pdf", download_pdf_node)` | 节点② |
| 28 | `builder.add_node("extract_text", extract_text_node)` | 节点③ |
| 29 | `builder.add_node("extract_structured", extract_structured_node)` | 节点④ |
| 30 | `builder.add_node("run_six_dimensions", run_six_dimensions_node)` | 节点⑤ |
| 31 | `builder.add_node("diagnose_issues", diagnose_issues_node)` | 节点⑥ |
| 32 | `builder.add_node("generate_summary", generate_summary_node)` | 节点⑦ |
| 33 | `builder.add_node("save_results", save_results_node)` | 节点⑧ |
| 35 | `# ② 顺次连边：START → … → END（一条直线，无分支）` | 注释 |
| 36 | `builder.add_edge(START, "upload_to_minio")` | 入口 → ① |
| 37 | `builder.add_edge("upload_to_minio", "download_pdf")` | ① → ② |
| 38 | `builder.add_edge("download_pdf", "extract_text")` | ② → ③ |
| 39 | `builder.add_edge("extract_text", "extract_structured")` | ③ → ④ |
| 40 | `builder.add_edge("extract_structured", "run_six_dimensions")` | ④ → ⑤ |
| 41 | `builder.add_edge("run_six_dimensions", "diagnose_issues")` | ⑤ → ⑥ |
| 42 | `builder.add_edge("diagnose_issues", "generate_summary")` | ⑥ → ⑦ |
| 43 | `builder.add_edge("generate_summary", "save_results")` | ⑦ → ⑧ |
| 44 | `builder.add_edge("save_results", END)` | ⑧ → 出口 |
| 46 | `# ③ 编译。不传 checkpointer：一次性任务，不需要断点恢复` | 注释 |
| 47 | `return builder.compile()` | 编译并返回可执行图 |

### 依赖关系

- `backend/agents/resume/state.py`（`ResumeState`）
- `backend/agents/resume/nodes.py`（8 个节点函数）

### ★ Insight ─── 设计亮点

```python
# 亮点：直线流水线，无分支
builder.add_edge(START, "upload_to_minio")
#                   ...
builder.add_edge("save_results", END)
# 9 条 add_edge 一一对应，不包含任何条件边

# 亮点：不传 checkpointer
return builder.compile()        # 没有 checkpointer 参数
# └─ 简历审查是一次性任务，不需要 checkpoint 断点恢复
```

**关键设计**：这个图不做任何分支判断——所有节点无条件执行、顺序固定。这就是"流水线"的本质：每个节点只管做好自己的事，把结果交给下一个。六维度并行是在 `run_six_dimensions_node` 内部通过 `asyncio.gather` 实现的，在图层面仍然是单一节点。

---

## 五、API：全局区

### 签名与动机

模块级定义三个关键全局资源：**线程本地图实例**（避免并发竞争）、**后台任务 GC 保护集合**（防止被回收）、**超时阈值**（15 分钟兜底）。

### 逐行精读

```python
# resume.py 第 1~31 行
```

| 行号 | 代码 | 说明 |
|-----|------|------|
| 1 | `"""简历审查"""` | 模块文档串 |
| 2 | `# backend/api/v1/resume.py` | 路径注释 |
| 4 | `import asyncio` | 事件循环、后台任务 |
| 5 | `import os` | 文件路径操作 |
| 6 | `import uuid` | 生成 review_id |
| 7 | `from datetime import datetime, timezone` | 时间戳比较（超时兜底） |
| 9 | `from fastapi import APIRouter, Depends, File, HTTPException, UploadFile` | FastAPI 框架 |
| 10 | `from sqlalchemy import text` | 原生 SQL |
| 12 | `from backend.agents.resume.graph import build_resume_graph` | 图构建函数 |
| 13 | `from backend.core.logger import get_logger` | 日志器 |
| 14 | `from backend.dependencies import AsyncSessionLocal, get_current_user` | 数据库会话与鉴权 |
| 16 | `router = APIRouter()` | 创建路由实例 |
| 17 | `logger = get_logger(__name__)` | 模块级日志器 |
| 19 | `# ── 线程本地图：每个线程一份独立的图实例，避免并发竞争 ──` | 注释 |
| 20 | `import threading` | 线程本地存储 |
| 21 | `_graph_local = threading.local()` | 线程本地对象 |
| 30 | `_background_tasks: set[asyncio.Task] = set()` | 模块级集合，持有后台任务强引用 |
| 31 | `RESUME_REVIEW_TIMEOUT_SECONDS = 15 * 60` | 审查超时阈值：15 分钟 |

### `_get_graph()`：线程本地图

```python
# resume.py 第 23~27 行
```

| 行号 | 代码 | 说明 |
|-----|------|------|
| 23 | `def _get_graph():` | 获取线程本地的图实例 |
| 24 | `"""获取线程本地的图实例（当前线程没有就编译一个）。"""` | 文档串 |
| 25 | `if not hasattr(_graph_local, "graph"):` | 当前线程还没有图 |
| 26 | `_graph_local.graph = build_resume_graph()` | 编译一个并缓存 |
| 27 | `return _graph_local.graph` | 返回 |

### ★ Insight ─── 设计亮点（全局区）

```python
# 亮点：线程本地图，避免并发竞争
_graph_local = threading.local()          # 每个线程独立
def _get_graph():
    if not hasattr(_graph_local, "graph"):
        _graph_local.graph = build_resume_graph()  # 只编译一次
    return _graph_local.graph

# 亮点：GC 保护
_background_tasks: set[asyncio.Task] = set()  # 持有强引用，防止被回收
```

---

## 六、`_mark_review_failed()`：标记失败

### 签名与动机

幂等地将 `resume_reviews` 表中仍处于 `processing` 状态的记录标记为 `failed`，附带错误信息。WHERE 条件 `AND status = 'processing'` 保证幂等性——重复调用不会覆盖已 `done` 的记录。

### 逐行精读

```python
# resume.py 第 34~45 行
```

| 行号 | 代码 | 说明 |
|-----|------|------|
| 34 | `async def _mark_review_failed(review_id: str, error_msg: str) -> None:` | 签名，只写不返回 |
| 35 | `"""把仍处于 processing 的记录标记为 failed（幂等：仅当当前是 processing 才改）。"""` | 动机注释 |
| 36 | `async with AsyncSessionLocal() as session:` | 开会话 |
| 37 | `await session.execute(` | 执行 SQL |
| 38 | `text("""` | 原生 SQL |
| 39 | `UPDATE resume_reviews SET status = 'failed', error_msg = :error_msg, updated_at = NOW()` | 更新 |
| 40 | `WHERE id = :review_id AND status = 'processing'` | **幂等条件** |
| 41 | `"""),` | 结束 SQL |
| 42 | `{"review_id": review_id, "error_msg": error_msg[:1000]},` | 参数，截断 error_msg 到 1000 字符 |
| 44 | `await session.commit()` | 提交 |

---

## 七、`POST /upload` — 上传简历

### 签名与动机

接收 PDF 文件，校验 → 存临时目录 → 写 DB 初始状态 → 后台启动图执行 → 立即返回 `review_id`。**状态码 202** 表示"已接受、正在处理"。

### 逐行精读

```python
# resume.py 第 48~131 行
```

| 行号 | 代码 | 说明 |
|-----|------|------|
| 48 | `@router.post("/upload", status_code=202)` | 路由 + 202 Accepted |
| 49 | `async def upload_resume(` | 函数签名 |
| 50 | `file: UploadFile = File(...),` | 上传文件 |
| 51 | `current_user: dict = Depends(get_current_user),` | 鉴权用户 |
| 52 | `):` | 结束参数 |
| 53 | `"""上传 PDF 简历，触发异步审查，立即返回 review_id。"""` | 文档串 |
| 54 | `if not file.filename.lower().endswith(".pdf"):` | 只收 PDF |
| 55 | `raise HTTPException(status_code=400, detail="仅支持 PDF 格式")` | 拒绝非 PDF |
| 57 | `review_id = str(uuid.uuid4())` | 生成唯一 ID |
| 58 | `student_id = current_user["user_id"]` | 当前用户 |
| 59 | `tenant_id = current_user["tenant_id"]` | 当前租户 |
| 61 | `# 1. 读取并校验文件` | 注释 |
| 62 | `MAX_PDF_SIZE = 20 * 1024 * 1024` | 20MB 上限 |
| 63 | `file_bytes = await file.read()` | 用 await 读，不阻塞 |
| 64 | `if len(file_bytes) > MAX_PDF_SIZE:` | 超限 |
| 65 | `raise HTTPException(status_code=413, detail="文件过大，最大支持 20MB")` | 413 Payload Too Large |
| 66 | `if not file_bytes:` | 空文件 |
| 67 | `raise HTTPException(status_code=400, detail="上传文件为空")` | 400 |
| 70 | `import tempfile` | 临时目录 |
| 71 | `tmp_path = os.path.join(tempfile.gettempdir(), f"{review_id}_upload.pdf")` | 生成临时路径 |
| 72 | `with open(tmp_path, "wb") as f:` | 写文件 |
| 73 | `f.write(file_bytes)` | 同步写（已全部在内存中） |
| 74 | `logger.info("upload_resume.file_saved", review_id=review_id, tmp_path=tmp_path)` | 日志 |
| 76 | `# 2. 写入 resume_reviews 初始记录（status=processing）` | 注释 |
| 77 | `async with AsyncSessionLocal() as session:` | 开会话 |
| 78 | `await session.execute(` | 执行 SQL |
| 79 | `text("""` | 原生 SQL |
| 80 | `INSERT INTO resume_reviews (id, tenant_id, student_id, pdf_minio_path, status)` | insert |
| 81 | `VALUES (:id, :tenant_id, :student_id, :pdf_minio_path, 'processing')` | 初始状态 |
| 82 | `"""),` | 结束 |
| 83 | `{"id": review_id, "tenant_id": tenant_id, "student_id": student_id,` | 参数 |
| 84 | `"pdf_minio_path": f"resumes/{student_id}/{review_id}.pdf"},` | MinIO 路径（预留） |
| 85 | `)` | 结束 execute |
| 86 | `await session.commit()` | 提交 |
| 88 | `# 3. 准备初始 State，后台启动图执行` | 注释 |
| 89 | `initial_state = {` | 初始化 State |
| 90 | `"messages": [], "student_id": student_id, "tenant_id": tenant_id,` | 基础信息 |
| 91 | `"review_id": review_id, "pdf_minio_path": "", "pdf_local_path": tmp_path,` | 路径 |
| 92 | `"raw_text": "", "page_count": 0, "structured": None,` | 初始空值 |
| 93 | `"dimension_scores": [], "weighted_score": 0.0, "issues": [],` | 初始空值 |
| 94 | `"summary": None, "fallback_used": False, "structured_output": None,` | 初始空值 |
| 95 | `}` | 结束 |
| 97 | `def _on_task_done(t: asyncio.Task):` | 任务结束回调 |
| 98 | `"""任务结束回调：移除引用、清理临时文件、失败则标记 failed。"""` | 动机注释 |
| 99 | `_background_tasks.discard(t)` | 从集合移除（释放强引用） |
| 100 | `if os.path.exists(tmp_path):` | 临时文件存在 |
| 101 | `try:` | 保护 |
| 102 | `os.remove(tmp_path)` | 删除 |
| 103 | `except OSError:` | 忽略删除失败 |
| 104 | `pass` | — |
| 105 | `mark_failed_msg = None` | 初始化 |
| 106 | `if t.cancelled():` | 任务被取消（如服务重启） |
| 107 | `mark_failed_msg = "审查任务被服务重启中断，请重试。"` | 消息 |
| 108 | `logger.warning("resume.background_task_cancelled", review_id=review_id)` | 日志 |
| 109 | `else:` | 未取消 |
| 110 | `exc = t.exception()` | 取异常 |
| 111 | `if exc:` | 有异常 |
| 112 | `mark_failed_msg = f"审查任务执行失败：{exc}"` | 消息 |
| 113 | `logger.error("resume.background_task_failed", review_id=review_id,` | 错误日志 |
| 114 | `error=str(exc), exc_info=exc)` | 记录异常 |
| 115 | `if mark_failed_msg:` | 需要标记失败 |
| 116 | `try:` | 保护 |
| 117 | `loop = asyncio.get_running_loop()` | 取当前事件循环 |
| 118 | `loop.create_task(_mark_review_failed(review_id, mark_failed_msg))` | 异步标记 failed |
| 119 | `except RuntimeError:` | 循环已关闭 |
| 120 | `pass  # 循环已关闭：下次查询走超时兜底` | 注释 |
| 122 | `graph = _get_graph()` | 拿线程本地图 |
| 123 | `task = asyncio.create_task(graph.ainvoke(initial_state))` | **后台执行图** |
| 124 | `_background_tasks.add(task)` | GC 保护：持有强引用 |
| 125 | `task.add_done_callback(_on_task_done)` | 注册完成回调 |
| 126 | `logger.info("upload_resume.task_started", review_id=review_id)` | 日志 |
| 128 | `return {` | 立即返回 |
| 129 | `"review_id": review_id, "status": "processing",` | 工单号与状态 |
| 130 | `"message": "简历已上传，正在审查中，预计 30-60 秒完成。",` | 提示 |
| 131 | `}` | 结束 |

### 依赖关系

- `_get_graph()`（23~27 行）
- `_mark_review_failed()`（34~45 行）
- `build_resume_graph()`（graph.py 20~47 行）

### ★ Insight ─── 设计亮点

```python
# 亮点：202 Accepted + 后台任务
task = asyncio.create_task(graph.ainvoke(initial_state))  # 后台执行
_background_tasks.add(task)                               # GC 保护
task.add_done_callback(_on_task_done)                     # 完成回调
return {"review_id": review_id, "status": "processing"}   # 立即返回

# 亮点：回调函数处理所有异常分支
def _on_task_done(t: asyncio.Task):
    _background_tasks.discard(t)       # 释放引用
    if t.cancelled():                  # 被取消
        ...
    exc = t.exception()                # 抛出异常
    if exc:
        ...
    # 异步标记 failed（如果事件循环已关闭则走超时兜底）
    loop.create_task(_mark_review_failed(review_id, mark_failed_msg))
```

**关键设计**：回调函数 `_on_task_done` 处理了取消、异常、正常完成三种路径，且 `_mark_review_failed` 的幂等条件（`status = 'processing'`）保证即使回调重复执行也不会覆盖正常 `done` 的结果。

---

## 八、`GET /reviews/{id}` — 查询结果

### 签名与动机

查询审查状态。核心逻辑是**超时兜底**：如果后台任务意外中断（如服务重启），状态会永远卡在 `processing`，此处通过检查 `updated_at` 与当前时间的差值，超过 15 分钟自动标记 `failed`。

### 逐行精读

```python
# resume.py 第 134~185 行
```

| 行号 | 代码 | 说明 |
|-----|------|------|
| 134 | `@router.get("/reviews/{review_id}")` | 路由，GET 方法 |
| 135 | `async def get_review(review_id: str, current_user: dict = Depends(get_current_user)):` | 签名 |
| 136 | `"""查询审查状态/结果。processing / done / failed / 404。"""` | 文档串 |
| 137 | `async with AsyncSessionLocal() as session:` | 开会话 |
| 138 | `result = await session.execute(` | 执行查询 |
| 139 | `text("""` | 原生 SQL |
| 140 | `SELECT id, status, scores, issues, summary, error_msg, created_at, updated_at` | 查询字段 |
| 141 | `FROM resume_reviews` | 表 |
| 142 | `WHERE id = :review_id AND student_id = :student_id` | **带 student_id 过滤** |
| 143 | `"""),` | 结束 |
| 144 | `{"review_id": review_id, "student_id": current_user["user_id"]},` | 参数 |
| 145 | `)` | 结束 execute |
| 146 | `row = result.mappings().fetchone()` | 取一行（mappings 模式） |
| 148 | `if not row:` | 不存在或不属于自己 |
| 149 | `raise HTTPException(status_code=404, detail="审查记录不存在")` | 404 |
| 151 | `if row["status"] == "processing":` | 还在处理中 |
| 152 | `# 超时兜底：防止后台任务中断后长期卡 processing` | 注释 |
| 153 | `last_ts = row["updated_at"] or row["created_at"]` | 取最后更新时间 |
| 154 | `if isinstance(last_ts, datetime):` | 确保是 datetime 类型 |
| 155 | `# 统一转为 aware datetime` | 注释 |
| 156 | `if last_ts.tzinfo is None:` | 数据库可能返回 naive datetime |
| 157 | `last_ts = last_ts.replace(tzinfo=timezone.utc)` | 加上 UTC 时区 |
| 158 | `elapsed = (datetime.now(timezone.utc) - last_ts).total_seconds()` | 计算已过秒数 |
| 159 | `if elapsed >= RESUME_REVIEW_TIMEOUT_SECONDS:` | 超过 15 分钟 |
| 160 | `timeout_msg = "审查任务超时或被中断，请重新上传后重试。"` | 消息 |
| 161 | `await _mark_review_failed(review_id, timeout_msg)` | 异步标记 failed |
| 162 | `return {"review_id": review_id, "status": "failed", "error_msg": timeout_msg}` | 返回失败 |
| 163 | `return {"review_id": review_id, "status": "processing"}` | 还在处理中，让客户端继续轮询 |
| 165 | `if row["status"] == "failed":` | 失败状态 |
| 166 | `return {"review_id": review_id, "status": "failed",` | 返回失败 |
| 167 | `"error_msg": row.get("error_msg") or "审查任务失败，请重新上传。"}` | 附带错误信息 |
| 169 | `# status == done：JSONB 列已被 asyncpg 自动反序列化为 dict/list，无需 json.loads` | 注释 |
| 170 | `def _to_dict(v):` | 内嵌工具：安全转 dict |
| 171 | `if v is None:` | 空值 |
| 172 | `return {}` | 返回空 dict |
| 173 | `if isinstance(v, (dict, list)):` | 已反序列化 |
| 174 | `return v` | 直接返回 |
| 175 | `import json as _json` | 兜底 |
| 176 | `return _json.loads(v)` | 手动解析 |
| 178 | `scores_data = _to_dict(row["scores"])` | 解析 scores |
| 179 | `return {` | 返回完整结果 |
| 180 | `"review_id": review_id, "status": "done",` | 状态 |
| 181 | `"weighted_score": scores_data.get("weighted_score", 0),` | 加权分 |
| 182 | `"dimension_scores": scores_data.get("dimension_scores", []),` | 维度评分 |
| 183 | `"issues": _to_dict(row["issues"]) if not isinstance(row["issues"], list) else row["issues"],` | 问题 |
| 184 | `"summary": _to_dict(row["summary"]),` | 总结 |
| 185 | `}` | 结束 |

### ★ Insight ─── 设计亮点

```python
# 亮点：超时兜底，防止状态永远卡住
if elapsed >= RESUME_REVIEW_TIMEOUT_SECONDS:         # 15 分钟阈值
    await _mark_review_failed(review_id, timeout_msg)  # 幂等标记
    return {"status": "failed", ...}                    # 直接返回失败

# 亮点：student_id 过滤，数据隔离
WHERE id = :review_id AND student_id = :student_id
# 用户只能查看自己的审查记录，天然的数据隔离
```

---

## 九、`DELETE /reviews/{id}` — 删除记录

### 签名与动机

删除审查记录，WHERE 条件带 `student_id` 确保用户只能删自己的记录。`status_code=204` 表示操作成功无返回体。

### 逐行精读

```python
# resume.py 第 188~201 行
```

| 行号 | 代码 | 说明 |
|-----|------|------|
| 188 | `@router.delete("/reviews/{review_id}", status_code=204)` | 路由 + 204 No Content |
| 189 | `async def delete_review(review_id: str, current_user: dict = Depends(get_current_user)):` | 签名 |
| 190 | `"""删除审查记录（WHERE 带 student_id，只能删自己的）。"""` | 文档串 |
| 191 | `async with AsyncSessionLocal() as session:` | 开会话 |
| 192 | `result = await session.execute(` | 执行 SQL |
| 193 | `text("""` | 原生 SQL |
| 194 | `DELETE FROM resume_reviews` | 删除 |
| 195 | `WHERE id = :review_id AND student_id = :student_id` | 数据隔离 |
| 196 | `"""),` | 结束 |
| 197 | `{"review_id": review_id, "student_id": current_user["user_id"]},` | 参数 |
| 198 | `)` | 结束 execute |
| 199 | `await session.commit()` | 提交 |
| 200 | `if result.rowcount == 0:` | 没删到任何行 |
| 201 | `raise HTTPException(status_code=404, detail="记录不存在")` | 404 |

---

## 十、`GET /reviews` — 历史列表

### 签名与动机

列出本人历史审查记录（摘要），按时间倒序，最多 50 条。直接从 JSONB 中提取 `weighted_score` 字段，避免加载完整数据。

### 逐行精读

```python
# resume.py 第 204~227 行
```

| 行号 | 代码 | 说明 |
|-----|------|------|
| 204 | `@router.get("/reviews")` | 路由 |
| 205 | `async def list_reviews(current_user: dict = Depends(get_current_user)):` | 签名 |
| 206 | `"""列出本人历史审查记录（摘要，按时间倒序）。"""` | 文档串 |
| 207 | `async with AsyncSessionLocal() as session:` | 开会话 |
| 208 | `result = await session.execute(` | 执行查询 |
| 209 | `text("""` | 原生 SQL |
| 210 | `SELECT id, status, created_at,` | 基础字段 |
| 211 | `(scores::jsonb ->> 'weighted_score')::float AS weighted_score` | **JSONB 内联提取** |
| 212 | `FROM resume_reviews` | 表 |
| 213 | `WHERE student_id = :student_id` | 过滤 |
| 214 | `ORDER BY created_at DESC` | 按时间倒序 |
| 215 | `LIMIT 50` | 最多 50 条 |
| 216 | `"""),` | 结束 |
| 217 | `{"student_id": current_user["user_id"]},` | 参数 |
| 218 | `)` | 结束 execute |
| 219 | `rows = result.mappings().all()` | 取全部结果 |
| 221 | `items = [` | 列表推导 |
| 222 | `{"review_id": row["id"], "status": row["status"],` | 基础信息 |
| 223 | `"created_at": row["created_at"].isoformat() if row["created_at"] else None,` | 时间转 ISO |
| 224 | `"weighted_score": row["weighted_score"]}` | 加权分 |
| 225 | `for row in rows` | 遍历 |
| 226 | `]` | 结束 |
| 227 | `return {"items": items, "total": len(items)}` | 返回 |

### ★ Insight ─── 设计亮点

```python
# 亮点：JSONB 内联提取，避免加载完整数据
(scores::jsonb ->> 'weighted_score')::float AS weighted_score
# 直接在数据库层面从 JSONB 中提取字段，无需反序列化整个 scores 列
```

---

## 十一、后台任务生命周期（完整流程）

```
POST /upload
    │
    ▼
保存 PDF → 写入 DB（status=processing）→ 创建后台任务
    │
    ▼
立即返回 {"review_id": "...", "status": "processing"}
    │
    ▼
后台任务执行图（8 个节点顺次执行）
    │
    ├─ 成功 → save_results → DB 更新为 status=done
    │
    └─ 失败 → _on_task_done 回调 → DB 更新为 status=failed
    │
    ▼
用户轮询 GET /reviews/{id} 直到 status=done
    │
    ├─ 正常 processing → 继续轮询
    ├─ 超时 15 分钟 → 自动标记 failed
    ├─ done → 返回完整结果
    └─ failed → 返回错误信息
```

---

## 十二、总结

```
graph.py                    ← 定义节点和边，编译成可执行图
    build_resume_graph()    ← 第 20~47 行
    └─ 8 个 add_node        ← 第 26~33 行
    └─ 9 条 add_edge        ← 第 36~44 行
    └─ compile()            ← 第 47 行

resume.py（API）            ← 上传/查询/删除/列表接口
    ├── _get_graph()          ← 第 23~27 行（线程本地图）
    ├── _mark_review_failed() ← 第 34~45 行（幂等标记失败）
    ├── POST /upload          ← 第 48~131 行（202 Accepted，异步执行）
    ├── GET /reviews/{id}     ← 第 134~185 行（轮询 + 超时兜底）
    ├── DELETE /reviews/{id}  ← 第 188~201 行（数据隔离删除）
    └── GET /reviews          ← 第 204~227 行（历史列表）
```

**核心思想：异步 + 后台任务 + 超时兜底，确保用户体验。**