# 图装配：`graph.py` 深度解析

> 源文件：`backend/agents/resume/graph.py`（共 48 行）

---

## 全文行号速查表

| 行号 | 内容 | 说明 |
|------|------|------|
| 1~4 | 模块 docstring + 路径注释 | 文件标识 |
| 5 | `from langgraph.graph import StateGraph, START, END` | LangGraph 核心组件 |
| 6 | `from backend.agents.resume.state import ResumeState` | 图状态类型 |
| 7~17 | `from backend.agents.resume.nodes import (...)` | 8 个节点函数导入 |
| 19 | 空行 | 分隔 |
| 20~22 | `def build_resume_graph():` | 函数签名 + 三无特性注释 |
| 23 | `builder = StateGraph(ResumeState)` | 用 ResumeState 初始化状态图 |
| 25~33 | 8 个 `builder.add_node(...)` | 注册节点（节点名 → 函数） |
| 35~44 | 9 个 `builder.add_edge(...)` | 顺次连边：START → … → END |
| 46~47 | `return builder.compile()` | 编译并返回可执行图 |

---

## 一、函数签名

```python
# graph.py 第 20~22 行
def build_resume_graph():
    """构建并编译简历审查 Agent 的状态图。
    特点：无分支、无 interrupt、无 checkpointer（一次性任务），六维度并行是性能关键路径。"""
```

- **输入**：无（所有节点和边在函数内部硬编码）
- **输出**：`CompiledGraph` 对象（可调用 `ainvoke(initial_state)` 执行）

---

## 二、动机：为什么需要图装配？

前面 8 个节点函数是各自独立的零件：

| 节点函数 | 职责 |
|----------|------|
| `upload_to_minio_node` | 上传到 MinIO 对象存储 |
| `download_pdf_node` | 从 MinIO 下载 PDF |
| `extract_text_node` | 提取 PDF 文本内容 |
| `extract_structured_node` | 用 LLM 提取结构化简历 |
| `run_six_dimensions_node` | 六维度并行评分 |
| `diagnose_issues_node` | 诊断问题并生成改进建议 |
| `generate_summary_node` | 生成综合评价 |
| `save_results_node` | 持久化结果到数据库 |

`graph.py` 的作用就是**把这些零件组装成一条流水线**，定义它们之间的执行顺序和数据传递关系。

---

## 三、逐行精读

### 3.1 导入与构建函数（第 1~23 行）

```python
# graph.py 第 1~4 行
"""简历审查 Agent - 图定义"""

# backend/agents/resume/graph.py
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 1 | `"""简历审查 Agent - 图定义"""` | 模块级 docstring，说明文件职责 |
| 3 | `# backend/agents/resume/graph.py` | 路径注释，方便调试时定位 |
| 5 | `from langgraph.graph import StateGraph, START, END` | 导入 StateGraph 基类 + 起终点常量 |
| 6 | `from backend.agents.resume.state import ResumeState` | 图的类型参数——整个 Agent 的"工单" |
| 8~17 | `from backend.agents.resume.nodes import (...)` | 8 个节点函数，所有业务逻辑的入口 |

```python
# graph.py 第 20~23 行
def build_resume_graph():
    """构建并编译简历审查 Agent 的状态图。
    特点：无分支、无 interrupt、无 checkpointer（一次性任务），六维度并行是性能关键路径。"""
    builder = StateGraph(ResumeState)              # 用 ResumeState 作为图的状态类型
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 20 | `def build_resume_graph():` | 无参构造函数，返回 `CompiledGraph` |
| 21~22 | docstring | 三无特性 + 性能关键路径提示 |
| 23 | `builder = StateGraph(ResumeState)` | 用 ResumeState 初始化状态图 |

### 3.2 注册 8 个节点（第 25~33 行）

```python
# graph.py 第 25~33 行
# ① 注册 8 个节点（节点名 → 节点函数）
builder.add_node("upload_to_minio",    upload_to_minio_node)
builder.add_node("download_pdf",       download_pdf_node)
builder.add_node("extract_text",       extract_text_node)
builder.add_node("extract_structured", extract_structured_node)
builder.add_node("run_six_dimensions", run_six_dimensions_node)
builder.add_node("diagnose_issues",    diagnose_issues_node)
builder.add_node("generate_summary",   generate_summary_node)
builder.add_node("save_results",       save_results_node)
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 25 | `# ① 注册 8 个节点（节点名 → 节点函数）` | 注释，标记为注册阶段 |
| 26 | `builder.add_node("upload_to_minio", upload_to_minio_node)` | 节点①：上传到 MinIO |
| 27 | `builder.add_node("download_pdf", download_pdf_node)` | 节点②：下载 PDF |
| 28 | `builder.add_node("extract_text", extract_text_node)` | 节点③：提取文本 |
| 29 | `builder.add_node("extract_structured", extract_structured_node)` | 节点④：结构化提取 |
| 30 | `builder.add_node("run_six_dimensions", run_six_dimensions_node)` | 节点⑤：六维度并行评分 |
| 31 | `builder.add_node("diagnose_issues", diagnose_issues_node)` | 节点⑥：问题诊断 |
| 32 | `builder.add_node("generate_summary", generate_summary_node)` | 节点⑦：生成评价 |
| 33 | `builder.add_node("save_results", save_results_node)` | 节点⑧：持久化结果 |

