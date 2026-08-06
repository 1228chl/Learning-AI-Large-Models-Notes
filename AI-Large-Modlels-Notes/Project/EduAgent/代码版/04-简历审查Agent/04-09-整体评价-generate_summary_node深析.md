# 整体评价：`generate_summary_node` 深度解析

> 源文件：`backend/agents/resume/nodes.py` 第 274~314 行

## 一、函数签名与定位

```python
async def generate_summary_node(state: ResumeState) -> dict:
    """综合结构化信息、评分、问题，生成面向学员的整体评价。"""
```

- **输入**：`state["structured"]` + `state["dimension_scores"]` + `state["issues"]` + `state["weighted_score"]`
- **输出**：`{"summary": dict}`（`ResumeSummary.model_dump()`，含亮点/改进/评语/匹配度）
- **定位**：流水线第⑦步，倒数第二个节点——
  - 上接：`diagnose_issues_node` 产出按优先级排序的问题清单
  - 下启：`save_results_node` 将完整结果写入数据库

## 二、为什么需要这个节点？

前面 6 个节点已经产出了大量数据，但它们是**零散的**：

| 节点 | 产出 | 形式 |
|------|------|------|
| `extract_text` | 纯文本 | 原始文本 |
| `extract_structured` | 结构化简历 | 字段/列表 |
| `run_six_dimensions` | 6 个维度评分 | 数字 + 问题 |
| `diagnose_issues` | 5-15 条问题 | 逐条清单 |

但学员（用户）需要一个**整体的、可读的结论**——不是一堆数字，而是一段像人写的评价。`generate_summary_node` 就是做这个"翻译"工作的。

### 2.1 `ResumeSummary` Schema

```python
class ResumeSummary(BaseModel):
    """简历整体评价——generate_summary 节点的输出目标。"""
    highlights:        list[str] = Field(description="2-3 条核心亮点")
    core_improvements: list[str] = Field(description="2-3 条最重要的改进方向")
    overall_comment:   str       = Field(description="1-2 句综合评语")
    fit_assessment:    str       = Field(description="对目标岗位的匹配度评估（1句话）")
```

4 个字段覆盖了简历评审的完整反馈维度：

| 字段 | 数量 | 语气 | 作用 |
|------|------|------|------|
| `highlights` | 2-3 条 | 积极正面 | 告诉学员"你哪里做得好" |
| `core_improvements` | 2-3 条 | 建设性 | 告诉学员"最该改什么" |
| `overall_comment` | 1-2 句 | 客观中立 | 一句话总结整体水平 |
| `fit_assessment` | 1 句 | 评估性 | 与目标岗位的匹配度 |

## 三、逐行精读

### 3.1 收集数据

```python
structured       = state.get("structured") or {}
dimension_scores = state.get("dimension_scores", [])
issues           = state.get("issues", [])
weighted_score   = state.get("weighted_score", 0.0)
```

从 state 中取出前面所有节点的产出：

| 变量 | 来源节点 | 类型 |
|------|---------|------|
| `structured` | `extract_structured_node` | dict（结构化简历） |
| `dimension_scores` | `run_six_dimensions_node` | list[dict]（6 个维度评分） |
| `issues` | `diagnose_issues_node` | list[dict]（问题清单） |
| `weighted_score` | `run_six_dimensions_node` | float（加权总分） |

注意使用了 `get()` 方法带默认值，确保即使前面节点降级了，这里也不会报错。

### 3.2 格式化输入

```python
high_issues = [i["description"] for i in issues if i.get("priority") == "high"][:5]
high_issues_text = "\n".join(f"- {i}" for i in high_issues) or "（无高优先级问题）"
scores_text = "\n".join(
    f"- {d['dimension']}：{d['score']}分（权重{int(d['weight'] * 100)}%）" for d in dimension_scores)
```

**把结构化数据转成自然语言文本**，供 LLM 阅读：

- 高优先级问题取前 5 条，列表格式
- 各维度评分转成 `"项目深度：85分（权重30%）"` 格式
- 如果没有任何高优先级问题，显示"（无高优先级问题）"

### 3.3 组装 Prompt

