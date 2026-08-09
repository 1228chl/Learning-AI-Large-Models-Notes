# 简历审查 Agent：State 与数据模型

> 源码文件：`backend/agents/resume/state.py`（共 171 行）

---

## 全文行号速查表

| 行号范围 | 标识符 | 类别 | 一句话说明 |
|---|---|---|---|
| 1~8 | (import) | 导入 | typing / TypedDict / add_messages / BaseMessage / Pydantic |
| 15~21 | `EducationItem` | Pydantic Model | 单条教育经历 |
| 24~32 | `ProjectItem` | Pydantic Model | 单条项目经历 |
| 35~41 | `WorkItem` | Pydantic Model | 单条工作/实习经历 |
| 44~62 | `ResumeStructured` | Pydantic Model | 简历结构化提取完整 Schema |
| 69~76 | `DimensionScore` | Pydantic Model | 单个评审维度得分 |
| 79~85 | `IssueItem` | Pydantic Model | 单条诊断问题 |
| 88~92 | `IssueList` | Pydantic Model | IssueItem 的包装类 |
| 95~100 | `ResumeSummary` | Pydantic Model | 简历整体评价 |
| 107~137 | `ResumeState` | TypedDict | 贯穿 8 个节点的主 State |
| 143~171 | `__main__` | 自测 | 模块自测：构建、dump、校验 |

---

## 一、为什么需要 State 与数据模型

LangGraph 的图由多个节点串联而成，每个节点读入前序节点的产出、写入自己的产出。**State** 就是贯穿全图的"工单"——节点只读/写这一份数据，不需要各自维护中间变量。

```
State（工单）→ 节点① → 更新 State → 节点② → 更新 State → ... → END
```

在简历审查 Agent 中，State 从"原始 PDF 路径"开始，逐步积累"提取的文本"、"结构化数据"、"六维度评分"、"问题清单"、"最终评价"，最终得到完整的审查结果。

数据模型（Pydantic `BaseModel`）则承担了两个职责：
- **给 LLM 的 Schema**：`with_structured_output` 把模型序列化为 JSON Schema，LLM 按 Schema 返回结构化数据
- **给代码的类型约束**：IDE 自动补全、mypy 静态检查、运行时校验

---

## 二、导入（第 1~8 行）

```python
# state.py 第 1~8 行
"""简历审查 Agent - 状态"""
# backend/agents/resume/state.py

from typing import Annotated, Optional
from typing_extensions import TypedDict
from langgraph.graph.message import add_messages
from langchain_core.messages import BaseMessage
from pydantic import BaseModel, Field
```

| 行号 | 代码 | 说明 |
|---|---|---|
| 1 | `"""简历审查 Agent - 状态"""` | 模块文档字符串，标记所属子模块 |
| 2 | `# backend/agents/resume/state.py` | 物理路径标注，便于调试定位 |
| 4 | `from typing import Annotated, Optional` | `Annotated` 用于 LangGraph 的 reducer 注解；`Optional` 标记可为 `None` 的字段 |
| 5 | `from typing_extensions import TypedDict` | `TypedDict` 定义字典结构的键值类型（Python 3.8+ 兼容） |
| 6 | `from langgraph.graph.message import add_messages` | LangGraph 内建的「追加合并」reducer，用于 `messages` 字段（每次写操作追加而非覆盖） |
| 7 | `from langchain_core.messages import BaseMessage` | LangChain 消息基类，构成对话历史 |
| 8 | `from pydantic import BaseModel, Field` | Pydantic v2：`BaseModel` 提供校验/序列化；`Field` 提供字段元信息（`description` 发给 LLM 做指引） |

---

## 三、结构化提取结果（第 15~62 行）

### 3.1 EducationItem（第 15~21 行）

```python
# state.py 第 15~21 行
class EducationItem(BaseModel):
    """单条教育经历。"""
    school:   str = Field(description="学校名称")
    major:    str = Field(description="专业名称")
    degree:   str = Field(description="学历：本科/专科/硕士等")
    duration: str = Field(description="在校时间，如 2020.09 - 2024.06")
    gpa:      str = Field(default="", description="GPA 或成绩（可选）")
```

