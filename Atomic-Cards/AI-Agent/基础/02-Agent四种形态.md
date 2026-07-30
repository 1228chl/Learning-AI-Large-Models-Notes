---
author: "XunZong"
created: "2026-07-30"
tags: ["AI-Agent", "Agent形态", "工作流", "工程化"]
aliases: ["Agent四种形态", "Agent形态", "固定工作流", "单Agent", "多Agent协作"]
---

# Agent 四种形态

## 定义

根据**复杂度和自主性**，Agent 系统可以划分为四种形态，从最简单的一次 LLM 调用到最复杂的多 Agent 协作系统。理解这四种形态及其适用场景，是设计 Agent 系统的基础。

### 四形态总览

| 形态 | 复杂度 | 自主性 | 状态管理 | 适用场景 |
|:----|:------:|:------:|:--------:|:---------|
| **形态一：单次 LLM 调用** | ⭐ | 无 | 无状态 | 简单文本生成 |
| **形态二：固定工作流** | ⭐⭐ | 低 | 显式传递 | RAG、数据处理管线 |
| **形态三：单 Agent 循环** | ⭐⭐⭐ | 高 | 内部循环 | 代码生成、数据分析 |
| **形态四：多 Agent 协作** | ⭐⭐⭐⭐ | 很高 | 编排器协调 | 复杂企业系统 |

### 直观理解

> 四种形态好比"做饭的四种方式"：形态一是"用微波炉热剩饭"（一键搞定）；形态二是"照着菜谱一步步做"（流程固定）；形态三是"大厨自由发挥"（自主决策）；形态四是"一个餐厅后厨团队"（多人协作）。

## 形态一：单次 LLM 调用

```python
用户输入 → [LLM] → 模型输出
```

**说明**：最简单形式，一次 Prompt 调用，模型直接返回结果。没有状态管理，没有工具调用，没有循环。

**优点**：实现简单，延迟低，成本低。
**缺点**：功能有限，无法处理复杂任务，没有记忆和上下文。

**示例**：直接调用 DeepSeek API 做翻译、摘要、关键词提取。

```python
def ask_llm(question: str) -> str:
    response = openai.ChatCompletion.create(
        model="gpt-4",
        messages=[{"role": "user", "content": question}]
    )
    return response.choices[0].message.content
```

## 形态二：固定工作流（Chain / Pipeline）

```python
用户输入 → [检索] → [增强] → [生成] → 模型输出
```

**说明**：将多个步骤串联成固定的工作流，每个步骤有明确的输入输出。步骤之间是确定的顺序执行，不存在分支和循环。LangChain 的 Chain 就是这种形态的典型实现。

**优点**：流程清晰，可控性强，易于调试和优化。
**缺点**：灵活性差，无法处理动态变化的需求。

**示例**：RAG 问答的"检索 → 重排序 → 生成"流程；数据处理管线。

```python
# RAG 固定工作流
def rag_pipeline(question: str) -> str:
    # 1. 检索
    docs = vector_search(question, top_k=5)
    # 2. 重排序
    docs = reranker.rerank(question, docs)
    # 3. 生成
    answer = llm.generate(question, docs)
    return answer
```

## 形态三：单 Agent（自主循环）

```python
用户输入 → [Agent] → 循环：感知-决策-行动 → 达到目标 → 输出
```

**说明**：一个 Agent 自主运行，能够感知环境、做出决策、调用工具，并在循环中完成任务。Agent 可以自主决定下一步做什么，而不是按照固定的流程执行。

**优点**：灵活性高，能够处理复杂和不确定的任务。
**缺点**：行为不可预测，调试困难，成本较高（可能多次调用 LLM）。

**示例**：能够自主搜索网页、执行代码、分析结果的 Research Agent。

```python
class SingleAgent:
    def __init__(self):
        self.memory = []
        self.tools = {"search": search_web, "calculate": calculate}

    async def run(self, task: str):
        self.memory.append({"role": "user", "content": task})
        while True:
            action = await self.llm.decide(self.memory, self.tools)
            if action["type"] == "respond":
                return action["content"]
            elif action["type"] == "use_tool":
                result = self.tools[action["name"]](action["args"])
                self.memory.append({"role": "system", "content": f"结果: {result}"})
```