```python
prompt = GENERATE_SUMMARY_PROMPT.format(
    structured_summary=_build_structured_summary(structured),
    scores_summary=scores_text, weighted_score=round(weighted_score, 1),
    high_issues=high_issues_text, target_position=structured.get("target_position", "后端开发"),
)
```

5 个占位符，覆盖了 LLM 做评价所需的所有上下文（`prompts.py` 第 170~189 行）：

```python
GENERATE_SUMMARY_PROMPT = """请为学员生成简历审查的整体评价报告。

【学员信息摘要】
{structured_summary}

【各维度评分】
{scores_summary}

【综合得分】{weighted_score} / 100

【高优先级问题（最需解决的）】
{high_issues}

【目标岗位】{target_position}

生成要求：
1. 亮点：找出简历中真实存在的2-3个优势（有数据支撑更好），语气积极正面
2. 核心改进：提炼最重要的2-3个改进方向（优先级 high 的问题），具体指出是哪方面
3. 综合评语：1-2句话，客观评价整体水平，不要过度夸奖也不要打击
4. 匹配度：基于技术栈和经历，评估与{target_position}岗位的匹配程度（1句话）"""
```

**Prompt 设计要点**：

| 设计点 | 说明 |
|--------|------|
| **5 个占位符** | `structured_summary` / `scores_summary` / `weighted_score` / `high_issues` / `target_position` |
| **语气控制** | 亮点要"积极正面"，改进要"具体指出"，评语要"客观、不要过度夸奖也不要打击" |
| **`target_position` 默认 "后端开发"** | 如果结构化提取失败导致目标岗位为空，默认按后端开发评估 |
| **生成要求对应字段** | 第 1 条 → `highlights`，第 2 条 → `core_improvements`，第 3 条 → `overall_comment`，第 4 条 → `fit_assessment` |

### 3.4 调用 LLM + 重试

```python
structured_llm = get_structured_llm("resume", ResumeSummary)
summary_dict = None
for attempt in range(2):
    try:
        result = await structured_llm.ainvoke([
            SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=prompt)])
        if result is None:
            raise ValueError("structured output returned None")
        summary_dict = result.model_dump()
        break
    except Exception as e:
        if attempt == 0:
            logger.warning("generate_summary.retry", error=str(e))
            await asyncio.sleep(1)
        else:
            logger.warning("generate_summary.failed", error=str(e))
```

与 `extract_structured_node` 相同的重试模式：

| 尝试次数 | 失败反应 |
|----------|----------|
| attempt 0 | 打 `warning` 日志，等 1 秒，重试 |
| attempt 1 | 打 `warning` 日志，放弃，走降级 |

### 3.5 降级兜底

```python
if summary_dict is None:
    summary_dict = {
        "highlights": ["简历内容已完整提交"],
        "core_improvements": high_issues[:2] if high_issues else ["请参考各维度建议修改"],
        "overall_comment": f"综合评分 {round(weighted_score, 1)} 分，请参考各维度详细反馈。",
        "fit_assessment": "与目标岗位匹配度评估暂不可用",
    }
```

降级时虽然没有 LLM 生成的评价，但**仍然保留了加权总分和高优先级问题**，让降级结果也有信息量：

```
亮点：简历内容已完整提交
核心改进：项目描述缺少量化数据    ← 来自 diagnose_issues 的真实数据
综合评语：综合评分 79.8 分，请参考各维度详细反馈。
匹配度评估：与目标岗位匹配度评估暂不可用
```

### 3.6 日志记录

```python
logger.info("generate_summary.done", highlights_count=len(summary_dict.get("highlights", [])))
```

结构化日志记录亮点数量。方便通过日志检索：
- "生成了多少条评价？" → 搜 `generate_summary.done`
- "评价生成失败了吗？" → 搜 `generate_summary.failed`

## 四、`★` 设计亮点

### 4.1 信息聚合器

`generate_summary_node` 是流水线中**输入源最多**的节点：

```
┌─ extract_structured ──→ structured_summary
├─ run_six_dimensions ──→ scores_text, weighted_score
├─ diagnose_issues   ──→ high_issues_text
└─ 代码层注入        ──→ target_position
```

