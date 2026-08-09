# 整体评价：`generate_summary_node` 深度解析

> 源文件：`backend/agents/resume/nodes.py`
> 核心函数：`generate_summary_node`（**第 274~315 行**）
> 对应课件：4.9 整体评价
> 前置依赖：`ResumeSummary`（`state.py`）、`GENERATE_SUMMARY_PROMPT`（`prompts.py`）

---

## 一、全文行号速查表

先给一张行号地图，方便对照源码：

| 行号 | 内容 | 角色 |
|:----:|:-----|:-----|
| 274 | `async def generate_summary_node(state: ResumeState) -> dict:` | 函数定义 |
| 275 | `structured = state.get("structured") or {}` | 获取结构化数据 |
| 276 | `dimension_scores = state.get("dimension_scores", [])` | 获取各维度评分 |
| 277 | `issues = state.get("issues", [])` | 获取问题清单 |
| 278 | `weighted_score = state.get("weighted_score", 0.0)` | 获取加权总分 |
| 280 | `high_issues = [i["description"] for i in issues if i.get("priority") == "high"][:5]` | 取前 5 条高优问题 |
| 281 | `scores_text = "\n".join(...)` | 格式化各维度评分 |
| 283 | `prompt = GENERATE_SUMMARY_PROMPT.format(...)` | 组装提示词 |
| 284 | `structured_llm = get_structured_llm("resume", ResumeSummary)` | 获取结构化 LLM |
| 285 | `summary_dict = None` | 初始化结果变量 |
| 286 | `for attempt in range(2):` | 最多 2 次重试 |
| 287 | `try:` | 开始尝试 |
| 288~290 | `result = await structured_llm.ainvoke([...])` | 调用 LLM |
| 291 | `if result is None: raise ValueError(...)` | 空响应检测 |
| 292 | `summary_dict = result.model_dump()` | 转字典 |
| 293 | `break` | 成功跳出 |
| 294~298 | `except Exception as e: ...` | 重试等待 |
| 300 | `if summary_dict is None:` | 全部失败 |
| 301~310 | `summary_dict = {...}` | 降级默认评价 |
| 312 | `return {"summary": summary_dict}` | 返回 |

---

## 二、函数签名与定位（第 274 行）

```python
# nodes.py 第 274 行
async def generate_summary_node(state: ResumeState) -> dict:
    """综合结构化信息、评分、问题，生成面向学员的整体评价。"""
```

- **输入**：`state["structured"]` + `state["dimension_scores"]` + `state["issues"]` + `state["weighted_score"]`
- **输出**：`{"summary": dict}`（`ResumeSummary.model_dump()`，含亮点/改进/评语/匹配度）
- **定位**：流水线第 7 步，倒数第二个节点——上接 `diagnose_issues_node` 产出按优先级排序的问题清单，下启 `save_results_node` 将完整结果写入数据库

---

## 三、为什么需要这个节点？

前面 6 个节点已经产出了大量数据，但它们是**零散的**：

| 节点 | 产出 | 形式 |
|------|------|------|
| `extract_text` | 纯文本 | 原始文本 |
| `extract_structured` | 结构化简历 | 字段/列表 |
| `run_six_dimensions` | 6 个维度评分 | 数字 + 问题 |
| `diagnose_issues` | 5-15 条问题 | 逐条清单 |

但学员（用户）需要一个**整体的、可读的结论**——不是一堆数字，而是一段像人写的评价。`generate_summary_node` 就是做这个"翻译"工作的。

### 3.1 `ResumeSummary` Schema

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

---

## 四、逐行精读（第 274~312 行）

### 4.1 收集数据（第 275~278 行）

```python
# nodes.py 第 275~278 行
structured       = state.get("structured") or {}
dimension_scores = state.get("dimension_scores", [])
issues           = state.get("issues", [])
weighted_score   = state.get("weighted_score", 0.0)
```

| 行号 | 代码 | 说明 |
|:----:|:-----|:-----|
| 275 | `structured = state.get("structured") or {}` | 从 `extract_structured_node` 产出中获取结构化简历 |
| 276 | `dimension_scores = state.get("dimension_scores", [])` | 从 `run_six_dimensions_node` 产出中获取 6 个维度评分 |
| 277 | `issues = state.get("issues", [])` | 从 `diagnose_issues_node` 产出中获取问题清单 |
| 278 | `weighted_score = state.get("weighted_score", 0.0)` | 从 `run_six_dimensions_node` 产出中获取加权总分 |

注意全部使用了 `get()` 方法带默认值，确保即使前面节点降级了，这里也不会报错。

### 4.2 格式化输入（第 280~281 行）

```python
# nodes.py 第 280~281 行
high_issues = [i["description"] for i in issues if i.get("priority") == "high"][:5]
high_issues_text = "\n".join(f"- {i}" for i in high_issues) or "（无高优先级问题）"
scores_text = "\n".join(
    f"- {d['dimension']}：{d['score']}分（权重{int(d['weight'] * 100)}%）" for d in dimension_scores)
```

