---
author: "XunZong"
created: "2026-07-10"
tags: ["深度学习", "Batch Normalization", "归一化"]
aliases: ["Batch Normalization", "批归一化", "BN", "批量归一化"]
---

# Batch Normalization（批归一化）

## 定义

Batch Normalization（BN）是一种**训练加速技术**：在每一层激活函数之前，对 mini-batch 的数据进行**归一化到标准正态分布**，再通过可学习的缩放和平移恢复表示能力。核心目标是解决**内部协变量偏移（Internal Covariate Shift）**问题。

数学定义：对 mini-batch $\mathcal{B} = \{x_1, \dots, x_m\}$ 中的每个元素：

$$
\mu_{\mathcal{B}} = \frac{1}{m} \sum_{i=1}^{m} x_i, \quad \sigma_{\mathcal{B}}^2 = \frac{1}{m} \sum_{i=1}^{m} (x_i - \mu_{\mathcal{B}})^2
$$

$$
\hat{x}_i = \frac{x_i - \mu_{\mathcal{B}}}{\sqrt{\sigma_{\mathcal{B}}^2 + \epsilon}}
$$

$$
y_i = \gamma \hat{x}_i + \beta
$$

其中：
- $x_i$ 为 mini-batch 中第 $i$ 个样本的激活值
- $\mu_{\mathcal{B}}$ 为 mini-batch 的均值，$\sigma_{\mathcal{B}}^2$ 为 mini-batch 的方差
- $m$ 为 mini-batch 大小
- $\epsilon$ 为小常数（默认 1e-5），防止除零
- $\hat{x}_i$ 为归一化后的值，服从 $N(0, 1)$ 分布
- $\gamma$ 为可学习的缩放参数（初始为 1），恢复分布的方差
- $\beta$ 为可学习的偏移参数（初始为 0），恢复分布的均值

## 直观理解

BN 的本质是：**把每一层的输入拉回到标准正态分布，让激活函数始终工作在最敏感的区域**。

以 Sigmoid 为例：如果不做 BN，梯度会随着网络加深逐渐靠近饱和区（梯度接近 0），导致梯度消失。BN 将输入强制拉回到 $[-2, 2]$ 区间，Sigmoid 在此区间梯度大，训练效率高。

```
输入分布（无 BN）          →  BN 后
     │                     │
  ╱╲╱╲  ╱╲          ╱╲╱╲╱╲╱╲╱╲
 ╱    ╲╱  ╲        ╱              ╲
╱  偏移 / 饱和    ╱   N(0,1) 敏感区  ╲
```

## 训练 vs 推理

| 阶段 | 均值/方差来源 | 行为 |
|:-----|:-------------|:------|
| **训练** | 当前 mini-batch 的统计量 $\mu_{\mathcal{B}}, \sigma_{\mathcal{B}}^2$ | 每次 batch 不同，对模型有正则化效果 |
| **推理** | 训练时滑动平均累积的全局统计量 $\mu_{\text{run}}, \sigma_{\text{run}}^2$ | 固定值，确保推理结果确定 |

滑动平均更新方式：

$$
\mu_{\text{run}} \leftarrow \alpha \mu_{\text{run}} + (1 - \alpha) \mu_{\mathcal{B}}
$$

其中 $\alpha$ 为动量系数（默认 0.9），控制历史统计量的保留比例。

## 与其他归一化对比

| 归一化方式 | 归一化维度 | 适用场景 | 计算方式 |
|:-----------|:----------|:---------|:---------|
| **BatchNorm** | 对 batch 维 | CNN 全连接层 | 每个通道独立计算 batch 的均值和方差 |
| **LayerNorm** | 对特征维 | RNN / Transformer | 每个样本独立计算所有特征的均值和方差 |
| **InstanceNorm** | 对单个样本-通道 | 图像风格迁移 | 每个样本的每个通道独立计算 |
| **GroupNorm** | 对通道分组 | 小 batch 场景（检测/分割） | 将通道分组，每组内计算 |

```python
import torch
import torch.nn as nn

# BatchNorm1d：用于全连接层（特征维度），输入形状 (N, C)
# BatchNorm2d：用于卷积层（通道维度），输入形状 (N, C, H, W)
# BatchNorm 通常放在线性层/卷积层之后、激活函数之前

# 全连接网络中的 BN 使用
fc_model = nn.Sequential(
    nn.Linear(784, 256),          # 线性变换
    nn.BatchNorm1d(256),           # BN：对 256 维特征做批归一化，放在激活前
    nn.ReLU(),                     # 激活函数：BN 后的 ReLU 更有效
    nn.Linear(256, 128),
    nn.BatchNorm1d(128),
    nn.ReLU(),
    nn.Linear(128, 10)
)

# CNN 中的 BN 使用
cnn_model = nn.Sequential(
    nn.Conv2d(3, 32, kernel_size=3, padding=1),  # 卷积层：输入 3 通道 RGB，输出 32 通道特征图
    nn.BatchNorm2d(32),                            # BN：对 32 个通道逐通道归一化，batch 维和空间维统计
    nn.ReLU(),
    nn.MaxPool2d(2),
    nn.Conv2d(32, 64, kernel_size=3, padding=1),
    nn.BatchNorm2d(64),
    nn.ReLU(),
    nn.AdaptiveAvgPool2d((1, 1)),                  # 全局平均池化：将特征图降维到 1x1
    nn.Flatten(),
    nn.Linear(64, 10)
)

# 手动控制 BN 的训练/推理模式
model.train()                   # 训练模式：BN 使用 batch 统计量
model.eval()                    # 推理模式：BN 使用全局滑动平均统计量
```

