# 模拟面试 Agent：Prompts 全解析

> 源文件：`backend/agents/interview/prompts.py`（共 258 行）
> 对应课件：7.3 Prompts 全解析
> 前置依赖：`SYSTEM_PROMPT`、`TECH_BASE_GENERATE_PROMPT`、`WARMUP_PROMPT`、`TECH_BASE_PROMPT`、`PROJECT_PROMPT`、`CLOSING_PROMPT`、`EVALUATE_ANSWER_PROMPT`、`GENERATE_REPORT_PROMPT`

## 全文行号速查表

| 行号 | 代码/内容 | 角色 |
|:----:|:----------|:-----|
| 1~2 | `"""模拟面试 Agent - 提示词"""` | 模块文档字符串 |
| 3~11 | `SYSTEM_PROMPT` | 面试官角色人设（5 条规则） |
| 13~35 | `TECH_BASE_GENERATE_PROMPT` | 技术题生成提示词 |
| 37~43 | `WARMUP_PROMPT["opening"]` | 开场白提示词 |
| 46~57 | `INTRO_EVAL_TECH_FIRST_PROMPT` | 评价自我介绍 + 出第一道技术题 |
| 59~89 | `TECH_BASE_PROMPT` | 技术基础环节提示词（4 个变体） |
| 92~182 | `PROJECT_PROMPT` | 项目深挖环节提示词（5 个变体） |
| 184~198 | `CLOSING_PROMPT` | 反问环节提示词（2 个变体） |
| 200~203 | `STAGE_TRANSITION_PROMPTS` | 阶段过渡引导语 |
| 206~220 | `EVALUATE_THINK_PROMPT` | 评估前置推理提示词 |
| 223~236 | `EVALUATE_ANSWER_PROMPT` | 回答质量评估提示词 |
| 238~268 | `GENERATE_REPORT_PROMPT` | 五维度报告生成提示词 |

---

## 一、为什么需要 11 个提示词？

模拟面试 Agent 需要处理**五种不同的对话场景**，每种场景下 LLM 需要不同的上下文和输出格式：

| 场景 | 需要的提示词 | 输出方式 |
|:-----|:------------|:---------|
| 角色设定 | `SYSTEM_PROMPT` | 系统消息 |
| 出题 | `TECH_BASE_GENERATE_PROMPT` | 结构化 JSON |
| 开场白 + 自我介绍引导 | `WARMUP_PROMPT` | 自由文本 |
| 评价自我介绍 + 出第一题 | `INTRO_EVAL_TECH_FIRST_PROMPT` | 自由文本（三合一） |
| 技术题反馈 + 换题 | `TECH_BASE_PROMPT["ask_with_feedback"]` | 自由文本 |
| 技术题追问 | `TECH_BASE_PROMPT["followup"]` | 自由文本 |
| 项目深挖首问 | `PROJECT_PROMPT["new_project"]` | 自由文本 |
| 项目深挖追问（带反馈） | `PROJECT_PROMPT["followup_with_feedback"]` | 自由文本 |
| 项目综合题 | `PROJECT_PROMPT["synthesis"]` | 自由文本 |
| 回答质量评估 | `EVALUATE_THINK_PROMPT` + `EVALUATE_ANSWER_PROMPT` | 两步：推理+标签 |
| 面试报告生成 | `GENERATE_REPORT_PROMPT` | 结构化 Pydantic |

如果不拆分提示词，用一个巨长的提示词覆盖所有场景，会导致：
1. 上下文窗口浪费——不需要的规则也会占用 token
2. 输出格式混乱——"生成 JSON"和"自由对话"的要求互相冲突
3. 难以维护——改一个场景的提示词可能影响其他场景

---

## 二、`SYSTEM_PROMPT`：面试官人设（第 3~11 行）

```python
# prompts.py 第 3~11 行
SYSTEM_PROMPT = """你是一位经验丰富的 IT 公司技术面试官，正在对应届生或初级工程师候选人进行模拟面试，岗位为{position}。

【面试官角色要求】
- 语气专业但不严苛，让候选人感到适度紧张但不焦虑
- 每次只问一个问题，不连续抛出多个问题
- 对回答给予简短反应，不直接评判对错
- 不主动透露答案，可以用引导性提示
- 对于超出能力范围的问题，轻描淡写地跳过
- 面试结束前不暴露评分或评价结论"""
```

