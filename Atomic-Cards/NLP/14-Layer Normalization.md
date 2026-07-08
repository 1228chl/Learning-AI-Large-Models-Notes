---
author: "XunZong"
created: "2026-07-07"
tags: ["NLP", "Transformer", "归一化"]
aliases: ["层归一化", "Layer Normalization", "LayerNorm", "RMS Norm"]
---

# Layer Normalization

## 定义

Layer Normalization（LayerNorm）对**每个样本的每个位置**在其特征维度上独立计算均值和方差，进行归一化，使网络层的输出分布保持稳定：

$$ \text{LayerNorm}(x) = \gamma \odot \frac{x - \mu}{\sigma + \epsilon} + \beta $$

其中：

$$ \mu = \frac{1}{d}\sum_{i=1}^d x_i, \quad \sigma = \sqrt{\frac{1}{d}\sum_{i=1}^d (x_i - \mu)^2} $$

$d$ 为特征维度，$\gamma$（缩放）和 $\beta$（偏移）是可学习参数，$\epsilon$ 防止除零。

```python
import torch.nn as nn

ln = nn.LayerNorm(512)                         # 创建 LayerNorm 层，归一化维度设为 512（对应 Transformer 的 d_model）

x = torch.randn(2, 10, 512)                   # 模拟输入张量：(batch_size=2, seq_len=10, hidden_dim=512)

y = ln(x)                                      # 对每个样本每个位置独立计算均值/方差，在特征维上归一化为 N(0,1) 后缩放平移
```

## 核心公式与分类

### LayerNorm 与 BatchNorm 对比

| 对比维度 | LayerNorm | BatchNorm |
|:--------:|:---------:|:---------:|
| **归一化维度** | 每个样本的**特征维** | 每个特征维度的**批维** |
| **统计量计算** | $\mu,\sigma$ 在 $d$ 维上计算 | $\mu,\sigma$ 在 $N$ 维上计算 |
| **依赖 Batch** | 不依赖 | 依赖，小 batch 不稳定 |
| **序列长度变化** | 灵活支持 | 固定长度 |
| **训练/推理一致性** | 一致 | 训练用 batch 统计、推理用全局移动平均 |
| **Transformer 兼容性** | **标准配置** | 不兼容（变长 + 依赖 batch） |

```python
# 直观区别
# BN: 在 N 个样本间归一化某个特征维度
mu_bn = x.mean(dim=0)                          # BatchNorm：沿批次维度（dim=0）计算均值，统计量形状为 (seq_len, hidden_dim)
# LN: 在一个样本内归一化所有特征维度
mu_ln = x.mean(dim=-1)                         # LayerNorm：沿特征维度（dim=-1）计算均值，每个位置独立统计，形状为 (batch, seq_len)
```

### RMS Norm

RMS Norm 是 LayerNorm 的简化变体，去掉了均值归零步骤，仅保留 RMS 缩放：

$$ \text{RMSNorm}(x) = \gamma \odot \frac{x}{\sqrt{\frac{1}{d}\sum_{i=1}^d x_i^2 + \epsilon}} $$

| 对比维度 | LayerNorm | RMS Norm |
|:--------:|:---------:|:--------:|
| **均值归零** | 是（减 $\mu$） | 否 |
| **计算量** | 稍大（需计算 $\mu$ 和 $\sigma$） | 更小（仅需 RMS） |
| **参数量** | $\gamma + \beta$（2d） | $\gamma$ 仅（d） |
| **LLM 采纳度** | 早期 Transformer | LLaMA 系列及后续开源 LLM |

## 直观理解

LayerNorm 对每个词向量做"标准化"：将其分布拉回到零均值单位方差，消除层与层之间特征尺度的剧烈变化；RMS Norm 进一步简化为"仅缩放不平移"——实验表明在 Transformer 中均值归零并非必需，仅控制特征 RMS 即可稳定训练。

## ML/DL 应用场景

| 应用场景 | 使用的归一化 | 说明 |
|:--------:|:-----------:|:------|
| **Transformer（原始）** | Post-LN + LayerNorm | 残差相加后归一化 |
| **BERT** | Pre-LN + LayerNorm | 子层前归一化，12/24 层编码器 |
| **GPT 系列** | Pre-LN + LayerNorm | 12~96 层解码器 |
| **LLaMA 系列** | Pre-LN + **RMS Norm** | 去掉均值归零，参数量减半 |
| **ChatGLM / Qwen** | Pre-LN + RMS Norm | 继承 LLaMA 归一化方案 |
| **ResNet（CV）** | BatchNorm | 计算机视觉主流，依赖固定尺寸 batch |
| **Stable Diffusion** | GroupNorm | 类似 LN，将通道分组归一化，不依赖 batch |

## 面试追问

**Q1（基础）**：Layer Normalization 的数学公式是什么？它在 Transformer 的什么位置出现？
**回答要点**：

1. 公式为 $\text{LN}(x) = \gamma \odot (x - \mu) / (\sigma + \epsilon) + \beta$，沿特征维度计算 $\mu$ 和 $\sigma$
2. Transformer 中每个子层（MHA 和 FFN）后（Post-LN）或前（Pre-LN）都放置 LayerNorm
3. Pre-LN 先归一化再进入子层，训练更稳定，被 BERT/GPT/LLaMA 等主流模型采用

**Q2（深挖）**：Transformer 为什么用 LayerNorm 而不是 BatchNorm？序列模型中 BatchNorm 有什么根本缺陷？
**回答要点**：

1. BN 在特征维上跨 batch 求统计量，要求序列长度固定，无法处理变长输入
2. BN 依赖 batch 内样本量，小 batch 时统计量估计不准，且训练/推理行为不一致
3. LN 对每个位置每个样本独立归一化，不受变长影响，训练推理一致，batch 独立性好

**Q3（实战）**：LLaMA 使用 RMS Norm 替代 LayerNorm，你在部署大模型时是否也会做此选择？依据是什么？
**回答要点**：

1. 会优先选择 RMS Norm，计算量更少——省去均值计算，可学习参数从 2d 减为 d
2. 实验表明 RMS Norm 对最终精度无显著损失，已成为 LLaMA/ChatGLM/Qwen 等主流 LLM 标配
3. 在资源受限的部署场景下，训练速度和推理吞吐优势更明显

**Q4（边界）**：LayerNorm 是否在所有场景下都比 BatchNorm 好？哪些场景下 BatchNorm 依然占优？
**回答要点**：

1. CV 任务中 BN 仍是主流——图像固定尺寸、batch 可较大时，BN 计算高效且引入正则化效果
2. LN 在 batch size=1 的大模型微调中避免 BN 退化，但 LN 每个样本都算统计量，计算量比 BN 大
3. GroupNorm 和 InstanceNorm 等变体在风格迁移、小 batch CV 等特定场景提供更多选择

## 参考引用
- 需要理解残差连接(ResidualConnection)的相关知识，参见 [残差连接(ResidualConnection)](./13-残差连接(ResidualConnection).md)
- 需要了解梯度消失与梯度爆炸的相关知识，参见 [梯度消失与梯度爆炸](../深度学习/06-梯度消失与梯度爆炸.md)
- 需要理解自注意力与Transformer的相关知识，参见 [自注意力与Transformer](./06-自注意力与Transformer.md)
