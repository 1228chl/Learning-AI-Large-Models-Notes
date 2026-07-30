---
author: "XunZong"
created: "2026-07-30"
tags: ["Python", "Pydantic", "数据建模", "类型校验", "结构化输出"]
aliases: ["Pydantic", "BaseModel", "Field", "数据校验", "Data Modeling"]
---

# Pydantic 数据建模与结构化输出

## 定义

Pydantic 是 Python 中基于类型注解的数据校验库。开发者通过继承 `BaseModel` 并用类型注解声明每个字段的期望类型，Pydantic 自动完成**类型校验**、**类型强制转换**和**精确到字段级别的错误报告**，将手写 `isinstance` 检查的代码量从 $O(n)$ 降至 $O(1)$。

在 AI Agent 系统中，Pydantic 承担两个核心角色：

1. **LLM 结构化输出**：通过 LangChain 的 `with_structured_output` 将 Pydantic 模型作为 LLM 输出格式约束，使 LLM 严格按照预定义结构"填空"
2. **配置与接口校验**：用 `BaseSettings` 从 `.env` 文件读取环境变量，用 Pydantic 模型定义 FastAPI 的请求/响应格式

### 数据处理流水线

Pydantic 的数据处理遵循以下流程：

$$ \text{原始数据}\ \xrightarrow{\text{类型注解声明}}\ \text{校验与转换}\ \xrightarrow{\text{失败: ValidationError}}\ \text{成功: 类型化实例} $$

其中校验与转换阶段：先尝试类型强制转换（如字符串 `"18"` 自动转为整数 $18$），失败则抛出 `ValidationError` 并精确报告出错的字段和原因。

## 核心机制

| 机制 | 语法 | 作用 | EduAgent 应用 |
|------|------|------|-------------|
| BaseModel | `class M(BaseModel)` | 声明数据模式，自动校验与转换 | 所有 Agent 的数据结构基类 |
| Field.description | `Field(description="...")` | 给 LLM 的精确填空指令 | 简历提取、试卷评分的输出结构定义 |
| default_factory | `Field(default_factory=list)` | 可变默认值防共享污染 | 列表字段一律使用 |
| 嵌套模型 | `list[SubModel]` | 组合复杂层次结构 | `ResumeStructured` 嵌套教育/项目/工作经历 |
| model_dump | `.model_dump()` | 模型实例转纯字典 | 所有 Agent 结果持久化到 PostgreSQL |
| Enum | `class Stage(str, Enum)` | 限定字段为固定取值集合 | 面试阶段、Agent 类型路由 |
| BaseSettings | `class Settings(BaseSettings)` | 从 .env 读配置并自动校验类型 | config.py 管理数据库地址、API Key、端口 |

## 直观理解

> 把 Pydantic 想象成一扇"智能安检门"：你只需在门上贴好标签（类型注解 + description），所有通过的数据自动接受检查。合格的放行并变成标准格式，不合格的立刻被拦下并告诉你错在哪里。当这扇门对着 LLM 时，标签上的文字就成为给 LLM 的"填空题说明"。

## Field.description：LLM 结构化输出的关键

当 LangChain 调用 `with_structured_output` 时，LLM 会读取 Pydantic 模型的**字段名 + 类型 + description**，将其作为填空指令：

```python
from pydantic import BaseModel, Field

class EducationItem(BaseModel):
    """单条教育经历，由 LLM 从简历文本中提取"""
    school:   str = Field(description="学校名称")
    major:    str = Field(description="专业名称")
    degree:   str = Field(description="学历：本科/专科/硕士等")  # 示例约束输出格式
    duration: str = Field(description="在校时间，如 2020.09 - 2024.06")
    gpa:      str = Field(default="", description="GPA 或成绩（可选）")
```

LLM 读取到 `degree`（字符串，「学历：本科/专科/硕士等」）后，会在简历文本中定位学历信息，并按 description 中的枚举示例规范输出格式。description 中提供的格式示例直接约束 LLM 的输出一致性。

> **核心洞察**：写 Pydantic 模型 = 设计 LLM 的输出格式 = 写提示词的一部分。description 写得越精确，LLM 输出越一致。

## default_factory 与可变默认值陷阱

```python
from pydantic import BaseModel, Field

class Article(BaseModel):
    title: str = Field(description="标题")
    tags:  list[str] = Field(default_factory=list, description="标签")  # 正确：每次新建独立列表
    # 错误写法：tags: list[str] = Field(default=[], ...)  ← 所有实例共享同一列表对象

a = Article(title="Python 入门")
print(a.tags)  # [] —— 每次实例化都生成独立空列表
```

若使用 `default=[]`，该列表在类定义时创建一次，所有实例共享同一个引用。往实例 a 的列表添加元素后，实例 b 的默认列表也会包含该元素，产生跨实例数据污染。

## 嵌套模型与模型导出

