# QA Agent HTTP 接口：`qa.py` 深度解析

> 源文件：`backend/api/v1/qa.py`（共 294 行）
> 对应课件：5.16 HTTP 接口（qa.py）
> 前置依赖：`graph.py`、`memory.py`、`dependencies.py`

## 一、文件定位

`qa.py` 是 QA Agent 的 HTTP API 层，提供三个端点：

```
POST /chat                   → 非流式接口（一次性返回完整回答）
POST /chat/stream            → SSE 流式接口（实时推送 token + 进度 + 元数据）
GET  /sessions/{id}/history  → 会话历史查询（消息 + 摘要）
```

---

## 二、import 分析（第 8~19 行）

```python
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
```

| import | 来源 | 用途 |
|--------|------|------|
| `APIRouter` | FastAPI | 路由注册 |
| `EventSourceResponse` | `sse_starlette.sse` | SSE 流式响应 |
| `HumanMessage` | LangChain | 构造用户消息 |
| `build_qa_graph` | `graph.py` | 构建 QA Agent 图 |
| `build_thread_id` | `memory.py` | 构造 thread_id |
| `get_current_user` | `dependencies.py` | JWT 鉴权依赖 |

---

## 三、请求/响应模型（第 25~55 行）

### 3.1 `ChatRequest`（第 25~31 行）

```python
class ChatRequest(BaseModel):
    """聊天请求体"""
    session_id:        str        = Field(..., description="会话 ID（前端生成，每次打开新对话生成一个）")
    course_id:         str | None = Field(None, description="课程 ID（可选，限定检索范围）")
    message:           str        = Field(..., min_length=1, max_length=2000, description="用户消息")
    enable_web_search: bool       = Field(False, description="低置信度时是否先走 Web Search 再给 LLM")
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `session_id` | `str` | 是 | 前端生成 UUID，每次打开新对话生成一个 |
| `course_id` | `str \| None` | 否 | 限定检索范围 |
| `message` | `str` | 是 | 1~2000 字符 |
| `enable_web_search` | `bool` | 否 | 默认 False |

**`min_length=1, max_length=2000`**：Pydantic 自动校验，用户消息不能为空、不能超过 2000 字符。

### 3.2 `ChatResponse`（第 33~41 行）

```python
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

### 3.3 `SessionMessage` / `HistoryResponse`（第 43~55 行）

```python
class SessionMessage(BaseModel):
    role:       str   # "user" / "assistant"
    content:    str
    created_at: str

class HistoryResponse(BaseModel):
    session_id:  str
    messages:    list[SessionMessage]
    summary:     str | None      # 对话摘要（压缩后）
    total_turns: int             # 总轮数
```

---

## 四、`POST /chat`：非流式接口（第 58~109 行）

### 4.1 函数签名

```python
@router.post("/chat", response_model=ChatResponse)
async def chat(
    req: ChatRequest,
    current_user: dict = Depends(get_current_user),
):
```

### 4.2 构建图与初始 State（第 69~87 行）

```python
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

**`build_qa_graph()` 每次请求都调用**：LangGraph 的编译开销很小（~10ms），每次请求编译新实例是安全且推荐的模式。不需要缓存图实例。

**`web_search_results: []` 每轮重置**：这是关键设计——上一轮的搜索结果不能留到本轮。如果上一轮搜索了"Spring IOC"并得到结果，本轮问"它的优缺点"时，上一轮的搜索结果还在，会污染本轮的 `sources`。

**`query_type: "PRECISE"` 占位初始值**：`classify_query_node` 内部会动态覆盖这个值，这里只是占位。

### 4.3 执行与异常处理（第 89~109 行）

```python
try:
    result = await graph.ainvoke(initial_state, config=config)
except Exception as e:
    logger.error("chat.invoke_error", error=str(e), exc_info=True)
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail={"code": "AGENT_ERROR", "message": str(e)},
    )

