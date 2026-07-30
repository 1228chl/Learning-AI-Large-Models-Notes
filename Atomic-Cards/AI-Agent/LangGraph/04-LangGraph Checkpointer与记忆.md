---
author: "XunZong"
created: "2026-07-30"
tags: ["AI-Agent", "LangGraph", "Checkpointer", "记忆", "MemorySaver"]
aliases: ["Checkpointer", "MemorySaver", "thread_id", "多轮记忆", "对话记忆"]
---

# LangGraph Checkpointer 与多轮记忆

## 定义

**Checkpointer（检查点）** 是 LangGraph 中负责**持久化 State** 的组件。它把每次节点执行后的 State 保存下来，使得 Agent 可以记住历史对话、在中断后恢复执行，并支持并发隔离。

### 核心公式

```
多轮记忆 = compile(checkpointer=...) + thread_id
```

### 直观理解

> 没有 Checkpointer 的图好比"金鱼"——每次 `invoke` 都是全新开始，什么都不记得。有了 Checkpointer 的图好比"大象"——它记得之前所有的对话，因为每次执行后的 State 都被保存了下来。

## 核心机制

### 1. MemorySaver：最简单的 Checkpointer

`MemorySaver` 将 State 保存在内存中，适合开发和测试：

```python
from langgraph.checkpoint.memory import MemorySaver

checkpointer = MemorySaver()
graph = builder.compile(checkpointer=checkpointer)
```

**注意**：进程重启后内存中的 State 会丢失。生产环境用 `SqliteSaver` 或 `PostgresSaver`。

### 2. thread_id：对话标识

`thread_id` 是每次调用时传入的对话标识。相同 `thread_id` 的多次调用接续同一份记忆，不同 `thread_id` 的对话完全隔离：

```python
# 第一次对话
config_a = {"configurable": {"thread_id": "user-session-1"}}
graph.invoke({"messages": [HumanMessage(content="你好")]}, config_a)

# 接续同一对话（记住上一轮）
graph.invoke({"messages": [HumanMessage(content="还记得我说了什么吗")]}, config_a)

# 完全不同的对话（没有上一轮的记忆）
config_b = {"configurable": {"thread_id": "user-session-2"}}
graph.invoke({"messages": [HumanMessage(content="你好")]}, config_b)
```

## 完整示例：多轮学习助手

```python
from typing import Annotated, TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.checkpoint.memory import MemorySaver
from langchain_core.messages import HumanMessage, AIMessage

class ChatState(TypedDict):
    messages: Annotated[list, add_messages]  # 追加模式

def reply_node(state: ChatState) -> dict:
    last_msg = state["messages"][-1].content
    round_num = len(state["messages"]) // 2 + 1
    return {"messages": [AIMessage(content=f"第{round_num}轮回应：你说「{last_msg}」")]}

builder = StateGraph(ChatState)
builder.add_node("reply", reply_node)
builder.add_edge(START, "reply")
builder.add_edge("reply", END)

graph = builder.compile(checkpointer=MemorySaver())

# 多轮对话
config = {"configurable": {"thread_id": "student-001"}}
graph.invoke({"messages": [HumanMessage(content="什么是装饰器")]}, config)
graph.invoke({"messages": [HumanMessage(content="能举个例子吗")]}, config)
result = graph.invoke({"messages": [HumanMessage(content="刚才解释了什么")]}, config)

for m in result["messages"]:
    print(f"{type(m).__name__}: {m.content}")
```

输出：
```
HumanMessage: 什么是装饰器
AIMessage: 第1轮回应：你说「什么是装饰器」
HumanMessage: 能举个例子吗
AIMessage: 第2轮回应：你说「能举个例子吗」
HumanMessage: 刚才解释了什么
AIMessage: 第3轮回应：你说「刚才解释了什么」
```

## interrupt / Command：人在环中（HitL）

