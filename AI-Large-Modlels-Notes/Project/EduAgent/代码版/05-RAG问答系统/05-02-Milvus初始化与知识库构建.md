# Milvus 初始化与知识库构建

> 源文件 A：`scripts/init_milvus.py`（82 行）— 创建集合与索引
> 源文件 B：`scripts/build_knowledge_base.py`（457 行）— 文档加载 → 分块 → 嵌入 → 写入

---

## 一、为什么需要向量数据库？

### 1.1 为什么需要 Milvus？

RAG（检索增强生成）的核心是"先检索、后生成"。检索环节需要一个**存储和搜索向量的数据库**：

```
学员提问："什么是 Spring IOC？"
  │
  ▼
把问题转为向量 [0.12, -0.34, ...]  ← BGE-M3 嵌入
  │
  ▼
在向量库中搜索相似向量          ← Milvus 的职责
  │
  ▼
找到最相关的知识库文档 chunk
  │
  ▼
LLM 基于检索结果生成回答
```

Milvus 是专门为向量检索设计的数据库，相比传统数据库：
- 传统数据库（PostgreSQL）: 只能做精确关键词匹配，搜索"容器"搜不到"IOC"
- 向量数据库（Milvus）: 做语义相似度搜索，搜"容器"也能找到"IOC"

### 1.2 为什么 init_milvus 和 build_knowledge_base 分开？

两个脚本职责分离：

| 脚本 | 频率 | 职责 |
|------|------|------|
| `init_milvus.py` | 只运行一次 | 创建集合、定义 Schema、建索引 |
| `build_knowledge_base.py` | 每次导入文档 | 加载→分块→嵌入→写入 |

**建库和查询分离**——建库是离线过程，查询是在线过程。`init_milvus.py` 只需在首次部署或重置集合时运行一次，`build_knowledge_base.py` 则在每次导入新文档时运行。

### 1.3 单集合 + tenant_id 过滤设计

一个 `knowledge_domain` 集合，通过 `tenant_id` 字段区分不同租户的数据。查询时在 Milvus 的 bool 过滤表达式中添加 `tenant_id == "xxx"` 条件，实现多租户隔离。优点是运维简单（一个集合管理所有数据），但需要确保查询时不会遗漏 tenant_id 过滤。

---

## 二、init_milvus.py 全文档行号速查表

| 行号范围 | 符号 | 层级 | 说明 |
|----------|------|------|------|
| 1-8 | 注释 | 文件头 | 说明用途、运行方式、幂等设计 |
| 10-12 | import | 模块级 | 导入 os, pymilvus, get_settings |
| 15-18 | 连接配置 | 常量 | MILVUS_URI, VECTOR_DIM, COLLECTION_NAME |
| 21-40 | `build_schema()` | 函数 | 构建集合 schema（稠密+稀疏双向量+标量字段） |
| 43-58 | `build_index_params()` | 函数 | 构建索引（HNSW + SPARSE_INVERTED + INVERTED） |
| 61-78 | `main()` | 函数 | 主函数：连接 → 删旧集合 → 重建 |
| 81-82 | `if __name__ == "__main__"` | 入口 | 直接运行 |

### 1.1 常量定义

```python
# init_milvus.py 第 15~18 行
MILVUS_URI = f"http://{get_settings().milvus_host}:{get_settings().milvus_port}"
VECTOR_DIM = 1024                  # BGE-M3 稠密向量维度
COLLECTION_NAME = "knowledge_domain"
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 16 | `MILVUS_URI = f"http://{...}"` | 从配置拼接 Milvus 连接地址 |
| 17 | `VECTOR_DIM = 1024` | BGE-M3 稠密向量维度（1024 维浮点数组） |
| 18 | `COLLECTION_NAME = "knowledge_domain"` | 单集合设计，靠 tenant_id 字段过滤实现多租户隔离 |

### 1.2 build_schema() 构建集合 schema

```python
# init_milvus.py 第 21~40 行
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

