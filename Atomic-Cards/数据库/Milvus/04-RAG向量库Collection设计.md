---
author: "XunZong"
created: "2026-07-09"
tags: ["数据库", "向量数据库", "RAG"]
aliases: ["Collection设计", "向量库表结构", "RAG表设计", "Milvus Schema"]
---

# RAG 向量库 Collection 设计

## 定义

RAG 向量库的 Collection（表结构）设计是决定系统**存储能力**和**检索效果**的关键环节。合理的表结构需要同时承载文本内容、稠密/稀疏向量、元数据和时间戳，支撑混合检索、知识库更新和来源追溯。

$$
\mathcal{C} = \{F_1, F_2, \dots, F_n\} \quad \text{其中每个 }F_i = (\text{name}, \text{type}, \text{param})
$$

- $\mathcal{C}$：Collection 的定义，即所有字段的集合
- $F_i$：第 $i$ 个字段，由字段名、数据类型和参数三元组描述
- $\text{name}$：字段名称，如 `text`、`dense_vector`
- $\text{type}$：字段数据类型，如 VARCHAR、FLOAT_VECTOR、SPARSE_FLOAT_VECTOR
- $\text{param}$：字段参数，如向量维度、主键设置、索引类型

## RAG Collection 字段设计

| 字段名 | 类型 | 说明 |
|:-------|:-----|:-----|
| `id` | 主键（INT64/VARCHAR） | 文档唯一标识，用于批量更新和删除 |
| `text` | 字符串（VARCHAR） | 子块文本内容，作为检索匹配的基本单元 |
| `parent_text` | 字符串（VARCHAR） | 父块完整文本，检索命中后返回 LLM 的完整上下文 |
| `dense_vector` | 浮点向量（FLOAT_VECTOR） | BGE-M3 生成的稠密语义向量（如 1024 维） |
| `sparse_vector` | 稀疏向量（SPARSE_FLOAT_VECTOR） | BGE-M3 生成的稀疏关键词权重向量 |
| `source` | 字符串（VARCHAR） | 学科类别或数据来源，用于检索后过滤 |
| `file_path` | 字符串（VARCHAR） | 文档原始文件路径，用于答案来源追溯 |
| `timestamp` | 时间戳 | 文档创建/加载时间，用于新文档优先或时间衰减 |
| `update_time` | 时间戳 | 文档更新时间，用于增量更新判断 |
| `page_no` | 整数（INT64） | 页码信息，回答中增加参考文献位置标注 |
| `parent_id` | 字符串（VARCHAR） | 父块 ID，建立子块与父块的关联关系 |

## 建表核心步骤

### 1. 定义 Collection Schema

```python
from pymilvus import CollectionSchema, FieldSchema, DataType, Collection

# 定义 RAG 知识库的 Collection 字段结构
# 设计目标：同时支持稠密语义检索、稀疏关键词检索、元数据过滤和文档追溯

fields = [
    # id 字段：VARCHAR 类型，作为主键，方便业务层使用字符串标识
    FieldSchema(name="id", dtype=DataType.VARCHAR, max_length=64, is_primary=True),

    # text 字段：存储子块文本内容，用于检索结果展示和 LLM 输入
    FieldSchema(name="text", dtype=DataType.VARCHAR, max_length=65535),

    # parent_text 字段：存储父块完整文本，检索到子块后返回父块作为 LLM 上下文
    FieldSchema(name="parent_text", dtype=DataType.VARCHAR, max_length=65535),

    # dense_vector 字段：稠密语义向量，BGE-M3 输出为 1024 维浮点向量
    FieldSchema(name="dense_vector", dtype=DataType.FLOAT_VECTOR, dim=1024),

    # sparse_vector 字段：稀疏向量，存储 BGE-M3 的词级别权重，用于精确关键词匹配
    FieldSchema(name="sparse_vector", dtype=DataType.SPARSE_FLOAT_VECTOR),

    # source 字段：学科类别标签，用于检索时按学科范围过滤
    FieldSchema(name="source", dtype=DataType.VARCHAR, max_length=128),

    # file_path 字段：文档来源路径，用于答案溯源和引用标注
    FieldSchema(name="file_path", dtype=DataType.VARCHAR, max_length=1024),

    # timestamp 字段：文档创建时间，支持按时间范围过滤和排序
    FieldSchema(name="timestamp", dtype=DataType.VARCHAR, max_length=64),

    # page_no 字段：页码信息，在回答中标注参考文献的具体位置
    FieldSchema(name="page_no", dtype=DataType.INT64),
]
```

