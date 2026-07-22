# 第六章 试卷批改 Agent 学习笔记

## 一、试卷批改 Agent 全景（6.1）

### 1.1 核心价值与设计背景

试卷批改 Agent 是 EduAgent 平台的第三个核心 Agent，用于**自动批改学员提交的 Word 格式试卷**。它与此前 Resume Agent（简历审查）和 QA Agent（RAG 问答）的模式不同：试卷批改涉及**多种题型**（客观题、简答题、代码题），不同题型需要截然不同的批改策略，因此引入了**三轨并行**架构。

### 1.2 为什么需要 Human-in-the-Loop（HitL）

AI 批改不能完全自动发布，原因有三：

1. **简答题有歧义**：学员用不同表述正确回答了同一个知识点，AI 有时会低估——这种边缘情况 AI 自己也不确定（confidence < 0.7），需要教师裁定。
2. **代码题无法自动运行**：代码批改只有 LLM 质量评估，教师需要人工确认分数是否合理。
3. **成绩有法律效力**：发布的分数是最终成绩，教师必须有最终确认权。

因此 Agent 的设计是：**AI 全自动批改 -> 人工确认窗口 -> 教师发布**。这条线用 LangGraph 的 `interrupt()` 机制实现。

### 1.3 完整数据流

```
学员提交 .docx
      |
      v
parse_word --------- 解析 Word 文件，提取各题作答内容
      |
      v
load_questions_meta -- 从 DB 加载题目元数据（类型/得分点/正确答案）
      |               与解析结果合并，得到 parsed_questions
      v
run_three_tracks --- 三轨并行批改（asyncio.gather）
      |               +-- 第一轨：客观题 -> 规则引擎（精确比对）
      |               +-- 第二轨：简答题 -> Think Tool + LLM 语义评分
      |               +-- 第三轨：代码题 -> LLM 代码质量评估
      v
aggregate_results -- 三轨结果合并 -> 按题号排序 -> 计算总分/需复核题数
      |
      v
analyze_weak_points  分析知识薄弱点
      |               +-- 有 knowledge_tag -> 直接聚合
      |               +-- 无标签题目 -> LLM 推断知识点
      v
notify_teacher ---- 更新 DB 状态为 pending_review
      |
      v
teacher_review ---- [interrupt()] <- 图在此暂停，等待教师确认
      |               教师通过 POST /confirm 传入 Command(resume=decision) 恢复
      v
apply_teacher_decision -- approve -> 直接采用 AI 分数
      |                   modify  -> 按教师修改列表覆盖对应题目
      v
publish_results --- 写入 exam_reviews + 更新 exam_submissions.status='published'
      |
      v
     END
```

整个图是**线性链**，没有条件分支。唯一的控制流复杂性来自第三步的三轨并行和第七步的 `interrupt()` 暂停。

### 1.4 三轨并行设计

```
                    +-- 第一轨：规则引擎 --------------------------------+
                    |   单选题/多选题/判断题                                |
run_three_tracks -->|   标准化答案（大写去空格排序）-> 精确比对 -> is_correct  |--> asyncio.gather
                    |                                                      |
                    +-- 第二轨：LLM 语义评分 -------------------------------+
                    |   简答题，每 3 题一组并行                              |
                    |   先 Think Tool 推理分析 -> 再结构化评分               |
                    |                                                      |
                    +-- 第三轨：LLM 代码质量评估 ----------------------------+
                        代码题，LLM 从5个维度评估代码质量，全部标记教师复核
```

三轨用 `asyncio.gather(return_exceptions=True)` 并行启动：哪轨失败不影响其他两轨，失败的那轨在 `aggregate_results` 阶段表现为空列表，教师可人工补充。

### 1.5 涉及的数据库表

| 表名 | 用途 |
|------|------|
| exams | 试卷基本信息 |
| questions | 试题列表（含 question_type / correct_answer / score） |
| scoring_points | 简答题得分点明细 |
| exam_submissions | 学员提交记录（状态流转：ai_processing -> pending_review -> published） |
| exam_reviews | 逐题批改结果（含 ai_score / teacher_score / final_score） |

### 1.6 本章文件清单

| 文件 | 说明 |
|------|------|
| `backend/agents/exam/state.py` | ExamState + 5 个 Pydantic 子模型 |
| `backend/agents/exam/prompts.py` | 4 个 Prompt 模板 |
| `backend/agents/exam/nodes.py` | 9 个节点函数（含三轨批改内部辅助函数） |
| `backend/agents/exam/graph.py` | 图装配与编译 |
| `backend/api/v1/exam.py` | 6 个 HTTP 接口 |

