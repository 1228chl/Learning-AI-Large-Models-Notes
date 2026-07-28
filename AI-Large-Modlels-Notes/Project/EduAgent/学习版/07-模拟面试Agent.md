# 第七章 模拟面试 Agent — 学习版

> 本文档从原版《07-模拟面试Agent.md》中提取核心知识点，按照"状态机设计→节点实现→装配接口"主线编排学习顺序。

---

## 学习路线图

```
第一梯队：状态机设计（先理解核心模式）
  ├── ① 状态机设计模式 ← 为什么需要状态机、四个阶段、图拓扑
  └── ② State 与枚举   ← InterviewStage、AnswerQuality、22 字段 State

第二梯队：节点实现（按执行顺序）
  ├── ③ Prompts        ← 各阶段独立 Prompt
  ├── ④ load_context   ← 首轮初始化题库/简历
  ├── ⑤ check_stage    ← 纯逻辑阶段推进（不调 LLM）
  ├── ⑥ evaluate_answer ← Think Tool 评估回答质量
  ├── ⑦ generate_response ← 按阶段生成面试官回应
  ├── ⑧ generate_report  ← FINISHED 时生成五维度报告
  └── ⑨ save_report/save_memory ← 持久化+摘要压缩

第三梯队：装配与接口
  ├── ⑩ 图装配         ← 条件边 + MemorySaver
  └── ⑪ HTTP 接口      ← 开始/对话/历史/报告/流式
```

---

## 第一梯队：状态机设计

---

### ① 状态机设计模式

#### 学习目标

- 模拟面试为什么需要状态机？三个要素是什么？
- 四个面试阶段分别是什么？每个阶段的推进条件？
- 追问规则是什么？强制终止条件？
- 图拓扑结构？

#### 核心知识点

**为什么需要状态机**：普通多轮对话每轮做同样的事，但模拟面试天然分阶段——热身→技术基础→项目深挖→反问收尾。阶段判断由代码逻辑管理，不靠 LLM 推断。

**三个要素**：状态（State: WARMUP/TECH_BASE/PROJECT/CLOSING/FINISHED）+ 转移条件（轮数/题数/学员输入）+ 当前状态记录（current_stage 字段）。

**四个面试阶段**

```
WARMUP（热身）—— 破冰自我介绍，最少1轮最多4轮
  → TECH_BASE（技术基础）—— 题库问答，至少6轮+8道题
    → PROJECT（项目深挖）—— 简历项目逐一深挖，至少2轮
      → CLOSING（反问收尾）—— 邀请学员提问，至少2轮
        → FINISHED（终态）—— 生成五维度报告+持久化
```

**追问规则**：EXCELLENT → 最多追问 2 次；WEAK/NO_ANSWER → 换题。

**强制终止**：总轮数 ≥ 38 或学员说"结束面试"，直接跳 FINISHED。

**双轨考察**

| 轨道 | 问题来源 | 考察重点 | 对应阶段 |
|------|---------|---------|---------|
| 技术基础轨 | LLM 动态出题 + DB 题库 | 知识点掌握深度 | TECH_BASE |
| 简历项目轨 | 读取简历项目数据 | 实际工程能力 | PROJECT |

**图拓扑**

```
START → load_context（每轮必走）→ check_stage（纯逻辑判断）
  ├── current_stage != FINISHED → evaluate_answer → generate_response
  └── current_stage == FINISHED → generate_report → save_report
  → save_memory（两条路径汇合）→ END
```

**关键设计**：唯一分支点 `check_stage`，两条路径最终汇合到 `save_memory`，摘要持久化逻辑只需写一次。

---

### ② State 与枚举

#### 学习目标

- 两个枚举分别是什么？如何驱动追问逻辑？
- InterviewState 的 22 字段分哪 7 组？
- 五维度报告权重？

#### 核心知识点

**InterviewStage 枚举**

```python
WARMUP    = "warmup"      # 热身：邀请自我介绍
TECH_BASE = "tech_base"   # 技术基础：题库问答
PROJECT   = "project"     # 项目深挖：针对简历项目追问
CLOSING   = "closing"     # 反问收尾：让学员提问
FINISHED  = "finished"    # 终态：触发报告生成
```

**AnswerQuality 枚举**

| 标签 | 含义 | TECH_BASE 行为 | PROJECT 行为 |
|------|------|---------------|-------------|
| EXCELLENT | 有技术细节/原理 | 追问（最多 2 次） | 追问 |
| ADEQUATE | 方向正确缺乏深度 | 换题 | 追问 |
| WEAK | 方向偏差 | 换题 | 换题 |
| NO_ANSWER | 未作答 | 提示思路后换题 | 提示思路后换题 |

**InterviewState（22 字段，7 组）**：