return ChatResponse(
    session_id=req.session_id,
    answer=result.get("answer", ""),
    answer_mode=result.get("answer_mode", "llm_direct"),
    confidence=result.get("confidence", 0.0),
    sources=result.get("sources", []),
    fallback_used=result.get("fallback_used", False),
)
```

**`result.get("answer", "")`**：防御性提取。图执行失败时 `result` 可能缺少某些字段，用 `.get()` 加默认值避免 KeyError。

**`answer_mode` 默认值 `"llm_direct"`**：如果图执行异常未能生成 answer_mode，默认走最保守的显示模式。

---

## 五、`POST /chat/stream`：SSE 流式接口（第 112~228 行）

### 5.1 SSE 事件格式

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

### 5.2 进度文案配置（第 147~154 行）

```python
_PROGRESS_LABELS = {
    "classify_query":      "理解问题中...",
    "hyde_generate":       "理解问题中...",
    "multi_query_rewrite": "改写查询中...",
    "retrieve":            "召回相关文档...",
    "web_search":          "搜索互联网...",
    "generate_general":    "思考中...",
}
```

**不是所有节点都有进度提示**：`generate_rag`、`generate_direct` 没有进度文案，因为它们的 token 流会直接通过 `on_chat_model_stream` 事件推送。

### 5.3 事件生成器（第 156~227 行）

```python
async def event_generator():
    answer_mode = "llm_direct"
    confidence = 0.0
    sources: list[str] = []

    try:
        async for event in graph.astream_events(
            initial_state, config=config, version="v2"
        ):
            evt = event["event"]
            node = event.get("metadata", {}).get("langgraph_node", "")

            # ── on_chain_start：节点开始 → 推送进度 ──────────
            if evt == "on_chain_start" and node in _PROGRESS_LABELS:
                yield {"data": json.dumps({"type": "progress", "stage": _PROGRESS_LABELS[node]}, ensure_ascii=False)}

            # ── on_chat_model_stream：LLM token → 推送 ────────
            elif evt == "on_chat_model_stream" and node in _GENERATE_NODES:
                chunk = event["data"].get("chunk")
                if chunk and chunk.content:
                    yield {"data": json.dumps({"type": "token", "content": chunk.content}, ensure_ascii=False)}

            # ── on_chain_end：生成节点结束 → 捕获元数据 ──────
            elif evt == "on_chain_end" and node in _GENERATE_NODES:
                output = event["data"].get("output", {})
                if isinstance(output, dict):
                    _mode = output.get("answer_mode")
                    if _mode: answer_mode = _mode
                    _srcs = output.get("sources")
                    if _srcs is not None: sources = _srcs
                    _conf = (output.get("structured_output") or {}).get("confidence")
                    if _conf is not None: confidence = _conf
```

**`astream_events` 的 `version="v2"`**：LangGraph 的流式事件 API v2 版本，提供更稳定的事件结构。

**事件过滤**：通过 `evt` + `node` 双重过滤：

| 事件 | 节点 | 动作 |
|------|------|------|
| `on_chain_start` | 在 `_PROGRESS_LABELS` 中 | 推送进度 |
| `on_chat_model_stream` | 在 `_GENERATE_NODES` 中 | 推送 token |
| `on_chain_end` | 在 `_GENERATE_NODES` 中 | 捕获元数据 |

### 5.4 元数据与结束帧（第 213~226 行）

```python
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

**`meta` 事件在流结束后推送**：因为 `answer_mode` 和 `confidence` 只有在生成节点执行完毕后才能确定。前端收到 `meta` 事件后更新 UI 样式（显示来源、显示⚠️提示等）。

**`ensure_ascii=False`**：确保中文内容不被转义为 `\uXXXX`。

---

## 六、`GET /sessions/{id}/history`：会话历史（第 231~294 行）

### 6.1 函数签名

```python
@router.get("/sessions/{session_id}/history", response_model=HistoryResponse)
async def get_session_history(
    session_id: str,
    current_user: dict = Depends(get_current_user),
):
```

### 6.2 双数据源（第 243~287 行）

```python
# ── ① 从 DB 读摘要 ────────────────────────────────────────
summary = None
try:
    async with AsyncSessionLocal() as db_session:
        result = await db_session.execute(
            sa_text("SELECT summary FROM qa_sessions WHERE thread_id = :tid AND student_id = :sid"),
            {"tid": thread_id, "sid": student_id},
        )
        row = result.fetchone()
        if row: summary = row[0]
except Exception as e:
    logger.warning("get_history.db_error", error=str(e))

# ── ② 从 MemorySaver 读消息历史 ──────────────────────────
messages: list[SessionMessage] = []
try:
    graph = build_qa_graph()
    state = await graph.aget_state(config)
    if state and state.values:
        for msg in state.values.get("messages", []):
            content = ...  # 兼容新旧版本
            if isinstance(msg, LCHuman):
                messages.append(SessionMessage(role="user", content=content, created_at=""))
            elif isinstance(msg, LCAi):
                messages.append(SessionMessage(role="assistant", content=content, created_at=""))
        total_turns = sum(1 for m in messages if m.role == "user")
except Exception as e:
    logger.warning("get_history.checkpoint_error", error=str(e))
```

**双数据源设计**：

| 数据源 | 存储内容 | 用途 |
|--------|---------|------|
| `qa_sessions` 表（PostgreSQL） | 对话摘要 `summary` | 显示摘要文本 |
| MemorySaver（内存） | 完整消息列表 | 显示历史消息 |

**`graph.aget_state(config)`**：LangGraph 的 `aget_state` 方法从 MemorySaver 中读取指定 `thread_id` 的 State，包含所有历史消息。

**`total_turns = sum(1 for m in messages if m.role == "user")`**：统计用户消息数作为总轮数。

---

## 七、`★` 设计亮点总结

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