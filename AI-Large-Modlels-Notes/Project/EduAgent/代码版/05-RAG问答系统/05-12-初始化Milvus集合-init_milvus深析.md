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

## 二、为什么需要这个脚本？

### 2.1 向量检索的前提是"建好表"

Milvus 是一个向量数据库，但它**不会自动建表**。要让 RAG 系统能检索知识库，必须先定义：

1. **Schema（表结构）**：集合里有哪些字段？主键是什么？向量是 1024 维还是 512 维？
2. **索引（Index）**：向量/标量字段用哪种索引算法加速检索？

这些信息无法在查询时动态推断，必须提前定义。`init_milvus.py` 就是做这件事的——它是 Milvus 的"DDL 脚本"。

### 2.2 为什么不内嵌在 build_knowledge_base.py？

理论上可以把建表逻辑放进 `build_knowledge_base.py`，但职责分离更清晰：

| 脚本 | 频率 | 职责 | 类比 |
|------|------|------|------|
| `init_milvus.py` | 只跑一次 | 建表 + 建索引 | `CREATE TABLE ...` |
| `build_knowledge_base.py` | 每次导入 | 写入 chunk 数据 | `INSERT INTO ...` |

建表是低频、破坏性的操作（会清空数据）；写数据是高频、幂等的操作。混在一起会让每次导入都承担"误删数据"的风险。分开后，只有显式运行 `init_milvus.py` 才会触发重建。

### 2.3 不写这个脚本会怎样？

- 没有 Schema → `build_knowledge_base.py` 的 `upsert_chunks()` 会因集合不存在而报错
- 没有索引 → 检索退化为暴力扫描，数据量大时极慢
- Schema 与 `DocumentChunk` 不对齐 → 字段缺失，查询返回空结果

---

## 三、全文行号速查表

| 行号范围 | 标识符 | 类型 | 说明 |
|---------|--------|------|------|
| 1~14 | — | 文件头 | 模块注释 + import |
| 15~18 | 常量 | 配置 | Milvus URI、VECTOR_DIM、COLLECTION_NAME |
| 21~40 | `build_schema()` | 函数 | 构建集合 Schema（稠密+稀疏双向量+标量字段） |
| 43~58 | `build_index_params()` | 函数 | 构建索引（HNSW + SPARSE_INVERTED + INVERTED） |
| 61~82 | `main()` | 函数 | 主函数，幂等删除重建 |

---

## 三、常量配置（第 15~18 行）

```python
# scripts/init_milvus.py 第 15~18 行
MILVUS_URI = f"http://{get_settings().milvus_host}:{get_settings().milvus_port}"
VECTOR_DIM = 1024                  # BGE-M3 稠密向量维度
COLLECTION_NAME = "knowledge_domain"  # 单集合设计
```

`VECTOR_DIM=1024` 必须和 BGE-M3 的输出维度一致。`COLLECTION_NAME` 是"单集合设计"——所有课程、所有租户的数据都在同一个集合里，靠 `tenant_id` 字段过滤实现多租户隔离。

### 逐行精读

| 行号 | 代码 | 说明 |
|------|------|------|
| 16 | `MILVUS_URI = f"http://{get_settings().milvus_host}:{get_settings().milvus_port}"` | 从配置读取 Milvus 连接地址，默认 `http://localhost:19530` |
| 17 | `VECTOR_DIM = 1024` | BGE-M3 稠密向量输出维度，必须与模型一致 |
| 18 | `COLLECTION_NAME = "knowledge_domain"` | 单集合名称，所有租户数据共享 |

---

## 四、`build_schema`：定义字段结构（第 21~40 行）