### 2. 创建索引

```python
# 创建向量索引以支持高效的近似最近邻（ANN）检索
# IVF_FLAT 索引通过聚类将向量空间划分为 Voronoi 单元，检索时只搜索最近单元
index_params = {
    "metric_type": "IP",               # 使用内积（IP）作为相似度度量，等价于向量归一化后的余弦相似度
    "index_type": "IVF_FLAT",          # IVF 倒排文件索引，nlist 控制聚类中心数量
    "params": {"nlist": 1024},         # nlist=1024：将向量空间划分为 1024 个聚类，越大精度越高但建索引越慢
}

# 创建 Collection 实例，传入完整的 Schema 定义
collection = Collection(name="rag_knowledge_base", schema=CollectionSchema(
    fields=fields,
    description="RAG 系统知识库，支持混合检索和元数据过滤",
))

# 为稠密向量字段创建索引，索引名约定为 "字段名_idx"
collection.create_index("dense_vector", index_params)

# 为稀疏向量字段创建索引（SPARSE_INVERTED_INDEX 是 Milvus 2.4+ 的稀疏向量专用索引）
collection.create_index("sparse_vector", {
    "index_type": "SPARSE_INVERTED_INDEX",
    "metric_type": "IP",
})
```

### 3. 数据写入与更新策略

```python
# 数据写入：将文档切块后的子块及其元数据批量插入 Collection
# 每个实体（entity）对应一条子块记录，包含所有定义好的字段
entities = [
    [chunk.id for chunk in chunks],         # id 列表
    [chunk.text for chunk in chunks],        # text 列表
    [chunk.parent_text for chunk in chunks], # parent_text 列表
    [chunk.dense_vec for chunk in chunks],   # dense_vector 列表
    [chunk.sparse_vec for chunk in chunks],  # sparse_vector 列表
    [chunk.source for chunk in chunks],      # source 列表
    [chunk.file_path for chunk in chunks],   # file_path 列表
    [chunk.timestamp for chunk in chunks],   # timestamp 列表
    [chunk.page_no for chunk in chunks],     # page_no 列表
]
collection.insert(entities)

# 知识库更新：使用相同的 id 重新 insert 会覆盖已有记录
# 最佳实践：先按 source + file_path 删除旧数据，再重新插入
collection.delete(f'source == "{source_name}" && file_path == "{file_path}"')
collection.flush()   # 刷新缓冲区，确保数据持久化
```

## Schema 设计原则

| 原则 | 说明 |
|:-----|:------|
| **元数据完整** | 保留 source、file_path、page_no 等元数据，支持检索后过滤和答案溯源 |
| **父子块关联** | 存储 parent_id 和 parent_text，实现子块匹配 + 父块返回 |
| **稀疏向量字段** | BGE-M3 生成的稀疏向量直接存储，无需额外部署 BM25 索引 |
| **向量维度匹配** | dense_vector 维度必须与嵌入模型输出维度一致（BGE-M3 为 1024） |
| **时间戳双字段** | timestamp（创建时间）+ update_time（更新时间）分离，支持增量更新 |

## 索引选择原理

### IVF_FLAT vs HNSW

| 索引类型 | 检索速度 | 内存占用 | 建索引时间 | 适用场景 |
|:--------|:-------:|:--------:|:---------:|:---------|
| **IVF_FLAT** | 中等 | 低 | 快 | 百万级数据，内存敏感 |
| **HNSW** | 快 | 高 | 慢 | 千万级数据，检索速度优先 |

**选型建议**：开发环境用 IVF_FLAT（nlist=1024），生产环境对检索延迟敏感时用 HNSW。

### 内积（IP）vs 余弦相似度