**动机**：简历中教育经历是最基础的结构化信息块，需要按"学校-专业-学历-时间"四要素提取，GPA 为可选。

| 行号 | 代码 | 说明 |
|---|---|---|
| 15 | `class EducationItem(BaseModel):` | 继承 Pydantic `BaseModel`，自动获得校验、`model_dump()`、JSON Schema 生成 |
| 16 | `"""单条教育经历。"""` | 类文档字符串，作为 LLM Function Calling 的 `description` 的一部分 |
| 17 | `school: str = Field(description="学校名称")` | 必填字段，`description` 会作为 LLM 的提示指引 |
| 18 | `major: str = Field(description="专业名称")` | 必填 |
| 19 | `degree: str = Field(description="学历：本科/专科/硕士等")` | 必填 |
| 20 | `duration: str = Field(description="在校时间，如 2020.09 - 2024.06")` | 必填，时间格式指引 |
| 21 | `gpa: str = Field(default="", description="GPA 或成绩（可选）")` | 可选字段，`default=""` 表示提取不到给空串，LLM 不会报错 |

### 3.2 ProjectItem（第 24~32 行）

```python
# state.py 第 24~32 行
class ProjectItem(BaseModel):
    """单条项目经历。"""
    name:        str       = Field(description="项目名称")
    role:        str       = Field(description="担任角色，如：后端开发/全栈/负责人")
    duration:    str       = Field(description="项目时间，如 2023.06 - 2023.12")
    tech_stack:  list[str] = Field(description="使用的技术栈列表，如 [Spring Boot, MySQL, Redis]")
    description: str       = Field(description="项目描述原文（保留原始表述）")
    highlights:  list[str] = Field(default_factory=list, description="量化亮点句子列表（含数字的句子）")
```

**动机**：项目经历是简历审查的核心，需要提取"角色-时间-技术栈-描述-量化亮点"五个维度，其中 `highlights` 专门捕获含数字的量化成果。

| 行号 | 代码 | 说明 |
|---|---|---|
| 24 | `class ProjectItem(BaseModel):` | 单条项目经历模型 |
| 26 | `name: str = Field(...)` | 项目名称，必填 |
| 27 | `role: str = Field(...)` | 担任角色，含取值示例 |
| 28 | `duration: str = Field(...)` | 项目时间，含格式示例 |
| 29 | `tech_stack: list[str] = Field(...)` | 技术栈列表，含示例值 |
| 30 | `description: str = Field(description="项目描述原文...")` | 保存原文，后续审查节点可直接引用 |
| 31 | _(注释)_ | `default_factory=list` 的经典坑说明：`default=[]` 会被所有实例共享 |
| 32 | `highlights: list[str] = Field(default_factory=list, ...)` | `default_factory=list` 确保每个实例拥有独立的列表，`description` 引导 LLM 提取含数字的量化句子 |

### 3.3 WorkItem（第 35~41 行）

```python
# state.py 第 35~41 行
class WorkItem(BaseModel):
    """单条工作/实习经历。"""
    company:     str       = Field(description="公司名称")
    position:    str       = Field(description="职位名称")
    duration:    str       = Field(description="工作时间")
    tech_stack:  list[str] = Field(default_factory=list, description="涉及技术栈")
    description: str       = Field(description="工作内容原文")
```

**动机**：工作/实习经历与项目经历结构类似但字段不同（公司名而非项目名），单独建模避免字段混淆。

| 行号 | 代码 | 说明 |
|---|---|---|
| 35 | `class WorkItem(BaseModel):` | 单条工作经历模型 |
| 37 | `company: str = Field(...)` | 公司名称，必填 |
| 38 | `position: str = Field(...)` | 职位名称，必填 |
| 39 | `duration: str = Field(...)` | 工作时间，必填 |
| 40 | `tech_stack: list[str] = Field(default_factory=list, ...)` | 涉及技术栈，可选列表 |
| 41 | `description: str = Field(...)` | 工作内容原文，必填 |

