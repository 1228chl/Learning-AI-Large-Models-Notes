---
tags: [LLM/Agent/应用架构]
parent_moc: [[核心依赖链]]
aliases: [AI Agent, 智能体, 工具调用]
layer: 层级5-工程应用
prerequisites: [LLM, 工具调用]
successers: [自主系统, 任务自动化]
---

# 深度卡片：AI Agent

## L1：是什么（定义/公式/结构）

### 严谨定义
AI Agent是以大语言模型为驱动，具备自主理解、感知、决策和执行能力的智能体。与LLM的区别：LLM只能生成文本，Agent可以调用工具与环境交互，完成复杂任务。

### 核心架构

```
用户输入 → LLM（大脑） → 规划 → 工具调用 → 执行 → 结果 → 反馈
```

### 核心组件

| 组件 | 作用 | 实现 |
|------|------|------|
| LLM（大脑） | 理解、推理、决策 | GPT-4、Claude |
| 工具（Tools） | 扩展能力 | 搜索、计算、API |
| 记忆（Memory） | 存储信息 | 上下文、向量数据库 |
| 规划（Planning） | 任务分解 | 思维链、ReAct |

### 工作流程

1. **感知**：理解用户输入
2. **规划**：分解任务为子步骤
3. **执行**：调用工具完成子任务
4. **反思**：评估结果，调整策略
5. **迭代**：重复直到任务完成

---

## L2：为什么（设计意图/解决什么问题）

### 为什么需要Agent？

**问题1：LLM无法执行动作**

LLM只能生成文本，无法：
- 搜索互联网获取最新信息
- 执行代码进行精确计算
- 调用API获取实时数据

Agent通过工具调用扩展LLM的能力。

**问题2：复杂任务需要多步推理**

简单提示难以处理需要多步推理的复杂任务。Agent可以：
- 将复杂任务分解为子任务
- 逐步执行并收集结果
- 根据中间结果调整策略

**问题3：需要与环境交互**

某些任务需要与外部环境交互：
- 读取/写入文件
- 查询数据库
- 控制设备

Agent通过工具接口与环境交互。

### Agent vs 简单提示

| 特性 | 简单提示 | Agent |
|------|----------|-------|
| 步骤 | 单步 | 多步 |
| 工具 | 无 | 可调用工具 |
| 反馈 | 无 | 根据结果调整 |
| 适用 | 简单任务 | 复杂任务 |

---

## L3：怎么用（代码实现/调参/场景）

### LangChain实现

```python
from langchain_openai import ChatOpenAI
from langchain.agents import create_tool_calling_agent, AgentExecutor
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.tools import tool

# 定义工具
@tool
def search(query: str) -> str:
    """搜索互联网获取最新信息"""
    return f"搜索结果：{query}的最新信息..."

@tool
def calculate(expression: str) -> str:
    """计算数学表达式"""
    return str(eval(expression))

tools = [search, calculate]

# 创建Agent
llm = ChatOpenAI(model="gpt-4")
prompt = ChatPromptTemplate.from_messages([
    ("system", "你是一个有帮助的助手，可以使用工具来回答问题。"),
    ("human", "{input}"),
    ("placeholder", "{agent_scratchpad}"),
])

agent = create_tool_calling_agent(llm, tools, prompt)
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

# 使用
result = agent_executor.invoke({"input": "今天北京的天气怎么样？"})
print(result["output"])
```

---

## L4：坑在哪（边界条件/失效场景/常见误解）

### 常见误解

| 误解 | 正确理解 | 后果 |
|------|----------|------|
| "Agent能自主决策" | Agent的行为由提示词控制 | 过度信任 |
| "Agent不会犯错" | Agent可能调用错误工具 | 需要验证 |

### 边界条件

**1. 安全性**

Agent可能执行危险操作（如删除文件、发送邮件）。

**解决方案**：设置权限边界、人工审核、沙箱环境

**2. 可控性**

Agent的行为难以完全预测。

**解决方案**：设置最大步数、超时机制、日志记录

**3. 成本**

多次LLM调用成本高。

**解决方案**：优化调用次数、使用小模型、缓存结果

**4. 延迟**

多步推理导致响应慢。

**解决方案**：异步执行、并行工具调用

---

## 💼 面试追问树

### Q1（基础）：什么是AI Agent？它和LLM有什么区别？

**回答要点**：
1. Agent是以LLM为大脑的智能体
2. 区别：LLM只生成文本，Agent可以调用工具
3. 核心能力：感知、规划、执行、反思

### Q2（深挖）：Agent的核心架构是什么？

**回答要点**：
1. LLM（大脑）：理解、推理、决策
2. 工具（Tools）：扩展能力
3. 记忆（Memory）：短期+长期
4. 规划（Planning）：任务分解

### Q3（更深）：如何设计一个好的Agent提示词？

**回答要点**：
1. 明确角色和能力边界
2. 提供工具说明和使用示例
3. 设计推理格式（如ReAct）
4. 设置安全边界

### Q4（边界）：Agent有什么风险？

**回答要点**：
1. 安全性：可能执行危险操作
2. 可控性：行为难以预测
3. 成本：多次调用成本高
4. 延迟：多步推理导致响应慢

---

## 🔗 关联知识网络

**上游依赖**：[[LLM]], [工具调用]]

**下游应用**：
- [[自主系统]]：自动化任务
- [[代码生成]]：编写和执行代码
- [[数据分析]]：查询和分析数据

**并列概念**：[[RAG]], [提示工程]]
