# 简历审查 Agent：节点函数 — 从零理解

> 对应源码：`backend/agents/resume/nodes.py`（全文件 385 行）
> 本文按模板规范，为每个节点函数提供精确行号、逐行精读与设计亮点。

---

## 〇、全文行号速查表

| 行号范围 | 符号 / 函数 | 作用 |
|---------|------------|------|
| 1~21 | import + 全局 logger | 模块导入与日志器 |
| 25~38 | `SIX_DIMENSIONS` | 六维度定义（名称/权重/侧重） |
| 42~45 | `upload_to_minio_node` | 节点①：空跑（本地模式跳过上传） |
| 48~51 | `download_pdf_node` | 节点②：空跑（本地文件已存在） |
| 55~90 | `_sync_extract_text` | 同步 PDF 文本提取（双栏处理，线程池中跑） |
| 93~106 | `extract_text_node` | 节点③：异步文本提取 |
| 110~138 | `extract_structured_node` | 节点④：LLM 结构化提取 |
| 142~184 | `run_six_dimensions_node` | 节点⑤：六维度并行评审 |
| 187~204 | `_build_structured_summary` | 辅助：结构化数据浓缩摘要 |
| 207~210 | `_empty_dimension_score` | 辅助：维度评审降级结果 |
| 214~270 | `diagnose_issues_node` | 节点⑥：问题诊断（先 Think 再答） |
| 274~315 | `generate_summary_node` | 节点⑦：整体评价 |
| 319~371 | `save_results_node` | 节点⑧：结果持久化 |
| 375~385 | `if __name__ == "__main__"` | 模块自测 |

**8 个节点流水线**：

```
START → upload_to_minio → download_pdf → extract_text → extract_structured

### 为什么需要 8 个节点？

简历审查流程是典型的**直线流水线**——每个步骤处理完把结果交给下一个步骤，不能跳过，不能并行：

```
上传 PDF → 下载到本地 → 提取文本 → 结构化提取 → 六维度评审 → 问题诊断 → 整体评价 → 保存结果
```

分解成 8 个独立节点的好处：

**单一职责**：每个节点只做一件事。`extract_text` 只负责 PDF 文本提取，`run_six_dimensions` 只负责六维度评审。修改提取逻辑不影响评审逻辑。

**并行执行**：`run_six_dimensions_node` 内部用 `asyncio.gather` 并行调用 6 路 LLM，但外层节点仍然是串行的（六维度评审必须在结构化提取之后）。如果全部写在一个大函数里，并行逻辑和串行逻辑混在一起，代码难以维护。

**错误隔离**：`extract_structured_node` 调用 LLM 可能失败（JSON 解析错误），但降级后不影响下游节点。如果写在一个大函数里，一个阶段的错误可能污染整个流程。

**8 个 vs 10 个**：简历审查 Agent 比 QA Agent 少 2 个节点，因为它是**直线流水线**（不需要 QA Agent 的条件路由、分支检索、联网搜索兜底）。
       → run_six_dimensions → diagnose_issues → generate_summary → save_results → END
```

每个节点都是一个 `async def` 函数：输入 `state`（当前工单），输出 `dict`（要更新的字段）。

---

## 一、import 与全局区

### 签名与动机

模块顶部集中导入依赖项，并创建模块级 `logger`。这里的依赖分为四类：**标准库**、**LangChain 消息**、**State/Prompts**、**核心工具**。

### 逐行精读

```python
# nodes.py 第 1~21 行
```

| 行号 | 代码 | 说明 |
|-----|------|------|
| 1 | `# backend/agents/resume/nodes.py` | 文件路径注释 |
| 3 | `import asyncio` | 事件循环、`gather` 并行、`sleep` 重试 |
| 4 | `import json` | JSONB 列序列化 |
| 5 | `import os` | 临时文件清理 |
| 7 | `from langchain_core.messages import HumanMessage, SystemMessage` | 构造 LLM 对话消息 |
| 8 | `from sqlalchemy import text` | 原生 SQL 语句 |
| 10~12 | `from backend.agents.resume.state import (ResumeState, ResumeStructured, DimensionScore, IssueList, ResumeSummary)` | 图状态与 4 个 Pydantic 结构 |
| 13~16 | `from backend.agents.resume.prompts import (SYSTEM_PROMPT, EXTRACT_STRUCTURED_PROMPT, DIMENSION_REVIEW_PROMPTS, DIAGNOSE_ISSUES_PROMPT, GENERATE_SUMMARY_PROMPT, DIAGNOSE_THINK_PROMPT)` | 全部提示词模板 |
| 17 | `from backend.core.llm_factory import get_structured_llm, get_llm` | LLM 工厂 |
| 18 | `from backend.core.logger import get_logger` | 结构化日志 |
| 19 | `from backend.dependencies import AsyncSessionLocal` | 异步数据库会话 |
| 21 | `logger = get_logger(__name__)` | 模块级日志器 |

### 依赖

- `backend/agents/resume/state.py`（State 与 Pydantic 结构）
- `backend/agents/resume/prompts.py`（提示词）
- `backend/core/llm_factory.py`、`backend/core/logger.py`、`backend/dependencies.py`

---

