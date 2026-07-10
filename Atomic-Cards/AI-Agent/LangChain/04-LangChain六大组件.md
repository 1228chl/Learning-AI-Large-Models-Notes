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

# LLM（纯文本生成）：调用 OpenAI 纯文本补全模型，适合需要简单输入输出格式的场景
llm = OpenAI(model_name="gpt-3.5-turbo-instruct")

# Chat Model（对话）：使用对话式模型，支持多轮消息交互
chat = ChatOpenAI(model="gpt-4")

chat.invoke([HumanMessage(content="Hello!")])  # 通过消息列表调用，HumanMessage 封装用户输入
```

## Prompts

```python
from langchain.prompts import PromptTemplate

# 从模板字符串构建提示词模板，将上下文和问题作为变量占位符
template = PromptTemplate.from_template(
    "请根据以下上下文回答用户问题：\n"
    "上下文: {context}\n问题: {question}"  # {context} 和 {question} 会在运行时被替换为实际值
)


prompt = template.format(context="...", question="什么是 RAG？")  # 填充模板变量，生成最终提示词
```

## Chains

```python
from langchain.chains import RetrievalQA, LLMChain, SimpleSequentialChain

# RAG 链：将向量检索与 LLM 生成串联为一条端到端问答管道
qa_chain = RetrievalQA.from_chain_type(

    llm=chat, retriever=vector_store.as_retriever()  # 绑定对话模型和向量检索器
)

# 多步链：将多个处理步骤按顺序串联，前一步的输出自动作为后一步的输入
chain1 = LLMChain(llm=llm, prompt=prompt1)  # 第一步：执行 LLM 调用，按 prompt1 模板生成中间结果

chain2 = LLMChain(llm=llm, prompt=prompt2)  # 第二步：将第一步的输出作为输入，继续处理

pipeline = SimpleSequentialChain(chains=[chain1, chain2])  # 将两个链串联为顺序执行管道
```

## Memory

```python
from langchain.memory import ConversationBufferMemory


memory = ConversationBufferMemory(return_messages=True)  # 创建对话缓冲区记忆，以消息列表格式存储历史

chain = LLMChain(llm=chat, prompt=prompt, memory=memory)  # 将记忆注入链中，使 LLM 能感知对话上下文
```

## Agents + Tools

```python
from langchain.agents import initialize_agent, Tool
from langchain.tools import tool

@tool  # 装饰器：将自定义函数注册为 LangChain 工具，供 Agent 调用
def search_web(query: str) -> str:
    """搜索网络获取最新信息"""  # 工具的描述文本，LLM 据此判断何时调用此工具
    return ...  # 实际搜索逻辑（此处省略实现）

# 初始化 Agent：将工具、LLM 和决策策略组合为一个可自主推理和行动的智能体
agent = initialize_agent(

    tools=[search_web, ...],  # 向 Agent 注册可用的工具列表

    llm=chat,                 # 使用对话模型作为 Agent 的推理大脑

    agent="zero-shot-react-description",  # 采用 ReAct 策略：观察→思考→行动的循环

    verbose=True              # 开启详细日志，输出 Agent 的推理过程便于调试
)
```

## Indexes

```python
from langchain.document_loaders import TextLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.vectorstores import FAISS


loader = TextLoader("data.txt")  # 创建文件加载器，读取指定文本文件

docs = loader.load()             # 执行加载，将文件内容解析为 Document 对象列表

splits = RecursiveCharacterTextSplitter().split_documents(docs)  # 将文档递归切分为适合检索的小文本块

vectorstore = FAISS.from_documents(splits, embeddings)  # 将文本块向量化后存入 FAISS 向量索引库
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
**回答要点**：

1. Models：提供大模型接口，负责根据检索到的上下文和用户问题生成最终回答
2. Indexes：负责文档加载、文本切分和向量化存储，实现外部知识的检索
3. Chains：通过 RetrievalQA 将检索和生成串联为端到端的问答管道
4. Prompts：构造提示词模板，将检索出的上下文与用户问题整合为结构化的 LLM 输入

**Q2（深挖）**：Chain 和 Agent 在 LangChain 中有什么本质区别？各自适用的任务类型是什么？
**回答要点**：

1. Chain 是预定义的固定执行序列，执行路径确定，适合已知步骤的数据管道（如 RAG 检索到生成）
2. Agent 由 LLM 自主决策选择工具和执行顺序，执行路径动态，适合需要实时判断的任务
3. Agent 比 Chain 更灵活但不可控性更高，需要在灵活性和可靠性之间做权衡

**Q3（实战）**：用 LangChain 构建一个带对话历史记忆的知识库问答系统需要如何组合组件？
**回答要点**：

1. 选择 ChatOpenAI 作为对话模型，ConversationBufferMemory 存储多轮对话历史
2. 通过 PromptTemplate 将历史上下文、检索结果和当前问题整合为提示词输入
3. 使用 RetrievalQA 或 LCEL 管道串联检索、记忆和生成，可选 SQLChatMessageHistory 实现跨会话持久化

**Q4（边界）**：LangChain 的 Chain 在处理超长多步任务时存在哪些问题？如何解决？
**回答要点**：

1. 中间结果无法持久化——进程崩溃后需从头重跑，可用 checkpoint 机制或外部存储保存中间状态
2. 链式调用嵌套过深导致调试困难——利用 LangSmith 追踪或自定义回调进行日志记录
3. 流式支持不统一——LCEL 天然支持流式，旧版 Chain 需额外适配或迁移至 LCEL

## 参考引用
- 需要理解RAG三阶段流程的相关知识，参见 [RAG三阶段流程](../RAG流程/02-RAG三阶段流程.md)
- 需要理解Agent定义与核心公式的相关知识，参见 [Agent定义与核心公式](../基础/01-Agent定义与核心公式.md)
- 需要理解文档切分策略的相关知识，参见 [文档切分策略](../RAG流程/03-文档切分策略.md)
