# 试卷批改 Agent：State 与 Prompts 深度解析

> 源文件：`backend/agents/exam/state.py` + `backend/agents/exam/prompts.py`
> 对应课件：6.2 State 与 Prompts
> 前置依赖：`pydantic`、`langgraph`、`langchain-core`

## 全文行号速查表

### state.py（98 行）

| 行号范围 | 标识符 | 类型 | 说明 |
|---------|--------|------|------|
| 1~7 | import | 导入 | TypedDict, BaseModel, add_messages, BaseMessage |
| 14~21 | `ScoringPointResult` | class | 单个得分点评分结果 |
| 24~32 | `SubjectiveReviewResult` | class | 简答题整题批改结果 |
| 35~41 | `WeakPoint` | class | 单个知识薄弱点 |
| 44~47 | `WeakPointsReport` | class | 薄弱点分析报告 |
| 50~54 | `TeacherDecision` | class | 教师确认决策 |
| 61~98 | `ExamState` | class | 试卷批改完整 State（8 组字段） |

### prompts.py（116 行）

| 行号范围 | 标识符 | 类型 | 说明 |
|---------|--------|------|------|
| 4~10 | `SYSTEM_PROMPT` | 常量 | 系统人设（严谨、公正的 IT 助教） |
| 14~43 | `SUBJECTIVE_REVIEW_PROMPT` | 常量 | 简答题逐得分点评分 |
| 47~64 | `SUBJECTIVE_THINK_PROMPT` | 常量 | 批改前推理分析 |
| 68~92 | `CODE_QUALITY_REVIEW_PROMPT` | 常量 | 代码题五维度质量评估 |
| 96~117 | `WEAK_POINTS_ANALYSIS_PROMPT` | 常量 | 知识薄弱点分析 |

---

## 一、文件定位

`state.py` 和 `prompts.py` 是试卷批改 Agent 所有节点的"契约"——节点之间通过 State 传递数据，通过 Prompts 生成文本。

```
state.py（数据契约）                    prompts.py（文本契约）
─────────────────────                  ─────────────────────
5 个 Pydantic 模型 ──→ 定义 LLM 输出结构   5 个 Prompt ──→ 引导 LLM 填这些结构
    ↑ 对应                                    ↑ 对应
SubjectiveReviewResult ←→ SUBJECTIVE_REVIEW_PROMPT
WeakPointsReport      ←→ WEAK_POINTS_ANALYSIS_PROMPT
...

ExamState（图 State） → 连接所有节点，承载三轨结果 + HitL + 发布
```

**核心设计思想**：先定义输出契约（BaseModel），再写 Prompt 引导 LLM 符合契约。Prompt 是软的（语义引导），BaseModel + function calling 是硬的（强制校验），软硬结合保证 LLM 输出质量。

---

## 二、import 分析（state.py 第 1~8 行）

```python
from typing import Annotated, Optional
from typing_extensions import TypedDict
from langgraph.graph.message import add_messages
from langchain_core.messages import BaseMessage
from pydantic import BaseModel
```

| 行号 | 代码 | 说明 |
|:-----|:-----|:-----|
| 3 | `from typing import Annotated, Optional` | 导入 `Annotated`（用于 `messages` 字段的 reducer 注解）与 `Optional` |
| 4 | `from typing_extensions import TypedDict` | 导入 `TypedDict`，用于定义 LangGraph 的 `ExamState` |
| 5 | `from langgraph.graph.message import add_messages` | 导入 `add_messages`，`messages` 字段的追加 reducer |
| 6 | `from langchain_core.messages import BaseMessage` | 导入消息基类，作为 `messages` 列表的元素类型 |
| 7 | `from pydantic import BaseModel` | 导入 Pydantic 基类，用于定义 5 个子模型 |

| import | 来源 | 用途 |
|--------|------|------|
| `TypedDict` | `typing_extensions` | 定义 `ExamState`（LangGraph 的 State，节点间传数据） |
| `BaseModel` | `pydantic` | 定义 5 个子模型（LLM 结构化输出的 schema） |
| `add_messages` | `langgraph.graph.message` | `messages` 字段的 reducer，追加不覆盖 |
| `BaseMessage` | `langchain_core.messages` | 消息类型（Human/AI/System） |

**为什么一个文件里两种元数据模型？**——它们服务两个完全不同的对象：