| 行号 | 代码 | 说明 |
|:----:|:-----|:-----|
| 280 | `high_issues = [i["description"] for i in issues if i.get("priority") == "high"][:5]` | 只取 `high` 优先级问题的 `description`，最多 5 条 |
| 281 | `high_issues_text = "\n".join(f"- {i}" for i in high_issues) or "（无高优先级问题）"` | 转成 `- ` 列表格式，没有高优问题时显示提示文字 |
| 282 | `scores_text = "\n".join(...)` | 把各维度评分转成 `"项目深度：85分（权重30%）"` 格式 |

**把结构化数据转成自然语言文本**，供 LLM 阅读。

### 4.3 组装 Prompt（第 283 行）

```python
# nodes.py 第 283 行
prompt = GENERATE_SUMMARY_PROMPT.format(
    structured_summary=_build_structured_summary(structured),
    scores_summary=scores_text, weighted_score=round(weighted_score, 1),
    high_issues=high_issues_text, target_position=structured.get("target_position", "后端开发"),
)
```

| 行号 | 代码 | 说明 |
|:----:|:-----|:-----|
| 283 | `prompt = GENERATE_SUMMARY_PROMPT.format(...)` | 5 个占位符填入模板 |

5 个占位符覆盖了 LLM 做评价所需的所有上下文：

| 占位符 | 来源 | 作用 |
|--------|------|------|
| `{structured_summary}` | `_build_structured_summary(structured)` | 候选人画像摘要 |
| `{scores_summary}` | `scores_text`（格式化后的各维度评分） | 各维度得分概览 |
| `{weighted_score}` | `round(weighted_score, 1)` | 综合评分 |
| `{high_issues}` | `high_issues_text`（高优先级问题列表） | 最需解决的改进方向 |
| `{target_position}` | `structured.get("target_position", "后端开发")` | 目标岗位，默认"后端开发" |

**Prompt 设计要点**：

| 设计点 | 说明 |
|--------|------|
| **语气控制** | 亮点要"积极正面"，改进要"具体指出"，评语要"客观、不要过度夸奖也不要打击" |
| **`target_position` 默认 "后端开发"** | 如果结构化提取失败导致目标岗位为空，默认按后端开发评估 |
| **生成要求对应字段** | 第 1 条 → `highlights`，第 2 条 → `core_improvements`，第 3 条 → `overall_comment`，第 4 条 → `fit_assessment` |

### 4.4 调用 LLM + 重试（第 284~298 行）

```python
# nodes.py 第 284~298 行
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

| 行号 | 代码 | 说明 |
|:----:|:-----|:-----|
| 284 | `structured_llm = get_structured_llm("resume", ResumeSummary)` | 获取绑定 `ResumeSummary` Schema 的 LLM |
| 285 | `summary_dict = None` | 初始化为 `None`，作为"是否成功"的标志 |
| 286 | `for attempt in range(2):` | 最多 2 次尝试 |
| 287 | `try:` | 开始尝试 |
| 288~290 | `result = await structured_llm.ainvoke([SystemMessage(...), HumanMessage(...)])` | 调用 LLM 获取结构化评价 |
| 291 | `if result is None: raise ValueError(...)` | 空响应检测 |
| 292 | `summary_dict = result.model_dump()` | 转字典 |
| 293 | `break` | 成功跳出循环 |
| 294~298 | `except Exception as e: ...` | 与 `extract_structured_node` 相同的重试模式 |

与 `extract_structured_node` 相同的重试模式：

| 尝试次数 | 失败反应 |
|----------|----------|
| attempt 0 | 打 `warning` 日志，等 1 秒，重试 |
| attempt 1 | 打 `warning` 日志，放弃，走降级 |

### 4.5 降级兜底（第 300~310 行）

```python
# nodes.py 第 300~310 行
if summary_dict is None:
    summary_dict = {
        "highlights": ["简历内容已完整提交"],
        "core_improvements": high_issues[:2] if high_issues else ["请参考各维度建议修改"],
        "overall_comment": f"综合评分 {round(weighted_score, 1)} 分，请参考各维度详细反馈。",
        "fit_assessment": "与目标岗位匹配度评估暂不可用",
    }
```

| 行号 | 代码 | 说明 |
|:----:|:-----|:-----|
| 300 | `if summary_dict is None:` | 两次尝试都失败 |
| 301~310 | `summary_dict = {...}` | 降级默认评价，但**动态拼接了加权总分和高优先级问题** |

降级效果：

```
亮点：简历内容已完整提交
核心改进：项目描述缺少量化数据    ← 来自 diagnose_issues 的真实数据
综合评语：综合评分 79.8 分，请参考各维度详细反馈。
匹配度评估：与目标岗位匹配度评估暂不可用
```

### 4.6 日志与返回值（第 312 行）

```python
# nodes.py 第 312 行
logger.info("generate_summary.done", highlights_count=len(summary_dict.get("highlights", [])))
return {"summary": summary_dict}
```

| 行号 | 代码 | 说明 |
|:----:|:-----|:-----|
| 312 | `logger.info("generate_summary.done", ...)` | 记录亮点数量 |
| 312 | `return {"summary": summary_dict}` | 写回 State |

---

## 五、调用方式与依赖

### 5.1 调用链路

```
diagnose_issues_node
    │
    │  issues (按优先级排序的问题清单)
    ▼