---

## 二、State 与 Prompts（6.2）

### 2.1 五个 Pydantic 子模型

在 Exam Agent 中，Pydantic 子模型直接用于 LLM 结构化输出（`with_structured_output`）：

**ScoringPointResult**：单个得分点的评分结果，包含 `point_id`, `point_desc`, `point_score`, `earned(bool)`, `evidence`, `missing`。

**SubjectiveReviewResult**：简答题批改结果，包含 `question_id`, `student_answer`, `total_score`, `full_score`, `confidence`, `point_results`, `overall_comment`。关键字段 `confidence` 是 LLM 对自己的评分把握度（0~1），低于 0.7 时该题自动标记 `needs_review=True`。

**WeakPoint**：单个知识薄弱点，包含 `tag`, `wrong_count`, `total_count`, `question_nos`, `suggestion`。

**WeakPointsReport**：知识薄弱点分析报告，包含 `weak_points` 列表和 `overall_summary`。

**TeacherDecision**：教师确认决策，包含 `action`（"approve"/"modify"）, `modifications`, `teacher_id`。

### 2.2 ExamState 字段设计

ExamState 分为 7 组：

| 分组 | 字段 | 写入节点 |
|------|------|----------|
| 请求上下文 | exam_id, submission_id, word_file_path | API 层初始化 |
| 解析结果 | parsed_questions | parse_word_node -> load_questions_meta_node 覆盖 |
| 三轨结果 | objective_results, subjective_results, code_results | run_three_tracks_node |
| 汇总 | pre_review_summary | aggregate_results_node |
| 薄弱点 | weak_points, weak_points_summary | analyze_weak_points_node |
| HitL | teacher_notified, teacher_decision | notify_teacher_node / teacher_review_node |
| 发布 | final_results, published, structured_output | apply_teacher_decision_node / publish_results_node |

`parsed_questions` 被两个节点使用：`parse_word_node` 写入初步解析结果，`load_questions_meta_node` 用 DB 数据覆盖它，图里 `parse_word -> load_questions_meta` 是固定顺序边，不会并发冲突。

### 2.3 四个 Prompt 模板

**SYSTEM_PROMPT**：人设前缀，注入到每个 LLM 调用。强调"严格按照得分点评分，不随意加减分"、"对有争议的内容保持保守评分，宁可偏低并标记复核"。

**SUBJECTIVE_REVIEW_PROMPT**：简答题批改 Prompt，教导 LLM 按得分点逐条评分，输出 JSON（实际走 function calling，Prompt 中的 JSON 示例是语义引导）。

**SUBJECTIVE_THINK_PROMPT**：Think Tool Prompt（批改前推理），先让 LLM 自由推理（不约束输出格式），分析学员是否理解了核心概念、是否覆盖了得分点、有没有表述模糊但实质正确的内容。

**CODE_QUALITY_REVIEW_PROMPT**：代码质量评估 Prompt，从5个维度评估：规范性、命名可读性、算法效率、异常处理、注释质量。

**WEAK_POINTS_ANALYSIS_PROMPT**：知识薄弱点分析 Prompt，将错题归纳到知识点，分析薄弱原因，给出复习建议。

**Think Tool 的价值**：先自由推理再结构化评分，减少对"表述不同但实质正确"的误判。

---

## 三、Word 文件解析（6.3）

### 3.1 试卷模板约定

教师出题使用统一的 Word 模板，解析器需要处理：
1. **题目识别**：`第X题` / `Q.X` / `题目X` 三种格式
2. **答案提取**：`答：` / `答:` / `Answer:` 前缀后的内容
3. **代码块**：用 ` ``` ` 围起的代码，`is_code=True` 标记
4. **跳过模板行**：`作答区`、`请在此处` 等提示行

### 3.2 关键实现细节

**`_sync_parse_word`**：同步解析 Word 文件，使用 `python-docx` 库。逐段遍历段落，用正则 `re.match(r"^(第?\s*[一二三四五六七八九十\d]+\s*[题、。.]|Q\.?\s*\d+|题目\s*\d+)", para_text)` 识别题目开头。

**`parse_word_node`**：用 `run_in_executor` 把同步函数放入线程池，避免阻塞 async 事件循环：
```python
loop = asyncio.get_running_loop()
parsed_questions = await loop.run_in_executor(None, _sync_parse_word, word_path)
```

**代码题的特殊处理**：遇到闭合 ` ``` ` 时立刻确认代码范围，写入 `student_answer` 并置 `is_code=True`，最后的统一赋值逻辑会跳过已标记的代码题。

