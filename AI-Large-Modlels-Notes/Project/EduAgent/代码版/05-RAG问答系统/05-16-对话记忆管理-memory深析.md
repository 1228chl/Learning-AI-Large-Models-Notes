# 对话记忆管理：`memory.py` 深度解析

> 源文件：`backend/core/memory.py`（共 291 行）
> 对应课件：记忆管理相关章节
> 前置依赖：`langgraph.checkpoint.memory`、`langchain_core.messages`、`backend/core/llm_factory.py`、`backend/core/logger.py`

## 一、全文行号速查表

| 行号范围 | 标识符 | 类型 | 一句话说明 |
|----------|--------|------|-----------|
| 1~35 | 模块 docstring + imports | 模块级 | 模块说明、消息类型导入、`logger` |
| 37~42 | `_memory_savers` | 模块变量 | 按 Agent 类型隔离的 MemorySaver 单例字典 |
| 45~61 | `get_memory_saver()` | 函数 | 获取指定 Agent 类型的 MemorySaver 单例 |
| 64~82 | `build_thread_id()` | 函数 | 构建 LangGraph Checkpointer 的 thread_id |
| 85~107 | `build_config()` | 函数 | 构建 LangGraph 调用所需的 config 字典 |
| 110~147 | `trim_messages_to_window()` | 函数 | 策略一：滑动窗口裁剪（确定性，无 LLM） |
| 150~176 | `should_trigger_summary()` | 函数 | 判断是否触发摘要压缩（阈值整数倍触发） |
| 179~236 | `compress_to_summary()` | 异步函数 | 策略二：摘要压缩（LLM 语义提炼，增量） |
| 242~291 | 自测代码 | 模块级 | `if __name__ == "__main__"` 四个测试用例 |

---

## 二、函数签名速览

```python
# memory.py 第 45 行
def get_memory_saver(agent_type: str = "default") -> MemorySaver:

# memory.py 第 64 行
def build_thread_id(student_id: str, session_id: str) -> str:

# memory.py 第 85 行
def build_config(student_id: str, session_id: str) -> dict:

# memory.py 第 113 行
def trim_messages_to_window(
    messages: list[BaseMessage],
    window_size: int = 10,
) -> list[BaseMessage]:

# memory.py 第 153 行
def should_trigger_summary(
    messages: list[BaseMessage],
    threshold: int = 10,
) -> bool:

# memory.py 第 179 行
async def compress_to_summary(
    messages: list[BaseMessage],
    existing_summary: Optional[str] = None,
) -> str:
```

---

## 三、设计动机

### 3.1 为什么需要记忆管理？

如果不加控制，历史消息会无限增长，导致三个问题：

| 问题 | 后果 | 解决方式 |
|------|------|---------|
| Context 窗口超限 | 推理报错或被截断（DeepSeek 64k 上限） | 裁剪/压缩 |
| Token 总量失控 | API 费用随对话轮数线性增长 | 控制保留量 |
| 早期无关内容干扰 | 大量旧上下文降低生成质量 | 摘要提炼 |

`memory.py` 的目标：**保留有价值的上下文，丢弃冗余历史，控制 Token 用量**。

### 3.2 模块职责边界

```
memory.py 负责：
  ├─ MemorySaver 实例管理（按 Agent 类型隔离，单例）
  ├─ thread_id 构建（学员 × 会话 二维隔离）
  ├─ config 构建（LangGraph 调用时的 checkpointer 配置）
  ├─ 滑动窗口裁剪（确定性，无 LLM 调用）
  └─ 摘要压缩（LLM 语义提炼，增量更新）

memory.py 不负责：
  ├─ 消息的生成（那是 Agent 节点的事）
  ├─ 消息的格式化（那是 prompt 的事）
  └─ 持久化存储（当前用内存，生产阶段替换为 PostgreSQL）
```

---

## 四、模块级 docstring 与 imports（第 1~35 行）

### 4.1 模块 docstring（第 1~27 行）

```python
# memory.py 第 1~27 行
"""MemorySaver 管理"""
# backend/core/memory.py
# 对话记忆管理模块：提供 MemorySaver 单例获取、thread_id 构建、config 构建。
#
# 为什么需要记忆管理？
#   如果不加控制，历史消息会无限增长，导致三个问题：
#   1. Context 窗口超限：推理报错或被截断（DeepSeek 64k 上限）
#   2. Token 总量失控：API 费用随对话轮数线性增长
#   3. 早期无关内容干扰：大量旧上下文降低生成质量
# 记忆管理的目标：保留有价值的上下文，丢弃冗余历史，控制 Token 用量。
#
# LangGraph MemorySaver 工作原理：
#   第 1 轮：graph.ainvoke(state, config={"thread_id": "student_A_1"})
#     → 运行完后，MemorySaver 把 State（含 messages）保存到 thread_id 对应的槽位
#   第 2 轮（同一 thread_id）：
#     → MemorySaver 自动读取上次保存的 State，合并后继续运行
#     → 学员的历史消息自动续接，无需手动传递
#   thread_id 的隔离作用：
#     student_A_1 → 学员 A 的第 1 个会话
#     student_A_2 → 学员 A 的第 2 个会话（新开一局，互不影响）
#     student_B_1 → 学员 B 的第 1 个会话
#     不同 thread_id 的 State 完全隔离，互不可见。
#
# 记忆持久化分两个阶段：
#   本地阶段（当前）：用 MemorySaver（内存存储，进程重启后丢失）
#   生产阶段（未来）：替换为 AsyncPostgresSaver（PostgreSQL 持久化）
# 通过 get_memory_saver() 统一获取，切换存储后端时业务代码无需修改。
```

