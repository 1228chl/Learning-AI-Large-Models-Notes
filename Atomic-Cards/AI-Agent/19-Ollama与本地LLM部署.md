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

# Ollama 提供兼容 OpenAI 的 API
def chat_with_ollama(prompt, model="qwen2:0.5b"):
    response = requests.post(
        "http://localhost:11434/api/chat",
        json={
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "stream": False
        }
    )
    return response.json()["message"]["content"]

# 流式输出
def chat_stream(prompt, model="qwen2:0.5b"):
    response = requests.post(
        "http://localhost:11434/api/chat",
        json={
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "stream": True
        },
        stream=True
    )
    for line in response.iter_lines():
        if line:
            data = json.loads(line)
            if not data.get("done"):
                print(data["message"]["content"], end="", flush=True)
```

## Ollama API （兼容 OpenAI SDK）

```python
# Ollama 0.8+ 支持 OpenAI Python SDK 直接调用
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:11434/v1",    # Ollama 的 OpenAI 兼容端点
    api_key="ollama"                         # 本地不需要 key
)

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

> 参见 [[20-LLM API调用与ChatBot]]、[[06-提示词工程核心原则]]
