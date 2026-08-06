# 上下文增强与嵌入：`add_context` / `embed_chunks` 深度解析

> 源文件：`scripts/build_knowledge_base.py` 第 28~39 行（提示词）、第 264~342 行（Contextual RAG）、第 198~261 行（嵌入）
> 对应课件：5.4 ~ 5.5 Contextual RAG 与嵌入

## 一、函数定位

Step 2.5 和 Step 3 在流水线中是先后关系，通过 `chunks` 变量串联：

```python
# Step 2：分块
chunks = split_documents(docs, file_path)

# Step 2.5：Contextual RAG（可选）
if use_context and chunks:
    chunks = await add_context(chunks, docs)    # ← 先增强

# Step 3：嵌入
doc_chunks = embed_chunks(chunks, ...)          # ← 再嵌入
```

**核心思路**：先用 LLM 给每个 chunk 写一句"定位描述"，拼在 chunk 前面，再一起做嵌入。这样向量同时编码了"内容"和"位置"两层信息，检索准确率显著提升。

---

## 二、Contextual RAG 提示词（第 28~39 行）

```python
CONTEXTUAL_CHUNK_PROMPT = """\
<document>
{document_text}
</document>

以下是需要在整个文档中定位的 chunk：
<chunk>
{chunk_content}
</chunk>

请用一句简洁的中文，描述这段内容在整个文档中的位置和作用，
以便改善检索效果。只输出这一句描述，不要加任何前缀或标签。"""
```

### 2.1 为什么需要 Contextual RAG？

普通 RAG 只对 chunk 文本做嵌入，向量只知道"这段写了什么"，不知道"这段在文档的哪个位置"。

**示例**——一个 chunk 内容是 `"核心作用是控制反转"`：

| 场景 | 可能的位置 | 用户搜索"Spring"时 |
|------|-----------|------------------|
| 无 Contextual RAG | 不知道 | 可能匹配到，也可能因为向量相似度不够而漏掉 |
| 有 Contextual RAG | `"本节介绍 Spring IOC 容器的核心作用，位于第三章 Spring 框架基础部分"` | 明显包含"Spring"，匹配度更高 |

### 2.2 提示词设计要点

| 设计 | 说明 |
|------|------|
| `<document>` / `<chunk>` XML 标签 | 明确区分"全文"和"待定位的 chunk"，降低 LLM 混淆 |
| **一句简洁的中文** | 限制输出长度，避免上下文喧宾夺主 |
| **只输出这一句描述** | 防止 LLM 输出多余的解释或标签 |
| 不限制内容格式 | 让 LLM 自由决定描述的角度（位置/作用/关联性） |

---

## 三、`generate_chunk_context`：单条上下文生成（第 266~299 行）

```python
async def generate_chunk_context(llm, document_text, chunk_content, semaphore):
    async with semaphore:
        try:
            prompt = CONTEXTUAL_CHUNK_PROMPT.format(
                document_text=document_text,
                chunk_content=chunk_content,
            )
            resp = await llm.ainvoke([HumanMessage(content=prompt)])
            ctx = (
                resp.text
                if hasattr(resp, "text") and not callable(resp.text)
                else str(resp.content)
            ).strip()
            return ctx
        except Exception as e:
            print(f"   [warning] 上下文生成失败，保留原始 chunk：{e}")
            return ""
```

### 3.1 并发限流

```python
async with semaphore:
```

`asyncio.Semaphore(MAX_CONTEXT_CONCURRENCY=5)` 确保最多 5 个 LLM 请求同时进行。如果不限流，100 个 chunk 同时发请求，很容易触发 API 的 rate limit。

### 3.2 兼容两种 LLM 响应格式

```python
resp.text if hasattr(resp, "text") and not callable(resp.text) else str(resp.content)
```

不同 LLM 提供商的返回格式不同：

| 格式 | 示例 | 适用场景 |
|------|------|---------|
| `resp.text` | `"本节介绍..."` | 某些直接返回文本的 LLM |
| `resp.content` | `"本节介绍..."` | LangChain 标准消息格式 |

### 3.3 失败降级

```python
except Exception as e:
    print(f"   [warning] 上下文生成失败，保留原始 chunk：{e}")
    return ""
```

