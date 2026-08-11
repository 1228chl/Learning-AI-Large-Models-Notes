# 简历项目模版 · 多 Agent 系统 — EduAgent 完整版

---

## 一、简历上直接填写的版本

> 这是最有竞争力的写法，推荐用于 3 年以上、AI LLM 开发工程师岗位。
> 把 `【】` 括号内的占位符替换成实际数字/信息。

---

**项目名称：** EduAgent — 面向 IT 教培的多 Agent 智能教学辅助系统

**技术栈：** Python · LangGraph · LangChain · DeepSeek-V3 · DeepSeek-Coder-V2 · BGE-M3 · BGE-Reranker · FastAPI · Vue3 · Milvus · PostgreSQL · Redis · MinIO · SSE · Docker

**项目时间：** 【2025.xx — 2025.xx】　**角色：** 独立设计与实现

**项目描述：**

为 IT 教培公司独立设计并实现了端到端多 Agent 智能教学辅助系统，将问答、批改、简历审查、模拟面试四个核心教学场景 AI 化，统一接入 Orchestrator 编排器，支持单 Agent 直达和多 Agent 串联 Pipeline 两种执行模式，实现了系统端到端测试通过率 【100%】（76 passed），生产可部署状态。

**系统架构设计：**

- **统一 Orchestrator 编排器**：设计 `AgentRequest / AgentResponse` 统一 Schema，Orchestrator 通过 `pipeline_mode` 标志分发至 `_run_single_agent`（单 Agent 直达）或 `_run_pipeline`（多 Agent 串联）；四个 Agent 图懒加载，首次使用才初始化，减少启动开销
- **多 Agent 串联 Pipeline**：`job_preparation` Pipeline（简历审查 → 模拟面试）实现前序 `structured_output` 自动注入后序 `context`，且设置简历综合分 < 60 的门槛中止条件，不合格学员不触发面试；命名映射层（`resume_result` → `resume_review_id`）解决跨 Agent 字段约定差异
- **LLM 意图路由**：统一助手入口（`/api/v1/chat/stream`）先做规则前置拦截（5 类社交场景零 Token 响应），再用 DeepSeek 判断 6 类意图（qa / exam / resume / interview / multi\_agent / clarify），路由结果通过 SSE 推送前端展示路由卡片
- **三层降级兜底**：网络抖动/超时自动重试（间隔 1s/3s，max\_retries=2）→ Agent 级降级（QA 走 LLM 直答，批改跳过代码沙箱）→ 系统级兜底（友好提示 + 已完成结果持久化），Fallback 率 < 【3%】
- **多租户隔离**：所有 DB 表含 `tenant_id`，Milvus 按 namespace 隔离，MemorySaver 按 Agent 类型独立（`get_memory_saver("qa"/"exam"/"interview")`）

**四个 Agent 各自核心技术亮点：**

| Agent | 范式 | 核心技术亮点 |
|-------|------|------------|
| QA | RAG + 多路由 | Query 四分类 → HyDE/Multi-Query/直接检索；BGE-M3 混合检索 + Reranker 精排；低置信度自动联网兜底 |
| Exam | HitL + 三轨并行 | LangGraph `interrupt()` 教师复核工作流；结构化得分点评分（`SubjectiveReviewResult`），评分可溯源 |
| Resume | fan-out/fan-in | 六维度并行 LLM 评审；Pydantic 结构化提取；加权综合分，与 Interview Pipeline 串联 |
| Interview | 状态机 + SSE | 五阶段状态机（阶段控制与内容生成分离）；简历联动个性化追问；22字段跨轮 MemorySaver 持久化 |

**量化结果：**

- RAGAS faithfulness 【0.91】，context precision 【0.78】
- 试卷批改 MAE < 【1.5分】（满分10分），教师 HitL 介入率 < 【20%】
- 简历评分一致性标准差 < 【1.5分】，强弱简历区分度 > 【25分】
- 系统全链路端到端测试 76 passed，QA P95 延迟 < 8s，Fallback 率 < 3%

---

## 二、面试口头表达（60 秒开场白）

> 适合"介绍一下你做过最复杂的 AI 项目"这类问题。

---

"我独立设计实现了一个多 Agent 教育辅助系统，对标生产环境。

系统最核心的设计是 Orchestrator 编排器——统一收口所有请求，根据意图路由到四个 Agent 之一，也支持多 Agent 串联：比如'求职全链路'会先跑简历审查，通过了再自动启动模拟面试，两个 Agent 之间的数据通过上下文传递，对前端透明。

四个 Agent 各自代表了不同的 LangGraph 范式：QA 是 RAG 加多路由检索，Exam 是三轨并行批改加 Human-in-the-Loop，Resume 是六维度 fan-out 并行评审，Interview 是五阶段状态机加 SSE 流式输出。

每个 Agent 各自解决了一个核心技术问题：QA 是提升低质 Query 的召回率，Exam 是让教师能审核和修改 AI 批改结果，Interview 是把阶段控制从 LLM 手里拿出来用代码管理，避免不可控。

