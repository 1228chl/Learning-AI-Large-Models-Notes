# 第6章 试卷批改 Agent

## 6.1 全景与设计

**核心价值**：自动批改Word格式试卷，三轨并行处理三种题型（客观题/简答题/代码题）。

**为什么需要HitL**：①简答题有歧义（不同表述正确但AI低估）②代码题无法自动运行③成绩有法律效力。所以设计为：AI全自动批改→人工确认窗口→教师发布。

**完整数据流**：
```
parse_word（解析Word）→ load_questions_meta（加载DB题目元数据）
→ run_three_tracks（三轨并行批改）→ aggregate_results（汇总）
→ analyze_weak_points（薄弱点分析）→ notify_teacher（通知教师）
→ teacher_review [interrupt暂停] → apply_teacher_decision → publish_results
```

**三轨并行**：`asyncio.gather(return_exceptions=True)`并行启动，某轨失败不影响其他轨。
- 第一轨：客观题→规则引擎精确比对
- 第二轨：简答题→Think Tool + LLM语义评分
- 第三轨：代码题→LLM代码质量评估

## 6.2 State与Prompts

**ExamState（7组）**：请求上下文→解析结果→三轨结果→汇总→薄弱点→HitL→发布。

**五个Pydantic子模型**：ScoringPointResult(得分点)、SubjectiveReviewResult(简答题评分，含confidence)、WeakPoint/WeakPointsReport(薄弱点)、TeacherDecision(教师决策)。

**四个Prompt**：SYSTEM_PROMPT(人设)、SUBJECTIVE_REVIEW_PROMPT(简答题评分)、CODE_QUALITY_REVIEW_PROMPT(代码5维度评估)、WEAK_POINTS_ANALYSIS_PROMPT(薄弱点分析)。

## 6.3-6.4 Word解析与元数据加载

**Word解析**：python-docx逐段遍历，正则识别`第X题`/`Q.X`/`题目X`，提取答案和代码块。同步函数用`run_in_executor`丢线程池。解析失败返回空列表，后续从DB补全。

**元数据合并策略**：以DB题目列表为准，按题号匹配解析结果，找不到的填空字符串。

## 6.5-6.7 三轨并行详解

**第一轨-客观题规则引擎**：`_normalize_answer`标准化（大写→去空格逗号→排序），使排序无关的多选题选项等价。精确比对，答对满分答错0分，固定`needs_review=False`。

**第二轨-简答题Think Tool两步流程**：
1. 普通LLM调用（无结构化约束）→自由推理分析学员答案覆盖了哪些得分点
2. 把推理结果追加到评分Prompt末尾→结构化LLM输出SubjectiveReviewResult
**confidence<0.7标记需复核**。每3题一组并行（平衡并发效率和API稳定性），组内`asyncio.gather`，组间顺序执行。

**第三轨-代码题5维度评估**：规范性、命名可读性、算法效率、异常处理、注释质量。LLM无法运行代码，所有代码题始终`needs_review=True`，教师必须人工确认。

## 6.8 三轨汇总

**aggregate_results**：合并三轨结果，按question_no排序，计算total_score/score_rate/needs_review_count。
**analyze_weak_points**：有knowledge_tag的直接按标签聚合，无标签的让LLM推断知识点。

## 6.9 Human-in-the-Loop（核心）

**interrupt()工作原理**：
1. 执行到`interrupt(value)`→LangGraph抛出Interrupt异常
2. 完整State保存到MemorySaver（按thread_id）
3. 图进入"暂停"状态，ainvoke返回
4. 外部调用`graph.ainvoke(Command(resume=decision), config)`→从MemorySaver恢复State，从interrupt处继续

**关键约束**：编译图不传`interrupt_before`，只在节点内调用`interrupt()`。

## 6.10 教师决策与发布

**两种决策**：approve（直接采用AI分数）或 modify（按modifications列表覆盖对应题目）。
**先删后插**：幂等写入exam_reviews，避免重复发布产生重复记录。保留ai_score和teacher_score两个字段便于事后评估AI准确性。

## 6.11 图装配

**线性链，无条件边**：START→parse_word→load_questions_meta→run_three_tracks→aggregate_results→analyze_weak_points→notify_teacher→teacher_review[interrupt]→apply_teacher_decision→publish_results→END。
**必须绑定MemorySaver**：interrupt后State需要持久化，否则无法恢复执行。

## 6.12 HTTP接口

| 接口 | 说明 |
|------|------|
| POST /exam/submit | 学员提交Word试卷，返回202+submission_id |
| GET /submissions/{id}/review | 教师查看预批改详情 |
| POST /submissions/{id}/confirm | 教师确认/修改批改结果（Command(resume=)恢复） |
| GET /pending-reviews | 教师查看待确认列表 |