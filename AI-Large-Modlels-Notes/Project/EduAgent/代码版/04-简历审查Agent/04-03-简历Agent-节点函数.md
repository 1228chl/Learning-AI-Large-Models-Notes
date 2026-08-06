# 简历审查 Agent：节点函数 — 从零理解

## 一、8 个节点概览

```
START → upload_to_minio → download_pdf → extract_text → extract_structured
       → run_six_dimensions → diagnose_issues → generate_summary → save_results → END
```

每个节点都是一个 `async def` 函数，输入 `state`（当前工单），输出 `dict`（要更新的字段）。

## 二、节点①②：空跑节点

```python
async def upload_to_minio_node(state: ResumeState) -> dict:
    """文件已在本地，无需上传对象存储"""
    return {}

async def download_pdf_node(state: ResumeState) -> dict:
    """文件已在本地，无需下载"""
    return {}
```

这两个节点是预留的扩展点。未来如果文件存在 MinIO 对象存储上，可以在这里实现上传和下载逻辑。

## 三、节点③：extract_text — PDF 文本提取

```python
async def extract_text_node(state: ResumeState) -> dict:
    pdf_path = state["pdf_local_path"]
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(None, _sync_extract_text, pdf_path)
    return {"raw_text": result["raw_text"], "page_count": result["page_count"]}
```

**关键设计**：PDF 解析是 CPU 密集型，用 `run_in_executor` 丢到线程池执行，不阻塞事件循环。

### 双栏布局识别

```python
def _sync_extract_text(pdf_path: str) -> dict:
    import fitz  # PyMuPDF
    doc = fitz.open(pdf_path)
    for page in doc:
        blocks = page.get_text("blocks")
        midpoint = page_width / 2
        left_blocks  = [b for b in text_blocks if b[0] < midpoint - 20]
        right_blocks = [b for b in text_blocks if b[0] >= midpoint - 20]

        is_two_column = (
            len(left_blocks) >= 2 and len(right_blocks) >= 2
            and len(right_blocks) / len(text_blocks) > 0.3
        )

        if is_two_column:
            # 双栏：左栏读完读右栏（避免左右栏文字交错）
            left_sorted  = sorted(left_blocks,  key=lambda b: b[1])
            right_sorted = sorted(right_blocks, key=lambda b: b[1])
            page_text = left_sorted + "\n" + right_sorted
        else:
            # 单栏：按 y 从上到下
            sorted_blocks = sorted(text_blocks, key=lambda b: b[1])
            page_text = "\n".join(b[4] for b in sorted_blocks)
```

## 四、节点④：extract_structured — 结构化提取

```python
async def extract_structured_node(state: ResumeState) -> dict:
    text_for_llm = raw_text[:4000]  # 截断
    structured_llm = get_structured_llm("resume", ResumeStructured)
    result = await structured_llm.ainvoke([...])
    return {"structured": result.model_dump()}
```

**关键设计**：
- `get_structured_llm("resume", ResumeStructured)` 绑定 Pydantic Schema
- LLM 返回的对象直接是 `ResumeStructured` 类型，不需要解析文本
- 失败时返回降级空结构

## 五、节点⑤：run_six_dimensions — 六维度并行评审

```python
async def run_six_dimensions_node(state: ResumeState) -> dict:
    async def review_one_dimension(dim: dict) -> dict:
        prompt = DIMENSION_REVIEW_PROMPTS[dim["key"]].format(...)
        result = await structured_llm.ainvoke([...])
        d = result.model_dump()
        d["dimension"], d["weight"] = dim["name"], dim["weight"]
        return d

    tasks = [review_one_dimension(dim) for dim in SIX_DIMENSIONS]
    dimension_scores = await asyncio.gather(*tasks)  # ← 6 路并行！

    weighted_score = sum(d["score"] * d["weight"] for d in dimension_scores)
    return {"dimension_scores": dimension_scores, "weighted_score": weighted_score}
```

**这是性能关键路径**：6 个 LLM 调用同时进行，总耗时 = 最慢的一个，而不是 6 个之和。

## 六、节点⑥：diagnose_issues — 问题诊断

```python
async def diagnose_issues_node(state: ResumeState) -> dict:
    # 先 Think 再答
    think_resp = await think_llm.ainvoke([HumanMessage(content=think_prompt)])
    think_context = f"\n\n【诊断前宏观分析】\n{reasoning_trace}"

    prompt = DIAGNOSE_ISSUES_PROMPT.format(...) + think_context
    result = await structured_llm.ainvoke([...])
    issues = [item.model_dump() for item in result.items]

    # 按优先级排序
    priority_order = {"high": 0, "medium": 1, "low": 2}
    issues.sort(key=lambda x: priority_order.get(x.get("priority", "low"), 2))
    return {"issues": issues}
```

## 七、节点⑦：generate_summary — 整体评价

```python
async def generate_summary_node(state: ResumeState) -> dict:
    prompt = GENERATE_SUMMARY_PROMPT.format(
        structured_summary=...,
        scores_summary=...,
        weighted_score=...,
        high_issues=...,
    )
    result = await structured_llm.ainvoke([...])
    return {"summary": summary_dict}
```

## 八、节点⑧：save_results — 持久化

```python
async def save_results_node(state: ResumeState) -> dict:
    async with AsyncSessionLocal() as session:
        await session.execute(
            text("""
                UPDATE resume_reviews
                SET scores = :scores, issues = :issues,
                    summary = :summary, status = 'done'
                WHERE id = :review_id
            """),
            {
                "scores": json.dumps(...),
                "issues": json.dumps(...),
                "summary": json.dumps(...),
            },
        )
        await session.commit()
    # 清理临时文件
    os.remove(local_path)
    return {"structured_output": structured_output}
```

## 九、六维度权重

```python
SIX_DIMENSIONS = [
    {"key": "project_depth",  "name": "项目深度",   "weight": 0.30},
    {"key": "tech_match",     "name": "技术匹配度", "weight": 0.25},
    {"key": "expression",     "name": "表达规范性", "weight": 0.15},
    {"key": "structure",      "name": "简历结构",   "weight": 0.15},
    {"key": "quantification", "name": "量化程度",   "weight": 0.10},
    {"key": "authenticity",   "name": "真实可信度", "weight": 0.05},
]
```

权重和 = 1.0，项目深度和技术匹配度占了一半以上。

## 十、总结

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