**优雅降级**：解析失败时返回空列表，后续节点从 DB 补全题目信息，教师人工批改。

---

## 四、题目元数据加载（6.4）

### 4.1 为什么需要这个节点

`parse_word_node` 只能提取学员写了什么，但不知道题型、正确答案、得分点、满分、知识点标签。这些信息全在数据库里，`load_questions_meta_node` 负责把两者合并。

### 4.2 合并策略：以 DB 题目为主

从数据库加载 `questions` 表（按 `exam_id` 查询）和 `scoring_points` 表（按 `question_id` 批量查询），按题号匹配解析结果，找不到对应解析结果的题目 `student_answer` 填空字符串。

### 4.3 动态 IN 子句写法

SQLAlchemy + asyncpg 在处理 UUID 数组参数时存在类型转换问题，因此动态构造 IN 子句是最稳妥的写法：

```python
param_names = [f":qid_{i}" for i in range(len(question_ids))]
qid_params = {f"qid_{i}": qid for i, qid in enumerate(question_ids)}
```

### 4.4 得分点聚合

`sp_by_question` 字典按 `question_id` 归组，每题的得分点列表在合并时一起写入 `parsed_questions`。

---

## 五、三轨并行——客观题规则引擎（第一轨，6.5）

### 5.1 核心逻辑

客观题（单选 `single_choice` / 多选 `multi_choice` / 判断 `judge`）不需要 LLM，用规则引擎精确比对：

```
学员答案 -> _normalize_answer -> 标准化字符串
正确答案 -> _normalize_answer -> 标准化字符串
                                   -- 完全相等 -> is_correct=True -> 满分
                                   -- 不等 -> is_correct=False -> 0分
```

### 5.2 答案标准化

```python
def _normalize_answer(answer: str) -> str:
    cleaned = answer.upper().replace(" ", "").replace("，", "").replace(",", "")
    return "".join(sorted(cleaned))
```

三步处理：大写 -> 去空格/逗号 -> 排序。排序使多选题选项顺序无关，"DB"和"BD"视为等价。

### 5.3 输出结构

每个结果包含 `question_id`, `question_no`, `question_type`, `score`（答对得满分，答错得0分）, `needs_review`（固定为 False，客观题不存在争议）, `ai_feedback`（答对写"正确"，答错写"正确答案：X"）。

---

## 六、三轨并行——简答题 LLM 评分（第二轨，6.6）

### 6.1 Think Tool 两步流程

简答题的核心挑战：学员可能用不同的表述正确回答了同一个知识点。解决方案是 Think Tool 两步流程：

```
第一步：推理（SUBJECTIVE_THINK_PROMPT）
  普通 LLM 调用（无结构化输出约束）
  问：这道题的每个得分点，学员是否覆盖？有没有表述不同但实质正确的内容？
  LLM 自由输出推理分析（reasoning_trace）
                  |
                  v
第二步：评分（SUBJECTIVE_REVIEW_PROMPT + reasoning_trace）
  结构化 LLM 调用（with_structured_output(SubjectiveReviewResult)）
  把第一步的推理追加到 Prompt 末尾
  输出：SubjectiveReviewResult（逐得分点评分 + confidence）
```

### 6.2 `_review_one_subjective` 单题批改

先调 `think_llm.ainvoke` 做推理，再调 `structured_llm.ainvoke` 做结构化评分。推理失败不影响主评分，降级为直接评分。

`needs_review` 阈值：`confidence < 0.7` 标记需复核。阈值设为0.7而非0.5：简答题评分有一定主观性，宁可多标几道让教师过目。

### 6.3 `_run_subjective_track` 分组并行

每3题一组并行处理。组内 `asyncio.gather` 并行（最多3个并发请求），组间顺序执行。`asyncio.gather(return_exceptions=True)` 确保单题失败不阻断整组，失败的题目用降级结构填充（`score=0, needs_review=True`）。

---

## 七、三轨并行——代码题 LLM 评估（第三轨，6.7）

### 7.1 三个函数层次

