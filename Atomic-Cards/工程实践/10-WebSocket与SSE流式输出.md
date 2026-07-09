---
author: "XunZong"
created: "2026-07-09"
tags: ["工程实践", "FastAPI", "实时通信"]
aliases: ["WebSocket", "SSE", "流式输出", "Server-Sent Events"]
---

# WebSocket 与 SSE 流式输出

## 定义

SSE（Server-Sent Events）和 WebSocket 是两种主流的实时通信技术。SSE 是**服务端到客户端的单向流式协议**，基于 HTTP 长连接；WebSocket 是**全双工通信协议**，支持客户端和服务器双向实时通信。在 LLM 和 AI 应用中，两者分别承担流式文本输出和实时对话交互的核心角色。

## SSE（Server-Sent Events）

```python
# SSE 核心特性：服务端单向推送，基于 HTTP 长连接，使用 text/event-stream 格式
# 适用于：实时进度条、通知推送、日志流、LLM 逐 token 输出
# 浏览器原生支持 EventSource API，无需额外库

from fastapi.responses import StreamingResponse
import asyncio

# 生成器函数：逐条产生 SSE 事件，每条事件以 "data: " 开头，以 "\n\n" 结束
async def sse_generator():
    for i in range(5):
        # SSE 标准格式：data: <payload>\n\n
        # 浏览器端通过 event.data 获取 payload 内容
        yield f"data: Progress {i * 20}%\n\n"
        await asyncio.sleep(1)

@app.get("/sse")
async def sse_endpoint():
    # StreamingResponse 将生成器的输出逐块流式发送给客户端
    # media_type 必须设置为 "text/event-stream" 以标识 SSE 协议
    return StreamingResponse(sse_generator(), media_type="text/event-stream")
```

## WebSocket

```python
# WebSocket 核心特性：全双工通信，双方可随时发送消息
# 适用于：聊天应用、实时协作编辑、在线游戏、股票行情推送
# FastAPI 通过 @app.websocket 装饰器提供原生 WebSocket 支持

from fastapi import WebSocket

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    # 第一步：接受 WebSocket 连接，完成 HTTP -> WebSocket 的协议升级握手
    await websocket.accept()
    # 第二步：双向通信阶段，服务端持续推送消息
    for i in range(5):
        await asyncio.sleep(1)
        await websocket.send_text(f"Message {i}")
    # 第三步：主动关闭连接，释放资源
    # 实际生产应使用 try/except 处理客户端断开等异常
    await websocket.close()
```

## 对比

| 特性 | SSE | WebSocket |
|:----:|:----|:----------|
| **通信方向** | 服务端 -> 客户端单向 | 双向全双工 |
| **底层协议** | 基于 HTTP | 独立协议 (`ws://` / `wss://`) |
| **协议复杂度** | 简单，标准 HTTP 即可 | 较复杂，需协议升级握手 |
| **浏览器支持** | 原生 `EventSource` API | 原生 `WebSocket` API |
| **自动重连** | 内置自动重连机制 | 需手动实现重连逻辑 |
| **LLM 场景** | 流式输出文本（逐 token） | 对话交互、实时协作 |
| **消息格式** | 仅文本（`text/event-stream`） | 文本和二进制 |
| **连接数限制** | 浏览器限制 6 个/域名 | 无限制 |

## ML/DL 应用场景

| 应用场景 | 推荐技术 | 说明 |
|:--------:|:--------:|:----|
| **LLM 流式输出** | SSE | ChatGPT 逐 token 返回，客户端实时展示 |
| **实时对话交互** | WebSocket | 语音助手、Agent 实时对话 |
| **训练进度监控** | SSE | 分布式训练日志实时推送 Dashboard |
| **AI 协作编辑** | WebSocket | 多人同时编辑 AI 生成的代码/文档 |
| **模型推理状态推送** | SSE | 长耗时推理任务的进度条更新 |
| **Agent 实时反馈** | WebSocket | Agent 工具调用过程的实时状态推送 |

## 面试追问

**Q1（基础）**：SSE 和 WebSocket 的核心区别是什么？在 LLM 场景中分别适用于什么场景？
**回答要点**：

1. SSE 是服务端到客户端的单向流，基于 HTTP 长连接，浏览器内置自动重连，实现简单
2. WebSocket 是全双工通信，需要协议升级握手，支持文本和二进制，需手动处理重连
3. LLM 流式输出（逐 token 生成）适合 SSE，因为数据流方向固定且浏览器原生支持
4. 实时对话交互（用户随时打断、Agent 工具调用反馈）适合 WebSocket，需要双向通信

**Q2（深挖）**：为什么大多数 LLM API（如 OpenAI、Anthropic）的流式输出采用 SSE 而非 WebSocket？
**回答要点**：

1. LLM 生成文本是单向流（服务端 -> 客户端），SSE 天然匹配此通信模式
2. SSE 基于标准 HTTP，无需协议升级，兼容性好，可通过标准负载均衡和代理
3. SSE 浏览器内置 EventSource API，客户端实现极简单，无需额外依赖
4. WebSocket 的全双工能力在纯文本生成场景中属于过度设计，增加复杂度

**Q3（实战）**：使用 FastAPI 实现 SSE 流式输出时，需要注意哪些关键点？
**回答要点**：

1. 使用 `StreamingResponse` 配合 async generator，media_type 设为 `text/event-stream`
2. 每条 SSE 消息必须以 `data: ` 开头、`\n\n` 结尾，严格遵循 SSE 协议格式
3. 生产环境需添加超时控制：设置 `asyncio.wait_for` 防止生成器无限挂起
4. 考虑客户端断开连接的处理：生成器应检测并清理资源，避免内存泄漏
5. 配合 Nginx 等反向代理时，需禁用缓冲（`proxy_buffering off`）确保实时性

**Q4（边界）**：WebSocket 连接管理中有哪些常见陷阱？如何设计高可用的 WebSocket 服务？
**回答要点**：

1. 连接泄漏：客户端断开后服务端未检测到，需实现心跳检测（ping/pong）机制
2. 消息可靠性：WebSocket 不保证消息送达，需在应用层实现 ACK 确认和重传
3. 水平扩展：WebSocket 是有状态长连接，需使用 Redis Pub/Sub 或消息队列广播消息
4. 优雅关闭：服务端关闭时应先发送关闭帧（close frame），等待客户端确认后再释放资源
5. 限流保护：为每个 WebSocket 连接设置消息速率限制，防止单个连接压垮服务端

## 参考引用

- 需要理解 Flask 与 FastAPI 模型部署的相关知识，参见 [Flask与FastAPI模型部署](./04-Flask与FastAPI模型部署.md)
- 需要理解 LLM API 调用与 ChatBot 的相关知识，参见 [LLM API调用与ChatBot](./07-LLM%20API调用与ChatBot.md)
- 需要理解 Docker 基础与容器化的相关知识，参见 [Docker基础与容器化](./01-Docker基础与容器化.md)
- 需要理解 HTTP 基础与 API 设计的相关知识，参见 [HTTP基础与API设计](./08-HTTP基础与API设计.md)