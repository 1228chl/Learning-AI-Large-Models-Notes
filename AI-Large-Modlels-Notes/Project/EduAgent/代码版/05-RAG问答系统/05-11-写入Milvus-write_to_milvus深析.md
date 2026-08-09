# 写入 Milvus：`write_to_milvus` 深度解析

> 源文件：`scripts/build_knowledge_base.py`
> 配套：`backend/core/knowledge_base.py`（`KnowledgeBaseClient` 的 `upsert_chunks` / `delete_document_chunks`）
> 对应课件：5.5 写入 Milvus

---

## 全文行号速查表

| 行号范围 | 标识符 | 类型 | 一句话说明 |
|----------|--------|------|-----------|
| 347~365 | `write_to_milvus()` | 函数 | 将 DocumentChunk 列表写入 Milvus（先删后插） |

---

## 一、函数签名速览

```python
# build_knowledge_base.py 第 347~348 行
def write_to_milvus(doc_chunks: list[DocumentChunk]) -> None:
```

---

## 二、设计动机

`write_to_milvus` 是整个知识库构建流水线的**最后一站**——把嵌好向量的 `DocumentChunk` 列表写入 Milvus 向量库。

在 `build_pipeline()` 中的位置：

```python
# build_knowledge_base.py 第 427~428 行
# Step 4：写入
print("\n  Step 4/4  写入 Milvus...")
write_to_milvus(doc_chunks)           # 最后一站
```

**核心挑战**：文档更新时，chunk 的数量和内容可能都变了。要求 Milvus 中始终只有最新版本的 chunk，不残留旧数据。

---

## 三、`write_to_milvus()`（第 347~365 行）

```python
# build_knowledge_base.py 第 347~365 行
def write_to_milvus(doc_chunks: list[DocumentChunk]) -> None:
    """
    将 embed_chunks() 产出的 DocumentChunk 列表写入 Milvus。

    先按 document_id 删除同文档旧版本 chunk，再批量 upsert，
    保证文档更新时不残留旧数据。
    """
    if not doc_chunks:
        print("  No chunk to write, skip")
        return

    kb          = KnowledgeBaseClient()
    document_id = doc_chunks[0].document_id

    print(f"  Delete old chunks (document_id={document_id[:8]}...)")
    kb.delete_document_chunks(document_id)

    written = kb.upsert_chunks(doc_chunks)
    print(f"  Write complete: {written} chunks -> knowledge_domain")
```

### 逐行精读

| 行号 | 代码 | 说明 |
|------|------|------|
| 347~348 | `def write_to_milvus(doc_chunks):` | 输入 `embed_chunks()` 产出的 `list[DocumentChunk]`，无返回值 |
| 354~355 | `if not doc_chunks: print(...); return` | **防御性编程**：空列表直接跳过，不执行任何 Milvus 操作 |
| 358 | `kb = KnowledgeBaseClient()` | 实例化 Milvus 客户端，内部封装了 Milvus 连接和集合操作 |
| 359 | `document_id = doc_chunks[0].document_id` | 从第一个 chunk 取 document_id，同文档所有 chunk 共享同一 ID |
| 361~362 | `kb.delete_document_chunks(document_id)` | **先删旧版**：按 document_id 删除同文档所有旧版本 chunk |
| 364~365 | `written = kb.upsert_chunks(doc_chunks)` | **再插新版**：批量写入新版本 chunk，返回写入数量 |

### 为什么不是直接 upsert？

Milvus 的 `upsert` 按主键（`id`）匹配：存在则更新，不存在则插入。但文档更新后，chunk 的数量和内容可能都变了：

```
旧文档（3 个 chunk）：
  id=a, id=b, id=c

新文档（4 个 chunk）：
  id=a, id=b, id=d, id=e
```

如果直接 upsert：

| chunk | 操作 | 结果 |
|-------|------|------|
| `a` | 更新 | 正确 |
| `b` | 更新 | 正确 |
| `d` | 插入 | 正确 |
| `e` | 插入 | 正确 |
| `c` | 无操作 | **残留！**旧文档删掉的 chunk 还在 Milvus 里 |

**先删后插**保证：文档更新后，Milvus 里只有新版本的 chunk，旧版本全部清除。

---

## 四、`delete_document_chunks()`：删除旧版本