| | TypedDict（ExamState） | BaseModel（子模型） |
|:--|:----------------------|:-------------------|
| 服务对象 | LangGraph 图 | LLM 函数调用 |
| 数据流向 | 节点 ↔ 节点 | LLM → 解析后的结构化结果 |
| 有无校验 | 无（纯类型注解） | 有（Pydantic v2 强校验） |
| 谁消费 | `graph.ainvoke()` | `llm.with_structured_output()` |

`★ Insight ─────────────────────────────────────`
**TypedDict 是"轻量契约"，BaseModel 是"重量校验器"。**
- LangGraph 只读 TypedDict 的 `__annotations__` 决定哪些字段有 reducer——所以 State 必须用 TypedDict，用 BaseModel 会崩。
- 而 LLM 输出必须强校验（模型可能返回非法 JSON、缺字段、类型错），所以交给 Pydantic。
- 这是 LangGraph 生态的**分工惯例**，不是随意混用。
`─────────────────────────────────────────────────`

---

## 三、五个 Pydantic 子模型（state.py 第 10~55 行）

这 5 个模型不是平级的，而是**嵌套三层**：

```
ScoringPointResult（单个得分点）    ← 最底层
        ↑ list[ScoringPointResult]
SubjectiveReviewResult（简答批改）   ← 中层
        ↑
WeakPointsReport（薄弱点报告）      ← 高层（内含 list[WeakPoint]）
TeacherDecision（教师决策）         ← 独立（HitL 用）
```

### 3.1 `ScoringPointResult`：最底层——单个得分点（第 14~21 行）

```python
class ScoringPointResult(BaseModel):
    """单个得分点的评分结果"""
    point_id:    str
    point_desc:  str
    point_score: int
    earned:      bool
    evidence:    str   # earned=True 时填学员答案中对应原文
    missing:     str   # earned=False 时填未得分原因
```

| 行号 | 代码 | 说明 |
|:-----|:-----|:-----|
| 14 | `class ScoringPointResult(BaseModel):` | 类定义，Pydantic BaseModel |
| 15 | `"""单个得分点的评分结果"""` | 文档字符串 |
| 16 | `point_id: str` | 得分点 ID |
| 17 | `point_desc: str` | 得分点描述 |
| 18 | `point_score: int` | 该得分点满分 |
| 19 | `earned: bool` | 是否得分 |
| 20 | `evidence: str` | 得分原文（earned=True 时填） |
| 21 | `missing: str` | 扣分原因（earned=False 时填） |

**`evidence` / `missing` 互斥**：`earned=True` 时填 `evidence`（得分依据=学员原文），`earned=False` 时填 `missing`（未得分原因）。一个得分点要么有"得分原文"，要么有"扣分原因"，**不能同时为空**。这是**可追溯性**设计——老师的批改必须能展示依据，不能只给一个分数。

### 3.2 `SubjectiveReviewResult`：中层——整道简答题（第 24~32 行）

```python
class SubjectiveReviewResult(BaseModel):
    """简答题批改结果（LLM 结构化输出）"""
    question_id:     str
    student_answer:  str
    total_score:     int
    full_score:      int
    confidence:      float       # [0, 1]，低于 0.7 时标记需复核
    point_results:   list[ScoringPointResult]
    overall_comment: str
```

| 行号 | 代码 | 说明 |
|:-----|:-----|:-----|
| 24 | `class SubjectiveReviewResult(BaseModel):` | 类定义，Pydantic BaseModel |
| 25 | `"""简答题批改结果（LLM 结构化输出）"""` | 文档字符串 |
| 26 | `question_id: str` | 题目 ID |
| 27 | `student_answer: str` | 学员答案（回显，追溯用） |
| 28 | `total_score: int` | LLM 算出的得分（各得分点累加） |
| 29 | `full_score: int` | 题目满分 |
| 30 | `confidence: float` | 评分把握度 [0,1]，<0.7 标记需复核 |
| 31 | `point_results: list[ScoringPointResult]` | 各得分点评分结果列表 |
| 32 | `overall_comment: str` | 整体评语 |

**`confidence` 贯穿设计**：LLM 给自己评分的把握度打分。当 `confidence < 0.7` 时，该题自动标记 `needs_review=True`，进入教师必须人工确认的列表。

**`total_score` vs `full_score` 分开存**：`total_score` 是 LLM 算出的得分，`full_score` 是题目满分。两者对比得出扣分，且给下游校验"得分不能超过满分"。

### 3.3 `WeakPoint` + `WeakPointsReport`：高层——薄弱点分析（第 35~47 行）

