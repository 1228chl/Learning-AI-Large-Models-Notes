# 试卷批改 Agent：题目元数据加载——`load_questions_meta_node` 深度解析

> 源文件：`backend/agents/exam/nodes.py` 第 191~267 行
> 对应课件：6.4 题目元数据加载（load_questions_meta_node）
> 前置节点：`parse_word_node`
> 涉及表：`questions`、`scoring_points`

## 一、为什么需要这个节点？

`parse_word_node` 只能从 Word 文档里提取**学员写了什么**（`student_answer`），但批改需要知道：

| 信息 | 来源 | parse_word 能拿到吗？ |
|:-----|:-----|:-------------------|
| `question_type`（单选/简答/代码） | DB | ❌ |
| `correct_answer`（正确答案） | DB | ❌ |
| `scoring_points`（得分点） | DB scoring_points 表 | ❌ |
| `score`（满分） | DB | ❌ |
| `knowledge_tag`（知识点标签） | DB | ❌ |
| `student_answer`（学员作答） | Word | ✅ |

**`load_questions_meta_node` 的职责**：把 DB 里的完整题目元数据和解析出的学员答案合并。

**合并策略**：以 DB 题目列表为准，按题号匹配解析结果，找不到的题目 `student_answer` 填空字符串。

---

## 二、四步实现总览

```
                        ┌──────────────────────────┐
                        │  parse_word_node 输出的    │
                        │  parsed_questions          │
                        │  (只有学员答案)             │
                        └───────────┬──────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────┐
│  load_questions_meta_node                                    │
│                                                             │
│  ①  SELECT * FROM questions WHERE exam_id = :exam_id        │
│     → 加载题目列表（7 个字段）                                │
│                                                             │
│  ②  SELECT * FROM scoring_points WHERE question_id IN (...) │
│     → 加载得分点（仅简答题有）                                │
│                                                             │
│  ③  sp_by_question = {qid: [得分点列表]}                     │
│     → 按 question_id 聚合得分点                              │
│                                                             │
│  ④  DB 题目为主，按题号合并解析结果                             │
│     → 输出完整 merged_questions                              │
│                                                             │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
             覆盖写入 parsed_questions
              (完整题目信息，供后续节点使用)
```

---

## 三、函数签名与数据流

```python
async def load_questions_meta_node(state: ExamState) -> dict:
    """
    从数据库加载试卷的完整题目元数据（含标准答案、得分点、知识点标签），
    与解析出的学员答案合并，覆盖写入 parsed_questions。
    """
    exam_id = state["exam_id"]
    parsed  = state["parsed_questions"]   # parse_word_node 的输出
```

**输入**：从 State 读 `exam_id` 和 `parsed_questions`（上一节点 `parse_word_node` 的输出）。

**输出**：`{"parsed_questions": merged_questions}`——**覆盖**写入 `parsed_questions` 字段。

**"覆盖"语义**：`parsed_questions` 在 State 里没有挂 reducer，默认是覆盖语义。所以这个节点把上一次的解析结果**整体替换**成完整结构。

---

## 四、第 1 步：加载题目列表（第 201~211 行）

```python
result = await session.execute(
    text("""
        SELECT id, question_no, question_type, content,
               correct_answer, score, knowledge_tag
        FROM questions
        WHERE exam_id = :exam_id
        ORDER BY question_no
    """),
    {"exam_id": exam_id},
)
questions = result.mappings().all()
```

**`result.mappings().all()`**：SQLAlchemy 2.0 的写法。`mappings()` 把每行转成**类字典对象**（`RowMapping`），可以用 `q["id"]`、`q["question_no"]` 按列名取值，比旧的 `row[0]` 按位置取值可读性好得多。

**用一条 SQL 覆盖 7 个字段**：单个查询把题目所有元数据一次取出，避免多次往返 DB。

**`ORDER BY question_no`**：保证题目顺序与试卷一致，后续合并节点的处理结果按此顺序输出。

---

## 五、第 2 步：加载得分点（第 214~230 行）

### 5.1 代码