`add_node(name, func)` 给每个节点函数起一个字符串名字，LangGraph 内部用这个名字引用节点。命名规则：**kebab-case**，与函数名一一对应。

### 3.3 顺次连边（第 35~44 行）

```python
# graph.py 第 35~44 行
# ② 顺次连边：START → … → END（一条直线，无分支）
builder.add_edge(START,                 "upload_to_minio")
builder.add_edge("upload_to_minio",     "download_pdf")
builder.add_edge("download_pdf",        "extract_text")
builder.add_edge("extract_text",        "extract_structured")
builder.add_edge("extract_structured",  "run_six_dimensions")
builder.add_edge("run_six_dimensions",  "diagnose_issues")
builder.add_edge("diagnose_issues",     "generate_summary")
builder.add_edge("generate_summary",    "save_results")
builder.add_edge("save_results",        END)
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 35 | `# ② 顺次连边：START → … → END（一条直线，无分支）` | 注释，标记为连边阶段 |
| 36 | `builder.add_edge(START, "upload_to_minio")` | 起点 → 节点① |
| 37 | `builder.add_edge("upload_to_minio", "download_pdf")` | 节点① → 节点② |
| 38 | `builder.add_edge("download_pdf", "extract_text")` | 节点② → 节点③ |
| 39 | `builder.add_edge("extract_text", "extract_structured")` | 节点③ → 节点④ |
| 40 | `builder.add_edge("extract_structured", "run_six_dimensions")` | 节点④ → 节点⑤ |
| 41 | `builder.add_edge("run_six_dimensions", "diagnose_issues")` | 节点⑤ → 节点⑥ |
| 42 | `builder.add_edge("diagnose_issues", "generate_summary")` | 节点⑥ → 节点⑦ |
| 43 | `builder.add_edge("generate_summary", "save_results")` | 节点⑦ → 节点⑧ |
| 44 | `builder.add_edge("save_results", END)` | 节点⑧ → 终点 |

**一条直线，无分支**——这就是所谓的"直线流水线"（linear pipeline）：

```
START → upload_to_minio → download_pdf → extract_text → extract_structured
    → run_six_dimensions → diagnose_issues → generate_summary
    → save_results → END
```

### 3.4 编译（第 46~47 行）

```python
# graph.py 第 46~47 行
# ③ 编译。不传 checkpointer：一次性任务，不需要断点恢复
return builder.compile()
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 46 | `# ③ 编译。不传 checkpointer：一次性任务，不需要断点恢复` | 注释，说明省略 checkpointer 的原因 |
| 47 | `return builder.compile()` | 编译成可执行的 `CompiledGraph` |

`compile()` 将图定义编译成可执行的 `CompiledGraph` 对象。编译时会做校验：
- 所有引用的节点是否已注册
- 是否有孤立节点（没有连入/连出）
- State 类型是否兼容

---

## 四、依赖关系

```
build_resume_graph()
  ├── StateGraph(ResumeState)        ← backend.agents.resume.state
  ├── upload_to_minio_node           ← backend.agents.resume.nodes
  ├── download_pdf_node              ← backend.agents.resume.nodes
  ├── extract_text_node              ← backend.agents.resume.nodes
  ├── extract_structured_node        ← backend.agents.resume.nodes
  ├── run_six_dimensions_node        ← backend.agents.resume.nodes
  ├── diagnose_issues_node           ← backend.agents.resume.nodes
  ├── generate_summary_node          ← backend.agents.resume.nodes
  ├── save_results_node              ← backend.agents.resume.nodes
  └── builder.compile()              → CompiledGraph（给 resume.py 用）
```

