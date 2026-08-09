# 模拟面试 Agent：回答质量评估与 Think 工具

> 源文件：`backend/agents/interview/nodes.py` 第 300~368 行
> 对应课件：7.6 回答质量评估与 Think 工具
> 前置依赖：`evaluate_answer_node`、`EVALUATE_THINK_PROMPT`、`EVALUATE_ANSWER_PROMPT`、`AnswerQuality`

## 全文行号速查表

| 行号范围 | 函数/代码段 | 说明 |
|:---------|:-----------|:------|
| 300~303 | 分区注释 | 节点3：evaluate_answer |
| 304~368 | `evaluate_answer_node` | 回答质量评估（两步流程） |

---

## 一、为什么需要评估节点？

`evaluate_answer_node` 有两个职责：

1. **评估回答质量**：给学员上一条回答打 `AnswerQuality` 标签，供 `generate_response_node` 决定追问还是换题
2. **维护轮次计数**：`total_turn_count += 1`，`stage_turn_count += 1`

这两件事放在同一个节点里，确保计数和评估同步更新到 State。

---

## 二、跳过评估的两种情况（第 310~314 行）

```python
# nodes.py 第 310~314 行
if total_turns == 0 or current_stage == InterviewStage.WARMUP.value:
    return {
        "last_answer_quality": AnswerQuality.ADEQUATE.value,
        "total_turn_count": total_turns + 1,
        "stage_turn_count": state.get("stage_turn_count", 0) + 1,
    }
```

| 条件 | 说明 |
|:-----|:------|
| `total_turns == 0` | 首轮没有学员回答需要评估 |
| `current_stage == WARMUP` | 热身阶段是自我介绍，不需要评估 |

两种情况下都默认标记 `ADEQUATE`，只增加轮数计数。

---

## 三、空回答检测（第 319~324 行）

```python
# nodes.py 第 319~324 行
if not student_answer.strip() or student_answer.strip() in ["不知道", "不清楚", "没学过"]:
    return {
        "last_answer_quality": AnswerQuality.NO_ANSWER.value,
        "total_turn_count": total_turns + 1,
        "stage_turn_count": state.get("stage_turn_count", 0) + 1,
    }
```

**快速返回**：空回答和"不知道/不清楚/没学过"直接标记 `NO_ANSWER`，不调用 LLM 评估，节省一次 LLM 调用。

---

## 四、两步评估流程（第 330~360 行）

```python
# nodes.py 第 330~360 行
# 第一步：Think Tool 推理分析
reasoning_trace = ""
try:
    think_prompt = EVALUATE_THINK_PROMPT.format(question=question_text, answer=answer_text)
    think_llm  = get_llm("qa", temperature=0)
    think_resp = await think_llm.ainvoke([HumanMessage(content=think_prompt)])
    reasoning_trace = _msg_text(think_resp).strip()
except Exception as e:
    logger.warning("evaluate_think.failed", error=str(e))

# 第二步：主评估
think_context = f"\n\n【评估前分析】\n{reasoning_trace}" if reasoning_trace else ""
prompt = EVALUATE_ANSWER_PROMPT.format(question=question_text, answer=answer_text) + think_context

try:
    llm = get_llm("qa", temperature=0)
    response = await llm.ainvoke([HumanMessage(content=prompt)])
    quality_str = _msg_text(response).strip().lower()
    if "excellent" in quality_str or "优秀" in quality_str:
        quality = AnswerQuality.EXCELLENT.value
    elif "weak" in quality_str or "较弱" in quality_str:
        quality = AnswerQuality.WEAK.value
    elif "no_answer" in quality_str or "未作答" in quality_str:
        quality = AnswerQuality.NO_ANSWER.value
    else:
        quality = AnswerQuality.ADEQUATE.value
except Exception as e:
    logger.warning("evaluate_answer.failed", error=str(e))
    quality = AnswerQuality.ADEQUATE.value
```

| 步骤 | 行号 | 操作 | 说明 |
|:----:|:-----|:-----|:------|
| 第一步 | 332~339 | Think Tool 推理 | 用 `get_llm("qa")` 分析学员回答，自由格式 |
| 第一步(降级) | 339 | 推理失败时 `reasoning_trace=""` | 降级为直接评分 |
| 第二步 | 342~343 | 拼接推理上下文 | 推理成功时追加到评分 Prompt 末尾 |
| 第二步 | 345~357 | 主评估 | 用字符串匹配判断质量标签 |
| 第二步(降级) | 358~360 | 评估失败时 `quality=ADEQUATE` | 默认标记为"基本及格" |

**`get_llm("qa")` 而非 `get_llm("interview")`**：评估需要确定性输出，使用 `qa` 模型（temperature=0），而不是 `interview` 模型（temperature=0.4~0.7，更具创造力）。

**字符串匹配 vs 结构化输出**：评估结果只有 4 个标签，用 `if "excellent" in quality_str` 这种简单的字符串匹配即可，不需要 Pydantic 结构化输出。

---

## 五、调用方式与依赖

| 调用方 | 用途 |
|--------|------|
| `graph.py` | 条件边 `check_stage → evaluate_answer`（非 FINISHED 时） |

| 依赖 | 用途 |
|:-----|:-----|
| `get_llm("qa")` | Think Tool 推理 + 主评估（温度 0） |
| `EVALUATE_THINK_PROMPT` | 前置推理提示词 |
| `EVALUATE_ANSWER_PROMPT` | 主评估提示词 |
| `AnswerQuality` | 质量标签枚举 |

---

## 六、`★` 设计亮点总结

`★ Insight ─────────────────────────────────────`
**两步流程 = "System 1 → System 2" 的认知模型映射**：
- 第一步（Think Tool）：无约束推理，LLM 自由分析"学员说了什么、没说什么、是否在背诵"
- 第二步（主评估）：有约束评分，LLM 参考自己的分析输出 4 选 1 标签
- 先想后判，比直接让 LLM 输出标签准确率更高
- 这与 Exam Agent 的简答题评分（`SUBJECTIVE_THINK_PROMPT` + `SUBJECTIVE_REVIEW_PROMPT`）是同一模式
`─────────────────────────────────────────────────`

`★ Insight ─────────────────────────────────────`
**三层降级确保评估永不成为瓶颈**：
- 降级 1：推理失败 → 跳过第一步，直接评分（`reasoning_trace=""`）
- 降级 2：评估失败 → 默认 `ADEQUATE`，不阻断面试
- 降级 3：空回答/不知道 → 不调 LLM，直接标记 `NO_ANSWER`
- 即使 LLM 完全不可用，面试也能继续推进——这是"容错优先"的设计哲学
`─────────────────────────────────────────────────`

`★ Insight ─────────────────────────────────────`
**`get_llm("qa")` 复用而非新建**：
- 评估不调用 `get_llm("interview")`（面试官对话模型），而是复用 `"qa"` 模型
- 因为评估任务与 QA Agent 一样需要**确定性**输出，而非创造力
- 复用模型实例减少内存占用，同时 temperature=0 保证输出稳定
- 这是"按任务类型选择模型"而非"按 Agent 选择模型"的设计思路
`─────────────────────────────────────────────────`