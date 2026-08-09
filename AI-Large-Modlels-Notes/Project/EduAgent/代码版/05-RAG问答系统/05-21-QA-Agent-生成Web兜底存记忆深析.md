# QA Agent 节点③：生成、Web 兜底、存记忆 深度解析

> 源文件：`backend/agents/qa/nodes.py` 第 600~968 行
> 对应课件：5.14 节点③：生成、Web 兜底、存记忆
> 前置节点：`retrieve_node` → `web_search_node` → `generate_rag_node` / `generate_direct_node` / `generate_general_node` → `enqueue_pending_node` → `save_memory_node`

## 一、全文行号速查表

| 行号范围 | 函数/节点 | 类型 | 职责 |
|---------|----------|------|------|
| 602~633 | `web_search_node()` | 副作用 | 调用 MCP Web Search 获取时效性信息 |
| 639~708 | `generate_rag_node()` | 生成 | 高置信度 RAG 生成（confidence >= 0.75） |
| 714~787 | `generate_direct_node()` | 生成 | 低置信度 LLM 直答（confidence < 0.75） |
| 793~853 | `generate_general_node()` | 生成 | 通用问题直答（query_type=GENERAL） |
| 859~904 | `enqueue_pending_node()` | 副作用 | 低置信度问题入队（confidence >= 0.75 跳过） |
| 910~968 | `save_memory_node()` | 副作用 | 记忆保存（UPSERT 幂等） |

### 1.1 6 个节点的职责

| 节点 | 类型 | 触发条件 | 产出 |
|------|------|---------|------|
| `web_search_node` | 副作用 | 低置信度 | `web_search_results` |
| `generate_rag_node` | 生成 | 高置信度 | `answer` + `sources` + `answer_mode="rag"` |
| `generate_direct_node` | 生成 | 低置信度 | `answer` + `answer_mode="web_augmented"/"llm_direct"` |
| `generate_general_node` | 生成 | query_type=GENERAL | `answer` + `answer_mode="general"/"web_augmented"` |
| `enqueue_pending_node` | 副作用 | 所有生成节点 | 写 DB（内部按 confidence 过滤，>=0.75 跳过） |
| `save_memory_node` | 副作用 | 总是 | 写 DB（不修改 State） |

---

## 二、`web_search_node`：Web 搜索（第 602~633 行）

### 2.1 函数签名与动机

```python
# nodes.py 第 602~633 行
async def web_search_node(state: QAState) -> dict:
    """
    调用 Web Search MCP 工具获取时效性信息。

    被两条路径共用：
    1. GENERAL_WEB 路径：通用问题 + 联网指令 → 搜索后进 generate_general
    2. 低置信度路径：知识库命中不足 → 搜索后进 generate_direct

    MCP 调用失败时返回空列表，不影响后续流程。
    """
```

**设计动机**：知识库内容有限，无法覆盖所有时效性问题（如"2024年最新AI趋势"）。当知识库命中不足时，通过 Web 搜索补充时效性信息，提升回答质量。

### 2.2 逐行精读

