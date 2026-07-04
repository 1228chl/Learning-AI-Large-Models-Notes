---
tags: [LLM/RAG/应用架构]
parent_moc: [[核心依赖链]]
aliases: [RAG, Retrieval-Augmented Generation, 检索增强生成]
layer: 层级5-工程应用
prerequisites: [LLM, 向量数据库, 文本分块]
successers: [知识库问答, 私有知识访问]
---

# 深度卡片：RAG检索增强生成

## L1：是什么（定义/公式/结构）

### 严谨定义
RAG是一种将信息检索与LLM文本生成能力相结合的混合架构，在生成答案之前，首先根据用户查询从外部知识库中检索相关上下文片段，然后将检索结果与原始查询一起输入LLM，让模型基于检索到的事实证据生成答案。

### 核心流程

```
索引阶段：
  文档 → 分块 → 向量化 → 存储到向量数据库

检索阶段：
  查询 → 向量化 → 相似度搜索 → 返回Top-K文档

生成阶段：
  查询 + 检索结果 → 提示词构建 → LLM生成 → 答案
```

### 关键组件

| 组件 | 作用 | 技术选择 |
|------|------|----------|
| 文档分块 | 将长文档切分为适当大小的片段 | 递归字符分块、语义分块 |
| 向量化 | 将文本编码为稠密向量 | BERT、E5、Instructor |
| 向量数据库 | 高效存储和检索向量 | FAISS、Chroma、Pinecone |
| 检索策略 | 找到最相关的文档 | 稠密检索、稀疏检索、混合检索 |
| 提示词构建 | 组合查询和检索结果 | 上下文注入、指令设计 |

---

## L2：为什么（设计意图/解决什么问题）

### 为什么需要RAG？

**问题1：LLM的知识截止**

LLM的知识截止于训练数据，无法获取最新信息。RAG通过检索外部知识库，让LLM访问实时信息。

**问题2：LLM的幻觉问题**

LLM可能生成看似合理但错误的内容。RAG通过提供事实依据，让LLM基于证据生成答案，减少幻觉。

**问题3：私有知识访问**

LLM无法访问企业内部文档、个人笔记等私有知识。RAG可以将私有知识库与LLM结合。

### RAG vs 微调

| 特性 | RAG | 微调 |
|------|-----|------|
| 知识更新 | 实时更新知识库 | 需要重新训练 |
| 成本 | 低（无需训练） | 高（需要GPU） |
| 可追溯 | 可以引用来源 | 难以解释 |
| 适用场景 | 知识密集型任务 | 领域适应任务 |

---

## L3：怎么用（代码实现/调参/场景）

### LangChain实现

```python
from langchain_community.vectorstores import FAISS
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import DirectoryLoader

# 1. 加载文档
loader = DirectoryLoader('./docs', glob='**/*.txt')
documents = loader.load()

# 2. 分块
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000,
    chunk_overlap=200
)
chunks = text_splitter.split_documents(documents)

# 3. 创建向量数据库
embeddings = OpenAIEmbeddings()
vectorstore = FAISS.from_documents(chunks, embeddings)

# 4. 创建检索器
retriever = vectorstore.as_retriever(search_kwargs={"k": 3})

# 5. 创建RAG链
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

template = """基于以下上下文回答问题。
上下文：{context}
问题：{question}
回答："""

prompt = ChatPromptTemplate.from_template(template)
llm = ChatOpenAI(model="gpt-4")

rag_chain = (
    {"context": retriever, "question": RunnablePassthrough()}
    | prompt
    | llm
    | StrOutputParser()
)

# 6. 使用
answer = rag_chain.invoke("什么是机器学习？")
```

---

## L4：坑在哪（边界条件/失效场景/常见误解）

### 常见误解

| 误解 | 正确理解 | 后果 |
|------|----------|------|
| "RAG能解决所有幻觉" | RAG只能减少，不能完全消除 | 过度信任 |
| "检索越多名越好" | 无关文档会干扰生成 | 需要控制Top-K |

### 边界条件

**1. 知识库质量**

如果知识库包含错误或过时信息，RAG会生成错误答案。

**解决方案**：定期更新知识库、质量审核

**2. 检索不准确**

如果检索到的文档不相关，生成的答案也会不准确。

**解决方案**：优化分块策略、使用更好的embedding模型、混合检索

**3. 上下文窗口限制**

LLM的上下文窗口有限，无法处理太多检索结果。

**解决方案**：控制Top-K、压缩上下文、使用长上下文模型

**4. 需要推理的任务**

RAG只擅长事实检索，不擅长推理。

**解决方案**：结合思维链（CoT）、多跳检索

---

## 💼 面试追问树

### Q1（基础）：RAG是什么？它解决了什么问题？

**回答要点**：
1. 定义：检索+生成的混合架构
2. 解决的问题：知识截止、幻觉、私有知识
3. 核心流程：索引→检索→生成

### Q2（深挖）：RAG的检索策略有哪些？

**回答要点**：
1. 稠密检索：embedding相似度
2. 稀疏检索：BM25关键词匹配
3. 混合检索：结合两者优势
4. 重排序：对检索结果重新排序

### Q3（更深）：如何评估RAG系统？

**回答要点**：
1. 检索质量：Recall@K、MRR
2. 生成质量：忠实度、相关性、正确性
3. 评估工具：RAGAS框架

### Q4（边界）：RAG什么时候会失效？

**回答要点**：
1. 知识库质量差
2. 检索不准确
3. 需要推理的任务
4. 上下文窗口限制

---

## 🔗 关联知识网络

**上游依赖**：[[LLM]], [向量数据库]], [文本分块]]

**下游应用**：
- [[知识库问答]]：企业知识库
- [[私有知识访问]]：个人笔记
- [[实时信息]]：最新新闻

**并列概念**：[[微调]], [提示工程]]
