**标签：** #DL

---

# 循环神经网络（RNN）超详细学习笔记

本笔记综合了循环神经网络（RNN）的基础概念、自然语言处理中的词嵌入（Embedding）、RNN 层的工作原理以及 PyTorch 实现，内容涵盖数学公式、代码示例和实际应用场景，力求系统全面。

---

## 第一部分：RNN 介绍与序列数据

### 1. 什么是循环神经网络（RNN）

循环神经网络（Recurrent Neural Network，RNN）是一种**专门处理序列数据**的神经网络。与传统的前馈神经网络（如全连接网络、卷积网络）不同，RNN 具有**循环结构**，能够记住前面时间步的信息，并将历史信息传递到当前时间步，从而适用于具有时序依赖或顺序依赖的任务。

**核心特点**：

- **循环连接**：隐藏层的输出不仅传递到下一层，还会反馈给自身，形成循环。
- **记忆能力**：每个时间步的隐藏状态都包含了之前所有时间步的信息。
- **参数共享**：每个时间步的权重矩阵是共享的，减少了参数量。

---

### 2. 序列数据的概念

**序列数据**是指按一定顺序排列的数据，后面的数据与前面的数据存在依赖关系。常见的序列数据包括：

- **时间序列**：如股票价格、气温变化、传感器读数。
- **文本序列**：如句子中的单词序列、字符序列。
- **语音信号**：音频帧序列。

例如，在句子“我爱你”中，“爱”依赖于“我”，“你”依赖于“爱”，顺序颠倒会改变语义。

---

### 3. RNN 的典型应用场景

| 应用领域 | 说明 |
|----------|------|
| **自然语言处理（NLP）** | 文本生成、语言建模、机器翻译、情感分析、命名实体识别 |
| **时间序列预测** | 股市预测、气象预测、电力负荷预测、传感器数据分析 |
| **语音识别** | 将语音信号转换为文本序列 |
| **音乐生成** | 学习音乐的时序模式，生成新的旋律 |
| **视频分析** | 视频帧序列的动作识别、事件检测 |

---

### 4. RNN 的总体架构

一个完整的 RNN 模型通常由三部分构成：

1. **词嵌入层（Embedding Layer）**：将离散的词语（或字符）转换为连续的低维向量（词向量）。
2. **RNN 层（循环层）**：处理序列数据，逐个时间步输入词向量，更新隐藏状态，输出每个时间步的隐藏向量。
3. **全连接层（输出层）**：将 RNN 层的输出（隐藏状态）映射到目标空间，例如预测下一个词的概率分布。

---

## 第二部分：自然语言处理（NLP）与词嵌入层详解

### 1. 自然语言处理概述

自然语言处理（Nature Language Processing，NLP）研究的主要是通过计算机算法来理解自然语言。NLP 处理的数据主要是人类的语言（如汉语、英语、法语等），这类数据不像结构化数据或图像数据那样可以直接数值化。

**NLP 的目标**：让机器能够“听懂”和“读懂”自然语言，并进行有效的交流和分析。

**NLP 涵盖的技术**：语法分析、语义理解、情感分析、机器翻译、文本生成、问答系统等。

在 RNN 中，处理自然语言的第一步是将文本转换为数值形式，而**词嵌入层（Word Embedding Layer）** 正是完成这一转换的关键组件。

---

### 2. 词嵌入层的作用

词嵌入层的主要目的是将每个词（token）映射为一个**固定长度的连续向量**（称为词向量），使得神经网络能够理解和处理这些词汇的语义信息。

**为什么需要词嵌入？**

传统的文本表示方法（如 one-hot 编码）存在以下问题：

- **高维稀疏**：词汇表大小 V，每个词用 V 维向量表示，只有一个位置为 1，其余为 0，效率极低。
- **无法反映语义相似性**：one-hot 向量之间相互正交，无法表达“猫”和“狗”在语义上的接近。
- **缺乏泛化能力**：无法捕捉词语之间的隐含关系。

