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

这个函数依次检查四个 Agent 的缓存，首次遇到未缓存的 Agent 就 import 并 build 它的图。

### 5.1 缓存检查 + 四路分支（第 103~126 行）

```python
def _get_agent_graph(self, agent_type: AgentType) -> Any:
    if agent_type not in self._agent_graphs:     # 103 行：缓存里没有 → 首次加载
        if agent_type == AgentType.QA:           # 104 行：QA Agent
            from backend.agents.qa.graph import build_qa_graph          # 105 行：第 5 章
            self._agent_graphs[agent_type] = build_qa_graph()           # 106 行：编译并缓存

        elif agent_type == AgentType.EXAM:       # 108 行：EXAM Agent
            from backend.agents.exam.graph import build_exam_graph      # 109 行：第 6 章
            self._agent_graphs[agent_type] = build_exam_graph()         # 110 行：编译并缓存

        elif agent_type == AgentType.RESUME:     # 112 行：RESUME Agent
            from backend.agents.resume.graph import build_resume_graph  # 113 行：第 4 章
            self._agent_graphs[agent_type] = build_resume_graph()       # 114 行：编译并缓存

        elif agent_type == AgentType.INTERVIEW:  # 116 行：INTERVIEW Agent
            from backend.agents.interview.graph import build_interview_graph  # 117 行：第 7 章
            self._agent_graphs[agent_type] = build_interview_graph()    # 118 行：编译并缓存

        else:                                    # 120 行：未知类型
            raise ValueError(f"未知 AgentType: {agent_type}")           # 121 行：抛异常

    return self._agent_graphs[agent_type]         # 128 行：返回（缓存中的）编译图
```

| 行号 | 代码 | 说明 |
|:----:|:-----|:------|
| 103 | `if agent_type not in self._agent_graphs:` | 缓存检查，已有则跳过 import/build |
| 104~106 | QA 分支 | 导入第 5 章的 `build_qa_graph`，编译并缓存 |
| 108~110 | EXAM 分支 | 导入第 6 章的 `build_exam_graph`，编译并缓存 |
| 112~114 | RESUME 分支 | 导入第 4 章的 `build_resume_graph`，编译并缓存 |
| 116~118 | INTERVIEW 分支 | 导入第 7 章的 `build_interview_graph`，编译并缓存 |
| 120~121 | else 分支 | 抛 `ValueError`，不会走到这里（枚举已约束） |
| 128 | `return` | 最终返回编译图，首次调用时刚编译好，后续调用直接取缓存 |

**为什么 `from ... import` 放函数内部？** 这叫"延迟导入"——首次访问某 Agent 时才 import 它的图模块。Python 的 `import` 只执行一次，后续 `from` 直接引用已加载的模块，没有重复开销。优点是启动时不加载任何 Agent 图，跑得快。

---

## 六、`handle`：统一入口（第 130~169 行）

`handle` 是整个 Orchestrator 的"大门"，所有请求从这里进。它只做两件事：按模式分发、异常兜底。

### 6.1 分发逻辑（第 149~155 行）

```python
async def handle(self, request: AgentRequest) -> AgentResponse:
    try:
        if request.pipeline_mode:                    # 151 行：检查是否强制走串联
            # 前端"求职全流程辅导"按钮等直接触发
            result = await self._run_pipeline(request)        # 152 行：跑多 Agent（8.3）
            return self._aggregate_pipeline(result, request)  # 153 行：聚合成统一响应（8.3）
        else:                                        # 154 行：默认：单 Agent 直达
            return await self._run_single_agent(request)      # 155 行：走单 Agent
```

| 行号 | 代码 | 说明 |
|:----:|:-----|:------|
| 149 | `try:` | 异常兜底包装 |
| 151 | `if request.pipeline_mode:` | 由 `pipeline_mode` 字段决定执行模式 |
| 152~153 | `_run_pipeline` + `_aggregate_pipeline` | 串联模式：先跑 Pipeline，再聚合结果 |
| 154~155 | `else: return _run_single_agent(request)` | 单 Agent 模式：直达目标 Agent |

### 6.2 异常兜底（第 157~169 行）

```python
    except Exception as e:                           # 157 行：任何异常都转成失败响应
        return AgentResponse(
            success=False,                            # 165 行：标记失败
            agent_type=request.agent_type,            # 166 行：保留原始目标 Agent
            content="系统处理请求时遇到问题，请稍后再试。",  # 167 行：友好兜底文案
            error_msg=str(e),                         # 168 行：原始错误信息
        )
```

| 行号 | 代码 | 说明 |
|:----:|:-----|:------|
| 157 | `except Exception as e:` | 捕获所有异常（包括 `_run_single_agent` 和 `_run_pipeline` 的） |
| 164~169 | `return AgentResponse(success=False, ...)` | 永远返回 `AgentResponse`，**不向上抛异常** |

