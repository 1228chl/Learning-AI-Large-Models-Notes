
# Transformer 超详细笔记

## 第一部分：Transformer 背景介绍

### 1.1 Transformer 的诞生

#### 1.1.1 历史背景与论文

在 Transformer 出现之前，自然语言处理领域的主流序列模型是 **RNN（循环神经网络）** 及其变体 **LSTM **和** GRU**。这些模型虽然能处理变长序列，但存在两大瓶颈：

- **串行计算**：必须逐个时间步计算，无法充分利用 GPU 并行能力。
- **长距离依赖**：随着序列变长，早期信息容易“遗忘”（梯度消失/爆炸）。

**转折点**：2017 年，Google 研究团队发表了一篇里程碑式的论文：

> **《Attention is All You Need》**  
> 论文地址：https://arxiv.org/pdf/1706.03762.pdf

该论文提出了一种**完全摒弃 RNN/CNN 的全新架构**——**Transformer**，仅依靠**自注意力机制**（Self-Attention）和**前馈神经网络**，实现了：

- **真正的并行计算**（训练速度大幅提升）
- **卓越的长距离依赖捕捉能力**（任意两个位置直接交互）
- **可扩展性**（为后续 BERT、GPT 等预训练大模型奠定基础）

---

#### 1.1.2 Transformer 的继承与创新

Transformer 继承了 Seq2Seq 模型的**编码器-解码器架构**、**自回归生成方式**（解码时逐个输出）、**Teacher Forcing 训练策略**等优点，同时用**纯注意力机制**取代了 RNN。

**继承部分**：

- 编码器将输入序列编码为中间表示
- 解码器自回归生成目标序列
- 训练时使用真实标签作为解码器输入

**创新部分**：

- 编码器和解码器内部全部由**自注意力层**和**前馈网络**堆叠而成
- 引入**多头注意力**（Multi-Head Attention）和**位置编码**（Positional Encoding）
- 使用**残差连接**和**层归一化**（LayerNorm）稳定深层网络训练

---

#### 1.1.3 Transformer 引领的革命

Transformer 不仅在机器翻译任务上刷新了 SOTA，更开启了**预训练大模型时代**：

- **2018 年**：Google 发布 **BERT**（《BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding》），横扫 11 项 NLP 任务最佳成绩。论文地址：https://arxiv.org/pdf/1810.04805.pdf
- 随后涌现的 **XLNet、RoBERTa、ALBERT** 等模型虽然在某些任务上超越了 BERT，但**核心架构依然是 Transformer**。
- OpenAI 的 **GPT 系列**（生成式预训练 Transformer）也基于 Transformer 解码器，推动了生成式 AI 的爆发。

---

### 1.2 Transformer 的优势

相比之前统治市场的 **LSTM** 和 **GRU**，Transformer 具有两个显著优势：

| 优势 | LSTM/GRU | Transformer |
| --- | --- | --- |
| **并行训练能力** | 串行，t 步必须等 t-1 步计算完 | **完全并行**（自注意力可一次性计算所有位置对） |
| **长距离语义关联** | 依赖隐藏状态传递，超过 100 步易遗忘 | **直接关联**，序列中任意两个位置的距离为 O(1)操作 |

**为什么 Transformer 能并行？**

LSTM 每个时间步的隐藏状态依赖于上一步，无法并行；而 Transformer 的**自注意力**计算每个位置与其他所有位置的相似度，可以一次性通过矩阵运算完成，无需递归。

**为什么长距离效果好？**  
在 RNN 中，相隔 100 个词的两个词需要经过 100 次传递，信息容易衰减。Transformer 中，自注意力直接计算这两个词的相关性，路径长度为 1（一步点积），因此能轻松捕捉极长距离的依赖。

**实验验证**：在机器翻译 WMT 2014 英-德任务上，Transformer 的 BLEU 分数远超基于 LSTM 的 Seq2Seq 模型，且训练时间仅为后者的几分之一。

---

### 1.3 Transformer 的市场占有

在著名的 **SOTA（State of the Art）**机器翻译榜单上，几乎所有排名靠前的模型都使用 Transformer 架构。SOTA 不是指某个具体模型，而是指**当前最佳/世界纪录级别**的模型。

**工业界风向标**：

- **Google**：搜索、翻译、Bard 等全面采用 Transformer。
- **Facebook (Meta)**：RoBERTa、BlenderBot 等。
- **OpenAI**：GPT-3、GPT-4、DALL·E 等。
- **其他**：几乎所有现代大语言模型（LLM）均基于 Transformer 或它的变体。

**市场空间**：自然语言处理（NLP）是人工智能的核心子域，包含两大核心任务：

- **自然语言理解（NLU）**：情感分析、命名实体识别、问答等。
- **自然语言生成（NLG）**：机器翻译、文本摘要、对话生成等。

Transformer 在这两大任务中都占据主导地位，因此其市场占有率极高，学习 Transformer 成为 AI 从业者的必修课。

---

## 第二部分：认识 Transformer 架构

### 2.1 Transformer 架构总体概览

#### 2.1.1 Transformer 的作用

