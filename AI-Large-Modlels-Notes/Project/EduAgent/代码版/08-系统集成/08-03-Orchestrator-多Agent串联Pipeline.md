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

这个函数按顺序跑多个 Agent，前一步的结构化输出喂给后一步。核心是理解它**如何用 `current_context` 在步骤之间传递数据**。我们分段拆开看。

### 2.1 初始化：选 Pipeline + 取执行顺序（第 225~234 行）

```python
async def _run_pipeline(self, request: AgentRequest) -> PipelineResult:
    # 根据 context 中的 pipeline_key 选择对应 Pipeline（默认求职全链路）
    pipeline_key = request.context.get("pipeline_key", "job_preparation")  # 225 行

    if pipeline_key not in self._pipelines:          # 227 行：未知 key → 抛错
        raise PipelineError(f"未知 Pipeline 类型: {pipeline_key}")         # 228 行

    agent_sequence = self._pipelines[pipeline_key]   # 230 行：取出执行顺序 [RESUME, INTERVIEW]
    result = PipelineResult()                        # 231 行：准备收集各步结果

    # 初始上下文：从请求的 context 拷一份，后续逐步往里塞前序结果
    current_context = dict(request.context)          # 234 行：可变上下文，随步骤累积
```

| 行号 | 代码 | 说明 |
|:----:|:-----|:------|
| 225 | `pipeline_key = request.context.get("pipeline_key", "job_preparation")` | 从 context 选 Pipeline，默认求职全链路 |
| 227~228 | `if pipeline_key not in self._pipelines: raise PipelineError(...)` | 未知 key → 抛第 3 章的 `PipelineError` |
| 230 | `agent_sequence = self._pipelines[pipeline_key]` | 取出执行顺序，如 `[RESUME, INTERVIEW]` |
| 231 | `result = PipelineResult()` | 准备收集各步 `AgentResponse` |
| 234 | `current_context = dict(request.context)` | **核心**：拷贝一份可变上下文，每步往里塞前序输出 |

### 2.2 循环体：构造每步独立请求（第 236~246 行）

```python
    for idx, agent_type in enumerate(agent_sequence):  # 236 行：按序执行每个 Agent
        # 为这一步构造独立的 AgentRequest（session_id 加 _step{idx} 后缀，避免检查点串台）
        step_request = AgentRequest(
            student_id=request.student_id,               # 239 行：沿用学员 ID
            tenant_id=request.tenant_id,                 # 240 行：沿用租户 ID
            session_id=f"{request.session_id}_step{idx}",  # 241 行：每步独立会话 ID
            agent_type=agent_type,                       # 242 行：这一步要跑的 Agent
            user_message=request.user_message,           # 243 行：沿用用户原始输入
            context=current_context,                     # 244 行：带上累积的上下文（含前序结果）
            pipeline_mode=False,                         # 245 行：单步内不触发 Pipeline，防递归
        )
```

| 行号 | 代码 | 说明 |
|:----:|:-----|:------|
| 236 | `for idx, agent_type in enumerate(agent_sequence):` | 按执行顺序遍历，`idx` 从 0 开始 |
| 238~246 | `step_request = AgentRequest(...)` | 为这一步单独构造 `AgentRequest` |
| 241 | `session_id=f"{request.session_id}_step{idx}"` | **关键**：每步加 `_step{idx}` 后缀，避免各步骤 MemorySaver 检查点串台 |
| 244 | `context=current_context` | 传入累积上下文，前序结果在这里到位 |
| 245 | `pipeline_mode=False` | 防止单步内再次触发 Pipeline（递归） |

### 2.3 执行单步 + 失败处理（第 255~265 行）

```python
        step_response = await self._run_single_agent(step_request)  # 255 行：复用单 Agent 直达跑这一步
        result.steps.append(step_response)           # 256 行：记录本步结果

        if not step_response.success:                # 258 行：本步失败
            break                                    # 265 行：终止后续，但保留已完成成果
```

| 行号 | 代码 | 说明 |
|:----:|:-----|:------|
| 255 | `step_response = await self._run_single_agent(step_request)` | **复用 08-02 的 `_run_single_agent`**，不重复实现 |
| 256 | `result.steps.append(step_response)` | 记录每一步的结果，即使失败也记录 |
| 258~265 | `if not step_response.success: break` | 本步失败 → `break` 终止，但前面已完成的结果保留在 `result.steps` 里 |

**设计点**：失败不丢弃全部成果——简历审查成功了、面试那步失败，用户仍能看到简历结果。

### 2.4 上下文传递（第 267~274 行）

```python
        # ★ 上下文传递：把本步的结构化输出注入累积上下文，供下一步使用
        if step_response.structured:                 # 268 行：本步有结构化输出
            current_context[f"{agent_type.value}_result"] = step_response.structured  # 269 行：注入
```

| 行号 | 代码 | 说明 |
|:----:|:-----|:------|
| 268 | `if step_response.structured:` | 只有本步产生了结构化输出（如简历评分）才注入 |
| 269 | `current_context[f"{agent_type.value}_result"] = step_response.structured` | 注入 `current_context`，下一步的 `context` 就能读到 |

