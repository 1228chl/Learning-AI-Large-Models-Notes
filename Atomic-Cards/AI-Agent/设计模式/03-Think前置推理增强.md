---
author: "XunZong"
created: "2026-07-30"
tags: ["AI-Agent", "LLM", "推理增强", "Think", "提示词"]
aliases: ["Think前置推理", "推理增强", "先想后答", "Chain-of-Thought"]
---

# Think 前置推理增强技巧

## 定义

**Think 前置推理** 是一种"先自由推理、再结构化输出"的 LLM 调用技巧——在让 LLM 输出结构化结果之前，先让它用自由文本做一轮宏观分析，再把这段思考作为上下文喂给后面的结构化生成步骤。

### 核心公式

```
Think增强 = 自由推理(宏观分析) → 结构化输出(精确结果) → 最终输出
```

### 直观理解

> 好比"先打草稿、再正式作答"——写作文之前先列提纲，演讲之前先理思路。直接让 LLM 输出结构化结果，它容易"只见树木不见森林"；先自由想一遍，它能看到全局，再输出结构化结果时质量更高。

## 为什么需要 Think

直接让 LLM 输出结构化结果的问题：

| 问题 | 表现 | Think 的解决 |
|:-----|:-----|:-------------|
| **只见树木不见森林** | 只关注局部细节，忽略整体模式 | 先做宏观分析，再看具体问题 |
| **遗漏关联** | 各维度问题相互独立，无法发现共同根因 | 先分析"问题之间是否存在共同模式" |
| **优先级判断不准** | 分不清哪些问题最重要 | 先分析"最影响第一印象的问题" |
| **输出质量不稳定** | 直接结构化输出时，有时深度不够 | 自由推理不受格式约束，可以深入思考 |

## 实现示例

### 第一步：Think 自由推理

在生成结构化诊断结果之前，先用普通 LLM（非结构化）做自由文本推理：

```python
# Think 提示：自由文本，不约束结构
DIAGNOSE_THINK_PROMPT = """在生成简历问题诊断清单之前，请先进行宏观分析。

【六维度评分汇总】
{dimension_scores_summary}

【已识别的原始问题列表】
{raw_issues}

请分析以下几点（中文，5-8句话）：
1. 这份简历最核心的短板是什么？（最多2个，直接影响竞争力）
2. 各维度问题之间是否存在共同模式或根本原因？
3. 声称的技能与实际项目经历描述之间是否存在明显落差？
4. 哪些问题最影响面试官的第一印象，应列为高优先级？

直接输出分析内容，不加任何前缀标签。"""
```

### 第二步：Think 执行（可失败）

```python
reasoning_trace = ""
try:
    think_llm = get_llm("resume", temperature=0)  # 普通模型（非结构化）
    think_resp = await think_llm.ainvoke([HumanMessage(content=think_prompt)])
    reasoning_trace = think_resp.text if hasattr(think_resp, "text") else str(think_resp.content)
except Exception as e:
    logger.warning("diagnose_think.failed", error=str(e))
    # Think 失败不影响主流程！
```

### 第三步：Think 结果作为上下文

```python
# 把 Think 结果拼进结构化生成的提示词
think_context = f"\n【宏观分析参考】\n{reasoning_trace}" if reasoning_trace else ""

prompt = DIAGNOSE_ISSUES_PROMPT.format(
    structured_summary=structured_summary,
    resume_text=resume_text,
    raw_issues=raw_issues,
) + think_context

# 调结构化 LLM 生成最终结果
structured_llm = get_structured_llm("resume", IssueList)
result: IssueList = await structured_llm.ainvoke([...])
```

## 关键设计

### Think 可失败

Think 步骤**失败不影响主流程**：

```python
try:
    reasoning_trace = await think_llm.ainvoke([...])
except Exception:
    # Think 失败：跳过，继续后面的结构化生成
    reasoning_trace = ""

# 有 Think 结果就拼进去，没有就不拼
think_context = f"\n【宏观分析参考】\n{reasoning_trace}" if reasoning_trace else ""
```

**为什么这样设计？** Think 是"锦上添花"——有它能提升质量，没有它主流程也能正常跑。把它设计为可失败的，保证了系统的鲁棒性。

### 与 Chain-of-Thought 的区别

| 对比 | CoT（思维链） | Think（前置推理） |
|:----|:-------------|:-----------------|
| **推理位置** | 推理和回答在同一轮 | 推理在结构化输出之前 |
| **输出约束** | 无约束，自由文本 | 推理自由，但后续输出受 Schema 约束 |
| **失败影响** | 可能输出错误答案 | 失败不影响主流程 |
| **适用场景** | 数学推理、逻辑题 | 评估、诊断类任务 |

## 评分 Rubric 配合

Think 推理常与评分 Rubric（分档评分标准）配合使用：

```python
# 评分 Rubric 示例
REVIEW_PROMPT = """请评审以下简历在【项目深度】维度的表现。
评分标准（0-100分）：
- 90-100：每个项目都有量化指标、明确的技术选型理由
- 70-89：大部分项目有量化数据，个人贡献基本清晰
- 50-69：项目描述偏泛，缺少量化数据
- 30-49：项目描述流水账，看不出技术深度
- 0-29：项目描述极度简陋或与岗位完全不相关"""
```

## 面试追问

**Q1（基础）**：Think 前置推理是什么设计思路？它是如何提升 LLM 输出质量的？
**回答要点**：
1. 先让 LLM 用自由文本做宏观分析，再输出结构化结果
2. 自由推理不受格式约束，可以深入思考整体模式
3. 把思考结果作为上下文，结构化生成时"有据可依"

**Q2（深挖）**：Think 步骤为什么设计为可失败的？如果失败，主流程如何处理？
**回答要点**：
1. Think 是"锦上添花"——有它提升质量，没有它主流程也能正常跑
2. Think 失败时，跳过推理，直接进行结构化生成
3. 这种设计保证了系统的鲁棒性，不会因为一个"增强"步骤导致整个流程崩溃

**Q3（实战）**：Think 和 CoT（思维链）有什么区别？各自适合什么场景？
**回答要点**：
1. CoT 推理和回答在同一轮，不可分离；Think 推理在结构化输出之前，可分离
2. CoT 适合数学推理、逻辑题；Think 适合评估、诊断类任务
3. Think 失败不影响主流程，CoT 失败可能输出错误答案

**Q4（边界）**：什么场景下 Think 前置推理反而会降低输出质量？
**回答要点**：
1. 简单任务：不需要宏观分析，Think 引入多余上下文
2. 事实性问答：直接检索+生成就够了，不需要推理
3. Think 的"宏观分析"可能引入偏见，让 LLM 过度关注某些方面

## 参考引用
- 需要理解评分 Rubric 设计的相关知识，参见 [评分Rubric设计](04-评分Rubric设计.md)
- 需要理解提示词工程核心原则的相关知识，参见 [提示词工程核心原则](../基础/03-提示词工程核心原则.md)
- 需要理解结构化输出中 Pydantic 模型作用的相关知识，参见 [Pydantic结构化输出](../LangChain/03-Pydantic结构化输出.md)