```python
# scripts/init_milvus.py 第 21~40 行
def build_schema(client: MilvusClient):
    """构建集合 schema：稠密 + 稀疏双向量 + 标量字段（含 tenant_id）。"""
    schema = client.create_schema(auto_id=False, enable_dynamic_field=True)
    # 主键：MD5 散列，由 build_knowledge_base.py 的 generate_chunk_id() 生成
    schema.add_field("id",               DataType.VARCHAR, is_primary=True, max_length=64)
    # 稠密向量：BGE-M3 的 dense_vecs，1024 维浮点数组，用于语义相似度检索
    schema.add_field("embedding",        DataType.FLOAT_VECTOR, dim=VECTOR_DIM)
    # 稀疏向量：BGE-M3 的 lexical_weights，{token_id: weight} 字典，用于关键词检索
    schema.add_field("sparse_embedding", DataType.SPARSE_FLOAT_VECTOR)
    # 标量字段：用于展示和过滤
    schema.add_field("content",          DataType.VARCHAR, max_length=4096)   # chunk 文本
    schema.add_field("tenant_id",        DataType.VARCHAR, max_length=64)    # 多租户隔离
    schema.add_field("chunk_index",      DataType.INT64)                     # 在文档中的顺序
    schema.add_field("document_id",      DataType.VARCHAR, max_length=64)    # 所属文档 ID
    schema.add_field("course_id",        DataType.VARCHAR, max_length=64)    # 所属课程 ID
    schema.add_field("source_name",      DataType.VARCHAR, max_length=256)   # 来源标注
    schema.add_field("chunk_type",       DataType.VARCHAR, max_length=32)    # text / code / table
    schema.add_field("version",          DataType.VARCHAR, max_length=32)    # 文档版本
    schema.add_field("updated_at",       DataType.INT64)                     # 更新时间戳
    return schema
```

### 逐行精读

| 行号 | 代码 | 说明 |
|------|------|------|
| 21 | `def build_schema(client: MilvusClient):` | 函数签名，接收 MilvusClient 实例 |
| 22 | `"""构建集合 schema：稠密 + 稀疏双向量 + 标量字段（含 tenant_id）。"""` | 文档字符串，说明三组字段类型 |
| 23 | `schema = client.create_schema(auto_id=False, enable_dynamic_field=True)` | 创建 Schema：`auto_id=False` 表示主键由 Python 端生成（MD5），`enable_dynamic_field=True` 允许未来扩展字段 |
| 24 | `# 主键：MD5 散列，由 build_knowledge_base.py 的 generate_chunk_id() 生成` | 注释说明主键生成方式 |
| 25 | `schema.add_field("id", DataType.VARCHAR, is_primary=True, max_length=64)` | 主键字段，VARCHAR 类型，64 字符长度 |
| 26 | `# 稠密向量：BGE-M3 的 dense_vecs，1024 维浮点数组` | 注释说明稠密向量用途 |
| 27 | `schema.add_field("embedding", DataType.FLOAT_VECTOR, dim=VECTOR_DIM)` | 稠密向量字段，1024 维 |
| 28 | `# 稀疏向量：BGE-M3 的 lexical_weights` | 注释说明稀疏向量用途 |
| 29 | `schema.add_field("sparse_embedding", DataType.SPARSE_FLOAT_VECTOR)` | 稀疏向量字段，键值对格式 |
| 30~39 | `schema.add_field(...)` 标量字段 9 个 | 展示字段（content）、过滤字段（tenant_id/course_id）、溯源字段（document_id/source_name等） |
| 40 | `return schema` | 返回 Schema 对象 |

### 4.1 `auto_id=False`

`DocumentChunk.id` 由 `generate_chunk_id()` 在 Python 端生成（MD5 散列），而不是让 Milvus 自动生成。这样重建文档时 ID 不变，upsert 能正确覆盖旧数据。

### 4.2 `enable_dynamic_field=True`

允许写入未在 schema 中声明的字段（Milvus 会自动创建）。为未来扩展预留空间，不需要修改 schema 就能加新字段。

### 4.3 三种字段类型

| 类型 | 字段 | 用途 |
|------|------|------|
| `FLOAT_VECTOR(1024)` | `embedding` | 稠密向量，语义检索 |
| `SPARSE_FLOAT_VECTOR` | `sparse_embedding` | 稀疏向量，关键词检索 |
| `VARCHAR` / `INT64` | 其余 9 个字段 | 标量字段，展示和过滤 |

### 4.4 字段与 DocumentChunk 的对应关系

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

## 五、`build_index_params`：定义索引（第 43~58 行）

```python
# scripts/init_milvus.py 第 43~58 行
def build_index_params(client: MilvusClient):
    """构建索引：稠密 HNSW、稀疏 SPARSE_INVERTED、标量 INVERTED。"""
    ip = client.prepare_index_params()
    # 稠密向量：HNSW + COSINE（语义相似度）
    ip.add_index(field_name="embedding", index_type="HNSW", metric_type="COSINE",
                 params={"M": 16, "efConstruction": 256})
    # 稀疏向量：SPARSE_INVERTED_INDEX + IP（内积）
    ip.add_index(field_name="sparse_embedding", index_type="SPARSE_INVERTED_INDEX",
                 metric_type="IP", params={"drop_ratio_build": 0.2})
    # 标量字段：INVERTED 索引，加速 filter 过滤
    ip.add_index(field_name="tenant_id", index_type="INVERTED")
    ip.add_index(field_name="course_id", index_type="INVERTED")
    return ip
```

