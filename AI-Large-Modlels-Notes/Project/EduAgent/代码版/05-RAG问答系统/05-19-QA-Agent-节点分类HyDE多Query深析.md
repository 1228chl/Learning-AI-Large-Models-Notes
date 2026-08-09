# QA Agent 节点①：分类、HyDE、Multi-Query 深度解析

> 源文件：`backend/agents/qa/nodes.py`（共 969 行，本节覆盖 1~491 行）
> 对应课件：5.12 节点①：分类、HyDE、Multi-Query
> 前置节点：`classify_query_node` → `hyde_generate_node`（VAGUE 分支）/ `multi_query_rewrite_node`（BROAD 分支）→ `retrieve_node`（下一节）

## 全文行号速查表

| 行号范围 | 函数/变量 | 说明 |
|---------|----------|------|
| 1~13 | 文件头 docstring | 10 个节点概述 |
| 15~36 | import 导入 | 标准库 + 第三方 + 项目内部模块 |
| 38~47 | 检索常量 | `RECALL_TOP_K_PRECISE` / `RECALL_TOP_K_VAGUE` / `RECALL_TOP_K_BROAD_PER` / `RERANK_TOP_K` |
| 50~95 | 规则集 | `_GENERAL_EXACT` / `_GENERAL_KEYWORDS` / `_SPECIALIZED_KEYWORDS` / `_VAGUE_QUERY_HINTS` / `_BROAD_QUERY_HINTS` |
| 97~232 | 辅助函数 | 8 个辅助函数：消息提取、历史格式化、时间、系统提示构建、联网指令识别、窗口截断、摘要触发判断、摘要压缩 |
| 233~304 | 规则分类函数 | `_rule_classify_general` / `_rule_classify_specialized` / `_fast_rag_strategy` / `_determine_rag_strategy` / `_determine_rag_strategy_fast` |
| 306~407 | `classify_query_node` | 三层分类节点（核心） |
| 409~453 | `multi_query_rewrite_node` | Multi-Query 改写（BROAD 分支） |
| 455~491 | `hyde_generate_node` | HyDE 假设文档生成（VAGUE 分支） |

---

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
# nodes.py 第 1~13 行
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

| 行号 | 代码 | 说明 |
|------|------|------|
| 1 | `"""问答 Agent - 节点"""` | 模块 docstring，声明模块角色 |
| 2~13 | 注释块 | 10 个节点按功能分 5 个阶段，每个节点签名 `async def(state) -> dict` |

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

## 三、import 分析（第 15~36 行）

```python
# nodes.py 第 15~36 行
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

logger = get_logger(__name__)
```

| 行号 | import | 用途 |
|------|--------|------|
| 15 | `asyncio` | `run_in_executor` 包装同步操作、`asyncio.gather` 并行检索 |
| 16 | `uuid` | `enqueue_pending_node` 生成主键 ID |
| 17 | `datetime` | `_current_datetime_str()` 获取当前时间 |
| 19 | `text` | SQLAlchemy 原生 SQL 查询 |
| 20 | `HumanMessage, AIMessage, SystemMessage` | LangChain 消息类型 |
| 22~31 | 项目内部模块 | state / prompts / llm / memory / config / logger |
| 30 | `SYSTEM_PROMPT as QA_SYSTEM_PROMPT` | 别名避免与 `memory.py` 或 `logger.py` 中的 `SYSTEM_PROMPT` 冲突 |
| 36 | `logger = get_logger(__name__)` | 模块级日志记录器 |

---

## 四、检索常量（第 38~47 行）

```python
# nodes.py 第 38~47 行
MAX_BROAD_QUERIES        = 3    # BROAD 分支最多并行的子 Query 数
RECALL_TOP_K_PRECISE     = 8    # PRECISE：直接检索召回数
RECALL_TOP_K_VAGUE       = 10   # VAGUE：HyDE 语义扩充后多召回些
RECALL_TOP_K_BROAD_PER   = 4    # BROAD：每个子 Query 的召回数
RERANK_TOP_K             = 3    # 精排后保留的最终 chunk 数
```