## 二、六维度定义 `SIX_DIMENSIONS`

### 签名与动机

定义评审的六个维度及其权重，权重之和 = 1.0。这是**评分体系的核心配置**，`run_six_dimensions` 节点会据此并行发起 6 路 LLM 调用并计算加权总分。

### 逐行精读

```python
# nodes.py 第 25~38 行
```

| 行号 | 代码 | 说明 |
|-----|------|------|
| 25 | `SIX_DIMENSIONS = [` | 列表，每个元素是一个 dict |
| 26 | `{"key": "project_depth", "name": "项目深度", "weight": 0.30,` | 项目深度，权重 0.30 |
| 27 | `"focus": "...量化数据、技术选型理由、个人贡献、难点解决"},` | 评分侧重提示 |
| 28 | `{"key": "tech_match", "name": "技术匹配度", "weight": 0.25,` | 技术匹配度，权重 0.25 |
| 29 | `"focus": "...技能描述是否有层次..."},` | 侧重 |
| 30 | `{"key": "expression", "name": "表达规范性", "weight": 0.15,` | 表达规范性 0.15 |
| 31 | `"focus": "动词开头、STAR 结构、无错别字..."},` | 侧重 |
| 32 | `{"key": "structure", "name": "简历结构", "weight": 0.15,` | 简历结构 0.15 |
| 33 | `"focus": "模块完整性、排版逻辑、信息密度..."},` | 侧重 |
| 34 | `{"key": "quantification", "name": "量化程度", "weight": 0.10,` | 量化程度 0.10 |
| 35 | `"focus": "性能指标、用户量、优化幅度..."},` | 侧重 |
| 36 | `{"key": "authenticity", "name": "真实可信度", "weight": 0.05,` | 真实可信度 0.05 |
| 37 | `"focus": "表述是否夸大...时间线是否合理"},` | 侧重 |
| 38 | `]` | 结束 |

权重和 = 1.0。**项目深度 + 技术匹配度（0.55）占了一半以上**，突出"简历的核心是项目与岗位匹配"。

---

## 三、节点①②：空跑节点

### 签名与动机

当文件已在本地时，上传 MinIO 与下载 PDF 均无需执行，故两个节点直接返回空 dict。**这是为"本地模式"预留的扩展点**——未来若接入对象存储，可在不改变图结构的前提下填充真实逻辑。

### 逐行精读

```python
# nodes.py 第 42~45 行
```

| 行号 | 代码 | 说明 |
|-----|------|------|
| 42 | `async def upload_to_minio_node(state: ResumeState) -> dict:` | 节点①签名 |
| 43 | `"""文件已在本地，无需上传对象存储，直接跳过。"""` | 文档串 |
| 44 | `logger.info("upload_to_minio.skip", review_id=state["review_id"], reason="local_mode")` | 记录跳过原因 |
| 45 | `return {}` | 不改任何状态，返回空 dict |

```python
# nodes.py 第 48~51 行
```

| 行号 | 代码 | 说明 |
|-----|------|------|
| 48 | `async def download_pdf_node(state: ResumeState) -> dict:` | 节点②签名 |
| 49 | `"""文件已在 pdf_local_path，无需下载，直接跳过。"""` | 文档串 |
| 50 | `logger.info("download_pdf.skip", review_id=state["review_id"], reason="local_file_exists")` | 记录跳过原因 |
| 51 | `return {}` | 不改状态 |

---

## 四、节点③：`extract_text` — PDF 文本提取

### 签名与动机

PDF 解析是 **CPU 密集**操作，若直接放在 `async` 节点里会阻塞事件循环。设计上拆出**同步函数 `_sync_extract_text`**，由异步节点用 `run_in_executor` 丢到线程池执行；同步函数内部还处理了**双栏布局**，避免左右栏文字交错。

### 逐行精读：`_sync_extract_text`（同步核心）

```python
# nodes.py 第 55~90 行
```