| 行号 | 代码 | 说明 |
|:----:|:-----|:-----|
| 3 | `SYSTEM_PROMPT = """..."""` | 多行字符串，`{position}` 占位符 |
| 5 | `岗位为{position}` | 动态占位，运行时填入目标岗位 |
| 7 | `语气专业但不严苛` | 平衡"真实感"和"友好度" |
| 8 | `每次只问一个问题` | 防止 LLM 连续抛出多个问题 |
| 9 | `不直接评判对错` | 模拟真实面试中的"嗯""好的"等反馈 |
| 10 | `不主动透露答案` | 防止面试官直接告诉学员正确答案 |
| 11 | `轻描淡写地跳过` | 对超出能力范围的问题不纠缠 |
| 12 | `不暴露评分或评价结论` | 在面试过程中不透露分数 |

---

## 三、`TECH_BASE_GENERATE_PROMPT`：技术题生成（第 13~35 行）

```python
# prompts.py 第 13~35 行
TECH_BASE_GENERATE_PROMPT = """你是一位{position}岗位的资深技术面试官。
请为该岗位生成{count}道技术面试题...

按 JSON 数组格式输出，每项格式：
{{"content": "题目内容", "difficulty": "medium/easy/hard", "tags": ["标签1"]}}

只输出 JSON 数组，不要任何其他文字。"""
```

| 行号 | 代码 | 说明 |
|:----:|:-----|:-----|
| 14 | `请为该岗位生成{count}道技术面试题` | 动态出题数量，默认 8 道 |
| 17~18 | 难度分布要求 | `中等60%, 简单20%, 困难20%` |
| 22~23 | 岗位方向强制出题 | AI/大模型方向必须包含 Transformer、RAG 等 6 类题 |
| 24~29 | 6 类必出题 | Transformer、过拟合、自回归、RAG、向量检索、LoRA |
| 31~33 | JSON 输出格式 | 每项 `{content, difficulty, tags}` |
| 34 | `只输出 JSON 数组` | 防止 LLM 输出额外解释文字 |

**`{{"content"}}` 双花括号**：Python 的 `str.format()` 中，`{` 和 `}` 需要转义为 `{{` 和 `}}` 才能输出字面花括号。

---

## 四、WARMUP 与过渡提示词

### 4.1 开场白（第 37~43 行）

```python
WARMUP_PROMPT = {
    "opening": """请生成模拟面试的欢迎开场白，邀请候选人自我介绍。
要求：
- 第一句以"欢迎来到{position}岗位的模拟面试"开头
- 自然友好，总共2-3句话
- 明确说"请先做个简单的自我介绍"，可提示包含学习背景、技术栈、感兴趣的方向""",
}
```

**为什么用字典结构？** 与 `TECH_BASE_PROMPT`、`PROJECT_PROMPT`、`CLOSING_PROMPT` 保持一致。

### 4.2 `INTRO_EVAL_TECH_FIRST_PROMPT`（第 46~57 行）

```python
INTRO_EVAL_TECH_FIRST_PROMPT = """候选人刚才的自我介绍如下：
{intro}

请以面试官身份，在同一条回复中完成以下三件事：
1. 用2-3句话中肯评价自我介绍
2. 一句自然过渡语，引导进入技术基础环节
3. 直接问出第一道技术题

语气自然，总共不超过5句话。"""
```

**三合一设计**：真实面试中，面试官评价完自我介绍后，自然过渡到技术题。如果拆成两次 LLM 调用，浪费一次调用和一轮对话。

### 4.3 `STAGE_TRANSITION_PROMPTS`（第 200~203 行）

```python
STAGE_TRANSITION_PROMPTS = {
    "project": "好的，技术基础题我们就到这里了。接下来，我们进入项目深挖环节...",
    "closing": "好的，我这边的问题差不多都问完了，进入最后一个环节。",
}
```