`_run_code_track`（入口）-> `_review_one_code`（单题）-> `_llm_code_quality_review`（LLM 评分）。

### 7.2 五维度评估

LLM 从5个维度评估代码质量：规范性（缩进/括号/分号等）、命名可读性（变量/方法/类名）、算法效率（时间/空间复杂度）、异常处理（边界条件/错误处理）、注释质量（关键逻辑是否有注释）。

### 7.3 始终 needs_review

LLM 无法运行代码，评分仅作参考，所有代码题始终标记 `needs_review=True`，教师必须人工确认。

### 7.4 JSON 解析降级

LLM 返回格式异常时，`try-except` 捕获 JSON 解析异常，返回 `score=0, confidence=0.0`，教师人工复核。

---

## 八、三轨组装与汇总（6.8）

### 8.1 `run_three_tracks_node` 三轨并行启动

按 `question_type` 筛选三轨各自处理的题目子集，用 `asyncio.gather(return_exceptions=True)` 并行启动三轨。某一轨失败时，检查 `isinstance(raw[i], Exception)`，失败的轨结果置为空列表。

```python
raw = await asyncio.gather(
    _run_objective_track(objective_qs),
    _run_subjective_track(subjective_qs),
    _run_code_track(code_qs),
    return_exceptions=True,
)
```

### 8.2 `aggregate_results_node` 汇总

合并三轨结果，按 `question_no` 排序，计算 `total_score`, `full_score`, `score_rate`, `needs_review_count`，打包为 `pre_review_summary` 字典，供后续 HitL 展示给教师。

### 8.3 `analyze_weak_points_node` 薄弱点分析

两条路径：
- 有 `knowledge_tag` 的失分题 -> 按标签直接聚合（规则，不用 LLM）
- 无 `knowledge_tag` 的失分题 -> 收集后交给 LLM 推断知识点

两路合并，优先用规则聚合的结果，LLM 只补充 `suggestion` 和无标签题的知识点推断。

---

## 九、Human-in-the-Loop（6.9）

### 9.1 `interrupt()` 的工作原理

这是 LangGraph 的标准 HitL 模式，也是本章最核心的架构设计：

1. 执行到 `interrupt(value)` 时，LangGraph 抛出一个内部 `Interrupt` 异常
2. `graph.ainvoke` 捕获这个异常，把当前完整 State 保存到 MemorySaver（按 `thread_id` 存储）
3. `ainvoke` 返回（不是等待，而是真正返回），调用方的 `await _graph.ainvoke(...)` 完成
4. 图进入"暂停"状态，State 里包含中断点的位置信息（`next=["teacher_review"]`）
5. 后续调用 `graph.ainvoke(Command(resume=decision), config=config)` 时，LangGraph 从 MemorySaver 恢复 State，从 `teacher_review_node` 的 `interrupt()` 调用处继续，`decision` 作为 `interrupt()` 的返回值

关键约束：**编译图时不传 `interrupt_before`**，只在节点内调用 `interrupt()`。这是 LangGraph 1.0 的新 API，旧写法已废弃。

### 9.2 `notify_teacher_node` 职责

更新 `exam_submissions.status = 'pending_review'`，教师轮询 `GET /pending-reviews` 接口就能看到新提交。

### 9.3 `teacher_review_node` 职责

HitL 核心节点，调用 `interrupt(display_data)` 冻结图执行。`display_data` 包含 `pre_review_summary`、`weak_points`、`weak_points_summary` 等数据，供教师端展示。

恢复后，`interrupt()` 的返回值就是 `teacher_decision`，写入 State。

### 9.4 恢复流程

```python
result = await _graph.ainvoke(
    Command(resume=decision),
    config={"configurable": {"thread_id": thread_id}},
)
```

`Command(resume=decision)` 不是从头执行图，而是从 MemorySaver 加载 State，从 `interrupt()` 调用处继续执行。

---

## 十、合并教师决策与发布（6.10）

### 10.1 `apply_teacher_decision_node`

教师有两种决策：
- `approve`：认可 AI 批改结果，直接采用 AI 分数（`final_score = score`）
- `modify`：对部分题目调整分数或评语，按 `modifications` 列表覆盖对应题目的 `final_score`

保留 `ai_score` 和 `teacher_score` 两个字段，便于教师事后评估 AI 准确性。

### 10.2 `publish_results_node`