词嵌入通过**低维稠密向量**表示单词，能够捕捉词与词之间的语义关系。例如，通过训练得到的词向量空间中，“国王”与“王后”的向量差往往接近“男人”与“女人”的向量差。

**词嵌入层在 RNN 中的作用**：

| 作用 | 说明 |
|------|------|
| **输入表示** | 将离散的单词索引转换为连续的向量，作为 RNN 的输入 |
| **降低维度** | 将高维稀疏的 one-hot 表示转化为低维稠密向量，减少计算量 |
| **捕捉语义相似性** | 通过训练或预训练，使语义相似的词在向量空间中距离更近 |

---

### 3. 词嵌入层的工作原理

#### 3.1 词向量矩阵

词嵌入层内部维护一个**词向量矩阵（Embedding Matrix）**，形状为 `(vocab_size, embedding_dim)`：

- `vocab_size`：词汇表的大小（词的总数）
- `embedding_dim`：每个词向量的维度（通常为 50、100、256、300、512 等）

每个词在词汇表中都有一个唯一的索引（从 0 到 vocab_size-1）。当输入一个词的索引时，词嵌入层会**查找矩阵中对应行的向量**，作为该词的词向量输出。

---

#### 3.2 工作流程

文本 → 分词 → 词序列 → 索引序列 → Embedding 查表 → 词向量序列 → 输入 RNN

**示例**：

假设词汇表有 10000 个词，每个词用 128 维向量表示。词向量矩阵形状为 `(10000, 128)`。对于句子“我爱你”，分词后得到 `[“我”，“爱”，“你”]`，查表得到三个 128 维向量，形成一个形状为 `(3, 128)` 的张量，送入 RNN。

---

#### 3.3 初始化方式

- **随机初始化**：词向量随机初始化，随着模型训练一起更新。
- **预训练词向量**：加载在大规模语料上预训练好的向量（如 Word2Vec、GloVe、FastText），然后微调或固定。

---

### 4. PyTorch 中的词嵌入层（`nn.Embedding`）

#### 4.1 API 说明

```python
torch.nn.Embedding(num_embeddings, embedding_dim, padding_idx=None, 
                   max_norm=None, norm_type=2.0, scale_grad_by_freq=False, sparse=False)
```

**主要参数**：

| 参数 | 含义 |
|------|------|
| `num_embeddings` | 词汇表的大小（词的总数） |
| `embedding_dim` | 词向量的维度 |
| `padding_idx` | 指定填充 token 的索引，该位置的梯度不会被更新 |
| `max_norm` | 如果设置，会对词向量进行归一化，使其范数不超过该值 |
| `sparse` | 是否使用稀疏梯度（当词汇表很大时，可以节省内存） |

---

#### 4.2 使用示例

```python
import torch
import torch.nn as nn
import jieba  # 中文分词库

# 示例：将中文句子中的词转换为词向量
if __name__ == '__main__':
    # 0. 文本数据
    text = '北京冬奥的进度条已经过半，不少外国运动员在完成自己的比赛后踏上归途。'
    
    # 1. 中文分词（使用 jieba）
    words = jieba.lcut(text)
    print('文本分词：', words)
    # 输出：['北京', '冬奥', '的', '进度条', '已经', '过半', '，', '不少', '外国', '运动员', '在', '完成', '自己', '的', '比赛', '后', '踏上', '归途', '。']
    
    # 2. 构建词汇表（去重，保留顺序）
    unique_words = list(set(words))   # 去重（注意：set 无序，如需保留顺序可用 dict.fromkeys）
    print("去重后词的个数:", len(unique_words))   # 约 18 个（具体取决于分词结果）
    
    # 3. 构建词嵌入层
    embed = nn.Embedding(num_embeddings=len(unique_words), embedding_dim=4)
    print("词嵌入层对象:\n", embed)   # Embedding(18, 4)
    
    # 4. 为每个词获取词向量
    for i, word in enumerate(unique_words):
        # 将索引 i 转换为张量，然后查表
        word_vec = embed(torch.tensor(i))
        print(f'{word:5}\t{word_vec}')
```