Transformer 架构基于 **Seq2Seq** 设计，主要完成两大类型任务：

1. **序列到序列的生成任务**：如机器翻译（英语→法语）、文本摘要（长文档→短摘要）、对话生成（问题→回答）。这类任务需要编码器读取源序列，解码器自回归生成目标序列。
2. **构建预训练语言模型**：通过大规模无监督预训练（如 BERT 用掩码语言建模，GPT 用自回归语言建模），然后在下游任务上微调，实现迁移学习。

**典型应用假设**：使用 Transformer 模型处理**从一种语言文本到另一种语言文本**的翻译工作（例如英译中）。

---

#### 2.1.2 总体架构图（四大组成部分）

Transformer 共分为 **4 个部分**：

| 部分           | 功能                       | 具体组件                                                     |
| ------------ | ------------------------ | -------------------------------------------------------- |
| **1. 输入部分**  | 将原始文本转化为模型可处理的张量，并注入位置信息 | 源文本嵌入层 + 位置编码器；目标文本嵌入层 + 位置编码器                           |
| **2. 输出部分**  | 将解码器输出映射为词汇表上的概率分布       | 线性层（Linear） + Softmax 层                                  |
| **3. 编码器部分** | 对源序列进行深度特征提取，生成上下文表示     | N 个编码器层堆叠，每层包含：多头自注意力 + 前馈网络（各有残差+层归一化）                  |
| **4. 解码器部分** | 根据编码器输出和已生成的目标词，逐步生成下一个词 | N 个解码器层堆叠，每层包含：掩码多头自注意力 + 编码器-解码器多头注意力 + 前馈网络（各有残差+层归一化） |

**关键注意点**：

- 编码器与解码器的**层数 N** 通常相同（原论文中 N=6）。
- 编码器生成 **Key（K）和 Value（V）**，供解码器的第二个多头注意力子层使用。
- 解码器的第一个多头自注意力使用**掩码（Masking）**，防止看到未来位置。

---

### 2.2 输入部分详解

#### 2.2.1 文本嵌入层（Token Embedding）

**作用**：将离散的单词/子词（token）映射为稠密的连续向量（词嵌入），维度通常为 `d_model`（原论文中 `d_model=512`）。

**实现方式**：使用可学习的嵌入矩阵 `E`，形状为 `(vocab_size, d_model)`。每个单词的索引 `i` 对应的嵌入向量为 `E[i]`。

**代码示例**（PyTorch）：

```python
import torch
import torch.nn as nn

class TokenEmbedding(nn.Module):
    def __init__(self, vocab_size, d_model):
        super().__init__()
        self.embedding = nn.Embedding(vocab_size, d_model)
        self.d_model = d_model

    def forward(self, x):
        # x: (batch_size, seq_len) 单词索引
        return self.embedding(x) * (self.d_model ** 0.5)  # 缩放因子
```

**为什么乘以 `√d_model`？** 原论文中进行了缩放，目的是让嵌入向量的方差与后续位置编码的方差相匹配，有利于训练稳定。

---

#### 2.2.2 位置编码（Positional Encoding）

**问题**：自注意力机制本身不具备**顺序信息**（即使打乱输入序列，输出结果也会相应打乱，但语义会错乱）。因此需要显式注入单词在序列中的位置。

**解决方案**：在原始词嵌入上叠加**位置编码**，使得每个位置的最终输入向量包含“位置信息”。

**位置编码的公式**（原论文使用的正弦/余弦函数）：

对于序列中第 `pos` 个位置，嵌入维度中的第 `2i`（偶数）和 `2i+1`（奇数）维：

$$
PE_{(pos, 2i)} = \sin\left( \frac{pos}{10000^{2i / d_{\text{model}}}} \right)
$$

$$
PE_{(pos, 2i+1)} = \cos\left( \frac{pos}{10000^{2i / d_{\text{model}}}} \right)
$$

**为什么选择这种形式？**

- 函数值范围在[-1,1]，不会破坏词嵌入的数值稳定性。
- 对于任意固定的偏移量 `k`，`PE_{pos+k}` 可以表示为 `PE_{pos}` 的线性函数，这有助于模型学习相对位置关系。
- 不需要学习参数，且可以处理比训练时更长的序列（外推性）。

**代码实现**：

```python
class PositionalEncoding(nn.Module):
    def __init__(self, d_model, max_len=5000, dropout=0.1):
        super().__init__()
        self.dropout = nn.Dropout(p=dropout)
        # 创建位置编码矩阵 (max_len, d_model)
        pe = torch.zeros(max_len, d_model)
        position = torch.arange(0, max_len, dtype=torch.float).unsqueeze(1)  # (max_len, 1)
        div_term = torch.exp(torch.arange(0, d_model, 2).float() * (-math.log(10000.0) / d_model))
        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term)
        pe = pe.unsqueeze(0)  # (1, max_len, d_model)
        self.register_buffer('pe', pe)

    def forward(self, x):
        # x: (batch, seq_len, d_model)
        x = x + self.pe[:, :x.size(1), :]
        return self.dropout(x)
```

**输入部分总结**：最终输入 = `TokenEmbedding(x) + PositionalEncoding(x)`，形状 `(batch, seq_len, d_model)`。

