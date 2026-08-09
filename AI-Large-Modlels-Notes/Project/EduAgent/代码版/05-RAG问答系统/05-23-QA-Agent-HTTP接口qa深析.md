# QA Agent HTTP 接口：`qa.py` 深度解析

> 源文件：`backend/api/v1/qa.py`（共 293 行）
> 对应课件：5.16 HTTP 接口（qa.py）
> 前置依赖：`graph.py`、`memory.py`、`dependencies.py`

## 一、全文行号速查表

| 行号范围 | 内容 | 类型 | 说明 |
|---------|------|------|------|
| 1~7 | 文件头注释 | 文档 | 三个端点概述 |
| 8~20 | import 导入 | 依赖 | 导入 FastAPI、Pydantic、SSE、LangChain 等 |
| 23~31 | `ChatRequest` | 模型 | 聊天请求体（session_id, course_id, message, enable_web_search） |
| 33~41 | `ChatResponse` | 模型 | 聊天响应体（answer, answer_mode, confidence, sources, fallback_used） |
| 43~48 | `SessionMessage` | 模型 | 单条历史消息（role, content, created_at） |
| 50~56 | `HistoryResponse` | 模型 | 历史会话响应（session_id, messages, summary, total_turns） |
| 58~110 | `POST /chat` | 接口 | 非流式接口：构建图 → 执行 → 返回 JSON |
| 112~229 | `POST /chat/stream` | 接口 | SSE 流式接口：4 类事件（progress / token / meta / done） |
| 231~293 | `GET /sessions/{session_id}/history` | 接口 | 双数据源历史查询（DB 摘要 + MemorySaver 消息） |

### 文件定位

`qa.py` 是 QA Agent 的 HTTP API 层，提供三个端点：

```
POST /chat                   → 非流式接口（一次性返回完整回答）
POST /chat/stream            → SSE 流式接口（实时推送 token + 进度 + 元数据）
GET  /sessions/{id}/history  → 会话历史查询（消息 + 摘要）
```

### 1.1 为什么需要 HTTP 接口层？

`graph.py` 编译后的 LangGraph 图是 Python 对象，只能通过 Python 代码调用。但 QA Agent 的调用方是**前端页面**（或移动端 App），它们只能发 HTTP 请求。`qa.py` 是桥梁：

```
前端（HTTP）→ qa.py（REST API）→ graph.py（LangGraph 图）→ nodes.py（节点执行）
```

**为什么不是前端直接调图？** 因为：
1. **鉴权**：q.py 通过 JWT 校验用户身份，直接调图没有鉴权
2. **SSE 流式**：`POST /chat/stream` 用 `EventSourceResponse` 做 SSE 流式输出，LangGraph 本身不提供 HTTP 流式能力
3. **会话管理**：`GET /sessions/{id}/history` 从 DB + MemorySaver 双数据源读取历史，图本身只存最新状态
4. **错误处理**：`qa.py` 统一处理超时、异常、空结果等，给前端返回一致的 JSON 错误格式

---

## 二、import 分析（第 8~20 行）

```python
# qa.py 第 8~20 行
import json
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse                # SSE 流式响应
from langchain_core.messages import HumanMessage

from backend.agents.qa.graph import build_qa_graph
from backend.core.memory import build_thread_id
from backend.dependencies import get_current_user
from backend.core.logger import get_logger

router = APIRouter()
logger = get_logger(__name__)
```

| 行号 | import | 来源 | 用途 |
|------|--------|------|------|
| 8 | `json` | 标准库 | JSON 序列化 SSE 事件 |
| 9 | `APIRouter`, `Depends`, `HTTPException`, `status` | FastAPI | 路由注册、依赖注入、异常处理 |
| 10 | `BaseModel`, `Field` | Pydantic | 请求/响应模型定义与校验 |
| 11 | `EventSourceResponse` | `sse_starlette.sse` | SSE 流式响应 |
| 12 | `HumanMessage` | LangChain | 构造用户消息 |
| 14 | `build_qa_graph` | `graph.py` | 构建 QA Agent 图 |
| 15 | `build_thread_id` | `memory.py` | 构造 thread_id |
| 16 | `get_current_user` | `dependencies.py` | JWT 鉴权依赖 |
| 17 | `get_logger` | `logger.py` | 结构化日志 |

