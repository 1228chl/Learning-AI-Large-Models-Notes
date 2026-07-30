---
author: "XunZong"
created: "2026-07-30"
tags: ["AI-Agent", "LangGraph", "图模型", "状态图"]
aliases: ["LangGraph", "StateGraph", "图模型四要素", "代理图"]
---

# LangGraph 图模型四要素

## 定义

LangGraph 是 LangChain 生态中的 **Agent 编排框架**，它将业务流程建模为**有向图（Directed Graph）**，由四个核心要素构成：**State（状态）**、**Node（节点）**、**Edge（边）**、**Checkpointer（检查点）**。

相比 LangChain 的 Chain（链，只能直线走），LangGraph 的图模型支持**分支、循环、并行、中断**等复杂流程，适合构建生产级多 Agent 系统。

### 四要素关系

```python
Agent = StateGraph(State) + Nodes + Edges + Checkpointer
```

### 直观理解

> 把 LangGraph 想象成一条"智能流水线"：State 是工单（一路流转的数据），Node 是工位（每个工位做一件事），Edge 是传送带（决定工单去哪），Checkpointer 是摄像机（记录每个时间点的工单状态，方便回溯和恢复）。

## 四要素详解

### 要素一：State（状态）

State 是所有节点共享的数据结构，定义为 `TypedDict`，包含业务流程中所有需要共享的数据。

```python
from typing import TypedDict, List, Optional

class ExamState(TypedDict):
    """试卷批改的状态"""
    # 输入
    exam_paper: str                    # 试卷文本
    answer_key: str                    # 参考答案
    # 中间结果
    parsed_questions: List[dict]       # 拆解后的题目列表
    objective_results: Optional[dict]  # 客观题批改结果
    coding_results: Optional[dict]     # 编程题批改结果
    subjective_results: Optional[dict] # 主观题批改结果
    # 控制信息
    need_human_review: bool            # 是否需要人工审核
    # 输出
    final_score: Optional[float]       # 最终分数
    report: Optional[str]              # 评分报告
    # 错误信息
    errors: List[str]                  # 处理过程中的错误
```

**设计要点**：
- 包含所有需要共享的数据，避免节点间通过参数传值
- 包含控制信息（如是否需要人工审核），用于条件边的判断
- 包含错误信息，用于异常处理和降级

### 要素二：Node（节点）

Node 是图中的处理单元，每个节点执行一个具体操作。Node 是一个函数，接收 State 作为输入，返回更新后的 State 字典。

```python
from langgraph.graph import StateGraph

def parse_exam_paper(state: ExamState) -> dict:
    """拆解试卷，识别题目"""
    paper = state["exam_paper"]
    questions = llm_parse_questions(paper)
    return {"parsed_questions": questions}

def grade_objective(state: ExamState) -> dict:
    """批改客观题"""
    questions = state["parsed_questions"]
    objective = [q for q in questions if q["type"] == "objective"]
    results = [{"id": q["id"], "score": 1.0 if q["answer"] == q["correct"] else 0.0} for q in objective]
    return {"objective_results": {"results": results, "status": "completed"}}
```

**设计要点**：
- 每个节点只做一件事，保持单一职责
- 节点函数只返回需要更新的 State 字段，不返回整个 State
- 节点函数不应直接修改入参 State，而是返回"增量更新"字典

### 要素三：Edge（边）

Edge 连接节点，定义图的拓扑结构。LangGraph 支持两种边：

**固定边（Fixed Edge）**：无条件从一个节点到另一个节点。

```python
graph = StateGraph(ExamState)
graph.add_node("parse", parse_exam_paper)
graph.add_node("objective", grade_objective)
graph.add_node("coding", grade_coding)

graph.add_edge("parse", "objective")  # 拆解后，开始批改客观题
graph.add_edge("parse", "coding")     # 拆解后，开始批改编程题
```

**条件边（Conditional Edge）**：根据条件决定从当前节点去哪个节点。

```python
def decide_after_scoring(state: ExamState) -> str:
    review_items = state.get("review_items", [])
    if review_items:
        return "human_review"     # 需要人工审核
    else:
        return "generate_report"  # 直接生成报告

graph.add_conditional_edges(
    "aggregate",
    decide_after_scoring,
    {
        "human_review": "human_review",
        "generate_report": "generate_report"
    }
)
```

条件边是 LangGraph 最强大的能力之一，它让图具备了**分支和决策能力**。

### 要素四：Checkpointer（检查点）

Checkpointer 负责将 State 持久化到存储中，使得 Agent 可以在中断后恢复执行。

