---
author: "XunZong"
created: "2026-07-06"
tags: ["数据库", "向量数据库", "Milvus"]
aliases: ["Milvus Python操作", "pymilvus", "Milvus CRUD", "混合检索代码"]
---

# Milvus Python 操作指南

## 定义

Milvus Python SDK（`pymilvus`）提供了与 Milvus 向量数据库交互的完整编程接口，包括 Collection 管理、向量嵌入生成、混合检索、重排序等核心操作。结合 `milvus-model` 可无缝集成 BGE-M3 等嵌入模型，实现稠密+稀疏双向量检索。

## 连接与创建 Collection

```python
from pymilvus import MilvusClient, DataType, AnnSearchRequest, WeightedRanker
from milvus_model.hybrid import BGEM3EmbeddingFunction

# 连接 Milvus
client = MilvusClient(uri="http://localhost:19530", db_name="default")

# 创建 Schema（含稠密+稀疏双向量字段）
schema = client.create_schema(auto_id=False, enable_dynamic_field=True)
schema.add_field("id", DataType.VARCHAR, is_primary=True, max_length=100)
schema.add_field("text", DataType.VARCHAR, max_length=65535)
schema.add_field("dense_vector", DataType.FLOAT_VECTOR, dim=1024)   # BGE-M3 稠密维度
schema.add_field("sparse_vector", DataType.SPARSE_FLOAT_VECTOR)     # 稀疏向量
schema.add_field("source", DataType.VARCHAR, max_length=50)

# 准备索引参数
index_params = client.prepare_index_params()
index_params.add_index("dense_vector", "dense_index", "IVF_FLAT", "IP", {"nlist": 128})
index_params.add_index("sparse_vector", "sparse_index", "SPARSE_INVERTED_INDEX", "IP", {"drop_ratio_build": 0.2})

# 创建 Collection
client.create_collection("knowledge_base", schema=schema, index_params=index_params)
client.load_collection("knowledge_base")  # 加载到内存
```

## 插入数据（带 BGE-M3 嵌入）

```python
from milvus_model.hybrid import BGEM3EmbeddingFunction
import hashlib

# BGE-M3 同时生成稠密 + 稀疏向量
ef = BGEM3EmbeddingFunction(use_fp16=False)

texts = ["什么是注意力机制？", "Transformer 的核心创新是自注意力"]
embeddings = ef(texts)

data = []
for i, text in enumerate(texts):
    # 解析稀疏向量（不同格式兼容处理）
    sparse_vec = {}
    try:
        row = embeddings["sparse"][i]
        if hasattr(row, 'col'):       # coo_array 格式
            indices, values = row.col, row.data
        else:                          # csr_matrix 格式
            indices, values = row.indices, row.data
    except:
        row = embeddings["sparse"].getrow(i)
        indices, values = row.indices, row.data

    for idx, val in zip(indices, values):
        sparse_vec[int(idx)] = float(val)

    data.append({
        "id": hashlib.md5(text.encode()).hexdigest(),
        "text": text,
        "dense_vector": embeddings["dense"][i].tolist(),
        "sparse_vector": sparse_vec,
        "source": "ai_knowledge"
    })

client.upsert("knowledge_base", data=data)
```

## 混合检索 + 重排序

```python
# 查询向量化
query_embeddings = ef(["什么是Transformer？"])
dense_q = query_embeddings["dense"][0]

sparse_q = {}
row = query_embeddings["sparse"][0]
indices = row.col if hasattr(row, 'col') else row.indices
values = row.data if hasattr(row, 'data') else row.data
for idx, val in zip(indices, values):
    sparse_q[int(idx)] = float(val)

# 稠密检索请求
dense_req = AnnSearchRequest(
    data=[dense_q], anns_field="dense_vector",
    param={"metric_type": "IP", "params": {"nprobe": 10}},
    limit=20
)

# 稀疏检索请求
sparse_req = AnnSearchRequest(
    data=[sparse_q], anns_field="sparse_vector",
    param={"metric_type": "IP", "params": {}},
    limit=20
)

# 混合检索：加权融合（稠密权重0.7，稀疏权重0.3）
ranker = WeightedRanker(0.7, 0.3)
results = client.hybrid_search(
    "knowledge_base", [dense_req, sparse_req],
    ranker=ranker, limit=10,
    output_fields=["text", "source"]
)

# 结果重排序（BGE-Reranker）
from sentence_transformers import CrossEncoder
reranker = CrossEncoder("BAAI/bge-reranker-v2-m3")
pairs = [[query, hit["entity"]["text"]] for hit in results[0]]
scores = reranker.predict(pairs)
ranked = sorted(zip(results[0], scores), key=lambda x: x[1], reverse=True)
```

