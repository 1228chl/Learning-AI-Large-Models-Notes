# 对话记忆管理：`memory.py` 深度解析

> 源文件：`backend/core/memory.py`（共 291 行）
> 对应课件：记忆管理相关章节
> 前置依赖：`langgraph.checkpoint.memory`、`langchain_core.messages`、`backend/core/llm_factory.py`

## 一、文件定位

`memory.py` 是对话记忆管理模块，为所有 Agent（QA、试卷批改、简历审查、模拟面试）提供统一的记忆管理服务。

### 1.1 为什么要单独一个记忆管理模块？

如果不加控制，历史消息会无限增长，导致三个问题：

| 问题 | 后果 | 解决方式 |
|------|------|---------|
| Context 窗口超限 | 推理报错或被截断（DeepSeek 64k 上限） | 裁剪/压缩 |
| Token 总量失控 | API 费用随对话轮数线性增长 | 控制保留量 |
| 早期无关内容干扰 | 大量旧上下文降低生成质量 | 摘要提炼 |

### 1.2 模块职责边界

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

## 二、模块级 docstring 精读（第 1~28 行）

```python
"""MemorySaver 管理"""
```

### 2.1 LangGraph MemorySaver 工作原理（第 12~22 行）

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

### 2.2 两阶段持久化设计（第 24~27 行）

```python
# 记忆持久化分两个阶段：
#   本地阶段（当前）：用 MemorySaver（内存存储，进程重启后丢失）
#   生产阶段（未来）：替换为 AsyncPostgresSaver（PostgreSQL 持久化）
# 通过 get_memory_saver() 统一获取，切换存储后端时业务代码无需修改。
```

**设计模式：策略模式**。`get_memory_saver()` 是统一接口，切换后端时只需改这一个函数内部实现，所有调用方无需修改。

---

## 三、import 分析（第 29~33 行）

```python
from typing import Optional
from langgraph.checkpoint.memory import MemorySaver         # LangGraph 内存检查点器
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage

from backend.core.logger import get_logger
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

## 四、`get_memory_saver`：按 Agent 类型隔离的单例（第 37~61 行）

### 4.1 模块级变量（第 37~42 行）

```python
_memory_savers: dict[str, MemorySaver] = {}
```

**为什么是 `dict[str, MemorySaver]` 而不是单个实例？**

不同 Agent 的 State schema 不同：

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

### 4.2 函数签名（第 45~61 行）

```python
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

**参数说明**：

| 参数 | 默认值 | 合法值 | 说明 |
|------|--------|--------|------|
| `agent_type` | `"default"` | `"qa"` / `"exam"` / `"resume"` / `"interview"` / `"default"` | Agent 标识符 |

**返回值**：`MemorySaver` 实例，不是 `AsyncPostgresSaver` 或其他类型。接口统一，未来切换后端时类型不变。

**单例实现**：用 `dict` 做缓存，`agent_type` 不在字典中时才创建新实例。每个 `agent_type` 在整个进程生命周期内只创建一次。

**使用方式**：

```python
# 在 graph.py 中：
from backend.core.memory import get_memory_saver

graph = StateGraph(QAState)
checkpointer = get_memory_saver("qa")
app = graph.compile(checkpointer=checkpointer)
```

---

## 五、`build_thread_id`：线程 ID 构建（第 64~82 行）

### 5.1 函数签名

```python
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

### 5.2 参数来源

| 参数 | 来源 | 格式示例 | 说明 |
|------|------|---------|------|
| `student_id` | JWT Token 的 sub 字段 | `"user_abc123"` | 学员身份唯一标识 |
| `session_id` | 前端生成的 UUID | `"a1b2c3d4-e5f6-..."` | 每次打开新对话生成一个 |

### 5.3 thread_id 的隔离维度

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

---

## 六、`build_config`：LangGraph 调用配置（第 85~107 行）

### 6.1 函数签名

```python
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

### 6.2 返回值结构

```python
{
    "configurable": {
        "thread_id": "student_abc123_session_xyz789"
    }
}
```

**`configurable` 的嵌套结构**：LangGraph 的约定。`configurable` 是 LangGraph 运行时识别的特殊键，`thread_id` 是 checkpointer 识别的子键。

### 6.3 使用方式

