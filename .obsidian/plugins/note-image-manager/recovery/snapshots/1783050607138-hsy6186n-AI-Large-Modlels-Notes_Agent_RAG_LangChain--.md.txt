**标签：** #RAG #LangChain

---

# LangChain 框架完全学习笔记

## 一、LangChain 概述

### 1.1 什么是 LangChain

| 项目       | 内容                             |
| -------- | ------------------------------ |
| **创建者**  | Harrison Chase                 |
| **创建时间** | 2022 年 10 月                    |
| **定位**   | LLM 应用开发框架                     |
| **核心理念** | 为各种 LLMs 提供统一接口，将组件"链接"在一起     |
| **支持语言** | Python、JavaScript/TypeScript 等 |

---

### 1.2 为什么要用 LangChain？

- LLM 原生局限：
	- 无法获取实时信息（知识截止日期限制）
	- 无记忆机制（每次对话都是"初次见面"）
	- 不能处理私有数据（企业内部文档）
	- 复杂推理能力有限（数学、逻辑问题）
	- 无法调用外部工具（API、数据库、搜索引擎）
- LangChain 解决方案
	- 集成搜索引擎 / 数据库 / API 工具
	- Memory 组件实现对话记忆
	- Indexes + RAG 处理私有知识
	- Chains + Agents 编排复杂工作流

---

### 1.3 LangChain 与 LLM 的关系

```mermaid
graph TB
    A["GPT-4 <br>(OpenAI)" ] --> D[LangChain框架<br>统一接口层]
    B["文心一言<br/>(百度)"] --> D
    C["通义千问<br/>(阿里)"] --> D
    D --> E["开发者的应用程序"]
```

---

## 二、核心组件详解

### 2.1 Models（模型层）

LangChain 支持三种模型类型，它们的输入输出和使用场景各不相同：

```mermaid
graph LR
    A[输入文本] --> B[LLMs]
    A --> C[Chat Models]
    A --> D[Embedding Models]
    
    B --> E[输出文本]
    C --> F[输出聊天消息]
    D --> G[输出浮点数向量]
```

---

#### 2.1.1 LLMs（大语言模型）

**定义**：接收文本字符串，返回文本字符串

**常用模型来源**：

- HuggingFace（开源模型）
- OpenAI（GPT 系列）
- 国内模型（通义千问、文心一言、豆包）

**代码示例 - 基础调用**：

```python
import os
from langchain_openai import ChatOpenAI

# 初始化模型（以通义千问为例）
llm = ChatOpenAI(
    model="qwen-max",
    api_key=os.getenv("TONGYI_API_KEY"),
    base_url=os.getenv('TONGYI_BASE_URL'),
    temperature=0  # 0=确定性输出，1=创造性输出
)

# 方式1：同步调用
response = llm.invoke("给我说说一夜暴富有哪些方法")
print(response.content)

# 方式2：流式输出（适合长文本）
for chunk in llm.stream("你是什么模型"):
    print(chunk, end="", flush=True)
```

**参数说明**：

| 参数 | 类型 | 说明 |
|------|------|------|
| `model` | str | 模型名称（如 gpt-4、qwen-max） |
| `api_key` | str | API 密钥 |
| `base_url` | str | API 端点地址 |
| `temperature` | float | 0-2，控制输出随机性 |
| `max_tokens` | int | 最大输出 token 数 |
| `top_p` | float | 核采样参数 |

---

#### 2.1.2 Chat Models（聊天模型）

**特点**：接收结构化聊天消息，返回聊天消息

**消息类型**：

| 类型 | 说明 | 使用场景 |
|------|------|----------|
| `SystemMessage` | 系统指令，设定 AI 角色和背景 | 设定"你是一个专业医生" |
| `HumanMessage` | 用户输入的消息 | 用户提问 |
| `AIMessage` | AI 的回复消息 | 模型回答 |
| `ChatMessage` | 通用消息（可自定义角色） | 特殊场景 |

**代码示例**：

```python
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
import os

llm = ChatOpenAI(
    base_url=os.getenv('TONGYI_BASE_URL'),
    api_key=os.getenv('TONGYI_API_KEY'),
    model="qwen-max"
)

messages = [
    SystemMessage("你是一个耐心的心理咨询师"),
    HumanMessage("我最近总是失眠，怎么办？"),
    AIMessage("建议你睡前半小时远离手机，试试冥想..."),
    HumanMessage("有没有更具体的方法？"),
]
response = llm.invoke(messages)
print(response.content)
```

