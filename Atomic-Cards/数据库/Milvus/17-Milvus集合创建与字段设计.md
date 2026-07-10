---
author: "XunZong"
created: "2026-07-09"
tags: ["数据库", "Milvus", "向量数据库"]
aliases: ["Milvus 集合创建", "Milvus Collection", "创建集合", "Milvus Schema"]
---

# Milvus 集合创建与字段设计

## 定义

Milvus 中的 Collection（集合）是存储向量和元数据的逻辑表，类似于关系数据库中的表。创建集合需要定义字段 Schema，包括主键、向量字段（稠密/稀疏）和标量字段（文本/元数据），并指定索引参数和一致性级别。

### 形式化定义

一个 Collection 的 Schema 可表示为字段集合：

$$
\mathcal{C} = (F_{\text{pk}}, F_{\text{vector}}, F_{\text{sparse}}, F_{\text{text}}, F_{\text{meta}}, \dots)
$$

其中每个字段 $F_i$ 由三元组定义：

$$
F_i = (\text{name}, \text{dtype}, \text{params})
$$

- $\text{name}$：字段名称，如 `id`、`vector`、`text`
- $\text{dtype}$：数据类型，如 `DataType.INT64`、`DataType.FLOAT_VECTOR`
- $\text{params}$：字段参数，如向量维度 $\text{dim}$、主键 `auto_id`、最大长度 `max_length`

## Milvus 支持的主要数据类型

| 数据类型 | 用途 | 参数说明 |
|:---------|:-----|:---------|
| `INT64` | 主键 ID、数值元数据 | 自增或手动指定 |
| `VARCHAR` | 文本内容、字符串元数据 | 需指定 `max_length`（最大字符数） |
| `FLOAT_VECTOR` | 稠密向量 | 需指定 `dim`（向量维度，如 768） |
| `SPARSE_FLOAT_VECTOR` | 稀疏向量 | 无需指定维度（自动从词汇表推断） |
| `BOOL` / `INT8` / `INT16` / `INT32` | 标签、分类字段 | 用于标量过滤 |
| `FLOAT` / `DOUBLE` | 数值评分、阈值 | 用于范围过滤 |
| `JSON` | 灵活元数据 | 可存储任意 JSON 结构，支持 JSON 路径过滤 |
| `ARRAY` | 标签列表 | 用于多标签筛选 |

## 创建集合的完整流程

### 1. 连接 Milvus

```python
from pymilvus import connections, Collection, CollectionSchema, FieldSchema, DataType

# 连接 Milvus 服务端
connections.connect(
    alias="default",
    host="localhost",      # Milvus 服务地址
    port="19530"           # gRPC 端口（默认 19530）
)
```

### 2. 定义 Schema 字段

```python
# 定义 RAG 集合的字段 Schema
fields = [
    # 主键字段：自增 INT64，不需要手动传入
    FieldSchema(
        name="id",
        dtype=DataType.INT64,
        is_primary=True,       # 标记为主键
        auto_id=True           # 自动生成递增 ID
    ),
    # 文本字段：存储子块原文
    FieldSchema(
        name="text",
        dtype=DataType.VARCHAR,
        max_length=65535       # 最大字符数，根据子块最大长度设置
    ),
    # 父块文本字段：存储完整上下文
    FieldSchema(
        name="parent_text",
        dtype=DataType.VARCHAR,
        max_length=65535
    ),
    # 稠密向量字段：用于语义检索
    FieldSchema(
        name="dense_vector",
        dtype=DataType.FLOAT_VECTOR,
        dim=768                # 向量维度，必须与 Embedding 模型输出一致
    ),
    # 稀疏向量字段：用于关键词精确匹配
    FieldSchema(
        name="sparse_vector",
        dtype=DataType.SPARSE_FLOAT_VECTOR  # 无需指定 dim
    ),
    # 元数据：文档来源
    FieldSchema(
        name="source",
        dtype=DataType.VARCHAR,
        max_length=512
    ),
    # 元数据：时间戳，用于增量更新
    FieldSchema(
        name="created_at",
        dtype=DataType.INT64
    ),
]
```

### 3. 创建 Schema 和 Collection

```python
# 将字段列表组合为 Schema
schema = CollectionSchema(
    fields=fields,
    description="RAG 问答系统的文档块存储集合",
    enable_dynamic_field=False   # 关闭动态字段（固定 Schema 性能更好）
)

# 创建集合
collection = Collection(
    name="rag_docs",             # 集合名称，需唯一
    schema=schema,
    consistency_level="Bounded"  # 一致性级别：Strong/Bounded/Session/Eventually
)
```

### 4. 创建索引（检索前必须操作）