---

## 三、请求/响应模型（第 25~56 行）

### 3.1 `ChatRequest`（第 25~31 行）

```python
# qa.py 第 25~31 行
class ChatRequest(BaseModel):
    """聊天请求体"""
    session_id:        str        = Field(..., description="会话 ID（前端生成，每次打开新对话生成一个）")
    course_id:         str | None = Field(None, description="课程 ID（可选，限定检索范围）")
    message:           str        = Field(..., min_length=1, max_length=2000, description="用户消息")
    enable_web_search: bool       = Field(False, description="低置信度时是否先走 Web Search 再给 LLM")
```

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `session_id` | `str` | 是 | — | 前端生成 UUID，每次打开新对话生成一个 |
| `course_id` | `str \| None` | 否 | `None` | 限定检索范围 |
| `message` | `str` | 是 | — | 1~2000 字符，Pydantic 自动校验 |
| `enable_web_search` | `bool` | 否 | `False` | 低置信度时是否走 Web Search |

### 3.2 `ChatResponse`（第 33~41 行）

```python
# qa.py 第 33~41 行
class ChatResponse(BaseModel):
    """聊天响应体"""
    session_id:    str
    answer:        str        # 回答文本
    answer_mode:   str        # "rag" / "web_augmented" / "llm_direct" / "general"
    confidence:    float      # 精排置信度 [0, 1]
    sources:       list[str]  # 来源列表
    fallback_used: bool       # 是否触发了降级
```

**`answer_mode` 的作用**：前端根据此字段展示不同的 UI 样式：

| answer_mode | 前端展示 |
|------------|---------|
| `"rag"` | 显示 📚 参考来源 |
| `"web_augmented"` | 显示 Web 来源链接 |
| `"llm_direct"` | 显示 ⚠️ 提示 |
| `"general"` | 简洁显示，无额外标记 |

### 3.3 `SessionMessage` / `HistoryResponse`（第 43~56 行）

```python
# qa.py 第 43~56 行
class SessionMessage(BaseModel):
    """单条历史消息"""
    role:       str   # "user" / "assistant"
    content:    str
    created_at: str


class HistoryResponse(BaseModel):
    """历史会话响应"""
    session_id:  str
    messages:    list[SessionMessage]
    summary:     str | None      # 对话摘要（压缩后）
    total_turns: int             # 总轮数
```

---

## 四、`POST /chat`：非流式接口（第 58~110 行）

### 4.1 函数签名

```python
# qa.py 第 58~68 行
@router.post("/chat", response_model=ChatResponse)
async def chat(
    req: ChatRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    智能问答：发送消息，获取 RAG 或 LLM 直答（非流式）。

    内部走完整 QA Agent 图：分类 → 检索 → 精排 → 生成 → 存记忆。
    响应中包含 answer_mode 字段，前端可根据此字段展示不同的 UI 样式。
    """
```

### 4.2 构建图与初始 State（第 69~87 行）

