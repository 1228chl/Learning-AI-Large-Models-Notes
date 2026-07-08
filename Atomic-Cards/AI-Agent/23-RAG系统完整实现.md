---
author: "XunZong"
created: "2026-07-06"
tags: ["AI-Agent", "RAG", "实现"]
aliases: ["RAG系统实现", "RAG代码", "HyDE", "RAG查询分类"]
---

# RAG 系统完整实现

## 定义

RAG 系统完整实现是一个生产级的检索增强生成代码框架，集成了查询分类器（BERT 二分类）、多策略检索器（HyDE、子查询、直接检索）、混合检索与重排序等完整模块。本节提供从查询分类到 LLM 生成的端到端可运行代码，展示如何构建一个健壮的 RAG 问答系统。

> 基于 Heima EduRAG 项目的生产级 RAG 系统代码框架，包含查询分类、多策略检索、重排序等完整模块。

## 系统架构

```python
# RAG系统完整流程图：用户查询依次经过分类、策略选择、检索、生成四个阶段
用户查询 → 查询分类器(BERT) → 策略选择器 → 检索(混合检索+重排序) → LLM生成
```

## 查询分类器

```python
# BERT二分类查询分类器：将用户查询分为"通用知识(0)"和"专业咨询(1)"两类
class QueryClassifier:
    """BERT 二分类：通用知识(0) vs 专业咨询(1)"""
    # 初始化分类器，加载预训练的BERT模型和对应的分词器
    def __init__(self, model_path):
        from transformers import BertTokenizer, BertForSequenceClassification
        # 加载BERT分词器，用于将文本转换为模型可理解的token ID序列
        self.tokenizer = BertTokenizer.from_pretrained(model_path)
        # 加载BERT序列分类模型，包含预训练权重和分类头
        self.model = BertForSequenceClassification.from_pretrained(model_path)

    # 对查询进行分类，返回0（通用知识）或1（专业咨询）
    def classify(self, query: str) -> int:
        # 将查询文本编码为PyTorch张量，截断至128个token以控制计算量
        inputs = self.tokenizer(query, return_tensors="pt", truncation=True, max_length=128)
        # 将编码后的输入送入BERT模型进行前向推理，得到分类logits
        outputs = self.model(**inputs)
        import torch
        # 取logits中得分最高的类别索引作为最终分类结果（0或1）
        return torch.argmax(outputs.logits, dim=1).item()
```

## 检索策略选择器

```python
# 检索策略选择器：根据查询长度和复杂度动态决定使用哪种检索策略
class StrategySelector:
    """根据查询类型动态选择检索策略"""

    @staticmethod
    def select(query, query_type):

        if query_type == "short":
            return "hyde"          # 短查询用 HyDE：先生成假设文档再检索，弥补短查询语义不足

        elif query_type == "complex":
            return "subquery"      # 复杂查询拆子查询：将多意图问题拆解为多个简单子问题分别检索
        else:
            return "direct"        # 普通查询直接检索：直接进行混合检索+重排序
```

## HyDE 假设文档检索（增强短查询）

```python
# HyDE（假设文档检索）：通过先生成假设答案来增强短查询的语义丰富度
class HyDERetriever:
    """短查询 → 先生成假设答案 → 用假设答案检索"""
    # 初始化，接收向量存储实例和大语言模型实例
    def __init__(self, vector_store, llm):

        self.vs = vector_store

        self.llm = llm


    def retrieve(self, query, k=5):
        # 1. 先生成假设答案：让LLM基于其领域知识对短查询给出一个简要回答（即使可能不准确）
        hyde_prompt = f"请基于你对AI领域的了解，简要回答：{query}"

        hypo_answer = self.llm(hyde_prompt)

        # 2. 用假设答案代替原查询做向量检索：假设答案比短查询包含更丰富的语义信息
        return self.vs.hybrid_search_with_rerank(hypo_answer, k=k)
```

## 子查询策略（复杂查询拆解）

```python
# 子查询检索器：将复杂多意图查询拆解为多个简单子查询，分别检索后合并去重
class SubQueryRetriever:
    """复杂查询拆分为多个子查询，分别检索后合并去重"""
    # 初始化，接收向量存储实例和大语言模型实例
    def __init__(self, vector_store, llm):

        self.vs = vector_store

        self.llm = llm


    def retrieve(self, query, k=5):
        # 1. LLM 拆解子查询：让LLM将复杂问题分解为3-5个独立的子问题
        prompt = f"将以下问题拆解为3-5个独立的子问题：{query}"

        subqueries_text = self.llm(prompt)
        # 按换行符分割并去除空白，得到子查询列表
        subqueries = [q.strip() for q in subqueries_text.split("\n") if q.strip()]

        # 2. 每个子查询独立检索：对每个子问题分别执行混合检索
        all_docs = []
        for sub_q in subqueries:

            docs = self.vs.hybrid_search_with_rerank(sub_q, k=k)
            all_docs.extend(docs)  # 将各子查询结果合并到一个列表中

        # 3. 按内容去重：使用字典以文档内容为键去重，保留首次出现的文档
        unique = {doc.page_content: doc for doc in all_docs}
        return list(unique.values())[:k]  # 取前k篇去重后的文档返回
```

## 完整 RAG 系统

