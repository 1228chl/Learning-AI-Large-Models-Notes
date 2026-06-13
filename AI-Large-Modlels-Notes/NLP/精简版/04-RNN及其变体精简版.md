**上一级：** [03-FastText分类任务精简版](03-FastText分类任务精简版.md)

**下一级：** [05-注意力机制和Seq2Seq介绍精简版](05-注意力机制和Seq2Seq介绍精简版.md)

**标签：** #NLP

---

# RNN 及其变体（核心精简版）

## 一、RNN 概述

- **定义**：循环神经网络（RNN）以序列为输入，通过隐藏状态的循环利用，捕捉序列间关系。
- **循环含义**：上一时刻隐藏状态 $h_{t-1}$ 参与当前时刻 $h_t$ 的计算。
- **主要作用**：处理文本、语音等序列数据，用于分类、翻译、生成等。

### 1.1 按输入输出结构分类

| 类型 | 输入 | 输出 | 应用 |
|------|------|------|------|
| N vs N | 等长序列 | 等长序列 | 词性标注 |
| N vs 1 | 序列 | 单个值 | 情感分类 |
| 1 vs N | 单个值 | 序列 | 图片描述 |
| N vs M（Seq2Seq） | 序列 | 不等长序列 | 机器翻译 |

### 1.2 按内部构造分类

- **传统 RNN**：结构简单，长序列梯度消失/爆炸。
- **LSTM**：引入门控和细胞状态，缓解梯度问题。
- **GRU**：LSTM 简化版，参数更少，速度更快。
- **双向 RNN/LSTM/GRU**：正反两个方向处理，拼接输出（需完整序列）。

---

## 二、传统 RNN

### 2.1 核心公式

$$
 h_t = \tanh(W_{ih}x_t + b_{ih} + W_{hh}h_{t-1} + b_{hh}) 
$$

- $x_t$ ：`(input_size)`， $h_{t-1}$ ：`(hidden_size)`
- $W_{ih}$ ：`(hidden_size, input_size)`， $W_{hh}$ ：`(hidden_size, hidden_size)`

### 2.2 PyTorch API：`nn.RNN`

```python
rnn = nn.RNN(input_size, hidden_size, num_layers=1, nonlinearity='tanh',
             batch_first=False, bidirectional=False)
```

- **输入**：`input (seq_len, batch, input_size)`，`h0 (num_layers*num_directions, batch, hidden_size)`
- **输出**：`output (seq_len, batch, hidden_size*num_directions)`（最后一层所有时间步），`hn`（所有层最后时间步）

**形状示例**：

```python
rnn = nn.RNN(5, 6, num_layers=2)
input = torch.randn(3, 2, 5)   # seq=3, batch=2
h0 = torch.zeros(2, 2, 6)
output, hn = rnn(input, h0)
# output: (3,2,6), hn: (2,2,6)
```

### 2.3 优缺点

- **优点**：结构简单，计算快，短序列效果好。
- **缺点**：梯度消失/爆炸，长序列效果差，不可并行。

---

## 三、LSTM（长短时记忆网络）

### 3.1 核心结构

LSTM 维护细胞状态 $C_t$ （长期记忆）和隐藏状态 $h_t$ （短期记忆）。三个门：

| 门/状态               | 公式                                                | 作用                |
| ------------------ | ------------------------------------------------- | ----------------- |
| 遗忘门 $f_t$          | $\sigma(W_f[h_{t-1},x_t]+b_f)$                    | 丢弃 $C_{t-1}$ 中的信息 |
| 输入门 $i_t$          | $\sigma(W_i[h_{t-1},x_t]+b_i)$                    | 控制新信息流入           |
| 候选状态 $\tilde{C}_t$ | $\tanh(W_C[h_{t-1},x_t]+b_C)$                     | 新知识               |
| 细胞更新               | $C_t = f_t \odot C_{t-1} + i_t \odot \tilde{C}_t$ | 更新长期记忆            |
| 输出门 $o_t$          | $\sigma(W_o[h_{t-1},x_t]+b_o)$                    | 控制输出              |
| 隐藏状态               | $h_t = o_t \odot \tanh(C_t)$                      | 当前输出              |

### 3.2 PyTorch API：`nn.LSTM`

```python
lstm = nn.LSTM(input_size, hidden_size, num_layers=1, batch_first=False, bidirectional=False)
```

- **输入**：`input`, `(h0, c0)`（形状同 RNN 的 h0）
- **输出**：`output`, `(hn, cn)`

**示例**：