### 逐行精读

| 行号 | 代码 | 说明 |
|------|------|------|
| 43 | `def build_index_params(client: MilvusClient):` | 函数签名 |
| 44 | `"""构建索引：稠密 HNSW、稀疏 SPARSE_INVERTED、标量 INVERTED。"""` | 文档字符串，概括三种索引类型 |
| 45 | `ip = client.prepare_index_params()` | 初始化索引参数构建器 |
| 47~50 | `ip.add_index(field_name="embedding", index_type="HNSW", metric_type="COSINE", params={"M": 16, "efConstruction": 256})` | 稠密向量索引：HNSW 算法，余弦相似度，M=16 连接数，efConstruction=256 建图宽度 |
| 51~54 | `ip.add_index(field_name="sparse_embedding", index_type="SPARSE_INVERTED_INDEX", metric_type="IP", params={"drop_ratio_build": 0.2})` | 稀疏向量索引：倒排索引，内积度量，丢弃 20% 低权重 token |
| 55~57 | `ip.add_index(field_name="tenant_id", index_type="INVERTED")` + `ip.add_index(field_name="course_id", index_type="INVERTED")` | 标量字段倒排索引，加速过滤查询 |
| 58 | `return ip` | 返回索引参数对象 |

### 5.1 稠密向量索引：HNSW + COSINE

| 参数 | 值 | 说明 |
|------|-----|------|
| **HNSW** | 分层可导航小世界图 | 近似最近邻搜索（ANN），精度和速度的平衡 |
| **M** | 16 | 每个节点的最大连接数，越大精度越高但建图越慢 |
| **efConstruction** | 256 | 建图时的搜索宽度，越大图质量越好 |
| **COSINE** | 余弦相似度 | 适合语义相似度场景（不考虑向量长度，只看方向） |

### 5.2 稀疏向量索引：SPARSE_INVERTED + IP

| 参数 | 说明 |
|------|------|
| **SPARSE_INVERTED_INDEX** | 倒排索引，类似 Elasticsearch 的索引结构 |
| **IP** | 内积，适合稀疏向量间的相似度计算 |
| **drop_ratio_build=0.2** | 丢弃权重最低的 20% token，减少存储空间 |

### 5.3 标量索引：INVERTED

为 `tenant_id` 和 `course_id` 建立倒排索引，加速过滤查询。没有索引的话，过滤需要全表扫描：

```python
# 实际查询时的 filter
filter = 'tenant_id == "tenant_default" and course_id == "xxx"'
```

---

## 六、`main`：幂等初始化（第 61~82 行）

```python
# scripts/init_milvus.py 第 61~82 行
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
    print("当前集合：", client.list_collections())
    print("⚠️  集合已重建，原有数据已清空，请重新运行 build_knowledge_base.py 导入。")


if __name__ == "__main__":
    main()
```

### 逐行精读

| 行号 | 代码 | 说明 |
|------|------|------|
| 61 | `def main():` | 主函数定义 |
| 62 | `print(f"连接 Milvus：{MILVUS_URI}")` | 日志输出连接地址 |
| 63 | `client = MilvusClient(uri=MILVUS_URI)` | 创建 Milvus 客户端连接 |
| 65 | `# 幂等：集合已存在则先删后建` | 注释说明幂等策略 |
| 66 | `if client.has_collection(COLLECTION_NAME):` | 检查集合是否已存在 |
| 67~68 | `print(...)` / `client.drop_collection(...)` | 集合已存在则先删除 |
| 70 | `# create_collection 传 index_params 会一并建索引并加载到内存` | 注释说明设计要点 |
| 71~75 | `client.create_collection(collection_name=..., schema=..., index_params=...)` | 创建集合：传入 schema 和索引参数，一步完成建表+建索引+加载 |
| 76~78 | `print(...)` 三行 | 输出成功信息、当前集合列表、数据已清空提示 |
| 81~82 | `if __name__ == "__main__": main()` | 入口点，支持直接运行 `python scripts/init_milvus.py` |

### 6.1 幂等流程

```
has_collection? → YES → drop_collection → create_collection
               → NO  → create_collection
```

脚本可以重复执行，但**会清空所有数据**，所以输出提示用户重新导入。

### 6.2 `create_collection` 传 `index_params`

