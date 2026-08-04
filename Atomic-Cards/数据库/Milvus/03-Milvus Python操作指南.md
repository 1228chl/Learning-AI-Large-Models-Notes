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

# 连接 Milvus 服务器，指定 URI 和数据库名称；生产环境应使用 Cluster 地址替代 localhost
client = MilvusClient(uri="http://localhost:19530", db_name="default")

# 创建 Schema（含稠密+稀疏双向量字段）
# auto_id=False 表示由业务方手动提供 ID，便于后续按业务 ID 精确删除或更新
# enable_dynamic_field=True 允许存储未预定义的字段，避免频繁修改 Schema
schema = client.create_schema(auto_id=False, enable_dynamic_field=True)

schema.add_field("id", DataType.VARCHAR, is_primary=True, max_length=100)

schema.add_field("text", DataType.VARCHAR, max_length=65535)

schema.add_field("dense_vector", DataType.FLOAT_VECTOR, dim=1024)   # BGE-M3 稠密维度，固定 1024 维，捕获深层语义特征
schema.add_field("sparse_vector", DataType.SPARSE_FLOAT_VECTOR)     # 稀疏向量，维度极高但仅非零位携带信息，适合精确关键词匹配

schema.add_field("source", DataType.VARCHAR, max_length=50)

# 准备索引参数：稠密向量用 IVF_FLAT（聚类倒排索引，平衡速度和召回），稀疏向量用 SPARSE_INVERTED_INDEX（专为高维稀疏数据设计）
index_params = client.prepare_index_params()
index_params.add_index("dense_vector", "dense_index", "IVF_FLAT", "IP", {"nlist": 128})
index_params.add_index("sparse_vector", "sparse_index", "SPARSE_INVERTED_INDEX", "IP", {"drop_ratio_build": 0.2})

# 创建名为 knowledge_base 的 Collection，一次性传入 Schema 和索引参数完成初始化
client.create_collection("knowledge_base", schema=schema, index_params=index_params)
client.load_collection("knowledge_base")  # 加载到内存，Collection 必须加载后才可执行搜索
```

## 插入数据（带 BGE-M3 嵌入）

```python
from milvus_model.hybrid import BGEM3EmbeddingFunction
import hashlib

# 初始化 BGE-M3 嵌入模型，use_fp16=False 用全精度推理保证嵌入质量；GPU 充足时可开启半精度加速推理
ef = BGEM3EmbeddingFunction(use_fp16=False)

# 准备待嵌入的文本，BGE-M3 一次调用同时输出稠密和稀疏两种向量表示
texts = ["什么是注意力机制？", "Transformer 的核心创新是自注意力"]

embeddings = ef(texts)


data = []
for i, text in enumerate(texts):
    # 解析稀疏向量返回格式：milvus_model 可能输出 coo_array 或 csr_matrix，两种格式的索引和数据属性名不同，须兼容处理
    sparse_vec = {}
    try:

        row = embeddings["sparse"][i]
        if hasattr(row, 'col'):       # coo_array 格式：col 为列索引数组，data 为非零值数组

            indices, values = row.col, row.data
        else:                          # csr_matrix 格式：indices 为列索引数组，data 为非零值数组

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

# upsert = update + insert，主键冲突时自动覆盖，适合增量写入和纠错场景
client.upsert("knowledge_base", data=data)
```

## 混合检索 + 重排序

```python
# 将查询文本通过 BGE-M3 转为稠密和稀疏向量，格式与插入数据时完全一致，确保检索可比性
query_embeddings = ef(["什么是Transformer？"])

dense_q = query_embeddings["dense"][0]

# 从 BGE-M3 输出中提取稀疏向量的非零索引和值，与数据插入时的格式兼容逻辑相同
sparse_q = {}

row = query_embeddings["sparse"][0]

indices = row.col if hasattr(row, 'col') else row.indices

values = row.data if hasattr(row, 'data') else row.data
for idx, val in zip(indices, values):

    sparse_q[int(idx)] = float(val)

# 稠密检索请求：用内积度量 (IP) 在 dense_vector 字段上做近似最近邻搜索，nprobe=10 控制探测的聚类数，值越大召回越高但越慢
dense_req = AnnSearchRequest(

    data=[dense_q], anns_field="dense_vector",

    param={"metric_type": "IP", "params": {"nprobe": 10}},

    limit=20
)

# 稀疏检索请求：使用 Milvus 稀疏倒排索引检索，不需要 nprobe 参数，其倒排结构天然适配高维稀疏数据的匹配逻辑
sparse_req = AnnSearchRequest(

    data=[sparse_q], anns_field="sparse_vector",

    param={"metric_type": "IP", "params": {}},

    limit=20
)

# 混合检索：WeightedRanker 加权融合双路检索结果，稠密 0.7 偏向语义理解，稀疏 0.3 保留精确关键词匹配能力
ranker = WeightedRanker(0.7, 0.3)

results = client.hybrid_search(
    "knowledge_base", [dense_req, sparse_req],

    ranker=ranker, limit=10,

    output_fields=["text", "source"]
)

# 结果重排序：用 BGE-Reranker CrossEncoder 对粗排结果做二次精排，弥补向量近似检索的精度损失
from sentence_transformers import CrossEncoder