---

#### 2.1.3 Embedding Models（嵌入模型）

**定义**：将文本转换为浮点数向量（文本向量化）

**核心价值**：

- 语义搜索（找语义相似的文本）
- 文本聚类
- 推荐系统
- RAG 检索

**代码示例**：

```python
from langchain_community.embeddings import DashScopeEmbeddings
import os

embedding_model = DashScopeEmbeddings(
    dashscope_api_key=os.getenv('TONGYI_API_KEY'),
    model="text-embedding-v3",
)

# 单个文本向量化
vector = embedding_model.embed_query("AI好啊，得学啊")
print(vector)  # 输出浮点数列表

# 批量文本向量化
vectors = embedding_model.embed_documents(["AI好啊，得学啊", "hello world"])
print(len(vectors[0]))  # 向量维度
```

**常见嵌入模型**：

| 提供商 | 模型名称 | 向量维度 |
|--------|----------|----------|
| OpenAI | text-embedding-ada-002 | 1536 |
| 阿里 | text-embedding-v3 | 1024 |
| 百度 | Embedding-V1 | 1024 |
| HuggingFace | all-MiniLM-L6-v2 | 384 |

---

### 2.2 Prompts（提示词工程）

#### 2.2.1 Prompt 类型

| 示例               | 结果                     |
| ---------------- | ---------------------- |
| Zero-shot        | 直接提问，不给示例              |
| Few-shot         | 给出几个示例，让模型学习模式         |
| Chain-of-Thought | 引导模型逐步思考，例如："让我们一步步思考" |

---

#### 2.2.2 PromptTemplate（提示模板）

**作用**：将动态变量插入到固定的提示模板中

```python
from langchain_core.prompts import PromptTemplate

# 方式1：使用 from_template
prompt = PromptTemplate.from_template(
    """我的邻居姓{lastname}，他生了个儿子，给他儿子起一个名字"""
)
prompt_text = prompt.format_prompt(lastname="张")

# 方式2：直接构造
prompt = PromptTemplate(
    template="我的邻居姓{lastname}，他生了个儿子，给他儿子起{count}个名字",
    input_variables=["lastname", "count"],
)
prompt_text = prompt.format(lastname="王", count=3)
```

---

#### 2.2.3 FewShotPromptTemplate（少样本模板）

```python
from langchain_core.prompts import PromptTemplate, FewShotPromptTemplate

# 1. 定义示例
examples = [
    {"word": "开心", "antonym": "难过"},
    {"word": "高", "antonym": "矮"},
    {"word": "胖", "antonym": "瘦"},
]

# 2. 定义示例模板
example_prompt = PromptTemplate(
    input_variables=["word", "antonym"],
    template="单词: {word}\n反义词: {antonym}\n",
)

# 3. 创建 Few-Shot 模板
few_shot_prompt = FewShotPromptTemplate(
    examples=examples,
    example_prompt=example_prompt,
    prefix="给出每个单词的反义词，直接输出答案",
    suffix="单词: {input}\n反义词:",
    input_variables=["input"],
    example_separator="\n",
)

# 4. 使用
prompt_text = few_shot_prompt.format(input="夯")
```

**结构示意**：

```python
[prefix]
[examples]  ← 学习模式
[suffix]    ← 真正的输入
```

---

### 2.3 Chains（链）

**Chain 的本质**：将多个组件串联起来，形成一个完整的处理流程。

---

#### 2.3.1 基础链（LCEL - LangChain Expression Language）

```python
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_openai import ChatOpenAI
import os

llm = ChatOpenAI(
    api_key=os.getenv('TONGYI_API_KEY'),
    model="qwen-max",
    base_url=os.getenv('TONGYI_BASE_URL')
)

# 使用 LCEL 语法构建链：| 表示串联
prompt = PromptTemplate.from_template("我的邻居姓{lastname}，给他儿子起3个名字")
chain = prompt | llm | StrOutputParser()

# 执行链
result = chain.invoke({"lastname": "张"})
print(result)
```

**LCEL 符号说明**：

```python
prompt | llm | output_parser
   ⬇      ⬇         ⬇
 输入  →  模型  →  解析输出
```

---

#### 2.3.2 多链串联