---

### 2.3 编码器部分（Encoder）

#### 2.3.1 编码器整体结构

编码器由 **N 个相同的编码器层**堆叠而成（原论文 N=6）。每个编码器层包含两个子层：

1. **多头自注意力子层**（Multi-Head Self-Attention）
2. **前馈全连接网络子层**（Feed-Forward Network, FFN）

每个子层都使用了**残差连接**（Add）和**层归一化**（LayerNorm），即：`子层输出 = LayerNorm(x + Sublayer(x))`。

---

#### 2.3.2 子层 1：多头自注意力

**自注意力**（Self-Attention）：Q、K、V 来自同一个输入序列（即编码器上一层的输出）。每个位置关注整个输入序列中的所有位置，捕捉全局依赖。

**多头注意力**：将 Q、K、V 分别线性投影到多个不同的子空间（每个头一个），分别计算注意力，然后将所有头的输出拼接起来，再通过一次线性变换。这允许模型在不同子空间中学习不同类型的特征（例如一个头关注语法，另一个头关注指代）。

**数学公式**：

$$
\text{MultiHead}(Q, K, V) = \text{Concat}(\text{head}_1, ..., \text{head}_h) W^O
$$

其中每个头：

$$
\text{head}_i = \text{Attention}(QW_i^Q, KW_i^K, VW_i^V)
$$

Attention 采用缩放点积：

$$
\text{Attention}(Q, K, V) = \text{softmax}\left( \frac{QK^T}{\sqrt{d_k}} \right) V
$$

**参数**：

- $d_{model}$ ：模型的维度（如 512）
- $h$ ：头的数量（原论文 h=8，因此每个头维度 $d_k = d_{model}/h = 64$ ）

**代码实现**（简易版）：

```python
class MultiHeadAttention(nn.Module):
    def __init__(self, d_model, num_heads, dropout=0.1):
        super().__init__()
        assert d_model % num_heads == 0
        self.d_k = d_model // num_heads
        self.num_heads = num_heads
        self.W_q = nn.Linear(d_model, d_model)
        self.W_k = nn.Linear(d_model, d_model)
        self.W_v = nn.Linear(d_model, d_model)
        self.W_o = nn.Linear(d_model, d_model)
        self.dropout = nn.Dropout(dropout)

    def forward(self, Q, K, V, mask=None):
        batch_size = Q.size(0)
        # 线性变换并拆分为多头 (batch, seq_len, num_heads, d_k) -> (batch, num_heads, seq_len, d_k)
        Q = self.W_q(Q).view(batch_size, -1, self.num_heads, self.d_k).transpose(1,2)
        K = self.W_k(K).view(batch_size, -1, self.num_heads, self.d_k).transpose(1,2)
        V = self.W_v(V).view(batch_size, -1, self.num_heads, self.d_k).transpose(1,2)
        # 计算注意力分数
        scores = torch.matmul(Q, K.transpose(-2, -1)) / (self.d_k ** 0.5)
        if mask is not None:
            scores = scores.masked_fill(mask == 0, -1e9)
        attn = F.softmax(scores, dim=-1)
        attn = self.dropout(attn)
        context = torch.matmul(attn, V)  # (batch, num_heads, seq_len, d_k)
        # 合并多头
        context = context.transpose(1,2).contiguous().view(batch_size, -1, self.num_heads * self.d_k)
        return self.W_o(context)
```

**编码器中的自注意力没有掩码**（即 `mask=None`），因为编码器可以看到整个源序列，无需防止未来信息。

---

#### 2.3.3 子层 2：前馈全连接网络（FFN）

**作用**：对每个位置独立地进行非线性变换，增强模型表达能力。

**结构**：两个线性层，中间用 ReLU 激活（原论文中使用的是 ReLU，但后来 GELU 更常见）。

$$
\text{FFN}(x) = \max(0, xW_1 + b_1) W_2 + b_2
$$

或者写作：

$$
\text{FFN}(x) = \text{ReLU}(xW_1 + b_1)W_2 + b_2
$$

**参数**：通常 $d_{ff}= 4 * d_{model}$ （原论文中 $d_{ff}=2048$ ）。

**代码实现**：

```python
class PositionwiseFeedForward(nn.Module):
    def __init__(self, d_model, d_ff, dropout=0.1):
        super().__init__()
        self.linear1 = nn.Linear(d_model, d_ff)
        self.linear2 = nn.Linear(d_ff, d_model)
        self.dropout = nn.Dropout(dropout)

    def forward(self, x):
        return self.linear2(self.dropout(F.relu(self.linear1(x))))
```

---

#### 2.3.4 残差连接与层归一化

**残差连接**： $x + Sublayer(x)$ ，缓解深层网络的梯度消失问题，使模型更容易训练。

**层归一化（LayerNorm）**：对每个样本的**特征维度**进行归一化（与 BatchNorm 不同，LayerNorm 不依赖 batch 大小）。公式：

$$
\text{LayerNorm}(x) = \gamma \cdot \frac{x - \mu}{\sqrt{\sigma^2 + \epsilon}} + \beta
$$

