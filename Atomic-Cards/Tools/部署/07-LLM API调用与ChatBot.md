---
author: "XunZong"
created: "2026-07-06"
tags: ["AI-Agent", "LLM", "API"]
aliases: ["LLM API", "OpenAI API", "智谱API", "ChatBot"]
---

# LLM API 调用与 ChatBot

## 定义

通过 HTTP 调用大语言模型的 API，将 LLM 能力集成到自己的应用中。主流厂商提供兼容 OpenAI SDK 格式的接口，调用方式基本一致。

## OpenAI SDK 调用

```python
from openai import OpenAI


client = OpenAI(

    api_key="sk-xxx",          # 从 OpenAI 控制台获取的 API Key，应通过环境变量读取而非硬编码
    # base_url="..."           # 可选参数：通过代理或反向代理访问 API 时设置自定义端点地址
)

# 非流式调用：等待模型完成全部生成后一次性返回完整结果
# 适合短文本生成或不在意首 token 延迟的场景
response = client.chat.completions.create(

    model="gpt-4o-mini",       # 模型标识符，决定能力水平和计价标准

    messages=[
        {"role": "system", "content": "你是资深AI助手"},  # system 设定角色和行为规则
        {"role": "user", "content": "解释什么是反向传播"}  # user 为用户的实际提问
    ]
)
# choices[0] 取第一个候选回复，message.content 为生成的文本字符串
print(response.choices[0].message.content)

# 流式调用（逐 token 输出，体验更好）：通过 Server-Sent Events 接收实时生成流
# 首 token 延迟远低于非流式，用户体验接近真人打字，适合对话场景
stream = client.chat.completions.create(

    model="gpt-4o-mini",

    messages=[{"role": "user", "content": "写一首诗"}],

    stream=True                 # 启用流式模式，返回迭代器而非完整响应
)
for chunk in stream:
    # 每个 chunk 的 delta.content 可能为空（如最后的数据帧不含 content）
    # 跳过空值避免打印多余的换行
    if chunk.choices[0].delta.content:
        # end="" 禁止默认换行，flush=True 强制刷新输出缓冲区，实现流畅的打字机效果
        print(chunk.choices[0].delta.content, end="", flush=True)
```

## 智谱 API 调用

```python
from openai import OpenAI

# 智谱 API 完全兼容 OpenAI SDK 格式，仅需修改 base_url 和 api_key
# 同一份代码可通过配置切换不同厂商，无需改动业务逻辑
client = OpenAI(

    api_key="your.zhipu.api.key",                  # 智谱开放平台申请的 API Key

    base_url="https://open.bigmodel.cn/api/paas/v4/"  # 智谱 API 入口地址
)


response = client.chat.completions.create(

    model="glm-4-flash",       # 智谱提供的免费模型，适合快速开发和测试

    messages=[{"role": "user", "content": "你好"}]
)
print(response.choices[0].message.content)
```

## 主流 LLM API 对比

| 厂商 | 模型 | API 地址 | 特点 |
|:----:|:----|:---------|:----|
| **OpenAI** | GPT-4o / GPT-4o-mini | `https://api.openai.com/v1` | 通用最强 |
| **智谱（GLM）** | GLM-4 / GLM-4-Flash | `https://open.bigmodel.cn/api/paas/v4` | 中文优秀，Flash 免费 |
| **百度（千帆）** | ERNIE-4.0 / ERNIE-Bot | `https://aip.baidubce.com` | 中文场景 |
| **阿里（通义）** | Qwen-Max / Qwen-Plus | `https://dashscope.aliyuncs.com` | 性价比高 |
| **DeepSeek** | DeepSeek-V3 / R1 | `https://api.deepseek.com` | 推理能力强 |
| **本地 Ollama** | qwen2 / llama3 | `http://localhost:11434/v1` | 免费，无需网络 |

## 消息结构（ChatML 格式）

```python
# ChatML（Chat Markup Language）格式：LLM API 的标准消息结构
# 三种角色分工明确，通过角色区分让模型理解对话的层级结构
messages = [
    # system：全局指令，设定助手角色、行为边界和输出格式，优先级高于 user 消息
    {"role": "system", "content": "系统提示词，设定角色和行为规则"},
    {"role": "user",   "content": "用户输入的内容"},
    # assistant：模型的上一次回复，作为多轮对话的上下文让模型"记住"前文
    {"role": "assistant", "content": "模型之前的回复"},
    # 新一轮用户输入，模型基于全部历史消息 + 本条消息生成回复
    {"role": "user",   "content": "新的问题"},
]
```

| 角色 | 说明 | 作用 |
|:----|:----|:----|
| **system** | 系统级指令 | 设定角色、行为约束、输出格式 |
| **user** | 用户输入 | 提问或指令 |
| **assistant** | 模型回复 | 历史对话上下文（多轮对话时） |

## 聊天机器人项目结构

