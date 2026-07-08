
# LangChain 框架学习

## 一、什么是 LangChain

LangChain 由 Harrison Chase 创建于 2022 年 10 月，它是围绕 LLMs（大语言模型）建立的一个框架，LLMs 使用机器学习算法和海量数据来分析和理解自然语言，GPT4、GPT5 是 LLMs 是最先进的代表，国内字节的豆包、百度的文心一言、阿里的通义千问也属于 LLMs。

**LangChain 自身并不开发 LLMs，它的核心理念是为各种 LLMs 实现通用的接口，把 LLMs 相关的组件“链接”在一起，简化 LLMs 应用的开发难度，方便开发者快速地开发复杂地 LLMs 应用。** LangChain 目前有多个语言的实现。

---

## 二、LangChain 主要组件



一个 LangChain 的应用是需要多个组件共同实现的，LangChain 主要支持 6 种组件：

- Models：模型，各种类型的模型和模型集成，比如 GPT-4
- Prompts：提示词，包括提示管理、提示优化和提示序列化
- Memory：记忆，用来保存和模型交互时的上下文状态
- Indexes：索引，用来结构化文档，以便和模型交互
- Chains：链，一系列对各种组件的调用
- Agents：代理，决定模型采取哪些行动，执行并且观察流程，直到完成为止

---

### 2.1 Models(模型)

LangChain 目前支持三种类型的模型：`LLMs`、`Chat Models(聊天模型)` 、`Embeddings Models(嵌入模型)`。

- LLMs：大语言模型接收文本字符作为输入，返回的也是文本字符。
- Chat Models：基于 LLMs，不同的是它接收聊天消息(一种特定格式的数据)作为输入，返回的也是聊天消息。
- Embeddings Models：文本嵌入模型接收文本作为输入，返回的是浮点数列表。
LangChain 支持的三类模型，它们的使用场景不同，输入和输出不同，开发者需要根据项目选择相应的。

---

#### 2.1.1 LLMs(大语言模型)

