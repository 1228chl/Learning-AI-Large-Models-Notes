# 结果持久化：`save_results_node` 深度解析

> 源文件：`backend/agents/resume/nodes.py` 第 318~371 行

## 一、函数签名与定位

```python
async def save_results_node(state: ResumeState) -> dict:
    """把完整结果写入 resume_reviews（JSONB 字段），清理临时文件。"""
```

- **输入**：`ResumeState` 中所有字段（`structured` / `dimension_scores` / `issues` / `summary` 等）
- **输出**：`{"fallback_used": False, "structured_output": {...}}`（全量结果快照）
- **定位**：流水线第⑧步，最后一个节点——
  - 上接：`generate_summary_node` 产出 `summary`（4 字段整体评价）
  - 下启：**END**（图执行结束）

在 `graph.py` 中，它是终点前的最后一个节点：

```python
builder.add_edge("generate_summary", "save_results")
builder.add_edge("save_results", END)
```

## 二、为什么需要这个节点？

前面 7 个节点产出了大量数据，但都是**内存中的 Python 对象**——服务器一旦重启，数据就全丢了。`save_results_node` 做三件事：

| # | 职责 | 对应代码 |
|---|------|---------|
| ① | 持久化结果 | `UPDATE resume_reviews SET ...` |
| ② | 清理临时文件 | `os.remove(local_path)` |
| ③ | 返回结果快照 | `return {"structured_output": {...}}` |

### 2.1 `resume_reviews` 表结构

```sql
CREATE TABLE IF NOT EXISTS resume_reviews (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),              -- 主键，自动生成UUID
    tenant_id       VARCHAR(64) NOT NULL DEFAULT 'tenant_default',            -- 租户ID（多租户隔离）
    student_id      UUID REFERENCES users(id),                               -- 学员ID，关联users表
    pdf_minio_path  VARCHAR(512) NOT NULL,                                    -- PDF文件路径（对象存储）
    structured_data JSONB,                     -- 结构化简历数据（姓名/教育/项目/技能等）
    scores          JSONB,                     -- 评分数据（六维度评分 + 加权总分）
    issues          JSONB,                     -- 问题清单（按优先级排序的逐条问题）
    summary         JSONB,                     -- 整体评价（亮点/改进/评语/匹配度）
    status          VARCHAR(16) NOT NULL DEFAULT 'pending'                    -- 状态：pending→processing→done/failed
                    CHECK (status IN ('pending', 'processing', 'done', 'failed')),
    error_msg       TEXT,                       -- 错误信息（status=failed时记录原因）
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- 创建时间
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()   -- 更新时间（自动更新）
);
```

4 个 `JSONB` 列是核心数据载体，按逻辑拆分：

| 列 | 类型 | 存储内容 | 写入来源 |
|----|------|---------|---------|
| `structured_data` | JSONB | 结构化简历（姓名/教育/项目/技能） | `extract_structured_node` |
| `scores` | JSONB | 六维度评分 + 加权总分 | `run_six_dimensions_node` |
| `issues` | JSONB | 问题清单（按优先级排序） | `diagnose_issues_node` |
| `summary` | JSONB | 整体评价（亮点/改进/评语/匹配度） | `generate_summary_node` |

### 2.2 State 字段流转

```python
class ResumeState(TypedDict):
    # ── 请求上下文 ──
    review_id:      str        # resume_reviews 表的 UUID
    student_id:     str
    pdf_local_path: str        # 本地临时文件路径

    # ── 各节点产出 ──
    structured:        Optional[dict]  # extract_structured_node
    dimension_scores:  list[dict]      # run_six_dimensions_node
    weighted_score:    float           # run_six_dimensions_node
    issues:            list[dict]      # diagnose_issues_node
    summary:           Optional[dict]  # generate_summary_node
```

## 三、逐行精读

### 3.1 组装结果快照

```python
structured_output = {
    "review_id": review_id, "student_id": state["student_id"],
    "structured": state.get("structured"),
    "weighted_score": state.get("weighted_score", 0),
    "dimension_scores": state.get("dimension_scores", []),
    "issues": state.get("issues", []),
    "summary": state.get("summary"),
}
```

**在整个图执行完成后，把所有核心结果打包成一个字典**。

为什么需要这个？因为 LangGraph 的 `graph.ainvoke()` 返回值是**最后一个节点**的 `return`。这个 `structured_output` 就是 API 层能直接拿到的东西。

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

### 3.2 数据库写操作

