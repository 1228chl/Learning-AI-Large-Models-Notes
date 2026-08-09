# QA Agent 节点函数：`nodes.py` 深度解析

> 源文件：`backend/agents/qa/nodes.py`（共 969 行）
> 对应课件：5.12~5.14 节点函数（nodes.py）
> 前置依赖：`state.py`、`prompts.py`、`llm_factory.py`、`memory.py`、`reranker.py`、`query_classifier.py`、`mcp/client.py`

## 一、文件定位

`nodes.py` 是 QA Agent 的**核心执行文件**，包含 10 个 async 节点函数 + 13 个辅助/规则函数。每个节点输入当前 `QAState`，输出要更新的字段 dict，由 LangGraph 自动合并回 State。

### 1.1 为什么需要 10 个独立的节点函数？

把处理逻辑拆成 10 个独立节点，而不是一个大的函数，原因有三：

**职责分离**：每个节点只做一件事（分类、检索、生成、存记忆），修改一个节点不影响其他节点。例如修改检索逻辑只需改 `retrieve_node`，不需要动生成逻辑。

**路径分支**：不同 query_type 走不同路径（GENERAL 跳过检索，VAGUE 走 HyDE，BROAD 走 Multi-Query）。独立节点配合 LangGraph 的条件边，可以灵活组合路径。

**可复用**：`web_search_node` 被两条路径共用（GENERAL_WEB 和低置信度兜底），独立节点避免了重复代码。

### 1.2 不写成一个大函数会怎样？

如果把所有逻辑写在一个大函数里，代码结构会变成：

```python
async def qa_agent(state):
    # 1. 分类（50 行）
    # 2. 如果是 GENERAL，直接回答（30 行）
    # 3. 如果是 VAGUE，生成 HyDE 文档（20 行）
    # 4. 检索（40 行）
    # 5. 如果置信度低，搜索 Web（30 行）
    # 6. 生成回答（40 行）
    # 7. 存记忆（30 行）
    # 总共约 240 行，难以维护
```

这种"大函数"模式的问题：无法单步调试某个阶段、无法复用部分逻辑、新增路径需要改动整个函数。10 个独立节点 + 图装配的组合，是更模块化的设计。

```
nodes.py 的职责：
  ├─ 10 个节点（async def，输入 state，输出 dict）
  ├─ 8 个辅助函数（消息处理 / 时间 / 摘要 / 截断）
  ├─ 5 个规则函数（分类规则 / 策略判定）
  └─ 被 graph.py 注册为节点

节点按功能分类：
  分类阶段：classify_query（三层分类）
  检索前置：hyde_generate（VAGUE）、multi_query_rewrite（BROAD）
  检索阶段：retrieve（混合召回 + 精排）
  生成阶段：generate_rag / generate_direct / generate_general
  副作用阶段：web_search / enqueue_pending / save_memory
```

```
classify_query
  ├─ GENERAL → generate_general
  ├─ PRECISE → retrieve
  ├─ VAGUE → hyde_generate → retrieve
  └─ BROAD → multi_query_rewrite → retrieve
                │
                ▼
        retrieve → 置信度分流
        ├─ high → generate_rag
        ├─ low_web → web_search → generate_direct
        └─ low_direct → generate_direct
        │
        所有生成节点 → enqueue_pending → save_memory
```

---

## 二、全文行号速查表

| 行号 | 内容 | 类型 |
|------|------|------|
| 1~13 | 文件头 docstring（节点分类说明） | 注释 |
| 15~36 | import + logger 初始化 | 导入 |
| 38~47 | 检索常量（`MAX_BROAD_QUERIES` 等 5 个） | 常量 |
| 50~94 | 规则集（`_GENERAL_EXACT` / `_GENERAL_KEYWORDS` / `_SPECIALIZED_KEYWORDS` / `_VAGUE_QUERY_HINTS` / `_BROAD_QUERY_HINTS`） | 常量 |
| 101~113 | `_get_message_content()` 消息内容统一提取 | 辅助函数 |
| 115~130 | `_format_history_for_prompt()` 历史格式化 | 辅助函数 |
| 132~135 | `_current_datetime_str()` 当前时间字符串 | 辅助函数 |
| 137~149 | `_build_system_content()` 构建 SystemMessage | 辅助函数 |
| 151~168 | `_extract_query_and_web_flag()` 联网指令识别 | 辅助函数 |
| 170~189 | `trim_messages_to_window()` 消息窗口截断 | 辅助函数 |
| 191~202 | `should_trigger_summary()` 是否触发摘要 | 辅助函数 |
| 204~231 | `compress_to_summary()` 摘要压缩 | 辅助函数 |
| 237~243 | `_rule_classify_general()` 规则→GENERAL | 规则函数 |
| 245~249 | `_rule_classify_specialized()` 规则→专业 | 规则函数 |
| 251~266 | `_fast_rag_strategy()` 规则快判策略 | 规则函数 |
| 268~289 | `_determine_rag_strategy()` LLM 精判策略 | 规则函数 |
| 291~303 | `_determine_rag_strategy_fast()` 两阶段判定 | 规则函数 |
| 310~407 | `classify_query_node()` 三层分类节点 | 节点 |
| 413~453 | `multi_query_rewrite_node()` 子 Query 改写节点 | 节点 |
| 459~491 | `hyde_generate_node()` HyDE 生成节点 | 节点 |
| 497~596 | `retrieve_node()` 检索节点 | 节点 |
| 602~633 | `web_search_node()` Web 搜索节点 | 节点 |
| 639~708 | `generate_rag_node()` RAG 生成节点 | 节点 |
| 714~787 | `generate_direct_node()` 直答节点 | 节点 |
| 793~853 | `generate_general_node()` 通用直答节点 | 节点 |
| 859~904 | `enqueue_pending_node()` 低置信入队节点 | 节点 |
| 910~968 | `save_memory_node()` 记忆保存节点 | 节点 |

---

## 三、常量与规则集（第 38~94 行）

### 3.1 检索常量（第 43~47 行）

