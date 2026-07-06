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
server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
server.bind(('0.0.0.0', 8080))    # 绑定地址和端口
server.listen(5)                   # 监听，最多 5 个排队
conn, addr = server.accept()       # 阻塞等待客户端连接
data = conn.recv(1024)             # 接收数据
conn.send(b'Hello')                # 发送数据
conn.close()

# === 客户端（Client） ===
client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
client.connect(('127.0.0.1', 8080))
client.send(b'Hello Server')
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
# 最简 HTTP 服务端
from http.server import HTTPServer, BaseHTTPRequestHandler

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'text/plain')
        self.end_headers()
        self.wfile.write(b'Hello, AI World!')

server = HTTPServer(('0.0.0.0', 8000), Handler)
server.serve_forever()
```

> 在实际 ML 工程中，很少直接使用原生 Socket。但理解其底层原理对调试分布式训练的网络问题、配置推理服务的超时参数至关重要。

> 参见 [[06-进程与线程]]、[[05-上下文管理器]]
