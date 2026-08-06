# QA Agent 节点①：分类、HyDE、Multi-Query 深度解析

> 源文件：`backend/agents/qa/nodes.py`（共 966 行，本节覆盖 1~491 行）
> 对应课件：5.12 节点①：分类、HyDE、Multi-Query
> 前置节点：`classify_query_node` → `hyde_generate_node`（VAGUE 分支） / `multi_query_rewrite_node`（BROAD 分支）→ `retrieve_node`（下一节）

## 一、文件定位

`nodes.py` 是 QA Agent 的核心执行文件，包含 10 个 async 节点函数。本节精读前 3 个节点 + 所有辅助函数。

```
分类阶段（本节）：
  classify_query_node → 三层分类 + 历史摘要加载 + 联网指令识别
    ├─ 返回 GENERAL → generate_general_node（跳过 RAG）
    ├─ 返回 PRECISE → retrieve_node（直接检索）
    ├─ 返回 VAGUE → hyde_generate_node → retrieve_node
    └─ 返回 BROAD → multi_query_rewrite_node → retrieve_node
```

---

## 二、文件头精读（第 1~13 行）

```python
"""问答 Agent - 节点"""
# backend/agents/qa/nodes.py
# QA Agent 的 10 个节点函数，每个节点处理一个独立的步骤。
#
# 节点按功能分类：
#   分类阶段：classify_query（三层分类体系）
#   检索前置：hyde_generate（VAGUE）、multi_query_rewrite（BROAD）
#   检索阶段：retrieve（混合召回 + 精排）
#   生成阶段：generate_rag / generate_direct / generate_general
#   副作用阶段：web_search / enqueue_pending / save_memory
#
# 所有节点都是 async def，输入 state（当前 QAState），输出 dict（要更新的字段）。
# LangGraph 自动将返回值合并到当前 State 中。
```

**10 个节点的数据流**：

```
classify_query_node
  │
  ├─ GENERAL → generate_general_node → web_search_node → save_memory_node
  │
  └─ SPECIALIZED → _determine_rag_strategy
       │
       ├─ PRECISE → retrieve_node → generate_rag_node
       │                              └─ 低置信度 → web_search_node → generate_direct_node
       │                                                            → enqueue_pending_node
       │                                                            → save_memory_node
       ├─ VAGUE → hyde_generate_node → retrieve_node → ...
       └─ BROAD → multi_query_rewrite_node → retrieve_node → ...
```

---

## 三、import 分析（第 15~37 行）

```python
import asyncio
import uuid
from datetime import datetime, timezone

from sqlalchemy import text
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage

from backend.agents.qa.state import QAState
from backend.agents.qa.prompts import (
    HYDE_PROMPT, MULTI_QUERY_REWRITE_PROMPT,
    RAG_ANSWER_PROMPT, DIRECT_ANSWER_PROMPT, GENERAL_ANSWER_PROMPT,
    RAG_STRATEGY_PROMPT,
    SYSTEM_PROMPT as QA_SYSTEM_PROMPT,
)
from backend.core.llm_factory import get_llm
from backend.core.memory import build_thread_id
from backend.config import get_settings
from backend.core.logger import get_logger
```

| import | 用途 |
|--------|------|
| `asyncio` | `run_in_executor` 包装同步操作、`asyncio.gather` 并行检索 |
| `uuid` | `enqueue_pending_node` 生成主键 ID |
| `datetime` | `_current_datetime_str()` 获取当前时间 |
| `text` | SQLAlchemy 原生 SQL 查询 |
| `build_thread_id` | `classify_query_node` 中构造 thread_id 查 DB |

**`SYSTEM_PROMPT as QA_SYSTEM_PROMPT`**：别名避免与 `backend/core/memory.py` 或 `backend/core/logger.py` 中的 `SYSTEM_PROMPT` 冲突。

---

## 四、检索常量（第 39~48 行）

```python
MAX_BROAD_QUERIES        = 3    # BROAD 分支最多并行的子 Query 数
RECALL_TOP_K_PRECISE     = 8    # PRECISE：直接检索召回数
RECALL_TOP_K_VAGUE       = 10   # VAGUE：HyDE 语义扩充后多召回些
RECALL_TOP_K_BROAD_PER   = 4    # BROAD：每个子 Query 的召回数
RERANK_TOP_K             = 3    # 精排后保留的最终 chunk 数
```