端到端测试 76 passed，QA 的 RAGAS faithfulness 达到 0.91。你想深入聊架构层面，还是某个具体 Agent 的实现？"

---

## 三、高频追问 & 参考答案

### Q1：多 Agent 系统里，不同 Agent 之间怎么传递数据？

**答：**
通过 Orchestrator 的 `current_context` 字典传递，不是 Agent 之间直接调用。

具体流程：`_run_pipeline` 按顺序跑每个 Agent，每步执行完后把 `step_response.structured` 里的关键字段提取出来放进 `current_context`，下一步的 `AgentRequest.context` 就包含这些数据，通过 `**request.context` 平铺进入下一个 Agent 的初始 State。

这样设计的好处是**解耦**：Agent 不知道彼此存在，只知道自己的 State 里有哪些字段。Pipeline 顺序、Agent 组合都在 Orchestrator 层配置，改 Pipeline 不需要改任何 Agent 的代码。

---

### Q2：Orchestrator 的懒加载是怎么回事？为什么要这样做？

**答：**
四个 Agent 图（`build_qa_graph()`、`build_exam_graph()` 等）都有不小的初始化成本：QA 图要连 Milvus、加载 BGE-Reranker 模型，Interview 图要连 PostgreSQL 等。如果应用启动时全部初始化，会：
1. 拖慢启动速度（可能要等 30-60 秒）
2. 浪费内存（某些 Agent 可能当天都不用）

懒加载的实现：`_agent_graphs` 字典初始为空，`_get_agent_graph(agent_type)` 被调用时检查缓存，没有就 import + build 并写入缓存，之后复用。关键细节是在函数内部 import（`from backend.agents.qa.graph import build_qa_graph`），而非文件顶部 import，把依赖加载也推迟到真正需要时。

---

### Q3：意图路由为什么用 LLM 而不是训练一个分类模型？

**答：**
主要考量是**调用频率低 + 维护成本**。意图路由只在统一入口触发，不是每个 Agent 内部的高频操作，一次 LLM 调用的开销完全可接受。

训练分类模型的问题：需要标注数据、训练流程、模型部署、版本管理；要新增一类意图，要重新标注 + 重新训练。用 LLM 判断（温度 0，返回 JSON 标签），新增意图只改 Prompt，改完即生效。

路由失败的兜底：LLM 超时或 JSON 解析失败时，降级回 `qa`，大不了当成技术问答处理，用户体验不断线。

---

### Q4：三层降级兜底是怎么设计的？

**答：**
```
第一层：自动重试（with_retry 装饰器）
  → 网络抖动/LLM 超时，间隔 1s/3s 重试，最多 2 次
  → 适合瞬时故障，用户几乎无感知

第二层：Agent 降级（每个 Agent 各自的 fallback 逻辑）
  → 重试 2 次仍失败时触发
  → QA：跳过 RAG，直接让 LLM 回答（标注 fallback_used=True）
  → Resume：跳过结构化提取，提示用户简历格式异常
  → Interview：跳过题库查询，出通用问题

第三层：系统兜底（Orchestrator.handle 的 try/except）
  → 所有降级都失败才到这层
  → 返回 AgentResponse(success=False, content="系统处理遇到问题，请稍后再试")
  → 已完成的结果不丢弃（前面成功的步骤结果已持久化）
```

三层设计的核心原则：**任何情况下都返回一个有效的 `AgentResponse`，绝不向 API 层抛异常**。

---

### Q5：多租户是怎么实现的？

**答：**
三个层次：
1. **数据库层**：所有表都有 `tenant_id` 字段，所有查询加 `WHERE tenant_id = :tenant_id` 过滤，不同租户数据物理隔离在同一个 DB
2. **向量库层**：Milvus 按 `tenant_id` 做 namespace 隔离，每个租户的知识库向量互不可见，检索时自动带 namespace 过滤
3. **记忆层**：MemorySaver 的 `thread_id` 格式包含 `tenant_id`，`student_{tenant}_{student_id}_session_{session_id}`，不同租户的对话状态天然隔离

`tenant_id` 从 JWT Token 里解析，通过 FastAPI 依赖注入传入所有请求，Agent 代码不需要手动处理，完全透明。

---

### Q6：这个系统你觉得最难的地方是什么？

**答：**（建议结合自己实际实现中遇到的问题来回答，下面是一个参考）

最难的是 **Resume → Interview 的 Pipeline 衔接**，踩了一个命名不匹配的坑：

简历 Agent 的 `structured_output` 里用 `resume_result`（整个字典），但面试 Agent 的 `load_context_node` 期望 State 里有 `resume_review_id`（UUID 字符串）。Pipeline 跑通了，但面试里没有简历联动，查了很久才发现是字段名对不上。

最终在 Orchestrator 的 `_run_pipeline` 里加了一个显式映射：

```python
if agent_type == AgentType.RESUME:
    review_id = step_response.structured.get("review_id")
    if review_id:
        current_context["resume_review_id"] = review_id
```

这个教训让我意识到：多 Agent 系统里，Agent 之间的"接口契约"（用什么字段名、什么数据类型）比单 Agent 内部的逻辑更需要仔细设计和文档化。