| 行号 | 代码 | 说明 |
|------|------|------|
| 21 | `def build_schema(client: MilvusClient):` | 构建集合 schema |
| 23 | `schema = client.create_schema(auto_id=False, enable_dynamic_field=True)` | `auto_id=False` 主键由应用生成（MD5）；`enable_dynamic_field=True` 允许未预定义字段 |
| 25 | `add_field("id", VARCHAR, is_primary=True, max_length=64)` | 主键：MD5 散列，由 build_knowledge_base.py 的 generate_chunk_id() 生成 |
| 27 | `add_field("embedding", FLOAT_VECTOR, dim=1024)` | 稠密向量字段，BGE-M3 dense_vecs |
| 29 | `add_field("sparse_embedding", SPARSE_FLOAT_VECTOR)` | 稀疏向量字段，BGE-M3 lexical_weights |
| 31-39 | 标量字段 | content（chunk 文本）、tenant_id（多租户隔离）、chunk_index（顺序）、document_id、course_id、source_name（来源标注）、chunk_type（text/code/table）、version、updated_at |

### 1.3 build_index_params() 构建索引

```python
# init_milvus.py 第 43~58 行
def build_index_params(client: MilvusClient):
    ip = client.prepare_index_params()
    ip.add_index(field_name="embedding", index_type="HNSW", metric_type="COSINE",
                 params={"M": 16, "efConstruction": 256})
    ip.add_index(field_name="sparse_embedding", index_type="SPARSE_INVERTED_INDEX",
                 metric_type="IP", params={"drop_ratio_build": 0.2})
    ip.add_index(field_name="tenant_id", index_type="INVERTED")
    ip.add_index(field_name="course_id", index_type="INVERTED")
    return ip
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 43 | `def build_index_params(client: MilvusClient):` | 构建索引参数 |
| 45 | `ip = client.prepare_index_params()` | 初始化索引参数对象 |
| 49-50 | `add_index("embedding", HNSW, COSINE, M=16, efConstruction=256)` | 稠密向量：HNSW 分层可导航小世界图。M=16 控制每个节点的连接数；efConstruction=256 控制建图时的搜索宽度 |
| 53-54 | `add_index("sparse_embedding", SPARSE_INVERTED_INDEX, IP, drop_ratio_build=0.2)` | 稀疏向量：SPARSE_INVERTED，drop_ratio_build=0.2 丢弃权重最低的 20% token，减少存储空间 |
| 56-57 | `add_index("tenant_id"/"course_id", INVERTED)` | 标量字段倒排索引，加速 filter 过滤 |

### 1.4 main() 主函数

```python
# init_milvus.py 第 61~78 行
def main():
    print(f"连接 Milvus：{MILVUS_URI}")
    client = MilvusClient(uri=MILVUS_URI)
    if client.has_collection(COLLECTION_NAME):
        print(f"🗑️  删除旧集合 '{COLLECTION_NAME}'...")
        client.drop_collection(COLLECTION_NAME)
    client.create_collection(
        collection_name=COLLECTION_NAME,
        schema=build_schema(client),
        index_params=build_index_params(client),
    )
    print(f"✅ 集合 '{COLLECTION_NAME}' 创建完成（含索引，已加载）")
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 61 | `def main():` | 主函数 |
| 63 | `client = MilvusClient(uri=MILVUS_URI)` | 建立 Milvus 连接 |
| 66-68 | `if client.has_collection(...): drop_collection(...)` | 幂等设计：集合已存在则先删后建 |
| 71-75 | `client.create_collection(...)` | 传 index_params 会一并建索引并加载到内存 |
| 76-78 | 打印结果 | 提醒集合已重建，原有数据已清空，需重新运行 build_knowledge_base.py |

---

## 二、build_knowledge_base.py 全文档行号速查表

