---
author: "XunZong"
created: "2026-07-07"
tags: ["AI-Agent", "RAG", "评估"]
aliases: ["RAGAS", "RAG评估", "检索增强生成评估"]
---

# RAG 系统评估（RAGAS）

## 定义

RAGAS（Retrieval Augmented Generation Assessment）是一个专用于评估 RAG 系统性能的自动化框架。它无需人工标注标准答案，而是通过底层大语言模型（LLM）自动计算四个核心指标，分别衡量**检索模块**和**生成模块**的质量。

## 评估数据格式

RAGAS 需要评估数据集包含以下四个字段：

| 字段 | 含义 | 来源 |
|:----:|:-----|:-----|
| `question` | 用户输入查询 | RAG 管道的输入 |
| `answer` | RAG 管道生成的答案 | 系统输出 |
| `contexts` | 检索到的相关文档片段 | 外部知识源检索结果 |
| `ground_truths` | 问题的标准答案 | **唯一需人工标注**的字段 |

最开始的数据集只需 `question`-`answer` 对，LLM 自动完成其余部分的评估。

## 四大评估指标

RAGAS 从检索和生成两个维度评估 RAG 系统：

### 检索侧指标

| 指标 | 衡量内容 | 说明 |
|:----|:---------|:-----|
| **Context Relevancy**（上下文相关性） | 检索到的上下文是否与问题相关 | 惩罚包含无关信息，提取上下文中对回答问题必要的句子比例 |
| **Context Recall**（上下文召回率） | 上下文是否覆盖标准答案所需的所有信息 | 将 ground_truth 拆分为 claims，检查每个 claim 是否能从 context 中找到依据 |

**Context Recall 计算示例**：

```python
ground_truth: "2010年世界杯的冠军是西班牙。决赛中他们1-0战胜了荷兰。"
claims: ["2010年世界杯的冠军是西班牙", "决赛中他们1-0战胜了荷兰"]

retrieved context: ["2010年世界杯的决赛中西班牙战胜了荷兰"]
→ claim1 "冠军是西班牙" 可在 context 中找到 ✓
→ claim2 "比分1-0" 未在 context 中出现 ✗
→ Recall = 1/2 = 0.5
```

### 生成侧指标

| 指标 | 衡量内容 | 说明 |
|:----|:---------|:-----|
| **Faithfulness**（忠实度） | 生成的答案是否忠于检索到的上下文 | 答案中的每个陈述是否都能从 context 中找到依据，防止 LLM 幻觉 |
| **Answer Relevancy**（答案相关性） | 生成的答案与问题的匹配程度 | 答案是否针对问题回答，而非答非所问 |

## 评估实现流程

```python
from ragas import evaluate
from ragas.metrics import (
    faithfulness,
    answer_relevancy,
    context_relevancy,
    context_recall
)
from datasets import Dataset

# 加载评估数据集
data = {"question": [...], "answer": [...],
        "contexts": [...], "ground_truths": [...]}
dataset = Dataset.from_dict(data)

# 配置评估环境（使用 LangChain OpenAI 接口）
from langchain_openai import OpenAIEmbeddings, ChatOpenAI

# 执行评估
result = evaluate(
    dataset=dataset,
    metrics=[faithfulness, answer_relevancy,
             context_relevancy, context_recall]
)
print(result)
```

## ML/DL 应用场景

| 应用场景 | 说明 |
|----------|------|
| RAG 系统上线前评估 | 正式提供服务前量化 RAG 表现，确定是否达到上线标准 |
| 算法迭代对比 | 修改 RAG 流程后与原版本对比，验证改进是否有效 |
| 检索器性能监控 | 通过 Context Relevancy/Recall 变化监控检索质量 |
| 生成质量审计 | 通过 Faithfulness 指标监控 LLM 是否产生幻觉 |

## 面试追问

**Q1（基础）**：RAGAS 评估框架解决了传统评估的什么痛点？

**回答要点**：传统评估依赖人工标注标准答案成本高、速度慢；RAGAS 通过 LLM 自动评估，无需人工标注即可计算多个维度的指标；支持快速迭代对比，适合 RAG 开发的"评估-改进"循环。

**Q2（深挖）**：Faithfulness（忠实度）和 Answer Relevancy（答案相关性）有什么区别？

**回答要点**：Faithfulness 衡量答案是否忠于检索到的 context（避免幻觉），答案中的每句话都应有 context 支撑；Answer Relevancy 衡量答案是否针对问题本身（避免答非所问）。前者关注"是否胡说"，后者关注"是否切题"。

**Q3（实战）**：Context Recall 偏低可能是什么原因？如何改进？

**回答要点**：原因：文档切片策略不当导致关键信息丢失、检索 top-k 数量不足、Embedding 模型语义理解能力弱。改进：优化切片大小（256-512 tokens）、增加检索数量、使用更优质的 Embedding 模型（如 BGE/bce-embedding）、尝试混合检索策略。

**Q4（边界）**：RAGAS 基于 LLM 做评估有什么局限性？

**回答要点**：LLM 自身也可能有偏差，对于需要精确事实判断的场景可能误判；评估指标分数是相对参考值而非绝对值；需要较高质量的 ground_truth 作为 Context Recall 的基准；不同 LLM 作为评判者可能给出不同分数，建议固定评判模型。

> 参见 [02-RAG三阶段流程](./02-RAG三阶段流程.md)、[10-RAG系统双架构](./10-RAG系统双架构.md)、[23-RAG系统完整实现](./23-RAG系统完整实现.md)、[04-评估指标](../机器学习/04-评估指标.md)、[02-词嵌入与分布式表示](../NLP/02-词嵌入与分布式表示.md)