```python
# 项目目录结构：前后端分离的 ChatBot 应用布局
# 后端提供 API 接口，前端通过 HTTP 请求调用，职责清晰、可独立部署
黑马智聊机器人/
├── main.py              # 后端入口：FastAPI 服务，处理聊天和对话历史请求
│   ├── /chat            # POST 聊天接口（支持流式/非流式两种响应模式）
│   └── /history         # GET 获取对话历史记录接口，用于页面初始化时加载上下文
├── static/              # 前端静态资源（HTML/CSS/JS），浏览器直接加载渲染
│   ├── index.html       # 聊天界面主页面，包含输入框、消息展示区域
│   └── chat.js          # 异步调用后端 API、处理流式 SSE 响应和动态更新 DOM
├── requirements.txt     # Python 依赖声明（fastapi, openai, uvicorn 等）
└── .env                 # 环境变量（API Key、模型名等），不提交到版本控制
```

```python
# 黑马智聊机器人 - 后端核心代码（简化）
# 核心流程：接收用户消息 → 调用 LLM API 流式生成 → 逐 token 推送给前端
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from openai import OpenAI
import asyncio

# 创建 FastAPI 应用实例和 OpenAI 客户端（全局复用，避免每次请求重新创建连接）
app = FastAPI()

client = OpenAI(api_key="sk-xxx", base_url="...")

@app.post("/chat")
async def chat(message: str):
    # 内部异步生成器函数：将 OpenAI 流式响应逐 token 产出，供 StreamingResponse 消费
    async def generate():

        stream = client.chat.completions.create(

            model="gpt-4o-mini",

            messages=[{"role": "user", "content": message}],

            stream=True        # 启用流式，返回 token 迭代器
        )
        for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content  # yield 让 StreamingResponse 实时推送

    # StreamingResponse 将生成器的产出转换为 SSE（Server-Sent Events）流式 HTTP 响应
    # 前端通过 EventSource 或 fetch + ReadableStream 接收逐 token 推送的内容
    return StreamingResponse(generate(), media_type="text/plain")
```

## API 调用最佳实践

| 实践 | 代码 | 说明 |
|:----|:----|:----|
| **错误处理** | `try-except` 捕获 API 异常 | 网络超时、token 限制 |
| **重试机制** | `tenacity.retry` 自动重试 | 临时错误的容错 |
| **超时设置** | `timeout=60` | 防止长时间等待 |
| **Token 控制** | `max_tokens=1024` | 限制输出长度 |
| **温度调参** | `temperature=0.7` | 控制创造力（0=确定，1=随机） |
| **系统提示词** | system message | 固定角色和行为 |

## 面试追问

**Q1（基础）**：ChatML 格式中 system、user、assistant 三种角色的作用分别是什么？为什么需要区分它们？
**回答要点**：

1. system 设定模型的行为和输出格式，作为全局约束，优先级高于 user 消息
2. user 代表用户的输入内容，是对话的驱动方，直接表达用户的意图或问题
3. assistant 记录模型的历史回复，为多轮对话提供上下文；区分角色使模型理解对话的结构层级和身份边界，保证回复的一致性和可控性

**Q2（深挖）**：流式输出（Streaming）和非流式输出在底层实现上有何不同？流式输出的优势是什么？
**回答要点**：

1. 非流式调用：等待模型生成完整回复后一次性返回完整结果，首 token 延迟高但处理逻辑简单
2. 流式调用：通过 SSE（Server-Sent Events）协议逐 token 推送给客户端，首 token 延迟远低于非流式
3. 流式输出实现打字机效果，用户体验更流畅自然，但后端需要处理连接保持和中断恢复逻辑

**Q3（实战）**：在实现 ChatBot 时如何处理 API 错误（超时、限流、Token 耗尽）？请给出容错策略。
**回答要点**：

1. 使用 try-except 捕获网络超时和 API 异常，配合 tenacity 库实现指数退避重试（对 429 和 5xx 状态码重试最多 3 次）
2. 设置 max_tokens 和 timeout 参数防止无限等待，避免资源被单个请求长时间占用
3. 向用户提示用量限制，在前端实现 Token 计数和提前截断策略，超出限制时友好降级

**Q4（边界）**：调用第三方 LLM API 存在哪些数据和安全性风险？如何缓解？
**回答要点**：

1. 数据隐私风险：用户输入的 Prompt 会经过第三方服务器，存在数据泄露隐患，合规敏感场景需考虑本地部署
2. API Key 安全风险：Key 泄露可能导致恶意调用和财务损失，应通过环境变量和密钥管理服务妥善保管
3. 缓解措施：对敏感数据做脱敏处理，或使用数据不落地的本地模型（如 Ollama），同时实现访问控制和用量审计

## 参考引用
- 需要理解 Ollama 与本地 LLM 部署的相关知识，参见 [Ollama与本地LLM部署](06-Ollama与本地LLM部署.md)
- 需要理解 Ollama 与本地 LLM 部署的相关知识，参见 [Ollama与本地LLM部署](06-Ollama与本地LLM部署.md)
- 需要理解 Flask 与 FastAPI 模型部署的相关知识，参见 [Flask与FastAPI模型部署](04-Flask与FastAPI模型部署.md)
