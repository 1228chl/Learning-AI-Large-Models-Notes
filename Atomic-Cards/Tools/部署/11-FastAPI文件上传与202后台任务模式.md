---
author: "XunZong"
created: "2026-07-30"
tags: ["工程实践", "FastAPI", "文件上传", "202 Accepted", "后台任务", "异步处理"]
aliases: ["FastAPI 202 Pattern", "后台任务", "异步文件处理", "轮询模式", "UploadFile"]
---

# FastAPI 文件上传与 202 后台任务模式

## 定义

FastAPI 文件上传 + 202 Accepted + 后台任务 + 前端轮询是一套处理**长耗时异步操作**的标准模式。用户上传文件后，服务端立即返回 `202 Accepted` 和一个 `task_id`，实际处理（如 LangGraph 图执行 30-60 秒）在后台异步进行，前端定期轮询任务状态直到完成。

核心设计理念：**HTTP 请求不应等待业务处理完成**——30 秒以上的 LLM 调用会导致 HTTP 连接超时、网关断开、用户焦虑。202 模式将"提交任务"和"获取结果"解耦为两个独立接口。

$$ \text{POST /upload } \xrightarrow{\text{202 Accepted}} \text{task\_id} \quad \text{GET /task/\{id\} } \xrightarrow{\text{poll}} \text{status: processing | done} $$

## 核心机制

| 步骤 | 操作 | 关键代码 | 耗时 |
|------|------|---------|------|
| 1. 接收文件 | FastAPI `UploadFile` 自动解析 multipart 文件 | `file: UploadFile = File(...)` | < 100ms |
| 2. 存入临时目录 | `await file.read()` → 写 `/tmp/` | — | 取决于文件大小 |
| 3. 返回 202 | `status_code=202` + `task_id` | `return {"review_id": uid}` | < 1ms |
| 4. 后台执行 | `asyncio.create_task(run_graph(...))` | LangGraph 图执行 | 30-60s |
| 5. 前端轮询 | 每 2 秒 `GET /task/{id}` | 检查 `status` 字段 | 持续到 done |

## 直观理解

> 餐厅取号模式——你到前台点菜（上传文件），服务员给你一个取餐号（`review_id`）并告诉你"做好了叫你"，你不需要站在柜台前干等。后厨（后台 LangGraph 图）在慢慢做菜，你可以去干别的事，每隔一会儿看一眼叫号屏（轮询 GET 接口），号到了就去取餐。

## 完整实现

```python
from fastapi import APIRouter, UploadFile, File, HTTPException
from starlette import status
import asyncio, uuid

# 全局 set 防止后台任务被 GC 回收
_background_tasks: set[asyncio.Task] = set()

@router.post("/resume/upload", status_code=status.HTTP_202_ACCEPTED)
async def upload_resume(file: UploadFile = File(...)):
    """接收文件 → 立即返回 202 → 后台执行 LangGraph"""

    # 1. 文件大小限制（防止恶意大文件）
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:               # 10MB 限制
        raise HTTPException(413, "文件超过 10MB 限制")

    # 2. 生成任务 ID，写入数据库，状态 = processing
    review_id = str(uuid.uuid4())
    await db.execute(
        text("INSERT INTO resume_reviews (id, filename, status) VALUES (:id, :fn, 'processing')"),
        {"id": review_id, "fn": file.filename}
    )

    # 3. 后台启动 LangGraph 图执行（不等待结果）
    task = asyncio.create_task(
        run_resume_graph(review_id, content)
    )
    _background_tasks.add(task)                        # GC 保护
    task.add_done_callback(_background_tasks.discard)  # 完成后从集合中移除

    return {"review_id": review_id}                    # 立即返回，不等完成


@router.get("/resume/reviews/{review_id}")
async def get_review_status(review_id: str):
    """前端轮询接口：检查任务状态"""
    record = await db.execute(
        text("SELECT status, result FROM resume_reviews WHERE id = :id"),
        {"id": review_id}
    )
    row = record.fetchone()
    if not row:
        raise HTTPException(404, "记录不存在")

    if row["status"] == "processing":
        return {"status": "processing"}                # 还在处理，前端继续轮询
    elif row["status"] == "completed":
        return {"status": "done", "data": row["result"]}
    else:
        return {"status": "failed", "error": row.get("error", "")}
```

## _background_tasks GC 保护