```python
# nodes.py 第 43~47 行
MAX_BROAD_QUERIES        = 3    # BROAD 分支最多并行的子 Query 数
RECALL_TOP_K_PRECISE     = 8    # PRECISE：直接检索召回数
RECALL_TOP_K_VAGUE       = 10   # VAGUE：HyDE 语义扩充后多召回些
RECALL_TOP_K_BROAD_PER   = 4    # BROAD：每个子 Query 的召回数
RERANK_TOP_K             = 3    # 精排后保留的最终 chunk 数
```

| 常量 | 值 | 语义 |
|------|----|------|
| `MAX_BROAD_QUERIES` | 3 | BROAD 分支最多并行的子 Query 数 |
| `RECALL_TOP_K_PRECISE` | 8 | PRECISE 直接检索召回数 |
| `RECALL_TOP_K_VAGUE` | 10 | VAGUE 用 HyDE 语义扩充后多召回 2 条，补偿与知识库对齐的误差 |
| `RECALL_TOP_K_BROAD_PER` | 4 | BROAD 每个子 Query 召回 4 条，3 条子 Query 最多 12 条候选 |
| `RERANK_TOP_K` | 3 | 精排后保留的最终 chunk 数 |

### 3.2 规则集（第 56~94 行）

四组规则常量分别服务于 Layer 0a（GENERAL）与 Layer 0b（专业 + 策略）：

| 常量 | 行号 | 用途 |
|------|------|------|
| `_GENERAL_EXACT` | 56~62 | 精确匹配→GENERAL（打招呼、感谢、告别） |
| `_GENERAL_KEYWORDS` | 66~74 | 关键词匹配→GENERAL（问时间、天气、自我介绍） |
| `_SPECIALIZED_KEYWORDS` | 78~82 | 关键词匹配→专业（课程/项目/章节） |
| `_VAGUE_QUERY_HINTS` | 85~88 | VAGUE 提示词（没懂、讲讲、解释） |
| `_BROAD_QUERY_HINTS` | 91~94 | BROAD 提示词（全面、系统、总结、对比） |

---

## 四、辅助函数（第 101~231 行）

### 4.1 `_get_message_content`：统一提取消息内容（第 101~113 行）

**动机**：langchain 的 `BaseMessage` 有两种 content 访问方式——新版本用 `msg.content`（属性直接返回字符串），旧版本用 `msg.text`（方法）。此函数兼容两种写法，避免版本升级时报错。

```python
# nodes.py 第 101~113 行
def _get_message_content(message) -> str:
    """
    统一提取消息内容（兼容 BaseMessage 的不同实现版本）。
    """
    if hasattr(message, "text") and not callable(message.text):
        return message.text
    return str(message.content)
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 101 | `def _get_message_content(message) -> str:` | 签名，入参一个消息对象 |
| 110 | `if hasattr(message, "text") and not callable(message.text):` | 旧版本：`text` 是字符串属性（非方法） |
| 111 | `return message.text` | 直接返回字符串 |
| 112 | `return str(message.content)` | 新版本回退：强转转字符串 |

### 4.2 `_format_history_for_prompt`：历史格式化（第 115~130 行）

**动机**：把消息列表格式化为 `用户: 内容` / `AI: 内容` 的对话文本，供 LLM 提示词使用。

```python
# nodes.py 第 115~130 行
def _format_history_for_prompt(messages: list) -> str:
    lines = []
    for msg in messages:
        role = "用户" if isinstance(msg, HumanMessage) else "AI"
        content = _get_message_content(msg)[:200]  # 截断过长的消息
        lines.append(f"{role}: {content}")
    return "\n".join(lines)
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 126 | `role = "用户" if isinstance(msg, HumanMessage) else "AI"` | 按消息类型映射角色 |
| 127 | `content = _get_message_content(msg)[:200]` | 每条消息截断到 200 字符，防止提示词过长 |
| 129 | `return "\n".join(lines)` | 换行拼接 |

### 4.3 `_current_datetime_str`：当前时间（第 132~135 行）

**动机**：为 `GENERAL_ANSWER_PROMPT` 的 `{current_time}` 占位符提供带时区的当前时间。

```python
# nodes.py 第 132~135 行
def _current_datetime_str() -> str:
    return datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M:%S")
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 134 | `.now(timezone.utc).astimezone()` | UTC 时间转本地时区 |
| 134 | `.strftime("%Y-%m-%d %H:%M:%S")` | 格式化为可读字符串 |

### 4.4 `_build_system_content`：构建 SystemMessage（第 137~149 行）

**动机**：构建设置人设的 SystemMessage。若命中 `qa_sessions` 表的历史摘要，追加到 SystemMessage 中，让 LLM 知道之前的对话，实现多轮对话连贯性（例如上轮问 Spring IOC，本轮问"它的优缺点"，LLM 靠摘要知道"它"指什么）。

```python
# nodes.py 第 137~149 行
def _build_system_content(existing_summary: str | None = None) -> str:
    content = QA_SYSTEM_PROMPT
    if existing_summary:
        content += f"\n\n【对话历史摘要】\n{existing_summary}"
    return content
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 138 | `existing_summary: str \| None = None` | 可选参数，默认无摘要 |
| 145 | `content = QA_SYSTEM_PROMPT` | 基础人设（`SYSTEM_PROMPT as QA_SYSTEM_PROMPT`） |
| 146~147 | 追加摘要段 | 有摘要时以 `【对话历史摘要】` 标记追加 |

### 4.5 `_extract_query_and_web_flag`：联网指令识别（第 151~168 行）

**动机**：识别用户输入中的"联网搜索"指令，从 query 中移除指令词并设置 `enable_web_search=True`，让分类节点处理干净的 query 又知道用户要求联网。

