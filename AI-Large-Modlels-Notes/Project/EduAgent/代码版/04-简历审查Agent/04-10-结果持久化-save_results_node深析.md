# 结果持久化：`save_results_node` 深度解析

> 源文件：`backend/agents/resume/nodes.py`
> 核心函数：`save_results_node`（**第 319~371 行**）
> 对应课件：4.10 结果持久化
> 前置依赖：`AsyncSessionLocal`（`database.py`）、`resume_reviews` 表、`json`、`os`

---

## 一、全文行号速查表

先给一张行号地图，方便对照源码：

| 行号 | 内容 | 角色 |
|:----:|:-----|:-----|
| 319 | `async def save_results_node(state: ResumeState) -> dict:` | 函数定义 |
| 320 | `review_id = state["review_id"]` | 获取审查记录 ID |
| 321~327 | `structured_output = {...}` | 组装全量结果快照 |
| 329 | `async with AsyncSessionLocal() as session:` | 打开数据库会话 |
| 330 | `try:` | 开始事务 |
| 331~340 | `await session.execute(text("""UPDATE resume_reviews SET ..."""), {...})` | 执行 SQL 更新 |
| 341 | `await session.commit()` | 提交事务 |
| 342 | `logger.info("save_results.db_written", ...)` | 记录写入成功 |
| 343 | `except Exception as e:` | 捕获异常 |
| 344 | `await session.rollback()` | 回滚事务 |
| 345 | `logger.error("save_results.db_failed", ...)` | 记录失败日志 |
| 346 | `raise` | 上抛异常 |
| 349 | `local_path = state.get("pdf_local_path", "")` | 获取临时 PDF 路径 |
| 350~351 | `if local_path and os.path.exists(local_path): os.remove(local_path)` | 清理临时文件 |
| 352~371 | `return {"fallback_used": False, "structured_output": structured_output}` | 返回结果快照 |

---

## 二、函数签名与定位（第 319 行）

```python
# nodes.py 第 319 行
async def save_results_node(state: ResumeState) -> dict:
    """把完整结果写入 resume_reviews（JSONB 字段），清理临时文件。"""
```

- **输入**：`ResumeState` 中所有字段（`structured` / `dimension_scores` / `issues` / `summary` 等）
- **输出**：`{"fallback_used": False, "structured_output": {...}}`（全量结果快照）
- **定位**：流水线第 8 步，最后一个节点——上接 `generate_summary_node` 产出 `summary`，下启 **END**（图执行结束）

在 `graph.py` 中，它是终点前的最后一个节点：

```python
builder.add_edge("generate_summary", "save_results")
builder.add_edge("save_results", END)
```

---

## 三、为什么需要这个节点？

前面 7 个节点产出了大量数据，但都是**内存中的 Python 对象**——服务器一旦重启，数据就全丢了。`save_results_node` 做三件事：

| # | 职责 | 对应代码 |
|---|------|---------|
| 1 | 持久化结果 | `UPDATE resume_reviews SET ...` |
| 2 | 清理临时文件 | `os.remove(local_path)` |
| 3 | 返回结果快照 | `return {"structured_output": {...}}` |

### 3.1 `resume_reviews` 表结构

