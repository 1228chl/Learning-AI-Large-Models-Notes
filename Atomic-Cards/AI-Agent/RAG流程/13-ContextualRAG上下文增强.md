---
author: "XunZong"
created: "2026-07-30"
tags: ["AI-Agent", "RAG", "Contextual RAG", "检索增强"]
aliases: ["Contextual RAG", "上下文增强", "片段定位", "RAG增强"]
---

# Contextual RAG 上下文增强

## 定义

**Contextual RAG（上下文增强检索）** 是一种在文档分块后、向量化前，用 LLM 为每个 `chunk` 生成一段**定位描述**（contextual description），拼接到 `chunk` 原文前作为检索内容的技术。它解决"chunk 脱离原文后上下文丢失"的问题，让检索匹配更精准。

### 核心流程

$$
\text{RetrievalUnit} = \text{ContextualDescription} \oplus \text{ChunkContent}
$$

- $\text{ChunkContent}$：从原始文档切分出的片段文本
- $\text{ContextualDescription}$：LLM 基于 chunk 和文档上下文生成的定位描述（1-3 句话）
- $\oplus$：字符串拼接操作
- $\text{RetrievalUnit}$：最终存入向量库的检索单元，替代原始的 `chunk` 文本

### Contextual Description 生成

```python
# 用于生成定位描述的 Prompt 模板
CONTEXTUAL_DESCRIPTION_PROMPT = """
给定文档标题、chunk 内容和相邻上下文，生成一段 1-3 句话的定位描述，
说明该 chunk 在文档中的位置和核心内容，帮助检索时准确匹配。

文档标题：{doc_title}
相邻上下文：{surrounding_context}
Chunk 内容：{chunk_content}

定位描述：
"""
```

**生成规则**：

- 描述应包含：该 chunk 在文档中的层级位置（如"第 3 章 > 3.1 IoT 概述"）
- 描述应包含：该 chunk 的核心主题（如"讲解控制反转和依赖注入的概念"）
- 长度控制在 1-3 句话，不超过 100 字
- 定位描述本身**不参与最终回答生成**，仅用于提高检索召回率

### 直观理解

> 普通 RAG 好比把一本书撕成散页，每页只保留页码（metadata），检索时只能靠页码判断。Contextual RAG 好比在每页开头加了一句"这是第 3 章关于控制反转的内容，前面讲了 IoC 概念，后面是 DI 实现"——即使页码（metadata）丢失，检索也能精准定位。

### Contextual RAG 效果对比

| 对比维度 | 普通 RAG | Contextual RAG |
|---------|---------|----------------|
| 检索单元 | 原始 chunk 文本 | 定位描述 + 原始 chunk 文本 |
| 语义完整性 | 低：chunk 脱离原文后丢失上下文 | 高：定位描述补充了上下文信息 |
| 检索精度 | 中等：纯关键词+语义匹配 | 更高：定位描述提供额外语义信号 |
| 实现成本 | 零额外成本 | 每 chunk 一次 LLM 调用（小模型即可） |
| 适用场景 | 短文本、段落独立性强 | 长文本、段落间依赖性强 |

## 应用场景

| 应用场景 | 实现方式 | 说明 |
|----------|---------|------|
| 课程讲义检索 | 每章每节生成定位描述后向量化 | "第 3 章 > 3.1 控制反转"作为检索前缀 |
| 技术文档库 | 按 API 模块生成描述 | "UserService 模块，处理用户注册登录" |
| 多级文档结构 | 在 Markdown 分块时利用标题层级 | "H2 > H3 > 核心概念"层级信息嵌入描述 |
| 代码文档检索 | 函数/类级别生成定位描述 | "UserController.login_handler 登录接口实现" |

## 面试追问

**Q1（基础）**：Contextual RAG 解决的是什么问题？
**回答要点**：

1. 文档分块后，每个 chunk 脱离原文上下文，单纯靠 chunk 文本难以准确判断内容归属
2. 例如："接下来我们看看它的实现"——如果不知道"它"指代什么，检索匹配会失败
3. Contextual RAG 通过生成定位描述，为每个 chunk 补充上下文信息，提高检索精度

**Q2（深挖）**：Contextual RAG 与 RAG 流程中的其他增强技术（HyDE、Multi-Query）有什么区别？
**回答要点**：

1. Contextual RAG 是**建库阶段的增强**：在向量化前为 chunk 加定位描述，属于"离线优化"
2. HyDE 是**查询阶段的增强**：先让 LLM 生成假设答案再检索，属于"在线优化"
3. Multi-Query 也是**查询阶段的增强**：将一个问题拆成多个子问题分别检索
4. 三者可以组合使用：建库用 Contextual RAG，查询用 HyDE + Multi-Query，效果叠加

**Q3（实战）**：在 EduAgent 项目中，Contextual RAG 应用于哪个阶段？如何实现？
**回答要点**：

1. 应用于离线建库阶段的"上下文增强"步骤，在智能分块之后、BGE-M3 嵌入之前
2. 对每个 chunk，调用 LLM 生成定位描述（含文档标题、层级位置、核心主题）
3. 将定位描述拼接到 chunk 原文前，组成完整的检索单元
4. 拼接后的检索单元送入 BGE-M3 生成稠密向量和稀疏向量，存入 Milvus

**Q4（边界）**：Contextual RAG 在什么场景下效果不佳或不需要？
**回答要点**：

1. 短文本场景（如 FAQ 问答）：每个问题本身已包含完整语义，不需要额外定位描述
2. 高成本敏感场景：每 chunk 一次 LLM 调用，百万级文档成本很高，可用小模型替代
3. 低质量定位描述反效果：LLM 生成的描述不准确反而引入噪声，降低检索精度
4. 独立段落文档：段落之间无依赖关系（如 Wiki 独立页面），Contextual RAG 收益有限

## 参考引用

- 需要理解 RAG 三阶段流程的相关知识，参见 [RAG三阶段流程](./01-RAG三阶段流程.md)
- 需要了解 HyDE 假设文档检索的相关知识，参见 [HyDE假设文档检索实现](./08-HyDE假设文档检索实现.md)
- 需要了解智能分块策略的相关知识，参见 [文档切分策略](./02-文档切分策略.md)
- 需要了解 BGE-M3 嵌入模型的相关知识，参见 [BGE-M3嵌入模型与混合检索](./07-BGE-M3嵌入模型与混合检索.md)
- 需要了解 Milvus 集合 Schema 设计的相关知识，参见 [Milvus集合Schema设计与索引选择](./12-Milvus集合Schema设计与索引选择.md)