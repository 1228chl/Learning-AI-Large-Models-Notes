---
author: "XunZong"
created: "2026-07-06"
tags: ["AI-Agent", "Ollama", "本地部署"]
aliases: ["Ollama", "本地模型", "LLM部署"]
---

# Ollama 与本地 LLM 部署

## 定义

Ollama 是一个**本地运行大语言模型**的开源工具，将模型下载、管理和推理封装为简单的命令行操作，无需 GPU 也可运行（CPU 模式），适合开发测试和私有化部署。

## 安装与基础命令

```bash
# 下载安装：https://ollama.com/download

# 查看可用模型
ollama list

# 拉取模型
ollama pull qwen2:0.5b        # 阿里通义千问 0.5B（适合 CPU）
ollama pull qwen2:7b          # 7B 版本（需 GPU）
ollama pull deepseek-r1:1.5b  # DeepSeek R1 1.5B
ollama pull llama3.2:1b       # Meta Llama 3.2

# 运行模型（交互式对话）
ollama run qwen2:0.5b

# 删除模型
ollama rm qwen2:0.5b
```

## Python 调用 Ollama

```python
import requests
import json

# 非流式对话函数：一次性发送请求，等待完整回复后返回
# stream=False 时 Ollama 会将完整回复序列化为一个 JSON 对象返回
def chat_with_ollama(prompt, model="qwen2:0.5b"):

    response = requests.post(
        "http://localhost:11434/api/chat",    # Ollama 本地 API 端点（默认端口 11434）

        json={
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "stream": False                   # 非流式模式，等待完整响应
        }
    )
    # 从返回 JSON 中提取模型生成的消息内容
    return response.json()["message"]["content"]

# 流式输出函数：逐 token 打印，实现打字机效果，首 token 延迟更低
def chat_stream(prompt, model="qwen2:0.5b"):

    response = requests.post(
        "http://localhost:11434/api/chat",

        json={
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "stream": True                    # 流式模式，响应以换行分隔的 SSE 事件流
        },

        stream=True                           # requests 库的流式传输，不等待完整响应
    )
    # 逐行解析 Ollama 返回的 SSE 事件流，每行是一个独立的 JSON 对象
    for line in response.iter_lines():
        if line:

            data = json.loads(line)
            # done=true 表示生成完毕（最后的统计信息包），不包含实际内容，跳过
            if not data.get("done"):
                # flush=True 强制立即输出，避免缓冲区延迟造成卡顿感
                print(data["message"]["content"], end="", flush=True)
```

## Ollama API （兼容 OpenAI SDK）

```python
# Ollama 0.8+ 支持 OpenAI Python SDK 直接调用，无需更改已有代码即可切换后端
# 这意味着本地开发和远程 API 调用可以使用完全相同的代码，仅需修改 base_url
from openai import OpenAI


client = OpenAI(

    base_url="http://localhost:11434/v1",    # Ollama 提供的 OpenAI 兼容端点

    api_key="ollama"                         # 本地服务不需要 API Key，填任意值即可占位
)

# 调用方式与 OpenAI API 完全一致：模型名、消息结构、参数均可复用
response = client.chat.completions.create(

    model="qwen2:0.5b",

    messages=[{"role": "user", "content": "你好"}]
)
print(response.choices[0].message.content)
```

## 模型选择建议

| 模型 | 参数量 | 推荐硬件 | 特点 |
|:----:|:------:|:--------|:----|
| **qwen2:0.5b** | 0.5B | CPU（2GB） | 中文好，极速 |
| **deepseek-r1:1.5b** | 1.5B | CPU（4GB） | 推理能力强 |
| **qwen2:7b** | 7B | GPU（8GB） | 中文优秀 |
| **llama3.2:1b** | 1.1B | CPU（3GB） | 英文好 |
| **llama3.2:3b** | 3.2B | CPU/GPU | 英文较强 |
| **gemma2:2b** | 2B | CPU（4GB） | Google 出品 |

## ML 中的 Ollama

| 应用场景 | 使用方式 |
|:--------:|:--------|
| **本地开发测试** | `ollama run` 快速验证 prompt |
| **私有数据 RAG** | Ollama + LangChain + 本地向量库 |
| **无网环境部署** | 下载模型后离线使用 |
| **API 替代方案** | 替代 OpenAI API 进行开发调试 |

## 面试追问

**Q1（基础）**：Ollama 是什么？它的核心功能和设计理念是什么？
**回答要点**：

1. Ollama 是一个命令行工具，封装了模型的下载、管理和推理操作，让本地运行大模型变得简单
2. 提供 OpenAI 兼容 API，方便开发者将本地模型作为 OpenAI API 的替代方案
3. 支持 CPU 和 GPU 两种推理模式，轻量易用，适合开发测试和私有化部署场景

**Q2（深挖）**：Ollama 内部是如何实现模型管理和推理的？和直接使用 Transformers 库有何不同？
**回答要点**：

1. Ollama 用 Go 语言编写，底层集成 llama.cpp，以 GGUF 格式存储量化模型，自动管理模型版本和缓存
2. 能自动选择合适的 GPU 后端（CUDA/Metal/Vulkan），无需手动配置
3. 相比 Transformers 库，Ollama 牺牲了部分灵活性换取了开箱即用的便利性

**Q3（实战）**：你在项目中将 Ollama 用于 RAG 或 API 替代方案时，如何处理并发请求和长上下文？
**回答要点**：

1. Ollama 单模型实例默认串行处理请求，高并发场景需启动多实例配合负载均衡
2. 长上下文可通过 `num_ctx` 参数控制窗口大小，但会增加显存占用
3. 推荐搭配 LangChain/LlamaIndex 使用，借助向量数据库缓解上下文长度限制

**Q4（边界）**：Ollama 在生产环境部署中有哪些局限性？何时应选择云 API 或 vLLM 等替代方案？
**回答要点**：

1. 缺乏高级批处理（动态 batching）和 PagedAttention 等优化，高并发吞吐量低于 vLLM/TGI
2. 大模型（70B+）在消费级 GPU 上无法运行，缺乏内置监控和鉴权机制
3. 生产级场景推荐 vLLM + Kubernetes 方案，云场景应选择 OpenAI API 等商业服务

## 参考引用
- 需要理解LLM API调用与ChatBot的相关知识，参见 [LLM API调用与ChatBot](07-LLM API调用与ChatBot.md)
- 需要理解模型保存格式的相关知识，参见 [模型保存格式](05-模型保存格式.md)
- 需要理解Docker基础与容器化的相关知识，参见 [Docker基础与容器化](../Docker/01-Docker基础与容器化.md)
