# 系统集成：Orchestrator — 多 Agent 串联 Pipeline

> 源文件：`backend/core/orchestrator.py` 第 214~340 行
> 对应课件：8.3 Orchestrator — 多 Agent 串联 Pipeline
> 前置依赖：`_run_single_agent`、`AgentRequest`、`AgentResponse`、`PipelineResult`

## 全文行号速查表

| 行号范围 | 函数/代码段 | 说明 |
|:---------|:-----------|:------|
| 214~290 | `_run_pipeline` | 多 Agent 串联模式 |
| 292~326 | `_aggregate_pipeline` | 聚合 Pipeline 结果 |
| 332~340 | `get_orchestrator` | 模块级单例 |

---

## 一、为什么需要串联？

有些需求一个 Agent 答不完。比如"帮我准备求职"，理想流程是：

```
简历审查 Agent ──────→ 模拟面试 Agent
（六维度评分 +          （拿到简历项目背景，
 提取项目/技能）         针对性深挖面试）
│                      ▲
└──── 简历的结构化结果 ──┘
      注入面试的输入
```

如果让用户先去 `/resume` 跑一遍、再手动把结果复制到 `/interview`，体验很割裂。串联 Pipeline 把这件事自动化——编排器按顺序跑"简历 → 面试"，自动把前一步的结构化输出喂给后一步。

---

## 二、`_run_pipeline`：串联执行（第 214~290 行）

```python
# orchestrator.py 第 214~290 行
async def _run_pipeline(self, request: AgentRequest) -> PipelineResult:
    pipeline_key = request.context.get("pipeline_key", "job_preparation")
    if pipeline_key not in self._pipelines:
        raise PipelineError(f"未知 Pipeline 类型: {pipeline_key}")

    agent_sequence = self._pipelines[pipeline_key]
    result = PipelineResult()
    current_context = dict(request.context)

    for idx, agent_type in enumerate(agent_sequence):
        step_request = AgentRequest(
            student_id=request.student_id,
            tenant_id=request.tenant_id,
            session_id=f"{request.session_id}_step{idx}",
            agent_type=agent_type,
            user_message=request.user_message,
            context=current_context,
            pipeline_mode=False,                     # 防止递归
        )
        step_response = await self._run_single_agent(step_request)
        result.steps.append(step_response)

        if not step_response.success:
            break                                    # 失败终止，保留已完成成果

        # 上下文传递：结构化输出注入 context
        if step_response.structured:
            current_context[f"{agent_type.value}_result"] = step_response.structured

            # Resume → Interview 衔接
            if agent_type == AgentType.RESUME:
                review_id = step_response.structured.get("review_id")
                if review_id:
                    current_context["resume_review_id"] = review_id
                score = step_response.structured.get("weighted_score", 0)
                if score < 60:
                    break  # 简历不合格，终止 Pipeline

    return result
```

### 2.1 执行流程

| 步骤 | 行号 | 操作 | 说明 |
|:----:|:-----|:-----|:------|
| ① | 225~228 | 选 Pipeline | 默认 `"job_preparation"`，未知则抛错 |
| ② | 230 | 取出执行顺序 | `[RESUME, INTERVIEW]` |
| ③ | 236~246 | 每步构造独立 AgentRequest | `session_id` 加 `_step{idx}` 后缀 |
| ④ | 255 | 执行单步 | 复用 `_run_single_agent` |
| ⑤ | 258~265 | 失败处理 | 保留已完成成果，break 终止 |
| ⑥ | 268~274 | 上下文传递 | 结构化输出注入 `current_context` |
| ⑦ | 277~288 | Resume→Interview 衔接 | 注入 `review_id`，<60 分终止 |

### 2.2 上下文传递

```
步骤 1：RESUME → AgentResponse.structured = {review_id, weighted_score, ...}
                   ↓ 注入 context
        current_context["resume_result"]    = {review_id, ...}
        current_context["resume_review_id"] = review_id
                   ↓
步骤 2：INTERVIEW → load_context_node 读取 resume_review_id → 加载简历项目深挖
```

**`session_id` 加 `_step{idx}` 后缀**：避免各步骤之间 MemorySaver 检查点串台。每一步用独立的 thread_id。