| 行号范围 | 符号 | 层级 | 说明 |
|----------|------|------|------|
| 1-22 | import | 模块级 | 导入 asyncio, uuid, Path, langchain, backend |
| 24-27 | 常量 | 模块级 | BATCH_SIZE, MAX_CONTEXT_CONCURRENCY |
| 28-39 | `CONTEXTUAL_CHUNK_PROMPT` | 常量 | Contextual RAG 提示词模板 |
| 45-63 | 分块器单例 | 模块级 | `_MD_HEADER_SPLITTER`, `_CHAR_SPLITTER` |
| 67-84 | `load_pdf()` | 函数 | 加载 PDF 文档 |
| 87-105 | `load_markdown()` | 函数 | 加载 Markdown 文档 |
| 107-128 | `load_document()` | 函数 | 统一文档加载入口 |
| 133-148 | `split_pdf_documents()` | 函数 | PDF 分块 |
| 151-184 | `split_markdown_documents()` | 函数 | Markdown 两阶段分块 |
| 187-195 | `split_documents()` | 函数 | 统一分块入口 |
| 200-261 | `embed_chunks()` | 函数 | BGE-M3 批量嵌入 |
| 266-299 | `generate_chunk_context()` | 函数 | 单 chunk 上下文生成 |
| 302-342 | `add_context()` | 函数 | Contextual RAG 并发增强 |
| 347-365 | `write_to_milvus()` | 函数 | 写入 Milvus |
| 370-432 | `build_pipeline()` | 函数 | 主流水线（五步） |
| 438-455 | CLI 入口 | 入口 | 直接运行 |

### 2.1 常量定义

```python
# build_knowledge_base.py 第 24~27 行
BATCH_SIZE = 12   # BGE-M3 批量推理大小
MAX_CONTEXT_CONCURRENCY = 5    # Contextual 上下文生成的最大并发 LLM 请求数
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 24 | `BATCH_SIZE = 12` | BGE-M3 批量推理大小（12 = 速度与显存的经验平衡点） |
| 26 | `MAX_CONTEXT_CONCURRENCY = 5` | Contextual 上下文生成的最大并发 LLM 请求数，防止触发 API 限流 |

### 2.2 CONTEXTUAL_CHUNK_PROMPT 模板

```python
# build_knowledge_base.py 第 28~39 行
CONTEXTUAL_CHUNK_PROMPT = """\
<document>
{document_text}
</document>

以下是需要在整个文档中定位的 chunk：
<chunk>
{chunk_content}
</chunk>

请用一句简洁的中文，描述这段内容在整个文档中的位置和作用，以便改善检索效果。
只输出这一句描述，不要加任何前缀或标签。"""
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 28 | `CONTEXTUAL_CHUNK_PROMPT = """\` | Prompt 模板，`\` 避免首行换行 |
| 29-31 | `<document>...</document>` | 整篇文档全文占位符 |
| 33-36 | `<chunk>...</chunk>` | 需要定位的 chunk 占位符 |
| 38 | 指令 | 要求生成一句中文定位描述，去掉前缀/标签 |

### 2.3 模块级分块器单例

```python
# build_knowledge_base.py 第 45~63 行
_MD_HEADER_SPLITTER = MarkdownHeaderTextSplitter(
    headers_to_split_on=[
        ("#",   "H1"),     # # 一级标题
        ("##",  "H2"),     # ## 二级标题
        ("###", "H3"),     # ### 三级标题
        ("####", "H4"),    # #### 四级标题
    ],
    strip_headers=False,   # 保留标题文本，检索时上下文更完整
)

_CHAR_SPLITTER = RecursiveCharacterTextSplitter(
    chunk_size=512,
    chunk_overlap=100,
    separators=["\n\n", "\n", "。", "，", " ", ""],
)
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 45-53 | `_MD_HEADER_SPLITTER = MarkdownHeaderTextSplitter(...)` | 按 #/##/###/#### 级别切分，保留标题层级在 metadata 中。`strip_headers=False` 保留标题文本 |
| 59-63 | `_CHAR_SPLITTER = RecursiveCharacterTextSplitter(...)` | chunk_size=512 字符，chunk_overlap=100 前后重叠，避免切分导致语义断裂。separators 切分优先级：段落 > 行 > 句号 > 逗号 > 空格 > 字符 |

