**下一级：** [[]]

**标签：** #RAG #LangChain

---

# LangChain 框架学习

## 一、什么是 LangChain

LangChain 由 Harrison Chase 创建于 2022 年 10 月，它是围绕 LLMs（大语言模型）建立的一个框架，LLMs 使用机器学习算法和海量数据来分析和理解自然语言，GPT4、GPT5 是 LLMs 是最先进的代表，国内字节的豆包、百度的文心一言、阿里的通义千问也属于 LLMs。

**LangChain 自身并不开发 LLMs，它的核心理念是为各种 LLMs 实现通用的接口，把 LLMs 相关的组件“链接”在一起，简化 LLMs 应用的开发难度，方便开发者快速地开发复杂地 LLMs 应用。** LangChain 目前有多个语言的实现。

---

## 二、LangChain 主要组件

![600](https://raw.githubusercontent.com/1228chl/Learning-AI-Large-Models-Notes/master/Assets/Image/AI-Large-Modlels-Notes/Agent/RAG/LangChain框架/1.2-1.png)

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

![](https://raw.githubusercontent.com/1228chl/Learning-AI-Large-Models-Notes/master/Assets/Image/AI-Large-Modlels-Notes/Agent/RAG/LangChain框架/1.2.1.2-1.png)

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

![](https://raw.githubusercontent.com/1228chl/Learning-AI-Large-Models-Notes/master/Assets/Image/AI-Large-Modlels-Notes/Agent/RAG/LangChain框架/1.2.1.3-1.png)

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

![](https://raw.githubusercontent.com/1228chl/Learning-AI-Large-Models-Notes/master/Assets/Image/AI-Large-Modlels-Notes/Agent/RAG/LangChain框架/1.2.2-1.png)

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

![](https://raw.githubusercontent.com/1228chl/Learning-AI-Large-Models-Notes/master/Assets/Image/AI-Large-Modlels-Notes/Agent/RAG/LangChain框架/1.2.2-2.png)

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

![](https://raw.githubusercontent.com/1228chl/Learning-AI-Large-Models-Notes/master/Assets/Image/AI-Large-Modlels-Notes/Agent/RAG/LangChain框架/1.2.3-1.png)

---

### 2.4 Agents (代理)

Agents 也就是代理，它的核心思想是利用一个语言模型来选择一系列要执行的动作(工具)。

在 LangChain 中 Agents 的作用就是根据用户的需求，来访问一些第三方工具(比如：搜索引擎或者数据库)，进而来解决相关需求问题。

为什么要借助第三方库？

- 因为大模型虽然非常强大，但是也具备一定的局限性，比如不能回答实时信息、处理数学逻辑问题仍然非常的初级等等。因此可以借助第三方工具来辅助大模型的应用。

![大模型调用工具的原理|400](https://raw.githubusercontent.com/1228chl/Learning-AI-Large-Models-Notes/master/Assets/Image/AI-Large-Modlels-Notes/Agent/RAG/LangChain框架/1.2.4-1.png)

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

![](https://raw.githubusercontent.com/1228chl/Learning-AI-Large-Models-Notes/master/Assets/Image/AI-Large-Modlels-Notes/Agent/RAG/LangChain框架/1.2.4-2.png)

![](https://raw.githubusercontent.com/1228chl/Learning-AI-Large-Models-Notes/master/Assets/Image/AI-Large-Modlels-Notes/Agent/RAG/LangChain框架/1.2.4-3.png)

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

![](https://raw.githubusercontent.com/1228chl/Learning-AI-Large-Models-Notes/master/Assets/Image/AI-Large-Modlels-Notes/Agent/RAG/LangChain框架/1.2.4-4.png)

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

![](https://raw.githubusercontent.com/1228chl/Learning-AI-Large-Models-Notes/master/Assets/Image/AI-Large-Modlels-Notes/Agent/RAG/LangChain框架/1.2.5.1-1.png)

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

![](https://raw.githubusercontent.com/1228chl/Learning-AI-Large-Models-Notes/master/Assets/Image/AI-Large-Modlels-Notes/Agent/RAG/LangChain框架/1.2.5.2-1.png)

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

![](https://raw.githubusercontent.com/1228chl/Learning-AI-Large-Models-Notes/master/Assets/Image/AI-Large-Modlels-Notes/Agent/RAG/LangChain框架/1.2.5.3-1.png)

---