```python
# backend/core/knowledge_base.py 第 264~274 行
def delete_document_chunks(self, document_id: str) -> None:
    """
    删除指定文档的所有 chunk（文档更新时先删后插，幂等重建）。
    对 document_id 转义，防止 filter 表达式注入。
    """
    safe_id = document_id.replace('"', '\\"')
    self._client.delete(
        collection_name=COLLECTION_NAME,
        filter=f'document_id == "{safe_id}"',
    )
    logger.info("knowledge_base.document_deleted", document_id=document_id)
```

### 逐行精读

| 行号 | 代码 | 说明 |
|------|------|------|
| 86~90 | 函数签名 | 输入 `document_id`，无返回值 |
| 92 | `safe_id = document_id.replace('"', '\\"')` | **防注入**：对 `document_id` 中的双引号进行转义 |
| 93~95 | `self._client.delete(filter=...)` | 用 Milvus filter 表达式删除所有 `document_id` 匹配的 chunk |
| 96 | `logger.info(...)` | 记录日志 |

### Filter 表达式

`document_id` 是 `DocumentChunk` 中的一个字段，**不是 Milvus 主键**。所以这里用 Milvus 的 filter 表达式语法来删除所有 `document_id` 等于指定值的 chunk：

```python
filter=f'document_id == "{safe_id}"'
```

Milvus 的 filter 表达式和 Python 的 `==` 语法类似，但字符串值需要双引号包裹。

### 防注入

如果 `document_id` 本身包含双引号，直接拼接到 filter 表达式中会破坏语法：

```
document_id = 'abc"def'
  -> filter = 'document_id == "abc"def"'      语法错误
  -> 转义后：filter = 'document_id == "abc\"def"'  正确
```

---

## 五、`upsert_chunks()`：批量写入

```python
# backend/core/knowledge_base.py 第 231~260 行
def upsert_chunks(self, chunks: list) -> int:
    """
    批量写入文档块（Upsert：primary key 存在则更新，不存在则插入）。
    """
    if not chunks:
        return 0

    data = [
        {
            "id":               c.id,
            "embedding":        c.embedding,
            "sparse_embedding": c.sparse_embedding,
            "content":          c.content[:4096],        # 截断到 4096 字符
            "chunk_index":      c.chunk_index,
            "document_id":      c.document_id,
            "course_id":        c.course_id,
            "tenant_id":        c.tenant_id,
            "source_name":      c.source_name,
            "chunk_type":       c.chunk_type,
            "version":          c.version,
            "updated_at":       c.updated_at,
        }
        for c in chunks
    ]

    self._client.upsert(collection_name=COLLECTION_NAME, data=data)
    logger.info("knowledge_base.chunks_upserted", count=len(chunks))
    return len(chunks)
```

### 逐行精读

| 行号 | 代码 | 说明 |
|------|------|------|
| 126~131 | 函数签名 | 输入 `list[DocumentChunk]`，返回写入数量 |
| 133~149 | `data = [...]` | 列表推导式，将 `DocumentChunk` 对象转为字典列表 |
| 138 | `"content": c.content[:4096]` | **字段截断**：Milvus 对 VARCHAR 字段有长度限制，截断到 4096 字符避免写入失败 |
| 151 | `self._client.upsert(collection_name=COLLECTION_NAME, data=data)` | **批量写入**：一次网络请求写入所有 chunk，网络开销从 O(N) 降为 O(1) |
| 152 | `logger.info(...)` | 记录日志 |
| 153 | `return len(chunks)` | 返回写入的 chunk 数量 |

### DocumentChunk 到字典的字段映射

`DocumentChunk` 对象的字段直接映射为字典的 key，与 Milvus 集合的 Schema **一一对应**：

| 字典 key | 类型 | Milvus 字段类型 | 说明 |
|---------|------|----------------|------|
| `id` | str | VARCHAR | 主键，MD5 唯一 ID |
| `embedding` | list[float] | FLOAT_VECTOR(1024) | Dense 向量 |
| `sparse_embedding` | dict | SPARSE_FLOAT_VECTOR | Sparse 向量 |
| `content` | str | VARCHAR(4096) | chunk 文本 |
| `chunk_index` | int | INT64 | 文档内顺序 |
| `document_id` | str | VARCHAR | 所属文档 |
| `course_id` | str | VARCHAR | 所属课程 |
| `tenant_id` | str | VARCHAR | 多租户隔离 |
| `source_name` | str | VARCHAR | 来源标注 |
| `chunk_type` | str | VARCHAR | text / code / table |
| `version` | str | VARCHAR | 版本号 |
| `updated_at` | int | INT64 | 时间戳 |

