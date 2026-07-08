---
author: "XunZong"
created: "2026-07-07"
tags: ["NLP", "Transformer", "残差连接"]
aliases: ["残差连接", "Residual Connection", "Skip Connection", "梯度高速公路"]
---

# 残差连接（Residual Connection）

## 定义

残差连接（Residual Connection / Skip Connection）让网络的输入直接绕过子层（Sublayer）加到其输出上，解决深层网络中的**梯度消失**和**退化问题**：

$$ \text{Output} = x + \text{Sublayer}(x) $$

梯度可通过恒等映射路径无损反向传播，形成"梯度高速公路"（Gradient Highway），确保深层网络至少不劣于其浅层子网络。

```python
def residual_block(x, sublayer):
    return x + sublayer(x)   # 梯度可以沿 x 路径直通到输入
```

## 核心公式与分类

### 残差连接的数学形式

| 形式 | 公式 | 说明 |
|:----:|:----:|:------|
| **标准残差** | $y = x + \mathcal{F}(x)$ | $\mathcal{F}$ 为子层函数（如注意力、FFN） |
| **线性短路** | $y = W_r x + \mathcal{F}(x)$ | 维度不匹配时用投影矩阵 $W_r$ 对齐 |
| **Post-LN** | $x \to \text{MHA} \to \text{Add} \to \text{LN}$ | 先残差相加、后归一化（原版 Transformer） |
| **Pre-LN** | $x \to \text{LN} \to \text{MHA} \to \text{Add}$ | 先归一化、后残差相加（BERT, GPT, LLaMA） |

### Pre-LN vs Post-LN

| 对比维度 | Post-LN（原始） | Pre-LN（主流） |
|:--------:|:---------------:|:--------------:|
| **归一化位置** | Add 之后 | Add 之前 |
| **训练稳定性** | 需 warmup，深层易梯度爆炸 | 稳定，无需 warmup |
| **收敛速度** | 较慢 | 较快 |
| **代表模型** | 原版 Transformer (Vaswani 2017) | BERT, GPT, LLaMA |
| **现代采纳度** | 少用 | **事实标准** |

## 直观理解

残差连接相当于为梯度在网络中开辟了一条"高速公路"——即使子层梯度完全消失，信号仍可通过恒等路径无损传播；同时赋予了网络自动选择深度的能力：若某层不需要，权重可退化为零，层退化为恒等映射。

## ML/DL 应用场景

| 应用场景 | 数学形式 | 说明 |
|:--------:|:--------:|:------|
| **ResNet** | $x \to \text{Conv} \to \text{BN} \to \text{ReLU} \to \text{Add}$ | 首次将残差连接引入 CNN，训练 152 层深度网络 |
| **Transformer** | $x \to \text{MHA} \to \text{Add} \to \text{LN} \to \text{FFN} \to \text{Add} \to \text{LN}$ | 每个子层后接残差连接，支撑 12~96 层堆叠 |
| **Pre-LN Transformer** | $x \to \text{LN} \to \text{MHA} \to \text{Add} \to \text{LN} \to \text{FFN} \to \text{Add}$ | 将 LN 移入残差圈内，训练更稳定 |
| **U-Net** | 编码器-解码器间的跳跃连接 | 保留低层空间信息，用于图像分割 |
| **DenseNet** | $x_\ell = H_\ell([x_0, x_1, \dots, x_{\ell-1}])$ | 密集连接：每层与之前所有层相连 |

## 面试追问

**Q1（基础）**：残差连接解决了深层网络中的什么核心问题？数学上它为什么有效？
**回答要点**：解决梯度消失和退化问题；$y = x + \mathcal{F}(x)$ 使梯度 $\partial y / \partial x = 1 + \partial \mathcal{F} / \partial x$ 至少为 1，不会因链式法则连乘而消失；恒等分支保证深层网络至少与浅层性能持平。

**Q2（深挖）**：Pre-LN 和 Post-LN 的根本区别是什么？为什么现代模型普遍选择 Pre-LN？
**回答要点**：Post-LN 在残差相加后做 LayerNorm，输出方差被 LN 缩放后输入下一残差块，深层易梯度爆炸，需要 warmup；Pre-LN 在子层前先做 LN，残差路径上的信号不受缩放影响，训练稳定、收敛快；BERT、GPT、LLaMA 等主流模型均采用 Pre-LN。

**Q3（实战）**：在你的 Transformer 项目中，如果训练出现 loss 震荡或 NaN，你会如何排查残差连接相关的问题？
**回答要点**：检查是否用了 Post-LN（如原版 Transformer），可切换为 Pre-LN 并移除 warmup；检查残差路径上是否输出了超大值（可加 gradient clipping）；在残差连接中加入 dropout（如 `x + dropout(sublayer(x))`）增加正则化。

**Q4（边界）**：残差连接有什么理论上的局限？是否存在不需要残差连接的深层架构？
**回答要点**：残差连接增加了一倍存储（需保留激活值用于反向传播，显存开销大）；现代研究（如 DeepNet、NormFormer）通过改进初始化或归一化实现深层训练而不依赖残差；也出现了"无残差 Transformer"（如 ReZero、T-Fixup）通过特殊初始化替代残差连接。

> 理解前置知识可参见 [自注意力与Transformer](./06-自注意力与Transformer.md)；理解前置知识可参见 [多头注意力](./07-多头注意力.md)；理解前置知识可参见 [位置编码](./08-位置编码.md)；理解前置知识可参见 [Layer Normalization](./14-Layer Normalization.md)