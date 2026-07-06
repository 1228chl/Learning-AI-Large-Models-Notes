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

> 参见 [[02-RAG三阶段流程]]、[[03-文档切分策略]]、[[04-PyMySQL模块]]
