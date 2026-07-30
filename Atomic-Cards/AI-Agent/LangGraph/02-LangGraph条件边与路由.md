---
author: "XunZong"
created: "2026-07-30"
tags: ["AI-Agent", "LangGraph", "条件边", "路由"]
aliases: ["Conditional Edge", "条件边", "路由函数", "add_conditional_edges"]
---

# LangGraph 条件边与路由

## 定义

**条件边（Conditional Edge）** 是 LangGraph 中让图"做决策"的机制——根据当前 State 的值动态选择下一步去哪个节点。它是 LangGraph 从简单链式流程走向复杂业务流程的关键能力。

### 核心概念

条件边需要两样东西：
1. **路由函数（Router）**：读取 State，返回一个字符串"路标"
2. **映射表（Mapping）**：路标 → 目标节点的对应关系

```
add_conditional_edges(源节点, 路由函数, 映射表)
```

### 直观理解

> 固定边好比"地铁线路"——从 A 站到 B 站是固定的。条件边好比"公交司机的实时决策"——乘客告诉司机想去哪（路由函数读取 State），司机根据目的地选择走哪条路（映射表决定目标节点）。

## 路由函数详解

### 基本写法

路由函数是一个普通的 Python 函数，接收 State 作为参数，返回一个字符串：

```python
def route_by_category(state: HelperState) -> str:
    """根据分类结果决定下一步"""
    return state["category"]  # 返回 "concept" / "code" / "chat"
```

### 路由函数的设计要点

1. **必须是纯函数**：只依赖 State 中的值做判断，不产生副作用
2. **返回值必须是映射表中的键**：如果返回了映射表中没有的键，LangGraph 会报错
3. **可以返回多个值**：返回 `list[str]` 可以实现"扇出"（fan-out），即同时去多个节点

### 扇出路由（Fan-out）

当需要"同时去多个节点"时，路由函数返回一个列表：

```python
def route_to_all(state: HelperState) -> list[str]:
    """同时触发多个节点"""
    return ["analyze", "score", "comment"]  # 三个节点并行执行
```

## 固定边 vs 条件边

| 对比 | 固定边（Fixed Edge） | 条件边（Conditional Edge） |
|:----|:--------------------|:--------------------------|
| **语法** | `add_edge(from, to)` | `add_conditional_edges(from, router, mapping)` |
| **决策方式** | 无条件，总是去同一个节点 | 根据 State 动态决定 |
| **适用场景** | 顺序执行、流水线 | 分支、路由、扇出 |
| **可预测性** | 高，路径固定 | 中，取决于路由逻辑 |
| **典型例子** | 解析→评分→汇总 | 分类→概念题/代码题/闲聊 |

## 完整示例：学习助手

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END

class HelperState(TypedDict):
    question: str
    category: str
    answer: str

# 节点函数
def classify_node(state: HelperState) -> dict:
    q = state["question"]
    if "代码" in q or "报错" in q:
        category = "code"
    elif "什么是" in q or "概念" in q:
        category = "concept"
    else:
        category = "chat"
    return {"category": category}

def answer_concept_node(state: HelperState) -> dict:
    return {"answer": f"【概念解答】关于「{state['question']}」，核心思想是……"}

def answer_code_node(state: HelperState) -> dict:
    return {"answer": f"【代码助手】针对「{state['question']}」，一步步排查……"}

def answer_chat_node(state: HelperState) -> dict:
    return {"answer": "【闲聊】哈哈，没问题！"}

# 路由函数
def route_by_category(state: HelperState) -> str:
    return state["category"]

# 搭图
builder = StateGraph(HelperState)
builder.add_node("classify", classify_node)
builder.add_node("concept",  answer_concept_node)
builder.add_node("code",     answer_code_node)
builder.add_node("chat",     answer_chat_node)

builder.add_edge(START, "classify")

# 条件边：分类后根据路由函数选择目标
builder.add_conditional_edges(
    "classify",
    route_by_category,
    {
        "concept": "concept",
        "code":    "code",
        "chat":    "chat",
    },
)

builder.add_edge("concept", END)
builder.add_edge("code",    END)
builder.add_edge("chat",    END)

graph = builder.compile()

# 测试三种不同的问题
for q in ["什么是装饰器", "这段代码报错怎么办", "今天天气不错"]:
    result = graph.invoke({"question": q, "category": "", "answer": ""})
    print(f"问题：{q}  → {result['answer']}")
```

输出：
```
问题：什么是装饰器  → 【概念解答】关于「什么是装饰器」，核心思想是……
问题：这段代码报错怎么办  → 【代码助手】针对「这段代码报错怎么办」，一步步排查……
问题：今天天气不错  → 【闲聊】哈哈，没问题！
```

### 图结构示意

```
                    +--> concept ---+
START --> classify --+--> code ------+--> END
                    +--> chat ------+
              （由 route_by_category 决定走哪条）
```

## 面试追问

**Q1（基础）**：条件边需要哪两样东西？它的工作机制是什么？
**回答要点**：
1. 路由函数（读取 State 返回字符串路标）和映射表（路标到目标节点的对应关系）
2. `add_conditional_edges` 将路由函数和映射表绑定到源节点上
3. LangGraph 执行时自动调用路由函数，根据返回值选择目标节点

**Q2（深挖）**：路由函数返回列表时有什么效果？什么场景下会用到？
**回答要点**：
1. 返回列表时实现"扇出"（fan-out），源节点后同时触发多个目标节点
2. 典型场景：并行批改（同时触发客观题、编程题、主观题三个评分节点）
3. 扇出后的节点可以独立执行，互不干扰

**Q3（实战）**：在 EduAgent 的试卷批改 Agent 中，条件边如何实现 HitL 流程？
**回答要点**：
1. 汇总评分后，路由函数检查 `review_items` 是否为空
2. 有需要人工审核的项 → 路由到 `human_review` 节点
3. 全部自动评分通过 → 路由到 `generate_report` 节点
4. 这种"条件分支"正是条件边的典型应用

**Q4（边界）**：路由函数返回了映射表中不存在的键会发生什么？如何避免？
**回答要点**：
1. LangGraph 会抛出 `ValueError`，提示找不到目标节点
2. 应在路由函数中兜底返回一个默认值，或使用 `try/except` 捕获
3. 映射表应覆盖所有可能的返回值，或使用 `default` 机制

## 参考引用
- 需要理解 LangGraph 图模型基础概念的相关知识，参见 [LangGraph图模型四要素](01-LangGraph图模型四要素.md)
- 需要理解 State 管理和数据流的相关知识，参见 [LangGraph State管理与Reducer](03-LangGraph State管理与Reducer.md)
- 需要理解 Checkpointer 与多轮记忆的相关知识，参见 [LangGraph Checkpointer与记忆](04-LangGraph Checkpointer与记忆.md)