---
author: "XunZong"
created: "2026-07-10"
tags: ["深度学习", "LLM", "RLHF", "对齐"]
aliases: ["RLHF", "人类反馈强化学习", "对齐", "Reinforcement Learning from Human Feedback", "PPO"]
---

# RLHF 与人类偏好对齐

## 定义

RLHF（Reinforcement Learning from Human Feedback）是**用人类偏好作为奖励信号来微调大语言模型**的训练范式，是从 InstructGPT/ChatGPT 到 Claude/GPT-4 的核心训练技术。其目标是让模型输出更符合人类期望（有用、诚实、无害）。

三阶段训练流程：

$$
\underbrace{\text{预训练}}_{\text{Pretraining}} \rightarrow \underbrace{\text{SFT 微调}}_{\text{Supervised Fine-Tuning}} \rightarrow \underbrace{\text{RLHF 对齐}}_{\text{RLHF Alignment}}
$$

## 三阶段详解

### 阶段一：SFT（监督微调）

用高质量的人工标注数据（指令+期望输出）对预训练模型做有监督微调，使模型学会遵循指令的基本格式。

$$
\mathcal{L}_{\text{SFT}} = -\mathbb{E}_{(x, y) \sim \mathcal{D}_{\text{SFT}}} \left[ \sum_{t=1}^{|y|} \log P(y_t \mid x, y_{<t}; \theta) \right]
$$

- $x$ 为指令输入，$y$ 为人工标注的理想输出
- $\theta$ 为模型参数
- 数据量通常为 1 万~10 万条高质量 (指令, 回答) 对

### 阶段二：奖励模型训练

训练一个奖励模型（Reward Model, RM）来预测人类偏好：

$$
\mathcal{L}_{\text{RM}} = -\mathbb{E}_{(x, y_w, y_l) \sim \mathcal{D}_{\text{RM}}} \left[ \log \sigma(r_\phi(x, y_w) - r_\phi(x, y_l)) \right]
$$

其中：
- $y_w$ 为人类偏好的回答（winner），$y_l$ 为不偏好的回答（loser）
- $r_\phi(x, y)$ 为奖励模型 $\phi$ 对 $(x, y)$ 的评分
- $\sigma$ 为 Sigmoid 函数，将评分差映射到概率
- 核心思想：让 RM 学会给"好的回答"打高分，给"差的回答"打低分

### 阶段三：PPO 强化学习

用 PPO 算法优化语言模型，使策略模型（Policy）的输出获得 RM 的最高评分，同时加入 KL 正则化防止模型偏离 SFT 模型太远：

$$
\mathcal{L}_{\text{RLHF}} = \mathbb{E}_{x \sim \mathcal{D}_{\text{PPO}}, y \sim \pi_\theta(y|x)} \left[ r_\phi(x, y) - \beta \cdot D_{\text{KL}}(\pi_\theta(y|x) \parallel \pi_{\text{SFT}}(y|x)) \right]
$$

- $\pi_\theta$ 为当前策略模型（正在优化的模型）
- $\pi_{\text{SFT}}$ 为 SFT 阶段的参考模型（冻结）
- $r_\phi(x, y)$ 为奖励模型对当前输出的评分
- $\beta$ 为 KL 惩罚系数，控制对齐强度
- $D_{\text{KL}}$ 约束策略模型不偏离 SFT 模型太远，防止 reward hacking

```python
# RLHF 训练流程的伪代码（简化版）
# 实际实现需使用 transformer 库和 trl 库

# 1. SFT 阶段：有监督微调
from transformers import AutoModelForCausalLM, AutoTokenizer
from trl import SFTTrainer

model = AutoModelForCausalLM.from_pretrained("llama-7b")
sft_trainer = SFTTrainer(model, train_dataset=sft_data)
sft_trainer.train()                        # 用指令-回答对微调

# 2. 奖励模型训练
from trl import RewardTrainer

rm_model = AutoModelForSequenceClassification.from_pretrained("llama-7b")
rm_trainer = RewardTrainer(rm_model, train_dataset=rm_data)  # 用 (回答好, 回答差) 对训练
rm_trainer.train()

# 3. PPO 对齐
from trl import PPOTrainer

ppo_trainer = PPOTrainer(
    model,                                  # 策略模型（待优化）
    ref_model=sft_model,                    # 参考模型（冻结的 SFT 模型）
    reward_model=rm_model,                  # 奖励模型，为每个输出打分
    beta=0.04                               # KL 惩罚系数
)
ppo_trainer.train()                         # 用 PPO 优化策略模型，使奖励最大化
```

## 核心技术细节

| 技术 | 作用 | 说明 |
|:-----|:-----|:------|
| **PPO-clip** | 防止策略更新过大 | $\epsilon=0.2$ 的 clip 范围，稳定训练 |
| **KL 惩罚** | 防止 reward hacking | 模型可能"欺骗"奖励模型得到高分但输出不可读 |
| **Reward Normalization** | 稳定奖励尺度 | 对奖励做 z-score 归一化，使不同 RM 的分数可比 |
| **PPO-ptx** | 保持预训练能力 | 混合 RL 目标和预训练语言建模目标（约 10% 比例） |

