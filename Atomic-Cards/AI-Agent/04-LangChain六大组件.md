---
author: "XunZong"
created: "2026-07-06"
tags: ["AI-Agent", "LangChain", "框架"]
aliases: ["LangChain", "LCEL", "LangChain框架"]
---

# LangChain 六大组件

## 定义

LangChain 是一个 LLM 应用开发框架，提供统一的接口来简化 RAG、Agent、对话系统等应用的构建。其设计围绕**六大核心组件**：

```python
from langchain import (
    llms, prompts, memory, chains, agents, indexes
)
```

## 六大组件

| 组件 | 作用 | 核心类 | 类比 |
|:----:|:----|:------|:----|
| **Models** | 统一的大模型接口 | `LLM`, `ChatOpenAI`, `HuggingFacePipeline` | 大脑 |
| **Prompts** | 模板化、结构化提示词管理 | `PromptTemplate`, `FewShotPromptTemplate` | 指令模板 |
| **Memory** | 对话历史存储与检索 | `ConversationBufferMemory`, `VectorStoreMemory` | 短期记忆 |
| **Chains** | 将多个步骤串联为管道 | `LLMChain`, `SequentialChain` | 流水线 |
| **Agents** | LLM 自主决策调用工具 | `Agent`, `Tool`, `Toolkit` | 决策者 |
| **Indexes** | 外部知识库接入（RAG 基础） | `DocumentLoader`, `TextSplitter`, `VectorStore` | 长期记忆 |

## Models

```python
from langchain.llms import OpenAI
from langchain.chat_models import ChatOpenAI

# LLM（纯文本生成）
llm = OpenAI(model_name="gpt-3.5-turbo-instruct")

# Chat Model（对话）
chat = ChatOpenAI(model="gpt-4")
chat.invoke([HumanMessage(content="Hello!")])
```

## Prompts

```python
from langchain.prompts import PromptTemplate

template = PromptTemplate.from_template(
    "请根据以下上下文回答用户问题：\n"
    "上下文: {context}\n问题: {question}"
)

prompt = template.format(context="...", question="什么是 RAG？")
```

## Chains

```python
from langchain.chains import RetrievalQA, LLMChain, SimpleSequentialChain

# RAG 链
qa_chain = RetrievalQA.from_chain_type(
    llm=chat, retriever=vector_store.as_retriever()
)

# 多步链
chain1 = LLMChain(llm=llm, prompt=prompt1)
chain2 = LLMChain(llm=llm, prompt=prompt2)
pipeline = SimpleSequentialChain(chains=[chain1, chain2])
```

## Memory

```python
from langchain.memory import ConversationBufferMemory

memory = ConversationBufferMemory(return_messages=True)
chain = LLMChain(llm=chat, prompt=prompt, memory=memory)
```

## Agents + Tools

```python
from langchain.agents import initialize_agent, Tool
from langchain.tools import tool

@tool
def search_web(query: str) -> str:
    """搜索网络获取最新信息"""
    return ...

agent = initialize_agent(
    tools=[search_web, ...],
    llm=chat,
    agent="zero-shot-react-description",
    verbose=True
)
```

## Indexes

```python
from langchain.document_loaders import TextLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.vectorstores import FAISS

loader = TextLoader("data.txt")
docs = loader.load()
splits = RecursiveCharacterTextSplitter().split_documents(docs)
vectorstore = FAISS.from_documents(splits, embeddings)
```

## ML 中的 LangChain

| 应用场景 | 组件组合 | 说明 |
|:--------:|:--------|:----|
| **知识库问答** | Indexes + RetrievalQA | RAG 标准实现 |
| **对话机器人** | Memory + Chat Model + Prompt | 带上下文的对话 |
| **数据分析** | Agent + Python REPL | 自然语言驱动分析 |
| **自动化工作流** | SequentialChain + Tools | 多步任务自动执行 |

> 参见 [[02-RAG三阶段流程]]、[[01-Agent定义与核心公式]]、[[03-文档切分策略]]
