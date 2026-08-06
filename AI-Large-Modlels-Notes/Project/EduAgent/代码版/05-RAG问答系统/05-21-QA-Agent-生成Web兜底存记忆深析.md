# QA Agent 节点③：生成、Web 兜底、存记忆 深度解析

> 源文件：`backend/agents/qa/nodes.py` 第 600~966 行
> 对应课件：5.14 节点③：生成、Web 兜底、存记忆
> 前置节点：`retrieve_node` → `web_search_node` → `generate_rag_node` / `generate_direct_node` / `generate_general_node` → `enqueue_pending_node` → `save_memory_node`

## 一、节点定位

本节覆盖 6 个节点，是 QA Agent 的"后半段"——根据检索结果生成回答，并处理副作用（Web 搜索、入队、记忆保存）。

```
retrieve_node
  │
  ├─ is_high_confidence=True → generate_rag_node → save_memory_node
  │
  └─ is_high_confidence=False → web_search_node → generate_direct_node
       │                                              │
       │                                    enqueue_pending_node
       │                                              │
       └────────────────────────────────────── save_memory_node

GENERAL 分支（独立路径）：
  classify_query_node → generate_general_node → save_memory_node
```

### 1.1 6 个节点的职责

| 节点 | 类型 | 触发条件 | 产出 |
|------|------|---------|------|
| `web_search_node` | 副作用 | 低置信度 | `web_search_results` |
| `generate_rag_node` | 生成 | 高置信度 | `answer` + `sources` + `answer_mode="rag"` |
| `generate_direct_node` | 生成 | 低置信度 | `answer` + `answer_mode="web_augmented"/"llm_direct"` |
| `generate_general_node` | 生成 | query_type=GENERAL | `answer` + `answer_mode="general"/"web_augmented"` |
| `enqueue_pending_node` | 副作用 | 低置信度 | 写 DB（不修改 State） |
| `save_memory_node` | 副作用 | 总是 | 写 DB（不修改 State） |

---

## 二、`web_search_node`：Web 搜索（第 604~634 行）

### 2.1 函数签名

```python
async def web_search_node(state: QAState) -> dict:
    """
    调用 Web Search MCP 工具获取时效性信息。

    被两条路径共用：
    1. GENERAL_WEB 路径：通用问题 + 联网指令 → 搜索后进 generate_general
    2. 低置信度路径：知识库命中不足 → 搜索后进 generate_direct

    MCP 调用失败时返回空列表，不影响后续流程。
    """
```

### 2.2 逐行精读

```python
from backend.mcp.client import call_mcp_tool
from backend.config import get_settings

query = state["original_query"]
settings = get_settings()

try:
    results = await call_mcp_tool(
        server_url=settings.web_search_mcp_url,
        tool_name="web_search",
        arguments={"query": query, "max_results": 5},
        timeout=15.0,
    )
    if not isinstance(results, list):
        results = []
    logger.info("web_search.done", query=query[:50], hits=len(results))
except Exception as e:
    logger.warning("web_search.failed", error=str(e))
    results = []

return {"web_search_results": results}
```

**`try/except Exception`**：MCP 调用可能失败（网络超时、Server 未启动、API 错误），捕获所有异常类型，返回空列表。

**`if not isinstance(results, list)`**：`call_mcp_tool` 返回值类型不确定，显式检查确保 `web_search_results` 始终是 `list`。

**`timeout=15.0`**：Web 搜索的超时时间。如果搜索后端 15 秒内无响应，放弃等待，返回空结果。

---

## 三、`generate_rag_node`：高置信度 RAG 生成（第 641~709 行）

### 3.1 函数签名

```python
async def generate_rag_node(state: QAState) -> dict:
    """
    高置信度 RAG 生成节点（confidence ≥ 0.75）。

    将精排后的 Top-3 文档拼成 context，让 LLM 严格基于知识库内容回答。
    回答末尾附加 📚 参考来源。

    注入历史摘要（existing_summary）保持多轮对话的连贯性。
    """
```

### 3.2 构建知识库上下文（第 658~666 行）

```python
context_parts = []
sources = []
for i, chunk in enumerate(ranked_chunks, 1):
    context_parts.append(f"【参考{i}】\n{chunk['content']}")
    source_name = chunk.get("metadata", {}).get("source_name", "课程文档")
    if source_name not in sources:
        sources.append(source_name)

context_text = "\n\n".join(context_parts)
```

**`enumerate(ranked_chunks, 1)`**：从 1 开始编号，生成 `【参考1】`、`【参考2】`、`【参考3】`。

**`source_name not in sources` 去重**：多个 chunk 可能来自同一文档，来源列表去重。

**context 输出格式**：