**任何异常都不抛**，返回空字符串。调用方收到空字符串后保留原始 chunk 文本。**单步失败不影响整个流水线**。

---

## 四、`add_context`：并发编排（第 302~342 行）

```python
async def add_context(chunks, docs, concurrency=5):
    # 拼接全文供 LLM 参考（截断 8000 字，避免超出模型 context 长度）
    full_doc_text = "\n\n".join(d.page_content for d in docs)[:8000]

    llm = get_llm("qa", temperature=0)        # 确定性输出
    semaphore = asyncio.Semaphore(concurrency)

    # 并发调用 LLM
    contexts = await asyncio.gather(*[
        generate_chunk_context(llm, full_doc_text, c.page_content, semaphore)
        for c in chunks
    ])

    # 拼接上下文到 chunk 前面
    enriched = 0
    for chunk, ctx in zip(chunks, contexts):
        if ctx:
            chunk.page_content = f"{ctx}\n\n{chunk.page_content}"
            enriched += 1

    print(f"  上下文增强完成：{enriched}/{len(chunks)} 个 chunk 已添加描述")
    return chunks
```

### 4.1 全文截断

```python
full_doc_text = "\n\n".join(d.page_content for d in docs)[:8000]
```

`[:8000]` 截断到 8000 字符，防止文档太长超出 LLM 上下文窗口。8000 字对于定位描述来说已经足够——LLM 不需要看完整篇文档，看前 8000 字就能理解文档的大致结构和主题。

### 4.2 `temperature=0`

定位描述不需要创意，需要确定性。`temperature=0` 让 LLM 每次都输出最可能的答案，同一个 chunk 多次生成结果一致。

### 4.3 就地修改

`chunk.page_content = f"{ctx}\n\n{chunk.page_content}"`——直接在原 chunk 前面拼接上下文，不创建新对象。后续的 `embed_chunks` 读取 `page_content` 时，拿到的已经是增强后的文本。

### 4.4 拼接后格式

```
本节介绍 Spring IOC 容器的核心作用，位于第三章 Spring 框架基础部分。

核心作用是控制反转，将对象的创建交给容器管理。
```

---

## 五、`embed_chunks`：BGE-M3 嵌入（第 200~261 行）

### 5.1 函数签名

```python
def embed_chunks(
    chunks: list[Document],       # Step 2（或 Step 2.5）的输出
    course_id: str,               # 课程 UUID
    document_id: str,             # 文档 UUID（用于幂等重建）
    tenant_id: str = "tenant_default",
    version: str = "1.0",
) -> list[DocumentChunk]:         # 带向量的结构体，可直接写入 Milvus
```

### 5.2 单例嵌入器

```python
embedder = BGEMEmbedder.get_instance()
```

模型加载大约需要几秒（加载参数到 GPU/CPU 内存），**全局只加载一次**。后续调用直接复用，零开销。

### 5.3 批量嵌入

```python
for batch_start in range(0, total, BATCH_SIZE):
    batch = chunks[batch_start: batch_start + BATCH_SIZE]  # 每次 12 条
    texts = [c.page_content for c in batch]

    dense_vecs, sparse_vecs = embedder.encode(texts, batch_size=BATCH_SIZE)
```

`BATCH_SIZE=12` 是经验平衡点：

| 批大小 | 问题 |
|------|------|
| 1（单条） | GPU 利用率低，推理次数多，总时间长 |
| 12（当前） | 速度和显存的平衡 |
| 64 或更大 | 可能 OOM 爆显存 |

### 5.4 双向量输出

BGE-M3 同时产出两种向量：

| 向量 | 类型 | 维度 | 用途 |
|------|------|------|------|
| `dense_vecs` | numpy array | `(batch_size, 1024)` | 稠密语义匹配 |
| `sparse_vecs` | list[dict] | `{token_id: weight}` | 关键词精确匹配 |

Milvus 的 Hybrid 检索同时使用两种向量做召回，取长补短。

### 5.5 组装 DocumentChunk

