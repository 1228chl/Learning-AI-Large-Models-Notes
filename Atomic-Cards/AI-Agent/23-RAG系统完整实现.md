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

> 参见 [[02-RAG三阶段流程]]、[[08-Milvus核心概念]]、[[22-LangChain组件操作指南]]