```
【参考1】
IOC 容器是 Spring 框架的核心模块，负责管理对象的生命周期...

【参考2】
依赖注入（DI）是 IOC 的一种实现方式，通过构造器或 setter 注入...
```

### 3.3 消息列表构建（第 669~680 行）

```python
llm_messages = [SystemMessage(content=_build_system_content(summary))]

# 注入历史对话窗口（排除最后一条 HumanMessage）
# 最后一条 HumanMessage 已拼入 RAG_ANSWER_PROMPT 的 {query}，
# 再传一次会让问题在上下文里出现两次，影响生成质量。
windowed = trim_messages_to_window(messages[:-1], window_size=10)
for msg in windowed:
    if not isinstance(msg, SystemMessage):
        llm_messages.append(msg)

rag_prompt = RAG_ANSWER_PROMPT.format(context=context_text, query=query)
llm_messages.append(HumanMessage(content=rag_prompt))
```

**`messages[:-1]` 排除最后一条 HumanMessage**：当前问题已经通过 `RAG_ANSWER_PROMPT.format(query=query)` 拼入 prompt，不需要再传一次。如果传了，问题会在上下文出现两次，影响生成质量。

**`for msg in windowed: if not isinstance(msg, SystemMessage)`**：跳过 SystemMessage。SystemMessage 已经通过 `_build_system_content(summary)` 单独注入，不需要重复。

### 3.4 LLM 调用与来源标注（第 682~688 行）

```python
llm = get_llm("qa", streaming=True)  # 流式模式，供 SSE 接口逐 token 推送
response = await llm.ainvoke(llm_messages)
answer_text = _get_message_content(response).strip()

# 附加来源标注
sources_text = "\n".join([f"  • {s}" for s in sources])
final_answer = f"{answer_text}\n\n📚 **参考来源**\n{sources_text}"
```

**`streaming=True`**：启用流式模式，SSE 接口可以逐 token 推送给前端。

**`📚 **参考来源**`**：回答末尾附加来源标注，让学员知道回答来自哪些文档。

### 3.5 返回值（第 697~709 行）

```python
return {
    "answer":      final_answer,
    "sources":     sources,
    "answer_mode": "rag",
    "messages":    [AIMessage(content=final_answer)],
    "should_summarize": should_trigger_summary(messages),
    "structured_output": {
        "answer":      final_answer,
        "sources":     sources,
        "confidence":  state.get("confidence", 0),
        "answer_mode": "rag",
    },
}
```

**`"messages": [AIMessage(content=final_answer)]`**：通过 `add_messages` reducer 追加到历史消息列表。LangGraph 自动合并，不需要手动 append。

**`"should_summarize": should_trigger_summary(messages)`**：判断是否触发摘要压缩，`save_memory_node` 读取这个标记。

---

## 四、`generate_direct_node`：低置信度 LLM 直答（第 716~788 行）

### 4.1 函数签名

```python
async def generate_direct_node(state: QAState) -> dict:
    """
    低置信度 LLM 直答节点（confidence < 0.75）。

    有两种模式：
    - web_augmented：有 Web 搜索结果，注入为上下文
    - llm_direct：无搜索结果，直接 LLM 回答，末尾追加 ⚠️ 提示
    """
```

### 4.2 Web 搜索结果注入（第 737~748 行）

```python
web_results = state.get("web_search_results") or []
web_context = ""
web_sources: list[str] = []
if web_results:
    snippets = "\n".join(
        f"  [{i + 1}] {r.get('title', '')}（{r.get('url', '')}）\n"
        f"      {r.get('snippet', '')[:300]}"
        for i, r in enumerate(web_results)
    )
    web_context = f"\n\n【Web 搜索补充参考】\n{snippets}"
    web_sources = [r.get("url", "") for r in web_results if r.get("url")]
```

**`state.get("web_search_results") or []`**：`web_search_node` 可能未执行（如路径跳过），用空列表兜底。

**`snippet[:300]`**：搜索结果片段截断到 300 字符，防止过长内容撑爆 Prompt。

### 4.3 两种模式分支（第 756~767 行）

```python
if web_sources:
    # web_augmented 模式：URL 通过 sources 字段传给前端
    final_answer = answer_text
    answer_mode  = "web_augmented"
else:
    # llm_direct 模式：末尾追加 ⚠️ 提示
    final_answer = (
        f"{answer_text}\n\n"
        f"⚠️ **说明**：以上为 AI 基于通用知识的回答，课程知识库中暂无相关内容。"
        f"建议以教师讲解为准，或联系教师补充相关资料。"
    )
    answer_mode = "llm_direct"
```

| 模式 | 条件 | 回答内容 | answer_mode |
|------|------|---------|-------------|
| `web_augmented` | 有 Web 搜索结果 | LLM 回答 + 来源 URL | `"web_augmented"` |
| `llm_direct` | 无 Web 搜索结果 | LLM 回答 + ⚠️ 提示 | `"llm_direct"` |

