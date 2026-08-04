---
author: "XunZong"
created: "2026-07-08"
tags: ["深度学习", "迁移学习", "微调", "预训练"]
aliases: ["Transfer Learning", "Fine-tuning", "迁移学习", "微调"]
---

# 迁移学习与微调（Transfer Learning）

> 本卡片为迁移学习的深度扩展版，侧重于数学原理、理论分类和高级策略。基础概念与实战技巧请参见 [迁移学习与微调](01-迁移学习与微调.md)。

## 定义

**迁移学习（Transfer Learning）** 的核心是**领域适应**：给定源领域 $\mathcal{D}_s$ 和源任务 $\mathcal{T}_s$，目标领域 $\mathcal{D}_t$ 和目标任务 $\mathcal{T}_t$，迁移学习的目标是在 $\mathcal{D}_s \neq \mathcal{D}_t$ 或 $\mathcal{T}_s \neq \mathcal{T}_t$ 的条件下，利用源领域知识提升目标任务的性能。

### 数学框架

设源域数据分布为 $P_s(X, Y)$，目标域分布为 $P_t(X, Y)$，迁移学习的目标是找到一个假设 $h: \mathcal{X} \to \mathcal{Y}$，使得：

$$
\epsilon_t(h) = \mathbb{E}_{(x,y) \sim P_t} [\ell(h(x), y)] \quad \text{尽可能小}
$$

利用源域知识 $\theta_s$ 作为先验，将目标风险分解为：

$$
\epsilon_t(h) \leq \epsilon_s(h) + d_{\mathcal{H}\Delta\mathcal{H}}(P_s, P_t) + \lambda
$$

其中 $\epsilon_s(h)$ 为源域经验误差，$d_{\mathcal{H}\Delta\mathcal{H}}$ 为两个域之间的分布差异（常用 MMD 或 H-divergence 度量），$\lambda$ 为理想联合误差常数。

## 迁移学习分类（深度版）

| 分类维度 | 类型 | 数学条件 | 典型方法 |
|:---------|:-----|:---------|:---------|
| **按源/目标任务关系** | 归纳迁移 | $\mathcal{T}_s \neq \mathcal{T}_t$ | 多任务学习、元学习 |
| | 转导迁移 | $\mathcal{T}_s = \mathcal{T}_t$, $\mathcal{D}_s \neq \mathcal{D}_t$ | 领域自适应（Domain Adaptation） |
| | 无监督迁移 | 目标域无标签 | 零样本学习（ZSL） |
| **按特征空间关系** | 同构迁移 | 特征空间相同 | 模型微调 |
| | 异构迁移 | 特征空间不同 | 跨模态迁移（文本→图像） |
| **按迁移粒度** | 实例迁移 | 重用源域样本 | 重要性加权 |
| | 特征迁移 | 共享特征表示 | 特征提取器 |
| | 参数迁移 | 共享模型参数 | 预训练+微调 |
| | 关系迁移 | 共享关系结构 | 图神经网络迁移 |

## 微调的数学原理

设预训练模型参数为 $\theta_{\text{pre}}$，$D_t$ 为目标域数据集，$\mathcal{L}_t$ 为目标域损失函数，$\lambda$ 为正则化强度，微调过程可视为求解以下优化问题：

$$
\theta^* = \arg\min_\theta \mathcal{L}_t(\theta; D_t) + \lambda \mathcal{R}(\theta - \theta_{\text{pre}})
$$

其中 $\mathcal{R}$ 是约束函数，常用形式包括：

| 约束类型 | 数学形式 | 效果 |
|:---------|:---------|:-----|
| **L2-SP** | $\Vert \theta - \theta_{\text{pre}} \Vert_2^2$ | 约束参数不偏离预训练值过远 |
| **EWC** | $\sum_i F_i (\theta_i - \theta_{\text{pre},i})^2$ | 按 Fisher 信息矩阵加权，保护重要参数 |
| **知识蒸馏损失** | $\mathcal{L}_{\text{KD}} = \text{KL}(p_{\text{pre}} \Vert p_\theta)$ | 保持预训练模型的输出分布 |

### 微调失效场景（负迁移）

当源域 $P_s$ 和目标域 $P_t$ 的分布距离过大时，迁移收益为负：

$$
\mathbb{E}_{P_t}[\ell(h_s, y)] > \mathbb{E}_{P_t}[\ell(h_{\text{scratch}}, y)]
$$

- $h_s$：源域训练得到的模型
- $h_{\text{scratch}}$：从头训练的模型

