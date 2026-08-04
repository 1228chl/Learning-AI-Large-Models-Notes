---
author: "XunZong"
created: "2026-07-30"
tags: ["AI-Agent", "试卷批改", "并行批改", "HitL", "人在环中", "LangGraph", "interrupt"]
aliases: ["Exam Grading Agent", "三轨并行", "试卷批改Agent", "interrupt", "人工确认"]
---

# 试卷批改 Agent 三轨并行与 Human-in-the-Loop

## 定义

试卷批改 Agent 是 EduAgent 中首个引入 **Human-in-the-Loop（HitL）** 的 LangGraph 图，由 9 个节点组成线性链，核心设计为**三轨并行批改**（客观题规则引擎 + 简答题 LLM 语义评分 + 代码题质量评估）和** `interrupt()` 暂停机制**（AI 批改完成后暂停，等待教师确认后发布）。

它与简历审查 Agent（全自动直线）和 RAG 问答 Agent（条件分支）的关键区别在于：成绩有法律效力，某些边缘情况（confidence < 0.7 的简答题、所有代码题）必须经过人工确认。`interrupt()` 和 `Command(resume=...)` 共同实现"AI 全自动批改 → 人工确认窗口 → 教师决定批准/修改 → 发布"这一完整工作流。

## 三轨并行架构

$$ \text{parse\_word} \to \text{load\_questions\_meta} \to \left[ \begin{array}{c} \text{客观题规则引擎} \\ \text{简答题 LLM 语义评分} \\ \text{代码题 LLM 质量评估} \end{array} \right] \to \text{aggregate} \to \text{analyze\_weak\_points} \to \text{notify\_teacher} \to [interrupt()] \to \text{apply\_decision} \to \text{publish} $$

| 轨道 | 题型 | 批改方法 | 失败隔离 |
|------|------|---------|---------|
| 第一轨 | 单选、多选、判断 | **规则引擎**：标准化答案（大写去空格排序）→ 精确比对 | `return_exceptions=True` |
| 第二轨 | 简答题 | **Think Tool** + **LLM 语义评分**：先自由推理再结构化评分 | `return_exceptions=True` |
| 第三轨 | 代码题 | **LLM 五维质量评估**：规范性/命名/算法/异常处理/注释 | `return_exceptions=True` |

三轨用 `asyncio.gather(return_exceptions=True)` 并行启动：哪轨失败不影响其他两轨，失败的那轨在 aggregate 阶段表现为空列表，教师可人工补充批改。

## 直观理解

> 三位老师同时批改一份试卷——第一位改选择题（对照标准答案，秒出结果），第二位改简答题（读内容、判断是否踩到得分点），第三位改代码题（检查规范、算法、异常处理）。改完后不直接公布成绩，而是把结果交给班主任（教师确认窗口），班主任审核通过后才发布。任何一位老师中途请假（某轨失败），不影响另外两位继续工作。

## 客观题规则引擎

```python
def _normalize_answer(answer: str) -> str:
    """标准化学员答案：大写 → 去空格和逗号 → 排序字符"""
    return "".join(sorted(answer.upper().replace(" ", "").replace(",", "")))

# 示例
_normalize_answer("B, D")  # → "BD"
_normalize_answer("DB")     # → "BD"
_normalize_answer("b,d")    # → "BD"
# 三种写法归一化后完全相同 → precise match 判定正确
```

不需要 LLM 调用：规则引擎零 API 开销、零延迟、零幻觉风险，适合有标准答案的客观题。

## HitL：interrupt 与 Command 恢复

```python
# 批改完成后暂停，等待教师确认
def notify_teacher_node(state: ExamState):
    # 更新 DB 状态 → pending_review
    display_data = {"total_score": state["pre_review_summary"]["total"]}
    return {"teacher_notified": True}

# 图装配时：在 notify_teacher 之后插入中断
graph.add_node("notify_teacher", notify_teacher_node)
graph.add_node("teacher_review", teacher_review_node)  # 不作为普通节点执行
# interrupt() 在图编译前声明中断点

# 教师决定后恢复执行
# POST /exam/confirm → Command(resume={"action": "approve", "modifications": []})
graph.ainvoke(Command(resume=teacher_decision), config={"configurable": {"thread_id": tid}})
```

state 流转：`submitted → ai_processing → pending_review → reviewed → published`

## 简答题 Think Tool 评分

两步走策略减少对"表述不同但实质正确"的误判：

