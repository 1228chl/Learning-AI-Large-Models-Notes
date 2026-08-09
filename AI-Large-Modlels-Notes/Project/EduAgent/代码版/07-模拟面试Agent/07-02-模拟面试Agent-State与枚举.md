# 模拟面试 Agent：State 与枚举

> 源文件：`backend/agents/interview/state.py`（共 98 行）
> 对应课件：7.2 State与枚举
> 前置依赖：`TypedDict`、`BaseModel`、`add_messages`、`InterviewStage`、`AnswerQuality`

## 全文行号速查表

| 行号 | 代码/内容 | 角色 |
|:----:|:----------|:-----|
| 1~2 | `"""模拟面试 Agent - 状态"""` | 模块文档字符串 |
| 3~8 | import 区域 | 类型注解、TypedDict、BaseModel、Enum |
| 11~17 | `class InterviewStage(str, Enum):` | 面试五阶段枚举 |
| 20~25 | `class AnswerQuality(str, Enum):` | 回答质量四等级枚举 |
| 28~34 | `class DimensionEval(BaseModel):` | 单维度评估 Pydantic 模型 |
| 37~45 | `class InterviewReport(BaseModel):` | 五维度评估报告 Pydantic 模型 |
| 48~50 | `class ReportWrapper(BaseModel):` | 报告顶层包装 |
| 53~98 | `class InterviewState(TypedDict):` | 完整 State（22 个字段） |

---

## 一、为什么需要面试 Agent 的 State？

面试 Agent 是一个**多轮对话状态机**，与 QA Agent 或 Exam Agent 的单次执行不同：

- **多轮对话**：学员和面试官之间的对话可能持续 20~40 轮
- **状态推移**：面试经历热身→技术基础→项目深挖→反问→结束五个阶段
- **跨轮记忆**：`current_question` 标记当前问题，`followup_count` 控制追问次数
- **简历联动**：需要从简历审查结果读取项目列表和技能标签

如果没有 State，每一轮对话都是"失忆"的——面试官不知道当前问到哪道题、学员之前回答得怎么样、项目深挖到哪个程度了。

---

## 二、核心枚举定义

### 2.1 `InterviewStage`：面试五阶段（第 11~17 行）

```python
# state.py 第 11~17 行
class InterviewStage(str, Enum):
    """面试的五个阶段（状态机的状态取值）。"""
    WARMUP    = "warmup"      # 热身：邀请自我介绍
    TECH_BASE = "tech_base"   # 技术基础：题库问答
    PROJECT   = "project"     # 项目深挖：针对简历项目追问
    CLOSING   = "closing"     # 反问收尾：让学员提问
    FINISHED  = "finished"    # 终态：触发报告生成
```

| 行号 | 代码 | 说明 |
|:----:|:-----|:-----|
| 11 | `class InterviewStage(str, Enum):` | 继承 `str` 和 `Enum`，枚举值可直接当字符串用 |
| 13 | `WARMUP = "warmup"` | 阶段①：开场白 + 自我介绍 |
| 14 | `TECH_BASE = "tech_base"` | 阶段②：技术题问答（核心环节） |
| 15 | `PROJECT = "project"` | 阶段③：项目深挖（需简历联动） |
| 16 | `CLOSING = "closing"` | 阶段④：反问环节，让学员提问 |
| 17 | `FINISHED = "finished"` | 阶段⑤：终态，触发报告生成 |

**五阶段转换顺序**：`WARMUP → TECH_BASE → PROJECT → CLOSING → FINISHED`

---

### 2.2 `AnswerQuality`：回答质量四等级（第 20~25 行）

```python
# state.py 第 20~25 行
class AnswerQuality(str, Enum):
    """学员单次回答的质量标签（驱动追问/换题决策）。"""
    EXCELLENT = "excellent"   # 优秀：有技术细节/量化/原理
    ADEQUATE  = "adequate"    # 基本及格：方向对但缺深度
    WEAK      = "weak"        # 较弱：方向偏或太表面
    NO_ANSWER = "no_answer"   # 未作答：明说不知道或为空
```

| 行号 | 代码 | 说明 |
|:----:|:-----|:-----|
| 22 | `EXCELLENT = "excellent"` | 优秀：触发追问（`followup` 路径） |
| 23 | `ADEQUATE = "adequate"` | 及格：正常换下一题 |
| 24 | `WEAK = "weak"` | 较弱：轻描淡写跳过，不展开评价 |
| 25 | `NO_ANSWER = "no_answer"` | 未作答：给提示思路后换题 |

**质量标签的决策作用**：

| 质量标签 | 追问行为 | 反馈语气 |
|:---------|:---------|:---------|
| `EXCELLENT` | 触发追问（最多 2 次） | 肯定亮点 + 指出深化方向 |
| `ADEQUATE` | 换下一题 | 肯定基本思路 + 指出遗漏知识点 |
| `WEAK` | 跳过 | 轻描淡写（"好的，换个话题"） |
| `NO_ANSWER` | 给提示思路后换题 | 简短引导 |

---

