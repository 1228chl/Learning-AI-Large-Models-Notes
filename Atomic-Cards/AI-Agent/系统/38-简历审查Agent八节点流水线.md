---
author: "XunZong"
created: "2026-07-30"
tags: ["AI-Agent", "简历审查", "并行评审", "流水线", "扇出扇入", "LangGraph"]
aliases: ["Resume Review Agent", "简历审查Agent", "八节点流水线", "六维度评分", "202轮询模式"]
---

# 简历审查 Agent 八节点流水线

## 定义

简历审查 Agent 是一个全自动的 LangGraph 顺序流水线，由 8 个节点组成直线图（无分支、无 checkpointer、无人介入），接收一份 PDF 简历，输出结构化的审查报告。报告包含三个部分：**六维度加权评分**（0-100 分）、**逐条问题诊断**（带位置定位和优先级）、**整体评价**（亮点 + 改进方向 + 岗位匹配度）。

它是 EduAgent 四种 LangGraph 范式中最简单的一种——**并行评审（fan-out/fan-in）**：六维度评分通过 `asyncio.gather` 并行调用 LLM，总耗时约等于单次调用而非六次累加。这份 Agent 也是"Agent = State + Node + Edge"心智模型最干净的体现。

## 八节点流水线

$$ \text{START} \to \text{upload\_to\_minio} \to \text{download\_pdf} \to \text{extract\_text} \to \text{extract\_structured} \to \text{run\_six\_dimensions} \to \text{diagnose\_issues} \to \text{generate\_summary} \to \text{save\_results} \to \text{END} $$

| # | 节点 | 职责 | 写入 State | 关键实现 |
|---|------|------|-----------|---------|
| 1 | upload_to_minio | 本地模式空跑（原为对象存储上传） | — | 保留接口扩展点 |
| 2 | download_pdf | 本地模式空跑（文件已在本地 /tmp） | — | 保留接口扩展点 |
| 3 | extract_text | PyMuPDF 提取 PDF 文本，处理双栏 | raw_text, page_count | `run_in_executor` 防阻塞 |
| 4 | extract_structured | LLM 将原始文本抽取为结构化简历 | structured | `with_structured_output(ResumeStructured)` |
| 5 | run_six_dimensions | 并行评 6 维度，算加权综合分 | dimension_scores, weighted_score | `asyncio.gather` 6 次 LLM 调用 |
| 6 | diagnose_issues | 汇总各维度问题、去重、排序 | issues | "先自由思考，再结构化输出" |
| 7 | generate_summary | 生成整体评价 | summary | 综合结构化简历+评分+问题 |
| 8 | save_results | 写入 PostgreSQL + 清理临时文件 | — | `model_dump()` → JSONB 写入 |

## 六维度评分体系

| 维度 | 权重 | 评估焦点 | 评分区间描述 |
|------|------|---------|------------|
| 项目深度 | 0.30 | 量化数据、技术选型、个人贡献 | 90-100: STAR 完整 + 量化成果 |
| 技术匹配 | 0.25 | 技术栈与目标岗位的重合度 | 70-89: 方向正确但深度不足 |
| 表达规范 | 0.15 | 动词开头、无拼写错误、STAR 结构 | 50-69: 有 STAR 意识但格式不完整 |
| 简历结构 | 0.15 | 模块完整性、排版逻辑 | 30-49: 缺关键模块或逻辑混乱 |
| 量化程度 | 0.10 | 性能指标、用户规模、效率提升数 | 0-29: 几乎无量化数据 |
| 真实可信度 | 0.05 | 经历描述与经验水平的匹配度 | 判定是否过度修饰 |

每个维度有从 90-100 到 0-29 的五档 Rubric，给 LLM 提供"测量标尺"以保证评分一致性。维度名和权重由代码层填入（`dimension` 和 `weight` 字段标注 "代码层覆盖"），LLM 只管打分、列问题、给建议。

## 202 轮询模式

```python
# API 层：上传不等待，立即返回
@app.post("/resume/upload", status_code=202)
async def upload_resume(file: UploadFile = File(...)):
    review_id = insert_review(status="processing")     # 写入 DB，状态=processing
    task = asyncio.create_task(run_resume_graph(...))  # 后台启动 LangGraph
    _background_tasks.add(task)                         # GC 保护
    return {"review_id": review_id}                     # 立即返回 202

# 前端轮询
@app.get("/resume/reviews/{review_id}")
async def get_review(review_id: str):
    review = await db.fetch_one(...)
    if review["status"] == "processing":
        return {"status": "processing"}                 # 还在处理
    return review                                        # 返回完整报告
```

