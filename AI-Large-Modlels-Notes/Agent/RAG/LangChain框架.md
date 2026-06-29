**下一级：** [[]]

**标签：** #RAG

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

### 2.1 Models

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

### 2.2 Prompts

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