它把前面所有节点的产出聚合到一条 prompt 里，让 LLM 能从全局视角做出评价。

### 4.2 语气平衡

Prompt 中明确规定了语气要求，形成"三明治反馈法"：

```
亮点：        语气积极正面  ← 给学员信心
核心改进：    具体指出      ← 给出建设性反馈
综合评语：    客观，不要过度夸奖也不要打击  ← 中立可信
```

这是最有效的反馈结构——先肯定（让学员愿意听），再指出问题（改进方向），最后客观总结（整体定位）。

### 4.3 降级时保留数据

降级结果不是静态的"系统繁忙"这样的空话，而是动态拼接了 `weighted_score` 和 `high_issues`：

```
降级结果包含：
  ├─ weighted_score    → "综合评分 79.8 分"
  └─ high_issues[:2]   → "项目描述缺少量化数据"（来自 diagnose_issues 的真实数据）
```

让学员在 LLM 不可用时也能看到有用的信息。

### 4.4 与 `diagnose_issues_node` 的协作

`diagnose_issues_node` 生成的问题按优先级排序，`generate_summary_node` 只取 `high` 优先级的问题（且最多 5 条）作为核心改进方向。这种分工确保了：

| 节点 | 职责 | 输出量级 |
|------|------|---------|
| `diagnose_issues` | 完整清单 | 5-15 条 |
| `generate_summary` | 聚焦最关键 | 2-3 条 |

## 五、与 `diagnose_issues_node` 的对比

| 维度 | `diagnose_issues_node` | `generate_summary_node` |
|------|------------------------|------------------------|
| 输入 | `dimension_scores` + `raw_text` | `structured` + `dimension_scores` + `issues` + `weighted_score` |
| 输出 | 5-15 条逐条问题（清单） | 4 个字段的整体评价（叙事） |
| 格式 | 列表（结构化 JSON） | 段落（结构化 JSON） |
| 语气 | 客观、问题导向 | 三明治（积极+改进+客观） |
| 目标用户 | 开发者/HR（细看问题） | 学员（看整体反馈） |
| 降级 | 用维度原始问题 | 用 weighted_score + high_issues |

## 六、边界情况处理

| 场景 | 表现 |
|------|------|
| 全部正常 | 返回 4 个字段的完整评价 |
| LLM 调用失败 | 降级默认评价，保留加权总分和高优先级问题 |
| 无高优先级问题 | `high_issues_text` 为"（无高优先级问题）" |
| 无维度评分 | `scores_text` 为空字符串 |
| 结构化提取失败 | `_build_structured_summary` 返回"（结构化提取失败，请基于原文评审）" |
| 目标岗位为空 | 默认使用"后端开发" |
| 加权得分为 0 | `overall_comment` 显示"综合评分 0 分"，但场景极罕见 |

## 七、数据流全景

```
diagnose_issues_node
    │
    │  issues（按优先级排序的问题清单）
    │
    ▼
generate_summary_node
    │
    │  ① 收集数据
    │     structured + dimension_scores + issues + weighted_score
    │
    │  ② 格式化输入
    │     high_issues_text = high 优先级问题的前 5 条
    │     scores_text = 各维度分数（带权重）
    │
    │  ③ 组装 Prompt（5 个占位符）
    │     structured_summary + scores_summary + weighted_score
    │     + high_issues + target_position
    │
    │  ④ LLM 结构化输出
    │     ResumeSummary {
    │       highlights: ["项目描述有量化数据", "技术栈匹配度高"],
    │       core_improvements: ["项目深度不足，建议补充技术选型理由"],
    │       overall_comment: "简历整体水平中等偏上...",
    │       fit_assessment: "与后端开发岗位匹配度较高"
    │     }
    │
    │  └─ 返回 {"summary": {...}}
    │
    ▼
save_results_node
    │
    │  将完整结果写入 resume_reviews 表
    │  清理临时 PDF 文件
    │
    ▼
END
```

`generate_summary_node` 是整个流水线的**"最后一道工序"**——它把前面所有节点的分析结果，浓缩成一段对人友好的、平衡的评价，让学员拿到反馈时既有信心又有方向。