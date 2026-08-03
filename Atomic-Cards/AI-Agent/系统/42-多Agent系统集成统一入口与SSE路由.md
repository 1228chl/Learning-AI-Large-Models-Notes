---
author: "XunZong"
created: "2026-07-30"
tags: ["AI-Agent", "系统集成", "SSE路由", "编排器", "统一入口", "Orchestrator"]
aliases: ["System Integration", "Unified Chat", "SSE分发", "多Agent串联", "懒加载图"]
---

# 多 Agent 系统集成统一入口与 SSE 路由

## 定义

多 Agent 系统集成是在多个独立实现的 Agent 之上架设统一入口层（unified_chat.py）和编排层（orchestrator.py），使用户通过一个接口描述需求，系统自动判断意图、路由到正确的 Agent（或多 Agent 串联），并以统一的 SSE 事件格式流式返回结果。

核心设计理念：用户不应关心"问技术问题走 /qa、批改走 /exam、面试走 /interview"——系统应该自己判断。统一入口负责"听懂用户要什么"（接待员），编排器负责"把活派给对的 Agent"（调度台），二者解耦：入口只做路由，编排器只做执行。

## 统一请求生命周期

$$ \text{用户输入} \to \underbrace{\text{\_pre\_filter}}_{\text{零 Token 拦截}} \to \underbrace{\text{\_llm\_route}}_{\text{6 类意图}} \to \underbrace{\text{routing\_decision 事件}}_{\text{前端路由卡片}} \to \begin{cases} \text{qa} \to \text{SSE 流式} \\ \text{exam/resume/interview} \to \text{guidance 跳转} \\ \text{multi\_agent} \to \text{pipeline 计划} \\ \text{clarify} \to \text{追问澄清} \end{cases} \to \text{done 事件} $$

## 两个核心角色

| 角色 | 文件 | 职责 | 关键方法 |
|------|------|------|---------|
| 接待员 | `unified_chat.py` | 前置拦截 + LLM 路由 + SSE 事件推送 | `_pre_filter`, `_llm_route` |
| 调度台 | `orchestrator.py` | Agent 图懒加载 + 单 Agent 直达 + 多 Agent 串联 | `handle()`, `_run_single_agent()`, `_run_pipeline()` |

## 8 种 SSE 事件类型

| 事件 | 触发时机 | 前端行为 | 示例 |
|------|---------|---------|------|
| routing_decision | LLM 路由判完 | 顶部 "已转接到【智能问答】" 卡片 | `{"label": "qa", "confidence": 0.92}` |
| progress | QA 各节点开始 | "检索知识库中..." 进度条 | `{"node": "retrieve", "message": "正在检索知识库"}` |
| token | QA 生成时逐字 | 答案气泡逐字打出 | `{"content": "RA"}` `{"content": "G"}` ... |
| meta | QA 答完 | 答案模式标签 + 引用来源 | `{"pattern": "precise_rag", "sources": [...]}` |
| guidance | exam/resume/interview/clarify | 引导卡片（含 "前往 XX" 按钮） | `{"target": "resume", "message": "请上传简历"}` |
| pipeline_plan | multi_agent | 多步骤计划卡片 | `{"steps": ["简历审查", "模拟面试"]}` |
| done | 流结束 | 结束信号 | `{"status": "completed"}` |
| error | 异常 | 错误提示 | `{"message": "路由失败，已降级至问答"}` |

## 直观理解

> 酒店前台 + 调度台模式——你走进酒店只说了一句话（用户输入），前台（unified_chat.py）先判断你是来闲聊的还是来办事的，闲聊直接回应（"你好""谢谢"秒回，零成本），办事则判断你该去哪个部门（QA/考试/简历/面试），然后通过对讲机告诉调度台（orchestrator.py）"来了一位要改试卷的客人"，调度台调出对应的专业团队接单。你不需要知道酒店内部有哪些部门，前台帮你搞定。

## 前置拦截：零 Token 处理社交场景

```python
# _pre_filter: 5 类社交/元场景，字符串匹配，零 LLM 调用
PRE_FILTER_RULES = {
    "你好":      "你好！我是 EduAgent 学习助手，有什么可以帮你的？",
    "谢谢":      "不客气！有问题随时问我。",
    "再见":      "再见！祝你学习顺利。",
    "你是谁":    "我是 EduAgent，一个 AI 教学辅助系统。",
    "你能做什么": "我可以帮你：智能问答、试卷批改、简历审查、模拟面试。",
}

def _pre_filter(user_message: str) -> str | None:
    for pattern, response in PRE_FILTER_RULES.items():
        if pattern in user_message:
            return response  # 命中 → 直接返回模板，不调 LLM
    return None  # 未命中 → 进入 LLM 路由
```