```python
# 第一条链：起名字
first_prompt = PromptTemplate.from_template("我的邻居姓{lastname}，给他儿子起个名字")

# 第二条链：起小名
second_prompt = PromptTemplate.from_template(
    "邻居的儿子名字叫{child_name}，给他起一个小名"
)

# 串联执行
chain = (
    first_prompt 
    | llm 
    | second_prompt 
    | llm 
    | StrOutputParser()
)

# 只需传入第一个参数
result = chain.invoke({"lastname": "孙"})
```

**数据流示意**：

```python
{lastname: "孙"}
      ⬇
  first_prompt
      ⬇
     llm  → "孙悟天"
      ⬇
  second_prompt → "邻居的儿子名字叫孙悟天，给他起一个小名"
      ⬇
     llm  → "天天"
      ⬇
  StrOutputParser()
      ⬇
  "天天"
```

---

### 2.4 Agents（代理）

**Agent 的核心思想**：让 LLM 自主选择需要使用的工具（Tools），完成复杂任务。

#### 2.4.1 为什么需要 Agent？

| 纯 LLM 的限制     | Agent 解决方案      |
| ------------- | --------------- |
| 知识截止日期限制，无法回答 | 自动调用搜索引擎获取实时数据  |
| 数学计算能力差       | 调用计算器工具处理数学     |
| 没有实时数据        | 调用天气 API 获取实时天气 |

---

#### 2.4.2 使用内置工具

```python
from langchain_openai import ChatOpenAI
from langchain.agents import create_agent
from langchain_community.tools import DuckDuckGoSearchRun
import os

# 1. 初始化工具
ddg_search = DuckDuckGoSearchRun()

# 2. 初始化模型
llm = ChatOpenAI(
    api_key=os.getenv('TONGYI_API_KEY'),
    model="qwen-max",
    base_url=os.getenv('TONGYI_BASE_URL'),
    extra_body={"enable_thinking": False}
)

# 3. 创建 Agent
agent = create_agent(
    model=llm,
    tools=[ddg_search],
    system_prompt="你是一个有用的助手，可以搜索实时信息"
)

# 4. 使用 Agent
response = agent.invoke({
    "messages": [{"role": "user", "content": "中国目前有多少人口"}]
})
```

---

#### 2.4.3 自定义工具（使用 @tool 装饰器）

```python
from langchain.tools import tool
from langchain.agents import create_agent
from langchain_openai import ChatOpenAI
import os
import requests

@tool
def multiply(a: int, b: int) -> int:
    """计算两个整数的乘积"""
    print(f"正在执行乘法: {a} × {b}")
    return a * b

@tool
def get_weather(city: str) -> dict:
    """查询城市天气"""
    # 实际调用天气 API
    url = "https://api.weather.com/v7/weather/now"
    params = {"location": city}
    response = requests.get(url, params=params)
    return response.json()

@tool
def write_file(file_path: str, content: str) -> str:
    """将内容写入本地文件"""
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)
    return f"文件 {file_path} 写入成功"

# 创建 Agent
tools = [multiply, get_weather, write_file]
llm = ChatOpenAI(
    model="qwen-max",
    api_key=os.getenv('TONGYI_API_KEY'),
    base_url=os.getenv('TONGYI_BASE_URL'),
)

agent = create_agent(
    model=llm,
    tools=tools,
    system_prompt="根据用户需求选择合适工具"
)

# 调用
response = agent.invoke({
    "messages": [{"role": "user", "content": "帮我计算 5 × 6，然后查一下深圳的天气"}]
})
```

**工具定义最佳实践**：

| 要素 | 说明 |
|------|------|
| 函数名 | 清晰描述功能 |
| 参数类型 | 使用类型注解（int, str, list） |
| docstring | 详细描述工具用途和参数 |
| 返回值 | 结构化返回，便于解析 |

---

### 2.5 Memory（记忆）

**问题**：LLM 本身是无状态的，每次对话都是独立的。

**解决方案**：Memory 组件保存历史对话，在下次请求时一起发送给 LLM。

---

#### 2.5.1 短期记忆 - ChatMessageHistory

```python
from langchain_community.chat_message_histories import ChatMessageHistory
from langchain_openai import ChatOpenAI
import os

llm = ChatOpenAI(
    model="qwen-max",
    api_key=os.getenv('TONGYI_API_KEY'),
    base_url=os.getenv('TONGYI_BASE_URL'),
)

history = ChatMessageHistory()
history.add_user_message("小明有3个苹果和4个李子，他一共有几个水果")
history.add_ai_message("小明一共有7个水果")
history.add_user_message("我一共问了几个问题了")

# 将历史消息传给模型
response = llm.invoke(history.messages)
print(response.content)  # 能正确回答"3个问题"
```