```python
# nodes.py 第 612~632 行
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

| 行号 | 代码 | 说明 |
|------|------|------|
| 612~613 | `from backend.mcp.client import call_mcp_tool` | MCP 客户端，通过 HTTP 调用 MCP Server |
| 615 | `query = state["original_query"]` | 从 State 中读取原始用户问题 |
| 616 | `settings = get_settings()` | 获取配置，包含 MCP Server URL |
| 619~623 | `await call_mcp_tool(...)` | 调用 MCP 的 `web_search` 工具，`max_results=5`，超时 15 秒 |
| 625~626 | `if not isinstance(results, list): results = []` | 类型守卫，确保返回值是 list |
| 627 | `logger.info("web_search.done", ...)` | 结构化日志，记录搜索命中数 |
| 628~630 | `except Exception as e: ... results = []` | 捕获所有异常，失败不中断流程 |
| 632 | `return {"web_search_results": results}` | 写回 State，供下游节点使用 |

**关键设计**：
- `try/except Exception`：MCP 调用可能失败（网络超时、Server 未启动、API 错误），捕获所有异常类型，返回空列表。
- `if not isinstance(results, list)`：`call_mcp_tool` 返回值类型不确定，显式检查确保 `web_search_results` 始终是 `list`。
- `timeout=15.0`：Web 搜索的超时时间。如果搜索后端 15 秒内无响应，放弃等待，返回空结果。

---

## 三、`generate_rag_node`：高置信度 RAG 生成（第 639~708 行）

### 3.1 函数签名与动机

```python
# nodes.py 第 639~649 行
async def generate_rag_node(state: QAState) -> dict:
    """
    高置信度 RAG 生成节点（confidence >= 0.75）。

    将精排后的 Top-3 文档拼成 context，让 LLM 严格基于知识库内容回答。
    回答末尾附加 📚 参考来源，让学员知道回答来自哪些文档。

    注入历史摘要（existing_summary）保持多轮对话的连贯性。
    例如：上一轮问了 Spring IOC，这一轮问"它的优缺点"，
    有了历史摘要，LLM 知道"它"指的是 Spring IOC。
    """
```

**设计动机**：当知识库检索置信度足够高（>=0.75）时，LLM 应严格基于知识库内容回答，并在末尾标注来源，让学员知道信息来源，增强可信度。

### 3.2 构建知识库上下文（第 656~664 行）

```python
# nodes.py 第 656~664 行
context_parts = []
sources = []
for i, chunk in enumerate(ranked_chunks, 1):
    context_parts.append(f"【参考{i}】\n{chunk['content']}")
    source_name = chunk.get("metadata", {}).get("source_name", "课程文档")
    if source_name not in sources:
        sources.append(source_name)

context_text = "\n\n".join(context_parts)
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 656~657 | `context_parts = []; sources = []` | 初始化上下文段落列表和来源列表 |
| 658 | `for i, chunk in enumerate(ranked_chunks, 1):` | 从 1 开始编号，生成 `【参考1】`、`【参考2】`、`【参考3】` |
| 659 | `context_parts.append(f"【参考{i}】\n{chunk['content']}")` | 每个 chunk 加编号前缀 |
| 660~662 | `source_name = chunk.get(...)` → `if source_name not in sources: sources.append(source_name)` | 来源去重，多个 chunk 可能来自同一文档 |
| 664 | `context_text = "\n\n".join(context_parts)` | 用空行拼接各段落 |

**context 输出格式**：
```
【参考1】
IOC 容器是 Spring 框架的核心模块，负责管理对象的生命周期...

【参考2】
依赖注入（DI）是 IOC 的一种实现方式，通过构造器或 setter 注入...
```

### 3.3 消息列表构建（第 667~678 行）

```python
# nodes.py 第 667~678 行
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

| 行号 | 代码 | 说明 |
|------|------|------|
| 667 | `llm_messages = [SystemMessage(content=_build_system_content(summary))]` | SystemMessage 包含角色设定和历史摘要 |
| 672 | `windowed = trim_messages_to_window(messages[:-1], window_size=10)` | `messages[:-1]` 排除最后一条 HumanMessage（已拼入 prompt），避免问题重复出现 |
| 673~675 | `for msg in windowed: if not isinstance(msg, SystemMessage):` | 跳过 SystemMessage，已通过 `_build_system_content` 单独注入 |
| 677 | `rag_prompt = RAG_ANSWER_PROMPT.format(...)` | 格式化 RAG 提示词，注入 context 和 query |
| 678 | `llm_messages.append(HumanMessage(content=rag_prompt))` | 追加当前问题的 RAG 提示 |

### 3.4 LLM 调用与来源标注（第 680~686 行）

```python
# nodes.py 第 680~686 行
llm = get_llm("qa", streaming=True)  # 流式模式，供 SSE 接口逐 token 推送
response = await llm.ainvoke(llm_messages)
answer_text = _get_message_content(response).strip()