### 3.4 ResumeStructured（第 44~62 行）

```python
# state.py 第 44~62 行
class ResumeStructured(BaseModel):
    """简历结构化提取结果（完整 Schema）——extract_structured 节点的输出目标。"""
    # 基本信息
    name:            str  = Field(description="姓名")
    phone:           str  = Field(default="", description="手机号")
    email:           str  = Field(default="", description="邮箱")
    target_position: str  = Field(default="", description="求职意向岗位")
    # 教育经历（按时间倒序）
    education:       list[EducationItem] = Field(default_factory=list)
    # 技能
    skills_raw:      str       = Field(default="", description="技能栏原始文本")
    skills_list:     list[str] = Field(default_factory=list, description="解析后的技术标签列表")
    # 项目经历
    projects:        list[ProjectItem] = Field(default_factory=list)
    # 工作/实习经历
    work_experience: list[WorkItem] = Field(default_factory=list)
    # 其他
    certificates:    list[str] = Field(default_factory=list, description="证书列表")
    self_intro:      str       = Field(default="", description="个人简介/自我评价原文")
```

**动机**：这是 `extract_structured` 节点（LLM Function Calling）的输出目标，一次调用把整份简历拆成"基本信息 + 教育经历 + 技能 + 项目经历 + 工作经历 + 其他"六大部分。嵌套使用 `EducationItem` / `ProjectItem` / `WorkItem` 子模型。

| 行号 | 代码 | 说明 |
|---|---|---|
| 44 | `class ResumeStructured(BaseModel):` | 完整简历 Schema，是 `extract_structured` 节点的输出目标 |
| 45 | `"""...extract_structured 节点的输出目标。"""` | 文档字符串明确标注所属节点 |
| 47 | `name: str = Field(description="姓名")` | 姓名，唯一非可选的基本信息字段 |
| 48 | `phone: str = Field(default="", ...)` | 手机号，可选（`default=""`） |
| 49 | `email: str = Field(default="", ...)` | 邮箱，可选 |
| 50 | `target_position: str = Field(default="", ...)` | 求职意向，可选 |
| 52 | `education: list[EducationItem] = Field(default_factory=list)` | 教育经历列表，嵌套 `EducationItem` |
| 54 | `skills_raw: str = Field(default="", ...)` | 技能栏原始文本，保留原文供后续审查使用 |
| 55 | `skills_list: list[str] = Field(default_factory=list, ...)` | 解析后的技术标签列表 |
| 57 | `projects: list[ProjectItem] = Field(default_factory=list)` | 项目经历列表，嵌套 `ProjectItem` |
| 59 | `work_experience: list[WorkItem] = Field(default_factory=list)` | 工作经历列表，嵌套 `WorkItem` |
| 61 | `certificates: list[str] = Field(default_factory=list, ...)` | 证书列表 |
| 62 | `self_intro: str = Field(default="", ...)` | 自我评价原文 |

---

## 四、六维度评审结果（第 69~100 行）

### 4.1 DimensionScore（第 69~76 行）

```python
# state.py 第 69~76 行
class DimensionScore(BaseModel):
    """单个评审维度结果。"""
    dimension:   str       = Field(default="", description="维度名称（代码层覆盖，LLM 可留空）")
    score:       int       = Field(description="得分 0-100")
    weight:      float     = Field(default=0.0, description="权重（代码层覆盖，LLM 可填 0）")
    issues:      list[str] = Field(default_factory=list, description="该维度问题列表")
    suggestions: list[str] = Field(default_factory=list, description="改进建议列表")
```

**动机**：六维度评审每个维度产出一条评分记录，包含"维度名-得分-权重-问题-建议"。`dimension` 和 `weight` 由代码层从 `SIX_DIMENSIONS` 常量注入，LLM 只需给出 `score` / `issues` / `suggestions`。

