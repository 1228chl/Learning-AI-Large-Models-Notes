 # LangChain框架介绍 - 深度学习笔记

---

## 一、LangChain是什么？

### 1.1 诞生背景

2022年，GPT-3等大语言模型展示了强大的能力，但开发者面临一个问题：**如何将LLM集成到实际应用中？**

每个LLM的API接口不同，每次调用都是无状态的，要构建复杂的AI应用需要大量重复工作。

LangChain应运而生，它解决的核心问题是：**提供一套标准化的组件和接口，让开发者像搭积木一样快速构建LLM应用。**

### 1.2 核心设计理念

```
传统开发: 每个LLM单独对接 → 重复造轮子
LangChain: 统一接口 + 可组合组件 → 快速搭建
```

**三个核心原则**：

| 原则 | 说明 | 举例 |
|------|------|------|
| **模块化** | 每个组件职责单一，可独立使用 | Models、Prompts、Memory各自独立 |
| **可组合** | 组件之间可以自由组合 | prompt \| llm \| parser |
| **可替换** | 同一组件可以替换不同实现 | 换LLM只需改一行代码 |

---

## 二、Models（模型）深度解析

### 2.1 三类模型的本质区别

#### LLMs（大语言模型）

**底层原理**：给定前文，预测下一个最可能的token。

```
输入: "今天天气"
模型内部: P(好|今天天气) = 0.8, P(不错|今天天气) = 0.15, ...
输出: "好"
```

**数学表达**：
$$P(w_{next} | w_1, w_2, ..., w_n)$$

其中 $w_1, w_2, ..., w_n$ 是已有的token序列。

#### Chat Models（聊天模型）

**与LLMs的区别**：输入格式不同

```
LLMs输入: "你好，请问Python是什么？"
Chat Models输入: [
    {"role": "system", "content": "你是一个Python专家"},
    {"role": "user", "content": "Python是什么？"}
]
```

**为什么需要消息格式？**

LLM的训练数据包含大量对话文本，模型学习了`System/Human/AI`的角色区分。使用结构化的消息格式，模型能更好地理解对话上下文。

#### Embeddings（嵌入模型）

**底层原理**：将离散的文本映射到连续的向量空间。

```
"Python" → [0.23, -0.15, 0.67, ..., 0.12]  # 1024维向量
"编程语言" → [0.21, -0.18, 0.65, ..., 0.14]  # 语义相近，向量接近
"今天天气" → [-0.45, 0.32, 0.12, ..., -0.08]  # 语义不同，向量较远
```

**训练目标**：让语义相似的文本在向量空间中距离相近。

### 2.2 代码示例详解

```python
import os
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage

# ========== LLMs基础用法 ==========
llm = ChatOpenAI(
    model="qwen-max",           # 模型名称
    api_key=os.getenv("API_KEY"),  # API密钥
    base_url=os.getenv("BASE_URL"),  # API地址（通义千问）
    temperature=0  # 温度参数：0=确定性输出，1=随机性高
)

# 全文输出
response = llm.invoke("Python是什么？")
print(response.content)  # 输出模型的完整回答

# 流式输出（逐字返回，适合长文本）
for chunk in llm.stream("介绍一下机器学习"):
    print(chunk.content, end="", flush=True)
```

**temperature参数详解**：

| 值 | 行为 | 适用场景 |
|----|------|----------|
| 0 | 每次选择概率最高的token | 问答、代码生成 |
| 0.7 | 有一定随机性 | 创意写作 |
| 1.0 | 完全随机采样 | 探索性对话 |

```python
# ========== Chat Models多轮对话 ==========
messages = [
    SystemMessage(content="你是一个Python专家，回答要简洁专业"),
    HumanMessage(content="什么是装饰器？"),
    AIMessage(content="装饰器是一个函数，它接受一个函数作为参数并返回一个新函数"),
    HumanMessage(content="能给个例子吗？"),  # 模型能记住上下文
]

response = llm.invoke(messages)
print(response.content)
```