```python
from pydantic import BaseModel, Field

class EducationItem(BaseModel):
    school: str = Field(description="学校名称")

class Resume(BaseModel):
    name: str = Field(description="姓名")
    education: list[EducationItem] = Field(default_factory=list)  # 嵌套模型列表

# 嵌套字典自动转换为子模型对象
resume = Resume(name="小明", education=[{"school": "清华大学"}])
print(type(resume.education[0]))  # <class 'EducationItem'>  ← 字典自动提升为对象
print(resume.education[0].school) # 清华大学  ← 可用点号访问嵌套属性

# 模型 → 字典：持久化到数据库或返回 JSON 响应
data = resume.model_dump()
print(data)  # {'name': '小明', 'education': [{'school': '清华大学'}]}
```

## AI/ML 工程应用场景

| 应用场景 | 使用的 Pydantic 机制 | 说明 |
|---------|---------------------|------|
| LLM 结构化信息抽取 | BaseModel + Field(description) + with_structured_output | 简历提取姓名/学历/项目经历，试卷提取答案要点与得分 |
| API 请求/响应校验 | BaseModel + FastAPI 类型注解 | 自动校验请求体字段类型，生成 OpenAPI 交互文档 |
| 配置管理 | BaseSettings + .env 文件 | 数据库地址、API Key 等敏感信息集中管理，类型自动校验 |
| Agent State 序列化 | model_dump() + 嵌套模型 | LangGraph 节点间传递结构化状态，持久化到 PostgreSQL JSONB 列 |
| 限定枚举语义 | Enum 作为字段类型 | 面试阶段（WARMUP/TECH_BASE/PROJECT/CLOSING）、Agent 类型路由确保合法取值 |

## 面试追问

**Q1（基础）**：Pydantic 解决的核心问题是什么？与手写 isinstance 检查相比的核心优势？

**回答要点**：

1. Pydantic 通过类型注解声明数据结构，自动完成校验、类型强制转换和精确错误报告
2. 代码量从 $O(n)$ 降至 $O(1)$——每个字段不再需要独立的 isinstance 检查
3. 自动类型转换：字符串 "18" → 整数 18，无需手动调用 int()
4. 错误信息精确到字段级别（"age: Input should be a valid integer"），无需手动拼接

**Q2（深挖）**：为什么 Field 的 description 是让 LLM 输出结构化数据的关键？with_structured_output 是如何利用它的？

**回答要点**：

1. with_structured_output 将 Pydantic 模型的完整元数据（字段名、类型注解、description）传递给 LLM 作为填空指令
2. LLM 根据 description 的语义描述和格式示例，在输入文本中定位对应信息并规范输出格式
3. description 中提供枚举候选值（"本科/专科/硕士"）或格式示例（"2020.09 - 2024.06"）直接约束 LLM 输出一致性
4. 写 Pydantic 模型的过程本质上是写提示词——每个 Field 的 description 就是对该字段的精确指令

**Q3（实战）**：default_factory=list 和 default=[] 的区别是什么？可变默认值陷阱如何复现？

**回答要点**：

1. default=[] 在类定义时创建一次列表对象，所有实例共享同一引用；default_factory=list 每次实例化时调用工厂函数生成独立的新列表
2. 复现：a = Model(); a.tags.append("python"); b = Model(); print(b.tags) → 使用 default=[] 时 b.tags 会包含 "python"
3. 这是一般 Python 可变默认参数问题的 Pydantic 版本，所有列表、字典、集合字段必须使用 default_factory
4. EduAgent 规范：凡是列表/字典字段一律用 default_factory

**Q4（边界）**：Pydantic v2 的 model_dump() 替代了 v1 的什么方法？有哪些常用参数控制序列化行为？

**回答要点**：

1. model_dump() 替代 v1 的 .dict() 方法；model_dump_json() 替代 .json()
2. 排除敏感字段：model_dump(exclude={"password", "internal_id"}) 或设置 model_config 中 fields 的 exclude=True
3. 排除未设置字段：model_dump(exclude_unset=True) 仅输出显式赋值的字段
4. JSON 兼容模式：model_dump(mode="json") 确保 datetime 等类型转为 ISO 字符串而非 Python 对象

## 参考引用

- 需要理解 Pydantic 的 description 如何通过 LangChain 传递给 LLM：[Pydantic 结构化输出](../../AI-Agent/LangChain/23-Pydantic结构化输出.md)
- 需要理解 Python 面向对象基础（继承机制、类型注解语法）：[继承与 MRO](../OOP/12-继承与MRO.md)
- 需要理解 LLM Factory 中如何使用 BaseSettings 实现配置管理：[LLM Factory 设计模式](../../AI-Agent/工程实践/01-LLM Factory设计模式.md)
- 需要理解配置中心与异常体系中 BaseSettings 的环境变量加载机制：[配置中心与异常体系设计](../../AI-Agent/工程实践/03-配置中心与异常体系设计.md)
- 需要理解 Pydantic 模型如何作为 LangGraph State 的类型定义：[LangGraph 图模型四要素](../../AI-Agent/LangGraph/01-LangGraph图模型四要素.md)
