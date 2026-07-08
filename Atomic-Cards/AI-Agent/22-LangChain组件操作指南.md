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
# 初始化大语言模型，配置模型名称、API密钥和接口地址，temperature设为0以保证输出确定性
llm = ChatOpenAI(
    model="qwen-max",
    api_key=os.getenv("API_KEY"),
    base_url=os.getenv("BASE_URL"),
    temperature=0
)

# 调用方式
resp = llm.invoke("你好")            # 全文输出：等待模型生成完整回复后一次性返回
for chunk in llm.stream("讲故事"):   # 流式输出：逐token接收生成内容，实时展示给用户
    print(chunk.content, end="")

# Embedding 模型
# 初始化文本嵌入模型，将自然语言文本转换为稠密向量表示
embeddings = DashScopeEmbeddings(model="text-embedding-v1", dashscope_api_key=os.getenv("API_KEY"))
vector = embeddings.embed_query("要编码的文本")  # → List[float]：将单条查询文本编码为浮点数向量
```

## 2. Prompts

```python
from langchain_core.prompts import PromptTemplate, FewShotPromptTemplate

# Zero-shot（零样本提示）：直接使用模板，不提供示例
prompt = PromptTemplate.from_template("给我讲一个关于{subject}的故事")
text = prompt.format(subject="AI 机器人")  # 用具体主题替换模板中的占位符，生成实际提示文本

# Few-shot（少样本提示）：提供几个示例帮助模型理解任务格式
examples = [{"text": "手机质量太差", "sentiment": "负面"},
            {"text": "服务态度好", "sentiment": "正面"}]
# 定义每个示例的模板格式
example_prompt = PromptTemplate.from_template("文本: {text}\n情感: {sentiment}")
# 将示例列表和模板组合为少样本提示，后缀包含待分类的新输入
few_shot = FewShotPromptTemplate(examples=examples, example_prompt=example_prompt,
                                 suffix="文本: {input}\n情感:", input_variables=["input"])
print(few_shot.format(input="电影太精彩了"))  # 格式化输出完整提示，供模型推理使用
```

## 3. Chains

```python
from langchain.chains import LLMChain, SimpleSequentialChain

# 创建第一个链：用中文介绍指定主题
chain1 = LLMChain(llm=llm, prompt=PromptTemplate.from_template("用中文介绍{subject}"))
# 创建第二个链：将第一步生成的中文内容翻译为英文
chain2 = LLMChain(llm=llm, prompt=PromptTemplate.from_template("翻译为英文: {text}"))
# 将两个链串联为顺序流水线：前一个链的输出自动作为后一个链的输入
pipeline = SimpleSequentialChain(chains=[chain1, chain2], verbose=True)
print(pipeline.run("深度学习"))  # 执行流水线：先介绍再翻译，输出最终结果
```

## 4. Agents

```python
from langchain.agents import create_react_agent, AgentExecutor, Tool

# 定义一个工具函数：模拟网络搜索功能，接收查询字符串并返回搜索结果
@tool
def search_web(query: str) -> str:
    """搜索网络信息"""
    return f"搜索结果: {query}"

# 将工具函数包装为LangChain可识别的工具对象，包含名称和描述信息
tools = [Tool(name="搜索", func=search_web, description="搜索")]
from langchain import hub
# 使用ReAct（推理+行动）框架创建智能体，从Hub加载官方prompt模板
agent = create_react_agent(llm, tools, hub.pull("hwchase17/react"))
# 创建智能体执行器，负责管理智能体的推理-行动循环，verbose=True输出中间步骤
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)
# 执行智能体：输入查询后，智能体会自主决定是否调用搜索工具并整合结果
print(agent_executor.invoke({"input": "搜索AI最新进展"}))
```

## 5. Memory

```python
from langchain.memory import ConversationBufferMemory
from langchain_community.chat_message_histories import SQLChatMessageHistory

# 内存记忆
# 初始化对话缓冲区记忆，return_messages=True使历史以消息对象列表形式返回
memory = ConversationBufferMemory(return_messages=True)
# 向记忆中添加用户消息和AI回复，模拟一轮对话历史
memory.chat_memory.add_user_message("你好")
memory.chat_memory.add_ai_message("你好！有什么帮助？")

# 数据库持久化记忆
# 将会话历史持久化到MySQL数据库，通过session_id区分不同用户/会话
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
# 1. 加载文档：从本地文本文件读取原始文档内容
loader = TextLoader("data.txt")
# 2. 文档切分：将长文档按固定块大小切分为若干段落，chunk_overlap=0表示块之间无重叠
texts = CharacterTextSplitter(chunk_size=100, chunk_overlap=0).split_documents(loader.load())
# 3. 向量化存储：将切分后的文档段落转化为向量并存入Chroma向量数据库，持久化到磁盘
db = Chroma.from_documents(texts, embeddings, persist_directory="./chroma_db")

