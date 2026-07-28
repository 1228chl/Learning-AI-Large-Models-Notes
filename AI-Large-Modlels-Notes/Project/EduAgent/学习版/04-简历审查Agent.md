# 第四章 简历审查 Agent — 学习版

> 本文档从原版《04-简历审查Agent.md》中提取核心知识点，按照学习依赖关系重新编排，便于系统化学习第一个真实 Agent。

---

## 学习路线图

```
第一梯队：全景理解（先知道整体长什么样）
  ├── ① 全景与数据流     ← Agent 做什么、怎么请求、8节点流水线
  └── ② State 与数据模型 ← 所有节点共享的"工单"长什么样

第二梯队：节点实现（按数据流顺序）
  ├── ③ 提示词设计       ← 评分 rubric + Think 提示
  ├── ④ PDF解析与结构化提取 ← 节点③④
  ├── ⑤ 六维度并行评审   ← 节点⑤（核心并行模式）
  ├── ⑥ 问题诊断与整体评价 ← 节点⑥⑦
  └── ⑦ 持久化与图装配   ← 节点⑧+图编译

第三梯队：对外接口
  └── ⑧ API接口 ← 上传/轮询/删除/列表
```

---

## 第一梯队：全景理解

---

### ① 全景与数据流

#### 学习目标

- 简历审查 Agent 的核心功能是什么？报告包含哪三部分？
- 为什么上传接口返回 202 而不是 200？
- 8 个节点的执行顺序？哪两个是空跑？
- 六维度评分为什么能并行？

#### 核心知识点

**一句话概括**：学员上传 PDF 简历，系统自动生成一份专业的审查报告，包含三部分：①六维度评分 ②逐条问题诊断 ③整体评价。

**三个鲜明特点**：
- **全自动、一条直线**：8 个节点顺序执行，无分支、无 HitL、无 Checkpointer
- **结构化输出贯穿全程**：每一步 LLM 产出都是严格的 Pydantic 结构
- **并行是性能关键**：六维度评分用 `asyncio.gather` 并行，总耗时从"6 次相加"压成"1 次最慢的"

**HTTP 请求流程**

```python
# ① 学员上传 PDF
POST /resume/upload（PDF + JWT）
# ② 后端存文件 + 插库，立即返回 202
response = {"review_id": "uuid-xxx", "status": "processing"}
# ③ 后台异步启动 LangGraph 图
task = asyncio.create_task(run_resume_graph(review_id))
_background_tasks.add(task)                    # GC 保护
task.add_done_callback(_background_tasks.discard)
# ④ 前端轮询
GET /resume/reviews/{review_id}
# 返回：{"status": "processing"} 或完整报告
```

> **EduAgent 应用**：上传接口不会卡住等审查跑完，立刻返回 202。这正是"后台任务 + GC 保护"和"202 Accepted"的真实应用。

**8 节点流水线**

| # | 节点 | 干什么 | 写入 State |
|---|------|--------|-----------|
| ① | `upload_to_minio` | 本地模式空跑 | — |
| ② | `download_pdf` | 本地模式空跑 | — |
| ③ | `extract_text` | PyMuPDF 提取 PDF 文本 | `raw_text`, `page_count` |
| ④ | `extract_structured` | LLM 提取结构化简历 | `structured` |
| ⑤ | `run_six_dimensions` | **并行**评 6 个维度 | `dimension_scores`, `weighted_score` |
| ⑥ | `diagnose_issues` | 汇总问题、去重、标优先级 | `issues` |
| ⑦ | `generate_summary` | 生成整体评价 | `summary` |
| ⑧ | `save_results` | 写入 DB、清理临时文件 | （持久化） |

> **心智模型**：简历 Agent = "搭一条直线图"的放大版——节点里的简单逻辑换成了"调大模型做结构化提取/评分"的真实业务。

---

### ② State 与数据模型

#### 学习目标

- 为什么先定义数据模型再写节点？
- `Field(description=...)` 的双重作用？
- 嵌套模型如何工作？
- `IssueList` 包装技巧解决什么问题？

#### 核心知识点

**两类数据模型**：① 各步 LLM 输出的 Schema ② 主 State（`ResumeState`）

**嵌套模型结构**