其中 $\mu$ 和 $\sigma$ 是 $x$ 特征维度上的均值和方差， $\gamma$ 和 $\beta$ 是可学习的参数。

**代码实现**：

```python
class SublayerConnection(nn.Module):
    def __init__(self, d_model, dropout=0.1):
        super().__init__()
        self.norm = nn.LayerNorm(d_model)
        self.dropout = nn.Dropout(dropout)

    def forward(self, x, sublayer):
        # 残差连接：先归一化，再经过子层，再dropout，最后加回x
        return x + self.dropout(sublayer(self.norm(x)))
```

---

#### 2.3.5 单个编码器层完整代码

```python
class EncoderLayer(nn.Module):
    def __init__(self, d_model, num_heads, d_ff, dropout=0.1):
        super().__init__()
        self.self_attn = MultiHeadAttention(d_model, num_heads, dropout)
        self.feed_forward = PositionwiseFeedForward(d_model, d_ff, dropout)
        self.sublayer1 = SublayerConnection(d_model, dropout)
        self.sublayer2 = SublayerConnection(d_model, dropout)

    def forward(self, x, mask=None):
        x = self.sublayer1(x, lambda x: self.self_attn(x, x, x, mask))
        x = self.sublayer2(x, self.feed_forward)
        return x
```

---

### 2.4 解码器部分（Decoder）

#### 2.4.1 解码器整体结构

解码器也由 **N 个相同的解码器层**堆叠而成。每个解码器层包含**三个子层**：

1. **掩码多头自注意力**（Masked Multi-Head Self-Attention）：用于处理已生成的目标序列。必须使用掩码防止当前位置看到未来位置（因为解码是自回归的，推理时不能提前知道后面的词）。
2. **编码器-解码器多头注意力**（Cross-Attention）：Q 来自解码器上一子层的输出，K 和 V 来自编码器的最终输出。这是解码器获取源序列信息的主要途径。
3. **前馈全连接网络**（FFN）：同编码器。

每个子层同样使用**残差连接 + 层归一化**。

---

#### 2.4.2 子层 1：掩码多头自注意力

**与编码器自注意力的区别**：需要加入一个**上三角掩码**，使得在计算位置 `i` 的注意力时，不允许访问位置 `j>i`。

**掩码矩阵**形状为 `(1, 1, seq_len, seq_len)`，值为 0（掩码）和 1（不掩码）。通常将掩码位置设置为 `-1e9`，经过 softmax 后变为 0。

**代码示例**：

```python
def generate_causal_mask(seq_len):
    # 创建上三角矩阵（不含对角线）? 通常掩码未来位置，包括对角线？
    # 注意：在自回归中，位置i可以看见自身，但不能看见i+1及以后。
    mask = torch.triu(torch.ones(seq_len, seq_len), diagonal=1).bool()
    # mask中True的位置需要被掩码（设为-inf）
    return mask  # shape (seq_len, seq_len)
```

在解码器前向传播时，将 `mask` 传递给多头注意力子层。

---

#### 2.4.3 子层 2：编码器-解码器多头注意力（交叉注意力）

**Q**：来自解码器**上一子层**（即掩码自注意力）的输出。  
**K、V**：来自**编码器最后一层**的输出（所有解码器层共享同一份编码器输出）。  

**作用**：让解码器每个位置都能从源序列中检索相关信息（类似之前 Seq2Seq+注意力机制中的动态上下文向量）。  

**注意**：此子层**不需要掩码**（因为 K 和 V 来自源序列，没有未来信息的概念），但若源序列有填充（padding），需传入 padding 掩码。

---

#### 2.4.4 单个解码器层完整代码

```python
class DecoderLayer(nn.Module):
    def __init__(self, d_model, num_heads, d_ff, dropout=0.1):
        super().__init__()
        self.self_attn = MultiHeadAttention(d_model, num_heads, dropout)
        self.cross_attn = MultiHeadAttention(d_model, num_heads, dropout)
        self.feed_forward = PositionwiseFeedForward(d_model, d_ff, dropout)
        self.sublayer1 = SublayerConnection(d_model, dropout)
        self.sublayer2 = SublayerConnection(d_model, dropout)
        self.sublayer3 = SublayerConnection(d_model, dropout)

    def forward(self, x, encoder_output, src_mask=None, tgt_mask=None):
        # 掩码自注意力
        x = self.sublayer1(x, lambda x: self.self_attn(x, x, x, tgt_mask))
        # 编码器-解码器交叉注意力
        x = self.sublayer2(x, lambda x: self.cross_attn(x, encoder_output, encoder_output, src_mask))
        # 前馈网络
        x = self.sublayer3(x, self.feed_forward)
        return x
```

---

### 2.5 输出部分详解

#### 2.5.1 线性层（Linear）

**作用**：将解码器最后一层的输出（形状 `(batch, seq_len, d_model)`）映射到**词汇表大小** `vocab_size` 上，即每个位置得到一个 logits 向量，表示该位置每个单词的得分。

**实现**：`nn.Linear(d_model, vocab_size)`

---

#### 2.5.2 Softmax 层