```python
# ========== Embeddings向量化 ==========
from langchain_community.embeddings import DashScopeEmbeddings

embedding_model = DashScopeEmbeddings(
    dashscope_api_key=os.getenv('API_KEY'),
    model="text-embedding-v3",
)

# 单个文本向量化
vector = embedding_model.embed_query("Python是编程语言")
print(f"向量维度: {len(vector)}")  # 1024维
print(f"前5个值: {vector[:5]}")    # [0.23, -0.15, 0.67, ...]

# 批量文本向量化
vectors = embedding_model.embed_documents([
    "Python是编程语言",
    "Java是编程语言",
    "今天天气真好"
])
print(f"相似度计算:")
import numpy as np
sim_12 = np.dot(vectors[0], vectors[1]) / (np.linalg.norm(vectors[0]) * np.linalg.norm(vectors[1]))
sim_13 = np.dot(vectors[0], vectors[2]) / (np.linalg.norm(vectors[0]) * np.linalg.norm(vectors[2]))
print(f"Python vs Java: {sim_12:.4f}")   # 较高（都是编程语言）
print(f"Python vs 天气: {sim_13:.4f}")   # 较低（语义不同）
```

---

## 三、Prompts（提示词）深度解析

### 3.1 为什么Prompt如此重要？

LLM是**条件概率模型**：给定前文，预测下一个最可能的token。

```
差的Prompt: "写代码"
→ 模型不知道写什么语言、什么功能、什么风格

好的Prompt: "你是一个Python专家，请写一个计算斐波那契数列的函数，要求：
1. 使用递归实现
2. 包含类型注解
3. 包含文档字符串
4. 处理边界情况"
→ 模型有明确的指导，输出质量更高
```

### 3.2 Zero-shot vs Few-shot的原理

#### Zero-shot

```python
from langchain_core.prompts import PromptTemplate

# 直接描述任务，不提供示例
prompt = PromptTemplate.from_template(
    "请将以下中文翻译成英文：{text}"
)
```

**原理**：依赖模型的预训练知识，直接理解任务。

#### Few-shot

```python
from langchain_core.prompts import FewShotPromptTemplate

# 提供示例，让模型学习模式
examples = [
    {"input": "开心", "output": "难过"},
    {"input": "高", "output": "矮"},
    {"input": "胖", "output": "瘦"},
]

example_template = PromptTemplate(
    input_variables=["input", "output"],
    template="单词: {input}\n反义词: {output}\n"
)

few_shot_prompt = FewShotPromptTemplate(
    examples=examples,
    example_prompt=example_template,
    prefix="请给出每个单词的反义词",
    suffix="单词: {input}\n反义词:",
    input_variables=["input"],
)

print(few_shot_prompt.format(input="大"))
# 输出：
# 请给出每个单词的反义词
# 单词: 开心
# 反义词: 难过
#
# 单词: 高
# 反义词: 矮
#
# 单词: 胖
# 反义词: 瘦
#
# 单词: 大
# 反义词:
```

**原理**：利用LLM的**上下文学习（In-Context Learning）**能力。模型从示例中自动学习"输入→输出"的映射模式。

### 3.3 PromptTemplate的工程价值

```python
# 问题：硬编码的Prompt无法复用
prompt_bad = "你是一个Python专家，请回答：什么是装饰器？"

# 解决：使用模板，参数化
prompt_good = PromptTemplate(
    template="你是一个{domain}专家，请回答：{question}",
    input_variables=["domain", "question"]
)

# 同一个模板，不同参数
print(prompt_good.format(domain="Python", question="什么是装饰器？"))
print(prompt_good.format(domain="Java", question="什么是多态？"))
print(prompt_good.format(domain="数据库", question="什么是索引？"))
```

---

## 四、Memory（记忆）深度解析

### 4.1 LLM为什么没有记忆？

LLM是**无状态的函数**：每次调用都是独立的，模型不会保留之前的信息。

```python
# 第一次调用
response1 = llm.invoke("我叫张三")
print(response1.content)  # "你好，张三！"

# 第二次调用（模型不知道你叫张三）
response2 = llm.invoke("我叫什么？")
print(response2.content)  # "我不知道你叫什么"
```

**ChatGPT的解决方案**：每次请求都发送完整的对话历史。

