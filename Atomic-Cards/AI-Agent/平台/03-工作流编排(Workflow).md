---
author: "XunZong"
created: "2026-07-08"
tags: ["AI-Agent", "工作流", "编排", "LLM"]
aliases: ["Workflow Orchestration", "Agent Workflow", "工作流编排"]
---

# 工作流编排（Workflow Orchestration）

## 定义

**工作流编排**是指将多个 AI 组件（LLM、工具、知识库、人机交互）组织为一个有向无环图（DAG）或状态机，定义各节点的执行顺序、数据流转和条件分支，以实现复杂任务自动化执行。

在 AI Agent 系统中，工作流编排是 Agent 的"骨架"——它定义了"规划 → 调用工具 → 整合结果 → 生成回答"的完整执行链路。

### 数学形式

一个工作流可表示为有向图 $\mathcal{G} = (\mathcal{V}, \mathcal{E})$，其中：
- $\mathcal{V} = \{v_1, v_2, \dots, v_n\}$ 为节点集，每个节点是一个可执行单元（LLM 调用、工具调用、代码执行、条件判断等）
- $\mathcal{E} \subseteq \mathcal{V} \times \mathcal{V}$ 为有向边，定义数据流向和执行依赖

每个节点的执行定义为函数 $f_i: \text{Input}_i \to \text{Output}_i$，完整工作流的输出为：

$$
\text{Output} = f_n \circ f_{n-1} \circ \cdots \circ f_1(\text{Input})
$$

### 直观理解

> 工作流编排好比"菜谱"：菜谱规定了每个步骤做什么（节点）、步骤之间的先后顺序（依赖）、根据食材情况调整做法（条件分支），最终保证做出一道完整的菜（Agent 输出）。

## 核心组件与流程

| 组件 | 功能 | 在 Agent 中的角色 | 示例 |
|:-----|:-----|:------------------|:-----|
| **LLM 节点** | 执行推理/生成 | "大脑"——理解用户意图、决策 | ChatOpenAI、ChatAnthropic |
| **工具节点** | 调用外部 API/函数 | "手"——执行具体操作 | 搜索 API、代码执行、数据库查询 |
| **知识库节点** | 检索相关信息 | "记忆"——提供上下文知识 | 向量检索、SQL 查询 |
| **条件节点** | 控制流分支 | "调度器"——根据条件选择路径 | if/else、switch |
| **代码节点** | 执行自定义代码 | "计算器"——数据处理 | Python 脚本、数据转换 |
| **人机交互节点** | 等待用户输入 | "接口"——人工介入 | 确认、澄清、补充信息 |

## 工作流模式分类

| 模式 | 结构特征 | 适用场景 | 典型案例 |
|:-----|:---------|:---------|:---------|
| **线性流水线** | 节点顺序执行，无分支 | 确定性流程 | 数据清洗 → 分词 → 分类 |
| **并行扇出** | 一个输入分发给多个并行节点 | 多路检索 | 同时查询 FAQ + 向量库 + 搜索引擎 |
| **条件分支** | 根据条件选择路径 | 意图分流 | 分类器判断后走不同处理链路 |
| **循环迭代** | 节点可重复执行 | 多轮优化 | Reflection 自反思、ReAct 多轮工具调用 |
| **状态机** | 状态驱动转换 | 复杂对话管理 | 客服机器人的多轮对话状态管理 |

## ML/DL 应用场景

| 应用场景 | 数学形式 | 说明 |
|:---------|:---------|:-----|
| RAG 检索增强生成 | 查询 → 检索 → 融合 → 生成 | 最典型的工作流模式 |
| ReAct Agent | Thought → Action → Observation 循环 | LLM 驱动的推理-行动迭代 |
| 多步推理 | 问题分解 → 子问题求解 → 答案合成 | 复杂任务拆解（如数学应用题） |
| 自我反思 | 生成 → 评估 → 修正 循环 | 提升输出质量的迭代优化 |

## 代码示例

### LangChain 工作流（链式）