```sql
CREATE TABLE IF NOT EXISTS resume_reviews (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       VARCHAR(64) NOT NULL DEFAULT 'tenant_default',
    student_id      UUID REFERENCES users(id),
    pdf_minio_path  VARCHAR(512) NOT NULL,
    structured_data JSONB,                     -- 结构化简历数据
    scores          JSONB,                     -- 六维度评分 + 加权总分
    issues          JSONB,                     -- 问题清单（按优先级排序）
    summary         JSONB,                     -- 整体评价（亮点/改进/评语/匹配度）
    status          VARCHAR(16) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processing', 'done', 'failed')),
    error_msg       TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

4 个 `JSONB` 列是核心数据载体：

| 列 | 类型 | 存储内容 | 写入来源 |
|----|------|---------|---------|
| `structured_data` | JSONB | 结构化简历（姓名/教育/项目/技能） | `extract_structured_node` |
| `scores` | JSONB | 六维度评分 + 加权总分 | `run_six_dimensions_node` |
| `issues` | JSONB | 问题清单（按优先级排序） | `diagnose_issues_node` |
| `summary` | JSONB | 整体评价（亮点/改进/评语/匹配度） | `generate_summary_node` |

---

## 四、逐行精读（第 319~371 行）

### 4.1 组装结果快照（第 320~327 行）

```python
# nodes.py 第 320~327 行
review_id = state["review_id"]
structured_output = {
    "review_id": review_id, "student_id": state["student_id"],
    "structured": state.get("structured"),
    "weighted_score": state.get("weighted_score", 0),
    "dimension_scores": state.get("dimension_scores", []),
    "issues": state.get("issues", []),
    "summary": state.get("summary"),
}
```

| 行号 | 代码 | 说明 |
|:----:|:-----|:-----|
| 320 | `review_id = state["review_id"]` | 从 State 取出审查记录 UUID |
| 321~327 | `structured_output = {...}` | 把所有核心结果打包成一个字典 |

**为什么需要这个？** 因为 LangGraph 的 `graph.ainvoke()` 返回值是**最后一个节点**的 `return`。这个 `structured_output` 就是 API 层能直接拿到的东西。

`structured_output` 包含 7 个字段：

| 字段 | 来源节点 | 类型 | 说明 |
|------|---------|------|------|
| `review_id` | 请求上下文 | `str` | 审查记录 UUID |
| `student_id` | 请求上下文 | `str` | 学员 ID |
| `structured` | `extract_structured_node` | `dict` | 结构化简历 |
| `weighted_score` | `run_six_dimensions_node` | `float` | 加权总分 0-100 |
| `dimension_scores` | `run_six_dimensions_node` | `list[dict]` | 六维度评分明细 |
| `issues` | `diagnose_issues_node` | `list[dict]` | 问题清单 |
| `summary` | `generate_summary_node` | `dict` | 整体评价 |

### 4.2 数据库写操作（第 329~346 行）

```python
# nodes.py 第 329~346 行
async with AsyncSessionLocal() as session:
    try:
        await session.execute(
            text("""
                UPDATE resume_reviews
                SET structured_data = :structured_data,
                    scores          = :scores,
                    issues          = :issues,
                    summary         = :summary,
                    status          = 'done',
                    updated_at      = NOW()
                WHERE id = :review_id
            """),
            {
                "structured_data": json.dumps(state.get("structured"), ensure_ascii=False),
                "scores": json.dumps(
                    {"dimension_scores": state.get("dimension_scores", []),
                     "weighted_score": state.get("weighted_score", 0)},
                    ensure_ascii=False),
                "issues":  json.dumps(state.get("issues", []), ensure_ascii=False),
                "summary": json.dumps(state.get("summary"), ensure_ascii=False),
                "review_id": review_id,
            },
        )
        await session.commit()
        logger.info("save_results.db_written", review_id=review_id)
    except Exception as e:
        await session.rollback()
        logger.error("save_results.db_failed", error=str(e))
        raise
```

| 行号 | 代码 | 说明 |
|:----:|:-----|:-----|
| 329 | `async with AsyncSessionLocal() as session:` | 用统一的 SQLAlchemy 异步会话，`async with` 确保会话自动关闭 |
| 330 | `try:` | 开始事务 |
| 331~340 | `await session.execute(text("""UPDATE ..."""), {...})` | 执行原生 SQL 更新，使用 `text()` 构造参数化查询 |

**6 个 SET 字段**详解：

| SET 字段 | SQL 列类型 | 数据来源 | 说明 |
|----------|-----------|---------|------|
| `structured_data` | `JSONB` | `state["structured"]` | `json.dumps(..., ensure_ascii=False)` 保留中文 |
| `scores` | `JSONB` | `dimension_scores` + `weighted_score` 合并 | 打包成一个 JSON 对象 |
| `issues` | `JSONB` | `state["issues"]` | 完整的按优先级排序的问题清单 |
| `summary` | `JSONB` | `state["summary"]` | 整体评价 4 字段 |
| `status` | `VARCHAR(16)` | 硬编码 `'done'` | 状态机终态 |
| `updated_at` | `TIMESTAMPTZ` | `NOW()` | 数据库当前时间 |

| 行号 | 代码 | 说明 |
|:----:|:-----|:-----|
| 341 | `await session.commit()` | 提交事务，所有更改写入数据库 |
| 342 | `logger.info("save_results.db_written", ...)` | 记录写入成功 |
| 343 | `except Exception as e:` | 捕获数据库异常 |
| 344 | `await session.rollback()` | **回滚事务**，确保数据库不会半写 |
| 345 | `logger.error("save_results.db_failed", ...)` | 记录失败日志 |
| 346 | `raise` | **上抛异常**，由上层 Graph 框架捕获 |

**关键设计点**：

- **`json.dumps(..., ensure_ascii=False)`**：保留中文原文。默认 `ensure_ascii=True` 会将中文转成 `\uXXXX` 转义序列，存入 JSONB 后难以阅读和查询。
- **`scores` 单独打包**：`dimension_scores` 和 `weighted_score` 被合并成一个 JSON 对象存入 `scores` 列，而不是拆成两列。这样查询时一次读取就能拿到完整的评分数据。
- **`status = 'done'`**：状态机终态——`resume_reviews` 表的状态流转是 `pending → processing → done`（或 `failed`）。API 层上传时写入 `processing`，这个节点推进到 `done`。
- **事务回滚**：失败时 `session.rollback()` 并 `raise`，确保数据库不会半写。

### 4.3 临时文件清理（第 349~351 行）

```python
# nodes.py 第 349~351 行
local_path = state.get("pdf_local_path", "")
if local_path and os.path.exists(local_path):
    os.remove(local_path)
    logger.info("save_results.tmp_cleaned", path=local_path)
