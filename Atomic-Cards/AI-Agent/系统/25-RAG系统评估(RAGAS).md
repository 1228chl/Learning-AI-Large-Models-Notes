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

| 指标 | 衡量内容 | 计算方法 | 公式 |
|:----|:---------|:---------|:-----|
| **Context Relevancy**（上下文相关性） | 检索到的上下文是否与问题相关 | LLM 从上下文中抽取对回答问题至关重要的句子，计算抽取句子与原始上下文的字符比例 | $\text{CR} = \frac{\text{len(extracted sentences)}}{\text{len(original context)}}$ |
| **Context Recall**（上下文召回率） | 上下文是否覆盖标准答案所需的所有信息 | 将 ground_truth 拆分为 claims，检查每个 claim 是否能从 context 中找到依据 | $\text{CRecall} = \frac{\text{claims supported by context}}{\text{total claims}}$ |

**Context Recall 计算示例**：

```python
# Context Recall计算示例：将标准答案拆解为原子事实，逐一验证检索上下文是否覆盖
ground_truth: "2010年世界杯的冠军是西班牙。决赛中他们1-0战胜了荷兰。"
claims: ["2010年世界杯的冠军是西班牙", "决赛中他们1-0战胜了荷兰"]

# 检索到的上下文只覆盖了部分事实
retrieved context: ["2010年世界杯的决赛中西班牙战胜了荷兰"]
# claim1"冠军是西班牙"可在检索结果中找到依据 → 覆盖成功
→ claim1 "冠军是西班牙" 可在 context 中找到 ✓
# claim2"比分1-0"在检索结果中未出现 → 覆盖失败
→ claim2 "比分1-0" 未在 context 中出现 ✗
# 召回率 = 被覆盖的事实数 / 总事实数 = 1/2 = 0.5
→ Recall = 1/2 = 0.5
```

### 生成侧指标

| 指标 | 衡量内容 | 计算方法 | 公式 |
|:----|:---------|:---------|:-----|
| **Faithfulness**（忠实度） | 生成的答案是否忠于检索到的上下文 | 将答案拆分为独立陈述，逐一判断每个陈述是否能从 context 推断出来 | $F = \frac{|V|}{|S|}$，其中 $|V|$ 是能从 context 推断的陈述数，$|S|$ 是答案中陈述总数 |
| **Answer Relevancy**（答案相关性） | 生成的答案与问题的匹配程度 | LLM 根据答案反向生成 n 个问题，计算生成问题与原始问题的语义相似度 | $\text{AR} = \frac{1}{n}\sum_{i=1}^{n} \cos(E(q_i), E(q_{\text{orig}}))$，其中 $E$ 为嵌入函数，$q_i$ 为反向生成的问题 |

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
# 构造RAGAS所需的四字段评估数据：用户问题、系统答案、检索上下文和标准答案
data = {"question": [...], "answer": [...],
        "contexts": [...], "ground_truths": [...]}
# 将字典格式的数据转为HuggingFace Dataset对象，供RAGAS框架的标准评估流程使用
dataset = Dataset.from_dict(data)

# 配置评估环境（使用 LangChain OpenAI 接口）
from langchain_openai import OpenAIEmbeddings, ChatOpenAI

# 执行评估，同时传入四个核心指标，全面衡量检索质量和生成质量
result = evaluate(

    dataset=dataset,

    metrics=[faithfulness, answer_relevancy,
             context_relevancy, context_recall]
)
# 输出各指标的评分结果，用于评估RAG系统的整体性能
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
**回答要点**：

1. 传统评估依赖人工标注标准答案，成本高、速度慢
2. RAGAS 通过 LLM 自动评估，无需人工标注即可计算多个维度的指标
3. 支持快速迭代对比，适合 RAG 开发的"评估-改进"循环

**Q2（深挖）**：Faithfulness（忠实度）和 Answer Relevancy（答案相关性）有什么区别？
**回答要点**：

1. Faithfulness 衡量答案是否忠于检索到的 context（避免幻觉），答案中的每句话都应有 context 支撑
2. Answer Relevancy 衡量答案是否针对问题本身（避免答非所问）
3. 前者关注"是否胡说"，后者关注"是否切题"

**Q3（实战）**：Context Recall 偏低可能是什么原因？如何改进？
**回答要点**：

1. 原因：文档切片策略不当导致关键信息丢失、检索 top-k 数量不足、Embedding 模型语义理解能力弱
2. 改进：优化切片大小（256-512 tokens）、增加检索数量、使用更优质的 Embedding 模型（如 BGE/bce-embedding）
3. 尝试混合检索策略

**Q4（边界）**：RAGAS 基于 LLM 做评估有什么局限性？
**回答要点**：

1. LLM 自身也可能有偏差，对于需要精确事实判断的场景可能误判
2. 评估指标分数是相对参考值而非绝对值；需要较高质量的 ground_truth 作为 Context Recall 的基准
3. 不同 LLM 作为评判者可能给出不同分数，建议固定评判模型

## 参考引用
- 需要理解RAG三阶段流程的相关知识，参见 [RAG三阶段流程](../RAG流程/02-RAG三阶段流程.md)
- 需要理解RAG系统双架构的相关知识，参见 [RAG系统双架构](./10-RAG系统双架构.md)
- 需要理解RAG系统完整实现的相关知识，参见 [RAG系统完整实现](23-RAG系统完整实现.md)
- 需要理解评估指标的机器学习原理与应用，参见 [评估指标](../../机器学习/基础/04-评估指标.md)
- 需要理解词嵌入与分布式表示的自然语言处理原理，参见 [词嵌入与分布式表示](../../NLP/基础/02-词嵌入与分布式表示.md)