---

#### 2.5.2 手动维护消息列表

```python
from langchain_core.messages import HumanMessage, AIMessage

messages = []
while True:
    # 用户输入
    user_input = input("[请输入问题] ")
    messages.append(HumanMessage(content=user_input))
    
    # 模型回答
    response = llm.invoke(messages)
    print("[大模型回答]\n", response.content)
    messages.append(AIMessage(content=response.content))
    
    # 限制历史长度（防止 token 超限）
    if len(messages) > 10:
        messages = messages[-10:]
```

---

#### 2.5.3 使用 InMemorySaver（Agent 记忆）

```python
from langchain.agents import create_agent
from langgraph.checkpoint.memory import InMemorySaver
from langchain_openai import ChatOpenAI
import os

llm = ChatOpenAI(
    model="qwen-max",
    api_key=os.getenv('TONGYI_API_KEY'),
    base_url=os.getenv('TONGYI_BASE_URL'),
)

# 创建带记忆的 Agent
agent = create_agent(
    model=llm,
    checkpointer=InMemorySaver(),  # 关键：启用记忆
)

# 使用 thread_id 区分不同会话
config = {"configurable": {"thread_id": "user_001"}}

# 第一轮对话
agent.invoke(
    {"messages": [{"role": "user", "content": "我叫小明"}]},
    config=config,
)

# 第二轮对话 - 能记住上一轮的内容
result = agent.invoke(
    {"messages": [{"role": "user", "content": "我叫什么名字？"}]},
    config=config,
)
print(result['messages'][-1].content)  # 输出：你叫小明
```

---

#### 2.5.4 使用 MySQL 实现长期记忆

```python
from langchain.agents import create_agent
from langgraph.checkpoint.mysql.pymysql import PyMySQLSaver
from langchain_openai import ChatOpenAI
import os
import uuid

llm = ChatOpenAI(
    model="qwen-max",
    api_key=os.getenv('TONGYI_API_KEY'),
    base_url=os.getenv('TONGYI_BASE_URL'),
)

# 数据库连接字符串
DB_URI = f"mysql+pymysql://root:123456@localhost:3306/langchain_db?charset=utf8mb4"

with PyMySQLSaver.from_conn_string(DB_URI) as checkpointer:
    checkpointer.setup()  # 自动创建表
    
    agent = create_agent(
        llm,
        tools=[],
        checkpointer=checkpointer,
    )
    
    # 不同用户使用不同 thread_id
    config = {"configurable": {"thread_id": str(uuid.uuid4())}}
    
    # 多轮对话，历史自动保存到 MySQL
    agent.invoke(
        {"messages": [{"role": "user", "content": "你能做什么"}]},
        config=config,
    )
    agent.invoke(
        {"messages": [{"role": "user", "content": "小明有3个苹果和4个李子"}]},
        config,
    )
    result = agent.invoke(
        {"messages": [{"role": "user", "content": "我问了几个问题了"}]},
        config,
    )
    print(result['messages'][-1].content)  # 能正确回答
```

**记忆方案对比**：

| 方案 | 适用场景 | 优点 | 缺点 |
|------|----------|------|------|
| ChatMessageHistory | 单次会话 | 简单直接 | 重启丢失 |
| InMemorySaver | 开发测试 | 零配置 | 重启丢失 |
| MySQLSaver | 生产环境 | 持久化、可扩展 | 需要数据库 |
| RedisSaver | 高并发场景 | 高性能 | 需要 Redis |

---

### 2.6 Indexes（索引）

**Indexes 组件**：让 LangChain 具备处理文档的能力，是实现 RAG 的基础。

---

#### 2.6.1 整体流程