| 行号 | 常量 | 值 | 说明 |
|------|------|----|------|
| 43 | `MAX_BROAD_QUERIES` | 3 | BROAD 分支最多并行的子 Query 数 |
| 44 | `RECALL_TOP_K_PRECISE` | 8 | PRECISE：直接检索召回数 |
| 45 | `RECALL_TOP_K_VAGUE` | 10 | VAGUE：HyDE 语义扩充后多召回些 |
| 46 | `RECALL_TOP_K_BROAD_PER` | 4 | BROAD：每个子 Query 的召回数 |
| 47 | `RERANK_TOP_K` | 3 | 精排后保留的最终 chunk 数 |

**不同路径的召回数量差异**：

| 路径 | recall_top_k | 为什么 |
|------|-------------|--------|
| PRECISE | 8 | 问题明确，直接检索，命中率高，不需要太多候选 |
| VAGUE | 10 | HyDE 文档与知识库对齐有误差，多召回些补偿 |
| BROAD | 4 × 3 = 12 | 每个子 Query 4 条，3 个子 Query 共 12 条，去重后取 3 |

---

## 五、规则集（第 50~95 行）

### 5.1 Layer 0a：精确匹配 → GENERAL（第 54~62 行）

```python
# nodes.py 第 54~62 行
_GENERAL_EXACT = {
    "你好", "hi", "hello", "嗨", "hey",
    "谢谢", "谢谢你", "感谢", "thanks", "thank you",
    "你是谁", "你叫什么", "你叫什么名字", "你是什么",
    "你能做什么", "你有什么功能", "你能帮我做什么",
    "再见", "拜拜", "bye",
}
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 54~55 | 注释 | Layer 0a：精确匹配 → GENERAL |
| 56~62 | `_GENERAL_EXACT = { ... }` | 用 `set` 而不是 `list`，因为 `set` 的成员检查是 O(1) 哈希查找 |

### 5.2 Layer 0a：关键词匹配 → GENERAL（第 64~74 行）

```python
# nodes.py 第 64~74 行
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

| 行号 | 代码 | 说明 |
|------|------|------|
| 64~66 | 注释 | Layer 0a：关键词匹配 → GENERAL |
| 66~74 | `_GENERAL_KEYWORDS = ( ... )` | 用 `tuple` 而不是 `set`，因为语义上是"关键词片段"，不是精确匹配，`tuple` 更省内存 |

### 5.3 Layer 0b：关键词匹配 → SPECIALIZED（第 76~82 行）

```python
# nodes.py 第 76~82 行
_SPECIALIZED_KEYWORDS = (
    "课程", "实战", "项目", "案例", "老师", "章节",
    "作业", "课堂", "培训", "我们学的", "课程项目",
    "第几章", "第几节", "训练营",
)
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 76~78 | 注释 | Layer 0b：关键词匹配 → SPECIALIZED |
| 78~82 | `_SPECIALIZED_KEYWORDS = ( ... )` | 命中这些关键词的 query 几乎肯定是课程相关内容，不需要 MiniLM 再判断，直接走 RAG 路径。**跳过 Layer 1 节约 ~10ms 推理时间** |

### 5.4 VAGUE 提示词（第 84~88 行）

```python
# nodes.py 第 84~88 行
_VAGUE_QUERY_HINTS = (
    "没懂", "不懂", "不太懂", "讲讲", "解释一下",
    "啥意思", "什么意思", "看不懂",
)
```

### 5.5 BROAD 提示词（第 90~94 行）

```python
# nodes.py 第 90~94 行
_BROAD_QUERY_HINTS = (
    "全面", "系统", "总结", "梳理", "路线",
    "对比", "区别", "全景", "有哪些",
)
```

---

## 六、辅助函数（第 97~232 行）

### 6.1 `_get_message_content`：消息内容提取（第 101~113 行）

```python
# nodes.py 第 101~113 行
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

