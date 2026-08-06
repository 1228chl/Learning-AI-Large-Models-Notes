# Milvus 初始化与知识库构建 — 从零理解

## 一、Milvus 是什么？

Milvus 是一个**向量数据库**，专门用来存储和检索向量数据。

传统数据库（PostgreSQL）是按条件精确匹配：

```sql
SELECT * FROM users WHERE name = '张三';
```

向量数据库是按**相似度**匹配：

```
查询向量 [0.12, -0.34, ...] → 找最相似的 10 个向量 → 返回对应的文本
```

## 二、集合 Schema

`scripts/init_milvus.py` 定义了 `knowledge_domain` 集合的结构：

```python
COLLECTION_NAME = "knowledge_domain"
VECTOR_DIM = 1024  # BGE-M3 稠密向量维度

def build_schema(client: MilvusClient):
    schema = client.create_schema(auto_id=False, enable_dynamic_field=True)
    schema.add_field("id",               DataType.VARCHAR, is_primary=True, max_length=64)
    schema.add_field("embedding",        DataType.FLOAT_VECTOR, dim=VECTOR_DIM)      # 稠密向量
    schema.add_field("sparse_embedding", DataType.SPARSE_FLOAT_VECTOR)              # 稀疏向量
    schema.add_field("content",          DataType.VARCHAR, max_length=4096)
    schema.add_field("tenant_id",        DataType.VARCHAR, max_length=64)           # 多租户
    schema.add_field("chunk_index",      DataType.INT64)
    schema.add_field("document_id",      DataType.VARCHAR, max_length=64)
    schema.add_field("course_id",        DataType.VARCHAR, max_length=64)
    schema.add_field("source_name",      DataType.VARCHAR, max_length=256)
    schema.add_field("chunk_type",       DataType.VARCHAR, max_length=32)
    schema.add_field("version",          DataType.VARCHAR, max_length=32)
    schema.add_field("updated_at",       DataType.INT64)
    return schema
```

## 三、索引类型

```python
def build_index_params(client: MilvusClient):
    ip = client.prepare_index_params()

    # 稠密向量：HNSW + COSINE
    ip.add_index(field_name="embedding", index_type="HNSW",
                 metric_type="COSINE", params={"M": 16, "efConstruction": 256})

    # 稀疏向量：SPARSE_INVERTED_INDEX + IP
    ip.add_index(field_name="sparse_embedding", index_type="SPARSE_INVERTED_INDEX",
                 metric_type="IP", params={"drop_ratio_build": 0.2})

    # 标量字段：INVERTED 索引，加速 filter
    ip.add_index(field_name="tenant_id", index_type="INVERTED")
    ip.add_index(field_name="course_id", index_type="INVERTED")
    return ip
```

| 字段 | 索引类型 | 度量 | 说明 |
|------|---------|------|------|
| `embedding` | HNSW | COSINE | 稠密向量语义相似度 |
| `sparse_embedding` | SPARSE_INVERTED_INDEX | IP | 稀疏向量关键词匹配 |
| `tenant_id` | INVERTED | - | 多租户过滤加速 |
| `course_id` | INVERTED | - | 课程过滤加速 |

## 四、知识库构建流水线

`scripts/build_knowledge_base.py` 的完整流水线：

```
Step 1    读取文档（PyPDFLoader / TextLoader）
Step 2    智能分块（MarkdownHeaderTextSplitter + RecursiveCharacterTextSplitter）
Step 2.5 Contextual RAG 上下文增强（LLM 并发，可选）
Step 3    BGE-M3 嵌入（dense + sparse 双向量）
Step 4    写入 Milvus（先删后插，幂等）
```

### 4.1 文档加载

```python
def load_document(file_path: str) -> list[Document]:
    ext = path.suffix.lower()
    if ext == ".pdf":
        loader = PyPDFLoader(file_path)  # PDF → 每页一个 Document
    elif ext in (".md", ".markdown"):
        loader = TextLoader(file_path, encoding="utf-8")  # MD → 整个文件一个 Document
```

### 4.2 智能分块

```python
def split_markdown_documents(docs, chunk_size=1200, chunk_overlap=100):
    # 第一阶段：按标题分块（H1/H2/H3/H4）
    header_chunks = _MD_HEADER_SPLITTER.split_text(doc.page_content)

    # 第二阶段：按字符数进一步切分
    final_chunks = splitter.split_documents(header_chunks)
```

### 4.3 Contextual RAG

```python
async def add_context(chunks, docs, concurrency=5):
    # 用 LLM 为每个 chunk 生成一句"定位描述"
    # 拼接后格式："<上下文描述>\n\n<原始 chunk 文本>"
    contexts = await asyncio.gather(*[
        generate_chunk_context(llm, full_doc_text, c.page_content, semaphore)
        for c in chunks
    ])
```

**为什么？** 直接检索 chunk 文本，LLM 不知道这个 chunk 在文档的哪个位置。加上上下文描述后，向量同时编码了"在哪里"和"说了什么"。

### 4.4 嵌入

```python
def embed_chunks(chunks, course_id, document_id, ...):
    embedder = BGEMEmbedder.get_instance()
    for batch_start in range(0, total, BATCH_SIZE):
        batch = chunks[batch_start: batch_start + BATCH_SIZE]
        dense_vecs, sparse_vecs = embedder.encode(texts, batch_size=BATCH_SIZE)
        all_doc_chunks.append(DocumentChunk(
            id=generate_chunk_id(content, document_id, global_index),
            content=content,
            embedding=dense,
            sparse_embedding=sparse,
            ...
        ))
```

### 4.5 写入 Milvus

```python
def write_to_milvus(doc_chunks):
    kb = KnowledgeBaseClient()
    document_id = doc_chunks[0].document_id

    # 先删旧版本（幂等更新）
    kb.delete_document_chunks(document_id)

    # 批量 upsert
    written = kb.upsert_chunks(doc_chunks)
```

## 五、运行

```bash
# 1. 启动基础设施
docker-compose up -d

# 2. 初始化 Milvus 集合
python scripts/init_milvus.py

# 3. 构建知识库
python scripts/build_knowledge_base.py
```

在 `if __name__ == "__main__":` 里修改 `FILE_PATH` 和 `COURSE_ID` 即可。

## 六、总结

```
init_milvus.py              ← 创建集合 + 索引（只需运行一次）
    │
    ▼
build_knowledge_base.py     ← 加载 → 分块 → 上下文增强 → 嵌入 → 写入
    │
    ▼
Milvus 中的 knowledge_domain 集合
    ├── 向量字段：embedding（稠密）、sparse_embedding（稀疏）
    └── 标量字段：content、tenant_id、course_id、source_name 等
```

**核心思想：建库和查询分离。建库是离线过程，查询是在线过程。**