# 系统集成：Orchestrator — Schema 与单 Agent 直达

> 源文件：`backend/core/orchestrator.py` 第 1~212 行
> 对应课件：8.2 Orchestrator — Schema 与单 Agent 直达
> 前置依赖：`retry.py`（重试降级）、`exceptions.py`（统一异常）、四个 Agent 图

## 全文行号速查表

| 行号范围 | 代码段 | 说明 |
|:---------|:-------|:------|
| 1~21 | import | 模块导入 |
| 24~36 | `ExecutionMode` / `AgentType` 枚举 | 执行模式 + Agent 类型 |
| 39~52 | `AgentRequest` | 统一请求入参 Schema |
| 55~63 | `AgentResponse` | 统一响应出参 Schema |
| 66~69 | `PipelineResult` | 多 Agent 串联聚合结果 |
| 72~93 | `Orchestrator.__init__` | 图注册表 + Pipeline 定义 |
| 95~128 | `_get_agent_graph` | 懒加载 Agent 图 |
| 130~169 | `handle` | 统一请求处理入口 |
| 171~212 | `_run_single_agent` | 单 Agent 直达模式 |

---

## 一、为什么需要统一 Schema？

四个 Agent 的 State schema 完全不同（QAState、ExamState、ResumeState、InterviewState）。如果上层直接对接，需要为每个 Agent 写不同的请求/响应解析逻辑。

**统一 Schema 的核心**：`AgentRequest`（统一入参）和 `AgentResponse`（统一出参）。无论走哪个 Agent，上层拿到的都是 `AgentResponse`。

---

## 二、两个枚举（第 24~36 行）

```python
class ExecutionMode(str, Enum):
    SINGLE   = "single"     # 单 Agent 直达（最常见）
    PIPELINE = "pipeline"   # 多 Agent 串联（如求职全链路）
    CLARIFY  = "clarify"    # 澄清对话（意图不明，需追问）

class AgentType(str, Enum):
    QA        = "qa"
    EXAM      = "exam"
    RESUME    = "resume"
    INTERVIEW = "interview"
```

| 枚举 | 值 | 说明 |
|:-----|:---|:-----|
| `ExecutionMode.SINGLE` | `"single"` | 单 Agent 直接执行 |
| `ExecutionMode.PIPELINE` | `"pipeline"` | 多 Agent 串联 |
| `ExecutionMode.CLARIFY` | `"clarify"` | 意图不明，需追问 |
| `AgentType.QA` | `"qa"` | 智能问答 |
| `AgentType.INTERVIEW` | `"interview"` | 模拟面试 |

**为什么都有 `str, Enum`？** 继承 `str` 后，枚举值可直接用作字符串，在 JSON 序列化、State 字段中都能直接用，无需 `.value` 转换。

---

## 三、三个统一 Schema

### 3.1 `AgentRequest`（第 39~52 行）

```python
class AgentRequest(BaseModel):
    student_id:    str = Field(..., description="学员 ID")
    tenant_id:     str = Field(default="tenant_default", description="租户 ID")
    session_id:    str = Field(..., description="会话 ID")
    agent_type:    AgentType = Field(..., description="目标 Agent")
    user_message:  str = Field(..., description="用户输入")
    context:       dict[str, Any] = Field(default_factory=dict, description="附加上下文")
    pipeline_mode: bool = Field(default=False, description="是否强制走串联 Pipeline")

    @property
    def thread_id(self) -> str:
        return f"student_{self.student_id}_session_{self.session_id}"
```

| 字段 | 类型 | 说明 |
|:-----|:-----|:-----|
| `agent_type` | `AgentType` | 目标 Agent（枚举校验） |
| `context` | `dict` | 附加上下文（文件路径、历史数据） |
| `pipeline_mode` | `bool` | 默认 False，走单 Agent |

**`thread_id` 属性**：与各 Agent 的 `build_thread_id` 格式一致，保证 Orchestrator 与各 Agent 用同一个 MemorySaver 检查点。

### 3.2 `AgentResponse`（第 55~63 行）

```python
class AgentResponse(BaseModel):
    success:       bool = Field(..., description="执行是否成功")
    agent_type:    AgentType = Field(..., description="实际执行的 Agent")
    content:       str = Field(default="", description="主要文本响应")
    structured:    Optional[dict] = Field(default=None, description="结构化数据")
    fallback_used: bool = Field(default=False, description="是否触发降级")
    error_msg:     Optional[str] = Field(default=None, description="失败信息")
    metadata:      dict = Field(default_factory=dict, description="附加元数据")
```

**统一出参的意义**：无论走哪个 Agent、成功还是失败，上层拿到 `AgentResponse`。前端不必针对每个 Agent 写不同的响应解析。

### 3.3 `PipelineResult`（第 66~69 行）

```python
class PipelineResult(BaseModel):
    steps:    list[AgentResponse] = Field(default_factory=list, description="各步骤结果列表")
    combined: dict[str, Any] = Field(default_factory=dict, description="聚合后的最终数据")
```

多 Agent 串联时，`_run_pipeline` 返回它，`_aggregate_pipeline` 再聚合成 `AgentResponse`。

---

## 四、`Orchestrator.__init__`（第 84~93 行）

```python
def __init__(self):
    self._agent_graphs: dict[AgentType, Any] = {}   # 图注册表（懒加载）
    self._pipelines: dict[str, list[AgentType]] = {
        "job_preparation": [AgentType.RESUME, AgentType.INTERVIEW],
    }
```

**`_agent_graphs` 懒加载**：初始化时为空，首次访问某 Agent 才 import 并 build 它的图。