```python
async with AsyncSessionLocal() as session:        # 用统一的 SQLAlchemy 异步会话
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
                # JSONB 列：先 json.dumps 转 JSON 字符串；ensure_ascii=False 保留中文原文
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

**6 个 SET 字段**详解：

| SET 字段 | SQL 列类型 | 数据来源 | ensure_ascii |
|----------|-----------|---------|-------------|
| `structured_data` | `JSONB` | `state["structured"]` | `False` |
| `scores` | `JSONB` | `dimension_scores` + `weighted_score` 合并 | `False` |
| `issues` | `JSONB` | `state["issues"]` | `False` |
| `summary` | `JSONB` | `state["summary"]` | `False` |
| `status` | `VARCHAR(16)` | 硬编码 `'done'` | — |
| `updated_at` | `TIMESTAMPTZ` | `NOW()` | — |

**关键设计点**：

- **`json.dumps(..., ensure_ascii=False)`**：保留中文原文。默认 `ensure_ascii=True` 会将中文转成 `\uXXXX` 转义序列，存入 JSONB 后难以阅读和查询。这个参数确保中文以原文形式存储。

- **`scores` 单独打包**：`dimension_scores` 和 `weighted_score` 被合并成一个 JSON 对象存入 `scores` 列，而不是拆成两列。这样查询时一次读取就能拿到完整的评分数据，API 层也方便直接返回。

- **`status = 'done'`**：这是状态机的终态——`resume_reviews` 表的状态流转是 `pending → processing → done`（或 `failed`）。API 层上传时写入 `processing`，这个节点推进到 `done`。

- **事务回滚**：`try/except` 包裹，失败时 `session.rollback()` 并 `raise`，确保数据库不会半写。

### 3.3 临时文件清理

```python
local_path = state.get("pdf_local_path", "")
if local_path and os.path.exists(local_path):
    os.remove(local_path)
    logger.info("save_results.tmp_cleaned", path=local_path)
```

PDF 文件是上传时暂存的临时文件，如果不清除会堆积在临时目录中。这里做了两层防护：
1. `local_path` 非空
2. `os.path.exists(local_path)` 文件确实存在

### 3.4 返回值

```python
return {"fallback_used": False, "structured_output": structured_output}
```

两个字段：
- `fallback_used`: 硬编码 `False`——这个节点本身没有降级路径（要么写成功，要么抛异常）
- `structured_output`: 第一步组装的全量结果快照，**直接成为 `graph.ainvoke()` 的返回值**

## 四、与 API 层的协作

### 4.1 后台任务启动

`resume.py` 第 123 行：

```python
graph = _get_graph()
task = asyncio.create_task(graph.ainvoke(initial_state))
```

`graph.ainvoke()` 的返回值就是 `save_results_node` 的 `return`——即 `structured_output`。但注意这里是在**后台任务**中执行，用 `create_task` 启动，返回值没有被直接使用。

### 4.2 客户端轮询

客户端通过 `GET /api/v1/resume/reviews/{review_id}` 轮询结果：

```python
@router.get("/reviews/{review_id}")
async def get_review(review_id: str, current_user: dict = Depends(get_current_user)):
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            text("""
                SELECT id, status, scores, issues, summary, error_msg, created_at, updated_at
                FROM resume_reviews
                WHERE id = :review_id AND student_id = :student_id
            """),
            {"review_id": review_id, "student_id": current_user["user_id"]},
        )
        row = result.mappings().fetchone()

    if row["status"] == "processing":
        # 超时兜底：防止后台任务中断后长期卡 processing
        last_ts = row["updated_at"] or row["created_at"]
        if isinstance(last_ts, datetime):
            elapsed = (datetime.now(timezone.utc) - last_ts).total_seconds()
            if elapsed >= RESUME_REVIEW_TIMEOUT_SECONDS:  # 15 分钟
                await _mark_review_failed(review_id, timeout_msg)
                return {"review_id": review_id, "status": "failed", "error_msg": timeout_msg}
        return {"review_id": review_id, "status": "processing"}

    # status == done：JSONB 列已被 asyncpg 自动反序列化
    scores_data = _to_dict(row["scores"])
    return {
        "review_id": review_id, "status": "done",
        "weighted_score": scores_data.get("weighted_score", 0),
        "dimension_scores": scores_data.get("dimension_scores", []),
        "issues": _to_dict(row["issues"]) if not isinstance(row["issues"], list) else row["issues"],
        "summary": _to_dict(row["summary"]),
    }
```

API 层通过 `id` + `student_id` 双重条件查询，确保学员只能看到自己的审查结果。

### 4.3 后台任务完成回调

`resume.py` 第 97 行：

```python
def _on_task_done(t: asyncio.Task):
    _background_tasks.discard(t)
    if os.path.exists(tmp_path):
        try:
            os.remove(tmp_path)
        except OSError:
            pass
    if t.cancelled():
        ...
    else:
        exc = t.exception()
        if exc:
            ...
            if mark_failed_msg:
                loop = asyncio.get_running_loop()
                loop.create_task(_mark_review_failed(review_id, mark_failed_msg))