```python
# nodes.py 第 151~168 行
def _extract_query_and_web_flag(raw_query: str) -> tuple[str, bool]:
    q = raw_query.strip()
    for keyword in ["联网搜索", "联网", "搜索一下", "查一下"]:
        if keyword in q:
            return q.replace(keyword, "").strip(), True
    return q, False
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 151 | `-> tuple[str, bool]` | 返回 (清洗后的 query, 是否联网) |
| 164 | `for keyword in ["联网搜索", "联网", "搜索一下", "查一下"]:` | 遍历 4 个联网指令词 |
| 166 | `return q.replace(keyword, "").strip(), True` | 移除指令词并置 True |
| 167 | `return q, False` | 无指令，原样返回 |

**示例**：`"BGE-M3 的最新动态，帮我联网搜索一下"` → `("BGE-M3 的最新动态，帮我", True)`。

### 4.6 `trim_messages_to_window`：消息窗口截断（第 170~189 行）

**动机**：DeepSeek 有 64k context 限制，对话轮次过多会超出长度。只保留最近 N 轮（默认 10 轮 = 20 条消息），更早的内容由 `existing_summary` 摘要保留。

```python
# nodes.py 第 170~189 行
def trim_messages_to_window(messages: list, window_size: int = 10) -> list:
    if len(messages) <= window_size * 2:
        return messages
    return messages[-(window_size * 2):]
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 186 | `if len(messages) <= window_size * 2:` | 每轮 1 user + 1 ai，故乘 2 |
| 187 | `return messages` | 未超限原样返回 |
| 188 | `return messages[-(window_size * 2):]` | 取最后 N 轮 |

### 4.7 `should_trigger_summary`：是否触发摘要（第 191~202 行）

**动机**：统计用户消息数，超过阈值（默认 10 轮）即触发摘要压缩。

```python
# nodes.py 第 191~202 行
def should_trigger_summary(messages: list, threshold: int = 10) -> bool:
    user_count = sum(1 for m in messages if isinstance(m, HumanMessage))
    return user_count >= threshold
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 200 | `sum(1 for m in messages if isinstance(m, HumanMessage))` | 统计用户消息数量 |
| 201 | `return user_count >= threshold` | 达到阈值轮次即触发 |

### 4.8 `compress_to_summary`：摘要压缩（第 204~231 行）

**动机**：对话超过 10 轮后，用 LLM 将消息压缩为 100~200 字摘要，保留关键技术问题和结论。旧消息被压缩后可丢弃，防止历史无限增长超出 context。

```python
# nodes.py 第 204~231 行
async def compress_to_summary(messages: list, existing_summary: str | None = None) -> str:
    history_text = _format_history_for_prompt(messages)
    prefix = f"【历史摘要】\n{existing_summary}\n\n" if existing_summary else ""
    prompt = (
        f"{prefix}请将以下对话压缩为一段简洁的中文摘要（100-200字），"
        f"保留关键技术问题和关键结论。\n\n{history_text}"
    )
    llm = get_llm("summarize", temperature=0)  # summarization 用 temperature=0 保证稳定性
    resp = await llm.ainvoke([HumanMessage(content=prompt)])
    return _get_message_content(resp).strip()
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 222 | `history_text = _format_history_for_prompt(messages)` | 复用历史格式化 |
| 223 | `prefix = ... if existing_summary else ""` | 已有摘要作为前缀，实现增量压缩 |
| 224~227 | 压缩提示词 | 要求 100~200 字，保留关键信息 |
| 228 | `get_llm("summarize", temperature=0)` | 独立 summarization 通道，temperature=0 保证输出稳定 |
| 230 | `return _get_message_content(resp).strip()` | 提取并去空白 |

**动机细节**：增量压缩是关键——`existing_summary` 作为前缀传入，新摘要 = 旧摘要 + 本轮新压缩，避免重复压缩全量历史。

---

## 五、规则分类函数（第 237~303 行）

### 5.1 `_rule_classify_general`：规则→通用（第 237~243 行）

**动机**：Layer 0a，判断是否为闲聊/时间/打招呼类（<1ms），无需 LLM。

```python
# nodes.py 第 237~243 行
def _rule_classify_general(query: str) -> bool:
    q = query.strip().lower()
    if q in _GENERAL_EXACT:          # 精确匹配（如"你好"）
        return True
    return any(kw in q for kw in _GENERAL_KEYWORDS)  # 关键词匹配（如"今天天气"）
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 239 | `q = query.strip().lower()` | 清洗 + 小写归一 |
| 240 | `if q in _GENERAL_EXACT:` | 精确匹配集合（"你好"、"hi"） |
| 242 | `any(kw in q for kw in _GENERAL_KEYWORDS)` | 关键词包含匹配（"今天天气"） |

### 5.2 `_rule_classify_specialized`：规则→专业（第 245~249 行）

**动机**：Layer 0b，判断是否含课程/项目信号词（课程、实战、章节、作业等），命中即确认专业问题，跳过 MiniLM。

```python
# nodes.py 第 245~249 行
def _rule_classify_specialized(query: str) -> bool:
    q = query.lower()
    return any(kw in q for kw in _SPECIALIZED_KEYWORDS)
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 248 | `any(kw in q for kw in _SPECIALIZED_KEYWORDS)` | 命中任一课程信号词 |

### 5.3 `_fast_rag_strategy`：规则快判策略（第 251~266 行）

**动机**：<1ms 快速判定 RAG 策略。很短（≤6 字）含模糊词→VAGUE；含宽泛词→BROAD；其余→PRECISE（最保守）。

```python
# nodes.py 第 251~266 行
def _fast_rag_strategy(query: str) -> str:
    q = query.strip().lower()
    if len(q) <= 6 and any(kw in q for kw in _VAGUE_QUERY_HINTS):
        return "VAGUE"
    if any(kw in q for kw in _BROAD_QUERY_HINTS):
        return "BROAD"
    return "PRECISE"
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 261 | `if len(q) <= 6 and any(..._VAGUE_QUERY_HINTS):` | 短问题 + 模糊词 → VAGUE |
| 263 | `if any(..._BROAD_QUERY_HINTS):` | 含宽泛词 → BROAD |
| 265 | `return "PRECISE"` | 其余 → PRECISE（最保守） |

### 5.4 `_determine_rag_strategy`：LLM 精判策略（第 268~289 行）

**动机**：规则快判可能误判，对长问题（≥18 字）让 LLM 二次确认。例："全面介绍一下商品聚合大模型微调的知识"规则判 BROAD（含"全面"），但 LLM 可能判 PRECISE（问题很具体）。兜底失败返回 PRECISE。

```python
# nodes.py 第 268~289 行
async def _determine_rag_strategy(query: str) -> str:
    try:
        llm = get_llm("qa", temperature=0)  # 策略判断用 temperature=0 保证确定性
        resp = await llm.ainvoke([
            HumanMessage(content=RAG_STRATEGY_PROMPT.format(query=query))
        ])
        label = _get_message_content(resp).strip().upper()
        if label in ("PRECISE", "VAGUE", "BROAD"):
            return label
    except Exception as e:
        logger.warning("classify_query.rag_strategy_failed", error=str(e))
    return "PRECISE"  # 兜底：最保守策略
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 279 | `get_llm("qa", temperature=0)` | 策略判断用 temperature=0 保证确定性 |
| 280~282 | 构造 HumanMessage 提示 | 用 `RAG_STRATEGY_PROMPT` 填入 query |
| 283 | `label = ...strip().upper()` | 提取输出并归一为大写 |
| 284 | `if label in ("PRECISE", "VAGUE", "BROAD"):` | 校验合法标签 |
| 286~287 | `except ... logger.warning(...)` | LLM 失败记录告警 |
| 288 | `return "PRECISE"` | 兜底最保守策略 |