| 行号 | 代码 | 说明 |
|-----|------|------|
| 55 | `def _sync_extract_text(pdf_path: str) -> dict:` | 同步函数，返回 `{"raw_text", "page_count"}` |
| 56 | `"""同步 PDF 文本提取（线程池中运行），处理双栏布局。"""` | 文档串 |
| 57 | `import fitz  # PyMuPDF` | 惰性导入，避免模块加载即依赖第三方库 |
| 58 | `doc = fitz.open(pdf_path)` | 打开 PDF |
| 59 | `page_count = len(doc)` | 总页数 |
| 60 | `all_text_parts = []` | 收集每页文本 |
| 62 | `for page in doc:` | 逐页遍历 |
| 63 | `blocks = page.get_text("blocks")` | 每块 `(x0,y0,x1,y1,text,no,type)` |
| 64 | `text_blocks = [b for b in blocks if b[6] == 0]` | 只保留文字块（type==0） |
| 65 | `if not text_blocks:` | 本页无文字（如纯图片） |
| 66 | `continue` | 跳过该页 |
| 67 | `page_width = page.rect.width` | 页面宽度 |
| 68 | `midpoint = page_width / 2` | 页面中线 |
| 69 | `left_blocks = [b for b in text_blocks if b[0] < midpoint - 20]` | x0 在中线左（含 20px 容差）为左栏 |
| 70 | `right_blocks = [b for b in text_blocks if b[0] >= midpoint - 20]` | 其余为右栏 |
| 71~74 | `is_two_column = (len(left_blocks) >= 2 and len(right_blocks) >= 2 and len(right_blocks) / max(len(text_blocks), 1) > 0.3)` | 双栏判定：两侧块都 ≥2 且右栏占比 >30% |
| 75 | `if is_two_column:` | 双栏分支 |
| 76 | `left_sorted = sorted(left_blocks, key=lambda b: b[1])` | 左栏按 y 排序 |
| 77 | `right_sorted = sorted(right_blocks, key=lambda b: b[1])` | 右栏按 y 排序 |
| 78~82 | `page_text = ("\n".join(...左栏...) + "\n" + "\n".join(...右栏...))` | 先读完整左栏再读右栏，避免交错 |
| 83 | `else:` | 单栏分支 |
| 84 | `sorted_blocks = sorted(text_blocks, key=lambda b: b[1])` | 全部块按 y 从上到下 |
| 85 | `page_text = "\n".join(b[4].strip() for b in sorted_blocks if b[4].strip())` | 拼接文本，剔除空白块 |
| 86 | `all_text_parts.append(page_text)` | 收集本页 |
| 88 | `doc.close()` | 释放资源 |
| 89 | `raw_text = "\n\n---PAGE BREAK---\n\n".join(all_text_parts)` | 页间用分隔符连接 |
| 90 | `return {"raw_text": raw_text, "page_count": page_count}` | 返回结果 |

### 逐行精读：`extract_text_node`（异步节点）

```python
# nodes.py 第 93~106 行
```

| 行号 | 代码 | 说明 |
|-----|------|------|
| 93 | `async def extract_text_node(state: ResumeState) -> dict:` | 节点③签名 |
| 94 | `"""异步节点：线程池跑同步解析，避免阻塞事件循环。"""` | 动机注释 |
| 95 | `pdf_path = state["pdf_local_path"]` | 取本地 PDF 路径 |
| 96 | `try:` | 异常保护 |
| 97 | `loop = asyncio.get_running_loop()` | 取当前事件循环 |
| 98 | `result = await loop.run_in_executor(None, _sync_extract_text, pdf_path)` | **丢线程池执行**，不阻塞循环 |
| 99 | `raw_text, page_count = result["raw_text"], result["page_count"]` | 解包结果 |
| 100 | `if len(raw_text.strip()) < 200:` | 文本过短（疑似扫描件/图片 PDF） |
| 101 | `logger.warning("extract_text.text_too_short", text_length=...)` | 仅告警不中断 |
| 102 | `logger.info("extract_text.done", page_count=..., text_length=...)` | 完成日志 |
| 103 | `return {"raw_text": raw_text, "page_count": page_count}` | 更新状态 |
| 104 | `except Exception as e:` | 捕获异常 |
| 105 | `logger.error("extract_text.failed", error=str(e))` | 记录错误 |
| 106 | `raise` | 重新抛出，交给上层兜底 |

### ★ Insight ─── 设计亮点

```python
# 亮点：CPU 密集操作与事件循环解耦
result = await loop.run_in_executor(None, _sync_extract_text, pdf_path)
#  └─ 同步函数跑在线程池，async 节点只等结果，事件循环不被阻塞

# 亮点：双栏阅读顺序
if is_two_column:
    page_text = 左栏(按y) + "\n" + 右栏(按y)   # 先整栏再换栏，避免左右交错
```

**关键设计**：PDF 解析全程不占用事件循环，多用户并发上传时吞吐不下降；双栏判定用右侧占比 >30% 而非两侧对半，对"右侧只有少量注记"的版面更鲁棒。

---

## 五、节点④：`extract_structured` — 结构化提取

### 签名与动机

把 `raw_text` 交给 LLM，用 **Function Calling + Pydantic Schema** 提取成结构化简历 `ResumeStructured`。LLM 直接返回类型化对象，无需解析文本。结构化输出偶发返回 `None`，故做了**判空 + 2 次重试 + 降级**。

### 逐行精读

```python
# nodes.py 第 110~138 行
```

