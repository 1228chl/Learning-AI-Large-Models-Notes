---
author: "XunZong"
created: "2026-07-10"
tags: ["深度学习", "迁移学习", "PEFT", "LoRA"]
aliases: ["PEFT", "LoRA", "高效微调", "Parameter Efficient Fine-Tuning", "QLoRA", "Prefix Tuning"]
---

# PEFT 高效微调

## 定义

PEFT（Parameter Efficient Fine-Tuning）是一类**只更新少量额外参数即可适配下游任务**的微调技术。核心思想是冻结预训练模型的大部分参数，仅插入或调整少量可训练参数，以极小的显存开销实现与全量微调相当的精度。

数学形式：全量微调 $\theta^* = \theta_0 + \Delta\theta$ 需要更新所有参数 $\Delta\theta \in \mathbb{R}^{d \times k}$，而 PEFT 将 $\Delta\theta$ 分解为低秩形式：

$$
\theta^* = \theta_0 + \phi(\Delta\theta'), \quad \text{rank}(\Delta\theta') \ll \min(d, k)
$$

其中 $\theta_0$ 为冻结的预训练参数，$\phi$ 为参数量化映射函数，$\Delta\theta'$ 为少量可训练参数。

## 为什么需要 PEFT

| 方法 | 可训练参数 | 显存需求 | 与全量微调精度对比 |
|:-----|:----------:|:--------:|:------------------:|
| **全量微调** | 100%（7B=70亿） | ~140 GB | 基准 |
| **LoRA** | 0.1%~1% | ~16 GB | 相当或略低 |
| **QLoRA** | 0.1%~1% | ~10 GB | 相当 |
| **Prefix Tuning** | 0.01%~0.1% | ~12 GB | 略低 |
| **Adapter** | 1%~3% | ~20 GB | 相当 |

核心价值：**消费级 GPU（24GB）即可微调 7B~13B 大模型**，无需多卡集群。

## 主流方法

### LoRA（Low-Rank Adaptation）

核心思想：将权重更新量 $\Delta W$ 分解为两个低秩矩阵的乘积：

$$
h = W_0 x + \Delta W x = W_0 x + BA x, \quad B \in \mathbb{R}^{d \times r}, A \in \mathbb{R}^{r \times k}
$$

其中 $r$ 为秩（通常 4~32），$W_0$ 冻结，仅训练 $A$ 和 $B$。

```python
import torch
import torch.nn as nn

# LoRA 层的简化实现
class LoRALayer(nn.Module):
    """将线性层的权重更新分解为低秩矩阵 A 和 B"""
    def __init__(self, in_features, out_features, rank=8, alpha=16):
        super().__init__()
        self.alpha = alpha                     # 缩放系数：控制 LoRA 更新的强度
        self.scaling = alpha / rank            # 缩放因子，rank 越大缩放越小
        # A 矩阵：随机初始化（高斯分布）
        self.A = nn.Parameter(torch.randn(in_features, rank) * 0.01)
        # B 矩阵：零初始化，确保训练开始时 LoRA 更新为 0
        self.B = nn.Parameter(torch.zeros(rank, out_features))

    def forward(self, x):
        # LoRA 更新 = xWA * B，即 BA 的输入输出变换
        return (x @ self.A @ self.B) * self.scaling

# 使用示例：将 LoRA 插入到预训练模型的注意力层
# 假设 model.layers[i].self_attn.q_proj 是原线性层
# lora = LoRALayer(768, 768, rank=8)
# 前向传播时：h = q_proj(x) + lora(x)  # 原输出 + LoRA 增量
```

### QLoRA（Quantized LoRA）

在 LoRA 基础上将预训练权重量化到 4-bit（NF4 数据类型），进一步降低显存：

- 冻结的 $W_0$ 加载为 4-bit NF4 格式
- 可训练的 $A, B$ 保持 16-bit 精度
- 训练时 $W_0$ 反量化到 16-bit 计算，不存储梯度
- 显存需求降低约 4 倍，精度损失 < 1%

### Prefix Tuning

在 Transformer 每层的注意力前插入可学习的虚拟 token 前缀：

$$
\text{Attention}(Q, K, V) = \text{softmax}\left(\frac{Q[K_{\text{prefix}}; K]^T}{\sqrt{d}}\right)[V_{\text{prefix}}; V]
$$

- 不修改模型权重，只调整输入前缀
- 参数量极少（约 0.01%），适合快速切换任务

### Adapter

在 Transformer 每层中插入小型 bottleneck 模块：