```python
question_ids = [str(q["id"]) for q in questions]
scoring_points_rows = []
if question_ids:
    param_names = [f":qid_{i}" for i in range(len(question_ids))]
    qid_params  = {f"qid_{i}": qid for i, qid in enumerate(question_ids)}
    sp_result = await session.execute(
        text(f"""
            SELECT id, question_id, point_desc, point_score
            FROM scoring_points
            WHERE question_id IN ({", ".join(param_names)})
              AND is_active = TRUE
            ORDER BY question_id, id
        """),
        qid_params,
    )
    scoring_points_rows = sp_result.mappings().all()
```

### 5.2 为什么不用 `IN (:qids)` 传一个 list？

SQLAlchemy + asyncpg 在处理 UUID 数组参数时存在类型转换问题：传入 Python list 时 asyncpg 不能自动推断元素类型，需要显式指定 `::uuid[]`，但 SQLAlchemy 的 `text()` 绑定参数不支持这种语法。

**解决方案**：**动态展开成多个命名参数**。

```python
param_names = [f":qid_{i}" for i in range(len(question_ids))]
# 3 道题 → [":qid_0", ":qid_1", ":qid_2"]

qid_params = {f"qid_{i}": qid for i, qid in enumerate(question_ids)}
# 3 道题 → {"qid_0": "uuid-1", "qid_1": "uuid-2", "qid_2": "uuid-3"}
```

最终 SQL 变成：

```sql
WHERE question_id IN (:qid_0, :qid_1, :qid_2)
```

每个 UUID 单独作为一个**字符串**命名参数，asyncpg 按字符串类型处理，不需要显式类型转换。

`★ Insight ─────────────────────────────────────`
**这是"动态 SQL 参数展开"的经典模式**：
- SQL 的 `IN` 子句需要**固定数量**的占位符
- 但题目数量是**运行时才知道**的
- 解决：用列表推导式生成 `:qid_0 ~ :qid_N` 的命名参数，再用 `f-string` 拼进 SQL
- **注意**：这里拼的是 `:qid_xxx` 占位符名，**不是用户输入**，所以没有 SQL 注入风险——真正的值都通过 `qid_params` 参数绑定传入
`─────────────────────────────────────────────────`

### 5.3 其他细节

**`if question_ids:`**：防止空列表时执行 `IN ()`——空 `IN ()` 在 PostgreSQL 里是语法错误。

**`AND is_active = TRUE`**：只加载激活状态的得分点，软删除的得分点不参与评分。

**`ORDER BY question_id, id`**：先按题目分组，再按得分点 ID 排序，保证合并后的得分点列表顺序稳定。

---

## 六、第 3 步：按 question_id 聚合得分点（第 233~240 行）

```python
sp_by_question: dict[str, list] = {}
for sp in scoring_points_rows:
    qid = str(sp["question_id"])
    sp_by_question.setdefault(qid, []).append({
        "id":    str(sp["id"]),
        "desc":  sp["point_desc"],
        "score": sp["point_score"],
    })
```

**`setdefault(qid, []).append(...)`**：如果 `qid` 不在字典里，先设置为 `[]`，再 `append`。这是"按键分组"的惯用写法，等价于：

```python
if qid not in sp_by_question:
    sp_by_question[qid] = []
sp_by_question[qid].append(...)
```

**作用**：把线性表 `scoring_points_rows` 转成 `{question_id: [得分点列表]}` 的映射，方便第 4 步在遍历题目时 O(1) 查得每题的得分点。

**`str(sp["question_id"])`**：UUID 类型转字符串，作为字典 key。因为第 4 步的题目 id 也用 `str(q["id"])`，两者一致才能匹配。

---

## 七、第 4 步：以 DB 为主，合并解析结果（第 243~258 行）

### 7.1 建立索引

```python
parsed_by_no = {p["question_no"]: p for p in parsed}
```

把解析结果从 `list` 转成 `{题号: 解析dict}` 的映射，这样在遍历 DB 题目时可以 O(1) 查找对应解析结果，而不是对每个题目都线性扫描整个列表。

### 7.2 合并循环

```python
for q in questions:
    q_no = q["question_no"]
    merged_questions.append({
        "question_id":    str(q["id"]),
        "question_no":    q_no,
        "question_type":  q["question_type"],
        "content":        q["content"],
        "student_answer": parsed_by_no.get(q_no, {}).get("student_answer", ""),
        "correct_answer": q["correct_answer"] or "",
        "scoring_points": sp_by_question.get(str(q["id"]), []),
        "full_score":     q["score"],
        "knowledge_tag":  q["knowledge_tag"] or "",
    })
```

