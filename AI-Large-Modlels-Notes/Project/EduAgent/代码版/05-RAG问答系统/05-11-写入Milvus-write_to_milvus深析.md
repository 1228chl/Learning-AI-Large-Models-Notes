# 写入 Milvus：`write_to_milvus` 深度解析

> 源文件：`scripts/build_knowledge_base.py` 第 345~365 行
> 配套：`backend/core/knowledge_base.py` 第 231~274 行（`KnowledgeBaseClient` 的 `upsert_chunks` / `delete_document_chunks`）
> 对应课件：5.5 写入 Milvus

## 一、函数定位

`write_to_milvus` 是整个知识库构建流水线的**最后一站**——把嵌好向量的 `DocumentChunk` 列表写入 Milvus 向量库。

在 `build_pipeline()` 中的位置：

```python
# Step 4：写入
print("\n💾 Step 4/4  写入 Milvus…")
write_to_milvus(doc_chunks)           # ← 最后一站

print(f"\n🎉 完成！共处理 {len(doc_chunks)} 个 chunk")
```

---

## 二、`write_to_milvus`（第 347~365 行）

```python
def write_to_milvus(doc_chunks: list[DocumentChunk]) -> None:
    """
    将 embed_chunks() 产出的 DocumentChunk 列表写入 Milvus。

    先按 document_id 删除同文档旧版本 chunk，再批量 upsert，
    保证文档更新时不残留旧数据。
    """
    if not doc_chunks:
        print("  ⚠️  无 chunk 可写入，跳过")
        return

    kb          = KnowledgeBaseClient()
    document_id = doc_chunks[0].document_id

    print(f"  🗑️  删除旧版本 chunk（document_id={document_id[:8]}…）")
    kb.delete_document_chunks(document_id)    # ① 先删旧版

    written = kb.upsert_chunks(doc_chunks)    # ② 再插新版
    print(f"  ✅ 写入完成：{written} 个 chunk → knowledge_domain")
```

### 2.1 三步逻辑

| 步骤 | 代码 | 作用 |
|------|------|------|
| ① 空检查 | `if not doc_chunks: return` | 防御性编程，空列表不执行任何操作 |
| ② 删旧版 | `kb.delete_document_chunks(document_id)` | 删除同一文档的旧版本 chunk |
| ③ 插新版 | `kb.upsert_chunks(doc_chunks)` | 批量写入新版本 chunk |

### 2.2 `★` 为什么不是直接 upsert？

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
| `a` | 更新 | ✅ 正确 |
| `b` | 更新 | ✅ 正确 |
| `d` | 插入 | ✅ 正确 |
| `e` | 插入 | ✅ 正确 |
| `c` | 无操作 | ❌ **残留！**旧文档删掉的 chunk 还在 Milvus 里 |

**先删后插**保证：文档更新后，Milvus 里只有新版本的 chunk，旧版本全部清除。

---

## 三、`delete_document_chunks`：删除旧版本（第 264~274 行）

```python
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

### 3.1 Filter 表达式

`document_id` 是 `DocumentChunk` 中的一个字段，**不是 Milvus 主键**。所以这里用 Milvus 的 filter 表达式语法来删除所有 `document_id` 等于指定值的 chunk。

```python
filter=f'document_id == "{safe_id}"'
```

Milvus 的 filter 表达式和 Python 的 `==` 语法类似，但字符串值需要双引号包裹。

### 3.2 防注入

```python
safe_id = document_id.replace('"', '\\"')
```

如果 `document_id` 本身包含双引号，直接拼接到 filter 表达式中会破坏语法。例如：

```
document_id = 'abc"def'
→ filter = 'document_id == "abc"def"'      ← 语法错误
→ 转义后：filter = 'document_id == "abc\"def"'  ← 正确
```

---

## 四、`upsert_chunks`：批量写入（第 231~260 行）

```python
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

### 4.1 DocumentChunk → 字典的字段映射

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

### 4.2 `content[:4096]` 截断

Milvus 对 VARCHAR 字段有长度限制（通常 65535 字节，但实际场景建议 4096）。截断到 4096 字符避免写入失败。

### 4.3 批量写入的高效性

`_client.upsert()` 接受一个列表，一次网络请求写入所有 chunk，而不是每个 chunk 发一次请求。网络开销从 O(N) 降为 O(1)。

---

## 五、数据流全景

```
文件系统                   内存                         Milvus
  │                        │                            │
  │  Step 1 加载           │                            │
  ├─→ load_document()      │                            │
  │                        │  list[Document]             │
  │  Step 2 分块           │                            │
  │    split_documents()   │                            │
  │                        │  list[Document] (chunks)    │
  │  Step 2.5 Contextual   │                            │
  │    add_context()       │                            │
  │                        │  (chunks 被就地修改)        │
  │  Step 3 嵌入           │                            │
  │    embed_chunks()      │                            │
  │                        │  list[DocumentChunk]        │
  │  Step 4 写入           │   ┌──────────────────────┐ │
  │    write_to_milvus() ──────→│ ① 删旧版 (filter)    │ │
  │                        │   │ ② upsert 新版         │ │
  │                        │   └──────────────────────┘ │
  │                        │                            │
  │  🎉 完成！             │                            │
```

---

## 六、`★` 设计亮点总结

### 6.1 先删后插

保证文档更新时 Milvus 不残留旧数据。这是幂等重建的核心——同一文档多次建库，Milvus 里始终只有最新版本。

### 6.2 防注入

`document_id.replace('"', '\\"')` 转义 filter 表达式中的双引号，防止恶意构造的 `document_id` 破坏 filter 语法。

### 6.3 字段截断

`content[:4096]` 防止超长文本写入 VARCHAR 字段时失败。

### 6.4 批量写入

一次 `_client.upsert()` 写入所有 chunk，网络开销 O(1)。

### 6.5 空检查

```python
if not doc_chunks: return
```

空列表直接跳过，不执行任何 Milvus 操作。避免空 upsert 导致不必要的网络请求。

---

## 七、完整流水线一览

至此，`build_knowledge_base.py` 的完整 5 步流水线全部覆盖：

| 步骤 | 函数 | 输入 → 输出 | 课件 |
|------|------|------------|------|
| Step 1 | `load_document` | 文件 → `list[Document]` | 5.2 |
| Step 2 | `split_documents` | `list[Document]` → `list[Document]`（chunks） | 5.3 |
| Step 2.5 | `add_context` | `list[Document]` → `list[Document]`（增强后） | 5.4 |
| Step 3 | `embed_chunks` | `list[Document]` → `list[DocumentChunk]` | 5.4 |
| Step 4 | `write_to_milvus` | `list[DocumentChunk]` → Milvus 写入 | 5.5 |