# RNN循环神经网络

**标签：** #RNN #序列模型

---

## 1. 什么是RNN

循环神经网络（RNN）是专门处理**序列数据**的神经网络，通过隐藏状态记忆过去的信息。

**核心特点**：
- **循环连接**：隐藏层的输出会反馈到自身
- **记忆能力**：每个时间步的隐藏状态包含之前所有时间步的信息
- **参数共享**：每个时间步的权重矩阵是共享的

---

## 2. RNN计算公式

$$
h_t = \tanh(W_{ih} x_t + W_{hh} h_{t-1} + b)
$$

$$
y_t = W_{hy} h_t + b_y
$$

---

## 3. LSTM和GRU

### LSTM（长短期记忆网络）

通过门控机制解决长期依赖问题：
- **遗忘门**：决定保留多少旧信息
- **输入门**：决定写入多少新信息
- **输出门**：决定输出多少信息

### GRU（门控循环单元）

简化版LSTM，参数更少，性能相当。

---

## 4. PyTorch实现

```python
import torch.nn as nn

# RNN层
rnn = nn.RNN(input_size=100, hidden_size=256, num_layers=2, batch_first=True)

# LSTM层
lstm = nn.LSTM(input_size=100, hidden_size=256, num_layers=2, batch_first=True, dropout=0.3)

# GRU层
gru = nn.GRU(input_size=100, hidden_size=256, num_layers=2, batch_first=True)

# 双向LSTM
bilstm = nn.LSTM(input_size=100, hidden_size=256, bidirectional=True, batch_first=True)
```

---

## 5. 优缺点

| 优点 | 缺点 |
|------|------|
| 天然处理变长序列 | 难以并行化 |
| 参数共享，模型紧凑 | 长期依赖仍需门控机制 |
| 可处理任意长度输入 | 梯度爆炸/消失问题 |