写入逻辑：
- `exam_reviews`：先删后插（幂等），每道题一行。`ai_raw_result` 存整个 `r` dict 的 JSON 序列化，包含 `point_results`、`quality_feedback` 等详细数据。
- `exam_submissions`：更新 `status='published'` + `weak_points` JSON + `weak_points_summary`。

**为什么用先删后插而非 UPSERT？** `exam_reviews` 表没有 UNIQUE 约束（允许历史上有多条，便于审计），先 DELETE 再 INSERT 确保最终只有一条有效记录，同时保留了 UPSERT 的幂等效果。

---

## 十一、图装配（6.11）

### 11.1 图结构

Exam Agent 是一条线性链，没有条件分支：

```
START -> parse_word -> load_questions_meta -> run_three_tracks
  -> aggregate_results -> analyze_weak_points
  -> notify_teacher -> teacher_review [interrupt]
  -> apply_teacher_decision -> publish_results -> END
```

与 QA Agent 不同，这里没有条件边——图的路径完全确定，每个节点只有一个出口。控制流的复杂性体现在节点内部（三轨并行、interrupt 暂停），而不是图的拓扑结构上。

### 11.2 为什么 HitL 必须绑定 MemorySaver

`interrupt()` 把图"冻结"后，State 必须持久化到某个地方，等教师确认后才能恢复。如果不传 `checkpointer`，图是无状态的，`interrupt()` 后 State 丢失，无法恢复执行。`MemorySaver` 按 `thread_id` 把 State 存在进程内存中，`Command(resume=...)` 时按同一 `thread_id` 读取恢复。

### 11.3 完整端到端测试

测试脚本验证从 `parse_word` 到 `publish_results` 的全链路，包括 HitL 的 interrupt 暂停与 Command(resume=) 恢复。测试前需先运行 `python scripts/seed_data.py` 初始化测试数据。

---

## 十二、HTTP 接口（6.12）

### 12.1 文件结构与全局对象

```python
_graph = build_exam_graph()  # 模块级编译图，只执行一次
_background_tasks: set[asyncio.Task] = set()  # 防止 GC 回收后台任务
```

`_background_tasks` 是防止 GC 的关键。`asyncio.create_task` 创建的任务如果没有强引用，Python GC 可能在任务执行中途回收它。把任务引用存入 `set` 就建立了强引用，任务完成后在 `done_callback` 里从 set 中移除。

### 12.2 六个接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/submit` | POST | 学员提交作答 Word 试卷，返回 202 + submission_id |
| `/submissions/{id}/review` | GET | 教师查看预批改详情 |
| `/submissions/{id}/confirm` | POST | 教师确认/修改批改结果 |
| `/pending-reviews` | GET | 教师查看待确认列表 |
| `/my-submissions/{id}` | GET | 学员查看自己的提交状态 |
| `/results/{id}` | GET | 学员查看已发布的批改结果 |

### 12.3 `POST /submit` 核心流程

1. 校验文件格式（仅支持 `.docx`）
2. 保存上传文件到临时目录
3. 验证试卷 ID 是否存在
4. 检查是否已有提交记录（同一学员同一试卷只能有一份）
5. 写入提交记录（状态 `ai_processing`）
6. 构建初始 State 和 config
7. 创建后台任务执行批改图
8. 注册 done callback 处理任务失败或清理

### 12.4 `POST /confirm` 恢复流程

教师传入 `{action: "approve"|"modify", modifications: [...]}`，调用 `graph.ainvoke(Command(resume=decision), config=config)` 恢复图执行。注意 `Command` 必须从 `langgraph.types` 导入。

---

## 十三、端到端测试（6.13）

### 13.1 测试前提条件

1. Docker 服务运行中（postgres / milvus）
2. 运行 `python scripts/seed_data.py` 初始化测试数据
3. 启动后端 `uvicorn backend.main:app --reload --port 8000`

### 13.2 测试流程

1. 学员登录 -> 获取 token
2. 提交试卷 -> 获取 submission_id
3. 轮询批改状态（等待 AI 批改完成，状态变为 `pending_review`）
4. 教师登录 -> 获取 token
5. 查看待确认列表
6. 查看预批改详情（AI 总分、需复核题数、薄弱点）
7. 教师 approve 或 modify 发布
8. 验证最终结果（状态变为 `published`）

---

## 十四、架构设计总结

### 14.1 与 Resume Agent 的对比