### 7.3 双重防御取值

```python
"student_answer": parsed_by_no.get(q_no, {}).get("student_answer", ""),
```

**双层 `.get()` 防御**：
- 外层 `.get(q_no, {})`：DB 有这道题，但解析结果里没有（学员可能没写到，或解析失败）→ 返回空 dict
- 内层 `.get("student_answer", "")`：拿到空 dict 或缺少字段 → 返回空字符串

**空字符串的两层含义**（课件第 2074~2077 行）：
1. Word 解析成功但学员这道题未作答（空白）
2. Word 解析失败，`parsed_questions` 为空列表

两种情况下 `student_answer` 都是空字符串，后续批改节点会：客观题比对失败得 0 分，简答题评语写"学员未作答"。

### 7.4 `or ""` 处理 NULL

```python
"correct_answer": q["correct_answer"] or "",
"knowledge_tag":  q["knowledge_tag"]  or "",
```

**`or ""`**：如果 DB 里是 `NULL`（None），用空字符串兜底。因为后续节点大量使用 `q["correct_answer"]` 做字符串比对，如果拿到 `None` 会报 `TypeError`。

### 7.5 完整的 merged_questions 结构

| 字段 | 来源 | 说明 |
|:-----|:-----|:-----|
| `question_id` | DB `questions.id` | 主键 UUID |
| `question_no` | DB `questions.question_no` | 题号（排序依据） |
| `question_type` | DB `questions.question_type` | 区分三轨批改策略 |
| `content` | DB `questions.content` | 题目内容 |
| `student_answer` | Word 解析结果 | 学员作答 |
| `correct_answer` | DB `questions.correct_answer` | 客观题标准答案 |
| `scoring_points` | DB `scoring_points` 表 | 简答题得分点列表 |
| `full_score` | DB `questions.score` | 满分 |
| `knowledge_tag` | DB `questions.knowledge_tag` | 知识点标签 |

---

## 八、`parsed_questions` 被两次写入

`parsed_questions` 字段经历了两次写入：

| 节点 | 写入的结构 | 字段数量 |
|:-----|:----------|:--------|
| `parse_word_node` | `[{question_no, header_text, student_answer}, ...]` | 3 个字段 |
| `load_questions_meta_node` | `[{question_id, question_no, question_type, content, student_answer, correct_answer, scoring_points, full_score, knowledge_tag}, ...]` | 9 个字段 |

**后续所有节点（三轨批改、汇总、薄弱点）都只读这次覆盖后的完整结构**，不再关心第一次的解析结果。

这就是为什么 `parsed_questions` 在 State 里设计成**覆盖语义**（无 reducer）——它的生命周期是"解析结果 → 完整结构"，最后一次写入才是最终形态。

---

## 九、`★` 设计亮点总结

### 9.1 以 DB 为准的合并策略

以 DB 题目为"主表"，解析结果为"从表"。DB 保证题目的完整性（数量、顺序、元数据），解析结果只贡献 `student_answer`。这样即使 Word 解析部分失败，批改流程仍能基于 DB 完整题目继续。

### 9.2 动态 IN 子句

`param_names = [f":qid_{i}" ...]` 是 SQLAlchemy + asyncpg 处理 UUID 列表的标准写法，绕过 `ANY(:qids::uuid[])` 的类型不兼容问题。

### 9.3 双层防御取值

`parsed_by_no.get(q_no, {}).get("student_answer", "")` 和 `correct_answer or ""` 都体现了"防御性取值"——面对缺失/空值不崩溃，用合理默认值兜底。

### 9.4 索引化加速

`parsed_by_no` 和 `sp_by_question` 都是把 list 转 dict 做映射，把合并时的查找从 O(n) 降到 O(1)。

### 9.5 覆盖语义配合图结构

`parsed_questions` 无 reducer + `parse_word → load_questions_meta` 固定顺序边，保证"解析 → 覆盖"的先后顺序不冲突，最终是完整结构。