LLM 调用约 7 次（1 次提取 + 6 次并行评分），总耗时约 30-60 秒。202 模式让用户不被接口阻塞等待。

## AI/ML 工程应用场景

| 应用场景 | 使用的 LangGraph 模式 | 说明 |
|---------|---------------------|------|
| 文档智能审查 | 顺序流水线 + fan-out/fan-in | 合同条款审查、论文格式检查等多维并行评审 |
| 代码 PR 审查 | 并行评审（安全/性能/风格/测试四维） | 合入前多维度自动审查 |
| 简历筛选 | 8 节点完整流水线 | 批量处理候选简历，六维度评分自动排名 |
| 报告自动生成 | LLM 结构化提取 + 聚合生成 | 财务报表、实验报告的自动化分析 |

## 面试追问

**Q1（基础）**：简历审查 Agent 的 8 个节点分别做了什么？为什么节点 1 和 2 是"空跑"的？

**回答要点**：

1. 8 个节点：upload_to_minio → download_pdf → extract_text → extract_structured → run_six_dimensions → diagnose_issues → generate_summary → save_results
2. 节点 1/2 在生产环境对应"上传 PDF 到 MinIO"和"从 MinIO 下载"，本地模式文件已在 /tmp 目录，所以空跑
3. 保留它们作为接口扩展点——未来切换到对象存储时只需替换节点函数，图和拓扑不变

**Q2（深挖）**：六维度评分的 `asyncio.gather` 并行和串行执行的耗时差异有多大？为什么各维度评分能互不依赖地并行？

**回答要点**：

1. 串行：6 次 LLM 调用依次执行，总耗时 = T1 + T2 + ... + T6 ≈ 6× 单次调用时间
2. 并行：6 次调用同时发出，总耗时 ≈ max(T1, T2, ..., T6) ≈ 单次调用时间
3. 能并行的原因：每个维度评分只需 raw_text 和 structured（已由前序节点提供），维度之间完全独立，无数据依赖

**Q3（实战）**：为什么报告接口采用 202 + 后台任务 + 前端轮询模式，而不是同步等待返回？

**回答要点**：

1. 整个流水线需调用约 7 次 LLM，耗时 30-60 秒，HTTP 同步等待会让连接超时
2. 202 Accepted 立即返回 review_id，后台用 create_task + GC 保护模式执行 LangGraph 图
3. 前端轮询 GET /reviews/{id}，status=processing 时显示"审查中"，done 时展示完整报告
4. 15 分钟超时保护：超过 15 分钟仍 processing 的任务自动标记为 failed

**Q4（边界）**：如果六维度评分中某一维度 LLM 调用超时或失败，整个流水线如何处理？

**回答要点**：

1. asyncio.gather 配合 return_exceptions=True，某一维度失败不阻塞其他维度
2. 失败维度的维度分数为空，在 diagnose_issues 阶段被标记为 N/A
3. 加权分计算时跳过失败维度，剩余维度权重归一化重分配
4. generate_summary 阶段的提示词中明确"维度X因技术原因未能评分"，整体报告中标注

## 参考引用

- 需要理解 Pydantic BaseModel 和 Field.description 如何被 LLM 用作填空指令：[Pydantic 数据建模与结构化输出](../../Python/Pydantic/01-Pydantic数据建模与结构化输出.md)
- 需要理解 LangGraph 的 State + Node + Edge 基本心智模型：[LangGraph 图模型四要素](../LangGraph/01-LangGraph图模型四要素.md)
- 需要理解 Think 前置推理在 diagnose_issues 和评分中的应用：[Think 前置推理增强](../设计模式/03-Think前置推理增强.md)
- 需要理解并行评审（fan-out/fan-in）的抽象设计模式：[并行评审设计模式](../设计模式/05-并行评审.md)
- 需要理解后台任务 GC 保护模式在 upload 接口中的应用：[后台任务 GC 保护模式](../../Python/并发/18-后台任务GC保护模式.md)