**作用**：将 logits 转换为概率分布（和为 1）。通常使用 `log_softmax` 以方便计算交叉熵损失。

**公式**：

$$
P(y_t | \text{context}) = \frac{\exp(\text{linear}_t)}{\sum_{j=1}^{|V|} \exp(\text{linear}_j)}
$$

在训练时，将 Softmax 输出与真实标签计算交叉熵损失；在推理时，取概率最大的单词索引（或使用束搜索）。

**代码示例**：

```python
class Generator(nn.Module):
    def __init__(self, d_model, vocab_size):
        super().__init__()
        self.proj = nn.Linear(d_model, vocab_size)

    def forward(self, x):
        # x: (batch, seq_len, d_model)
        logits = self.proj(x)  # (batch, seq_len, vocab_size)
        return F.log_softmax(logits, dim=-1)
```

---

### 2.6 关键注意点总结

需要强调的两个注意点：

1. **编码器层与层之间是如何连接的？**  
   编码器层之间是**顺序堆叠**的：第 1 层的输出作为第 2 层的输入，依此类推。每层内部使用残差连接，不会跨层跳跃（除了残差连接）。第 N 层的输出作为编码器的最终输出，同时作为解码器交叉注意力的 K 和 V。

2. **解码器层与层之间是如何连接的？**  
   类似编码器，顺序堆叠。但每个解码器层都会**重复使用编码器的最终输出**（K 和 V）。另外，解码器内部的第一个子层（掩码自注意力）在不同层之间没有特殊连接，只是传递隐藏状态。

**额外注意点**：

- 编码器和解码器的**嵌入层权重可以共享**（尤其当源语言和目标语言词汇表相同时，或使用子词分词时）。
- 位置编码只加在**输入部分**的嵌入上，不在每层重复添加。
- 层归一化的位置：在原论文中，层归一化在**残差之前**（即 `LayerNorm(x + Sublayer(x))`）还是之后？实际代码实现有变体。主流实现（如“Attention is All You Need”官方 TensorFlow 代码）是**先层归一化再子层**（Pre-LN）或**先子层再加层归一化**（Post-LN）。现代实现通常采用 Pre-LN，训练更稳定。

---

### 2.7 完整 Transformer 模型代码骨架

```python
class Transformer(nn.Module):
    def __init__(self, src_vocab_size, tgt_vocab_size, d_model=512, num_heads=8, 
                 num_encoder_layers=6, num_decoder_layers=6, d_ff=2048, dropout=0.1, max_len=5000):
        super().__init__()
        self.encoder_embed = TokenEmbedding(src_vocab_size, d_model)
        self.decoder_embed = TokenEmbedding(tgt_vocab_size, d_model)
        self.pos_encoding = PositionalEncoding(d_model, max_len, dropout)

        self.encoder = nn.ModuleList([EncoderLayer(d_model, num_heads, d_ff, dropout) for _ in range(num_encoder_layers)])
        self.decoder = nn.ModuleList([DecoderLayer(d_model, num_heads, d_ff, dropout) for _ in range(num_decoder_layers)])

        self.generator = Generator(d_model, tgt_vocab_size)
        self.d_model = d_model

    def encode(self, src, src_mask=None):
        src = self.encoder_embed(src)
        src = self.pos_encoding(src)
        for layer in self.encoder:
            src = layer(src, src_mask)
        return src

    def decode(self, tgt, encoder_output, src_mask=None, tgt_mask=None):
        tgt = self.decoder_embed(tgt)
        tgt = self.pos_encoding(tgt)
        for layer in self.decoder:
            tgt = layer(tgt, encoder_output, src_mask, tgt_mask)
        return tgt

    def forward(self, src, tgt, src_mask=None, tgt_mask=None):
        encoder_output = self.encode(src, src_mask)
        decoder_output = self.decode(tgt, encoder_output, src_mask, tgt_mask)
        return self.generator(decoder_output)
```

---

### 2.8 自测题

1. **Transformer 模型中的“输入部分”主要负责什么任务？**  
   A) 将原始文本转化为词嵌入和位置编码  
   B) 通过自注意力机制处理输入序列  
   C) 生成最终的输出序列  
   D) 编码器部分编码信息  
   **答案：A**

2. **在 Transformer 模型中，哪一个部分负责将编码后的信息传递给解码器？**  
   A) 输入部分  
   B) 输出部分  
   C) 编码器部分  
   D) 位置编码  
   **答案：C**（编码器生成 K 和 V 供解码器交叉注意力使用）

3. **解码器部分在处理输出序列时，是如何利用自注意力机制的？**  
   A) 通过对目标序列的不同位置赋予不同权重  
   B) 通过对输入序列的不同位置赋予不同权重  
   C) 解码器部分不使用自注意力机制  
   D) 仅使用前馈网络  
   **答案：A**

4. **编码器部分中，每个编码器层包含哪两个子层？**  
   **答案**：多头自注意力子层和前馈全连接网络子层，每个子层后都有残差连接和层归一化。

5. **解码器部分中，第二个多头注意力子层的 Q、K、V 分别来自哪里？**  
   **答案**：Q 来自解码器上一子层（掩码自注意力）的输出，K 和 V 来自编码器的最终输出。