### 2.4 build_pipeline() 主流水线

```python
# build_knowledge_base.py 第 370~432 行
async def build_pipeline(file_path, course_id, document_id, tenant_id="tenant_default",
                         version="1.0", use_context=True) -> None:
    docs = load_document(file_path)                              # Step 1：读取
    chunks = split_documents(docs, file_path)                    # Step 2：分块
    if use_context and chunks:                                   # Step 2.5：Contextual RAG
        chunks = await add_context(chunks, docs)
    doc_chunks = embed_chunks(chunks, course_id=course_id,       # Step 3：嵌入
                              document_id=document_id, tenant_id=tenant_id, version=version)
    write_to_milvus(doc_chunks)                                  # Step 4：写入
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 370-377 | `async def build_pipeline(...)` | 知识库建库完整流水线（五步），核心亮点是 Step 2.5 Contextual RAG |
| 402-404 | `docs = load_document(file_path)` | Step 1：读取文档 |
| 406-408 | `chunks = split_documents(docs, file_path)` | Step 2：智能分块（按文件类型选择策略） |
| 410-414 | `if use_context and chunks: chunks = await add_context(...)` | Step 2.5：Contextual RAG 上下文增强（可跳过） |
| 416-424 | `doc_chunks = embed_chunks(...)` | Step 3：BGE-M3 嵌入（dense + sparse 双向量） |
| 427-428 | `write_to_milvus(doc_chunks)` | Step 4：写入 Milvus（MilvusClient upsert） |

### 2.5 CLI 入口

```python
# build_knowledge_base.py 第 438~455 行
if __name__ == "__main__":
    FILE_PATH   = "./samples/sample2.md"
    COURSE_ID   = "3e76aeed-5e01-4aa7-be8d-2055d12b9ea7"
    DOCUMENT_ID = None          # None = 自动生成
    TENANT_ID   = "tenant_default"
    VERSION     = "1.0"
    USE_CONTEXT = True
    doc_id = DOCUMENT_ID or str(uuid.uuid4())
    asyncio.run(build_pipeline(file_path=FILE_PATH, course_id=COURSE_ID,
                               document_id=doc_id, tenant_id=TENANT_ID,
                               version=VERSION, use_context=USE_CONTEXT))
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 438 | `if __name__ == "__main__":` | 直接运行入口 |
| 439 | `FILE_PATH = "./samples/sample2.md"` | 待导入文档路径 |
| 440 | `COURSE_ID = "..."` | 实际课程 UUID |
| 441 | `DOCUMENT_ID = None` | None = 自动生成；更新同一文档时填入上次输出的 ID |
| 444 | `USE_CONTEXT = True` | False = 跳过 Contextual RAG 快速调试 |
| 446 | `doc_id = DOCUMENT_ID or str(uuid.uuid4())` | 自动生成或复用文档 ID |
| 448-455 | `asyncio.run(build_pipeline(...))` | 运行异步流水线 |

---

## 三、知识库构建流水线概览

```
Step 1    读取文档（PyPDFLoader / TextLoader）
Step 2    智能分块（MarkdownHeaderTextSplitter + RecursiveCharacterTextSplitter）
Step 2.5  Contextual RAG 上下文增强（LLM 并发，可选）
Step 3    BGE-M3 嵌入（dense + sparse 双向量）
Step 4    写入 Milvus（先删后插，幂等）
```

---

## 四、关键子函数速览

### 4.1 文档加载（load_document）

