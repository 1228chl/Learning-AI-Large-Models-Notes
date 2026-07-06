---
author: "XunZong"
created: "2026-07-06"
tags: ["深度学习", "LSTM", "RNN"]
aliases: ["LSTM", "长短期记忆", "门控机制"]
---

# LSTM 与门控机制

## 定义

长短期记忆网络（LSTM, Long Short-Term Memory）通过**门控机制**和**细胞状态**解决 RNN 的梯度消失问题，使其能够学习 **100+ 时间步**的长期依赖关系。

$$f_t = \sigma(W_f \cdot [h_{t-1}, x_t] + b_f) \quad \text{遗忘门}$$
$$i_t = \sigma(W_i \cdot [h_{t-1}, x_t] + b_i) \quad \text{输入门}$$
$$\tilde{C}_t = \tanh(W_C \cdot [h_{t-1}, x_t] + b_C) \quad \text{候选状态}$$
$$o_t = \sigma(W_o \cdot [h_{t-1}, x_t] + b_o) \quad \text{输出门}$$

```python
import torch.nn as nn

lstm = nn.LSTM(input_size=100, hidden_size=256, num_layers=2, batch_first=True)
output, (h_n, c_n) = lstm(x)     # output: (N, L, 256), c_n: 细胞状态
```

## 三种门控

| 门 | 公式 | 作用 | 类比 |
|:--:|:----:|:----:|------|
| **遗忘门 $f_t$** | $\sigma(W_f[h_{t-1}, x_t] + b_f)$ | 决定丢弃哪些旧信息 | 选择性忘记过去 |
| **输入门 $i_t$** | $\sigma(W_i[h_{t-1}, x_t] + b_i)$ | 决定存储哪些新信息 | 选择性记住现在 |
| **输出门 $o_t$** | $\sigma(W_o[h_{t-1}, x_t] + b_o)$ | 决定输出哪些信息 | 选择性输出 |

## 细胞状态更新

```
遗忘 → C_{t-1} × f_t         丢弃不重要的旧记忆
输入 → C_t = C_{t-1} + i_t × C̃_t  添加重要的新信息
输出 → h_t = o_t × tanh(C_t)   从细胞状态中筛选输出
```

**关键创新**：细胞状态 $C_t$ 上的梯度更新是**加法**而非乘法——$C_t = C_{t-1} \times f_t + i_t \times \tilde{C}_t$。加法操作使梯度可以无损地反向传播，这是 LSTM 解决梯度消失的核心原因。

## LSTM vs 原始 RNN

| 对比 | RNN | LSTM |
|:----:|:----:|:----:|
| 隐藏状态 | 单一 $h_t$ | $h_t$ + 细胞状态 $C_t$ |
| 梯度流 | 连乘（易消失） | 加法（梯度直通） |
| 长期依赖 | ❌ 10 步以上失效 | ✅ 100 步以上 |
| 参数量 | 少 | 多（约 4 倍） |
| 计算速度 | 快 | 慢 |
| 过拟合风险 | 低 | 高（需 Dropout） |

```python
# 对比参数数量
rnn = nn.RNN(100, 256)          # params: 100*256 + 256*256 + 256 ≈ 91K
lstm = nn.LSTM(100, 256)        # params: 4 * (100*256 + 256*256 + 256) ≈ 365K
```

## ML 中的 LSTM

| 应用场景 | 使用方式 | 说明 |
|----------|----------|------|
| **语言模型** | 多层 LSTM 预测下一词 | 2013-2017 年 SOTA |
| **机器翻译** | Encoder LSTM → Decoder LSTM | Seq2Seq 框架 |
| **情感分析** | BiLSTM 编码 + 全连接分类 | 双向上下文 |
| **股票预测** | 多变量 LSTM 多步预测 | 时序预测 |
| **异常检测** | LSTM 预测误差作为异常分 | 时序异常 |

> 参见 [[11-RNN与序列建模]]、[[13-GRU]]、[[06-梯度消失与梯度爆炸]]