**使用时机**：`generate_response_node` 中 `stage_turns == 1` 且当前阶段不是 WARMUP/TECH_BASE 时拼接。

---

## 五、`TECH_BASE_PROMPT`：技术基础环节（第 59~89 行）

### 5.1 `ask_with_feedback`：反馈 + 换题

```python
"ask_with_feedback": """上一道题：{question}
候选人回答：{answer}
回答质量：{quality}

下一道题：{next_question}

请以面试官身份，在同一条回复中：
1. 先对上一道题的回答给出具体反馈
2. 自然过渡后，直接问出下一道题
总共不超过4句话"""
```

| 质量 | 反馈内容 | 示例 |
|:-----|:---------|:-----|
| `excellent` | 肯定亮点 + 1 个深化方向 | "你对注意力机制理解得很透彻，可以进一步思考为什么需要多头注意力？" |
| `adequate` | 肯定基本思路 + 1 个遗漏知识点 | "基本思路是对的，还可以补充位置编码的内容" |
| `weak` | 轻描淡写跳过 | "好的，我们换个话题" |
| `no_answer` | 简短提示思路 | "这道题主要考察的是 RAG 的基本流程，我们换下一题" |

### 5.2 `followup`：追问（第 78~86 行）

```python
"followup": """候选人对"{question}"的回答如下：
{answer}
候选人回答质量：{quality}（excellent=优秀）

请生成一个深入追问，要求：
- 基于候选人回答中提到的具体技术点追问
- 不重复相同问题
- 技术栈背景：{tech_stack}"""
```

**追问次数上限**：`MAX_FOLLOWUP_PER_QUESTION = 2`，同一道题最多追问 2 次。

### 5.3 `weak_transition` 与 `no_answer_hint`（第 88~89 行）

```python
"weak_transition":  "好的，我们换一个话题。",
"no_answer_hint":   """对于"{question}"，可以先从这个角度想想：它主要解决什么问题？我们换下一个话题。""",
```

---

## 六、`PROJECT_PROMPT`：项目深挖环节（第 92~182 行）

五个变体：

| 变体 | 触发时机 | 说明 |
|:-----|:---------|:-----|
| `new_project` | 开始深挖一个新项目 | 第 1 问，评估项目背景和参与度 |
| `followup_with_feedback` | 有反馈的追问 | 回答 `EXCELLENT` 或 `ADEQUATE` 时触发 |
| `followup` | 纯追问（无反馈） | 首问无反馈版 |
| `synthesis` | 所有项目深挖完毕 | 综合题"最复杂的技术问题" |
| `no_resume` | 无简历联动 | 兜底：问项目经验或设计题 |

**技术栈定向追问**（第 124~138 行）：`followup_with_feedback` 中包含根据技术栈选择追问方向的规则——RAG 项目问数据量级/分块/混合检索，LLM 微调项目问 LoRA 原理/数据集构建，通用方向问最大技术难点/选型理由。

---

## 七、`CLOSING_PROMPT`：反问环节（第 184~198 行）

```python
CLOSING_PROMPT = {
    "opening": """面试问题我们差不多问完了。最后这个环节，请问你有什么想了解的吗？""",
    "respond_question": """候选人提问如下：{question}
请以面试官身份给出回应，对提问表示欢迎，结合{position}岗位背景回答...""",
}
```

**回答可以适当模糊**：LLM 不是真实面试官，无法知道团队内部情况。提示词明确允许"可以适当模糊"。

---

## 八、评估提示词（两步流程）

### 8.1 `EVALUATE_THINK_PROMPT`（第 206~220 行）

```python
EVALUATE_THINK_PROMPT = """在评估这道面试题的回答质量之前，请先进行深入分析。

请分析以下几点（中文，4-6句话）：
1. 候选人具体说明了哪些技术要点？
2. 有哪些关键技术点完全未提及或一带而过？
3. 候选人是在真实理解基础上作答，还是在背诵模板答案？
4. 回答的技术深度和覆盖广度总体如何？"""
```

**无约束推理**：自由格式分析，不担心"格式对不对"。第一步分析"学员说了什么、没说什么、是否在背诵"，第二步基于分析给出质量标签。