| 行号 | 代码 | 说明 |
|---|---|---|
| 69 | `class DimensionScore(BaseModel):` | 单个维度评分模型 |
| 71 | _(注释)_ | `dimension/weight` 由代码层填写，LLM 不需要操心 |
| 72 | `dimension: str = Field(default="", ...)` | 维度名称，代码层在 `run_six_dimensions` 中覆盖 |
| 73 | `score: int = Field(description="得分 0-100")` | LLM 真正要填的字段：得分 |
| 74 | `weight: float = Field(default=0.0, ...)` | 权重，代码层覆盖 |
| 75 | `issues: list[str] = Field(default_factory=list, ...)` | 该维度的问题列表 |
| 76 | `suggestions: list[str] = Field(default_factory=list, ...)` | 改进建议列表 |

### 4.2 IssueItem（第 79~85 行）

```python
# state.py 第 79~85 行
class IssueItem(BaseModel):
    """单条诊断问题。"""
    priority:    str = Field(description="优先级：high / medium / low")
    dimension:   str = Field(description="所属维度")
    description: str = Field(description="问题描述（1句话）")
    location:    str = Field(description="问题在简历中的定位，如：项目经历-电商系统-第2句")
    suggestion:  str = Field(description="具体修改建议（可操作）")
```

**动机**：每一条问题的粒度是"一句话 + 一个定位 + 一个建议"，便于前端按优先级排序展示。`location` 字段精确到"哪个模块-哪个项目-哪句话"，让用户能迅速定位。

| 行号 | 代码 | 说明 |
|---|---|---|
| 79 | `class IssueItem(BaseModel):` | 单条诊断问题 |
| 81 | `priority: str = Field(description="优先级：high / medium / low")` | 枚举值限定，`description` 起约束作用 |
| 82 | `dimension: str = Field(description="所属维度")` | 关联到六维度中的某一个 |
| 83 | `description: str = Field(description="问题描述（1句话）")` | 一句话描述，不能太长 |
| 84 | `location: str = Field(description="问题在简历中的定位...")` | 精确到"项目-项目名-第N句"的路径格式 |
| 85 | `suggestion: str = Field(description="具体修改建议（可操作）")` | 可操作的建议，而非空泛评价 |

### 4.3 IssueList（第 88~92 行）

```python
# state.py 第 88~92 行
class IssueList(BaseModel):
    """IssueItem 列表的包装类。
    为什么要包一层：with_structured_output 要求顶层是「对象」而非「裸列表」，
    所以不能直接让 LLM 返回 list[IssueItem]，要包成 {items: [...]}。"""
    items: list[IssueItem]
```

**动机**：LangChain 的 `with_structured_output` 方法要求顶层返回类型必须是"对象"（`BaseModel` 子类），不能直接使用 `list[IssueItem]`。包一层 `IssueList` 即可绕开限制。

| 行号 | 代码 | 说明 |
|---|---|---|
| 88 | `class IssueList(BaseModel):` | 包装类，唯一目的是满足 `with_structured_output` 的接口要求 |
| 89~91 | _(文档字符串)_ | 详细解释了为什么需要这一层包装 |
| 92 | `items: list[IssueItem]` | 唯一字段，类型为 `IssueItem` 列表 |

### 4.4 ResumeSummary（第 95~100 行）

```python
# state.py 第 95~100 行
class ResumeSummary(BaseModel):
    """简历整体评价——generate_summary 节点的输出目标。"""
    highlights:        list[str] = Field(description="2-3 条核心亮点")
    core_improvements: list[str] = Field(description="2-3 条最重要的改进方向")
    overall_comment:   str       = Field(description="1-2 句综合评语")
    fit_assessment:    str       = Field(description="对目标岗位的匹配度评估（1句话）")
```

**动机**：`generate_summary` 节点（最后一个 LLM 调用）的输出目标，给出一份简历的"亮点 + 改进 + 评语 + 匹配度"四个维度的总结。