# 附加来源标注
sources_text = "\n".join([f"  • {s}" for s in sources])
final_answer = f"{answer_text}\n\n📚 **参考来源**\n{sources_text}"
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 680 | `llm = get_llm("qa", streaming=True)` | 启用流式模式，SSE 接口可逐 token 推送 |
| 681 | `response = await llm.ainvoke(llm_messages)` | 调用 LLM 生成回答 |
| 682 | `answer_text = _get_message_content(response).strip()` | 提取回答文本并去除首尾空白 |
| 685~686 | `sources_text = ...; final_answer = f"..."` | 附加 📚 参考来源标注 |

### 3.5 返回值（第 695~707 行）

```python
# nodes.py 第 695~707 行
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

| 字段 | 值 | 说明 |
|------|-----|------|
| `answer` | `final_answer` | 带 📚 来源标注的完整回答 |
| `sources` | `sources` | 来源文档名称列表 |
| `answer_mode` | `"rag"` | 标记为 RAG 模式 |
| `messages` | `[AIMessage(content=final_answer)]` | 通过 `add_messages` reducer 追加到历史 |
| `should_summarize` | `should_trigger_summary(messages)` | 判断是否触发摘要压缩 |
| `structured_output` | dict | 统一结构化输出格式 |

---

## 四、`generate_direct_node`：低置信度 LLM 直答（第 714~787 行）

### 4.1 函数签名与动机

```python
# nodes.py 第 714~722 行
async def generate_direct_node(state: QAState) -> dict:
    """
    低置信度 LLM 直答节点（confidence < 0.75）。

    知识库无足够相关内容时，直接用 LLM 参数知识回答。
    有两种模式：
    - web_augmented：有 Web 搜索结果，注入为上下文
    - llm_direct：无搜索结果，直接 LLM 回答，末尾追加 ⚠️ 提示
    """
```

**设计动机**：知识库并非无所不包。当检索置信度不足时，不能强行编造知识库内容。应切换到 LLM 自身知识回答，并让学员知道这是 LLM 的通用知识而非课程资料。

### 4.2 逐行精读（第 723~752 行）

```python
# nodes.py 第 723~752 行
query    = state["original_query"]
messages = state.get("messages", [])
summary  = state.get("existing_summary")

llm_messages = [SystemMessage(content=_build_system_content(summary))]

windowed = trim_messages_to_window(messages[:-1], window_size=10)
for msg in windowed:
    if not isinstance(msg, SystemMessage):
        llm_messages.append(msg)

# ── Web 搜索结果注入 ──────────────────────────────────────
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

direct_prompt = DIRECT_ANSWER_PROMPT.format(query=query) + web_context
llm_messages.append(HumanMessage(content=direct_prompt))

llm = get_llm("qa", streaming=True)
response = await llm.ainvoke(llm_messages)
answer_text = _get_message_content(response).strip()
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 723~725 | `query = state["original_query"]` 等 | 读取 State 中的原始问题、消息列表和历史摘要 |
| 727 | `llm_messages = [SystemMessage(...)]` | 构建 SystemMessage，注入历史摘要 |
| 729~732 | `windowed = trim_messages_to_window(...)` | 截取历史窗口（排除当前问题），跳过 SystemMessage |
| 735 | `web_results = state.get("web_search_results") or []` | `web_search_node` 可能未执行，空列表兜底 |
| 739~743 | `snippets = "\n".join(...)` | 格式化搜索结果，snippet 截断到 300 字符 |
| 744~745 | `web_context = ...; web_sources = [...]` | 构建 Web 上下文和来源 URL 列表 |
| 747 | `direct_prompt = DIRECT_ANSWER_PROMPT.format(query=query) + web_context` | 拼接直答提示词 + Web 上下文 |
| 750~752 | `llm = get_llm(...); response = await llm.ainvoke(...); answer_text = ...` | 调用 LLM 生成回答 |

