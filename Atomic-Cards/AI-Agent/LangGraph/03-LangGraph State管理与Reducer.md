---
author: "XunZong"
created: "2026-07-30"
tags: ["AI-Agent", "LangGraph", "State", "Reducer"]
aliases: ["State管理", "Reducer", "add_messages", "状态合并", "Annotated"]
---

# LangGraph State 管理与 Reducer

## 定义

**Reducer（合并函数）** 是 LangGraph 中控制 State 字段**如何被更新**的规则。默认规则是"覆盖式合并"——节点返回的字段直接覆盖 State 中已有的值。但有些场景需要"追加"（如对话消息列表）或"累加"（如计数器），这时就需要自定义 Reducer。

### 核心语法

```python
from typing import Annotated, TypedDict

class MyState(TypedDict):
    # 默认：覆盖式合并
    name: str
    # 自定义 Reducer：追加式合并
    messages: Annotated[list, add_messages]
    scores: Annotated[list, operator.add]
    total: Annotated[int, accumulate_total]
```

### 直观理解

> 默认合并好比"便签纸"——每次贴新的就撕掉旧的。Reducer 好比"笔记本"——每次写新内容都接着上次的继续写，不覆盖之前的。

## 默认规则：覆盖式合并

当节点返回一个字典时，LangGraph 会把返回的字段直接覆盖 State 中同名字段的值：

```python
def node_a(state):
    return {"name": "小明", "score": 85}

def node_b(state):
    return {"score": 90}  # 只覆盖 score，name 保持原样
```

**结果**：`name="小明"`、`score=90`

## 列表字段的问题

覆盖式合并对列表字段有严重问题——如果多个节点都想向同一个列表添加内容，后一个节点会覆盖前一个节点添加的内容，导致数据丢失：

```python
class ChatState(TypedDict):
    messages: list  # 问题：每个节点返回 {"messages": [新消息]}，后一个会覆盖前一个
```

## 三种 Reducer 方案

### 方案一：operator.add（列表拼接）

```python
from typing import Annotated, TypedDict
from operator import add

class StateWithReducer(TypedDict):
    messages: Annotated[list, add]  # 使用 operator.add 实现列表拼接
```

`operator.add` 对列表来说就是拼接——`[1, 2] + [3, 4] = [1, 2, 3, 4]`。

### 方案二：add_messages（消息专用）

`add_messages` 是 LangGraph 为消息列表量身定制的 Reducer，比 `operator.add` 更智能：

```python
from langgraph.graph.message import add_messages
from typing import Annotated, TypedDict

class ChatState(TypedDict):
    messages: Annotated[list, add_messages]
```

**三个额外功能**：

| 功能 | 说明 | 示例 |
|:----|:-----|:-----|
| **追加** | 新消息自动追加到历史末尾 | `[旧消息] + [新消息] = [旧, 新]` |
| **自动包装** | 字符串自动包装成 `HumanMessage` | `"你好"` → `HumanMessage(content="你好")` |
| **ID 去重** | 有 `id` 字段的消息替换而不是重复追加 | 相同 `id` 的消息替换旧消息 |

### 方案三：自定义 Reducer

除了内置方案，可以自定义 Reducer 函数：

```python
from typing import Annotated, TypedDict

def accumulate_total(current_total: int, update: int) -> int:
    """累加器：每次更新时累加"""
    return current_total + update

def merge_dicts(current: dict, update: dict) -> dict:
    """字典合并：更新而不是覆盖"""
    merged = current.copy()
    merged.update(update)
    return merged

class StatsState(TypedDict):
    total: Annotated[int, accumulate_total]  # 累加
    config: Annotated[dict, merge_dicts]     # 字典合并
```

## 完整示例：多轮对话中的 add_messages

```python
from typing import Annotated, TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.checkpoint.memory import MemorySaver
from langchain_core.messages import HumanMessage, AIMessage

class ChatState(TypedDict):
    # add_messages 让新消息追加而非覆盖
    messages: Annotated[list, add_messages]

def reply_node(state: ChatState) -> dict:
    last_user_msg = state["messages"][-1].content
    history_count = len(state["messages"])
    reply = f"我收到了「{last_user_msg}」（当前历史共 {history_count} 条消息）"
    return {"messages": [AIMessage(content=reply)]}

builder = StateGraph(ChatState)
builder.add_node("reply", reply_node)
builder.add_edge(START, "reply")
builder.add_edge("reply", END)

graph = builder.compile(checkpointer=MemorySaver())

config = {"configurable": {"thread_id": "user-1"}}

graph.invoke({"messages": [HumanMessage(content="你好")]}, config)
result = graph.invoke({"messages": [HumanMessage(content="还记得我刚说了啥吗")]}, config)

for m in result["messages"]:
    print(f"{type(m).__name__}: {m.content}")
```

输出：
```
HumanMessage: 你好
AIMessage: 我收到了「你好」（当前历史共 1 条消息）
HumanMessage: 还记得我刚说了啥吗
AIMessage: 我收到了「还记得我刚说了啥吗」（当前历史共 3 条消息）
```

第二次调用只传了一条新消息，但最终的 `messages` 里累积了全部 4 条——这就是 Reducer 的威力。

## 使用场景总结

| 合并方式 | 语法 | 适用场景 |
|:---------|:-----|:---------|
| **覆盖式合并**（默认） | 无特殊注解 | 简单字段，后一次覆盖前一次 |
| **operator.add** | `Annotated[list, add]` | 列表拼接，无需去重 |
| **add_messages** | `Annotated[list, add_messages]` | 对话消息列表，自动去重 |
| **自定义函数** | `Annotated[int, my_func]` | 累加器、字典合并等特殊需求 |

## 面试追问

**Q1（基础）**：LangGraph 默认的状态合并规则是什么？列表字段使用默认规则会有什么问题？
**回答要点**：
1. 默认规则是覆盖式合并：节点返回的字段直接覆盖 State 中同名字段
2. 列表字段使用默认规则会导致数据丢失：后一个节点会覆盖前一个节点添加的内容

**Q2（深挖）**：add_messages 相比 operator.add 有哪些额外功能？
**回答要点**：
1. 追加：新消息自动追加到历史末尾
2. 自动包装：传入的字符串自动包装成 HumanMessage
3. ID 去重：相同 id 的消息替换而不是重复追加

**Q3（实战）**：在什么场景下必须使用 Reducer？如果不使用会有什么后果？
**回答要点**：
1. 多轮对话的消息列表（messages）必须使用 add_messages，否则历史消息会丢失
2. 多个节点向同一个列表添加内容的场景必须使用 Reducer
3. 自定义 Reducer 适用于累加器、字典合并等特殊需求

**Q4（边界）**：自定义 Reducer 函数的输入输出是什么？有什么约束？
**回答要点**：
1. 接收两个参数：`current_value`（State 中当前值）和 `update_value`（节点返回的更新值）
2. 返回合并后的新值，类型应与字段声明一致
3. 应该是纯函数，不产生副作用

## 参考引用
- 需要理解 LangGraph 图模型基础的相关知识，参见 [LangGraph图模型四要素](01-LangGraph图模型四要素.md)
- 需要理解条件边如何与 State 配合实现路由的相关知识，参见 [LangGraph条件边与路由](02-LangGraph条件边与路由.md)
- 需要理解 Checkpointer 如何持久化 State 的相关知识，参见 [LangGraph Checkpointer与记忆](04-LangGraph Checkpointer与记忆.md)