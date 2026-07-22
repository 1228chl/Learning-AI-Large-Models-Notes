# 第四章 简历审查 Agent 学习笔记

## 目录
- [4.1 全景与数据流](#41-全景与数据流)
- [4.2 State与数据模型](#42-state与数据模型)
- [4.3 提示词](#43-提示词)
- [4.4 PDF解析与结构化提取](#44-pdf解析与结构化提取)
- [4.5 六维度并行评审](#45-六维度并行评审)
- [4.6 问题诊断与整体评价](#46-问题诊断与整体评价)
- [4.7 持久化与图装配](#47-持久化与图装配)
- [4.8 API接口与端到端](#48-api接口与端到端)

---

## 4.1 全景与数据流

### 4.1.1 Agent 做什么

简历审查 Agent 是课程中开发的第一个真实 Agent。一句话概括：学员上传一份 PDF 简历，系统自动给出一份专业的审查报告。

报告包含三个核心部分：

1. **六维度评分**：项目深度、技术匹配度、表达规范性、简历结构、量化程度、真实可信度，每维度 0-100 分，加权出一个综合分。
2. **逐条问题诊断**：定位到简历的具体位置（如"项目经历-电商系统-第2句"），标注优先级（high/medium/low），并给出可操作的修改建议。
3. **整体评价**：核心亮点、最重要的改进方向、综合评语、与目标岗位的匹配度。

这个 Agent 的几个鲜明特点：
- **全自动、一条直线**：8个节点顺序执行，没有分支、没有人介入、没有断点续传，是最简单的 Agent 形态，适合入门。
- **结构化输出贯穿全程**：每一步 LLM 的产出都是严格的 Pydantic 结构，而不是自由文本。
- **并行是性能关键**：六维度评分是6次独立的 LLM 调用，用 `asyncio.gather` 并行，把总耗时从"6次相加"压成"1次最慢的"。

### 4.1.2 HTTP 请求流程

从用户视角看整个流程：

```
① 学员 POST /resume/upload（带 PDF 文件 + JWT）
│
▼
② API 把文件存到本地 /tmp，在 resume_reviews 表插入一条记录（status=processing）
│
▼
③ API 立即返回 202 + review_id（不等审查完成！）
│  同时在后台启动 LangGraph 图执行（异步任务）
▼
④ 学员拿着 review_id 轮询 GET /resume/reviews/{review_id}
│
├── 还在审查 → 返回 {status: "processing"}
└── 审查完成 → 返回完整报告（六维度+诊断+评价）
```

**关键设计**：上传接口不会"卡住"等审查跑完（审查要调好几次大模型，约30-60秒）。它把任务丢到后台异步任务，立刻返回 review_id，让前端轮询。这正是"后台任务 + GC 保护"和"202 Accepted"的真实应用。

### 4.1.3 8节点流水线

后台启动的那张"图"，内部是一条直线流水线，每个节点读取 State、做一件事、把结果写回 State：

```
START
│
▼ ① upload_to_minio （本地模式空跑，占位）
▼ ② download_pdf （本地模式空跑，占位）
▼ ③ extract_text PDF → raw_text、page_count
▼ ④ extract_structured raw_text → structured（结构化简历JSON）
▼ ⑤ run_six_dimensions structured + raw_text → dimension_scores、weighted_score
│   （6个维度LLM调用并行！）
▼ ⑥ diagnose_issues 汇总各维度问题 → issues（带优先级，排序）
▼ ⑦ generate_summary 综合一切 → summary（亮点/改进/评语/匹配度）
▼ ⑧ save_results 把 structured/scores/issues/summary 写入 resume_reviews
│
▼
END
```

**节点详细说明表**：

| # | 节点 | 干什么 | 写入 State |
|---|------|--------|-----------|
| ① | upload_to_minio | 本地模式空跑（原为上传对象存储，已简化） | — |
| ② | download_pdf | 本地模式空跑（文件已在本地 /tmp） | — |
| ③ | extract_text | 用 PyMuPDF 提取 PDF 文本，处理双栏布局 | raw_text, page_count |
| ④ | extract_structured | LLM 把原始文本提取成结构化简历 | structured |
| ⑤ | run_six_dimensions | **并行**评6个维度，算加权分 | dimension_scores, weighted_score |
| ⑥ | diagnose_issues | 汇总问题、去重、标优先级、排序 | issues |
| ⑦ | generate_summary | 生成整体评价 | summary |
| ⑧ | save_results | 写入数据库、清理临时文件 | （持久化） |

### 4.1.4 对应回"Agent = 图"心智模型

回顾基础概念：一个 Agent = State + Node + Edge（+ 可选 Checkpointer）。简历 Agent 正好是这个模型最干净的体现：

- **State** = `ResumeState`（一个 TypedDict）：贯穿8个节点的"工单"，前面填 PDF 路径，中间逐步填上文本、结构化数据、评分、问题，最后填上评价。
- **Node** = 8个节点函数：每个都遵循约定——接收 State、返回"要更新的字段"字典。
- **Edge** = 8条固定边（START -> ① -> ② -> ... -> ⑧ -> END）：没有条件边，因为这是一条直线。
- **Checkpointer** = 无：这是一次性任务，不需要记忆或断点续传，所以 `compile()` 时不传 checkpointer。

**心智模型**：简历 Agent 就是"搭一条直线图"的放大版——只不过把节点里的简单逻辑，换成了"调大模型做结构化提取/评分"的真实业务。

### 4.1.5 本章要创建的文件

| 文件路径 | 作用 | 在哪节 |
|---------|------|--------|
| backend/agents/resume/state.py | State 与所有 Pydantic 数据模型 | 4.2 |
| backend/agents/resume/prompts.py | 各阶段提示词 | 4.3 |
| backend/agents/resume/nodes.py | 8个节点函数 | 4.4/4.5/4.6/4.7 |
| backend/agents/resume/graph.py | 图装配 | 4.7 |
| backend/api/v1/resume.py | 上传/查询/删除/列表接口 | 4.8 |

### 面试题（4.1）

1. 简历审查 Agent 的核心功能是什么？它的报告包含哪三部分？
2. 为什么上传接口要返回 202 状态码而不是 200？这个设计解决了什么问题？
3. 8个节点的执行顺序是什么？哪两个节点是"空跑"的，为什么保留它们？
4. 六维度评分为什么能并行？串行和并行的耗时差异有多大？
5. 简历 Agent 对应"Agent = 图"心智模型的哪三个要素？为什么没有 Checkpointer？
6. 前端如何获取审查结果？轮询的机制是怎样的？
7. 本章要创建的文件有哪些？各自的作用是什么？

---

## 4.2 State与数据模型

### 4.2.1 为什么先定义数据模型

构建一个 Agent，最好的起点是先把"数据长什么样"定下来。原因有二：

1. **每一步 LLM 的产出都是结构化数据**：提取结构化简历、六维度评分、问题清单、整体评价，每一步 LLM 都不是吐自由文本，而是吐一个严格的对象。这些对象的"模板"就是 Pydantic 模型（通过 `with_structured_output` 绑定）。
2. **State 是贯穿全程的"工单"**：8个节点共享一份 `ResumeState`，前面的节点把结果填进去、后面的节点读出来用。

所以本节定义两类东西：
- ① 各步 LLM 输出的 Schema（提取/评分/诊断/评价）
- ② 主 State（`ResumeState`）

### 4.2.2 结构化提取模型详解

**EducationItem（单条教育经历）**：
```python
class EducationItem(BaseModel):
    school: str = Field(description="学校名称")
    major: str = Field(description="专业名称")
    degree: str = Field(description="学历：本科/专科/硕士等")
    duration: str = Field(description="在校时间，如 2020.09 - 2024.06")
    gpa: str = Field(default="", description="GPA 或成绩（可选）")
```

两个关键点：
- `Field(description=...)` 不只是注释，它会被发给大模型。`with_structured_output` 在底层把这些描述变成 Function Calling 的参数说明，等于在告诉 LLM"这个字段该填什么"。描述写得越清楚，提取越准。
- `default=""` / `default_factory=list` 表示可选字段：LLM 提取不到时用默认值（空串/空列表），不会报错。`default_factory=list` 用于列表类型（不能直接写 `default=[]`，那会让所有实例共享同一个列表，是 Python 的经典坑）。

**ProjectItem（单条项目经历）**：
```python
class ProjectItem(BaseModel):
    name: str = Field(description="项目名称")
    role: str = Field(description="担任角色，如：后端开发/全栈/负责人")
    duration: str = Field(description="项目时间，如 2023.06 - 2023.12")
    tech_stack: list[str] = Field(description="使用的技术栈列表")
    description: str = Field(description="项目描述原文（保留原始表述）")
    highlights: list[str] = Field(default_factory=list, description="量化亮点句子列表")
```

**WorkItem（单条工作/实习经历）**：类似的结构，包含 company、position、duration、tech_stack、description 字段。

**ResumeStructured（完整简历）**：
```python
class ResumeStructured(BaseModel):
    name: str = Field(description="姓名")
    phone: str = Field(default="", description="手机号")
    email: str = Field(default="", description="邮箱")
    target_position: str = Field(default="", description="求职意向岗位")
    education: list[EducationItem] = Field(default_factory=list)
    skills_raw: str = Field(default="", description="技能栏原始文本")
    skills_list: list[str] = Field(default_factory=list, description="解析后的技术标签列表")
    projects: list[ProjectItem] = Field(default_factory=list)
    work_experience: list[WorkItem] = Field(default_factory=list)
    certificates: list[str] = Field(default_factory=list, description="证书列表")
    self_intro: str = Field(default="", description="个人简介/自我评价原文")
```

### 4.2.3 评审/诊断/评价模型详解

**DimensionScore（单维度评分）**：
```python
class DimensionScore(BaseModel):
    dimension: str = Field(default="", description="维度名称（代码层覆盖，LLM可留空）")
    score: int = Field(description="得分 0-100")
    weight: float = Field(default=0.0, description="权重（代码层覆盖，LLM可填0）")
    issues: list[str] = Field(default_factory=list, description="该维度问题列表")
    suggestions: list[str] = Field(default_factory=list, description="改进建议列表")
```

关键设计：`dimension`/`weight` 给了默认值且注释写着"代码层覆盖"——维度名和权重由代码填（来自 4.5 的 SIX_DIMENSIONS 表），不需要 LLM 操心，LLM 只管打 score、列 issues、给 suggestions。

**IssueItem + IssueList（问题诊断）**：
```python
class IssueItem(BaseModel):
    priority: str = Field(description="优先级：high/medium/low")
    dimension: str = Field(description="所属维度")
    description: str = Field(description="问题描述（1句话）")
    location: str = Field(description="问题在简历中的定位")
    suggestion: str = Field(description="具体修改建议（可操作）")

class IssueList(BaseModel):
    items: list[IssueItem]
```

**重要技巧**：`with_structured_output` 要求顶层是一个**对象**，不能直接是一个"裸列表"。所以不能让 LLM 直接返回 `list[IssueItem]`，而要包一层 `IssueList { items: list[IssueItem] }`。这是用结构化输出生成"列表"时的常见做法。

**ResumeSummary（整体评价）**：
```python
class ResumeSummary(BaseModel):
    highlights: list[str] = Field(description="2-3条核心亮点")
    core_improvements: list[str] = Field(description="2-3条最重要的改进方向")
    overall_comment: str = Field(description="1-2句综合评语")
    fit_assessment: str = Field(description="对目标岗位的匹配度评估（1句话）")
```

### 4.2.4 主 State：ResumeState

`ResumeState` 是一个 `TypedDict`，17个字段跨7组，按"数据流阶段"分组，正好对应各节点的产出：

```python
class ResumeState(TypedDict):
    # ── 请求上下文 ──
    messages: Annotated[list[BaseMessage], add_messages]  # 对话消息（追加合并）
    student_id: str
    tenant_id: str
    review_id: str                                          # resume_reviews 表的 UUID
    pdf_minio_path: str                                     # 对象存储路径（本地模式留空）
    pdf_local_path: str                                     # 本地临时文件路径（真正用的）
    
    # ── 解析中间结果 ──
    raw_text: str                                           # extract_text 产出：PDF 全文
    page_count: int                                         # PDF 页数
    
    # ── 结构化提取结果 ──
    structured: Optional[dict]                              # extract_structured 产出
    
    # ── 六维度评审结果 ──
    dimension_scores: list[dict]                            # run_six_dimensions 产出
    weighted_score: float                                   # 加权综合得分 0-100
    
    # ── 逐条问题诊断 ──
    issues: list[dict]                                      # diagnose_issues 产出
    
    # ── 整体评价 ──
    summary: Optional[dict]                                 # generate_summary 产出
    
    # ── 降级标记 ──
    fallback_used: bool
    structured_output: Optional[dict]
```

**重要设计决策**：State 里存的是 `dict`（如 `structured: Optional[dict]`），而不是 Pydantic 对象。因为节点里 LLM 返回 Pydantic 对象后，会调 `.model_dump()` 转成普通字典再存进 State——这样整个 State 都是可 JSON 序列化的普通数据，方便存库和传输。

### 4.2.5 模块自测

直接运行 `python -m backend.agents.resume.state` 验证：
- 嵌套模型能正常构建、`model_dump()` 转成纯字典
- `dimension`/`weight` 默认留空，等代码层填
- `IssueList` 包装正常（顶层对象 + items 列表）
- 必填字段缺失会被 Pydantic 拦下

### 面试题（4.2）

1. 为什么 Agent 开发要先定义数据模型？有哪些好处？
2. `Field(description=...)` 在结构化输出中起到什么双重作用？
3. 为什么 `default_factory=list` 不能写成 `default=[]`？
4. IssueList 为什么要包装一层 `items: list[IssueItem]`，而不是直接让 LLM 返回列表？
5. DimensionScore 中 dimension 和 weight 字段为什么给了默认值？为什么不要求 LLM 填写？
6. ResumeState 为什么存 dict 而不是 Pydantic 对象？这样设计的好处是什么？
7. ResumeState 的 17 个字段可以分成哪 7 组？每组对应什么阶段？
8. 模块自测验证了哪四个关键点？

---

## 4.3 提示词

### 4.3.1 提示词的角色

如果说节点是"动作"、数据模型是"表格"，那提示词就是指挥大模型做事的"剧本"。简历 Agent 每次调 LLM，都要给它一段提示词，告诉它"现在做什么、按什么标准、注意什么"。

集中管理原则：所有提示词集中放在 `prompts.py`，而不是散在各个节点里。好处是：
- 提示词是最需要反复调优的部分，集中管理后，调提示词不用动业务代码
- 一眼能看全、好对比

提示词里有形如 `{resume_text}` 的占位符，运行时用 `.format(resume_text=实际文本)` 填入真实数据。

### 4.3.2 系统提示与提取提示

**系统提示（SYSTEM_PROMPT）**：定义大模型的"人设"，作为 `SystemMessage` 放在每次对话最前面：
```python
SYSTEM_PROMPT = """你是一位经验丰富的 IT 行业职业顾问，专门为应届毕业生和初/中级工程师审查简历。
你的评审严格、客观、可操作，不给出模糊的夸奖，只给出具体的问题定位和修改建议。"""
```

**提取提示（EXTRACT_STRUCTURED_PROMPT）**：用于 `extract_structured` 节点，占位符 `{resume_text}`：
```python
EXTRACT_STRUCTURED_PROMPT = """请从以下简历文本中提取结构化信息。
【简历原文】
{resume_text}
提取要求：
- 完整保留项目描述的原始文字，不要改写或压缩
- 技术栈列表每项单独一个（如 Spring Boot、MySQL，不合并）
- 时间格式统一为 YYYY.MM - YYYY.MM（如写"至今"则保留"至今"）
- 无法提取的字段填空字符串，不要填"未知"或"无"
- 量化亮点：只提取含数字的句子（如"提升30%"、"10万DAU"）"""
```

**设计分工**：提示词只规定"怎么提取"，不规定"输出什么字段"——输出结构由 `ResumeStructured` Schema 通过 `with_structured_output` 保证。提示词管"内容要求"，Schema 管"格式约束"。

### 4.3.3 六维度评分提示（rubric 设计）

这是本节的重点。六个维度各有一段独立的评分提示，统一放在一个字典 `DIMENSION_REVIEW_PROMPTS` 里（键是维度标识，如 `project_depth`）。

每段提示的精髓是**评分标准（rubric）**——把 0-100 分分档写清楚每一档长什么样，让 LLM 有明确的尺子可依，而不是凭感觉打分。

**六维度评分标准权重表**：

| 维度(key) | 中文名 | 权重 | 评分重点 |
|-----------|--------|------|---------|
| project_depth | 项目深度 | 0.30 | 项目是否有量化数据、技术选型理由、个人贡献、难点解决 |
| tech_match | 技术匹配度 | 0.25 | 技术栈是否与目标岗位匹配，技能描述是否有层次 |
| expression | 表达规范性 | 0.15 | 动词开头、STAR结构、无错别字、无主语省略歧义 |
| structure | 简历结构 | 0.15 | 模块完整性、排版逻辑、信息密度、重要内容是否放前面 |
| quantification | 量化程度 | 0.10 | 性能指标、用户量、优化幅度等量化数据的使用情况 |
| authenticity | 真实可信度 | 0.05 | 表述是否夸大、技术深度描述是否与经验年限匹配 |

**权重设计思路**：项目深度（0.30）和技术匹配度（0.25）占大头——对工程师简历，这两项最关键。权重之和正好为 1.0，用于最后算加权综合分。

**评分 rubric 示例（项目深度）**：
```python
"project_depth": """请评审以下简历在【项目深度】维度的表现。
...
评分标准（0-100分）：
- 90-100：每个项目都有量化指标、明确的技术选型理由、清晰的个人贡献和难点解决
- 70-89： 大部分项目有量化数据，个人贡献基本清晰
- 50-69： 项目描述偏泛，缺少量化数据，个人贡献不明确
- 30-49： 项目描述流水账，看不出技术深度
- 0-29： 项目描述极度简陋或与岗位完全不相关"""
```

**为什么把评分标准写这么细？** 因为大模型打分如果没有标尺，结果会飘忽不定、难以复现。把每一档的特征写明，相当于给 LLM 一把"刻度尺"，让不同简历的评分有一致的依据——这是用 LLM 做"评估打分"类任务的关键技巧。

### 4.3.4 Think 提示的设计

**Think 提示（DIAGNOSE_THINK_PROMPT）**：这是一个特别的设计。在生成"结构化的问题清单"之前，先让 LLM 用**自由文本**做一轮宏观分析（最核心短板是什么、问题间有无共同根因、技能与经历是否有落差）。

```python
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

**Think 提示的设计思路**：直接让 LLM 输出结构化结果，它容易"只见树木不见森林"。所以先用一段自由推理（Think）让它"想一想全局"，再把这段思考作为上下文喂给后面的结构化诊断——相当于"先打草稿、再正式作答"，能显著提升诊断质量。这是一种轻量的"推理增强"技巧，在后面几个 Agent 里会反复见到。

### 4.3.5 完整的提示词体系

共6个提示词：

| 提示词 | 占位符 | 用于节点 | 类型 |
|--------|--------|---------|------|
| SYSTEM_PROMPT | 无 | 所有节点 | 系统消息 |
| EXTRACT_STRUCTURED_PROMPT | {resume_text} | extract_structured | 提取 |
| DIMENSION_REVIEW_PROMPTS | {focus}, {structured_summary}, {resume_text} | run_six_dimensions | 六维度评分（6个键） |
| DIAGNOSE_ISSUES_PROMPT | {structured_summary}, {resume_text}, {raw_issues} | diagnose_issues | 问题诊断 |
| GENERATE_SUMMARY_PROMPT | {structured_summary}, {scores_summary}, {weighted_score}, {high_issues}, {target_position} | generate_summary | 整体评价 |
| DIAGNOSE_THINK_PROMPT | {dimension_scores_summary}, {raw_issues} | diagnose_issues（Think前置） | 推理增强 |

### 面试题（4.3）

1. 为什么提示词要集中管理在单独的文件中，而不是散落在各节点里？
2. 结构化提取提示词中，提示词和 Schema 的分工是什么？谁管"内容要求"，谁管"格式约束"？
3. 什么是评分 rubric 设计？为什么它在 LLM 评估类任务中如此重要？
4. 六维度评分提示中三个占位符 {focus}、{structured_summary}、{resume_text} 分别起什么作用？
5. Think 提示是什么设计思路？它是如何提升诊断质量的？
6. 六维度的权重是如何分配的？为什么项目深度和技术匹配度权重最高？
7. Think 提示失败是否会影响主流程？为什么这样设计？
8. 提示词中的占位符机制是如何工作的？运行时用什么方法填充？

---

## 4.4 PDF解析与结构化提取

### 4.4.1 节点通用约定

回顾 2.4：每个节点都是一个函数，遵循同一个约定——接收当前 State，返回一个字典（只含要更新的字段），LangGraph 自动把它合并进 State。简历 Agent 的节点全是 `async def`（因为要 `await` 调大模型/数据库）。

### 4.4.2 两个"本地空跑"节点

前两个节点 `upload_to_minio_node` 和 `download_pdf_node`，在本地模式下**什么都不做**，直接返回空字典 `return {}`。

为什么不直接删掉它们？两个原因：
1. 保留它们让图结构与真实代码完全一致，不偏离原始代码。
2. 它们标明了"这里原本是对象存储的位置"——将来若要接入云存储（OSS/S3），只需在这两个节点里填实现，图结构不用改。这是一种"预留扩展点"的工程习惯。

### 4.4.3 extract_text：PDF文本提取（技术要点）

**双栏布局处理**：很多简历是双栏排版（左栏放基本信息/技能，右栏放项目/经历）。如果直接按默认顺序读，会把左右两栏的文字交错在一起，破坏语义。

核心逻辑：
1. 用 PyMuPDF（导入名 `fitz`）逐页读取文本块 `page.get_text("blocks")`
2. 每个 block 是 7 元组 `(x0, y0, x1, y1, text, block_no, block_type)`，`b[6]==0` 是文字块
3. 按横坐标 `x0` 把块分到左半/右半，判断是否双栏（左右都够多 + 右侧占比 > 30%）
4. 双栏时先按 y 排好读完左栏，再读右栏；单栏直接按 y 从上到下读
5. 多页之间插入 `---PAGE BREAK---` 标记

**线程池不阻塞事件循环**：`_sync_extract_text` 是同步阻塞的（文件 I/O + 解析）。直接在 async 节点里调用会阻塞事件循环，所以用 `run_in_executor` 丢到线程池：
```python
loop = asyncio.get_running_loop()
result = await loop.run_in_executor(None, _sync_extract_text, pdf_path)
```

**文字过少兜底**：提取文字 < 200 字，多半是扫描件/图片 PDF。不引入 OCR 重依赖（PaddleOCR 太重），仅记警告，让后续节点用已有文本继续尝试。这是"保持轻量、优雅降级"的取舍。

### 4.4.4 extract_structured：结构化提取（第一次调大模型）

**超长截断**：简历一般 1-2 页，截前 4000 字防止超出 context 且省 token：
```python
text_for_llm = raw_text[:4000] if len(raw_text) > 4000 else raw_text
```

**重试机制**：`with_structured_output`（底层 Function Calling）偶尔会"偷懒"——模型不调用工具、而是直接用文字回复，这时返回的是 `None`。所以判 None + 重试 2 次：
```python
for attempt in range(2):
    try:
        result = await structured_llm.ainvoke([...])
        if result is None:
            raise ValueError("structured output returned None")
        structured_dict = result.model_dump()
        break
    except Exception as e:
        if attempt == 0:
            await asyncio.sleep(1)  # 等1秒重试
        else:
            # 两次都失败 → 降级为空结构
```

**降级处理**：两次都失败时，返回空结构兜底，不让整个流程崩：
```python
if structured_dict is None:
    structured_dict = ResumeStructured(name="未能提取").model_dump()
```

### 面试题（4.4）

1. 节点的通用约定是什么？返回值是什么格式？
2. 两个"本地空跑"节点为什么保留？它们体现了什么工程习惯？
3. PyMuPDF 提取文本时，如何检测和处理双栏布局？判断双栏的算法是什么？
4. 为什么同步的 PDF 解析要用 `run_in_executor` 丢到线程池？直接调用会有什么问题？
5. 提取文字过少（<200字）时为什么只告警而不引入 OCR？这体现了什么设计取舍？
6. 结构化提取节点的重试机制是怎样的？为什么 `with_structured_output` 会返回 None？
7. 提取失败时如何降级处理？为什么不让整个流程崩掉？
8. 提取节点中 `text_for_llm` 为什么要截断到 4000 字？

---

## 4.5 六维度并行评审

### 4.5.1 为什么要并行

六维度评分，本质是**6次相互独立的 LLM 调用**——项目深度怎么评，和技术匹配度怎么评，互不依赖。

- **串行**：每次 LLM 约 5-10 秒，6 个就是 30-60 秒，用户要干等。
- **并行**：既然它们互相独立，完全可以同时发出去——用 `asyncio.gather` 把 6 个协程一起 await，总耗时约等于"最慢的那一个"（5-10 秒），而不是 6 个相加。

串行图示：评1 -> 评2 -> 评3 -> 评4 -> 评5 -> 评6（总耗时 = 6次相加）
并行图示：评1┐ 评2┤ 评3┤ 评4┤ 评5┤ 评6┘ -> `asyncio.gather` 同时进行（总耗时 ≈ 最慢的1次）

一个 `gather` 把这个 Agent 最慢的环节提速近 6 倍，是本章的性能重点。

### 4.5.2 六维度定义表

```python
SIX_DIMENSIONS = [
    {"key": "project_depth",    "name": "项目深度",   "weight": 0.30, "focus": "..."},
    {"key": "tech_match",       "name": "技术匹配度", "weight": 0.25, "focus": "..."},
    {"key": "expression",       "name": "表达规范性", "weight": 0.15, "focus": "..."},
    {"key": "structure",        "name": "简历结构",   "weight": 0.15, "focus": "..."},
    {"key": "quantification",   "name": "量化程度",   "weight": 0.10, "focus": "..."},
    {"key": "authenticity",     "name": "真实可信度", "weight": 0.05, "focus": "..."},
]
```

- `key` 用来从 `DIMENSION_REVIEW_PROMPTS` 字典里取对应提示
- `name`/`weight` 会被填进 `DimensionScore`（"维度名和权重由代码填，LLM 只管打分"）
- `focus` 填进提示词的 `{focus}` 占位符

### 4.5.3 run_six_dimensions 节点

核心是内层函数 `review_one_dimension` + `asyncio.gather`：

```python
async def run_six_dimensions_node(state: ResumeState) -> dict:
    structured_summary = _build_structured_summary(structured)  # 精简摘要，省token
    
    async def review_one_dimension(dim: dict) -> dict:
        # 每个维度独立评审，内含2次重试
        ...
        for attempt in range(2):
            try:
                result = await structured_llm.ainvoke([...])
                d = result.model_dump()
                d["dimension"] = dim["name"]   # 代码层填：中文维度名
                d["weight"] = dim["weight"]    # 代码层填：权重
                return d
            except Exception as e:
                if attempt == 0:
                    await asyncio.sleep(1)      # 第一次失败：等1秒重试
                else:
                    return _empty_dimension_score(dim)  # 第二次仍失败：降级为50分
    
    # 六维度并行
    tasks = [review_one_dimension(dim) for dim in SIX_DIMENSIONS]
    dimension_scores = await asyncio.gather(*tasks)
    
    # 加权综合分 = Σ(得分 × 权重)
    weighted_score = sum(d["score"] * d["weight"] for d in dimension_scores)
    return {"dimension_scores": list(dimension_scores), "weighted_score": round(weighted_score, 2)}
```

关键点：
- `tasks = [review_one_dimension(dim) for dim in SIX_DIMENSIONS]` 先创建6个协程（此时还没执行）
- `await asyncio.gather(*tasks)` 把6个协程一起跑、等全部完成
- 单维度失败不影响其他维度：每个维度自己 try/重试/降级，某个挂了只影响它自己
- 加权分计算公式：`sum(score * weight)`，因为权重和为 1.0，结果天然落在 0-100

### 4.5.4 两个辅助函数

**`_build_structured_summary`**：把结构化简历浓缩成几行摘要（姓名/意向/学历/技能/项目数），评审时传摘要而非全文，省 token、也让 LLM 抓重点。

**`_empty_dimension_score`**：维度评审失败时的降级结果——给50分（中性）、标注"该维度评审失败，建议人工复核"。

### 面试题（4.5）

1. 为什么六维度评分要并行而不是串行？串行和并行的耗时差异有多大？
2. `asyncio.gather` 的工作原理是什么？`tasks = [...]` 创建协程和 `await asyncio.gather(*tasks)` 执行之间有什么区别？
3. 六维度定义表 SIX_DIMENSIONS 中，key、name、weight、focus 分别起什么作用？
4. 加权综合分是如何计算的？为什么权重之和为 1.0？
5. 单维度评审失败时如何处理？为什么说"单维度失败不影响其他维度"？
6. `_build_structured_summary` 的作用是什么？为什么它能省 token？
7. 维度评审失败时降级的结果是什么？为什么给 50 分而不是 0 分？
8. 用假 LLM 测试时，验证了哪三个关键点？

---

## 4.6 问题诊断与整体评价

### 4.6.1 这两步做什么

到 4.5 为止，有了六维度评分，但每个维度的问题还是零散的。这两个节点负责"收口"：

- **diagnose_issues（问题诊断）**：把六维度里发现的问题汇总、去重、定位、标优先级，生成一份用户能直接照着改的清单。
- **generate_summary（整体评价）**：综合结构化信息、评分、问题，生成面向学员的总结（亮点、核心改进、综合评语、岗位匹配度）。

### 4.6.2 diagnose_issues 四步流程

**① 汇总各维度问题**：先把六维度各自发现的 issues 收集起来，作为诊断的输入素材。

**② Think 前置推理**：先用一段自由文本让 LLM 做宏观分析，再把这段思考作为上下文喂给下一步：
```python
reasoning_trace = ""
try:
    think_llm = get_llm("resume", temperature=0)  # 普通模型（非结构化）
    think_resp = await think_llm.ainvoke([HumanMessage(content=think_prompt)])
    reasoning_trace = think_resp.text if hasattr(think_resp, "text") else str(think_resp.content)
except Exception as e:
    logger.warning("diagnose_think.failed", error=str(e))
    # Think 失败不影响主流程
```

**③ 结构化生成问题清单**：把 Think 结果拼进提示词，调结构化 LLM 生成 IssueList：
```python
prompt = DIAGNOSE_ISSUES_PROMPT.format(...) + think_context
try:
    structured_llm = get_structured_llm("resume", IssueList)
    result: IssueList = await structured_llm.ainvoke([...])
    issues = [item.model_dump() for item in result.items]
except Exception as e:
    # 降级：直接用各维度问题，统一标 medium
    issues = [{"priority": "medium", ...} for dim in dimension_scores for issue in dim.get("issues", [])]
```

**④ 按优先级排序**：把问题按 high -> medium -> low 排序，让最该改的排在最前：
```python
priority_order = {"high": 0, "medium": 1, "low": 2}
issues.sort(key=lambda x: priority_order.get(x.get("priority", "low"), 2))
```

### 4.6.3 generate_summary：整体评价

最后一个 LLM 节点。它把前面所有结果"喂"给 LLM，生成面向学员的总结。

关键步骤：
1. 从 issues 里挑出高优先级问题（最多5条）
2. 把维度分整理成文字
3. 填进 `GENERATE_SUMMARY_PROMPT` 的占位符
4. 调结构化 LLM 生成 `ResumeSummary`

和结构化提取一样，这个节点也要防"结构化输出返回 None"——而且它最容易中招：它的提示词是"请生成整体评价报告"这种生成型措辞，DeepSeek 有时会直接用文字回复、不调用工具。所以同样判 None + 重试2次，两次都失败才用默认评价兜底。

### 面试题（4.6）

1. diagnose_issues 节点的四步流程是什么？每一步的作用是什么？
2. Think 前置推理为什么是可失败的？失败后主流程如何处理？
3. 结构化生成问题清单失败时，降级策略是什么？为什么要统一标 medium？
4. 按优先级排序的代码中，`priority_order` 映射和 `sort(key=...)` 的技巧是什么？
5. generate_summary 节点中，从 issues 里挑出了哪些问题？为什么要限制最多5条？
6. 为什么 generate_summary 节点最容易中"结构化输出返回 None"的坑？
7. 提示词的时间线推理规则中，为什么"项目时间落在工作经历区间内"是正常的，不得标记为矛盾？
8. 离线测试验证了哪三个关键点？

---

## 4.7 持久化与图装配

### 4.7.1 save_results：持久化

第8个、也是最后一个节点。它把审查的全部结果写进 `resume_reviews` 表，并清理临时 PDF。

**往 JSONB 列写要先 json.dumps**：State 里存的是 Python dict，但通过 `text()` 参数化写入时，要先用 `json.dumps` 把 dict 转成 JSON 字符串，PG 再把这个字符串存成 JSONB：
```python
"scores": json.dumps(
    {"dimension_scores": state.get("dimension_scores", []), "weighted_score": state.get("weighted_score", 0)},
    ensure_ascii=False,  # 关键：让中文以原文存储，而不是 \uXXXX 转义
)
```

`ensure_ascii=False` 很重要——不加的话中文会被转成 `张三` 这种转义形式，虽然功能正常但存进去不可读。加上它，数据库里存的就是"张三"。

**用原生 SQL 写 JSONB 列**：使用 `AsyncSessionLocal` 配合 `text()` 执行原生 SQL，而不是通过 ORM 模型。这样更直接地控制 JSONB 写入。

### 4.7.2 graph.py：8个节点8条固定边

建图三步：`StateGraph(State)` 创建、`add_node` 加节点、`add_edge` 连边、最后 `compile()`。

简历 Agent 是一条直线，所以边也是顺次相连：
```python
builder = StateGraph(ResumeState)

# 注册8个节点
builder.add_node("upload_to_minio", upload_to_minio_node)
builder.add_node("download_pdf", download_pdf_node)
# ... 共8个节点

# 顺次连边
builder.add_edge(START, "upload_to_minio")
builder.add_edge("upload_to_minio", "download_pdf")
# ... 8条边
builder.add_edge("save_results", END)

# 编译。不传 checkpointer：一次性任务，不需要断点恢复
return builder.compile()
```

**编译无 Checkpointer**：简历审查是一次性任务，跑完就出报告，不需要"记住上次聊到哪"，也不需要断点续传。所以编译时不挂 checkpointer，图执行完即结束。

### 面试题（4.7）

1. save_results 节点为什么需要先 `json.dumps` 再写入 JSONB 列？`ensure_ascii=False` 的作用是什么？
2. 写入 JSONB 时，为什么 `ensure_ascii=False` 很重要？
3. graph.py 中建图的三步分别是什么？如何注册节点和连接边？
4. 为什么 `compile()` 时不传 checkpointer？一次性任务和需要多轮记忆的任务有什么区别？
5. 8个节点之间有多少条边？为什么没有条件边？
6. 在 graph.py 中，节点名和节点函数是如何关联的？为什么每个节点都有独立的名称字符串？
7. save_results 节点清理临时 PDF 文件有什么意义？
8. 如果将来要接入云存储，应该如何修改代码？

---

## 4.8 API接口与端到端

### 4.8.1 接口总览

`resume.py` 提供4个接口，把前面写好的 Agent 暴露成 HTTP 服务：

| 方法 | 路径 | 作用 |
|------|------|------|
| POST | /resume/upload | 上传 PDF，触发异步审查，返回 202 + review_id |
| GET | /resume/reviews/{id} | 轮询查询状态/结果 |
| DELETE | /resume/reviews/{id} | 删除审查记录 |
| GET | /resume/reviews | 列出历史记录 |

核心是"上传立即返回、后台异步审查、前端轮询"模式。

### 4.8.2 upload：上传接口（两个重要工程细节）

**后台任务的 GC 保护**：`asyncio.create_task` 创建的任务，如果没有变量持有它的强引用，可能被垃圾回收（GC）提前杀掉。用模块级集合持有所有后台任务的引用：
```python
_background_tasks: set[asyncio.Task] = set()  # 模块级集合，持有强引用防GC

task = asyncio.create_task(graph.ainvoke(initial_state))
_background_tasks.add(task)                    # 加入集合（强引用）
task.add_done_callback(_on_task_done)          # 完成后回调（清理+移除引用）
```

`_on_task_done` 回调在任务结束时触发，负责：从集合移除任务、删临时 PDF、若任务失败/被取消则把记录标为 `failed`。

**线程本地图（thread-local graph）**：图实例 `build_resume_graph()` 编译一次即可复用，但多线程并发时共享一个实例可能有竞争。用 `threading.local()` 给每个线程一份独立的图：
```python
_graph_local = threading.local()

def _get_graph():
    if not hasattr(_graph_local, "graph"):
        _graph_local.graph = build_resume_graph()
    return _graph_local.graph  # 每个线程拿到自己的图实例
```

### 4.8.3 get_review：轮询查询（状态机+超时兜底）

查询接口是个小状态机：
- **processing**：审查还在跑 -> 返回 `{status: "processing"}`，让前端继续轮询
- **done**：完成 -> 返回完整报告
- **failed**：失败 -> 返回错误信息
- **不存在/无权限**：404

**超时兜底**：万一后台任务因服务重启中断，记录会永远卡在 `processing`。查询时检查"距上次更新是否超过15分钟"，超了就标记 `failed`：
```python
if row["status"] == "processing":
    elapsed = (datetime.now(timezone.utc) - last_ts).total_seconds()
    if elapsed >= RESUME_REVIEW_TIMEOUT_SECONDS:  # 15分钟
        await _mark_review_failed(review_id, "审查任务超时或被中断")
        return {"review_id": review_id, "status": "failed", ...}
    return {"review_id": review_id, "status": "processing"}
```

**JSONB 自动反序列化**：从 JSONB 列读出来时，asyncpg 驱动已经自动把 JSON 反序列化成 Python dict/list 了，不需要再 `json.loads`（写要序列化、读已自动反序列化）。

### 4.8.4 delete 与 list：越权防护

**delete_review**：删除时 WHERE 条件带上 `student_id`——只能删自己的记录，防止越权删别人的。返回 204（No Content）；`rowcount == 0` 说明记录不存在或不属于自己，返回 404。

**list_reviews**：列出本人记录，按时间倒序。直接用 JSONB 查询 `(scores::jsonb ->> 'weighted_score')::float` 从 JSONB 列里取出综合分，不必把整个 scores 读出来再解析。

### 面试题（4.8）

1. resume.py 提供哪4个接口？每个接口的方法和路径是什么？
2. 什么是 GC 保护？为什么后台任务需要 GC 保护？`_background_tasks` 集合的作用是什么？
3. 什么是线程本地图（thread-local graph）？为什么需要它？
4. 查询接口有几个状态？每个状态返回什么内容？
5. 超时兜底机制是如何工作的？超时阈值是多少？
6. 为什么写 JSONB 要 `json.dumps`，读 JSONB 却不需要 `json.loads`？
7. 删除接口是如何实现越权防护的？`rowcount == 0` 表示什么？
8. 列表接口中如何直接从 JSONB 列取出综合分？为什么这样做效率更高？
9. 上传接口返回 202 而不是 200 有什么含义？
10. 端到端测试时，如果 DeepSeek Key 没配置，审查结果会怎样？

---

## 4.9 拓展：常见疑问解答（resume.py）

### 核心概念理解

**Q: resume.py 到底是什么？它和简历 Agent 是什么关系？**
A: resume.py 是后端的 HTTP 接口层——它把写好的简历 Agent "包装成"几个网址（接口），让外界能通过 HTTP 来调用。前端永远不直接碰那个 Agent，它们之间只通过 HTTP 请求/响应交流。

**Q: 上传响应里为什么看不到审查结果，只有 review_id？**
A: 因为上传是 202 + 后台异步。审查任务被丢到后台就立刻返回了（不等30-60秒），所以响应里只有 review_id。真正的报告是后台任务跑完后写进数据库的。需要拿 review_id 去轮询查询接口，等它从 processing 变 done，才能看到报告。

**Q: `graph.ainvoke` 和 `graph.invoke` 有什么区别？**
A: `ainvoke` 是异步版（a = async），要配 `await` 或 `create_task` 用；`invoke` 是同步版。后端全程异步，所以用 `ainvoke`。

### 工程细节

**Q: 为什么先往数据库插一条 processing 记录，再启动后台任务？**
A: 为了让 review_id 一上传就查得到。先插记录，库里立刻就有这条（status=processing）。如果不先插，后台任务还没建记录前，前端查会 404。

**Q: 为什么查询/删除都要 `WHERE ... AND student_id = :student_id`？**
A: 越权防护。加上 `AND student_id`，就保证只能查/删自己的记录。否则别人知道你的 review_id 就能看你的简历报告、删你的记录。

**Q: SQL 里的 `:review_id` 是什么？为什么不直接把值拼进字符串？**
A: `:review_id` 是参数占位符，真正的值通过后面的字典传入。这叫参数化查询，作用是防 SQL 注入——绝不能用 `f"... WHERE id='{review_id}'"` 这种字符串拼接。

**Q: MongoDB 的常见错误情况有哪些？分别返回什么？**
A: 非 PDF 文件->400，空文件->400，文件过大(>20MB)->413，没登录->401，token 失效->401，查不存在的 id->404，查别人的 id->404，没配 Key->能 done 但全是兜底 50 分。