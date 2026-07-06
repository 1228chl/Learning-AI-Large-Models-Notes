---
author: "XunZong"
created: "2026-07-06"
tags: ["NLP", "Transformer", "自注意力"]
aliases: ["自注意力", "Self-Attention", "Transformer", "编码器", "解码器"]
---

# 自注意力与 Transformer

## 定义

**自注意力（Self-Attention）** 是 Transformer 的核心：序列中每个位置都**关注所有其他位置**，直接建模所有位置间的依赖关系，不受距离限制。

$$\text{Attention}(Q, K, V) = \text{softmax}\left(\frac{QK^T}{\sqrt{d_k}}\right)V$$

- 在自注意力中：$Q = K = V = XW$（同一序列通过不同线性变换得到）
- $QK^T$：计算每对位置的相关性得分
- $\sqrt{d_k}$：缩放因子，防止内积过大导致 softmax 梯度饱和
- Softmax：归一化为注意力权重
- $V$ 加权求和：得到每个位置的输出

## Transformer 完整架构

```
输出 → Linear → Softmax
         ↑
    Add & Norm
         ↑
    Feed Forward
         ↑
    Add & Norm
         ↑
    Multi-Head Self-Attention
         ↑
  [位置编码 + 输入嵌入]
         ↑
     输入序列
```

```python
import torch.nn as nn

# PyTorch 内置 Transformer
transformer = nn.Transformer(
    d_model=512,                    # 模型维度
    nhead=8,                        # 注意力头数
    num_encoder_layers=6,           # 编码器层数
    num_decoder_layers=6,           # 解码器层数
    dim_feedforward=2048           # FFN 中间维度
)
```

| 组件 | 作用 | 说明 |
|:----:|:----|------|
| **自注意力** | 序列内部所有位置的关系建模 | 解决长距离依赖 |
| **多头注意力** | 多个子空间同时学习不同类型的关系 | $8$ 或 $16$ 个注意力头 |
| **FFN**（前馈网络） | 每个位置的独立非线性变换 | $\text{ReLU}(xW_1 + b_1)W_2 + b_2$ |
| **残差连接** | $x + \text{Sublayer}(x)$ | 解决深层梯度消失 |
| **Layer Norm** | 对每个位置的特征做归一化 | 稳定训练 |
| **位置编码** | 注入序列位置信息 | 弥补注意力无位置概念 |

## 编码器 vs 解码器

| 组件 | 编码器 | 解码器 |
|:----:|:------|:------|
| 输入 | 完整的源序列 | 已生成的目标序列 |
| 注意力 | 自注意力（双向，能看到前后） | **掩码自注意力**（只能看左侧）+ 交叉注意力 |
| 掩码 | 无 | 未来位置的注意力掩码为 $-\infty$ |
| 角色 | 提取输入表示 | 根据输入表示和已生成内容预测下一个词 |

## Transformer 的核心优势

| 对比 | RNN | Transformer |
|:----:|:---:|:-----------:|
| 并行计算 | ❌ 串行 | ✅ **完全并行** |
| 长距离依赖 | ❌ 难 | ✅ 自注意力直接建模 |
| 最大序列长度 | ~100 | ~512（相对位置编码可扩展） |
| 计算复杂度 | $O(n)$ 步 | $O(n^2)$ 每层（自注意力的计算量） |
| 参数量 | 少 | 大（需大数据预训练） |

> Transformer 架构是 NLP 领域的分水岭，几乎所有现代大模型（BERT、GPT、T5、LLaMA）都基于此架构。

> 参见 [[07-多头注意力]]、[[08-位置编码]]、[[09-残差连接与LayerNorm]]、[[05-注意力机制]]