```python
class WeakPoint(BaseModel):
    """单个知识薄弱点"""
    tag:          str            # 知识点标签，如 "Spring IOC"、"Redis缓存穿透"
    wrong_count:  int
    total_count:  int
    question_nos: list[int]      # 涉及的题目序号列表
    suggestion:   str            # 针对该知识点的复习建议


class WeakPointsReport(BaseModel):
    """知识薄弱点分析报告（LLM 结构化输出）"""
    weak_points:     list[WeakPoint]
    overall_summary: str         # 整体评价，不超过50字
```

| 行号 | 代码 | 说明 |
|:-----|:-----|:-----|
| 35 | `class WeakPoint(BaseModel):` | 类定义，单个知识薄弱点 |
| 36 | `"""单个知识薄弱点"""` | 文档字符串 |
| 37 | `tag: str` | 知识点标签，如 `"Spring IOC"` |
| 38 | `wrong_count: int` | 该知识点下的错题数 |
| 39 | `total_count: int` | 该知识点下的总题数 |
| 40 | `question_nos: list[int]` | 涉及的题目序号列表（可跳转） |
| 41 | `suggestion: str` | 针对该知识点的复习建议 |
| 44 | `class WeakPointsReport(BaseModel):` | 类定义，薄弱点分析报告 |
| 45 | `"""知识薄弱点分析报告（LLM 结构化输出）"""` | 文档字符串 |
| 46 | `weak_points: list[WeakPoint]` | 薄弱点列表 |
| 47 | `overall_summary: str` | 整体评价，不超过 50 字 |

**`question_nos` 是"可点击跳转"设计**：记录该知识点下的出错题号，教师看报告时可以直接跳到对应题目核查。

**`overall_summary` 限 50 字**：约束 LLM 输出简洁，避免长篇大论。

### 3.4 `TeacherDecision`：独立——教师决策（第 50~54 行）

```python
class TeacherDecision(BaseModel):
    """教师确认决策（interrupt 恢复时传入）"""
    action:        str           # "approve" / "modify"
    modifications: list[dict]    # [{question_id, new_score, comment}, ...]
    teacher_id:    str
```

| 行号 | 代码 | 说明 |
|:-----|:-----|:-----|
| 50 | `class TeacherDecision(BaseModel):` | 类定义，教师确认决策 |
| 51 | `"""教师确认决策（interrupt 恢复时传入）"""` | 文档字符串 |
| 52 | `action: str` | 决策动作：`"approve"` 全部通过 / `"modify"` 带修改 |
| 53 | `modifications: list[dict]` | 修改列表，宽松结构，不强校验 |
| 54 | `teacher_id: str` | 教师 ID |

**这是 HitL（Human-in-the-Loop）的输入**：教师不是直接改分数，而是传一个决策对象。`action="approve"` 表示全部通过，`action="modify"` 表示带了修改列表。`modifications` 用 `list[dict]` 而非强类型子模型，因为它是**教师自由输入的宽松结构**，不需要强校验。

---

## 四、`ExamState`：试卷批改完整 State（第 61~98 行）

### 4.1 函数签名

```python
class ExamState(TypedDict):
    """试卷批改 Agent 完整 State"""
```

| 行号 | 代码 | 说明 |
|:-----|:-----|:-----|
| 61 | `class ExamState(TypedDict):` | 定义 LangGraph 图 State，继承 `TypedDict` |
| 62 | `"""试卷批改 Agent 完整 State"""` | 文档字符串 |
| 65 | `messages: Annotated[list[BaseMessage], add_messages]` | 对话消息列表，唯一带 reducer 追加的字段 |
| 66 | `student_id: str` | 学员 ID |
| 67 | `tenant_id: str` | 租户 ID |
| 68 | `session_id: str` | 会话 ID |
| 69 | `exam_id: str` | 试卷 ID |
| 70 | `submission_id: str` | 提交记录 ID |
| 71 | `word_file_path: str` | 学员作答 Word 文件本地路径 |
| 74 | `parsed_questions: list[dict]` | 解析+DB 合并后的完整题目列表 |
| 77 | `objective_results: list[dict]` | 客观题批改结果 |
| 78 | `subjective_results: list[dict]` | 简答题批改结果 |
| 79 | `code_results: list[dict]` | 代码题评估结果 |
| 82 | `pre_review_summary: dict` | 三轨汇总预批改结果 |
| 85 | `weak_points: list[dict]` | 知识薄弱点列表 |
| 86 | `weak_points_summary: str` | 薄弱点整体评价 |
| 89 | `teacher_notified: bool` | 教师是否已通知 |
| 90 | `teacher_decision: Optional[dict]` | 教师决策（中断恢复时传入） |
| 93 | `final_results: list[dict]` | 最终批改结果 |
| 94 | `published: bool` | 结果是否已发布 |
| 97 | `fallback_used: bool` | 降级标记 |
| 98 | `structured_output: Optional[dict]` | 结构化输出（降级时用） |

