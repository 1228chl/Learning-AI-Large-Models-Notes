# 模拟面试 Agent：HTTP 接口

> 源文件：`backend/api/v1/interview.py`（共 332 行）
> 对应课件：7.12 HTTP 接口 interview
> 前置依赖：`graph.py`、`state.py`、`AsyncSessionLocal`、`get_current_user`、`sse_starlette`

## 全文行号速查表

| 行号范围 | 代码段 | 说明 |
|:---------|:-------|:------|
| 1~20 | import + 全局变量 | 模块导入，`_graph` 单例编译 |
| 22~29 | 请求体模型 | `StartSessionRequest` / `ChatRequest` |
| 32~105 | `POST /sessions` | 创建新面试会话 |
| 108~164 | `POST /sessions/{id}/chat` | 学员发送消息 |
| 167~208 | `GET /sessions/{id}/report` | 查询完整报告 |
| 211~240 | `GET /sessions` | 历史面试列表 |
| 243~318 | `POST /sessions/{id}/chat/stream` | SSE 流式接口 |
| 321~332 | `_get_last_ai_message` | 提取最后一条 AI 消息 |

---

## 一、为什么需要 HTTP 接口？

模拟面试 Agent 需要**多轮对话**，与其他 Agent 的 API 设计有本质区别：

| Agent | 调用方式 | 说明 |
|:------|:---------|:-----|
| QA Agent | 单次问答 | 学员问一个问题，AI 回答一次 |
| Exam Agent | 一次提交，等待结果 | 学员提交试卷，AI 批改后等教师确认 |
| 模拟面试 Agent | 多轮对话 | 学员和面试官来回对话 20~40 轮 |

多轮对话需要：会话管理、状态持久化、流式输出、报告查询。

---

## 二、请求体模型（第 22~29 行）

```python
class StartSessionRequest(BaseModel):
    target_position:  str
    resume_review_id: str | None = None

class ChatRequest(BaseModel):
    message: str
```

| 模型 | 字段 | 说明 |
|:-----|:-----|:------|
| `StartSessionRequest` | `target_position: str` | 目标岗位，决定出题方向 |
| | `resume_review_id: str | None` | 关联简历审查 ID |
| `ChatRequest` | `message: str` | 学员消息文本 |

---

## 三、`POST /sessions`：创建会话（第 32~105 行）

```python
# interview.py 第 32~105 行
@router.post("/sessions", status_code=201)
async def start_session(req, current_user=Depends(get_current_user)):
    student_id = current_user["user_id"]
    tenant_id  = current_user["tenant_id"]
    session_id = str(uuid.uuid4())
    thread_id  = build_thread_id(student_id, session_id)

    # 1. 写入初始会话记录
    async with AsyncSessionLocal() as session:
        await session.execute(text("""
            INSERT INTO interview_sessions (...) VALUES (...)
        """), {...})
        await session.commit()

    # 2. 构造完整 initial_state
    initial_state = {
        "messages": [HumanMessage(content="[开始面试]")],
        "student_id": student_id, "tenant_id": tenant_id, "session_id": session_id,
        "target_position": req.target_position,
        "resume_review_id": req.resume_review_id,
        "resume_projects": [], "resume_skills": [],
        "current_stage": InterviewStage.WARMUP.value,
        "stage_turn_count": 0, "total_turn_count": 0, "max_turns": 40,
        "question_bank": [], "current_question": None,
        "projects_asked": [], "last_answer_quality": "adequate",
        "followup_count": 0, "existing_summary": None,
        "should_summarize": False, "report": None,
        "fallback_used": False, "structured_output": None,
    }

    # 3. 首轮图执行
    config  = build_config(student_id, session_id)
    result  = await _graph.ainvoke(initial_state, config=config)
    messages     = result.get("messages", [])
    opening_msg  = _get_last_ai_message(messages)

    return {
        "session_id": session_id, "target_position": req.target_position,
        "status": "in_progress", "message": opening_msg,
    }
```

| 步骤 | 行号 | 操作 | 说明 |
|:----:|:-----|:-----|:------|
| ① | 38~40 | 生成 session_id 和 thread_id | 唯一标识 |
| ② | 44~64 | 写入初始会话记录 | `status='in_progress'` |
| ③ | 67~90 | 构造完整 `initial_state` | 16 个字段初始值 |
| ④ | 93~94 | 调用 `graph.ainvoke` | 首轮图执行 |
| ⑤ | 95~96 | 提取开场白 | 最后一条 AI 消息 |
| ⑥ | 100~104 | 返回结果 | 含 session_id + 开场白 |

**`messages: [HumanMessage(content="[开始面试]")]`**：种子消息，触发 `load_context_node` 执行完整初始化。

---

## 四、`POST /sessions/{id}/chat`：发送消息（第 108~164 行）

```python
# interview.py 第 108~164 行
@router.post("/sessions/{session_id}/chat")
async def chat(session_id, req, current_user=Depends(get_current_user)):
    # 验证 session 归属
    async with AsyncSessionLocal() as session:
        result = await session.execute(text("""
            SELECT session_id FROM interview_sessions
            WHERE session_id = :sid AND tenant_id = :tid AND student_id = :sid2
        """), {...})
        if not result.fetchone():
            raise HTTPException(status_code=404, detail="面试会话不存在")

    config = build_config(student_id, session_id)
    state_update = {
        "messages": [HumanMessage(content=req.message)],
        "student_id": student_id, "session_id": session_id, "tenant_id": tenant_id,
    }
    result = await _graph.ainvoke(state_update, config=config)

    current_stage = result.get("current_stage", ...)
    total_turns   = result.get("total_turn_count", 0)
    is_finished   = current_stage == InterviewStage.FINISHED.value
    reply         = _get_last_ai_message(result.get("messages", []))

    response = {"session_id": session_id, "reply": reply, "current_stage": current_stage, ...}
    if is_finished:
        report = result.get("report") or {}
        response["report_summary"] = {"overall_score": ..., "strengths": ..., "improvements": ...}
    return response
```

