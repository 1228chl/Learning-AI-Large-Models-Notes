# 简历审查 Agent：State 与数据模型 — 从零理解

## 一、LangGraph 的 State 是什么？

LangGraph 是一个**有状态图**框架。State 就是贯穿整个图的"工单"——每个节点读 State、写 State，传给下一个节点。

```
State（工单）→ 节点① → 更新 State → 节点② → 更新 State → ... → END
```

在简历审查 Agent 中，State 从"原始 PDF 路径"开始，逐步积累"提取的文本"、"结构化数据"、"评分"、"问题"、"评价"，最终得到完整的审查结果。

## 二、数据模型（Pydantic）

### 2.1 教育经历

```python
class EducationItem(BaseModel):
    school:   str = Field(description="学校名称")
    major:    str = Field(description="专业名称")
    degree:   str = Field(description="学历：本科/专科/硕士等")
    duration: str = Field(description="在校时间，如 2020.09 - 2024.06")
    gpa:      str = Field(default="", description="GPA 或成绩（可选）")
```

`description` 会发给 LLM，指导它提取。`default=""` 表示可选字段，提取不到给空串。

### 2.2 项目经历

```python
class ProjectItem(BaseModel):
    name:        str       = Field(description="项目名称")
    role:        str       = Field(description="担任角色")
    duration:    str       = Field(description="项目时间")
    tech_stack:  list[str] = Field(description="技术栈列表")
    description: str       = Field(description="项目描述原文")
    highlights:  list[str] = Field(default_factory=list, description="量化亮点")
```

注意 `default_factory=list`：列表默认值必须用工厂函数，不能写 `default=[]`（会被所有实例共享，经典坑）。

### 2.3 完整简历结构

```python
class ResumeStructured(BaseModel):
    # 基本信息
    name:            str  = Field(description="姓名")
    phone:           str  = Field(default="", description="手机号")
    email:           str  = Field(default="", description="邮箱")
    target_position: str  = Field(default="", description="求职意向")
    # 教育经历
    education:       list[EducationItem] = Field(default_factory=list)
    # 技能
    skills_list:     list[str] = Field(default_factory=list)
    # 项目经历
    projects:        list[ProjectItem] = Field(default_factory=list)
    # 工作经历
    work_experience: list[WorkItem] = Field(default_factory=list)
    # 其他
    certificates:    list[str] = Field(default_factory=list)
    self_intro:      str       = Field(default="", description="自我评价")
```

### 2.4 维度评分

```python
class DimensionScore(BaseModel):
    dimension:   str       = Field(default="", description="维度名称")
    score:       int       = Field(description="得分 0-100")
    weight:      float     = Field(default=0.0, description="权重")
    issues:      list[str] = Field(default_factory=list, description="问题列表")
    suggestions: list[str] = Field(default_factory=list, description="改进建议")
```

### 2.5 问题诊断

```python
class IssueItem(BaseModel):
    priority:    str = Field(description="优先级：high / medium / low")
    dimension:   str = Field(description="所属维度")
    description: str = Field(description="问题描述（1句话）")
    location:    str = Field(description="定位，如：项目经历-电商系统-第2句")
    suggestion:  str = Field(description="具体修改建议")

class IssueList(BaseModel):
    items: list[IssueItem]  # 包一层：with_structured_output 要求顶层是对象
```

### 2.6 整体评价

```python
class ResumeSummary(BaseModel):
    highlights:        list[str] = Field(description="2-3 条核心亮点")
    core_improvements: list[str] = Field(description="2-3 条改进方向")
    overall_comment:   str       = Field(description="1-2 句综合评语")
    fit_assessment:    str       = Field(description="匹配度评估")
```

## 三、主 State

```python
class ResumeState(TypedDict):
    # ── 请求上下文 ──
    messages:       Annotated[list[BaseMessage], add_messages]
    student_id:     str
    tenant_id:      str
    review_id:      str
    pdf_local_path: str

    # ── 解析中间结果 ──
    raw_text:   str         # PDF 全文
    page_count: int

    # ── 结构化提取 ──
    structured: Optional[dict]

    # ── 六维度评审 ──
    dimension_scores: list[dict]
    weighted_score:   float

    # ── 问题诊断 ──
    issues: list[dict]

    # ── 整体评价 ──
    summary: Optional[dict]

    # ── 降级标记 ──
    fallback_used: bool
    structured_output: Optional[dict]
```

**为什么用 `TypedDict` 而不是 `BaseModel`？** LangGraph 的 State 用 TypedDict 更方便，因为字段会动态更新，不需要 Pydantic 的校验。

## 四、数据流

```
State 初始值（只有 review_id 和 pdf_local_path）
    │
    ▼
extract_text → 写入 raw_text, page_count
    │
    ▼
extract_structured → 写入 structured
    │
    ▼
run_six_dimensions → 写入 dimension_scores, weighted_score
    │
    ▼
diagnose_issues → 写入 issues
    │
    ▼
generate_summary → 写入 summary
    │
    ▼
save_results → 写入 structured_output
```

## 五、总结

```
Pydantic 模型（给 LLM 的结构化输出 Schema）
  ├── EducationItem / ProjectItem / WorkItem
  ├── ResumeStructured（完整简历）
  ├── DimensionScore（单维度评分）
  ├── IssueItem（单条问题 + IssueList 包装）
  └── ResumeSummary（整体评价）

TypedDict（贯穿 8 个节点的 State）
  ├── 请求上下文（谁发起的）
  ├── 解析结果（文本 + 结构化）
  ├── 评审结果（六维度评分）
  ├── 诊断结果（问题清单）
  └── 最终输出（评语 + 结构化数据）
```

**核心思想：State 是"工单"，每个节点往工单上填自己那部分数据。**