## 为什么 BN 有效

| 原因 | 解释 |
|:-----|:------|
| **减少梯度饱和** | 将输入拉到激活函数的敏感区间，缓解梯度消失（尤其 Sigmoid） |
| **允许更大学习率** | 归一化后的梯度更稳定，可使用更大的学习率加速收敛 |
| **轻微正则化效果** | 每个 batch 的统计量不同，引入随机噪声，类似 Dropout 效果 |
| **减少对初始化的依赖** | 每层输出的分布稳定，不因初始权重 scale 差异过大而发散 |

## ML/DL 应用场景

| 应用场景 | 数学形式 | 说明 |
|:---------|:---------|:------|
| CNN 图像分类 | $\text{BN}(x) = \gamma \frac{x - \mu_{\mathcal{B}}}{\sigma_{\mathcal{B}}} + \beta$ | 卷积层后接 BN，加速 ResNet / VGG 训练 |
| 全连接网络 | BatchNorm1d 对隐藏层归一化 | 多层 MLP 中每层后接 BN，允许更大学习率 |
| GAN 训练 | 生成器和判别器均使用 BN | 稳定对抗训练，防止模式坍塌 |
| 大 batch 训练 | 统计量更准确 | batch_size 越大，BN 效果越好 |

## 面试追问

**Q1（基础）**：Batch Normalization 的核心公式是什么？训练和推理时的行为有何不同？
**回答要点**：

1. 训练时对每个 mini-batch 计算均值和方差，归一化后用可学习的 $\gamma, \beta$ 缩放平移。
2. 推理时使用训练期间滑动平均累计的全局均值和方差，而不是当前 batch 的统计量，确保推理结果确定。
3. BN 通常放在线性层/卷积层之后、激活函数之前，但实际中放在激活函数之后也有一定效果。

**Q2（深挖）**：BN 为什么能缓解梯度消失？为什么可以允许更大的学习率？
**回答要点**：

1. BN 将每层的输入从可能被推到饱和区的分布拉回到 $N(0,1)$，使激活函数（尤其是 Sigmoid）工作在最敏感的非饱和区域，梯度大小得到保持。
2. 归一化后的梯度在数值上更稳定——不会因为某层参数变化导致后续层输入的分布发生剧烈变化（即消除内部协变量偏移），因此可以使用更大的学习率而不担心训练发散。
3. 大学习率原本会导致参数震荡，BN 通过限制每层输出的分布范围，使参数更新后的输出变化可控。

**Q3（实战）**：为什么 Transformer 不用 BN 而用 LayerNorm？小 batch 场景下 BN 有什么问题？
**回答要点**：

1. BN 在 batch 维上统计，batch_size 过小时（如 2 或 4），估计的均值和方差噪声大，引入大量噪声反而不利于训练。
2. Transformer 在大 batch 训练中常使用梯度累积，每个微 batch 的 BN 统计量不一致，导致训练不稳定。
3. LayerNorm 在特征维上统计，不受 batch_size 影响，且与序列长度无关，更适合 RNN/Transformer 的变长序列输入。
4. 小 batch 场景下 GroupNorm 是 BN 的有效替代（如 Mask R-CNN 的检测头）。

**Q4（边界）**：BN 的"正则化效果"是设计出来的还是副作用？这个效果在什么情况下会消失？
**回答要点**：

1. BN 的正则化效果是副作用而非设计目标——每个 batch 的统计量随机性相当于在训练过程中注入了轻微的噪声，类似于 Dropout，但远不足以替代专门的 Dropout。
2. 当 batch_size 很大时，各 batch 间的统计量差异变小，BN 的正则化效果减弱，但归一化效果依然存在。
3. 训练时 BN 的随机性在推理时被移除，因此模型在推理时的行为与训练时存在差异（训练时 BN 加噪声，推理时无噪声），这可能导致训练/推理精度 gap。

## 参考引用

- 需要理解 Layer Normalization 与 BN 的区别参见 [Layer Normalization](../../NLP/组件/03-Layer Normalization.md)
- 需要理解梯度消失问题与 BN 的关系参见 [梯度消失与梯度爆炸](./06-梯度消失与梯度爆炸.md)
- 需要理解 Dropout 与 BN 正则化效果的差异参见 [Dropout随机失活](./08-Dropout随机失活.md)
- 需要理解激活函数敏感区间与 BN 的配合参见 [激活函数](./02-激活函数.md)
- 需要理解完整训练流程中 BN 的配置位置参见 [完整模型训练流程](../训练优化/02-完整模型训练流程.md)