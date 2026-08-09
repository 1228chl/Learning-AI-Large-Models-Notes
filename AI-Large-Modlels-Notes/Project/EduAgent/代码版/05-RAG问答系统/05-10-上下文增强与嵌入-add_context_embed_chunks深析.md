# 上下文增强与嵌入：`add_context` / `embed_chunks` 深度解析

> 源文件：`scripts/build_knowledge_base.py`
> 对应课件：5.4 ~ 5.5 Contextual RAG 与嵌入

---

## 全文行号速查表

| 行号范围 | 标识符 | 类型 | 一句话说明 |
|----------|--------|------|-----------|
| 24 | `BATCH_SIZE` | 常量 | BGE-M3 批量推理大小（12） |
| 26~27 | `MAX_CONTEXT_CONCURRENCY` | 常量 | Contextual 上下文生成最大并发数（5） |
| 28~39 | `CONTEXTUAL_CHUNK_PROMPT` | 常量 | LLM 提示词模板，用于生成 chunk 定位描述 |
| 200~261 | `embed_chunks()` | 函数 | BGE-M3 双向量嵌入，构建 DocumentChunk 对象 |
| 266~299 | `generate_chunk_context()` | 异步函数 | 单 chunk 上下文生成（限流并发） |
| 302~342 | `add_context()` | 异步函数 | Contextual RAG 全文档并发增强 |

---

## 一、函数签名速览

```python
# build_knowledge_base.py 第 200~206 行
def embed_chunks(
    chunks: list[Document],
    course_id: str,
    document_id: str,
    tenant_id: str = "tenant_default",
    version: str = "1.0",
) -> list[DocumentChunk]:

# build_knowledge_base.py 第 266~271 行
async def generate_chunk_context(
    llm,
    document_text: str,
    chunk_content: str,
    semaphore: asyncio.Semaphore,
) -> str:

# build_knowledge_base.py 第 302~306 行
async def add_context(
    chunks: list[Document],
    docs: list[Document],
    concurrency: int = MAX_CONTEXT_CONCURRENCY,
) -> list[Document]:
```

---

## 二、设计动机

**Step 2.5 和 Step 3 是前后串联的流水线关系**，通过 `chunks` 变量串联：

```python
# build_knowledge_base.py 第 408~424 行
# Step 2：分块
chunks = split_documents(docs, file_path)

# Step 2.5：Contextual RAG（可选）
if use_context and chunks:
    chunks = await add_context(chunks, docs)    # ← 先增强

# Step 3：嵌入
doc_chunks = embed_chunks(chunks, ...)          # ← 再嵌入
```

**核心思路**：先用 LLM 给每个 chunk 写一句"定位描述"，拼在 chunk 前面，再一起做嵌入。这样向量同时编码了"内容"和"位置"两层信息，检索准确率显著提升。

**Contextual RAG 与普通 RAG 的对比**：

```
普通 RAG：  chunk → 嵌入 → 向量（只编码"内容"）
Contextual：chunk → LLM 增强 → 增强后嵌入 → 向量（编码"位置+内容"）
```

---

## 三、常量定义（第 24~27 行、第 28~39 行）

```python
# build_knowledge_base.py 第 24~27 行
BATCH_SIZE = 12                 # BGE-M3 批量推理大小（12 = 速度与显存的经验平衡点）
MAX_CONTEXT_CONCURRENCY = 5     # Contextual 上下文生成的最大并发 LLM 请求数
```

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

### 逐行精读

#### 常量（第 24~27 行）

| 行号 | 代码 | 说明 |
|------|------|------|
| 24 | `BATCH_SIZE = 12` | BGE-M3 批量推理大小。12 条一批是经验平衡点：单条推理 GPU 利用率低，太大可能 OOM |
| 26 | `MAX_CONTEXT_CONCURRENCY = 5` | 最多 5 个 LLM 请求同时进行，防止触发 API rate limit |

#### `CONTEXTUAL_CHUNK_PROMPT`（第 28~39 行）

| 行号 | 代码 | 说明 |
|------|------|------|
| 28~36 | `CONTEXTUAL_CHUNK_PROMPT = """\..."""` | 提示词模板，用 `<document>` 和 `<chunk>` XML 标签明确区分"全文"和"待定位的 chunk"，降低 LLM 混淆 |
| 38 | `请用一句简洁的中文` | 限制输出长度，避免上下文喧宾夺主 |
| 39 | `只输出这一句描述，不要加任何前缀或标签` | 防止 LLM 输出多余的解释或标签，保证输出格式干净 |

