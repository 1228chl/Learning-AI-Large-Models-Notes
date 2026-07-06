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