```python
# qa.py 第 69~87 行
# 每次请求编译一个新的图实例（LangGraph 的编译开销很小，~10ms）
graph = build_qa_graph()

# thread_id 用 student_id + session_id 拼接，确保不同学员/不同会话的历史隔离
thread_id = build_thread_id(current_user["user_id"], req.session_id)

# 初始 State：只有用户消息和请求上下文，其余字段由节点填充
# web_search_results 每轮重置，防止上轮搜索结果污染本轮 sources
initial_state = {
    "messages":            [HumanMessage(content=req.message)],
    "student_id":          current_user["user_id"],
    "tenant_id":           current_user["tenant_id"],
    "session_id":          req.session_id,
    "course_id":           req.course_id,
    "query_type":          "PRECISE",         # 占位初始值，classify_query 内部动态覆盖
    "enable_web_search":   req.enable_web_search,
    "web_search_results":  [],                # 每轮重置，防止上轮搜索结果污染本轮 sources
}
config: dict = {"configurable": {"thread_id": thread_id}}
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 70 | `graph = build_qa_graph()` | 每次请求编译新图实例（~10ms），安全且推荐 |
| 73 | `thread_id = build_thread_id(...)` | student_id + session_id 拼接，确保不同学员/不同会话的历史隔离 |
| 77~86 | `initial_state = {...}` | 初始 State，只有用户消息和请求上下文 |
| 78 | `"messages": [HumanMessage(content=req.message)]` | 用户消息包装为 LangChain HumanMessage |
| 83 | `"query_type": "PRECISE"` | 占位初始值，`classify_query_node` 内部动态覆盖 |
| 85 | `"web_search_results": []` | 每轮重置，防止上轮搜索结果污染本轮 sources |

**关键设计**：
- `build_qa_graph()` 每次请求都调用：LangGraph 的编译开销很小（~10ms），每次请求编译新实例是安全且推荐的模式。不需要缓存图实例。
- `web_search_results: []` 每轮重置：这是关键设计——上一轮的搜索结果不能留到本轮。如果上一轮搜索了"Spring IOC"并得到结果，本轮问"它的优缺点"时，上一轮的搜索结果还在，会污染本轮的 `sources`。
- `query_type: "PRECISE"` 占位初始值：`classify_query_node` 内部会动态覆盖这个值，这里只是占位。

### 4.3 执行与异常处理（第 89~109 行）

```python
# qa.py 第 89~109 行
try:
    # graph.ainvoke 执行完整流程图：classify_query → retrieve → generate → save_memory
    # config 中的 thread_id 让 LangGraph Checkpointer 自动管理多轮对话状态
    result = await graph.ainvoke(initial_state, config=config)
except Exception as e:
    logger.error("chat.invoke_error", error=str(e), exc_info=True)
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail={"code": "AGENT_ERROR", "message": str(e)},
    )

# 从 result 中提取各字段，缺失时使用默认值
# answer_mode 告诉前端回答类型："rag" 显示来源、"llm_direct" 显示⚠️提示
return ChatResponse(
    session_id=req.session_id,
    answer=result.get("answer", ""),
    answer_mode=result.get("answer_mode", "llm_direct"),
    confidence=result.get("confidence", 0.0),
    sources=result.get("sources", []),
    fallback_used=result.get("fallback_used", False),
)
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 92 | `result = await graph.ainvoke(initial_state, config=config)` | 执行完整图流程 |
| 93~98 | `except Exception as e: ... raise HTTPException(500)` | 捕获所有异常，返回 500 错误 |
| 102~109 | `return ChatResponse(...)` | 从 result 中提取字段，使用 `.get()` 加默认值 |

**防御性字段提取**：
- `result.get("answer", "")`：图执行失败时 result 可能缺少某些字段，用 `.get()` 加默认值避免 KeyError
- `answer_mode` 默认值 `"llm_direct"`：如果图执行异常未能生成 answer_mode，默认走最保守的显示模式

---

## 五、`POST /chat/stream`：SSE 流式接口（第 112~229 行）

### 5.1 函数签名

```python
# qa.py 第 112~126 行
@router.post("/chat/stream")
async def chat_stream(
    req: ChatRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    智能问答流式接口（SSE），与 /chat 入参相同，响应改为流式推送。

    SSE 事件类型：
      progress  → 节点开始时的进度提示（如"理解问题中..."）
      token     → LLM 生成的实时 token（逐字推送）
      meta      → 流结束后推送的元数据（answer_mode / confidence / sources）
      done      → 流结束标记
      error     → 异常信息
    """
```

### 5.2 SSE 事件格式