```python
# 关键坑点：asyncio.create_task 返回的 Task 对象，
# 如果不被任何变量引用，Python GC 会回收它，导致任务被取消！
task = asyncio.create_task(long_running_work())  # ❌ 局部变量，函数返回后可能被 GC

# 正确做法：将 Task 存入模块级 set，防止 GC 回收
_background_tasks = set()
task = asyncio.create_task(long_running_work())
_background_tasks.add(task)                      # ✅ 被 set 引用，不会被 GC
task.add_done_callback(_background_tasks.discard) # 完成后移除，避免内存泄漏
```

## AI/ML 工程应用场景

| 应用场景 | 处理时长 | 轮询间隔 | 超时兜底 |
|---------|---------|---------|---------|
| 简历 PDF 解析 + 六维度评分 | 30-60s | 2s | 15 分钟超时 → 标记 failed |
| 试卷 Word 解析 + AI 批改 | 30-90s | 3s | 15 分钟超时 |
| 知识库文档批量导入 | 1-10min | 5s | 按文档数量动态计算超时 |
| 视频/音频转录 | 数分钟 | 5s | 30 分钟超时 |

## 面试追问

**Q1（基础）**：为什么长耗时操作要用 202 + 后台任务 + 轮询，而不是同步等待返回？

**回答要点**：

1. HTTP 连接超时：浏览器/网关/负载均衡器通常 30-60 秒超时，LLM 调用经常超过此限制
2. 用户体验：30 秒白屏等待 + 连接断开 → 用户会刷新或关闭页面；"审查中..." 进度提示 → 用户知道系统在工作
3. 解耦：提交任务和获取结果是两个独立操作——用户可以关闭页面后再回来查看结果
4. 支撑并发：同步等待会占用一个 HTTP 连接（和对应的线程/协程），202 模式释放连接用于其他请求

**Q2（深挖）**：`asyncio.create_task` 创建的后台任务为什么需要 `_background_tasks` 集合保护？不加会怎样？

**回答要点**：

1. Python GC 回收规则：没有任何引用的对象会被回收——包括正在运行的 Task
2. `task = asyncio.create_task(...)` 中 `task` 是局部变量——函数返回后引用消失
3. 若 Task 被 GC 回收 → `asyncio.CancelledError` 被抛入协程 → 后台任务被取消 → 处理永远无法完成
4. `_background_tasks.add(task)` 创建模块级引用 → Task 不会被 GC 回收 → `add_done_callback(discard)` 完成后自动清理

**Q3（实战）**：轮询间隔设为 2 秒的依据是什么？设成 1 秒或 5 秒有什么影响？

**回答要点**：

1. 2 秒是"用户感知延迟"和"服务端负载"的平衡点——太短浪费请求，太长用户感觉迟钝
2. 1 秒：30 次轮询 = 30 次 HTTP 请求——高频轮询增加服务端压力（尤其多用户同时上传）
3. 5 秒：6 次轮询——但任务在 2 秒时完成，用户要多等 3 秒才看到结果
4. 优化：轮询间隔随等待时间指数增长——前 10 秒每 1 秒轮询，之后每 3 秒，超过 1 分钟每 10 秒

**Q4（边界）**：服务重启后，`_background_tasks` 集合中未完成的任务会怎样？前端轮询会永久停在 "processing" 吗？

**回答要点**：

1. 进程重启 → 内存中的 `_background_tasks` 集合丢失 → 所有未完成任务消失
2. 前端轮询永远返回 "processing"（DB 中状态未被更新为 completed/failed）→ 前端陷入死循环
3. 解决方案：带时间戳的 status 字段 → 定时任务扫描 `status='processing' AND upd[FastAPI 高级特性](09-FastAPI高级特性.md)
4. 更好的替代：WebSocket 推送替代轮询——服务端完成任务时主动推送给前端，连接断开时前端自动感知

## 参考引用

- 需要理解 FastAPI UploadFile 的类型注解和文件接收机制：[FastAPI 高级特性](../部署/09-FastAPI高级特性.md)
- 需要理解 asyncio.create_task 和事件循环中后台任务的执行模型：[异步并发实战](../../Python/并发/17-异步并发实战.md)
- 需要理解后台任务 GC 保护模式的完整原理：[后台任务 GC 保护模式](../../Python/并发/18-后台任务GC保护模式.md)
- 需要理解简历审查 Agent 中该模式的实际应用（上传 + 202 + 轮询）：[简历审查 Agent 八节点流水线](../../AI-Agent/系统/38-简历审查Agent八节点流水线.md)
- 需要理解 SSE 流式推送如何避免轮询的延迟问题：[SSE 流式输出](../../Tools/网络/10-WebSocket与SSE流式输出.md)