### 4.3 两种模式分支（第 754~765 行）

```python
# nodes.py 第 754~765 行
if web_sources:
    # web_augmented 模式：URL 通过 sources 字段传给前端，由 UI 折叠面板展示
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

### 4.4 返回值（第 774~786 行）

```python
# nodes.py 第 774~786 行
return {
    "answer":      final_answer,
    "sources":     web_sources,
    "answer_mode": answer_mode,
    "messages":    [AIMessage(content=final_answer)],
    "should_summarize": should_trigger_summary(messages),
    "structured_output": {
        "answer":      final_answer,
        "sources":     web_sources,
        "confidence":  state.get("confidence", 0),
        "answer_mode": answer_mode,
    },
}
```

---

## 五、`generate_general_node`：通用问题直答（第 793~853 行）

### 5.1 函数签名与动机

```python
# nodes.py 第 793~803 行
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

**设计动机**：不是所有问题都需要检索知识库。打招呼、闲聊等与课程无关的问题，直接让 LLM 回答即可，无需走完整的检索-RAG 流程，节省响应时间。

### 5.2 逐行精读（第 804~830 行）

```python
# nodes.py 第 804~830 行
query       = state["original_query"]
messages    = state.get("messages", [])
web_results = state.get("web_search_results") or []

web_context = ""
web_sources: list[str] = []
if web_results:
    snippets = "\n".join(
        f"  [{i + 1}] {r.get('title', '')}（{r.get('url', '')}）\n"
        f"      {r.get('snippet', '')[:300]}"
        for i, r in enumerate(web_results)
    )
    web_context = f"【Web 搜索结果】\n{snippets}\n\n"
    web_sources = [r.get("url", "") for r in web_results if r.get("url")]

# 取最近 3 轮对话作为上下文
history_text = _format_history_for_prompt(messages[-6:])
prompt = GENERAL_ANSWER_PROMPT.format(
    query=query,
    history=history_text,
    current_time=_current_datetime_str(),
    web_context=web_context,
)

llm = get_llm("qa", streaming=True)
response = await llm.ainvoke([HumanMessage(content=prompt)])
answer_text = _get_message_content(response).strip()
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 804~806 | `query = state["original_query"]` 等 | 读取 State |
| 808~817 | `web_context = ""; web_sources = []` | 处理 Web 搜索结果（与 generate_direct 相同逻辑） |
| 820 | `history_text = _format_history_for_prompt(messages[-6:])` | `messages[-6:]` 取最近 3 轮对话（6 条消息），通用问题不需要太多历史 |
| 821~826 | `prompt = GENERAL_ANSWER_PROMPT.format(...)` | 格式化通用回答提示词，注入 query、history、current_time、web_context |
| 824 | `current_time=_current_datetime_str()` | 注入当前时间，使 LLM 能回答"今天星期几"、"现在几点"等时间相关问题 |
| 828~830 | `llm = get_llm(...); response = await llm.ainvoke(...)` | 调用 LLM 生成回答 |

### 5.3 返回值（第 840~852 行）

```python
# nodes.py 第 840~852 行
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

| 字段 | 值 | 说明 |
|------|-----|------|
| `answer` | `answer_text` | 通用回答文本 |
| `sources` | `web_sources` | Web 来源 URL（如有） |
| `answer_mode` | `"web_augmented"` 或 `"general"` | 根据是否有 Web 搜索结果 |
| `structured_output.confidence` | `1.0` | 固定 1.0，GENERAL 路径不涉及检索 |

---

## 六、`enqueue_pending_node`：低置信度问题入队（第 859~904 行）

### 6.1 函数签名与动机

