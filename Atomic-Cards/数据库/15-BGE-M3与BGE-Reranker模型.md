---
author: "XunZong"
created: "2026-07-09"
tags: ["数据库", "向量检索", "嵌入模型"]
aliases: ["BGE-M3", "BGE-Reranker", "多向量编码", "重排序模型"]
---

# BGE-M3 与 BGE-Reranker 模型

## BGE-M3 多向量编码模型

BGE-M3（BAAI General Embedding - Multilingual, Multi-function, Multi-granularity）是北京智源人工智能研究院（BAAI）发布的多功能嵌入模型。它对文本编码后，可**同时**输出三种表征向量，用于不同类型的检索匹配。

### 稠密向量（Dense）

低维稠密向量（默认 1024 维），使用 Transformer 输出中 `[CLS]` Token 的隐藏状态作为全局语义向量。

$$
e_q = \text{norm}(\mathrm{H}_q[0])
$$

> **变量说明**：$e_q$ 为查询的稠密向量（归一化后）；$\mathrm{H}_q$ 为 Transformer 最后一层输出的隐藏状态矩阵（形状 $L \times d$，$L$ 为序列长度，$d$ 为隐藏维度）；$\mathrm{H}_q[0]$ 取 `[CLS]` Token 对应位置的向量；$\text{norm}$ 为 L2 归一化，使向量模长为 1。

$$
s_{\text{dense}} = f_{\text{sim}}(e_q, e_p)
$$

> **变量说明**：$s_{\text{dense}}$ 为稠密向量相似度分数；$e_q$、$e_p$ 分别为查询和文档的归一化稠密向量；$f_{\text{sim}}$ 为相似度函数，可以是**余弦距离**（Cosine Similarity）、**内积**（Dot Product）或 **L2 距离**的负值。

稠密向量的核心优势在于**语义泛化**：即使查询和文档使用不同词汇表达同一含义（如"汽车"与"车辆"），它们在稠密空间中仍然距离相近。

### 稀疏向量（Sparse）

高维稀疏向量，维度等于模型词表大小（数万至百万级）。仅对输入文本中出现的 Token 赋予非零权重，类似 BM25 的精确词匹配，但权重由神经网络学习得到。

$$
w_{qt} = \text{ReLU}(W_{\text{lex}}^T \mathrm{H}_q[i])
$$

> **变量说明**：$w_{qt}$ 为查询中 Token $t$ 的稀疏权重（非负值）；$W_{\text{lex}} \in \mathbb{R}^{d \times 1}$ 为可学习的线性投影矩阵，将隐藏状态 $d$ 维映射到 1 维标量；$\mathrm{H}_q[i]$ 为 Token $i$ 对应的隐藏状态向量；$\text{ReLU}$ 确保权重非负。

$$
s_{\text{lex}} = \sum_{t \in q \cap p} (w_{qt} \times w_{pt})
$$

> **变量说明**：$s_{\text{lex}}$ 为稀疏向量相似度分数；$q \cap p$ 表示查询与文档中共同出现的 Token 集合；$w_{qt}$、$w_{pt}$ 分别为查询和文档中 Token $t$ 的稀疏权重。

稀疏向量的核心优势在于**精确命中**：对专有名词、缩写、编号等需要精确匹配的场景效果优于稠密向量。

### 多向量（Multi-Vector）

对每个 Token 维度分别进行线性变换，查询和文档各自得到一个 Token 级向量序列。通过 **MaxSim**（最大相似度）操作计算非对称交互分数。

$$
E_q = \text{norm}(W_{\text{mul}}^T H_q)
$$

> **变量说明**：$E_q$ 为查询的多向量矩阵（形状 $N \times d$，$N$ 为查询 Token 数）；$W_{\text{mul}} \in \mathbb{R}^{d \times d}$ 为可学习的线性变换矩阵；$H_q$ 为 Transformer 隐藏状态矩阵。$\text{norm}$ 对每个 Token 向量分别做 L2 归一化。

$$
s_{\text{mul}} = \frac{1}{N} \sum_{i=1}^N \max_{j=1}^M E_q[i] \cdot E_p^T[j]
$$

