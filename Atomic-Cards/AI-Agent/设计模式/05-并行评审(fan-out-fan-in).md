---
author: "XunZong"
created: "2026-07-30"
tags: ["AI-Agent", "并行", "fan-out", "fan-in", "设计模式"]
aliases: ["并行评审", "fan-out-fan-in", "扇出扇入", "并行评分", "评分聚合"]
---

# 并行评审（fan-out/fan-in）模式

## 定义

**并行评审（fan-out/fan-in）模式** 是一种将多个独立评审任务并行执行、最后聚合结果的设计模式。它先将一个任务"扇出"（fan-out）为多个并行子任务，所有子任务完成后，再将结果"扇入"（fan-in）聚合。

### 核心公式

```
fan-out-fan-in = 拆解(一个任务 → 多个子任务) → 并行执行(所有子任务) → 聚合(所有子结果 → 最终结果)
```

### 直观理解

> 好比"请 6 个专家同时审阅一份简历"——每个专家只看一个维度（项目深度、技术匹配度……），互不干扰。6 个人同时看，审阅时间 ≈ 最慢的那个专家。看完了，把 6 个专家的评分按权重加在一起，得出综合评分。

## 为什么需要并行

### 串行 vs 并行

串行图示：
```
评1 → 评2 → 评3 → 评4 → 评5 → 评6  （总耗时 = 6 次相加）
```

并行图示：
```
评1 ┐
评2 ┤
评3 ┤  asyncio.gather → 同时进行  （总耗时 ≈ 最慢的 1 次）
评4 ┤
评5 ┤
评6 ┘
```

### 性能差异

| 每次 LLM 调用 | 串行总耗时 | 并行总耗时 | 提速 |
|:-------------:|:----------:|:----------:|:----:|
| 5 秒 | 30 秒 | 5 秒 | **6 倍** |
| 10 秒 | 60 秒 | 10 秒 | **6 倍** |

## 完整实现

### 步骤一：定义维度

```python
SIX_DIMENSIONS = [
    {"key": "project_depth",    "name": "项目深度",   "weight": 0.30},
    {"key": "tech_match",       "name": "技术匹配度", "weight": 0.25},
    {"key": "expression",       "name": "表达规范性", "weight": 0.15},
    {"key": "structure",        "name": "简历结构",   "weight": 0.15},
    {"key": "quantification",   "name": "量化程度",   "weight": 0.10},
    {"key": "authenticity",     "name": "真实可信度", "weight": 0.05},
]
```

### 步骤二：单个维度评审函数

```python
async def review_one_dimension(dim: dict, structured_summary: str, resume_text: str) -> dict:
    """评审单个维度（内含重试 + 降级）"""
    for attempt in range(2):
        try:
            prompt = DIMENSION_REVIEW_PROMPTS[dim["key"]].format(
                focus=dim.get("focus", ""),
                structured_summary=structured_summary,
                resume_text=resume_text,
            )
            structured_llm = get_structured_llm("resume", DimensionScore)
            result = await structured_llm.ainvoke([...])

            d = result.model_dump()
            d["dimension"] = dim["name"]   # 代码层填：中文维度名
            d["weight"] = dim["weight"]    # 代码层填：权重
            return d
        except Exception as e:
            if attempt == 0:
                await asyncio.sleep(1)     # 第一次失败：等1秒重试
            else:
                return _empty_dimension_score(dim)  # 第二次仍失败：降级
```

### 步骤三：并行执行 + 聚合

```python
async def run_six_dimensions_node(state: ResumeState) -> dict:
    structured_summary = _build_structured_summary(structured)

    # 扇出（fan-out）：创建 6 个独立协程
    tasks = [review_one_dimension(dim, structured_summary, resume_text) for dim in SIX_DIMENSIONS]

    # 并行执行：所有协程同时运行
    dimension_scores = await asyncio.gather(*tasks)

    # 扇入（fan-in）：加权聚合
    weighted_score = sum(d["score"] * d["weight"] for d in dimension_scores)
    return {"dimension_scores": list(dimension_scores), "weighted_score": round(weighted_score, 2)}
```

## 关键设计

### 1. 单维度失败不影响其他维度

每个维度在自己的 try/except 中独立运行，某个维度挂了只影响它自己：

```python
# 维度 A 失败 → 返回降级结果（50 分）
# 维度 B 正常 → 返回正常评分
# 维度 C 失败 → 返回降级结果（50 分）
# 聚合时：A(50)*0.3 + B(85)*0.25 + C(50)*0.15 + ...
```

### 2. 协程创建 vs 执行分离

```python
# 先创建协程（此时还没执行）
tasks = [review_one_dimension(dim) for dim in SIX_DIMENSIONS]

# 再一起执行（await 时才真正开始执行）
dimension_scores = await asyncio.gather(*tasks)
```

### 3. 辅助函数：省 token

```python
def _build_structured_summary(structured: dict) -> str:
    """把结构化简历浓缩成摘要，省 token"""
    lines = [f"姓名：{structured.get('name', '')}"]
    if structured.get("target_position"):
        lines.append(f"意向岗位：{structured['target_position']}")
    # ... 只保留关键信息
    return "\n".join(lines)
```

## 适用场景

| 场景 | 扇出维度 | 聚合方式 |
|:-----|:---------|:---------|
| **简历审查** | 6 个独立评分维度 | 加权平均 |
| **试卷批改** | 客观题/编程题/主观题三轨 | 各题分数汇总 |
| **代码审查** | 正确性/性能/安全性/风格 | 综合评分 |
| **内容审核** | 文本/图片/音频多维审核 | 取最严结果 |

## 面试追问

**Q1（基础）**：什么是 fan-out/fan-in 模式？它的核心价值是什么？
**回答要点**：
1. fan-out：将一个任务拆解为多个独立子任务并行执行
2. fan-in：将所有子任务的结果聚合为最终结果
3. 核心价值：让总耗时 ≈ 最慢的子任务，而不是所有子任务耗时相加

**Q2（深挖）**：单维度评审失败时如何处理？为什么说"单维度失败不影响其他维度"？
**回答要点**：
1. 每个维度独立 try/except，某个失败只影响自己
2. 失败时返回降级结果（50 分 + 标注"建议人工复核"）
3. 其他维度正常评分，聚合时降级维度只贡献自己的权重分

**Q3（实战）**：EduAgent 中简历审查的并行评审是如何实现的？
**回答要点**：
1. 定义 6 个维度 + 权重表
2. 每个维度一个独立 LLM 调用，内含重试和降级
3. 使用 asyncio.gather 并行执行 6 个协程
4. 加权聚合：Σ(得分 × 权重)

**Q4（边界）**：如果所有维度都失败了，聚合结果会怎样？
**回答要点**：
1. 所有维度都返回降级结果（50 分）
2. 加权综合分 = 50 × (0.30+0.25+0.15+0.15+0.10+0.05) = 50
3. 综合分 50 分 + 所有维度标注"评审失败，建议人工复核"
4. 系统不会崩溃，但用户会看到"需要人工复核"的提示

## 参考引用
- 需要理解 Python 异步并发中 asyncio.gather 用法的相关知识，参见 [异步并发实战](../../Python/并发/17-异步并发实战.md)
- 需要理解评分 Rubric 设计的相关知识，参见 [评分Rubric设计](04-评分Rubric设计.md)
- 需要理解 Think 前置推理增强技巧的相关知识，参见 [Think前置推理增强](03-Think前置推理增强.md)