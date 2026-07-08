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
    api_key="sk-xxx",          # 你的 API Key
    # base_url="..."           # 可选：代理地址
)

# 非流式调用
response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[
        {"role": "system", "content": "你是资深AI助手"},
        {"role": "user", "content": "解释什么是反向传播"}
    ]
)
print(response.choices[0].message.content)

# 流式调用（逐 token 输出，体验更好）
stream = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "写一首诗"}],
    stream=True
)
for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
```

## 智谱 API 调用

```python
from openai import OpenAI

# 智谱 API 兼容 OpenAI SDK
client = OpenAI(
    api_key="your.zhipu.api.key",
    base_url="https://open.bigmodel.cn/api/paas/v4/"
)

response = client.chat.completions.create(
    model="glm-4-flash",       # 智谱免费模型
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
messages = [
    {"role": "system", "content": "系统提示词，设定角色和行为规则"},
    {"role": "user",   "content": "用户输入的内容"},
    {"role": "assistant", "content": "模型之前的回复"},  # 历史对话
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
黑马智聊机器人/
├── main.py              # 后端：FastAPI 服务
│   ├── /chat            # POST 聊天接口（流式/非流式）
│   └── /history         # 获取对话历史
├── static/              # 前端页面（HTML/CSS/JS）
│   ├── index.html
│   └── chat.js
├── requirements.txt     # 依赖
└── .env                 # API Key 配置
```

```python
# 黑马智聊机器人 - 后端核心代码（简化）
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from openai import OpenAI
import asyncio

app = FastAPI()
client = OpenAI(api_key="sk-xxx", base_url="...")

@app.post("/chat")
async def chat(message: str):
    async def generate():
        stream = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": message}],
            stream=True
        )
        for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

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

**回答要点**：system 设定模型行为和输出格式（全局约束），user 代表用户输入，assistant 记录模型历史回复（多轮对话上下文）；区分角色使模型理解对话结构和身份边界，保证一致性和可控性。

**Q2（深挖）**：流式输出（Streaming）和非流式输出在底层实现上有何不同？流式输出的优势是什么？

**回答要点**：非流式等模型生成完整序列后一次性返回；流式通过 Server-Sent Events（SSE）逐 token 推送；流式优势在于首 token 时延低、用户体验好（打字机效果），但后端需处理连接保持和中断恢复。

**Q3（实战）**：在实现 ChatBot 时如何处理 API 错误（超时、限流、Token 耗尽）？请给出容错策略。

**回答要点**：try-except 捕获网络和 API 异常；tenacity 库实现指数退避重试（429 和 5xx 重试 3 次）；设置 `max_tokens` 和 `timeout` 防止无限等待；用户提示用量限制，实现 Token 计数提前截断。

**Q4（边界）**：调用第三方 LLM API 存在哪些数据和安全性风险？如何缓解？

**回答要点**：Prompt 数据经第三方服务器存在隐私泄露风险（合规场景需本地部署）；API Key 泄露可能导致恶意调用和财务损失（环境变量 + 密钥管理服务）；建议敏感数据脱敏、使用数据不落地的本地模型、实现访问控制和用量审计。

> 理解前置知识可参见 [Ollama与本地LLM部署](./06-Ollama与本地LLM部署.md)；理解提示词工程核心原则的AI应用开发可参见 [提示词工程核心原则](../AI-Agent/06-提示词工程核心原则.md)；理解前置知识可参见 [Flask与FastAPI模型部署](./04-Flask与FastAPI模型部署.md)；理解Agent定义与核心公式的AI应用开发可参见 [Agent定义与核心公式](../AI-Agent/01-Agent定义与核心公式.md)