| 行号 | 代码 | 说明 |
|-----|------|------|
| 110 | `async def extract_structured_node(state: ResumeState) -> dict:` | 节点④签名 |
| 111 | `"""用 LLM Function Calling 把文本提取成结构化简历。"""` | 动机注释 |
| 112 | `raw_text = state["raw_text"]` | 取原文 |
| 113 | `text_for_llm = raw_text[:4000] if len(raw_text) > 4000 else raw_text` | 超长截断到 4000 字符 |
| 114 | `prompt = EXTRACT_STRUCTURED_PROMPT.format(resume_text=text_for_llm)` | 填充提示词 |
| 115 | `structured_llm = get_structured_llm("resume", ResumeStructured)` | 绑定 Schema |
| 116 | `structured_dict = None` | 初始化结果 |
| 117 | `for attempt in range(2):` | 最多 2 次尝试 |
| 118 | `try:` | 保护 |
| 119 | `result = await structured_llm.ainvoke([` | 调用 LLM |
| 120 | `SystemMessage(content=SYSTEM_PROMPT),` | 系统角色 |
| 121 | `HumanMessage(content=prompt),` | 用户消息 |
| 122 | `])` | — |
| 123 | `if result is None:` | 结构化输出偶发返回 None |
| 124 | `raise ValueError("structured output returned None")` | 触发重试 |
| 125 | `structured_dict = result.model_dump()` | 转 dict |
| 126 | `break` | 成功退出循环 |
| 127 | `except Exception as e:` | 捕获 |
| 128 | `if attempt == 0:` | 第一次失败 |
| 129 | `logger.warning("extract_structured.retry", error=str(e))` | 告警 |
| 130 | `await asyncio.sleep(1)` | 等 1s 重试 |
| 131 | `else:` | 第二次失败 |
| 132 | `logger.warning("extract_structured.failed", error=str(e))` | 记录最终失败 |
| 133 | `if structured_dict is None:` | 一直失败 |
| 134 | `structured_dict = ResumeStructured(name="未能提取").model_dump()` | **降级空结构** |
| 135 | `logger.info("extract_structured.done",` | 完成日志 |
| 136 | `name=structured_dict.get("name", ""),` | 姓名 |
| 137 | `projects_count=len(structured_dict.get("projects", [])))` | 项目数 |
| 138 | `return {"structured": structured_dict}` | 更新状态 |

### ★ Insight ─── 设计亮点

```python
# 亮点：结构化输出 + 判空重试
result = await structured_llm.ainvoke([SystemMessage(...), HumanMessage(...)])
if result is None:
    raise ValueError("structured output returned None")   # 触发下一次重试
structured_dict = result.model_dump()                     # 直接是 ResumeStructured 类型

# 亮点：失败降级，不中断整条流水线
if structured_dict is None:
    structured_dict = ResumeStructured(name="未能提取").model_dump()  # 空结构继续跑
```

**关键设计**：`get_structured_llm("resume", ResumeStructured)` 绑定 Pydantic Schema，LLM 返回的对象直接是 `ResumeStructured` 类型，免去文本解析；所有失败都降级为空结构，保证后续节点可继续执行。

---

## 六、节点⑤：`run_six_dimensions` — 六维度并行评审

### 签名与动机

**性能关键路径**。对六个维度各发起一次 LLM 调用，用 `asyncio.gather` 同时执行（6 路并行），总耗时 = 最慢的一个而非六个之和。每个维度独立做 2 次重试 + 降级，最后按权重计算加权总分。

### 逐行精读

```python
# nodes.py 第 142~184 行
```

| 行号 | 代码 | 说明 |
|-----|------|------|
| 142 | `async def run_six_dimensions_node(state: ResumeState) -> dict:` | 节点⑤签名 |
| 143 | `"""六维度并行评审：asyncio.gather 同时评，算加权综合分。"""` | 动机注释 |
| 144 | `raw_text = state["raw_text"]` | 原文 |
| 145 | `structured = state.get("structured") or {}` | 结构化结果（可能为空） |
| 146 | `structured_summary = _build_structured_summary(structured)` | 浓缩摘要（省 token） |
| 148 | `async def review_one_dimension(dim: dict) -> dict:` | 内嵌协程：评审单一维度 |
| 149 | `prompt_template = DIMENSION_REVIEW_PROMPTS.get(dim["key"], "")` | 取该维度提示词 |
| 150 | `if not prompt_template:` | 无模板 |
| 151 | `return _empty_dimension_score(dim)` | 直接降级 |
| 153 | `prompt = prompt_template.format(` | 填充提示词 |
| 154 | `resume_text=raw_text[:3000],` | 原文截断 3000 |
| 155 | `structured_summary=structured_summary,` | 摘要 |
| 156 | `focus=dim["focus"])` | 侧重 |
| 157 | `last_exception = None` | 记录最后异常 |
| 159 | `for attempt in range(2):` | 最多 2 次 |
| 160 | `try:` | 保护 |
| 161 | `structured_llm = get_structured_llm("resume", DimensionScore)` | 绑定维度评分 Schema |
| 162 | `result: DimensionScore = await structured_llm.ainvoke([` | 调用 LLM |
| 163 | `SystemMessage(content=SYSTEM_PROMPT),` | 系统角色 |
| 164 | `HumanMessage(content=prompt),` | 用户消息 |
| 165 | `])` | — |
| 166 | `d = result.model_dump()` | 转 dict |
| 167 | `d["dimension"], d["weight"], d["key"] = dim["name"], dim["weight"], dim["key"]` | **回填维度名/权重/键** |
| 168 | `return d` | 返回该维度评分 |
| 169 | `except Exception as e:` | 捕获 |
| 170 | `last_exception = e` | 记录 |
| 171 | `logger.warning("six_dimensions.attempt_failed", dimension=..., attempt=..., error=...)` | 告警 |
| 172 | `if attempt == 0:` | 第一次失败 |
| 173 | `await asyncio.sleep(1)` | 等 1s 重试 |
| 174 | `# 第 2 次失败：不等待，直接降级` | 注释 |
| 176 | `logger.warning("six_dimensions.all_attempts_failed", dimension=..., error=str(last_exception))` | 记录最终失败 |
| 177 | `return _empty_dimension_score(dim)` | 返回默认分数 |
| 179 | `tasks = [review_one_dimension(dim) for dim in SIX_DIMENSIONS]` | 创建 6 个协程 |
| 180 | `dimension_scores = await asyncio.gather(*tasks)` | **6 路并行等待** |
| 181 | `weighted_score = sum(d["score"] * d["weight"] for d in dimension_scores)` | 加权求和 |
| 182 | `logger.info("six_dimensions.done", weighted_score=round(weighted_score, 2),` | 完成日志 |
| 183 | `scores={d["key"]: d["score"] for d in dimension_scores})` | 各维度得分 |
| 184 | `return {"dimension_scores": list(dimension_scores), "weighted_score": round(weighted_score, 2)}` | 更新状态 |