### 5.5 `_determine_rag_strategy_fast`：两阶段判定（第 291~303 行）

**动机**：综合规则与 LLM，节约 API 配额。PRECISE 不调 LLM；VAGUE/BROAD 且问题长（≥18 字）才调 LLM 校正；极短问题直接信规则（短问题 LLM 也判断不准）。

```python
# nodes.py 第 291~303 行
async def _determine_rag_strategy_fast(query: str) -> str:
    strategy = _fast_rag_strategy(query)
    if strategy == "PRECISE":
        return strategy  # PRECISE 不需要 LLM 确认
    if len(query.strip()) >= 18:
        return await _determine_rag_strategy(query)  # 长问题才调 LLM
    return strategy  # 短问题直接相信规则
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 298 | `strategy = _fast_rag_strategy(query)` | 先规则快判 |
| 299~300 | `if strategy == "PRECISE": return strategy` | PRECISE 无需 LLM 确认 |
| 301 | `if len(query.strip()) >= 18:` | 只有长问题才可能误判 |
| 302 | `return await _determine_rag_strategy(query)` | 长问题 LLM 校正 |
| 303 | `return strategy` | 短问题直接信规则 |

---

## 六、`classify_query_node`：三层分类节点（第 310~407 行）

### 6.1 签名与动机（第 310~329 行）

**动机**：决定走哪条处理路径。三层分类体系 + 历史摘要加载 + 联网指令识别。同时取代了独立的 `load_memory` 节点（在 classify 阶段一并加载摘要，省一个节点开销）。

```python
# nodes.py 第 310~407 行
async def classify_query_node(state: QAState) -> dict:
    # ...（docstring 说明三层分类）
    # ── 取最后一条 HumanMessage 作为原始输入 ─────────────────
    messages = state.get("messages", [])
    raw_query = ""
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage):
            raw_query = _get_message_content(msg)
            break
    # ── 联网指令识别 ──────────────────────────────────────────
    original_query, auto_web = _extract_query_and_web_flag(raw_query)
    # ── 从 DB 加载历史摘要（取代独立的 load_memory 节点）──────
    existing_summary: str | None = None
    try:
        from backend.dependencies import AsyncSessionLocal
        thread_id = build_thread_id(state["student_id"], state["session_id"])
        async with AsyncSessionLocal() as db:
            row = (await db.execute(
                text("SELECT summary FROM qa_sessions WHERE thread_id = :tid"),
                {"tid": thread_id},
            )).fetchone()
            existing_summary = row[0] if row else None
    except Exception as e:
        logger.warning("classify_query.load_memory_failed", error=str(e))
    # 基础返回值（所有分支共享的部分）
    _base: dict = {
        "original_query":    original_query,
        "existing_summary":  existing_summary,
        "rewritten_queries": [],
        "hyde_document":     None,
    }
    # 自动开启联网搜索
    if auto_web and not state.get("enable_web_search", False):
        _base["enable_web_search"] = True
        logger.info("classify_query.auto_web_enabled", query=original_query[:50])
    # ── Layer 0a：规则 → GENERAL ───────────────────────────────
    if _rule_classify_general(original_query):
        logger.info("classify_query.general_by_rule", query=original_query[:50])
        return {**_base, "query_type": "GENERAL"}
    # ── Layer 0b：关键词快速通道 → 专业 ───────────────────────
    if _rule_classify_specialized(original_query):
        logger.info("classify_query.specialized_by_keyword", query=original_query[:50])
        strategy = await _determine_rag_strategy_fast(original_query)
        logger.info("classify_query.rag_strategy", strategy=strategy)
        return {**_base, "query_type": strategy}
    # ── Layer 1：MiniLM 二分类（CPU 推理，线程池避免阻塞）────
    loop = asyncio.get_running_loop()
    from backend.core.query_classifier import get_query_classifier
    label, confidence = await loop.run_in_executor(
        None, get_query_classifier().classify, original_query
    )
    if label == "general":
        logger.info("classify_query.general_by_minilm", query=original_query[:50], confidence=round(confidence, 4))
        return {**_base, "query_type": "GENERAL"}
    # ── Layer 2：MiniLM → 专业，LLM 判检索策略 ──────────────
    logger.info("classify_query.specialized_by_minilm", query=original_query[:50], confidence=round(confidence, 4))
    strategy = await _determine_rag_strategy_fast(original_query)
    logger.info("classify_query.rag_strategy", strategy=strategy)
    return {**_base, "query_type": strategy}
