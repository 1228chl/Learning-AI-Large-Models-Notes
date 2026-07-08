---
author: "XunZong"
created: "2026-07-06"
tags: ["NLP", "Transformer", "归一化"]
aliases: ["残差连接与LayerNorm", "Residual and LayerNorm"]
---

# 残差连接与 LayerNorm

> 本文是 **残差连接** 与 **Layer Normalization** 的概览。两份概念的完整阐述已拆分为独立卡片，请点击下方链接查看。

---

## 残差连接（Residual Connection）

让输入直接绕过子层加到输出上，解决深层网络的**梯度消失**和**退化问题**：

$$ \text{Output} = x + \text{Sublayer}(x) $$

**要点**：梯度高速公路、恒等映射、Pre-LN vs Post-LN 两种放置方式。

## Layer Normalization

对**每个样本的每个位置**在特征维度上独立做归一化：

$$ \text{LayerNorm}(x) = \gamma \odot \frac{x - \mu}{\sigma + \epsilon} + \beta $$

**要点**：LayerNorm vs BatchNorm、RMS Norm 简化变体。

---

## 关联卡片

| 概念 | 卡片 | 覆盖内容 |
|:----:|:----:|:---------|
| **残差连接** | [13-残差连接(ResidualConnection)](./13-残差连接(ResidualConnection).md) | 残差连接、梯度高速公路、Pre-LN vs Post-LN、ResNet/DenseNet |
| **Layer Normalization** | [14-Layer Normalization](./14-Layer Normalization.md) | LayerNorm vs BatchNorm、RMS Norm、Transformer/CV 归一化选择 |

---

## 参考引用
- 需要理解残差连接(ResidualConnection)的相关知识，参见 [残差连接(ResidualConnection)](./13-残差连接(ResidualConnection).md)
- 需要理解 自注意力与Transformer的相关知识，参见 [自注意力与Transformer](./06-自注意力与Transformer.md)
- 需要理解Layer Normalization的相关知识，参见 [Layer Normalization](./14-Layer Normalization.md)