Milvus 的 `create_collection` 可以同时接受 schema 和 index_params，创建集合后自动建索引并加载到内存。不需要额外调用 `load_collection()`。

---

## 七、对比：`init_milvus.py` vs `init_db.sql`

| 维度 | `init_db.sql`（PostgreSQL） | `init_milvus.py`（Milvus） |
|------|---------------------------|--------------------------|
| 语言 | SQL | Python（PyMilvus） |
| 幂等 | `CREATE TABLE IF NOT EXISTS` | `has_collection` → `drop` → `create` |
| 向量 | 不支持 | `FLOAT_VECTOR` + `SPARSE_FLOAT_VECTOR` |
| 索引 | B-tree（标量） | HNSW（稠密）+ SPARSE_INVERTED（稀疏）+ INVERTED（标量） |
| 数据清理 | `DROP TABLE` 删除整表 | `drop_collection` 删除整个集合 |

---

## 八、调用方式与依赖

### 8.1 谁调用它？

`init_milvus.py` 是**独立脚本**，不通过 import 调用，而是直接运行：

```bash
python scripts/init_milvus.py
```

它只在以下场景运行：
- 首次部署：Milvus 还没有 `knowledge_domain` 集合
- 重置集合：需要清空所有数据、重建 Schema 或索引
- CI/CD 环境：每次环境重建时初始化

### 8.2 依赖的外部资源

| 依赖 | 用途 | 来源 |
|------|------|------|
| `Milvus`（Docker） | 向量数据库 | `docker-compose up -d` 启动 |
| `backend.config.get_settings()` | 读取 milvus_host / milvus_port | 配置文件 |
| `PyMilvus` | Python 客户端 SDK | `pip install pymilvus` |

### 8.3 下游消费者

`init_milvus.py` 创建的集合被两个模块消费：

```
init_milvus.py 创建集合
  │
  ├─ build_knowledge_base.py → 写入数据（离线建库）
  │
  └─ KnowledgeBaseClient（backend/core/knowledge_base.py）
       └─ _hybrid_search → 在线检索（reranker.py 调用）
```

关键点：**必须先运行 `init_milvus.py`，再运行 `build_knowledge_base.py`**。否则 `upsert_chunks` 会因为集合不存在而失败。

### 8.4 失败降级

脚本没有内建重试机制。如果 Milvus 连接失败，会直接抛出 `MilvusConnectionError`。由于脚本是幂等的（可重复执行），失败后重新运行即可，无需清理。

---

## 九、边界情况与异常处理

| 场景 | 表现 | 处理 |
|------|------|------|
| Milvus 未启动 | `MilvusClient(uri=...)` 抛连接异常 | 脚本崩溃，检查 `docker-compose ps` 后重跑 |
| 集合已存在 | `has_collection()` 返回 True | 先 drop 再 create，清空所有数据 |
| URI 配置错误 | `MILVUS_URI` 拼错 | 抛异常，检查 config 的 milvus_host/port |
| `VECTOR_DIM` 与模型不一致 | create_collection 报维度不匹配错误 | 改回 1024 |
| 重复运行 | 幂等，但清空数据 | 输出提示重新导入 |

**重要注意**：`init_milvus.py` 是**破坏性操作**——每次运行都会清空 `knowledge_domain` 集合的全部数据。生产环境升级前务必先备份，或确保 `build_knowledge_base.py` 能立即重新导入。

---

## ★ Insight ─── 设计亮点总结

### 1. 单集合多租户

所有数据在一个集合里，靠 `tenant_id` 字段过滤。避免了管理多个集合的复杂度，同时通过 `tenant_id` 的 INVERTED 索引保证了过滤性能。

### 2. 双向量索引

同时为稠密向量（HNSW）和稀疏向量（SPARSE_INVERTED）建索引，支持 Hybrid 检索。

### 3. Schema 与代码的对应关系

Schema 字段与 `DocumentChunk` 属性一一对应，减少转换错误：

```
init_milvus.py 定义 Schema → DocumentChunk 填充数据 → upsert 写入
                                 ↑
                           build_knowledge_base.py 调用
```

### 4. 幂等可重复

脚本可以反复执行，适合 CI/CD 环境初始化。

### 5. 与 PostgreSQL 的协作

| 数据库 | 存储内容 | 用途 |
|--------|---------|------|
| PostgreSQL | 用户、课程、试卷、面试记录 | 业务数据，事务性操作 |
| Milvus | 知识库 chunk 向量 | 向量检索，相似度搜索 |