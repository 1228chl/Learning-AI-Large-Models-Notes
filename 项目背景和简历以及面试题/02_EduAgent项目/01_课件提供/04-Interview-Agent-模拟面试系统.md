# 简历项目模版 · Interview Agent — AI 模拟面试系统

---

## 一、简历上直接填写的版本

> 复制下方内容，把 `【】` 括号内的占位符替换成实际数字/信息。

---

**项目名称：** 基于五阶段状态机的 AI 模拟面试系统

**技术栈：** Python · LangGraph · LangChain · DeepSeek-V3 · FastAPI · SSE · PostgreSQL · MemorySaver

**项目时间：** 【2025.xx — 2025.xx】　**角色：** 独立设计与实现

**项目描述：**

为 IT 教培公司设计并实现了一套完整的 AI 模拟面试系统，核心解决了"LLM 多轮对话无法自动推进阶段、问题重复、无法结合简历个性化提问"三个问题。

- **五阶段状态机**：设计 WARMUP → TECH\_BASE → PROJECT → CLOSING → FINISHED 五阶段推进逻辑，`check_stage_node` 纯代码判断（不依赖 LLM），每轮开始时读取 `current_stage` + `stage_turn_count` 决定是否推进阶段；LLM 只负责"在当前阶段生成合适的话"，阶段控制与内容生成彻底分离
- **双轨出题机制**：技术基础阶段首选 LLM 动态出题（根据目标岗位实时生成，针对性强），兜底使用 `interview_questions` 题库；题目 `asked=True` 标记防止重复；EXCELLENT 质量答案触发最多 2 次追问，WEAK/NO\_ANSWER 直接换题
- **简历个性化联动**：通过 `resume_review_id` 查询简历审查结果，PROJECT 阶段能问出"你简历里的电商秒杀系统，库存超卖是怎么解决的"，而非泛化提问；无简历时自动降级为引导学员自述
- **跨轮状态持久化**：22 个 State 字段（阶段状态/题库/追问计数/简历数据等）由 LangGraph MemorySaver 跨请求保持，每 10 轮触发 LLM 摘要压缩，支持 40 轮面试 Context 不溢出
- **SSE 流式输出**：FastAPI SSE 逐 Token 推送面试官回应，配合前端实时渲染，用户体验接近真实面试；单轮对话 P95 延迟 < 【5s】
- **五维度评估报告**：面试结束自动生成结构化报告（技术深度/表达逻辑/项目理解/学习能力/抗压表现），含综合评分、核心优势、提升建议、推荐复习知识点

---

## 二、面试口头表达（30 秒开场白）

---

"这个项目最核心的设计挑战是：怎么让面试按阶段自动推进，而不是每轮都问一样的东西。

普通做法是把阶段判断交给 LLM，让它'自己决定现在该问什么'，但这样不可控——LLM 可能忘记已经问过的题，也可能热身阶段突然问技术题。

我的解法是把阶段控制从 LLM 里拿出来，用一个 `check_stage` 节点做纯代码判断：读 `current_stage` 字段，检查轮数是否达标，满足就切换阶段。LLM 只在当前阶段生成合适的话，不负责判断阶段。这样面试推进逻辑是确定的，可测试的。

另一个亮点是简历联动——通过前置简历审查的 review\_id，PROJECT 阶段能针对学员简历里的具体项目提问，个性化程度很高。你想聊状态机设计，还是多轮对话的记忆管理？"

---

## 三、高频追问 & 参考答案

### Q1：为什么阶段判断不让 LLM 来做？

**答：**
让 LLM 判断阶段有三个问题：
1. **不可控**：LLM 的判断依赖对整个对话历史的理解，它可能忘记已经问过多少轮了，或者在热身阶段突然冒出技术题
2. **不可测试**：LLM 判断结果是概率的，单元测试写不了"给定这些消息，阶段应该推进"这类确定性断言
3. **浪费 Token**：每轮都要让 LLM 回顾历史、判断阶段，多消耗 Token

`check_stage_node` 纯代码判断：`stage_turn_count >= min_turns AND questions_asked >= 8`，这种逻辑一行代码搞定，零 Token 消耗，100% 可测试。

---

### Q2：MemorySaver 的 22 个字段跨轮是怎么工作的？

**答：**
LangGraph 的 MemorySaver 本质是一个以 `thread_id` 为 key 的 checkpoint 存储。每次 `graph.ainvoke()` 执行完毕，完整的 `InterviewState`（包含 22 个字段的当前值）被序列化存入 MemorySaver。

下一轮调用时传入同一个 `thread_id`，LangGraph 自动从 MemorySaver 恢复上一次的 State 作为起点，新一条消息通过 `add_messages` reducer 追加到 `messages` 列表，其他字段（`current_stage`、`question_bank` 等）保持上一轮的值，节点可以直接读取。

代码层面完全透明——每个节点只管"读当前 State、返回更新字典"，不需要关心持久化细节。

---

### Q3：多轮对话如何防止 Context 越来越长？

**答：**
每轮执行 `save_memory_node` 时检查消息条数，超过阈值（比如 20 条）触发摘要压缩：
1. 把前 N 条消息传给 LLM，生成一段摘要（"面试官问了 HashMap 原理，学员回答了红黑树部分，质量 ADEQUATE…"）
2. 摘要写入 PostgreSQL 的 `interview_sessions.summary` 字段
3. State 里的 `messages` 列表只保留最近几条原始消息 + 一条"历史摘要"系统消息
4. 重启后 `load_context_node` 从数据库读摘要注入 State，实现跨重启恢复

这样无论面试进行多少轮，LLM 每次拿到的 Context 长度都在可控范围内。

---

### Q4：追问逻辑是怎么设计的？

**答：**
`evaluate_answer_node` 用 LLM（开启 Think 模式做推理前置）对学员回答打四个质量标签：EXCELLENT / ADEQUATE / WEAK / NO\_ANSWER。

追问规则在 `generate_response_node` 里用代码实现：
- EXCELLENT → `followup_count < 2` 时追问，否则换题
- ADEQUATE → 不追问，直接出下一题
- WEAK / NO\_ANSWER → 不追问，标记本题，换下一题
- 追问次数 `followup_count` 在 State 里跟踪，每次追问 +1，换题时重置为 0

这套规则完全在代码层，不依赖 LLM 判断"要不要追问"，逻辑确定、可预期。

---

### Q5：面试报告的五个维度是怎么评估的？

**答：**
面试结束进入 FINISHED 阶段时，`generate_report_node` 把全程对话（含摘要 + 近期消息）传给 LLM，用 `with_structured_output(InterviewReport)` 生成结构化报告。

五个维度：技术深度（知识点掌握到原理层还是停留"会用"）、表达逻辑（STAR 结构/总分总逻辑）、项目理解（能否应对项目细节追问）、学习能力（遇到不会的如何应对）、抗压表现（追问时是否慌乱）。

每个维度 LLM 给 0-100 分 + 文字评语 + 具体亮点/薄弱点，加权计算综合分。整个报告写入 PostgreSQL 的 `interview_sessions.report`（JSONB），前端读取后渲染雷达图。