```

| 行号 | 代码 | 说明 |
|:----:|:-----|:-----|
| 349 | `local_path = state.get("pdf_local_path", "")` | 获取临时 PDF 路径，默认空字符串 |
| 350 | `if local_path and os.path.exists(local_path):` | 两层防护：路径非空 且 文件确实存在 |
| 351 | `os.remove(local_path)` | 删除临时文件，释放磁盘空间 |

PDF 文件是上传时暂存的临时文件，如果不清除会堆积在临时目录中。这里做了两层防护：
1. `local_path` 非空
2. `os.path.exists(local_path)` 文件确实存在

### 4.4 返回值（第 352~371 行）

```python
# nodes.py 第 352~371 行
return {"fallback_used": False, "structured_output": structured_output}
```

| 行号 | 代码 | 说明 |
|:----:|:-----|:-----|
| 352~371 | `return {"fallback_used": False, "structured_output": structured_output}` | 两个字段：`fallback_used` 硬编码 `False`，`structured_output` 为全量结果快照 |

**`fallback_used` 为 `False`**：这个节点本身没有降级路径（要么写成功，要么抛异常）。`fallback_used` 字段是为后续可能的重试/降级逻辑预留的，目前硬编码为 `False`。

---

## 五、调用方式与依赖

### 5.1 调用链路

```
generate_summary_node
    │
    │  summary（ResumeSummary 的 4 字段）
    ▼
save_results_node  ←── 当前节点（终点）
    │
    ▼
