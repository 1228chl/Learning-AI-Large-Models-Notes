# 第六章 试卷批改 Agent — 学习版

> 本文档从原版《06-试卷批改Agent.md》中提取核心知识点，按照"三轨并行 + Human-in-the-Loop"主线编排学习顺序。

---

## 学习路线图

```
第一梯队：全景设计（先理解整体）
  ├── ① 全景与设计    ← 为什么需要 HitL、完整数据流、三轨并行
  ├── ② State 与 Prompts ← 5 个子模型 + 6 组 State + 4 个 Prompt
  └── ③ Word 解析与元数据加载 ← 节点①②

第二梯队：三轨并行（核心批改逻辑）
  ├── ④ 客观题规则引擎 ← 第一轨：精确比对
  ├── ⑤ 简答题 LLM 评分 ← 第二轨：Think Tool 两步流程
  └── ⑥ 代码题质量评估 ← 第三轨：5 维度评估

第三梯队：汇总与 HitL（核心范式）
  ├── ⑦ 三轨汇总与薄弱点分析 ← 汇总+生成报告
  ├── ⑧ Human-in-the-Loop   ← interrupt/resume 机制（核心！）
  └── ⑨ 教师决策与发布     ← approve/modify + 幂等写入

第四梯队：装配与接口
  ├── ⑩ 图装配             ← 线性链 + MemorySaver
  └── ⑪ HTTP 接口          ← 提交/查询/确认/列表
```

---

## 第一梯队：全景设计

---

### ① 全景与设计

#### 学习目标

- 试卷批改 Agent 的核心价值？为什么需要三轨并行？
- 为什么需要 Human-in-the-Loop（HitL）？
- 完整数据流是什么？三轨并行如何设计？
- 涉及的数据库表有哪些？

#### 核心知识点

**核心价值**：自动批改 Word 格式试卷，三轨并行处理三种题型（客观题/简答题/代码题）。

**为什么需要 HitL**（三个原因）：
1. **简答题有歧义**：不同表述正确回答了同一个知识点，AI 有时会低估（confidence < 0.7）
2. **代码题无法自动运行**：LLM 只能做质量评估，无法验证代码正确性
3. **成绩有法律效力**：教师必须有最终确认权

**设计原则**：AI 全自动批改 → 人工确认窗口 → 教师发布。

**三轨并行设计**

```python
# 三轨用 asyncio.gather 并行启动
objective_task = run_objective_track(parsed_questions)    # 第一轨：规则引擎
subjective_task = run_subjective_track(parsed_questions)  # 第二轨：LLM 语义评分
code_task = run_code_track(parsed_questions)              # 第三轨：LLM 代码评估

objective_results, subjective_results, code_results = await asyncio.gather(
    objective_task, subjective_task, code_task,
    return_exceptions=True,   # 某轨失败不影响其他轨
)
```

**完整数据流**

```
parse_word（解析Word）
  → load_questions_meta（加载DB题目元数据）
    → run_three_tracks（三轨并行批改）
      → aggregate_results（汇总+计算总分）
        → analyze_weak_points（薄弱点分析）
          → notify_teacher（通知教师）
            → teacher_review [interrupt] ← 关键！图在此暂停
              → apply_teacher_decision（approve/modify）
                → publish_results（写入DB）
```

**涉及的数据库表**：exams（试卷）、questions（试题）、scoring_points（得分点）、exam_submissions（提交状态）、exam_reviews（批改详情）。

---

### ② State 与 Prompts

#### 学习目标

- 五个 Pydantic 子模型分别是做什么的？
- ExamState 的 7 组字段？`parsed_questions` 为什么被两个节点共用？
- 四个 Prompt 分别对应什么场景？
- Think Tool 的价值？

#### 核心知识点

**五个 Pydantic 子模型**