| 行号 | 代码 | 说明 |
|------|------|------|
| 101 | `def _get_message_content(message) -> str:` | 统一提取消息内容 |
| 102~108 | docstring | 兼容新旧版本 BaseMessage |
| 110 | `if hasattr(message, "text") and not callable(message.text):` | 双重检查：有 `text` 属性且不是方法 |
| 111 | `return message.text` | 旧版本路径 |
| 112 | `return str(message.content)` | 新版本路径（兜底） |

**`hasattr` + `not callable` 双重检查**：

| message 类型 | `hasattr(msg, "text")` | `callable(msg.text)` | 结果 |
|-------------|----------------------|---------------------|------|
| 新版本 BaseMessage | False | — | `str(msg.content)` |
| 旧版本 BaseMessage | True | False | `msg.text` |
| 异常情况（text 是方法） | True | True | `str(msg.content)`（兜底） |

### 6.2 `_format_history_for_prompt`：历史格式化（第 115~130 行）

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
| 115 | `def _format_history_for_prompt(messages: list) -> str:` | 把消息列表格式化为对话历史文本 |
| 117~123 | docstring | 格式：`用户: xxx\nAI: xxx` |
| 126 | `role = "用户" if isinstance(msg, HumanMessage) else "AI"` | 按消息类型判断角色 |
| 127 | `content = _get_message_content(msg)[:200]` | 每条消息最多 200 字符，防止撑爆 Prompt |
| 129 | `return "\n".join(lines)` | 换行拼接 |

**输出格式**：

```
用户: 什么是 Spring IOC 容器？
AI: Spring IOC 容器是...
用户: 它的优缺点是什么？
```

### 6.3 `_current_datetime_str`：当前时间（第 132~135 行）

```python
# nodes.py 第 132~135 行
def _current_datetime_str() -> str:
    return datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M:%S")
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 132~133 | `def _current_datetime_str() -> str:` | 返回当前时间的格式化字符串 |
| 134 | `datetime.now(timezone.utc).astimezone()` | 把 UTC 时间转为本地时区，适合部署在不同时区的服务器 |

### 6.4 `_build_system_content`：系统消息构建（第 137~149 行）

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
| 137~138 | `def _build_system_content(...)` | 构建 SystemMessage 内容 |
| 145 | `content = QA_SYSTEM_PROMPT` | 基础系统提示 |
| 146~147 | `if existing_summary: content += ...` | 历史摘要注入，实现多轮对话连贯性 |

**历史摘要注入**：`existing_summary` 非空时追加到 SystemMessage 末尾。这样 LLM 知道之前的对话内容，实现多轮对话的连贯性。例如：上一轮问了 Spring IOC，这一轮问"它的优缺点"，有了历史摘要，LLM 知道"它"指的是 Spring IOC。

### 6.5 `_extract_query_and_web_flag`：联网指令识别（第 151~168 行）

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
| 151~152 | `def _extract_query_and_web_flag(raw_query: str) -> tuple[str, bool]:` | 识别联网搜索指令 |
| 153 | `q = raw_query.strip()` | 去除首尾空格 |
| 154 | `for keyword in [...]` | 遍历 4 个联网指令词 |
| 155 | `if keyword in q:` | 包含则移除指令词并返回 True |
| 157 | `return q, False` | 无指令则返回原 query |

**示例**：

| 输入 | 输出 |
|------|------|
| `"BGE-M3 的最新动态，帮我联网搜索一下"` | `("BGE-M3 的最新动态，帮我", True)` |
| `"什么是 Spring IOC？"` | `("什么是 Spring IOC？", False)` |

### 6.6 `trim_messages_to_window`：消息截断（第 170~189 行）

```python
# nodes.py 第 170~189 行
def trim_messages_to_window(messages: list, window_size: int = 10) -> list:
    if len(messages) <= window_size * 2:
        return messages
    return messages[-(window_size * 2):]
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 170~171 | `def trim_messages_to_window(messages: list, window_size: int = 10) -> list:` | 截断到最近 N 轮 |
| 186 | `if len(messages) <= window_size * 2:` | 不足 20 条则直接返回 |
| 188 | `return messages[-(window_size * 2):]` | 取最近 20 条 |

