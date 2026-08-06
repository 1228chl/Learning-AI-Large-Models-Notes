# QA Agent State 与 Prompts 深度解析

> 源文件：`backend/agents/qa/state.py`（68 行）+ `backend/agents/qa/prompts.py`（131 行）
> 对应课件：5.11 State 与 Prompts
> 前置知识：LangGraph StateGraph、TypedDict、Annotated 类型标注

## 一、文件定位

`state.py` 和 `prompts.py` 是 QA Agent 所有节点共享的"契约"——节点之间通过 State 传递数据，通过 Prompts 生成文本。

```
┌──────────────────────────────────────────────────┐
│                  QA Agent 图                      │
│                                                   │
│  classify_node ─→ hyde_node ─→ retrieve_node ─→ generate_node ─→ save_node
│       │              │              │                  │
│       │  State 读写  │  State 读写  │  State 读写     │  State 读写
│       ▼              ▼              ▼                  ▼
│  ┌──────────────────────────────────────────────────┐ │
│  │              QAState (TypedDict)                 │ │
│  │  ① messages ② 上下文 ③ Query ④ 检索 ⑤ 生成     │ │
│  └──────────────────────────────────────────────────┘ │
│                                                   │
│  ┌──────────────────────────────────────────────────┐ │
│  │    Prompts（7 组模板字符串）                     │ │
│  │  SYSTEM / RAG_STRATEGY / HYDE / MULTI_QUERY     │ │
│  │  RAG_ANSWER / DIRECT_ANSWER / GENERAL_ANSWER    │ │
│  └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

---

## 二、`state.py`：QAState 精读（68 行）

### 2.1 文件头 docstring（第 1~16 行）

```python
"""问答 Agent - 状态"""
# backend/agents/qa/state.py
# QA Agent 的状态定义。所有 10 个节点通过读写此 State 进行数据传递。
#
# 为什么用 TypedDict 而不是 BaseModel？
#   LangGraph 读取 TypedDict 的字段注解（__annotations__）来决定哪些字段有 reducer、
#   哪些字段直接覆盖。Pydantic/dataclass 的元数据结构不同，LangGraph 无法直接解析。
#   所以 LangGraph 的 State 统一用 TypedDict。
#
# 字段按数据流阶段分为 5 组：
#   ① 消息历史 → LangGraph 核心，自动追加
#   ② 请求上下文 → Orchestrator 注入，节点只读
#   ③ Query 处理中间结果 → 分类节点产出，检索节点消费
#   ④ 检索与精排结果 → 检索节点产出，生成节点消费
#   ⑤ 生成结果 & 控制标记 → 生成节点产出，持久化节点消费
```

**5 组字段的职责划分**：

| 组 | 职责 | 谁写入 | 谁读取 |
|----|------|--------|--------|
| ① 消息历史 | LangGraph 核心，自动追加 | 所有节点 | 所有节点 |
| ② 请求上下文 | Orchestrator 注入，节点只读 | 入口节点 | 各节点读取配置 |
| ③ Query 处理 | 分类节点产出，检索节点消费 | classify / hyde / multi_query | retrieve |
| ④ 检索精排 | 检索节点产出，生成节点消费 | retrieve / rerank | generate |
| ⑤ 生成控制 | 生成节点产出，持久化节点消费 | generate | save / API 层 |

### 2.2 import 分析（第 17~20 行）

```python
from typing import Annotated, Optional
from typing_extensions import TypedDict
from langgraph.graph.message import add_messages          # 消息列表的"追加"合并器
from langchain_core.messages import BaseMessage
```

| import | 来源 | 用途 |
|--------|------|------|
| `Annotated` | Python `typing`（3.9+） | 给类型添加元数据，这里告诉 LangGraph 使用哪个 reducer |
| `Optional` | Python `typing` | `Optional[str]` 等价于 `str \| None` |
| `TypedDict` | `typing_extensions` | 定义键值对类型约束的字典。LangGraph 要求 State 必须是 TypedDict |
| `add_messages` | `langgraph.graph.message` | LangGraph 内置的 reducer，实现消息列表的追加合并 |
| `BaseMessage` | `langchain_core.messages` | LangChain 消息基类，`HumanMessage`、`AIMessage`、`SystemMessage` 的父类 |

**为什么用 `typing_extensions.TypedDict` 而不是 `typing.TypedDict`？** `typing_extensions` 是第三方库，在更低版本的 Python 中提供 `TypedDict` 功能本文件实际兼容性更好。Python 3.8+ 的 `typing.TypedDict` 也支持，但 `typing_extensions` 是更安全的跨版本选择。

### 2.3 QAState 类定义（第 23~68 行）

```python
class QAState(TypedDict):
    """
    智能问答 Agent 的完整状态定义。

    所有节点通过读写此 State 进行数据传递。
    节点返回 dict 时，key 为 State 字段名，value 为要更新的值。
    LangGraph 自动将返回值合并到当前 State 中。
    """