```python
class EducationItem(BaseModel):
    school: str = Field(description="学校名称")
    major: str = Field(description="专业名称")
    degree: str = Field(description="学历：本科/专科/硕士等")
    duration: str = Field(description="在校时间，如 2020.09 - 2024.06")

class ProjectItem(BaseModel):
    name: str = Field(description="项目名称")
    role: str = Field(description="担任角色")
    tech_stack: list[str] = Field(description="使用的技术栈列表")
    highlights: list[str] = Field(default_factory=list, description="量化亮点")

class ResumeStructured(BaseModel):
    name: str = Field(description="姓名")
    target_position: str = Field(default="", description="求职意向岗位")
    education: list[EducationItem] = Field(default_factory=list)
    projects: list[ProjectItem] = Field(default_factory=list)
    skills_list: list[str] = Field(default_factory=list, description="技术标签列表")
```

> ⭐ **核心心法**：`Field(description=...)` 不只是注释，它通过 `with_structured_output` 发给 LLM 作为填空指令。描述写得越清楚，提取越准。

**`default_factory=list` 规则**：列表类型必须用 `default_factory=list`，**禁止写 `default=[]`**（会共享同一个列表，污染其他实例）。

**`IssueList` 包装技巧**：`with_structured_output` 要求顶层是对象，不能直接返回"裸列表"，需包一层 `IssueList { items: list[IssueItem] }`。

**ResumeState（17 字段，7 组）**：

| 分组 | 字段 | 说明 |
|------|------|------|
| 请求上下文 | `messages`, `student_id`, `tenant_id`, `review_id`, `pdf_minio_path`, `pdf_local_path` | API 初始化 |
| 解析结果 | `raw_text`, `page_count` | 节点③写入 |
| 结构化提取 | `structured` | 节点④写入 |
| 六维度评分 | `dimension_scores`, `weighted_score` | 节点⑤写入 |
| 问题诊断 | `issues` | 节点⑥写入 |
| 整体评价 | `summary` | 节点⑦写入 |
| 降级标记 | `fallback_used`, `structured_output` | 兜底用 |

**设计决策**：State 存 `dict` 而非 Pydantic 对象（节点 LLM 返回 Pydantic 后调 `.model_dump()` 转字典），保证可 JSON 序列化。

---

## 第二梯队：节点实现

---

### ③ 提示词设计

#### 学习目标

- 提示词集中管理的好处？
- 评分 `rubric` 怎么设计？六维度权重分别是多少？
- Think 提示设计的价值？

#### 核心知识点

**集中管理**：所有提示词在 `prompts.py` 中，调提示词不动业务代码。

**评分 `rubric` 设计**：每个维度 0-100 分分档写明每一档特征，让 LLM 有明确标尺。

```python
# 示例：项目深度评分标准
"90-100：每个项目都有量化指标、明确的技术选型理由、清晰的个人贡献和难点解决"
"70-89：大部分项目有量化数据，个人贡献基本清晰"
"50-69：项目描述偏泛，缺少量化数据，个人贡献不明确"

# 六维度权重
SIX_DIMENSIONS = [
    {"name": "项目深度",     "weight": 0.30},
    {"name": "技术匹配度",   "weight": 0.25},
    {"name": "表达规范性",   "weight": 0.15},
    {"name": "简历结构",     "weight": 0.15},
    {"name": "量化程度",     "weight": 0.10},
    {"name": "真实可信度",   "weight": 0.05},
]
# 权重和 = 1.0
```

**Think 提示设计**：先让 LLM 用自由文本做宏观分析，再把思考作为上下文喂给结构化诊断。这是一种轻量"推理增强"技巧，能显著提升诊断质量。

---

### ④ PDF 解析与结构化提取

#### 学习目标

- 双栏布局如何处理？
- 为什么 PDF 解析要用 `run_in_executor` 丢线程池？
- 结构化提取失败如何兜底？

#### 核心知识点

**双栏布局处理**：PyMuPDF 逐页读取文本块，按横坐标 `x0` 分左右半，判断是否双栏（右侧占比>30%），双栏时先左后右读取。

**`run_in_executor`**

```python
loop = asyncio.get_running_loop()
raw_text, page_count = await loop.run_in_executor(
    None, _sync_extract_text, pdf_path
)
```

> **EduAgent 应用**：所有本地模型推理（BGE-M3/Reranker/MiniLM）、PDF/Word 解析、密码校验都通过 `run_in_executor` 丢线程池，不阻塞事件循环。

**结构化提取重试**

```python
async def extract_structured_node(state: ResumeState) -> dict:
    for attempt in range(2):           # 重试 2 次
        try:
            result = await structured_llm.ainvoke(messages)
            if result is None:         # 模型不用工具，用文字回复
                continue
            return {"structured": result.model_dump()}
        except Exception:
            continue
    return {"structured": {}}           # 两次失败 → 空结构兜底
```

---