**不同路径的召回数量差异**：

| 路径 | recall_top_k | 为什么 |
|------|-------------|--------|
| PRECISE | 8 | 问题明确，直接检索，命中率高，不需要太多候选 |
| VAGUE | 10 | HyDE 文档与知识库对齐有误差，多召回些补偿 |
| BROAD | 4 × 3 = 12 | 每个子 Query 4 条，3 个子 Query 共 12 条，去重后取 3 |

---

## 五、规则集（第 51~95 行）

### 5.1 Layer 0a：精确匹配 → GENERAL（第 57~63 行）

```python
_GENERAL_EXACT = {
    "你好", "hi", "hello", "嗨", "hey",
    "谢谢", "谢谢你", "感谢", "thanks", "thank you",
    "你是谁", "你叫什么", "你叫什么名字", "你是什么",
    "你能做什么", "你有什么功能", "你能帮我做什么",
    "再见", "拜拜", "bye",
}
```

**设计要点**：用 `set` 而不是 `list`，因为 `set` 的成员检查是 O(1) 哈希查找，`list` 是 O(n) 遍历。

### 5.2 Layer 0a：关键词匹配 → GENERAL（第 67~74 行）

```python
_GENERAL_KEYWORDS = (
    "你是谁", "你叫什么", "你能做什么", "你有什么功能",
    "介绍一下你自己", "自我介绍",
    "今天天气", "天气怎么样",
    "讲个笑话", "说个故事",
    "今天是", "今天几号", "今天是几号", "今天是星期",
    "现在是", "现在几点", "现在时间", "当前时间", "当前日期",
    "几月几号", "星期几", "是几月", "几号了", "日期是", "今天日期",
)
```

**用 `tuple` 而不是 `set` 的原因**：语义上这些是"关键词片段"，不是精确匹配。`tuple` 比 `set` 更节省内存。

### 5.3 Layer 0b：关键词匹配 → SPECIALIZED（第 79~83 行）

```python
_SPECIALIZED_KEYWORDS = (
    "课程", "实战", "项目", "案例", "老师", "章节",
    "作业", "课堂", "培训", "我们学的", "课程项目",
    "第几章", "第几节", "训练营",
)
```

**设计意图**：命中这些关键词的 query 几乎肯定是课程相关内容，不需要 MiniLM 再判断，直接走 RAG 路径。**跳过 Layer 1 节约 ~10ms 推理时间。**

### 5.4 VAGUE 提示词（第 86~89 行）

```python
_VAGUE_QUERY_HINTS = (
    "没懂", "不懂", "不太懂", "讲讲", "解释一下",
    "啥意思", "什么意思", "看不懂",
)
```

### 5.5 BROAD 提示词（第 92~95 行）

```python
_BROAD_QUERY_HINTS = (
    "全面", "系统", "总结", "梳理", "路线",
    "对比", "区别", "全景", "有哪些",
)
```

---

## 六、辅助函数（第 98~232 行）

### 6.1 `_get_message_content`：消息内容提取（第 102~113 行）

```python
def _get_message_content(message) -> str:
    """
    统一提取消息内容（兼容 BaseMessage 的不同实现版本）。

    langchain 的 BaseMessage 有两种 content 访问方式：
    - 新版本：msg.content（直接返回字符串）
    - 旧版本：msg.text（方法，不是属性）
    此函数兼容两种写法，避免版本升级时报错。
    """
    if hasattr(message, "text") and not callable(message.text):
        return message.text
    return str(message.content)
```

**`hasattr` + `not callable` 双重检查**：

| message 类型 | `hasattr(msg, "text")` | `callable(msg.text)` | 结果 |
|-------------|----------------------|---------------------|------|
| 新版本 BaseMessage | False | — | `str(msg.content)` |
| 旧版本 BaseMessage | True | False | `msg.text` |
| 异常情况（text 是方法） | True | True | `str(msg.content)`（兜底） |

### 6.2 `_format_history_for_prompt`：历史格式化（第 116~130 行）

```python
def _format_history_for_prompt(messages: list) -> str:
    lines = []
    for msg in messages:
        role = "用户" if isinstance(msg, HumanMessage) else "AI"
        content = _get_message_content(msg)[:200]  # 截断过长的消息
        lines.append(f"{role}: {content}")
    return "\n".join(lines)
```