---

## 五、三个"无"的设计决策

```python
# graph.py 第 21~22 行（docstring 中的三无特性）
"""特点：无分支、无 interrupt、无 checkpointer（一次性任务）"""
```

| 决策 | 简历 Agent | 如果换成... | 会用在什么场景 |
|------|-----------|------------|--------------|
| **无分支** | 直线顺序执行 | 条件路由（`add_conditional_edges`） | QA Agent：根据意图分类走不同分支 |
| **无 interrupt** | 一次性执行到底 | `interrupt_before` 暂停 | 试卷批改 Agent：需要人工审核后再发布 |
| **无 checkpointer** | 不保存状态快照 | `Checkpointer`（如 `MemorySaver`） | 对话系统：需要断点恢复历史 |

### 为什么简历 Agent 不需要这些？

- **无分支**：每个节点只依赖前一个节点的产出，没有"如果 A 则走 B，否则走 C"的场景
- **无 interrupt**：审查任务从上传到出结果一气呵成，不需要等待人工介入
- **无 checkpointer**：审查是"发请求→等结果→拿走"的一次性任务，不是需要多轮对话的场景

---

## 六、节点内并行 vs 图层面并行

`run_six_dimensions` 是个有意思的设计点：**图层面是串行的，但节点内部是并行的**。

```
图层面（串行 add_edge）：
  extract_text → extract_structured → run_six_dimensions → diagnose_issues → ...
                                          │
节点内部（asyncio.gather）：                ├─ 项目深度评审 ──┐
                                          ├─ 技术匹配度评审 ─┤
                                          ├─ 表达规范性评审 ─┤
                                          ├─ 简历结构评审 ──┤ asyncio.gather
                                          ├─ 量化程度评审 ──┤
                                          └─ 真实可信度评审 ─┘
```

### 为什么不拆成 6 个图节点？

理论上可以用 LangGraph 的 fan-out 机制：

```python
# 伪代码：图层面 fan-out
builder.add_edges(["dim_project_depth", "dim_tech_match", ...], "aggregate_scores")
```

但这样做有几个问题：

| 方案 | 代码复杂度 | 性能 | 可读性 |
|------|-----------|------|--------|
| **节点内 gather** | 低（一个函数搞定） | 相同（都是并发 IO） | 高（逻辑内聚） |
| **图层面 fan-out** | 高（需要 Send + 聚合节点） | 相同 | 低（逻辑分散） |

**结论**：节点内 `asyncio.gather` 更优——6 个 LLM 调用是 IO 密集型，`gather` 就已经让它们同时跑了，图上 fan-out 不会带来额外收益。

---

## 七、线程安全的图实例管理

在 `resume.py` 中：

```python
# resume.py 第 20~27 行
import threading
_graph_local = threading.local()

def _get_graph():
    """获取线程本地的图实例（当前线程没有就编译一个）。"""
    if not hasattr(_graph_local, "graph"):
        _graph_local.graph = build_resume_graph()
    return _graph_local.graph
```

### 为什么需要线程本地存储？

FastAPI 的 uvicorn 可以配置多个 worker 线程。如果不做线程隔离：

```python
# 全局单例（有并发问题）
_global_graph = build_resume_graph()  # 所有线程共享同一个实例

# 线程本地（每个线程独立）
_graph_local = threading.local()      # 每个线程有自己的实例
```

`threading.local()` 确保每个线程持有独立的图实例，不会互相干扰。

### 懒加载模式

`_get_graph()` 采用懒加载（lazy initialization）：
- 第一次调用时创建并缓存
- 后续调用直接返回缓存实例

```python
if not hasattr(_graph_local, "graph"):   # 第一次调用时没有
    _graph_local.graph = build_resume_graph()  # 创建
return _graph_local.graph                    # 返回缓存
```

---

## 八、与 API 层的完整协作

```python
# resume.py 第 122~130 行
# 1. 获取线程本地图
graph = _get_graph()

# 2. 准备初始状态
initial_state = {
    "messages": [], "student_id": student_id, "tenant_id": tenant_id,
    "review_id": review_id, "pdf_minio_path": "", "pdf_local_path": tmp_path,
    ...
}

# 3. 后台任务执行图
task = asyncio.create_task(graph.ainvoke(initial_state))
_background_tasks.add(task)  # GC 保护：持有强引用
task.add_done_callback(_on_task_done)  # 注册完成回调
```