```

**TypedDict 与 LangGraph 的交互机制**：
1. 节点返回 `dict`（如 `{"query_type": "PRECISE", "original_query": "..."}`）
2. LangGraph 读取返回的 dict，遍历 key
3. 对每个 key，检查 State 定义中是否有 `Annotated` + reducer
4. 有 reducer → 调用 reducer 合并（如 `add_messages` 追加）
5. 无 reducer → 直接覆盖旧值

#### 2.3.1 ① 消息历史（第 39 行）

```python
messages: Annotated[list[BaseMessage], add_messages]
```

**`Annotated[list[BaseMessage], add_messages]` 的精确定义**：

| 部分 | 含义 |
|------|------|
| `Annotated` | Python 3.9+ 引入的类型标注工具，给类型附加元数据 |
| `list[BaseMessage]` | 实际类型：BaseMessage 列表 |
| `add_messages` | LangGraph 的 reducer 函数，定义了如何合并新值到旧值 |

**`add_messages` 的合并语义**：

```python
# 第 1 轮：节点返回 {"messages": [HumanMessage("你好")]}
# 合并后：messages = [HumanMessage("你好")]

# 第 2 轮：节点返回 {"messages": [AIMessage("你好，有什么可以帮你的？")]}
# 合并后：messages = [HumanMessage("你好"), AIMessage("你好，有什么可以帮你的？")]

