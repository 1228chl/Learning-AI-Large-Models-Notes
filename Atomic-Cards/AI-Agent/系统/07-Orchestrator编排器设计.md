---
author: "XunZong"
created: "2026-07-30"
tags: ["AI-Agent", "Orchestrator", "编排器", "路由", "意图识别"]
aliases: ["Orchestrator", "编排器", "意图路由", "多Agent串联", "Pipeline编排"]
---

# Orchestrator 编排器设计

## 定义

**Orchestrator（编排器）** 是多 Agent 系统的"大脑"——它负责理解用户意图，将请求路由到正确的 Agent，或在复杂场景中串联多个 Agent 协作完成任务。它本身不执行业务逻辑，只负责调度和协调。

### 一句话职责

> Orchestrator 是"调度台"，Agent 是"执行者"。Orchestrator 决定"谁来做"，Agent 负责"怎么做"。

## 两个职责层次

### 层次一：意图识别 + 单 Agent 路由

当用户发送请求时，Orchestrator 首先识别用户意图，然后将请求路由到对应的 Agent。

```python
class Orchestrator:
    def __init__(self):
        self.intent_classifier = MiniLMIntentClassifier()
        self.agents = {
            "qa": QAAgent(),
            "exam": ExamAgent(),
            "resume": ResumeAgent(),
            "interview": InterviewAgent(),
        }

    async def route(self, user_input: str, file: bytes = None) -> dict:
        # 1. 意图识别
        intent = self.intent_classifier.classify(user_input)

        # 如果意图置信度低，请求用户确认
        if intent.confidence < 0.7:
            return {
                "type": "clarification",
                "message": f"您是想问技术问题，还是想批改试卷？"
            }

        # 2. 根据意图路由到对应的 Agent
        if intent.label == "qa":
            return await self.agents["qa"].handle(question=user_input)
        elif intent.label == "exam":
            return await self.agents["exam"].handle(paper=file)
        elif intent.label == "resume":
            return await self.agents["resume"].handle(resume=file)
        elif intent.label == "interview":
            return await self.agents["interview"].start(user_input=user_input)
        else:
            return {"error": "无法识别的请求类型"}
```

### 层次二：多 Agent 串联 Pipeline

在某些复杂场景中，需要多个 Agent 协作完成一个任务。

```python
class Orchestrator:
    async def execute_pipeline(self, user_input: str, file: bytes = None) -> dict:
        intent = self.intent_classifier.classify(user_input)
        pipeline = self._get_pipeline(intent)

        if pipeline:
            # 执行 pipeline：前一步的输出作为后一步的输入
            context = {}
            for step in pipeline:
                agent = self.agents[step["agent"]]
                step_input = self._prepare_input(step, context, user_input, file)
                step_output = await agent.handle(**step_input)
                context[step["name"]] = step_output
            return context
        else:
            return await self._single_route(intent, user_input, file)

    def _get_pipeline(self, intent) -> List[dict]:
        pipelines = {
            "interview_and_review_resume": [
                {"agent": "interview", "name": "interview_result",
                 "input": {"question": "{user_input}"}},
                {"agent": "resume", "name": "resume_review",
                 "input": {"resume": "{file}", "interview_feedback": "{interview_result}"}},
            ]
        }
        return pipelines.get(intent.pipeline_id)
```

## 意图识别详解

### 分类方式

| 方式 | 工具 | 延迟 | 适用场景 |
|:-----|:-----|:----:|:---------|
| **轻量分类模型** | MiniLM（蒸馏 Transformer） | ~10ms | 有限类别，高速要求 |
| **LLM 分类** | DeepSeek/GPT-4 | ~1-5s | 复杂意图，多标签 |
| **规则匹配** | 关键词 + 正则 | <1ms | 简单、确定性的意图 |

### 置信度阈值

分类结果附带置信度分数（0-1.0）。当置信度低于阈值时，不直接路由，而是请求用户确认：

```
置信度 ≥ 0.7 → 直接路由
置信度 < 0.7 → 请求用户确认："您是想问技术问题，还是想批改试卷？"
```

## Orchestrator vs Agent 职责边界

| 维度 | Orchestrator | Agent |
|:-----|:-------------|:------|
| **职责** | 路由和编排 | 执行业务逻辑 |
| **状态** | 无状态或轻量状态 | 有状态（业务流程状态） |
| **复杂度** | 低（路由逻辑） | 高（业务逻辑） |
| **粒度** | 粗粒度（Agent 级别） | 细粒度（节点级别） |
| **错误处理** | 路由错误、Agent 不可用 | 业务错误、LLM 调用失败 |

## 设计要点

1. **意图识别附带置信度**：低于阈值时请求用户确认，避免误路由
2. **Pipeline 可配置**：pipeline 定义可配置化，方便添加新流程
3. **步骤间错误隔离**：某个步骤失败不影响其他步骤的执行
4. **上下文传递**：通过 context 字典在步骤之间传递数据
5. **Orchestrator 无状态**：Orchestrator 本身不存储状态，状态由 Agent 管理

## 面试追问

**Q1（基础）**：Orchestrator 的两个职责层次是什么？
**回答要点**：
1. 层次一：意图识别 + 单 Agent 路由，将用户请求分发到正确的 Agent
2. 层次二：多 Agent 串联 Pipeline，按序执行多个 Agent，前一步输出作为后一步输入

**Q2（深挖）**：置信度阈值的作用是什么？为什么要设置 0.7 的阈值？
**回答要点**：
1. 避免误路由：置信度低时请求用户确认，而不是盲目路由
2. 0.7 的经验值：平衡了自动化程度和路由准确率
3. 阈值可调：根据业务场景对准确率的要求灵活调整

**Q3（实战）**：Orchestrator 和 Agent 的职责边界是什么？为什么这样划分？
**回答要点**：
1. Orchestrator 负责路由和编排（轻量），Agent 负责执行业务逻辑（重量）
2. Orchestrator 无状态，Agent 有状态
3. 这样划分让 Orchestrator 保持轻量和可扩展，Agent 保持专注和内聚

**Q4（边界）**：如果意图识别模块挂了，整个系统会怎样？如何设计降级？
**回答要点**：
1. 意图识别不可用时，系统无法自动路由
2. 降级方案：兜底为"统一入口，用户手动选择功能"（如前端展示功能菜单）
3. 或缓存最近一次可用的路由表，使用缓存结果

## 参考引用
- 需要理解 Agent 四种形态中多 Agent 协作的相关知识，参见 [Agent四种形态](../基础/02-Agent四种形态.md)
- 需要理解多 Agent 协作系统的相关知识，参见 [多Agent协作(Multi-Agent)](../协作/01-多Agent协作(Multi-Agent).md)
- 需要理解六层分层架构中编排层职责的相关知识，参见 [六层分层架构设计](../系统/08-六层分层架构设计.md)