> **变量说明**：$s_{\text{mul}}$ 为多向量交互分数；$N$、$M$ 分别为查询和文档的 Token 数；$E_q[i]$ 为查询第 $i$ 个 Token 的多向量；$E_p[j]$ 为文档第 $j$ 个 Token 的多向量；$\max_{j=1}^M$ 对每个查询 Token $i$ 找出文档中与之最相似的 Token $j$；$\frac{1}{N} \sum_{i=1}^N$ 对所有查询 Token 的 MaxSim 分数取均值。

多向量的核心优势在于**细粒度交互**：不像稠密向量将整句压缩为一个向量，也不像稀疏向量仅依赖词重叠，而是允许一个查询 Token 与文档中的多个 Token 进行最佳匹配，捕捉更丰富的语义关联。

### 三种向量的对比

| 对比维度 | 稠密向量（Dense） | 稀疏向量（Sparse） | 多向量（Multi-Vector） |
|----------|:-----------------:|:------------------:|:----------------------:|
| **维度** | 1024（固定低维） | 词表大小（非常高维） | Token 数 $\times$ 隐藏维 |
| **匹配粒度** | 整句级语义 | 词级精确匹配 | Token 级交互匹配 |
| **核心操作** | 余弦/内积相似度 | 共现 Token 权重乘积 | MaxSim + 均值 |
| **匹配哲学** | 全局语义对齐 | 精确词汇命中 | 细粒度最近邻对齐 |
| **对偶长** | 语义泛化、同义词 | 精确术语、缩写 | 短语级细粒度匹配 |
| **计算开销** | 低 | 低 | 中等 |
| **可索引性** | 可建 ANN 索引 | 可建倒排索引 | 需特殊处理 |

## BGE-Reranker 重排序模型

BGE-Reranker 基于 **XLM-RoBERTa**（Base 或 Large）交叉编码器架构，专门用于**重排序**（精排序）阶段。

### 核心原理

与嵌入模型（Bi-Encoder）不同，Reranker 将**查询与文档拼接后一起输入**，通过 Transformer 的交互注意力机制计算相关性分数：

$$
s_{\text{rerank}} = \text{Linear}(\text{CLS}_{\text{output}})
$$

> **变量说明**：$s_{\text{rerank}}$ 为 Reranker 输出的相关性分数；$\text{CLS}_{\text{output}}$ 为 `[CLS]` Token 经过交叉编码后的隐藏状态；$\text{Linear}$ 为全连接层，将隐藏状态映射到标量分数。

### Bi-Encoder vs Cross-Encoder

| 对比维度 | Bi-Encoder（嵌入模型） | Cross-Encoder（Reranker） |
|----------|----------------------|--------------------------|
| **输入方式** | 查询和文档分别独立编码 | 查询与文档拼接后一起编码 |
| **交互深度** | 无交互（仅最终向量比较） | 深层交互注意力（跨序列） |
| **索引化** | 可预计算向量并建 ANN 索引 | 不可预索引（须实时计算每对） |
| **推理速度** | 快（毫秒级，可批量） | 慢（百毫秒级每对） |
| **精度** | 中等 | 高 |
| **典型用途** | 大规模候选召回（Top-1000） | 小规模精排（Top-100 中选 Top-10） |

### 重排序流程

```
  用户查询
      ↓
[嵌入模型(Bi-Encoder)] ── 从千万级文档库快速召回候选 Top-100
      ↓
[BGE-Reranker(Cross-Encoder)] ── 对候选 Top-100 逐对精细打分
      ↓
  重排序后 Top-10 ──> LLM 生成最终回答
```

## ML/DL 应用场景

| 应用场景 | 使用的模型 | 作用 | 典型技术栈 |
|----------|-----------|------|-----------|
| **RAG 文档召回** | BGE-M3（稠密+稀疏） | 从知识库召回相关文档块 | Milvus + Hybrid Search |
| **混合检索** | BGE-M3（稠密+稀疏双输出） | 兼顾语义泛化和精确匹配 | WeightedRanker / RRF |
| **精排重排序** | BGE-Reranker | 对粗排结果二次排序提升精度 | Cross-Encoder + Top-K |
| **多语种检索** | BGE-M3 | 100+ 语言跨语种匹配 | 多语言文档检索系统 |
| **长文档检索** | BGE-M3（8192 Token） | 长文档端到端编码，无需分块 | 法律/学术文档检索 |
| **大型 RAG Pipeline** | BGE-M3 + BGE-Reranker | 第一阶段混合检索 + 第二阶段重排序 | 两阶段检索架构 |