```python
# RAG系统主类：整合查询分类、策略选择、混合检索和LLM生成全流程
class RAGSystem:
    # 初始化系统，接收向量存储实例和大语言模型实例
    def __init__(self, vector_store, llm):

        self.vs = vector_store

        self.llm = llm
        # 加载预训练的BERT查询分类器，用于判断查询是"通用"还是"专业"
        self.classifier = QueryClassifier("models/bert_query_classifier")
        # 初始化策略选择器，用于根据查询特点动态选择检索策略
        self.strategy = StrategySelector()

    # 核心回答方法：接收用户查询，经过分类→检索→生成全流程后返回答案
    def answer(self, query):
        # Step 1: 查询分类：使用BERT模型判断查询所属类型
        q_type = self.classifier.classify(query)
        logger.info(f"查询类型: {'专业' if q_type else '通用'}")

        # Step 2: 策略选择与检索：根据分类结果选择不同的处理路径
        if q_type == 1:           # 专业咨询 → MySQL FAQ：直接查询FAQ库获取标准答案
            return self._faq_search(query)
        else:                      # 通用知识 → RAG：走语义检索+LLM生成路径

            docs = self._rag_retrieve(query)

        # Step 3: 构建 Prompt：将检索到的文档片段拼接为上下文，构建提示模板
        context = "\n".join([d.page_content for d in docs])

        prompt = f"""基于以下上下文回答问题。
如果上下文信息不足，请说"信息不足"。

上下文：
{context}

问题：{query}
回答："""
        # Step 4: LLM 生成：将带上下文的提示送入语言模型，生成基于事实的回答
        return self.llm(prompt)

    # RAG检索策略：根据查询长度和关键词自动选择HyDE、子查询或直接检索
    def _rag_retrieve(self, query):
        # 自动选择策略：短查询（<10字符）使用HyDE增强语义，含连接词的复杂查询拆子查询
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
# 递归字符文本切分器：按分隔符优先级从高到低逐级切分，确保语义完整性
from langchain_text_splitters import RecursiveCharacterTextSplitter

# 配置切分器：先按段落切，再按句子边界切，最后按逗号切
splitter = RecursiveCharacterTextSplitter(

    separators=["\n\n", "\n", "。|！|？", "；|；\s", "，|，\s"],

    chunk_size=500, chunk_overlap=50, keep_separator=True
)

chunks = splitter.split_documents(documents)  # 对文档递归切分，返回文档块列表

# 父子块策略（检索子块，返回父块）
# 子块用于检索 → 找到匹配后返回完整的父块给 LLM，兼顾检索精度与上下文完整性
```

## ML/DL 应用场景

| 应用场景 | 推荐策略 | 说明 |
|:--------:|:--------|:----|
| **通用知识问答** | 直接检索 | 查询向量与文档向量最近邻搜索，适合语义明确的普通查询 |
| **短查询模糊检索** | HyDE（假设文档检索） | 先让 LLM 生成假设答案再检索，弥补短查询语义不足 |
| **复合多维度查询** | 子查询 | 将多意图复杂问题拆解为多个子问题分别检索后合并去重 |
| **标准高频问题** | FAQ 精确匹配 | 查询分类器识别后走 MySQL FAQ 通路，毫秒级高精度响应 |
| **父块上下文补全** | 父子块策略 | 检索子块后返回完整父块给 LLM，兼顾检索精度与上下文丰富度 |

## 面试追问

**Q1（基础）**：生产级 RAG 系统中查询分类器（QueryClassifier）的作用是什么？分类后的查询如何路由到不同的处理路径？
**回答要点**：

1. 查询分类器将输入查询分为"通用知识（general）"和"专业咨询（professional）"两类
2. 通用知识走 Milvus RAG 语义检索+LLM 生成路径，专业咨询走 MySQL FAQ 精确匹配路径
3. 分类依据是 BERT 二分类模型微调输出的 logits argmax 判断

**Q2（深挖）**：HyDE（假设文档检索）的核心思想是什么？为什么它对短查询场景特别有效？
**回答要点**：

1. HyDE 先让 LLM 根据短查询生成一个假设回答，再用假设回答代替原始查询做向量检索
2. 核心思想是假设回答比短查询包含更丰富的语义信息，在高维向量空间中更靠近真实相关文档的位置
3. 短查询本身语义稀疏导致检索效果差，HyDE 通过生成式扩展弥补了这一不足

**Q3（实战）**：SubQueryRetriever 中如果子查询数量过多导致检索结果膨胀，如何优化？
**回答要点**：

1. 限制子查询数量（建议 3-5 个），对 LLM 拆解 prompt 加入"不超过 4 个子问题"的约束
2. 每个子查询降低 Top-K（如设为 2-3 条），合并后去重保留首次出现的文档
3. 加入重排序步骤，对所有合并后的文档用 Reranker 重新评分排序，取最终 Top-K

**Q4（边界）**：这个 RAG 系统在处理百万级知识库时，混合检索（hybrid_search_with_rerank）可能遇到什么性能瓶颈？如何优化？
**回答要点**：

1. 向量检索延迟随数据量线性增长，需使用 IVF_FLAT 或 HNSW 等 ANN 索引代替暴力搜索
2. 稠密+稀疏双路检索计算开销大，可考虑先快速向量检索 Top-K 再对候选集做 BM25 评分
3. Reranker 二次排序只对 Top-N（如 100 条）候选集做精排而非全量，引入 Redis 缓存高频查询结果

## 参考引用
- 需要理解RAG三阶段流程的相关知识，参见 [RAG三阶段流程](./02-RAG三阶段流程.md)
- 需要了解Milvus核心概念的相关知识，参见 [Milvus核心概念](../数据库/08-Milvus核心概念.md)
- 需要理解LangChain组件操作指南的相关知识，参见 [LangChain组件操作指南](./22-LangChain组件操作指南.md)
- 需要理解RAG查询改写与意图识别的相关知识，参见 [RAG查询改写与意图识别](./27-RAG查询改写与意图识别.md)
