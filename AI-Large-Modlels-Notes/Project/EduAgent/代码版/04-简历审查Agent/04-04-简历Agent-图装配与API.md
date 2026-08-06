# 简历审查 Agent：图装配与 API — 从零理解

## 一、什么是 LangGraph 图？

LangGraph 把 Agent 工作流建模成一个**有向图**：

```
节点（Node）= 一个处理步骤（如 extract_text）
边（Edge）  = 节点之间的依赖关系
State       = 贯穿全图的"工单"
```

简历审查 Agent 的图是最简单的形式——**直线流水线**，没有分支。

## 二、逐行读 graph.py

```python
from langgraph.graph import StateGraph, START, END

def build_resume_graph():
    builder = StateGraph(ResumeState)  # 指定 State 类型

    # ① 注册 8 个节点
    builder.add_node("upload_to_minio",    upload_to_minio_node)
    builder.add_node("download_pdf",       download_pdf_node)
    builder.add_node("extract_text",       extract_text_node)
    builder.add_node("extract_structured", extract_structured_node)
    builder.add_node("run_six_dimensions", run_six_dimensions_node)
    builder.add_node("diagnose_issues",    diagnose_issues_node)
    builder.add_node("generate_summary",   generate_summary_node)
    builder.add_node("save_results",       save_results_node)

    # ② 连边：START → ... → END
    builder.add_edge(START,                 "upload_to_minio")
    builder.add_edge("upload_to_minio",     "download_pdf")
    builder.add_edge("download_pdf",        "extract_text")
    builder.add_edge("extract_text",        "extract_structured")
    builder.add_edge("extract_structured",  "run_six_dimensions")
    builder.add_edge("run_six_dimensions",  "diagnose_issues")
    builder.add_edge("diagnose_issues",     "generate_summary")
    builder.add_edge("generate_summary",    "save_results")
    builder.add_edge("save_results",        END)

    # ③ 编译
    return builder.compile()
```

**为什么没有 checkpointer？** 简历审查是一次性任务，不需要断点续传。

## 三、API 接口

### 3.1 上传简历

```python
@router.post("/upload", status_code=202)
async def upload_resume(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    # 校验文件类型
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="仅支持 PDF 格式")

    # 保存到临时目录
    tmp_path = os.path.join(tempfile.gettempdir(), f"{review_id}_upload.pdf")
    with open(tmp_path, "wb") as f:
        f.write(file_bytes)

    # 写入数据库初始记录
    await session.execute(text("INSERT INTO resume_reviews (...) VALUES (...)"))

    # 后台启动图执行
    task = asyncio.create_task(graph.ainvoke(initial_state))
    _background_tasks.add(task)  # GC 保护

    return {"review_id": review_id, "status": "processing"}
```

**关键设计**：
- 状态码 `202 Accepted`：表示已接受、正在处理
- `asyncio.create_task`：后台异步执行，不阻塞响应
- `_background_tasks` 集合：持有强引用，防止被垃圾回收

### 3.2 查询结果

```python
@router.get("/reviews/{review_id}")
async def get_review(review_id: str, current_user: dict = Depends(get_current_user)):
    # 查数据库
    row = await session.execute(text("SELECT ... WHERE id = :review_id AND student_id = :student_id"))

    if row["status"] == "processing":
        # 超时兜底（15 分钟）
        if elapsed >= 15 * 60:
            await _mark_review_failed(review_id, "审查任务超时")
            return {"status": "failed"}
        return {"status": "processing"}

    if row["status"] == "failed":
        return {"status": "failed", "error_msg": ...}

    # status == done
    return {
        "weighted_score": scores_data["weighted_score"],
        "dimension_scores": scores_data["dimension_scores"],
        "issues": ...,
        "summary": ...,
    }
```

### 3.3 删除和列表

```python
@router.delete("/reviews/{review_id}", status_code=204)
async def delete_review(...):
    # WHERE 带 student_id，只能删自己的

@router.get("/reviews")
async def list_reviews(...):
    # 按时间倒序，最多 50 条
```

## 四、后台任务生命周期

```
POST /upload
    │
    ▼
保存 PDF → 写入 DB（status=processing）→ 创建后台任务
    │
    ▼
立即返回 {"review_id": "...", "status": "processing"}
    │
    ▼
后台任务执行图（8 个节点顺次执行）
    │
    ├─ 成功 → save_results → DB 更新为 status=done
    │
    └─ 失败 → _on_task_done 回调 → DB 更新为 status=failed
    │
    ▼
用户轮询 GET /reviews/{id} 直到 status=done
```

## 五、超时兜底

```python
RESUME_REVIEW_TIMEOUT_SECONDS = 15 * 60

if row["status"] == "processing":
    elapsed = (datetime.now(timezone.utc) - last_ts).total_seconds()
    if elapsed >= RESUME_REVIEW_TIMEOUT_SECONDS:
        await _mark_review_failed(review_id, "审查任务超时或被中断")
        return {"status": "failed", "error_msg": "..."}
```

防止后台任务因服务重启等原因中断后，状态永远卡在 processing。

## 六、总结

```
graph.py                    ← 定义节点和边，编译成可执行图
resume.py（API）            ← 上传/查询/删除/列表接口
  ├── POST /upload          ← 202 Accepted，异步执行
  ├── GET /reviews/{id}     ← 轮询状态
  ├── DELETE /reviews/{id}  ← 删除记录
  └── GET /reviews          ← 历史列表
```

**核心思想：异步 + 后台任务 + 超时兜底，确保用户体验。**