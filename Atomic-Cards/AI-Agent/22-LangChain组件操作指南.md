---
author: "XunZong"
created: "2026-07-06"
tags: ["AI-Agent", "LangChain", "实操"]
aliases: ["LangChain操作", "LangChain代码"]
---

# LangChain 组件操作指南

> 补充各组件的完整可运行代码。安装：`pip install langchain langchain-openai langchain-community`

## 1. Models

```python
import os
from langchain_openai import ChatOpenAI
from langchain_community.embeddings import DashScopeEmbeddings

# Chat Model（聊天模型）
llm = ChatOpenAI(
    model="qwen-max",
    api_key=os.getenv("API_KEY"),
    base_url=os.getenv("BASE_URL"),
    temperature=0
)

# 调用方式
resp = llm.invoke("你好")            # 全文输出
for chunk in llm.stream("讲故事"):   # 流式输出
    print(chunk.content, end="")

# Embedding 模型
embeddings = DashScopeEmbeddings(model="text-embedding-v1", dashscope_api_key=os.getenv("API_KEY"))
vector = embeddings.embed_query("要编码的文本")  # → List[float]
```

## 2. Prompts

```python
from langchain_core.prompts import PromptTemplate, FewShotPromptTemplate

# Zero-shot
prompt = PromptTemplate.from_template("给我讲一个关于{subject}的故事")
text = prompt.format(subject="AI 机器人")

# Few-shot（少样本示例）
examples = [{"text": "手机质量太差", "sentiment": "负面"},
            {"text": "服务态度好", "sentiment": "正面"}]
example_prompt = PromptTemplate.from_template("文本: {text}\n情感: {sentiment}")
few_shot = FewShotPromptTemplate(examples=examples, example_prompt=example_prompt,
                                 suffix="文本: {input}\n情感:", input_variables=["input"])
print(few_shot.format(input="电影太精彩了"))
```

## 3. Chains

```python
from langchain.chains import LLMChain, SimpleSequentialChain

chain1 = LLMChain(llm=llm, prompt=PromptTemplate.from_template("用中文介绍{subject}"))
chain2 = LLMChain(llm=llm, prompt=PromptTemplate.from_template("翻译为英文: {text}"))
pipeline = SimpleSequentialChain(chains=[chain1, chain2], verbose=True)
print(pipeline.run("深度学习"))
```

## 4. Agents

```python
from langchain.agents import create_react_agent, AgentExecutor, Tool

@tool
def search_web(query: str) -> str:
    """搜索网络信息"""
    return f"搜索结果: {query}"

tools = [Tool(name="搜索", func=search_web, description="搜索")]
from langchain import hub
agent = create_react_agent(llm, tools, hub.pull("hwchase17/react"))
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)
print(agent_executor.invoke({"input": "搜索AI最新进展"}))
```

## 5. Memory

```python
from langchain.memory import ConversationBufferMemory
from langchain_community.chat_message_histories import SQLChatMessageHistory

# 内存记忆
memory = ConversationBufferMemory(return_messages=True)
memory.chat_memory.add_user_message("你好")
memory.chat_memory.add_ai_message("你好！有什么帮助？")

# 数据库持久化记忆
SQLChatMessageHistory(session_id="u001", connection_string="mysql+pymysql://root@localhost/db")
```

## 6. Indexes（RAG 核心）

```python
from langchain_community.document_loaders import TextLoader
from langchain_text_splitters import CharacterTextSplitter
from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import DashScopeEmbeddings
from langchain.chains import RetrievalQA

# 完整 RAG 流程
loader = TextLoader("data.txt")
texts = CharacterTextSplitter(chunk_size=100, chunk_overlap=0).split_documents(loader.load())
db = Chroma.from_documents(texts, embeddings, persist_directory="./chroma_db")

retriever = db.as_retriever(search_kwargs={"k": 3})
qa = RetrievalQA.from_chain_type(llm=llm, retriever=retriever)
print(qa.run("文档的主要内容是什么？"))
```

## 7. Output Parsers

```python
from langchain_core.output_parsers import StrOutputParser, CommaSeparatedListOutputParser
from langchain_core.pydantic_v1 import BaseModel, Field
from langchain_core.output_parsers import JsonOutputParser

# 字符串 → StrOutputParser
# 逗号列表 → CommaSeparatedListOutputParser
# JSON → JsonOutputParser
# Pydantic 模型 → JsonOutputParser(pydantic_object=MyModel)

class Person(BaseModel):
    name: str = Field("姓名")
    age: int = Field("年龄")

parser = JsonOutputParser(pydantic_object=Person)
print(parser.invoke('{"name": "张三", "age": 25}'))
```

## 8. LCEL 管道

```python
# 用 | 符号串联组件
from langchain_core.runnables import RunnablePassthrough

chain = {"subject": RunnablePassthrough()} | prompt | llm | StrOutputParser()
print(chain.invoke("AI"))
```

> 参见 [[04-LangChain六大组件]]、[[02-RAG三阶段流程]]