reranker = CrossEncoder("BAAI/bge-reranker-v2-m3")
# 构造查询-文档对用于 CrossEncoder 全交互注意力计算，比 Bi-Encoder 的点积相似度更精准
pairs = [[query, hit["entity"]["text"]] for hit in results[0]]

scores = reranker.predict(pairs)
# 按 CrossEncoder 预测的相关性分数降序排列，得到最终的精排结果列表
ranked = sorted(zip(results[0], scores), key=lambda x: x[1], reverse=True)
```

## 过滤搜索与分区搜索

```python
# 带标量过滤条件的向量搜索：expr 参数支持类 SQL 语法，先按条件筛除无关数据，再在剩余子集上做 ANN 搜索
results = client.search(
    "knowledge_base",

    data=[dense_q],

    anns_field="dense_vector",

    param={"metric_type": "IP", "nprobe": 10},

    limit=5,

    expr="source == 'ai_knowledge'",     # 标量过滤表达式，等同于 SQL 的 WHERE 子句；只检索来源为 ai_knowledge 的文档

    output_fields=["text"]
)

# 分区搜索：按类别创建独立物理分区，同类数据集中存储；搜索时只扫描指定分区，大幅减少计算量
client.create_partition("knowledge_base", "part_math")

client.insert("knowledge_base", data, partition_name="part_math")

results = client.search(

    "knowledge_base", data=[dense_q],

    anns_field="dense_vector",

    param={"metric_type": "IP"},

    limit=5,

    partition_names=["part_math"]         # 指定目标分区名称列表，搜索仅在列出分区内执行，实现数据级查询隔离
)
```

## 删除与修改

```python
# 按主键 ID 精确删除：适用于已知记录 ID 的场景，如用户删除自己添加的某条知识
client.delete("knowledge_base", ids=["hash_value_xxx"])

# Milvus 不支持直接修改单条数据，需先按过滤条件批量删除，再重新插入新数据来实现"修改"
client.delete("knowledge_base", filter="source == 'old_data'")

# 删除整个 Collection（数据和索引一并清除），此操作不可恢复，仅当确定不再使用该集合时执行
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
**回答要点**：

1. FLOAT_VECTOR 为稠密向量类型，维度固定（如 BGE-M3 的 1024 维），每个元素均为非零浮点数，用于捕获深层语义特征
2. SPARSE_FLOAT_VECTOR 为稀疏向量类型，维度极高但绝大多数位置为零，仅少数非零位携带词级别精确匹配信息
3. 两者混合使用可互补：稠密向量擅长语义匹配，稀疏向量擅长精确关键词匹配，共同提升检索覆盖率

**Q2（深挖）**：混合检索中的 WeightedRanker 权重（如稠密 0.7: 稀疏 0.3）如何影响最终结果？如何调优？
**回答要点**：

1. 稠密权重越高结果越偏向语义相似度，适用于开放问答等语义搜索场景；稀疏权重越高越偏向关键词精确匹配，适用于 FAQ 等精确匹配场景
2. 调优方法：在验证集上对比不同权重组合下的 NDCG/MRR 指标，选择最优融合比例；也可根据查询长度或分类结果使用动态权重
3. 典型初始值设置：稠密 0.7 搭配稀疏 0.3 可在语义理解和关键词匹配之间取得平衡

**Q3（实战）**：用 Milvus 实现 RAG 系统时，检索后的 BGE-Reranker 重排序步骤为什么能提升最终效果？它与普通向量检索的区别是什么？
**回答要点**：

1. 向量检索（Bi-Encoder）将查询和文档独立编码为向量，计算余弦/IP 近似度，速度快但精度有限，适合大规模候选集粗筛
2. Reranker（Cross-Encoder）将查询-文档对输入模型做全交互注意力计算，精度大幅提升，但计算成本高且无法预索引
3. 两阶段架构（向量粗筛取 Top-100 后 Reranker 精排取 Top-k）兼顾速度和精度，在最终排序质量上显著优于纯向量检索

**Q4（边界）**：在大规模生产环境中，BGE-M3 在线生成嵌入向量可能遇到哪些性能瓶颈？如何缓解？
**回答要点**：

1. 模型推理耗时：开启半精度（use_fp16=True）减少显存和计算量，或使用更小的嵌入模型（如 BGE-small）作为替代
2. 并发请求排队：对嵌入服务实现异步批处理（dynamic batching），合并多个请求同时推理以提高吞吐量
3. 大文本序列过长：超长文本先按 chunk 切分再分别嵌入，取 mean pooling 池化向量；GPU OOM 时切换到 CPU 推理作为降级方案

## 参考引用
- 需要理解Milvus核心概念的相关知识，参见 [Milvus核心概念](02-Milvus核心概念.md)
- 需要理解嵌入与向量化的相关知识，参见 [嵌入与向量化](../检索/01-嵌入与向量化.md)
- 需要理解混合检索与重排序的相关知识，参见 [混合检索与重排序](../检索/02-混合检索与重排序.md)
- 需要理解向量数据库概述的相关知识，参见 [向量数据库概述](01-向量数据库概述.md)