**为什么在 nodes.py 中又实现了一次？** `memory.py` 中也有 `trim_messages_to_window`，但 nodes.py 中这个版本更轻量——不需要区分 SystemMessage 和对话消息，因为此处传入的已经是处理后的消息列表（SystemMessage 由 `_build_system_content` 单独注入）。

### 6.7 `should_trigger_summary`：摘要触发判断（第 191~202 行）

```python
# nodes.py 第 191~202 行
def should_trigger_summary(messages: list, threshold: int = 10) -> bool:
    user_count = sum(1 for m in messages if isinstance(m, HumanMessage))
    return user_count >= threshold
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 191~192 | `def should_trigger_summary(messages: list, threshold: int = 10) -> bool:` | 判断是否触发摘要压缩 |
| 200 | `user_count = sum(1 for m in messages if isinstance(m, HumanMessage))` | 只计 HumanMessage 数量 |
| 201 | `return user_count >= threshold` | 超过阈值返回 True |

**与 `memory.py` 的区别**：

| 版本 | 计数方式 | 阈值 |
|------|---------|------|
| `memory.py` | `(Human + AI) // 2` | 10 轮，且 `% 10 == 0` |
| `nodes.py` | 只计 HumanMessage | ≥ 10 条，不要求整数倍 |

### 6.8 `compress_to_summary`：摘要压缩（第 204~231 行）

```python
# nodes.py 第 204~231 行
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
    llm = get_llm("summarize", temperature=0)
    resp = await llm.ainvoke([HumanMessage(content=prompt)])
    return _get_message_content(resp).strip()
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 204~207 | `async def compress_to_summary(...)` | 异步压缩函数 |
| 222 | `history_text = _format_history_for_prompt(messages)` | 格式化消息为文本 |
| 223 | `prefix = ...` | 已有摘要时追加前缀 |
| 224~227 | `prompt = ...` | 构建压缩提示词 |
| 228 | `llm = get_llm("summarize", temperature=0)` | 用专门的 summarize 模型，temperature=0 保证稳定性 |
| 229~230 | `resp = await llm.ainvoke(...)` | 调用 LLM 并提取结果 |

---

## 七、规则分类函数（第 233~304 行）

### 7.1 `_rule_classify_general`：规则→GENERAL（第 237~243 行）

```python
# nodes.py 第 237~243 行
def _rule_classify_general(query: str) -> bool:
    q = query.strip().lower()
    if q in _GENERAL_EXACT:
        return True
    return any(kw in q for kw in _GENERAL_KEYWORDS)
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 237~238 | `def _rule_classify_general(query: str) -> bool:` | 规则层：是否为闲聊/时间/打招呼类 |
| 239 | `q = query.strip().lower()` | 统一转小写，忽略大小写差异 |
| 240 | `if q in _GENERAL_EXACT:` | 精确匹配（O(1) 哈希查找） |
| 242 | `return any(kw in q for kw in _GENERAL_KEYWORDS)` | 关键词匹配（O(n) 遍历） |

**两步策略**：

| 步骤 | 检查方式 | 数据结构 | 复杂度 | 示例 |
|------|---------|---------|--------|------|
| ① 精确匹配 | `in` | `set` | O(1) | `"你好" in _GENERAL_EXACT` |
| ② 关键词匹配 | `any(kw in q)` | `tuple` | O(n) | `"今天天气" in "今天天气怎么样"` |

### 7.2 `_rule_classify_specialized`：规则→SPECIALIZED（第 245~249 行）