```
data: {"type": "progress", "stage": "理解问题中..."}

data: {"type": "token", "content": "Spring"}

data: {"type": "token", "content": " IOC"}

data: {"type": "meta", "session_id": "...", "answer_mode": "rag", "confidence": 0.91, "sources": [...]}

data: {"type": "done"}
```

| 事件类型 | 推送时机 | 前端处理 |
|---------|---------|---------|
| `progress` | 节点开始时 | 显示进度提示 |
| `token` | LLM 生成 token 时 | 追加到回答文本框 |
| `meta` | 流结束后 | 设置 answer_mode、显示来源 |
| `done` | 全部结束后 | 关闭 loading 状态 |
| `error` | 异常发生时 | 显示错误提示 |

### 5.3 配置常量（第 144~154 行）

```python
# qa.py 第 144~154 行
# 只对这三个生成节点做 token 级流式推送
_GENERATE_NODES = {"generate_rag", "generate_direct", "generate_general"}

# 节点开始时推送的进度文案
_PROGRESS_LABELS = {
    "classify_query":      "理解问题中...",
    "hyde_generate":       "理解问题中...",
    "multi_query_rewrite": "改写查询中...",
    "retrieve":            "召回相关文档...",
    "web_search":          "搜索互联网...",
    "generate_general":    "思考中...",
}
```

| 常量 | 说明 |
|------|------|
| `_GENERATE_NODES` | 需要 token 级流式推送的节点集合 |
| `_PROGRESS_LABELS` | 节点开始时的进度文案映射 |

**不是所有节点都有进度提示**：`generate_rag`、`generate_direct` 没有进度文案，因为它们的 token 流会直接通过 `on_chat_model_stream` 事件推送。

### 5.4 事件生成器（第 156~227 行）

```python
# qa.py 第 156~227 行
async def event_generator():
    answer_mode = "llm_direct"
    confidence = 0.0
    sources: list[str] = []

    try:
        # astream_events 监听所有事件，按 event 类型过滤
        async for event in graph.astream_events(
            initial_state, config=config, version="v2"
        ):
            evt = event["event"]
            node = event.get("metadata", {}).get("langgraph_node", "")

            # ── on_chain_start：节点开始 → 推送进度 ──────────
            if evt == "on_chain_start" and node in _PROGRESS_LABELS:
                yield {
                    "data": json.dumps(
                        {"type": "progress", "stage": _PROGRESS_LABELS[node]},
                        ensure_ascii=False,
                    )
                }

            # ── on_chat_model_stream：LLM token → 推送 ────────
            elif evt == "on_chat_model_stream" and node in _GENERATE_NODES:
                chunk = event["data"].get("chunk")
                if chunk and chunk.content:
                    yield {
                        "data": json.dumps(
                            {"type": "token", "content": chunk.content},
                            ensure_ascii=False,
                        )
                    }

            # ── on_chain_end：生成节点结束 → 捕获元数据 ──────
            elif evt == "on_chain_end" and node in _GENERATE_NODES:
                output = event["data"].get("output", {})
                if isinstance(output, dict):
                    _mode = output.get("answer_mode")
                    if _mode:
                        answer_mode = _mode
                    _srcs = output.get("sources")
                    if _srcs is not None:
                        sources = _srcs
                    _conf = (output.get("structured_output") or {}).get("confidence")
                    if _conf is not None:
                        confidence = _conf

    except Exception as e:
        logger.error("chat_stream.error", error=str(e), exc_info=True)
        yield {
            "data": json.dumps(
                {"type": "error", "message": "流式输出异常，请使用普通接口重试"},
                ensure_ascii=False,
            )
        }
        return

    # ── 元数据帧（流结束后一次性推送）──────────────────────
    yield {
        "data": json.dumps(
            {
                "type":        "meta",
                "session_id":  req.session_id,
                "answer_mode": answer_mode,
                "confidence":  confidence,
                "sources":     sources,
            },
            ensure_ascii=False,
        )
    }
    yield {"data": json.dumps({"type": "done"})}
```