**LangGraph MemorySaver 工作原理**：

```
第 1 轮：graph.ainvoke(state, config={"thread_id": "student_A_1"})
  → 运行完后，MemorySaver 把 State（含 messages）保存到 thread_id 对应的槽位

第 2 轮（同一 thread_id）：
  → MemorySaver 自动读取上次保存的 State，合并后继续运行
  → 学员的历史消息自动续接，无需手动传递
```

**thread_id 的隔离作用**：

| thread_id | 学员 | 会话 | 效果 |
|-----------|------|------|------|
| `student_A_1` | 学员 A | 第 1 个会话 | 独立历史 |
| `student_A_2` | 学员 A | 第 2 个会话 | 新开一局，互不影响 |
| `student_B_1` | 学员 B | 第 1 个会话 | 完全隔离 |

**两阶段持久化设计**：

```python
# memory.py 第 24~27 行
# 记忆持久化分两个阶段：
#   本地阶段（当前）：用 MemorySaver（内存存储，进程重启后丢失）
#   生产阶段（未来）：替换为 AsyncPostgresSaver（PostgreSQL 持久化）
# 通过 get_memory_saver() 统一获取，切换存储后端时业务代码无需修改。
```

**设计模式：策略模式**。`get_memory_saver()` 是统一接口，切换后端时只需改这一个函数内部实现，所有调用方无需修改。

### 4.2 imports 与 logger（第 29~35 行）

```python
# memory.py 第 29~35 行
from typing import Optional
from langgraph.checkpoint.memory import MemorySaver         # LangGraph 内存检查点器
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage

from backend.core.logger import get_logger

logger = get_logger(__name__)
```

| 导入 | 来源 | 用途 |
|------|------|------|
| `Optional` | Python 标准库 `typing` | 类型标注，表示可能为 None |
| `MemorySaver` | `langgraph.checkpoint.memory` | LangGraph 的内存检查点器，保存/恢复 State |
| `BaseMessage` | `langchain_core.messages` | 所有消息类型的基类，用于类型标注 |
| `HumanMessage` | `langchain_core.messages` | 人类消息类型 |
| `AIMessage` | `langchain_core.messages` | AI 消息类型 |
| `SystemMessage` | `langchain_core.messages` | 系统消息类型 |
| `get_logger` | `backend.core.logger` | 结构化日志 |

---

## 五、`get_memory_saver`：按 Agent 类型隔离的单例（第 37~61 行）

### 5.1 模块级变量（第 37~42 行）

```python
# memory.py 第 37~42 行
# ── 模块级字典：按 Agent 类型隔离的 MemorySaver 实例 ──────────────
# 不同 Agent 的 State schema 不同（如 QAState 和 ResumeState 字段不同），
# 共用同一个 MemorySaver 会导致 msgpack 序列化时 schema 字段冲突，必须隔离。
# 键：Agent 类型（"qa" / "exam" / "resume" / "interview"）
# 值：对应的 MemorySaver 实例
_memory_savers: dict[str, MemorySaver] = {}
```

**为什么是 `dict[str, MemorySaver]` 而不是单个实例？** 不同 Agent 的 State schema 不同：

```python
# QAState 包含：
class QAState(TypedDict):
    messages: list[BaseMessage]
    retrieved_docs: list[RankedDocument]
    query_label: str

# ResumeState 包含：
class ResumeState(TypedDict):
    messages: list[BaseMessage]
    resume_text: str
    structured_resume: dict
```

如果共用同一个 MemorySaver，msgpack 序列化时 schema 字段会冲突。每个 Agent 类型独立一个 MemorySaver 实例，保证 State 序列化互不干扰。

### 5.2 逐行精读（第 45~61 行）

```python
# memory.py 第 45~61 行
def get_memory_saver(agent_type: str = "default") -> MemorySaver:
    """
    获取指定 Agent 类型的 MemorySaver 单例。

    本地阶段使用内存存储（进程重启后历史丢失）。
    生产阶段替换为 AsyncPostgresSaver 即可持久化，业务代码无需修改。

    Args:
        agent_type: Agent 标识符，如 "qa" / "exam" / "resume" / "interview"

    Returns:
        MemorySaver 实例，传给 StateGraph.compile(checkpointer=...)
    """
    if agent_type not in _memory_savers:
        _memory_savers[agent_type] = MemorySaver()
        logger.info("memory.saver_initialized", agent=agent_type)
    return _memory_savers[agent_type]
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 45 | `def get_memory_saver(agent_type: str = "default") -> MemorySaver:` | 函数签名，默认 `"default"` |
| 58 | `if agent_type not in _memory_savers:` | 键不存在时才创建（单例核心逻辑） |
| 59 | `_memory_savers[agent_type] = MemorySaver()` | 创建新实例并存入字典 |
| 60 | `logger.info("memory.saver_initialized", agent=agent_type)` | 结构化日志 |
| 61 | `return _memory_savers[agent_type]` | 返回实例 |

**参数说明**：

| 参数 | 默认值 | 合法值 | 说明 |
|------|--------|--------|------|
| `agent_type` | `"default"` | `"qa"` / `"exam"` / `"resume"` / `"interview"` / `"default"` | Agent 标识符 |

**单例实现**：用 `dict` 做缓存，`agent_type` 不在字典中时才创建新实例。每个 `agent_type` 在整个进程生命周期内只创建一次（进程内单例，无需加锁）。

**使用方式**：

```python
# 在 graph.py 中：
from backend.core.memory import get_memory_saver