**`content[:200]` 截断**：每条消息最多 200 字符，防止超长消息撑爆 Prompt。

**输出格式**：

```
用户: 什么是 Spring IOC 容器？
AI: Spring IOC 容器是...
用户: 它的优缺点是什么？
```

### 6.3 `_current_datetime_str`：当前时间（第 133~135 行）

```python
def _current_datetime_str() -> str:
    return datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M:%S")
```

**`timezone.utc` → `astimezone()`**：把 UTC 时间转为本地时区（系统时区），而不是硬编码某个时区。适合部署在不同时区的服务器。

### 6.4 `_build_system_content`：系统消息构建（第 138~149 行）

```python
def _build_system_content(existing_summary: str | None = None) -> str:
    content = QA_SYSTEM_PROMPT
    if existing_summary:
        content += f"\n\n【对话历史摘要】\n{existing_summary}"
    return content
```

**历史摘要注入**：`existing_summary` 非空时追加到 SystemMessage 末尾。这样 LLM 知道之前的对话内容，实现多轮对话的连贯性。例如：上一轮问了 Spring IOC，这一轮问"它的优缺点"，有了历史摘要，LLM 知道"它"指的是 Spring IOC。

### 6.5 `_extract_query_and_web_flag`：联网指令识别（第 152~168 行）

```python
def _extract_query_and_web_flag(raw_query: str) -> tuple[str, bool]:
    q = raw_query.strip()
    for keyword in ["联网搜索", "联网", "搜索一下", "查一下"]:
        if keyword in q:
            return q.replace(keyword, "").strip(), True
    return q, False
```

**为什么不是"移除所有关键词后判断"而是"找到第一个就返回"？** 用户输入通常只包含一个联网指令。如果包含多个（如"联网搜索一下"），`replace` 会清空所有匹配，但后续逻辑是 `enable_web_search=True`，效果一致。

**示例**：

| 输入 | 输出 |
|------|------|
| `"BGE-M3 的最新动态，帮我联网搜索一下"` | `("BGE-M3 的最新动态，帮我", True)` |
| `"什么是 Spring IOC？"` | `("什么是 Spring IOC？", False)` |

### 6.6 `trim_messages_to_window`：消息截断（第 171~189 行）

```python
def trim_messages_to_window(messages: list, window_size: int = 10) -> list:
    if len(messages) <= window_size * 2:
        return messages
    return messages[-(window_size * 2):]
```

**为什么在 nodes.py 中又实现了一次？** `memory.py` 中也有 `trim_messages_to_window`，但 nodes.py 中这个版本更轻量——不需要区分 SystemMessage 和对话消息，因为此处传入的已经是处理后的消息列表（SystemMessage 由 `_build_system_content` 单独注入）。

### 6.7 `should_trigger_summary`：摘要触发判断（第 192~202 行）

```python
def should_trigger_summary(messages: list, threshold: int = 10) -> bool:
    user_count = sum(1 for m in messages if isinstance(m, HumanMessage))
    return user_count >= threshold
```

**与 `memory.py` 的区别**：

| 版本 | 计数方式 | 阈值 |
|------|---------|------|
| `memory.py` | `(Human + AI) // 2` | 10 轮，且 `% 10 == 0` |
| `nodes.py` | 只计 HumanMessage | ≥ 10 条，不要求整数倍 |

**为什么 nodes.py 版本更宽松？** 因为 `save_memory_node` 中的压缩是"有则压缩，没有就算了"，不需要精确的轮次控制。`should_summarize=True` 后，`save_memory_node` 会调用 `compress_to_summary` 压缩。

### 6.8 `compress_to_summary`：摘要压缩（第 205~231 行）

```python
async def compress_to_summary(
    messages: list,
    existing_summary: str | None = None,
) -> str:
    from langchain_core.messages import SystemMessage, HumanMessage
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

**`get_llm("summarize", temperature=0)`**：摘要任务用专门的"summarize"角色（可能是一个更便宜、更快的模型），`temperature=0` 保证每次压缩结果一致。

---

## 七、规则分类函数（第 234~304 行）

### 7.1 `_rule_classify_general`：规则→GENERAL（第 238~243 行）

```python
def _rule_classify_general(query: str) -> bool:
    q = query.strip().lower()
    if q in _GENERAL_EXACT:          # 精确匹配（如"你好"）
        return True
    return any(kw in q for kw in _GENERAL_KEYWORDS)  # 关键词匹配（如"今天天气"）