| 行号 | 事件过滤 | 动作 | 说明 |
|------|---------|------|------|
| 163 | `graph.astream_events(..., version="v2")` | 监听 | LangGraph 流式事件 API v2 版本 |
| 170~176 | `on_chain_start` + node in `_PROGRESS_LABELS` | 推送 progress | 节点开始时推送进度提示 |
| 179~187 | `on_chat_model_stream` + node in `_GENERATE_NODES` | 推送 token | LLM 实时 token 逐字推送 |
| 190~201 | `on_chain_end` + node in `_GENERATE_NODES` | 捕获元数据 | 生成节点结束时提取 answer_mode、sources、confidence |
| 203~210 | `except Exception` | 推送 error | 异常时推送 error 事件 |
| 214~226 | 流结束后 | 推送 meta + done | 一次性推送元数据后结束 |

**事件过滤**：通过 `evt` + `node` 双重过滤：

| 事件 | 节点 | 动作 |
|------|------|------|
| `on_chain_start` | 在 `_PROGRESS_LABELS` 中 | 推送进度 |
| `on_chat_model_stream` | 在 `_GENERATE_NODES` 中 | 推送 token |
| `on_chain_end` | 在 `_GENERATE_NODES` 中 | 捕获元数据 |

**`meta` 事件在流结束后推送**：因为 `answer_mode` 和 `confidence` 只有在生成节点执行完毕后才能确定。前端收到 `meta` 事件后更新 UI 样式（显示来源、显示 ⚠️ 提示等）。

**`ensure_ascii=False`**：确保中文内容不被转义为 `\uXXXX`。

---

## 六、`GET /sessions/{id}/history`：会话历史（第 231~293 行）

### 6.1 函数签名

```python
# qa.py 第 231~242 行
@router.get("/sessions/{session_id}/history", response_model=HistoryResponse)
async def get_session_history(
    session_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    获取会话历史消息与摘要。

    从两个数据源读取：
      1. qa_sessions 表 → 对话摘要（summary 字段）
      2. MemorySaver → 历史消息列表（通过 graph.aget_state 读取）
    """
```

### 6.2 双数据源逐行精读（第 243~293 行）

