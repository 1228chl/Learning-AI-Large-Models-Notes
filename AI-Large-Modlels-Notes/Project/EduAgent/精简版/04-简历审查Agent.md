# 第4章 简历审查 Agent

## 4.1 全景与数据流

**核心功能**：上传PDF简历，自动生成审查报告（六维度评分+问题诊断+整体评价）。

**特点**：全自动直线图（8节点顺序执行，无分支，无HitL，无Checkpointer），结构化输出贯穿全程，并行是性能关键。

**HTTP请求流程**：
```
学员POST /resume/upload（PDF+JWT）→ 存文件+插库(status=processing)
→ 立即返回202+review_id → 后台启动LangGraph图执行（异步任务）
→ 前端轮询GET /resume/reviews/{id} 直至status变为done
```

**8节点流水线**：
```
START → ①upload_to_minio(空跑) → ②download_pdf(空跑) → ③extract_text(PDF→raw_text)
→ ④extract_structured(LLM提取结构化简历) → ⑤run_six_dimensions(6维度并行评分)
→ ⑥diagnose_issues(问题诊断) → ⑦generate_summary(整体评价)
→ ⑧save_results(写入DB) → END
```

**心智模型对应**：State=ResumeState(TypedDict，17字段)，Node=8个async函数，Edge=8条固定边，Checkpointer=无（一次性任务）。

## 4.2 State与数据模型

**嵌套模型结构**：`EducationItem`/`ProjectItem`/`WorkItem` → `ResumeStructured`（完整简历）。
**Field(description=...)**双重作用：既是注释，又通过`with_structured_output`发给LLM作为填空指令。

**IssueList包装技巧**：`with_structured_output`要求顶层是对象，不能直接返回"裸列表"，需包一层`IssueList { items: list[IssueItem] }`。

**ResumeState（17字段，7组）**：
- 请求上下文：messages/student_id/tenant_id/review_id/pdf_minio_path/pdf_local_path
- 解析结果：raw_text/page_count
- 结构化提取：structured
- 六维度评分：dimension_scores/weighted_score
- 问题诊断：issues
- 整体评价：summary
- 降级标记：fallback_used/structured_output

**设计决策**：State存`dict`而非Pydantic对象（节点LLM返回Pydantic后调`.model_dump()`转字典），保证可JSON序列化。

## 4.3 提示词

**集中管理**：所有提示词在`prompts.py`中，调提示词不动业务代码。

**评分rubric设计**：每个维度0-100分分档写明每一档特征，让LLM有明确标尺，避免评分飘忽不定。
```python
# 示例：项目深度评分标准
"90-100：每个项目都有量化指标、明确的技术选型理由、清晰的个人贡献和难点解决"
"70-89：大部分项目有量化数据，个人贡献基本清晰"
"50-69：项目描述偏泛，缺少量化数据，个人贡献不明确"
```

**六维度权重**：项目深度(0.30) > 技术匹配度(0.25) > 表达规范性(0.15) = 简历结构(0.15) > 量化程度(0.10) > 真实可信度(0.05)。权重和=1.0。

**Think提示设计**：先让LLM用自由文本做宏观分析，再把思考作为上下文喂给结构化诊断。这是一种轻量"推理增强"技巧，能显著提升诊断质量。

## 4.4 PDF解析与结构化提取

**双栏布局处理**：PyMuPDF逐页读取文本块，按横坐标x0分左右半，判断是否双栏（右侧占比>30%），双栏时先左后右读取。

**run_in_executor**：同步PDF解析用`loop.run_in_executor(None, _sync_extract_text, pdf_path)`丢线程池，不阻塞事件循环。

**结构化提取重试**：`with_structured_output`偶尔返回None（模型不用工具而用文字回复），判None+重试2次，两次失败则返回空结构兜底。

## 4.5 六维度并行评审

**并行核心模式**：
```python
async def review_one_dimension(dim: dict) -> dict:
    for attempt in range(2):  # 单维度2次重试
        try:
            result = await structured_llm.ainvoke([...])
            d = result.model_dump()
            d["dimension"] = dim["name"]   # 代码层填：维度名和权重
            d["weight"] = dim["weight"]
            return d
        except:
            return _empty_dimension_score(dim)  # 降级为50分

tasks = [review_one_dimension(dim) for dim in SIX_DIMENSIONS]
dimension_scores = await asyncio.gather(*tasks)
weighted_score = sum(d["score"] * d["weight"] for d in dimension_scores)
```
**关键**：`tasks = [...]`创建协程（还没执行），`await asyncio.gather(*tasks)`一起跑。单维度失败不影响其他维度。

## 4.6 问题诊断与整体评价

**diagnose_issues四步**：汇总各维度问题 → Think前置推理（可失败，不影响主流程） → 结构化生成IssueList → 按优先级排序(high→medium→low)。

**generate_summary**：综合所有结果，调用LLM生成`ResumeSummary`（亮点/改进/评语/匹配度）。同样防None+重试2次。

## 4.7 持久化与图装配

**JSONB写入**：Python dict用`json.dumps`转JSON字符串，`ensure_ascii=False`保留中文原文。
**JSONB读取**：asyncpg自动反序列化为Python dict/list，不需`json.loads`。

**图装配**：8个节点+8条固定边，无条件边，`compile()`不传checkpointer（一次性任务）。

## 4.8 API接口

| 接口 | 说明 |
|------|------|
| POST /resume/upload | 上传PDF，返回202+review_id，后台异步审查 |
| GET /resume/reviews/{id} | 轮询查询状态/结果（含超时兜底：15分钟标记failed） |
| DELETE /resume/reviews/{id} | 越权防护：WHERE条件带student_id |
| GET /resume/reviews | 列出本人记录，JSONB直接取综合分 |

**GC保护**：`_background_tasks: set[asyncio.Task]`持有后台任务强引用防GC回收。
**thread-local图**：`threading.local()`给每个线程一份独立图实例，避免多线程并发竞争。