```python
from langchain.chains import LLMChain, SimpleSequentialChain
from langchain.prompts import PromptTemplate
from langchain.llms import OpenAI

# 步骤1：生成摘要
template1 = "请为以下文本生成一个简短的摘要：\n{text}"
chain1 = LLMChain(
    llm=OpenAI(),
    prompt=PromptTemplate(input_variables=["text"], template=template1)
)

# 步骤2：根据摘要生成标题
template2 = "根据以下摘要，生成一个标题：\n{summary}"
chain2 = LLMChain(
    llm=OpenAI(),
    prompt=PromptTemplate(input_variables=["summary"], template=template2)
)

# 串行执行：文本 → 摘要 → 标题
overall_chain = SimpleSequentialChain(chains=[chain1, chain2])
result = overall_chain.run("这里是一篇长文本...")
```

### 条件分支（LangGraph 风格）

```python
from typing import TypedDict, Literal
from langgraph.graph import StateGraph, END

class AgentState(TypedDict):
    query: str
    classification: str
    result: str

# 定义节点函数
def classify_query(state: AgentState) -> AgentState:
    # 使用 LLM 或规则分类用户意图
    # 返回 'faq' 或 'rag' 或 'math' 等
    state['classification'] = 'faq'
    return state

def faq_handler(state: AgentState) -> AgentState:
    state['result'] = "FAQ 回答..."
    return state

def rag_handler(state: AgentState) -> AgentState:
    state['result'] = "RAG 检索回答..."
    return state

# 定义路由函数（条件分支）
def route(state: AgentState) -> Literal["faq", "rag"]:
    return state['classification']  # 根据分类决定走哪条分支

# 构建工作流图
graph = StateGraph(AgentState)
graph.add_node("classify", classify_query)
graph.add_node("faq", faq_handler)
graph.add_node("rag", rag_handler)

graph.set_entry_point("classify")
graph.add_conditional_edges("classify", route)  # 条件路由
graph.add_edge("faq", END)
graph.add_edge("rag", END)

app = graph.compile()
```

## 面试追问

**Q1（基础）**：工作流编排和普通函数调用的区别是什么？
**回答要点**：

1. 工作流编排支持**状态管理**和**多步依赖**，适用于长流程任务
2. 普通函数是"单步"执行，工作流是"多步组合"的执行图
3. 工作流支持**分支/并行/循环**等控制流，普通函数调用是线性的

**Q2（深挖）**：LangChain 的 Chain 和 LangGraph 的工作流有什么区别？
**回答要点**：

1. Chain 是**线性/序列化**的执行方式，结构简单但灵活性受限
2. LangGraph 基于**图结构**，支持条件分支、循环、并行，更接近状态机
3. LangGraph 更适合**多轮交互**和**复杂 Agent** 场景

**Q3（实战）**：设计一个 RAG 工作流，需要包含哪些关键节点？
**回答要点**：

1. **查询理解**：改写、意图识别、子问题分解
2. **多路检索**：FAQ + 向量库 + 搜索引擎 并行检索
3. **融合与重排序**：多路结果合并 → 重排序 → 筛选 Top-K
4. **生成与验证**：LLM 生成回答 → 事实性校验

**Q4（边界）**：工作流编排在什么情况下会失效？
**回答要点**：

1. **分支爆炸**：条件过多导致工作流图过于复杂，难以维护
2. **级联错误**：前序节点错误会逐级传播，导致最终输出质量下降
3. **性能瓶颈**：串行节点过多导致端到端延迟过高，需要并行优化

## 参考引用

- 需要理解 Agent 的整体架构与定义，参见 [Agent 定义与核心公式](../基础/01-Agent定义与核心公式.md)
- 需要掌握 RAG 流程中的检索与生成衔接，参见 [RAG 三阶段流程](../RAG流程/01-RAG三阶段流程.md)
- 需要了解 LangChain 如何实现工作流编排，参见 [LangChain 六大组件](../LangChain/01-LangChain六大组件.md)
- 需要理解并行处理与性能优化，参见 [GPU 并行与混合精度](../../深度学习/训练优化/01-GPU并行与混合精度.md)
- 需要了解分布式任务调度与容错，参见 [Docker 基础与容器化](../../Tools/Docker/01-Docker基础与容器化.md)