```

### 6.2 逐行精读

| 行号 | 代码 | 说明 |
|------|------|------|
| 331~336 | 倒序遍历取最后一条 HumanMessage | 原始输入提取 |
| 339 | `_extract_query_and_web_flag(raw_query)` | 剥离联网指令 |
| 343~354 | 从 `qa_sessions` 读摘要 | 取代独立 load_memory 节点，`try/except` 静默 |
| 357~362 | `_base` 基础字典 | 所有分支共享，BROAD/VAGUE 分支后续填充 |
| 365~367 | `auto_web` 自动开联网 | 置 `enable_web_search=True` |
| 370~372 | Layer 0a：规则→GENERAL | `<1ms` 直接返回 |
| 375~379 | Layer 0b：关键词→专业+快判策略 | 跳过 MiniLM，直接进策略判定 |
| 383~387 | Layer 1：MiniLM 二分类 | `run_in_executor` 丢线程池避免阻塞 asyncio |
| 389~396 | label=general | MiniLM 判定通用（P≥0.85） |
| 398~406 | Layer 2：策略判定 | 专业问题走 `_determine_rag_strategy_fast` |

---

## 七、检索前置节点（第 413~491 行）

### 7.1 `multi_query_rewrite_node`：子 Query 改写（第 413~453 行）

**动机**：BROAD 分支。宽泛问题（如"讲讲微服务"）直接检索效果差，改写为多个具体子 Query 后语义更精确。参考上一轮 AI 回答推断"没懂"指什么，覆盖不同角度，最多 3 条。

```python
# nodes.py 第 413~453 行
async def multi_query_rewrite_node(state: QAState) -> dict:
    query = state["original_query"]
    messages = state.get("messages", [])
    # 取上一轮 AI 回答作为参考
    last_answer = ""
    for msg in reversed(messages):
        if isinstance(msg, AIMessage):
            last_answer = _get_message_content(msg)[:300]
            break
    prompt = MULTI_QUERY_REWRITE_PROMPT.format(last_answer=last_answer, query=query)
    llm = get_llm("qa", temperature=0.3)  # 改写用 temperature=0.3 增加多样性
    resp = await llm.ainvoke([HumanMessage(content=prompt)])
    raw = _get_message_content(resp).strip()
    # 解析 LLM 输出：每行一条子 Query，过滤掉过短的行
    rewritten = [line.strip() for line in raw.split("\n") if len(line.strip()) > 3]
    if not rewritten:
        rewritten = [query]  # 兜底：回退到原始 Query
    return {"rewritten_queries": rewritten[:MAX_BROAD_QUERIES]}
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 432~436 | 倒序取上一轮 AI 回答 | 推断"没懂"指什么，截断 300 字 |
| 438~441 | 构造改写提示词 | 参考 `last_answer` + `query` |
| 443 | `get_llm("qa", temperature=0.3)` | 改写用 0.3 增加多样性 |
| 448 | `[line.strip() ... if len(line.strip()) > 3]` | 每行一条子 Query，过滤过短行 |
| 449~450 | `if not rewritten: rewritten = [query]` | 空结果兜底回退原始 Query |
| 452 | `return {..., "rewritten_queries": rewritten[:MAX_BROAD_QUERIES]}` | 最多 3 条 |

### 7.2 `hyde_generate_node`：HyDE 假设文档生成（第 459~491 行）

**动机**：VAGUE 分支。用户说"没懂"，直接检索模糊 Query 效果差。HyDE 让 LLM 先生成"假设文档"（假设用户问的是某具体技术点），用该文档向量检索，命中率更高。temperature=0.3 兼顾多样性与主题内聚。

```python
# nodes.py 第 459~491 行
async def hyde_generate_node(state: QAState) -> dict:
    query = state["original_query"]
    messages = state.get("messages", [])
    # 取最近 3 轮对话作为上下文
    history_text = _format_history_for_prompt(messages[-6:])
    prompt = HYDE_PROMPT.format(history=history_text, query=query)
    llm = get_llm("qa", temperature=0.3)
    response = await llm.ainvoke([HumanMessage(content=prompt)])
    hyde_doc = _get_message_content(response).strip()
    logger.info("hyde_generate.done", query=query[:50], hyde_doc_length=len(hyde_doc))
    return {"hyde_document": hyde_doc}
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 477 | `_format_history_for_prompt(messages[-6:])` | 最近 3 轮（6 条消息）作上下文 |
| 478 | `HYDE_PROMPT.format(history=history_text, query=query)` | 构造假设文档提示词 |
| 480 | `get_llm("qa", temperature=0.3)` | 0.3：有多样性但不会偏离主题 |
| 482 | `hyde_doc = _get_message_content(response).strip()` | 提取假设文档 |
| 490 | `return {"hyde_document": hyde_doc}` | 供 retrieve 用 hyde_document 检索 |

---

## 八、`retrieve_node`：混合召回 + 精排（第 497~596 行）

**动机**：调用 `retrieve()` Pipeline 完成检索与精排。三条路径——PRECISE 用 original_query 直接检索（8 条）；VAGUE 用 hyde_document（10 条）；BROAD 对所有子 Query 并行检索（每 4 条）合并去重。`retrieve()` 是同步函数（BGE-M3 CPU + Milvus 阻塞 IO），必须 `run_in_executor` 包装避免阻塞事件循环。

```python
# nodes.py 第 497~596 行
async def retrieve_node(state: QAState) -> dict:
    from backend.core.reranker import retrieve, RankedDocument
    query_type     = state.get("query_type", "PRECISE").upper()
    tenant_id      = state["tenant_id"]
    course_id      = state.get("course_id")
    original_query = state["original_query"]
    loop = asyncio.get_running_loop()
    # ── BROAD：并行多 Query 检索，合并去重 ─────────────────
    if query_type == "BROAD" and state.get("rewritten_queries"):
        broad_queries = state["rewritten_queries"][:MAX_BROAD_QUERIES]
        async def retrieve_one(sub_query: str) -> tuple[list, float]:
            return await loop.run_in_executor(
                None,
                lambda: retrieve(
                    sub_query, tenant_id, course_id,
                    recall_top_k=RECALL_TOP_K_BROAD_PER,
                    rerank_top_k=RECALL_TOP_K_BROAD_PER,
                ))
        results = await asyncio.gather(*[retrieve_one(q) for q in broad_queries])
        seen: dict[str, RankedDocument] = {}
        for ranked_docs, _ in results:
            for doc in ranked_docs:
                key = doc.content[:100]
                if key not in seen or doc.score > seen[key].score:
                    seen[key] = doc
        merged = sorted(seen.values(), key=lambda x: x.score, reverse=True)[:RERANK_TOP_K]
    # ── PRECISE / VAGUE：单路检索 ───────────────────────────
    else:
        if query_type == "VAGUE" and state.get("hyde_document"):
            query_text   = state["hyde_document"]
            recall_top_k = RECALL_TOP_K_VAGUE
        else:
            query_text   = original_query
            recall_top_k = RECALL_TOP_K_PRECISE
        merged, _ = await loop.run_in_executor(
            None,
            lambda: retrieve(
                query_text, tenant_id, course_id,
                recall_top_k=recall_top_k,
                rerank_top_k=RERANK_TOP_K,
            ))
    # ── 转换 RankedDocument → dict，写入 State ─────────────
    ranked_chunks = [
        {"content": doc.content, "score": doc.score, "metadata": doc.metadata}
        for doc in merged
    ]
    confidence         = ranked_chunks[0]["score"] if ranked_chunks else 0.0
    is_high_confidence = confidence >= 0.75  # 阈值 0.75
    logger.info("retrieve.done", query_type=query_type, ranked=len(ranked_chunks), confidence=round(confidence, 4), is_high_confidence=is_high_confidence)
    return {
        "ranked_chunks":      ranked_chunks,
        "confidence":         confidence,
        "is_high_confidence": is_high_confidence,
    }
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 514 | `from backend.core.reranker import retrieve, RankedDocument` | 延迟导入避免循环依赖 |
| 516~519 | 读取 State 上下文 | query_type/tenant_id/course_id/original_query |
| 524 | `if query_type == "BROAD" and state.get("rewritten_queries"):` | BROAD 分支判定 |
| 528~535 | `retrieve_one` 内层函数 | 单子 Query 检索，run_in_executor 包装 |
| 538 | `asyncio.gather(*[...])` | 并行检索所有子 Query |
| 541~546 | 合并去重 | `content[:100]` 为 key，保留最高分 |
| 548 | `sorted(...)[:RERANK_TOP_K]` | 按 score 降序取 3 条 |
| 553~558 | VAGUE 用 hyde_document / 否则 original_query | 单路检索的查询文本选择 |
| 560~567 | `run_in_executor` 包装同步 retrieve | 避免阻塞 asyncio 事件循环 |
| 570~577 | RankedDocument → dict | 写入 State 兼容结构 |
| 580~581 | 置信度阈值 0.75 | Top-1 分数 ≥0.75 为高置信 |
| 591~595 | 返回三个字段 | 供 `_route_by_confidence` 与 generate 节点消费 |