## 三、Pydantic 数据模型

### 3.1 `DimensionEval`：单维度评估（第 28~34 行）

```python
# state.py 第 28~34 行
class DimensionEval(BaseModel):
    """单个维度的评估结果"""
    dimension:  str       = Field(description="评估维度名称")
    score:      int       = Field(description="得分 0-100")
    comment:    str       = Field(description="1-2句评语")
    highlights: list[str] = Field(default_factory=list, description="亮点列举")
    weaknesses: list[str] = Field(default_factory=list, description="薄弱点列举")
```

| 行号 | 代码 | 说明 |
|:----:|:-----|:-----|
| 28 | `class DimensionEval(BaseModel):` | Pydantic v2 BaseModel，自动校验 |
| 29 | `dimension: str` | 维度名称，如 "技术深度"、"表达逻辑" |
| 30 | `score: int` | 0-100 整数分 |
| 31 | `comment: str` | 1-2 句简短评语 |
| 32 | `highlights: list[str]` | 亮点列表，默认空列表 |
| 33 | `weaknesses: list[str]` | 薄弱点列表，默认空列表 |

**`Field(default_factory=list)`**：Pydantic v2 推荐用 `default_factory` 而非 `default=[]`，避免可变默认值陷阱。

---

### 3.2 `InterviewReport`：五维度评估报告（第 37~45 行）

```python
# state.py 第 37~45 行
class InterviewReport(BaseModel):
    """面试五维度评估报告"""
    dimensions:         list[DimensionEval]
    overall_score:      int       = Field(description="综合得分 0-100（五维度加权平均）")
    strengths:          list[str] = Field(description="2-3条核心优势（真实面试表现）")
    improvements:       list[str] = Field(description="2-3条重点提升方向")
    overall_comment:    str       = Field(description="2-3句综合评语")
    recommended_topics: list[str] = Field(description="建议重点复习的3-5个知识点")
    next_step_advice:   str       = Field(description="下一步备考建议（1-2句）")
```

| 行号 | 代码 | 说明 |
|:----:|:-----|:-----|
| 37 | `class InterviewReport(BaseModel):` | 报告顶层模型 |
| 39 | `dimensions: list[DimensionEval]` | 五维度评估列表 |
| 40 | `overall_score: int` | 加权综合分（技术深度 35% + 项目经验 25% + 表达逻辑 20% + 抗压 10% + 整体印象 10%） |
| 41 | `strengths: list[str]` | 2-3 条真实优势 |
| 42 | `improvements: list[str]` | 2-3 条改进方向 |
| 43 | `overall_comment: str` | 综合评语 |
| 44 | `recommended_topics: list[str]` | 3-5 个建议复习知识点 |
| 45 | `next_step_advice: str` | 下一步备考建议 |

---

### 3.3 `ReportWrapper`：顶层包装（第 48~50 行）

```python
# state.py 第 48~50 行
class ReportWrapper(BaseModel):
    """InterviewReport 顶层包装（with_structured_output 需要顶层对象）"""
    report: InterviewReport
```

**为什么需要 `ReportWrapper`？** `get_structured_llm` 绑定的 Pydantic schema 必须是一个顶层对象。`ReportWrapper` 作为一层包装，确保 `with_structured_output` 能正确解析。

---

## 四、`InterviewState`：完整 State（第 53~98 行）

```python
# state.py 第 53~98 行
class InterviewState(TypedDict):
    """模拟面试 Agent 完整 State（22 个字段，跨轮由 MemorySaver 持久化）"""

    # ── 请求上下文 ─────────────────────────────────────────────
    messages:         Annotated[list[BaseMessage], add_messages]
    student_id:       str
    tenant_id:        str
    session_id:       str
    target_position:  str

    # ── 简历联动数据（从简历审查结果读取，可为空）──────────────
    resume_review_id: Optional[str]
    resume_projects:  list[dict]
    resume_skills:    list[str]

    # ── 面试阶段控制 ───────────────────────────────────────────
    current_stage:    str
    stage_turn_count: int
    total_turn_count: int
    max_turns:        int

    # ── 题目管理 ───────────────────────────────────────────────
    question_bank:    list[dict]
    current_question: Optional[dict]
    projects_asked:   list[str]

    # ── 回答质量追踪 ───────────────────────────────────────────
    last_answer_quality: str
    followup_count:      int

    # ── 记忆管理 ───────────────────────────────────────────────
    existing_summary:    Optional[str]
    should_summarize:    bool

    # ── 评估结果（面试结束后填充）────────────────────────────
    report:              Optional[dict]

    # ── 降级标记 ────────────────────────────────────────────────
    fallback_used:       bool
    structured_output:   Optional[dict]
```

### 4.1 字段分组精读