```python
# 第一次调用
messages = [{"role": "user", "content": "我叫张三"}]

# 第二次调用（包含历史）
messages = [
    {"role": "user", "content": "我叫张三"},
    {"role": "assistant", "content": "你好，张三！"},
    {"role": "user", "content": "我叫什么？"}  # 包含历史
]
```

### 4.2 短期记忆 vs 长期记忆

| 类型 | 存储位置 | 生命周期 | 容量限制 | 适用场景 |
|------|----------|----------|----------|----------|
| **短期记忆** | 内存 | 单次会话 | 有限（受上下文窗口限制） | 聊天对话 |
| **长期记忆** | 数据库 | 跨会话 | 几乎无限 | 用户画像、历史偏好 |

### 4.3 记忆管理策略

```python
# 策略1：保留最近N轮
messages = []  # 对话历史
MAX_HISTORY = 10

def add_message(role, content):
    messages.append({"role": role, "content": content})
    if len(messages) > MAX_HISTORY:
        messages.pop(0)  # 删除最早的

# 策略2：Token计数限制
import tiktoken

def count_tokens(messages):
    encoder = tiktoken.encoding_for_model("gpt-4")
    total = 0
    for msg in messages:
        total += len(encoder.encode(msg["content"]))
    return total

def trim_history(messages, max_tokens=4000):
    while count_tokens(messages) > max_tokens:
        messages.pop(0)  # 删除最早的
    return messages
```

---

## 五、Chains（链）深度解析

### 5.1 为什么需要链？

单个LLM调用能力有限，复杂任务需要**多步骤协作**。

```
简单任务: 用户问题 → LLM → 答案
复杂任务: 用户问题 → 分类 → 检索 → LLM → 后处理 → 答案
```

**Chain的本质**：定义组件之间的**数据流**，前一个组件的输出作为后一个组件的输入。

### 5.2 LCEL（LangChain Expression Language）

```python
from langchain_core.prompts import PromptTemplate
from langchain_openai import ChatOpenAI
from langchain_core.output_parsers import StrOutputParser

# 定义组件
prompt = PromptTemplate.from_template("请用一句话解释：{concept}")
llm = ChatOpenAI(model="qwen-max")
parser = StrOutputParser()

# 使用 | 符号构建链
chain = prompt | llm | parser

# 执行
result = chain.invoke({"concept": "什么是装饰器"})
print(result)
```

**底层执行流程**：
```
1. prompt.invoke({"concept": "什么是装饰器"})
   → "请用一句话解释：什么是装饰器"

2. llm.invoke("请用一句话解释：什么是装饰器")
   → AIMessage(content="装饰器是Python中...")

3. parser.invoke(AIMessage(content="装饰器是Python中..."))
   → "装饰器是Python中..."
```

### 5.3 多步骤链

```python
# 第一条链：起名字
first_prompt = PromptTemplate.from_template("给姓{lastname}的孩子起一个名字")

# 第二条链：起小名
second_prompt = PromptTemplate.from_template("给{child_name}起一个小名")

# 串联
chain = first_prompt | llm | second_prompt | llm | StrOutputParser()

# 执行
result = chain.invoke({"lastname": "张"})
print(result)  # 输出小名
```

**执行流程**：
```
"张"
→ first_prompt格式化 → "给姓张的孩子起一个名字"
→ llm生成 → "张明轩"
→ second_prompt格式化 → "给张明轩起一个小名"
→ llm生成 → "小名：轩轩"
→ StrOutputParser提取 → "小名：轩轩"
```

---

## 六、Agents（代理）深度解析

### 6.1 Agent的工作机制

Agent的核心思想是**让LLM自己决定调用什么工具**：

```
用户: "今天深圳天气怎么样？"
     ↓
LLM思考: 需要查询天气 → 选择get_weather工具
     ↓
Agent调用: get_weather("深圳")
     ↓
工具返回: {"temp": "25℃", "weather": "晴"}
     ↓
LLM生成: "深圳今天晴天，25℃"
```

### 6.2 @tool装饰器的原理

