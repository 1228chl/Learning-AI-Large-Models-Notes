---
author: "XunZong"
created: "2026-07-06"
tags: ["Python", "网络编程", "Socket"]
aliases: ["Socket", "网络编程", "TCP", "UDP"]
---

# Socket 网络编程

## 网络编程三要素

| 要素 | 作用 | 类比 |
|------|------|------|
| **IP 地址** | 标识网络中的设备 | 家庭地址 |
| **端口号** | 标识设备上的特定进程 | 门牌号 |
| **协议** | 规定数据传输的规则 | 通信语言（普通话 vs 方言） |

## TCP vs UDP

| 对比维度 | TCP | UDP |
|----------|-----|-----|
| **连接** | 面向连接（三次握手） | 无连接 |
| **可靠性** | 可靠传输，有重传机制 | 不可靠，可能丢包 |
| **顺序** | 保序 | 不保序 |
| **速度** | 较慢 | 较快 |
| **适用场景** | 网页、文件传输、邮件 | 直播、DNS 查询、游戏 |

## TCP Socket 基本模式

```python
# === 服务端（Server） ===
import socket
# 创建 TCP 套接字：AF_INET 表示 IPv4，SOCK_STREAM 表示 TCP 协议
server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
# 绑定 IP 和端口：'0.0.0.0' 表示监听所有网卡地址
server.bind(('0.0.0.0', 8080))    # 绑定地址和端口
# 开始监听：参数 5 表示最大等待连接数（连接队列长度）
server.listen(5)                   # 监听，最多 5 个排队
# accept 是阻塞调用：等待客户端连接，返回新套接字和客户端地址
conn, addr = server.accept()       # 阻塞等待客户端连接
# 从客户端接收数据，最多 1024 字节（需要循环读取以获取完整消息）
data = conn.recv(1024)             # 接收数据
# 向客户端发送二进制数据（字符串需编码为 bytes）
conn.send(b'Hello')                # 发送数据
# 关闭连接，释放资源（触发 TCP 四次挥手）
conn.close()

# === 客户端（Client） ===
client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
# 连接到服务端：127.0.0.1 表示本地回环地址（本机）
client.connect(('127.0.0.1', 8080))
# 向服务端发送二进制数据
client.send(b'Hello Server')
# 接收服务端的响应
data = client.recv(1024)
client.close()
```

## ML/DL 中的网络通信

| 场景 | 协议 | 数据量 | 说明 |
|------|------|--------|------|
| **分布式训练（NCCL）** | 自定义（基于 TCP/RDMA） | 大（梯度张量） | GPU 间梯度同步 |
| **模型推理 API** | HTTP/TCP | 小（输入输出） | Flask/FastAPI/Triton 部署 |
| **数据管道** | TCP/Unix Socket | 大 | 多进程间传输数据 batch |
| **WebSocket 流式输出** | WebSocket | 中等 | 流式 LLM 推理输出 |

## HTTP 协议基础

```python
# 最简 HTTP 服务端：基于标准库 http.server 实现，封装了底层 Socket 细节
from http.server import HTTPServer, BaseHTTPRequestHandler

# 自定义请求处理器：继承 BaseHTTPRequestHandler 并重写 do_GET 方法
class Handler(BaseHTTPRequestHandler):
    # 处理 GET 请求：当客户端发起 GET 请求时自动调用此方法
    def do_GET(self):
        # 发送 HTTP 响应状态码（200 表示成功）
        self.send_response(200)
        # 设置响应头：告知客户端返回内容的类型
        self.send_header('Content-type', 'text/plain')
        # 结束响应头部，之后发送的内容属于响应体
        self.end_headers()
        # 写入响应体内容（wfile 是用于写入响应的文件类对象）
        self.wfile.write(b'Hello, AI World!')

# 创建 HTTP 服务实例：绑定到 0.0.0.0:8000，使用自定义的 Handler 处理请求
server = HTTPServer(('0.0.0.0', 8000), Handler)
# 启动服务并永久运行，监听并处理进入的 HTTP 请求
server.serve_forever()
```

> 在实际 ML 工程中，很少直接使用原生 Socket。但理解其底层原理对调试分布式训练的网络问题、配置推理服务的超时参数至关重要。

## 面试追问

**Q1（基础）**：TCP Socket 编程中服务端需要执行哪些核心步骤？各步骤的作用是什么？
**回答要点**：

1. `socket()` — 创建套接字对象，指定地址族（AF_INET）和协议类型（SOCK_STREAM）
2. `bind()` — 绑定 IP 地址和端口号，明确服务端的监听地址
3. `listen()` — 启动监听，参数设置最大等待连接队列长度
4. `accept()` — 阻塞等待客户端连接，返回新套接字和客户端地址
5. `recv()` / `send()` — 通过返回的连接套接字收发数据
6. `close()` — 关闭连接，触发四次挥手并释放系统资源

**Q2（深挖）**：TCP 三次握手和四次挥手分别发生在 Socket 编程的哪个阶段？`close()` 会立即释放资源吗？
**回答要点**：

1. 三次握手发生在客户端调用 `connect()` 和服务端返回 `accept()` 之间，用于建立 TCP 连接
2. 四次挥手在任意一方调用 `close()` 时触发，用于有序终止 TCP 连接
3. `close()` 不会立即释放资源，主动关闭方需经历 TIME_WAIT 状态（约 2MSL），期间端口可能被占用，高并发服务端需注意此问题

**Q3（实战）**：在分布式训练中，NCCL 通信超时排查时通常需要关注哪些网络层面的问题？
**回答要点**：

1. 防火墙是否阻挡了 NCCL 通信端口（通常为 29500-29600），导致节点间无法建立连接
2. 网卡带宽是否被打满，导致梯度张量传输速度过慢而超时
3. 跨节点网络延迟是否过高（通过 ping 往返时间判断），远距离节点间延迟问题放大
4. TCP 缓冲区大小是否适配大张量传输，需调整 `rmem` / `wmem` 内核参数避免瓶颈

**Q4（边界）**：原生 Socket 在处理大量并发连接时有什么不足之处？通常用什么方案替代？
**回答要点**：

1. 原生 Socket 阻塞模型每连接需一个线程，C10K 问题下线程资源耗尽、上下文切换开销巨大
2. 可使用 select/poll/epoll 实现事件驱动 I/O 多路复用，单线程处理数万并发连接
3. 实际工程中更常用 FastAPI（基于 ASGI）、Tornado、aiohttp 等封装了异步 I/O 的高层框架

## 参考引用
- 需要理解进程与线程的相关知识，参见 [进程与线程](./06-进程与线程.md)
- 需要理解进程与多进程的相关知识，参见 [进程与多进程](./14-进程与多进程.md)
- 需要理解协程与asyncio的相关知识，参见 [协程与asyncio](./10-协程与asyncio.md)