```python
┌─────────────────────────────────────────────────────────────────┐
│                        索引阶段                                  │
├─────────────────────────────────────────────────────────────────┤
│  文档 → 加载器 → 文本分割 → 向量化 → 存入向量数据库                   │
│  (PDF)  (Loader) (Splitter) (Embedding) (VectorStore)           │
└─────────────────────────────────────────────────────────────────┘
                              ⬇
┌─────────────────────────────────────────────────────────────────┐
│                        检索阶段                                  │
├─────────────────────────────────────────────────────────────────┤
│  Query → 向量化 → 相似性检索 → 返回相关文档                     	  │
│  (问题)  (Embedding) (Search)    (Top-K Documents)               │
└─────────────────────────────────────────────────────────────────┘
                              ⬇
┌─────────────────────────────────────────────────────────────────┐
│                        生成阶段                                  │
├─────────────────────────────────────────────────────────────────┤
│  Prompt (问题 + 检索到的文档) → LLM → 生成答案                      │
└─────────────────────────────────────────────────────────────────┘
```

---

#### 2.6.2 文档加载器（Document Loaders）

```python
from langchain_unstructured import UnstructuredLoader
from langchain_community.document_loaders import TextLoader, CSVLoader, PyPDFLoader

# 1. 加载文本文件
loader = TextLoader('../data/衣服属性.txt', encoding='utf8')
docs = loader.load()  # List[Document]

# 2. 加载 PDF
loader = PyPDFLoader('../data/产品手册.pdf')
docs = loader.load()

# 3. 加载 CSV
loader = CSVLoader('../data/用户数据.csv')
docs = loader.load()

# Document 结构
# Document(page_content="文本内容", metadata={"source": "文件路径"})
```

**常用加载器**：

| 加载器 | 文件类型 | 用途 |
|--------|----------|------|
| TextLoader | .txt | 纯文本 |
| CSVLoader | .csv | 表格数据 |
| PyPDFLoader | .pdf | PDF 文档 |
| UnstructuredLoader | 多种格式 | 通用加载器 |
| DirectoryLoader | 目录 | 批量加载 |

---

#### 2.6.3 文本分割器（Text Splitters）

**为什么需要分割**：

- LLM 有 token 限制（如 GPT-4 支持 128K tokens）
- 长文档需要切分成块
- 需要保持语义完整性

```python
from langchain_text_splitters import CharacterTextSplitter, RecursiveCharacterTextSplitter

# 基础分割器（按字符）
text_splitter = CharacterTextSplitter(
    separator="\n\n",  # 分隔符
    chunk_size=100,    # 每块大小
    chunk_overlap=20,  # 重叠大小（保持上下文）
)

# 递归分割器（推荐）
recursive_splitter = RecursiveCharacterTextSplitter(
    chunk_size=100,
    chunk_overlap=20,
    separators=["\n\n", "\n", "。", "，", " "]  # 优先级从高到低
)

# 使用
texts = recursive_splitter.split_text(long_text)
# 或
docs = recursive_splitter.split_documents(documents)
```

**分割器对比**：

| 分割器                            | 特点              | 适用场景      |
| ------------------------------ | --------------- | --------- |
| CharacterTextSplitter          | 按指定字符分割         | 简单文本      |
| RecursiveCharacterTextSplitter | 递归尝试不同分隔符       | **推荐使用**  |
| TokenTextSplitter              | 按 token 数分割     | OpenAI 场景 |
| PythonCodeTextSplitter         | 保留 Python 函数完整性 | 代码处理      |
| MarkdownTextSplitter           | 保留 Markdown 结构  | MD 文档     |

---

#### 2.6.4 VectorStores（向量数据库）

```python
from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import DashScopeEmbeddings
import os

# 1. 准备数据
texts = ["文本1", "文本2", "文本3"]

# 2. 创建 embedding
embeddings = DashScopeEmbeddings(
    model="text-embedding-v1",
    dashscope_api_key=os.getenv('TONGYI_API_KEY')
)

# 3. 创建向量数据库
vectorstore = Chroma.from_texts(
    texts=texts,
    embedding=embeddings,
    persist_directory="./chroma_db"  # 持久化目录
)

# 4. 相似性搜索
query = "搜索关键词"
results = vectorstore.similarity_search(query, k=2)  # 返回 Top-2

# 5. 带分数搜索
results_with_score = vectorstore.similarity_search_with_score(query, k=2)

# 6. 持久化保存
vectorstore.persist()
```

**常用向量数据库**：

| 数据库 | 特点 | 适用场景 |
|--------|------|----------|
| Chroma | 轻量级、开源 | 本地开发、小规模 |
| FAISS | 高效相似性搜索 | 大规模向量检索 |
| Pinecone | 云服务、托管 | 生产环境 |
| Milvus | 分布式、高性能 | 企业级应用 |
| Elasticsearch | 全文检索+向量 | 混合搜索 |