| 步骤 | 行号 | 操作 | 说明 |
|:----:|:-----|:-----|:------|
| ① | 119~130 | 验证 session 归属 | 当前学员只能访问自己的会话 |
| ② | 132 | `build_config` | 同一 thread_id，MemorySaver 恢复 State |
| ③ | 134~139 | 构造 state_update | 只传 4 个字段，其他由 MemorySaver 恢复 |
| ④ | 141 | `await _graph.ainvoke` | 图执行 |
| ⑤ | 143~154 | 提取结果 | 阶段、轮数、是否结束、回应 |
| ⑥ | 156~162 | 结束时的报告摘要 | 附带报告摘要 |

**`state_update` 只需要 4 个字段**：`messages`、`student_id`、`session_id`、`tenant_id`。MemorySaver 自动恢复其他字段。

---

## 五、`POST /sessions/{id}/chat/stream`：SSE 流式（第 243~318 行）

```python
# interview.py 第 269~317 行
async def event_generator():
    try:
        async for event in _graph.astream_events(state_update, config=config, version="v2"):
            evt  = event["event"]
            node = event.get("metadata", {}).get("langgraph_node", "")

            if evt == "on_chat_model_stream" and node == "generate_response":
                chunk = event["data"].get("chunk")
                if chunk and chunk.content:
                    yield {"data": json.dumps({"type": "token", "content": chunk.content}, ensure_ascii=False)}

        final = await _graph.aget_state(config)
        state = final.values if final else {}
        current_stage = state.get("current_stage", ...)
        is_finished = current_stage == InterviewStage.FINISHED.value
        reply = _get_last_ai_message(state.get("messages", []))

        done_payload = {"type": "done", "reply": reply, "current_stage": current_stage, ...}
        if is_finished:
            report = state.get("report") or {}
            done_payload["report_summary"] = {...}
        yield {"data": json.dumps(done_payload, ensure_ascii=False)}

    except Exception as e:
        yield {"data": json.dumps({"type": "error", "message": "流式输出异常，请重试"}, ensure_ascii=False)}
```

| 步骤 | 行号 | 操作 | 说明 |
|:----:|:-----|:-----|:------|
| ① | 271 | `async for event in astream_events` | 遍历图执行事件流 |
| ② | 275~281 | 过滤 token | 只流式 `generate_response` 节点的 LLM token |
| ③ | 283~284 | 获取最终 State | `aget_state` 读取执行后的 State |
| ④ | 285~307 | 构建 done 事件 | 包含完整回应 + 报告摘要 |
| ⑤ | 309~316 | 异常处理 | 发送 error 事件 |

---

## 六、`GET /sessions/{id}/report`：查询报告（第 167~208 行）

```python
@router.get("/sessions/{session_id}/report")
async def get_report(session_id, current_user=Depends(get_current_user)):
    # 查询 DB
    result = await session.execute(text("""
        SELECT session_id, target_position, status, overall_score, report, finished_at
        FROM interview_sessions WHERE session_id = :sid AND student_id = :sid2
    """), {...})
    row = result.mappings().fetchone()
    if not row: raise HTTPException(404)
    if row["status"] != "finished": raise HTTPException(400, detail="面试尚未结束")
    # 返回报告详情
    return {session_id, overall_score, dimensions, strengths, ...}
```

---

## 七、`GET /sessions`：历史列表（第 211~240 行）

```python
@router.get("/sessions")
async def list_sessions(current_user=Depends(get_current_user)):
    # 按学员查最近 50 条
    result = await session.execute(text("""
        SELECT session_id, target_position, overall_score, status, finished_at, created_at
        FROM interview_sessions WHERE student_id = :sid ORDER BY created_at DESC LIMIT 50
    """), {...})
    return {"items": [...], "total": len(items)}
```

---

## 八、`★` 设计亮点总结

`★ Insight ─────────────────────────────────────`
**`astream_events` 精准过滤**：
- 过滤条件 `evt == "on_chat_model_stream" and node == "generate_response"` 确保只流式输出面试官回应
- `load_context`、`check_stage`、`evaluate_answer` 等节点的执行不产生流式事件
- `save_memory`、`save_report` 等 DB 操作也不产生流式事件
- 前端只看到面试官回应的逐字输出，不需要处理其他节点的"噪音"
`─────────────────────────────────────────────────`

`★ Insight ─────────────────────────────────────`
**`state_update` 只传 4 个字段，其他由 MemorySaver 恢复**：
- 学员身份（student_id、tenant_id）和会话 ID（session_id）每次都需要
- 学员消息（messages）追加到已有消息列表
- 其他字段由 MemorySaver 自动恢复
- API 层不需要关心 State 中哪些字段变了、哪些没变
`─────────────────────────────────────────────────`

`★ Insight ─────────────────────────────────────`
**5 个端点覆盖完整的面试生命周期**：
- `POST /sessions` 创建 → `POST /chat` 对话 → `GET /sessions/{id}/report` 查报告 → `GET /sessions` 历史列表
- 流式和非流式接口并存：前端根据场景选择
- 每个端点职责单一，没有"万能接口"——RESTful 设计的基本准则
`─────────────────────────────────────────────────`