### 依赖关系

- `SIX_DIMENSIONS`（25~38 行）
- `_build_structured_summary`（187~204 行）
- `_empty_dimension_score`（207~210 行）
- `DIMENSION_REVIEW_PROMPTS`（来自 prompts.py）

### ★ Insight ─── 设计亮点

```python
# 亮点：6 路并行，耗时从"6 个之和"降到"最慢一个"
tasks = [review_one_dimension(dim) for dim in SIX_DIMENSIONS]
dimension_scores = await asyncio.gather(*tasks)   # ← 并行！

# 亮点：维度信息回填，让每份评分自带"我是谁"
d["dimension"], d["weight"], d["key"] = dim["name"], dim["weight"], dim["key"]

# 亮点：单维度失败不影响其它 5 路，最后降级兜底
return _empty_dimension_score(dim)   # 该维度给默认分，不拖垮整体
```

**关键设计**：这是性能关键路径，6 个 LLM 调用同时进行；单个维度即使 2 次都失败也只降级该维度，`weighted_score` 仍可算出，保证"坏一个维度不坏整张简历"。

### 辅助函数 `_build_structured_summary`

```python
# nodes.py 第 187~204 行
```

| 行号 | 代码 | 说明 |
|-----|------|------|
| 187 | `def _build_structured_summary(structured: dict) -> str:` | 浓缩结构化数据为几行摘要 |
| 188 | `"""把结构化数据浓缩成几行摘要，供评审使用（省 token）。"""` | 动机注释 |
| 189 | `lines = []` | 收集摘要行 |
| 190 | `if structured.get("name"):` | 有姓名 |
| 191 | `lines.append(f"姓名：{structured['name']}")` | — |
| 192 | `if structured.get("target_position"):` | 有求职意向 |
| 193 | `lines.append(f"求职意向：{structured['target_position']}")` | — |
| 194 | `if structured.get("education"):` | 有学历 |
| 195 | `edu = structured["education"][0]` | 取最高学历 |
| 196 | `lines.append(f"最高学历：{edu.get('school','')} {edu.get('major','')} {edu.get('degree','')}")` | 拼接 |
| 197 | `if structured.get("skills_list"):` | 有技能 |
| 198 | `lines.append(f"技术栈：{', '.join(structured['skills_list'][:10])}")` | 最多 10 项 |
| 199 | `if structured.get("projects"):` | 有项目 |
| 200 | `proj_names = [p.get("name", "") for p in structured["projects"]]` | 项目名列表 |
| 201 | `lines.append(f"项目数量：{len(...)} 个（{', '.join(proj_names[:3])}）")` | 数量 + 前 3 个名字 |
| 202 | `if structured.get("work_experience"):` | 有工作经历 |
| 203 | `lines.append(f"工作经历：{len(structured['work_experience'])} 段")` | — |
| 204 | `return "\n".join(lines) if lines else "（结构化提取失败，请基于原文评审）"` | 空则提示 |

### 辅助函数 `_empty_dimension_score`

```python
# nodes.py 第 207~210 行
```

| 行号 | 代码 | 说明 |
|-----|------|------|
| 207 | `def _empty_dimension_score(dim: dict) -> dict:` | 维度评审失败时的降级结果 |
| 209 | `return {"key": dim["key"], "dimension": dim["name"], "score": 50, "weight": dim["weight"],` | 默认分 50、保留权重 |
| 210 | `"issues": ["该维度评审失败，建议人工复核"], "suggestions": []}` | 提示人工复核 |

---

## 七、节点⑥：`diagnose_issues` — 问题诊断

### 签名与动机

汇总各维度问题，先用**独立的 Think 前置推理**（temperature=0）做宏观分析，再结构化生成问题清单，最后按优先级排序。Think 步骤可失败（不阻塞主流程），其输出作为上下文附加到正式提示词中，提升诊断质量。

### 逐行精读

```python
# nodes.py 第 214~270 行
```