```
LayerNorm → DownProject(r) → ReLU → UpProject(d) → 残差连接
```

- 参数量 1%~3%
- 推理时需额外计算，增加延迟

## 方法对比

| 维度 | LoRA | QLoRA | Prefix Tuning | Adapter |
|:-----|:----:|:-----:|:-------------:|:-------:|
| 可训练参数 | 0.1%~1% | 0.1%~1% | 0.01%~0.1% | 1%~3% |
| 训练显存 | 中 | **低** | 低 | 中 |
| 推理延迟 | **无增加** | 无增加 | 略有增加 | 增加 |
| 多任务切换 | 换权重文件 | 换权重文件 | 换前缀向量 | 换模块 |
| 适用模型 | 通用 | 显存受限 | 生成任务 | 通用 |

## ML/DL 应用场景

| 应用场景 | 使用的方法 | 说明 |
|:---------|:-----------|:------|
| LLM 指令微调 | LoRA | 微调 Llama/ChatGLM 等模型适配对话场景 |
| 垂直领域适配 | QLoRA | 法律/医疗领域用单卡 24GB GPU 微调 13B 模型 |
| 多任务部署 | LoRA + Adapter | 同个基座模型加载不同 LoRA 权重，快速切换任务 |
| 图像生成模型微调 | LoRA | Stable Diffusion 微调特定风格或人物 |

## 面试追问

**Q1（基础）**：LoRA 的核心思想是什么？为什么将权重更新分解为低秩矩阵是合理的？
**回答要点**：

1. LoRA 假设预训练模型在下游任务上微调时，权重更新的「内在秩」很低——即 $\Delta W$ 可以用低秩矩阵近似。
2. 将 $\Delta W = BA$，$B \in \mathbb{R}^{d \times r}$、$A \in \mathbb{R}^{r \times k}$，$r \ll \min(d,k)$。训练时冻结 $W_0$，仅更新 $A,B$。
3. 推理时可将 $W_0 + BA$ 合并为一个矩阵，不增加推理延迟。

**Q2（深挖）**：LoRA 中的秩 r 如何选择？r 太大或太小会有什么影响？
**回答要点**：

1. r 通常取 4~32，r=8 是大多数任务的默认值。r 越大，LoRA 的表示能力越强但参数量也越大。
2. r 太小（如 1~2）：表达能力不足，可能无法捕捉下游任务所需的适配方向。
3. r 太大（如 64+）：参数量增加但收益递减，且可能过拟合小数据集。
4. 经验法则：先 r=8 试跑，如果欠拟合（训练损失降不下去）增大 r，如果过拟合（验证集差）减小 r。

**Q3（实战）**：你如何选择 LoRA 的 target modules（作用于哪些层）？全量微调和 LoRA 精度差距主要体现在哪些任务上？
**回答要点**：

1. 通常作用于注意力层的 Q、V 投影矩阵，这是对下游任务影响最大的参数。扩展时可加 K、O 和 FFN 层。
2. 全量微调在以下场景可能优于 LoRA：数据量极大（>10 万条）、任务与预训练分布差异大（如领域迁移）、需要模型学习全新的知识而非适配表达方式。
3. 实际项目中先用 LoRA 快速验证，精度不够时再考虑全量微调或增大 r。

**Q4（边界）**：QLoRA 的 4-bit 量化为什么不会显著损失精度？NF4 数据类型和普通 int4 有什么区别？
**回答要点**：

1. 神经网络权重通常呈零中心正态分布，NF4（NormalFloat4）根据正态分布的分位点做非均匀量化，在权重密集区域分配更多量化级别，减少量化误差。
2. 双重量化：QLoRA 对量化常数再做一次量化，进一步减少显存占用。
3. 实际表现：QLoRA 在绝大多数任务上与 LoRA 精度差距 < 1%，但显存降低约 4 倍，使得 24GB 单卡可微调 33B 模型。

## 参考引用

- 需要理解迁移学习和微调的基础概念参见 [迁移学习与微调](./17-迁移学习与微调.md)
- 需要理解模型量化技术参见 [模型量化](../../深度学习/模型压缩/19-模型量化(Quantization).md)
- 需要理解 Transformer 注意力机制的结构参见 [自注意力与Transformer](../../NLP/架构/06-自注意力与Transformer.md)
- 需要理解 RLHF 与 PEFT 的联合使用参见 [RLHF与人类偏好对齐](../LLM/30-RLHF与人类偏好对齐.md)