graph = StateGraph(QAState)
checkpointer = get_memory_saver("qa")
app = graph.compile(checkpointer=checkpointer)
```

> ★ Insight ───
> **按 Agent 类型隔离的 `dict` 单例**：不是全局单例，而是 `dict[str, MemorySaver]` 的多键单例。打破"单例模式 = 全局唯一实例"的刻板印象——**单例的粒度可以按业务维度切分**。因为不同 Agent 的 State schema 不同，msgpack 序列化字段会冲突，所以必须按类型隔离。生产阶段只需把 `MemorySaver()` 换成 `AsyncPostgresSaver(...)`，接口不变，所有调用方零改动。

---

## 六、`build_thread_id`：线程 ID 构建（第 64~82 行）

### 6.1 逐行精读（第 64~82 行）

```python
# memory.py 第 64~82 行
def build_thread_id(student_id: str, session_id: str) -> str:
    """
    构建 LangGraph Checkpointer 使用的 thread_id。

    thread_id 是 LangGraph 用来区分不同会话的唯一标识：
    - 同一学员的不同会话有独立的历史，互不干扰
    - 同一学员在同一会话中继续对话，LangGraph 自动追加历史

    格式：student_{student_id}_session_{session_id}
    例：student_abc123_session_xyz789

    Args:
        student_id: 学员 ID（来自 JWT Token 的 sub 字段）
        session_id: 会话 ID（前端生成的 UUID，每次打开新对话生成一个）

    Returns:
        thread_id 字符串，用于 LangGraph 的 configurable 配置
    """
    return f"student_{student_id}_session_{session_id}"
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 64 | `def build_thread_id(student_id: str, session_id: str) -> str:` | 函数签名 |
| 82 | `return f"student_{student_id}_session_{session_id}"` | f-string 拼接 thread_id |

**参数来源**：

| 参数 | 来源 | 格式示例 | 说明 |
|------|------|---------|------|
| `student_id` | JWT Token 的 sub 字段 | `"user_abc123"` | 学员身份唯一标识 |
| `session_id` | 前端生成的 UUID | `"a1b2c3d4-e5f6-..."` | 每次打开新对话生成一个 |

**thread_id 的隔离维度**：

```
thread_id = "student_{student_id}_session_{session_id}"

不同学员：
  student_user_A_session_xxx  ≠  student_user_B_session_xxx
  → 完全隔离

同一学员不同会话：
  student_user_A_session_111  ≠  student_user_A_session_222
  → 独立历史，新开一局

同一学员同一会话：
  student_user_A_session_111  =  student_user_A_session_111
  → LangGraph 自动追加历史
```

> ★ Insight ───
> **二维隔离的 thread_id 编码**：thread_id 用 `student_{student_id}_session_{session_id}` 把"学员 × 会话"两个隔离维度编码进一个字符串。第一维（学员）保证不同学员隐私隔离，第二维（会话）保证同一学员的不同对话互不干扰，而相同组合则自动续接历史。**用分隔符拼接的字符串天然可读、可按前缀调试**，比 UUID 更有诊断价值。

---

## 七、`build_config`：LangGraph 调用配置（第 85~107 行）

### 7.1 逐行精读（第 85~107 行）