```
步骤 1：RESUME → AgentResponse.structured = {review_id, weighted_score, ...}
                   ↓ 注入 context
        current_context["resume_result"]    = {review_id, ...}
                   ↓
步骤 2：INTERVIEW → 从 context 读取 resume_result → 加载简历项目深挖
```

### 2.5 Resume→Interview 衔接 + 不合格终止（第 277~288 行）

```python
            # Resume → Interview 衔接
            if agent_type == AgentType.RESUME:       # 277 行：这一步是简历审查
                review_id = step_response.structured.get("review_id")  # 278 行：取 review_id
                if review_id:
                    current_context["resume_review_id"] = review_id  # 280 行：Interview 期望的 key
                score = step_response.structured.get("weighted_score", 0)  # 281 行：取总分
                if score < 60:                        # 282 行：低于 60 分
                    break                             # 288 行：终止 Pipeline，不进入面试
```

| 行号 | 代码 | 说明 |
|:----:|:-----|:------|
| 277 | `if agent_type == AgentType.RESUME:` | 只有 Resume 步骤需要做衔接处理 |
| 278~280 | `review_id` → `current_context["resume_review_id"]` | 注入 Interview 步骤期望的 `resume_review_id`，Interview 的 `load_context_node` 读取它加载简历项目 |
| 281~288 | `weighted_score < 60 → break` | **业务规则**：简历审查得分 < 60 分终止 Pipeline，不进入面试 |

**为什么 <60 分终止？** 这是"简历不合格的候选人没必要浪费面试轮次"的业务逻辑——评分不达标，直接结束，把结果返回给用户先改简历。

---

## 三、`_aggregate_pipeline`：聚合结果（第 292~326 行）

`_run_pipeline` 返回的是 `PipelineResult`（含 `steps` 列表），但上层只要 `AgentResponse`。`_aggregate_pipeline` 把多步结果聚合成一个统一响应。

### 3.1 遍历各步：收集元数据 + 成功文本（第 304~318 行）

```python
def _aggregate_pipeline(                              # 293 行：聚合 Pipeline 各步骤结果
    self,
    pipeline_result: PipelineResult,                  # 294 行：含 steps 列表
    request: AgentRequest,                            # 295 行：原始请求
) -> AgentResponse:
    combined = {}                                     # 304 行：汇总每步的结构化明细
    all_contents = []                                 # 305 行：收集每步的文本，最后拼接
    any_success = False                               # 306 行：只要一步成功就 True

    for idx, step in enumerate(pipeline_result.steps):  # 308 行：遍历各步
        step_key = f"step_{idx + 1}"                   # 309 行：step_1 / step_2 ...
        combined[step_key] = {                         # 310 行：记录这一步的元信息
            "agent_type": step.agent_type.value,       # 311 行：Agent 类型
            "success": step.success,                   # 312 行：成功/失败
            "structured": step.structured,             # 313 行：结构化数据
        }
        if step.success:                               # 315 行：本步成功
            any_success = True                         # 316 行：标记整体成功
            if step.content:                           # 317 行：有内容才收
                all_contents.append(step.content)      # 318 行：收进待拼接列表
```

| 行号 | 代码 | 说明 |
|:----:|:-----|:------|
| 304~306 | `combined = {}; all_contents = []; any_success = False` | 三个变量分别收集：结构化明细、文本内容、成功标记 |
| 308 | `for idx, step in enumerate(pipeline_result.steps):` | 遍历各步，`idx` 从 0 开始 |
| 309~313 | `combined[step_key] = {agent_type, success, structured}` | 为每步记录元信息，最终返回给前端展示 |
| 315~318 | `if step.success: ... if step.content: all_contents.append(...)` | 只收集成功且有文本的步骤，失败步骤不拼入最终回答 |

### 3.2 聚合返回：组装统一 AgentResponse（第 320~326 行）

```python
    return AgentResponse(                             # 320 行：返回聚合结果
        success=any_success,                          # 321 行：任一步成功即 True
        agent_type=request.agent_type,                # 322 行：原始请求指定的 Agent（占位）
        content="\n\n---\n\n".join(all_contents),     # 323 行：各步文本用分隔线拼成一段
        structured=combined,                          # 324 行：结构化里带每步明细
        fallback_used=any(s.fallback_used for s in pipeline_result.steps),  # 325 行：任一步降级即标记
    )
```

| 行号 | 值 | 说明 |
|:----:|:---|:------|
| 321 | `success=any_success` | 只要任一步成功，整体就算**部分成功** |
| 323 | `content="\n\n---\n\n".join(all_contents)` | 各步文本用 `---` 分隔线拼接，前端渲染成段落间隔 |
| 324 | `structured=combined` | `{step_1: {agent_type, success, structured}, step_2: {...}}` |
| 325 | `fallback_used=any(s.fallback_used for s in ...)` | 任一步走了降级，整体标记降级 |

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