| 维度 | 简历审查 Agent | 试卷批改 Agent |
|------|---------------|----------------|
| 图结构 | 线性链 | 线性链 |
| 并行方式 | 六维度并行评审 | 三轨并行批改 |
| 暂停机制 | 无 | HitL (interrupt) |
| 题型处理 | 单一（简历文本） | 三种（客观/简答/代码） |
| 决策注入 | 无 | TeacherDecision |

### 14.2 关键设计模式

1. **三轨并行**：三种题型各自独立，互不干扰，用 `asyncio.gather` 并发执行
2. **Think Tool 两步流程**：先推理再评分，减少语义误判
3. **HitL = interrupt() + Command(resume=)**：节点内暂停，API 层恢复，State 由 MemorySaver 全程保存
4. **优雅降级**：每层都有降级策略——Word 解析失败返回空列表、LLM 调用失败标记需复核、JSON 解析失败给 0 分
5. **分组并行**：简答题每3题一组并行，平衡并发效率与 API 稳定性
6. **先删后插**：发布结果时幂等写入，避免重复发布产生重复记录

### 14.3 状态流转

```
submitted -> ai_processing -> pending_review -> published
                                       ^
                                       | (教师驳回时回到 pending_review)
```

---

## 十五、面试题集（8-10 题）

### 问题 1：试卷批改 Agent 为什么采用三轨并行设计？三轨之间如何保证互不干扰？

**答案**：三种题型（客观题、简答题、代码题）的批改策略完全不同——客观题只需要规则引擎比对，简答题需要 LLM 语义评分，代码题需要 LLM 代码质量评估。它们之间没有数据依赖，各自处理不同的 `questions` 子集（按 `question_type` 筛选），因此可以完全并行。`asyncio.gather` 让三轨在同一个事件循环中并发执行，总耗时约等于最慢的一轨（通常是简答题 LLM 调用）。`return_exceptions=True` 保证某一轨失败不影响其他轨。

### 问题 2：Explain the Human-in-the-Loop mechanism in EduAgent's exam grading system. How does `interrupt()` work with `Command(resume=)`?

**答案**：The HitL mechanism uses LangGraph's `interrupt()` and `Command(resume=)` pair. When the graph reaches `teacher_review_node`, `interrupt(display_data)` is called. This internally raises an `Interrupt` exception, which is caught by the runtime. The complete State is saved to MemorySaver (keyed by `thread_id`), and `ainvoke()` returns normally. The graph is now "paused" with `next=["teacher_review"]` in its state. When the teacher calls `POST /confirm`, the API layer calls `graph.ainvoke(Command(resume=decision), config=config)`. LangGraph loads the saved State from MemorySaver, finds the `interrupt()` call site, makes `interrupt()` return `decision`, and continues execution from there. This is LangGraph 1.0's new API — the old pattern of `compile(interrupt_before=...)` is deprecated; instead, `interrupt()` is called directly inside the node function.

### 问题 3：Think Tool 两步流程解决了什么问题？为什么简答题批改需要先推理再评分？

**答案**：简答题的核心挑战是学员可能用不同的表述正确回答了同一个知识点。直接让 LLM 对照得分点评分，面对"表述不同但实质正确"的情况容易误判扣分。Think Tool 两步流程先让 LLM 自由推理（不约束输出格式），分析学员是否覆盖了每个得分点、有没有表述模糊但实质正确的内容，然后**把推理结果追加到评分 Prompt 末尾**，再让 LLM 做结构化评分。推理步骤迫使 LLM 先"思考"再"评分"，减少仅凭表面文字差异就扣分的情况。

### 问题 4：代码题批改为什么始终标记 `needs_review=True`？LLM 是如何评估代码质量的？

**答案**：LLM 无法实际运行代码，只能从代码文本层面做质量评估，无法验证代码是否能正确编译和运行。因此所有代码题评分仅作参考，教师必须人工确认。LLM 从5个维度评估代码质量：规范性（缩进/括号/分号等）、命名可读性（变量/方法/类名）、算法效率（时间/空间复杂度）、异常处理（边界条件/错误处理）、注释质量（关键逻辑是否有注释）。输出包含 `score` 和 `confidence`，`confidence < 0.7` 时同样标记需复核。

### 问题 5：为什么要用 `run_in_executor` 处理 Word 文件解析？可以直接在 async 函数中调用 `python-docx` 吗？