| 行号 | 代码 | 说明 |
|---|---|---|
| 95 | `class ResumeSummary(BaseModel):` | 整体评价模型 |
| 96 | `"""...generate_summary 节点的输出目标。"""` | 标注所属节点 |
| 97 | `highlights: list[str] = Field(description="2-3 条核心亮点")` | 亮点列表，数量指引 |
| 98 | `core_improvements: list[str] = Field(description="2-3 条最重要的改进方向")` | 改进方向，数量指引 |
| 99 | `overall_comment: str = Field(description="1-2 句综合评语")` | 综合评语，长度指引 |
| 100 | `fit_assessment: str = Field(description="对目标岗位的匹配度评估（1句话）")` | 匹配度评估，一句话 |

---

## 五、主 State：ResumeState（第 107~137 行）

```python
# state.py 第 107~137 行
class ResumeState(TypedDict):
    """简历审查 Agent 完整 State。字段按数据流阶段分组，对应各节点的产出。"""

    # ── 请求上下文 ──
    messages:       Annotated[list[BaseMessage], add_messages]
    student_id:     str
    tenant_id:      str
    review_id:      str
    pdf_minio_path: str
    pdf_local_path: str

    # ── 解析中间结果 ──
    raw_text:       str
    page_count:     int

    # ── 结构化提取结果 ──
    structured:     Optional[dict]

    # ── 六维度评审结果 ──
    dimension_scores: list[dict]
    weighted_score:   float

    # ── 逐条问题诊断 ──
    issues:          list[dict]

    # ── 整体评价 ──
    summary:         Optional[dict]

    # ── 降级标记 ──
    fallback_used:    bool
    structured_output: Optional[dict]
```

**动机**：`ResumeState` 是贯穿全图的"工单"，所有节点读写同一份数据。使用 `TypedDict` 而非 `BaseModel` 是因为 LangGraph 的 State 字段会动态更新，不需要 Pydantic 的运行时校验——TypedDict 编译期类型检查已经足够。字段按数据流阶段分组，每个节点只负责自己对应阶段的字段。

| 行号 | 代码 | 说明 |
|---|---|---|
| 107 | `class ResumeState(TypedDict):` | 继承 `TypedDict`，编译期类型检查，无运行时开销 |
| 108 | `"""...按数据流阶段分组，对应各节点的产出。"""` | 文档字符串说明分组原则 |
| 111 | `messages: Annotated[list[BaseMessage], add_messages]` | `Annotated` 配合 `add_messages` reducer，每次写入追加而非覆盖 |
| 112 | `student_id: str` | 发起审查的学生 ID |
| 113 | `tenant_id: str` | 租户 ID |
| 114 | `review_id: str` | 审查记录 UUID，对应 `resume_reviews` 表 |
| 115 | `pdf_minio_path: str` | 对象存储路径（遗留字段，本地模式留空） |
| 116 | `pdf_local_path: str` | 本地临时文件路径，`extract_text` 节点实际使用 |
| 119 | `raw_text: str` | `extract_text` 节点产出：PDF 全文 |
| 120 | `page_count: int` | PDF 页数 |
| 123 | `structured: Optional[dict]` | `extract_structured` 产出：`ResumeStructured.model_dump()` 的结果 |
| 126 | `dimension_scores: list[dict]` | `run_six_dimensions` 产出：每个维度一条 `DimensionScore.model_dump()` |
| 127 | `weighted_score: float` | 加权综合得分，0~100 |
| 130 | `issues: list[dict]` | `diagnose_issues` 产出：`IssueItem` 列表，按优先级排序 |
| 133 | `summary: Optional[dict]` | `generate_summary` 产出：`ResumeSummary.model_dump()` |
| 136 | `fallback_used: bool` | 降级标记：某节点 LLM 调用失败时是否进入降级逻辑 |
| 137 | `structured_output: Optional[dict]` | 最终输出，供 API 层序列化返回 |

---

## 六、模块自测（第 143~171 行）