## 代码示例：使用 milvus_model

```python
from pymilvus import Collection, WeightedRanker, connections
from milvus_model.hybrid import BGEM3EmbeddingFunction

# 1. 加载 BGE-M3 嵌入模型
#     该模型由 milvus_model 库封装，自动处理稠密、稀疏、多向量三种输出
#     device="cpu" 可改为 "cuda:0" 使用 GPU 加速（需 PyTorch + CUDA）
model = BGEM3EmbeddingFunction(
    model_name="BAAI/bge-m3",
    device="cpu",
    use_fp16=False          # CPU 推理关闭半精度，GPU 时可开启加速
)

# ============================================================
# 2. 文档索引阶段：对知识库文本进行嵌入，存入 Milvus
# ============================================================

docs = [
    "向量数据库是专门存储和检索向量数据的数据库系统",
    "BGE-M3支持稠密向量、稀疏向量和多向量三种输出",
    "Reranker模型通过交叉编码器对候选文档进行精细排序"
]

# 2a. 生成文本嵌入（同时输出稠密 + 稀疏两种向量）
#     返回结果包含两个字段：
#       - "dense":  形状 (N, 1024) 的稠密向量矩阵
#       - "sparse": 列表，每个元素为 {token_id: weight} 的稀疏向量字典
embeddings = model(docs)

# 2b. 将文档和嵌入向量写入 Milvus
#     假设已创建名为 "doc_collection" 的 Collection，包含：
#       text (VARCHAR)、dense_vector (FLOAT_VECTOR, dim=1024)、sparse_vector (SPARSE_FLOAT_VECTOR) 三个字段
connections.connect(host="localhost", port="19530")
collection = Collection("doc_collection")
collection.insert([
    docs,                            # 原始文本
    embeddings["dense"].tolist(),    # 稠密向量（转为 Python list 存入）
    embeddings["sparse"]             # 稀疏向量（milvus_model 返回的 scipy CSR 矩阵）
])
collection.flush()

# ============================================================
# 3. 检索阶段：混合搜索（稠密 + 稀疏），再使用 Reranker 精排
# ============================================================

query = "什么是多向量编码模型？"

# 3a. 对查询文本进行嵌入（同样输出稠密 + 稀疏）
query_embeddings = model([query])

# 3b. 构建稠密检索与稀疏检索请求参数
search_params_dense = {
    "metric_type": "IP",             # 内积相似度（因向量已 L2 归一化，等价于余弦相似度）
    "params": {"nprobe": 10}         # 检索时探测的聚类数，越大精度越高但越慢
}

# 3c. 混合检索：同时提交稠密检索和稀疏检索请求
#     WeightedRanker(0.5, 0.5) 表示稠密和稀疏各占 50% 权重
hybrid_results = collection.hybrid_search(
    reqs=[
        {"vector": query_embeddings["dense"][0], "anns_field": "dense_vector",
         "param": search_params_dense, "limit": 100},
        {"vector": query_embeddings["sparse"][0], "anns_field": "sparse_vector",
         "param": {"metric_type": "IP"}, "limit": 100}
    ],
    rerank=WeightedRanker(0.5, 0.5),
    limit=50,
    output_fields=["text"]
)

# 解码结果：提取候选文档文本
candidates = [hit.fields["text"] for hit in hybrid_results[0]]

# ============================================================
# 4. 第二阶段：BGE-Reranker 精排（从 Top-50 中选出 Top-5）
# ============================================================

from sentence_transformers import CrossEncoder

# 4a. 加载 BGE-Reranker 交叉编码器
reranker = CrossEncoder("BAAI/bge-reranker-v2-m3")

# 4b. 构造 (query, doc) 对，逐对计算相关性分数
pairs = [(query, doc) for doc in candidates]
scores = reranker.predict(pairs)    # 返回形状 (N,) 的分数数组，分数越高越相关

# 4c. 按分数降序排列，取 Top-5
ranked_pairs = sorted(zip(candidates, scores), key=lambda x: x[1], reverse=True)
top_5 = ranked_pairs[:5]

print("=== BGE-Reranker 精排 Top-5 ===")
for rank, (doc, score) in enumerate(top_5, 1):
    print(f"{rank}. [score={score:.4f}] {doc}")

# 最终 Top-5 文档可作为 LLM 回答的上下文输入
```