**输出示例**（数值随机）：

```python
北京    tensor([-1.8043,  1.7860, -0.7821, -0.3167], grad_fn=<EmbeddingBackward0>)
冬奥    tensor([-0.6969, -0.5615,  1.6524, -0.2651], grad_fn=<EmbeddingBackward0>)
...
```

---

#### 4.3 更常见的批量处理

实际中，我们通常批量处理多个句子。句子长度可能不同，需要进行**填充（padding）** 和**打包（packing）**（后面会涉及）。

```python
# 假设有一个批次的句子索引序列（已经转换为索引）
# shape: (batch_size, seq_len)
indices = torch.tensor([[1, 2, 3, 0, 0],   # 句子1，0表示填充
                        [4, 5, 6, 7, 8]])   # 句子2，长度5

embedding = nn.Embedding(num_embeddings=100, embedding_dim=128)
embedded = embedding(indices)   # shape: (batch_size, seq_len, embedding_dim)
print(embedded.shape)   # torch.Size([2, 5, 128])
```

---

### 5. 预训练词向量

除了随机初始化，还可以使用预训练的词向量，如 Word2Vec、GloVe、FastText 等。这些向量在大规模语料上训练，能够捕捉丰富的语义信息。

```python
# 使用 Gensim 加载预训练的 Word2Vec 或使用 torchtext 加载 GloVe
# 示例：使用 torchtext 加载 GloVe（需要安装 torchtext）
# from torchtext.vocab import GloVe
# glove = GloVe(name='6B', dim=100)   # 6B 表示 60亿词数据集，100维
# word_vector = glove['hello']
# 然后将预训练向量赋值给 nn.Embedding 的权重
```

---

### 6. 词嵌入层总结

| 概念 | 核心要点 |
|------|----------|
| **词嵌入的作用** | 将离散的词语转换为连续的、低维的稠密向量，捕捉语义相似性 |
| **词向量矩阵** | 形状 `(vocab_size, embedding_dim)`，每行是一个词的向量 |
| **索引映射** | 输入词的索引，输出对应的词向量 |
| **PyTorch API** | `nn.Embedding(num_embeddings, embedding_dim)` |
| **预训练** | 可使用 Word2Vec、GloVe 等预训练词向量，提升效果 |

---

## 第三部分：循环网络层（RNN Layer）

### 1. RNN 网络结构与原理

#### 1.1 RNN 的基本结构

RNN 的核心是**循环连接**：隐藏层的输出不仅传递到下一层，还会反馈到当前层的下一个时间步。这种结构使得 RNN 能够记住历史信息。

下图为单层 RNN 的展开结构（按时间步展开）：

```python
        y0        y1        y2
        ↑         ↑         ↑
        h0  ←→   h1  ←→   h2  ←→  ...
        ↑         ↑         ↑
        x0        x1        x2
```

- **$x_t$**：当前时间步 $t$ 的输入（通常是词向量，形状为 `(input_size,)`）。
- **$h_t$**：当前时间步的隐藏状态（形状为 `(hidden_size,)`），保存了从起始到 $t$ 时刻的历史信息。
- **$y_t$**：当前时间步的输出（可选，由全连接层产生）。

**重要性质**：

- 每个时间步的输入 $x_t$ 和隐藏状态 $h_t$ 是**同一个神经元**在不同时刻的状态（参数共享）。
- 隐藏状态 $h_t$ 同时依赖于当前输入 $x_t$ 和上一时刻的隐藏状态 $h_{t-1}$，形成循环依赖。

---

#### 1.2 隐藏状态（Hidden State）的作用

- **记忆功能**：隐藏状态像 RNN 的“记忆单元”，在不同时间步之间传递信息。
- **上下文理解**：携带过去的信息，用于理解当前输入在上下文中的含义。
- **连接不同时间步**：通过循环连接，网络可以处理任意长度的序列。

