# RAG与LangChain完整指南

**标签：** #RAG #LangChain #LLM #Agent

---

## 目录

1. [LangChain概述](#一langchain概述)
2. [核心组件](#二核心组件)
3. [RAG检索增强生成](#三rag检索增强生成)
4. [Agents智能体](#四agents智能体)
5. [实战案例](#五实战案例)

---

# 一、LangChain概述

## 1. 什么是LangChain

LangChain是一个LLM应用开发框架，为各种LLMs提供统一接口，将组件"链接"在一起。

| 项目 | 内容 |
|------|------|
| **创建者** | Harrison Chase |
| **创建时间** | 2022年10月 |
| **定位** | LLM应用开发框架 |
| **支持语言** | Python、JavaScript/TypeScript |

---

## 2. 为什么要用LangChain？

### LLM原生局限

- 无法获取实时信息（知识截止日期限制）
- 无记忆机制（每次对话都是"初次见面"）
- 不能处理私有数据（企业内部文档）
- 复杂推理能力有限
- 无法调用外部工具

### LangChain解决方案

- 集成搜索引擎/数据库/API工具
- Memory组件实现对话记忆
- Indexes + RAG处理私有知识
- Chains + Agents编排复杂工作流

---

## 3. LangChain与LLM的关系

```
GPT-4 (OpenAI)  ─┐
文心一言 (百度)   ─┼─→ LangChain框架 ─→ 开发者的应用程序
通义千问 (阿里)   ─┘
```

---

# 二、核心组件

## 1. Models（模型层）

LangChain支持三种模型类型：

| 类型 | 输入 | 输出 | 使用场景 |
|------|------|------|----------|
| LLMs | 文本字符串 | 文本字符串 | 文本生成 |
| Chat Models | 聊天消息 | 聊天消息 | 对话系统 |
| Embedding Models | 文本 | 浮点数向量 | 语义搜索 |

---

## 2. LLMs调用示例

```python
from langchain_openai import ChatOpenAI

# 初始化模型
llm = ChatOpenAI(
    model="gpt-4",
    api_key="your-api-key",
    temperature=0  # 0=确定性输出，1=创造性输出
)

# 同步调用
response = llm.invoke("什么是机器学习？")
print(response.content)

# 流式输出
for chunk in llm.stream("介绍Python"):
    print(chunk, end="", flush=True)
```

---

## 3. Chat Models消息类型

| 类型 | 说明 | 使用场景 |
|------|------|----------|
| `SystemMessage` | 系统指令，设定AI角色 | 设定"你是一个专业医生" |
| `HumanMessage` | 用户输入的消息 | 用户提问 |
| `AIMessage` | AI的回复消息 | 模型回答 |

```python
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage

messages = [
    SystemMessage("你是一个耐心的心理咨询师"),
    HumanMessage("我最近总是失眠，怎么办？"),
    AIMessage("建议你睡前半小时远离手机..."),
    HumanMessage("有没有更具体的方法？"),
]
response = llm.invoke(messages)
print(response.content)
```

---

## 4. Embedding模型

将文本转换为向量表示，用于语义搜索。

```python
from langchain_openai import OpenAIEmbeddings

embeddings = OpenAIEmbeddings()

# 单个文本嵌入
vector = embeddings.embed_query("什么是机器学习")
print(vector)  # [0.0023, -0.0091, ...]

# 批量嵌入
vectors = embeddings.embed_documents(["文本1", "文本2"])
```

---

## 5. Prompts（提示词模板）

### 基础模板

```python
from langchain_core.prompts import ChatPromptTemplate

# 简单模板
template = ChatPromptTemplate.from_template(
    "你是一个{role}，请回答：{question}"
)

# 格式化
prompt = template.invoke({
    "role": "Python专家",
    "question": "什么是装饰器？"
})
print(prompt)
```

### 多轮对话模板

```python
from langchain_core.prompts import MessagesPlaceholder

template = ChatPromptTemplate.from_messages([
    ("system", "你是一个{role}"),
    MessagesPlaceholder(variable_name="chat_history"),
    ("human", "{input}")
])
```

---

## 6. Output Parsers（输出解析器）

将LLM的文本输出转换为结构化数据。

```python
from langchain_core.output_parsers import StrOutputParser, JsonOutputParser

# 字符串解析器
parser = StrOutputParser()

# JSON解析器
json_parser = JsonOutputParser()

# 使用
chain = llm | parser
result = chain.invoke("简单介绍Python")
```

---

## 7. Chains（链）

将多个组件组合成处理管道。

### LCEL表达式语言

```python
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

# 定义组件
llm = ChatOpenAI(model="gpt-4")
prompt = ChatPromptTemplate.from_template(
    "你是一个{expert}，请回答：{question}"
)
parser = StrOutputParser()

# 使用LCEL创建链
chain = prompt | llm | parser

# 调用
result = chain.invoke({
    "expert": "Python专家",
    "question": "什么是装饰器？"
})
print(result)
```

---

## 8. Memory（记忆）

### 对话历史记忆

```python
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.output_parsers import StrOutputParser
from langchain_core.chat_history import InMemoryChatMessageHistory

# 创建记忆
chat_history = InMemoryChatMessageHistory()

# 定义提示词模板
prompt = ChatPromptTemplate.from_messages([
    ("system", "你是一个有帮助的助手"),
    MessagesPlaceholder(variable_name="chat_history"),
    ("human", "{input}")
])

# 创建链
llm = ChatOpenAI(model="gpt-4")
parser = StrOutputParser()
chain = prompt | llm | parser

# 对话
def chat(user_input):
    response = chain.invoke({
        "chat_history": chat_history.messages,
        "input": user_input
    })
    # 保存历史
    chat_history.add_user_message(user_input)
    chat_history.add_ai_message(response)
    return response

# 测试
print(chat("我叫张三"))
print(chat("我叫什么名字？"))  # 模型应该记得
```

---

# 三、RAG检索增强生成

## 1. 什么是RAG

RAG（Retrieval-Augmented Generation）是一种将检索与生成相结合的技术，先从外部知识库中检索相关信息，再让模型基于检索结果生成答案。

**核心流程**：
```
用户问题 → 检索相关文档 → 将文档+问题送入LLM → 生成答案
```

---

## 2. 文档加载

```python
from langchain_community.document_loaders import (
    TextLoader,
    CSVLoader,
    PyPDFLoader,
    DirectoryLoader
)

# 加载文本文件
loader = TextLoader("document.txt")
documents = loader.load()

# 加载CSV
loader = CSVLoader("data.csv")
documents = loader.load()

# 加载PDF
loader = PyPDFLoader("document.pdf")
documents = loader.load()

# 加载目录下所有文件
loader = DirectoryLoader("./docs", glob="**/*.txt")
documents = loader.load()
```

---

## 3. 文本分块

```python
from langchain.text_splitter import (
    RecursiveCharacterTextSplitter,
    CharacterTextSplitter
)

# 递归字符分割器
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000,      # 每块最大字符数
    chunk_overlap=200,    # 块之间重叠字符数
    length_function=len,
    separators=["\n\n", "\n", "。", "！", "？", "，", " "]
)

# 分割文档
chunks = text_splitter.split_documents(documents)
print(f"原始文档数: {len(documents)}, 分块后: {len(chunks)}")
```

---

## 4. 向量数据库

### FAISS

```python
from langchain_community.vectorstores import FAISS
from langchain_openai import OpenAIEmbeddings

# 创建向量数据库
embeddings = OpenAIEmbeddings()
vectorstore = FAISS.from_documents(chunks, embeddings)

# 保存到本地
vectorstore.save_local("faiss_index")

# 从本地加载
vectorstore = FAISS.load_local("faiss_index", embeddings)
```

### Chroma

```python
from langchain_community.vectorstores import Chroma

vectorstore = Chroma.from_documents(
    documents=chunks,
    embedding=embeddings,
    persist_directory="./chroma_db"
)
```

---

## 5. 检索器

```python
# 基础检索
retriever = vectorstore.as_retriever(
    search_type="similarity",  # 相似度检索
    search_kwargs={"k": 3}     # 返回3个最相关文档
)

# 检索
docs = retriever.invoke("什么是机器学习？")
for doc in docs:
    print(doc.page_content[:200])
    print("---")
```

---

## 6. 完整RAG链

```python
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough

# 定义提示词
template = """基于以下上下文回答问题。如果上下文中没有相关信息，请说明你不知道。

上下文：
{context}

问题：{question}

回答："""

prompt = ChatPromptTemplate.from_template(template)

# 定义函数
def format_docs(docs):
    return "\n\n".join(doc.page_content for doc in docs)

# 创建RAG链
rag_chain = (
    {"context": retriever | format_docs, "question": RunnablePassthrough()}
    | prompt
    | llm
    | parser
)

# 调用
answer = rag_chain.invoke("什么是机器学习？")
print(answer)
```

---

## 7. 评估RAG系统

### 评估指标

| 指标 | 说明 |
|------|------|
| **忠实度** | 回答是否基于检索到的文档 |
| **相关性** | 检索到的文档是否与问题相关 |
| **准确性** | 回答是否正确 |

---

# 四、Agents智能体

## 1. 什么是Agent

Agent是以大语言模型为驱动，具备自主理解、感知、决策和执行能力的智能体。

**核心能力**：
- 感知：理解用户输入和环境信息
- 规划：制定完成任务的步骤
- 执行：调用工具完成具体操作
- 反思：评估结果并调整策略

---

## 2. 工具定义

```python
from langchain_core.tools import tool

@tool
def search(query: str) -> str:
    """搜索互联网获取最新信息"""
    # 实现搜索逻辑
    return f"搜索结果: {query}的最新信息..."

@tool
def calculate(expression: str) -> str:
    """计算数学表达式"""
    try:
        result = eval(expression)
        return str(result)
    except Exception as e:
        return f"计算错误: {e}"

tools = [search, calculate]
```

---

## 3. Agent创建

```python
from langchain_openai import ChatOpenAI
from langchain.agents import create_tool_calling_agent, AgentExecutor
from langchain_core.prompts import ChatPromptTemplate

# 定义提示词
prompt = ChatPromptTemplate.from_messages([
    ("system", "你是一个有帮助的助手，可以使用工具来回答问题。"),
    MessagesPlaceholder(variable_name="chat_history", optional=True),
    ("human", "{input}"),
    MessagesPlaceholder(variable_name="agent_scratchpad"),
])

# 创建模型
llm = ChatOpenAI(model="gpt-4")

# 创建Agent
agent = create_tool_calling_agent(llm, tools, prompt)

# 创建Agent执行器
agent_executor = AgentExecutor(
    agent=agent,
    tools=tools,
    verbose=True  # 显示执行过程
)

# 调用
result = agent_executor.invoke({
    "input": "今天北京的天气怎么样？",
    "chat_history": []
})
print(result["output"])
```

---

## 4. Agent应用场景

| 场景 | 说明 |
|------|------|
| **智能客服** | 理解用户问题，调用知识库，生成回复 |
| **数据分析** | 执行SQL查询，生成可视化报告 |
| **代码开发** | 编写、调试、测试代码 |
| **内容创作** | 撰写文章、生成图片、制作视频 |

---

# 五、实战案例

## 案例：构建智能问答系统

```python
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_community.document_loaders import DirectoryLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough

# 1. 加载文档
loader = DirectoryLoader("./docs", glob="**/*.txt")
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

# 5. 定义提示词
template = """基于以下上下文回答问题。

上下文：
{context}

问题：{question}

回答："""

prompt = ChatPromptTemplate.from_template(template)

# 6. 创建LLM
llm = ChatOpenAI(model="gpt-4")
parser = StrOutputParser()

# 7. 定义格式化函数
def format_docs(docs):
    return "\n\n".join(doc.page_content for doc in docs)

# 8. 创建RAG链
rag_chain = (
    {"context": retriever | format_docs, "question": RunnablePassthrough()}
    | prompt
    | llm
    | parser
)

# 9. 使用
answer = rag_chain.invoke("什么是机器学习？")
print(answer)
```

---

**参考资源**：
- LangChain官方文档：https://docs.langchain.com/
- LangChain GitHub：https://github.com/langchain-ai/langchain
- OpenAI API文档：https://platform.openai.com/docs
