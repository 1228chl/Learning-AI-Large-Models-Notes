# 简历项目模版 · Exam Agent — AI 辅助试卷批改系统

---

## 一、简历上直接填写的版本

> 复制下方内容，把 `【】` 括号内的占位符替换成实际数字/信息。

---

**项目名称：** 基于 LangGraph HitL 的 AI 辅助试卷批改系统

**技术栈：** Python · LangGraph · LangChain · DeepSeek-V3 · DeepSeek-Coder-V2 · FastAPI · PostgreSQL · Word 文档解析

**项目时间：** 【2025.xx — 2025.xx】　**角色：** 独立设计与实现

**项目描述：**

为 IT 教培公司设计并实现了一套 AI + 教师协作的试卷批改系统，核心解决了"主观题 LLM 评分无法审计、教师难以介入"的问题。

- **三轨并行批改**：客观题（规则引擎精确匹配）、主观题（LLM 按得分点逐条评分）、代码题（DeepSeek-Coder 专项模型）三个 Pipeline 并行执行，单份试卷批改完成时间 < 【30s】
- **Human-in-the-Loop 工作流**：基于 LangGraph `interrupt()` 实现图执行暂停，批改结果推送教师端后等待复核；教师 approve 或 modify（修改指定题目分数）后，通过 `Command(resume=decision)` 恢复执行，无需轮询，架构简洁
- **结构化得分点输出**：用 `with_structured_output(SubjectiveReviewResult, method="function_calling")` 强制 LLM 按得分点（point-by-point）给出 `earned=True/False` + 证据原文，评分过程完全可溯源
- **知识薄弱点分析**：批改完成后自动聚合全班错题，生成结构化薄弱知识点报告（含知识标签、错误率、复习建议），辅助教师制定针对性辅导
- **评估验证**：对比 AI 批改与教师评分，主观题 MAE < 【1.5分】（满分10分），等级一致性 Cohen's κ = 【0.71】，教师复核介入率 < 【20%】

---

## 二、面试口头表达（30 秒开场白）

---

"我做的这个批改系统，最有意思的设计是 Human-in-the-Loop——AI 不是直接输出最终结果，而是给出预批改，然后系统暂停等教师复核，教师确认或修改后再继续。

传统做法是用 Webhook 回调，比较复杂。我用的是 LangGraph 的 `interrupt()` 机制，图在节点中间挂起，状态完整保存在 MemorySaver 里，教师操作完之后用 `Command(resume=decision)` 恢复，代码非常干净。

另外主观题强制 LLM 按得分点输出，每个点给出'是否得分 + 证据原文'，教师一眼就能看到 AI 为什么这么打分，不是黑盒。你想聊 HitL 的实现细节，还是结构化输出这块？"

---

## 三、高频追问 & 参考答案

### Q1：LangGraph 的 interrupt() 是怎么工作的？和异步回调有什么区别？

**答：**
`interrupt()` 是 LangGraph 内置的图暂停机制。在节点内调用 `interrupt({"data": payload})` 后，图立即停止执行并抛出 `GraphInterrupt` 异常，当前 State 被 MemorySaver 完整序列化保存。

外部系统（教师端）拿到暂停信号、做完决策后，用 `graph.ainvoke(Command(resume=decision), config)` 恢复，图从暂停点继续，不重跑之前的节点。

和异步回调的区别：回调需要设计状态机、消息队列、回调接口；`interrupt()` 把状态持久化交给框架，代码里只是"调用一个函数然后等结果"，逻辑和普通函数调用一样清晰。

---

### Q2：三轨并行是怎么实现的？为什么不串行？

**答：**
三类题目没有依赖关系，所以可以并行。在 LangGraph 里设计了三个独立节点（objective_node / subjective_node / code_node），通过条件路由根据题目类型分流，三个节点可以同时运行，最后 merge_node 汇总结果。

串行的问题是时间叠加，一份试卷 5 道选择 + 3 道简答 + 2 道代码，串行大约需要 60-90 秒；并行后等最慢的那条路，实测 < 30 秒。对于批量批改来说这个差距很显著。

---

### Q3：LLM 按得分点评分和直接让 LLM 打分有什么区别？

**答：**
直接打分就是"给这道题打个分，满分10分"，LLM 会给一个数字，但不知道为什么，教师没法审核。

按得分点评分是先在题库里预设得分点（比如"①提到了 synchronized 关键字 2分 ②举例说明锁对象 3分 ③提到了可重入性 2分"），然后让 LLM 对每个得分点判断`earned=True/False` 并给出"学员答案里哪句话支持这个判断"的证据原文。

这样教师复核时能精确看到"第②点 LLM 认为没得分，依据是学员写了'加锁'但没有具体说锁对象"，一目了然，改起来也快。

---

### Q4：如果 LLM 返回的 JSON 格式不对怎么处理？

**答：**
用 `with_structured_output(SubjectiveReviewResult, method="function_calling")` 而不是让 LLM 返回 JSON 字符串再手动解析。Function Calling 模式下，LLM 必须调用工具函数并按 Pydantic Schema 填参数，框架在底层做校验，格式不对会自动重试。`method="function_calling"` 这个参数很关键——DeepSeek 不支持 `json_schema` 模式，必须指定这个。

---

### Q5：教师修改了分数，最终分数怎么存储的？

**答：**
教师的 modify decision 里包含 `question_id + new_score + comment`，`apply_teacher_decision_node` 节点用 `question_id` 在批改结果里找到对应题目，把 `final_score` 替换成 `new_score`，同时记录 `teacher_comment`。最终 `save_results_node` 把完整结果（含改分记录）写入 `exam_submissions` 表，`teacher_action` 字段记录是 approve 还是 modify，便于后续统计 HitL 介入率。