```python
lstm = nn.LSTM(5, 6, num_layers=2)
input = torch.randn(3, 2, 5)
h0 = torch.zeros(2, 2, 6)
c0 = torch.zeros(2, 2, 6)
output, (hn, cn) = lstm(input, (h0, c0))
# output: (3,2,6), hn: (2,2,6), cn: (2,2,6)
```

> **注意**：正确写法 `output, (hn, cn) = lstm(...)`，不是 `output, hn, cn = ...`

### 3.3 为什么缓解梯度消失？

- 细胞状态加法更新： $C_t = f_t \odot C_{t-1} + ...$ ，梯度可直接沿此路径传递。
- 遗忘门可学习接近 1，保留长距离信息。

### 3.4 双向 LSTM

```python
lstm = nn.LSTM(5, 6, bidirectional=True)  # output最后一维12, hn/cn第一维2
```

---

## 四、GRU（门控循环单元）

### 4.1 核心结构

GRU 只有两个门，无独立细胞状态。

| 门                  | 公式                                                    | 作用               |
| ------------------ | ----------------------------------------------------- | ---------------- |
| 更新门 $z_t$          | $\sigma(W_z[h_{t-1},x_t]+b_z)$                        | 控制保留旧信息 vs 使用新信息 |
| 重置门 $r_t$          | $\sigma(W_r[h_{t-1},x_t]+b_r)$                        | 控制忽略多少历史信息       |
| 候选状态 $\tilde{h}_t$ | $\tanh(W_h[r_t \odot h_{t-1}, x_t]+b_h)$              | 新知识              |
| 最终状态               | $h_t = (1-z_t) \odot h_{t-1} + z_t \odot \tilde{h}_t$ | 更新隐藏状态           |

### 4.2 PyTorch API：`nn.GRU`

```python
gru = nn.GRU(input_size, hidden_size, num_layers=1, batch_first=False, bidirectional=False)
```

- **输入**：`input`, `h0`
- **输出**：`output`, `hn`（无细胞状态）

**示例**：

```python
gru = nn.GRU(5, 6, num_layers=2)
input = torch.randn(3, 2, 5)
h0 = torch.zeros(2, 2, 6)
output, hn = gru(input, h0)
```

---

## 五、三种模型对比

| 模型 | 门控数 | 内部状态 | 参数量（相对 RNN） | 长序列能力 | 训练速度 | 适用场景 |
|------|--------|----------|--------------------|------------|----------|----------|
| RNN | 0 | $h_t$ | 1x | 弱 | 最快 | 短序列 |
| LSTM | 3 | $C_t, h_t$ | 4x | 强 | 慢 | 长序列、复杂任务 |
| GRU | 2 | $h_t$ | 3x | 较强 | 中 | 通用、资源受限 |

**选择建议**：

- 短序列（<20）→ RNN
- 大多数 NLP 任务 → 先试 GRU
- 极长序列或精细记忆控制 → LSTM
- 需要双向上下文（NER、词性标注）→ Bi-LSTM 或 Bi-GRU

---

## 六、关键注意事项

1. **梯度爆炸**：使用 `torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)`
2. **变长序列**：使用 `pack_padded_sequence` / `pad_packed_sequence`
3. `batch_first` ：默认 `False` 时输入 `(seq, batch, feature)`，设为 `True` 更直观 `(batch, seq, feature)`
4. **多层 RNN**：`output` 只包含最后一层输出，`hn` 包含所有层最后时间步
5. **双向**：输出维度翻倍，`hn` 第一维为 `num_layers * 2`

---

## 七、快速代码模板

```python
# RNN
rnn = nn.RNN(input_size, hidden_size, num_layers)
output, hn = rnn(input, h0)

# LSTM
lstm = nn.LSTM(input_size, hidden_size, num_layers)
output, (hn, cn) = lstm(input, (h0, c0))

# GRU
gru = nn.GRU(input_size, hidden_size, num_layers)
output, hn = gru(input, h0)
```

（假设 `batch_first=False`，若为 `True` 则调整形状）

---

## 八、常见面试简答

1. **RNN 为什么有梯度消失？** 反向传播时梯度需连乘循环权重 $W_{hh}$ ，若特征值<1 则指数衰减。
2. **LSTM 如何缓解？** 细胞状态加法更新，梯度可直连；遗忘门可自适应保留信息。
3. **GRU 与 LSTM 区别？** GRU 无细胞状态，门少一个（更新门+重置门），参数量少，训练更快。
4. **双向 RNN 优缺点？** 能利用前后文，适合序列标注；但参数翻倍，且不能实时预测（需完整序列）。

---
