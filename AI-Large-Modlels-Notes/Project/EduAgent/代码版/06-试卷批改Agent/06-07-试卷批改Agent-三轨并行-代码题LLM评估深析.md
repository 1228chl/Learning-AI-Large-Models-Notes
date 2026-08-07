# 试卷批改 Agent：三轨并行（3）——代码题 LLM 评估

> 源文件：`backend/agents/exam/nodes.py` 第 428~528 行
> 对应课件：6.7 三轨并行-代码题LLM评估
> 前置依赖：`get_llm`、`CODE_QUALITY_REVIEW_PROMPT`、`SYSTEM_PROMPT`

## 一、三函数调用链

代码题评估由三个函数组成，形成一条清晰的调用链：

```
_run_code_track（入口）→ 遍历代码题列表
    │
    └─ _review_one_code（单题）→ 组装参数，调用 LLM
         │
         └─ _llm_code_review（LLM 评分）→ 拼 Prompt → 调 LLM → 解析 JSON
```

| 函数 | 职责 |
|:-----|:------|
| `_run_code_track` | 入口，遍历代码题列表，逐题 await |
| `_review_one_code` | 单题批改，从题目字典取值，装配返回值 |
| `_llm_code_review` | 核心 LLM 调用，拼 Prompt、解析 JSON、降级 |

---

## 二、`_run_code_track`：入口（第 430~443 行）

```python
async def _run_code_track(questions: list[dict]) -> list[dict]:
    """
    代码题批改入口：顺序逐题批改（代码题一般数量少，不必并行）。
    """
    if not questions:
        return []
    results = []
    for q in questions:
        results.append(await _review_one_code(q))
    return results
```

**为什么代码题顺序执行不并行？** 代码题一般数量少（通常 1~3 道），不需要像简答题那样分组并行。而且代码题 LLM 调用可能涉及更长的上下文（代码块可能很大），顺序执行更稳定。

**`if not questions: return []`**：空列表快速返回，避免无意义的循环。

---

## 三、`_review_one_code`：单题批改（第 446~485 行）

### 3.1 函数签名

```python
async def _review_one_code(q: dict) -> dict:
    """
    批改「单道代码题」：交给大模型综合评估功能正确性 + 代码质量。

    参数 q：一道代码题的「合并题目字典」，读取：
        q["question_id"]     题目 ID
        q["question_no"]     题号
        q["content"]         题目内容
        q["student_answer"]  学员提交的代码
        q["correct_answer"]  标准答案（满分参考实现）
        q["full_score"]      该题满分
        q["knowledge_tag"]   知识点标签（可能缺省）
    返回：批改结果字典（含 score / confidence / needs_review / quality_feedback 等）。
    """
```

### 3.2 取值与调用

```python
student_code       = q["student_answer"]
reference_solution = q.get("correct_answer", "") or ""

feedback, score, confidence = await _llm_code_review(
    question_content=q["content"],
    student_code=student_code,
    full_score=q["full_score"],
    reference_solution=reference_solution,
)
```

**`q.get("correct_answer", "") or ""`**：防御性取值。`correct_answer` 可能为 `None`（DB 里 NULL），`or ""` 把 None 转成空字符串。

### 3.3 返回值结构

```python
return {
    "question_id":      q["question_id"],
    "question_no":      q["question_no"],
    "question_type":    "code",
    "knowledge_tag":    q.get("knowledge_tag", ""),
    "content":          q.get("content", ""),
    "student_answer":   student_code,
    "score":            score,
    "full_score":       q["full_score"],
    "confidence":       confidence,
    "needs_review":     confidence < 0.7,
    "quality_feedback": feedback,             # list[str]，逐条评语
    "ai_feedback":      "\n".join(feedback),  # 拼成单个字符串，方便展示
}
```

**`needs_review: confidence < 0.7`**：与简答题相同的阈值，LLM 把握度低于 0.7 时标记教师复核。

**`quality_feedback` vs `ai_feedback`**：同一个 `feedback` 存两份——`quality_feedback` 保留 `list[str]` 供下游程序处理，`ai_feedback` 拼成单个字符串供前端直接展示。这是"程序可读性"和"人可读性"并存的设计。

---

## 四、`_llm_code_review`：LLM 评分核心（第 488~528 行）

### 4.1 函数签名

```python
async def _llm_code_review(
    question_content:   str,
    student_code:       str,
    full_score:         int,
    reference_solution: str = "",
) -> tuple[list[str], int, float]:
    """
    大模型综合评估代码：功能正确性 + 代码质量。

    返回一个三元组 (feedback, score, confidence)：
        feedback：  list[str]，逐条评语
        score：     int，得分，范围 0 ~ full_score
        confidence：float，LLM 自报的评分把握度，范围 0 ~ 1
    """
```

**返回三元组**：`(feedback, score, confidence)`——评语列表、得分、把握度。这是 `_review_one_code` 唯一从 LLM 获取的信息通道。

### 4.2 拼 Prompt（第 503~507 行）

```python
prompt = CODE_QUALITY_REVIEW_PROMPT.format(
    question=question_content,
    code=student_code or "（未提交代码）",
    full_score=full_score,
)
```

**`student_code or "（未提交代码）"`**：如果学员没提交代码，提示 LLM 按空代码评分，而不是传空字符串。