```python
# nodes.py 第 245~249 行
def _rule_classify_specialized(query: str) -> bool:
    q = query.lower()
    return any(kw in q for kw in _SPECIALIZED_KEYWORDS)
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 245~246 | `def _rule_classify_specialized(query: str) -> bool:` | 规则层：是否含课程/项目信号词 |
| 247 | `q = query.lower()` | 转小写 |
| 248 | `return any(kw in q for kw in _SPECIALIZED_KEYWORDS)` | 遍历匹配 |

**命中即跳过 MiniLM**：一旦命中，直接进 Layer 2 判检索策略，不走 Layer 1 的 MiniLM 推理。节约 ~10ms 推理时间 + 模型加载成本。

### 7.3 `_fast_rag_strategy`：规则快判策略（第 251~266 行）

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
| 251~252 | `def _fast_rag_strategy(query: str) -> str:` | 规则快判 RAG 策略（< 1ms） |
| 260 | `q = query.strip().lower()` | 统一格式 |
| 261 | `if len(q) <= 6 and any(kw in q for kw in _VAGUE_QUERY_HINTS):` | ≤6 字且含模糊词 → VAGUE |
| 263 | `if any(kw in q for kw in _BROAD_QUERY_HINTS):` | 含宽泛词 → BROAD |
| 265 | `return "PRECISE"` | 默认最保守策略 |

**规则**：

| 条件 | 结果 |
|------|------|
| ≤6 字且含模糊词（"没懂"、"不懂"） | VAGUE |
| 含宽泛词（"全面"、"对比"、"总结"） | BROAD |
| 其余 | PRECISE（最保守策略） |

### 7.4 `_determine_rag_strategy`：LLM 精判策略（第 268~289 行）

```python
# nodes.py 第 268~289 行
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
    return "PRECISE"
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 268~269 | `async def _determine_rag_strategy(query: str) -> str:` | LLM 精判策略 |
| 279 | `llm = get_llm("qa", temperature=0)` | temperature=0 保证确定性 |
| 280~282 | `resp = await llm.ainvoke([...])` | 调用 LLM 判断策略 |
| 283 | `label = ...strip().upper()` | 标准化输出 |
| 284 | `if label in ("PRECISE", "VAGUE", "BROAD"):` | 校验合法性 |
| 286~287 | `except Exception as e:` | 调用失败时兜底 |
| 288 | `return "PRECISE"` | 兜底：最保守策略 |

### 7.5 `_determine_rag_strategy_fast`：两阶段策略判定（第 291~304 行）

```python
# nodes.py 第 291~304 行
async def _determine_rag_strategy_fast(query: str) -> str:
    strategy = _fast_rag_strategy(query)
    if strategy == "PRECISE":
        return strategy
    if len(query.strip()) >= 18:
        return await _determine_rag_strategy(query)
    return strategy
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 291~292 | `async def _determine_rag_strategy_fast(query: str) -> str:` | 两阶段策略判定 |
| 298 | `strategy = _fast_rag_strategy(query)` | 规则快判 |
| 299~300 | `if strategy == "PRECISE": return strategy` | PRECISE 不需要 LLM 确认 |
| 301 | `if len(query.strip()) >= 18:` | 长问题才调 LLM |
| 302 | `return await _determine_rag_strategy(query)` | LLM 校正 |
| 303 | `return strategy` | 短问题直接相信规则 |

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

---

## 八、`classify_query_node`：Query 分类节点（第 306~407 行）

### 8.1 函数签名与整体结构（第 310~329 行）

```python
# nodes.py 第 310~329 行
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

| 行号 | 代码 | 说明 |
|------|------|------|
| 310~312 | `async def classify_query_node(state: QAState) -> dict:` | 核心分类节点 |
| 313~329 | docstring | 三层分类体系 + 兼职职责 |

**职责边界**：这个节点不仅做分类，还负责加载历史摘要和识别联网指令。设计上把"信息加载"和"分类判断"合并到一个节点，减少图复杂度。

### 8.2 提取用户输入（第 330~337 行）

```python
# nodes.py 第 330~337 行
messages = state.get("messages", [])
raw_query = ""
for msg in reversed(messages):
    if isinstance(msg, HumanMessage):
        raw_query = _get_message_content(msg)
        break
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 331 | `messages = state.get("messages", [])` | 防御性编程，可能为空 |
| 332~336 | `for msg in reversed(messages):` | 倒序遍历取最后一条 HumanMessage |
| 334 | `if isinstance(msg, HumanMessage):` | 判断消息类型 |
| 335 | `raw_query = _get_message_content(msg)` | 提取消息内容 |

### 8.3 联网指令识别（第 338~339 行）

```python
# nodes.py 第 338~339 行
original_query, auto_web = _extract_query_and_web_flag(raw_query)
```

### 8.4 历史摘要加载（第 341~355 行）

```python
# nodes.py 第 341~355 行
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