```

**两步策略**：

| 步骤 | 检查方式 | 数据结构 | 复杂度 | 示例 |
|------|---------|---------|--------|------|
| ① 精确匹配 | `in` | `set` | O(1) | `"你好" in _GENERAL_EXACT` |
| ② 关键词匹配 | `any(kw in q)` | `tuple` | O(n) | `"今天天气" in "今天天气怎么样"` |

**`q.strip().lower()`**：统一转小写，忽略大小写差异。"Hello" → "hello" 匹配。

### 7.2 `_rule_classify_specialized`：规则→SPECIALIZED（第 246~249 行）

```python
def _rule_classify_specialized(query: str) -> bool:
    q = query.lower()
    return any(kw in q for kw in _SPECIALIZED_KEYWORDS)
```

**命中即跳过 MiniLM**：一旦命中，直接进 Layer 2 判检索策略，不走 Layer 1 的 MiniLM 推理。节约 ~10ms 推理时间 + 模型加载成本。

### 7.3 `_fast_rag_strategy`：规则快判策略（第 252~266 行）

```python
def _fast_rag_strategy(query: str) -> str:
    q = query.strip().lower()
    if len(q) <= 6 and any(kw in q for kw in _VAGUE_QUERY_HINTS):
        return "VAGUE"
    if any(kw in q for kw in _BROAD_QUERY_HINTS):
        return "BROAD"
    return "PRECISE"
```

**规则**：

| 条件 | 结果 |
|------|------|
| ≤6 字且含模糊词（"没懂"、"不懂"） | VAGUE |
| 含宽泛词（"全面"、"对比"、"总结"） | BROAD |
| 其余 | PRECISE（最保守策略） |

**"最保守策略"的含义**：PRECISE 是默认值——直接检索。如果规则无法判断，走 PRECISE 路径，因为直接检索的代价最小（不需要 HyDE 或 Multi-Query 的额外 LLM 调用）。

### 7.4 `_determine_rag_strategy`：LLM 精判策略（第 269~289 行）

```python
async def _determine_rag_strategy(query: str) -> str:
    try:
        llm = get_llm("qa", temperature=0)
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

**`temperature=0`**：策略判断需要确定性，不需要多样性。同样的 query 应该每次都返回同样的策略。

**兜底**：LLM 调用失败（网络超时、API 错误、JSON 解析异常）时返回 PRECISE——最保守策略，直接检索。

### 7.5 `_determine_rag_strategy_fast`：两阶段策略判定（第 292~304 行）

```python
async def _determine_rag_strategy_fast(query: str) -> str:
    strategy = _fast_rag_strategy(query)
    if strategy == "PRECISE":
        return strategy  # PRECISE 不需要 LLM 确认
    if len(query.strip()) >= 18:
        return await _determine_rag_strategy(query)  # 长问题才调 LLM
    return strategy  # 短问题直接相信规则
```

**两阶段决策树**：

```
_fast_rag_strategy(query)
  │
  ├─ PRECISE → 直接返回（不调 LLM，节约 API 配额）
  │
  └─ VAGUE / BROAD
       │
       ├─ query 长度 ≥ 18 字 → LLM 校正（规则可能误判）
       └─ query 长度 < 18 字 → 直接相信规则（短问题 LLM 也判断不准）
```

**为什么 18 字是阈值？**

```
"全面介绍一下商品聚合大模型微调的知识"（18 字）
→ 规则判为 BROAD（含"全面"），但 LLM 可能判为 PRECISE（问题很具体）
→ 调 LLM 二次确认，避免误判

"没懂"（2 字）
→ 规则判为 VAGUE，短问题 LLM 也判断不准，直接相信规则
```

---

## 八、`classify_query_node`：Query 分类节点（第 311~407 行）

### 8.1 函数签名与 docstring（第 311~330 行）

