# AI Agent

**标签：** #Agent #LLM

---

## 1. 什么是AI Agent

AI Agent是以大语言模型为驱动，具备自主理解、感知、决策和执行能力的智能体。

**核心能力**：
- **感知**：理解用户输入和环境信息
- **规划**：制定完成任务的步骤
- **执行**：调用工具完成具体操作
- **反思**：评估结果并调整策略

---

## 2. Agent核心架构

```
用户输入 → LLM（大脑） → 规划 → 工具调用 → 执行 → 结果 → 反馈
```

**关键组件**：
- **LLM**：作为大脑，负责理解、推理和决策
- **工具（Tools）**：外部API、代码执行器、搜索引擎等
- **记忆（Memory）**：短期记忆（上下文）和长期记忆（向量数据库）
- **规划（Planning）**：任务分解、策略制定

---

## 3. 工具定义

```python
from langchain_core.tools import tool

@tool
def search(query: str) -> str:
    """搜索互联网获取最新信息"""
    return f"搜索结果: {query}的最新信息..."

@tool
def calculate(expression: str) -> str:
    """计算数学表达式"""
    try:
        result = eval(expression)
        return str(result)
    except Exception as e:
        return f"计算错误: {e}"

tools = [search, calculate]
```

---

## 4. Agent创建

```python
from langchain_openai import ChatOpenAI
from langchain.agents import create_tool_calling_agent, AgentExecutor
from langchain_core.prompts import ChatPromptTemplate

# 定义提示词
prompt = ChatPromptTemplate.from_messages([
    ("system", "你是一个有帮助的助手，可以使用工具来回答问题。"),
    ("human", "{input}"),
    MessagesPlaceholder(variable_name="agent_scratchpad"),
])

# 创建Agent
llm = ChatOpenAI(model="gpt-4")
agent = create_tool_calling_agent(llm, tools, prompt)

# 创建Agent执行器
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

# 调用
result = agent_executor.invoke({"input": "今天北京的天气怎么样？"})
print(result["output"])
```

---

## 5. Agent应用场景

| 场景 | 说明 |
|------|------|
| **智能客服** | 理解用户问题，调用知识库，生成回复 |
| **数据分析** | 执行SQL查询，生成可视化报告 |
| **代码开发** | 编写、调试、测试代码 |
| **内容创作** | 撰写文章、生成图片、制作视频 |
