---
author: "XunZong"
created: "2026-07-06"
tags: ["AI-Agent", "RAG", "检索"]
aliases: ["RAG", "检索增强生成", "RAG流程"]
---

# RAG 三阶段流程

## 定义

RAG（Retrieval-Augmented Generation，检索增强生成）是一种在 LLM 生成回答前，先从外部知识库**检索相关文档**，再将检索结果作为上下文交给 LLM 生成答案的混合架构。它解决了 LLM 的知识截止和幻觉问题。

## 三阶段流程

### 1. 索引阶段（Indexing）

将文档切分、向量化后存入向量数据库：

```
原始文档 → 文档切分(Chunking) → 嵌入(Embedding) → 存入向量库(Milvus)
```

```python
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.embeddings import HuggingFaceEmbeddings
from langchain.vectorstores import Milvus

# 文档切分
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=500, chunk_overlap=50
)
chunks = text_splitter.split_documents(documents)

# 向量化并存储
embeddings = HuggingFaceEmbeddings(model_name="BAAI/bge-base-zh")
vector_store = Milvus.from_documents(chunks, embeddings)
```

### 2. 检索阶段（Retrieval）

用户查询 → 向量化 → 在向量库中搜索最相似的 Top-K 文档：

```
用户问题 → 嵌入 → 向量检索(Top-K) → 返回相关文档片段
```

### 3. 生成阶段（Generation）

将检索结果与原始查询一起构建提示词，让 LLM 基于事实生成答案：

```python
from langchain.llms import OpenAI
from langchain.chains import RetrievalQA

qa = RetrievalQA.from_chain_type(
    llm=OpenAI(),
    retriever=vector_store.as_retriever(search_kwargs={"k": 3})
)
answer = qa.run("什么是注意力机制？")
```

## 为什么需要 RAG？

| 问题 | 表现 | RAG 的解决 |
|:----|:----|:-----------|
| **知识截止** | LLM 不知道最新事件 | 检索最新文档作为上下文 |
| **幻觉** | LLM 编造看似合理的内容 | 提供事实依据，限制 LLM 基于检索结果回答 |
| **私有知识** | LLM 没学过企业内部数据 | 将私有文档索引到向量库 |
| **长尾知识** | 训练数据中罕见，记忆不准确 | 每次查询时检索最新最相关的信息 |

## RAG vs 微调

| 对比 | RAG | 微调 |
|:----:|:----|:----|
| **知识更新** | ✅ 修改知识库即可 | ❌ 需重新训练 |
| **幻觉控制** | ✅ 检索结果约束 | ⚠️ 仍可能幻觉 |
| **私有数据** | ✅ 无需训练 | ✅ 但需标注 |
| **推理成本** | 低 | 高（需用微调后的模型） |
| **最佳场景** | 知识密集型问答 | 格式/风格迁移（如特定输出模板） |

## 检索策略

| 策略 | 原理 | 适用 |
|:----|:----|:----|
| **直接检索** | 查询向量与文档向量最近邻 | 通用场景 |
| **HyDE** | 先生成假设答案再检索 | 查询简短模糊时 |
| **子查询** | 将复杂查询拆分为多个子查询 | 多维度问题 |
| **回溯问题（RQ-RAG）** | 根据检索结果再生成新查询 | 迭代检索直到信息充足 |

> 参见 [[01-Agent定义与核心公式]]、[[04-LangChain六大组件]]、[[08-Milvus核心概念]]