缓解策略：
1. **特征级适配**：使用对抗训练（GAN）对齐特征分布
2. **渐进式解冻**：从顶层到底层逐步解冻参数
3. **多源迁移**：从多个源任务集成知识

## ML/DL 应用场景

| 应用场景 | 数学形式 | 说明 |
|:---------|:---------|:-----|
| 领域自适应 | $\min_h \epsilon_s(h) + \lambda \text{MMD}(P_s, P_t)$ | 最小化源域误差同时减小域间分布差异 |
| 元学习（MAML） | $\theta^* = \arg\min_\theta \sum_i \mathcal{L}_i(\theta - \alpha \nabla \mathcal{L}_i(\theta))$ | 在多个任务上预训练，快速适应新任务。$\mathcal{L}_i$ 为第 $i$ 个任务的损失函数，$\alpha$ 为内循环学习率 |
| 持续学习（EWC） | $\mathcal{L}(\theta) = \mathcal{L}_t(\theta) + \frac{\gamma}{2} \sum_i F_i (\theta_i - \theta_{i}^*)^2$ | 防止新任务训练遗忘旧任务知识。$\mathcal{L}$ 为总损失，$\mathcal{L}_t$ 为当前任务的损失函数，$\gamma$ 为正则化强度 |

## 代码示例

```python
import torch.nn.functional as F
from transformers import get_linear_schedule_with_warmup

# 渐进式解冻微调策略
def progressive_unfreeze(model, num_layers, epoch, total_epochs):
    """根据训练进度逐层解冻，从顶层开始"""
    layers = list(model.bert.encoder.layer)
    total_layers = len(layers)
    
    # 计算当前轮次应解冻的层数（从顶层向下）
    unfreeze_count = int(total_layers * (epoch / total_epochs))
    unfreeze_indices = range(total_layers - unfreeze_count, total_layers)
    
    for idx, layer in enumerate(layers):
        for param in layer.parameters():
            param.requires_grad = idx in unfreeze_indices

# 使用示例
model = BertForSequenceClassification.from_pretrained('bert-base-uncased')
optimizer = AdamW(model.parameters(), lr=2e-5)
total_steps = len(train_dataloader) * 3
scheduler = get_linear_schedule_with_warmup(
    optimizer,
    num_warmup_steps=int(0.1 * total_steps),  # 10% 预热
    num_training_steps=total_steps
)

for epoch in range(3):
    progressive_unfreeze(model, num_layers=12, epoch=epoch, total_epochs=3)
    # 训练循环...
```

## 面试追问

**Q1（基础）**：迁移学习的数学目标是什么？
**回答要点**：

1. 目标是在目标域上最小化期望风险 $\epsilon_t(h)$
2. 利用源域知识 $\theta_s$ 作为先验，缩小假设空间搜索范围
3. 理论保证：$\epsilon_t(h) \leq \epsilon_s(h) + \text{域间距离} + \lambda$

**Q2（深挖）**：EWC（弹性权重巩固）如何保护旧任务知识？
**回答要点**：

1. 计算每个参数在旧任务上的 Fisher 信息矩阵 $F_i$，量化参数重要性
2. 在微调损失中增加正则项 $\sum_i F_i (\theta_i - \theta_i^*)^2$，重要参数变化受到更大惩罚
3. 实现了**持续学习**中的"记忆巩固"机制

**Q3（实战）**：源域和目标域分布差异很大时，你有什么策略？
**回答要点**：

1. **特征对齐**：使用对抗训练或 MMD 损失缩小特征分布差异
2. **渐进式适应**：在中间域上做预热，分步骤迁移
3. **实例重加权**：对源域样本按与目标域的相似度赋予权重

**Q4（边界）**：什么情况下微调比从头训练更差？
**回答要点**：

1. 源任务与目标任务**负相关**，迁移知识反而引入偏差
2. 目标任务数据**足够大**，从头训练可学到更适配的特征
3. **超参数不当**（学习率过大导致灾难性遗忘）

## 参考引用

- 需要理解迁移学习中的域间距离度量，参见 [向量范数](../../数学基础/线性代数/向量/03-向量范数.md)
- 需要掌握参数约束与正则化原理，参见 [正则化](../../机器学习/正则化/01-正则化.md)
- 需要了解预训练模型的完整架构，参见 [BERT 与 MLM 预训练](../../NLP/预训练/01-BERT与MLM预训练.md)
- 需要理解梯度下降与参数更新，参见 [梯度下降算法](../../数学基础/微积分与优化/05-梯度下降算法.md)
- 需要了解持续学习中的知识保护策略，参见 [知识蒸馏详解](../模型压缩/01-知识蒸馏详解.md)