| 行号 | 代码 | 说明 |
|-----|------|------|
| 214 | `async def diagnose_issues_node(state: ResumeState) -> dict:` | 节点⑥签名 |
| 215 | `"""汇总维度问题 → Think 前置推理 → 结构化生成问题清单 → 按优先级排序。"""` | 动机注释 |
| 216 | `dimension_scores = state.get("dimension_scores", [])` | 各维度评分 |
| 217 | `raw_text = state["raw_text"]` | 原文 |
| 218 | `structured = state.get("structured") or {}` | 结构化 |
| 220 | `all_raw_issues = []` | 收集原始问题 |
| 221 | `for dim in dimension_scores:` | 遍历维度 |
| 222 | `for issue_text in dim.get("issues", []):` | 遍历该维度问题 |
| 223 | `all_raw_issues.append(f"[{dim['dimension']}] {issue_text}")` | 带维度前缀 |
| 224 | `raw_issues_text = "\n".join(f"- {i}" for i in all_raw_issues) or "（暂无）"` | 转为列表文本 |
| 226 | `reasoning_trace = ""` | Think 前置推理（可失败） |
| 227 | `try:` | 保护 |
| 228 | `dimension_scores_summary = "\n".join(` | 构建评分摘要 |
| 229 | `f"- {d['dimension']}：{d['score']}分 — 问题：{', '.join(d.get('issues', [])[:2])}"` | 每维度带前 2 个问题 |
| 230 | `for d in dimension_scores` | 遍历 |
| 231 | `)` | 结束 |
| 232 | `think_prompt = DIAGNOSE_THINK_PROMPT.format(` | 填充 Think 提示词 |
| 233 | `dimension_scores_summary=dimension_scores_summary,` | 评分摘要 |
| 234 | `raw_issues=raw_issues_text)` | 问题列表 |
| 236 | `think_llm = get_llm("resume", temperature=0)` | 取普通 LLM，temperature=0 |
| 237 | `think_resp = await think_llm.ainvoke([HumanMessage(content=think_prompt)])` | 让 LLM"先想" |
| 238 | `reasoning_trace = (` | 提取文本 |
| 239 | `think_resp.text if hasattr(think_resp, "text") and not callable(think_resp.text)` | 兼容 AIMessage.text |
| 240 | `else str(think_resp.content)` | 否则取 content |
| 241 | `).strip()` | 去两端空白 |
| 242 | `except Exception as e:` | Think 失败不致命 |
| 243 | `logger.warning("diagnose_think.failed", error=str(e))` | 仅告警 |
| 245 | `think_context = f"\n\n【诊断前宏观分析】\n{reasoning_trace}" if reasoning_trace else ""` | 拼上下文 |
| 247 | `prompt = DIAGNOSE_ISSUES_PROMPT.format(` | 填充主提示词 |
| 248 | `resume_text=raw_text[:3000],` | 原文截断 |
| 249 | `structured_summary=_build_structured_summary(structured),` | 摘要 |
| 250 | `raw_issues=raw_issues_text,` | 问题 |
| 251 | `) + think_context` | **追加 Think 上下文** |
| 253 | `try:` | 保护 |
| 254 | `structured_llm = get_structured_llm("resume", IssueList)` | 绑定问题清单 Schema |
| 255 | `result: IssueList = await structured_llm.ainvoke([` | 调用 LLM |
| 256 | `SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=prompt)])` | 消息 |
| 257 | `issues = [item.model_dump() for item in result.items]` | 转 dict 列表 |
| 258 | `except Exception as e:` | 捕获 |
| 259 | `logger.warning("diagnose_issues.failed", error=str(e))` | 告警 |
| 260 | `issues = [` | 降级：用维度问题 |
| 261 | `{"priority": "medium", "dimension": dim["dimension"], "description": issue,` | 统一 medium |
| 262 | `"location": "简历全文", "suggestion": "请参考评审建议修改"}` | 兜底字段 |
| 263 | `for dim in dimension_scores for issue in dim.get("issues", [])` | 双层推导 |
| 264 | `]` | 结束 |
| 266 | `priority_order = {"high": 0, "medium": 1, "low": 2}` | 优先级权重 |
| 267 | `issues.sort(key=lambda x: priority_order.get(x.get("priority", "low"), 2))` | 按优先级排序 |
| 268 | `logger.info("diagnose_issues.done", total=len(issues),` | 完成日志 |
| 269 | `high=sum(1 for i in issues if i.get("priority") == "high"))` | 统计 high 数 |
| 270 | `return {"issues": issues}` | 更新状态 |

### ★ Insight ─── 设计亮点

```python
# 亮点：先 Think 再答（提升诊断质量）
think_resp = await think_llm.ainvoke([HumanMessage(content=think_prompt)])  # 独立宏观推演
think_context = f"\n\n【诊断前宏观分析】\n{reasoning_trace}"
prompt = DIAGNOSE_ISSUES_PROMPT.format(...) + think_context   # 思考结果作为正式上下文

# 亮点：Think 可失败但绝不阻塞主流程
try:
    think_resp = ...
except Exception as e:
    logger.warning("diagnose_think.failed", error=str(e))  # 仅告警，reasoning_trace 保持 ""
```

**关键设计**：Think 步骤用 `temperature=0` 保证稳定，且其失败被完全隔离——就算宏观分析没生成，主诊断照常进行，只是少了附加上下文。

---

## 八、节点⑦：`generate_summary` — 整体评价

### 签名与动机