# 第 3 轮：节点返回 {"messages": [HumanMessage("什么是 Spring IOC？")]}
# 合并后：messages = [HumanMessage("你好"), AIMessage("你好，有什么可以帮你的？"), HumanMessage("什么是 Spring IOC？")]
```

**没有 `Annotated` 的字段默认覆盖**：最新值替换旧值，而不是追加。

#### 2.3.2 ② 请求上下文（第 42~45 行）

```python
student_id:  str            # 学员 ID，来自 JWT Token
tenant_id:   str            # 租户 ID，用于 Milvus / DB 多租户隔离
session_id:  str            # 会话 ID，用于构造 thread_id
course_id:   Optional[str]  # 课程 ID，限定检索范围；None = 全库检索
```

**`course_id: Optional[str]` 的语义**：

| 值 | 含义 | 行为 |
|-----|------|------|
| `"uuid-xxx"` | 指定课程 | 检索时过滤 `course_id == "uuid-xxx"` |
| `None` | 全库检索 | 不做课程过滤，检索所有课程 |

**参数来源**：

| 字段 | 来源 | 说明 |
|------|------|------|
| `student_id` | JWT Token 的 `sub` 字段 | 学员身份标识 |
| `tenant_id` | JWT Token 或请求头 | 多租户隔离 |
| `session_id` | 前端生成的 UUID | 每次新对话生成一个 |
| `course_id` | 请求参数 | 前端传入，可选 |

#### 2.3.3 ③ Query 处理中间结果（第 48~51 行）

```python
original_query:    str         # 用户原始输入，全程不变（减去联网指令标记）
query_type:        str         # GENERAL / PRECISE / VAGUE / BROAD
rewritten_queries: list[str]   # BROAD 分支：Multi-Query 改写后的子 Query 列表
hyde_document:     Optional[str]  # VAGUE 分支：HyDE 生成的假设文档文本
```

**`original_query`"全程不变"的含义**：用户输入可能包含"--搜索"等联网指令标记，这些标记在写入 `original_query` 之前被去除。后续所有节点都使用 `original_query`，不依赖原始输入。

**`query_type` 四种取值**：

| 值 | 含义 | 后续流程 |
|-----|------|---------|
| `GENERAL` | 通用问题 | 跳过 RAG，LLM 直答 |
| `PRECISE` | 精确问题 | 直接向量检索 |
| `VAGUE` | 模糊问题 | 先 HyDE 生成假设文档，再用假设文档检索 |
| `BROAD` | 宽泛问题 | 先 Multi-Query 拆分子问题，再并行检索 |

**`rewritten_queries` 和 `hyde_document` 的互斥性**：

```
query_type = "VAGUE" → hyde_document 非空，rewritten_queries 为空
query_type = "BROAD" → rewritten_queries 非空，hyde_document 为空
query_type = "PRECISE" → 两者都为空（直接用 original_query 检索）
query_type = "GENERAL" → 两者都为空（不检索）
```

#### 2.3.4 ④ 检索与精排结果（第 54~58 行）

```python
# retrieve() 内部已处理 BGE-M3 编码，State 无需存储中间向量
ranked_chunks:      list[dict]   # BGEReranker 精排后的 Top-K chunk
confidence:         float        # 精排置信度 [0, 1]
is_high_confidence: bool         # confidence >= 0.75
web_search_results: list[dict]   # Web Search MCP 返回结果（低置信度时填充）
```

**注释"State 无需存储中间向量"**：BGE-M3 编码后的 `dense_vec` 和 `sparse_vec` 直接在 `retrieve()` 内部传递给 Milvus，不需要存入 State。State 只存储最终结果，不存储中间计算产物。

**`is_high_confidence` 预计算**：`confidence >= 0.75` 的结果在检索节点中预先计算好，生成节点直接读取布尔值，不需要自己实现阈值判断。

**`web_search_results` 的填充条件**：

```
ranked_chunks 非空 + confidence < 0.75 → 先走 Web Search 再兜底
ranked_chunks 为空 → 直接 Web Search（无知识库结果）
置信度 ≥ 0.75 → 不填充 Web Search 结果
```

#### 2.3.5 ⑤ 生成结果 & 控制标记（第 61~68 行）

```python
answer:            str           # 最终回答文本
sources:           list[str]     # 来源标注列表（高置信度 RAG 时填充）
answer_mode:       str           # "rag" / "web_augmented" / "llm_direct" / "general"
existing_summary:  Optional[str] # 当前会话的历史摘要（从 DB 读取）
should_summarize:  bool          # 是否触发摘要压缩
enable_web_search: bool          # True = 低置信度时先走 Web Search 再兜底
fallback_used:     bool          # 是否触发了降级处理
structured_output: Optional[dict]  # 传给 Orchestrator 的结构化数据
```

**`answer_mode` 四种取值**：

| 值 | 含义 | 触发条件 |
|------|------|---------|
| `"rag"` | RAG 生成 | 高置信度（≥0.75） |
| `"web_augmented"` | Web 增强 | 低置信度 + Web 搜索成功 |
| `"llm_direct"` | LLM 直答 | 低置信度 + Web 搜索失败 |
| `"general"` | 通用问题回答 | query_type = GENERAL |

**`should_summarize` 和 `existing_summary` 的关系**：

```
classify_query_node 从 DB 读取 existing_summary
generate_node 判断 should_summarize（基于对话轮数）
save_node 根据 should_summarize 决定是否压缩并保存
```

**`structured_output` 的设计意图**：给 Orchestrator 返回的结构化数据，用于多 Agent 串联时传递信息。在单 Agent 模式下可能为空。

---

## 三、`prompts.py`：7 组提示词精读（131 行）

### 3.1 文件头 docstring（第 1~11 行）

```python
"""问答 Agent - 提示词"""
# backend/agents/qa/prompts.py
# QA Agent 的 7 组提示词，按功能分组：
#   ① SYSTEM_PROMPT          → 系统人设（所有生成节点共用）
#   ② RAG_STRATEGY_PROMPT    → 检索策略判断（Layer 2：LLM 精判）
#   ③ HYDE_PROMPT            → 假设文档生成（VAGUE 分支）
#   ④ MULTI_QUERY_REWRITE    → 子 Query 改写（BROAD 分支）
#   ⑤ RAG_ANSWER_PROMPT      → RAG 回答生成（高置信度路径）
#   ⑥ DIRECT_ANSWER_PROMPT   → LLM 直答（低置信度路径）
#   ⑦ GENERAL_ANSWER_PROMPT  → 通用问题回答（GENERAL 路径）
```

**7 个 Prompt 的路径对应关系**：

```
用户输入
  │
  ├─ Layer 0/1 分类 → GENERAL ─────────────────────────→ ⑦ GENERAL_ANSWER_PROMPT
  │
  └─ Layer 0/1 分类 → SPECIALIZED ─→ Layer 2: ② RAG_STRATEGY_PROMPT
       │
       ├─ PRECISE ──────────────────→ 直接检索 → ⑤ RAG_ANSWER_PROMPT
       ├─ VAGUE ───→ ③ HYDE_PROMPT ─→ 检索 → ⑤ RAG_ANSWER_PROMPT
       └─ BROAD ───→ ④ MULTI_QUERY → 检索 → ⑤ RAG_ANSWER_PROMPT
       
       低置信度兜底 → ⑥ DIRECT_ANSWER_PROMPT