| 行号 | 代码 | 说明 |
|------|------|------|
| 343 | `existing_summary: str | None = None` | 初始化为 None |
| 344 | `try:` | 异常处理，不影响后续流程 |
| 345 | `from backend.dependencies import AsyncSessionLocal` | 函数内部延迟导入 |
| 346 | `thread_id = build_thread_id(state["student_id"], state["session_id"])` | 构造 thread_id |
| 347~352 | `async with AsyncSessionLocal() as db:` | 查询数据库 |
| 349 | `text("SELECT summary FROM qa_sessions WHERE thread_id = :tid")` | 原生 SQL 查询 |
| 352 | `existing_summary = row[0] if row else None` | 结果存在则取 summary |
| 354 | `logger.warning(...)` | 失败静默，不影响后续 |

### 8.5 基础返回值（第 357~363 行）

```python
# nodes.py 第 357~363 行
_base: dict = {
    "original_query":    original_query,
    "existing_summary":  existing_summary,
    "rewritten_queries": [],
    "hyde_document":     None,
}
```

| 行号 | 字段 | 说明 |
|------|------|------|
| 358 | `original_query` | 去除联网指令后的查询文本 |
| 359 | `existing_summary` | 历史摘要 |
| 360 | `rewritten_queries: []` | BROAD 分支填充，空列表可安全遍历 |
| 361 | `hyde_document: None` | VAGUE 分支填充 |

### 8.6 自动开启联网搜索（第 365~368 行）

```python
# nodes.py 第 365~368 行
if auto_web and not state.get("enable_web_search", False):
    _base["enable_web_search"] = True
```

### 8.7 Layer 0a：规则→GENERAL（第 370~373 行）

```python
# nodes.py 第 370~373 行
if _rule_classify_general(original_query):
    logger.info("classify_query.general_by_rule", query=original_query[:50])
    return {**_base, "query_type": "GENERAL"}
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 370 | `if _rule_classify_general(original_query):` | 规则判断，<1ms |
| 371 | `logger.info(...)` | 日志记录 |
| 372 | `return {**_base, "query_type": "GENERAL"}` | 返回 GENERAL |

### 8.8 Layer 0b：关键词→SPECIALIZED（第 375~380 行）

```python
# nodes.py 第 375~380 行
if _rule_classify_specialized(original_query):
    logger.info("classify_query.specialized_by_keyword", query=original_query[:50])
    strategy = await _determine_rag_strategy_fast(original_query)
    logger.info("classify_query.rag_strategy", strategy=strategy)
    return {**_base, "query_type": strategy}
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 375 | `if _rule_classify_specialized(original_query):` | 关键词匹配 |
| 377 | `strategy = await _determine_rag_strategy_fast(original_query)` | 两阶段策略判定 |
| 379 | `return {**_base, "query_type": strategy}` | 返回策略（PRECISE/VAGUE/BROAD） |

### 8.9 Layer 1：MiniLM 二分类（第 382~397 行）

```python
# nodes.py 第 382~397 行
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

| 行号 | 代码 | 说明 |
|------|------|------|
| 383 | `loop = asyncio.get_running_loop()` | 获取事件循环 |
| 384 | `from backend.core.query_classifier import get_query_classifier` | 延迟导入 |
| 385~387 | `await loop.run_in_executor(None, get_query_classifier().classify, original_query)` | 线程池执行 MiniLM 推理 |
| 389 | `if label == "general":` | MiniLM 判定为通用问题 |
| 391~396 | logger + return | 返回 GENERAL |

### 8.10 Layer 2：LLM 精判策略（第 399~407 行）

```python
# nodes.py 第 399~407 行
logger.info(
    "classify_query.specialized_by_minilm",
    query=original_query[:50],
    confidence=round(confidence, 4),
)
strategy = await _determine_rag_strategy_fast(original_query)
logger.info("classify_query.rag_strategy", strategy=strategy)
return {**_base, "query_type": strategy}
```

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

## 九、`multi_query_rewrite_node`：Multi-Query 改写（第 409~453 行）

### 9.1 函数签名（第 413~427 行）

```python
# nodes.py 第 413~427 行
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

