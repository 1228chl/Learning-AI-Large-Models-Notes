# 初始化 Milvus 集合：`init_milvus.py` 深度解析

> 源文件：`scripts/init_milvus.py`（共 82 行）
> 配套：`backend/core/knowledge_base.py`（`KnowledgeBaseClient` 读写该集合）
> 对应课件：5.5 Milvus 初始化

## 一、函数定位

`init_milvus.py` 是 Milvus 的"建表脚本"——相当于 PostgreSQL 的 `init_db.sql`。它创建 `knowledge_domain` 集合，定义字段 Schema 和索引类型，只需运行一次。

```
init_milvus.py     ← 初始化 Milvus 集合（跑一次就行）
  │
  ├─ build_schema()        ← 定义字段结构
  ├─ build_index_params()  ← 定义索引类型
  └─ main()                ← 幂等：先删后建
```

---

## 二、常量配置（第 15~18 行）

```python
MILVUS_URI = f"http://{get_settings().milvus_host}:{get_settings().milvus_port}"
VECTOR_DIM = 1024                  # BGE-M3 稠密向量维度
COLLECTION_NAME = "knowledge_domain"  # 单集合设计
```

`VECTOR_DIM=1024` 必须和 BGE-M3 的输出维度一致。`COLLECTION_NAME` 是"单集合设计"——所有课程、所有租户的数据都在同一个集合里，靠 `tenant_id` 字段过滤实现多租户隔离。

---

## 三、`build_schema`：定义字段结构（第 21~40 行）

```python
def build_schema(client: MilvusClient):
    schema = client.create_schema(auto_id=False, enable_dynamic_field=True)
    schema.add_field("id",               DataType.VARCHAR, is_primary=True, max_length=64)
    schema.add_field("embedding",        DataType.FLOAT_VECTOR, dim=VECTOR_DIM)
    schema.add_field("sparse_embedding", DataType.SPARSE_FLOAT_VECTOR)
    schema.add_field("content",          DataType.VARCHAR, max_length=4096)
    schema.add_field("tenant_id",        DataType.VARCHAR, max_length=64)
    schema.add_field("chunk_index",      DataType.INT64)
    schema.add_field("document_id",      DataType.VARCHAR, max_length=64)
    schema.add_field("course_id",        DataType.VARCHAR, max_length=64)
    schema.add_field("source_name",      DataType.VARCHAR, max_length=256)
    schema.add_field("chunk_type",       DataType.VARCHAR, max_length=32)
    schema.add_field("version",          DataType.VARCHAR, max_length=32)
    schema.add_field("updated_at",       DataType.INT64)
    return schema
```

### 3.1 `auto_id=False`

`DocumentChunk.id` 由 `generate_chunk_id()` 在 Python 端生成（MD5 散列），而不是让 Milvus 自动生成。这样重建文档时 ID 不变，upsert 能正确覆盖旧数据。

### 3.2 `enable_dynamic_field=True`

允许写入未在 schema 中声明的字段（Milvus 会自动创建）。为未来扩展预留空间，不需要修改 schema 就能加新字段。

### 3.3 三种字段类型

| 类型 | 字段 | 用途 |
|------|------|------|
| `FLOAT_VECTOR(1024)` | `embedding` | 稠密向量，语义检索 |
| `SPARSE_FLOAT_VECTOR` | `sparse_embedding` | 稀疏向量，关键词检索 |
| `VARCHAR` / `INT64` | 其余 9 个字段 | 标量字段，展示和过滤 |

### 3.4 字段与 DocumentChunk 的对应关系

Schema 的每个字段与 `DocumentChunk` 类的属性一一对应：

| Schema 字段 | DocumentChunk 属性 | 说明 |
|------------|-------------------|------|
| `id` | `id` | MD5 主键 |
| `embedding` | `embedding` | Dense 向量 |
| `sparse_embedding` | `sparse_embedding` | Sparse 向量 |
| `content` | `content[:4096]` | 截断到 4096 字符 |
| `tenant_id` | `tenant_id` | 多租户隔离 |
| `chunk_index` | `chunk_index` | 文档内顺序 |
| `document_id` | `document_id` | 所属文档 |
| `course_id` | `course_id` | 所属课程 |
| `source_name` | `source_name` | 来源标注 |
| `chunk_type` | `chunk_type` | text / code / table |
| `version` | `version` | 版本号 |
| `updated_at` | `updated_at` | 时间戳 |

---

## 四、`build_index_params`：定义索引（第 43~58 行）

```python
def build_index_params(client: MilvusClient):
    ip = client.prepare_index_params()

    # 稠密向量：HNSW + COSINE
    ip.add_index(field_name="embedding", index_type="HNSW", metric_type="COSINE",
                 params={"M": 16, "efConstruction": 256})

    # 稀疏向量：SPARSE_INVERTED_INDEX + IP
    ip.add_index(field_name="sparse_embedding", index_type="SPARSE_INVERTED_INDEX",
                 metric_type="IP", params={"drop_ratio_build": 0.2})

    # 标量字段：INVERTED 索引
    ip.add_index(field_name="tenant_id", index_type="INVERTED")
    ip.add_index(field_name="course_id", index_type="INVERTED")
    return ip
```