**答案**：`python-docx` 内部有文件 I/O（打开 .docx zip）和 XML 解析（ElementTree），两者都是同步阻塞操作，不能直接在 async 函数里调用。如果在 async 函数中直接调用，会阻塞事件循环，导致其他协程无法执行。解决方案是用 `loop.run_in_executor(None, _sync_parse_word, word_path)` 放入默认线程池，将同步阻塞操作交给线程池处理，`asyncio` 事件循环继续处理其他协程，线程完成后 `await` 恢复。

### 问题 6：试卷批改 Agent 中，`parsed_questions` 为什么被两个节点先后写入？这样做有什么风险？如何防止并发冲突？

**答案**：`parse_word_node` 写入初步解析结果（只有学员答案信息），`load_questions_meta_node` 用 DB 数据覆盖它（补充题型/得分点/正确答案等元数据）。风险在于，如果图装配中这两个节点被设计为并行执行，就会产生并发写冲突。但在这个 Agent 中，`parse_word -> load_questions_meta` 是**固定顺序边**，不会并发执行。合并策略是"以 DB 题目列表为准，按题号匹配解析结果"——`load_questions_meta_node` 从 DB 查询完整的题目列表，然后按 `question_no` 从 `parsed` 字典中查找对应的 `student_answer`，找不到的填空字符串。

### 问题 7：`_run_subjective_track` 为什么采用每3题一组并行的策略？为什么不全部并行？

**答案**：如果一份试卷有15道简答题，全部并行就是15个 LLM 请求同时发出。DeepSeek API 有并发限制，超出后请求排队甚至失败。每组3题，组内并行（最多3个请求），组间顺序执行，在"并发效率"和"API 稳定性"之间取了一个合理的平衡点。`asyncio.gather(return_exceptions=True)` 确保某道题抛异常不会中断整组，其余题目正常完成，失败的题目用降级结构填充。

### 问题 8：描述 `publish_results_node` 中"先删后插"的写入策略。为什么不用 UPSERT？

**答案**：`exam_reviews` 表没有 UNIQUE 约束（允许同一 `submission_id + question_id` 历史上有多条记录，便于审计）。如果教师重复确认（极少见但可能），直接 INSERT 会有重复记录。先 DELETE 再 INSERT 确保最终只有一条有效记录，同时保留了 UPSERT 的幂等效果。`ai_raw_result` 字段存储整个结果 dict 的 JSON 序列化，包含 `point_results`（逐得分点评分）、`quality_feedback`（代码维度评价）等详细数据，学员查询结果时 API 层从这个字段还原完整批改详情，不需要额外的关联查询。

### 问题 9：试卷批改 Agent 中有哪些优雅降级的设计？请列举至少三种。

**答案**：1) Word 文件解析失败时，返回空列表，后续 `load_questions_meta_node` 从 DB 补全题目信息，`student_answer` 全部为空字符串，教师人工补批。2) 简答题 Think Tool 推理失败时，降级为直接结构化评分（不携带推理上下文），不影响主评分。3) 简答题单题失败时，`return_exceptions=True` 保证不阻断整组，失败的题目用 `score=0, needs_review=True` 降级结构填充。4) 代码题 LLM 返回格式异常（JSON 解析失败）时，返回 `score=0, confidence=0.0`，触发教师人工复核。5) 三轨中某一轨整体失败时，`asyncio.gather(return_exceptions=True)` 捕获异常，失败的轨结果置为空列表，其余正常轨继续执行。

### 问题 10：Compare the Exam Grading Agent with the Resume Review Agent. What are the key architectural differences?

**Answer**: Both agents use a linear chain graph structure, but they differ in several key aspects: 1) **Parallelism pattern**: Resume Agent uses six-dimension parallel review (all dimensions are LLM-based), while Exam Agent uses three parallel tracks with different strategies (rule engine, LLM semantic scoring, LLM code quality assessment). 2) **Human-in-the-Loop**: Exam Agent has an `interrupt()`-based HitL mechanism for teacher approval before publishing, while Resume Agent runs fully automated without human intervention. 3) **File parsing**: Resume Agent uses LLM to extract structured info from PDF, while Exam Agent uses `python-docx` (rule-based) to parse Word files. 4) **Error isolation**: Exam Agent uses `return_exceptions=True` at every level (track level, group level, individual question level) to ensure one failure doesn't cascade. 5) **State management**: Exam Agent has a more complex state with 7 field groups spanning 17 fields, including HitL-specific fields (`teacher_notified`, `teacher_decision`) and three separate result arrays for the three tracks.