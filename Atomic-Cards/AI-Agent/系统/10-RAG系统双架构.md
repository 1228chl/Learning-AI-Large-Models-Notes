---
author: "XunZong"
created: "2026-07-06"
tags: ["AI-Agent", "RAG", "项目实战"]
aliases: ["双系统架构", "MySQL问答", "Milvus RAG"]
---

# RAG 系统双架构

## 定义

生产级 RAG 系统常采用**双系统架构**——同时维护两条问答路径，根据查询类型动态选择：

```python
# 双架构级联路由流程图：按 Redis → MySQL → BERT 分类的顺序逐级分流
用户查询 → Redis缓存 → 命中 → 返回答案
                      → 未命中 → MySQL FAQ (BM25 + Softmax)
                                 → 匹配 > 阈值 → 返回答案 + 写入 Redis
                                 → 未匹配 → BERT 意图分类
                                            → 通用知识 → LLM 直接回答
                                            → 专业咨询 → Milvus RAG 系统
```

三条路径互补：MySQL FAQ 拦截高频标准问题（精确匹配），Redis 作为其前置缓存加速；未匹配时 BERT 分类器区分"通用"与"专业"——通用走 LLM 直接回答免去向量检索开销，专业走 Milvus RAG 深度语义检索。

## 级联路由设计

```python
# BERT 意图分类器：MySQL FAQ 未匹配后，区分"通用"和"专业"两类
def classify_intent(query):
    """MySQL FAQ 未命中时，用 BERT 区分 0=通用知识 和 1=专业咨询"""
    result = bert_classifier.predict(query)
    return "general" if result == 0 else "professional"

# 级联路由
# 主回答函数：Redis → MySQL → BERT → (LLM 直接回答 | Milvus RAG)
def answer(query):
    # Step 1: 查 Redis 缓存（已验证的高频问答缓存）
    cached = redis_cache.get(query)
    if cached:
        return cached

    # Step 2: 查 MySQL FAQ（BM25 + Softmax 阈值判断）
    faq_answer = mysql_faq.search(query)   # BM25 匹配，超阈值则返回答案
    if faq_answer:
        redis_cache.set(query, faq_answer)  # 缓存高置信度结果
        return faq_answer

    # Step 3: FAQ 未匹配 → BERT 意图分类，决定走哪条路径
    intent = classify_intent(query)

    if intent == "general":
        # 通用开放问题 → LLM 直接回答（免去向量检索开销）
        return llm.answer(query)
    else:
        # 专业/复杂问题 → Milvus RAG 语义检索 + LLM 生成
        return milvus_rag.search(query)
```

| 系统 | 存储 | 检索方式 | 触发条件 | 角色 |
|:----:|:----|:--------|:--------|:----|
| **Redis** | 缓存（FAQ 结果缓存） | Key-Value 精确匹配 | 任意查询先查缓存 | 热点缓存层，加速高频问答返回 |
| **MySQL FAQ** | 结构化 FAQ 表（问题+答案） | SQL 精确匹配 / BM25 | Redis 未命中后 | 标准问答库，高置信度匹配直接返回 |
| **BERT 分类器** | — | 微调 BERT 二分类 | MySQL FAQ 未匹配后 | 区分通用/专业，决定走 LLM 还是 Milvus |
| **LLM 直接回答** | — | 模型自身知识 | BERT 判定为通用知识 | 无固定答案的通用查询（闲聊、常识） |
| **Milvus RAG** | 向量库（文档 Embedding） | 语义相似度搜索 | BERT 判定为专业咨询 | 专业知识库，深度语义检索 + LLM 生成 |

## Milvus RAG 系统（专业问答）

```python
# 定义Milvus RAG系统类，负责开放域语义搜索问答
class MilvusRAG:
    # 初始化函数，连接向量数据库并加载大语言模型
    def __init__(self):
        # 连接Milvus中的knowledge_base集合，该集合存储了文档的向量化表示
        self.collection = Collection("knowledge_base")
        # 初始化GPT-4作为答案生成引擎，负责基于检索结果生成自然语言回答
        self.llm = ChatOpenAI(model="gpt-4")

    # 检索并生成答案的核心方法，接收用户查询字符串
    def search(self, query):
        # 1. 查询向量化：将自然语言查询转换为稠密向量表示
        query_vec = embed(query)

        # 2. 混合检索（稠密 + BM25）：同时使用语义向量和关键词匹配进行检索，兼顾理解与精确性
        results = self.collection.hybrid_search(query_vec)

        # 3. 重排序：对初步检索结果进行精细排序，提升最终结果的相关性
        results = rerank(query, results)

        # 4. LLM 生成：取前三篇最相关的文档片段作为上下文，交由LLM生成基于参考的答案
        context = "\n".join([r.text for r in results[:3]])
        return self.llm.invoke(f"基于以下内容回答：{context}\n问题：{query}")
```

## MySQL FAQ 系统（高频问答）