```

### 3.2 ① SYSTEM_PROMPT：系统人设（第 15~26 行）

```python
SYSTEM_PROMPT = """你是 EduAgent 智能助教，专门辅助 IT 培训课程的学员学习。

【你的角色】
- 解答学员关于课程内容的技术问题
- 语言风格：友善、专业、简洁；适合有一定基础的成年学习者
- 回答长度：视问题复杂度适当调整，不过度展开，不简单敷衍

【回答规范】
- 代码示例使用 Markdown 代码块（```语言名 ... ```）
- 涉及原理时先给结论，再给解释
- 如果问题包含明显错误理解，先纠正再解答
- 不编造不确定的信息，不确定时明确说明"""
```

**设计要点**：

| 要素 | 说明 |
|------|------|
| **角色** | "EduAgent 智能助教"——明确身份，不是通用 AI |
| **受众** | "IT 培训课程的学员"——限定回答的技术范围 |
| **语言** | "友善、专业、简洁"——风格指导 |
| **代码** | "Markdown 代码块"——格式规范 |
| **纠错** | "先纠正再解答"——教学场景的特殊要求 |
| **诚实** | "不编造不确定的信息"——避免幻觉 |

**为什么单独提取为 SystemMessage？** 生成节点构造消息时，把 SYSTEM_PROMPT 作为 `SystemMessage` 放在消息列表最前面，而不是嵌入每个 Prompt 模板里。这样：
- 修改角色人格只改一处
- 各 Prompt 模板专注于具体任务指令，不重复系统角色描述

### 3.3 ② RAG_STRATEGY_PROMPT：检索策略判断（第 32~47 行）

```python
RAG_STRATEGY_PROMPT = """判断以下学员问题应采用哪种检索策略。

【策略定义】
PRECISE：问题表达明确，含具体技术点，可直接向量检索。
         例："Redis ZSet 的底层数据结构是什么" / "项目里 LSTM 那层怎么定义的"

VAGUE  ：问题模糊，只给出宽泛意图，直接检索效果差，需先生成假设文档扩充语义再检索（HyDE）。
         例："解释一下" / "我没太懂这块" / "能说说吗"

BROAD  ：问题范围过宽或极度简短（≤5字），需拆成多个子问题并行检索扩大召回（Multi-Query）。
         例："没懂" / "讲讲微服务" / "项目怎么做"

【学员问题】
{query}

只输出一个词：PRECISE 或 VAGUE 或 BROAD"""
```

**占位变量**：`{query}`——学员问题文本。

**输出约束**：只输出一个词，不包含解释。LLM 的输出直接作为 `query_type` 的值。

**输出格式**：`PRECISE` / `VAGUE` / `BROAD`（大写，无空格，无标点）

**三种策略的定义边界**：

| 策略 | 特征 | 示例 | 检索方式 |
|------|------|------|---------|
| PRECISE | 含具体技术点 | "Redis ZSet 底层数据结构" | 原始 query 直接检索 |
| VAGUE | 模糊意图 | "我没太懂这块" | HyDE 生成假设文档后再检索 |
| BROAD | 范围过宽 | "讲讲微服务" | 拆成 3-5 个子问题并行检索 |

### 3.4 ③ HYDE_PROMPT：假设文档生成（第 52~62 行）

```python
HYDE_PROMPT = """你是一位 IT 培训助教。请根据以下对话上下文，推断学员想问的具体技术问题，
并生成一段高质量的技术文档片段作为假设性回答。

【对话上下文（最近几轮）】
{history}

【学员当前输入】
{query}

请直接输出一段专业的技术文档内容（150-300字），不要包含"假设"或"可能"等不确定语气。
输出格式：纯文本，可包含代码块。"""
```

**HyDE（Hypothetical Document Embeddings）原理**：

```
VAGUE query: "我没太懂这块"
  │
  ▼