---

## 第三部分：Transformer 总结与进阶

### 3.1 Transformer 完整知识速查表

#### 3.1.1 架构组件速查表

| 组件 | 子组件 | 输入 | 输出 | 作用 |
| --- | --- | --- | --- | --- |
| **输入部分** | Token Embedding | 单词索引 (batch, seq_len) | (batch, seq_len, d_model) | 将离散 token 映射为连续向量 |
| | Positional Encoding | 同上 | 同上 | 注入位置信息 |
| **编码器** (×N) | 多头自注意力 | (batch, seq_len, d_model) | 相同 shape | 捕捉序列内部全局依赖 |
| | 前馈网络 | 相同 | 相同 | 非线性变换，增强表达力 |
| | 残差+层归一化 | 子层输入+输出 | 相同 | 稳定训练，缓解梯度消失 |
| **解码器** (×N) | 掩码多头自注意力 | (batch, tgt_len, d_model) | 相同 | 防止看到未来位置的自注意力 |
| | 交叉注意力 | Q:解码器, K,V:编码器输出 | 相同 | 从源序列检索信息 |
| | 前馈网络 | 相同 | 相同 | 同编码器 |
| | 残差+层归一化 | 子层输入+输出 | 相同 | 同编码器 |
| **输出部分** | Linear | (batch, tgt_len, d_model) | (batch, tgt_len, vocab_size) | 映射到词汇表 |
| | Softmax | 同上 | 概率分布 | 生成预测概率 |

---

#### 3.1.2 超参数典型值（原论文）

| 参数                   | 值                                                                         | 说明                                     |
| -------------------- | ------------------------------------------------------------------------- | -------------------------------------- |
| `d_model`            | 512                                                                       | 嵌入向量/所有子层输出维度                          |
| `num_heads`          | 8                                                                         | 多头注意力头数，每个头维度 = d_model/num_heads = 64 |
| `num_encoder_layers` | 6                                                                         | 编码器堆叠层数                                |
| `num_decoder_layers` | 6                                                                         | 解码器堆叠层数                                |
| `d_ff`               | 2048                                                                      | 前馈网络中间层维度                              |
| `dropout`            | 0.1                                                                       | 各子层 dropout 比率                         |
| `max_len`            | 5000                                                                      | 最大序列长度（位置编码范围）                         |
| `batch_size`         | 约 4096 tokens                                                             | 取决于任务                                  |
| 优化器                  | Adam (β1=0.9, β2=0.98, ε=1e-9)                                            | 带 warmup 的学习率调度                        |
| 学习率                  | `(d_model)^(-0.5) * min(step_num^(-0.5), step_num * warmup_steps^(-1.5))` | warmup_steps=4000                      |

---

#### 3.1.3 核心公式总结

**缩放点积注意力**：

$$
\text{Attention}(Q, K, V) = \text{softmax}\left( \frac{QK^T}{\sqrt{d_k}} \right) V
$$

**多头注意力**：

$$
\text{MultiHead}(Q, K, V) = \text{Concat}(\text{head}_1, ..., \text{head}_h) W^O
$$

$$
\text{head}_i = \text{Attention}(QW_i^Q, KW_i^K, VW_i^V)
$$

**位置编码**：

$$
PE_{(pos, 2i)} = \sin\left( \frac{pos}{10000^{2i/d_{\text{model}}}} \right)
$$

$$
PE_{(pos, 2i+1)} = \cos\left( \frac{pos}{10000^{2i/d_{\text{model}}}} \right)
$$

**前馈网络**：

$$
\text{FFN}(x) = \max(0, xW_1 + b_1) W_2 + b_2
$$

**层归一化**：

$$
\text{LayerNorm}(x) = \gamma \cdot \frac{x - \mu}{\sqrt{\sigma^2 + \epsilon}} + \beta
$$

---

### 3.2 Transformer 常见问题与解决方案（面试高频）

#### Q1：Transformer 为什么比 RNN 效果好？

**答案要点**：

1. **并行计算**：自注意力所有位置对之间计算可并行，而 RNN 必须串行。
2. **长距离依赖**：任意两个位置交互路径长度为 1（一次点积），RNN 需 O(L)步传递。
3. **梯度稳定**：没有 RNN 的梯度消失/爆炸问题（虽然也有多层但通过残差和层归一化缓解）。
4. **表达能力**：多头注意力可以关注多种特征子空间。

---

#### Q2：为什么需要多头注意力？而不是单头加宽？

**答案**：

- 单头注意力可能只关注一种模式（如语法位置），而多头可以将特征投影到多个子空间，每个头学习不同的关系（如一个头关注主语-谓语，另一个头关注指代）。实验表明多头比单头同等参数下效果更好。
- 多个头的输出拼接后线性变换，相当于模型通过不同“视角”看同一序列，类似 CNN 中的多通道。

---

#### Q3：为什么要使用缩放因子 $\frac{1}{\sqrt{d_{k}}}$ ？

**答案**：

