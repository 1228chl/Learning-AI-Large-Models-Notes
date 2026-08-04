---
author: "XunZong"
created: "2026-08-04"
tags: ["AI-Agent", "系统", "可观测性", "监控"]
aliases: ["Langfuse", "LLM监控", "可观测性", "Trace追踪", "LLM Evaluation"]
---

# Langfuse 监控与评估

## 定义

Langfuse 是一个开源的 LLM 可观测性与评估平台，提供 Trace 追踪、Token 成本监控、在线评测等能力。它帮助开发者解决 LLM 应用上线后的三大困境：**账单不透明**（按模型/功能/用户统计成本）、**问题难定位**（完整调用链追踪）、**迭代无基准**（评测集批量对比）。

$$
\text{Langfuse} = \text{Trace} + \text{Cost Tracking} + \text{Dataset} + \text{Evaluation}
$$

## 部署与配置

| 方案 | 适用场景 | 说明 |
|:----|:---------|:-----|
| **Langfuse Cloud** | 快速试用、小团队 | 免费额度够用，无需自建 |
| **自托管（Docker Compose）** | 生产环境、数据不出内网 | 免费但需自己维护 |

```bash
# .env.local 配置
LANGFUSE_SECRET_KEY=sk-lf-xxxxxxxxxxxxxxxx
LANGFUSE_PUBLIC_KEY=pk-lf-xxxxxxxxxxxxxxxx
LANGFUSE_HOST=https://cloud.langfuse.com  # 自托管改为http://localhost:3000
```

## 三种接入方式

### 方式一：LangChain 回调（最快，改动最少）

```python
from langfuse.callback import CallbackHandler

handler = CallbackHandler(
    session_id="session-abc123",
    user_id="user-liming",
    tags=["qa", "rag"],
)
response = await llm.ainvoke(
    [HumanMessage(content="问题")], 
    config={"callbacks": [handler]}
)
```

### 方式二：手动 SDK（最灵活，精确控制）

适合多步骤流程（检索 → 精排 → 生成），每步用 `trace.span()` 记录。

```python
trace = langfuse.trace(name="rag-query", user_id="user-001")
retrieval_span = trace.span(name="retrieval")
# ... 执行检索 ...
retrieval_span.end()
generation = trace.generation(
    name="llm-response",
    model="deepseek-v3",
    input=[{"role": "user", "content": "问题"}],
    output="回答",
    usage={"input": 100, "output": 50}
)
```

### 方式三：LangGraph 集成（节点级可见）

通过回调透传，让 Langfuse 自动捕获每个节点的执行情况。也可以手动创建 Trace，再通过 `trace.get_langchain_handler()` 将 handler 绑定到节点。

## Trace 数据结构

```
Trace（一次完整请求）
  ├── Span（一个处理步骤，可嵌套）
  │   ├── Span（子步骤）
  │   └── Generation（LLM 调用，Span 的特化）
  └── Generation
```

- **Trace**：一次用户请求的整体生命周期
- **Span**：一个处理步骤（如检索、重排序），可嵌套
- **Generation**：一次具体的 LLM 调用，记录输入/输出/Token 消耗

## 核心功能

| 功能 | 说明 | 应用场景 |
|:----|:-----|:---------|
| **Trace 追踪** | 完整调用链（每一步的输入/输出/耗时/Token） | 定位 RAG 答错、路由失败、高延迟 |
| **Token 成本监控** | 按模型/功能/用户分组统计 Token 和成本 | 账单分析、成本优化 |
| **Score 回写** | 用户反馈和 LLM-as-Judge 评分写入 Langfuse | 在线评估、质量监控 |
| **Dataset + Evaluation** | 评测集批量运行 + 指标对比 | 版本迭代、Prompt 改动验证 |
| **回归测试** | 修改 Prompt 后批量跑历史用例 | 防止回归退化 |

## 问题定位实战

**定位 RAG 答错根因**：
1. 搜索本次请求的 Trace
2. 查看 retrieval Span 召回了哪些文档
3. 查看 rerank Span 排序是否正确
4. 查看 generation Span 的 context 是否包含正确文档

**Token 成本设置**：在 Langfuse 后台注册自定义模型价格（Settings → Models → Add Model），填写模型名称和 Input/Output 价格。在 trace 里记录 usage 后，自动按价格表换算成本。

## 面试追问

**Q1（基础）**：Langfuse 的 Trace 结构是什么样的？
**回答要点**：
1. Trace 是顶层容器，代表一次完整请求
2. Span 是处理步骤（可嵌套），Generation 是 Span 的特化（专指 LLM 调用）
3. 每个节点记录输入/输出/耗时/Token 消耗，形成完整的调用链

**Q2（深挖）**：Langfuse 和传统 APM（如 SkyWalking、Pinpoint）有什么不同？
**回答要点**：
1. Langfuse 专为 LLM 场景设计，原生支持 Token 统计、Prompt 版本管理、LLM-as-Judge 评分
2. 传统 APM 关注服务调用（HTTP/gRPC），Langfuse 关注 LLM 调用链（检索→精排→生成）
3. Langfuse 的 Dataset 和 Evaluation 功能支持 Prompt 迭代验证，这是传统 APM 没有的

**Q3（实战）**：如果 RAG 系统回答错误，如何用 Langfuse 定位根因？
**回答要点**：
1. 搜索问题对应的 Trace，查看 retrieval Span 是否召回了相关文档
2. 查看 rerank Span 排序后 top-K 文档是否包含正确答案
3. 查看 generation Span 的 context 构建是否正确（是否截断/遗漏关键文档）
4. 若以上都正确，可能是模型本身的幻觉问题，需用 LLM-as-Judge 评估

**Q4（边界）**：Langfuse 自托管部署需要注意什么？
**回答要点**：
1. 数据持久化：Docker Compose 部署时需挂载卷，防止重启丢失数据
2. 性能影响：回调是异步的，通常不会阻塞主流程，但高并发下需注意回调队列积压
3. 敏感数据：Trace 中可能包含用户提问和模型回答，需评估是否需脱敏

## 参考引用

- 需要理解系统健康度评估中如何结合 Langfuse 数据，参见 [系统健康度评估指标](../系统/45-系统健康度评估指标.md)
- 需要理解 LLM-as-Judge 评分模式，参见 [LLM-as-Judge 评估模式](../基础/32-LLM-as-Judge评估模式.md)
- 需要了解 MLOps 与实验跟踪的完整流程，参见 [MLOps 与实验跟踪](../../Tools/工具/10-MLOps与实验跟踪.md)