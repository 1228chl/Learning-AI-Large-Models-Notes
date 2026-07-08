---
author: "XunZong"
created: "2026-07-08"
tags: ["AI-Agent", "多Agent", "协作", "LLM"]
aliases: ["Multi-Agent System", "MAS", "多Agent系统"]
---

# 多Agent协作（Multi-Agent Collaboration）

## 定义

**多Agent系统（Multi-Agent System, MAS）** 是由多个自主智能体组成的系统，每个 Agent 拥有独立的职责、记忆和工具集，通过通信、协调和协作完成单个 Agent 难以实现的复杂任务。

多Agent协作的核心是**角色分工**和**通信协商**：每个 Agent 扮演特定角色（如规划者、执行者、评审者），通过信息共享和任务分配，实现"1+1>2"的集体智能。

### 数学形式

设 Agent 集合为 $\mathcal{A} = \{a_1, a_2, \dots, a_n\}$，每个 Agent $a_i$ 有：
- 状态空间 $\mathcal{S}_i$
- 动作空间 $\mathcal{A}_i$
- 策略函数 $\pi_i: \mathcal{S}_i \to \mathcal{A}_i$
- 通信函数 $c_i: \mathcal{S}_i \to \mathcal{M}$（消息生成）

多Agent系统的联合策略为 $\pi = (\pi_1, \pi_2, \dots, \pi_n)$，系统目标为最大化联合回报：

$$
J(\pi) = \mathbb{E}\left[\sum_{t=0}^{T} \gamma^t R(\mathbf{s}_t, \mathbf{a}_t)\right]
$$

其中 $\gamma$ 为折扣因子，$R$ 为奖励函数，$\mathbf{s}_t = (s_{1,t}, s_{2,t}, \dots, s_{n,t})$ 为联合状态，$\mathbf{a}_t = (a_{1,t}, a_{2,t}, \dots, a_{n,t})$ 为联合动作。

### 直观理解

> 多Agent协作好比"一个专业的团队"：产品经理（规划Agent）拆解需求 → 开发（执行Agent）写代码 → 测试（评审Agent）验收质量 → 运维（部署Agent）上线发布。每个角色各司其职，但信息互通，共同完成一个大型项目。

## 协作模式分类

| 模式 | 角色分配 | 通信方式 | 适用场景 | 典型框架 |
|:-----|:---------|:---------|:---------|:---------|
| **角色分工** | 固定角色，各司其职 | 任务接力 | 标准化流程 | MetaGPT（产品/开发/测试） |
| **辩论模式** | 多方持不同观点，相互辩论 | 多轮对话 | 复杂决策、方案评审 | Debate |
| **专家混合** | 多个专家 Agent，路由器分发 | 单轮+路由 | 多领域问题 | Mixture of Experts (MoE) |
| **层次协作** | 主管 Agent 拆解任务，分配给子 Agent | 上下级通信 | 复杂任务分解 | Hierarchical Agent |
| **自主协商** | 动态角色，Agent 自行协商分工 | 广播+协商 | 开放域任务 | AutoGen |

## 协作机制详解

### 1. 通信协议

Agent 之间通过消息传递进行通信。消息格式通常包含：

```python
class Message:
    sender: str      # 发送者 ID
    receiver: str    # 接收者 ID（或 'all' 广播）
    content: str     # 消息内容
    msg_type: str    # 类型：request / response / query / report
    metadata: dict   # 附加信息（如时间戳、置信度）
```

### 2. 任务分解与分配

主管 Agent 将复杂任务分解为子任务，并通过以下策略分配给合适的子 Agent：

| 分配策略 | 数学形式 | 说明 |
|:---------|:---------|:-----|
| 能力匹配 | $\text{score}(a_i, t_j) = \text{cosine}(\text{emb}(a_i), \text{emb}(t_j))$ | 根据 Agent 能力描述和任务描述的相似度匹配，$\text{emb}(\cdot)$ 为嵌入函数，$t_j$ 为第 $j$ 个任务 |
| 负载均衡 | $\min \max_i \text{load}(a_i)$ | 最小化最大负载，避免单一 Agent 过载 |
| 拍卖机制 | $a_i = \arg\max_{a \in \mathcal{A}} \text{bid}(a, t_j)$ | Agent 对任务"出价"，价高者得 |

## ML/DL 应用场景

| 应用场景 | 数学形式 | 说明 |
|:---------|:---------|:-----|
| 代码生成团队 | 产品 Agent → 开发 Agent → 测试 Agent | MetaGPT 的多角色协作 |
| 科研论文撰写 | 搜索 Agent + 写作 Agent + 审稿 Agent | 协作完成论文初稿 |
| 多模态理解 | 视觉 Agent + 文本 Agent + 融合 Agent | 各模态独立处理，融合层联合决策 |
| 游戏 AI | 多个 NPC 协作/竞争 | 多智能体强化学习（MARL） |