### 4.1 稠密向量索引：HNSW + COSINE

```python
index_type="HNSW", metric_type="COSINE",
params={"M": 16, "efConstruction": 256}
```

| 参数 | 值 | 说明 |
|------|-----|------|
| **HNSW** | 分层可导航小世界图 | 近似最近邻搜索（ANN），精度和速度的平衡 |
| **M** | 16 | 每个节点的最大连接数，越大精度越高但建图越慢 |
| **efConstruction** | 256 | 建图时的搜索宽度，越大图质量越好 |
| **COSINE** | 余弦相似度 | 适合语义相似度场景（不考虑向量长度，只看方向） |

### 4.2 稀疏向量索引：SPARSE_INVERTED + IP

```python
index_type="SPARSE_INVERTED_INDEX", metric_type="IP",
params={"drop_ratio_build": 0.2}
```

| 参数 | 说明 |
|------|------|
| **SPARSE_INVERTED_INDEX** | 倒排索引，类似 Elasticsearch 的索引结构 |
| **IP** | 内积，适合稀疏向量间的相似度计算 |
| **drop_ratio_build=0.2** | 丢弃权重最低的 20% token，减少存储空间 |

### 4.3 标量索引：INVERTED

```python
ip.add_index(field_name="tenant_id", index_type="INVERTED")
ip.add_index(field_name="course_id", index_type="INVERTED")
```

为 `tenant_id` 和 `course_id` 建立倒排索引，加速过滤查询。没有索引的话，过滤需要全表扫描：

```python
# 实际查询时的 filter
filter='tenant_id == "tenant_default" and course_id == "xxx"'
```

---

## 五、`main`：幂等初始化（第 61~82 行）

```python
def main():
    print(f"连接 Milvus：{MILVUS_URI}")
    client = MilvusClient(uri=MILVUS_URI)

    # 幂等：集合已存在则先删后建
    if client.has_collection(COLLECTION_NAME):
        print(f"🗑️  删除旧集合 '{COLLECTION_NAME}'...")
        client.drop_collection(COLLECTION_NAME)

    # create_collection 传 index_params 会一并建索引并加载到内存
    client.create_collection(
        collection_name=COLLECTION_NAME,
        schema=build_schema(client),
        index_params=build_index_params(client),
    )
    print(f"✅ 集合 '{COLLECTION_NAME}' 创建完成（含索引，已加载）")
    print("⚠️  集合已重建，原有数据已清空，请重新运行 build_knowledge_base.py 导入。")
```

### 5.1 幂等流程

```
has_collection? → YES → drop_collection → create_collection
               → NO  → create_collection
```

脚本可以重复执行，但**会清空所有数据**，所以输出提示用户重新导入。

### 5.2 `create_collection` 传 `index_params`

Milvus 的 `create_collection` 可以同时接受 schema 和 index_params，创建集合后自动建索引并加载到内存。不需要额外调用 `load_collection()`。

---

## 六、对比：`init_milvus.py` vs `init_db.sql`

| 维度 | `init_db.sql`（PostgreSQL） | `init_milvus.py`（Milvus） |
|------|---------------------------|--------------------------|
| 语言 | SQL | Python（PyMilvus） |
| 幂等 | `CREATE TABLE IF NOT EXISTS` | `has_collection` → `drop` → `create` |
| 向量 | 不支持 | `FLOAT_VECTOR` + `SPARSE_FLOAT_VECTOR` |
| 索引 | B-tree（标量） | HNSW（稠密）+ SPARSE_INVERTED（稀疏）+ INVERTED（标量） |
| 数据清理 | `DROP TABLE` 删除整表 | `drop_collection` 删除整个集合 |

---

## 七、`★` 设计亮点总结

### 7.1 单集合多租户

所有数据在一个集合里，靠 `tenant_id` 字段过滤。避免了管理多个集合的复杂度，同时通过 `tenant_id` 的 INVERTED 索引保证了过滤性能。

### 7.2 双向量索引

同时为稠密向量（HNSW）和稀疏向量（SPARSE_INVERTED）建索引，支持 Hybrid 检索。

### 7.3 Schema 与代码的对应关系

Schema 字段与 `DocumentChunk` 属性一一对应，减少转换错误：

```
init_milvus.py 定义 Schema → DocumentChunk 填充数据 → upsert 写入
                                 ↑
                           build_knowledge_base.py 调用
```

### 7.4 幂等可重复

脚本可以反复执行，适合 CI/CD 环境初始化。

### 7.5 与 PostgreSQL 的协作

| 数据库 | 存储内容 | 用途 |
|--------|---------|------|
| PostgreSQL | 用户、课程、试卷、面试记录 | 业务数据，事务性操作 |
| Milvus | 知识库 chunk 向量 | 向量检索，相似度搜索 |