### 4.2 7 组字段完整列表

| 分组 | 字段 | 类型 | 写入节点 | 读取节点 |
|:-----|:-----|:-----|:---------|:---------|
| ① 请求上下文 | `messages` | `Annotated[list[BaseMessage], add_messages]` | 所有节点（追加） | 所有节点 |
| | `student_id` | `str` | API 层 | 各节点 |
| | `tenant_id` | `str` | API 层 | 各节点 |
| | `session_id` | `str` | API 层 | 各节点 |
| | `exam_id` | `str` | API 层 | 各节点 |
| | `submission_id` | `str` | API 层 | 各节点 |
| | `word_file_path` | `str` | API 层 | 各节点 |
| ② 解析结果 | `parsed_questions` | `list[dict]` | `parse_word_node` → `load_questions_meta_node` 覆盖 | 三轨节点 |
| ③ 三轨批改结果 | `objective_results` | `list[dict]` | `run_three_tracks_node` | 汇总节点 |
| | `subjective_results` | `list[dict]` | `run_three_tracks_node` | 汇总节点 |
| | `code_results` | `list[dict]` | `run_three_tracks_node` | 汇总节点 |
| ④ 汇总预批改 | `pre_review_summary` | `dict` | `aggregate_results_node` | 薄弱点/HitL |
| ⑤ 知识薄弱点 | `weak_points` | `list[dict]` | `analyze_weak_points_node` | 前端展示 |
| | `weak_points_summary` | `str` | `analyze_weak_points_node` | 前端展示 |
| ⑥ HitL | `teacher_notified` | `bool` | `notify_teacher_node` | 决策应用 |
| | `teacher_decision` | `Optional[dict]` | `teacher_review_node` | 决策应用 |
| ⑦ 最终结果 | `final_results` | `list[dict]` | `apply_teacher_decision_node` | API 返回 |
| | `published` | `bool` | `publish_results_node` | API 返回 |
| ⑧ 降级标记 | `fallback_used` | `bool` | 各节点 | API 返回 |
| | `structured_output` | `Optional[dict]` | 各节点 | API 返回 |

### 4.3 `parsed_questions` 被两个节点先后写

`parsed_questions` 是**没有挂 reducer** 的字段（默认覆盖语义）。两个节点按固定顺序先后写入：

```
parse_word_node → 写入初步解析结果（只有学员答案）
    ↓ 固定顺序边
load_questions_meta_node → 用 DB 数据覆盖（补充题型/得分点/正确答案）
```

因为是固定顺序边，不会并发冲突，后者覆盖前者是安全的。

### 4.4 `messages` 是唯一带 reducer 的字段

```python
messages: Annotated[list[BaseMessage], add_messages]
```

只有 `messages` 用了 `add_messages` 追加语义。其他所有字段都是普通覆盖语义。

**为什么只有 messages 需要追加？** 对话历史是**累积**的——每轮都要保留之前的所有消息。而 `parsed_questions`、`final_results` 这些都是**一锤定音**的中间/最终结果，后写覆盖先写即可。

`★ Insight ─────────────────────────────────────`
**State 字段的"追加 vs 覆盖"选择，本质上是对"数据是累积还是替换"的建模。**
- 累积型（对话历史）→ reducer 追加
- 快照型（解析结果、批改结果）→ 默认覆盖
- LangGraph 的 `Annotated[T, reducer]` 注解就是用来声明这种语义的
`─────────────────────────────────────────────────`

### 4.5 三轨结果用 `list[dict]` 而非强类型

`objective_results` / `subjective_results` / `code_results` 都是 `list[dict]`，而不是 `list[SubjectiveReviewResult]`。原因：

1. **客观题/代码题没有对应的 BaseModel**（只有简答题有 `SubjectiveReviewResult`）。
2. LangGraph 的 TypedDict State **不参与运行时校验**——类型注解只是给 IDE 和开发者看的提示，运行时存什么都能塞进去。用 `dict` 更灵活，避免过度约束。

---

## 五、Prompts：五个 Prompt 模板（prompts.py）

### 5.1 `SYSTEM_PROMPT`——人设前缀（第 4~10 行）