### ⑤ 六维度并行评审 ⭐（核心模式）

#### 学习目标

- 并行核心模式怎么写？
- 单维度失败如何隔离？
- 加权分怎么计算？

#### 核心知识点

```python
async def review_one_dimension(dim: dict) -> dict:
    for attempt in range(2):                         # 单维度2次重试
        try:
            result = await structured_llm.ainvoke([...])
            d = result.model_dump()
            d["dimension"] = dim["name"]             # 代码层填：维度名和权重
            d["weight"] = dim["weight"]
            return d
        except:
            return _empty_dimension_score(dim)       # 降级为50分

# 创建6个协程，并行执行
tasks = [review_one_dimension(dim) for dim in SIX_DIMENSIONS]
dimension_scores = await asyncio.gather(*tasks)

# 计算加权总分
weighted_score = sum(d["score"] * d["weight"] for d in dimension_scores)
```

> **EduAgent 应用**：`tasks = [...]` 创建协程（还没执行），`await asyncio.gather(*tasks)` 一起跑。单维度失败不影响其他维度。这是 Agent 中"并行评审"范式的核心实现。

---

### ⑥ 问题诊断与整体评价

#### 学习目标

- `diagnose_issues` 的四步流程？
- 结构化输出防 `None` 的兜底策略？

#### 核心知识点

**`diagnose_issues` 四步**：汇总各维度问题 → Think 前置推理（可失败，不影响主流程） → 结构化生成 `IssueList` → 按优先级排序（high → medium → low）。

**`generate_summary`**：综合所有结果，调用 LLM 生成 `ResumeSummary`（亮点/改进/评语/匹配度）。同样防 `None` + 重试 2 次。

---

### ⑦ 持久化与图装配

#### 学习目标

- JSONB 写入和读取的注意事项？
- 图装配的代码怎么写？

#### 核心知识点

**JSONB 写入**

```python
# 写入：Python dict → json.dumps 转字符串
await db.execute(
    text("UPDATE resume_reviews SET scores = :scores WHERE id = :id"),
    {"scores": json.dumps(dimension_scores, ensure_ascii=False), "id": review_id},
)
# 读取：asyncpg 自动反序列化为 Python dict/list
```

**图装配**

```python
builder = StateGraph(ResumeState)
builder.add_node("extract_text", extract_text_node)
builder.add_node("extract_structured", extract_structured_node)
builder.add_node("run_six_dimensions", run_six_dimensions_node)
# ... 8 个节点
builder.add_edge(START, "extract_text")
builder.add_edge("extract_text", "extract_structured")
builder.add_edge("extract_structured", "run_six_dimensions")
# ... 8 条固定边，无条件边
builder.add_edge("save_results", END)

graph = builder.compile()    # 不传 checkpointer（一次性任务）
```

---

## 第三梯队：对外接口

---

### ⑧ API 接口

#### 学习目标

- 四个接口分别做什么？
- 后台任务如何防止 GC 回收？
- `thread-local` 图解决什么问题？

#### 核心知识点

| 接口 | 说明 |
|------|------|
| `POST /resume/upload` | 上传 PDF，返回 202+`review_id`，后台异步审查 |
| `GET /resume/reviews/{id}` | 轮询查询状态/结果（含超时兜底：15 分钟标记 `failed`） |
| `DELETE /resume/reviews/{id}` | 越权防护：WHERE 条件带 `student_id` |
| `GET /resume/reviews` | 列出本人记录，JSONB 直接取综合分 |

**GC 保护**：`_background_tasks: set[asyncio.Task]` 持有后台任务强引用防 GC 回收。

**`thread-local` 图**：`threading.local()` 给每个线程一份独立图实例，避免多线程并发竞争。

---

## 附录：核心模式总览

| 模式 | 实现方式 | 对应节点 |
|------|---------|---------|
| 结构化输出 | `with_structured_output(PydanticModel, method="function_calling")` | ④⑤⑥⑦ |
| 并行 fan-out | `asyncio.gather(*tasks)` | ⑤ |
| 重试兜底 | `for` 循环 2 次 + `try/except` | ④⑤⑦ |
| 后台任务 | `asyncio.create_task()` + GC 保护 | 上传接口 |
| 轮询 | 前端 `setInterval(POST)` | 查询接口 |
| 线程隔离 | `threading.local()` | 图实例 |

---

> **学习建议**：先理解全景和数据流（①），再看 State 和模型定义（②），然后按节点顺序逐个学习（③~⑦）。重点理解"并行评审"模式（⑤），这是第四章的教学主线，后续章节会看到不同的范式。