IP 度量在向量归一化后等价于余弦相似度，但 IP 计算更快（无需分母归一化）。使用 IP 的前提是嵌入模型输出已做 L2 归一化（BGE-M3 默认支持 `normalize_embeddings=True`）。

## ML/DL 应用场景

| 应用场景     | 数学形式                                                                                      | 说明                                        |
| :------- | :---------------------------------------------------------------------------------------- | :---------------------------------------- |
| RAG 混合检索 | $score = \alpha \cdot \text{sim}_{\text{dense}} + \beta \cdot \text{sim}_{\text{sparse}}$ | dense_vector + sparse_vector 双字段支撑稠密+稀疏检索 |
| 学科过滤     | $\text{predicate} = \text{source} \in S$                                                  | source 字段用于按学科范围缩小检索空间                    |
| 答案溯源引用   | $\text{citation} = (file\_path, page\_no)$                                                | file_path + page_no 字段组合提供精确来源引用          |
| 增量知识库更新  | $\text{delete}(source, file\_path) \rightarrow \text{insert}(new\_data)$                  | 利用主键 id 和条件删除实现知识库的增量刷新                   |

## 面试追问

**Q1（基础）**：RAG 系统的向量库 Collection 设计中，为什么需要同时存储 dense_vector 和 sparse_vector 两个向量字段？
**回答要点**：

1. dense_vector 用于语义检索，捕捉同义词、近义表达等深层语义关系
2. sparse_vector 用于关键词精确匹配，确保专业术语、缩写等被精确命中
3. 两者结合实现混合检索，既有了语义泛化能力，又保留了关键词匹配的精确性

**Q2（深挖）**：为什么不直接存储原始的文档全文，而是分成 text（子块）和 parent_text（父块）两个字段？
**回答要点**：

1. 子块（text）用于检索匹配：块小则语义聚焦，匹配精度更高
2. 父块（parent_text）用于 LLM 上下文：块大则上下文完整，LLM 生成更准确
3. 子块匹配 + 父块返回的设计兼顾了检索精度和生成质量，避免小块语义缺失和大块检索模糊的双重问题

**Q3（实战）**：知识库需要更新一批文档时，应该如何操作以保证数据一致性？
**回答要点**：

1. 先删除旧数据：按 source + file_path 条件精确匹配删除，只影响待更新文档，不涉及其他文档
2. 调用 flush() 确保删除持久化后再插入新数据，避免删除与插入的时序竞争
3. 重新处理文档得到新的切块和向量，批量 insert 写入
4. 建议在业务低峰期执行批量更新，更新完成后重建索引以保证检索性能

**Q4（边界）**：Collection schema 设计完成后，如果发现需要新增字段或修改向量维度，面临什么挑战？
**回答要点**：

1. Milvus 不支持动态修改已有 Collection 的 schema，新增字段需要新建 Collection（create_collection）或从现有 Collection 迁移
2. 向量维度（dim）在创建时指定后不可更改，切换嵌入模型（如从 768 维改为 1024 维）必须重建 Collection
3. 迁移方案：创建新 Collection → 用老 Collection 的数据重新生成向量 → 批量插入新 Collection → 删除老 Collection → 重命名
4. 设计时预留充分字段、确定好嵌入模型，可以避免后续 schema 变更带来迁移成本

## 参考引用

- 需要理解嵌入与向量化的相关知识，参见 [嵌入与向量化](../检索/01-嵌入与向量化.md)
- 需要理解混合检索与重排序的相关知识，参见 [混合检索与重排序](../检索/02-混合检索与重排序.md)
- 需要理解Milvus核心概念的相关知识，参见 [Milvus核心概念](02-Milvus核心概念.md)
- 需要理解Milvus Python操作的相关知识，参见 [Milvus Python操作指南](03-Milvus Python操作指南.md)
- 需要理解文档切分策略的相关知识，参见 [文档切分策略](../../AI-Agent/RAG流程/02-文档切分策略.md)
- 需要理解多格式文档加载与OCR解析的相关知识，参见 [多格式文档加载与OCR解析](../../AI-Agent/RAG流程/03-文档加载与LangChain集成.md)