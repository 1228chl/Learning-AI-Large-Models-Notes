# 图装配：`graph.py` 深度解析

> 源文件：`backend/agents/resume/graph.py`（共 47 行）

## 一、函数签名与定位

```python
def build_resume_graph() -> CompiledGraph:
    """构建并编译简历审查 Agent 的状态图。
    特点：无分支、无 interrupt、无 checkpointer（一次性任务），
          六维度并行是性能关键路径。"""
```

- **输入**：无（所有节点和边在函数内部硬编码）
- **输出**：`CompiledGraph` 对象（可调用 `ainvoke(initial_state)` 执行）
- **定位**：整个简历审查 Agent 的**"总装线"**——
  - 上接：`nodes.py` 提供 8 个节点函数
  - 下启：`resume.py` API 层调用 `graph.ainvoke()` 启动审查

## 二、为什么需要图装配？

前面 8 个节点函数是各自独立的，像散落的零件：

```
upload_to_minio_node()    ← 只负责上传
download_pdf_node()       ← 只负责下载
extract_text_node()       ← 只负责文本提取
extract_structured_node() ← 只负责结构化提取
run_six_dimensions_node() ← 只负责并行评分
diagnose_issues_node()    ← 只负责问题诊断
generate_summary_node()   ← 只负责生成评价
save_results_node()       ← 只负责持久化
```

`graph.py` 的作用就是**把这些零件组装成一条流水线**，定义它们之间的执行顺序和数据传递关系。

### 2.1 LangGraph 三要素

| 要素 | 简历 Agent 中的对应 | 说明 |
|------|-------------------|------|
| **State** | `ResumeState`（TypedDict） | 贯穿全图的"工单"，每个节点读写 |
| **Node** | 8 个节点函数 | 流水线上的工位 |
| **Edge** | `add_edge()` 调用 | 工位之间的传送带 |

## 三、逐行精读

### 3.1 导入与构建函数（第 1~24 行）

```python
from langgraph.graph import StateGraph, START, END

def build_resume_graph():
    builder = StateGraph(ResumeState)
```

`StateGraph` 是 LangGraph 的状态图基类，用 `ResumeState` 作为类型参数。`START` 和 `END` 是内置的起点和终点常量。

### 3.2 注册 8 个节点（第 26~33 行）

```python
builder.add_node("upload_to_minio",    upload_to_minio_node)
builder.add_node("download_pdf",       download_pdf_node)
builder.add_node("extract_text",       extract_text_node)
builder.add_node("extract_structured", extract_structured_node)
builder.add_node("run_six_dimensions", run_six_dimensions_node)
builder.add_node("diagnose_issues",    diagnose_issues_node)
builder.add_node("generate_summary",   generate_summary_node)
builder.add_node("save_results",       save_results_node)
```

`add_node(name, func)` 给每个节点函数起一个字符串名字，LangGraph 内部用这个名字引用节点。命名规则：**kebab-case**，与函数名一一对应。

### 3.3 连边（第 36~44 行）

```python
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

**一条直线，无分支**——这就是所谓的"直线流水线"（linear pipeline）：

```
START → upload_to_minio → download_pdf → extract_text → extract_structured
    → run_six_dimensions → diagnose_issues → generate_summary
    → save_results → END
