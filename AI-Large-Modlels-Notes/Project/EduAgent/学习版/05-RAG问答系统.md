# 第五章 RAG 问答系统 — 学习版

> 本文档从原版《05-RAG问答系统.md》中提取核心知识点，按照"离线建库→检索基础设施→在线查询"三阶段编排学习顺序。

---

## 学习路线图

```
第一梯队：RAG 全景（先理解整体）
  └── ① RAG 是什么 + 12节点流程图 ← 为什么需要 RAG，整体长什么样

第二梯队：离线建库（事先做好，把知识灌进向量库）
  ├── ② 文档读取         ← PDF/Word/Markdown → Document
  ├── ③ 智能分块         ← 按标题/代码块边界切分
  ├── ④ BGE-M3 嵌入      ← 稠密+稀疏双向量
  └── ⑤ Milvus 写入      ← 建 Collection + 五步流水线

第三梯队：检索基础设施（在线查询的工具层）
  ├── ⑥ Hybrid 召回      ← 稠密+稀疏混合检索 + WeightedRanker
  ├── ⑦ Reranker 精排    ← 交叉编码器重排序 + 置信度计算
  ├── ⑧ 意图分类器       ← 5 类分类 + 条件路由
  ├── ⑨ 记忆管理         ← MemorySaver + 摘要压缩
  └── ⑩ MCP 工具         ← 知识库检索 + 联网搜索

第四梯队：在线查询（学员提问时实时发生）
  ├── ⑪~⑭ 12 节点详解    ← 分类→改写→检索→精排→生成→存记忆
  ├── ⑮ 图装配           ← 条件边 + checkpointer
  └── ⑯ HTTP 接口        ← 流式/非流式/历史
```

---

## 第一梯队：RAG 全景

---

### ① RAG 是什么，为什么需要

#### 学习目标

- RAG 解决了大模型的哪三个局限？
- RAG 的两个阶段分别是什么？
- 对比第四章，本章问答 Agent 有哪些不同？

#### 核心知识点

**RAG 解决三大局限**：幻觉（编造事实）、知识截止（不知道新内容）、不知道私有内容。

**两个阶段**：
- **离线建库**：课程文档 → 切成小块 → 每块算成向量 → 存入 Milvus
- **在线查询**：学员提问 → 问题算成向量 → 检索最相关块 → 重排 → LLM 生成回答

**对比第四章**

| 特性 | 简历 Agent | 问答 Agent |
|------|-----------|-----------|
| 流程形态 | 一条直线 | **带分支**（按意图/置信度走不同路径） |
| 分支实现 | 无 | **条件边** `add_conditional_edges` |
| 多轮记忆 | 不需要 | **需要**（挂 `MemorySaver`） |
| 节点数量 | 8 个 | 12 个 |
| 依赖模型 | 1 个 DeepSeek API | DeepSeek API + 3 个进程内本地模型 |

**7 项关键技术**：意图分类、HyDE（假设文档）、Multi-Query（多查询改写）、稠密+稀疏混合检索、重排序（Reranker）、置信度路由 + Web 兜底、多轮记忆 + 摘要压缩。

---

## 第二梯队：离线建库

---

### ② 文档读取

#### 学习目标

- LangChain Document 的两种属性？
- 三种文档格式的加载方式？
- 为什么企业优先选 Markdown？

#### 核心知识点

**Document 统一抽象**

```python
from langchain_core.documents import Document

doc = Document(
    page_content="这是文档的文本内容",   # 主体文字
    metadata={"source": "Java讲义第3章.pdf", "page": 2}  # 来源信息
)
```

**三种格式加载**：

```python
# PDF：每页一个 Document
from langchain_community.document_loaders import PyPDFLoader
loader = PyPDFLoader("Java讲义.pdf")
docs = loader.load()  # 每个 page 一个 Document

# Markdown：整个文件一个 Document
from langchain_community.document_loaders import TextLoader
docs = TextLoader("笔记.md").load()

# Word：python-docx 逐段解析
```

