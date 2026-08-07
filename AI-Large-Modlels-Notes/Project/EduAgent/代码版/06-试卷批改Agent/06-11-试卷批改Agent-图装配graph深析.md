# 试卷批改 Agent：图装配 `graph.py`

> 源文件：`backend/agents/exam/graph.py`（共 57 行）
> 对应课件：6.11 图装配（graph.py）
> 前置依赖：`state.py` 的 `ExamState`、`nodes.py` 的 9 个节点、`memory.py` 的 `get_memory_saver`

## 一、文件定位

`graph.py` 把 9 个节点组装成一条**线性链** LangGraph。与 QA Agent 不同，这里**没有条件边**——图的路径完全确定，每个节点只有一个出口。

```
graph.py 的职责：
  ├─ 注册 9 个节点
  ├─ 连接 10 条固定边（线性链）
  ├─ 编译图（带 MemorySaver checkpointer，支持 interrupt 恢复）
  └─ 对外暴露 build_exam_graph()
```

**控制流的复杂性不在图的拓扑结构上，而在节点内部**（三轨并行、interrupt 暂停），这是与 QA Agent 最大的区别。

---

## 二、完整图结构

```
START
  │
  ▼
parse_word
  │
  ▼
load_questions_meta
  │
  ▼
run_three_tracks
  │
  ▼
aggregate_results
  │
  ▼
analyze_weak_points
  │
  ▼
notify_teacher
  │
  ▼
teacher_review  ←── interrupt() 暂停点
  │
  ▼
apply_teacher_decision
  │
  ▼
publish_results
  │
  ▼
END
```

### 三阶段划分

| 阶段 | 节点 | 职责 |
|:-----|:-----|:------|
| ① 解析与加载 | `parse_word` → `load_questions_meta` | 从 Word 提取学员答案，合并 DB 元数据 |
| ② 批改与分析 | `run_three_tracks` → `aggregate_results` → `analyze_weak_points` | 三轨并行批改、汇总、薄弱点分析 |
| ③ HitL 与发布 | `notify_teacher` → `teacher_review` → `apply_teacher_decision` → `publish_results` | 暂停等教师、合并决策、写库发布 |

---

## 三、import 分析（第 1~17 行）

```python
from langgraph.graph import StateGraph, START, END

from backend.agents.exam.state import ExamState
from backend.agents.exam.nodes import (
    parse_word_node,
    load_questions_meta_node,
    run_three_tracks_node,
    aggregate_results_node,
    analyze_weak_points_node,
    notify_teacher_node,
    teacher_review_node,
    apply_teacher_decision_node,
    publish_results_node,
)
from backend.core.memory import get_memory_saver
```

| import | 来源 | 用途 |
|--------|------|------|
| `StateGraph` | `langgraph.graph` | 状态图构建器 |
| `START` / `END` | `langgraph.graph` | 起始/终止哨兵节点 |
| `ExamState` | `state.py` | 图的 State 类型 |
| 9 个节点 | `nodes.py` | 所有节点函数 |
| `get_memory_saver` | `memory.py` | MemorySaver 检查点 |

---

## 四、`build_exam_graph`：图构建（第 20~57 行）

### 4.1 函数签名

```python
def build_exam_graph():
    """
    构建并编译试卷批改 Agent 的 LangGraph 状态图。

    执行链路（线性）：
        parse_word → load_questions_meta → run_three_tracks
        → aggregate_results → analyze_weak_points
        → notify_teacher → teacher_review [interrupt]
        → apply_teacher_decision → publish_results → END
    """
    builder = StateGraph(ExamState)
```

### 4.2 注册 9 个节点（第 33~41 行）

```python
builder.add_node("parse_word",             parse_word_node)
builder.add_node("load_questions_meta",    load_questions_meta_node)
builder.add_node("run_three_tracks",       run_three_tracks_node)
builder.add_node("aggregate_results",      aggregate_results_node)
builder.add_node("analyze_weak_points",    analyze_weak_points_node)
builder.add_node("notify_teacher",         notify_teacher_node)
builder.add_node("teacher_review",         teacher_review_node)
builder.add_node("apply_teacher_decision", apply_teacher_decision_node)
builder.add_node("publish_results",        publish_results_node)
```

