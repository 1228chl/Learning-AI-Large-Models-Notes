# QA Agent：State、Prompts 与节点 — 从零理解

## 一、State

```python
class QAState(TypedDict):
    # ① 消息历史
    messages: Annotated[list[BaseMessage], add_messages]

    # ② 请求上下文
    student_id:  str
    tenant_id:   str
    session_id:  str
    course_id:   Optional[str]

    # ③ Query 处理中间结果
    original_query:    str
    query_type:        str           # GENERAL / PRECISE / VAGUE / BROAD
    rewritten_queries: list[str]     # Multi-Query 改写后的子 Query
    hyde_document:     Optional[str] # HyDE 假设文档

    # ④ 检索与精排结果
    ranked_chunks:      list[dict]
    confidence:         float
    is_high_confidence: bool
    web_search_results: list[dict]

    # ⑤ 生成结果
    answer:            str
    sources:           list[str]
    answer_mode:       str
    fallback_used:     bool
    should_summarize:  bool
    structured_output: Optional[dict]
```

## 二、提示词

| 提示词 | 用途 | 占位符 |
|--------|------|--------|
| `SYSTEM_PROMPT` | 系统人设 | - |
| `RAG_STRATEGY_PROMPT` | 检索策略判断 | `{query}` |
| `HYDE_PROMPT` | 假设文档生成 | `{history}`, `{query}` |
| `MULTI_QUERY_REWRITE_PROMPT` | 子 Query 改写 | `{last_answer}`, `{query}` |
| `RAG_ANSWER_PROMPT` | RAG 回答生成 | `{context}`, `{query}` |
| `DIRECT_ANSWER_PROMPT` | LLM 直答 | `{query}` |
| `GENERAL_ANSWER_PROMPT` | 通用问题回答 | `{query}`, `{history}`, `{current_time}`, `{web_context}` |

## 三、10 个节点函数

### classify_query — 三层分类

```python
async def classify_query_node(state: QAState) -> dict:
    # Layer 0a：规则匹配 → GENERAL
    if _rule_classify_general(original_query):
        return {"query_type": "GENERAL"}

    # Layer 0b：课程关键词 → 专业
    if _rule_classify_specialized(original_query):
        return {"query_type": await _determine_rag_strategy_fast(original_query)}

    # Layer 1：MiniLM 二分类
    label, confidence = await loop.run_in_executor(None, classify, original_query)
    if label == "general":
        return {"query_type": "GENERAL"}

    # Layer 2：LLM 精判策略
    return {"query_type": await _determine_rag_strategy_fast(original_query)}
```

### hyde_generate — 假设文档生成

VAGUE 分支：让 LLM 先生成一段假设性回答，用它的向量去检索。

```python
async def hyde_generate_node(state: QAState) -> dict:
    prompt = HYDE_PROMPT.format(history=history_text, query=query)
    llm = get_llm("qa", temperature=0.3)
    response = await llm.ainvoke([HumanMessage(content=prompt)])
    return {"hyde_document": hyde_doc}
```

### multi_query_rewrite — 子 Query 改写

BROAD 分支：把宽泛问题改写为多个具体子问题。

```python
async def multi_query_rewrite_node(state: QAState) -> dict:
    prompt = MULTI_QUERY_REWRITE_PROMPT.format(last_answer=last_answer, query=query)
    llm = get_llm("qa", temperature=0.3)
    resp = await llm.ainvoke([HumanMessage(content=prompt)])
    rewritten = [line.strip() for line in raw.split("\n") if len(line.strip()) > 3]
    return {"rewritten_queries": rewritten[:MAX_BROAD_QUERIES]}
```

### retrieve — 混合召回 + 精排

```python
async def retrieve_node(state: QAState) -> dict:
    if query_type == "BROAD":
        # 并行检索多条子 Query，合并去重
        results = await asyncio.gather(*[retrieve_one(q) for q in broad_queries])
        for ranked_docs, _ in results:
            for doc in ranked_docs:
                seen[key] = doc  # content[:100] 去重
        merged = sorted(seen.values(), key=lambda x: x.score, reverse=True)[:RERANK_TOP_K]
    else:
        # VAGUE 用 hyde_document，PRECISE 用 original_query
        query_text = hyde_document if (VAGUE and hyde_document) else original_query
        merged, _ = await retrieve(query_text, tenant_id, course_id, ...)
```

### generate_rag — 高置信度 RAG 生成

```python
async def generate_rag_node(state: QAState) -> dict:
    context_text = "\n\n".join([f"【参考{i}】\n{chunk['content']}" for i, chunk in enumerate(ranked_chunks, 1)])
    prompt = RAG_ANSWER_PROMPT.format(context=context_text, query=query)
    llm = get_llm("qa", streaming=True)
    response = await llm.ainvoke([SystemMessage(content=...), ...])
    return {"answer": final_answer, "sources": sources, "answer_mode": "rag"}
```

### web_search — Web 搜索

```python
async def web_search_node(state: QAState) -> dict:
    results = await call_mcp_tool(
        server_url=settings.web_search_mcp_url,
        tool_name="web_search",
        arguments={"query": query, "max_results": 5},
    )
    return {"web_search_results": results}
```

### generate_direct — 低置信度 LLM 直答

```python
async def generate_direct_node(state: QAState) -> dict:
    # 有 Web 搜索结果 → 注入为上下文
    if web_results:
        web_context = "\n".join([f"[{i+1}] {r['title']}（{r['url']}）" for i, r in enumerate(web_results)])
        answer_mode = "web_augmented"
    else:
        answer_mode = "llm_direct"
```

### generate_general — 通用问题直答

```python
async def generate_general_node(state: QAState) -> dict:
    prompt = GENERAL_ANSWER_PROMPT.format(query=query, history=history, current_time=now, web_context=web_context)
    llm = get_llm("qa", streaming=True)
    response = await llm.ainvoke([HumanMessage(content=prompt)])
```

### enqueue_pending — 低置信度问题入队

```python
async def enqueue_pending_node(state: QAState) -> dict:
    INSERT INTO knowledge_pending_queue (id, question, student_id, confidence)
    VALUES (...) ON CONFLICT DO NOTHING
```

### save_memory — 记忆保存

```python
async def save_memory_node(state: QAState) -> dict:
    # 超过 10 轮 → 压缩摘要
    if should_summarize:
        summary = await compress_to_summary(messages, existing_summary)

    # UPSERT qa_sessions
    INSERT INTO qa_sessions (...) VALUES (...) ON CONFLICT (thread_id) DO UPDATE ...
```

## 四、总结

```
QA Agent 节点 = 10 个函数

分类阶段：classify_query → 决定走哪条路径
检索阶段：hyde_generate / multi_query_rewrite → retrieve
生成阶段：generate_rag / generate_direct / generate_general
副作用阶段：web_search / enqueue_pending / save_memory
```