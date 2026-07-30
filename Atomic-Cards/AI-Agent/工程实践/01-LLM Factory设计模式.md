---
author: "XunZong"
created: "2026-07-30"
tags: ["AI-Agent", "LLM", "工厂模式", "设计模式", "工程化"]
aliases: ["LLM Factory", "大模型工厂", "LLM工厂", "模型管理"]
---

# LLM Factory 设计模式

## 定义

**LLM Factory（大模型工厂）** 是一个将大模型创建、配置、缓存、路由统一管理的设计模式。它解决直接在各 Agent 中调用 `init_chat_model` 导致的配置重复、资源浪费、难以统一管控的问题。

### 核心原则

> 所有 Agent 必须通过工厂获取模型，禁止直接调用 `init_chat_model`。

## 为什么需要工厂

直接在各 Agent 里调用 `init_chat_model` 的问题：

| 问题 | 表现 | 后果 |
|:----|:-----|:-----|
| **配置重复** | 每处都要写 model_provider、base_url、api_key | 改一处漏一处 |
| **无法复用** | 同样模型被反复创建，浪费资源 | 内存/显存浪费 |
| **难以管控** | 加超时、关重试、绕代理，得改无数处 | 运维噩梦 |

## 工厂设计

### 两个核心入口

```python
class LLMFactory:
    """大模型工厂"""

    def __init__(self):
        self._cache = {}  # 缓存：相同参数只创建一次

    def get_llm(self, agent_type: str, temperature: float = 0, streaming: bool = False):
        """拿普通模型"""
        cache_key = f"{agent_type}_{temperature}_{streaming}"
        if cache_key in self._cache:
            return self._cache[cache_key]

        llm = self._create_llm(agent_type, temperature, streaming)
        self._cache[cache_key] = llm
        return llm

    def get_structured_llm(self, agent_type: str, output_schema):
        """拿绑定Pydantic结构的模型"""
        base_llm = self.get_llm(agent_type, temperature=0)
        return base_llm.with_structured_output(output_schema, method="function_calling")
```

### 关键设计点

**1. 自定义 httpx 客户端：绕过系统代理**

```python
import httpx

http_client = httpx.AsyncClient(trust_env=False)  # 绕过Windows系统代理
```

`trust_env=False` 为什么重要：Windows 系统代理或 HTTPS_PROXY 环境变量会被 httpx 默认探测到，导致 DeepSeek 请求失败。

**2. Agent 类型 → 模型路由表**

```python
AGENT_MODEL_MAP = {
    "qa":               "deepseek-chat",   # 智能问答
    "exam_subjective":  "deepseek-chat",   # 简答题批改
    "exam_code":        "deepseek-chat",   # 代码题批改
    "resume":           "deepseek-chat",   # 简历审查
    "interview":        "deepseek-chat",   # 模拟面试
    "intent":           "deepseek-chat",   # 意图识别
    "summarize":        "deepseek-chat",   # 对话摘要
}
```

**3. 缓存键设计**

```
cache_key = f"{model}_{temperature}_{streaming}"
```

相同参数只创建一次模型实例，避免重复加载。

**4. max_retries=0**

模型层不重试，重试统一由 retry 层管理，职责分离。

## 完整实现骨架

```python
from langchain.chat_models import init_chat_model
from pydantic import BaseModel

class LLMFactory:
    def __init__(self, config):
        self._cache = {}
        self._config = config

    def _create_llm(self, agent_type: str, temperature: float, streaming: bool):
        model = AGENT_MODEL_MAP.get(agent_type, "deepseek-chat")
        return init_chat_model(
            model=model,
            model_provider="openai",
            api_key=self._config.deepseek_api_key,
            base_url="https://api.deepseek.com/v1",
            temperature=temperature,
            streaming=streaming,
            max_retries=0,  # 重试由 retry 层统一管理
            http_client=httpx.AsyncClient(trust_env=False),
        )

    def get_llm(self, agent_type, temperature=0, streaming=False):
        key = f"{agent_type}_{temperature}_{streaming}"
        if key not in self._cache:
            self._cache[key] = self._create_llm(agent_type, temperature, streaming)
        return self._cache[key]

    def get_structured_llm(self, agent_type, output_schema: type[BaseModel]):
        llm = self.get_llm(agent_type, temperature=0)
        return llm.with_structured_output(output_schema, method="function_calling")

# 全局单例
llm_factory = LLMFactory(config)
```

## 面试追问

**Q1（基础）**：为什么需要 LLM Factory，而不是在每个 Agent 直接调用 init_chat_model？
**回答要点**：
1. 配置重复：每处写 model_provider、base_url、api_key，改一处漏一处
2. 无法复用：同样模型被反复创建，浪费资源
3. 难以管控：加超时、关重试、绕代理，得改无数处

**Q2（深挖）**：为什么要在 httpx 客户端设置 trust_env=False？max_retries=0 又是为什么？
**回答要点**：
1. trust_env=False：绕过 Windows 系统代理，否则 httpx 默认探测到代理会导致 DeepSeek 请求失败
2. max_retries=0：模型层不重试，重试统一由 retry 层（三层兜底）管理，实现职责分离

**Q3（实战）**：缓存键由哪些因素组成？为什么这样设计？
**回答要点**：
1. 缓存键 = `{agent_type}_{temperature}_{streaming}`
2. agent_type 决定模型名称，temperature 影响输出，streaming 影响调用方式
3. 相同参数只创建一次，避免重复加载

**Q4（边界）**：如果想把某个 Agent 从 deepseek-chat 换成 GPT-4，需要改几处？改哪里？
**回答要点**：
1. 只需改 AGENT_MODEL_MAP 中对应 agent_type 的模型名
2. 如果 GPT-4 需要不同的 base_url 或 api_key，在 LLM Factory 中做条件判断
3. 业务代码完全不需要改动

## 参考引用
- 需要理解 LangChain 模型创建基础用法的相关知识，参见 [LangChain六大组件](../LangChain/04-LangChain六大组件.md)
- 需要理解三层兜底重试机制的相关知识，参见 [三层兜底重试机制](02-三层兜底重试机制.md)
- 需要理解六层分层架构中 MCP 层职责的相关知识，参见 [六层分层架构设计](../系统/35-六层分层架构设计.md)