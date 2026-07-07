---
author: "XunZong"
created: "2026-07-06"
tags: ["AI-Agent", "RAG", "实现"]
aliases: ["RAG系统实现", "RAG代码", "HyDE", "RAG查询分类"]
---

# RAG 系统完整实现

> 基于 Heima EduRAG 项目的生产级 RAG 系统代码框架，包含查询分类、多策略检索、重排序等完整模块。

## 系统架构

```
用户查询 → 查询分类器(BERT) → 策略选择器 → 检索(混合检索+重排序) → LLM生成
```

## 查询分类器

```python
class QueryClassifier:
    """BERT 二分类：通用知识(0) vs 专业咨询(1)"""
    def __init__(self, model_path):
        from transformers import BertTokenizer, BertForSequenceClassification
        self.tokenizer = BertTokenizer.from_pretrained(model_path)
        self.model = BertForSequenceClassification.from_pretrained(model_path)

    def classify(self, query: str) -> int:
        inputs = self.tokenizer(query, return_tensors="pt", truncation=True, max_length=128)
        outputs = self.model(**inputs)
        import torch
        return torch.argmax(outputs.logits, dim=1).item()
```

## 检索策略选择器

```python
class StrategySelector:
    """根据查询类型动态选择检索策略"""

    @staticmethod
    def select(query, query_type):
        if query_type == "short":
            return "hyde"          # 短查询用 HyDE
        elif query_type == "complex":
            return "subquery"      # 复杂查询拆子查询
        else:
            return "direct"        # 普通查询直接检索
```

## HyDE 假设文档检索（增强短查询）

```python
class HyDERetriever:
    """短查询 → 先生成假设答案 → 用假设答案检索"""
    def __init__(self, vector_store, llm):
        self.vs = vector_store
        self.llm = llm

    def retrieve(self, query, k=5):
        # 1. 先生成假设答案
        hyde_prompt = f"请基于你对AI领域的了解，简要回答：{query}"
        hypo_answer = self.llm(hyde_prompt)

        # 2. 用假设答案代替原查询做向量检索
        return self.vs.hybrid_search_with_rerank(hypo_answer, k=k)
```

## 子查询策略（复杂查询拆解）

```python
class SubQueryRetriever:
    """复杂查询拆分为多个子查询，分别检索后合并去重"""
    def __init__(self, vector_store, llm):
        self.vs = vector_store
        self.llm = llm

    def retrieve(self, query, k=5):
        # 1. LLM 拆解子查询
        prompt = f"将以下问题拆解为3-5个独立的子问题：{query}"
        subqueries_text = self.llm(prompt)
        subqueries = [q.strip() for q in subqueries_text.split("\n") if q.strip()]

        # 2. 每个子查询独立检索
        all_docs = []
        for sub_q in subqueries:
            docs = self.vs.hybrid_search_with_rerank(sub_q, k=k)
            all_docs.extend(docs)

        # 3. 按内容去重
        unique = {doc.page_content: doc for doc in all_docs}
        return list(unique.values())[:k]
```

## 完整 RAG 系统

```python
class RAGSystem:
    def __init__(self, vector_store, llm):
        self.vs = vector_store
        self.llm = llm
        self.classifier = QueryClassifier("models/bert_query_classifier")
        self.strategy = StrategySelector()

    def answer(self, query):
        # Step 1: 查询分类
        q_type = self.classifier.classify(query)
        logger.info(f"查询类型: {'专业' if q_type else '通用'}")

        # Step 2: 策略选择与检索
        if q_type == 1:           # 专业咨询 → MySQL FAQ
            return self._faq_search(query)
        else:                      # 通用知识 → RAG
            docs = self._rag_retrieve(query)

        # Step 3: 构建 Prompt
        context = "\n".join([d.page_content for d in docs])
        prompt = f"""基于以下上下文回答问题。
如果上下文信息不足，请说"信息不足"。

上下文：
{context}

问题：{query}
回答："""
        # Step 4: LLM 生成
        return self.llm(prompt)

    def _rag_retrieve(self, query):
        # 自动选择策略
        if len(query) < 10:
            return HyDERetriever(self.vs, self.llm).retrieve(query)
        elif "并且" in query or "同时" in query:
            return SubQueryRetriever(self.vs, self.llm).retrieve(query)
        else:
            return self.vs.hybrid_search_with_rerank(query)
```

## 文档处理器

```python
from langchain_core.document_loaders import BaseLoader
from langchain_core.documents import Document

# 中文递归切分器（按句号→感叹号→问号→分号→逗号 逐级切分）
from langchain_text_splitters import RecursiveCharacterTextSplitter

splitter = RecursiveCharacterTextSplitter(
    separators=["\n\n", "\n", "。|！|？", "；|；\s", "，|，\s"],
    chunk_size=500, chunk_overlap=50, keep_separator=True
)
chunks = splitter.split_documents(documents)

# 父子块策略（检索子块，返回父块）
# 子块用于检索 → 找到匹配后返回完整的父块给 LLM
```

## 面试追问

**Q1（基础）**：生产级 RAG 系统中查询分类器（QueryClassifier）的作用是什么？分类后的查询如何路由到不同的处理路径？
**回答要点**：查询分类器将输入查询分为"通用知识（general）"和"专业咨询（professional）"两类；通用知识走 Milvus RAG 语义检索+LLM 生成路径，专业咨询走 MySQL FAQ 精确匹配路径；分类依据是 BERT 二分类模型微调输出的 logits argmax 判断。

**Q2（深挖）**：HyDE（假设文档检索）的核心思想是什么？为什么它对短查询场景特别有效？
**回答要点**：HyDE 先让 LLM 根据短查询生成一个假设回答（即使可能存在错误），再用这个假设回答代替原始查询做向量检索；核心思想是假设回答比短查询包含更丰富的语义信息，在高维向量空间中更靠近真实相关文档的位置；短查询本身语义稀疏导致检索效果差，HyDE 通过生成式扩展弥补了这一不足。

**Q3（实战）**：SubQueryRetriever 中如果子查询数量过多导致检索结果膨胀，如何优化？
**回答要点**：限制子查询数量（建议 3-5 个）；每个子查询检索时降低 Top-K（如设为 2-3 条），总结果数可控；合并后去重保留首次出现的文档；可加入重排序步骤——对所有合并后的文档用 Reranker 重新评分排序，取最终 Top-K；对 LLM 拆解子查询的 prompt 中加入"请拆解为不超过 4 个子问题"的约束。

**Q4（边界）**：这个 RAG 系统在处理百万级知识库时，混合检索（hybrid_search_with_rerank）可能遇到什么性能瓶颈？如何优化？
**回答要点**：向量检索延迟随数据量线性增长——需使用 IVF_FLAT 或 HNSW 等 ANN 索引代替暴力搜索；稠密+稀疏双路检索计算开销大——可考虑先快速向量检索 Top-K 再对候选集做 BM25 评分；Reranker 二次排序成为瓶颈——Reranker 只对 Top-N（如 100 条）候选集做精排而非全量；引入 Redis 缓存高频查询结果避免重复计算。

> 参见 [[02-RAG三阶段流程]]、[[08-Milvus核心概念]]、[[22-LangChain组件操作指南]]、[[25-RAG系统评估(RAGAS)]]、[[27-RAG查询改写与意图识别]]