```python
# memory.py 第 85~107 行
def build_config(student_id: str, session_id: str) -> dict:
    """
    构建 LangGraph 调用所需的 config 字典。

    用法：
        config = build_config(student_id, session_id)
        result = await graph.ainvoke(state, config=config)

    LangGraph 的 Checkpointer 通过 config 中的 thread_id 来存取历史状态。
    同一 thread_id 的多次调用会自动追加到同一会话中。

    Args:
        student_id: 学员 ID
        session_id: 会话 ID

    Returns:
        {"configurable": {"thread_id": "student_xxx_session_yyy"}}
    """
    return {
        "configurable": {
            "thread_id": build_thread_id(student_id, session_id),
        }
    }
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 85 | `def build_config(student_id: str, session_id: str) -> dict:` | 函数签名 |
| 103 | `return {` | 返回 dict |
| 104 | `"configurable": {` | LangGraph 运行时识别的特殊键 |
| 105 | `"thread_id": build_thread_id(student_id, session_id),` | 复用 `build_thread_id`，避免重复拼接逻辑 |

**返回值结构**：

```python
{
    "configurable": {
        "thread_id": "student_abc123_session_xyz789"
    }
}
```

**`configurable` 的嵌套结构**：LangGraph 的约定。`configurable` 是 LangGraph 运行时识别的特殊键，`thread_id` 是 checkpointer 识别的子键。

**使用方式**：

```python
# 在 API 层：
from backend.core.memory import build_config

config = build_config(student_id="user_abc", session_id="session_xyz")
result = await graph.ainvoke(
    {"messages": [HumanMessage(content=question)]},
    config=config,
)
```

> ★ Insight ───
> **`build_config` 复用 `build_thread_id`（第 105 行）**：config 构建不重复实现 thread_id 拼接，而是调用 `build_thread_id`。**单一事实来源**——thread_id 的格式规则只定义一次，修改格式只需改一处，`build_config` 自动跟随。避免两处拼接逻辑漂移导致的不一致。

---

## 八、策略一：滑动窗口裁剪 `trim_messages_to_window`（第 110~147 行）

### 8.1 函数签名（第 110~129 行）

```python
# memory.py 第 110~129 行
# ── 策略一：滑动窗口（确定性裁剪） ──────────────────────────────


def trim_messages_to_window(
    messages: list[BaseMessage],
    window_size: int = 10,
) -> list[BaseMessage]:
    """
    滑动窗口裁剪：保留最近 window_size 轮对话。

    SystemMessage 始终保留在最前，不受 window_size 限制。
    超出窗口的早期对话直接丢弃，简单高效，无需调用 LLM。

    Args:
        messages:    当前完整消息列表
        window_size: 保留的对话轮数（1 轮 = 1 Human + 1 AI），默认 10 轮

    Returns:
        裁剪后的消息列表
    """
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `messages` | `list[BaseMessage]` | 必填 | 当前完整消息列表 |
| `window_size` | `int` | `10` | 保留的对话轮数（1 轮 = 1 条 Human + 1 条 AI） |

**返回值**：`list[BaseMessage]`。SystemMessage 始终保留在最前。

### 8.2 逐行精读（第 130~147 行）

```python
# memory.py 第 130~147 行
system_messages = [m for m in messages if isinstance(m, SystemMessage)]
dialogue_messages = [m for m in messages if not isinstance(m, SystemMessage)]

max_dialogue_messages = window_size * 2  # 1 轮 = 2 条消息

if len(dialogue_messages) <= max_dialogue_messages:
    return messages  # 未超出窗口，不裁剪

trimmed = dialogue_messages[-max_dialogue_messages:]

logger.info(
    "memory.window_trimmed",
    original=len(dialogue_messages),
    kept=len(trimmed),
    window_size=window_size,
)

return system_messages + trimmed
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 130 | `system_messages = [m for m in messages if isinstance(m, SystemMessage)]` | 提取所有 SystemMessage |
| 131 | `dialogue_messages = [m for m in messages if not isinstance(m, SystemMessage)]` | 提取非 System 的对话消息 |
| 133 | `max_dialogue_messages = window_size * 2` | 1 轮 = 2 条消息，窗口换算成消息数 |
| 135~136 | `if len(dialogue_messages) <= max_dialogue_messages: return messages` | 未超出窗口，不裁剪，直接返回原列表 |
| 138 | `trimmed = dialogue_messages[-max_dialogue_messages:]` | Python 切片取最后 N 条 |
| 140~145 | `logger.info("memory.window_trimmed", ...)` | 结构化日志，记录裁剪前后消息数 |
| 147 | `return system_messages + trimmed` | SystemMessage 始终在最前 |

**为什么用 `isinstance` 而不是 `type`？** `isinstance` 支持继承检查，如果以后有 `CustomSystemMessage(SystemMessage)` 子类，也能正确识别。

**为什么是 `* 2`？** 对话轮次是"回合"概念，1 轮 = 学员提问 + AI 回答 = 2 条消息。`window_size=10` 表示保留最近 10 轮 = 20 条消息。

**边界条件**：如果对话消息数刚好等于 `max_dialogue_messages`，返回原列表。只有在**超出**时才裁剪。

### 8.3 完整执行流程

```
输入：messages = [System, Human1, AI1, Human2, AI2, Human3, AI3, Human4, AI4]
      window_size = 2（保留最近 2 轮）

Step 1：分离
  system_messages = [System]
  dialogue_messages = [Human1, AI1, Human2, AI2, Human3, AI3, Human4, AI4]

Step 2：计算窗口
  max_dialogue_messages = 2 * 2 = 4

Step 3：判断是否超出
  len(dialogue_messages) = 8 > 4 → 超出，裁剪

Step 4：裁剪
  trimmed = dialogue_messages[-4:] = [Human3, AI3, Human4, AI4]

Step 5：合并
  return [System, Human3, AI3, Human4, AI4]
```

### 8.4 边界情况分析

| 场景 | 输入 | 输出 |
|------|------|------|
| 空列表 | `[]` | `[]` |
| 只有 SystemMessage | `[System]` | `[System]` |
| 刚好窗口大小 | 5 轮对话 + window_size=5 | 不裁剪，原样返回 |
| 超出窗口 | 10 轮对话 + window_size=5 | 保留 System + 最近 5 轮 |
| 无 SystemMessage | 只有 Human/AI | 只保留最近 N 轮对话 |

> ★ Insight ───
> **`isinstance` 而非 `type`（第 130 行）**：用 `isinstance(m, SystemMessage)` 而不是 `type(m) == SystemMessage`。`isinstance` 支持继承判断，未来若引入 `ToolMessage`、`CustomSystemMessage` 等子类，`isinstance` 仍能正确识别，而 `type` 精确比较会在引入子类时失效。这是面向扩展的健壮写法。

---

## 九、策略二：摘要压缩（第 150~236 行）

### 9.1 `should_trigger_summary`：触发判断（第 150~176 行）

```python
# memory.py 第 150~176 行
# ── 策略二：摘要压缩（语义保留） ────────────────────────────────


def should_trigger_summary(
    messages: list[BaseMessage],
    threshold: int = 10,
) -> bool:
    """
    判断对话轮数是否超过阈值，决定是否触发摘要压缩。

    确保在 threshold、2*threshold、3*threshold … 轮时触发，
    避免每轮都重复压缩。

    Args:
        messages:  当前消息列表
        threshold: 触发压缩的轮数阈值，默认 10 轮

    Returns:
        True → 需要压缩
    """
    dialogue_count = sum(
        1 for m in messages
        if isinstance(m, (HumanMessage, AIMessage))
    )
    rounds = dialogue_count // 2  # 每轮 2 条消息
    # 确保：10 轮 → 20 轮 → 30 轮 再压缩
    return rounds >= threshold and rounds % threshold == 0
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 170~173 | `dialogue_count = sum(1 for m in messages if isinstance(m, (HumanMessage, AIMessage)))` | 统计 Human + AI 消息总数。SystemMessage 不属于"对话"，不计入 |
| 174 | `rounds = dialogue_count // 2` | 整数除法，把消息数转为轮数。11 条消息 → 5 轮（向下取整） |
| 175 | `# 确保：10 轮 → 20 轮 → 30 轮 再压缩` | 注释说明触发节奏 |
| 176 | `return rounds >= threshold and rounds % threshold == 0` | 两个条件同时满足：① 超过阈值 ② 正好是阈值的整数倍 |

**触发时机示例**（threshold=10）：

| 轮数 | `rounds >= 10` | `rounds % 10 == 0` | 结果 |
|------|----------------|-------------------|------|
| 5 | False | False | 不触发 |
| 9 | False | False | 不触发 |
| 10 | True | True | **触发** |
| 11 | True | False | 不触发 |
| 15 | True | False | 不触发 |
| 19 | True | False | 不触发 |
| 20 | True | True | **触发** |
| 30 | True | True | **触发** |

**设计意图**：在 10、20、30 轮触发生成摘要，不是每轮都压缩。避免重复调用 LLM。

> ★ Insight ───
> **用取模避免每轮触发（第 176 行）**：`rounds % threshold == 0` 保证只在 10、20、30… 轮触发，而不是每轮都压缩。摘要压缩要调 LLM（~500ms + Token 费用），如果每轮都触发会非常昂贵。**把"是否值得压缩"的计算成本降到 O(1)，且不依赖任何状态**——纯函数，输入消息列表即可判断，方便在节点里直接调用。

### 9.2 `compress_to_summary`：摘要生成（第 179~236 行）

#### 9.2.1 函数签名（第 179~194 行）

```python
# memory.py 第 179~194 行
async def compress_to_summary(
    messages: list[BaseMessage],
    existing_summary: Optional[str] = None,
) -> str:
    """
    将历史对话压缩为结构化学员画像摘要。

    增量压缩：传入 existing_summary 防止已记录内容被重复写入。

    Args:
        messages:         待压缩的历史消息列表
        existing_summary: 上次的摘要（可选）

    Returns:
        压缩后的摘要文本
    """
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `messages` | `list[BaseMessage]` | 必填 | 待压缩的历史消息列表 |
| `existing_summary` | `Optional[str]` | `None` | 上次的摘要（可选），用于增量压缩 |

**返回值**：`str`，压缩后的摘要文本。

**异步函数**：`async def`，内部调用了 LLM 的 `ainvoke`，需要 await。

#### 9.2.2 延迟导入（第 195~196 行）

```python
# memory.py 第 195~196 行
from langchain_core.messages import HumanMessage as LCHuman
from backend.core.llm_factory import get_llm
```

**为什么在函数内部 import？** 这两个依赖只在摘要压缩时需要，不在模块加载时导入。这样做的好处：
1. 减少模块启动时间（`get_llm` 可能触发 LLM 配置加载）
2. 避免循环导入（`llm_factory.py` 可能间接导入 `memory.py`）
3. `LCHuman` 别名：避免和文件顶部的 `HumanMessage` 混淆（虽然来自同一个包，但函数内用别名更清晰）

#### 9.2.3 提示词模板（第 198~211 行）

```python
# memory.py 第 198~211 行
SUMMARY_PROMPT = """请将以下学员对话压缩为结构化学员画像摘要。

【压缩规则】
必须保留：学员明确不理解的知识点 / 反复出现的薄弱点 / 项目背景新增信息
选择性保留：已掌握知识点（简短标注）/ 学习进度信息
可以丢弃：已在上次摘要记录的内容 / 闲聊 / 已解决且理解的问题

【上一次摘要】
{previous_summary}

【本次新增对话】
{new_conversations}

请直接输出摘要文本，不要加任何前缀。"""
```

**提示词设计分析**：

| 部分 | 内容 | 作用 |
|------|------|------|
| 角色设定 | "结构化学员画像摘要" | 定义输出格式——不是普通摘要，而是"学员画像" |
| 必须保留 | 不理解的知识点、薄弱点、新增信息 | 教学场景的核心需求 |
| 选择性保留 | 已掌握知识点、进度 | 辅助信息，简短标注即可 |
| 可以丢弃 | 已记录内容、闲聊、已解决问题 | 去重，减少 Token |
| 结尾指令 | "不要加任何前缀" | 保证输出纯净，不需要解析 |

**`{previous_summary}` 和 `{new_conversations}`**：两个占位符，通过 `str.format()` 填充。

#### 9.2.4 对话文本构建（第 213~217 行）

```python
# memory.py 第 213~217 行
conversation_text = "\n".join([
    f"{'学员' if isinstance(m, HumanMessage) else 'AI'}：{m.text if hasattr(m, 'text') and not callable(m.text) else str(m.content)}"
    for m in messages
    if isinstance(m, (HumanMessage, AIMessage))
])
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 213 | `conversation_text = "\n".join([...])` | 用换行连接所有消息 |
| 214 | `f"{'学员' if isinstance(m, HumanMessage) else 'AI'}：..."` | HumanMessage 标记为"学员"，AIMessage 标记为"AI" |
| 214 | `m.text if hasattr(m, 'text') and not callable(m.text) else str(m.content)` | 优先用 `m.text`，否则用 `str(m.content)` 兜底 |
| 215 | `for m in messages` | 遍历消息 |
| 216 | `if isinstance(m, (HumanMessage, AIMessage))` | 只处理对话消息，跳过 SystemMessage |

**逐层拆解**：

```
外层：列表推导式，遍历 messages，只处理 HumanMessage 和 AIMessage

中间层：字符串格式化
  '学员' if isinstance(m, HumanMessage) else 'AI'
  → HumanMessage 标记为"学员"，AIMessage 标记为"AI"

内层：消息内容提取
  m.text if hasattr(m, 'text') and not callable(m.text) else str(m.content)
  → 优先用 m.text（某些消息类型用 text 属性）
  → 如果 text 不存在或可调用，用 str(m.content) 兜底
  → not callable(m.text) 防止 m.text 是方法而不是属性

最终：所有消息用 \n 连接成一段文本
```

**为什么需要 `hasattr` + `not callable` 双重检查？** LangChain 的消息类型在不同版本中可能有不同的属性名。`hasattr` 检查属性是否存在，`not callable` 确保它是数据属性而不是方法。

#### 9.2.5 提示词填充与 LLM 调用（第 219~229 行）

```python
# memory.py 第 219~229 行
prompt_text = SUMMARY_PROMPT.format(
    previous_summary=existing_summary or "（无上次摘要）",
    new_conversations=conversation_text,
)

llm = get_llm("summarize")
response = await llm.ainvoke([LCHuman(content=prompt_text)])
summary = (
    response.content if isinstance(response.content, str)
    else str(response.content)
).strip()
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 219~222 | `prompt_text = SUMMARY_PROMPT.format(previous_summary=..., new_conversations=...)` | 填充提示词占位符 |
| 220 | `existing_summary or "（无上次摘要）"` | None/空串时用占位文本 |
| 224 | `llm = get_llm("summarize")` | 获取"summarize"角色的 LLM 实例（可能是更便宜的模型） |
| 225 | `response = await llm.ainvoke([LCHuman(content=prompt_text)])` | 异步调用 LLM |
| 226~228 | `response.content if isinstance(response.content, str) else str(response.content)` | 提取响应内容，兼容 string 和复杂类型 |
| 229 | `.strip()` | 去掉首尾空白字符 |

**`get_llm("summarize")`**：`llm_factory.py` 中可能配置了不同的模型用于不同的任务。摘要任务用"summarize"角色，可能是一个更便宜、更快的模型。

**`response.content` 的类型兼容**：LangChain 的 `AIMessage.content` 可能是 `str` 或 `list[dict]`（多模态消息时）。这里做了兼容处理。

#### 9.2.6 日志记录与返回（第 231~236 行）

```python
# memory.py 第 231~236 行
logger.info(
    "memory.summary_generated",
    input_messages=len(messages),
    summary_length=len(summary),
)
return summary
```

| 键 | 值 | 用途 |
|----|-----|------|
| `input_messages` | 输入消息数 | 监控压缩比 |
| `summary_length` | 摘要长度 | 监控 Token 节省量 |

**`return summary`（第 236 行）**：返回压缩后的摘要文本，供调用方写回 DB 或传给生成节点。

> ★ Insight ───
> **增量压缩（第 220 行）**：`existing_summary or "（无上次摘要）"` 把上次的摘要作为 `{previous_summary}` 注入提示词，LLM 只压缩"新增对话"，已记录的内容通过"可以丢弃"规则去重。**避免重复处理已摘要的内容，节省 Token**。同时兼容首次压缩（`existing_summary=None` 时用占位文本）。

---

## 十、自测代码精读（第 242~291 行）

### 10.1 环境初始化（第 242~249 行）

```python
# memory.py 第 242~249 行
if __name__ == "__main__":
    import asyncio
    import sys
    sys.path.insert(0, str(__file__).split("/backend/")[0])
    from dotenv import load_dotenv
    load_dotenv(".env.local")

    from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
```

| 行号 | 代码 | 作用 |
|------|------|------|
| 243 | `import asyncio` | 异步函数测试需要事件循环 |
| 245 | `sys.path.insert(0, str(__file__).split("/backend/")[0])` | 把项目根目录加入 sys.path，使 import 能正确解析 `backend.xxx` |
| 246 | `load_dotenv(".env.local")` | 加载环境变量（如 LLM API Key） |
| 249 | `from langchain_core.messages import ...` | 测试用消息类型 |

### 10.2 测试 1：thread_id 格式（第 251~257 行）

```python
# memory.py 第 251~257 行
# ── 测试 1：thread_id 格式 ────────────────────────────────────
tid = build_thread_id("student-uuid-001", "session-uuid-abc")
cfg = build_config("student-uuid-001", "session-uuid-abc")
print(f"thread_id : {tid}")
print(f"config    : {cfg}")
assert tid == "student_student-uuid-001_session_session-uuid-abc"
assert cfg["configurable"]["thread_id"] == tid
```

**验证点**：
1. `build_thread_id` 返回格式：`"student_{student_id}_session_{session_id}"`
2. `build_config` 返回的 dict 结构：`{"configurable": {"thread_id": ...}}`
3. 两个函数的 thread_id 一致

### 10.3 测试 2：滑动窗口裁剪（第 259~272 行）

```python
# memory.py 第 259~272 行
# ── 测试 2：滑动窗口裁剪 ─────────────────────────────────────
messages = [SystemMessage(content="你是教学助手")]
for i in range(1, 7):   # 模拟 6 轮对话
    messages.append(HumanMessage(content=f"问题{i}"))
    messages.append(AIMessage(content=f"回答{i}"))

trimmed = trim_messages_to_window(messages, window_size=3)
dialogue_only = [m for m in trimmed if not isinstance(m, SystemMessage)]

print(f"\n原始消息数   : {len(messages)}（含1条System + 6轮对话）")
print(f"裁剪后消息数 : {len(trimmed)}（System始终保留 + 最近3轮）")
assert len(dialogue_only) == 6                         # 3轮 × 2条
assert isinstance(trimmed[0], SystemMessage)           # System 在最前
assert trimmed[1].content == "问题4"                   # 最近3轮从第4轮开始
```

**输入**：System + 6 轮对话 = 13 条消息，`window_size=3`

**期望输出**：System + 最近 3 轮对话 = 1 + 6 = 7 条消息

**断言**：
| 断言 | 预期 | 说明 |
|------|------|------|
| `len(dialogue_only) == 6` | 3 轮 × 2 条 = 6 | 窗口大小正确 |
| `isinstance(trimmed[0], SystemMessage)` | System 在最前 | SystemMessage 保护 |
| `trimmed[1].content == "问题4"` | 第 1 条对话是"问题4" | 第 4~6 轮是最近 3 轮 |

### 10.4 测试 3：摘要压缩触发判断（第 274~281 行）

```python
# memory.py 第 274~281 行
# ── 测试 3：摘要压缩触发判断 ─────────────────────────────────
msgs_9_rounds  = [HumanMessage(content="q")] * 9  + [AIMessage(content="a")] * 9
msgs_10_rounds = [HumanMessage(content="q")] * 10 + [AIMessage(content="a")] * 10

print(f"\n9 轮是否触发摘要  : {should_trigger_summary(msgs_9_rounds,  threshold=10)}")
print(f"10 轮是否触发摘要 : {should_trigger_summary(msgs_10_rounds, threshold=10)}")
assert not should_trigger_summary(msgs_9_rounds,  threshold=10)
assert     should_trigger_summary(msgs_10_rounds, threshold=10)
```

**验证点**：
- 9 轮对话（18 条消息）→ 不触发
- 10 轮对话（20 条消息）→ 触发

**注意**：`[HumanMessage(content="q")] * 9` 创建 9 个相同的 HumanMessage 对象引用。在消息测试中没问题，但实际使用时消息内容不会重复。

### 10.5 测试 4：MemorySaver 隔离（第 283~289 行）

```python
# memory.py 第 283~289 行
# ── 测试 4：MemorySaver 隔离 ──────────────────────────────────
saver_qa      = get_memory_saver("qa")
saver_exam    = get_memory_saver("exam")
saver_qa_dup  = get_memory_saver("qa")

assert saver_qa is not saver_exam       # 不同 Agent 互相独立
assert saver_qa is saver_qa_dup         # 同一 Agent 返回同一实例（单例）

print("\n✅ 所有测试通过")
```

**`is` 和 `is not` 运算符**：Python 的身份比较（内存地址），不是值比较。`is` 检查两个变量是否指向同一个对象。

| 断言 | 用 `is` / `is not` | 原因 |
|------|--------------------|------|
| `saver_qa is not saver_exam` | 不同 Agent 类型 → 不同实例 | 验证隔离性 |
| `saver_qa is saver_qa_dup` | 同一 Agent 类型 → 同一实例 | 验证单例 |

---

## 十一、依赖分析

| 依赖 | 类型 | 用途 | 加载时机 |
|------|------|------|---------|
| `langgraph.checkpoint.memory.MemorySaver` | 三方库 | LangGraph 内存检查点器 | 模块导入 |
| `langchain_core.messages` | 三方库 | 消息类型（Base/Human/AI/System） | 模块导入 |
| `langchain_core.messages.HumanMessage` | 三方库 | 摘要提示词消息（别名 LCHuman） | `compress_to_summary` 内延迟导入 |
| `backend.core.llm_factory.get_llm` | 项目库 | 获取摘要 LLM | `compress_to_summary` 内延迟导入 |
| `backend.core.logger.get_logger` | 项目库 | 结构化日志 | 模块导入 |

**依赖分层设计**：`get_llm` 和 `LCHuman` 只在 `compress_to_summary` 内延迟导入。因为 `get_llm` 可能触发 LLM 配置加载，且 `llm_factory.py` 可能间接导入 `memory.py`——延迟导入既能减少模块启动时间，又能避免循环导入。

---

## 十二、★ Insight ─── 设计亮点总结

### 12.1 按 Agent 类型隔离的 MemorySaver

```python
_memory_savers: dict[str, MemorySaver] = {}
```

不同 Agent 的 State schema 不同，用 `dict[str, MemorySaver]` 按类型隔离，避免 msgpack 序列化冲突。单例粒度按业务维度切分。

### 12.2 两阶段持久化设计

```
get_memory_saver() → 本地阶段：MemorySaver（内存）
                   → 生产阶段：AsyncPostgresSaver（PostgreSQL）
```

统一接口，切换后端时业务代码无需修改。策略模式。

### 12.3 学员 × 会话 二维隔离

```
thread_id = "student_{student_id}_session_{session_id}"
```

两个维度保证：不同学员完全隔离，同一学员不同会话独立，同一学员同一会话自动续接。thread_id 前缀可读、可诊断。

### 12.4 滑动窗口 + 摘要压缩互补

| 策略 | 方法 | 速度 | 适用场景 |
|------|------|------|---------|
| 滑动窗口 | 确定性裁剪 | O(1)，无 LLM | 日常对话轮次控制 |
| 摘要压缩 | LLM 语义提炼 | ~500ms，有 LLM 调用 | 长对话的知识点提炼 |

### 12.5 增量摘要

`compress_to_summary` 接收 `existing_summary` 参数，只压缩新增对话。避免重复处理已摘要的内容，节省 Token。

### 12.6 避免重复压缩

```python
return rounds >= threshold and rounds % threshold == 0
```

只在 10、20、30 轮触发，不是每轮都压缩。纯函数 O(1) 判断。

### 12.7 SystemMessage 保护

滑动窗口裁剪时 SystemMessage 始终保留在最前，不受窗口限制。SystemMessage 是系统的"角色设定"，不能丢失。

### 12.8 消息内容提取兼容

```python
m.text if hasattr(m, 'text') and not callable(m.text) else str(m.content)
```

兼容不同版本 LangChain 消息类型的属性差异。`hasattr` + `not callable` 双重检查。

### 12.9 延迟导入与循环导入规避

```python
from langchain_core.messages import HumanMessage as LCHuman
from backend.core.llm_factory import get_llm
```

函数内部导入，减少模块加载时间，避免循环导入。`LCHuman` 别名避免与顶部 `HumanMessage` 混淆。

### 12.10 结构化日志

所有操作都有结构化日志记录（事件名 + 键值对），便于监控和调试：

| 事件名 | 记录内容 |
|--------|---------|
| `memory.saver_initialized` | 哪个 Agent 类型初始化了 MemorySaver |
| `memory.window_trimmed` | 裁剪前后的消息数 |
| `memory.summary_generated` | 输入消息数和摘要长度 |

---

## 十三、完整数据流

```
API 请求
  │
  ├─ student_id（JWT sub 字段）
  └─ session_id（前端 UUID）
  │
  ▼
build_config(student_id, session_id)
  │
  └─ {"configurable": {"thread_id": "student_abc_session_xyz"}}
  │
  ▼
graph.ainvoke(state, config=config)
  │
  ├─ LangGraph Checkpointer 检查 thread_id
  │   ├─ 新 thread_id → 从空白状态开始
  │   └─ 已有 thread_id → 恢复之前的 State
  │
  ├─ Agent 节点运行
  │
  └─ MemorySaver 保存更新后的 State
  │
  ▼
记忆管理（可选，在节点中调用）
  │
  ├─ trim_messages_to_window(messages, window_size=10)
  │   └─ 保留 System + 最近 10 轮对话
  │
  └─ should_trigger_summary(messages, threshold=10)
      └─ True → compress_to_summary(messages, existing_summary)
          └─ 返回结构化摘要
```