```python
from langgraph.checkpoint import MemorySaver

# 内存存储（进程重启后丢失）
checkpointer = MemorySaver()

# 编译图时绑定检查点
app = graph.compile(checkpointer=checkpointer)

# 执行图，指定线程ID（用于中断后恢复）
config = {"configurable": {"thread_id": "exam_session_001"}}
result = app.invoke({"exam_paper": "试卷内容...", "answer_key": "参考答案..."}, config=config)

# 在另一个请求中，使用相同的线程ID恢复执行
result = app.invoke(None, config=config)  # 传递None表示继续
```

**Checkpointer 的作用**：
- **中断恢复**：Agent 可以在等待用户输入时中断，用户输入后恢复执行
- **状态持久化**：State 持久化到存储中，进程重启后不会丢失
- **调试回溯**：可以查看 Agent 在每一步的状态，便于调试
- **并发隔离**：不同的线程 ID 对应不同的对话，互不干扰

## 五步实现套路

用 LangGraph 实现一个 Agent 的固定套路：

```python
from typing import TypedDict, List
from langgraph.graph import StateGraph, END
from langgraph.checkpoint import MemorySaver

# Step 1: 定义 State
class QAState(TypedDict):
    question: str
    retrieved_docs: List[str]
    answer: str

# Step 2: 写节点函数
def retrieve(state: QAState) -> dict:
    docs = search(state["question"])
    return {"retrieved_docs": docs}

def generate(state: QAState) -> dict:
    answer = llm_generate(state["question"], state["retrieved_docs"])
    return {"answer": answer}

# Step 3: 连接边
graph = StateGraph(QAState)
graph.add_node("retrieve", retrieve)
graph.add_node("generate", generate)
graph.add_edge("retrieve", "generate")
graph.add_edge("generate", END)

# Step 4: 绑定 Checkpointer
graph = graph.compile(checkpointer=MemorySaver())

# Step 5: 编译运行
result = graph.invoke(
    {"question": "什么是依赖注入？"},
    config={"configurable": {"thread_id": "qa_001"}}
)
print(result["answer"])
```

## Chain vs Graph 对比

| 维度 | Chain（链） | LangGraph（图） |
|:----|:------------|:----------------|
| **执行路径** | 直线，固定顺序 | 可分支、循环、并行 |
| **状态管理** | 无，靠参数传递 | State 统一管理 |
| **分支逻辑** | 不支持 | 条件边支持 |
| **循环逻辑** | 不支持 | 支持（节点可以回到前面） |
| **中断恢复** | 不支持 | Checkpointer 支持 |
| **适用场景** | 简单固定的流水线 | 复杂业务流程 |

## 面试追问

**Q1（基础）**：LangGraph 的四要素是什么？分别怎么理解？
**回答要点**：
1. State：所有节点共享的数据结构，定义为 TypedDict
2. Node：图中的处理单元，一个函数，接收 State 返回要更新的字段
3. Edge：连接节点的边，有固定边和条件边两种
4. Checkpointer：持久化 State，实现中断恢复和状态回溯

**Q2（深挖）**：Chain 和 Graph 的本质区别是什么？什么场景下必须用 Graph？
**回答要点**：
1. Chain 只能直线走，没有分支和循环；Graph 支持条件边、循环、并行
2. 固定流程（如 RAG 检索→生成）用 Chain 就够了
3. 需要分支逻辑（如 HitL 人工审核）、需要状态管理（如多轮对话）、需要中断恢复的场景必须用 Graph

**Q3（实战）**：写出用 LangGraph 实现 Agent 的五步套路。
**回答要点**：定义 State → 写节点函数 → 连接边 → 绑定 Checkpointer → 编译运行

**Q4（边界）**：不用 Checkpointer 编译图会有什么后果？什么场景下可以不用？
**回答要点**：
1. 没有 Checkpointer，图仍然可以执行，但无法中断恢复、无法多轮记忆
2. 一次性任务（如简历审查，跑完就出报告）可以不用 Checkpointer
3. 多轮对话（如模拟面试）、需要中断恢复（如试卷批改 HitL）必须用 Checkpointer

## 参考引用
- 需要理解 Agent 基本定义的相关知识，参见 [Agent定义与核心公式](../基础/01-Agent定义与核心公式.md)
- 需要理解条件边如何实现路由决策的相关知识，参见 [LangGraph条件边与路由](02-LangGraph条件边与路由.md)
- 需要理解 State 合并规则与 Reducer 的相关知识，参见 [LangGraph State管理与Reducer](03-LangGraph State管理与Reducer.md)
- 需要理解 Checkpointer 与多轮记忆的相关知识，参见 [LangGraph Checkpointer与记忆](04-LangGraph Checkpointer与记忆.md)