Checkpointer 的另一个重要能力是**中断恢复**——让图在某个节点暂停，等外部输入后再继续：

```python
from langgraph.types import interrupt, Command

def human_review_node(state: ExamState) -> dict:
    """暂停图，等待教师确认"""
    result = interrupt(
        {
            "question": "需要教师审核以下批改结果",
            "review_items": state["review_items"],
        }
    )
    # result 是教师通过 Command(resume=...) 传回的数据
    if result["action"] == "approve":
        return {"status": "reviewed", "teacher_feedback": "全部通过"}
    elif result["action"] == "modify":
        return {"status": "reviewed", "teacher_feedback": result["modifications"]}

# 恢复图执行
thread_config = {"configurable": {"thread_id": "exam-001"}}
graph.invoke(Command(resume={"action": "approve"}), config=thread_config)
```

## Checkpointer 的四种能力

| 能力 | 说明 | 实现方式 |
|:-----|:-----|:---------|
| **中断恢复** | 等待用户输入时暂停，输入后恢复 | `interrupt()` + `Command(resume=...)` |
| **状态持久化** | 进程重启后 State 不丢失 | `SqliteSaver` / `PostgresSaver` |
| **调试回溯** | 查看 Agent 每一步的状态 | `graph.get_state(config)` |
| **并发隔离** | 不同 `thread_id` 的对话互不干扰 | 同 `thread_id` 接续，不同则隔离 |

## 生产环境 Checkpointer 选择

| 存储方式 | 类名 | 持久化 | 适用场景 |
|:---------|:-----|:-------|:---------|
| 内存 | `MemorySaver` | ❌ 进程重启丢失 | 开发/测试 |
| SQLite | `SqliteSaver` | ✅ 文件持久化 | 单机部署 |
| PostgreSQL | `PostgresSaver` | ✅ 数据库持久化 | 生产环境，多实例 |

## 面试追问

**Q1（基础）**：MemorySaver 和 thread_id 如何实现多轮记忆？
**回答要点**：
1. 编译时绑定 `checkpointer=MemorySaver()`，LangGraph 在每次执行后自动保存 State
2. 调用时传入相同 `thread_id` 的多次调用会接续同一份记忆
3. 不同 `thread_id` 的对话完全隔离，互不干扰

**Q2（深挖）**：interrupt 和 Command 的作用是什么？什么场景下使用？
**回答要点**：
1. interrupt 让图在某个节点暂停，等待外部输入
2. Command(resume=...) 用于恢复执行，传入外部数据
3. 典型场景：试卷批改中的 HitL（AI 批改完 → 暂停 → 等教师确认 → 继续发布）

**Q3（实战）**：EduAgent 中四个 Agent 分别如何使用 Checkpointer？
**回答要点**：
1. 简历审查：一次性任务，不传 Checkpointer
2. 智能问答：使用 MemorySaver + thread_id 管理多轮对话
3. 试卷批改：使用 Checkpointer + interrupt 实现 HitL
4. 模拟面试：使用 MemorySaver + thread_id 管理面试会话

**Q4（边界）**：MemorySaver 在进程重启后数据丢失，生产环境如何解决？
**回答要点**：
1. 使用 `SqliteSaver` 持久化到文件，适合单机部署
2. 使用 `PostgresSaver` 持久化到数据库，适合生产环境多实例
3. 生产环境中 `thread_id` 通常按业务规则生成（如 `student_{ID}_session_{会话ID}`）

## 参考引用
- 需要理解 LangGraph 图模型基础的相关知识，参见 [LangGraph图模型四要素](01-LangGraph图模型四要素.md)
- 需要理解 State 合并规则与 Reducer 的相关知识，参见 [LangGraph State管理与Reducer](03-LangGraph State管理与Reducer.md)
- 需要理解 Human-in-the-Loop 设计模式的相关知识，参见 [Human-in-the-Loop设计模式](../设计模式/01-Human-in-the-Loop设计模式.md)