HyDE: 生成假设文档 "学员询问的是 Spring IOC 容器的工作原理..."
  │
  ▼
用假设文档检索（而不是原始 query）
  │
  ▼
找到更相关的知识库内容
```

**指令"不要包含'假设'或'可能'等不确定语气"**：因为 HyDE 生成的文档会被用于向量检索，如果文档中包含"假设"等不确定语气，会降低向量的语义质量。

**占位变量**：

| 变量 | 内容 | 说明 |
|------|------|------|
| `{history}` | 最近几轮对话 | 帮助推断学员想问的具体问题 |
| `{query}` | 学员当前输入 | 模糊问题文本 |

### 3.5 ④ MULTI_QUERY_REWRITE_PROMPT：子 Query 改写（第 67~84 行）

```python
MULTI_QUERY_REWRITE_PROMPT = """你是一位教学助手，负责将学员模糊的问题改写为多个具体的技术问题。

【上一轮 AI 回答内容（供参考，推断"没懂"指的是什么）】
{last_answer}

【学员当前输入】
{query}

请将学员的问题改写为 3-5 个具体、独立的技术问题，每行一个。
要求：
- 每个问题独立完整，可以单独搜索
- 覆盖不同角度（是什么 / 为什么 / 怎么用 / 和什么区别）
- 不要编号，直接输出问题文本

输出示例：
Spring IOC 容器的核心作用是什么？
IOC 和 DI 的区别是什么？
Spring 如何通过注解实现依赖注入？"""
```

**Multi-Query 策略**：将宽泛问题拆成多个具体子问题，并行检索扩大召回。

**`{last_answer}` 的作用**：当学员说"没懂"时，需要知道上一轮 AI 回答了什么，才能推断"没懂"指的是什么。

**输出约束**：
- 3-5 个子问题
- 每行一个
- 不编号
- 覆盖不同角度（是什么/为什么/怎么用/有什么区别）

### 3.6 ⑤ RAG_ANSWER_PROMPT：RAG 回答生成（第 89~101 行）

```python
RAG_ANSWER_PROMPT = """请基于以下课程知识库内容，回答学员的问题。

【知识库参考内容】
{context}

【学员问题】
{query}

【回答要求】
1. 严格基于参考内容回答，不要引入参考内容之外的信息
2. 如果参考内容不足以完整回答问题，明确说明哪些部分来自参考内容，哪些是补充说明
3. 代码示例保持原样，不要修改
4. 回答简洁清晰，直接切入要点"""
```

**要求 1"严格基于参考内容"**：这是 RAG 的核心——LLM 的生成必须受限于检索到的知识库内容，不能自由发挥。如果 Llama 2 的文档被检索到，LLM 就不能用 Llama 3 的知识回答。

**要求 2"明确说明哪些部分来自参考内容"**：当知识库内容不足以完整回答时，LLM 可以补充通用知识，但必须标注来源。这是 RAG 的"诚实"原则。

**占位变量**：

| 变量 | 内容 | 说明 |
|------|------|------|
| `{context}` | 知识库 chunks | 精排后的 Top-K 文档内容，拼接成一段文本 |
| `{query}` | 学员问题 | `state["original_query"]` |

### 3.7 ⑥ DIRECT_ANSWER_PROMPT：LLM 直答（第 106~114 行）

```python
DIRECT_ANSWER_PROMPT = """请根据你的知识回答以下技术问题。

【学员问题】
{query}

【回答要求】
1. 基于通用技术知识回答，不要声称来自课程资料
2. 如果不确定，明确说明不确定的部分
3. 回答简洁准确，代码示例使用代码块格式"""
```

**与 RAG_ANSWER_PROMPT 的区别**：

| 维度 | RAG_ANSWER_PROMPT | DIRECT_ANSWER_PROMPT |
|------|-------------------|---------------------|
| 知识来源 | 知识库内容 | LLM 自身知识 |
| 约束 | 严格基于参考内容 | 基于通用技术知识 |
| 声明 | 不可声称来自课程资料 | 不可声称来自课程资料 |
| 触发条件 | 高置信度（≥0.75） | 低置信度（<0.75） |

**要求 1"不要声称来自课程资料"**：DIRECT_ANSWER 路径下，LLM 用的是自身知识，不是课程专属知识。必须明确区分，避免学员误以为回答来自课程资料。

### 3.8 ⑦ GENERAL_ANSWER_PROMPT：通用问题回答（第 119~132 行）

```python
GENERAL_ANSWER_PROMPT = """你是 EduAgent 智能助教，专门辅助 IT 培训课程的学员学习。

【当前时间】{current_time}

【学员问题】
{query}

{web_context}【历史对话（最近几轮）】
{history}

请直接回答学员的问题。
- 语言友善、简洁
- 如果问题涉及时间/日期，直接根据【当前时间】作答
- 如果提供了【Web 搜索结果】，优先基于搜索结果回答，并在回答末尾注明信息来源"""
```

**`{web_context}` 的空值处理**：

```python
# generate 节点里的填充逻辑
if state["web_search_results"]:
    snippets = "\n".join(
        f"- {r['title']}：{r['snippet']}" for r in state["web_search_results"]
    )
    web_context = f"【Web 搜索结果】\n{snippets}\n\n"