## 图懒加载模式

```python
class Orchestrator:
    def __init__(self):
        self._agent_graphs: dict[str, Any] = {}   # 懒加载缓存
        self._pipelines: dict[str, list[str]] = {} # Pipeline 定义

    async def _get_agent_graph(self, agent_type: str):
        """首次调用时才 import 并编译 Agent 图，后续复用缓存"""
        if agent_type not in self._agent_graphs:
            if agent_type == "qa":
                from agents.qa.graph import build_qa_graph  # 懒 import
                self._agent_graphs[agent_type] = build_qa_graph()
            # ... 其他 Agent 同理
        return self._agent_graphs[agent_type]
```

四个 Agent 图构建成本不小（QA 图要连 Milvus、装载 reranker），懒加载确保只有被用到的图才构建，避免拖慢启动。

## AI/ML 工程应用场景

| 应用场景 | 对应模式 | 说明 |
|---------|---------|------|
| 智能客服中台 | 前置拦截 + LLM 路由 + SSE 流式 | FAQ→RAG / 订单→状态机 / 退换货→HitL |
| 企业内部工具门户 | 多 Agent 串联 Pipeline | 合同审查→法条 RAG→风险报告 |
| 学术研究助手 | 统一入口 + 懒加载 | 文献检索 / 数据分析 / 论文润色，按需加载 |
| 招聘全链路 | 串联 Pipeline + context 传递 | 简历审查→模拟面试→面试报告 |

## 面试追问

**Q1（基础）**：EduAgent 的统一入口（unified_chat.py）和编排器（orchestrator.py）分别扮演什么角色？

**回答要点**：

1. unified_chat.py = 接待员：面向用户，前置拦截社交场景（零 Token），LLM 判意图，SSE 流式推送事件
2. orchestrator.py = 调度台：拿到明确 agent_type 后直调对应 Agent 图，或串联多个 Agent
3. 解耦设计：入口只管路由，编排器只管执行，各自独立演进

**Q2（深挖）**：为什么跨 Agent 意图路由用 LLM（DeepSeek）判断而不是本地 MiniLM 分类模型？

**回答要点**：

1. 调用频率低：只有统一入口触发路由，一次 LLM 调用开销完全可接受
2. 部署更轻：不必额外加载维护一个路由分类模型（MiniLM 已在 QA 内部用于高频率的子意图分类）
3. 更灵活：新增意图只需改 Prompt，不用重训模型
4. LLM 路由失败降级为 qa——大不了当普通问答处理，不阻断用户

**Q3（实战）**：图懒加载是如何实现的？如果不懒加载，__init__ 里一次性 build 四个图有什么问题？

**回答要点**：

1. _agent_graphs 字典作为缓存，首次 _get_agent_graph 时 import 模块 + build 图 + 存入缓存
2. build_*_graph 的 import 写在函数内部（非文件顶部），推迟到真正需要时才触发
3. 不懒加载的代价：QA 图构建要连 Milvus、装载 reranker/classifier/embedder；如果用户只用来面试，这些初始化是浪费
4. 四个图全部预先构建会显著拖慢启动时间，且占用额外内存

**Q4（边界）**：多 Agent Pipeline 中，如果简历审查 Agent 失败了，后续的模拟面试 Agent 还执行吗？context 传递如何处理？

**回答要点**：

1. 取决于 Pipeline 策略：严格模式（任一步失败中止）或宽松模式（跳过失败继续）
2. EduAgent 默认严格模式——简历审查失败则 Pipeline 整体失败，返回 AgentResponse(success=False)
3. Context 传递：前序 Agent 的 structured_output 通过 `**request.context` 平铺进后序 Agent 的 initial_state
4. 若前序失败：context 为空，后序 Agent 降级运行（如模拟面试在无简历数据时走口头描述模式）

## 参考引用

- 需要理解 Orchestrator 编排器的内部设计（单 Agent 直达 + Pipeline 串联 + Schema 定义）：[Orchestrator 编排器设计](../系统/34-Orchestrator编排器设计.md)
- 需要理解 SSE 流式输出技术的前端和后端实现：[SSE 流式输出](../../Project/网络/10-WebSocket与SSE流式输出.md)
- 需要理解三层兜底重试机制如何在 _run_single_agent 中通过 @with_retry 应用：[三层兜底重试机制](../工程实践/02-三层兜底重试机制.md)
- 需要理解四大 Agent 范式及各 Agent 的 LangGraph 图构建：[四大 Agent 范式对比](../系统/37-四大Agent范式对比.md)
- 需要理解 LLM Factory 的 get_llm("intent") 如何提供路由判断模型：[LLM Factory 设计模式](../工程实践/01-LLM Factory设计模式.md)