1. **自由推理**（Think Tool，无结构化约束）：LLM 分析学员是否覆盖了得分点的核心概念、是否有表述模糊但实质正确的内容
2. **结构化评分**（with_structured_output）：将 Think 推理结果附到 Prompt 中，LLM 对每个得分点给出 `earned(bool)` 和 `evidence`

confidence < 0.7 的题目自动标记 `needs_review=True`，教师在确认窗口重点审核。

## AI/ML 工程应用场景

| 应用场景 | 对应的批改模式 | HitL 介入点 |
|---------|-------------|-----------|
| 标准化考试批改 | 客观题规则引擎 + 简答题 LLM 评分 | 简答题 confidence < 0.7 + 所有代码题 |
| 代码作业评审 | 代码五维 LLM 评估 | 全部标记教师复核，教师快速 approve 或 modify |
| 医疗诊断报告 | 规则引擎（指标阈值）+ LLM（影像描述） | 法规强制 HitL，医生最终签字 |
| 合同条款审查 | 并行多维 LLM 审查 + 律师 HitL | 高风险的财务/责任条款强制人工确认 |

## 面试追问

**Q1（基础）**：三轨并行批改中，三道轨道分别处理什么题型？各用什么方法？

**回答要点**：

1. 第一轨（客观题）：单选/多选/判断题 → 规则引擎精确比对，先标准化答案再匹配
2. 第二轨（简答题）：简答题 → Think Tool 自由推理 + LLM 结构化评分
3. 第三轨（代码题）：代码题 → LLM 从规范性、命名可读性、算法效率、异常处理、注释质量五个维度评估，全部标记教师复核

**Q2（深挖）**：LangGraph 的 interrupt() 机制如何实现"AI 批改 → 暂停 → 教师确认 → 继续执行"这条链？

**回答要点**：

1. 图执行到 notify_teacher 节点后，interrupt() 将当前 State 持久化到 MemorySaver 的 checkpoint 中
2. 图暂停，API 返回当前状态给前端（显示批改结果供教师审核）
3. 教师通过 POST /exam/confirm 传入决定（approve 或 modify）
4. 后端构造 `Command(resume=teacher_decision)`，从 checkpoint 恢复 State 并继续执行 apply_decision → publish
5. 关键在于同一 thread_id（`exam_{exam_id}_{submission_id}`）下的 checkpoint 持久化

**Q3（实战）**：return_exceptions=True 在三轨并行的 asyncio.gather 中起什么作用？如果某一轨失败了，aggregate 阶段如何处理？

**回答要点**：

1. return_exceptions=True 让 asyncio.gather 不因某一协程抛出异常而取消其他协程，而是把异常对象作为该位置的结果返回
2. aggregate 阶段检测每个轨道结果是否为 Exception 实例，若是则返回空列表
3. 简答题失败时：subjective_results 为空，该题的 needs_review=True，由教师人工补充评分
4. 代码题失败时：code_results 为空，所有代码题待教师批改

**Q4（边界）**：如果教师在确认窗口打开期间（图已 interrupt），外部系统崩溃或服务重启，还未提交的教师决定会丢失吗？

**回答要点**：

1. 不会丢失——MemorySaver 已将 State 持久化到内存 checkpoint 中
2. 但 in-memory MemorySaver 在服务重启时会丢失——这是限制
3. 生产解决方案：用 PostgresCheckpointer（`langgraph-checkpoint-postgres`）替代 MemorySaver，checkpoint 持久化到 PostgreSQL
4. 服务重启后，教师可通过同一 thread_id 重新获取待确认的批改结果并提交决定

## 参考引用

- 需要理解 Human-in-the-Loop 设计模式的抽象原理：[Human-in-the-Loop 设计模式](../设计模式/01-Human-in-the-Loop.md)
- 需要理解 Think 前置推理在简答题语义评分中的应用：[Think 前置推理增强](../设计模式/03-Think前置推理增强.md)
- 需要理解 LangGraph 的 Checkpointer 和 interrupt/Command 机制：[LangGraph Checkpointer 与记忆](../LangGraph/04-LangGraph Checkpointer与记忆.md)
- 需要理解 asyncio.gather 的并行调度和 return_exceptions 参数：[异步并发实战](../../Python/并发/05-异步并发实战.md)
- 需要理解评分 Rubric 设计中"五档评分区间"的标准化方法：[评分 Rubric 设计](../设计模式/04-评分Rubric设计.md)