**为什么需要 Contextual RAG？** 普通 RAG 只对 chunk 文本做嵌入，向量只知道"这段写了什么"，不知道"这段在文档的哪个位置"。例如一个 chunk 内容是 `"核心作用是控制反转"`：

| 场景 | 可能的位置 | 用户搜索"Spring"时 |
|------|-----------|------------------|
| 无 Contextual RAG | 不知道 | 可能匹配到，也可能因为向量相似度不够而漏掉 |
| 有 Contextual RAG | `"本节介绍 Spring IOC 容器的核心作用，位于第三章 Spring 框架基础部分"` | 明显包含"Spring"，匹配度更高 |

---

## 四、`embed_chunks()`：BGE-M3 嵌入（第 200~261 行）

```python
# build_knowledge_base.py 第 200~261 行
def embed_chunks(
    chunks: list[Document],
    course_id: str,
    document_id: str,
    tenant_id: str = "tenant_default",
    version: str = "1.0",
) -> list[DocumentChunk]:
    """
    对 split_documents() 产出的 chunk 列表做 BGE-M3 嵌入，返回 DocumentChunk 列表。

    BGE-M3 推理为 CPU / GPU-bound，按 BATCH_SIZE 批量处理：
    - 减少模型推理次数（每次推理有固定启动开销）
    - 控制显存/内存峰值（整批一次性推理会爆显存）
    """
    embedder = BGEMEmbedder.get_instance()   # 单例，首次调用加载模型
    all_doc_chunks: list[DocumentChunk] = []

    total = len(chunks)
    for batch_start in range(0, total, BATCH_SIZE):
        batch = chunks[batch_start: batch_start + BATCH_SIZE]
        texts = [c.page_content for c in batch]

        dense_vecs, sparse_vecs = embedder.encode(texts, batch_size=BATCH_SIZE)

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

        done = min(batch_start + BATCH_SIZE, total)
        print(f"  嵌入进度：{done}/{total}")

    print(f"  嵌入完成：{len(all_doc_chunks)} 个 DocumentChunk")
    return all_doc_chunks
```

### 逐行精读

| 行号 | 代码 | 说明 |
|------|------|------|
| 200~206 | 函数签名 | 输入 `list[Document]`（Step 2 或 Step 2.5 的输出），输出 `list[DocumentChunk]`（带向量，可直接写 Milvus） |
| 224 | `embedder = BGEMEmbedder.get_instance()` | **单例模式**：模型加载约需几秒，全局只加载一次，后续调用零开销 |
| 227~228 | `for batch_start in range(0, total, BATCH_SIZE):` | 按 `BATCH_SIZE=12` 分批处理，避免 OOM |
| 231~232 | `batch = chunks[...]; texts = [...]` | 每次取 12 条 chunk，提取文本列表 |
| 237 | `dense_vecs, sparse_vecs = embedder.encode(texts, batch_size=BATCH_SIZE)` | BGE-M3 批量推理，同时产出两种向量 |
| 239~255 | 组装 DocumentChunk | 遍历批次，构建 Milvus Schema 对应的结构体 |
| 239 | `for i, (chunk, dense, sparse) in enumerate(zip(batch, dense_vecs, sparse_vecs)):` | 同时遍历 chunk 和对应的稠密/稀疏向量 |
| 240 | `global_index = batch_start + i` | 在整个文档中的顺序编号 |
| 243~255 | `DocumentChunk(...)` | 字段与 Milvus Schema 一一对应 |
| 244 | `id=generate_chunk_id(...)` | MD5 生成幂等 ID（内容不变 → ID 不变） |
| 246 | `embedding=dense.tolist() if hasattr(dense, 'tolist') else dense` | 兼容 numpy array 和 Python list 两种返回类型 |
| 247 | `sparse_embedding=sparse` | `{token_id: weight}` 字典，Milvus 的 SPARSE_FLOAT_VECTOR 格式 |
| 257~258 | `print(f"  嵌入进度：{done}/{total}")` | 每批结束后打印进度 |
| 260~261 | 完成并返回 | 返回 `list[DocumentChunk]`，直接可写入 Milvus |

### BATCH_SIZE 的选择

`BATCH_SIZE=12` 是经验平衡点：

