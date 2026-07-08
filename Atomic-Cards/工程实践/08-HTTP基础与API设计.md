---
author: "XunZong"
created: "2026-07-06"
tags: ["工程", "HTTP", "API"]
aliases: ["HTTP", "API设计", "RESTful"]
---

# HTTP 基础与 API 设计

## 定义

HTTP（HyperText Transfer Protocol，超文本传输协议）是 Web 通信的基础协议。LLM API 调用、模型推理服务部署都基于 HTTP 协议。理解 HTTP 是调试和开发 AI 应用的必备技能。

## HTTP 请求与响应

```python
请求(Request)                  响应(Response)
┌─────────────┐                ┌──────────────┐
│ POST /chat  │                │ 200 OK       │
│ Host: api   │ ────────→      │ Content-Type │
│ Content-Type│                │ {"text":"..."}│
│ {"msg":"hi"}│                └──────────────┘
└─────────────┘
```

## HTTP 请求方法

| 方法 | 作用 | LLM 应用场景 | 幂等 |
|:----:|:----|:------------|:---:|
| **GET** | 获取资源 | 获取模型状态、API 文档 | ✅ |
| **POST** | 创建资源 | **提交对话请求、模型推理** | ❌ |
| **PUT** | 完全更新 | 更新模型配置 | ✅ |
| **PATCH** | 部分更新 | 修改部分参数 | ❌ |
| **DELETE** | 删除资源 | 删除 dataset 记录 | ✅ |

## HTTP 状态码

| 状态码 | 含义 | LLM API 中的常见情况 |
|:-----:|:----|:--------------------|
| **200** | 成功 | 请求成功，返回结果 |
| **201** | 已创建 | 上传文件成功 |
| **400** | 请求错误 | 参数格式错误、缺少必要字段 |
| **401** | 未授权 | API Key 不正确或缺失 |
| **403** | 禁止访问 | 账户额度不足或权限不够 |
| **429** | 请求过多 | **触发速率限制（Rate Limit）** |
| **500** | 服务器内部错误 | 模型端出错，重试可能解决 |
| **503** | 服务不可用 | 模型正在加载或过载 |

```python
import requests

# 调用 LLM API 的完整错误处理：涵盖网络层和 HTTP 状态层的所有常见异常
# 生产环境应结合 tenacity 等重试库实现指数退避，而非仅打印日志
def call_llm_api(url, api_key, messages):
    # 标准 HTTP 认证头：Bearer Token 是 LLM API 通用的鉴权方式
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"    # 声明请求体为 JSON 格式
    }
    try:
        # timeout=30 同时设置连接超时和读取超时，防止网络故障时无限挂起
        response = requests.post(
            url, headers=headers,
            json={"model": "gpt-4o-mini", "messages": messages},
            timeout=30
        )
        # 根据 HTTP 状态码分场景处理，不同状态码对应不同的恢复策略
        if response.status_code == 200:
            return response.json()           # 成功：解析并返回 JSON 响应体
        elif response.status_code == 429:
            # 429 Too Many Requests：触发速率限制，应等待 Retry-After 头部指定的时长再重试
            print("速率限制，等待重试...")
        elif response.status_code == 401:
            # 401 Unauthorized：API Key 错误或过期，继续重试无意义，应停止并通知运维
            print("API Key 无效，请检查")
        else:
            print(f"错误 {response.status_code}: {response.text}")
    except requests.exceptions.Timeout:
        # 请求超时：通常是网络延迟或服务端负载过高，可重试
        print("请求超时")
    except requests.exceptions.ConnectionError:
        # 连接失败：DNS 解析错误、目标服务器不可达等网络层面问题
        print("网络连接失败")
```

## RESTful API 设计