**企业优先选 Markdown**：`#` / `##` / `###` 标题天然划定知识边界，切分语义完整性远好于按字数切 PDF。

---

### ③ 智能分块

#### 学习目标

- `chunk` 大小推荐值？分隔符优先级？
- Markdown 的两阶段分块方案？

#### 核心知识点

**`chunk` 大小**：含代码块推荐 1000-1500 字，纯文字 600-800 字。默认 `chunk_size=1200`，`chunk_overlap=100`。

```python
from langchain_text_splitters import RecursiveCharacterTextSplitter

# PDF 分块
splitter = RecursiveCharacterTextSplitter(
    chunk_size=1200,
    chunk_overlap=100,
    separators=["\n\n", "\n", "。", "，", " ", ""]  # 优先级从高到低
)
```

**Markdown 两阶段方案**：

```python
from langchain_text_splitters import MarkdownHeaderTextSplitter

# 阶段一：按标题语义切分
header_splitter = MarkdownHeaderTextSplitter(
    headers_to_split_on=[("#", "H1"), ("##", "H2"), ("###", "H3")],
    strip_headers=False  # 保留标题在内容里
)
sections = header_splitter.split_text(md_content)

# 阶段二：超长段落二次切分
for section in sections:
    if len(section.page_content) > 1200:
        sub_chunks = markdown_splitter.split_documents([section])
        # 优先在代码块边界断开
```

---

### ④ BGE-M3 嵌入

#### 学习目标

- 稠密向量和稀疏向量的区别？两者如何互补？
- BGE-M3 的特点？`get_instance()` 单例模式？

#### 核心知识点

| 类型 | 稠密向量 | 稀疏向量 |
|------|---------|---------|
| 形式 | 1024 维浮点数组 | `{token_id: weight}` 字典 |
| 捕捉 | 语义（同义词/近义表达） | 关键词精确匹配 |
| 优势 | 找"语义相似但无关键词"的文档 | 找"关键词精确匹配"的文档 |

**两者互补**：融合（RRF）后综合排名最高。

**BGE-M3 特点**：一次推理同时输出 `dense` + `sparse`，中英双语优秀，本地推理，`max_length=8192`。

**BGEMEmbedder 单例模式**

```python
class BGEMEmbedder:
    _instance = None

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()  # 整个进程只加载一次（约5-15秒）
        return cls._instance

    def encode(self, texts: list[str], batch_size=12) -> tuple[list, list]:
        """返回 (dense_vectors, sparse_vectors)"""
        ...

    def encode_query(self, text: str) -> tuple[list, dict]:
        """单条查询编码"""
        ...
```

> **EduAgent 应用**：`get_instance()` 单例模式确保整个进程只加载一次 BGE-M3 模型（约 5-15 秒），避免重复加载浪费内存。

---

### ⑤ Milvus 写入

#### 学习目标

- Contextual RAG 是什么？
- 五步流水线是什么？
- 幂等更新如何实现？

#### 核心知识点

**单 Collection 设计**，通过 `course_id` 和 `document_id` 区分。

**Contextual RAG**：用 LLM 生成定位描述拼接到 `chunk` 前，让 `chunk` 自带上下文。

**五步流水线**

```python
for doc_path in doc_paths:
    # 1. 读取文档 → Document 列表
    docs = load_document(doc_path)
    # 2. 智能分块
    chunks = smart_split(docs)
    # 3. 上下文增强（Contextual RAG）
    chunks = [augment_with_context(chunk) for chunk in chunks]
    # 4. BGE-M3 嵌入 → dense + sparse
    dense_vecs, sparse_vecs = embedder.encode([c.page_content for c in chunks])
    # 5. 写入 Milvus（先删旧 chunk，再插入新的）
    collection.delete(f"document_id == '{doc_id}'")
    collection.insert([{"id": c.id, "vector": dense, ...} for c, dense in zip(chunks, dense_vecs)])
```

---

## 第三梯队：检索基础设施

---

### ⑥ Hybrid 召回

#### 学习目标

- 双路检索分别是什么？用什么相似度度量？
- `WeightedRanker` 的融合权重？

