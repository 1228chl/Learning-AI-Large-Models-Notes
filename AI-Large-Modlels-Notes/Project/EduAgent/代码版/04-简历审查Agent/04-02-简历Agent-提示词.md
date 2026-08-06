# 简历审查 Agent：提示词 — 从零理解

## 一、提示词的整体结构

`backend/agents/resume/prompts.py` 包含 6 组提示词：

```
SYSTEM_PROMPT                  → LLM 人设（所有节点共用）
EXTRACT_STRUCTURED_PROMPT      → 结构化提取
DIMENSION_REVIEW_PROMPTS       → 六维度评审（6 个独立提示）
DIAGNOSE_ISSUES_PROMPT         → 问题诊断
DIAGNOSE_THINK_PROMPT          → 诊断前宏观分析（先想后答）
GENERATE_SUMMARY_PROMPT        → 整体评价
```

## 二、系统提示

```python
SYSTEM_PROMPT = """你是一位经验丰富的 IT 行业职业顾问，专门为应届毕业生和初/中级工程师审查简历。
你的评审严格、客观、可操作，不给出模糊的夸奖，只给出具体的问题定位和修改建议。"""
```

**作用**：定义 LLM 的"人设"，作为 `SystemMessage` 放在每次对话最前。

## 三、结构化提取提示

```python
EXTRACT_STRUCTURED_PROMPT = """请从以下简历文本中提取结构化信息。

【简历原文】
{resume_text}

提取要求：
- 完整保留项目描述的原始文字，不要改写或压缩
- 技术栈列表每项单独一个
- 时间格式统一为 YYYY.MM - YYYY.MM
- 无法提取的字段填空字符串，不要填"未知"或"无"
- 量化亮点：只提取含数字的句子"""
```

`{resume_text}` 是占位符，代码里用 `.format()` 填充。

## 四、六维度评审提示

每个维度单独一个提示，但结构相同：

```python
DIMENSION_REVIEW_PROMPTS = {
    "project_depth": """请评审以下简历在【项目深度】维度的表现。

【评审重点】{focus}

【结构化摘要】
{structured_summary}

【简历原文（前3000字）】
{resume_text}

评分标准（0-100分）：
- 90-100：每个项目都有量化指标、技术选型理由、个人贡献
- 70-89： 大部分项目有量化数据，个人贡献基本清晰
- 50-69： 项目描述偏泛，缺少量化数据
- 30-49： 项目描述流水账
- 0-29：  项目描述极度简陋""",
    "tech_match": """...""",
    # 其他维度类似
}
```

**六个维度**：

| 维度键 | 名称 | 权重 | 评审重点 |
|--------|------|------|----------|
| `project_depth` | 项目深度 | 30% | 量化数据、技术选型、个人贡献 |
| `tech_match` | 技术匹配度 | 25% | 技术栈与目标岗位匹配 |
| `expression` | 表达规范性 | 15% | 动词开头、STAR 结构 |
| `structure` | 简历结构 | 15% | 模块完整性、排版 |
| `quantification` | 量化程度 | 10% | 性能指标、用户量 |
| `authenticity` | 真实可信度 | 5% | 表述是否夸大、时间线 |

## 五、问题诊断提示

```python
DIAGNOSE_ISSUES_PROMPT = """请生成简历的逐条问题诊断清单。

【各维度已发现问题】
{raw_issues}

输出要求：
1. 每条问题必须定位到简历的具体位置
2. 优先级：high=影响通过率 / medium=影响竞争力 / low=锦上添花
3. 建议必须具体可操作
4. 总数控制在 5-15 条"""
```

## 六、Think 提示（先想后答）

```python
DIAGNOSE_THINK_PROMPT = """在生成问题诊断清单之前，请先进行宏观分析。

【六维度评分汇总】
{dimension_scores_summary}

【已识别的原始问题列表】
{raw_issues}

请分析：
1. 这份简历最核心的短板是什么？
2. 各维度问题之间是否存在共同模式？
3. 哪些问题最影响面试官的第一印象？"""
```

**为什么要有 Think 提示？** 让 LLM 先整体思考再逐条诊断，质量比直接生成更高。

## 七、整体评价提示

```python
GENERATE_SUMMARY_PROMPT = """请为学员生成简历审查的整体评价报告。

【综合得分】{weighted_score} / 100

【高优先级问题】
{high_issues}

【目标岗位】{target_position}

生成要求：
1. 亮点：找出 2-3 个真实优势
2. 核心改进：提炼最重要的 2-3 个改进方向
3. 综合评语：1-2 句客观评价
4. 匹配度：评估与目标岗位的匹配程度"""
```

## 八、总结

```
提示词 = LLM 的"说明书"

系统提示     → 定义人设（你是谁）
提取提示     → 告诉 LLM 怎么提取信息
评审提示     → 告诉 LLM 按什么标准打分
诊断提示     → 告诉 LLM 怎么发现问题
Think 提示   → 告诉 LLM 先想再答
总结提示     → 告诉 LLM 怎么生成报告
```

**核心思想：每个提示词只做一件事，结构清晰，方便维护。**