```python
async def classify_query_node(state: QAState) -> dict:
    """
    Query 分类节点，决定走哪条处理路径。

    三层分类体系：
      Layer 0a：规则 → GENERAL（闲聊/时间/打招呼，<1ms）
      Layer 0b：关键词 → SPECIALIZED + 快判策略（课程/项目词，<1ms）
      Layer 1：MiniLM 二分类（~10ms）
      Layer 2：LLM 精判检索策略（~500ms，仅对 SPECIALIZED 且长问题）

    同时负责：
    - 从 DB 加载当前会话的历史摘要（取代独立的 load_memory 节点）
    - 识别联网搜索指令（"联网搜索"→ enable_web_search=True）

    Returns:
        query_type: GENERAL / PRECISE / VAGUE / BROAD
        original_query: 去除联网指令后的查询文本
        enable_web_search: 是否启用了联网搜索
        existing_summary: 从 DB 读取的历史摘要
    """
```

**职责边界**：这个节点不仅做分类，还负责加载历史摘要和识别联网指令。设计上把"信息加载"和"分类判断"合并到一个节点，减少图复杂度。

### 8.2 提取用户输入（第 332~337 行）

```python
messages = state.get("messages", [])
raw_query = ""
for msg in reversed(messages):
    if isinstance(msg, HumanMessage):
        raw_query = _get_message_content(msg)
        break
```

**为什么用 `reversed` 倒序遍历？** `messages` 列表末尾是最近的消息。取最后一条 HumanMessage 作为当前输入。

**`state.get("messages", [])`**：防御性编程，`messages` 字段可能为空（首次调用时）。

### 8.3 联网指令识别（第 340 行）

```python
original_query, auto_web = _extract_query_and_web_flag(raw_query)
```

### 8.4 历史摘要加载（第 342~355 行）

```python
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
```

**`from backend.dependencies import AsyncSessionLocal` 在函数内部**：延迟导入，避免模块加载时触发数据库连接初始化。

**`row[0] if row else None`**：`fetchone()` 返回 `Row` 对象或 `None`。`row[0]` 取第一个字段（`summary`）。

**异常处理**：数据库查询失败时，`existing_summary` 保持 `None`，不影响后续流程。

### 8.5 基础返回值（第 358~363 行）

```python
_base: dict = {
    "original_query":    original_query,
    "existing_summary":  existing_summary,
    "rewritten_queries": [],      # BROAD 分支填充
    "hyde_document":     None,     # VAGUE 分支填充
}
```

**为什么 `rewritten_queries` 初始化为空列表而不是 `None`？** `retrieve_node` 中需要遍历 `rewritten_queries`，空列表可以安全地 `for q in []`，`None` 需要额外的空检查。

### 8.6 自动开启联网搜索（第 366~368 行）

```python
if auto_web and not state.get("enable_web_search", False):
    _base["enable_web_search"] = True
```

**`not state.get("enable_web_search", False)`**：防止重复设置。如果用户在上一轮已经开启了联网搜索，不需要再次设置。

### 8.7 Layer 0a：规则→GENERAL（第 371~373 行）

```python
if _rule_classify_general(original_query):
    logger.info("classify_query.general_by_rule", query=original_query[:50])
    return {**_base, "query_type": "GENERAL"}
```

**<1ms**：纯字符串匹配，不调用 LLM 或 MiniLM。覆盖问候、感谢、告别、时间查询等。

### 8.8 Layer 0b：关键词→SPECIALIZED（第 376~380 行）

```python
if _rule_classify_specialized(original_query):
    logger.info("classify_query.specialized_by_keyword", query=original_query[:50])
    strategy = await _determine_rag_strategy_fast(original_query)
    logger.info("classify_query.rag_strategy", strategy=strategy)
    return {**_base, "query_type": strategy}
```

**命中课程关键词 → 跳过 MiniLM → 直接判策略**。`query_type` 在这里是 PRECISE / VAGUE / BROAD 之一，不是 SPECIALIZED。

### 8.9 Layer 1：MiniLM 二分类（第 383~397 行）

```python
loop = asyncio.get_running_loop()
from backend.core.query_classifier import get_query_classifier
label, confidence = await loop.run_in_executor(
    None, get_query_classifier().classify, original_query
)

if label == "general":
    logger.info(
        "classify_query.general_by_minilm",
        query=original_query[:50],
        confidence=round(confidence, 4),
    )
    return {**_base, "query_type": "GENERAL"}
```