#### 五维度评估

`CODE_QUALITY_REVIEW_PROMPT` 要求 LLM 从 5 个维度评估：

| 维度 | 评估内容 |
|:-----|:---------|
| ① 代码规范性 | 缩进、括号、分号等 |
| ② 命名可读性 | 变量名、方法名、类名 |
| ③ 算法效率 | 时间复杂度、空间复杂度 |
| ④ 异常处理 | 边界条件、错误处理 |
| ⑤ 注释质量 | 关键逻辑是否有注释 |

### 4.3 LLM 调用（第 509~513 行）

```python
llm      = get_llm("exam_code")
response = await llm.ainvoke([
    SystemMessage(content=SYSTEM_PROMPT),
    HumanMessage(content=prompt),
])
```

**`get_llm("exam_code")`**：从 `llm_factory` 获取代码评估专用的 LLM 实例。与简答题的 `get_llm("exam_subjective")` 不同，可以配置不同的模型或参数。

**两条消息**：`SystemMessage`（人设）+ `HumanMessage`（评分任务），与简答题的调用方式一致。

### 4.4 JSON 解析（第 516~528 行）

```python
raw = _get_message_content(response).strip().replace("```json", "").replace("```", "").strip()
try:
    data       = json.loads(raw)
    feedback   = data.get("feedback", [])
    score      = min(int(data.get("score", 0)), full_score)
    confidence = float(data.get("confidence", 0))
except Exception:
    feedback   = ["代码评估结果解析失败，请教师人工复核"]
    score      = 0
    confidence = 0.0
```

**`raw` 清理**：LLM 可能输出带 Markdown 代码围栏的 JSON（````json {"score": 8} ``` ````），需要去掉 ````json` 和 ```` ` 再解析。

**`score = min(int(data.get("score", 0)), full_score)`**：得分封顶到满分，防止 LLM 输出超过满分的分数。

**`except Exception` 降级**：JSON 解析失败时，不崩溃，返回 `score=0, confidence=0.0`。`confidence=0.0` 意味着 `needs_review=True`（因为 `< 0.7`），教师人工复核。

`★ Insight ─────────────────────────────────────`
**代码题与简答题的 LLM 调用方式不同**：
- 简答题：`with_structured_output(SubjectiveReviewResult)` — 用 function calling 强制输出符合 schema 的结构化结果
- 代码题：普通 `llm.ainvoke` + 手动 `json.loads` — 用 Prompt 引导 LLM 输出 JSON，自己解析
- 为什么？简答题的结构化输出有现成的 Pydantic 模型（`SubjectiveReviewResult`），代码题只需 `score` + `feedback` + `confidence` 三个字段，不值得为它单独建一个 Pydantic 模型
`─────────────────────────────────────────────────`

---

## 五、三轨对比总结

### 5.1 三轨批改方式对比

| 轨道 | 批改方式 | 并行策略 | 评估维度 | 输出结构 |
|:-----|:---------|:---------|:---------|:---------|
| 客观题 | 规则引擎 `_normalize_answer` | 无需并行 | 标准化后字符串相等 | `is_correct`, `score` |
| 简答题 | LLM 两步流程 | 每 3 题一组并行 | 逐得分点 | `point_results`, `confidence` |
| 代码题 | LLM 单步评分 | 顺序执行 | 5 个质量维度 | `quality_feedback`, `confidence` |

### 5.2 三轨共同的输出字段

| 字段 | 客观题 | 简答题 | 代码题 |
|:-----|:------|:-------|:-------|
| `question_id` | ✅ | ✅ | ✅ |
| `question_no` | ✅ | ✅ | ✅ |
| `question_type` | ✅ | ✅ | ✅ |
| `score` | `full_score` 或 0 | `total_score` | `score`（封顶） |
| `full_score` | ✅ | ✅ | ✅ |
| `needs_review` | 固定 `False` | `confidence < 0.7` | `confidence < 0.7` |
| `ai_feedback` | `"正确"` 或 `"正确答案：X"` | `overall_comment` | `\n`.join(feedback) |

统一的输出结构使后续的 `aggregate_results_node` 无需区分题型即可统一处理。

---

## 六、`★` 设计亮点总结

### 6.1 函数调用链清晰

`_run_code_track` → `_review_one_code` → `_llm_code_review`，三层职责明确：遍历、组装、核心 LLM 调用。

### 6.2 JSON 手动解析 vs 结构化输出

代码题用普通 `llm.ainvoke` + 手动 `json.loads`，而不是 `with_structured_output`。因为只需要 `score` + `feedback` + `confidence` 三个字段，不值得单独建 Pydantic 模型。

### 6.3 得分封顶

`min(int(data.get("score", 0)), full_score)` 防止 LLM 输出超过满分的分数。

### 6.4 JSON 解析降级

`except Exception` 捕获 JSON 解析失败，返回 `score=0, confidence=0.0` → `needs_review=True`，教师人工复核。

### 6.5 与简答题相同的 `needs_review` 阈值

`confidence < 0.7` 与简答题一致，统一标记标准。

### 6.6 `quality_feedback` 双格式存储

`list[str]` 供程序处理，`\n`.join 字符串供前端展示，兼顾程序可读性和人可读性。