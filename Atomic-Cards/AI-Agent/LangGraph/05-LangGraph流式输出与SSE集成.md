---
author: "XunZong"
created: "2026-07-30"
tags: ["AI-Agent", "LangGraph", "流式输出", "SSE", "astream_events", "EventSourceResponse"]
aliases: ["LangGraph Streaming", "astream_events", "SSE集成", "流式输出", "LangGraph SSE"]
---

# LangGraph 流式输出与 SSE 集成

## 定义

LangGraph 流式输出是通过 `graph.astream_events()` 将图执行过程中每个节点产生的事件（模型开始推理、逐 token 生成、节点完成）以异步生成器形式实时推送，配合 SSE（Server-Sent Events）将事件封装为 `data:` 帧发送给前端，实现"思考中..."状态提示和逐字打字效果的完整技术链路。

核心知识链：`return`（一次性返回）→ `yield`（同步分批）→ `async yield`（异步分批）→ `async for`（持续接收）→ `graph.astream_events()`（图事件流）→ `EventSourceResponse`（SSE 封装）→ 前端 `EventSource`（监听渲染）。

## 知识链：从 return 到 SSE

| 阶段 | 语法/API | 行为 | 用户体验 |
|------|---------|------|---------|
| 同步返回 | `return result` | 等待全部生成完毕，一次性返回 | 白屏等待 30-60 秒 |
| 同步生成器 | `yield token` | 分批产出，但阻塞事件循环 | 少量改善 |
| 异步生成器 | `async yield token` + `async for` | 分批产出，不阻塞事件循环 | 逐字输出，但粒度粗 |
| SSE 封装 | `EventSourceResponse(generator)` | 标准 HTTP 协议，`data:` 帧格式 | 浏览器原生 `EventSource` 支持 |
| LangGraph 事件流 | `graph.astream_events(state, version="v2")` | 自动捕获每个节点的各类事件 | 前端可区分"思考/打字/完成" |

## 直观理解

> 看球赛直播 vs 看赛后录像——同步 API 是"等比赛结束给你看完整录像"（30 秒白屏），流式输出是"解说员每看到一个动作就实时播报"（逐 token 打字效果）。LangGraph 的 `astream_events` 像一个多机位直播导演——切到"思考"镜头（on_chain_start）显示"检索中..."，切到"特写"镜头（on_chat_model_stream）逐字播出答案，切到"全景"镜头（on_chain_end）显示"完成"。前端 EventSource 就是你的电视机，持续接收直播信号。

## graph.astream_events 事件类型

```python
# LangGraph 图执行产生三类关键事件，前端按事件类型切换 UI 状态
async for event in graph.astream_events(initial_state, version="v2"):
    kind = event["event"]                        # 事件类型
    name  = event.get("name", "")                 # 触发节点名

    if kind == "on_chain_start":
        # 节点开始执行 → 前端显示 "{节点名} 思考中..."
        yield f"data: {json.dumps({'type': 'thinking', 'node': name})}\n\n"

    elif kind == "on_chat_model_stream":
        # LLM 逐 token 输出 → 前端逐字追加到气泡
        content = event["data"]["chunk"].content
        yield f"data: {json.dumps({'type': 'token', 'content': content})}\n\n"

    elif kind == "on_chain_end":
        # 节点执行完毕 → 前端结束该阶段加载态
        yield f"data: {json.dumps({'type': 'done', 'node': name})}\n\n"
```

## FastAPI SSE 端点完整实现

```python
from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse
import json

@router.post("/qa/chat/stream")
async def chat_stream(request: ChatRequest):
    """LangGraph 图执行 + SSE 流式输出"""

    async def event_generator():
        # 构建初始 State：用户问题 + 历史记忆 + thread_id
        initial_state = {
            "question": request.question,
            "thread_id": request.thread_id,
        }
        # astream_events 自动捕获图执行全过程的事件
        async for event in graph.astream_events(initial_state, version="v2"):
            kind = event["event"]
            if kind == "on_chat_model_stream":
                content = event["data"]["chunk"].content
                yield {"event": "token", "data": json.dumps({"content": content})}
            elif kind == "on_chain_start":
                yield {"event": "progress", "data": json.dumps({"node": event["name"]})}
        yield {"event": "done", "data": "{}"}

    return EventSourceResponse(event_generator())
```