---

#### 2.6.5 检索器（Retriever）

```python
# 从向量数据库创建检索器
retriever = vectorstore.as_retriever(
    search_kwargs={"k": 3}  # 返回 3 个文档
)

# 检索
docs = retriever.invoke("北京大学什么时候成立的")
for doc in docs:
    print(doc.page_content)
    print(doc.metadata)
```

---

### 2.7 结构化输出（Structured Output）

**用途**：让 LLM 输出符合预定义格式的数据，便于程序处理。

```python
from langchain_openai import ChatOpenAI
from typing import Optional
from pydantic import BaseModel, Field
from langchain.agents import create_agent
import os

# 1. 定义输出结构
class PersonInfo(BaseModel):
    name: str = Field(description="人的姓名")
    age: int = Field(description="人的年龄，单位：岁")
    city: Optional[str] = Field(default=None, description="居住城市")
    hobbies: list[str] = Field(default=[], description="兴趣爱好")

# 2. 初始化 LLM
llm = ChatOpenAI(
    model="qwen-max",
    api_key=os.getenv('TONGYI_API_KEY'),
    base_url=os.getenv('TONGYI_BASE_URL'),
    temperature=0
)

# 3. 创建带结构化输出的 Agent
agent = create_agent(
    model=llm,
    response_format=PersonInfo,  # 关键：绑定输出格式
)

# 4. 调用
user_input = "我叫李明，28岁，现在住在上海，喜欢打篮球和看电影"
response = agent.invoke(
    {"messages": [{"role": "user", "content": user_input}]}
)

# 5. 获取结构化结果
result = response['structured_response']
print(f"姓名: {result.name}")
print(f"年龄: {result.age}")
print(f"城市: {result.city}")
print(f"爱好: {result.hobbies}")

# 输出：
# 姓名: 李明
# 年龄: 28
# 城市: 上海
# 爱好: ['打篮球', '看电影']
```

**应用场景**：

| 场景 | 输出结构示例 |
|------|--------------|
| 信息抽取 | `{name, age, city, occupation}` |
| 意图识别 | `{intent, entities, confidence}` |
| 摘要生成 | `{title, summary, keywords}` |
| API 调用 | `{action, parameters, reason}` |

---

## 三、使用场景与最佳实践

### 3.1 常见应用场景

|           | 应用场景             |
| --------- | ---------------- |
| RAG 知识库问答 | 企业内部文档问答、客服机器人   |
| 个人助理      | 日程管理、邮件自动回复、智能助手 |
| 聊天机器人     | 客服、教育、陪伴类机器人     |
| 信息提取      | 从非结构化文本中提取结构化数据  |
| 文档总结      | 长文档自动摘要、会议纪要     |
| 代码辅助      | 代码生成、代码审查、文档生成   |
| 数据分析      | 自然语言查询数据库、报表生成   |

---

### 3.2 RAG 完整实现示例

```python
# 完整的 RAG 流程
from langchain_community.document_loaders import TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.embeddings import DashScopeEmbeddings
from langchain_community.vectorstores import Chroma
from langchain_openai import ChatOpenAI
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import StrOutputParser
import os

# 1. 加载文档
loader = TextLoader('./data/pku.txt', encoding='utf8')
docs = loader.load()

# 2. 文档分割
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=200,
    chunk_overlap=50
)
chunks = text_splitter.split_documents(docs)

# 3. 向量化 + 存储
embeddings = DashScopeEmbeddings(
    model="text-embedding-v1",
    dashscope_api_key=os.getenv('TONGYI_API_KEY')
)
vectorstore = Chroma.from_documents(
    documents=chunks,
    embedding=embeddings,
    persist_directory="./chroma_db"
)
retriever = vectorstore.as_retriever(search_kwargs={"k": 3})

# 4. 构建 RAG Chain
llm = ChatOpenAI(
    model="qwen-max",
    api_key=os.getenv('TONGYI_API_KEY'),
    base_url=os.getenv('TONGYI_BASE_URL'),
)

prompt = PromptTemplate.from_template("""
你是一个知识渊博的助手，请根据以下参考文档回答问题。
如果文档中没有相关信息，请直接说明不知道。

参考文档：
{context}

问题：{question}
回答：
""")

# RAG Chain
rag_chain = {
    "context": lambda x: "\n\n".join([doc.page_content for doc in retriever.invoke(x["question"])]),
    "question": lambda x: x["question"]
} | prompt | llm | StrOutputParser()

# 5. 使用
answer = rag_chain.invoke({"question": "北京大学是什么时候成立的？"})
print(answer)
```