```python
SYSTEM_PROMPT = """你是 EduAgent 智能助教，专门辅助 IT 培训课程的学员学习。

【批改原则】
- 严格按照得分点评分，不随意加减分
- 给出明确的得分依据，指出学员答案中的具体内容
- 评语简洁专业，指出核心问题，避免空泛表扬或批评
- 对有争议的内容保持保守评分，宁可偏低并标记复核，不随意给高分"""
```

| 行号 | 代码 | 说明 |
|:-----|:-----|:-----|
| 4 | `SYSTEM_PROMPT = """你是 EduAgent 智能助教...` | 定义系统人设常量，无占位符的静态 Prompt |
| 5 | `（空行）` | 占位分隔，保持 Prompt 可读性 |
| 6 | `【批改原则】` | 批改原则标题 |
| 7 | `- 严格按照得分点评分，不随意加减分` | 原则一：严守得分点，不随意加减 |
| 8 | `- 给出明确的得分依据，指出学员答案中的具体内容` | 原则二：评分依据可追溯 |
| 9 | `- 评语简洁专业，指出核心问题，避免空泛表扬或批评` | 原则三：评语简洁，避免空泛 |
| 10 | `- 对有争议的内容保持保守评分，宁可偏低并标记复核，不随意给高分` | 原则四：保守评分，从严不放松 |

**注入方式**：作为 `SystemMessage` 注入到每个批改请求。**没有占位符**（`{}`），是纯静态人设。

**"保守评分宁可偏低"**：这是关键设计。AI 批改宁可判严一点并标记复核，也不能给高分放水——因为给错高分会让学员误以为自己学会了。**错误方向的选择**：AI 批改的错误偏向"从严"是安全的。

### 5.2 `SUBJECTIVE_REVIEW_PROMPT`——简答批改主 Prompt（第 14~43 行）

```python
SUBJECTIVE_REVIEW_PROMPT = """请按照以下得分点批改学员的简答题作答。

【题目】
{question_content}

【得分点（共{full_score}分）】
{scoring_points}

【学员答案】
{student_answer}

请严格按照得分点逐条评分，输出以下 JSON 结构（直接输出，不要加 Markdown 代码块）：
{{
  "question_id": "",
  "student_answer": "{student_answer}",
  "total_score": <整数，各得分点累加>,
  "full_score": {full_score},
  "confidence": <0.0-1.0，评分把握度，不确定时给低分并降低 confidence>,
  "point_results": [
    {{
      "point_id": "<得分点ID，若无则填空字符串>",
      "point_desc": "<得分点描述>",
      "point_score": <该得分点满分>,
      "earned": <true/false>,
      "evidence": "<学员答案中对应的原文，earned=true 时必填>",
      "missing": "<未得分的原因，earned=false 时必填>"
    }}
  ],
  "overall_comment": "<1-2句整体评语，指出最核心的问题或亮点>"
}}"""
```

| 行号 | 代码 | 说明 |
|:-----|:-----|:-----|
| 14 | `SUBJECTIVE_REVIEW_PROMPT = """请按照以下得分点批改学员的简答题作答。` | 定义简答批改主 Prompt |
| 17 | `{question_content}` | 题干占位符，由调用方填充 |
| 19 | `【得分点（共{full_score}分）】` | 得分点标题，含满分占位符 |
| 20 | `{scoring_points}` | 标准得分点列表占位符 |
| 23 | `{student_answer}` | 学员答案占位符 |
| 25 | `请严格按照得分点逐条评分，输出以下 JSON 结构...` | 要求按得分点逐条评分并输出 JSON |
| 27 | `"question_id": ""` | 题目 ID 字段 |
| 28 | `"student_answer": "{student_answer}"` | 回显学员答案，追溯用 |
| 29 | `"total_score": <整数，各得分点累加>` | 总得分（各得分点累加） |
| 30 | `"full_score": {full_score}` | 满分 |
| 31 | `"confidence": <0.0-1.0，评分把握度...>` | 把握度，不确定时给低分 |
| 32 | `"point_results": [` | 得分点结果列表，逐点评分 |
| 34 | `"point_id": "<得分点ID...>"` | 得分点 ID |
| 35 | `"point_desc": "<得分点描述>"` | 得分点描述 |
| 36 | `"point_score": <该得分点满分>` | 该得分点满分 |
| 37 | `"earned": <true/false>` | 是否得分 |
| 38 | `"evidence": "<学员答案中对应的原文...>"` | 得分依据原文（earned=true 必填） |
| 39 | `"missing": "<未得分的原因...>"` | 扣分原因（earned=false 必填） |
| 42 | `"overall_comment": "<1-2句整体评语...>"` | 整体评语，指出最核心问题或亮点 |
| 43 | `}}"""` | Prompt 结束，`}}` 转义为字面 `}` |