#### 核心知识点

```python
from pymilvus import AnnSearchRequest, WeightedRanker

# 双路检索
dense_req = AnnSearchRequest(
    data=[query_dense],
    anns_field="dense_vector",
    param={"metric_type": "IP"},           # 内积相似度
    limit=30,
)
sparse_req = AnnSearchRequest(
    data=[query_sparse],
    anns_field="sparse_vector",
    param={"metric_type": "IP"},
    limit=30,
)

# WeightedRanker 融合：dense:sparse = 0.7:0.3
results = collection.hybrid_search(
    [dense_req, sparse_req],
    rerank=WeightedRanker(0.7, 0.3),      # 语义为主，关键词为辅
    limit=30,
)
```

---

### ⑦ Reranker 精排

#### 学习目标

- Embedding 和 Reranker 的对比？
- 置信度如何计算？路由策略是什么？

#### 核心知识点

| 对比 | Embedding | Reranker |
|------|-----------|----------|
| 计算方式 | 余弦相似度/内积 | 交叉编码器（Cross-Encoder） |
| 精度 | 中等，有信息损失 | 高，充分比较 query 和 `chunk` |
| 速度 | 快，百万级毫秒返回 | 慢，每对需一次推理 |
| 使用位置 | 第一轮召回（topK=30） | 第二轮精排（topN=5） |

**置信度计算与路由**

```python
# 置信度 = sigmoid(reranker_score) → 0~1
confidence = 1 / (1 + math.exp(-reranker_score))

# 路由策略
if confidence >= 0.5:
    route = "generate_rag"       # 基于知识库回答
elif needs_web_search:
    route = "web_search"         # 联网搜索兜底
else:
    route = "generate_direct"    # LLM 直接回答
```

---

### ⑧ 意图分类器

#### 学习目标

- 5 类分类分别是什么？各自路由到哪个节点？

#### 核心知识点

| 分类 | 含义 | 路由节点 |
|------|------|---------|
| `GENERAL` | 通用对话 | `generate_general`（直接 LLM 答） |
| `GENERAL_WEB` | 需联网 | `web_search` |
| `VAGUE` | 模糊问题 | `hyde_generate`（假设文档） |
| `BROAD` | 宽泛问题 | `multi_query_rewrite`（多查询改写） |
| `PRECISE` | 精确问题 | 标准 RAG 流程 |

> **EduAgent 应用**：跨 Agent 路由（8.4）用 DeepSeek LLM（调用频率低）；QA 内部意图分类用本地 MiniLM（调用频率高）。两个场景用不同方案，是关键取舍点。

---

### ⑨ 记忆管理

#### 学习目标

- `MemoryManager` 的两个核心方法？
- 摘要压缩在什么时候触发？
- `MemorySaver` + `thread_id` 如何实现多轮记忆？

#### 核心知识点

```python
class MemoryManager:
    async def save_memory(self, thread_id: str, messages: list):
        """保存对话历史到 MemorySaver"""
        ...

    async def load_memory(self, thread_id: str) -> list:
        """加载历史消息"""
        ...

# 摘要压缩：对话超过 10 轮时触发
if len(messages) > 10:
    summary = await llm.ainvoke(compress_prompt(messages))
    # 用摘要 + 最近几轮完整对话作为上下文

# MemorySaver + thread_id
graph = builder.compile(checkpointer=MemorySaver())
config = {"configurable": {"thread_id": "student_1_session_2"}}
result = await graph.ainvoke({"messages": [msg]}, config)
```

---

### ⑩ MCP 工具

#### 学习目标

- MCP 是什么？三个文件各自做什么？

#### 核心知识点

**MCP**（Model Context Protocol）：LLM 与外部工具交互的标准化协议。

**三个文件**：
- `kb_server.py`：暴露 Milvus 检索工具
- `web_search_server.py`：暴露 Web 搜索工具
- `client.py`：统一管理 MCP 连接

---

## 第四梯队：在线查询

---

### ⑪~⑭ 12 节点详解

#### 学习目标