---

## 六、数据流全景

```
文件系统                   内存                         Milvus
  |                        |                            |
  |  Step 1 加载           |                            |
  +-> load_document()      |                            |
  |                        |  list[Document]             |
  |  Step 2 分块           |                            |
  |    split_documents()   |                            |
  |                        |  list[Document] (chunks)    |
  |  Step 2.5 Contextual   |                            |
  |    add_context()       |                            |
  |                        |  (chunks 被就地修改)        |
  |  Step 3 嵌入           |                            |
  |    embed_chunks()      |                            |
  |                        |  list[DocumentChunk]        |
  |  Step 4 写入           |   +----------------------+ |
  |    write_to_milvus() ------+ 1. 删旧版 (filter)    | |
  |                        |   | 2. upsert 新版         | |
  |                        |   +----------------------+ |
  |                        |                            |
  |  完成！                |                            |
```

---

## 七、依赖关系

```
write_to_milvus(doc_chunks)
  +-- KnowledgeBaseClient()                    -- Milvus 客户端
  |     +-- delete_document_chunks(id)         -- 按 document_id 删除旧 chunk
  |     |     +-- _client.delete(filter=...)   -- Milvus filter 删除
  |     |     +-- document_id.replace('"', '\\"') -- 防注入转义
  |     +-- upsert_chunks(chunks)              -- 批量写入新 chunk
  |           +-- _client.upsert(data=...)     -- Milvus upsert 操作
  |           +-- content[:4096]               -- 字段截断
```

**外部依赖**：
- `backend.core.knowledge_base.KnowledgeBaseClient` — Milvus 操作客户端
- `pymilvus`（底层 Milvus SDK）— 通过 `KnowledgeBaseClient` 间接依赖

---

## 八、`★ Insight ───` 设计亮点

### 8.1 先删后插

保证文档更新时 Milvus 不残留旧数据。这是幂等重建的核心——同一文档多次建库，Milvus 里始终只有最新版本。

### 8.2 防注入

`document_id.replace('"', '\\"')` 转义 filter 表达式中的双引号，防止恶意构造的 `document_id` 破坏 filter 语法。

### 8.3 字段截断

`content[:4096]` 防止超长文本写入 VARCHAR 字段时失败。

### 8.4 批量写入

一次 `_client.upsert()` 写入所有 chunk，网络开销 O(1)。

### 8.5 空检查

```python
if not doc_chunks:
    return
```

空列表直接跳过，不执行任何 Milvus 操作，避免空 upsert 导致不必要的网络请求。

---

## 九、边界情况与异常处理

| 场景 | 表现 | 处理 |
|------|------|------|
| 空 chunk 列表 | `write_to_milvus` 直接 `return` | 第 286~288 行保护，跳过空写入 |
| 无 document_id 匹配的旧数据 | `delete_document_chunks` 的 filter 无命中 | 不删除任何数据，幂等安全 |
| Milvus 不可用 | `upsert_chunks` 抛连接异常 | 异常上抛，`build_pipeline` 失败，需重试整个流水线 |
| 部分 chunk 写入失败 | 批量 upsert 全量失败 | 先删后插的时序：旧版本已删除，新数据未完全写入 → 数据丢失，需重跑 |
| content 超 4096 字符 | `content[:4096]` 截断 | 第 211~212 行截断，超长部分丢失，但不会报错 |
| 重复写入同一 document_id | 先删后插，幂等安全 | 旧版本全部删除，新版本 upsert |
| 并发写入冲突 | 无事务保护 | 高并发场景下可能出现短暂数据不一致，建议串行化调用 |

---

## 十、完整流水线一览

至此，`build_knowledge_base.py` 的完整 5 步流水线全部覆盖：

| 步骤 | 函数 | 输入 -> 输出 | 课件 |
|------|------|-------------|------|
| Step 1 | `load_document` | 文件 -> `list[Document]` | 5.2 |
| Step 2 | `split_documents` | `list[Document]` -> `list[Document]`（chunks） | 5.3 |
| Step 2.5 | `add_context` | `list[Document]` -> `list[Document]`（增强后） | 5.4 |
| Step 3 | `embed_chunks` | `list[Document]` -> `list[DocumentChunk]` | 5.4 |
| Step 4 | `write_to_milvus` | `list[DocumentChunk]` -> Milvus 写入 | 5.5 |