```

每个节点执行完毕后，State 自动传递给下一个节点。

### 3.4 编译（第 47 行）

```python
return builder.compile()
```

`compile()` 将图定义编译成可执行的 `CompiledGraph` 对象。编译时会做校验：
- 所有引用的节点是否已注册
- 是否有孤立节点（没有连入/连出）
- State 类型是否兼容

## 四、三个"无"的设计决策

```python
"""特点：无分支、无 interrupt、无 checkpointer（一次性任务）"""
```

| 决策 | 简历 Agent | 如果换成... | 会用在什么场景 |
|------|-----------|------------|--------------|
| **无分支** | 直线顺序执行 | 条件路由（`add_conditional_edges`） | QA Agent：根据意图分类走不同分支 |
| **无 interrupt** | 一次性执行到底 | `interrupt_before` 暂停 | 试卷批改 Agent：需要人工审核后再发布 |
| **无 checkpointer** | 不保存状态快照 | `Checkpointer`（如 `MemorySaver`） | 对话系统：需要断点恢复历史 |

### 4.1 为什么简历 Agent 不需要这些？

- **无分支**：每个节点只依赖前一个节点的产出，没有"如果 A 则走 B，否则走 C"的场景
- **无 interrupt**：审查任务从上传到出结果一气呵成，不需要等待人工介入
- **无 checkpointer**：审查是"发请求→等结果→拿走"的一次性任务，不是需要多轮对话的场景

## 五、节点内并行 vs 图层面并行

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

### 5.1 为什么不拆成 6 个图节点？

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

## 六、线程安全的图实例管理

在 `resume.py` 中：

```python
import threading
_graph_local = threading.local()

def _get_graph():
    """获取线程本地的图实例（当前线程没有就编译一个）。"""
    if not hasattr(_graph_local, "graph"):
        _graph_local.graph = build_resume_graph()
    return _graph_local.graph
```

### 6.1 为什么需要线程本地存储？

FastAPI 的 uvicorn 可以配置多个 worker 线程。如果不做线程隔离：

```python
# 全局单例（有并发问题）
_global_graph = build_resume_graph()  # 所有线程共享同一个实例

# 线程本地（每个线程独立）
_graph_local = threading.local()      # 每个线程有自己的实例
```

`threading.local()` 确保每个线程持有独立的图实例，不会互相干扰。

### 6.2 懒加载模式

`_get_graph()` 采用懒加载（lazy initialization）：
- 第一次调用时创建并缓存
- 后续调用直接返回缓存实例

```python
if not hasattr(_graph_local, "graph"):   # 第一次调用时没有
    _graph_local.graph = build_resume_graph()  # 创建
return _graph_local.graph                    # 返回缓存
```

## 七、与 API 层的完整协作

```python
# 1. 获取线程本地图
graph = _get_graph()

# 2. 准备初始状态
initial_state = {
    "messages": [], "student_id": student_id, "tenant_id": tenant_id,
    "review_id": review_id, "pdf_minio_path": "", "pdf_local_path": tmp_path,
    "raw_text": "", "page_count": 0, "structured": None,
    "dimension_scores": [], "weighted_score": 0.0, "issues": [],
    "summary": None, "fallback_used": False, "structured_output": None,
}

# 3. 后台任务执行图
task = asyncio.create_task(graph.ainvoke(initial_state))
_background_tasks.add(task)  # GC 保护：持有强引用
task.add_done_callback(_on_task_done)  # 注册完成回调

# 4. 立即返回（不等待图执行完毕）
return {"review_id": review_id, "status": "processing"}
```

`graph.ainvoke()` 的返回值是 `save_results_node` 的 `return`——即 `structured_output` 字典。

## 八、完整数据流全景

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

## 九、`★` 设计亮点总结

### 9.1 直线流水线

简历审查的流程是确定性的：每一步都依赖前一步的产出。直线流水线是最简单的图结构，没有分支、没有条件判断、没有循环。

### 9.2 节点内并行

`run_six_dimensions` 在节点内部用 `asyncio.gather` 并发 6 个 LLM 调用，而不是在图上拆成 6 个节点。保持了图的可读性，同时没有牺牲性能。

### 9.3 线程安全

`threading.local()` + 懒加载，确保多线程环境下每个线程有独立的图实例，且只在首次使用时编译。

### 9.4 无 checkpointer 的取舍

省略 checkpointer 减少了序列化和存储开销，适合一次性任务。如果将来需要"断点续审"功能，可以改成 `Checkpointer` 模式。

### 9.5 对比：QA Agent 的图

QA Agent 的图就不是直线了——它根据意图分类走不同分支：

```
              ┌─ 知识问答 → 检索 → 生成
START → 意图分类 ┼─ 代码生成 → 直接生成
              └─ 闲聊 → 对话生成
```

这正是 `graph.py` 开头的注释说的"无分支"——简历审查不需要条件路由，直线就够了。