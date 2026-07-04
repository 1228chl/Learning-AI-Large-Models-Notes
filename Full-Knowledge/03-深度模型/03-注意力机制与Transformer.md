---
tags: [深度学习/注意力机制/Transformer]
parent_moc: [[核心依赖链]]
aliases: [Transformer, 注意力机制, Self-Attention, 自注意力]
layer: 层级3-深度模型
prerequisites: [神经网络, RNN]
successors: [BERT, GPT, 预训练模型]
---

# 深度卡片：注意力机制与Transformer

## L1：是什么（定义/公式/结构）

### 注意力机制

**定义**：让模型在处理每个位置时，能够根据当前查询与序列中所有位置的键之间的相关性，计算出一组归一化的注意力权重，然后将这些权重应用于对应位置的值进行加权求和。

**公式**：
$$\text{Attention}(Q, K, V) = \text{softmax}\left(\frac{QK^T}{\sqrt{d_k}}\right)V$$

### Transformer架构

| 组件 | 公式 | 作用 |
|------|------|------|
| 多头注意力 | $\text{MultiHead}(Q,K,V) = \text{Concat}(\text{head}_1,...,\text{head}_h)W^O$ | 多子空间学习 |
| 前馈网络 | $\text{FFN}(x) = \max(0, xW_1 + b_1)W_2 + b_2$ | 非线性变换 |
| 位置编码 | $PE_{(pos,2i)} = \sin(pos/10000^{2i/d})$ | 注入位置信息 |
| 残差连接 | $\text{LayerNorm}(x + \text{Sublayer}(x))$ | 稳定训练 |

### 编码器-解码器结构

```
编码器（N层）：
  输入 → [多头自注意力 → 前馈网络] × N → 编码输出

解码器（N层）：
  输入 → [掩码多头自注意力 → 编码器-解码器注意力 → 前馈网络] × N → 解码输出
```

---

## L2：为什么（设计意图/解决什么问题）

### 为什么需要注意力机制？

**问题：RNN的长期依赖问题**

RNN通过隐藏状态传递信息，长距离依赖需要经过多个时间步，信息容易衰减。注意力机制允许：
1. **直接访问**：任意两个位置可以直接交互
2. **动态权重**：根据相关性动态分配注意力
3. **并行计算**：所有位置对可以并行计算

### 为什么需要Transformer？

**问题：RNN无法并行计算**

RNN必须串行计算（$h_t$依赖$h_{t-1}$），训练速度慢。Transformer：
1. **完全并行**：自注意力可以一次性计算所有位置
2. **长距离依赖**：任意两个位置的距离为O(1)
3. **可扩展性**：可以扩展到数十亿参数

### 为什么需要位置编码？

**问题：自注意力是排列不变的**

自注意力机制本身不包含顺序信息，打乱输入序列顺序不会改变输出（除了对应置换）。位置编码通过将位置信息注入词嵌入，告诉模型每个token在序列中的位置。

---

## L3：怎么用（代码实现/调参/场景）

### PyTorch实现

```python
import torch
import torch.nn as nn

class MultiHeadAttention(nn.Module):
    def __init__(self, d_model, num_heads):
        super().__init__()
        self.num_heads = num_heads
        self.d_k = d_model // num_heads
        
        self.W_q = nn.Linear(d_model, d_model)
        self.W_k = nn.Linear(d_model, d_model)
        self.W_v = nn.Linear(d_model, d_model)
        self.W_o = nn.Linear(d_model, d_model)
    
    def forward(self, Q, K, V, mask=None):
        batch_size = Q.size(0)
        
        # 线性变换并分头
        Q = self.W_q(Q).view(batch_size, -1, self.num_heads, self.d_k).transpose(1, 2)
        K = self.W_k(K).view(batch_size, -1, self.num_heads, self.d_k).transpose(1, 2)
        V = self.W_v(V).view(batch_size, -1, self.num_heads, self.d_k).transpose(1, 2)
        
        # 注意力计算
        scores = torch.matmul(Q, K.transpose(-2, -1)) / (self.d_k ** 0.5)
        if mask is not None:
            scores = scores.masked_fill(mask == 0, -1e9)
        attn = torch.softmax(scores, dim=-1)
        output = torch.matmul(attn, V)
        
        # 合并多头
        output = output.transpose(1, 2).contiguous().view(batch_size, -1, self.d_model)
        output = self.W_o(output)
        
        return output
```

---

## L4：坑在哪（边界条件/失效场景/常见误解）

### 常见误解

| 误解 | 正确理解 | 后果 |
|------|----------|------|
| "注意力权重=特征重要性" | 注意力权重不一定反映特征重要性 | 解释性陷阱 |
| "Transformer不需要位置编码" | 自注意力是排列不变的 | 丢失顺序信息 |

### 边界条件

**1. 序列长度限制**

自注意力复杂度为O(n²)，长序列计算成本高。

**解决方案**：稀疏注意力、线性注意力、分段处理

**2. 训练数据需求**

Transformer参数量大，需要大量数据。

**解决方案**：预训练+微调、数据增强

**3. 计算资源需求**

大模型训练需要大量GPU。

**解决方案**：模型并行、混合精度

---

## 💼 面试追问树

### Q1（基础）：Transformer的核心创新是什么？

**回答要点**：
1. 自注意力：允许序列中任意两个位置直接交互
2. 多头注意力：多个子空间并行学习
3. 位置编码：注入序列顺序信息
4. 残差连接+层归一化：稳定训练

### Q2（深挖）：为什么Transformer需要位置编码？

**回答要点**：
1. 自注意力是排列不变的
2. 位置编码告诉模型每个token的位置
3. 正弦/余弦编码有相对位置表达能力

### Q3（更深）：为什么用正弦/余弦位置编码？

**回答要点**：
1. 每个位置唯一
2. 相对位置可表示为线性函数
3. 可外推到更长序列

### Q4（边界）：Transformer在长文本上有什么问题？

**回答要点**：
1. 计算复杂度O(n²)
2. 内存占用O(n²)
3. 解决方案：稀疏注意力、线性注意力

---

## 🔗 关联知识网络

**上游依赖**：[[神经网络]], [[RNN]], [[注意力机制]]

**下游应用**：
- [[BERT]]：Transformer编码器
- [[GPT]]：Transformer解码器
- [[Vision Transformer]]：图像Transformer
- [[预训练模型]]：BERT、GPT系列

**并列概念**：[[CNN]], [[RNN]]
