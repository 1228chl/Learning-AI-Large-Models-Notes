# QA Agent：图装配与 API — 从零理解

## 一、图结构

QA Agent 的图是项目中**最复杂**的，包含条件路由：

```
START → classify_query
  │
  ├─ GENERAL → generate_general
  │
  ├─ GENERAL_WEB → web_search → generate_general
  │
  ├─ PRECISE → retrieve
  │   ├─ high(≥0.75) → generate_rag
  │   ├─ low_web → web_search → generate_direct
  │   └─ low_direct → generate_direct
  │
  ├─ VAGUE → hyde_generate → retrieve → ...
  │
  └─ BROAD → multi_query_rewrite → retrieve → ...

所有生成节点 → enqueue_pending → save_memory → END
```

## 二、路由函数

### 2.1 classify_query 之后的路由

```python
def _route_by_query_type(state: QAState) -> str:
    qt = state.get("query_type", "PRECISE").upper()
    if qt == "GENERAL" and state.get("enable_web_search", False):
        return "GENERAL_WEB"  # 先联网再回答
    return qt  # PRECISE / VAGUE / BROAD / GENERAL
```

### 2.2 retrieve 之后的路由

```python
def _route_by_confidence(state: QAState) -> str:
    if state.get("is_high_confidence", False):
        return "high"       # RAG 生成
    if state.get("enable_web_search", False):
        return "low_web"    # 先联网再直答
    return "low_direct"     # 直接 LLM 兜底
```

### 2.3 web_search 之后的路由

```python
def _route_after_web_search(state: QAState) -> str:
    if state.get("query_type", "").upper() == "GENERAL":
        return "generate_general"
    return "generate_direct"
```

## 三、图装配

```python
def build_qa_graph():
    builder = StateGraph(QAState)

    # 注册节点
    builder.add_node("classify_query",      classify_query_node)
    builder.add_node("hyde_generate",       hyde_generate_node)
    builder.add_node("multi_query_rewrite", multi_query_rewrite_node)
    builder.add_node("retrieve",            retrieve_node)
    builder.add_node("generate_rag",        generate_rag_node)
    builder.add_node("web_search",          web_search_node)
    builder.add_node("generate_direct",     generate_direct_node)
    builder.add_node("generate_general",    generate_general_node)
    builder.add_node("enqueue_pending",     enqueue_pending_node)
    builder.add_node("save_memory",         save_memory_node)

    # 条件路由
    builder.add_conditional_edges("classify_query", _route_by_query_type, {...})
    builder.add_conditional_edges("retrieve", _route_by_confidence, {...})
    builder.add_conditional_edges("web_search", _route_after_web_search, {...})

    # 所有生成节点 → 入队 → 存记忆 → END
    for gen_node in ("generate_rag", "generate_direct", "generate_general"):
        builder.add_edge(gen_node, "enqueue_pending")
    builder.add_edge("enqueue_pending", "save_memory")
    builder.add_edge("save_memory", END)

    memory_saver = get_memory_saver("qa")
    return builder.compile(checkpointer=memory_saver)
```

## 四、API 接口

### 4.1 非流式接口

```python
@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest, current_user: dict = Depends(get_current_user)):
    graph = build_qa_graph()
    thread_id = build_thread_id(current_user["user_id"], req.session_id)

    result = await graph.ainvoke(initial_state, config={"configurable": {"thread_id": thread_id}})

    return ChatResponse(
        answer=result.get("answer", ""),
        answer_mode=result.get("answer_mode", "llm_direct"),
        confidence=result.get("confidence", 0.0),
        sources=result.get("sources", []),
    )
```

### 4.2 流式接口（SSE）

```python
@router.post("/chat/stream")
async def chat_stream(req: ChatRequest, current_user: dict = Depends(get_current_user)):
    async def event_generator():
        async for event in graph.astream_events(initial_state, config=config, version="v2"):
            evt = event["event"]
            node = event.get("metadata", {}).get("langgraph_node", "")

            if evt == "on_chain_start" and node in _PROGRESS_LABELS:
                yield {"data": json.dumps({"type": "progress", "stage": label})}

            elif evt == "on_chat_model_stream" and node in _GENERATE_NODES:
                chunk = event["data"].get("chunk")
                if chunk and chunk.content:
                    yield {"data": json.dumps({"type": "token", "content": chunk.content})}

    return EventSourceResponse(event_generator())
```

### 4.3 历史查询

```python
@router.get("/sessions/{session_id}/history", response_model=HistoryResponse)
async def get_session_history(session_id, current_user):
    # 从 qa_sessions 读摘要
    # 从 MemorySaver 读消息历史
```

## 五、流式输出的三种事件类型

```
事件类型       说明
─────────────  ────────────────────────────────
progress      节点开始时的进度提示（如"理解问题中..."）
token         LLM 生成的实时 token
meta          流结束后推送的元数据（answer_mode、confidence、sources）
done          流结束标记
```

## 六、总结

```
graph.py
  ├── 10 个节点
  ├── 3 个条件路由函数
  ├── 3 个条件边
  └── checkpointer（记忆持久化）

qa.py（API）
  ├── POST /chat              ← 非流式
  ├── POST /chat/stream       ← SSE 流式
  └── GET /sessions/{id}/history ← 历史查询
```

**核心思想：条件路由让同一个图可以处理不同类型的查询，流式输出让用户体验更好。**