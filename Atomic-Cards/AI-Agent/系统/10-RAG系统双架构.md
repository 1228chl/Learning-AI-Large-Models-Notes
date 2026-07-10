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
# 双架构路由流程图：查询分类器将用户问题分为两条处理路径
用户查询 → 查询分类器 → 通用知识 → Milvus RAG 系统
                       ↘ 专业知识 → MySQL FAQ 系统
```

两条路径互补：MySQL 负责高频标准问答（精确匹配），Milvus RAG 负责开放语义搜索（泛化理解）。

## 双系统设计

```python
# 查询分类（BERT 二分类）
# 定义查询分类函数，判断用户输入属于"通用知识"还是"专业咨询"
def classify_query(query):
    """区分"通用知识"和"专业咨询"两种类型"""
    # 调用预训练的BERT分类器进行预测，返回0或1
    result = query_classifier.predict(query)
    # 将数值结果映射为可读的类型标签字符串
    return "general" if result == 0 else "professional"

# 路由
# 主回答函数，根据查询类型动态路由到不同的后端系统
def answer(query):
    # 先对查询进行分类，确定走哪条处理路径
    q_type = classify_query(query)

    if q_type == "professional":
        # 专业问题走MySQL FAQ精确匹配，快速返回标准答案
        return mysql_faq.search(query)       # 精确匹配
    else:
        # 通用问题走Milvus RAG语义检索+LLM生成，提供开放域回答
        return milvus_rag.search(query)      # 语义检索 + LLM
```

| 系统 | 存储 | 检索方式 | 适用查询 |
|:----:|:----|:--------|:--------|
| **MySQL FAQ** | 结构化 FAQ 表（问题+答案） | SQL 精确匹配 / BM25 | 标准高频问题 |
| **Milvus RAG** | 向量库（文档 Embedding） | 语义相似度搜索 | 开放式、泛化问题 |

## Milvus RAG 系统（开放问答）

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
| **企业客服** | FAQ 处理高频问题，RAG 处理复杂咨询 |
| **教育问答** | 标准题库 FAQ + 教材文档 RAG |
| **技术支持** | 已知 Bug 的解决方案 FAQ + RAG 技术文档 |
| **混合架构最佳实践** | 先用分类器分流，提高响应速度同时保证覆盖率 |

## 面试追问

**Q1（基础）**：RAG 系统双架构的设计思路是什么？为什么需要同时维护 MySQL FAQ 和 Milvus RAG 两条路径？
**回答要点**：

1. 双架构将查询分为"高频标准问答"和"开放语义搜索"两类分别处理
2. FAQ 路径对标准问题可做到毫秒级精确返回（SQL/BM25 匹配），RAG 路径处理泛化开放问题（向量检索+LLM 生成）
3. 通过查询分类器路由，兼顾响应速度和语义覆盖范围的平衡

**Q2（深挖）**：双架构中的查询分类器可以用哪些方案实现？各自的优缺点是什么？
**回答要点**：

1. 规则方案——基于关键词和正则匹配（如含"怎么办理"→专业咨询），简单快速但泛化能力差
2. BERT 二分类微调——准确率高但需要标注数据和计算资源
3. LLM Prompt 分类——零标注成本但延迟较高且有额外 API 费用
4. 生产实践中常用"快速规则过滤 + BERT 兜底"的级联方案

**Q3（实战）**：当 MySQL FAQ 和 Milvus RAG 对同一查询给出不同答案时，如何设计决策机制来决定采用哪个答案？
**回答要点**：

1. 优先级策略——FAQ 优先（标准问题答案权威性更高，经人工审核）
2. 置信度比较——对比 BM25 匹配分数和向量检索分数的归一化值，取置信度高者
3. 级联策略——先查 FAQ 有超过阈值的匹配就直接返回，未匹配再走 RAG 路径
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