```python
# 稠密向量索引：HNSW 适合高精度语义检索
collection.create_index(
    field_name="dense_vector",
    index_params={
        "metric_type": "IP",        # 距离度量：IP（内积）/ L2（欧氏距离）/ COSINE（余弦）
        "index_type": "HNSW",       # 索引类型：HNSW（推荐）/ IVF_FLAT / IVF_SQ8
        "params": {
            "M": 16,                 # 每个节点的最大连接数（越大精度越高，内存越大）
            "efConstruction": 200    # 构建时的搜索范围（越大质量越高，构建越慢）
        }
    }
)

# 稀疏向量索引：自动创建倒排索引
collection.create_index(
    field_name="sparse_vector",
    index_params={
        "metric_type": "IP",        # 稀疏向量通常用 IP（内积）
        "index_type": "SPARSE_INVERTED_INDEX",  # 倒排索引
        "params": {"drop_ratio_build": 0.2}     # 构建时丢弃低频词的比例（0.0~1.0）
    }
)

# 加载集合到内存（检索前必须调用）
collection.load()
```

## 一致性级别说明

| 级别 | 说明 | 适用场景 |
|:----|:-----|:---------|
| **Strong** | 强一致性：读操作总能读到最新的写入 | 金融交易、严格数据一致性要求 |
| **Bounded** | 有界一致性：允许少量延迟（默认，推荐） | **通用 RAG 系统**，读写均衡 |
| **Session** | 会话一致性：同一会话内读到自己写入的数据 | 批量处理场景 |
| **Eventually** | 最终一致性：写入后短暂延迟后可见 | 实时性要求不高的批量导入 |

## ML/DL 应用场景

| 应用场景 | 字段设计要点 | 说明 |
|:--------|:------------|:-----|
| **RAG 问答系统** | text + dense_vector + sparse_vector + parent_text | 父子块存储，混合检索 |
| **图片检索系统** | image_path + dense_vector（视觉模型） | 图片路径 + CLIP 等视觉向量 |
| **用户推荐系统** | user_id + item_embedding + timestamp | 以用户 ID 为主键，存储行为向量 |
| **日志相似检测** | log_text + error_vector + severity | 异常日志聚类和相似性检测 |

## 面试追问

**Q1（基础）**：Milvus 中创建 Collection 需要哪些必要步骤？
**回答要点**：

1. 定义字段 Schema（FieldSchema）：主键字段、向量字段（FLOAT_VECTOR/SPARSE_FLOAT_VECTOR）、标量字段
2. 组合为 CollectionSchema，指定集合名称和描述
3. 调用 `collection = Collection(name, schema)` 创建集合
4. 创建索引（create_index）并加载集合（load），检索前必须完成这两步

**Q2（深挖）**：FLOAT_VECTOR 和 SPARSE_FLOAT_VECTOR 有什么区别？各自在什么场景下使用？
**回答要点**：

1. FLOAT_VECTOR 存储稠密向量，需要指定固定维度（如 dim=768），所有维度非零，适合语义检索
2. SPARSE_FLOAT_VECTOR 存储稀疏向量，无需指定维度，仅存非零项的索引-值对，适合关键词精确匹配
3. RAG 系统通常两者同时使用，通过混合检索获得最佳效果

**Q3（实战）**：创建索引时 HNSW 的 M 和 efConstruction 参数如何选择？
**回答要点**：

1. M 控制每个节点的最大连接数：M 越大召回率越高，但内存占用和构建时间也增加。推荐值 16-32
2. efConstruction 控制构建时的动态列表大小：值越大索引质量越高，但构建越慢。推荐值 200-500
3. 权衡：M=16 + efConstruction=200 适合通用场景，M=32 + efConstruction=500 适合高精度场景

**Q4（边界）**：enable_dynamic_field 开启和关闭有什么区别？何时应该开启？
**回答要点**：

1. 关闭（False）：固定 Schema，所有字段必须预先定义，写入性能更好，查询更明确
2. 开启（True）：允许写入未定义的字段，系统自动创建动态字段，灵活性高但读写性能略降
3. 推荐：生产环境 RAG 系统关闭动态字段，所有字段显式定义；开发阶段或元数据不确定时可开启

## 参考引用

- 需要理解 RAG 向量库 Collection 设计的完整方案，参见 [RAG向量库Collection设计](12-RAG向量库Collection设计.md)
- 需要理解稠密向量与稀疏向量的区别，参见 [稠密向量与稀疏向量](../检索/16-稠密向量与稀疏向量.md)
- 需要理解 Milvus 核心概念（索引类型、距离度量、分区），参见 [Milvus核心概念](08-Milvus核心概念.md)
- 需要理解分块文档如何存储到 Milvus，参见 [分块文档存储到Milvus](18-分块文档存储到Milvus.md)
- 需要理解 Milvus Python SDK 基础操作，参见 [Milvus Python操作指南](09-Milvus Python操作指南.md)