---

## 九、完整数据流全景

```
START
  │
  ▼
upload_to_minio_node      节点①
  │  跳过（本地模式）
  ▼
download_pdf_node         节点②
  │  跳过（本地模式）
  ▼
extract_text_node         节点③ ← 真正开始工作
  │  └→ raw_text + page_count
  ▼
extract_structured_node   节点④
  │  └→ structured（结构化简历）
  ▼
run_six_dimensions_node   节点⑤ ← 性能关键路径
  │  ├─ 6 个维度并行评审
  │  └→ dimension_scores + weighted_score
  ▼
diagnose_issues_node      节点⑥
  │  ├─ Think 前置推理 → 结构化输出
  │  └→ issues（按优先级排序）
  ▼
generate_summary_node     节点⑦
  │  ├─ 聚合 4 个来源 → LLM 生成
  │  └→ summary（4 字段评价）
  ▼
save_results_node         节点⑧
  │  ├─ 写入 DB（JSONB 列）
  │  ├─ 清理临时 PDF
  │  └→ structured_output（全量快照）
  ▼
END
```

---

## ★ Insight ─── 设计亮点

### 1. 直线流水线

简历审查的流程是确定性的：每一步都依赖前一步的产出。直线流水线是最简单的图结构，没有分支、没有条件判断、没有循环。

```python
# graph.py 第 36~44 行 —— 9 条 add_edge 构成一条直线
builder.add_edge(START, "upload_to_minio")
# ... 中间 7 条连边 ...
builder.add_edge("save_results", END)
```

### 2. 节点内并行

`run_six_dimensions` 在节点内部用 `asyncio.gather` 并发 6 个 LLM 调用，而不是在图上拆成 6 个节点。保持了图的可读性，同时没有牺牲性能。

```python
# graph.py 第 30 行 —— 单个节点，内部 gather
builder.add_node("run_six_dimensions", run_six_dimensions_node)
```

### 3. 线程安全

`threading.local()` + 懒加载，确保多线程环境下每个线程有独立的图实例，且只在首次使用时编译。

```python
# resume.py 第 23~27 行 —— 懒加载 + 线程隔离
def _get_graph():
    if not hasattr(_graph_local, "graph"):
        _graph_local.graph = build_resume_graph()
    return _graph_local.graph
```

### 4. 无 checkpointer 的取舍

省略 checkpointer 减少了序列化和存储开销，适合一次性任务。如果将来需要"断点续审"功能，可以改成 `Checkpointer` 模式。

```python
# graph.py 第 46~47 行 —— 注释明确说明省略 checkpointer 的原因
# ③ 编译。不传 checkpointer：一次性任务，不需要断点恢复
return builder.compile()
```

### 5. 对比：QA Agent 的图

QA Agent 的图就不是直线了——它根据意图分类走不同分支：

```
              ┌─ 知识问答 → 检索 → 生成
START → 意图分类 ┼─ 代码生成 → 直接生成
              └─ 闲聊 → 对话生成
```

这正是 `graph.py` 开头的注释说的"无分支"——简历审查不需要条件路由，直线就够了。

---

## 十、边界情况与异常处理

| 场景 | 表现 | 处理 |
|------|------|------|
| `build_resume_graph()` 编译失败 | 导入错误或参数错误 | 启动时直接崩溃，开发阶段发现，不会进入生产 |
| 8 个节点中某个节点函数不存在 | 注册时 `add_node` 传入未定义函数 | `NameError`，开发阶段发现 |
| 图被并发调用 | `threading.local()` 每个线程独立实例 | 线程安全，无竞争 |
| 多个线程同时首次调用 `_get_graph()` | 两个线程同时编译图 | `build_resume_graph()` 编译不是线程安全的，但重复编译结果相同，后续调用复用已编译的实例 |
| 图在执行过程中抛出异常 | 异常传播到 `graph.ainvoke` 的调用方 | 由 `resume.py` 的 `_on_task_done` 捕获，标记为 failed |
| 直线流水线中某个节点耗时过长 | 下游节点等待 | 无超时机制，靠 `resume.py` 的 `RESUME_REVIEW_TIMEOUT_SECONDS` 兜底 |