generate_summary_node  ←── 当前节点
    │
    │  summary (ResumeSummary 的 4 字段)
    ▼
save_results_node
```

### 5.2 依赖清单

| 依赖类型 | 具体依赖 | 用途 |
|---------|---------|------|
| State 读 | `state["structured"]` | 结构化简历摘要 |
| State 读 | `state["dimension_scores"]` | 各维度评分 |
| State 读 | `state["issues"]` | 问题清单 |
| State 读 | `state["weighted_score"]` | 加权总分 |
| State 写 | `state["summary"]` | 整体评价结果 |
| 外部函数 | `get_structured_llm("resume", ResumeSummary)` | 获取结构化 LLM |
| 外部函数 | `_build_structured_summary(structured)` | 生成结构化摘要 |
| 外部常量 | `GENERATE_SUMMARY_PROMPT`（`prompts.py`） | 评价提示词模板 |
| 外部模型 | `ResumeSummary`（`state.py`） | 输出 Schema |

### 5.3 输入源最多

`generate_summary_node` 是流水线中**输入源最多**的节点：

```
┌─ extract_structured ──→ structured_summary
├─ run_six_dimensions ──→ scores_text, weighted_score
├─ diagnose_issues   ──→ high_issues_text
└─ 代码层注入        ──→ target_position
```

---

## 六、`★` 设计亮点

### 6.1 信息聚合器 + 三明治反馈法

`★ Insight ─────────────────────────────────────`
**"把 4 个节点的零散数据聚合为一段对人友好的整体评价"**：
- `generate_summary_node` 是流水线中输入源最多的节点，它把前面所有节点的产出聚合到一条 prompt 里
- 用"三明治反馈法"组织输出：亮点（积极正面）→ 核心改进（建设性）→ 综合评语（客观中立）
- 这是最有效的反馈结构——先肯定（让学员愿意听），再指出问题（改进方向），最后客观总结（整体定位）
- 与 `diagnose_issues_node` 的分工明确：`diagnose_issues` 生成完整清单（5-15 条），`generate_summary` 聚焦最关键（2-3 条）
`─────────────────────────────────────────────────`

### 6.2 降级时保留真实数据

`★ Insight ─────────────────────────────────────`
**"降级结果不是静态的 '系统繁忙'，而是动态拼接了真实数据"**：
- `core_improvements` 取 `high_issues[:2]`——来自 `diagnose_issues` 的真实高优先级问题
- `overall_comment` 包含 `weighted_score`——来自 `run_six_dimensions` 的真实评分
- 让学员在 LLM 不可用时也能看到有用的信息，而不是冰冷的"系统繁忙，请稍后重试"
- `target_position` 默认 "后端开发"：如果结构化提取失败导致目标岗位为空，默认按最常见岗位评估
`─────────────────────────────────────────────────`

### 6.3 与 `extract_structured` 一致的失败模式

`★ Insight ─────────────────────────────────────`
**"本节点与 `extract_structured_node` 共享相同的重试 + 降级模式"**：
- 相同的 2 次尝试循环（`for attempt in range(2)`）
- 相同的空响应检测（`if result is None: raise ValueError(...)`）
- 相同的 1 秒等待后重试
- 相同的降级兜底（空结构而非抛异常）
- 唯一的区别：本节点的降级结果更"有信息量"（拼接了 `weighted_score` 和 `high_issues`），因为它是最后一个依赖 LLM 的节点，后面只有持久化步骤
`─────────────────────────────────────────────────`

---

## 七、边界情况处理

| 场景 | 表现 |
|------|------|
| 全部正常 | 返回 4 个字段的完整评价 |
| LLM 调用失败 | 降级默认评价，保留加权总分和高优先级问题 |
| 无高优先级问题 | `high_issues_text` 为"（无高优先级问题）" |
| 无维度评分 | `scores_text` 为空字符串 |
| 结构化提取失败 | `_build_structured_summary` 返回提示文字 |
| 目标岗位为空 | 默认使用"后端开发" |
| 加权得分为 0 | `overall_comment` 显示"综合评分 0 分"，但场景极罕见 |

---

## 八、数据流全景

```
diagnose_issues_node
    │
    │  issues（按优先级排序的问题清单）
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
```

`generate_summary_node` 是整个流水线的**"最后一道工序"**——它把前面所有节点的分析结果，浓缩成一段对人友好的、平衡的评价，让学员拿到反馈时既有信心又有方向。