```python
# build_knowledge_base.py 第 107~128 行
def load_document(file_path: str) -> list[Document]:
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"文件不存在：{file_path}")
    ext = path.suffix.lower()
    if ext == ".pdf":
        loader = PyPDFLoader(file_path)
        pages = loader.load()          # PDF → 每页一个 Document
    elif ext in (".md", ".markdown"):
        loader = TextLoader(file_path, encoding="utf-8")
        docs = loader.load()           # MD → 整个文件一个 Document
    else:
        raise ValueError(...)
```

### 4.2 智能分块（split_markdown_documents）

```python
# build_knowledge_base.py 第 151~184 行
def split_markdown_documents(docs, chunk_size=1200, chunk_overlap=100):
    splitter = MarkdownTextSplitter(chunk_size=chunk_size, chunk_overlap=chunk_overlap)
    header_chunks = []
    for doc in docs:
        sections = _MD_HEADER_SPLITTER.split_text(doc.page_content)  # 第一阶段：按标题分块
        header_chunks.extend(sections)
    final_chunks = splitter.split_documents(header_chunks)           # 第二阶段：按字符数切分
    # 构建 source_name："文件名 > H1 > H2 > H3"
```

### 4.3 Contextual RAG（add_context）

```python
# build_knowledge_base.py 第 302~342 行
async def add_context(chunks, docs, concurrency=MAX_CONTEXT_CONCURRENCY):
    full_doc_text = "\n\n".join(d.page_content for d in docs)[:8000]
    llm = get_llm("qa", temperature=0)
    semaphore = asyncio.Semaphore(concurrency)
    contexts = await asyncio.gather(*[
        generate_chunk_context(llm, full_doc_text, c.page_content, semaphore)
        for c in chunks
    ])
    for chunk, ctx in zip(chunks, contexts):
        if ctx:
            chunk.page_content = f"{ctx}\n\n{chunk.page_content}"
```

### 4.4 嵌入（embed_chunks）

```python
# build_knowledge_base.py 第 200~261 行
def embed_chunks(chunks, course_id, document_id, tenant_id="tenant_default", version="1.0"):
    embedder = BGEMEmbedder.get_instance()
    for batch_start in range(0, total, BATCH_SIZE):
        batch = chunks[batch_start: batch_start + BATCH_SIZE]
        dense_vecs, sparse_vecs = embedder.encode(texts, batch_size=BATCH_SIZE)
        all_doc_chunks.append(DocumentChunk(
            id=generate_chunk_id(content, document_id, global_index),
            embedding=dense, sparse_embedding=sparse, ...
        ))
```

### 4.5 写入 Milvus（write_to_milvus）

```python
# build_knowledge_base.py 第 347~365 行
def write_to_milvus(doc_chunks):
    kb = KnowledgeBaseClient()
    document_id = doc_chunks[0].document_id
    kb.delete_document_chunks(document_id)   # 先删旧版本（幂等更新）
    written = kb.upsert_chunks(doc_chunks)   # 批量 upsert
```

---

## 五、依赖关系

```
init_milvus.py
  ├── pymilvus → MilvusClient, DataType
  └── backend.config → get_settings

build_knowledge_base.py
  ├── langchain_community → PyPDFLoader, TextLoader
  ├── langchain_text_splitters → MarkdownHeaderTextSplitter, RecursiveCharacterTextSplitter, MarkdownTextSplitter
  ├── backend.core.knowledge_base → BGEMEmbedder, KnowledgeBaseClient, DocumentChunk, generate_chunk_id
  └── backend.core.llm_factory → get_llm
```

---

## 六、设计亮点

```python
# ★ Insight ─── Contextual RAG：解决 chunk 位置信息丢失
# 问题：
#   普通的 RAG 只对 chunk 文本做嵌入，丢失了"这段内容在文档的哪个位置"的信息。
#   检索时 LLM 不知道 chunk 的上下文语境。
# 解决方案：
#   用 LLM 为每个 chunk 生成一句"定位描述"（如"本节介绍 Spring IOC 容器的核心作用，
#   位于第三章 Spring 框架基础部分"），拼在 chunk 前面再嵌入。
# 效果：
#   嵌入向量同时包含"什么内容"和"在文档哪个位置"两层信息，检索准确性显著提升。
```

