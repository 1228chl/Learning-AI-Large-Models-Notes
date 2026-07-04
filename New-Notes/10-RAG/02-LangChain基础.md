# LangChain基础

**标签：** #LangChain #LLM

---

## 1. 什么是LangChain

LangChain是一个LLM应用开发框架，为各种LLMs提供统一接口，将组件"链接"在一起。

| 项目 | 内容 |
|------|------|
| **创建者** | Harrison Chase |
| **创建时间** | 2022年10月 |
| **定位** | LLM应用开发框架 |
| **支持语言** | Python、JavaScript/TypeScript |

---

## 2. 核心组件

### 2.1 Models（模型层）

LangChain支持三种模型类型：

| 类型 | 输入 | 输出 | 使用场景 |
|------|------|------|----------|
| LLMs | 文本字符串 | 文本字符串 | 文本生成 |
| Chat Models | 聊天消息 | 聊天消息 | 对话系统 |
| Embedding Models | 文本 | 浮点数向量 | 语义搜索 |

### 2.2 LLMs调用示例

```python
from langchain_openai import ChatOpenAI

# 初始化模型
llm = ChatOpenAI(
    model="gpt-4",
    api_key="your-api-key",
    temperature=0
)

# 同步调用
response = llm.invoke("什么是机器学习？")
print(response.content)
```

### 2.3 Prompts（提示词模板）

```python
from langchain_core.prompts import ChatPromptTemplate

template = ChatPromptTemplate.from_template(
    "你是一个{role}，请回答：{question}"
)

prompt = template.invoke({
    "role": "Python专家",
    "question": "什么是装饰器？"
})
```

### 2.4 Chains（链）

```python
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

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
```