| 批大小 | 问题 |
|------|------|
| 1（单条） | GPU 利用率低，推理次数多，总时间长 |
| 12（当前） | 速度和显存的平衡 |
| 64 或更大 | 可能 OOM 爆显存 |

### 双向量输出

BGE-M3 同时产出两种向量：

| 向量 | 类型 | 维度 | 用途 |
|------|------|------|------|
| `dense_vecs` | numpy array | `(batch_size, 1024)` | 稠密语义匹配 |
| `sparse_vecs` | list[dict] | `{token_id: weight}` | 关键词精确匹配 |

Milvus 的 Hybrid 检索同时使用两种向量做召回，取长补短。

### 幂等 ID 生成

`generate_chunk_id` 的逻辑：

```python
def generate_chunk_id(content: str, document_id: str, chunk_index: int) -> str:
    raw = f"{document_id}_{chunk_index}_{content[:50]}"
    return hashlib.md5(raw.encode()).hexdigest()
```

| 方案 | 特点 | 问题 |
|------|------|------|
| UUID | 每次生成不同 | 同一文档重新建库 → 所有 chunk ID 都变了 → Milvus 里旧数据残留 |
| **MD5（本项目）** | 内容不变 → ID 不变 | 幂等重建：重新建库时 ID 相同，upsert 覆盖旧数据 |

`content[:50]` 取内容前 50 字符参与散列，确保内容不同的 chunk 生成不同 ID。

---

## 五、`generate_chunk_context()`：单条上下文生成（第 266~299 行）

```python
# build_knowledge_base.py 第 266~299 行
async def generate_chunk_context(
    llm,
    document_text: str,
    chunk_content: str,
    semaphore: asyncio.Semaphore,
) -> str:
    """用 LLM 为单个 chunk 生成一句定位描述。失败时返回空字符串（降级处理）。"""
    async with semaphore:
        try:
            from langchain_core.messages import HumanMessage
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

### 逐行精读

| 行号 | 代码 | 说明 |
|------|------|------|
| 266~271 | 函数签名 | `async` 异步函数，需要 `Semaphore` 进行并发限流 |
| 283 | `async with semaphore:` | **并发限流**：最多 `MAX_CONTEXT_CONCURRENCY=5` 个 LLM 请求同时进行 |
| 284 | `try:` | 异常捕获，保证单步失败不中断整个流水线 |
| 286~289 | 格式化提示词 + 调用 LLM | 将全文和 chunk 填入模板，调用 `llm.ainvoke()` |
| 291~295 | 兼容两种 LLM 响应格式 | `resp.text` vs `resp.content` |
| 296 | `return ctx` | 成功返回定位描述字符串 |
| 297~298 | `except Exception as e: return ""` | **失败降级**：任何异常都不抛，返回空字符串，调用方保留原始 chunk 文本 |

### 响应格式兼容

```python
resp.text if hasattr(resp, "text") and not callable(resp.text) else str(resp.content)
```

不同 LLM 提供商的返回格式不同：

| 格式 | 示例 | 适用场景 |
|------|------|---------|
| `resp.text` | `"本节介绍..."` | 某些直接返回文本的 LLM |
| `resp.content` | `"本节介绍..."` | LangChain 标准消息格式 |

---

## 六、`add_context()`：并发编排（第 302~342 行）

```python
# build_knowledge_base.py 第 302~342 行
async def add_context(
    chunks: list[Document],
    docs: list[Document],
    concurrency: int = MAX_CONTEXT_CONCURRENCY,
) -> list[Document]:
    """
    Contextual RAG：并发为所有 chunk 生成上下文描述，拼接到 chunk 文本前方。

    拼接后格式：
        "<上下文描述一句话>\\n\\n<原始 chunk 文本>"

    拼接后再做嵌入（embed_chunks），向量同时编码"在哪里"和"说了什么"两层信息。
    """
    full_doc_text = "\n\n".join(d.page_content for d in docs)[:8000]

    llm       = get_llm("qa", temperature=0)
    semaphore = asyncio.Semaphore(concurrency)

    contexts = await asyncio.gather(*[
        generate_chunk_context(llm, full_doc_text, c.page_content, semaphore)
        for c in chunks
    ])

    enriched = 0
    for chunk, ctx in zip(chunks, contexts):
        if ctx:
            chunk.page_content = f"{ctx}\n\n{chunk.page_content}"
            enriched += 1

    print(f"  上下文增强完成：{enriched}/{len(chunks)} 个 chunk 已添加描述")
    return chunks