#### 3 个占位符

| 占位符 | 填充内容 |
|:-------|:---------|
| `{question_content}` | 题干 |
| `{scoring_points}` | 标准得分点列表 |
| `{student_answer}` | 学员答案 |

#### 双大括号 `{{ }}` 的陷阱

Prompt 里输出的是 JSON 示例，但 JSON 有 `{}`，而 Python 的 `.format()` 会把 `{}` 当占位符。所以：

- **`{{` 和 `}}`** → 转义后输出为字面 `{` 和 `}`
- **`{question_content}`** → 真正的占位符，被替换

如果漏了双大括号，`.format()` 会抛 `KeyError` 或报格式错误。

#### 为什么 Prompt 里写 JSON，但实际走 function calling？

这个 Prompt 用于 `with_structured_output(SubjectiveReviewResult)`——虽然 Prompt 里写的是"输出 JSON 结构"，实际上结构化输出走的是 **function calling**，LLM 会把结果填入 `SubjectiveReviewResult` 的字段而不是生成 JSON 文本。Prompt 里的 JSON 示例是给 LLM 的**语义引导**，帮助它理解每个字段的含义。

`★ Insight ─────────────────────────────────────`
**这是一个"双保险"设计**：
- 底层：`with_structured_output(BaseModel)` 用 function calling 强制 LLM 输出符合 schema 的结构化结果（硬约束）
- 上层：Prompt 里的 JSON 示例告诉 LLM 每个字段的**含义**（软引导）
- 即使 LLM 偶尔输出不规范的 JSON 文本，Pydantic 也能兜底解析或报错，不会静默产生坏数据
`─────────────────────────────────────────────────`

### 5.3 `SUBJECTIVE_THINK_PROMPT`——批改前推理（第 47~64 行）

```python
SUBJECTIVE_THINK_PROMPT = """在批改这道简答题之前，请先进行深入分析。

【题目】
{question_content}

【标准得分点】
{scoring_points}

【学员作答】
{student_answer}

请分析以下几点（中文，5-8句话）：
1. 学员是否理解了题目的核心概念？
2. 逐一检查每个得分点：学员的回答是否覆盖了该要点？是否用不同表述但实质正确？
3. 有没有表述模糊但实质正确、不应扣分的内容？
4. 有没有明显的概念错误或理解偏差？

直接输出分析内容，不加任何前缀标签。"""
```

| 行号 | 代码 | 说明 |
|:-----|:-----|:-----|
| 47 | `SUBJECTIVE_THINK_PROMPT = """在批改这道简答题之前，请先进行深入分析。` | 定义批改前推理 Prompt |
| 50 | `{question_content}` | 题干占位符 |
| 53 | `{scoring_points}` | 标准得分点占位符 |
| 56 | `{student_answer}` | 学员作答占位符 |
| 58 | `请分析以下几点（中文，5-8句话）：` | 要求分析 4 个方面，5-8 句话 |
| 59 | `1. 学员是否理解了题目的核心概念？` | 分析点一：核心概念理解 |
| 60 | `2. 逐一检查每个得分点：...` | 分析点二：逐得分点对照 |
| 61 | `3. 有没有表述模糊但实质正确、不应扣分的内容？` | 分析点三：模糊但实质正确的容错 |
| 62 | `4. 有没有明显的概念错误或理解偏差？` | 分析点四：明显错误确认 |
| 64 | `直接输出分析内容，不加任何前缀标签。"""` | 要求纯文本输出，无前缀标签 |

**这是"两步批改"的第一步**：
1. 先让 LLM **自由推理**（不约束输出格式）→ 分析写进 `reasoning_trace`
2. 把这段推理**追加到主批改 Prompt 末尾** → 让结构化评分参考这段分析

**为什么需要这个？** 普通 Prompt 直接批改时，LLM 对"学员用了不同表述回答正确内容"的情况容易误判扣分。加入推理步骤后，LLM 先分析"是否实质正确"，再做评分，准确率更高。

**关键点**：这是 **"Reasoning before Answering"（先想后答）** 模式。通过让 LLM 显式输出推理过程，把隐式的"思考"变成显式的"分析"，减少误判。

### 5.4 `CODE_QUALITY_REVIEW_PROMPT`——代码质量评估（第 68~92 行）