### 9.2 获取上一轮 AI 回答（第 428~437 行）

```python
# nodes.py 第 428~437 行
query = state["original_query"]
messages = state.get("messages", [])

last_answer = ""
for msg in reversed(messages):
    if isinstance(msg, AIMessage):
        last_answer = _get_message_content(msg)[:300]
        break
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 428 | `query = state["original_query"]` | 读取原始 query |
| 429 | `messages = state.get("messages", [])` | 读取消息列表 |
| 431~436 | 取上一轮 AI 回答 | `[:300]` 截断到 300 字符作为参考上下文 |

### 9.3 LLM 调用与解析（第 438~453 行）

```python
# nodes.py 第 438~453 行
prompt = MULTI_QUERY_REWRITE_PROMPT.format(
    last_answer=last_answer, query=query,
)

llm = get_llm("qa", temperature=0.3)
resp = await llm.ainvoke([HumanMessage(content=prompt)])
raw = _get_message_content(resp).strip()

rewritten = [line.strip() for line in raw.split("\n") if len(line.strip()) > 3]
if not rewritten:
    rewritten = [query]

return {"rewritten_queries": rewritten[:MAX_BROAD_QUERIES]}
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 438~441 | `prompt = MULTI_QUERY_REWRITE_PROMPT.format(...)` | 构建改写提示词 |
| 443 | `llm = get_llm("qa", temperature=0.3)` | temperature=0.3 增加多样性 |
| 444 | `resp = await llm.ainvoke([HumanMessage(content=prompt)])` | 调用 LLM |
| 448 | `rewritten = [line.strip() for line in raw.split("\n") if len(line.strip()) > 3]` | 解析输出，过滤空行和过短行 |
| 449~450 | `if not rewritten: rewritten = [query]` | 兜底：回退到原始 Query |
| 452 | `return {"rewritten_queries": rewritten[:MAX_BROAD_QUERIES]}` | 最多 3 条 |

**输出解析**：

```
LLM 输出：
Spring IOC 容器的核心作用是什么？
IOC 和 DI 的区别是什么？
Spring 如何通过注解实现依赖注入？

→ 解析后：
["Spring IOC 容器的核心作用是什么？", "IOC 和 DI 的区别是什么？", "Spring 如何通过注解实现依赖注入？"]
```

---

## 十、`hyde_generate_node`：HyDE 假设文档生成（第 455~491 行）

### 10.1 函数签名（第 459~472 行）

```python
# nodes.py 第 459~472 行
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

### 10.3 实现代码（第 473~491 行）

```python
# nodes.py 第 473~491 行
query = state["original_query"]
messages = state.get("messages", [])

history_text = _format_history_for_prompt(messages[-6:])
prompt = HYDE_PROMPT.format(history=history_text, query=query)

llm = get_llm("qa", temperature=0.3)
response = await llm.ainvoke([HumanMessage(content=prompt)])
hyde_doc = _get_message_content(response).strip()

logger.info(
    "hyde_generate.done",
    query=query[:50],
    hyde_doc_length=len(hyde_doc),
)

return {"hyde_document": hyde_doc}
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 473 | `query = state["original_query"]` | 读取原始 query |
| 474 | `messages = state.get("messages", [])` | 读取消息列表 |
| 477 | `history_text = _format_history_for_prompt(messages[-6:])` | 取最近 3 轮对话 |
| 478 | `prompt = HYDE_PROMPT.format(history=history_text, query=query)` | 构建 HyDE 提示词 |
| 480 | `llm = get_llm("qa", temperature=0.3)` | 需要一定多样性 |
| 481 | `response = await llm.ainvoke([HumanMessage(content=prompt)])` | 调用 LLM |
| 482 | `hyde_doc = _get_message_content(response).strip()` | 提取假设文档 |
| 484~488 | logger | 记录日志 |
| 490 | `return {"hyde_document": hyde_doc}` | 返回假设文档 |

---

## 十一、`★ Insight ───` 设计亮点总结

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