## 奖励模型 vs 人类评估

| 维度 | 奖励模型 | 直接人类评估 |
|:-----|:---------|:------------|
| 成本 | 训练一次、无限次使用 | 每次评估都需要人工 |
| 速度 | 毫秒级 | 分钟级 |
| 一致性 | 固定标准 | 可能存在标注者偏差 |
| 覆盖范围 | 可泛化到未见过的输入 | 只能评估有限样本 |
| 局限性 | 可能被 reward hacking | 最可靠，但成本高 |

## ML/DL 应用场景

| 应用场景 | 对齐方式 | 说明 |
|:---------|:---------|:------|
| 对话助手安全对齐 | RLHF + 红队测试 | 让模型拒绝有害请求，拒绝编造信息 |
| 代码生成模型 | RLHF + 单元测试通过率作为奖励 | 用测试用例自动评估代码质量 |
| 文本摘要 | RLHF + ROUGE 分数 | 人类偏好"简洁+信息完整"的摘要 |
| 机器翻译 | RLHF + BLEU + 人类偏好 | 平衡翻译准确性和自然度 |
| DPO（直接偏好优化） | 无需单独训练 RM | 直接用偏好对优化策略，简化 RLHF 流程 |

## 面试追问

**Q1（基础）**：RLHF 的三阶段分别是什么？为什么需要三个阶段而不是端到端训练？
**回答要点**：

1. 三阶段：SFT 监督微调（让模型学会指令遵循）→ 奖励模型训练（让 RM 学会人类偏好）→ PPO 强化学习（用 RM 的评分优化策略）。
2. 不能端到端的原因：人类偏好信号是稀疏的、延迟的，且在 token 级别不可用——标注者只能评价整段回答的好坏，无法逐 token 标注。
3. SFT 阶段为 RLHF 提供了良好的初始策略：如果从随机策略开始 RL，搜索空间太大，训练极不稳定且需要海量交互。

**Q2（深挖）**：RLHF 中的 KL 惩罚项为什么是必要的？不加会怎样？
**回答要点**：

1. 不加 KL 惩罚，模型会学会"欺骗"奖励模型——找到 RM 评分高的特定模式（如输出特别长、包含特定关键词），但实际输出质量可能很差（reward hacking）。
2. KL 惩罚限制策略模型 $\pi_\theta$ 与 SFT 模型 $\pi_{\text{SFT}}$ 的分布差异，确保模型在优化奖励的同时不损失语言能力和多样性。
3. $\beta$ 控制对齐的强度：$\beta$ 太大则模型几乎不变（对齐效果差），$\beta$ 太小则模型容易 reward hacking。

**Q3（实战）**：DPO（Direct Preference Optimization）和 RLHF 有什么本质区别？什么时候该用 DPO 而不是 RLHF？
**回答要点**：

1. DPO 直接利用偏好对 $(y_w, y_l)$ 优化策略，无需单独训练奖励模型，训练更简单稳定。
2. RLHF 需要训练 RM + PPO 两个阶段，训练复杂但更灵活——可以在训练后更换 RM 或调整 RM 权重。
3. 选择建议：中小团队/快速实验用 DPO（更简单）；大团队/追求极致效果用 RLHF（可独立优化 RM、迭代 RM 不重新训练策略）。

**Q4（边界）**：RLHF 的对齐目标（有用、诚实、无害）之间可能存在冲突吗？如何权衡？
**回答要点**：

1. 存在冲突：对敏感问题"完全诚实"可能有害（如详细描述自杀方法），"完全无害"可能不诚实（回避问题或编造安全答案）。
2. 实践中通过多目标奖励模型（Multi-objective RM）或分层对齐（先安全对齐再有用对齐）来权衡。
3. 当前研究前沿：Constitutional AI（Claude 使用的基于原则的自我修正）、RLAIF（AI 反馈替代人类反馈）、过程奖励模型（Process Reward Model）逐步骤评估而非仅整体评分。

## 参考引用

- 需要理解强化学习 PPO 算法的基础参见 [强化学习基础](../../机器学习/基础/07-强化学习基础.md)
- 需要理解 PEFT 高效微调与 RLHF 的联合使用参见 [PEFT高效微调](../迁移学习/19-PEFT高效微调.md)
- 需要理解 KL 散度的数学原理参见 [信息论基础](../../概率统计/09-信息论基础.md)
- 需要理解 Scaling Law 与涌现能力与 RLHF 的关系参见 [Scaling Law与涌现能力](./23-Scaling Law与涌现能力.md)
- 需要理解解码参数对生成质量的影响参见 [LLM推理解码参数](./29-LLM推理解码参数.md)