---

### 3.3 最佳实践建议

#### 3.3.1 提示词设计

```python
# ✅ 好的提示词
prompt = PromptTemplate.from_template("""
你是一个专业的{role}，请根据以下要求完成任务：
1. {requirement_1}
2. {requirement_2}

输入：{input}
输出格式：{output_format}
""")

# ❌ 不好的提示词
prompt = PromptTemplate.from_template("帮我做{task}")
```

---

#### 3.3.2 错误处理

```python
from langchain_core.tools import tool

@tool
def safe_api_call(url: str) -> dict:
    """安全的 API 调用"""
    try:
        response = requests.get(url, timeout=5)
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        return {"error": str(e), "status": "failed"}
```

---

#### 3.3.3 性能优化

| 优化点 | 方法 |
|--------|------|
| 减少 Token 消耗 | 压缩提示词、使用更小的 chunk |
| 提高检索精度 | 调整 chunk_size、使用更好的 embedding |
| 加速响应 | 启用流式输出、缓存结果 |
| 降低成本 | 选择合适的模型、复用 embedding |

---

## 四、常见问题 FAQ

### Q1：ChatOpenAI 和 Tongyi 有什么区别？

```python
# 使用 OpenAI 接口（兼容模式）
from langchain_openai import ChatOpenAI
llm = ChatOpenAI(
    model="qwen-max",          # 模型名称
    api_key=os.getenv('TONGYI_API_KEY'),
    base_url=os.getenv('TONGYI_BASE_URL'),  # 自定义 endpoint
)

# 使用官方专用接口
from langchain_community.llms import Tongyi
llm = Tongyi(
    model="qwen-max",
    dashscope_api_key=os.getenv("API_KEY"),
)
```

**推荐使用 ChatOpenAI**：接口统一，切换模型更方便。

---

### Q2：什么是 RAG？为什么要用 RAG？

RAG = Retrieval-Augmented Generation（检索增强生成）

为什么用 RAG：

1. 私有数据：企业内部文档无需微调即可使用
2. 实时更新：知识库更新即可，无需重新训练
3. 降低成本：比微调便宜得多
4. 可解释性：可以查看引用来源

RAG vs 微调：

|      | RAG    | 微调     |
| ---- | ------ | ------ |
| 数据更新 | 即时生效   | 需要重新训练 |
| 成本   | 低      | 高      |
| 可解释性 | 高（可溯源） | 低      |
| 效果   | 好      | 非常好    |

---

### Q3：chunk_size 和 chunk_overlap 如何设置？

| 参数 | 说明 | 建议值 |
|------|------|--------|
| chunk_size | 每个块的大小 | 200-500（中文） |
| chunk_overlap | 块之间的重叠 | chunk_size 的 10-20% |

**原则**：

- 太小的 chunk：丢失上下文，检索不准确
- 太大的 chunk：浪费 token，可能超过限制
- 重叠太小：语义被截断
- 重叠太大：数据冗余

---

### Q4：如何选择合适的向量数据库？

| 场景 | 推荐 |
|------|------|
| 本地开发/测试 | Chroma |
| 小规模生产（<100 万向量） | FAISS |
| 中等规模生产 | Pinecone（云）/ Milvus（自建） |
| 大规模生产（>1000 万向量） | Milvus / Elasticsearch |

---

### Q5：Agent 什么时候调用工具？

Agent 的决策流程：

```python
用户输入
    ⬇
LLM 分析意图
    ⬇
判断是否需要工具？
    ├─ 否 → 直接回答
    ⬇ 是
选择最合适的工具
    ⬇
执行工具（可能多次）
    ⬇
整合结果
    ⬇
生成最终回答
```

---

### Q6：如何处理 token 超限问题？

```python
# 方法 1：使用更小的 chunk_size
text_splitter = RecursiveCharacterTextSplitter(chunk_size=200)

# 方法 2：限制历史消息数量
if len(messages) > 10:
    messages = messages[-10:]

# 方法 3：使用总结压缩
from langchain.memory import ConversationSummaryMemory
memory = ConversationSummaryMemory(llm=llm)
```