| 分组 | 字段 | 类型 | 用途 |
|:-----|:-----|:-----|:-----|
| **请求上下文** | `messages` | `Annotated[list[BaseMessage], add_messages]` | 对话消息；`add_messages` 让新消息自动追加而非覆盖 |
| | `student_id` | `str` | 学员 ID（JWT 解析） |
| | `tenant_id` | `str` | 租户 ID（多租户隔离） |
| | `session_id` | `str` | 会话 ID（API 层生成） |
| | `target_position` | `str` | 目标岗位，决定出题方向 |
| **简历联动** | `resume_review_id` | `Optional[str]` | 关联的简历审查记录 ID；非空才做项目深挖 |
| | `resume_projects` | `list[dict]` | 简历项目列表（名称/角色/技术栈/亮点） |
| | `resume_skills` | `list[str]` | 简历技能列表 |
| **阶段控制** | `current_stage` | `str` | 当前阶段，`InterviewStage` 枚举值 |
| | `stage_turn_count` | `int` | 当前阶段已进行的轮数 |
| | `total_turn_count` | `int` | 总轮数（跨阶段累计） |
| | `max_turns` | `int` | 轮数上限，默认 40 |
| **题目管理** | `question_bank` | `list[dict]` | 题库；每项 `{id, content, difficulty, tags, asked}` |
| | `current_question` | `Optional[dict]` | 当前正在问/追问的题 |
| | `projects_asked` | `list[str]` | 已深挖过的项目名称列表 |
| **质量追踪** | `last_answer_quality` | `str` | 上条回答质量标签，`AnswerQuality` 枚举值 |
| | `followup_count` | `int` | 当前问题已追问次数（上限 2） |
| **记忆管理** | `existing_summary` | `Optional[str]` | 历史对话摘要（DB 持久化，长对话压缩用） |
| | `should_summarize` | `bool` | 本轮是否需要触发摘要压缩 |
| **评估结果** | `report` | `Optional[dict]` | 五维度报告，`InterviewReport.model_dump()` 结果 |
| **降级** | `fallback_used` | `bool` | 是否用过兜底逻辑 |
| | `structured_output` | `Optional[dict]` | 供 API 层直接读取的结构化结果 |

### 4.2 `add_messages` 的作用

```python
messages: Annotated[list[BaseMessage], add_messages]
```

`add_messages` 是 LangGraph 的 reducer 注解。不写 reducer 时，TypedDict 的字段默认**覆盖**（新值替换旧值）。但 `messages` 需要**追加**——每轮对话新增一条 HumanMessage 和一条 AIMessage，而不是覆盖上一轮的消息。

---

## 五、调用方式与依赖

### 5.1 谁引用 state 模块？

| 消费者 | 用途 |
|--------|------|
| `prompts.py` | 引用 `InterviewStage`、`AnswerQuality`（类型提示） |
| `nodes.py` | 引用所有模型和枚举（构建 State 更新） |
| `graph.py` | 引用 `InterviewState`（StateGraph 类型参数）、`InterviewStage`（条件路由） |
| `interview.py` | 引用 `InterviewStage`（判断面试是否结束） |

### 5.2 依赖的外部资源

| 依赖 | 用途 |
|:-----|:-----|
| `langgraph.graph.message.add_messages` | `messages` 字段的 reducer |
| `langchain_core.messages.BaseMessage` | 消息基类 |
| `pydantic.BaseModel` | 数据校验模型 |
| `typing_extensions.TypedDict` | State 定义 |

---

## 六、`★` 设计亮点总结

`★ Insight ─────────────────────────────────────`
**22 个字段不是一次填满的，而是逐轮渐进的**：
- 首轮（`load_context_node`）：填充 `question_bank`、`current_stage`、`resume_projects` 等初始化字段
- 每轮（`evaluate_answer_node`）：更新 `last_answer_quality`、`total_turn_count`、`stage_turn_count`
- 每轮（`generate_response_node`）：更新 `current_question`、`followup_count`、`projects_asked`
- 结束时（`generate_report_node`）：填充 `report`
- 这种"渐进填充"模式与 QA/Exam Agent 的"一次性填充"完全不同，是因为面试是多轮交互而非单次执行
`─────────────────────────────────────────────────`

`★ Insight ─────────────────────────────────────`
**`AnswerQuality` 四等级驱动三种分支行为**：
- `EXCELLENT` → `followup` 追问路径（深入考察）
- `ADEQUATE` → 正常换题路径（继续覆盖知识点）
- `WEAK` / `NO_ANSWER` → 跳过路径（不打击学员信心）
- 这种设计把"面试官策略"从代码逻辑中抽离为数据驱动，`generate_response_node` 只需读取 `last_answer_quality` 即可决定行为，无需硬编码判断规则
`─────────────────────────────────────────────────`

`★ Insight ─────────────────────────────────────`
**`resume_review_id` 是 Agent 间联动的桥梁**：
- 第 4 章简历审查 Agent 产出 `resume_reviews` 表中的记录
- 第 7 章面试 Agent 通过 `resume_review_id` 读取该记录的项目列表和技能标签
- 如果 `resume_review_id` 为空，则跳过项目深挖环节，直接走"无简历联动"的兜底路径
- 这是 EduAgent 系统中**两个独立 Agent 之间数据共享**的唯一场景
`─────────────────────────────────────────────────`