---

#### 1.3 RNN 的计算过程（以文本生成为例）

假设我们有一个语言模型，输入“我爱”，想要预测下一个字“你”。

1. **初始化**：初始隐藏状态 h0 通常为全零向量（形状 `(hidden_size,)`）。
2. **时间步 1**：输入词“我”的词向量 $x1$，与 $h0$ 一起计算得到 $h1$。
3. **时间步 2**：输入词“爱”的词向量 $x2$，与 $h1$ 一起计算得到 $h2$。
4. **输出**：将 $h2$ 传入全连接层，计算词汇表中每个词的概率，取概率最大的词作为预测结果（这里是“你”）。

---

### 2. RNN 内部计算公式

#### 2.1 隐藏状态更新公式

当前时间步的隐藏状态 $h_t$ 由以下公式计算：

$$
h_t = \tanh(W_{ih} x_t + b_{ih} + W_{hh} h_{t-1} + b_{hh})
$$

其中：

- $x_t$ ：当前输入向量（形状 `(input_size,)`）
- $h_{t-1}$ ：上一时间步的隐藏状态（形状 `(hidden_size,)`）
- $W_{ih}$ ：输入到隐藏的权重矩阵（形状 `(hidden_size, input_size)`）
- $b_{ih}$ ：输入到隐藏的偏置（形状 `(hidden_size,)`）
- $W_{hh}$ ：隐藏到隐藏的权重矩阵（形状 `(hidden_size, hidden_size)`）
- $b_{hh}$ ：隐藏到隐藏的偏置（形状 `(hidden_size,)`）
- $\tanh$ ：双曲正切激活函数，将输出压缩到 (-1, 1) 之间，引入非线性。

**简化表示**：

$$
h_t = \tanh(W_{ih} x_t + W_{hh} h_{t-1} + b)
$$

其中$b = b_{ih} + b_{hh}$（PyTorch 中将两个偏置合并为一个）。

---

#### 2.2 输出计算公式

RNN 层的输出（用于预测）通常还需要一个线性变换：

$$
y_t = W_{hy} h_t + b_y
$$

其中：

- $y_t$ ：当前时间步的输出向量（通常经过全连接层得到最终预测）
- $W_{hy}$ ：隐藏到输出的权重矩阵（形状 `(output_size, hidden_size)`）
- $b_y$ ：输出偏置

**注意**：在一些实现中，RNN 层本身不包含输出层的权重，而是将隐藏状态 $h_t$ 作为输出，由后续的全连接层处理。

---

#### 2.3 词汇表映射

最终预测 `y_pred` 经过 Softmax 函数转换为概率分布：

$$
\hat{y}_t = \text{softmax}(W_{hy} h_t + b_y)
$$

其中$\hat{y}_t$的维度等于词汇表大小，每个元素表示当前时间步生成该词的概率。模型选取概率最大的词作为输出。

---

### 3. RNN 的工作机制总结

| 步骤         | 描述                                    |
| ---------- | ------------------------------------- |
| **接收输入**   | 每个时间步接收当前输入$x_t$和上一时间步的隐藏状态 $h_{t-1}$ |
| **更新隐藏状态** | 通过加权和 + tanh 激活函数，计算新的隐藏状态$h_t$       |
| **输出计算**   | 将$h_t$送入全连接层，得到当前时间步的预测$y_t$          |

---

### 4. PyTorch 中的 RNN 层

#### 4.1 API 说明

```python
torch.nn.RNN(input_size, hidden_size, num_layers=1, nonlinearity='tanh', 
             bias=True, batch_first=False, dropout=0, bidirectional=False)
```

**参数说明**：