## 代码示例

### AutoGen 多Agent协作

```python
import autogen
from autogen import AssistantAgent, UserProxyAgent, GroupChat, GroupChatManager

# 定义三个角色 Agent
planner = AssistantAgent(
    name="Planner",
    system_message="你是一个项目经理，负责拆解任务并分配给团队成员。"
)

developer = AssistantAgent(
    name="Developer",
    system_message="你是一个资深开发工程师，负责代码实现。"
)

reviewer = AssistantAgent(
    name="Reviewer",
    system_message="你是一个代码审查专家，负责审核代码质量。"
)

# 用户代理（可执行代码）
user_proxy = UserProxyAgent(
    name="User",
    human_input_mode="NEVER",
    code_execution_config={"work_dir": "coding"},
)

# 建立群组对话
group_chat = GroupChat(
    agents=[user_proxy, planner, developer, reviewer],
    messages=[],  # 对话历史
    max_round=10,  # 最大对话轮次
)

# 群聊管理器负责调度发言顺序
manager = GroupChatManager(
    groupchat=group_chat,
    llm_config={"config_list": [{"model": "gpt-4", "api_key": "..."}]}
)

# 启动群聊：用户提出需求
user_proxy.initiate_chat(
    manager,
    message="请开发一个 Python 函数，计算斐波那契数列的第 n 项。"
)
# 工作流：Planner 拆分 → Developer 实现 → Reviewer 审核 → 输出最终代码
```

### 专家混合路由（简易版）

```python
import numpy as np
from typing import List, Tuple

class Router:
    def __init__(self, experts: List[callable], expert_embs: np.ndarray):
        self.experts = experts
        self.expert_embs = expert_embs  # 每个专家的能力向量

    def route(self, query: str, query_emb: np.ndarray, top_k: int = 1) -> Tuple[List[callable], np.ndarray]:
        """根据 query 向量与专家能力向量的相似度路由"""
        # 计算余弦相似度
        similarities = np.dot(self.expert_embs, query_emb) / (
            np.linalg.norm(self.expert_embs, axis=1) * np.linalg.norm(query_emb)
        )
        # 选取 top-k 专家
        top_indices = np.argsort(similarities)[-top_k:][::-1]
        selected_experts = [self.experts[i] for i in top_indices]
        scores = similarities[top_indices]
        return selected_experts, scores
```

## 面试追问

**Q1（基础）**：为什么需要多Agent协作，而不是用一个强大的单一Agent？
**回答要点**：

1. **分工专业化**：不同 Agent 专注于不同领域（代码、数学、搜索），避免单个模型能力泛化不足
2. **并行加速**：多个 Agent 可并行执行不同子任务
3. **质量提升**：通过辩论、评审机制相互校验，降低单一 Agent 的幻觉

**Q2（深挖）**：多Agent系统面临的主要挑战是什么？
**回答要点**：

1. **通信开销**：多轮通信导致 Token 消耗和延迟增加
2. **协调策略**：如何避免 Agent 间冲突或重复工作
3. **可信度验证**：如何验证 Agent 间的输出可信度，防止"谎话传千里"

**Q3（实战）**：在群聊模式下，如何决定下一个发言的 Agent？
**回答要点**：

1. **轮转调度**：按固定顺序轮流发言
2. **LLM 调度**：用一个独立 Router Agent 决定下一步谁发言
3. **基于内容**：根据当前消息类型自动路由（如代码问题→开发Agent）

**Q4（边界）**：什么场景下多Agent协作反而比单Agent更差？
**回答要点**：

1. **简单任务**：多 Agent 引入不必要的通信开销，降低效率
2. **强依赖场景**：任务不可拆分，必须由单一 Agent 完成
3. **Agent 质量差异大**：某个 Agent 能力严重不足会拖累整体

## 参考引用

- 需要理解单个 Agent 的基础定义与架构的相关知识，参见 [Agent 定义与核心公式](../AI-Agent/01-Agent定义与核心公式.md)
- 需要掌握工作流编排如何串联多个 Agent 的相关知识，参见 [工作流编排](../AI-Agent/09-工作流编排(Workflow).md)
- 需要了解多智能体强化学习（MARL）的数学基础的相关知识，参见 [概率空间与事件运算](../概率统计/01-概率空间与事件运算.md)
- 需要理解通信协议中的消息序列化的相关知识，参见 [Socket 网络编程](../Python/09-Socket网络编程.md)
- 需要了解多 Agent 部署的容器化方案的相关知识，参见 [Docker 基础与容器化](../工程实践/01-Docker基础与容器化.md)