| 分组 | 说明 |
|------|------|
| 请求上下文 | student_id, session_id, messages 等 |
| 简历联动数据 | resume_data, resume_projects 等 |
| 面试阶段控制 | current_stage, stage_turn_count, total_turn_count |
| 题目管理 | question_bank, current_question, asked_questions |
| 回答质量追踪 | last_answer_quality, followup_count |
| 记忆管理 | existing_summary, should_summarize |
| 评估结果 | report, overall_score, fallback_used |

**五维度报告权重**：技术深度 35% > 项目经验 25% > 表达逻辑 20% > 抗压反应 10% > 整体印象 10%。

---

## 第二梯队：节点实现

---

### ③ Prompts

#### 核心知识点

每个阶段有独立的 Prompt：WARMUP_PROMPT、TECH_BASE_PROMPT、TECH_FOLLOWUP_PROMPT、PROJECT_PROMPT、PROJECT_FOLLOWUP_PROMPT、CLOSING_PROMPT、CLOSING_RESPONSE_PROMPT，加上 EVALUATE_ANSWER_PROMPT（评估回答质量）和 GENERATE_REPORT_PROMPT（生成报告）。

---

### ④ load_context

#### 核心知识点

首轮并行查询（`asyncio.gather`）题库和简历数据，初始化 State 字段（`current_stage=warmup`）。

**降级**：无简历时 PROJECT 改为引导学员自述项目经历。

---

### ⑤ check_stage

#### 核心知识点

**纯逻辑节点，不调 LLM**。读取轮数计数器判断是否推进到下一阶段。强制终止优先。

---

### ⑥ evaluate_answer

#### 核心知识点

**Think Tool 评估回答质量**：先让 LLM 调用"think"工具内部推理，再调用"final_answer"输出标签。Think Tool 强制 LLM 先分析再打标签，提高评估准确性。

---

### ⑦ generate_response

#### 核心知识点

**TECH_BASE 出题逻辑**：优先从未答题库选 → 匹配简历技能 → 无可用题库时 LLM 动态生成。

**追问逻辑**：仅 EXCELLENT 可追问，上限 2 次。

**换题逻辑**：WEAK/NO_ANSWER 时中性回应换题。

---

### ⑧ generate_report

#### 核心知识点

`current_stage == FINISHED` 时触发，LLM 生成五维度评估报告。

**三层结构**

```python
class DimensionEval(BaseModel):       # 单维度：dimension + score + comment + highlights + weaknesses
class InterviewReport(BaseModel):     # 五维度汇总：dimensions + overall_score + strengths + improvements
class ReportWrapper(BaseModel):       # 顶层包装：report（满足 structured_output 要求）
```

---

### ⑨ save_report / save_memory

#### 核心知识点

- 报告写入 interview_sessions 表 JSONB 字段
- 每 10 轮触发摘要压缩防止消息列表撑爆上下文
- 首轮 INSERT 创建会话记录（UPSERT ON CONFLICT thread_id）

---

## 第三梯队：装配与接口

---

### ⑩ 图装配

#### 核心知识点

7 个节点，唯一分支点 `check_stage` 条件路由（正常对话/报告生成），两条路径最终汇合到 `save_memory`。编译时传 MemorySaver 实现跨轮记忆。

---

### ⑪ HTTP 接口

| 接口 | 说明 |
|------|------|
| POST /interview/start | 开始面试，返回 session_id + 面试官开场白 |
| POST /interview/chat | 发送消息，返回回复 + 当前阶段 |
| GET /interview/history/{id} | 获取对话历史 |
| GET /interview/report/{id} | 获取五维度评估报告 |
| GET /interview/stream/{id} | SSE 流式对话 |

---

## 附录：核心设计决策总结

| 决策 | 方案 | 原因 |
|------|------|------|
| 阶段管理 | 代码逻辑（check_stage 纯逻辑节点） | 不靠 LLM 推断阶段，精确可控 |
| 追问控制 | 基于 AnswerQuality 枚举 | 质量标签驱动追问/换题，规则清晰 |
| 回答评估 | Think Tool 先推理再打标签 | 提高评估准确性，减少误判 |
| 面试报告 | 三层嵌套 Pydantic 模型 | 结构化输出，便于存储和展示 |
| 记忆管理 | MemorySaver + 摘要压缩 | 支持 20-40 轮长对话不撑爆上下文 |
| 取消流式 | SSE 直连 | 打字机效果，降低用户感知延迟 |

---

> **学习建议**：先理解"为什么需要状态机"（①），这是本章的核心教学模式。再看 State 和枚举定义（②），然后按节点顺序逐个学习（③~⑨）。重点理解 check_stage 的纯逻辑阶段推进和 evaluate_answer 的 Think Tool 评估——这是第七章区别于前几章的核心设计。