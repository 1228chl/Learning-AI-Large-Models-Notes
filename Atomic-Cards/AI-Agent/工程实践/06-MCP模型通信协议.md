---
author: "XunZong"
created: "2026-08-04"
tags: ["AI-Agent", "工程实践", "MCP", "LLM通信"]
aliases: ["MCP层", "Model Communication Protocol", "模型通信协议", "统一LLM接口"]
---

# MCP 模型通信协议

## 定义

MCP（Model Communication Protocol，模型通信协议）是 EduAgent 六层架构中的第五层，位于**公共层**之上、**编排层**之下，负责统一所有与 LLM 的通信。MCP 层屏蔽了不同 LLM 提供商的 API 差异，为上层提供统一的调用接口，使上层代码无需关心底层使用的是哪个模型。

$$
\text{MCP} = \text{统一接口} + \text{模型路由} + \text{重试降级} + \text{流式处理}
$$

其中：
- **统一接口**：将不同 LLM（DeepSeek、GPT-4、Claude 等）的 API 差异封装为一致的调用签名
- **模型路由**：根据配置或策略选择当前使用的模型，支持运行时切换
- **重试降级**：调用失败时按策略自动重试或降级到备用模型
- **流式处理**：将 LLM 的流式响应（SSE）统一转换为标准流式接口

## 问题背景

在没有 MCP 层的情况下，上层代码直接调用特定 LLM 的 SDK，会导致：

1. **耦合过深**：业务逻辑与具体模型 SDK 绑定，替换模型需要改多处代码
2. **切换成本高**：从 DeepSeek 切换到 GPT-4，涉及 API 签名、认证方式、参数命名等多处修改
3. **重试逻辑分散**：每个调用点都要自己写重试/降级逻辑，容易遗漏
4. **无法统一监控**：各模型调用的耗时、成功率、Token 消耗分散在各处，无法统一统计

MCP 层通过引入**适配器模式**和**策略模式**解决这些问题。

## 核心架构

### 统一接口层

```python
class LLMClient:
    """统一大模型调用客户端"""
    
    async def invoke(self, 
                     prompt: str,
                     model: str = "deepseek-v3",
                     stream: bool = False,
                     max_retries: int = 3) -> str:
        """调用大模型，包含重试和降级逻辑"""
        last_error = None
        
        for attempt in range(max_retries):
            try:
                return await self._do_invoke(prompt, model, stream)
            except TimeoutError:
                last_error = "模型响应超时"
            except RateLimitError:
                last_error = "请求频率超限"
                await asyncio.sleep(2 ** attempt)  # 指数退避
        
        # 所有重试失败后，尝试降级
        return await self._fallback(prompt, model, stream)
```

### 适配器模式（支持多模型）

```python
class BaseLLMAdapter:
    """LLM 适配器基类"""
    async def invoke(self, prompt: str, **kwargs) -> str: ...
    
class DeepSeekAdapter(BaseLLMAdapter):
    async def invoke(self, prompt: str, **kwargs) -> str:
        # 调用 DeepSeek 的 API
        ...
        
class GPT4Adapter(BaseLLMAdapter):
    async def invoke(self, prompt: str, **kwargs) -> str:
        # 调用 OpenAI 的 API
        ...
```

### 模型路由与切换

MCP 层通过配置中心决定当前使用的模型，支持：

- **静态配置**：在 `config.yaml` 中指定默认模型
- **动态切换**：通过 API 在运行时切换模型（无需重启服务）
- **按 Agent 路由**：不同 Agent 使用不同模型（如：意图识别用 DeepSeek，试卷批改用 GPT-4）
- **降级路由**：主模型不可用时自动切换到备用模型

## 核心功能

| 功能 | 说明 | 实现方式 |
|:-----|:-----|:---------|
| 统一接口 | 封装不同 LLM 的 API 差异 | 适配器模式 + 统一调用签名 |
| 模型切换 | 支持运行时切换模型 | 配置中心 + 模型路由表 |
| 重试机制 | 调用失败时自动重试 | 指数退避 + 最大重试次数 |
| 降级策略 | 主模型不可用时切换到备用模型 | 降级链（主→备→缓存→友好提示） |
| 流式处理 | 统一 SSE 流式输出接口 | 异步生成器 + 事件流 |
| Token 统计 | 统计每次调用的 Token 消耗 | 装饰器模式 + 日志采集 |

## 在 EduAgent 架构中的位置

```
API 层          ← 路由入口
编排层          ← 多 Agent 编排
Agent 层        ← 具体 Agent 逻辑
公共层          ← 共享组件
MCP 层          ← 统一 LLM 通信 ← 你在这里
数据层          ← 数据存储
```

MCP 层直接依赖**数据层**（读取配置）和**公共层**（共享工具），同时为**Agent 层**提供模型调用能力。

## 面试追问

**Q1（基础）**：MCP 层全称是什么？它的核心职责是什么？
**回答要点**：
1. MCP 全称 Model Communication Protocol（模型通信协议）
2. 核心职责：统一所有与 LLM 的通信，屏蔽不同模型提供商的 API 差异
3. 为上层提供统一的调用接口，包含重试降级和流式处理

**Q2（深挖）**：MCP 层和 LLM Factory 设计模式是什么关系？
**回答要点**：
1. LLM Factory 是 MCP 层的核心实现之一——工厂模式负责创建和缓存 LLM 客户端实例
2. MCP 层包含 LLM Factory，但比 LLM Factory 更全面：还包括重试降级、流式处理、Token 统计
3. 可以理解为：LLM Factory 解决"怎么创建模型客户端"，MCP 层解决"怎么稳定可靠地调用模型"

**Q3（实战）**：如果 DeepSeek 的 API 连续超时，MCP 层如何处理？
**回答要点**：
1. 先按指数退避重试（1s、2s、4s...），最多重试 3 次
2. 重试失败后触发降级策略：切换到备用模型（如 GPT-4-mini）
3. 若备用模型也失败，返回缓存结果（若有）或友好错误提示
4. 整个过程对上层透明，Agent 层不需要关心重试和降级逻辑

**Q4（边界）**：MCP 层如何处理流式输出中的异常？
**回答要点**：
1. 流式输出中断时，MCP 层应返回已生成的完整片段而非丢弃
2. 可设置流式超时时间（如 30s 无新 token 视为超时）
3. 超时后触发重试——重新发起流式请求，但需要在提示词中说明"继续生成，不要重复已输出的内容"
4. 更完善的方案：将流式输出分段缓存，断点续传

## 参考引用

- 需要理解 MCP 层在整体架构中的位置，参见 [六层分层架构设计](../系统/08-六层分层架构设计.md)
- 需要理解 LLM Factory 如何实现模型客户端创建和缓存，参见 [LLM Factory 设计模式](./01-LLM%20Factory设计模式.md)
- 需要理解重试和降级策略的详细实现，参见 [三层兜底重试机制](./02-三层兜底重试机制.md)
- 需要理解配置中心如何管理模型切换配置，参见 [配置中心与异常体系设计](./03-配置中心与异常体系设计.md)
- 需要了解 MCP（Model Context Protocol）与 MCP 层的区别，参见 [MCP 插件集成](../基础设施/05-Multi-Agent-Platform/10-MCP插件集成（MCP%20Plugin）.md)