```python
# nodes.py 第 859~870 行
async def enqueue_pending_node(state: QAState) -> dict:
    """
    将低置信度问题写入 knowledge_pending_queue，供教师审查补充知识库。

    当知识库无法回答学员问题时（confidence < 0.75），
    把问题记录到待补充队列，教师定期审查后补充知识库文档。

    置信度 >= 0.75 时直接跳过（高置信度 RAG / 通用问题无需记录），
    不产生任何 DB 写入。失败静默，不影响已生成的回答。返回 {} 不修改 State。

    ON CONFLICT DO NOTHING：幂等写入，同一问题重复触发不会产生重复记录。
    """
```

**设计动机**：知识库需要持续迭代。当学员问的知识库无法回答时，自动记录问题到待补充队列，教师定期审查后补充知识库文档。形成"发现问题 → 补充知识 → 更好的回答"的闭环。

### 6.2 置信度过滤（第 872~873 行）

```python
# nodes.py 第 872~873 行
# 高置信度直接跳过，不需要记录待补充问题
if state.get("confidence", 1.0) >= 0.75:
    return {}
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 872 | `if state.get("confidence", 1.0) >= 0.75:` | 默认值 1.0，`generate_general_node` 不设置 confidence 字段，拿到 1.0 直接跳过 |
| 873 | `return {}` | 不修改 State，空操作 |

**0.75 阈值**：与 `_route_by_confidence` 的 `is_high_confidence` 阈值一致，保持决策逻辑统一。

**设计意图**：`enqueue_pending_node` 在图层面被所有生成节点调用（`for` 循环统一连边），但内部按置信度过滤——高置信度路径走空操作，低置信度才实际写入。这样图结构简单统一，行为与课件一致。

### 6.3 幂等写入（第 878~901 行）

```python
# nodes.py 第 878~901 行
try:
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
    logger.info(...)
except Exception as e:
    logger.warning("enqueue_pending.failed", error=str(e))

return {}  # 不修改 State
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 878~879 | `async with AsyncSessionLocal() as session:` | 创建异步 DB 会话 |
| 879 | `async with session.begin():` | 开启事务，自动提交/回滚 |
| 880~886 | `INSERT INTO knowledge_pending_queue ... ON CONFLICT DO NOTHING` | 幂等写入，同一问题不会重复记录 |
| 887~893 | 参数绑定 | 使用绑定参数防止 SQL 注入 |
| 895~899 | `logger.info(...)` | 结构化日志记录 |
| 900~901 | `except Exception as e: logger.warning(...)` | 失败静默，不影响已生成的回答 |
| 903 | `return {}` | 不修改 State |

**关键设计**：
- `ON CONFLICT DO NOTHING`：幂等写入。如果 `knowledge_pending_queue` 表有唯一约束（如 `question + tenant_id`），同一问题重复触发不会产生重复记录。
- `str(uuid.uuid4())`：生成随机 UUID 作为主键。
- `return {}`：**不修改 State**。纯副作用节点，数据写入 DB 后直接返回空字典。
- `try/except` 捕获所有异常：入队失败不影响已生成的回答。即使 DB 写入失败，学员已经收到了回答。

---

## 七、`save_memory_node`：记忆保存（第 910~968 行）

### 7.1 函数签名与动机

```python
# nodes.py 第 910~920 行
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

**设计动机**：多轮对话中，历史消息会不断累积，最终超出 LLM 的 context window。需要定期压缩历史为摘要，让对话可持续进行。同时，摘要持久化到 DB，即使服务重启也能恢复对话上下文。

### 7.2 逐行精读（第 921~968 行）

```python
# nodes.py 第 921~968 行
from backend.dependencies import AsyncSessionLocal

messages   = state.get("messages", [])
student_id = state["student_id"]
session_id = state["session_id"]
tenant_id  = state["tenant_id"]
thread_id  = build_thread_id(student_id, session_id)
summary    = state.get("existing_summary")
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 921 | `from backend.dependencies import AsyncSessionLocal` | 导入异步 DB 会话 |
| 923~928 | `messages = state.get("messages", [])` 等 | 读取 State 中的消息、学员 ID、会话 ID、租户 ID、thread_id 和现有摘要 |
| 927 | `thread_id = build_thread_id(student_id, session_id)` | 构造唯一线程标识 |