---

## 九、`web_search_node`：Web 搜索（第 602~633 行）

**动机**：调用 Web Search MCP 工具获取时效性信息。被两条路径共用——GENERAL_WEB 路径与低置信度路径。MCP 调用失败返回空列表，不影响后续流程。

```python
# nodes.py 第 602~633 行
async def web_search_node(state: QAState) -> dict:
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
| 612~613 | 延迟导入 MCP 客户端与配置 | 避免顶层导入开销 |
| 619~624 | `call_mcp_tool(...)` | 调 web_search 工具，max_results=5, timeout=15s |
| 625~626 | `if not isinstance(results, list): results = []` | 防御性校验返回类型 |
| 628~630 | `except ... results = []` | 失败静默，返回空列表 |
| 632 | `return {"web_search_results": results}` | 供 generate_direct/generate_general 注入 |

---

## 十、`generate_rag_node`：高置信度 RAG 生成（第 639~708 行）

**动机**：confidence ≥ 0.75 时调用。将精排 Top-3 文档拼成 context，让 LLM 严格基于知识库回答，末尾附加 📚 参考来源。注入历史摘要保持多轮连贯。注入历史对话窗口时排除最后一条 HumanMessage（已拼入 RAG_ANSWER_PROMPT 的 {query}，避免问题出现两次）。

```python
# nodes.py 第 639~708 行
async def generate_rag_node(state: QAState) -> dict:
    ranked_chunks = state.get("ranked_chunks", [])
    query         = state["original_query"]
    messages      = state.get("messages", [])
    summary       = state.get("existing_summary")
    # 构建知识库上下文与来源列表
    context_parts = []
    sources = []
    for i, chunk in enumerate(ranked_chunks, 1):
        context_parts.append(f"【参考{i}】\n{chunk['content']}")
        source_name = chunk.get("metadata", {}).get("source_name", "课程文档")
        if source_name not in sources:
            sources.append(source_name)
    context_text = "\n\n".join(context_parts)
    # 消息列表：SystemMessage（含历史摘要）+ 历史对话窗口 + RAG 提示
    llm_messages = [SystemMessage(content=_build_system_content(summary))]
    windowed = trim_messages_to_window(messages[:-1], window_size=10)
    for msg in windowed:
        if not isinstance(msg, SystemMessage):
            llm_messages.append(msg)
    rag_prompt = RAG_ANSWER_PROMPT.format(context=context_text, query=query)
    llm_messages.append(HumanMessage(content=rag_prompt))
    llm = get_llm("qa", streaming=True)  # 流式模式，供 SSE 逐 token 推送
    response = await llm.ainvoke(llm_messages)
    answer_text = _get_message_content(response).strip()
    # 附加来源标注
    sources_text = "\n".join([f"  • {s}" for s in sources])
    final_answer = f"{answer_text}\n\n📚 **参考来源**\n{sources_text}"
    logger.info("generate_rag.done", answer_length=len(final_answer), sources=sources, confidence=round(state.get("confidence", 0), 4))
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

| 行号 | 代码 | 说明 |
|------|------|------|
| 658~662 | 遍历 Top-3 构建上下文与来源 | `【参考N】` 标记 + 去重 source_name |
| 664 | `context_text = "\n\n".join(context_parts)` | 拼接知识库上下文 |
| 667 | `[SystemMessage(content=_build_system_content(summary))]` | 注入历史摘要的 SystemMessage |
| 672 | `trim_messages_to_window(messages[:-1], window_size=10)` | 排除最后一条 HumanMessage（已在 prompt 中） |
| 674~675 | `if not isinstance(msg, SystemMessage)` | 避免重复注入 SystemMessage |
| 677~678 | 追加 RAG 提示词 | `{context}` + `{query}` |
| 680 | `get_llm("qa", streaming=True)` | 流式模式供 SSE 逐 token 推送 |
| 686 | `f"{answer_text}\n\n📚 **参考来源**\n{sources_text}"` | 附加来源标注 |
| 695~707 | 返回 & 写回消息 | 更新 messages、should_summarize、structured_output |

---

## 十一、`generate_direct_node`：低置信度直答（第 714~787 行）