```python
# state.py 第 143~171 行
if __name__ == "__main__":
    from pydantic import ValidationError

    # ① 嵌套构建一份结构化简历，并 dump 成字典
    r = ResumeStructured(
        name="张三", target_position="后端开发",
        education=[EducationItem(school="某大学", major="计算机", degree="本科", duration="2020.09-2024.06")],
        skills_list=["Java", "Spring Boot", "MySQL"],
        projects=[ProjectItem(name="电商系统", role="后端", duration="2023.06-2023.12",
                              tech_stack=["Spring Boot", "Redis"], description="做了下单与库存")],
    )
    d = r.model_dump()
    print("① 结构化简历 name:", d["name"], "| 项目数:", len(d["projects"]),
          "| 第一个项目技术栈:", d["projects"][0]["tech_stack"])

    # ② 维度评分：dimension/weight 留默认，LLM 只给 score
    ds = DimensionScore(score=85, issues=["缺少量化数据"], suggestions=["补充QPS/DAU"])
    print("② 维度评分 score:", ds.score, "| dimension(默认空):", repr(ds.dimension), "| weight(默认):", ds.weight)

    # ③ IssueList 包装
    il = IssueList(items=[IssueItem(priority="high", dimension="项目深度",
                                    description="项目描述空洞", location="项目-电商-第2句", suggestion="补充技术难点")])
    print("③ IssueList 条数:", len(il.items), "| 第一条优先级:", il.items[0].priority)

    # ④ 校验：缺必填字段会报错
    try:
        EducationItem(school="只有学校")   # 缺 major/degree/duration
    except ValidationError as e:
        print("④ 缺必填字段校验:", e.error_count(), "个错误（major/degree/duration 必填）")
```

**动机**：模块自测不依赖大模型和数据库，直接运行 `python state.py` 即可验证所有模型能否正常构建、序列化、校验。覆盖四种场景：嵌套构建、部分字段默认值、包装类、必填校验。

| 行号 | 代码 | 说明 |
|---|---|---|
| 143 | `if __name__ == "__main__":` | 仅在直接运行时执行，导入时不运行 |
| 147~154 | `r = ResumeStructured(...)` | 构建完整嵌套结构：`ResumeStructured` 包含 `EducationItem` 和 `ProjectItem` |
| 154 | `d = r.model_dump()` | 序列化为字典，印证 `ResumeState.structured` 中存储的格式 |
| 159 | `ds = DimensionScore(score=85, ...)` | 构造时只传 `score` / `issues` / `suggestions`，`dimension` 和 `weight` 走默认值 |
| 163~164 | `il = IssueList(items=[...])` | 包装类示例：`list[IssueItem]` 必须包在 `IssueList` 中 |
| 168~171 | `try: ... except ValidationError` | 必填字段校验：缺 `major`/`degree`/`duration` 触发 `ValidationError` |

---

## 七、依赖关系

```
┌──────────────────────────────────────────────────────────────┐
│                         ResumeState (TypedDict)              │
│  (贯穿全图的工单，字段按节点分组)                             │
└──────────────────────────────────────────────────────────────┘
                              │
                              │ 字段类型指向
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                    ResumeStructured (BaseModel)               │
│  (extract_structured 节点输出，嵌套三个子模型)                │
│                                                              │
│  ├── EducationItem  ── 单条教育经历                          │
│  ├── ProjectItem    ── 单条项目经历                          │
│  └── WorkItem       ── 单条工作经历                          │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  DimensionScore (BaseModel)    IssueItem (BaseModel)          │
│  (run_six_dimensions 节点输出)  (diagnose_issues 节点输出)    │
│                                 ┌─────────────────────────┐  │
│                                 │ IssueList (包装类)      │  │
│                                 │ items: list[IssueItem]  │  │
│                                 └─────────────────────────┘  │
│                                                              │
│  ResumeSummary (BaseModel)                                   │
│  (generate_summary 节点输出)                                  │
└──────────────────────────────────────────────────────────────┘
```

