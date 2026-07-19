---
author: "XunZong"
created: "2026-07-19"
tags: ["AI-Agent", "RAG", "向量检索"]
aliases: ["BGE-M3", "混合检索", "稠密向量", "稀疏向量", "重排序"]
---

# BGE-M3 嵌入模型与混合检索

## 定义

BGE-M3 是 BAAI 推出的多语言通用嵌入模型，一个模型同时生成**稠密向量（Dense）**和**稀疏向量（Sparse）**，配合 BGE-Reranker 重排序模型和 Milvus 向量数据库，构成完整的"双路召回 + 精排"RAG 检索管线。

$$
\text{Hybrid Retrieval} = \text{Dense（语义相似度）} + \text{Sparse（关键词精确匹配）}
$$

### 核心架构

```python
from milvus_model.hybrid import BGEM3EmbeddingFunction
from pymilvus import AnnSearchRequest, WeightedRanker
from sentence_transformers import CrossEncoder

# 1. BGE-M3 嵌入：同时生成稠密向量和稀疏向量
embedding_fn = BGEM3EmbeddingFunction(model_name_or_path="bge-m3", use_fp16=True, device="cuda")
dense_vecs = embedding_fn(["文档内容"])["dense"]     # 1024维稠密向量
sparse_vecs = embedding_fn(["文档内容"])["sparse"]   # 稀疏向量（关键词权重）

# 2. 混合检索：密检索 + 稀疏检索 → WeightedRanker 合并
dense_req = AnnSearchRequest(dense_vecs, "dense_index", param={"metric_type": "IP"}, limit=10)
sparse_req = AnnSearchRequest(sparse_vecs, "sparse_index", param={"metric_type": "IP"}, limit=10)
results = client.hybrid_search(collection, [dense_req, sparse_req], WeightedRanker(0.5, 0.5), limit=10)

# 3. BGE-Reranker 重排序：CrossEncoder 对粗排结果精确打分
reranker = CrossEncoder("bge-reranker-v2-m3", device="cuda")
pairs = [(query, doc.text) for doc in candidates]
scores = reranker.predict(pairs)     # 返回 [0,1] 之间的相关性分数
```

## 三种向量对比

| 向量类型 | 生成方式 | 特点 | 检索方式 | 优势场景 |
|:---------|:---------|:-----|:---------|:---------|
| 稠密向量（Dense） | BGE-M3 编码器输出 1024 维浮点向量 | 连续向量，语义信息丰富 | 余弦相似度 / 内积（IP） | 语义理解、同义词匹配 |
| 稀疏向量（Sparse） | BGE-M3 编码器输出词级权重 | 离散向量，维度为词汇表大小 | 关键词匹配（内积） | 精确匹配、专有名词、数字 |
| 混合检索 | WeightedRanker 合并 Dense + Sparse 得分 | 两者结合，取长补短 | `WeightedRanker(0.5, 0.5)` | 通用场景，兼顾语义和精确 |

## 重排序模型

BGE-Reranker-v2-m3 是基于 CrossEncoder 的重排序模型，与 Embedding 模型的核心区别：

| 对比维度 | Embedding 模型（BGE-M3） | Reranker 模型（BGE-Reranker） |
|:---------|:------------------------|:-----------------------------|
| 输入方式 | 独立编码文本 | 查询和文档拼接为文本对输入 |
| 输出 | 固定长度向量 | 相关性分数（0~1） |
| 计算量 | 低（可预计算向量） | 高（每对需重新计算） |
| 精度 | 中等（近似检索） | 高（精确打分） |
| 使用阶段 | 索引 + 粗排 | 精排（TopK 候选重排序） |

## 直观理解

BGE-M3 像一个"双语翻译官"——既能理解语义（稠密向量），又能捕捉关键词（稀疏向量）。混合检索是"语义理解 + 关键词精确匹配"的双保险，再配合重排序这个"质量检查员"对粗排结果做二次筛选。

## RAG 工程应用场景

| 应用场景 | 检索方式 | 说明 |
|:---------|:---------|:-----|
| 多语言 RAG 问答 | Dense Sparse 混合 | BGE-M3 支持 170+ 种语言，适合中英文混合文档检索 |
| 专有名词匹配 | Sparse 为主 | 如"BGE-M3"、"PyTorch 2.0"等精确术语需 Sparse 确保匹配 |
| 语义理解查询 | Dense 为主 | 如"深度学习在医疗领域的应用"需要语义相似度匹配 |
| 生产级 RAG | 混合检索 + Rerank | 两阶段：粗排（ANN 快速召回 TopK）→ 精排（Rerank 精确打分） |

## 面试追问

**Q1（基础）**：BGE-M3 的"M3"代表什么？它和普通 Embedding 模型有什么区别？
**回答要点**：

1. M3 代表 **Multi-Linguality**（多语言）、**Multi-Granularity**（多粒度）、**Multi-Functionality**（多功能）
2. 多语言：支持 170+ 种语言，中英文混合场景无需切换模型
3. 多粒度：支持从短句到长文档的不同长度输入
4. 多功能：一个模型同时生成稠密向量和稀疏向量，无需维护两个独立模型

**Q2（深挖）**：为什么需要混合检索而非纯向量检索？Dense 和 Sparse 各自解决什么问题？
**回答要点**：

1. 纯 Dense 检索：擅长语义相似度匹配，但可能漏掉精确关键词（如"Python 3.12"中的"3.12"）
2. 纯 Sparse 检索：擅长关键词精确匹配，但无法处理同义词和语义理解（如"电脑"和"计算机"）
3. 混合检索通过 WeightedRanker 或 RRFRanker 合并 Dense 和 Sparse 的召回结果，取长补短
4. 典型权重分配：`WeightedRanker(0.5, 0.5)` 或根据业务场景动态调整

**Q3（实战）**：Rerank 重排序为什么是 RAG 检索的必要环节？如何实现？
**回答要点**：

1. ANN（近似最近邻）检索追求速度，用近似算法可能把真正最相关的结果排在 TopK 后面
2. Rerank 用 CrossEncoder 对查询和文档拼接后精确打分，计算量高但精度显著提升
3. 实现流程：ANN 粗排召回 TopK（如 100 条）→ Rerank 精排取 TopN（如 5 条）
4. 实际效果：Top1 准确率可从 60% 提升到 85%+，以少量额外计算换取排序质量大幅提升

**Q4（边界）**：BGE-M3 的稀疏向量和传统 BM25 的关键词匹配有什么区别？
**回答要点**：

1. BM25 基于词频统计（TF-IDF 的改进版），不依赖模型，无法理解语义
2. BGE-M3 稀疏向量是模型生成的，每个词的权重由模型根据上下文语义决定
3. BGE-M3 稀疏向量可处理 OOV（未登录词）问题，BM25 严格依赖词典
4. 两者对比如：BM25 是"机械的词汇统计"，BGE-M3 稀疏向量是"语义感知的关键词权重"

## 参考引用

- 需要理解 RAG 三阶段流程参见 [RAG 三阶段流程](../RAG流程/02-RAG三阶段流程.md)
- 需要掌握向量数据库与 Milvus 基础参见 [向量数据库概述](../../数据库/Milvus/07-向量数据库概述.md)
- 需要了解 BM25 稀疏检索算法参见 [BM25 算法](../../数据库/检索/05-BM25算法.md)
- 需要掌握稠密与稀疏检索对比参见 [稠密与稀疏检索](../../数据库/检索/16-稠密与稀疏检索.md)
- 需要了解 RAG 系统完整实现参见 [RAG 系统完整实现](./23-RAG系统完整实现.md)