```python
class ScoringPointResult(BaseModel):
    point_id: str = Field(description="得分点ID")
    earned: bool = Field(description="是否得分")
    evidence: str = Field(description="学员答案中支持得分的依据")

class SubjectiveReviewResult(BaseModel):
    question_id: str = Field(description="题目ID")
    total_score: int = Field(description="得分")
    full_score: int = Field(description="满分")
    confidence: float = Field(description="评分把握度 0~1")
    # confidence < 0.7 自动标记 needs_review=True
    point_results: list[ScoringPointResult] = Field(default_factory=list)
    overall_comment: str = Field(description="评语")

class TeacherDecision(BaseModel):
    action: str = Field(description="approve / modify")
    modifications: list[dict] = Field(default_factory=list)
    teacher_id: str = Field(description="教师ID")
```

**ExamState（7 组）**：

| 分组 | 字段 | 写入节点 |
|------|------|----------|
| 请求上下文 | exam_id, submission_id, word_file_path | API 初始化 |
| 解析结果 | parsed_questions | parse_word → load_questions_meta 覆盖 |
| 三轨结果 | objective_results, subjective_results, code_results | run_three_tracks |
| 汇总 | pre_review_summary | aggregate_results |
| 薄弱点 | weak_points, weak_points_summary | analyze_weak_points |
| HitL | teacher_notified, teacher_decision | notify_teacher / teacher_review |
| 发布 | final_results, published | apply_teacher_decision / publish_results |

**四个 Prompt**：SYSTEM_PROMPT（人设，严格按得分点评分）、SUBJECTIVE_REVIEW_PROMPT（简答题批改）、CODE_QUALITY_REVIEW_PROMPT（5 维度代码评估）、WEAK_POINTS_ANALYSIS_PROMPT（薄弱点分析）。

**Think Tool 的价值**：先自由推理再结构化评分，减少对"表述不同但实质正确"的误判。

---

### ③ Word 解析与元数据加载

#### 核心知识点

**Word 解析**

```python
def _sync_parse_word(word_path: str) -> list[ParsedQuestion]:
    doc = Document(word_path)
    for para in doc.paragraphs:
        # 正则识别题目开头
        if re.match(r"^(第?\s*[一二三四五六七八九十\d]+\s*[题、。.]|Q\.?\s*\d+)", para.text):
            # 识别题目类型和答案
            ...
        # 识别代码块
        if para.text.strip().startswith("```"):
            is_code = True

# 同步函数丢线程池，不阻塞事件循环
loop = asyncio.get_running_loop()
parsed_questions = await loop.run_in_executor(None, _sync_parse_word, word_path)
```

**元数据合并策略**：以 DB 题目列表为准，按题号匹配解析结果，找不到的填空字符串。

---

## 第二梯队：三轨并行

---

### ④ 客观题规则引擎（第一轨）

#### 核心知识点

```python
def _normalize_answer(answer: str) -> str:
    """标准化：大写→去空格逗号→排序，使排序无关的多选题选项等价"""
    return "".join(sorted(answer.upper().replace(" ", "").replace(",", "")))

# 精确比对
is_correct = _normalize_answer(student_ans) == _normalize_answer(correct_ans)
score = full_score if is_correct else 0
needs_review = False  # 客观题无需复核
```

---

### ⑤ 简答题 LLM 评分（第二轨）

#### 核心知识点

**Think Tool 两步流程**

```python
async def score_subjective(question, student_answer, scoring_points):
    # 第一步：自由推理分析（无结构化约束）
    think_prompt = f"分析学员答案是否覆盖了得分点：{scoring_points}"
    think_result = await llm.ainvoke(think_prompt)

    # 第二步：把推理结果追加到评分 Prompt → 结构化输出
    full_prompt = f"{think_result}\n\n请根据以上分析，给出结构化评分："
    result = await structured_llm.ainvoke(full_prompt)
    # result 是 SubjectiveReviewResult 类型

    return result