### 7.3 摘要压缩（第 931~943 行）

```python
# nodes.py 第 931~943 行
# ── 条件触发摘要压缩 ─────────────────────────────────────────
if state.get("should_summarize", False):
    try:
        # 只压缩最近 10 轮（≤20 条消息），旧知识由 existing_summary 保留
        # 若直接传全量 messages，随对话增长输入会线性膨胀，
        # 最终超出 DeepSeek-V3 的 64k context 上限
        msgs_to_compress = trim_messages_to_window(messages, window_size=10)
        summary = await compress_to_summary(
            messages=msgs_to_compress,
            existing_summary=summary,
        )
        logger.info("save_memory.summary_compressed", thread_id=thread_id)
    except Exception as e:
        logger.warning("save_memory.compress_failed", error=str(e))
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 931 | `if state.get("should_summarize", False):` | 只在生成节点标记了 `should_summarize=True` 时才压缩（对话超过 10 轮） |
| 936 | `msgs_to_compress = trim_messages_to_window(messages, window_size=10)` | 只压缩最近 10 轮（≤20 条消息），更早的对话已由 `existing_summary` 保留 |
| 937~940 | `summary = await compress_to_summary(messages=msgs_to_compress, existing_summary=summary)` | 增量压缩，新摘要追加到已有摘要后 |
| 941 | `logger.info("save_memory.summary_compressed", ...)` | 结构化日志 |
| 942~943 | `except Exception as e: logger.warning(...)` | 压缩失败静默，不影响流程 |

### 7.4 UPSERT 到 qa_sessions 表（第 946~968 行）

```python
# nodes.py 第 946~968 行
# ── UPSERT 到 qa_sessions 表 ──────────────────────────────────
try:
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
except Exception as e:
    logger.warning("save_memory.db_write_failed", error=str(e))

return {}
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 946~947 | `async with AsyncSessionLocal() as session:` | 创建异步 DB 会话 |
| 948 | `async with session.begin():` | 开启事务 |
| 949~958 | `INSERT INTO qa_sessions ... ON CONFLICT (thread_id) DO UPDATE ...` | UPSERT 语义 |
| 954 | `VALUES (:id, ..., :summary, 1)` | 首次写入，`summary_version=1` |
| 955~957 | `SET summary = EXCLUDED.summary, summary_version = qa_sessions.summary_version + 1, updated_at = NOW()` | 后续写入，版本号递增，更新时间刷新 |
| 959~966 | 参数绑定 | 使用绑定参数防止 SQL 注入 |
| 967~968 | `except Exception as e: logger.warning(...)` | 写入失败静默 |
| 970 | `return {}` | 不修改 State |

**UPSERT 场景**：

| 场景 | 操作 | summary_version |
|------|------|----------------|
| 首次写入（thread_id 不存在） | INSERT | 1 |
| 后续写入（thread_id 已存在） | UPDATE | +1（递增） |

**`EXCLUDED.summary`**：PostgreSQL UPSERT 语法，表示 INSERT 子句中提供的值。

---

## 八、4 种 answer_mode 取值

`answer_mode` 字段记录最终回答的生成方式，用于前端展示和后端统计：

| answer_mode | 触发条件 | 回答来源 | 置信度 |
|------------|---------|---------|--------|
| `"rag"` | 高置信度（>=0.75） | 知识库 + 📚 来源标注 | >=0.75 |
| `"web_augmented"` | 低置信度 + Web 搜索结果 | LLM 自身知识 + Web 来源 | <0.75 |
| `"llm_direct"` | 低置信度 + 无 Web 结果 | LLM 自身知识 + ⚠️ 提示 | <0.75 |
| `"general"` | query_type=GENERAL | LLM 自身知识 | 1.0 |

---

## 九、★ Insight ─── 设计亮点总结

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