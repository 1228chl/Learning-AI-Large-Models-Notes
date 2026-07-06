---
author: "XunZong"
created: "2026-07-06"
tags: ["数据库", "向量数据库", "Milvus"]
aliases: ["Milvus", "Collection", "IVF", "HNSW"]
---

# Milvus 核心概念

## 定义

Milvus 是一个开源的分布式向量数据库，专为处理海量向量数据的相似度搜索而设计。它支持万亿级向量规模的 ANN（Approximate Nearest Neighbor）搜索，是生产级 RAG 系统中最常用的向量数据库之一。

## 核心数据模型

| 概念 | 类比 MySQL | 说明 |
|------|-----------|------|
| **Collection**（集合） | 表（Table） | 存储向量和标量字段的容器 |
| **Field**（字段） | 列（Column） | 包括主键、向量字段、标量字段 |
| **Entity**（实体） | 行（Row） | 一条完整的数据记录 |
| **Index**（索引） | 索引 | 加速向量检索的数据结构 |
| **Partition**（分区） | 分区表 | 按标签分割数据，提升查询效率 |

## Schema 设计示例

```python
from pymilvus import CollectionSchema, FieldSchema, DataType

fields = [
    FieldSchema(name="id", dtype=DataType.INT64, is_primary=True),
    FieldSchema(name="embedding", dtype=DataType.FLOAT_VECTOR, dim=768),
    FieldSchema(name="text", dtype=DataType.VARCHAR, max_length=4096),
    FieldSchema(name="category", dtype=DataType.VARCHAR, max_length=64),
]

schema = CollectionSchema(fields, description="RAG 知识库")
collection = Collection(name="edu_rag", schema=schema)
```

## 索引类型

| 索引 | 原理 | 适用规模 | 特点 |
|------|------|----------|------|
| **IVF_FLAT** | 倒排文件 + 精确距离计算 | 百万级 | 精度高，速度适中 |
| **IVF_SQ8** | IVF + 标量量化（8bit） | 千万级 | 内存压缩 75%，速度提升 |
| **IVF_PQ** | IVF + 乘积量化 | 亿级 | 极致压缩，精度略有损失 |
| **HNSW** | 分层导航小世界图 | 百万级 | 速度最快，内存消耗大 |
| **DISKANN** | SSD 磁盘索引 | 十亿级 | 不依赖内存，成本低 |
| **FLAT** | 暴力搜索（不建索引） | 万级以下 | 100% 精度，速度慢 |

## 相似度搜索

```python
collection.load()                              # 加载到内存

search_params = {
    "metric_type": "IP",                        # 内积（或 L2、COSINE）
    "params": {"nprobe": 10}                    # 搜索的聚类数
}

results = collection.search(
    data=[query_vector],                        # 查询向量
    anns_field="embedding",                     # 向量字段名
    param=search_params,
    limit=10,                                   # 返回 Top-10
    expr="category == 'math'",                  # 标量过滤
    output_fields=["text"]                      # 返回字段
)
```

## 距离类型选择

| metric_type | 公式 | 值越大表示 | 适用场景 |
|-------------|------|-----------|----------|
| `L2`（欧氏距离） | $d = \sqrt{\sum (x_i - y_i)^2}$ | 越不相似 | 归一化向量 |
| `IP`（内积） | $dot = \sum x_i y_i$ | 越相似 | 未归一化向量 |
| `COSINE`（余弦） | $cos = \frac{\sum x_i y_i}{\Vert x\Vert \Vert y\Vert}$ | 越相似 | 文本语义搜索 |

> 参见 [[07-向量数据库概述]]、[[09-嵌入与向量化]]、[[10-混合检索与重排序]]、[[13-点积与余弦相似度]]

---

## Milvus Python CRUD 操作

以下代码演示基于 `pymilvus` 和 `milvus-model` 的完整操作流程。

### 1. 连接与创建 Collection

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

### 2. 插入数据（带 BGE-M3 嵌入）

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

### 3. 混合检索 + 重排序

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

### 4. 过滤搜索与分区搜索

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

### 5. 删除与修改

```python
# 删除（按 ID）
client.delete("knowledge_base", ids=["hash_value_xxx"])

# 修改（按过滤表达式删除后重新插入）
client.delete("knowledge_base", filter="source == 'old_data'")

# 删除 Collection
client.drop_collection("knowledge_base")
```
