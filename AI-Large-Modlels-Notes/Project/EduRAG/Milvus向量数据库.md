---
author: XunZong
created: 2026-07-08
tags:
  - Milvus
  - SQL
aliases:
  - 向量数据库
---

# Milvus向量数据库

## 一、Milvus 概述【知道】

Milvus 是一款开源向量数据库（2019 年），专门用于【**存储、索引和管理**】大规模嵌入向量。支持亿万级别向量索引，底层设计用于处理从非结构化数据转换而来的嵌入向量。

### 非结构化数据处理流程

```
非结构化数据（图片/文本/音频，约占全球数据80%）
→ 通过AI/ML模型做Embedding → 转为浮点数向量数组
→ 存入Milvus → 通过向量相似度搜索找到相关数据
```

向量相似度搜索：两个嵌入向量越相似，意味着【补充：原始数据源也越相似】。

### 传统数据库 vs 向量数据库

| | 传统数据库（MySQL） | 向量数据库（Milvus） |
|------|------|------|
| 数据形态 | 【结构化数据】 | 【非结构化数据的嵌入向量】 |
| 查询方式 | 主要精确匹配（= `value`） | 【近似相似度搜索】 |
| 对应关系 | Table ↔ Field | 【Collection ↔ Field】 |

---

## 二、核心概念

### 2.1 Collection 与 Field【知道】

| 概念 | 含义 | 限制 |
|------|------|------|
| Database | 数据库，最多【补充：64】个 | - |
| Collection | 集合，类比 SQL 中的【补充：Table】 | - |
| Field | 字段，类比 SQL 中的【补充：Column】 | 一个 Collection 最多【4 个向量 Field】 |
| Entity | 实体，类比 SQL 中的【补充：Row】 | - |

### 2.2 Field Schema 关键属性【知道】

| 属性 | 说明 |
|------|------|
| `name` | 字段名 |
| `dtype` | 数据类型 |
| `is_primary` | 是主键则【补充：true】，且仅支持一个主键 |
| `auto_id` | 【补充：True】时自动生成 ID |
| `dim` | 向量维度，范围【补充：[1, 32768]】 |

### 2.3 索引类型【理解】

| 索引 | 原理 | 适用场景 |
|------|------|----------|
| 【补充：FLAT】 | 暴力搜索，100% 精确 | 小规模数据集（百万级） |
| 【补充：IVF_FLAT】 | K-means 聚类 + 倒排索引 | 平衡精度与速度 |
| 【补充：IVF_SQ8】 | IVF + 标量量化压缩 | 节省内存 |
| 【补充：IVF_PQ】 | IVF + 乘积量化 | 大规模高维数据 |
| 【补充：HNSW】 | 基于图的索引 | 高搜索效率要求 |

**IFV_FLAT 核心参数 `nprobe` **：控制搜索的簇数量，增大提高精度但降低速度，减小则相反。

### 2.4 相似度度量【知道】

常用的距离，假设两个点 $x, y$ 如下：
$$
x = [x_1, x_2, \cdots, x_n] \\
y = [y_1, y_2, \cdots, y_n]
$$



#### 欧式距离

$$
L_2(x, y) = \sqrt{\sum_{i=1}^n (x_i - y_i)^2}
$$

取值范围： $[0, +\infty]$

#### 内积

$$
IP(x, y) = \sum_{i=1}^n x_i y_i
$$

取值范围： $[-\infty, +\infty]$ , 通常情况下会采用正则化，[-1, 1]

#### 余弦相似度

$$
\cos<x, y> = \frac{IP(x, y)}{||x||\cdot ||y||}
$$

取值范围: [-1, 1]

| 度量方式 | 说明 |
|----------|------|
| 【补充：L2（欧氏距离）】 | 空间直线距离，越小越相似 |
| 【补充：IP（内积）】 | 向量点积，越大越相似 |
| 【补充：COSINE（余弦相似度）】 | 方向一致性，值越大越相似 |

## 三、Milvus 数据库的操作【知道】

### 创建数据库与建表

创建数据库

```python
from pymilvus import MilvusClient

# 1. 连接 Milvus（默认连到 default 数据库）
client = MilvusClient(uri="http://localhost:19530")

# 2. 创建数据库（一个 Milvus 最多 64 个数据库）
client.create_database(db_name="edurag")

# 3. 之后的操作切换到该数据库
client = MilvusClient(uri="http://localhost:19530", db_name="edurag")
```

创建表