```python
for i, (chunk, dense, sparse) in enumerate(zip(batch, dense_vecs, sparse_vecs)):
    global_index = batch_start + i
    all_doc_chunks.append(DocumentChunk(
        id=generate_chunk_id(chunk.page_content, document_id, global_index),
        content=chunk.page_content,
        embedding=dense.tolist() if hasattr(dense, 'tolist') else dense,
        sparse_embedding=sparse,
        course_id=course_id,
        document_id=document_id,
        source_name=chunk.metadata.get("source_name", ""),
        chunk_type=chunk.metadata.get("chunk_type", "text"),
        chunk_index=global_index,
        version=version,
        tenant_id=tenant_id,
    ))
```

**`dense.tolist() if hasattr(dense, 'tolist') else dense`**——兼容 numpy array 和 Python list 两种返回类型，不依赖 numpy 的具体行为。

### 5.6 幂等 ID 生成

```python
def generate_chunk_id(content: str, document_id: str, chunk_index: int) -> str:
    raw = f"{document_id}_{chunk_index}_{content[:50]}"
    return hashlib.md5(raw.encode()).hexdigest()
```

**为什么用 MD5 而不是 UUID？**

| 方案 | 特点 | 问题 |
|------|------|------|
| UUID | 每次生成不同 | 同一文档重新建库 → 所有 chunk ID 都变了 → Milvus 里旧数据残留 |
| **MD5（本项目）** | 内容不变 → ID 不变 | 幂等重建：重新建库时 ID 相同，upsert 覆盖旧数据 |

`content[:50]` 取内容前 50 字符参与散列，确保内容不同的 chunk 生成不同 ID。

---

## 六、完整数据流

```
Step 2 输出（list[Document]）：
  ┌─ chunk 1: content="IOC 容器..."
  │            metadata.source_name="Java讲义 > 第3章"
  ├─ chunk 2: content="核心作用是控制反转..."
  └─ ...

Step 2.5 add_context（并发 5 路 LLM，temperature=0）：
  每个 chunk → LLM 生成定位描述 → 拼在 chunk 前面
  ┌─ chunk 1: content="本节介绍 IOC 容器的核心作用...\n\nIOC 容器..."
  ├─ chunk 2: content="本段解释控制反转的含义...\n\n核心作用是控制反转..."
  └─ ...
                         │
                         ▼
Step 3 embed_chunks（BGE-M3，BATCH_SIZE=12）：
  ┌─ 批次 [1..12] → dense(12, 1024) + sparse(12, {token: weight})
  ├─ 批次 [13..24] → ...
  └─ ...
                         │
                         ▼
  输出（list[DocumentChunk]）：
  ┌─ DocumentChunk(
  │     id=md5, content="本节介绍...\n\nIOC 容器...",
  │     embedding=[0.123, -0.456, ...],       # 1024 维
  │     sparse_embedding={101: 0.8, 205: 0.3}, # 关键词权重
  │     source_name="Java讲义 > 第3章",
  │     chunk_index=0, ...)
  ├─ DocumentChunk(...)
  └─ ...
                         │
                         ▼
                  Step 4: 写入 Milvus
```

---

## 七、`★` 设计亮点总结

### 7.1 Contextual RAG 的"增强后嵌入"模式

```
普通 RAG：    chunk → 嵌入 → 向量（只编码"内容"）
Contextual：  chunk → LLM 增强 → 增强后嵌入 → 向量（编码"位置+内容"）
```

### 7.2 并发限流 + 失败降级

`Semaphore(5)` 控制并发，`except: return ""` 降级处理。保证 100 个 chunk 的文档不会因为 LLM 限流而失败，某个 chunk 生成失败也不影响其他 chunk。

### 7.3 批量嵌入 + 双向量

BATCH_SIZE=12 平衡 GPU 速度和显存，dense + sparse 双向量支持 Hybrid 检索。

### 7.4 幂等 ID

MD5(document_id + chunk_index + content[:50]) 确保同一文档重建时 ID 不变，upsert 覆盖旧数据，不残留。

### 7.5 三种降级策略对比

| 函数 | 降级策略 | 失败后 |
|------|---------|--------|
| `generate_chunk_context` | `return ""` | 保留原始 chunk 文本 |
| `embed_chunks` | 无降级（同步阻塞） | 整个 pipeline 失败 |
| `write_to_milvus` | 无降级（数据库写入） | 整个 pipeline 失败 |