```python
# RESTful 模型推理 API 设计示例
# 遵循资源命名、版本控制、正确 HTTP 方法的 RESTful 原则，便于客户端理解和调用

# 预测端点（POST）：创建推理任务，请求体携带输入，返回预测结果
# 使用 POST 而非 GET 因为推理不是幂等操作，且输入文本可能超过 URL 长度限制
POST /api/v1/predict          # API 路径包含版本号 v1，未来升级 v2 时可共存
  请求: {"text": "..."}        # 请求体为 JSON，携带用户输入的待推理文本
  响应: {"label": "pos", "score": 0.95}  # 返回预测标签和置信度分数

# 状态查询端点（GET）：获取当前运行模型的状态和元信息
# GET 是幂等方法，适合查询操作，不会改变服务器状态
GET  /api/v1/model/status     # 用于监控面板或负载均衡器的状态检查
  响应: {"status": "ready", "uptime": "12h"}  # 模型就绪状态和已运行时长

# 健康检查端点（GET）：最简单的存活探针，被 Kubernetes/Docker 等调度系统定期调用
GET  /api/v1/health           # 不依赖模型加载，仅返回服务进程是否正常响应
  响应: {"status": "ok"}      # 轻量级响应，不携带模型状态，确保高可用
```

| 设计原则 | 说明 | 示例 |
|:--------|:----|:----|
| **使用名词** | 资源用名词，不用动词 | `/predict` 而非 `/doPredict` |
| **版本控制** | URL 中包含版本号 | `/api/v1/predict` |
| **状态码语义** | 用正确状态码表示结果 | 400=参数错，200=成功 |
| **统一返回格式** | 错误和成功格式一致 | `{"code": 0, "data": {}}` |

## ML 中的 HTTP

| 应用场景 | HTTP 方法 | 端点示例 |
|:--------:|:---------:|:---------|
| 模型推理 | POST | `POST /predict` |
| 批量推理 | POST | `POST /batch_predict` |
| 模型信息 | GET | `GET /model/info` |
| 流式对话 | POST + SSE | `POST /chat`（`Accept: text/event-stream`）|
| 健康检查 | GET | `GET /health` |

## 面试追问

**Q1（基础）**：HTTP 方法中 GET 和 POST 的核心区别是什么？在模型推理 API 中为什么通常用 POST？

**回答要点**：GET 用于获取资源（参数在 URL，长度限制，幂等），POST 用于创建/处理（参数在 Body，无长度限制，非幂等）；模型推理不幂等（每次调用结果可能不同），输入文本可能超 URL 限制，Body 传输更安全。

**Q2（深挖）**：HTTP 状态码 429（Too Many Requests）和 503（Service Unavailable）在 LLM API 调用中分别代表什么？客户端应如何处理？

**回答要点**：429 是触发速率限制（请求频率过高），客户端应等待后重试（指数退避）；503 是服务端暂时不可用（模型加载/过载），客户端可立即重试（通常短暂后恢复）；两者都需配合 `Retry-After` 头部合理安排重试。

**Q3（实战）**：设计一个生产级的模型推理 API 时，你会如何设计端点和返回格式？请给出具体方案。

**回答要点**：版本化命名 `/api/v1/predict`；统一返回格式 `{"code": 0, "data": {...}, "message": "ok"}`；错误时同结构 `{"code": 40001, "data": null, "message": "input text too long"}`；提供 `/health` 健康检查和 `/model/info` 元信息端点。

**Q4（边界）**：HTTP/1.1 在 LLM 流式对话场景中有什么局限性？gRPC 和 WebSocket 如何弥补？

**回答要点**：HTTP/1.1 的 SSE（Server-Sent Events）是单向流（服务端→客户端），无法实现双向实时通信；WebSocket 支持全双工通信适合实时交互式对话；gRPC 基于 HTTP/2 的流式传输，协议效率高、支持双向流和强类型接口，适合微服务间高性能通信。

## 参考引用
- 需要理解Flask与FastAPI模型部署的相关知识，参见 [Flask与FastAPI模型部署](./04-Flask与FastAPI模型部署.md)
- 需要理解LLM API调用与ChatBot的相关知识，参见 [LLM API调用与ChatBot](./07-LLM API调用与ChatBot.md)
- 需要掌握Socket网络编程以理解编程实现机制，参见 [Socket网络编程](../Python/09-Socket网络编程.md)