```python
from pymilvus import MilvusClient, DataType

# 1. 创建 Schema（auto_id=False 表示主键由我们自行指定）
schema = client.create_schema(auto_id=False, enable_dynamic_field=True)
# 主键字段（VARCHAR，一个 Collection 只能有一个主键）
schema.add_field(field_name="id", datatype=DataType.VARCHAR, is_primary=True, max_length=100)
# 文本内容字段
schema.add_field(field_name="text", datatype=DataType.VARCHAR, max_length=65535)
# 稠密向量字段（如 BGE-M3 输出的 1024 维向量）
schema.add_field(field_name="dense_vector", datatype=DataType.FLOAT_VECTOR, dim=1024)

# 2. 准备索引（IVF_FLAT + IP 内积度量）
index_params = client.prepare_index_params()
index_params.add_index(field_name="dense_vector", index_type="IVF_FLAT", metric_type="IP")

# 3. 创建 Collection（类比 SQL 的建表）
client.create_collection(
    collection_name="edurag",
    schema=schema,
    index_params=index_params,
)
```



### 增删改

#### 新增实体

```python
# data 传入列表，每条是一个字典（字段名 = Schema 中的字段）
client.insert(
    collection_name="edurag",
    data=[
        {"id": "1", "text": "Python 是一门解释型编程语言", "dense_vector": [0.12] * 1024},
        {"id": "2", "text": "向量数据库适合做语义检索", "dense_vector": [0.25] * 1024},
    ],
)
```

#### 删除实体

```python
# 按主键删除
client.delete(collection_name="edurag", ids=["1", "2"])

# 也支持用表达式过滤删除
# client.delete(collection_name="edurag", filter='text like "Python%"')
```

#### 修改实体

```python
# upsert：主键存在则更新，不存在则插入（类比 MySQL 的 INSERT ... ON DUPLICATE KEY UPDATE）
client.upsert(
    collection_name="edurag",
    data=[
        {"id": "1", "text": "Python 是一门高级编程语言", "dense_vector": [0.15] * 1024},
    ],
)
```

### 简单查询

#### 单向量搜索

```python
query_vector = [0.13] * 1024  # 查询文本的 Embedding 向量

res = client.search(
    collection_name="edurag",
    data=[query_vector],           # 传入一个查询向量
    anns_field="dense_vector",     # 指定检索的向量字段
    limit=5,                       # 返回 Top-5
    search_params={"metric_type": "IP", "params": {"nprobe": 10}},
    output_fields=["text"],        # 同时返回 text 字段
)

for hit in res[0]:
    print(hit["id"], hit["distance"], hit["entity"]["text"])
```

#### 批量向量搜索

```python
query_vectors = [[0.13] * 1024, [0.27] * 1024]  # 多路查询向量

res = client.search(
    collection_name="edurag",
    data=query_vectors,            # 一次传入多个查询向量
    anns_field="dense_vector",
    limit=5,
    search_params={"metric_type": "IP", "params": {"nprobe": 10}},
    output_fields=["text"],
)

# res 是二维列表：res[i] 对应第 i 个查询向量的结果
print(len(res))  # 2，等于查询向量的个数
```

#### 分区搜索

```python
# 1) 创建分区（分区类似 SQL 中的"分表"）
client.create_partition(collection_name="edurag", partition_name="python")

# 2) 插入数据时指定分区
client.insert(
    collection_name="edurag",
    partition_name="python",
    data=[{"id": "1", "text": "Python 基础语法", "dense_vector": [0.1] * 1024}],
)

# 3) 只在指定分区内搜索
res = client.search(
    collection_name="edurag",
    data=[query_vector],
    anns_field="dense_vector",
    limit=5,
    partition_names=["python"],    # 限定搜索分区
)
```

#### 指定输出字段

```python
res = client.search(
    collection_name="edurag",
    data=[query_vector],
    anns_field="dense_vector",
    limit=5,
    output_fields=["text", "source"],  # 只返回这两个字段，节省带宽
)

for hit in res[0]:
    print(hit["entity"]["text"], hit["entity"]["source"])
```

#### 过滤搜索

* 前缀中缀后缀等模糊匹配

```python
# 前缀匹配：以 "Python" 开头（% 匹配任意多个字符）
res = client.search(
    collection_name="edurag",
    data=[query_vector],
    anns_field="dense_vector",
    limit=5,
    filter='text like "Python%"',
)

# 中缀匹配：包含 "Python"
# filter='text like "%Python%"'

# 后缀匹配：以 "Python" 结尾
# filter='text like "%Python"'
```

#### 范围搜索

![](../../../../Assets/Image/AI-Large-Modlels-Notes/Project/EduRAG/Milvus向量数据库/1.2.7.6-1.png)

```python
# 范围搜索：只返回距离落在 [radius, range_filter] 区间内的向量
# IP 度量下 IP 越大越相似 → radius=0.7 是最小相似度，range_filter=1.0 是最大
res = client.search(
    collection_name="edurag",
    data=[query_vector],
    anns_field="dense_vector",
    limit=5,
    search_params={
        "metric_type": "IP",
        "params": {"radius": 0.7, "range_filter": 1.0},
    },
)
```

