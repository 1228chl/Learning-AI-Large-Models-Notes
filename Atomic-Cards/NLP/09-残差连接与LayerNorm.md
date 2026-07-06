---
author: "XunZong"
created: "2026-07-06"
tags: ["NLP", "Transformer", "归一化"]
aliases: ["残差连接", "LayerNorm", "Residual", "Layer Normalization"]
---

# 残差连接与 LayerNorm

## 残差连接（Residual Connection）

让输入直接绕过子层加到输出上，解决深层网络的**梯度消失**和**退化问题**：

$$\text{Output} = x + \text{Sublayer}(x)$$

```python
# 残差连接的实现
def residual_block(x, sublayer):
    return x + sublayer(x)     # 梯度可以从输出直通到输入
```

**作用**：
1. 梯度直通：$x$ 直接加到输出，梯度可无损反向传播
2. 缓解退化：深层模型至少不差于浅层（恒等映射选项）
3. Transformer 中每个子层后都接残差连接

## Layer Normalization

对**每个样本的每个位置**独立做归一化，计算均值和方差：

$$\text{LayerNorm}(x) = \gamma \odot \frac{x - \mu}{\sigma + \epsilon} + \beta$$

其中 $\mu = \frac{1}{d}\sum_{i=1}^d x_i$，$\sigma = \sqrt{\frac{1}{d}\sum_{i=1}^d (x_i - \mu)^2}$

```python
import torch.nn as nn

ln = nn.LayerNorm(512)              # 对 512 维特征做归一化
x = torch.randn(2, 10, 512)        # (N, L, d)
y = ln(x)                           # 每个 (N, L) 位置的 d 维向量独立归一化
```

## LayerNorm vs BatchNorm

| 对比 | LayerNorm | BatchNorm |
|:----:|:---------:|:---------:|
| **归一化维度** | $\mu$ 在**特征维度**计算 | $\mu$ 在**批量维度**计算 |
| **依赖 Batch** | ❌ 不依赖 | ✅ 依赖，小 batch 不稳定 |
| **序列长度变化** | ✅ 灵活 | ❌ 固定 |
| **训练/推理一致性** | ✅ 一致 | ❌ 训练用 batch，推理用全局 |
| **Transformer 使用** | **标准配置** | 不适合（序列变长） |

```python
# 关键区别
# BN: 对某个特征维度，在所有样本上求均值和方差
# LN: 对某个样本，在所有特征维度上求均值和方差
```

## Transformer 中的子层结构

```
Post-LN（原版 Transformer）: x → MHA → Add+LN → FFN → Add+LN
Pre-LN（更稳定，LLaMA 等）: x → LN → MHA → Add → LN → FFN → Add
```

| 结构 | 训练稳定性 | 代表模型 |
|:----:|:---------:|:---------|
| **Post-LN** | 需 warmup，不稳定 | 原版 Transformer |
| **Pre-LN** | 稳定，无需 warmup | BERT、GPT、LLaMA |

## ML 中的残差与归一化

| 模型 | 结构 | 说明 |
|:----:|:----|------|
| **ResNet** | Conv → BN → ReLU → Add（残差） | 首次引入残差连接，高达 152 层 |
| **BERT** | Pre-LN + 残差 | 12/24 层 Transformer 编码器 |
| **GPT** | Pre-LN + 残差 | 12-96 层 Transformer 解码器 |
| **LLaMA** | Pre-LN（RMS Norm）+ 残差 | 使用更简单的 RMS Norm 替代 LayerNorm |
| **Stable Diffusion** | 残差 + GroupNorm | U-Net 中的 CN 层 |

> 参见 [[06-自注意力与Transformer]]、[[07-多头注意力]]