**`_pipelines` Pipeline 定义**：`"job_preparation"` 定义了求职全链路——先简历审查（RESUME），再模拟面试（INTERVIEW）。

---

## 五、`_get_agent_graph`：懒加载（第 95~128 行）

```python
def _get_agent_graph(self, agent_type: AgentType) -> Any:
    if agent_type not in self._agent_graphs:
        if agent_type == AgentType.QA:
            from backend.agents.qa.graph import build_qa_graph
            self._agent_graphs[agent_type] = build_qa_graph()
        elif agent_type == AgentType.EXAM:
            from backend.agents.exam.graph import build_exam_graph
            self._agent_graphs[agent_type] = build_exam_graph()
        elif agent_type == AgentType.RESUME:
            from backend.agents.resume.graph import build_resume_graph
            self._agent_graphs[agent_type] = build_resume_graph()
        elif agent_type == AgentType.INTERVIEW:
            from backend.agents.interview.graph import build_interview_graph
            self._agent_graphs[agent_type] = build_interview_graph()
        else:
            raise ValueError(f"未知 AgentType: {agent_type}")
    return self._agent_graphs[agent_type]
```

**延迟导入**：`from ... import` 放函数内部，实现"首次访问才加载"。Python 的 `import` 只执行一次，后续 `from` 直接引用已加载的模块。

---

## 六、`handle`：统一入口（第 130~169 行）

```python
async def handle(self, request: AgentRequest) -> AgentResponse:
    try:
        if request.pipeline_mode:
            result = await self._run_pipeline(request)
            return self._aggregate_pipeline(result, request)
        else:
            return await self._run_single_agent(request)
    except Exception as e:
        return AgentResponse(
            success=False,
            agent_type=request.agent_type,
            content="系统处理请求时遇到问题，请稍后再试。",
            error_msg=str(e),
        )
```

**关键设计**：`handle` 永远返回 `AgentResponse`，**不向上抛异常**。即使执行失败，也返回 `success=False` 的响应。

---

## 七、`_run_single_agent`：单 Agent 直达（第 171~212 行）

```python
async def _run_single_agent(self, request: AgentRequest) -> AgentResponse:
    graph = self._get_agent_graph(request.agent_type)

    initial_state = {
        "messages": [HumanMessage(content=request.user_message)],
        "student_id": request.student_id,
        "tenant_id": request.tenant_id,
        "session_id": request.session_id,
        **request.context,
    }
    config = {"configurable": {"thread_id": request.thread_id}}

    @with_retry(agent_type=request.agent_type.value)
    async def _invoke():
        return await graph.ainvoke(initial_state, config=config)

    result_state = await _invoke()

    last_message = result_state["messages"][-1]
    content = last_message.text if hasattr(last_message, "text") else str(last_message.content)

    return AgentResponse(
        success=True,
        agent_type=request.agent_type,
        content=content,
        structured=result_state.get("structured_output"),
        fallback_used=result_state.get("fallback_used", False),
    )
```

### 7.1 统一 State 构造（第 182~188 行）

```python
initial_state = {
    "messages": [HumanMessage(content=request.user_message)],
    "student_id": request.student_id,
    "tenant_id": request.tenant_id,
    "session_id": request.session_id,
    **request.context,
}
```

**`**request.context` 展开**：context 的键值直接作为 State 字段。例如 exam Agent 需要 `exam_id`、resume Agent 需要 `file_path`，都通过 context 传入。

### 7.2 重试包装（第 196~200 行）

```python
@with_retry(agent_type=request.agent_type.value)
async def _invoke():
    return await graph.ainvoke(initial_state, config=config)
```

**`with_retry` 装饰器**：来自第 3 章，提供三层兜底（重试→降级→系统兜底）。闭包 `_invoke` 捕获当前请求参数，装饰器能重试同一个请求。

### 7.3 提取响应（第 203~212 行）

```python
last_message = result_state["messages"][-1]
content = last_message.text if hasattr(last_message, "text") else str(last_message.content)
```

从最终 State 取最后一条消息的文本作为 `content`。

---

## 八、调用方式与依赖

| 调用方 | 用途 |
|--------|------|
| `unified_chat.py` `_stream_qa_agent` | 懒加载取 QA 图 |
| 未来其他入口 | 直接调 `handle` |

| 依赖 | 用途 |
|:-----|:-----|
| `with_retry` | 三层兜底 |
| 四个 Agent 的 `build_xxx_graph` | 懒加载的 Agent 图 |
| `MemorySaver` | thread_id 检查点 |

---

## 九、`★` 设计亮点总结

`★ Insight ─────────────────────────────────────`
**`handle` 永不抛异常，返回统一 `AgentResponse`**：
- 无论成功失败，上层拿到 `AgentResponse`（success 字段区分）
- 上层不需要 try/except 处理 Orchestrator 异常
- 这是"失败也统一"的设计
`─────────────────────────────────────────────────`

`★ Insight ─────────────────────────────────────`
**懒加载 + 延迟导入 = 启动时零 Agent 开销**：
- 如果启动时全量加载四个 Agent 图，浪费启动时间
- 懒加载让"用到的 Agent 才加载"，未用到的完全不占资源
`─────────────────────────────────────────────────`

`★ Insight ─────────────────────────────────────`
**`with_retry` 闭包包装的真正价值**：
- `graph.ainvoke` 的参数每次调用不同，装饰器需要捕获当前请求
- 闭包 `_invoke` 捕获 `initial_state` 和 `config`，装饰器重试同一个请求
- 这是"装饰器 + 闭包"的组合模式——既复用重试逻辑，又保持参数独立
`─────────────────────────────────────────────────`