- 当 $d_k$ 较大时，点积的数值会很大，导致 Softmax 输出梯度极小（饱和区），模型难以训练。
- 除以 $\sqrt{d_k}$ 可将点积的方差控制在 1 左右，保持梯度稳定。数学上，若 Q 和 K 元素独立均值 0 方差 1，则点积的方差为 $d_k$ ，除以后方差变为 1。

---

#### Q4：位置编码为什么用正弦余弦而不是可学习嵌入？

**答案**：

- 正弦余弦形式**无需额外参数**，且可以处理比训练时更长的序列（外推性）。
- 由于三角函数的线性性质，模型可以轻松学习相对位置：`PE(pos+k)` 可表示为 `PE(pos)` 的线性函数。
- 当然，实践中可学习位置编码也可以（如 BERT 使用可学习），二者效果相近。但原始 Transformer 选择了固定编码以减少参数。

---

#### Q5：解码器的第一个自注意力层为什么需要掩码？

**答案**：解码器是自回归生成，在预测第 $t$ 个词时，不能看到第 $t+1$ 个词及之后的真实标签（训练时）或已生成的（推理时）。掩码确保位置 $i$ 只能关注到位置 $j≤i$ ，否则模型会“作弊”直接复制未来词，无法学习正确的时序依赖。

---

#### Q6：训练时 Teacher Forcing 是什么？推理时如何使用？

**答案**：

- **训练时**：解码器输入使用真实的目标序列（整体输入），但在掩码自注意力中通过掩码防止看到未来位置。这称为 Teacher Forcing，可加速收敛。
- **推理时**：没有真实目标序列，只能逐个生成：输入起始符 `<sos>`，预测第一个词；将第一个词作为下一时刻输入，预测第二个词；重复直到生成 `<eos>` 或达到最大长度。可使用**束搜索**（beam search）提升生成质量。

---

#### Q7：Transformer 的参数量如何计算？以原论文为例。

**答案**（粗略计算）：

- 嵌入层：`vocab_size * d_model`（源+目标两个嵌入，若共享则一份）
- 多头注意力：每个头有 3 个权重矩阵 `(d_model, d_k)` 和输出矩阵 `(d_model, d_model)`，总参数量约 `4 * d_model^2`（忽略偏置）。
- 前馈网络：两个线性层，参数量 `d_model * d_ff + d_ff * d_model = 2 * d_model * d_ff`。
- 层归一化：`2 * d_model`（γ和β）。
- 总参数：`(num_encoder_layers + num_decoder_layers) * (4d_model^2 + 2d_model*d_ff + 若干小项)` + 嵌入层。

以 `d_model=512, d_ff=2048, layers=12`（6+6）为例，参数量约 **65M**（不含嵌入）。

---

#### Q8：Transformer 如何处理填充（padding）？

**答案**：在输入序列中，较短的句子通常用 `<pad>` 填充至相同长度。在注意力计算时，需要**填充掩码**（padding mask）将填充位置置为 `-inf`，使得 Softmax 后权重为 0，避免模型关注无意义的填充符。填充掩码需要传入所有注意力层（自注意力和交叉注意力）。

---

#### Q9：Transformer 相对于 Seq2Seq+Attention 的改进？

| 改进点 | Seq2Seq+Attention | Transformer |
| --- | --- | --- |
| 编码器结构 | RNN/LSTM，串行 | 纯自注意力+FFN，并行 |
| 解码器结构 | RNN，串行 | 掩码自注意力+交叉注意力+FFN，并行 |
| 长距离依赖 | 通过注意力弥补但仍受 RNN 瓶颈 | 直接交互，无瓶颈 |
| 训练速度 | 较慢 | 快（可完全并行） |
| 预训练潜力 | 较小 | 极大（GPT/BERT 等） |

---

#### Q10：Transformer 有哪些变体和改进？

- **BERT**：仅使用编码器，双向自注意力，用于 NLU 任务。
- **GPT**：仅使用解码器（掩码自注意力），自回归生成，用于 NLG 任务。
- **T5**：编码器-解码器完整结构，统一框架处理所有 NLP 任务。
- **XLNet**：使用排列语言建模，融合双向与自回归。
- **Longformer**：稀疏注意力，处理长文档（最多 4096+ tokens）。
- **Reformer**：使用局部敏感哈希（LSH）和可逆层，降低内存。
- **Linformer**：线性复杂度注意力（O(N)代替 O(N²)）。

---

### 3.3 Transformer 评估方法

针对不同任务，评估指标不同：

| 任务 | 评估指标 | 说明 |
| --- | --- | --- |
| 机器翻译 | BLEU | 基于 n-gram 精确率，越高越好 |
| 文本摘要 | ROUGE | 基于召回率的 n-gram 重叠 |
| 语言模型 | Perplexity（困惑度） | 越低越好，衡量预测分布与真实分布的差异 |
| 分类任务（如情感分析） | Accuracy / F1 | 准确率或精确率/召回率调和平均 |
| 问答任务 | Exact Match (EM) / F1 | 完全匹配或部分匹配 |

**训练监控指标**：

- 训练损失（交叉熵）下降情况。
- 验证集上的 BLEU/ROUGE/准确率。
- 注意力权重可视化（检查对齐是否合理）。

---