```python
# qa.py 第 243~293 行
from sqlalchemy import text as sa_text
from langchain_core.messages import HumanMessage as LCHuman, AIMessage as LCAi
from backend.dependencies import AsyncSessionLocal

student_id = current_user["user_id"]
thread_id = build_thread_id(student_id, session_id)

# ── ① 从 DB 读摘要 ────────────────────────────────────────
summary = None
try:
    async with AsyncSessionLocal() as db_session:
        result = await db_session.execute(
            sa_text(
                "SELECT summary FROM qa_sessions "
                "WHERE thread_id = :tid AND student_id = :sid"
            ),
            {"tid": thread_id, "sid": student_id},
        )
        row = result.fetchone()
        if row:
            summary = row[0]
except Exception as e:
    logger.warning("get_history.db_error", error=str(e))

# ── ② 从 MemorySaver 读消息历史 ──────────────────────────
messages: list[SessionMessage] = []
total_turns = 0
try:
    graph = build_qa_graph()
    config = {"configurable": {"thread_id": thread_id}}
    state = await graph.aget_state(config)
    if state and state.values:
        for msg in state.values.get("messages", []):
            content = (
                msg.text
                if hasattr(msg, "text") and not callable(msg.text)
                else str(msg.content)
            )
            if isinstance(msg, LCHuman):
                messages.append(SessionMessage(role="user", content=content, created_at=""))
            elif isinstance(msg, LCAi):
                messages.append(SessionMessage(role="assistant", content=content, created_at=""))
        total_turns = sum(1 for m in messages if m.role == "user")
except Exception as e:
    logger.warning("get_history.checkpoint_error", error=str(e))

return HistoryResponse(
    session_id=session_id,
    messages=messages,
    summary=summary,
    total_turns=total_turns,
)
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 243~245 | `from sqlalchemy import text ...` | 函数内导入，避免模块级依赖 |
| 247~248 | `student_id = ...; thread_id = ...` | 构造 thread_id |
| 251~265 | **① 从 DB 读摘要** | 查询 `qa_sessions` 表获取 `summary` 字段 |
| 253~264 | `async with AsyncSessionLocal() as db_session: ...` | 异步 DB 查询，异常时静默 |
| 256~259 | `SELECT summary FROM qa_sessions WHERE thread_id = :tid AND student_id = :sid` | 按 thread_id 和 student_id 查询 |
| 268~287 | **② 从 MemorySaver 读消息历史** | 通过 `graph.aget_state` 读取 |
| 271~272 | `graph = build_qa_graph(); config = {"configurable": {"thread_id": thread_id}}` | 构建临时图实例 |
| 273 | `state = await graph.aget_state(config)` | 从 MemorySaver 读取 State |
| 275~284 | `for msg in state.values.get("messages", []): ...` | 遍历消息列表，区分 user/assistant |
| 276~279 | `content = msg.text if hasattr(msg, "text") ... else str(msg.content)` | 兼容新旧版本的消息格式 |
| 285 | `total_turns = sum(1 for m in messages if m.role == "user")` | 统计用户消息数作为总轮数 |
| 286~287 | `except Exception as e: logger.warning(...)` | 异常静默 |
| 289~293 | `return HistoryResponse(...)` | 返回完整历史响应 |

**双数据源设计**：

| 数据源 | 存储内容 | 用途 |
|--------|---------|------|
| `qa_sessions` 表（PostgreSQL） | 对话摘要 `summary` | 显示摘要文本 |
| MemorySaver（内存） | 完整消息列表 | 显示历史消息 |

---

## 七、★ Insight ─── 设计亮点总结

### 7.1 两种接口模式

| 接口 | 适用场景 | 响应方式 | 前端实现 |
|------|---------|---------|---------|
| `POST /chat` | 非实时场景 | 一次性 JSON | 普通 fetch |
| `POST /chat/stream` | 实时对话 | SSE 事件流 | fetch + ReadableStream |

### 7.2 SSE 四类事件

```
progress → token → token → ... → token → meta → done
```

前端按事件类型分别处理：

| 事件 | 处理 |
|------|------|
| `progress` | 显示/更新进度提示 |
| `token` | 追加到回答文本框 |
| `meta` | 设置 answer_mode、显示来源 |
| `done` | 关闭 loading 状态 |

### 7.3 `web_search_results` 每轮重置

```python
"web_search_results": [],  # 每轮重置，防止上轮搜索结果污染本轮 sources
```

**这是关键设计**：上一轮的搜索结果不能留到本轮。如果上一轮搜索了"Spring IOC"并得到结果，本轮问"它的优缺点"时，上一轮的搜索结果还在，会污染本轮的 `sources`。

### 7.4 每次请求编译新图实例

```python
graph = build_qa_graph()  # 每次请求都编译，~10ms
```

LangGraph 的编译开销很小，每次请求编译新实例是安全且推荐的模式。不需要缓存图实例。

### 7.5 双数据源历史查询

DB 存摘要，MemorySaver 存消息列表。摘要用于快速预览，消息列表用于完整查看。

### 7.6 防御性字段提取

```python
result.get("answer", "")
result.get("answer_mode", "llm_direct")
result.get("confidence", 0.0)
```

所有字段用 `.get()` 加默认值，图执行异常时不会 KeyError。

### 7.7 `ensure_ascii=False`

SSE 事件中的中文内容设置 `ensure_ascii=False`，避免中文字符被转义为 `\uXXXX`，前端可以直接使用。

### 7.8 与第 8 章 Orchestrator 的关系

```
第 5 章：直接调图 → build_qa_graph() → graph.ainvoke()
第 8 章：走 Orchestrator 路由层 → /chat 统一入口分发到不同 Agent
```

流式接口 `/chat/stream` 和历史接口 `/sessions/{id}/history` 保持直接调图不变，因为流式场景 Orchestrator 并不介入。