END
```

### 5.2 依赖清单

| 依赖类型 | 具体依赖 | 用途 |
|---------|---------|------|
| State 读 | `state["review_id"]` | 审查记录 UUID |
| State 读 | `state["student_id"]` | 学员 ID |
| State 读 | `state["structured"]` | 结构化简历 |
| State 读 | `state["dimension_scores"]` | 各维度评分 |
| State 读 | `state["weighted_score"]` | 加权总分 |
| State 读 | `state["issues"]` | 问题清单 |
| State 读 | `state["summary"]` | 整体评价 |
| State 读 | `state["pdf_local_path"]` | 临时 PDF 路径 |
| 外部依赖 | `AsyncSessionLocal` | PostgreSQL 异步会话 |
| 外部依赖 | `resume_reviews` 表 | 数据库表（4 个 JSONB 列） |
| 外部依赖 | `json.dumps(..., ensure_ascii=False)` | Python 标准库 JSON 序列化 |
| 外部依赖 | `os.path.exists` / `os.remove` | 文件系统操作 |

### 5.3 与 API 层的协作 — 后台任务启动

`resume.py` 中：

```python
graph = _get_graph()
task = asyncio.create_task(graph.ainvoke(initial_state))
```

`graph.ainvoke()` 的返回值就是 `save_results_node` 的 `return`——即 `structured_output`。但这里是在**后台任务**中执行，用 `create_task` 启动，返回值没有被直接使用。

### 5.4 与 API 层的协作 — 双重清理

| 清理时机 | 代码位置 | 说明 |
|---------|---------|------|
| 图执行成功 → `save_results_node` | `nodes.py` 第 350~351 行 | 节点内清理 |
| 图执行完成/失败 → `_on_task_done` | `resume.py` 回调 | 兜底清理 |

双重保障确保临时文件不会残留。

---

## 六、`★` 设计亮点

### 6.1 JSONB 列拆分策略

`★ Insight ─────────────────────────────────────`
**"4 个 JSONB 列按逻辑拆分，查询时可以只读需要的列，节省带宽"**：
- 单列方案：`results = {structured, scores, issues, summary}` 写入简单，但读取时永远加载全部数据
- 四列方案：`structured_data | scores | issues | summary` 按逻辑拆分，API 的 `list_reviews` 只需要读 `scores` 中的 `weighted_score`，不需要加载整个结果
- `scores` 列单独打包 `dimension_scores` + `weighted_score`，一次读取就能拿到完整评分数据
- `status` 列是 VARCHAR 枚举，支持 `CHECK` 约束和快速索引，状态机上严格推进 `pending → processing → done`
`─────────────────────────────────────────────────`

### 6.2 `structured_output`：API 层的"快捷返回值"

`★ Insight ─────────────────────────────────────`
**"节点既写数据库，也返回数据，两件事互不冲突"**：
- 虽然后台任务没有直接使用 `structured_output` 返回值，但它的存在使得**如果将来改为同步调用**（比如内部测试或脚本），调用方可以直接拿到完整结果，不需要再查一次数据库
- 这种设计叫做 "return value as a service"——节点既完成持久化副作用，也返回全量数据快照
- `structured_output` 包含 7 个字段，覆盖了从请求上下文到所有节点产出的全部数据，是整个图执行的"最终输出合同"
`─────────────────────────────────────────────────`

### 6.3 事务严格 + 双重清理

`★ Insight ─────────────────────────────────────`
**"数据库写入失败时回滚 + 上抛，临时文件由节点+回调双重保障删除"**：
- 数据库写操作包裹在 `try/except` 中，失败时 `session.rollback()` 并 `raise`，确保不会半写
- 临时文件清理有双层防护：节点内删除（正常路径） + 回调兜底删除（异常路径），确保即使节点异常退出，临时文件也不会残留
- 状态机严格推进：`save_results_node` 把 `status` 设为 `'done'`，API 层的 `_mark_review_failed` 加了 `WHERE status = 'processing'` 条件，确保不会覆盖已经 `done` 的记录
- API 层还有 15 分钟超时兜底：如果后台任务中断导致记录卡在 `processing`，客户端查询时自动检测并标记为 `failed`
`─────────────────────────────────────────────────`

---

## 七、边界情况处理

| 场景 | 表现 |
|------|------|
| 数据库写入成功 | `status` 更新为 `done`，返回 `structured_output` |
| 数据库连接失败 | `session.rollback()`，`raise` 异常 → 图执行失败 → `_on_task_done` 标记 `failed` |
| `pdf_local_path` 不存在 | `os.path.exists` 返回 `False`，跳过删除 |
| `pdf_local_path` 为空字符串 | `if local_path` 为 `False`，跳过删除 |
| `structured` 为 `None` | `json.dumps(None)` → `"null"`，JSONB 存入 `null` |
| `summary` 为 `None` | 同上（`generate_summary` 降级失败时才可能） |
| 后台任务取消 | `_on_task_done` 捕获 `cancelled()`，标记 `failed` |
| 查询超时卡住 | API 层 15 分钟兜底，自动标记 `failed` |

---

## 八、数据流全景

```
generate_summary_node
    │
    │  summary（ResumeSummary 的 4 字段）
    ▼
save_results_node
    │
    │  ① 组装 structured_output（7 字段全量快照）
    │     review_id | student_id | structured | weighted_score
    │     | dimension_scores | issues | summary
    │
    │  ② UPDATE resume_reviews
    │     ├─ structured_data = json.dumps(structured, ensure_ascii=False)
    │     ├─ scores          = json.dumps({dimension_scores, weighted_score}, ...)
    │     ├─ issues          = json.dumps(issues, ...)
    │     ├─ summary         = json.dumps(summary, ...)
    │     ├─ status          = 'done'
    │     └─ updated_at      = NOW()
    │
    │  ③ 清理本地临时 PDF
    │     if os.path.exists(local_path): os.remove(local_path)
    │
    │  ④ 返回 {"fallback_used": False, "structured_output": {...}}
    │
    ▼
END
```

`save_results_node` 是整个流水线的**终点站**——它把前面 7 个节点的所有劳动成果安全地写入数据库，清理战场，然后优雅地结束。