# 4. 创建检索器：将向量数据库包装为检索接口，search_kwargs={"k": 3}表示每次检索返回最相似的3个段落
retriever = db.as_retriever(search_kwargs={"k": 3})
# 5. 构建检索增强问答链：将检索到的相关内容作为上下文注入LLM，生成基于事实的回答
qa = RetrievalQA.from_chain_type(llm=llm, retriever=retriever)
print(qa.run("文档的主要内容是什么？"))  # 执行RAG问答：先检索相关文档片段，再交给LLM生成答案
```

## 7. Output Parsers

```python
from langchain_core.output_parsers import StrOutputParser, CommaSeparatedListOutputParser
from langchain_core.pydantic_v1 import BaseModel, Field
from langchain_core.output_parsers import JsonOutputParser

# 字符串 → StrOutputParser：直接提取LLM输出的纯文本字符串
# 逗号列表 → CommaSeparatedListOutputParser：将逗号分隔的输出解析为列表
# JSON → JsonOutputParser：将JSON格式输出解析为字典
# Pydantic 模型 → JsonOutputParser(pydantic_object=MyModel)：按预定义结构解析为Pydantic对象

# 定义Person数据模型，指定字段名和字段描述，用于约束LLM输出格式
class Person(BaseModel):
    name: str = Field("姓名")
    age: int = Field("年龄")

# 创建基于Pydantic模型的JSON解析器，自动验证和转换输出为Person对象
parser = JsonOutputParser(pydantic_object=Person)
print(parser.invoke('{"name": "张三", "age": 25}'))  # 解析JSON字符串并返回Person实例
```

## 8. LCEL 管道

```python
# 用 | 符号串联组件（LCEL语法），实现声明式管道编排
from langchain_core.runnables import RunnablePassthrough

# 构建LCEL管道：将输入透传至prompt模板 → 送入LLM → 提取纯文本输出
chain = {"subject": RunnablePassthrough()} | prompt | llm | StrOutputParser()
print(chain.invoke("AI"))  # 执行管道：输入"AI"经模板格式化、LLM生成、解析后输出最终结果
```

## 面试追问

**Q1（基础）**：LangChain 中 invoke 和 stream 两种调用方式有什么区别？各自的应用场景是什么？

**回答要点**：invoke 一次返回完整结果，适合不需要实时响应的场景（如离线批处理、后端服务）；stream 逐块返回内容（基于 SSE），适合需要实时展示生成过程的场景（如对话 UI、流式文本展示），用户体验更好；stream 需要在调用时刻意逐块处理 content。

**Q2（深挖）**：LCEL（`|` 管道语法）相比传统 Chain 类有什么优势？为什么推荐在新项目中使用？

**回答要点**：LCEL 语法更简洁直观，用管道符串联组件可读性强；天然内置对流式（stream）、批量（batch）和异步（ainvoke/astream）的支持——无需额外适配代码；支持 RunnablePassthrough、RunnableParallel 等实现参数透传和并行分支；更容易调试——每个中间组件的输出都可以被拦截和检查。

**Q3（实战）**：用 LangChain 实现一个多用户对话机器人，要求对话历史持久化到 MySQL，需要用到哪些组件？

**回答要点**：ChatOpenAI 作为 LLM 模型；PromptTemplate 设计包含历史轮次的问题模板；SQLChatMessageHistory 实现按 session_id 持久化对话记录到 MySQL；ConversationBufferMemory 配合 return_messages=True 从数据库读取记忆；所有组件通过 LCEL 或 LLMChain 串联。

**Q4（边界）**：LangChain 在实际生产环境部署中有哪些典型的问题和风险？如何规避？

**回答要点**：版本兼容性问题——langchain 主包与 langchain-openai、langchain-community 等子包需严格对齐，建议锁定依赖版本并做好兼容性测试；链式调用超时无容错——需设置 request_timeout 和 retry 策略；Agent 的 ReAct 循环可能无限迭代——必须设置 max_iterations 限制；回调/追踪不完善——引入 LangSmith 记录完整调用链路便于排查。

## 参考引用
- 需要理解RAG三阶段流程的相关知识，参见 [RAG三阶段流程](./02-RAG三阶段流程.md)
- 需要理解LangChain六大组件的相关知识，参见 [LangChain六大组件](./04-LangChain六大组件.md)
- 需要了解嵌入与向量化以理解数据存储与检索技术，参见 [嵌入与向量化](../数据库/10-嵌入与向量化.md)
- 需要了解Milvus核心概念以理解数据存储与检索技术，参见 [Milvus核心概念](../数据库/08-Milvus核心概念.md)