**数据流示意**：

```
State 初始值（只有 review_id 和 pdf_local_path）
    │
    ▼
extract_text → 写入 raw_text, page_count
    │
    ▼
extract_structured → 用 ResumeStructured 做 Schema → 写入 structured
    │
    ▼
run_six_dimensions → 用 DimensionScore 做 Schema → 写入 dimension_scores, weighted_score
    │
    ▼
diagnose_issues → 用 IssueList 做 Schema → 写入 issues
    │
    ▼
generate_summary → 用 ResumeSummary 做 Schema → 写入 summary
    │
    ▼
save_results → 写入 structured_output
```

---

## ★ Insight ─── 设计亮点

### 1. TypedDict + Pydantic 双层架构

```
Pydantic 模型（Schema 层）       ← 给 LLM 做 Function Calling 的结构化输出目标
TypedDict（State 层）            ← 给图节点做数据传递的容器
```

- Pydantic 模型提供 `description` 元信息，完整序列化为 JSON Schema 发给 LLM，LLM 按 Schema 返回结构化数据
- TypedDict 仅做编译期类型检查，无运行时开销，LangGraph 的 reducer 机制（如 `add_messages`）直接在 TypedDict 字段上生效
- 两者分工明确：Pydantic 管"LLM 要什么格式"，TypedDict 管"节点间传什么数据"

### 2. `default_factory=list` 而非 `default=[]`

```python
# 正确写法（state.py 第 32 行）
highlights: list[str] = Field(default_factory=list, ...)

# 错误写法（不可用）
# highlights: list[str] = Field(default=[], ...)
```

Pydantic 模型实例被共享时，`default=[]` 会导致所有实例共用同一个列表对象，一个实例的修改会污染其他实例。`default_factory=list` 每次创建新实例时调用 `list()` 生成独立列表，这是 Pydantic 最佳实践。

### 3. `description` 字段即 LLM 提示词

`Field(description="...")` 中 `description` 的内容会被 `with_structured_output` 序列化为 JSON Schema 的 `description` 属性，LLM 在生成结构化数据时会参考这些描述。这意味着：

- 在 `description` 中写"如：2020.09 - 2024.06" → LLM 会按此格式输出
- 在 `description` 中写"2-3 条核心亮点" → LLM 会控制输出数量
- 在 `description` 中写"1句话" → LLM 会控制输出长度

### 4. IssueList 包装模式

`with_structured_output` 要求顶层返回类型必须是 `BaseModel` 子类，不能直接返回 `list[IssueItem]`。`IssueList` 包装类是一个极简的适配器，唯一字段就是 `items: list[IssueItem]`，既是 Pydantic 模型（满足 `with_structured_output` 要求），又等价于 `list[IssueItem]`（通过 `.items` 解包）。

### 5. 模块自测即文档

`if __name__ == "__main__":` 覆盖了四种典型场景：

1. **嵌套构建**：验证多层模型能正确构建和序列化
2. **默认值**：验证必填字段和可选字段的默认行为
3. **包装类**：验证 `IssueList` 能正常实例化
4. **校验错误**：验证必填字段缺失时抛 `ValidationError`

这四段代码本身也是使用示例，新人阅读模型时可以直接运行理解。

---

## 总结

| 层次 | 技术选型 | 用途 | 数量 |
|---|---|---|---|
| State 层 | `TypedDict` | 贯穿 8 个节点的工单，字段按节点分组 | 1 个 |
| Schema 层 | Pydantic `BaseModel` | 给 LLM 做结构化输出 Schema | 6 个 |
| 嵌套子模型 | Pydantic `BaseModel` | 被 `ResumeStructured` 引用 | 3 个 |
| 包装类 | Pydantic `BaseModel` | 适配 `with_structured_output` 接口要求 | 1 个 |

**核心思想**：State 是"工单"，每个节点往工单上填自己那部分数据；Pydantic 模型是"模板"，指引 LLM 按固定格式填入数据。