**节点命名规范**：小写蛇形，与函数名一致（去掉 `_node` 后缀）。

### 4.3 连接 10 条固定边（第 44~53 行）

```python
builder.add_edge(START,                    "parse_word")
builder.add_edge("parse_word",             "load_questions_meta")
builder.add_edge("load_questions_meta",    "run_three_tracks")
builder.add_edge("run_three_tracks",       "aggregate_results")
builder.add_edge("aggregate_results",      "analyze_weak_points")
builder.add_edge("analyze_weak_points",    "notify_teacher")
builder.add_edge("notify_teacher",         "teacher_review")
builder.add_edge("teacher_review",         "apply_teacher_decision")
builder.add_edge("apply_teacher_decision", "publish_results")
builder.add_edge("publish_results",        END)
```

**全部是固定边（`add_edge`），没有条件边（`add_conditional_edges`）**。因为 Exam Agent 是一条确定性的流水线，不存在运行时分支。

### 4.4 编译图（第 56~57 行）

```python
checkpointer = get_memory_saver("exam")
return builder.compile(checkpointer=checkpointer)
```

**`get_memory_saver("exam")`**：获取 Exam Agent 专用的 MemorySaver 实例（按 Agent 类型隔离）。

**`builder.compile(checkpointer=checkpointer)`**：编译图，绑定 MemorySaver。

`★ Insight ─────────────────────────────────────`
**为什么 Exam Agent 必须绑定 MemorySaver？**
- `interrupt()` 把图"冻结"后，State 必须持久化到某个地方，等教师确认后才能恢复
- 如果不传 `checkpointer`，图是无状态的，`interrupt()` 后 State 丢失，无法恢复执行
- `MemorySaver` 按 `thread_id` 把 State 存在进程内存中，`Command(resume=...)` 时按同一 `thread_id` 读取恢复
- 也就是说：**MemorySaver 是 HitL 得以实现的前提**
`─────────────────────────────────────────────────`

---

## 五、与 QA Agent 图的对比

| 维度 | QA Agent | 试卷批改 Agent |
|:-----|:---------|:---------------|
| 节点数 | 10 | 9 |
| 条件边 | 3 条（连通 5+3+2 分支） | 0 条 |
| 路径 | 5 条 | 1 条线性链 |
| 分支逻辑 | 在图的拓扑上（路由函数） | 在节点内部（三轨并行、interrupt） |
| 是否中断 | 否 | 是（`teacher_review` 处 interrupt） |
| 记忆用途 | 多轮对话记忆 | HitL 状态保存/恢复 |

**核心区别**：QA Agent 的复杂性体现在**图的分支拓扑**上（多个路由函数分流），而 Exam Agent 的复杂性体现在**节点内部逻辑**上（三轨并行批改、interrupt 暂停）。图层面 Exam Agent 极简，就是一条直线。

---

## 六、`★` 设计亮点总结

### 6.1 线性链简化拓扑

没有条件边，图路径完全确定。各阶段的顺序清晰：解析 → 批改 → 分析 → 复核 → 发布。

### 6.2 interrupt 实现 HitL

`teacher_review` 节点调用 `interrupt()`，图在此冻结，State 存入 MemorySaver。教师通过 `Command(resume=decision)` 恢复，从 interrupt 处继续执行。

### 6.3 编译时注入 MemorySaver

`builder.compile(checkpointer=get_memory_saver("exam"))`，与 QA Agent 相同的模式。LangGraph 自动处理 State 的保存和恢复，nodes.py 无需手动管理。

### 6.4 固定边保证流水线顺序

Exam Agent 的节点有严格的前后依赖（如 `parse_word` 必须先于 `load_questions_meta`），用固定边保证顺序，不会出错。