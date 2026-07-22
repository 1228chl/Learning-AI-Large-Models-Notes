# 第 7 章 模拟面试 Agent 学习笔记

## 目录

1. [7.1 模拟面试 Agent 全景 — 状态机设计模式](#71-模拟面试-agent-全景--状态机设计模式)
2. [7.2 State 与枚举](#72-state-与枚举)
3. [7.3 Prompts 全解析](#73-prompts-全解析)
4. [7.4 会话初始化与上下文加载（load_context）](#74-会话初始化与上下文加载load_context)
5. [7.5 阶段推进与状态机控制（check_stage）](#75-阶段推进与状态机控制check_stage)
6. [7.6 回答质量评估与 Think 工具（evaluate_answer）](#76-回答质量评估与-think-工具evaluate_answer)
7. [7.7-7.8 面试官回应生成（generate_response）](#77-78-面试官回应生成generate_response)
8. [7.9 面试报告生成（generate_report）](#79-面试报告生成generate_report)
9. [7.10 结果持久化与记忆保存（save_report & save_memory）](#710-结果持久化与记忆保存save_report--save_memory)
10. [7.11 图装配（graph.py）](#711-图装配graphpy)
11. [7.12 HTTP 接口（interview.py）](#712-http-接口interviewpy)
12. [7.13 端到端测试](#713-端到端测试)
13. [核心设计决策总结](#核心设计决策总结)

---

## 7.1 模拟面试 Agent 全景 — 状态机设计模式

### 7.1.1 为什么需要状态机

**核心问题**：普通多轮对话每一轮做的事情完全相同（学员提问 -> LLM 回应），但模拟面试天然是"分阶段"的——热身阶段不能问技术题，技术阶段不能问反问，每个阶段内部还有追问逻辑和轮数控制。

**状态机的核心价值**：把"现在到哪一步了"从对话内容里独立出来，由代码逻辑管理，而不是靠 LLM 推断。

**三个要素**：

| 要素 | 交通灯例子 | 面试 Agent 对应 |
|------|-----------|----------------|
| 状态（State） | 红/黄/绿 | WARMUP / TECH_BASE / PROJECT / CLOSING / FINISHED |
| 转移条件（Transition） | 计时器到点 | 问够轮数 / 题库问完 / 学员说"结束面试" |
| 当前状态记录 | 当前亮的灯 | `current_stage` 字段 |

### 7.1.2 四个面试阶段（核心状态机流程）

```python
WARMUP（热身）
  职责：破冰开场，邀请自我介绍
  推进条件：学员完成自我介绍（最少1轮，最多4轮）
  │
  ▼ 阶段切换：评价自我介绍 + 给出第一道技术题
  │
TECH_BASE（技术基础）
  职责：考察技术知识，题库问答 + 追问
  推进条件：至少6轮 且 已问过8道题（或题库问完）
  追问规则：EXCELLENT -> 最多追问2次；WEAK/NO_ANSWER -> 换题
  │
  ▼ 阶段切换：过渡语"技术基础题我们就到这里了"
  │
PROJECT（项目深挖）
  职责：针对简历项目逐一深挖（有简历联动）或引导学员描述项目
  推进条件：所有简历项目深挖完毕，或至少2轮达到上限
  │
  ▼ 阶段切换：过渡语"我这边的问题差不多都问完了"
  │
CLOSING（反问收尾）
  职责：邀请学员提问，模拟真实面试结尾
  推进条件：至少2轮（学员提问 + 面试官作答）
  │
  ▼
FINISHED（终态）
  触发：生成五维度评估报告 -> 持久化 -> 会话结束
```

**强制终止路径**（任意阶段均可触发）：总轮数 >= 38（上限 40 - 2）或学员发送"结束面试"等关键词，直接跳转 FINISHED，跳过 CLOSING。

### 7.1.3 双轨考察

| 考察轨道 | 问题来源 | 考察重点 | 对应阶段 |
|---------|---------|---------|---------|
| 技术基础轨 | LLM 动态出题 + DB 题库 | 知识点掌握深度、举一反三能力 | TECH_BASE |
| 简历项目轨 | 读取学员简历的项目数据 | 实际工程能力、项目细节理解 | PROJECT |

### 7.1.4 图拓扑

面试 Agent 是 LangGraph 状态图。每次学员发一条消息，触发一次从 START 到 END 的完整执行。

```python
START
  │
  ▼
load_context —— 每轮必走：加载历史摘要；首轮额外：初始化阶段/题库/简历联动
  │
  ▼
check_stage —— 纯逻辑，判断阶段是否推进（不调 LLM）
  │
  ├── current_stage == FINISHED ─────────────────────────┐
  │                                                       │
  │   （正常对话路径）                                     │   （报告路径）
  ▼                                                       ▼
evaluate_answer ── LLM 评估学员回答质量（EXCELLENT/     generate_report ── LLM 生成五维度报告
                   ADEQUATE/WEAK/NO_ANSWER）             │
  │                                                       ▼
  ▼                                                     save_report ─── 报告写入 DB
generate_response ─ 按当前阶段生成面试官回应               │
  │                                                       │
  └──────────────────────────┬───────────────────────────┘
                             │
                             ▼
                        save_memory ─── 触发摘要压缩（每10轮），写入DB
                             │
                             ▼
                           END
```

**关键设计要点**：

- 唯一分支点：`check_stage`（读取 `current_stage`，决定走"正常对话"还是"生成报告"路径）
- 两条路径最终汇合到 `save_memory`，摘要持久化逻辑只需写一次
- 无 interrupt：面试全程自动推进，不需要人工介入

### 7.1.5 多轮对话的 State 保持

- 平均 20-40 轮，每轮之间必须记住阶段、轮数、题库状态、简历项目、追问信息
- 靠 `MemorySaver`（in-memory checkpoint）在轮次间持久化
- 通过同一 `thread_id`（`student_{id}_session_{id}`）恢复所有字段

### 7.1.6 涉及的数据库表

**interview_sessions（面试会话记录，主表）**：

- `id`（UUID 主键）、`tenant_id`、`student_id`、`session_id`
- `thread_id`（VARCHAR UNIQUE，格式 `student_{id}_session_{id}`）
- `target_position`（目标岗位）、`resume_review_id`（关联简历，可空）
- `summary`（TEXT，历史对话摘要）、`report`（JSONB，五维度报告）
- `overall_score`（INT，0-100）、`status`（in_progress / finished）
- `finished_at`、`created_at`、`updated_at`

**interview_questions（面试题库）**：

- `id`、`content`（题目正文）、`difficulty`（easy/medium/hard）
- `tags`（JSONB，知识点标签）、`target_position`（适用岗位）
- `is_active`（是否启用）

**resume_reviews（简历审查结果，只读）**：

- `id`、`student_id`、`structured_data`（JSONB，含 projects 和 skills_list）
- `status`（done 才可用于联动）

---

## 7.2 State 与枚举

### 7.2.1 两个枚举

**InterviewStage（面试的五个阶段）**：

```python
class InterviewStage(str, Enum):
    WARMUP    = "warmup"      # 热身：邀请自我介绍
    TECH_BASE = "tech_base"   # 技术基础：题库问答
    PROJECT   = "project"     # 项目深挖：针对简历项目追问
    CLOSING   = "closing"     # 反问收尾：让学员提问
    FINISHED  = "finished"    # 终态：触发报告生成
```

**AnswerQuality（回答质量标签）**：

```python
class AnswerQuality(str, Enum):
    EXCELLENT = "excellent"   # 优秀：有技术细节/量化/原理
    ADEQUATE  = "adequate"    # 基本及格：方向对但缺深度
    WEAK      = "weak"        # 较弱：方向偏或太表面
    NO_ANSWER = "no_answer"   # 未作答：明说不知道或为空
```

**质量标签驱动追问逻辑**：

| 标签 | 含义 | TECH_BASE 行为 | PROJECT 行为 |
|------|------|---------------|-------------|
| EXCELLENT | 有技术细节/原理 | 追问（最多 2 次） | 追问 |
| ADEQUATE | 方向正确缺乏深度 | 换题 | 追问 |
| WEAK | 方向偏差 | 换题 | 换题 |
| NO_ANSWER | 未作答 | 提示思路后换题 | 提示思路后换题 |

### 7.2.2 报告 Pydantic 模型（三层结构）

```python
class DimensionEval(BaseModel):          # 第一层：单维度评估
    dimension:  str                      # 维度名称
    score:      int                      # 得分 0-100
    comment:    str                      # 1-2句评语
    highlights: list[str]                # 亮点列举
    weaknesses: list[str]                # 薄弱点列举

class InterviewReport(BaseModel):        # 第二层：五维度汇总
    dimensions:         list[DimensionEval]
    overall_score:      int              # 综合得分（加权平均）
    strengths:          list[str]         # 2-3条核心优势
    improvements:       list[str]         # 2-3条提升方向
    overall_comment:    str               # 综合评语
    recommended_topics: list[str]         # 建议复习的3-5个知识点
    next_step_advice:   str               # 下一步备考建议

class ReportWrapper(BaseModel):          # 第三层：顶层包装
    report: InterviewReport              # （满足 structured_output 要求）
```

**为什么需要 ReportWrapper**：DeepSeek 的 `with_structured_output(method="function_calling")` 要求传入的 Pydantic 模型就是 function calling 的参数结构。加一层包装确保验证稳定。

**五维度权重**（在 Prompt 中定义）：

| 维度 | 权重 | 考察点 |
|------|------|--------|
| 技术深度 | 35% | 知识掌握、概念理解、原理解释 |
| 项目经验 | 25% | 贡献清晰度、技术选型、难点解决 |
| 表达逻辑 | 20% | 条理性、STAR 结构、语言清晰度 |
| 抗压反应 | 10% | 遇到不会的题如何应对 |
| 整体印象 | 10% | 积极性、学习态度、备考程度 |

### 7.2.3 InterviewState（22 个字段，7 组）

**组 1：请求上下文**

- `messages: Annotated[list[BaseMessage], add_messages]` — 对话消息，`add_messages` 让新消息自动追加而非覆盖
- `student_id`、`tenant_id`、`session_id`、`target_position`

**组 2：简历联动数据**

- `resume_review_id: Optional[str]` — 关联简历 ID；非空才做项目深挖
- `resume_projects: list[dict]` — 简历项目列表（名称/角色/技术栈/亮点）
- `resume_skills: list[str]` — 简历技能列表

**组 3：面试阶段控制**

- `current_stage: str` — 当前阶段，InterviewStage 枚举值
- `stage_turn_count: int` — 当前阶段已进行的轮数
- `total_turn_count: int` — 总轮数（跨阶段累计）
- `max_turns: int` — 轮数上限，默认 40

**组 4：题目管理**

- `question_bank: list[dict]` — 题库；每项 {id, content, difficulty, tags, asked}
- `current_question: Optional[dict]` — 当前正在问/追问的题
- `projects_asked: list[str]` — 已深挖过的项目名称列表（防重）

**组 5：回答质量追踪**

- `last_answer_quality: str` — 上一条回答质量标签
- `followup_count: int` — 当前问题已追问次数（上限 2）

**组 6：记忆管理**

- `existing_summary: Optional[str]` — 历史对话摘要（DB 持久化）
- `should_summarize: bool` — 本轮是否需要触发摘要压缩

**组 7：评估结果 & 降级标记**

- `report: Optional[dict]` — 五维度报告
- `fallback_used: bool` — 是否用过兜底逻辑
- `structured_output: Optional[dict]` — 供 API 层直接读取的结构化结果

---

## 7.3 Prompts 全解析

### 7.3.1 Prompt 总体组织

Prompts 按使用节点分组，位于 `prompts.py` 中：

| 分组 | 对应节点 | 包含的 Prompt |
|------|---------|-------------|
| 初始化 | `load_context_node` | `GENERATE_QUESTIONS_PROMPT` |
| 阶段推进 | `check_stage_node` | 无（纯逻辑，不调 LLM） |
| 评估 | `evaluate_answer_node` | `EVALUATE_ANSWER_PROMPT`（含 Think Tool） |
| 热身 | `generate_response_node` | `WARMUP_PROMPT`、`INTRO_EVAL_TECH_FIRST_PROMPT` |
| 技术基础 | `generate_response_node` | `TECH_BASE_PROMPT`、`TECH_FOLLOWUP_PROMPT` |
| 项目深挖 | `generate_response_node` | `PROJECT_PROMPT`、`PROJECT_FOLLOWUP_PROMPT` |
| 反问收尾 | `generate_response_node` | `CLOSING_PROMPT`、`CLOSING_RESPONSE_PROMPT` |
| 报告 | `generate_report_node` | `GENERATE_REPORT_PROMPT` |
| 记忆 | `save_memory_node` | `SUMMARIZE_PROMPT` |

### 7.3.2 关键 Prompt 设计要点

**WARMUP_PROMPT（开场语）**：

- 系统角色：你是一位专业的 IT 技术面试官
- 输入：目标岗位、学员技能、历史摘要
- 输出：面试官开场白（破冰语 + 邀请自我介绍）

**INTRO_EVAL_TECH_FIRST_PROMPT（阶段过渡）**：

- 当 WARMUP -> TECH_BASE 时使用
- 三合一任务：评价自我介绍 + 给出第一道技术题 + 邀请回答
- 一次性输出，不拆分多次调用

**TECH_BASE_PROMPT（技术出题）**：

- 输入：目标岗位、未答题库、简历技能、已问过的题（防重复）
- 要求：优先从未答题库中选题，题库用尽后 LLM 动态出题
- 输出：技术问题 + 邀请回答

**TECH_FOLLOWUP_PROMPT（技术追问）**：

- 输入：原始问题、学员回答、追问次数
- 条件：仅当 `last_answer_quality == EXCELLENT` 且 `followup_count < 2` 时触发
- 输出：追问（深挖技术细节）

**EVALUATE_ANSWER_PROMPT（评估回答）**：

- 输入：当前问题、学员回答
- 输出：EXCELLENT / ADEQUATE / WEAK / NO_ANSWER
- 判断依据：技术细节/量化数据/原理解释/结构条理

**GENERATE_REPORT_PROMPT（生成报告）**：

- 输入：全部对话历史
- 输出：结构化的 ReportWrapper（含五维度评估）
- 要求：全面评估，给出具体建议

---

## 7.4 会话初始化与上下文加载（load_context）

### 7.4.1 节点职责

- **首轮**：面试初始化的核心——并行查询数据库、加载题库、读取简历、调用 LLM 出题
- **非首轮**：从 DB 加载历史摘要（如已存在），注入 State 供后续节点使用

### 7.4.2 首轮初始化流程

```python
首轮 load_context_node 执行流程：

1. 并行查询（asyncio.gather）：
   ├── 查 interview_questions 表：按 target_position 筛选 active 题库
   └── 查 resume_reviews 表：按 resume_review_id 取 structured_data

2. 初始化 State 字段：
   ├── current_stage = "warmup"
   ├── stage_turn_count = 0
   ├── total_turn_count = 0
   ├── question_bank = 从 DB 查到的题库列表（每项含 asked=False）
   ├── resume_projects = 从简历取的项目列表
   └── resume_skills = 从简历取的技能列表

3. 调用 LLM（GENERATE_QUESTIONS_PROMPT）：
   └── 根据 target_position + resume_skills 动态生成补充题目
       └── 合并到 question_bank 中

4. 返回更新后的 State 字段
```

### 7.4.3 关键设计

- **并行查询**：题库和简历是独立的两个查询，用 `asyncio.gather` 并行执行，减少首轮延迟
- **降级策略**：如果 `resume_review_id` 为空（没有简历审查记录），`resume_projects` 和 `resume_skills` 为空列表，PROJECT 阶段改为引导学员自述项目经历
- **题库问过标记**：`question_bank` 中的每道题用 `asked: bool` 字段标记，已问过的题不再重复
- **出题双来源**：首选 LLM 动态生成（根据目标岗位实时出题），兜底用题库

---

## 7.5 阶段推进与状态机控制（check_stage）

### 7.5.1 节点职责

**纯逻辑节点，不调用 LLM**。每轮读取 `current_stage` 和轮数计数器，判断是否推进到下一阶段，更新 `current_stage` 和 `stage_turn_count`。

### 7.5.2 阶段推进逻辑

```python
check_stage_node 伪代码：

def check_stage_node(state) -> dict:
    stage = state["current_stage"]
    total = state["total_turn_count"]
    max_turns = state["max_turns"]

    # 强制终止条件（优先级最高）
    if total >= max_turns - 2:
        return {"current_stage": "finished"}

    if stage == "warmup":
        if state["stage_turn_count"] >= 1:  # 最少1轮，最多4轮
            # 检查学员是否完成了自我介绍
            if 学员已完成自我介绍:
                return {"current_stage": "tech_base", "stage_turn_count": 0}
            elif state["stage_turn_count"] >= 4:
                return {"current_stage": "tech_base", "stage_turn_count": 0}

    elif stage == "tech_base":
        if state["stage_turn_count"] >= 6 and 已问过8道题:
            return {"current_stage": "project", "stage_turn_count": 0}
        elif state["stage_turn_count"] >= 14:  # 最大14轮强制切换
            return {"current_stage": "project", "stage_turn_count": 0}

    elif stage == "project":
        if 所有简历项目已深挖 or (state["stage_turn_count"] >= 2 and 达到上限):
            return {"current_stage": "closing", "stage_turn_count": 0}

    elif stage == "closing":
        if state["stage_turn_count"] >= 2:
            return {"current_stage": "finished", "stage_turn_count": 0}

    # 不推进：stage_turn_count + 1
    return {"stage_turn_count": state["stage_turn_count"] + 1,
            "total_turn_count": total + 1}
```

### 7.5.3 关键设计

- **纯逻辑**：所有判断基于轮数计数器和状态字段，不依赖 LLM，性能高且行为确定
- **强制终止**：总轮数接近上限（`max_turns - 2`）时跳过所有阶段判断直接结束
- **轮数上限保护**：默认 40 轮，防止无限对话
- **增量计数**：`stage_turn_count` 和 `total_turn_count` 分开维护，方便阶段级和全局的控制

---

## 7.6 回答质量评估与 Think 工具（evaluate_answer）

### 7.6.1 节点职责

每轮评估学员上一条回答的质量，打 EXCELLENT/ADEQUATE/WEAK/NO_ANSWER 标签，驱动后续的追问/换题决策。

### 7.6.2 Think Tool 机制

**Think Tool 是什么**：一个特殊的"思考工具"，让 LLM 在输出最终评估之前，先进行内部推理思考。LLM 调用 `think` 工具（不对外可见），写下推理过程，再调用 `final_answer` 输出最终结果。

**为什么需要 Think Tool**：

- 评估回答质量是一个需要综合判断的任务（技术准确性、表达完整性、逻辑条理）
- 直接让 LLM 输出标签容易"拍脑袋"——看到"HashMap"就认为答得好
- Think Tool 强制 LLM 先分析再打标签，提高评估准确性和一致性

**执行流程**：

```python
evaluate_answer_node 执行流程：

1. 读取状态：
   ├── current_question（当前问题）
   ├── 学员最新一条消息（HumanMessage）
   └── current_stage（不同阶段评估侧重点不同）

2. 构建 Prompt：
   └── EVALUATE_ANSWER_PROMPT.format(
           question=current_question["content"],
           answer=学员回答,
           stage=current_stage
       )

3. 调用 LLM（with Think Tool）：
   ├── Step 1: LLM 调用 think 工具
   │   └── 写下推理过程：技术点是否准确？有无量化？结构是否清晰？
   ├── Step 2: LLM 调用 final_answer 工具
   │   └── 输出 { "quality": "excellent", "reason": "..." }
   │
   └── 解析 final_answer 输出

4. 更新 State：
   ├── last_answer_quality = 评估结果
   ├── 如果当前有追问进行中：followup_count += 1
   └── total_turn_count += 1
```

### 7.6.3 评估标准细节

| 标准 | EXCELLENT | ADEQUATE | WEAK | NO_ANSWER |
|------|-----------|----------|------|-----------|
| 技术准确性 | 完全正确，有原理说明 | 基本正确 | 有偏差 | N/A |
| 量化数据 | 有具体数据/指标 | 提到但模糊 | 无 | N/A |
| 结构条理 | 总分总/STAR 清晰 | 有基本框架 | 散乱 | N/A |
| 内容完整性 | 覆盖问题所有要点 | 覆盖主要要点 | 遗漏关键点 | 未作答 |

---

## 7.7-7.8 面试官回应生成（generate_response）

### 7.7.1 节点职责

按当前阶段生成面试官回应，涵盖四个阶段分支：WARMUP、TECH_BASE、PROJECT、CLOSING。

### 7.7.2 WARMUP 阶段回应

**两种场景**：

1. **开场（第一轮）**：用 WARMUP_PROMPT 生成破冰语 + 邀请自我介绍
2. **热身中（后续轮次）**：根据学员自我介绍内容，给出鼓励/引导，直到 check_stage 推进

**阶段切换时**：用 INTRO_EVAL_TECH_FIRST_PROMPT 一次性完成"评价自我介绍 + 出第一道技术题"——不拆分成两次调用，减少 LLM 调用次数。

### 7.7.3 TECH_BASE 阶段回应

**出题逻辑**：

1. 从 `question_bank` 中筛选 `asked=False` 的题目
2. 优先选择与 `resume_skills` 匹配的题目
3. 无可用题库时，由 LLM 动态生成
4. 标记该题 `asked=True`

**追问逻辑**（仅当 `last_answer_quality == EXCELLENT`）：

1. 用 TECH_FOLLOWUP_PROMPT 生成追问
2. `followup_count += 1`
3. 追问上限 2 次
4. 超过上限或质量不够 -> 换题

**换题逻辑**（WEAK/NO_ANSWER）：

- 给出中性回应（"好的，我们换个话题"）
- 选下一道题
- 不追加评价，避免打击学员

### 7.7.4 PROJECT 阶段回应

**简历联动**：

- 有 `resume_projects` 时：从简历项目中选一个未深挖的，用 PROJECT_PROMPT 生成针对性问题
- 无简历数据时：引导学员自述项目经历

**追问门槛**：低于 TECH_BASE 阶段。EXCELLENT 或 ADEQUATE 均可追问，因为项目是学员自己做的，即使描述不够精准也值得继续深挖。

**防重复**：`projects_asked` 列表记录已深挖过的项目名，避免重复。

### 7.7.5 CLOSING 阶段回应

- 用 CLOSING_PROMPT 邀请学员提问（"你有什么想问我的吗？"）
- 学员提问后，用 CLOSING_RESPONSE_PROMPT 生成面试官回答
- 至少 2 轮后由 check_stage 推进到 FINISHED

---

## 7.9 面试报告生成（generate_report）

### 7.9.1 节点职责

当 `current_stage == FINISHED` 时触发，汇总全程对话，调用 LLM 生成五维度评估报告。

### 7.9.2 执行流程

```python
generate_report_node 执行流程：

1. 读取状态：
   ├── messages（全部对话历史）
   ├── question_bank（所有题目及回答）
   └── current_stage == "finished"（确认是终态）

2. 构建 Prompt：
   └── GENERATE_REPORT_PROMPT.format(
           messages=全部对话,
           question_history=出题记录
       )

3. 调用 LLM（with_structured_output，模型=ReportWrapper）：
   └── structured_llm = get_structured_llm("interview", ReportWrapper)
       result: ReportWrapper = await structured_llm.ainvoke([...])
       report_dict = result.report.model_dump()

4. 更新 State：
   ├── report = report_dict
   ├── structured_output = report_dict
   └── fallback_used = False（如果成功）

5. 兜底：如果 LLM 调用失败
   ├── fallback_used = True
   └── 生成基础报告模板（各维度默认 60 分）
```

### 7.9.3 报告字段说明

最终写入 `interview_sessions.report`（JSONB 字段）：

```json
{
  "dimensions": [
    {"dimension": "技术深度", "score": 82, "comment": "...", "highlights": [...], "weaknesses": [...]},
    {"dimension": "项目经验", "score": 78, ...},
    {"dimension": "表达逻辑", "score": 75, ...},
    {"dimension": "抗压反应", "score": 70, ...},
    {"dimension": "整体印象", "score": 77, ...}
  ],
  "overall_score": 78,
  "strengths": ["RAG 流程理解清晰", "项目有量化数据支撑"],
  "improvements": ["补强自回归语言模型原理", "加强抗压临场应变"],
  "overall_comment": "整体达到初级 AI 开发岗要求",
  "recommended_topics": ["自回归生成", "LoRA 原理", "向量检索"],
  "next_step_advice": "针对薄弱知识点系统复习后，1-2周内再次模拟面试"
}
```

---

## 7.10 结果持久化与记忆保存（save_report & save_memory）

### 7.10.1 save_report 节点

**职责**：将生成的报告写入 `interview_sessions` 表。

**执行流程**：

```python
1. 读取 state["report"]（五维度报告 dict）
2. 计算 overall_score = 各维度加权平均（或取报告中的值）
3. 执行 SQL UPDATE：
   UPDATE interview_sessions
   SET report = :report_json,
       overall_score = :score,
       status = 'finished',
       finished_at = NOW()
   WHERE session_id = :session_id
4. 返回空 dict（不更新 State）
```

**关键设计**：

- 使用 `WHERE session_id = :session_id` 精确匹配行
- 同时更新 `status` 为 `finished` 和 `finished_at` 时间戳
- 报告以 JSONB 格式存储，前端可直接读取渲染雷达图

### 7.10.2 save_memory 节点

**职责**：每 10 轮触发一次摘要压缩，防止消息列表撑爆上下文。同时负责首轮在 `interview_sessions` 表创建会话记录。

**执行流程**：

```python
save_memory_node 执行流程：

1. 检查 should_summarize 标记：
   └── 如果 should_summarize == False:
       仅做首轮 INSERT（创建会话记录）
       返回

2. 如果 should_summarize == True（每10轮触发）：
   ├── 调用 LLM（SUMMARIZE_PROMPT）：
   │   └── 输入：existing_summary + 最近10轮对话
   │       输出：新的摘要文本
   │
   ├── 执行 UPSERT（ON CONFLICT thread_id）：
   │   UPDATE interview_sessions
   │   SET summary = :new_summary
   │   WHERE thread_id = :thread_id
   │   （如果不存在则 INSERT）
   │
   └── 更新 State：
       ├── existing_summary = new_summary
       └── should_summarize = False

3. 如果 state["messages"] 超过 30 条：
   └── 截断 messages，保留最近 20 条 + 系统消息
```

**关键设计**：

- **UPSERT 机制**：使用 `ON CONFLICT (thread_id)` 实现插入或更新，一条语句处理首次创建和后续更新
- **10 轮触发**：`should_summarize` 在 `total_turn_count % 10 == 0` 时设为 True
- **消息截断**：防止 messages 列表无限增长，保留最近 20 条 + 系统消息，早期内容通过摘要保留
- **首轮 INSERT**：在 `save_memory_node` 中创建 `interview_sessions` 记录，而不是在 `load_context_node` 中（职责分离）

---

## 7.11 图装配（graph.py）

### 7.11.1 图结构定义

```python
# backend/agents/interview/graph.py

from langgraph.graph import StateGraph, START, END
from backend.agents.interview.state import InterviewState
from backend.agents.interview.nodes import (
    load_context_node,
    check_stage_node,
    evaluate_answer_node,
    generate_response_node,
    generate_report_node,
    save_report_node,
    save_memory_node,
)

# 创建图
graph = StateGraph(InterviewState)

# 注册节点
graph.add_node("load_context", load_context_node)
graph.add_node("check_stage", check_stage_node)
graph.add_node("evaluate_answer", evaluate_answer_node)
graph.add_node("generate_response", generate_response_node)
graph.add_node("generate_report", generate_report_node)
graph.add_node("save_report", save_report_node)
graph.add_node("save_memory", save_memory_node)

# 注册边
graph.add_edge(START, "load_context")
graph.add_edge("load_context", "check_stage")

# 条件路由（唯一分支点）
graph.add_conditional_edges(
    "check_stage",
    router,  # 读取 current_stage，返回下一个节点名
    {
        "evaluate_answer": "evaluate_answer",  # 正常对话路径
        "generate_report": "generate_report",  # 报告生成路径
    }
)

# 正常对话路径
graph.add_edge("evaluate_answer", "generate_response")
graph.add_edge("generate_response", "save_memory")

# 报告生成路径
graph.add_edge("generate_report", "save_report")
graph.add_edge("save_report", "save_memory")

# 最终汇合
graph.add_edge("save_memory", END)

# 编译
compiled_graph = graph.compile(checkpointer=MemorySaver())
```

### 7.11.2 路由函数

```python
def router(state: InterviewState) -> str:
    """条件路由：根据当前阶段决定走哪条路径"""
    if state["current_stage"] == "finished":
        return "generate_report"
    return "evaluate_answer"
```

### 7.11.3 与简历 Agent 的数据接口

```python
第1步：Resume Agent
  save_results_node 写库 -> structured_output["review_id"] = "uuid-xxx"
           │
           │ Pipeline 上下文传递（orchestrator.py）
           ▼
  current_context["resume_review_id"] = "uuid-xxx"
           │
           ▼
第2步：Interview Agent
  initial_state = {
      "resume_review_id": "uuid-xxx",  ← 通过 **request.context 平铺进来
  }
           │
           ▼
  load_context_node 首轮查 resume_reviews 表
  -> resume_projects / resume_skills 注入 State
  -> PROJECT 阶段能问出针对性问题
```

### 7.11.4 关键设计要点

- **MemorySaver**：编译时传入 `checkpointer=MemorySaver()`，所有 State 字段在轮次间自动持久化
- **单分支点**：只有 `check_stage` 一个条件路由点，逻辑清晰，易于调试
- **汇合点**：两条路径最终都走到 `save_memory`，避免重复写持久化逻辑
- **无中断**：面试全程自动，不需要人工介入（与第 6 章试卷批改的 HitL 形成对比）

---

## 7.12 HTTP 接口（interview.py）

### 7.12.1 接口总览

| 方法 | 路径 | 功能 | 请求体 |
|------|------|------|--------|
| POST | `/api/v1/interview/start` | 开始面试 | `{student_id, tenant_id, target_position, resume_review_id?}` |
| POST | `/api/v1/interview/chat` | 发送消息 | `{session_id, message}` |
| GET | `/api/v1/interview/history/{session_id}` | 获取历史 | 路径参数 |
| GET | `/api/v1/interview/report/{session_id}` | 获取报告 | 路径参数 |
| GET | `/api/v1/interview/stream/{session_id}` | SSE 流式 | 路径参数 |

### 7.12.2 接口详细说明

**POST /api/v1/interview/start — 开始面试**：

- 生成 `session_id`（UUID）
- 生成 `thread_id`（格式 `student_{id}_session_{id}`）
- 在 `interview_sessions` 表 INSERT 一行（status = 'in_progress'）
- 构造初始 State，调用 `compiled_graph.ainvoke()`
- 返回 `{session_id, interviewer_message}`

**POST /api/v1/interview/chat — 发送消息**：

- 接收学员消息
- 用 `session_id` 查询 `thread_id`
- 构造 `HumanMessage`，调用 `compiled_graph.ainvoke()`（传入 `config["thread_id"]`）
- 从 State 中提取面试官最后一条消息返回
- 返回 `{reply, current_stage}`

**GET /api/v1/interview/history/{session_id} — 获取历史**：

- 查询 `interview_sessions` 表获取会话信息
- 从 State 中提取 messages 列表
- 返回完整对话历史（用于前端展示）

**GET /api/v1/interview/report/{session_id} — 获取报告**：

- 查询 `interview_sessions.report` 字段
- 如果 status != 'finished'，返回 400（报告尚未生成）
- 返回五维度评估报告 JSON

**GET /api/v1/interview/stream/{session_id} — SSE 流式**：

- 使用 Server-Sent Events 实现打字机效果
- 流式返回面试官生成的消息内容
- 每轮返回一个 SSE event，包含 `{type: "token", content: "..."}`

### 7.12.3 认证与依赖注入

- 所有接口通过 `get_current_user` 依赖注入验证 JWT Token
- 自动从 Token 中提取 `tenant_id` 和 `user_id`
- 多租户隔离：查询时始终带 `tenant_id` 条件

---

## 7.13 端到端测试

### 7.13.1 测试策略

| 测试层级 | 测试内容 | 运行方式 |
|---------|---------|---------|
| 单元测试 | 各节点独立逻辑（纯函数） | `python scripts/manual_tests/itv_07_02_state.py` |
| 节点测试 | 单节点功能（需 DB + LLM） | `python backend/agents/interview/nodes.py` |
| 接口测试 | HTTP API 功能 | `pytest tests/interview/test_api.py` |
| 端到端测试 | 完整面试流程 | `python scripts/manual_tests/orch_08_pipeline_job.py` |

### 7.13.2 端到端测试流程

```python
端到端测试模拟完整面试流程：

1. 准备阶段
   ├── 创建测试学员（test_student_id = "test_student_001"）
   ├── 准备测试简历数据（resume_review_id）
   └── 设置目标岗位（"AI大模型开发工程师"）

2. 启动面试
   ├── POST /api/v1/interview/start
   └── 验证：返回 session_id，面试官开场白不为空

3. 多轮对话（模拟 20-40 轮）
   ├── 学员自我介绍 -> 技术问答 -> 项目深挖 -> 反问
   ├── 每轮 POST /api/v1/interview/chat
   └── 验证：current_stage 随推进变化，回复不为空

4. 结束面试
   ├── 发送"结束面试"关键词
   └── 验证：current_stage == "finished"，report 已生成

5. 验证报告
   ├── GET /api/v1/interview/report/{session_id}
   └── 验证：overall_score 在 0-100 范围内，五维度齐全

6. Pipeline 联调（第8章）
   └── python scripts/manual_tests/orch_08_pipeline_job.py
```

### 7.13.3 测试夹具（itv_fixtures.py）

共享 fixture 贯穿全章所有测试，包含：

- `base_state()`：构造基础 InterviewState
- `RESUME_PROJECTS`：李明简历项目数据
- `RESUME_SKILLS`：李明技能列表
- `load_env()`：加载环境变量

### 7.13.4 测试命令

```bash
# 激活环境
conda activate edu_agent

# 独立节点测试
python backend/agents/interview/nodes.py

# 各节单元测试
python scripts/manual_tests/itv_07_02_state.py
python scripts/manual_tests/itv_07_03_prompts.py
python scripts/manual_tests/itv_07_04_load_context.py
python scripts/manual_tests/itv_07_05_check_stage.py
python scripts/manual_tests/itv_07_06_evaluate_answer.py
python scripts/manual_tests/itv_07_07_08_generate_response.py
python scripts/manual_tests/itv_07_09_generate_report.py
python scripts/manual_tests/itv_07_10_save_report.py
python scripts/manual_tests/itv_07_11_graph.py

# 接口测试
pytest tests/interview/test_api.py -v

# Pipeline 联调（第8章）
python scripts/manual_tests/orch_08_pipeline_job.py
```

---

## 核心设计决策总结

| 设计决策 | 原因 |
|---------|------|
| **状态机驱动** | 把"阶段判断"从 LLM 手里拿回来，交给代码逻辑，行为可控可维护 |
| **双轨出题** | LLM 动态出题保证针对性，题库兜底保证稳定性，简历联动保证个性化 |
| **`resume_review_id` 接口** | 与简历 Agent 解耦：只读数据库，不依赖简历 Agent 的运行时 |
| **无 HitL interrupt** | 面试全程自动，学员体验流畅；与第 6 章试卷批改（需教师确认）形成对比 |
| **MemorySaver 跨轮保持** | 22 个字段跨 20-40 轮持久化，代码只需 `ainvoke` + 同一 `thread_id` |
| **Think Tool 前置评估** | 强制 LLM 先推理再打标签，提高回答质量评估的准确性和一致性 |
| **三层报告结构** | `DimensionEval` -> `InterviewReport` -> `ReportWrapper`，满足 structured_output 要求，前端可直接渲染雷达图 |
| **save_memory UPSERT** | `ON CONFLICT (thread_id)` 一条语句处理首次创建和后续更新，避免先查后改 |
| **单分支点图拓扑** | 只有 `check_stage` 一个条件路由，逻辑清晰，易于调试和扩展 |
| **并行查询初始化** | `asyncio.gather` 并行查题库和简历，减少首轮延迟 |

### 文件清单

| 节次 | 文件 | 状态 |
|------|------|------|
| 7.1 | 全景概览 | 阅读 |
| 7.2 | `backend/agents/interview/state.py` | 新建 |
| 7.3 | `backend/agents/interview/prompts.py` | 新建 |
| 7.4-7.10 | `backend/agents/interview/nodes.py` | **自实战实现** |
| 7.11 | `backend/agents/interview/graph.py` | 新建 |
| 7.12 | `backend/api/routes/interview.py` | 新建 |
| 7.13 | 端到端测试 | 验证 |

### 自实战实现顺序建议

```python
1. load_context_node   ← 先跑通首轮初始化（并行查询 + 题库加载）
2. check_stage_node    ← 纯逻辑，无 LLM，最容易上手
3. evaluate_answer_node ← Think 前置 + 质量分类
4. generate_response_node ← 四个阶段分支（最复杂，最后做）
5. generate_report_node + save_report_node + save_memory_node ← 收尾
```

### 与第 8 章 Pipeline 的衔接

面试 Agent 的 `resume_review_id` 接口是第 8 章 Pipeline 串联的关键：

- 简历 Agent 写库后，`structured_output["review_id"]` 通过 Pipeline 上下文传递
- Orchestrator 将 `resume_review_id` 平铺到面试 Agent 的初始 State 中
- 面试 Agent 首轮从 DB 读取简历数据，实现针对性项目深挖
- 面试报告最终写入 `interview_sessions` 表，供前端展示