**动机**：confidence < 0.75 时调用。知识库无足够内容时用 LLM 参数知识回答。两种模式——`web_augmented`（有 Web 结果注入上下文）与 `llm_direct`（无结果，末尾追加 ⚠️ 提示）。

```python
# nodes.py 第 714~787 行
async def generate_direct_node(state: QAState) -> dict:
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
    if web_sources:
        final_answer = answer_text
        answer_mode  = "web_augmented"
    else:
        final_answer = (
            f"{answer_text}\n\n"
            f"⚠️ **说明**：以上为 AI 基于通用知识的回答，课程知识库中暂无相关内容。"
            f"建议以教师讲解为准，或联系教师补充相关资料。"
        )
        answer_mode = "llm_direct"
    logger.info("generate_direct.done", answer_length=len(final_answer), confidence=round(state.get("confidence", 0), 4), web_sources=len(web_sources))
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

| 行号 | 代码 | 说明 |
|------|------|------|
| 727 | `[SystemMessage(content=_build_system_content(summary))]` | 注入摘要 |
| 729~732 | 注入历史窗口（排除 SystemMessage） | 与 generate_rag 相同模式 |
| 738~745 | 有 Web 结果时构建上下文 | 编号 + title + url + snippet（前 300 字） |
| 747 | `DIRECT_ANSWER_PROMPT.format(query=query) + web_context` | 直答提示词 + Web 补充 |
| 754~757 | `web_sources` 非空 → `web_augmented` | URL 经 sources 传给前端折叠面板 |
| 758~765 | 无 Web 结果 → `llm_direct` | 追加 ⚠️ 提示 |
| 774~786 | 返回 & 写回消息 | 与 generate_rag 结构一致 |

---

## 十二、`generate_general_node`：通用问题直答（第 793~853 行）

**动机**：query_type=GENERAL 时调用（打招呼、问时间、闲聊）。联网模式下若 web_search_results 非空则注入结果提供时效性。与 generate_direct 的区别：general 跳过 RAG 直接 LLM 回答；direct 是 RAG 路径命中不足的兜底。

```python
# nodes.py 第 793~853 行
async def generate_general_node(state: QAState) -> dict:
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
        query=query, history=history_text,
        current_time=_current_datetime_str(), web_context=web_context,
    )
    llm = get_llm("qa", streaming=True)
    response = await llm.ainvoke([HumanMessage(content=prompt)])
    answer_text = _get_message_content(response).strip()
    answer_mode = "web_augmented" if web_sources else "general"
    logger.info("generate_general.done", answer_length=len(answer_text), web_sources=len(web_sources))
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

| 行号 | 代码 | 说明 |
|------|------|------|
| 810~817 | 有 Web 结果时构建上下文 | 与 generate_direct 相同逻辑 |
| 820 | `_format_history_for_prompt(messages[-6:])` | 最近 3 轮作历史 |
| 821~826 | `GENERAL_ANSWER_PROMPT.format(...)` | 含 query/history/current_time/web_context |
| 824 | `_current_datetime_str()` | 注入当前时间（问时间类问题） |
| 832 | `answer_mode = "web_augmented" if web_sources else "general"` | 有 Web 来源则标记 web_augmented |
| 840~852 | 返回 & 写回消息 | `confidence: 1.0`（通用问题无检索置信度概念） |

---

## 十三、`enqueue_pending_node`：低置信度入队（第 859~904 行）

**动机**：将低置信度问题（confidence < 0.75）写入 `knowledge_pending_queue` 供教师审查补充知识库。高置信度直接跳过不产生 DB 写入。失败静默，返回 `{}` 不修改 State。`ON CONFLICT DO NOTHING` 保证幂等。

```python
# nodes.py 第 859~904 行
async def enqueue_pending_node(state: QAState) -> dict:
    # 高置信度直接跳过，不需要记录待补充问题
    if state.get("confidence", 1.0) >= 0.75:
        return {}
    from backend.dependencies import AsyncSessionLocal
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
        logger.info("enqueue_pending.done", question=state["original_query"][:50], confidence=state.get("confidence", 0))
    except Exception as e:
        logger.warning("enqueue_pending.failed", error=str(e))
    return {}  # 不修改 State
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 872 | `if state.get("confidence", 1.0) >= 0.75: return {}` | 高置信度直接跳过 |
| 880~886 | INSERT 待补充队列 | `status='pending'`，`ON CONFLICT DO NOTHING` 幂等 |
| 888~893 | 参数绑定 | uuid 主键 + tenant/question/student/confidence |
| 900~901 | `except ... logger.warning` | 失败静默，不影响已生成回答 |
| 903 | `return {}` | 不修改 State |

---

## 十四、`save_memory_node`：记忆保存（第 910~968 行）

**动机**：条件触发摘要压缩 + 写回 `qa_sessions` 表。`should_summarize=True`（对话超 10 轮）时先压缩历史再写库。UPSERT 逻辑：首次 INSERT（summary_version=1），后续 UPDATE（version+1）。两步失败均静默。

```python
# nodes.py 第 910~968 行
async def save_memory_node(state: QAState) -> dict:
    from backend.dependencies import AsyncSessionLocal
    messages   = state.get("messages", [])
    student_id = state["student_id"]
    session_id = state["session_id"]
    tenant_id  = state["tenant_id"]
    thread_id  = build_thread_id(student_id, session_id)
    summary    = state.get("existing_summary")
    # ── 条件触发摘要压缩 ─────────────────────────────────────────
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
| 927 | `thread_id = build_thread_id(student_id, session_id)` | 唯一标识会话 |
| 931 | `if state.get("should_summarize", False):` | 超 10 轮才触发压缩 |
| 936 | `trim_messages_to_window(messages, window_size=10)` | 只压缩最近 10 轮，防线性膨胀超 64k |
| 937~940 | `compress_to_summary(...)` | 增量压缩（existing_summary 作前缀） |
| 949~957 | UPSERT 语句 | 首次 INSERT version=1，冲突则 UPDATE version+1 |
| 967~968 | `except ... return {}` | 失败静默 |

---

## 十五、`★` 设计亮点总结

### 15.1 三层分类体系（Layer 0→1→2）