```python
CODE_QUALITY_REVIEW_PROMPT = """请对以下代码题的学员提交代码进行质量评估。

【题目要求】
{question}

【学员代码】
{code}

请从以下5个维度评估代码质量，总分 {full_score} 分，输出 JSON（直接输出，不要加代码块标记）：
{{
  "score": <整数，0到{full_score}>,
  "feedback": [
    "<维度1评价：代码规范性（缩进/括号/分号等）>",
    "<维度2评价：命名可读性（变量/方法/类名）>",
    "<维度3评价：算法效率（时间/空间复杂度）>",
    "<维度4评价：异常处理（边界条件/错误处理）>",
    "<维度5评价：注释质量（关键逻辑是否有注释）>"
  ]
}}

评分参考：
- 代码基本正确且规范：{full_score} × 0.9
- 功能正确但不够规范：{full_score} × 0.7
- 部分正确：{full_score} × 0.4
- 未提交或完全错误：0"""
```

| 行号 | 代码 | 说明 |
|:-----|:-----|:-----|
| 68 | `CODE_QUALITY_REVIEW_PROMPT = """请对以下代码题的学员提交代码进行质量评估。` | 定义代码质量评估 Prompt |
| 71 | `{question}` | 题目要求占位符 |
| 74 | `{code}` | 学员代码占位符 |
| 76 | `请从以下5个维度评估代码质量，总分 {full_score} 分...` | 要求 5 维度评估，总分由占位符控制 |
| 78 | `"score": <整数，0到{full_score}>` | 总评分，范围 0~full_score |
| 79 | `"feedback": [` | 5 个维度评价的列表 |
| 80 | `"<维度1评价：代码规范性...>"` | 维度一：代码规范性 |
| 81 | `"<维度2评价：命名可读性...>"` | 维度二：命名可读性 |
| 82 | `"<维度3评价：算法效率...>"` | 维度三：算法效率 |
| 83 | `"<维度4评价：异常处理...>"` | 维度四：异常处理 |
| 84 | `"<维度5评价：注释质量...>"` | 维度五：注释质量 |
| 88 | `评分参考：` | 四档评分参考 |
| 89 | `- 代码基本正确且规范：{full_score} × 0.9` | 第一档：基本正确且规范 |
| 90 | `- 功能正确但不够规范：{full_score} × 0.7` | 第二档：功能正确，规范性不足 |
| 91 | `- 部分正确：{full_score} × 0.4` | 第三档：部分正确 |
| 92 | `- 未提交或完全错误：0"""` | 第四档：未提交或完全错误 |

#### 不同于简答题：这是"整体评分 + 维度评价"

| 维度 | 评估点 |
|:-----|:-------|
| 简答题 | 逐得分点（`point_results` 列表） |
| 代码题 | 整体 5 维度 + 单一 `score` |

**`feedback` 是 5 元素列表**：每个元素对应一个维度的评价。Prompt 明确写了 5 个维度，LLM 会按顺序填。

**`score` 由 `{full_score}` 约束**：`score` 是 0 到 `full_score` 的整数。评分参考给了 4 档比例（0.9/0.7/0.4/0），引导 LLM 的评分尺度。

### 5.5 `WEAK_POINTS_ANALYSIS_PROMPT`——知识薄弱点（第 96~117 行）

```python
WEAK_POINTS_ANALYSIS_PROMPT = """你是一位经验丰富的 IT 课程教师，请根据学员本次试卷的答题情况，分析其知识薄弱点并给出复习建议。

【错题/扣分题清单】
{wrong_questions}

【说明】
- 上方列出了本次试卷中学员答错或扣分的题目，包含题目内容和错误原因
- 请将这些题目归纳到对应的知识点，分析薄弱原因，并给出具体的复习建议

请输出以下 JSON 结构（直接输出，不要加 Markdown 代码块）：
{{
  "weak_points": [
    {{
      "tag": "<知识点名称，例如：Spring IOC、Redis缓存穿透、JVM垃圾回收>",
      "wrong_count": <该知识点下的错题数>,
      "total_count": <该知识点下的总题数，若不确定填与wrong_count相同>,
      "question_nos": [<题目序号列表>],
      "suggestion": "<针对该知识点的具体复习建议，1-2句>"
    }}
  ],
  "overall_summary": "<对学员本次考试整体表现的简短评价，指出最核心的1-2个薄弱方向，不超过50字>"
}}"""
```

