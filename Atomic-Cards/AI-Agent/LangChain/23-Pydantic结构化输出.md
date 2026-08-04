---
author: "XunZong"
created: "2026-07-30"
tags: ["AI-Agent", "Pydantic", "结构化输出", "LangChain"]
aliases: ["with_structured_output", "结构化输出", "Pydantic结构化", "Function Calling"]
---

# Pydantic 结构化输出与大模型集成

## 定义

**结构化输出（Structured Output）** 是通过 LangChain 的 `with_structured_output` 方法，让大模型**严格按照 Pydantic 模型的结构来填空**，直接返回 Pydantic 对象（而不是自由文本），从而避免手动解析 JSON 的繁琐和易错。

### 核心公式

```
结构化输出 = Pydantic 模型（字段+类型+description） + with_structured_output + method="function_calling"
```

### 直观理解

> 普通 LLM 调用好比"让实习生写一段报告"——你需要自己从一堆文字里提取关键信息。结构化输出好比"让实习生填一张表格"——表格的每一列已经画好，他只需要填空，你直接拿走表格就能用。

## 三步实现

### 第一步：定义 Pydantic 模型

```python
from pydantic import BaseModel, Field

class PersonInfo(BaseModel):
    name: str = Field(description="姓名")
    age: int = Field(description="年龄（整数）")
    city: str = Field(description="所在城市")
```

### 第二步：绑定到大模型

```python
from langchain.chat_models import init_chat_model

llm = init_chat_model(
    model="deepseek-chat",
    model_provider="openai",
    api_key="sk-...",
    base_url="https://api.deepseek.com/v1",
    temperature=0,
)

# 绑定 Pydantic 模型，method="function_calling" 必须写
structured_llm = llm.with_structured_output(PersonInfo, method="function_calling")
```

### 第三步：调用并直接使用

```python
from langchain_core.messages import SystemMessage, HumanMessage

messages = [
    SystemMessage(content="你负责从文本中抽取人物信息。"),
    HumanMessage(content="我叫小明，今年 25 岁，住在上海。"),
]

# 调用后直接返回 PersonInfo 对象，不是文本！
result: PersonInfo = await structured_llm.ainvoke(messages)
print(result.name)   # 小明
print(result.age)    # 25
print(result.city)   # 上海
```

## description 的关键作用

大模型通过读取 Pydantic 模型的**字段名 + 类型 + description** 来理解"每个字段该填什么"。因此：

> **写 Pydantic 模型 = 设计大模型的输出格式 = 写提示词的一部分。**

`description` 写得越清楚，大模型填得越准：

```python
class EducationItem(BaseModel):
    school:   str = Field(description="学校名称")
    major:    str = Field(description="专业名称")
    degree:   str = Field(description="学历：本科/专科/硕士等")
    duration: str = Field(description="在校时间，如 2020.09 - 2024.06")
    gpa:      str = Field(default="", description="GPA 或成绩（可选）")
```

当大模型看到 `duration` 的 `description` 是"在校时间，如 2020.09 - 2024.06"，连日期格式都被约束住了。

## 嵌套模型与列表

真实业务的数据往往是"模型套模型"：

```python
class EducationItem(BaseModel):
    school: str = Field(description="学校名称")
    major:  str = Field(description="专业名称")

class Resume(BaseModel):
    name:      str                = Field(description="姓名")
    education: list[EducationItem] = Field(default_factory=list)  # 教育经历列表

# 创建时，嵌套部分可以直接用字典
resume = Resume(
    name="小明",
    education=[
        {"school": "清华大学", "major": "计算机"},
        {"school": "北京大学", "major": "软件工程"},
    ],
)
print(resume.education[0].school)  # 清华大学（自动转成了 EducationItem 对象）
```

## 常见坑与技巧

### 坑一：列表需要包装一层

`with_structured_output` 要求顶层是一个**对象**，不能直接是"裸列表"：

```python
# ❌ 错误：不能直接让 LLM 返回 list
class IssueList(BaseModel):
    items: list[IssueItem]  # ✅ 正确：包一层，items 是列表

# 用 IssueList 作为结构化输出模型
structured_llm = llm.with_structured_output(IssueList, method="function_calling")
```

### 坑二：返回 None 需要重试

`with_structured_output` 偶尔会"偷懒"——模型不调用工具、直接用文字回复，返回 `None`：

```python
for attempt in range(2):
    try:
        result = await structured_llm.ainvoke([...])
        if result is None:
            raise ValueError("structured output returned None")
        break
    except Exception as e:
        if attempt == 0:
            await asyncio.sleep(1)  # 等1秒重试
        else:
            # 两次都失败 → 降级
            result = DefaultModel().model_dump()
```

### 坑三：method 必须指定

DeepSeek 不支持 `json_schema` 模式，所以必须写 `method="function_calling"`：

```python
# ✅ 正确
structured_llm = llm.with_structured_output(MyModel, method="function_calling")
# ❌ 错误：DeepSeek 不支持
structured_llm = llm.with_structured_output(MyModel, method="json_schema")
```

## 模型转字典

要存数据库或放 JSON 时，用 `.model_dump()`：

```python
result = await structured_llm.ainvoke(messages)
d = result.model_dump()  # Pydantic 对象 → 字典
# d = {"name": "小明", "age": 25, "city": "上海"}
```

## 面试追问

**Q1（基础）**：with_structured_output 的作用是什么？为什么 method="function_calling" 必须写？
**回答要点**：
1. 让大模型严格按照 Pydantic 模型的结构填空，直接返回 Pydantic 对象
2. DeepSeek 不支持 json_schema 模式，必须指定 method="function_calling"

**Q2（深挖）**：为什么说 Pydantic 模型的 description 字段是"让大模型输出结构化数据"的关键？
**回答要点**：
1. 大模型会读取字段名 + 类型 + description 作为填空指令
2. description 写得越清楚，大模型填得越准
3. 写 Pydantic 模型 = 设计大模型的输出格式 = 写提示词的一部分

**Q3（实战）**：结构化输出返回 None 是什么原因？如何处理？
**回答要点**：
1. 原因：模型偶尔不调用 Function Calling 工具，直接用文字回复
2. 处理：判 None + 重试 2 次，两次都失败后用默认值降级

**Q4（边界）**：为什么不能直接让 structured_output 返回一个裸列表？如何解决？
**回答要点**：
1. with_structured_output 要求顶层是一个对象，不能是裸列表
2. 解决方法：包一层对象，如 `IssueList { items: list[IssueItem] }`

## 参考引用
- 需要理解 LangChain 基础用法的相关知识，参见 [LangChain六大组件](../LangChain/04-LangChain六大组件.md)
- 需要理解 Pydantic BaseModel 和 Field 基础用法的相关知识，参见 [Python 工具](../../Python/工具/xx-Pydantic基础.md)
- 需要理解结构化输出在 LLM-as-Judge 评分中的应用，参见 [LLM-as-Judge 评估模式](../基础/32-LLM-as-Judge评估模式.md)
- 需要理解提示词工程中如何设计结构化输出的约束指令，参见 [提示词工程核心原则](../基础/06-提示词工程核心原则.md)