```python
# ★ Insight ─── 分块两阶段策略
# 第一阶段：MarkdownHeaderTextSplitter 按标题切分（H1/H2/H3/H4）
#   保留标题层级，生成结构化 chunk，语义完整。
# 第二阶段：MarkdownTextSplitter 按字符数进一步切分
#   处理超长标题章节，chunk_size=1200 适合代码类内容。
# 结合生成 source_name："文件名 > H1 > H2"，检索结果能展示文档位置。
```

```python
# ★ Insight ─── 建库和查询分离
# init_milvus.py 只需运行一次（幂等设计：先删后建）。
# build_knowledge_base.py 是离线过程，负责加载→分块→上下文增强→嵌入→写入。
# 查询是在线过程（reranker.py 的 retrieve），两者解耦。
# 更新文档时保留 document_id，先删旧版本 chunk 再插入，幂等重建。
```

---

## 七、边界情况与异常处理

### 7.1 Milvus 连接失败

`MilvusClient(uri=...)` 在 `init_milvus.py` 第 63 行调用。如果 Docker 未启动或 URI 配置错误，Milvus 客户端会抛出 `MilvusConnectionError`。此时：
- `init_milvus.py` 直接崩溃（幂等设计，可重试）
- `build_knowledge_base.py` 的 `write_to_milvus` 同样崩溃（上抛给调用者处理）

### 7.2 集合已存在时的幂等行为

`init_milvus.py` 第 66~68 行检测到集合已存在时先删后建。这意味着：
- 重复运行 `init_milvus.py` 会清空所有数据
- 生产环境升级时需谨慎，建议先备份再重建

### 7.3 文件不存在

`build_knowledge_base.py` 第 274~275 行检查文件是否存在，不存在则抛出 `FileNotFoundError`。CLI 入口直接运行会暴露此错误，因此建议在调用前验证文件路径。

### 7.4 不支持的文件格式

`load_document()` 仅支持 `.pdf` / `.md` / `.markdown`。其他格式会抛出详细异常，提示用户用 `markitdown` 工具转换后重试。

### 7.5 空文档

- PDF 全部是图片页（扫描件）：`PyPDFLoader` 不报错，但每页 `page_content` 为空字符串
- 空 Markdown 文件：`TextLoader` 正常加载，`page_content` 为空字符串
- 空 chunk 在 `embed_chunks` 阶段会生成零向量，不影响检索效果但会占用索引空间

### 7.6 Contextual RAG 并发限流

`add_context` 使用 `asyncio.Semaphore(MAX_CONTEXT_CONCURRENCY=5)` 控制并发，防止 LLM API 限流。如果 LLM 调用失败，`generate_chunk_context` 返回空字符串，该 chunk 跳过上下文增强（不阻塞整个流水线）。

### 7.7 写入 Milvus 失败

`write_to_milvus` 的 `upsert_chunks` 是批量操作，如果部分写入失败，Milvus 客户端会抛出异常。此时需要重新运行整个流水线，因为 `delete_document_chunks` 已经执行完毕（旧版本已删除），不重跑会导致数据丢失。

---

## 运行方法

```bash
# 1. 启动基础设施
docker-compose up -d

# 2. 初始化 Milvus 集合（只需运行一次）
python scripts/init_milvus.py

# 3. 构建知识库
python scripts/build_knowledge_base.py
```

在 `if __name__ == "__main__":` 里修改 `FILE_PATH` 和 `COURSE_ID` 即可。

---

## 核心思想

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

**建库和查询分离。建库是离线过程，查询是在线过程。Contextual RAG 用 LLM 为每个 chunk 补充定位描述，显著提升检索准确性。**