### 8.2 `EVALUATE_ANSWER_PROMPT`（第 223~236 行）

```python
EVALUATE_ANSWER_PROMPT = """请只输出以下4个标签之一，不要任何其他内容：
- excellent：回答有具体技术细节/量化数据/原理解释，深度足够
- adequate：回答方向正确但缺乏深度，表述较笼统
- weak：回答方向偏差、过于表面或明显不理解
- no_answer：明确表示不知道、回答为空或内容无关"""
```

**严格的输出约束**：`"请只输出以下4个标签之一"`——LLM 的输出会被 `evaluate_answer_node` 用 `if "excellent" in quality_str` 这种字符串匹配处理，所以输出必须干净无歧义。

---

## 九、`GENERATE_REPORT_PROMPT`：报告生成（第 238~268 行）

```python
GENERATE_REPORT_PROMPT = """请基于以下模拟面试记录，生成五维度评估报告。

五个评估维度及权重：
1. 技术深度（35%）
2. 表达逻辑（20%）
3. 项目经验（25%）
4. 抗压反应（10%）
5. 整体印象（10%）"""
```

**`{conversation}` 截断 4000 字**：`generate_report_node` 中 `conversation_text[:4000]` 限制输入长度。超出 DeepSeek 上下文窗口的对话由历史摘要补充。

**五维度加权**：`overall_score = 技术深度×35% + 项目经验×25% + 表达逻辑×20% + 抗压反应×10% + 整体印象×10%`。

---

## 十、调用方式与依赖

| 节点 | 使用的提示词 | 调用方式 |
|:-----|:------------|:---------|
| `_generate_questions_by_llm` | `TECH_BASE_GENERATE_PROMPT` | `get_llm("interview").ainvoke` |
| `_respond_warmup` | `WARMUP_PROMPT["opening"]` | `get_llm("interview").ainvoke` |
| `_respond_tech_base` | `INTRO_EVAL_TECH_FIRST_PROMPT`、`TECH_BASE_PROMPT` | `get_llm("interview").ainvoke` |
| `_respond_project` | `PROJECT_PROMPT` 全部变体 | `get_llm("interview").ainvoke` |
| `_respond_closing` | `CLOSING_PROMPT` | `get_llm("interview").ainvoke` |
| `evaluate_answer_node` | `EVALUATE_THINK_PROMPT` + `EVALUATE_ANSWER_PROMPT` | `get_llm("qa").ainvoke`（两步） |
| `generate_report_node` | `GENERATE_REPORT_PROMPT` | `get_structured_llm("interview", InterviewReport).ainvoke` |

---

## 十一、`★` 设计亮点总结

`★ Insight ─────────────────────────────────────`
**11 个提示词=5 个场景×2 种输出方式+1 个系统角色**：
- 面试官对话场景：用 `get_llm("interview")`，温度 0.4~0.7，自由文本
- 评估场景：用 `get_llm("qa")`，温度 0，严格标签
- 报告场景：用 `get_structured_llm`，Pydantic 约束
- 不同场景用不同温度和不同输出约束，因为"对话需要创造力，评估需要确定性，报告需要结构化"
`─────────────────────────────────────────────────`

`★ Insight ─────────────────────────────────────`
**"三合一"提示词减少 LLM 调用次数**：
- `INTRO_EVAL_TECH_FIRST_PROMPT` 让一次调用完成"评价+过渡+出题"三件事
- `TECH_BASE_PROMPT["ask_with_feedback"]` 让一次调用完成"反馈+换题"
- 合并后每轮只需要 1 次 LLM 调用（评估+回应各一次），节省 50% 的 LLM 调用量
`─────────────────────────────────────────────────`

`★ Insight ─────────────────────────────────────`
**技术栈定向追问 = 面试官经验嵌入提示词**：
- 提示词中硬编码了 RAG 项目、LLM 微调项目、通用项目的追问方向
- 新增一种项目类型只需在 `PROJECT_PROMPT` 中添加一个追问方向块，无需修改代码逻辑
- 这种设计让提示词变成了"可维护的知识库"而非"一次性指令"
`─────────────────────────────────────────────────`