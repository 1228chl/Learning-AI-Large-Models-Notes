---
author: "XunZong"
created: "2026-07-06"
tags: ["AI-Agent", "RAG", "项目实战"]
aliases: ["双系统架构", "MySQL问答", "Milvus RAG"]
---

# RAG 系统双架构

## 定义

生产级 RAG 系统常采用**双系统架构**——同时维护两条问答路径，根据查询类型动态选择：

```
用户查询 → 查询分类器 → 通用知识 → Milvus RAG 系统
                       ↘ 专业知识 → MySQL FAQ 系统
```

两条路径互补：MySQL 负责高频标准问答（精确匹配），Milvus RAG 负责开放语义搜索（泛化理解）。

## 双系统设计

```python
# 查询分类（BERT 二分类）
def classify_query(query):
    """区分"通用知识"和"专业咨询"两种类型"""
    result = query_classifier.predict(query)
    return "general" if result == 0 else "professional"

# 路由
def answer(query):
    q_type = classify_query(query)
    if q_type == "professional":
        return mysql_faq.search(query)       # 精确匹配
    else:
        return milvus_rag.search(query)      # 语义检索 + LLM
```

| 系统 | 存储 | 检索方式 | 适用查询 |
|:----:|:----|:--------|:--------|
| **MySQL FAQ** | 结构化 FAQ 表（问题+答案） | SQL 精确匹配 / BM25 | 标准高频问题 |
| **Milvus RAG** | 向量库（文档 Embedding） | 语义相似度搜索 | 开放式、泛化问题 |

## Milvus RAG 系统（开放问答）

```python
class MilvusRAG:
    def __init__(self):
        self.collection = Collection("knowledge_base")
        self.llm = ChatOpenAI(model="gpt-4")

    def search(self, query):
        # 1. 查询向量化
        query_vec = embed(query)

        # 2. 混合检索（稠密 + BM25）
        results = self.collection.hybrid_search(query_vec)

        # 3. 重排序
        results = rerank(query, results)

        # 4. LLM 生成
        context = "\n".join([r.text for r in results[:3]])
        return self.llm.invoke(f"基于以下内容回答：{context}\n问题：{query}")
```

## MySQL FAQ 系统（高频问答）

```python
class MySQLFAQ:
    def __init__(self):
        self.conn = pymysql.connect(database="faq_db")

    def search(self, query):
        # 1. BM25 检索引擎（基于 FAQ 问题表）
        cursor = self.conn.cursor()
        cursor.execute("SELECT question, answer FROM faq")
        faq_list = cursor.fetchall()

        # 2. BM25 排序
        bm25 = BM25([q for q, a in faq_list])
        scores = [bm25.score(query, i) for i in range(len(faq_list))]

        # 3. 返回最佳匹配
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

> **面试追问**
>
> Q1（基础）：RAG 系统双架构的设计思路是什么？为什么需要同时维护 MySQL FAQ 和 Milvus RAG 两条路径？
> 回答要点：双架构将查询分为"高频标准问答"和"开放语义搜索"两类分别处理；FAQ 路径对标准问题可做到毫秒级精确返回（SQL/BM25 匹配），RAG 路径处理泛化开放问题（向量检索+LLM 生成）；通过查询分类器路由，兼顾响应速度和语义覆盖范围的平衡。
>
> Q2（深挖）：双架构中的查询分类器可以用哪些方案实现？各自的优缺点是什么？
> 回答要点：规则方案——基于关键词和正则匹配（如含"怎么办理"→专业咨询），简单快速但泛化能力差；BERT 二分类微调——准确率高但需要标注数据和计算资源；LLM Prompt 分类——零标注成本但延迟较高且有额外 API 费用；生产实践中常用"快速规则过滤 + BERT 兜底"的级联方案。
>
> Q3（实战）：当 MySQL FAQ 和 Milvus RAG 对同一查询给出不同答案时，如何设计决策机制来决定采用哪个答案？
> 回答要点：优先级策略——FAQ 优先（标准问题答案权威性更高，经人工审核）；置信度比较——对比 BM25 匹配分数和向量检索分数的归一化值，取置信度高者；级联策略——先查 FAQ 有超过阈值的匹配就直接返回，未匹配再走 RAG 路径；低置信度场景可考虑两结果同时展示或转人工。
>
> Q4（边界）：双架构系统长期运行后查询分类器的准确率为什么会下降？如何维护？
> 回答要点：用户查询分布会随时间变化（概念漂移），新出现的查询类型分类器未曾见过；知识库和 FAQ 不断更新，原有分类边界偏移；维护策略包括：定期收集新标注数据重新微调分类器；加入主动学习——低置信度分类结果人工复核后收入训练集；设置分类置信度阈值，低分数时走兜底策略（默认走 RAG 或人工）。

> 参见 [[02-RAG三阶段流程]]、[[03-文档切分策略]]、[[04-PyMySQL模块]]