else:
    web_context = ""   # 空字符串，模板里 {web_context} 自然消失，不留多余空行
```

**空字符串技巧**：`{web_context}` 没有 Web 结果时传空字符串，模板中的 `{web_context}` 自然消失，不留多余空行。不需要 if/else 分支 Prompt。

**`{current_time}` 的设计意图**：通用问题可能涉及时间相关查询（如"今天星期几"、"2024 年有哪些新技术"），LLM 需要知道当前时间才能正确回答。

---

## 四、7 个 Prompt 的触发场景与占位变量

| Prompt | 触发条件 | 占位变量 | 注入方式 | 输出 |
|--------|---------|---------|---------|------|
| `SYSTEM_PROMPT` | 所有生成节点 | 无 | `SystemMessage(content=...)` | 系统角色设定 |
| `RAG_STRATEGY_PROMPT` | SPECIALIZED + Layer 2 | `{query}` | `HumanMessage(content=...)` | 一个词 |
| `HYDE_PROMPT` | query_type = VAGUE | `{history}` `{query}` | `HumanMessage(content=...)` | 150-300 字 |
| `MULTI_QUERY_REWRITE` | query_type = BROAD | `{last_answer}` `{query}` | `HumanMessage(content=...)` | 3-5 行文本 |
| `RAG_ANSWER_PROMPT` | is_high_confidence = True | `{context}` `{query}` | `HumanMessage(content=...)` | 最终回答 |
| `DIRECT_ANSWER_PROMPT` | is_high_confidence = False | `{query}` | `HumanMessage(content=...)` | 最终回答 |
| `GENERAL_ANSWER_PROMPT` | query_type = GENERAL | `{current_time}` `{query}` `{web_context}` `{history}` | `HumanMessage(content=...)` | 最终回答 |

---

## 五、`★` 设计亮点总结

### 5.1 TypedDict + add_messages 的 State 设计

LangGraph 读取 TypedDict 的 `__annotations__` 来决定 reducer 策略：

```python
messages: Annotated[list[BaseMessage], add_messages]  # 追加（reducer）
query_type: str                                       # 覆盖（默认）
```

### 5.2 五组字段职责清晰

上下文（只读）→ Query 处理 → 检索精排 → 生成控制，数据流单向流动，不交叉。

### 5.3 无需存储中间向量

BGE-M3 编码后的向量直接在 `retrieve()` 内部传递给 Milvus，State 只存储最终结果。State 不存储中间计算产物，保持轻量。

### 5.4 预计算布尔值

`is_high_confidence` 在检索节点中预先计算好，生成节点直接读取。`enable_web_search` 同理。业务逻辑集中在一处，不分散。

### 5.5 SYSTEM_PROMPT 单独提取

所有生成节点共用 SystemMessage，修改角色人格只改一处。各 Prompt 模板专注于具体任务指令。

### 5.6 `{web_context}` 空字符串技巧

无 Web 结果时传空字符串，模板自然折叠，不需要 if/else 分支。

### 5.7 输出约束严格

- `RAG_STRATEGY_PROMPT`：只输出一个词
- `MULTI_QUERY_REWRITE_PROMPT`：每行一个，不编号
- `HYDE_PROMPT`：不含"假设"等不确定语气
- `RAG_ANSWER_PROMPT`：严格基于参考内容

### 5.8 教学场景的特殊要求

- "先纠正再解答"——学员可能有错误理解
- "不要声称来自课程资料"——DIRECT 路径下用的是 LLM 自身知识
- "明确说明哪些部分来自参考内容"——RAG 的诚实原则
- "不编造不确定的信息"——避免幻觉