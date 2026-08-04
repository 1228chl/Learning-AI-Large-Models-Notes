---
author: "XunZong"
created: "2026-07-10"
tags: ["数据库", "向量检索", "重排序"]
aliases: ["BGE-Reranker", "重排序模型", "Cross-Encoder"]
---

# BGE-Reranker 重排序模型

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

### 模型架构（以 v2-m3 为例）

| 配置项 | 值 |
|:-------|:---|
| **基础模型** | `XLM-RoBERTa-Large`（多语言） |
| **参数量** | ~568M（约 5.68 亿） |
| **Transformer 层数** | 24 |
| **隐藏维度** | 1024 |
| **注意力头数** | 16 |
| **词表大小** | ~250K（覆盖 100+ 语言） |
| **最大输入长度** | 512 Token（部分微调变体支持 2048） |
| **输出** | 标量相关性分数（sigmoid 归一化到 $[0, 1]$） |

输入格式：`[CLS] Query Tokens [SEP] Document Tokens [SEP]`

查询与文档拼接后一起送入 Transformer，所有注意力头在查询和文档 Token 之间进行**全交互注意力计算**，实现细粒度语义对齐。

### 训练数据构造

BGE-Reranker 的标注数据来自三个渠道：

1. **公开标注数据集**：MS MARCO、TREC DL、DuReader、MIRACL、NQ、TriviaQA
2. **LLM 合成数据**：用大语言模型生成(query, doc, label)三元组，经人工筛选过滤
3. **用户行为日志**：点击率、停留时间作为弱监督信号

**三级负采样策略**（层次化困难负样本挖掘）：

$$
\text{Negative Types} = \{\text{Random}, \text{BM25-Hard}, \text{Semantic-Hard}\}
$$

| 负采样级别 | 采样方式 | 目的 |
|:-----------|:---------|:-----|
| **随机负采样** | 从语料库随机采样文档 | 提供基础对比信号 |
| **BM25 硬负采样** | BM25 得分高但语义不相关的文档 | 区分词汇匹配与语义匹配 |
| **语义硬负采样** | 嵌入检索 Top-K 中不相关的文档 | 模拟真实 RAG 干扰场景 |

> 三级负采样使 MRR@10 提升 8%+。

### 多任务联合训练

BGE-Reranker 同时优化三个训练目标：

| 任务 | 目标 | 损失函数 |
|:-----|:-----|:---------|
| **相关性分类** | 判断 query-doc 是否相关 | 二元交叉熵 $\mathcal{L}_{\text{BCE}}$ |
| **排序学习** | 保持正/负样本的相对顺序 | 排序合页损失 $\mathcal{L}_{\text{Rank}}$ |
| **知识蒸馏** | 模仿教师模型的软标签分布 | KL 散度 $\mathcal{L}_{\text{Distill}}$ |

$$
\mathcal{L}_{\text{total}} = \alpha \mathcal{L}_{\text{BCE}} + \beta \mathcal{L}_{\text{Rank}} + \gamma \mathcal{L}_{\text{Distill}}
$$

> $\alpha, \beta, \gamma$ 为权重超参数，控制各任务的贡献。

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

**Q1（基础）**：BGE-M3 的 M3 代表什么含义？其底层基础模型是什么架构？
**回答要点**：

1. M3 = Multi-lingual（100+ 语言）、Multi-function（同时输出稠密/稀疏/多向量三种表征）、Multi-granularity（支持短句到 8192 Token 长文档）。
2. 底层基础模型为 **XLM-RoBERTa**：24 层 Transformer、1024 隐藏维、16 头注意力、词表 250K。
3. BGE-M3 保留了 XLM-RoBERTa 的完整结构，并在骨干网络上附加三个独立的输出头（稠密头、稀疏头、多向量头），实现单次前向传播同时输出三种表征。

**Q2（深挖）**：BGE-M3 的三阶段训练流程分别解决什么问题？自知识蒸馏在其中的作用是什么？
**回答要点**：

1. 第一阶段 RetroMAE 预训练：将最大序列长度从 512 扩展到 8192 Token，通过高掩码率的回溯式掩码自编码器学习长距离依赖。
2. 第二阶段无监督对比学习：通过对比损失 $\mathcal{L}_{\text{contrast}}$ 拉近语义相似的句子对、推远不相似的对，学习高质量稠密嵌入。
3. 第三阶段自知识蒸馏统一微调：三头输出的融合得分作为教师信号 $s_{\text{ensemble}} = s_{\text{dense}} + s_{\text{sparse}} + s_{\text{mul}}$ 指导每个单独头部的训练，使三种检索模式互相增强，稠密向量学到稀疏向量的精确匹配能力，稀疏向量学到稠密向量的语义泛化能力。

**Q3（实战）**：在 RAG 系统中，BGE-M3 嵌入模型和 BGE-Reranker 如何协同工作？它们的分工是什么？
**回答要点**：

1. 第一阶段（粗排）：用 BGE-M3 对查询编码，输出稠密向量和稀疏向量，通过 Hybrid Search 从大规模文档库中快速召回候选 Top-50~100。
2. 第二阶段（精排）：将候选文档与查询拼接为 (query, doc) 对，用 BGE-Reranker 的 Cross-Encoder 架构逐对精细打分，选出 Top-3~10。
3. 分工逻辑：BGE-M3（Bi-Encoder）速度快可索引，负责大规模筛选；BGE-Reranker（Cross-Encoder）精度高但慢，负责小规模精排。两者互补实现性能与精度的平衡。

**Q4（边界）**：BGE-Reranker 的训练数据是如何构造的？三级负采样策略为什么有效？
**回答要点**：

1. 训练数据来源：公开标注数据集（MS MARCO、NQ）、LLM 合成数据经人工筛选、用户行为日志弱监督，三种来源互补平衡成本和多样性。
2. 三级负采样：随机负采样（基础对比信号）→ BM25 硬负采样（区分词汇匹配与语义匹配）→ 语义硬负采样（模拟真实 RAG 干扰场景），难度逐级增加，使模型学会区分越来越细微的语义差异。
3. 多任务联合训练：相关性分类（BCE 损失）+ 排序学习（Ranking Loss）+ 知识蒸馏（KL 散度），三个目标同时优化，总损失 $\mathcal{L}_{\text{total}} = \alpha \mathcal{L}_{\text{BCE}} + \beta \mathcal{L}_{\text{Rank}} + \gamma \mathcal{L}_{\text{Distill}}$。
4. 风险：Reranker 的推理延迟与候选数量成正比；对第一阶段召回的依赖性很强——如果第一阶段漏掉了真正相关的文档，Reranker 无力回天。

## 参考引用

- 需要理解 RRF 排序器与加权排序的相关知识，参见 [RRF排序器与加权排序](04-RRF排序器与加权排序.md)
- 需要理解混合检索与重排序的相关知识，参见 [混合检索与重排序](02-混合检索与重排序.md)
- 需要理解嵌入与向量化的相关知识，参见 [嵌入与向量化](01-嵌入与向量化.md)
- 需要掌握 BM25 算法的相关知识，参见 [BM25算法](../../AI-Agent/检索/01-BM25算法.md)