- 12 个节点的完整流程图？
- 意图分类条件路由怎么写？
- HyDE 和 Multi-Query 分别解决什么问题？
- 置信度路由的三种分支？

#### 核心知识点

**State（13 字段）**：请求上下文(`messages`/`question`) → 意图分类结果(`intent`) → 查询改写(`hyde_document`/`multi_queries`) → 检索结果(`retrieved_chunks`/`reranked_chunks`/`confidence`) → 生成结果(`answer`/`sources`) → 记忆(`memory_summary`)。

**意图分类条件路由**

```python
def route_by_intent(state: QAState) -> str:
    intent = state["intent"]
    return intent  # GENERAL / GENERAL_WEB / VAGUE / BROAD / PRECISE

builder.add_conditional_edges(
    "classify_query",
    route_by_intent,
    {
        "GENERAL": "generate_general",
        "GENERAL_WEB": "web_search",
        "VAGUE": "hyde_generate",
        "BROAD": "multi_query_rewrite",
        "PRECISE": "load_memory_and_embed",
    },
)
```

**HyDE（假设文档）**：对模糊问题，先让 LLM 生成一段"假设的课程讲义"，再用它去检索。模糊问题本身信息少，但"假设答案"含更丰富关键词，能召回更相关内容。

```python
# HyDE：先让 LLM 生成假设答案
hyde_prompt = f"请根据问题生成一段相关的课程讲义内容：{question}"
hyde_doc = await llm.ainvoke(hyde_prompt)
# 用假设答案去检索，而不是原问题
query_vec = embedder.encode_query(hyde_doc)
```

**Multi-Query（多查询改写）**：对宽泛问题拆成 3-5 个具体子问题，分别检索后合并结果，扩大召回覆盖。

**`load_memory_and_embed`**：并行执行两件事——加载记忆 + 向量化查询，`asyncio.gather` 同时进行。

**检索节点**：双路混合检索（稠密 + 稀疏），`WeightedRanker(0.7, 0.3)` 融合，取 topK=30。

**重排序节点**：Reranker 精排取 topN=5，`sigmoid` 计算置信度，按置信度路由。

**三条生成路径**：
- `generate_rag`（高置信）：基于知识库 `chunk` 生成，标注来源（"来源：Java 讲义>第 3 章>3.1 IOC"）
- `web_search`（低置信 + 需联网）：MCP 联网搜索作为上下文
- `generate_direct`（低置信 + 不联网）：LLM 直接回答，兜底方案

---

### ⑮ 图装配

#### 核心知识点

```python
builder = StateGraph(QAState)
# 12 个节点 + 2 个条件边
builder.add_conditional_edges("classify_query", route_by_intent, {...})
builder.add_conditional_edges("rerank", route_by_confidence, {...})
graph = builder.compile(checkpointer=MemorySaver())  # 多轮记忆
```

---

### ⑯ HTTP 接口

| 接口 | 说明 |
|------|------|
| `POST /qa/chat` | 非流式对话 |
| `POST /qa/chat/stream` | SSE 流式对话（`astream_events` 逐 token 返回） |
| `GET /qa/history` | 获取对话历史 |

---

## 附录：总览表

| 技术 | 文件 | 角色 |
|------|------|------|
| 意图分类 | `query_classifier.py` | 5 类分类路由 |
| HyDE/Multi-Query | `nodes.py` | 查询改写 |
| 混合检索 | `knowledge_base.py` | 稠密+稀疏双路召回 |
| 重排序 | `reranker.py` | 精排+置信度 |
| 记忆管理 | `memory.py` | `MemorySaver`+摘要压缩 |
| MCP 工具 | `mcp/*.py` | 标准化工具调用 |
| 图装配 | `graph.py` | 条件边+`checkpointer` |

---

> **学习建议**：RAG 是本章最核心的概念。先理解"离线建库"和"在线查询"两个阶段（①），再看建库细节（②~⑤），然后理解检索基础设施（⑥~⑩），最后完整的 12 节点图（⑪~⑯）。重点理解"条件边分支"和"置信度路由"——这是第四章直线图到本章分支图的跃迁。