**关键设计**：`handle` 永远返回 `AgentResponse`，不向上抛异常。即使执行失败，也返回 `success=False` 的响应。上层（`unified_chat.py`）不需要 try/except 处理 Orchestrator 异常。

---

## 七、`_run_single_agent`：单 Agent 直达（第 171~212 行）

这个函数组装"单 Agent 直达"的请求：取图 → 构造 State → 加重试 → 执行 → 提取响应。

### 7.1 取图 + 构造 State（第 179~194 行）

```python
async def _run_single_agent(self, request: AgentRequest) -> AgentResponse:
    graph = self._get_agent_graph(request.agent_type)    # 181 行：懒加载取目标 Agent 图

    # 构建 LangGraph 输入 State（统一三件套 + context 展开）
    initial_state = {
        "messages": [HumanMessage(content=request.user_message)],  # 185 行：包装用户消息
        "student_id": request.student_id,                 # 186 行：学员 ID
        "tenant_id": request.tenant_id,                   # 187 行：租户 ID
        "session_id": request.session_id,                 # 188 行：会话 ID
        **request.context,                                # 189 行：附加上下文平铺进 State
    }

    config = {"configurable": {"thread_id": request.thread_id}}  # 192 行：命中 MemorySaver 检查点
```

| 行号 | 代码 | 说明 |
|:----:|:-----|:------|
| 181 | `graph = self._get_agent_graph(...)` | 调 5.1 的懒加载函数，取目标 Agent 编译图 |
| 184~190 | `initial_state = {...}` | 构造输入 State：四个核心字段 + `**context` 展开 |
| 185 | `messages: [HumanMessage(...)]` | 把用户文本包装成 LangChain 消息格式，各 Agent 图都认这个字段 |
| 189 | `**request.context` | **关键设计**：context 的键值直接作为 State 字段。例如 exam Agent 需要 `exam_id`、resume Agent 需要 `file_path`，都通过 context 传入 |
| 192 | `config = {"configurable": {"thread_id": ...}}` | `thread_id` 来自 `AgentRequest` 的 `thread_id` 属性，与各 Agent 的 `build_thread_id` 格式一致 |

### 7.2 重试包装 + 执行（第 196~200 行）

```python
    @with_retry(agent_type=request.agent_type.value)  # 198 行：二进制装饰器，套三层兜底
    async def _invoke():                               # 199 行：闭包，捕获当前请求参数
        return await graph.ainvoke(initial_state, config=config)  # 200 行：真正跑 Agent 图

    result_state = await _invoke()                     # 202 行：执行（失败时 with_retry 自动处理）
```

| 行号 | 代码 | 说明 |
|:----:|:-----|:------|
| 198 | `@with_retry(agent_type=request.agent_type.value)` | 第 3 章的 `with_retry` 装饰器，提供三层兜底（重试→降级→系统兜底） |
| 199~200 | `async def _invoke(): return await graph.ainvoke(...)` | 闭包 `_invoke` 捕获 `initial_state` 和 `config`，装饰器能重试同一个请求 |
| 202 | `result_state = await _invoke()` | 执行，失败时 `with_retry` 自动重试/降级，不抛异常 |

**`@with_retry` + 闭包的价值**：`graph.ainvoke` 的参数每次调用不同，装饰器需要捕获当前请求。闭包 `_invoke` 捕获了 `initial_state` 和 `config`，装饰器重试同一个请求——这是"装饰器 + 闭包"的组合模式，既复用重试逻辑，又保持参数独立。

### 7.3 提取响应 + 返回（第 203~212 行）

```python
    # 从最终 State 提取响应内容：取最后一条消息的文本
    last_message = result_state["messages"][-1]           # 205 行：取最后一条消息
    content = last_message.text if hasattr(last_message, "text") else str(last_message.content)

    return AgentResponse(                                 # 208 行：组装统一响应
        success=True,                                     # 209 行：标记成功
        agent_type=request.agent_type,                    # 210 行：来源 Agent
        content=content,                                  # 211 行：主文本响应
        structured=result_state.get("structured_output"),  # 212 行：结构化数据（评分/报告）
        fallback_used=result_state.get("fallback_used", False),  # 213 行：是否走了降级
    )
```

| 行号 | 代码 | 说明 |
|:----:|:-----|:------|
| 205 | `last_message = result_state["messages"][-1]` | 最终 State 的 `messages` 列表最后一条就是 Agent 的回复 |
| 206 | `content = ... .text if hasattr(...) else str(...)` | 兼容两种消息类型：AIMessage 用 `.text`，其他用 `str(content)` |
| 208~214 | `return AgentResponse(...)` | 组装统一出参，返回给上层

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