`EventSourceResponse` 自动将每个 `yield` 的 dict 格式化为 `event: <type>\ndata: <json>\n\n` 标准 SSE 帧。

## AI/ML 工程应用场景

| 应用场景 | 事件类型 | 前端 UI 行为 |
|---------|---------|------------|
| AI 对话流式回复 | `on_chat_model_stream` → token 逐字追加 | 打字机效果气泡 |
| 多节点 Pipeline 进度 | `on_chain_start/end` → 节点名推送 | 顶部进度条 "检索中 → 重排序中 → 生成中" |
| Agent 工具调用可视化 | `on_tool_start/end` → 工具名 + 输入/输出 | 折叠面板展示工具调用链 |
| 长时间任务心跳 | 自定义 `heartbeat` 事件每 15s | 前端显示 "正在处理，请耐心等待..." |

## 面试追问

**Q1（基础）**：从 `return` 到 `graph.astream_events()`，经历了哪些技术跃迁？每步解决了什么问题？

**回答要点**：

1. `return`：等待全部生成完毕，用户白屏等待 30-60 秒
2. `yield`：分批产出但不支持异步，阻塞事件循环
3. `async yield` + `async for`：异步分批，不阻塞循环，但粒度由开发者手动控制
4. `graph.astream_events()`：LangGraph 自动捕获所有节点的内部事件，开发者只需遍历事件流并封装为 SSE
5. 每一步都在降低"用户感知延迟"——让用户看到系统在工作而非死等

**Q2（深挖）**：`graph.astream_events(version="v2")` 和 `graph.astream()` 的核心区别？什么时候用哪个？

**回答要点**：

1. `astream()`：按节点粒度 yield，每个节点执行完毕才产生一个输出——像"包裹追踪"（只看到站点到达）
2. `astream_events()`：细粒度事件流，每次 LLM token 生成都会触发 `on_chat_model_stream` 事件——像"GPS 实时轨迹"
3. 选 `astream_events()`：需要前端显示逐字打字效果、节点进度条、工具调用详情
4. 选 `astream()`：后端对后端调用（无前端），只需要最终 State，不需要中间过程

**Q3（实战）**：如果 SSE 连接在 LangGraph 图执行中途断开（用户关闭浏览器），图会继续执行吗？会浪费 LLM token 吗？

**回答要点**：

1. 会的——`graph.astream_events()` 返回的异步生成器在 `async for` 消费端断开时会收到 `GeneratorExit` 异常
2. 默认行为：生成器被垃圾回收时，图的执行并不会自动取消——正在进行的 LLM 调用仍会完成并消耗 token
3. 解决方案：在 `except GeneratorExit` 或 `finally` 中调用取消逻辑（如设置取消标志、通知 LangGraph 停止）
4. 生产建议：配合 `asyncio.wait_for(timeout=...)` 设置单次 LLM 调用超时，避免断开后长时间空转

**Q4（边界）**：前端 EventSource API 只支持 GET 请求，如果 SSE 端点需要 POST（携带复杂请求体），怎么解决？

**回答要点**：

1. EventSource 确实只支持 GET——不能传 body，只能 URL query string
2. 方案一：用 `fetch` + `ReadableStream` 手动解析 SSE 帧——支持 POST，但需自行处理重连逻辑
3. 方案二：先 POST 创建会话（返回 `session_id`），再 GET SSE 端点传 `session_id`——解耦请求与流式响应
4. 方案三：POST body 中的复杂参数先存入缓存（Redis），SSE GET 端点从缓存读取——适合超长参数

## 参考引用

- 需要理解 SSE 协议的标准格式和服务端推送机制：[SSE 流式输出](../../工程实践/网络/10-WebSocket与SSE流式输出.md)
- 需要理解 Python 异步生成器 `async def` + `yield` 的执行模型：[async 上下文管理器与 FastAPI lifespan 模式](../../Python/并发/19-async上下文管理器与FastAPI-lifespan模式.md)
- 需要理解 LangGraph 图模型的 State + Node + Edge 基本心智：[LangGraph 图模型四要素](../LangGraph/01-LangGraph图模型四要素.md)
- 需要理解 LangGraph Checkpointer 如何通过 thread_id 持久化多轮状态：[LangGraph Checkpointer 与记忆](../LangGraph/04-LangGraph%20Checkpointer与记忆.md)
- 需要理解协程与 asyncio 的事件循环基础：[协程与 asyncio](../../Python/并发/10-协程与asyncio.md)