**`run_in_executor` 包装**：MiniLM 推理是 CPU 密集型操作，直接调用会阻塞事件循环。用线程池执行。

**`get_query_classifier().classify` 作为参数传递**：`run_in_executor` 的第三个参数是 `*args`，会作为 `classify` 方法的额外参数。等价于 `run_in_executor(None, lambda: get_query_classifier().classify(original_query))`。

### 8.10 Layer 2：LLM 精判策略（第 400~407 行）

```python
logger.info(
    "classify_query.specialized_by_minilm",
    query=original_query[:50],
    confidence=round(confidence, 4),
)
strategy = await _determine_rag_strategy_fast(original_query)
logger.info("classify_query.rag_strategy", strategy=strategy)
return {**_base, "query_type": strategy}
```

**MiniLM 判为 specialized → LLM 判检索策略**。`_determine_rag_strategy_fast` 内部有两阶段：规则快判 + 长问题时 LLM 校正。

### 8.11 完整决策路径

```
classify_query_node
  │
  ├─ Layer 0a：规则→GENERAL（<1ms）
  │   └─ 返回 GENERAL → 跳过 RAG
  │
  ├─ Layer 0b：关键词→SPECIALIZED（<1ms）
  │   └─ _determine_rag_strategy_fast
  │       ├─ 规则→PRECISE → 直接返回
  │       ├─ 规则→VAGUE/BROAD + 短问题 → 直接相信规则
  │       └─ 规则→VAGUE/BROAD + 长问题 → LLM 校正
  │
  ├─ Layer 1：MiniLM→general（~10ms）
  │   └─ 返回 GENERAL → 跳过 RAG
  │
  └─ Layer 1：MiniLM→specialized → Layer 2 LLM 判策略（~500ms）
      └─ 返回 PRECISE / VAGUE / BROAD
```

---

## 九、`multi_query_rewrite_node`：Multi-Query 改写（第 414~453 行）

### 9.1 函数签名与 docstring（第 414~428 行）

```python
async def multi_query_rewrite_node(state: QAState) -> dict:
    """
    BROAD 分支：LLM 将模糊 Query 改写为多个具体子 Query。

    为什么要改写？宽泛问题（如"讲讲微服务"）直接检索效果差，
    因为向量检索对宽泛语义不敏感。改写为多个具体子 Query 后，
    每个子 Query 的语义更精确，检索命中率更高。

    改写策略：
    - 参考上一轮 AI 回答，推断"没懂"指的是什么
    - 覆盖不同角度（是什么 / 为什么 / 怎么用 / 和什么区别）
    - 最多 3 条子 Query（MAX_BROAD_QUERIES=3）

    兜底：LLM 返回空 → 回退到原始 Query。
    """
```

### 9.2 获取上一轮 AI 回答（第 433~437 行）

```python
last_answer = ""
for msg in reversed(messages):
    if isinstance(msg, AIMessage):
        last_answer = _get_message_content(msg)[:300]
        break
```

**`[:300]` 截断**：上一轮 AI 回答可能很长，截断到 300 字符作为参考上下文。

### 9.3 LLM 调用与解析（第 439~453 行）

```python
prompt = MULTI_QUERY_REWRITE_PROMPT.format(
    last_answer=last_answer, query=query,
)

llm = get_llm("qa", temperature=0.3)  # 改写用 temperature=0.3 增加多样性
resp = await llm.ainvoke([HumanMessage(content=prompt)])
raw = _get_message_content(resp).strip()

# 解析 LLM 输出：每行一条子 Query，过滤掉过短的行
rewritten = [line.strip() for line in raw.split("\n") if len(line.strip()) > 3]
if not rewritten:
    rewritten = [query]  # 兜底：回退到原始 Query

return {"rewritten_queries": rewritten[:MAX_BROAD_QUERIES]}
```

**`temperature=0.3`**：改写需要一定的多样性（覆盖不同角度），但不能太高（太高会偏离主题）。

**输出解析**：

```
LLM 输出：
Spring IOC 容器的核心作用是什么？
IOC 和 DI 的区别是什么？
Spring 如何通过注解实现依赖注入？

→ 解析后：
["Spring IOC 容器的核心作用是什么？", "IOC 和 DI 的区别是什么？", "Spring 如何通过注解实现依赖注入？"]
```