## 面试追问

**Q1（基础）**：BGE-M3 能同时输出哪三种向量？各自适合于什么检索场景？
**回答要点**：

1. 稠密向量（Dense）：1024 维连续向量，捕捉全局语义，适合语义相似度匹配。
2. 稀疏向量（Sparse）：词表级别高维稀疏向量，每个 Token 有独立权重，适合精确关键词匹配。
3. 多向量（Multi-Vector）：每个 Token 一个向量，通过 MaxSim 操作实现细粒度交互匹配，适合短语级对齐。

**Q2（深挖）**：BGE-M3 的多向量（Multi-Vector）计算方式与稠密向量的余弦相似度有什么本质区别？
**回答要点**：

1. 稠密向量将整句压缩为一个全局向量（[CLS] 位置输出），计算方式为 $f_{\text{sim}}(e_q, e_p)$，是**整体到整体**的比较。
2. 多向量保留每个 Token 的独立表示，计算方式为 $s_{\text{mul}} = \frac{1}{N} \sum_{i=1}^N \max_{j=1}^M E_q[i] \cdot E_p^T[j]$，是**局部到局部**的交互比较。
3. 多向量的 MaxSim 操作允许一个查询 Token 与文档中任意 Token 最佳匹配，不受位置和顺序的限制，在短语级匹配上更有优势。

**Q3（实战）**：在 RAG 系统中，BGE-M3 嵌入模型和 BGE-Reranker 如何协同工作？它们的分工是什么？
**回答要点**：

1. 第一阶段（粗排）：用 BGE-M3 对查询编码，输出稠密向量和稀疏向量，通过 Hybrid Search 从大规模文档库中快速召回候选 Top-50~100。
2. 第二阶段（精排）：将候选文档与查询拼接为 (query, doc) 对，用 BGE-Reranker 的 Cross-Encoder 架构逐对精细打分，选出 Top-3~10。
3. 分工逻辑：BGE-M3（Bi-Encoder）速度快可索引，负责大规模筛选；BGE-Reranker（Cross-Encoder）精度高但慢，负责小规模精排。两者互补实现性能与精度的平衡。

**Q4（边界）**：BGE-M3 和 BGE-Reranker 各自有什么局限性？在什么场景下可能失效？
**回答要点**：

1. BGE-M3 稠密向量对罕见词、专业术语的敏感度可能不足，需结合稀疏向量补偿。
2. BGE-M3 多向量检索需要特殊索引支持（如 Milvus 的 Float16/BM25 索引），不能直接用标准 ANN 索引。
3. BGE-Reranker 的推理延迟与候选数量成正比：假设每对 100ms，Top-100 就需要约 10 秒，实时性要求高的场景不可接受。
4. Reranker 对第一阶段召回的依赖性很强：如果第一阶段漏掉了真正相关的文档，Reranker 无力回天。
5. 改进思路：增大第一阶段 recall 的候选数（如从 100 增至 500），优化嵌入质量；Reranker 延迟可通过模型蒸馏、小模型替代或分批推理缓解。

## 参考引用

- 需要理解 RRF 排序器与加权排序的相关知识，参见 [RRF排序器与加权排序](./14-RRF排序器与加权排序.md)
- 需要理解混合检索与重排序的相关知识，参见 [混合检索与重排序](./11-混合检索与重排序.md)
- 需要理解嵌入与向量化的相关知识，参见 [嵌入与向量化](./10-嵌入与向量化.md)
- 需要掌握 BM25 算法的相关知识，参见 [BM25算法](../AI-Agent/05-BM25算法.md)