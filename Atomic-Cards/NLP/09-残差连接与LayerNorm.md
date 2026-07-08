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

## ML/DL 应用场景

| 应用场景 | 残差连接角色 | LayerNorm 角色 |
|:--------:|:------------|:--------------|
| **Transformer** | 每个子层（Self-Attention、FFN）后添加残差连接，使深层梯度顺畅回流 | 每个子层输出后做 LayerNorm，稳定训练过程，Pre-LN 或 Post-LN 两种放置方式 |
| **ResNet** | 跨层恒等映射，解决 50+/101/152 层网络的退化问题 | 使用 BatchNorm 而非 LayerNorm（CV 任务中 BN 更有效） |
| **BERT** | 同 Transformer，Post-LN 架构（早期）或 Pre-LN 架构（更稳定） | LayerNorm 放在子层之前（Pre-LN）避免梯度爆炸，现代 LLM 默认 Pre-LN |
| **GPT / LLaMA** | Pre-LN 残差连接，每层输出直接与输入相加 | Pre-LayerNorm，每个子层输入先归一化再计算 |

## 面试追问

**Q1（基础）**：残差连接为什么能解决深层网络的梯度消失问题？
**回答要点**：

1. 残差连接通过恒等映射将输入直接加到输出，梯度反向传播时可以直接从深层流向浅层而不经过权重矩阵相乘，形成"梯度高速公路"
2. 避免了链式法则中梯度逐层衰减的问题，使深层网络能够有效训练
3. 即使子层权重随机初始化导致梯度消失，恒等分支始终保持梯度畅通

**Q2（深挖）**：Pre-LN 和 Post-LN 的区别是什么？为什么现代大模型（GPT、LLaMA）倾向于使用 Pre-LN？
**回答要点**：

1. Post-LN 将 LayerNorm 放在残差连接之后（子层输出 → LN → 残差相加），Pre-LN 将 LN 放在子层之前（输入 → LN → 子层 → 残差相加）
2. Post-LN 在训练初期梯度不稳定，容易产生梯度爆炸，需要 warmup 来稳定训练
3. Pre-LN 的梯度流更稳定，训练更加平滑，无需 warmup 即可训练深层网络，因此成为现代 LLM 的标准做法

**Q3（深挖）**：为什么 NLP 任务中使用 LayerNorm 而不是 BatchNorm？
**回答要点**：

1. NLP 中输入序列长度可变，BatchNorm 在 batch 维度统计均值和方差，不同样本填充到相同长度导致统计量包含大量填充值噪声
2. LayerNorm 在特征维度独立归一化，与 batch size 和序列长度无关，对可变长序列天然友好
3. CV 任务中特征图大小通常固定（如 224×224），图像数据的统计特性更适合在 batch 维度做归一化

**Q4（实战）**：在 Transformer 中如果去掉残差连接或 LayerNorm，训练会发生什么？
**回答要点**：

1. 去掉残差连接：深层梯度无法回流，12+ 层 Transformer 几乎无法收敛，梯度消失导致浅层权重几乎不更新
2. 去掉 LayerNorm：参数分布偏移累积，激活值不断增大，训练过程发散导致 NaN
3. 两者同时存在才能保证深度 Transformer 的稳定训练，残差保证梯度流通，LayerNorm 保证数值稳定

## 参考引用
- 需要理解残差连接的相关知识，参见 [残差连接(ResidualConnection)](./13-残差连接(ResidualConnection).md)
- 需要理解自注意力与Transformer的相关知识，参见 [自注意力与Transformer](./06-自注意力与Transformer.md)
- 需要理解Layer Normalization的相关知识，参见 [Layer Normalization](./14-Layer Normalization.md)