```python
# 在 API 层：
from backend.core.memory import build_config

config = build_config(student_id="user_abc", session_id="session_xyz")
result = await graph.ainvoke(
    {"messages": [HumanMessage(content=question)]},
    config=config,
)
```

---

## 七、策略一：滑动窗口裁剪（第 113~147 行）

### 7.1 函数签名

```python
def trim_messages_to_window(
    messages: list[BaseMessage],
    window_size: int = 10,
) -> list[BaseMessage]:
```

### 7.2 参数说明

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `messages` | `list[BaseMessage]` | 必填 | 当前完整消息列表 |
| `window_size` | `int` | `10` | 保留的对话轮数（1 轮 = 1 条 Human + 1 条 AI） |

### 7.3 返回值

`list[BaseMessage]`：裁剪后的消息列表。SystemMessage 始终保留在最前。

### 7.4 逐行精读（第 129~147 行）

```python
# 第 130 行：提取所有 SystemMessage
system_messages = [m for m in messages if isinstance(m, SystemMessage)]

# 第 131 行：提取非 SystemMessage 的对话消息
dialogue_messages = [m for m in messages if not isinstance(m, SystemMessage)]
```

**为什么用 `isinstance` 而不是 `type`？** `isinstance` 支持继承检查，如果以后有 `CustomSystemMessage(SystemMessage)` 子类，也能正确识别。

```python
# 第 133 行：1 轮 = 2 条消息（Human + AI），所以最大消息数是 window_size * 2
max_dialogue_messages = window_size * 2  # 1 轮 = 2 条消息
```

**为什么是 `* 2`？** 对话轮次是"回合"概念，1 轮 = 学员提问 + AI 回答 = 2 条消息。`window_size=10` 表示保留最近 10 轮 = 20 条消息。

```python
# 第 135~136 行：未超出窗口，不裁剪，直接返回原列表
if len(dialogue_messages) <= max_dialogue_messages:
    return messages  # 未超出窗口，不裁剪
```

**边界条件**：如果对话消息数刚好等于 `max_dialogue_messages`，返回原列表。只有在**超出**时才裁剪。

```python
# 第 138 行：取最后 max_dialogue_messages 条对话消息
trimmed = dialogue_messages[-max_dialogue_messages:]
```

**Python 切片特性**：`[-N:]` 取列表最后 N 个元素。如果 `dialogue_messages` 长度正好是 N，则返回全部。

```python
# 第 140~145 行：日志记录
logger.info(
    "memory.window_trimmed",
    original=len(dialogue_messages),
    kept=len(trimmed),
    window_size=window_size,
)
```

**结构化日志**：事件名 `memory.window_trimmed` + 3 个键值对，便于日志聚合分析。

```python
# 第 147 行：SystemMessage 始终在最前
return system_messages + trimmed
```

### 7.5 完整执行流程

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

### 7.6 边界情况分析

| 场景 | 输入 | 输出 |
|------|------|------|
| 空列表 | `[]` | `[]` |
| 只有 SystemMessage | `[System]` | `[System]` |
| 刚好窗口大小 | 5 轮对话 + window_size=5 | 不裁剪，原样返回 |
| 超出窗口 | 10 轮对话 + window_size=5 | 保留 System + 最近 5 轮 |
| 无 SystemMessage | 只有 Human/AI | 只保留最近 N 轮对话 |

---

## 八、策略二：摘要压缩（第 150~236 行）

### 8.1 `should_trigger_summary`：触发判断（第 153~176 行）

```python
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

**逐行分析**：

| 行号 | 代码 | 说明 |
|------|------|------|
| 170~173 | `dialogue_count = sum(1 for m in messages if isinstance(m, (HumanMessage, AIMessage)))` | 统计 Human + AI 消息总数。SystemMessage 不属于"对话"，不计入 |
| 174 | `rounds = dialogue_count // 2` | 整数除法，把消息数转为轮数。11 条消息 → 5 轮（向下取整） |
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

### 8.2 `compress_to_summary`：摘要生成（第 179~236 行）

#### 8.2.1 函数签名