### 3.4 Transformer 的优缺点总结

#### 优点

1. **并行计算**：训练速度快，适合大规模数据。
2. **长距离依赖**：完美捕捉全局依赖，无遗忘问题。
3. **可解释性**：注意力权重可可视化，分析模型关注点。
4. **迁移学习友好**：预训练后微调，适用于各种下游任务。
5. **扩展性强**：可堆叠数十上百层（如 GPT-3 96 层）。

#### 缺点

1. **计算复杂度 O(N²)**：序列长度 N 很大时（如文档>1 万词），注意力的计算量和内存需求巨大。
2. **位置编码相对粗糙**：正弦位置编码对超长序列外推能力有限，且无法学习绝对位置。
3. **对硬件要求高**：大模型需要多卡分布式训练（如 GPT-3 需数千块 GPU）。
4. **缺乏归纳偏置**：相比 CNN，Transformer 需要更多数据才能学到局部特征（但可通过预训练弥补）。

**解决方案**：

- 长序列问题：使用稀疏注意力、局部窗口、LSH 等变体。
- 位置编码改进：可学习位置编码、相对位置编码（如 Transformer-XL）、旋转位置编码（RoPE）。

---

### 3.5 拓展阅读与资源

#### 3.5.1 必读论文

1. **《Attention is All You Need》** (Vaswani et al., 2017)  
   [https://arxiv.org/abs/1706.03762](https://arxiv.org/abs/1706.03762)  
   原始 Transformer 论文，必读。

2. **《BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding》** (Devlin et al., 2018)  
   [https://arxiv.org/abs/1810.04805](https://arxiv.org/abs/1810.04805)  
   基于编码器的预训练模型。

3. **《Language Models are Unsupervised Multitask Learners》** (Radford et al., 2019)  
   GPT-2 论文，展示生成式预训练的潜力。

4. **《An Image is Worth 16x16 Words: Transformers for Image Recognition at Scale》** (Dosovitskiy et al., 2020)  
   ViT，将 Transformer 应用于图像分类。

---

#### 3.5.2 优质博客与教程

- **The Annotated Transformer** (Harvard NLP)  
  逐行代码实现，极佳的学习材料。  
  [http://nlp.seas.harvard.edu/2018/04/03/attention.html](http://nlp.seas.harvard.edu/2018/04/03/attention.html)

- **Illustrated Transformer** (Jay Alammar)  
  可视化非常清晰，适合初学者。  
  [http://jalammar.github.io/illustrated-transformer/](http://jalammar.github.io/illustrated-transformer/)

- **Hugging Face Transformers 文档**  
  最流行的 Transformer 库，含大量预训练模型和示例。  
  [https://huggingface.co/docs/transformers](https://huggingface.co/docs/transformers)

---

#### 3.5.3 代码实践建议

1. **从零实现 Transformer**（按上述代码骨架），在小型机器翻译数据集（如 Multi30k）上训练，体验全流程。
2. **使用 Hugging Face 库**快速加载预训练模型（BERT、GPT-2），完成下游任务微调。
3. **可视化注意力权重**：用 `bertviz` 库展示 BERT/Transformer 的注意力头。
4. **尝试变体**：修改头数、层数，观察性能变化；实现稀疏注意力。

---

### 3.6 最终综合自测题（面试/考试）

1. **Transformer 的核心创新是什么？**  
   答：完全摒弃 RNN/CNN，仅使用自注意力机制，实现并行计算和长距离依赖捕捉。

2. **描述 Transformer 编码器的一个层包含哪些组件？顺序如何？**  
   答：输入 → 多头自注意力 → 残差+层归一化 → 前馈网络 → 残差+层归一化 → 输出。

3. **为什么解码器的第一个自注意力需要掩码？掩码矩阵是什么形状？**  
   答：防止看到未来位置，保证自回归性质。掩码形状为 `(1, 1, tgt_len, tgt_len)`，上三角为-inf，下三角+对角线为 0。

4. **训练时，解码器的输入是什么？推理时呢？**  
   答：训练时输入为真实目标序列（整体输入），推理时输入为已生成的序列（动态增长）。

5. **多头注意力中，如果 `d_model=512`，`num_heads=8`，那么每个头的维度是多少？**  
   答：64。

6. **什么情况下 Transformer 的复杂度会成为瓶颈？如何改进？**  
   答：当序列长度 N 很大（如>10k），O(N²)的计算和内存不可接受。改进方法：稀疏注意力、局部窗口、线性注意力等。

7. **层归一化与批归一化的区别？为什么 Transformer 使用 LayerNorm？**  
   答：LayerNorm 在特征维度上归一化，BatchNorm 在 batch 维度上。NLP 中序列长度可变，LayerNorm 不受 batch 和长度影响，更适合 RNN/Transformer。

8. **解释 Transformer 中的“残差连接”和“层归一化”如何协同工作？**  
   答：残差连接 `x + Sublayer(x)` 让梯度可直接流回浅层；层归一化稳定了子层输出的分布。原论文采用 Post-LN（先子层后加然后再 LN），现代实现常用 Pre-LN（先 LN 再子层再加回 x），训练更稳定。

---
