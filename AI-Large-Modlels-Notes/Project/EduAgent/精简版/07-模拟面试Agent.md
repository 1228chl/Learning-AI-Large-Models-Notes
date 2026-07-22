# 第 7 章 模拟面试 Agent

## 7.1 状态机设计模式

**为什么需要状态机**：普通多轮对话每轮做同样的事，但模拟面试天然分阶段——热身→技术基础→项目深挖→反问收尾。阶段判断由代码逻辑管理，不靠 LLM 推断。

**四个面试阶段**：

```python
WARMUP（破冰自我介绍，最少1轮最多4轮）
→ TECH_BASE（技术题库问答，至少6轮+8道题，追问规则：EXCELLENT最多追问2次，WEAK换题）
→ PROJECT（简历项目深挖，所有项目深挖完毕或至少2轮）
→ CLOSING（反问收尾，至少2轮）
→ FINISHED（终态：生成报告+持久化）
```

**强制终止**：总轮数≥38 或学员说"结束面试"，直接跳 FINISHED。

**图拓扑**：每次学员发消息触发一次完整执行。load_context（每轮必走）→ check_stage（纯逻辑判断）→ 分支：正常对话（evaluate_answer→generate_response）或报告生成（generate_report→save_report）→ save_memory 汇合。

## 7.2 State 与枚举

**InterviewStage 枚举**：WARMUP/TECH_BASE/PROJECT/CLOSING/FINISHED。

**AnswerQuality 枚举**：EXCELLENT/ADEQUATE/WEAK/NO_ANSWER，驱动追问/换题决策。

**InterviewState（22 字段，7 组）**：请求上下文→简历联动数据→面试阶段控制(current_stage/stage_turn_count/total_turn_count)→题目管理(question_bank/current_question)→回答质量追踪(last_answer_quality/followup_count)→记忆管理(existing_summary/should_summarize)→评估结果(report/fallback_used)。

**五维度报告权重**：技术深度 35%、项目经验 25%、表达逻辑 20%、抗压反应 10%、整体印象 10%。

## 7.3 Prompts

每个阶段有独立的 Prompt（WARMUP_PROMPT/INTRO_EVAL_TECH_FIRST_PROMPT/TECH_BASE_PROMPT/TECH_FOLLOWUP_PROMPT/PROJECT_PROMPT/PROJECT_FOLLOWUP_PROMPT/CLOSING_PROMPT/CLOSING_RESPONSE_PROMPT），加上 EVALUATE_ANSWER_PROMPT（评估回答质量）和 GENERATE_REPORT_PROMPT（生成报告）。

## 7.4-7.10 节点详解

**load_context**：首轮并行查询(asyncio.gather)题库和简历数据，初始化 State 字段（current_stage=warmup）。降级：无简历时 PROJECT 改为引导学员自述项目经历。

**check_stage**：纯逻辑节点，不调 LLM。读取轮数计数器判断是否推进到下一阶段。强制终止优先。

**evaluate_answer**：Think Tool 评估学员回答质量——先让 LLM 调用"think"工具内部推理，再调用"final_answer"输出标签。Think Tool 强制 LLM 先分析再打标签，提高评估准确性。

**generate_response**：按当前阶段生成面试官回应。TECH_BASE 出题逻辑：优先从未答题库选→匹配简历技能→无可用题库时 LLM 动态生成。追问逻辑：仅 EXCELLENT 可追问，上限 2 次。换题逻辑：WEAK/NO_ANSWER 时中性回应换题。

**generate_report**：current_stage==FINISHED 时触发，LLM 生成五维度评估报告（ReportWrapper 三层结构）。

**save_report/save_memory**：报告写入 interview_sessions 表 JSONB 字段。每 10 轮触发摘要压缩防止消息列表撑爆上下文，首轮 INSERT 创建会话记录（UPSERT ON CONFLICT thread_id）。

## 7.11 图装配

7 个节点，唯一分支点 `check_stage` 条件路由（正常对话/报告生成），两条路径最终汇合到 save_memory。编译时传 MemorySaver 实现跨轮记忆。

## 7.12 HTTP 接口

| 接口 | 说明 |
|------|------|
| POST /interview/start | 开始面试，返回 session_id+面试官开场白 |
| POST /interview/chat | 发送消息，返回回复+当前阶段 |
| GET /interview/history/{id} | 获取对话历史 |
| GET /interview/report/{id} | 获取五维度评估报告 |
| GET /interview/stream/{id} | SSE 流式对话 |