**⚠️ 提示的设计目的**：当知识库和 Web 搜索都无法提供相关信息时，LLM 用自身知识回答。但必须明确告知学员"这不是课程资料的内容"，避免学员误以为回答来自课程资料。

---

## 五、`generate_general_node`：通用问题直答（第 795~854 行）

### 5.1 函数签名

```python
async def generate_general_node(state: QAState) -> dict:
    """
    通用问题直答节点（query_type=GENERAL）。

    适用于：打招呼、问时间、闲聊等与课程无关的问题。
    联网模式下若 web_search_results 非空，注入搜索结果提供时效性信息。

    与 generate_direct 的区别：
    - generate_general：query_type=GENERAL，跳过 RAG，直接 LLM 回答
    - generate_direct：query_type=PRECISE/VAGUE/BROAD，但知识库命中不足
    """
```

### 5.2 历史上下文注入（第 821~828 行）

```python
history_text = _format_history_for_prompt(messages[-6:])
prompt = GENERAL_ANSWER_PROMPT.format(
    query=query,
    history=history_text,
    current_time=_current_datetime_str(),
    web_context=web_context,
)
```

**`messages[-6:]`**：取最近 3 轮对话（6 条消息）作为上下文。通用问题不需要太多历史。

**`_current_datetime_str()`**：注入当前时间，使 LLM 能回答"今天星期几"、"现在几点"等时间相关问题。

### 5.3 返回值（第 842~854 行）

```python
return {
    "answer":      answer_text,
    "sources":     web_sources,
    "answer_mode": answer_mode,
    "messages":    [AIMessage(content=answer_text)],
    "should_summarize": should_trigger_summary(messages),
    "structured_output": {
        "answer":      answer_text,
        "sources":     web_sources,
        "confidence":  1.0,
        "answer_mode": answer_mode,
    },
}
```

**`"confidence": 1.0`**：GENERAL 路径的置信度固定为 1.0，因为不需要检索，不涉及置信度评估。

---

## 六、`enqueue_pending_node`：低置信度问题入队（第 861~899 行）

### 6.1 函数签名

```python
async def enqueue_pending_node(state: QAState) -> dict:
    """
    将低置信度问题写入 knowledge_pending_queue，供教师审查补充知识库。

    当知识库无法回答学员问题时（confidence < 0.75），
    把问题记录到待补充队列，教师定期审查后补充知识库文档。

    ON CONFLICT DO NOTHING：幂等写入，同一问题重复触发不会产生重复记录。
    失败静默，不影响已生成的回答。返回 {} 不修改 State。
    """
```

### 6.2 幂等写入（第 874~895 行）

```python
async with AsyncSessionLocal() as session:
    async with session.begin():
        await session.execute(
            text("""
                INSERT INTO knowledge_pending_queue
                    (id, tenant_id, question, student_id, confidence, status)
                VALUES (:id, :tenant_id, :question, :student_id, :confidence, 'pending')
                ON CONFLICT DO NOTHING
            """),
            {
                "id":         str(uuid.uuid4()),
                "tenant_id":  state["tenant_id"],
                "question":   state["original_query"],
                "student_id": state["student_id"],
                "confidence": state.get("confidence", 0.0),
            },
        )
```

**`ON CONFLICT DO NOTHING`**：幂等写入。如果 `knowledge_pending_queue` 表有唯一约束（如 `question + tenant_id`），同一问题重复触发不会产生重复记录。

**`str(uuid.uuid4())`**：生成随机 UUID 作为主键。

**`return {}`**：**不修改 State**。这是纯副作用节点，数据写入 DB 后直接返回空字典。

**`try/except` 捕获所有异常**：入队失败不影响已生成的回答。即使 DB 写入失败，学员已经收到了回答。

---

## 七、`save_memory_node`：记忆保存（第 906~966 行）

### 7.1 函数签名

```python
async def save_memory_node(state: QAState) -> dict:
    """
    记忆保存节点：条件触发摘要压缩 + 写回 qa_sessions 表。

    should_summarize=True（对话超过 10 轮）时先压缩历史再写库。
    两步均失败静默，不中断流程。返回 {} 不修改 State。

    UPSERT 逻辑：
    - 首次写入 → INSERT（summary_version=1）
    - 后续写入 → UPDATE（summary_version + 1）
    """
```

### 7.2 摘要压缩（第 927~939 行）

```python
if state.get("should_summarize", False):
    try:
        # 只压缩最近 10 轮（≤20 条消息），旧知识由 existing_summary 保留
        msgs_to_compress = trim_messages_to_window(messages, window_size=10)
        summary = await compress_to_summary(
            messages=msgs_to_compress,
            existing_summary=summary,
        )
        logger.info("save_memory.summary_compressed", thread_id=thread_id)
    except Exception as e:
        logger.warning("save_memory.compress_failed", error=str(e))
```