```python
async def compress_to_summary(
    messages: list[BaseMessage],
    existing_summary: Optional[str] = None,
) -> str:
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `messages` | `list[BaseMessage]` | 必填 | 待压缩的历史消息列表 |
| `existing_summary` | `Optional[str]` | `None` | 上次的摘要（可选），用于增量压缩 |

**返回值**：`str`，压缩后的摘要文本。

**异步函数**：`async def`，内部调用了 LLM 的 `ainvoke`，需要 await。

#### 8.2.2 延迟导入（第 195~196 行）

```python
from langchain_core.messages import HumanMessage as LCHuman
from backend.core.llm_factory import get_llm
```

**为什么在函数内部 import？** 这两个依赖只在摘要压缩时需要，不在模块加载时导入。这样做的好处：
1. 减少模块启动时间（`get_llm` 可能触发 LLM 配置加载）
2. 避免循环导入（`llm_factory.py` 可能间接导入 `memory.py`）
3. `LCHuman` 别名：避免和文件顶部的 `HumanMessage` 混淆（虽然来自同一个包，但函数内用别名更清晰）

#### 8.2.3 提示词模板（第 198~211 行）

```python
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

#### 8.2.4 对话文本构建（第 213~217 行）

```python
conversation_text = "\n".join([
    f"{'学员' if isinstance(m, HumanMessage) else 'AI'}：{m.text if hasattr(m, 'text') and not callable(m.text) else str(m.content)}"
    for m in messages
    if isinstance(m, (HumanMessage, AIMessage))
])
```

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

#### 8.2.5 提示词填充（第 219~222 行）

```python
prompt_text = SUMMARY_PROMPT.format(
    previous_summary=existing_summary or "（无上次摘要）",
    new_conversations=conversation_text,
)
```

**`existing_summary or "（无上次摘要）"`**：如果 `existing_summary` 是 `None` 或空字符串，用占位文本"（无上次摘要）"。

#### 8.2.6 LLM 调用（第 224~229 行）

```python
llm = get_llm("summarize")
response = await llm.ainvoke([LCHuman(content=prompt_text)])
summary = (
    response.content if isinstance(response.content, str)
    else str(response.content)
).strip()
```

| 步骤 | 代码 | 说明 |
|------|------|------|
| ① | `get_llm("summarize")` | 获取"summarize"角色的 LLM 实例（可能是更便宜的模型） |
| ② | `llm.ainvoke([LCHuman(content=prompt_text)])` | 异步调用 LLM，传入提示词 |
| ③ | `response.content if isinstance(response.content, str) else str(response.content)` | 提取响应内容，兼容 string 和复杂类型 |
| ④ | `.strip()` | 去掉首尾空白字符 |

**`get_llm("summarize")`**：`llm_factory.py` 中可能配置了不同的模型用于不同的任务。摘要任务用"summarize"角色，可能是一个更便宜、更快的模型。

**`response.content` 的类型兼容**：LangChain 的 `AIMessage.content` 可能是 `str` 或 `list[dict]`（多模态消息时）。这里做了兼容处理。

#### 8.2.7 日志记录（第 231~235 行）

```python
logger.info(
    "memory.summary_generated",
    input_messages=len(messages),
    summary_length=len(summary),
)
```

| 键 | 值 | 用途 |
|----|-----|------|
| `input_messages` | 输入消息数 | 监控压缩比 |
| `summary_length` | 摘要长度 | 监控 Token 节省量 |

---

## 九、自测代码精读（第 242~291 行）

### 9.1 环境初始化（第 242~249 行）

```python
if __name__ == "__main__":
    import asyncio
    import sys
    sys.path.insert(0, str(__file__).split("/backend/")[0])
    from dotenv import load_dotenv
    load_dotenv(".env.local")
```

| 行号 | 代码 | 作用 |
|------|------|------|
| 243 | `import asyncio` | 异步函数测试需要事件循环 |
| 245 | `sys.path.insert(0, str(__file__).split("/backend/")[0])` | 把项目根目录加入 sys.path，使 import 能正确解析 `backend.xxx` |
| 246 | `load_dotenv(".env.local")` | 加载环境变量（如 LLM API Key） |

### 9.2 测试 1：thread_id 格式（第 251~257 行）

```python
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

### 9.3 测试 2：滑动窗口裁剪（第 259~272 行）

```python
messages = [SystemMessage(content="你是教学助手")]
for i in range(1, 7):   # 模拟 6 轮对话
    messages.append(HumanMessage(content=f"问题{i}"))
    messages.append(AIMessage(content=f"回答{i}"))