**`len(line.strip()) > 3` 过滤**：去掉空行和过短的行（如"---"、"好的"等 LLM 可能输出的非问题文本）。

**兜底**：`if not rewritten: rewritten = [query]`——LLM 返回空时回退到原始 Query。

---

## 十、`hyde_generate_node`：HyDE 假设文档生成（第 460~491 行）

### 10.1 函数签名与 docstring（第 460~473 行）

```python
async def hyde_generate_node(state: QAState) -> dict:
    """
    VAGUE 分支：LLM 生成假设性回答文档，扩充语义后再检索。

    HyDE（Hypothetical Document Embedding）的核心思想：
    用户说"没懂"，直接检索这个模糊 Query 效果很差。
    但让 LLM 先生成一段"假设文档"（假设用户问的是某个具体技术点），
    用这个文档的向量去检索，命中率更高。
    """
```

### 10.2 HyDE 原理

```
用户说："没懂"
  │
  ▼
直接检索："没懂" → 向量检索 → 匹配"教学评估"、"[不懂就要问]"等无关内容 ❌
  │
  ▼
HyDE 生成假设文档：
"学员询问的是 Spring IOC 容器的依赖注入原理..."
  │
  ▼
用假设文档检索 → 向量检索 → 匹配"Spring IOC 容器"等课程内容 ✅
```

### 10.3 实现代码（第 474~491 行）

```python
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

**`messages[-6:]`**：取最近 6 条消息 = 最近 3 轮对话。足够推断上下文，不会因为过多历史消息稀释当前意图。

**`temperature=0.3`**：与 Multi-Query 同样的理由——需要一定多样性，但不能偏离主题。

---

## 十一、`★` 设计亮点总结

### 11.1 三层分类体系

```
Layer 0a（规则，<1ms）→ Layer 0b（关键词，<1ms）→ Layer 1（MiniLM，~10ms）→ Layer 2（LLM，~500ms）
```

逐层递进，80% 的问题在 Layer 0 结束，不需要走 MiniLM 或 LLM。

### 11.2 课程关键词跳过 MiniLM

命中 `_SPECIALIZED_KEYWORDS` 的 query 直接跳 Layer 1，节约 ~10ms 推理时间。因为含"课程"、"项目"等词的 query 几乎肯定是课程相关问题。

### 11.3 两阶段策略判定

```
规则快判（<1ms）→ PRECISE 直接返回
                → VAGUE/BROAD + 短问题 → 直接相信规则
                → VAGUE/BROAD + 长问题 → LLM 校正（~500ms）
```

避免不必要的 LLM 调用，节约 API 配额。

### 11.4 联网指令识别

`_extract_query_and_web_flag` 从 query 中移除"联网搜索"等指令词，同时设置 `enable_web_search=True`。用户输入是干净的 query，同时又知道用户要求联网搜索。

### 11.5 历史摘要加载合并到 classify_query_node

在 classify_query 阶段一并加载历史摘要，避免多一个独立的 `load_memory` 节点，减少图复杂度。

### 11.6 HyDE 与 Multi-Query 的分支策略

| 策略 | query_type | 方法 | 检索方式 |
|------|-----------|------|---------|
| HyDE | VAGUE | 生成假设文档 | 用假设文档的向量检索 |
| Multi-Query | BROAD | 拆成多个子问题 | 并行检索，合并去重 |

### 11.7 兜底策略

| 场景 | 兜底 |
|------|------|
| LLM 策略判断失败 | 返回 PRECISE（最保守策略） |
| Multi-Query 返回空 | 回退到原始 Query |
| DB 历史摘要查询失败 | `existing_summary = None` |
| MiniLM 分类异常 | 由 `run_in_executor` 异常传播到节点，LangGraph 处理 |

### 11.8 检索常量差异化配置

```python
RECALL_TOP_K_PRECISE = 8      # 问题明确，8 条候选足够
RECALL_TOP_K_VAGUE   = 10     # HyDE 对齐误差，多召回些
RECALL_TOP_K_BROAD_PER = 4    # 每个子 Query 4 条，3 个共 12 条
```

不同路径的召回数量不同，基于业务场景的经验值配置。