**`state.get("should_summarize", False)`**：只在 `generate_rag_node` 或 `generate_direct_node` 标记了 `should_summarize=True` 时才压缩。

**`trim_messages_to_window(messages, window_size=10)`**：只压缩最近 10 轮对话（≤20 条消息）。更早的对话已经由 `existing_summary` 保留。如果直接传全量 messages，随对话增长输入会线性膨胀，最终超出 DeepSeek-V3 的 64k context 上限。

**`compress_to_summary(..., existing_summary=summary)`**：增量压缩。传入已有的历史摘要，新压缩的摘要追加到已有摘要后。

### 7.3 UPSERT 到 qa_sessions 表（第 942~964 行）

```python
async with AsyncSessionLocal() as session:
    async with session.begin():
        await session.execute(
            text("""
                INSERT INTO qa_sessions
                    (id, tenant_id, student_id, thread_id, summary, summary_version)
                VALUES (:id, :tenant_id, :student_id, :thread_id, :summary, 1)
                ON CONFLICT (thread_id) DO UPDATE
                    SET summary         = EXCLUDED.summary,
                        summary_version = qa_sessions.summary_version + 1,
                        updated_at      = NOW()
            """),
            {
                "id":         str(uuid.uuid4()),
                "tenant_id":  tenant_id,
                "student_id": student_id,
                "thread_id":  thread_id,
                "summary":    summary,
            },
        )
```

**`ON CONFLICT (thread_id) DO UPDATE`**：UPSERT 语义。

| 场景 | 操作 | summary_version |
|------|------|----------------|
| 首次写入（thread_id 不存在） | INSERT | 1 |
| 后续写入（thread_id 已存在） | UPDATE | +1（递增） |

**`EXCLUDED.summary`**：PostgreSQL UPSERT 语法，表示 INSERT 子句中提供的值。

**`updated_at = NOW()`**：每次更新时刷新时间戳。

---

## 八、4 种 answer_mode 取值

`answer_mode` 字段记录最终回答的生成方式，用于前端展示和后端统计：

| answer_mode | 触发条件 | 回答来源 | 置信度 |
|------------|---------|---------|--------|
| `"rag"` | 高置信度（≥0.75） | 知识库 + 📚 来源标注 | ≥0.75 |
| `"web_augmented"` | 低置信度 + Web 搜索结果 | LLM 自身知识 + Web 来源 | <0.75 |
| `"llm_direct"` | 低置信度 + 无 Web 结果 | LLM 自身知识 + ⚠️ 提示 | <0.75 |
| `"general"` | query_type=GENERAL | LLM 自身知识 | 1.0 |

---

## 九、`★` 设计亮点总结

### 9.1 消息列表去重

```python
windowed = trim_messages_to_window(messages[:-1], window_size=10)
```

排除最后一条 HumanMessage（已拼入 prompt），避免问题在上下文出现两次。

### 9.2 纯副作用节点返回 `{}`

`enqueue_pending_node` 和 `save_memory_node` 返回空字典 `{}`，不修改 State。LangGraph 收到空字典不会更新任何字段，State 保持不变。

### 9.3 失败静默

所有 DB 操作和 Web 搜索都在 `try/except` 中包裹，异常只记录日志，不中断流程。

### 9.4 增量压缩

```python
msgs_to_compress = trim_messages_to_window(messages, window_size=10)
summary = await compress_to_summary(messages=msgs_to_compress, existing_summary=summary)
```

只压缩最近 10 轮，旧知识由 `existing_summary` 保留。防止输入线性膨胀超出 context 上限。

### 9.5 UPSERT 幂等

```python
ON CONFLICT (thread_id) DO UPDATE
    SET summary_version = qa_sessions.summary_version + 1
```

首次 INSERT，后续 UPDATE，`summary_version` 递增。可重复执行，不会产生重复记录。

### 9.6 双模式兜底

| 模式 | 有 Web 结果 | 无 Web 结果 |
|------|------------|------------|
| 回答 | 注入 Web 上下文 | 纯 LLM 回答 |
| 标记 | `web_augmented` | `llm_direct` + ⚠️ 提示 |
| 来源 | URL 列表 | 无 |

### 9.7 流式支持

```python
llm = get_llm("qa", streaming=True)
```

启用流式模式，SSE 接口可以逐 token 推送给前端。

### 9.8 structured_output 统一格式

每个生成节点返回 `structured_output` 字典，包含 `answer`、`sources`、`confidence`、`answer_mode`。Orchestrator 从该字段提取结构化数据，无需解析回答文本。