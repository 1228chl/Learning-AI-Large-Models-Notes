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

## 面试追问

**Q1（基础）**：LangChain 六大组件中，构建一个 RAG 问答系统最少需要用到哪几个组件？各自的作用是什么？

**回答要点**：Models（LLM 接口，负责生成回答）、Prompts（提示词模板，构造包含检索上下文的查询）、Indexes（文档加载+切分+向量库存储，实现外部知识检索）、Chains（RetrievalQA 串联检索和生成）；Prompts 和 Memory 为可选增强组件。

**Q2（深挖）**：Chain 和 Agent 在 LangChain 中有什么本质区别？各自适用的任务类型是什么？

**回答要点**：Chain 是预定义的固定执行序列，执行路径确定，适合已知步骤的数据管道（如 RAG 检索→生成）；Agent 是 LLM 自主决策选择工具和执行顺序，适合需要动态判断的任务（如多工具选择、条件分支）；Agent 更灵活但不可控性高。

**Q3（实战）**：用 LangChain 构建一个带对话历史记忆的知识库问答系统需要如何组合组件？

**回答要点**：用 ChatOpenAI 作为对话模型；用 ConversationBufferMemory 存储多轮对话历史；用 PromptTemplate 将历史上下文、检索结果和当前问题整合为提示词；用 RetrievalQA 或 LCEL 管道串联检索→记忆→生成；可选 SQLChatMessageHistory 实现跨会话持久化。

**Q4（边界）**：LangChain 的 Chain 在处理超长多步任务时存在哪些问题？如何解决？

**回答要点**：中间结果无法持久化——进程崩溃后需从头重跑，可用 checkpoint 机制或外部存储保存中间状态；链式调用嵌套过深导致调试困难——利用 LangSmith 追踪或自定义回调进行日志记录；流式支持不统一——LCEL 天然支持流式，旧版 Chain 需额外适配。

> 参见 [02-RAG三阶段流程](./02-RAG三阶段流程.md)、[01-Agent定义与核心公式](./01-Agent定义与核心公式.md)、[03-文档切分策略](./03-文档切分策略.md)、[08-自动微分机制](../深度学习/08-自动微分机制.md)