| 参数              | 含义                                 | 默认值                                 |
| --------------- | ---------------------------------- | ----------------------------------- |
| `input_size`    | 输入 $x_t$ 的特征维度（词向量的维度）             | 必填                                  |
| `hidden_size`   | 隐藏状态 $h_t$ 的维度                     | 必填                                  |
| `num_layers`    | RNN 层的层数（堆叠多个 RNN 层）               | 1                                   |
| `nonlinearity`  | 激活函数，可选 `'tanh'` 或 `'relu'`        | `'tanh'`                            |
| `bias`          | 是否使用偏置                             | True                                |
| `batch_first`   | 输入形状的第一维是否为 batch                  | False（默认输入 `(seq, batch, feature)`) |
| `dropout`       | 层间 dropout 概率（仅当 num_layers>1 时有效） | 0                                   |
| `bidirectional` | 是否为双向 RNN                          | False                               |

---

#### 4.2 输入和输出形状

**输入**：

- `input`：形状 `(seq_len, batch, input_size)`（若 `batch_first=True`，则为 `(batch, seq_len, input_size)`）
- `h0`（可选）：初始隐藏状态，形状 `(num_layers * num_directions, batch, hidden_size)`。若不提供，默认全零。

**输出**：

- `output`：每个时间步的隐藏状态（最后一层），形状 `(seq_len, batch, hidden_size * num_directions)`（若 `batch_first=True`，则第一个维度为 batch）
- `hn`：最后一个时间步的隐藏状态（各层），形状 `(num_layers * num_directions, batch, hidden_size)`

---

#### 4.3 代码示例

```python
import torch
import torch.nn as nn

# 测试 RNN 层
def test_rnn():
    # 参数：输入维度 128（词向量维度），隐藏层维度 256
    rnn = nn.RNN(input_size=128, hidden_size=256, num_layers=1, batch_first=False)
    
    # 创建输入数据
    # 形状：(seq_len=5, batch=32, input_size=128)
    inputs = torch.randn(5, 32, 128)
    
    # 初始隐藏状态
    # 形状：(num_layers=1, batch=32, hidden_size=256)
    h0 = torch.zeros(1, 32, 256)
    
    # 前向传播
    output, hn = rnn(inputs, h0)
    
    print("输出 output 的形状:", output.shape)   # torch.Size([5, 32, 256])
    print("最终隐藏状态 hn 的形状:", hn.shape)   # torch.Size([1, 32, 256])
    
    # 说明：
    # output 包含每个时间步的隐藏状态，可用于进一步处理（如全连接层）
    # hn 是最后一个时间步的隐藏状态，也可用于初始化下一个序列

if __name__ == '__main__':
    test_rnn()
```

**输出**：

```python
输出 output 的形状: torch.Size([5, 32, 256])
最终隐藏状态 hn 的形状: torch.Size([1, 32, 256])
```

---

#### 4.4 使用 `batch_first=True` 的示例

```python
rnn_batch_first = nn.RNN(input_size=128, hidden_size=256, batch_first=True)
inputs = torch.randn(32, 5, 128)   # (batch, seq_len, input_size)
output, hn = rnn_batch_first(inputs)
print("batch_first=True 时的 output 形状:", output.shape)  # (32, 5, 256)
```

---

#### 4.5 多层 RNN 与双向 RNN

```python
# 2 层 RNN
rnn_2layers = nn.RNN(128, 256, num_layers=2)
# 输出：output (seq_len, batch, 256)，hn (2, batch, 256)

# 双向 RNN
rnn_bidirectional = nn.RNN(128, 256, bidirectional=True)
# 输出：output (seq_len, batch, 256*2)，hn (2, batch, 256)  # 2 个方向
```

---

### 5. RNN 的局限性

虽然 RNN 在理论上可以处理任意长度的序列，但在实践中存在两大问题：

1. **梯度消失（Vanishing Gradient）**：当序列很长时，反向传播的梯度会随着时间步指数级衰减，导致网络无法学习长期依赖。
2. **梯度爆炸（Exploding Gradient）**：梯度也可能指数级增长，导致参数更新不稳定。