LLMs 使用场景最多，常用的大模型下载库：[HuggingFace](https://huggingface.co/models)

下面使用「通义千问」模型为例，使用其模型组件：

- 第一步：安装必备的工具包

```properties
pip install openai langchain langchain-openai
```

> 注意，在使用 openai 模型之前，必须开通百炼平台的服务，需要获得 api-key，具体参考。[接入商用大模型 API](https://vinctchanx.feishu.cn/wiki/ZUf1w9u5FioTzZkDsSWcDhCXnUh)

- 第二步：使用 LangChain 模块实现大模型调用

```python
import os
from langchain_community.llms import Tongyi
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(
    model="qwen-max",
    api_key=os.getenv("API_KEY"),
    base_url=os.getenv("BASE_URL"),
    temperature=0
)

*# llm = Tongyi(*
*#     api_key=os.getenv("API_KEY"),*
*#     base_url=os.getenv("BASE_URL"),*
*#     model="qwen3-max"*
*# )*

*# 全文输出*
*# print(llm.invoke("给我说说一夜暴富有哪些方法"))*
print(llm.invoke("hello"))

*# 流式输出*
for chunk in llm.stream("你是什么模型"):
    print(chunk, end="", flush=True, sep="\n")
```

---

#### 2.1.2 Chat Models(聊天模型)

聊天消息包含下面几种类型，使用时需要按照约定传入合适的值：

- AIMessage：就是 AI 输出的消息，可以是针对问题的回答。
- HumanMessage：就是用户信息，由人给出的信息发送给 LLMs 的提示信息。
- SystemMessage：用于指定模型具体所处的环境和背景。
- ChatMessage：Chat 消息可以接收任意角色的参数，但是大部分都是使用上面的三种类型。

Eg：

```python
from langchain_openai import ChatOpenAI
import os
from langchain_core.messages import HumanMessage, AIMessage

llm = ChatOpenAI(
    base_url=os.getenv("BASE_URL"),
    api_key=os.getenv("API_KEY"),
    model="qwen-max"
)

messages = [
    HumanMessage("告诉我有哪些一夜暴富的方法？"),
    AIMessage("年轻人要脚踏实地"),
    HumanMessage("我现在等不及了，需要快速致富，直接告诉我方法？"),
    AIMessage("你太急了，先去工作，等钱回来再开吃"),
    HumanMessage("我刚刚问了几个问题了？"),
]
response = llm.invoke(messages)
print(response)
print(response.content)
```

Result：



---

#### 2.1.3 Embeddings Models(嵌入模型)

Embeddings Models 特点：将字符串作为输入，返回一个浮点数的列表。在 NLP 中，Embedding 的作用就是将数据进行文本向量化。

Embeddings Models 可以为文本创建向量映射，这样就能在向量空间里去考虑文本，执行诸如语义搜索之类的操作。

Eg：

```python
from langchain_community.embeddings import DashScopeEmbeddings  *# 百炼平台*
import os

embedding_model = DashScopeEmbeddings(
    dashscope_api_key=os.getenv('API_KEY'),
    model="text-embedding-v3",
)

print(embedding_model.embed_query("AI好啊，得学啊"))
print(embedding_model.embed_documents(["AI好啊，得学啊", "hello world"]))
```

Result：



以上代码中，分别使用了两种方法进行向量化，其中的不同点在于：

- `embed_query()`接收一个字符串的输入
- `embed_documents` 可以接收一组字符串

LangChain 集成的文本嵌入模型有：

- AzureOpenAI、Baidu Qianfan、Hugging Face Hub、OpenAI、Llama-cpp、SentenceTransformers

---

### 2.2 Prompts(提示词)

Prompt 是指用户输入给模型的提示词，这个提示词的形式可以是 `zero-shot` 或者 `few-shot`，目的是让模型能理解更加复杂的业务场景以便更好的解决问题。

提示模板：如果你有了一个起作用的提示，可以当成是一个模板，用于解决其他类似的问题，LangChain 提供了 `PromptTemplates` 组件，可以更方便的构建提示。

- zero-shot 提示方式：

```python
from langchain_core.prompts import PromptTemplate
from langchain_openai import ChatOpenAI
import os

llm = ChatOpenAI(
    base_url=os.getenv("BASE_URL"),
    api_key=os.getenv("API_KEY"),
    model="qwen-max"
)

prompt = PromptTemplate.from_template(
    """我的邻居姓{lastname},他生了个儿子，给他儿子起一个名字"""
)
prompt_text = prompt.format_prompt(lastname="张")
print(prompt_text)

print(llm.invoke(prompt_text))
```

Result：



- few-shot 提示方式：

```python
from langchain_core.prompts import PromptTemplate, FewShotPromptTemplate
from langchain_openai import ChatOpenAI
import os

examples = [
    {"word": "开心", "antonym": "难过"},
    {"word": "高", "antonym": "矮"},
    {"word": "胖", "antonym": "瘦"},
]

example_template = """
单词: {word}
反义词: {antonym}\\n
"""
# 1. 先构造示例模板*
example_prompt = PromptTemplate(
    input_variables=["word", "antonym"],
    template=example_template,
)
# 创建 few-shot 模板*
# prompt = prefix + examples + suffix + input*
few_shot_prompt = FewShotPromptTemplate(
    examples=examples,  # 示例*
	example_prompt=example_prompt,  # 示例模板*
	prefix="给出每个单词的反义词，直接输出答案",  # 前缀任务描述*
	suffix="单词: {input}\\n反义词:",  # 后缀*
	input_variables=["input"],
    example_separator="\\n",
)

prompt_text = few_shot_prompt.format(input="夯")
print(prompt_text)
print('*' * 80)
# 给出每个单词的反义词
# 单词: 开心
# 反义词: 难过

# 单词: 高
# 反义词: 矮

# 单词: 粗
# 反义词:

# 调用OpenAI
llm = ChatOpenAI(
    model="qwen3-max",
    api_key=os.getenv('API_KEY'),
    base_url=os.getenv("BASE_URL"),
    extra_body={"enable_thinking": False}
)
print(llm.invoke(prompt_text))

# 细
```

Result：



---

### 2.3 Chains(链)

Chains 是**将 LLM 与其他组件结合起来完成一个应用程序的过程**。

针对上一小节的提示模版例子，zero-shot 里面，我们可以用链来连接提示模版组件和模型，进而可以实现代码的更改：

```python
from langchain_core.prompts import PromptTemplate
from langchain_openai import ChatOpenAI
import os

llm = ChatOpenAI(
    api_key=os.getenv("API_KEY"),
    model="qwen-max"
    base_url=os.getenv("BASE_URL")
)

prompt = PromptTemplate(
    template="我的邻居姓{lastname}，他生了个儿子，给他儿子起一个名字，起3个最好听的名字",
    input_variables=["lastname"],
)

# chain = LLMChain(llm=llm, prompt=prompt)
# print(chain.run("张))

chain = prompt | llm
print(chain.invoke({"lastname": "张"}).content)
```

下面看多个调用的例子：

```python
from langchain.chat_models import init_chat_model
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_openai import ChatOpenAI
import os

# llm = ChatOpenAI(
#     api_key=os.getenv("API_KEY"),
#     model="qwen3.5-flash",
#     base_url=os.getenv("BASE_URL"),
#     extra_body={"enable_thinking": False}
# )

llm = init_chat_model(
    model="qwen3-max",
    api_key=os.getenv('API_KEY'),
    base_url=os.getenv("BASE_URL"),
    model_provider="openai",
)

# 创建第一条链
first_prompt = PromptTemplate.from_template("我的邻居姓{lastname}，他生了个儿子，给他儿子起个名字")

# 创建第二条链
second_prompt = PromptTemplate.from_template(
    "邻居的儿子名字叫{child_name}，给他起一个小名，输出对应的大名和推荐的小名",
)

# 链接两条链
chain = first_prompt | llm | second_prompt | llm | StrOutputParser()

# 执行链，只需要传入第一个参数
output = chain.invoke({"lastname": "孙"})
print(output)
# print(output.content)
```

Result：



---

### 2.4 Agents (代理)

Agents 也就是代理，它的核心思想是利用一个语言模型来选择一系列要执行的动作(工具)。

在 LangChain 中 Agents 的作用就是根据用户的需求，来访问一些第三方工具(比如：搜索引擎或者数据库)，进而来解决相关需求问题。

为什么要借助第三方库？

- 因为大模型虽然非常强大，但是也具备一定的局限性，比如不能回答实时信息、处理数学逻辑问题仍然非常的初级等等。因此可以借助第三方工具来辅助大模型的应用。



现在我们实现一个使用代理的例子：假设我们想查询一下中国目前有多少人口？我们可以使用多个代理工具，让 Agents 选择执行。代码如下：

```python
# pip install duckduckgo-search

import os
from langchain_openai import ChatOpenAI
from langchain.agents import create_agent
# from langchain_core.prompts import ChatPromptTemplate, PromptTemplate
from langchain_community.tools import DuckDuckGoSearchRun

# 初始化工具
ddg_search = DuckDuckGoSearchRun()

# 实例化大模型
llm = ChatOpenAI(
    api_key=os.getenv("API_KEY"),
    model="qwen3-max",
    base_url=os.getenv("BASE_URL"),
    extra_body={"enable_thinking": False}
)

agent = create_agent(
    model=llm,
    tools=[ddg_search],
    system_prompt="""你是一个有用的个人助手，根据用户的输入内容选择对应的工具，解答用户的问题"""
)

print('agent', agent)

# 代理Agent工作
response = agent.invoke(
    {"messages": [
        {"role": "user", "content": "中国目前有多少人口"}
    ]}
)
for msg in response["messages"]:
    print(msg)

# for chunk in agent.stream(
#         {"messages": [
#             {"role": "user", "content": "2025年中国目前有多少人口"}
#         ]}
# ):
#     print(chunk)
```

Result：





也可以调用自定义工具，使用装饰器的方法，用 tool 装饰在自定义的函数上，实现工具定义：

```python
from langchain.tools import tool
from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI
import os
from langchain.agents import create_agent
import requests


@tool
def write_file(file_path: str, content: str):
    """
	把content写入文件路径file_path
	"""
	with open(file_path, "w") as writer:
        writer.write(content)

    print(f"写入文件{file_path} 成功")


@tool
def read_file(file_path):
    """
	读取本地文件，返回文件里的内容
    """
	with open(file_path) as reader:
        return reader.read()


@tool
def multiply(a: int, b: int) -> int:
    """用于计算两个整数的乘积。"""
	print(f"正在执行乘法: {a} * {b}")
    return a * b


@tool
def add(a: int, b: int) -> int:
    """用于计算两个整数的乘积。"""
	print(f"正在执行加法: {a} + {b}")
    return a + b


llm = ChatOpenAI(
    model="qwen3-max",
    api_key=os.getenv('API_KEY'),
    base_url=os.getenv("BASE_URL"),
)


@tool
def get_weather(city: str):
    """查询城市天气"""
    # 13adb1710d764d2abc30a5b234923a6f
	url = "https://m459fcyb7c.re.qweatherapi.com/v7/weather/now"
    city_code_map = {
        "上海": "101020100",
        "北京": "101010100",
        "广州": "101280101",
        "深圳": "101280601",
    }
    response = requests.get(url, params={
        "location": city_code_map.get(city, "101280601"),
    }, headers={"X-QW-Api-Key": os.getenv("WEATHER_KEY")})
    # return f"{city} 当前天气：晴天 25℃"  # 模拟
    return response.json()


tools = [get_weather, add, multiply, write_file, read_file]

agent = create_agent(
    model=llm,
    tools=tools,
    system_prompt="你是系统助手，需要根据用户的输入决定是否调用工具完成任务"
)

# messages = agent.invoke({"messages": messages})
# for each in messages["messages"]:
#     print(each)

# print(agent.invoke({"messages": HumanMessage(content="详细介绍下什么是langchain框架，写入本地文件，名字自己起一个")}))

messages = [{"role": "user", "content": "帮我算 5 * 6，然后查一下深圳的天气"}]
# messages = [{"role": "user", "content": "详细介绍下注意力机制，写入到本地文件，格式为markdown"}]
# messages = [{"role": "user", "content": "帮我算 5 加 6，然后读取本地的 _01_agent_search.py，总结下读取文件里面的内容"}]

# 工具的流式返回
for chunk in agent.stream({"messages": messages}):
    print(chunk)
```

Result：



---

### 2.5 Memory(记忆)

大模型本身不具备上下文的概念，它并不保存上次交互的内容，ChatGPT 之所以能够和人正常沟通对话，因为它进行了一层封装，将历史记录回传给了模型。

因此 LangChain 也提供了 Memory 组件, Memory 分为两种类型：**短期记忆和长期记忆**。短期记忆一般指单一会话时传递数据，长期记忆则是处理多个会话时获取和更新信息，**通常长期记忆需要把用户的问答数据存放到数据库中，根据用户的 id 或者会话 id 或者最近的对话历史。**

#### 2.5.1 使用 ChatMessageHistory

目前的 Memory 组件只需要考虑 ChatMessageHistory。举例分析：

```python
from langchain_community.chat_message_histories import ChatMessageHistory
from langchain_openai import ChatOpenAI
import os

llm = ChatOpenAI(
    model="qwen-max",
    api_key=os.getenv('API_KEY'),
    base_url=os.getenv("BASE_URL"),
)

history = ChatMessageHistory()
history.add_user_message("你能做什么")
history.add_ai_message("你好，我能做的事情很多")
history.add_user_message("小明有3个苹果和4个李子，他一共有几个水果")
history.add_ai_message("小明一共有7个水果")
history.add_user_message("我一共问了几个问题了")
print(history.messages)

# print(llm.invoke(history.messages))
# content='到目前为止，您一共问了3个问题。第一个问题是关于我能做什么，第二个问题是关于小明有多少个水果，第三个就是当前这个问题，询问您一共问了多少个问题。'
```

Result：



---

#### 2.5.2 messages 列表

直接手写 messages 列表，完成多轮对话

```python
from langchain.messages import HumanMessage, AIMessage
from langchain_openai import ChatOpenAI
import os

llm = ChatOpenAI(
    model="qwen3-max",
    api_key=os.getenv('API_KEY'),
    base_url=os.getenv("BASE_URL"),
    extra_body={"enable_thinking": False}
)

messages = [
    HumanMessage(content="你好"),
    AIMessage(content="你好，有什么可以帮你？"),
    HumanMessage(content="LangChain 是什么？"),
    AIMessage(content="LangChain 是一个开源的 LLM 应用开发框架，用于构建 LLM 应用。"),
    HumanMessage(content="我问了几个问题了？"),
]

response = llm.invoke(messages)
print(response.content)
# messages = []
# while True:
#     messages.append(
#         HumanMessage(content=input("[请输入问题]"))
#     )
#     response = llm.invoke(messages)
#     print("[大模型回答]\n", response.content)
#     messages.append(AIMessage(content=response.content))
#
#     if len(messages) > 5:
#         messages = messages[-5:]
#
#     print("\n当前历史对话：")
#     for msg in messages:
#         print(f"{msg.content}")
```

Result：



---

#### 2.5.3 使用 InMemorySaver

```python
from langchain.agents import create_agent
from langgraph.checkpoint.memory import InMemorySaver
from langchain_openai import ChatOpenAI
import os

llm = ChatOpenAI(
    model="qwen-max",
    api_key=os.getenv('API_KEY'),
    base_url=os.getenv("BASE_URL"),
)

agent = create_agent(
    model=llm,
    checkpointer=InMemorySaver(),
)
print("agent对象：", agent)
config = {"configurable": {"thread_id": "1"}}
print(agent.invoke(
    {"messages": [{"role": "user", "content": "你能做什么"}]},
    config=config,
))
print(agent.invoke(
    {"messages": [{"role": "user", "content": "小明有3个苹果和4个李子，他一共有几个水果"}]},
    config,
))
result = agent.invoke(
    {"messages": [{"role": "user", "content": "我问了几个问题了"}]},
    {"configurable": {"thread_id": "1"}},
)
print(result['messages'][-1].content)
```

Result：



---
#### 2.5.4 使用 MySQL 实现长期记忆
```python
from langchain.agents import create_agent
from langgraph.checkpoint.mysql.pymysql import PyMySQLSaver
from langchain_openai import ChatOpenAI
import os
import uuid  # 模拟创建用户id

llm = ChatOpenAI(
    model="qwen-max",
    api_key=os.getenv('API_KEY'),
    base_url=os.getenv("BASE_URL"),
)

# 注意：这里使用的是 pymysql 驱动
# http://baidu.com
DB_URI = f"mysql+pymysql://root:{os.getenv("PASSWORD")}@localhost:3306/langchain_db" # ORM

# 使用上下文管理器初始化 MySQL 连接
# MySQLSaver 通常会自动处理表的创建，或者你可以显式调用 setup 方法（取决于具体版本）
with PyMySQLSaver.from_conn_string(DB_URI) as checkpointer:
    # 确保数据库表已创建 (视版本而定，部分版本自动创建)
    checkpointer.setup()

    agent = create_agent(
        llm,
        tools=[],
        checkpointer=checkpointer,  # 传入 MySQL 检查点实例
    )

    # 在这里调用 agent 进行测试
    # agent.invoke(...)
    print(agent)
    config = {"configurable": {"thread_id": uuid.uuid4()}}
    print(agent.invoke(
        {"messages": [{"role": "user", "content": "你能做什么"}]},
        config=config,
    ))
    print(agent.invoke(
        {"messages": [{"role": "user", "content": "小明有3个苹果和4个李子，他一共有几个水果"}]},
        config,
    ))
    result = agent.invoke(
        {"messages": [{"role": "user", "content": "我问了几个问题了"}]},
        config,
    )
    print(result['messages'][-1].content)
```

Result：

---
### 2.6 Indexes(索引)
Indexes 组件的目的是让 LangChain 具备处理文档处理的能力，包括：文档加载、检索等。注意，这里的文档不局限于 txt、pdf 等文本类内容，还涵盖 email、区块链、图片等内容。

Indexes 组件主要包含类型：

- 文档加载器
- 文本分割器
- VectorStores
- 检索器

---
#### 2.6.1 文档加载器
文档加载器主要基于 `Unstructured` 包，`Unstructured` 是一个 python 包，可以把各种类型的文件转换成文本。

文档加载器使用起来很简单，只需要引入相应的 loader 工具：

```Python
"""
如果报错，检查安装包
pip install en_core_web_sm-3.8.0-py3-none-any.whl
"""
# from langchain_community.document_loaders import UnstructuredFileLoader

from langchain_unstructured import UnstructuredLoader

# 创建一个加载器
loader = UnstructuredLoader('../data/衣服属性.txt', encoding='utf8')
# 加载
docs = loader.load()  # 返回是列表 List[Document]
print(docs)
print(len(docs))
first_01 = docs[0].page_content[:10]
print(first_01)
print('*' * 80)

from langchain_community.document_loaders import TextLoader

loader = TextLoader('../data/衣服属性.txt', encoding='utf8')
docs = loader.load()  # 返回是列表 List[Document]
print(docs)
print(len(docs))
first_01 = docs[0].page_content[:10]
print(first_01)

# 打印结果：
'''
[Document(page_content='身高：160-170cm， 体重：90-115斤，建议尺码M。\n身高：165-175cm， 体重：115-135斤，建议尺码L。\n身高：170-178cm， 体重：130-150斤，建议尺码XL。\n身高：175-182cm， 体重：145-165斤，建议尺码2XL。\n身高：178-185cm， 体重：160-180斤，建议尺码3XL。\n身高：180-190cm， 体重：180-210斤，建议尺码4XL。\n面料分类：其他\n图案：纯色\n领型：翻领\n衣门襟：单排扣\n颜色：黑色 卡其色 粉色 杏色\n袖型：收口袖\n适用季节：冬季\n袖长：长袖\n厚薄：厚款\n适用场景：其他休闲\n衣长：常规款\n版型：宽松型\n款式细节：假两件\n工艺处理：免烫处理\n适用对象：青年\n面料功能：保暖\n穿搭方式：外穿\n销售渠道类型：纯电商(只在线上销售)\n材质成分：棉100%', metadata={'source': '衣服属性.txt'})]
1
身高：1
********************************************************************************
[Document(page_content='身高：160-170cm， 体重：90-115斤，建议尺码M。\n\n身高：165-175cm， 体重：115-135斤，建议尺码L。\n\n身高：170-178cm， 体重：130-150斤，建议尺码XL。\n\n身高：175-182cm， 体重：145-165斤，建议尺码2XL。\n\n身高：178-185cm， 体重：160-180斤，建议尺码3XL。\n\n身高：180-190cm， 体重：180-210斤，建议尺码4XL。\n\n面料分类：其他\n\n图案：纯色\n\n领型：翻领\n\n衣门襟：单排扣\n\n颜色：黑色 卡其色 粉色 杏色\n\n袖型：收口袖\n\n适用季节：冬季\n\n袖长：长袖\n\n厚薄：厚款\n\n适用场景：其他休闲\n\n衣长：常规款\n\n版型：宽松型\n\n款式细节：假两件\n\n工艺处理：免烫处理\n\n适用对象：青年\n\n面料功能：保暖\n\n穿搭方式：外穿\n\n销售渠道类型：纯电商(只在线上销售)\n\n材质成分：棉100%', metadata={'source': '衣服属性.txt'})]
1
身高：1
'''
```
LangChain 支持的文档加载器 (部分)：

| 文档加载器                | 描述           |
| -------------------- | ------------ |
| CSV                  | CSV文件        |
| JSON Files           | 加载JSON文件     |
| Jupyter Notebook     | 加载notebook文件 |
| Markdown             | 加载markdown文件 |
| Microsoft PowerPoint | 加载ppt文件      |
| PDF                  | 加载pdf文件      |
| Images               | 加载图片         |
| File Directory       | 加载目录下所有文件    |
| HTML                 | 网页           |

---
#### 2.6.2 文档分割器
由于模型对输入的字符长度有限制，我们在碰到很长的文本时，需要把文本分割成多个小的文本片段。

文本分割最简单的方式是按照字符长度进行分割，但是这会带来很多问题，比如说如果文本是一段代码，一个函数被分割到两段之后就成了没有意义的字符，所以整体的原则是把语义相关的文本片段放在一起。

LangChain 中最基本的文本分割器是 `CharacterTextSplitter` ，它按照指定的分隔符（默认“\n\n”）进行分割，并且考虑文本片段的最大长度。我们看个例子：

```Python
from langchain_text_splitters import CharacterTextSplitter, RecursiveCharacterTextSplitter

text_splitter = CharacterTextSplitter(
    separator=" ",  # 空格分割，但是空格也属于字符
    chunk_size=5,
    chunk_overlap=0,
)

# 一句分割
a = text_splitter.split_text("a b c d e f")
print(a)
# ['a b c', 'd e f']

# 多句话分割（文档分割）
texts = text_splitter.create_documents(["a b c d e f", "e f g h"], )
print(texts)
# [Document(page_content='a b c'), Document(page_content='d e f'), Document(page_content='e f g'), Document(page_content='h')]
text_splitter = CharacterTextSplitter(
    chunk_size=50,
    chunk_overlap=5,
)
recursive_text_splitter = RecursiveCharacterTextSplitter(chunk_size=50, chunk_overlap=5)
text = """2023年以来，随着ChatGPT的火爆，使得LLM成为研究和应用的热点，但是市面上大部分LLM都存在一个共同的问题：
模型都是基于过去的经验数据进行训练完成，无法获取最新的知识，以及各企业私有的知识。因此很多企业为了处理私有的知识，
主要借助一下两种手段来实现

利用企业私有知识，基于开源大模型进行微调
基于LangChain集成向量数据库以及LLM搭建本地知识库的问答（RAG）
RAG（Retrieval-Augmented Generation）检索增强生成，在不改变模型权重的情况下，提升大模型生成能力。
用户query 会从知识库中检索出相关文档，大模型依据文档生成用户的 query 回答。这样可以实现低成本提升大模型的回复能力。
RAG 核心点在于知识库的构建和检索策略。

索引阶段

加载文件
内容提取
文本分割 ，形成chunk
文本向量化
存向量数据库
检索阶段

query向量化
在文本向量中匹配出与问句向量相似的top_k个
生成阶段
匹配出的文本作为上下文和问题一起添加到prompt中
提交给LLM生成答案：
"""
print("RecursiveCharacterTextSplitter", "==" * 50)
for chunk in recursive_text_splitter.create_documents([text]):
    print(f"[{len(chunk.page_content)}]", chunk.page_content)
    print("======" * 10)

print("CharacterTextSplitter", "==" * 50)
for chunk in text_splitter.create_documents([text]):
    print(f"[{len(chunk.page_content)}]", chunk.page_content)
    print("======" * 10)
```

- CharacterTextSplitter：只能依据单个分隔符，无法保证chunk size小于指定大小

除了CharacterTextSplitter分割器，LangChain还支持其他文档分割器 (部分)：

| 文档加载器                  | 描述                           |
| ---------------------- | ---------------------------- |
| LatexTextSplitter      | 沿着Latex标题、标题、枚举等分割文本。        |
| MarkdownTextSplitter   | 沿着Markdown的标题、代码块或水平规则来分割文本。 |
| TokenTextSplitter      | 根据openAI的token数进行分割          |
| PythonCodeTextSplitter | 沿着Python类和方法的定义分割文本。         |

---
#### 2.6.3 VectorStores
VectorStores 是一种特殊类型的数据库，它的作用是存储由嵌入创建的向量，提供相似查询等功能。我们使用其中一个 `Chroma` 组件作为例子：

代码的步骤：

```Python
from langchain_community.embeddings import DashScopeEmbeddings
from langchain_text_splitters import CharacterTextSplitter
from langchain_community.vectorstores import Chroma
import os

# pku.txt内容：<https://www.pku.edu.cn/about.html>
# 1. 读取文档
with open('../data/pku.txt') as f:
    state_of_the_union = f.read()
# 文档分割
text_splitter = CharacterTextSplitter(chunk_size=100, chunk_overlap=0)

texts = text_splitter.split_text(state_of_the_union)
print(texts)

# 3. 向量化，创建embedding模型
embeddings = DashScopeEmbeddings(
    model="text-embedding-v1",  # text-embedding-v3
    dashscope_api_key=os.getenv('API_KEY')
)

# 4. 创建向量数据库
docsearch = Chroma.from_texts(texts, embeddings, persist_directory="outputs/chroma.db")

query = "1937年北京大学发生了什么？"
docs = docsearch.similarity_search(query, k=2)
print("长度为", len(docs), docs)

'''
[Document(page_content='1937年卢沟桥事变后，北京大学与清华大学、南开大学南迁长沙，共同组成国立长沙临时大学。1938年，临时大学又西迁昆明，更名为国立西南联合大学。抗日战争胜利后，北京大学于1946年10月在北平复员。'), Document(page_content='北京大学创办于1898年，是戊戌变法的产物，也是中华民族救亡图存、兴学图强的结果，初名京师大学堂，是中国近现代第一所国立综合性大学，辛亥革命后，于1912年改为现名。'), Document(page_content='在悠久的文明历程中，古代中国曾创立太学、国子学、国子监等国家最高学府，在中国和世界教育史上具有重要影响。北京大学“上承太学正统，下立大学祖庭”，既是中华文脉和教育传统的传承者，也标志着中国现代高等教育的开端。其创办之初也是国家最高教育行政机关，对建立中国现代学制作出重要历史贡献。'), Document(page_content='1917年，著名教育家蔡元培就任北京大学校长，他“循思想自由原则，取兼容并包主义”，对北京大学进行了卓有成效的改革，促进了思想解放和学术繁荣。陈独秀、李大钊、毛泽东以及鲁迅、胡适、李四光等一批杰出人士都曾在北京大学任教或任职。')]
'''
# 创建检索器
retriever = docsearch.as_retriever(search_kwargs={"k": 2})
print("长度为", len(docs), retriever.invoke(query))
```

LangChain支持的VectorStore如下：


| VectorStore   | 描述                                          |
| ------------- | ------------------------------------------- |
| Chroma        | 一个开源嵌入式数据库                                  |
| ElasticSearch | ElasticSearch                               |
| Milvus        | 用于存储、索引和管理由深度神经网络和其他机器学习（ML）模型产生的大量嵌入向量的数据库 |
| Redis         | 基于redis的检索器                                 |
| FAISS         | Facebook AI相似性搜索服务                          |
| Pinecone      | 一个具有广泛功能的向量数据库                              |

---
#### 2.6.4 检索器

检索器是一种便于模型查询的存储数据的方式，LangChain 约定检索器组件至少有一个方法 `invoke`，这个方法接收查询字符串，返回一组文档。

```Python
from langchain_text_splitters import CharacterTextSplitter
from langchain_community.vectorstores import Chroma
from langchain_community.document_loaders import TextLoader
from langchain_community.embeddings import DashScopeEmbeddings
import os

loader = TextLoader('../data/pku.txt')
documents = loader.load()
text_splitter = CharacterTextSplitter(chunk_size=100, chunk_overlap=0)
texts = text_splitter.split_documents(documents)

embeddings = DashScopeEmbeddings(
    model="text-embedding-v1",  # text-embedding-v3
    dashscope_api_key=os.getenv('API_KEY')
)

db = Chroma.from_documents(texts, embeddings, persist_directory="outputs/Chroma.db")
retriever = db.as_retriever(search_kwargs={'k': 1})
docs = retriever.invoke("北京大学什么时候成立的")
print(docs)

# 打印结果：
'''
[Document(metadata={'source': 'data/pku.txt'}, page_content='北京大学创办于1898年，是戊戌变法的产物，也是中华民族救亡图存、兴学图强的结果，初名京师大学堂，是中国近现代第一所国立综合性大学，辛亥革命后，于1912年改为现名。')]
'''
```

---
### 2.7 结构化输出

LangChain 提供了 结构化输出（Structured Output） 的功能，允许你将大语言模型（LLM）的自由文本响应强制转换为预定义的结构（如 Pydantic 模型、JSON Schema 等），非常适合用于信息抽取、问答解析、API 调用等场景

例如：**从用户输入文本中提取姓名、年龄和城市**

```Python
from langchain_openai import ChatOpenAI
from typing import Optional
from pydantic import BaseModel, Field  # 数据模型，数据结构。做数据类型类型校验，尤其是API接口
from langchain.agents import create_agent
import os


# 第一步：定义你想要的输出结构（Pydantic 模型）
class PersonInfo(BaseModel):
    name: str = Field(description="人的姓名")
    age: int = Field(description="人的年龄，单位：岁")
    city: Optional[str] = Field(default=None, description="居住城市")


# 第二步：初始化 LLM
llm = ChatOpenAI(
    model="qwen-max",
    api_key=os.getenv("API_KEY"),
    base_url=os.getenv("BASE_URL"),
    temperature=0)

# 第三步：绑定结构化输出格式
agent = create_agent(
    model=llm,
    response_format=PersonInfo,  # 绑定结构化输出格式
)

# 第四步：调用
user_input = "我叫李明，我喜欢打篮球，看NBA，我今年28岁，先谢谢谢谢，之前住在深圳，现在住在上海。"
response = agent.invoke(
    {"messages": [{"role": "user", "content": user_input}]}
)

# 输出结果
print(response)
result = response['structured_response']

# 可以直接访问字段
print(f"姓名: {result.name}, 年龄: {result.age}, 城市: {result.city}")
```

---
## 三、LangChain 使用场景

- 个人助手：siri，小爱同学
- 基于文档的问答系统：RAG
- 聊天机器人
- Tabular 数据查询
- API 交互
- 信息提取
- 文档总结