综合结构化信息、各维度评分、问题清单和加权分，生成面向学员的整体评价（亮点、核心改进、综合评语、岗位匹配度）。同样做 **判空 + 2 次重试 + 降级**。

### 逐行精读

```python
# nodes.py 第 274~315 行
```

| 行号 | 代码 | 说明 |
|-----|------|------|
| 274 | `async def generate_summary_node(state: ResumeState) -> dict:` | 节点⑦签名 |
| 275 | `"""综合结构化信息、评分、问题，生成面向学员的整体评价。"""` | 动机注释 |
| 276 | `structured = state.get("structured") or {}` | 结构化 |
| 277 | `dimension_scores = state.get("dimension_scores", [])` | 评分 |
| 278 | `issues = state.get("issues", [])` | 问题 |
| 279 | `weighted_score = state.get("weighted_score", 0.0)` | 加权分 |
| 281 | `high_issues = [i["description"] for i in issues if i.get("priority") == "high"][:5]` | 取前 5 条高优问题 |
| 282 | `high_issues_text = "\n".join(f"- {i}" for i in high_issues) or "（无高优先级问题）"` | 转文本 |
| 283 | `scores_text = "\n".join(` | 评分文本 |
| 284 | `f"- {d['dimension']}：{d['score']}分（权重{int(d['weight'] * 100)}%）" for d in dimension_scores)` | 维度+分+权重百分比 |
| 286 | `prompt = GENERATE_SUMMARY_PROMPT.format(` | 填充提示词 |
| 287 | `structured_summary=_build_structured_summary(structured),` | 摘要 |
| 288 | `scores_summary=scores_text, weighted_score=round(weighted_score, 1),` | 评分与加权分 |
| 289 | `high_issues=high_issues_text, target_position=structured.get("target_position", "后端开发"),` | 高优问题与求职意向 |
| 290 | `)` | 结束 |
| 291 | `structured_llm = get_structured_llm("resume", ResumeSummary)` | 绑定总结 Schema |
| 292 | `summary_dict = None` | 初始化 |
| 293 | `for attempt in range(2):` | 最多 2 次 |
| 294 | `try:` | 保护 |
| 295 | `result = await structured_llm.ainvoke([` | 调用 LLM |
| 296 | `SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=prompt)])` | 消息 |
| 297 | `if result is None:` | 判空 |
| 298 | `raise ValueError("structured output returned None")` | 触发重试 |
| 299 | `summary_dict = result.model_dump()` | 转 dict |
| 300 | `break` | 成功退出 |
| 301 | `except Exception as e:` | 捕获 |
| 302 | `if attempt == 0:` | 第一次失败 |
| 303 | `logger.warning("generate_summary.retry", error=str(e))` | 告警 |
| 304 | `await asyncio.sleep(1)` | 等 1s |
| 305 | `else:` | 第二次失败 |
| 306 | `logger.warning("generate_summary.failed", error=str(e))` | 记录 |
| 307 | `if summary_dict is None:` | 一直失败 |
| 308 | `summary_dict = {` | 降级默认评价 |
| 309 | `"highlights": ["简历内容已完整提交"],` | 默认亮点 |
| 310 | `"core_improvements": high_issues[:2] if high_issues else ["请参考各维度建议修改"],` | 默认改进 |
| 311 | `"overall_comment": f"综合评分 {round(weighted_score, 1)} 分，请参考各维度详细反馈。",` | 默认评语 |
| 312 | `"fit_assessment": "与目标岗位匹配度评估暂不可用",` | 默认匹配度 |
| 313 | `}` | 结束 |
| 314 | `logger.info("generate_summary.done", highlights_count=len(summary_dict.get("highlights", [])))` | 完成日志 |
| 315 | `return {"summary": summary_dict}` | 更新状态 |

### 依赖关系

- `_build_structured_summary`（187~204 行）
- `GENERATE_SUMMARY_PROMPT`（来自 prompts.py）

---

## 九、节点⑧：`save_results` — 结果持久化

### 签名与动机

把完整审查结果写入 `resume_reviews` 表（JSONB 列），更新状态为 `done`，并在成功后清理本地临时 PDF。同时整理一份 `structured_output` 供上层 API 直接使用。

### 逐行精读

```python
# nodes.py 第 319~371 行
```