### 2.3 简历不合格终止

```python
score = step_response.structured.get("weighted_score", 0)
if score < 60:
    break  # 简历不合格，终止 Pipeline，不进入面试
```

**业务规则**：简历审查得分 < 60 时终止 Pipeline，不进入面试。这是"简历不合格的候选人没必要浪费面试轮次"的业务逻辑。

---

## 三、`_aggregate_pipeline`：聚合结果（第 292~326 行）

```python
# orchestrator.py 第 292~326 行
def _aggregate_pipeline(self, pipeline_result, request) -> AgentResponse:
    combined = {}
    all_contents = []
    any_success = False

    for idx, step in enumerate(pipeline_result.steps):
        step_key = f"step_{idx + 1}"
        combined[step_key] = {
            "agent_type": step.agent_type.value,
            "success": step.success,
            "structured": step.structured,
        }
        if step.success:
            any_success = True
            if step.content:
                all_contents.append(step.content)

    return AgentResponse(
        success=any_success,
        agent_type=request.agent_type,
        content="\n\n---\n\n".join(all_contents),
        structured=combined,
        fallback_used=any(s.fallback_used for s in pipeline_result.steps),
    )
```

| 行号 | 逻辑 | 说明 |
|:----:|:-----|:------|
| 308 | `for idx, step in enumerate(pipeline_result.steps):` | 遍历各步骤 |
| 309~314 | 记录每步元信息 | `step_1` / `step_2` |
| 315~318 | 收集成功文本 | 成功且有文本才拼入 |
| 320~326 | 返回聚合的 AgentResponse | content=各步文本拼接，structured=combined |

**`any_success`**：只要任一步成功，整体就算部分成功。`fallback_used` 也是"任一步降级即标记"。

---

## 四、模块级单例（第 332~340 行）

```python
_orchestrator_instance: Optional[Orchestrator] = None

def get_orchestrator() -> Orchestrator:
    global _orchestrator_instance
    if _orchestrator_instance is None:
        _orchestrator_instance = Orchestrator()
    return _orchestrator_instance
```

**单例模式**：`get_orchestrator()` 第一次调用时创建实例，之后返回同一实例。确保整个应用生命周期内只有一个 Orchestrator。

---

## 五、调用方式与依赖

| 调用方 | 用途 |
|--------|------|
| `unified_chat.py` `_stream_qa_agent` | 调用 `get_orchestrator()._get_agent_graph(AgentType.QA)` |

| 依赖 | 用途 |
|:-----|:-----|
| `AgentExecutionError` / `PipelineError` / `IntentRouteError` | 统一异常 |
| 四个 Agent 的 `build_xxx_graph` | 懒加载的 Agent 图 |

---

## 六、`★` 设计亮点总结

`★ Insight ─────────────────────────────────────`
**Pipeline 的"前序输出注入后序输入"实现 Agent 协作**：
- Resume 步骤的 `structured`（含 review_id）注入 context
- Interview 步骤读取 `resume_review_id`，加载简历项目深挖
- 这是 EduAgent 系统里两个 Agent 真正协作的唯一场景
- `<60 分终止` 体现业务规则——简历不合格不浪费面试轮次
- 新增一条 Pipeline 只需在 `_pipelines` 加一行定义
`─────────────────────────────────────────────────`

`★ Insight ─────────────────────────────────────`
**`_run_pipeline` 复用 `_run_single_agent`，不重复实现**：
- Pipeline 的每一步其实就是一次单 Agent 调用
- 通过 `pipeline_mode=False` 阻止递归，`session_id` 加后缀隔离检查点
- 复用而非重写，体现了"组合优于继承"
- 新增一个 Agent 参与 Pipeline，不需要改 `_run_pipeline`
`─────────────────────────────────────────────────`

`★ Insight ─────────────────────────────────────`
**失败保留已成功成果**：
- Pipeline 某步失败时 `break` 终止，但前面已完成的步骤结果保留
- `_aggregate_pipeline` 遍历所有步骤，成功的拼入 content
- 用户看到的是"部分成功"——简历审查结果能看到，只是面试未进行
- 这是"部分成功优于全失败"的设计哲学
`─────────────────────────────────────────────────`