```

### 逐行精读

| 行号 | 代码 | 说明 |
|------|------|------|
| 302~306 | 函数签名 | `async` 异步函数，输入 Step 2 的 chunks 和 Step 1 的原始 docs，输出就地修改后的 chunks |
| 324 | `full_doc_text = "...".join(...)[:8000]` | **全文截断**：拼接所有原始文档，截断到 8000 字符。LLM 不需要看完整篇文档，看前 8000 字就能理解大致结构和主题 |
| 326 | `llm = get_llm("qa", temperature=0)` | **确定性输出**：`temperature=0` 让 LLM 每次都输出最可能的答案，同一 chunk 多次生成结果一致 |
| 327 | `semaphore = asyncio.Semaphore(concurrency)` | 创建并发限流信号量 |
| 330~333 | `contexts = await asyncio.gather(*[...])` | **并发调用**：为每个 chunk 启动一个 `generate_chunk_context` 协程，`asyncio.gather` 并行执行 |
| 336~339 | 就地修改 | 遍历 chunk 和上下文，有上下文则拼接到 chunk 文本前方 |
| 338 | `chunk.page_content = f"{ctx}\n\n{chunk.page_content}"` | **就地修改**：直接在原 chunk 前面拼接上下文，不创建新对象。后续 `embed_chunks` 读取 `page_content` 时拿到的已经是增强后的文本 |
| 341 | 打印完成信息 | 统计成功增强的 chunk 数量 |
| 342 | `return chunks` | 返回同一切片引用（就地修改，返回仅为方便链式调用） |

### 拼接后格式

```
本节介绍 Spring IOC 容器的核心作用，位于第三章 Spring 框架基础部分。

核心作用是控制反转，将对象的创建交给容器管理。
```

---

## 七、依赖关系

```
embed_chunks(chunks, course_id, document_id, ...)
  ├─ BGEMEmbedder.get_instance()           ← 单例嵌入器
  ├─ generate_chunk_id()                    ← MD5 幂等 ID
  └─ DocumentChunk()                        ← 数据模型

generate_chunk_context(llm, document_text, chunk_content, semaphore)
  ├─ CONTEXTUAL_CHUNK_PROMPT.format()       ← 提示词模板
  ├─ llm.ainvoke()                          ← DeepSeek LLM 异步调用
  └─ asyncio.Semaphore                      ← 并发限流

add_context(chunks, docs, concurrency)
  ├─ get_llm("qa", temperature=0)           ← LLM 工厂
  ├─ asyncio.Semaphore                       ← 并发限流
  ├─ asyncio.gather()                        ← 并发编排
  └─ generate_chunk_context()               ← 单条上下文生成
```

**外部依赖**：
- `backend.core.knowledge_base.BGEMEmbedder` — BGE-M3 嵌入器单例
- `backend.core.knowledge_base.DocumentChunk` — 文档块数据模型
- `backend.core.knowledge_base.generate_chunk_id` — MD5 ID 生成
- `backend.core.llm_factory.get_llm` — LLM 工厂方法

---

## 八、`★ Insight ───` 设计亮点

### 8.1 Contextual RAG 的"增强后嵌入"模式

普通 RAG 直接对 chunk 文本做嵌入，向量只知道"内容"不知道"位置"。Contextual RAG 先用 LLM 生成一句定位描述拼在 chunk 前面，再一起嵌入，向量同时携带"在哪里"和"说了什么"两层信息，检索准确率显著提升。

### 8.2 并发限流 + 失败降级

`Semaphore(5)` 控制并发，`except: return ""` 降级处理。保证 100 个 chunk 的文档不会因为 LLM 限流而失败，单个 chunk 生成失败也不影响其他 chunk。

### 8.3 批量嵌入 + 双向量

`BATCH_SIZE=12` 平衡 GPU 速度和显存，dense + sparse 双向量支持 Hybrid 检索。

### 8.4 幂等 ID

MD5(document_id + chunk_index + content[:50]) 确保同一文档重建时 ID 不变，upsert 覆盖旧数据，不残留。

### 8.5 三种降级策略对比

| 函数 | 降级策略 | 失败后 |
|------|---------|--------|
| `generate_chunk_context` | `return ""` | 保留原始 chunk 文本 |
| `embed_chunks` | 无降级（同步阻塞） | 整个 pipeline 失败 |
| `write_to_milvus` | 无降级（数据库写入） | 整个 pipeline 失败 |