```python
from langchain.tools import tool

@tool
def get_weather(city: str):
    """查询城市天气"""  # 这个描述会被LLM读取
    return {"temp": "25℃", "weather": "晴"}
```

**底层**：装饰器将函数的名称、参数类型、文档字符串转换为LLM能理解的**函数定义（JSON Schema）**。

```python
# @tool装饰后的函数会生成类似这样的JSON Schema
{
    "name": "get_weather",
    "description": "查询城市天气",
    "parameters": {
        "type": "object",
        "properties": {
            "city": {"type": "string", "description": "城市名称"}
        },
        "required": ["city"]
    }
}
```

---

## 七、Indexes（索引）深度解析

### 7.1 为什么需要索引？

LLM的**上下文窗口有限**（如GPT-4支持128K token），无法一次性处理整个知识库。

**解决方案**：RAG（检索增强生成）
1. 将知识库切分为小块（Chunking）
2. 将每个块转换为向量（Embedding）
3. 存储到向量数据库
4. 查询时只检索最相关的块

### 7.2 文档分割的语义原则

```python
from langchain_text_splitters import RecursiveCharacterTextSplitter

# 递归分割器：按语义边界切分
splitter = RecursiveCharacterTextSplitter(
    chunk_size=200,      # 每个块最大200字符
    chunk_overlap=20,    # 块之间重叠20字符
    separators=["\n\n", "\n", "。", "！", "？", "，", " "]  # 分隔符优先级
)

text = """Python是一种解释型、面向对象的高级编程语言。
它由Guido van Rossum于1991年发布。
Python的设计哲学强调代码的可读性和简洁性。"""

chunks = splitter.split_text(text)
for i, chunk in enumerate(chunks):
    print(f"块{i+1} ({len(chunk)}字符): {chunk}")
```

**分隔符优先级**：
1. `\n\n`（双换行）：段落边界
2. `\n`（单换行）：句子边界
3. `。` `！` `？`：中文句号
4. `，`：中文逗号
5. 空格：词边界

### 7.3 向量检索的数学原理

```
查询: "Python是什么？"
  ↓ Embedding
查询向量: [0.23, -0.15, 0.67, ...]
  ↓ 与所有文档向量计算余弦相似度
文档1相似度: 0.95  ← 最高，返回
文档2相似度: 0.72
文档3相似度: 0.31
```

---

## 八、完整代码示例

### 8.1 简单问答链

```python
import os
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

# 1. 初始化模型
llm = ChatOpenAI(
    model="qwen-max",
    api_key=os.getenv("API_KEY"),
    base_url=os.getenv("BASE_URL")
)

# 2. 创建提示模板
prompt = ChatPromptTemplate.from_messages([
    ("system", "你是一个{domain}专家，请用简洁的语言回答问题"),
    ("user", "{question}")
])

# 3. 创建输出解析器
parser = StrOutputParser()

# 4. 构建链
chain = prompt | llm | parser

# 5. 调用
result = chain.invoke({
    "domain": "Python",
    "question": "什么是装饰器？"
})
print(result)
```

### 8.2 带记忆的对话

```python
from langchain_core.messages import HumanMessage, AIMessage

# 对话历史
history = []

def chat(question):
    # 添加用户消息
    history.append(HumanMessage(content=question))
    
    # 调用模型
    response = llm.invoke(history)
    
    # 添加AI回复
    history.append(AIMessage(content=response.content))
    
    return response.content

# 测试
print(chat("我叫张三"))
print(chat("我是做什么工作的？"))  # 模型不知道
```

---

## 九、学习要点

| 组件 | 底层原理 | 实践要点 |
|------|----------|----------|
| **Models** | 条件概率模型、向量编码 | 根据场景选择LLM/Chat/Embedding |
| **Prompts** | 上下文学习、概率引导 | 设计清晰的指令和示例 |
| **Memory** | LLM无状态，外部管理历史 | 选择合适的记忆策略 |
| **Chains** | 组件间的数据流编排 | 使用LCEL构建工作流 |
| **Agents** | LLM自主选择工具 | 设计清晰的工具描述 |
| **Indexes** | 有限上下文下的检索增强 | 合理切分文档 |