```python
# 定义MySQL FAQ系统类，负责高频标准问题的精确匹配与快速返回
class MySQLFAQ:
    # 初始化函数，连接MySQL数据库中的FAQ问答表
    def __init__(self):
        # 连接到faq_db数据库，该库存储了经过人工审核的标准问题-答案对
        self.conn = pymysql.connect(database="faq_db")

    # 检索方法：使用BM25算法对所有FAQ问题排序，找到最匹配的答案
    def search(self, query):
        # 1. BM25 检索引擎（基于 FAQ 问题表）
        # 创建数据库游标并查询所有FAQ记录的问题和答案列
        cursor = self.conn.cursor()
        cursor.execute("SELECT question, answer FROM faq")

        faq_list = cursor.fetchall()

        # 2. BM25 排序：构建BM25模型并对每个FAQ问题计算与用户查询的相关性得分
        bm25 = BM25([q for q, a in faq_list])

        scores = [bm25.score(query, i) for i in range(len(faq_list))]

        # 3. 返回最佳匹配：取得分最高的FAQ答案，若最高分仍低于阈值则返回空值
        best_idx = np.argmax(scores)
        return faq_list[best_idx][1] if scores[best_idx] > threshold else None
```

## ML 中的双系统

| 场景 | 使用方式 |
|:----|:--------|
| **企业客服** | FAQ 处理高频问题，Milvus RAG 处理专业咨询，Redis 缓存热点答案 |
| **教育问答** | 标准题库 FAQ + 教材文档专业检索 + 通用知识 LLM 直接答 |
| **技术支持** | 已知 Bug 解决方案走 FAQ，技术文档走 Milvus RAG 检索 |
| **混合架构最佳实践** | Redis 缓存加速 → MySQL FAQ 拦截高频 → BERT 分流 → LLM 托底 / Milvus 深入 |

## 面试追问

**Q1（基础）**：RAG 系统双架构的完整级联流程是怎样的？为什么需要这种设计？
**回答要点**：

1. 完整流程为四级级联：Redis 缓存 → MySQL FAQ（BM25） → BERT 意图分类 → LLM 直接回答或 Milvus RAG
2. Redis 拦截已验证的高频问答（毫秒级返回）；未命中则查 MySQL FAQ 做 BM25 匹配，超阈值直接返回并回写缓存
3. FAQ 未匹配时才进入意图分类：通用知识由 LLM 直接回答（免向量检索成本），专业咨询走 Milvus RAG 深度检索
4. 这种设计确保简单问题最高效响应，专业咨询得到深度解答，通用知识不浪费检索资源

**Q2（深挖）**：双架构中 BERT 二分类的定位是什么？有哪些实现方案？
**回答要点**：

1. BERT 分类器是级联的第三级——在 Redis 和 MySQL FAQ 都未命中后才触发，决定走 LLM 直接回答还是 Milvus RAG
2. 规则方案——基于关键词和正则（如含"Transformer"→专业，含"你好"→通用），简单快速但泛化差
3. BERT 微调二分类——准确率高（95%+），推理延迟低（3-5ms），适合类别固定的场景
4. LLM Prompt 分类——零标注成本但延迟较高（秒级），适合类别动态变化的场景
5. 生产实践中常用"快速规则过滤 + BERT 兜底"的级联方案

**Q3（实战）**：当 MySQL FAQ 和 Milvus RAG 对同一查询给出不同答案时，如何设计决策机制来决定采用哪个答案？
**回答要点**：

1. 优先级策略——FAQ 优先（标准问题答案权威性更高，经人工审核），以 Redis 缓存的中转结果作为快速判断依据
2. 级联策略——先查 Redis 缓存，命中直接返回；未命中再查 MySQL FAQ（BM25 匹配），超过阈值直接返回；未匹配则根据分类结果走 Milvus RAG（专业）或 LLM（通用）
3. 置信度兜底——当分类器置信度低于阈值时，默认走 Milvus RAG 深度检索，同时将低置信度样本记录用于后续分类器微调
4. 低置信度场景可考虑两结果同时展示或转人工

**Q4（边界）**：双架构系统长期运行后查询分类器的准确率为什么会下降？如何维护？
**回答要点**：

1. 用户查询分布会随时间变化（概念漂移），新出现的查询类型分类器未曾见过
2. 知识库和 FAQ 不断更新，原有分类边界偏移
3. 维护策略包括：定期收集新标注数据重新微调分类器；加入主动学习——低置信度分类结果人工复核后收入训练集；设置分类置信度阈值，低分数时走兜底策略（默认走 RAG 或人工）

## 参考引用
- 需要理解RAG三阶段流程的相关知识，参见 [RAG三阶段流程](../RAG流程/02-RAG三阶段流程.md)
- 需要理解文档切分策略的相关知识，参见 [文档切分策略](../RAG流程/03-文档切分策略.md)
- 需要了解PyMySQL模块以理解数据存储与检索技术，参见 [PyMySQL模块](../../数据库/SQL/04-PyMySQL模块.md)
- 需要理解FAQ与RAG混合检索架构的相关知识，参见 [FAQ与RAG混合检索架构](../检索/26-FAQ与RAG混合检索架构.md)