trimmed = trim_messages_to_window(messages, window_size=3)
dialogue_only = [m for m in trimmed if not isinstance(m, SystemMessage)]

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

### 9.4 测试 3：摘要压缩触发判断（第 274~281 行）

```python
msgs_9_rounds  = [HumanMessage(content="q")] * 9  + [AIMessage(content="a")] * 9
msgs_10_rounds = [HumanMessage(content="q")] * 10 + [AIMessage(content="a")] * 10

assert not should_trigger_summary(msgs_9_rounds,  threshold=10)
assert     should_trigger_summary(msgs_10_rounds, threshold=10)
```

**注意**：`[HumanMessage(content="q")] * 9` 创建 9 个相同的 HumanMessage 对象引用。在消息测试中没问题，但实际使用时不会这样（因为消息内容不会重复）。

**验证点**：
- 9 轮对话（18 条消息）→ 不触发
- 10 轮对话（20 条消息）→ 触发

### 9.5 测试 4：MemorySaver 隔离（第 283~289 行）

```python
saver_qa      = get_memory_saver("qa")
saver_exam    = get_memory_saver("exam")
saver_qa_dup  = get_memory_saver("qa")

assert saver_qa is not saver_exam       # 不同 Agent 互相独立
assert saver_qa is saver_qa_dup         # 同一 Agent 返回同一实例（单例）
```

**`is` 和 `is not` 运算符**：Python 的身份比较（内存地址），不是值比较。`is` 检查两个变量是否指向同一个对象。

| 断言 | 用 `is` / `is not` | 原因 |
|------|--------------------|------|
| `saver_qa is not saver_exam` | 不同 Agent 类型 → 不同实例 | 验证隔离性 |
| `saver_qa is saver_qa_dup` | 同一 Agent 类型 → 同一实例 | 验证单例 |

---

## 十、`★` 设计亮点总结

### 10.1 按 Agent 类型隔离的 MemorySaver

```python
_memory_savers: dict[str, MemorySaver] = {}
```

不同 Agent 的 State schema 不同，用 `dict[str, MemorySaver]` 按类型隔离，避免 msgpack 序列化冲突。

### 10.2 两阶段持久化设计

```
get_memory_saver() → 本地阶段：MemorySaver（内存）
                   → 生产阶段：AsyncPostgresSaver（PostgreSQL）
```

统一接口，切换后端时业务代码无需修改。

### 10.3 学员 × 会话 二维隔离

```
thread_id = "student_{student_id}_session_{session_id}"
```

两个维度保证：不同学员完全隔离，同一学员不同会话独立，同一学员同一会话自动续接。

### 10.4 滑动窗口 + 摘要压缩互补

| 策略 | 方法 | 速度 | 适用场景 |
|------|------|------|---------|
| 滑动窗口 | 确定性裁剪 | O(1)，无 LLM | 日常对话轮次控制 |
| 摘要压缩 | LLM 语义提炼 | ~500ms，有 LLM 调用 | 长对话的知识点提炼 |

### 10.5 增量摘要

`compress_to_summary` 接收 `existing_summary` 参数，只压缩新增对话。避免重复处理已摘要的内容，节省 Token。

### 10.6 避免重复压缩

```python
return rounds >= threshold and rounds % threshold == 0
```

只在 10、20、30 轮触发，不是每轮都压缩。

### 10.7 SystemMessage 保护

滑动窗口裁剪时 SystemMessage 始终保留在最前，不受窗口限制。SystemMessage 是系统的"角色设定"，不能丢失。

### 10.8 消息内容提取兼容

```python
m.text if hasattr(m, 'text') and not callable(m.text) else str(m.content)
```

兼容不同版本 LangChain 消息类型的属性差异。

### 10.9 延迟导入

```python
from langchain_core.messages import HumanMessage as LCHuman
from backend.core.llm_factory import get_llm
```

函数内部导入，减少模块加载时间，避免循环导入。

### 10.10 结构化日志

所有操作都有结构化日志记录（事件名 + 键值对），便于监控和调试：

| 事件名 | 记录内容 |
|--------|---------|
| `memory.saver_initialized` | 哪个 Agent 类型初始化了 MemorySaver |
| `memory.window_trimmed` | 裁剪前后的消息数 |
| `memory.summary_generated` | 输入消息数和摘要长度 |

---

## 十一、完整数据流

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