```

这里有个**双重清理**机制：

| 清理时机 | 代码位置 | 说明 |
|---------|---------|------|
| 图执行成功 → `save_results_node` | `nodes.py:367-368` | 节点内清理 |
| 图执行完成/失败 → `_on_task_done` | `resume.py:100-104` | 回调兜底清理 |

双重保障确保临时文件不会残留。

### 4.4 超时兜底

API 层在查询 `processing` 状态的记录时，还会检查 `updated_at` 是否超过 15 分钟阈值。如果后台任务因为某种原因（如服务重启）被中断，导致记录永远卡在 `processing`，这个兜底逻辑会将其标记为 `failed`，让客户端可以重试。

## 五、设计亮点

### 5.1 JSONB 列拆分策略

`resume_reviews` 把结果拆成 4 个 JSONB 列，而不是合并成一个：

```
单列方案：        results = {structured, scores, issues, summary}
四列方案：        structured_data | scores | issues | summary
```

| 方案 | 优点 | 缺点 |
|------|------|------|
| 4 个 JSONB 列 | 查询时可以只读需要的列，节省带宽 | 写入时要拆开 |
| 1 个 JSONB 列 | 写入简单，一个 `json.dumps` 搞定 | 读取时永远加载全部数据 |

这个项目选择了按逻辑分组拆分，因为 API 的 `list_reviews` 只需要读 `scores` 中的 `weighted_score`，不需要加载整个结果：

```python
# list_reviews 只从 scores 列取 weighted_score
(scores::jsonb ->> 'weighted_score')::float AS weighted_score
```

### 5.2 `structured_output`：API 层的"快捷返回值"

虽然后台任务没有直接使用这个返回值，但 `structured_output` 的存在使得**如果将来改为同步调用**（比如内部测试或脚本），调用方可以直接拿到完整结果，不需要再查一次数据库。这种设计叫做 **"return value as a service"**——节点既写数据库，也返回数据，两件事互不冲突。

### 5.3 状态机严格推进

`save_results_node` 把 `status` 设为 `'done'`。这个状态一旦写入就不会再被改变——因为后面没有其他节点了。API 层的 `_mark_review_failed` 函数也加了 `WHERE status = 'processing'` 条件，确保不会覆盖已经 `done` 的记录。

### 5.4 `ensure_ascii=False` 的细节

Python 的 `json.dumps` 默认 `ensure_ascii=True`，会把中文转成 `\uXXXX`：

```python
>>> json.dumps({"name": "张三"})
'{"name": "\\u5f20\\u4e09"}'
>>> json.dumps({"name": "张三"}, ensure_ascii=False)
'{"name": "张三"}'
```

存入 JSONB 后两种形式在语义上等价，但后者在数据库客户端直接查询时可读性更好。

## 六、与 `generate_summary_node` 的对比

| 维度 | `generate_summary_node` | `save_results_node` |
|------|------------------------|---------------------|
| 职责 | 生成整体评价（LLM） | 持久化结果（DB） |
| 输入 | `structured` + `scores` + `issues` | `structured` + `scores` + `issues` + `summary` |
| 输出 | `{"summary": dict}` | `{"structured_output": dict}` |
| 外部依赖 | LLM | PostgreSQL |
| 降级路径 | 有（保留 `weighted_score` + `high_issues`） | 无（失败即抛异常） |
| 重试 | 2 次尝试 | 无（由数据库驱动保证） |
| 副作用 | 无 | 写入 DB + 删除文件 |

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

## 八、数据流全景

```
generate_summary_node
    │
    │  summary（ResumeSummary 的 4 字段）
    │
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

## 九、`★` 设计亮点总结

### 9.1 三种数据持久化模式

| 模式 | 用途 | 示例 |
|------|------|------|
| JSONB 列 | 结构化结果（评分/问题/评价） | `scores` / `issues` / `summary` |
| VARCHAR 列 | 状态标记 | `status` / `error_msg` |
| TIMESTAMPTZ 列 | 时间戳 | `created_at` / `updated_at` |

### 9.2 双重清理保障

```
节点内清理 ──→ save_results_node 删除 pdf_local_path
                                      ↓
回调兜底 ──→ _on_task_done 再次检查并删除（即使节点异常退出）
```

### 9.3 前后端协作

```
前端                         后端
  │                           │
  ├─ POST /upload ──────────→ │  创建记录（processing）
  │                           │  启动后台任务
  │                           │
  ├─ GET /reviews/{id}  ────→ │  轮询状态
  │      ← {status: "processing"}
  │                           │
  │                           ├─ save_results_node 写入 done
  │                           │
  ├─ GET /reviews/{id}  ────→ │
  │      ← {status: "done", scores, issues, summary}
  │                           │
  └─ 展示结果 ──→ 学员看到完整评价
```

### 9.4 超时兜底

```
processing 状态卡住 > 15 分钟
        │
        ▼
客户端查询时自动检测
        │
        ▼
标记为 failed，返回错误信息
        │
        ▼
学员重新上传
```

`save_results_node` 的代码量不大（53 行），但它承载了整个流水线的**收尾职责**——写入、清理、返回，并用 `structured_output` 为 API 层提供了直接可用的结果快照。