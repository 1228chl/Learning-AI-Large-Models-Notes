# 试卷批改 Agent：三轨并行（1）——客观题规则引擎

> 源文件：`backend/agents/exam/nodes.py` 第 273~316 行
> 对应课件：6.5 三轨并行-客观题规则引擎
> 前置数据：`load_questions_meta_node` 合并后的完整题目字典

## 一、三轨并行总览

`run_three_tracks_node` 把题目按题型分成三轨并行批改：

```
merge_questions（6.4 合并结果）
        │
        ▼
┌─────────────────────────────────────────────┐
│  run_three_tracks_node                      │
│                                             │
│  ① 按 question_type 过滤题目                 │
│                                             │
│  ② asyncio.gather 三轨并行：                  │
│     ├─ 客观轨 _run_objective_track  (规则引擎) │   ← 本节
│     ├─ 简答轨 _run_subjective_track  (LLM)    │
│     └─ 代码轨 _run_code_track        (LLM)    │
│                                             │
└─────────────────────────────────────────────┘
```

**关键设计**：客观题用**规则引擎**（精确比对，零成本、零延迟、可解释），简答题和代码题才用 LLM（需要语义理解）。因为客观题答案是确定的，不需要"智能"。

---

## 二、`_normalize_answer`：答案标准化

### 2.1 代码

```python
def _normalize_answer(answer: str) -> str:
    """
    标准化答案字符串，消除大小写/空格/标点差异，使多选题选项顺序无关。

    处理步骤：
        1. 统一大写（A/a → A）
        2. 去除所有空格、中文逗号、英文逗号
           "A, B, C" → "ABC"，"A，B，C" → "ABC"
        3. 字符排序（多选题 "BA" 和 "AB" 视为等价）
           sorted("ABC") → ['A','B','C'] → "ABC"
    """
    cleaned = answer.upper().replace(" ", "").replace("，", "").replace(",", "")
    return "".join(sorted(cleaned))
```

### 2.2 三步链式处理

```python
answer.upper().replace(" ", "").replace("，", "").replace(",", "")
```

| 步骤 | 方法 | 示例 | 目的 |
|:-----|:-----|:-----|:-----|
| ① 统一大写 | `.upper()` | `"a" → "A"`, `"b" → "B"` | 消除大小写差异 |
| ② 去空格 | `.replace(" ", "")` | `"A B" → "AB"` | 消除空格差异 |
| ③ 去逗号 | `.replace("，", "").replace(",", "")` | `"D,B" → "DB"`, `"D，B" → "DB"` | 消除中英文逗号差异 |

### 2.3 为什么最后要排序？

多选题学员可能按任意顺序填入选项：`"BD"`、`"DB"`、`"D B"`、`"b,d"` 表达的都是同一个答案。统一排序后 `"BD"` 和 `"DB"` 都变成 `"BD"`（B < D），可以直接用 `==` 比较。

```python
return "".join(sorted(cleaned))
```

**`sorted("BD")`** → `['B', 'D']` → `"".join(...)` → `"BD"`

**结果**：任何打乱顺序的答案都归一化到同一个排序后的字符串。

`★ Insight ─────────────────────────────────────`
**这是"规范化（Normalization）"思想的体现**：
- 学员答案和正确答案可能有多种写法，但**语义相同**
- 目标：把"等价的不同写法"映射到"同一个标准形式"
- 归一化后，比较就从"复杂语义判断"退化为"简单字符串相等"
- 这是**确定性规则**，比让 LLM 判"BD 和 DB 是否一样"快且零成本
`─────────────────────────────────────────────────`

### 2.4 `_normalize_answer` 的效果矩阵

| 输入 | 处理后 | 说明 |
|:-----|:-------|:-----|
| `"A"` | `"A"` | 单选 |
| `"a"` | `"A"` | 大写 |
| `"BD"` | `"BD"` | 多选 |
| `"DB"` | `"BD"` | 顺序无关 |
| `"D,B"` | `"BD"` | 英文逗号 |
| `"b，d"` | `"BD"` | 中文逗号+小写 |
| `"A B C"` | `"ABC"` | 空格 |

---

## 三、`_run_objective_track`：客观题批改

### 3.1 函数签名