**解决方案**：

- 使用改进的循环单元：**LSTM**（长短时记忆网络）和 **GRU**（门控循环单元），它们引入了门控机制，有效缓解梯度消失问题。
- 梯度裁剪（Gradient Clipping）：限制梯度的最大值，避免梯度爆炸。

---

### 6. RNN 总结

| 概念              | 核心要点                                                                           |
| --------------- | ------------------------------------------------------------------------------ |
| **RNN 结构**      | 循环连接，隐藏状态在不同时间步之间传递                                                            |
| **隐藏状态**        | 保存历史信息，连接前后时间步                                                                 |
| **计算公式**        |$h_t = \tanh(W_{ih}x_t + W_{hh}h_{t-1} + b)$                                |
| **PyTorch API** | `nn.RNN(input_size, hidden_size, num_layers, batch_first, ...)`                |
| **输入形状**        | `(seq_len, batch, input_size)` 或 `(batch, seq_len, input_size)`                |
| **输出形状**        | `output: (seq_len, batch, hidden_size)`，`hn: (num_layers, batch, hidden_size)` |
| **局限性**         | 梯度消失/爆炸，难以捕捉长期依赖                                                               |
| **改进方案**        | LSTM、GRU、梯度裁剪                                                                  |

---

### 7. RNN 完整示例：字符级语言模型（预测下一个字符）

以下示例展示了一个简单的 RNN 用于字符级文本生成（预测下一个字符）。

```python
import torch
import torch.nn as nn
import torch.optim as optim

# 超参数
seq_len = 10
batch_size = 1
input_size = 128   # 词/字符嵌入维度
hidden_size = 256
num_layers = 2
num_epochs = 100
learning_rate = 0.01

# 模拟字符词汇表（假设 100 个不同的字符）
vocab_size = 100
embedding = nn.Embedding(vocab_size, input_size)
rnn = nn.RNN(input_size, hidden_size, num_layers, batch_first=True)
fc = nn.Linear(hidden_size, vocab_size)

# 损失函数和优化器
criterion = nn.CrossEntropyLoss()
optimizer = optim.Adam(list(embedding.parameters()) + list(rnn.parameters()) + list(fc.parameters()), lr=learning_rate)

# 模拟输入和标签（随机索引）
# 输入: (batch, seq_len)  标签: (batch, seq_len)  每个位置预测下一个字符
inputs = torch.randint(0, vocab_size, (batch_size, seq_len))
targets = torch.randint(0, vocab_size, (batch_size, seq_len))

# 训练循环（示意）
for epoch in range(num_epochs):
    # 前向传播
    embedded = embedding(inputs)          # (batch, seq_len, input_size)
    output, hn = rnn(embedded)            # output: (batch, seq_len, hidden_size)
    logits = fc(output)                   # (batch, seq_len, vocab_size)
    
    # 计算损失（需要调整形状）
    loss = criterion(logits.view(-1, vocab_size), targets.view(-1))
    
    # 反向传播
    optimizer.zero_grad()
    loss.backward()
    optimizer.step()
    
    if (epoch+1) % 10 == 0:
        print(f'Epoch {epoch+1}, Loss: {loss.item():.4f}')
```

---

## 循环神经网络（RNN）完整知识总结

本笔记共三部分，系统覆盖了：

1. **RNN 介绍与序列数据**：RNN 概念、序列数据特性、典型应用场景、总体架构。
2. **词嵌入层**：自然语言处理概述、词嵌入的作用、工作原理、PyTorch `nn.Embedding` API、预训练词向量。
3. **循环网络层**：RNN 结构、隐藏状态、计算公式（含数学公式）、PyTorch `nn.RNN` API 使用、输入输出形状、局限性及改进方案、完整代码示例。

通过理论与实践结合，读者应能掌握 RNN 的基本原理，并能够使用 PyTorch 构建简单的循环神经网络进行序列建模任务（如文本生成、情感分类、时间序列预测等）。