## 过滤搜索与分区搜索

```python
# 带过滤条件的向量搜索
results = client.search(
    "knowledge_base",
    data=[dense_q],
    anns_field="dense_vector",
    param={"metric_type": "IP", "nprobe": 10},
    limit=5,
    expr="source == 'ai_knowledge'",     # 标量过滤
    output_fields=["text"]
)

# 分区搜索：先按类划分数据
client.create_partition("knowledge_base", "part_math")
client.insert("knowledge_base", data, partition_name="part_math")

results = client.search(
    "knowledge_base", data=[dense_q],
    anns_field="dense_vector",
    param={"metric_type": "IP"},
    limit=5,
    partition_names=["part_math"]         # 指定分区
)
```

## 删除与修改

```python
# 删除（按 ID）
client.delete("knowledge_base", ids=["hash_value_xxx"])

# 修改（按过滤表达式删除后重新插入）
client.delete("knowledge_base", filter="source == 'old_data'")

# 删除 Collection
client.drop_collection("knowledge_base")
```

## ML/DL 应用场景

| 应用场景 | 具体操作 | 说明 |
|----------|----------|------|
| RAG 知识库 | Collection 创建 + 数据插入 + 混合检索 | BGE-M3 生成稠密+稀疏向量，双路召回提升检索覆盖率 |
| 语义缓存 | 向量搜索 + 精确匹配降级 | 高频查询结果缓存，类似问题直接返回 |
| 多租户系统 | Partition 分区 + 标量过滤 | 按租户 ID 划分数据，隔离不同用户的知识空间 |
| 在线学习 | 增量插入 + 索引动态更新 | 新数据持续加入 Collection，无需重建全部索引 |

## 面试追问

**Q1（基础）**：为什么 Milvus Schema 中需要同时定义 FLOAT_VECTOR 和 SPARSE_FLOAT_VECTOR 两个向量字段？各自的维度特点是什么？
**回答要点**：稠密向量（FLOAT_VECTOR）固定维度（如 BGE-M3 的 1024 维），连续浮点数表示语义特征；稀疏向量（SPARSE_FLOAT_VECTOR）维度极高但绝大多数位置为 0，仅少数非零位携带词级别信息；前者擅长语义匹配，后者擅长精确关键词匹配，混合使用互补。

**Q2（深挖）**：混合检索中的 WeightedRanker 权重（如稠密 0.7: 稀疏 0.3）如何影响最终结果？如何调优？
**回答要点**：稠密权重越高结果越偏向语义相似度，稀疏权重越高越偏向关键词精确匹配；调优需在验证集上比较不同权重下的 NDCG/MRR 指标；业务场景偏语义搜索（如开放问答）用高稠密权重，偏精确匹配（如 FAQ）用高稀疏权重；也可用动态权重——根据查询长度或分类结果调整融合比例。

**Q3（实战）**：用 Milvus 实现 RAG 系统时，检索后的 BGE-Reranker 重排序步骤为什么能提升最终效果？它与普通向量检索的区别是什么？
**回答要点**：向量检索（Bi-Encoder）将查询和文档独立编码为向量，用余弦/IP 近似度量相似度，速度快但精度有限；Reranker（Cross-Encoder）将查询+文档对输入模型做全交互注意力计算，精度更高但无法预索引；两阶段架构（向量粗筛→Reranker 精排）兼顾速度和精度，尤其在 Top-100 内 Reranker 可显著提升排序质量。

**Q4（边界）**：在大规模生产环境中，BGE-M3 在线生成嵌入向量可能遇到哪些性能瓶颈？如何缓解？
**回答要点**：模型推理耗时——开启半精度（use_fp16=True）减少显存和计算量；大文本切分——超长文本先切块再分别嵌入，取池化向量（mean pooling）；并发请求排队——对嵌入服务做异步批处理（dynamic batching），合并多个请求同时推理；GPU OOM——使用更小的嵌入模型（如 BGE-small）或 CPU 推理作为降级方案。

> 参见 [[08-Milvus核心概念]]、[[10-嵌入与向量化]]、[[11-混合检索与重排序]]、[[07-向量数据库概述]]