## 形态四：多 Agent 协作

```
                   ┌─── Agent 1 ───┐
用户输入 → [Orchestrator] ─── Agent 2 ─── 汇总输出
                   └─── Agent 3 ───┘
```

**说明**：多个 Agent 协同工作，每个 Agent 负责一个子任务。Orchestrator 负责协调和管理 Agent 之间的通信。

**优点**：职责清晰，可扩展性强，适合复杂业务场景。
**缺点**：架构复杂，需要处理 Agent 间通信和状态同步。

**示例**：EduAgent 系统，四个 Agent 分别负责不同的教学辅助任务。

## EduAgent 的"组合拳"策略

EduAgent 没有选择单一的形态，而是采用**形态二（固定工作流）+ 形态四（多 Agent 协作）的组合**：

**形态二（固定工作流）用于每个 Agent 内部**：每个 Agent 内部的业务流程是固定的、可预测的。如 QA Agent 的"检索 → 重排序 → 生成"流程。固定工作流确保流程可控、结果可预测、易于调试优化。

**形态四（多 Agent 协作）用于系统整体架构**：四个 Agent 通过 Orchestrator 进行协作，职责清晰、独立演进、容错隔离、灵活组合。

这种组合兼顾了**稳定性、可控性和灵活性**，是实际生产项目中最常用的架构模式。

## 四种形态对比

| 维度 | 单次 LLM | 固定工作流 | 单 Agent | 多 Agent |
|:----|:---------|:-----------|:---------|:---------|
| **实现复杂度** | 低 | 中 | 高 | 很高 |
| **灵活性** | 低 | 低 | 高 | 很高 |
| **可控性** | 高 | 高 | 中 | 低 |
| **调试难度** | 易 | 易 | 中 | 难 |
| **成本** | 低 | 中 | 高 | 很高 |
| **适用场景** | 简单任务 | 固定流程 | 复杂不确定 | 企业级系统 |

## 面试追问

**Q1（基础）**：Agent 的四种形态分别是什么？各自的特点是什么？
**回答要点**：
1. 单次 LLM 调用：一次 Prompt 调用的简单问答，无状态无工具
2. 固定工作流：多个步骤串联成固定流程，步骤确定顺序执行
3. 单 Agent 自主循环：Agent 自主感知、决策、行动，循环直到任务完成
4. 多 Agent 协作：多个 Agent 协同工作，通过 Orchestrator 协调

**Q2（深挖）**：EduAgent 为什么选择"形态二 + 形态四"的组合，而不是只用一种？
**回答要点**：
1. 形态二用于每个 Agent 内部：流程可控、结果可预测、易于调试
2. 形态四用于系统整体架构：职责清晰、独立演进、容错隔离
3. 这种组合兼顾了稳定性（内部固定流程）和灵活性（整体多 Agent 编排）

**Q3（实战）**：什么场景下应该选择形态二（固定工作流）而不是形态三（单 Agent 循环）？
**回答要点**：
1. 业务流程确定的场景（如 RAG 问答、数据处理管线）选形态二
2. 需要灵活探索和决策的场景（如代码生成、网页浏览）选形态三
3. 形态二更可控、更易调试；形态三更灵活但行为不可预测

**Q4（边界）**：多 Agent 协作（形态四）在什么场景下反而比单 Agent 更差？
**回答要点**：
1. 简单任务：多 Agent 引入不必要的通信开销
2. 强依赖场景：任务不可拆分，必须由单一 Agent 完成
3. Agent 质量差异大：某个 Agent 能力不足会拖累整体

## 参考引用
- 需要理解 Agent 核心定义与基本概念的相关知识，参见 [Agent定义与核心公式](../基础/01-Agent定义与核心公式.md)
- 需要理解多 Agent 协作系统的相关知识，参见 [多Agent协作(Multi-Agent)](../协作/11-多Agent协作(Multi-Agent).md)
- 需要理解 Orchestrator 编排器设计的相关知识，参见 [Orchestrator编排器设计](../系统/34-Orchestrator编排器设计.md)