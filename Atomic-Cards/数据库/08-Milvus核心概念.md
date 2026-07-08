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

| metric_type  | 公式                                                     | 值越大表示 | 适用场景   |
| ------------ | ------------------------------------------------------ | ----- | ------ |
| `L2`（欧氏距离）   | $d = \sqrt{\sum (x_i - y_i)^2}$                        | 越不相似  | 归一化向量  |
| `IP`（内积）     | $dot = \sum x_i y_i$                                   | 越相似   | 未归一化向量 |
| `COSINE`（余弦） | $cos = \frac{\sum x_i y_i}{\Vert x\Vert \Vert y\Vert}$ | 越相似   | 文本语义搜索 |

## 面试追问

**Q1（基础）**：Milvus 中的 Collection、Field、Entity、Index、Partition 分别对应 MySQL 中的什么概念？它们的关系是什么？

**回答要点**：① Collection ≈ 表（Table），Field ≈ 列（Column），Entity ≈ 行（Row），Index ≈ 索引，Partition ≈ 分区表。② Collection 包含多个 Field（主键、向量字段、标量字段）。③ Partition 按标签分割数据，可缩小搜索范围。④ Index 是加速向量检索的数据结构，创建索引后才能进行高效的相似度搜索。

**Q2（深挖）**：IVF_FLAT、IVF_SQ8、IVF_PQ 和 HNSW 这几种 Milvus 索引的原理和适用规模有何不同？如何选型？

**回答要点**：① IVF_FLAT：倒排文件+精确距离计算，百万级，精度高但内存消耗大。②IVF_SQ8：标量量化 8bit 压缩，千万级，内存减少 75%，速度提升但精度略有损失。③IVF_PQ：乘积量化，亿级，极致压缩，精度损失最大。④ HNSW：分层导航小世界图，百万级，查询速度最快但内存消耗大，适合对延迟敏感的场景。⑤ 选型：数据量小用 FLAT/IVF_FLAT，大并追求速度用 IVF_SQ8，超大且可接受精度损失用 IVF_PQ，低延迟场景用 HNSW。

**Q3（实战）**：在 Milvus 中如何实现稠密向量和稀疏向量的混合检索？请写出核心代码流程。

**回答要点**：① Schema 需要分别定义 dense_vector（FLOAT_VECTOR）和 sparse_vector（SPARSE_FLOAT_VECTOR）两个字段，各自创建独立索引。② 使用 BGEM3EmbeddingFunction 同时生成稠密和稀疏向量。③ 创建两个 AnnSearchRequest 分别对应稠密和稀疏检索，再用 WeightedRanker（如稠密 0.7+稀疏 0.3）融合结果。④ 混合检索比单一检索能同时覆盖语义匹配和精确关键词匹配。

**Q4（边界）**：在十亿级向量规模下，Milvus 可能遇到哪些性能和内存瓶颈？如何应对？

**回答要点**：① 全量数据在内存中加载的成本极高，需要用 DISKANN 磁盘索引或分片部署降低单机内存压力。② 索引构建时间长，需使用增量构建或分批构建索引。③ 查询延迟随数据量上升而增加，需要通过分区（Partition）、标量过滤预筛和读写分离架构控制延迟。④ 网络和 CPU 资源在高并发场景下成为瓶颈，需水平扩展 Coordinator/DataNode/QueryNode 节点。

> 理解前置知识可参见 [向量数据库概述](./07-向量数据库概述.md)；理解前置知识可参见 [Milvus Python操作指南](./09-Milvus Python操作指南.md)；理解前置知识可参见 [嵌入与向量化](./10-嵌入与向量化.md)；理解点积与余弦相似度的数学原理可参见 [点积与余弦相似度](../线性代数/13-点积与余弦相似度.md)