| 行号 | 代码 | 说明 |
|:-----|:-----|:-----|
| 96 | `WEAK_POINTS_ANALYSIS_PROMPT = """你是一位经验丰富的 IT 课程教师...` | 定义知识薄弱点分析 Prompt |
| 99 | `{wrong_questions}` | 错题/扣分题清单占位符 |
| 101 | `【说明】` | 操作说明标题 |
| 102 | `- 上方列出了本次试卷中学员答错或扣分的题目...` | 说明输入内容 |
| 103 | `- 请将这些题目归纳到对应的知识点...` | 说明归纳输出目标 |
| 105 | `请输出以下 JSON 结构...` | 要求按 JSON 结构输出 |
| 107 | `"weak_points": [` | 薄弱点列表 |
| 109 | `"tag": "<知识点名称...>"` | 知识点标签 |
| 110 | `"wrong_count": <该知识点下的错题数>` | 错题数 |
| 111 | `"total_count": <...若不确定填与wrong_count相同>` | 总题数，宽容性引导 |
| 112 | `"question_nos": [<题目序号列表>]` | 涉及题号列表 |
| 113 | `"suggestion": "<具体复习建议，1-2句>"` | 复习建议 |
| 116 | `"overall_summary": "<整体表现的简短评价...不超过50字>"` | 整体评价，限 50 字 |
| 117 | `}}"""` | Prompt 结束 |

**操作规程**：输入是"错题/扣分题清单"（含题目内容和错误原因），输出是**错误归纳**到知识点 + 复习建议。

**`total_count` 的"若不确定填与 wrong_count 相同"**：这是对 LLM 的宽容性引导——防止 LLM 因不确定而不填或编造。`total_count` 用于计算薄弱度（如错了 3 题 / 共 5 题 = 60% 薄弱），但数据不全时退化为 100%，仍能指导优先级。

---

## 六、调用方式与依赖

### 6.1 谁消费 state.py？

`state.py` 定义的 `ExamState` 和子模型被所有节点和 API 层共享：

| 消费者 | 用途 | 方式 |
|--------|------|------|
| `nodes.py`（10 个节点） | 读写 `ExamState` 字段 | `from backend.agents.exam.state import ExamState` |
| `graph.py` | 初始化 `StateGraph(ExamState)` | 图构建时传入 State 类型 |
| `exam.py`（API 层） | 构造初始 State、读取结果 | 传入 `initial_state` dict |
| LLM 函数调用 | `with_structured_output(SubjectiveReviewResult)` | 子模型作为 Schema |

### 6.2 谁消费 prompts.py？

| Prompt | 消费节点 | 功能 |
|--------|---------|------|
| `SYSTEM_PROMPT` | `_review_one_subjective` / `_llm_code_review` | 系统人设 |
| `SUBJECTIVE_REVIEW_PROMPT` | `_review_one_subjective` | 简答题批改 |
| `SUBJECTIVE_THINK_PROMPT` | `_review_one_subjective` | 批改前推理 |
| `CODE_QUALITY_REVIEW_PROMPT` | `_llm_code_review` | 代码题评估 |
| `WEAK_POINTS_ANALYSIS_PROMPT` | `analyze_weak_points_node` | 薄弱点分析 |

### 6.3 依赖的外部资源

| 依赖 | 用途 |
|------|------|
| `pydantic.BaseModel` | 子模型定义，`with_structured_output` 的 Schema |
| `langchain_core.messages.BaseMessage` | 消息类型 |
| `langgraph.graph.message.add_messages` | `messages` 字段的 reducer |
| `typing_extensions.TypedDict` | `ExamState` 定义 |

---

## 七、`★` 设计亮点总结

### 6.1 软硬结合的输出控制

```
硬约束：with_structured_output(BaseModel) → LLM 必须输出符合 schema 的结构
软引导：Prompt 中的 JSON 示例 → 告诉 LLM 每个字段的含义
```

### 6.2 先想后答（Reasoning before Answering）

`SUBJECTIVE_THINK_PROMPT` 先让 LLM 自由推理，再走结构化评分。两步批改比一步直接批改准确率更高，尤其对"不同表述但实质正确"的场景。

### 6.3 保守评分 + 置信度标记

LLM 批改的 `confidence` 阈值（< 0.7）标记需复核，配合"宁可偏低不随意给高分"的 Prompt 原则，把最终的决策权交给教师。

### 6.4 可追溯的评分依据

`ScoringPointResult` 的 `evidence` / `missing` 互斥设计，保证每个得分点要么有"得分原文"，要么有"扣分原因"，不出现"空分数"。

### 6.5 TypedDict + BaseModel 分工

| 角色 | 工具 | 职责 |
|:-----|:-----|:------|
| 图 State | `TypedDict` | 节点间数据传递，LangGraph 原生支持 |
| 结构化输出 | `BaseModel` | LLM 输出校验，Pydantic 强类型保障 |