```python
async def _run_objective_track(questions: list[dict]) -> list[dict]:
    """
    客观题规则批改。虽然声明为 async，内部没有 await，
    但保持 async 统一接口方便在 asyncio.gather 中与其他两轨并行。
    """
```

**关键点**：这个函数**内部没有任何 `await`**，但声明为 `async`。为什么？

因为三轨要在 `asyncio.gather` 中并行调用，而 `gather` 只接受 awaitable（协程）。如果 `_run_objective_track` 是普通同步函数，`asyncio.gather(_run_objective_track(...))` 会报错。保持 `async` 统一接口，三轨的调用方式一致。

### 3.2 核心比对逻辑

```python
for q in questions:
    student_ans = _normalize_answer(q["student_answer"])
    correct_ans = _normalize_answer(q["correct_answer"])
    is_correct  = (student_ans == correct_ans)
```

**三步走**：
1. 标准化学员答案
2. 标准化正确答案
3. 字符串相等判断

**注意**：比对的是**标准化后**的字符串，不是原始答案。所以 `student_answer="D,B"` 和 `correct_answer="BD"` 能正确判为正确。

### 3.3 输出结构

```python
results.append({
    "question_id":    q["question_id"],
    "question_no":    q["question_no"],
    "question_type":  q["question_type"],
    "knowledge_tag":  q.get("knowledge_tag", ""),
    "content":        q.get("content", ""),
    "student_answer": q["student_answer"],
    "correct_answer": q["correct_answer"],
    "is_correct":     is_correct,
    "score":          q["full_score"] if is_correct else 0,
    "full_score":     q["full_score"],
    "needs_review":   False,          # 客观题不需要教师复核
    "ai_feedback":    "正确" if is_correct else f"正确答案：{q['correct_answer']}",
})
```

**注意**：`student_answer` 和 `correct_answer` 存的是**原始值**（不是标准化后的），因为前端展示需要原始答案。标准化只用于内部比对。

| 字段 | 值 | 说明 |
|:-----|:---|:-----|
| `is_correct` | `True/False` | 是否答对 |
| `score` | `full_score` 或 `0` | 答对满分，答错 0 分 |
| `needs_review` | 固定 `False` | 客观题结果确定，无争议 |
| `ai_feedback` | `"正确"` 或 `"正确答案：X"` | 学员反馈文案 |

**`score = q["full_score"] if is_correct else 0`**：客观题是**全有或全无**评分——答对得满分，答错得 0 分，没有部分分。

### 3.4 为什么 `needs_review` 固定为 False？

客观题的答案比对是**确定性规则**——标准化后相等就是对，不等就是错。不存在 LLM 那样的"把握度"问题。所以不需要标记教师复核。

**对比**：简答题的 `needs_review = result.confidence < 0.7`（低把握度才标记），因为 LLM 评分不确定。客观题永远不需要。

### 3.5 统一输出结构的意义

后续 `aggregate_results_node` 统一处理三轨结果时，每道题的结构相同，可以直接合并排序。

虽然三轨的批改方式不同（规则/LLM/LLM），但**输出结构完全一致**（`question_id, score, needs_review, ai_feedback...`）。这使得后续的汇总节点不需要区分题型就能统一处理。

---

## 四、`★` 设计亮点总结

### 4.1 规则引擎 vs LLM 的选择

| 题型 | 批改方式 | 原因 |
|:-----|:---------|:-----|
| 客观题 | 规则引擎 | 答案确定，精确比对零成本 |
| 简答题 | LLM | 需要语义理解 |
| 代码题 | LLM | 需要评估正确性和质量 |

**不是所有题都用 LLM**——能用规则解决的坚决不用 LLM，省成本、省延迟、可解释。

### 4.2 答案标准化消除差异

`_normalize_answer` 一次处理大小写、空格、中英文逗号、选项顺序 4 类差异，把"语义等价的答案"归一化到同一形式，使比对退化为简单的字符串相等。

### 4.3 `async` 统一接口

即使内部无 `await`，也声明为 `async`，保证三轨能在 `asyncio.gather` 中统一并行调用。

### 4.4 统一输出结构

三轨输出结构一致，后续汇总节点无需区分题型即可统一处理。