| 行号 | 代码 | 说明 |
|-----|------|------|
| 319 | `async def save_results_node(state: ResumeState) -> dict:` | 节点⑧签名 |
| 320 | `"""把完整结果写入 resume_reviews（JSONB 字段），清理临时文件。"""` | 动机注释 |
| 321 | `review_id = state["review_id"]` | 取工单号 |
| 324 | `structured_output = {` | 留一份完整结果给上层 |
| 325 | `"review_id": review_id, "student_id": state["student_id"],` | 基本信息 |
| 326 | `"structured": state.get("structured"),` | 结构化 |
| 327 | `"weighted_score": state.get("weighted_score", 0),` | 加权分 |
| 328 | `"dimension_scores": state.get("dimension_scores", []),` | 维度分 |
| 329 | `"issues": state.get("issues", []),` | 问题 |
| 330 | `"summary": state.get("summary"),` | 评价 |
| 331 | `}` | 结束 |
| 333 | `async with AsyncSessionLocal() as session:` | 统一异步会话 |
| 334 | `try:` | 保护 |
| 335 | `await session.execute(` | 执行 SQL |
| 336 | `text("""` | 原生 SQL |
| 337 | `UPDATE resume_reviews` | 更新表 |
| 338 | `SET structured_data = :structured_data,` | 结构化数据 |
| 339 | `scores = :scores,` | 评分 |
| 340 | `issues = :issues,` | 问题 |
| 341 | `summary = :summary,` | 评价 |
| 342 | `status = 'done',` | 状态置 done |
| 343 | `updated_at = NOW()` | 更新时间 |
| 344 | `WHERE id = :review_id` | 按工单号 |
| 345 | `"""),` | 结束 SQL |
| 346 | `{` | 参数 dict |
| 347 | `# JSONB 列：先 json.dumps 转 JSON 字符串；ensure_ascii=False 保留中文原文` | 关键注释 |
| 348 | `"structured_data": json.dumps(state.get("structured"), ensure_ascii=False),` | 序列化 |
| 349 | `"scores": json.dumps(` | scores 包一层 |
| 350 | `{"dimension_scores": state.get("dimension_scores", []),` | 维度分 |
| 351 | `"weighted_score": state.get("weighted_score", 0)},` | 加权分 |
| 352 | `ensure_ascii=False),` | 保留中文 |
| 353 | `"issues": json.dumps(state.get("issues", []), ensure_ascii=False),` | 序列化 issues |
| 354 | `"summary": json.dumps(state.get("summary"), ensure_ascii=False),` | 序列化 summary |
| 355 | `"review_id": review_id,` | 参数 |
| 356 | `},` | 结束参数 |
| 357 | `)` | 结束 execute |
| 358 | `await session.commit()` | 提交事务 |
| 359 | `logger.info("save_results.db_written", review_id=review_id)` | 成功日志 |
| 360 | `except Exception as e:` | 捕获 |
| 361 | `await session.rollback()` | 回滚 |
| 362 | `logger.error("save_results.db_failed", error=str(e))` | 错误日志 |
| 363 | `raise` | 重新抛出 |
| 366 | `local_path = state.get("pdf_local_path", "")` | 取临时 PDF 路径 |
| 367 | `if local_path and os.path.exists(local_path):` | 存在才删 |
| 368 | `os.remove(local_path)` | 删除临时文件 |
| 369 | `logger.info("save_results.tmp_cleaned", path=local_path)` | 清理日志 |
| 371 | `return {"fallback_used": False, "structured_output": structured_output}` | 返回给上层 |

### ★ Insight ─── 设计亮点

```python
# 亮点：ensure_ascii=False 保留中文原文
"summary": json.dumps(state.get("summary"), ensure_ascii=False)
#  └─ 默认 ensure_ascii=True 会把中文转 \uXXXX，这里关闭以保留中文可读性

# 亮点：事务与临时文件清理同节点完成
async with AsyncSessionLocal() as session:
    await session.commit()      # 写库成功
os.remove(local_path)           # 才清理临时 PDF（省磁盘）
```

**关键设计**：持久化与清理收尾放在最后一个节点，写库成功后才删临时文件；`structured_output` 作为状态字段回流，方便 API 层直接读取完整结果。

---

## 十、模块自测

```python
# nodes.py 第 375~385 行
```

| 行号 | 代码 | 说明 |
|-----|------|------|
| 375 | `if __name__ == "__main__":` | 直接运行该文件时触发 |
| 383 | `path = r"...\曹浩磊-Agent工程师.pdf"` | 实测样本 |
| 384 | `_r = asyncio.run(extract_text_node({"pdf_local_path": path}))` | 离线跑文本提取 |
| 385 | `print("page_count:", ..., "| 含 Spring Boot:", "Spring Boot" in _r["raw_text"])` | 断言结果 |

---

## 十一、总结

| 节点 | 行号 | 职责 | 性能/健壮性要点 |
|-----|------|------|----------------|
| ①② 空跑 | 42~51 | 预留扩展点 | 返回空 dict |
| ③ extract_text | 55~106 | PDF 文本提取 | 线程池 + 双栏处理 |
| ④ extract_structured | 110~138 | 结构化提取 | 结构化输出 + 重试 + 降级 |
| ⑤ run_six_dimensions | 142~184 | 六维度并行评审 | `asyncio.gather` 6 路并行 |
| 辅助 | 187~210 | 摘要/降级 | 省 token、保流程 |
| ⑥ diagnose_issues | 214~270 | 问题诊断 | 先 Think 再答 |
| ⑦ generate_summary | 274~315 | 整体评价 | 重试 + 降级 |
| ⑧ save_results | 319~371 | 结果持久化 | JSONB + 清理临时文件 |

```
每个节点 = async def 函数
  输入：state（当前 State）
  输出：dict（要更新的字段）
  异常：降级处理，不中断流程

性能关键路径：
  extract_text          → 线程池（CPU-bound PDF 解析）
  run_six_dimensions    → asyncio.gather（6 路并行 LLM）
  extract_structured    → 结构化输出（无需解析文本）
  diagnose_issues       → 先 Think 再答（提升质量）
```