---
author: "XunZong"
created: "2026-07-30"
tags: ["Tools", "FastAPI", "SSE", "流式响应"]
aliases: ["SSE流式响应", "EventSourceResponse", "服务器推送", "Server-Sent Events"]
---

# FastAPI SSE 流式响应

## 定义

**SSE（Server-Sent Events，服务器推送事件）** 让服务器和浏览器保持连接，持续不断地往外推送一小段一小段内容，实现"打字机"效果。FastAPI 用 `sse-starlette` 库的 `EventSourceResponse` 实现。

## 实现方式

```python
import asyncio
import json
from fastapi import FastAPI
from sse_starlette.sse import EventSourceResponse

app = FastAPI()

@app.post("/chat/stream")
async def chat_stream():
    async def event_generator():
        answer = "装饰器是一种包装函数的语法。"
        for char in answer:                       # 模拟逐字生成
            await asyncio.sleep(0.1)
            yield {"data": json.dumps({"type": "token", "content": char})}
        yield {"data": json.dumps({"type": "done"})}   # 结束标志

    return EventSourceResponse(event_generator())
```

## 与大模型串联

真实场景中，`for char in answer` 换成大模型的流式输出：

```python
@app.post("/qa/stream")
async def qa_stream(question: str):
    async def event_generator():
        messages = [HumanMessage(content=question)]
        async for chunk in llm.astream(messages):
            if chunk.text:
                yield {"data": json.dumps({"type": "token", "content": chunk.text})}
        yield {"data": json.dumps({"type": "done"})}

    return EventSourceResponse(event_generator())
```

## 面试追问

**Q1（基础）**：SSE 流式响应是如何实现的？EventSourceResponse 接收什么类型的参数？
**回答要点**：
1. EventSourceResponse 接收一个异步生成器，生成器每 yield 一次就向前端推送一个事件
2. 每个事件是 `{"data": "..."}` 字典，data 里放 JSON 字符串
3. 真实场景中结合 `llm.astream()` 实时转发模型输出的每个 token

**Q2（深挖）**：SSE 和 WebSocket 的核心区别是什么？在 LLM 场景中分别适用于什么场景？
**回答要点**：
1. SSE 是服务端到客户端的单向流，基于 HTTP 长连接，浏览器内置自动重连
2. WebSocket 是全双工通信，需要协议升级握手，支持文本和二进制
3. LLM 流式输出（逐 token 生成）适合 SSE，因为数据流方向固定
4. 实时对话交互（用户随时打断、Agent 工具调用反馈）适合 WebSocket

**Q3（实战）**：FastAPI 的 SSE 实现中，EventSourceResponse 的异步生成器如果抛出异常会怎样？
**回答要点**：
1. 生成器内的异常会被 EventSourceResponse 捕获，自动断开 SSE 连接
2. 前端 EventSource 会触发 onerror 回调，然后自动尝试重连
3. 可以在生成器内加 try-except 捕获异常，返回错误事件而不是直接崩溃

**Q4（边界）**：高并发场景下 SSE 连接数过多会有什么问题？如何优化？
**回答要点**：
1. 每个 SSE 连接占用一个长连接，Web 服务器有最大连接数限制
2. 优化方案：使用异步框架（FastAPI 本身是异步的），配合 Nginx 的 keepalive 和连接池
3. 也可以使用 WebSocket 替代 SSE，减少连接数（WebSocket 支持复用）
4. 对于不需要实时推送的场景，改用轮询（polling）减轻服务器压力

## 参考引用
- 需要理解 SSE 协议基础概念的相关知识，参见 [WebSocket与SSE流式输出](../../网络/02-WebSocket与SSE流式输出.md)
- 需要理解 FastAPI 依赖注入的相关知识，参见 [FastAPI依赖注入](07-FastAPI依赖注入.md)
- 需要理解 FastAPI 基础部署的相关知识，参见 [Flask与FastAPI模型部署](02-Flask与FastAPI模型部署.md)