### 复杂查询【掌握】

![](../../../../Assets/Image/AI-Large-Modlels-Notes/Project/EduRAG/Milvus向量数据库/1.2.8-1.png)

对多组 ANN 搜索结果合并重排序：

| 策略 | 用法 |
|------|------|
| 【WeightedRanker】 | 给不同向量字段分配权重，强调特定字段 |
| 【RRFRanker】 | 倒数排序融合，平衡各字段重要性 |

#### WeightedRanker
![](../../../../Assets/Image/AI-Large-Modlels-Notes/Project/EduRAG/Milvus向量数据库/1.2.8.1-1.png)
![](../../../../Assets/Image/AI-Large-Modlels-Notes/Project/EduRAG/Milvus向量数据库/1.2.8.1-2.png)

#### RRFRanker

$$  
score(d) = \sum_{i=1}^N \frac{1}{k+rank_i(d)+1}  
$$

  

- d：表示文档。  
- N：表示不同检索路径的数量。  
- ranki(d)：表示文档 *d* 在第 *i* 个检索器中的排名位置，从 0 开始计数。  
- k：是一个平滑参数，用于控制随着排名增加分数的降低速度。默认值通常设置为 60。

![](../../../../Assets/Image/AI-Large-Modlels-Notes/Project/EduRAG/Milvus向量数据库/1.2.8.2-1.png)

![](../../../../Assets/Image/AI-Large-Modlels-Notes/Project/EduRAG/Milvus向量数据库/1.2.8.2-2.png)

#### 混合检索的关键步骤

![400](../../../../Assets/Image/AI-Large-Modlels-Notes/Project/EduRAG/Milvus向量数据库/1.2.8.3-1.png)

**代码示例（PyMilvus）**：

```python
from pymilvus import AnnSearchRequest, WeightedRanker, RRFRanker

# 前提：Collection 中需同时存在 dense_vector 和 sparse_vector 两个向量字段
# 稠密向量搜索请求（语义检索）
dense_req = AnnSearchRequest(
    data=[query_dense],          # 稠密查询向量
    anns_field="dense_vector",
    param={"metric_type": "IP", "params": {"nprobe": 10}},
    limit=5,
)

# 稀疏向量搜索请求（关键词检索）
sparse_req = AnnSearchRequest(
    data=[query_sparse],         # 稀疏查询向量
    anns_field="sparse_vector",
    param={"metric_type": "IP"},
    limit=5,
)

# 方式一：WeightedRanker 加权融合（权重个数必须与请求数一致，此处稠密 0.7、稀疏 0.3）
res = client.hybrid_search(
    collection_name="edurag",
    reqs=[dense_req, sparse_req],
    ranker=WeightedRanker(0.7, 0.3),
    limit=5,
)

# 方式二：RRFRanker 倒数排序融合（自动平衡各字段，无需手动调权）
# res = client.hybrid_search(
#     collection_name="edurag",
#     reqs=[dense_req, sparse_req],
#     ranker=RRFRanker(),
#     limit=5,
# )
```

## 四、核心要点

1. Milvus 用于存储和检索【嵌入向量（Embedding）】
    
2. 一个 Collection 最多支持【补充：4】个向量字段
    
3. 索引类型从简单到复杂：FLAT → IVF_FLAT → IVF_SQ8/PQ → HNSW
    
4. `nprobe` 参数平衡【补充：查询精度】和【补充：查询速度】
    
5. 掌握混合的检索的步骤
    

---

## 面试题

---

**Q1: FLAT 和 IVF_FLAT 的区别？**

FLAT 是【补充：暴力搜索】，遍历所有向量计算距离，100% 精确但极慢。IVF_FLAT 先用 K-means 将向量空间划分为多个簇，查询时只搜索最近几个簇，通过 `nprobe` 参数控制搜索簇数，以【补充：少量精度损失换取大幅速度提升】。

---

**Q2: 什么是 Embedding？为什么非结构化数据需要它？**

Embedding（嵌入向量）是通过深度学习模型将文本/图片/音频等非结构化数据映射为【补充：固定长度的浮点数向量】。语义相近的内容在向量空间中距离相近，使计算机能够通过数学计算理解内容的【补充：语义相似度】。这是 RAG 系统检索的基础。

---

**Q3: 余弦相似度和欧氏距离的区别？哪个更好？**

欧氏距离衡量【补充：空间绝对距离】，受向量长度影响。余弦相似度衡量【补充：方向夹角】，不受向量长度影响。在 NLP 场景中通常推荐余弦相似度，因为文本 Embedding 的方向比长度包含更多语义信息。
