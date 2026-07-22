# 第5章 RAG 问答系统

## 5.1 RAG全景

**RAG解决了大模型三个局限**：幻觉（编造事实）、知识截止（不知道新内容）、不知道私有内容。

**两个阶段**：离线建库（文档→分块→嵌入→存Milvus）+ 在线查询（提问→检索→重排→生成）。

**12节点图**：不是直线，有**条件边分支+checkpointer记忆**。核心流程：意图分类→（按类型走不同路径）→检索→（按置信度路由）→生成→存记忆。

**7项关键技术**：意图分类、HyDE、Multi-Query、混合检索、重排序、置信度路由+Web兜底、多轮记忆+摘要压缩。

## 5.2 文档读取

**Document统一抽象**：`page_content`（文本内容）+ `metadata`（来源信息）。
**PDF加载**：`PyPDFLoader`，每页一个Document，只提取文字层。
**Markdown加载**：`TextLoader`，整个文件一个Document。
**企业优先选Markdown**：`#`/`##`/`###`标题天然划定知识边界，切分语义完整性远好于按字数切PDF。

## 5.3 智能分块

**chunk大小**：含代码块推荐1000-1500字，纯文字600-800字。默认chunk_size=1200，chunk_overlap=100。

**PDF分块**：`RecursiveCharacterTextSplitter`，分隔符优先级：`\n\n`→`\n`→`。`→`，`→`空格→字符。

**Markdown两阶段方案**：
1. **按标题语义切分**：`MarkdownHeaderTextSplitter`，`strip_headers=False`保留标题在内容里，metadata继承H1/H2/H3
2. **超长段落二次切分**：`MarkdownTextSplitter`，优先在代码块边界断开

## 5.4 BGE-M3嵌入

**稠密向量**：固定长度浮点数组（1024维），捕捉语义，对同义词/近义表达敏感。
**稀疏向量**：`{token_id: weight}`字典，精确匹配关键词，对API名/专有名词命中率高。
**两者互补**：稠密找"语义相似但无关键词"的文档，稀疏找"关键词精确匹配"的文档，融合（RRF）后综合排名最高。

**BGE-M3特点**：一次推理同时输出dense+sparse，中英双语优秀，本地推理，max_length=8192。

**BGEMEmbedder单例模式**：类变量`_instance`持有，`get_instance()`创建或复用，整个进程只加载一次（约5-15秒）。
- `encode(texts, batch_size=12)`：批量编码，建库时用
- `encode_query(text)`：单条查询编码，查询时用

## 5.5 Milvus初始化与知识库写入

**单Collection设计**，通过course_id和document_id区分。Schema字段与DocumentChunk一一对应。
**Contextual RAG**：用LLM生成定位描述拼接到chunk前，让chunk自带上下文。
**五步流水线**：读取文档→智能分块→上下文增强→BGE-M3嵌入→写入Milvus。
**幂等更新**：先按document_id删除旧chunk，再插入新的。

## 5.6 Hybrid召回

**双路AnnSearchRequest**：稠密检索（dense向量，IP内积）+ 稀疏检索（sparse_embedding，IP内积）。
**WeightedRanker融合**：dense:sparse = 0.7:0.3，语义为主，关键词为辅。

## 5.7 Reranker

| 对比 | Embedding | Reranker |
|------|-----------|----------|
| 计算方式 | 余弦相似度/内积 | 交叉编码器（Cross-Encoder） |
| 精度 | 中等，有信息损失 | 高，充分比较query和chunk |
| 速度 | 快，百万级毫秒返回 | 慢，每对需一次推理 |
| 使用位置 | 第一轮召回（topK=30） | 第二轮精排（topN=5） |

**置信度计算**：`sigmoid(reranker_score)`→0~1概率值。
**路由策略**：≥0.5→generate_rag(基于知识库)；<0.5且需联网→web_search；<0.5且不联网→generate_direct。

## 5.8 意图分类器

**5类分类**：GENERAL(通用对话→直接LLM)、GENERAL_WEB(需联网→联网搜索)、VAGUE(模糊→HyDE)、BROAD(宽泛→Multi-Query)、PRECISE(精确→标准RAG)。
使用DeepSeek结构化输出进行分类，temperature=0确保稳定。

## 5.9 记忆管理

**MemoryManager**：`save_memory`(保存对话历史)+`load_memory`(加载历史)。
**摘要压缩**：对话超过阈值（如10轮）时，用LLM压缩历史为摘要，后续用摘要+最近几轮完整对话作为上下文。
**MemorySaver**：LangGraph的checkpointer，`compile(checkpointer=memory)`后自动保存State，通过`thread_id`区分会话。

## 5.10 MCP工具

**MCP**（Model Context Protocol）：LLM与外部工具交互的标准化协议。
**三个文件**：`kb_server.py`（暴露Milvus检索）、`web_search_server.py`（暴露Web搜索）、`client.py`（统一管理MCP连接）。

## 5.11-5.14 节点详解

**State（13字段）**：请求上下文(messages/student_id/question)→意图分类结果(intent)→查询改写(hyde_document/multi_queries)→检索结果(retrieved_chunks/reranked_chunks/confidence)→生成结果(answer/sources)→记忆(memory_summary)。

**意图分类条件路由**：
```
classify_query → GENERAL→generate_general
               → GENERAL_WEB→web_search
               → VAGUE→hyde_generate
               → BROAD→multi_query_rewrite
               → PRECISE→load_memory_and_embed
```

**HyDE（假设文档）**：对模糊问题，先让LLM生成一段"假设的课程讲义"，再用它去检索。模糊问题本身信息少，但"假设答案"含更丰富关键词，能召回更相关内容。

**Multi-Query（多查询改写）**：对宽泛问题拆成3-5个具体子问题，分别检索后合并结果，扩大召回覆盖。

**load_memory_and_embed**：并行执行两件事——加载记忆+向量化查询，`asyncio.gather`同时进行。

**检索节点**：双路混合检索（稠密+稀疏），WeightedRanker(0.7,0.3)融合，取topK=30。

**重排序节点**：Reranker精排取topN=5，sigmoid计算置信度，按置信度路由。

**generate_rag**：基于知识库chunk生成回答，标注来源（"来源：Java讲义>第3章>3.1 IOC"）。
**web_search**：MCP联网搜索，搜索结果作为上下文。
**generate_direct**：LLM直接回答，兜底方案。
**enqueue_pending**：低分问题入待办队列，持续改进知识库。
**save_memory**：保存本轮对话，超过阈值触发摘要压缩。

## 5.15 图装配

12个节点+2个条件边（意图分类路由+置信度路由）+ 编译时挂MemorySaver实现多轮记忆。

## 5.16 HTTP接口

| 接口 | 说明 |
|------|------|
| POST /qa/chat | 非流式对话 |
| POST /qa/chat/stream | SSE流式对话（astream_events逐token返回） |
| GET /qa/history | 获取对话历史 |