```

**confidence < 0.7 标记需复核**。每 3 题一组并行（平衡并发效率和 API 稳定性），组内 `asyncio.gather`，组间顺序执行。

---

### ⑥ 代码题质量评估（第三轨）

#### 核心知识点

**5 维度评估**：规范性、命名可读性、算法效率、异常处理、注释质量。

LLM 无法运行代码，所有代码题始终 `needs_review=True`，教师必须人工确认。

---

## 第三梯队：汇总与 HitL

---

### ⑦ 三轨汇总与薄弱点分析

#### 核心知识点

**aggregate_results**：合并三轨结果，按 question_no 排序，计算 total_score / score_rate / needs_review_count。

**analyze_weak_points**：有 knowledge_tag 的直接按标签聚合，无标签的让 LLM 推断知识点。

---

### ⑧ Human-in-the-Loop ⭐（核心范式）

#### 学习目标

- `interrupt()` 的工作原理是什么？
- 图暂停后如何恢复执行？
- 编译图时为什么要传 MemorySaver？

#### 核心知识点

```python
# 节点中暂停图执行
def teacher_review_node(state: ExamState) -> dict:
    state["teacher_notified"] = True
    interrupt("等待教师确认批改结果")
    # 图在此暂停，等待外部调用 Command(resume=decision) 恢复
    return {"teacher_decision": state["teacher_decision"]}

# 外部恢复执行
graph.ainvoke(
    Command(resume={"action": "approve"}),
    {"configurable": {"thread_id": "exam_submission_123"}}
)
```

**interrupt() 工作原理**
```
① 执行到 interrupt(value) → LangGraph 抛出 Interrupt 异常
② 完整 State 保存到 MemorySaver（按 thread_id）
③ 图进入"暂停"状态，ainvoke 返回
④ 外部调用 graph.ainvoke(Command(resume=decision), config)
   → 从 MemorySaver 恢复 State，从 interrupt 处继续
```

**关键约束**：编译图不传 `interrupt_before`，只在节点内调用 `interrupt()`。**必须绑定 MemorySaver**，否则暂停后 State 丢失。

---

### ⑨ 教师决策与发布

#### 核心知识点

```python
# 两种决策
if teacher_decision["action"] == "approve":
    # 直接采用 AI 分数
    final_results = ai_results
elif teacher_decision["action"] == "modify":
    # 按 modifications 列表覆盖对应题目
    final_results = apply_modifications(ai_results, teacher_decision["modifications"])

# 先删后插：幂等写入 exam_reviews
await db.execute("DELETE FROM exam_reviews WHERE submission_id = :id", {...})
for review in final_results:
    await db.execute("INSERT INTO exam_reviews (...) VALUES (...)", {...})
```

保留 `ai_score` 和 `teacher_score` 两个字段便于事后评估 AI 准确性。

---

## 第四梯队：装配与接口

---

### ⑩ 图装配

#### 核心知识点

```python
builder = StateGraph(ExamState)
builder.add_node("parse_word", parse_word_node)
builder.add_node("load_questions_meta", load_questions_meta_node)
builder.add_node("run_three_tracks", run_three_tracks_node)
# ... 9 个节点
builder.add_edge(START, "parse_word")
builder.add_edge("parse_word", "load_questions_meta")
# ... 线性链，无条件边
builder.add_edge("publish_results", END)

# 必须绑定 MemorySaver！interrupt 后需要持久化 State
graph = builder.compile(checkpointer=MemorySaver())
```

---

### ⑪ HTTP 接口

| 接口 | 说明 |
|------|------|
| POST /exam/submit | 学员提交 Word 试卷，返回 202+submission_id |
| GET /submissions/{id}/review | 教师查看预批改详情 |
| POST /submissions/{id}/confirm | 教师确认/修改批改结果（Command(resume=) 恢复） |
| GET /pending-reviews | 教师查看待确认列表 |

---

## 附录：核心机制总览

| 机制 | 实现方式 | 所在节点 |
|------|---------|---------|
| 三轨并行 | `asyncio.gather(return_exceptions=True)` | run_three_tracks |
| 规则引擎 | `_normalize_answer` 标准化+精确比对 | 第一轨 |
| Think Tool | 两步流程：自由推理→结构化评分 | 第二轨 |
| 置信度评估 | confidence < 0.7 标记 needs_review | 第二轨 |
| Human-in-the-Loop | interrupt() + Command(resume=) | teacher_review |
| 幂等写入 | 先删后插 | publish_results |

---

> **学习建议**：先理解"为什么需要三轨并行 + HitL"（①），再分别学习三轨的实现（④~⑥），最后重点理解 HitL 的 interrupt/resume 机制（⑧）——这是第六章的教学主线，也是 LangGraph 最强大的功能之一。