```
Layer 0a 规则→GENERAL      <1ms   精确匹配 + 关键词
Layer 0b 关键词→专业        <1ms   跳过 MiniLM，直接判策略
Layer 1  MiniLM 二分类      ~10ms  CPU 推理，线程池避免阻塞
Layer 2  LLM 精判策略       ~500ms 仅对长问题（≥18 字）调用
```

从快到慢逐层递进，尽量用廉价手段解决，把昂贵的 LLM 调用留给真正需要的地方，节约 API 配额。

### 15.2 `_determine_rag_strategy_fast` 的两阶段省钱法

```python
# nodes.py 第 291~303 行
if strategy == "PRECISE":
    return strategy          # PRECISE 不需要 LLM 确认
if len(query.strip()) >= 18:
    return await _determine_rag_strategy(query)  # 长问题才调 LLM
return strategy              # 短问题直接相信规则
```

规则判 PRECISE 直接返回（不调 LLM）；只有 VAGUE/BROAD 且长问题才调 LLM 校正。短问题 LLM 也判断不准，直接信规则。

### 15.3 `run_in_executor` 隔离 CPU / 阻塞 IO

`retrieve`（BGE-M3 CPU 推理 + Milvus 阻塞 IO）与 MiniLM 分类都是同步阻塞操作，统一用 `loop.run_in_executor(None, ...)` 丢到线程池执行，避免阻塞 asyncio 事件循环、拖垮整个并发服务。

### 15.4 BROAD 并行检索 + 去重合并

```python
# nodes.py 第 538~548 行
results = await asyncio.gather(*[retrieve_one(q) for q in broad_queries])
seen: dict[str, RankedDocument] = {}
for ranked_docs, _ in results:
    for doc in ranked_docs:
        key = doc.content[:100]
        if key not in seen or doc.score > seen[key].score:
            seen[key] = doc
merged = sorted(seen.values(), key=lambda x: x.score, reverse=True)[:RERANK_TOP_K]
```

3 条子 Query 各自检索 4 条（共 12 条），以 `content[:100]` 为 key 去重保留最高分，再按 score 降序取 Top-3。既覆盖多个角度，又避免重复内容。

### 15.5 排除最后一条 HumanMessage 避免问题重复

```python
# nodes.py 第 672 行
windowed = trim_messages_to_window(messages[:-1], window_size=10)
```

最后一条 HumanMessage 已拼入 `RAG_ANSWER_PROMPT` 的 `{query}`，若再注入历史窗口会令问题在上下文出现两次，影响生成质量。

### 15.6 摘要内存：增量压缩 + 窗口截断双保险

```
压缩触发：should_trigger_summary（>10 轮）
压缩输入：最近 10 轮消息（trim_messages_to_window）
压缩前缀：existing_summary（增量，避免重复压缩全量）
```

防止对话历史随轮次线性膨胀超 DeepSeek 64k context 上限。

### 15.7 classify_query 取代独立 load_memory 节点

历史摘要在 `classify_query` 阶段一并从 `qa_sessions` 读取（第 343~354 行），省去一个独立节点，减少图跳数。

### 15.8 幂等写入

`enqueue_pending` 与 `save_memory` 均用 `ON CONFLICT` 保证幂等——同一问题重复触发不会产生重复记录。

---

## 十六、依赖关系

| 依赖 | 用途 | 引入方式 |
|------|------|---------|
| `backend.agents.qa.state.QAState` | State 类型 | 顶层导入 |
| `backend.agents.qa.prompts` | 7 组提示词 | 顶层导入 |
| `backend.core.llm_factory.get_llm` | LLM 工厂 | 顶层导入 |
| `backend.core.memory.build_thread_id` | 构造 thread_id | 顶层导入 |
| `backend.core.logger.get_logger` | 日志 | 顶层导入 |
| `backend.core.reranker.retrieve` | 检索精排 | 函数内延迟导入（避免循环依赖） |
| `backend.core.query_classifier.get_query_classifier` | MiniLM 分类 | 函数内延迟导入 |
| `backend.mcp.client.call_mcp_tool` | Web 搜索 | 函数内延迟导入 |
| `backend.config.get_settings` | MCP 配置 | 函数内延迟导入 |
| `backend.dependencies.AsyncSessionLocal` | DB 会话 | 函数内延迟导入 |

**延迟导入的原因**：`reranker`、`query_classifier`、`mcp`、`dependencies` 等模块可能反向依赖 QA Agent，运行时再导入避免循环导入。

---

## 十七、边界情况与异常处理

| 场景 | 表现 | 处理 |
|------|------|------|
| MiniLM 分类异常 | `classify_query_node` 的 `run_in_executor` 抛异常 | 异常传播到 LangGraph，由上层捕获 |
| LLM 策略判断失败 | `_determine_rag_strategy` 返回异常 | 兜底返回 `PRECISE`（最保守策略） |
| Multi-Query 返回空列表 | `rewritten_queries` 为空 | 回退到原始 Query 检索 |
| 检索返回空结果 | `ranked_chunks` 为空 | `is_high_confidence=False`，走 `llm_direct` 兜底 |
| MCP Web Search 不可用 | `web_search_node` 调用 MCP 超时 | 静默降级，`web_search_results` 为空，直接走 LLM 直答 |
| 记忆保存失败 | `save_memory_node` 的 DB 写入抛异常 | 失败静默（`except: pass`），不阻塞下次请求 |
| 历史摘要加载失败 | `classify_query_node` 的 DB 查询抛异常 | `existing_summary = None`，不阻塞当前请求 |
| 联网指令识别失败 | `_extract_query_and_web_flag` 未匹配到任何关键词 | `enable_web_search=False`，不联网 |

---

## 十八、总结

```
nodes.py = 10 节点 + 13 辅助/规则函数（969 行）

分类阶段：classify_query → 决定路径
检索前置：hyde_generate（VAGUE）/ multi_query_rewrite（BROAD）
检索阶段：retrieve（混合召回 + 精排）
生成阶段：generate_rag / generate_direct / generate_general
副作用阶段：web_search / enqueue_pending / save_memory

核心思想：三层分类省钱、HyDE/Multi-Query 提升检索命中、
         置信度阈值分流、增量摘要防膨胀、失败全部静默。
```