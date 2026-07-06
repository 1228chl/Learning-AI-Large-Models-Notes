---
author: "XunZong"
created: "2026-07-06"
tags: ["深度学习", "RNN", "序列"]
aliases: ["RNN", "循环神经网络", "序列建模"]
---

# RNN 与序列建模

## 定义

循环神经网络（Recurrent Neural Network, RNN）是一类专门处理**序列数据**的神经网络。它在每个时间步接收当前输入 $\mathbf{x}_t$ 和上一时间步的隐藏状态 $\mathbf{h}_{t-1}$，输出当前隐藏状态 $\mathbf{h}_t$：

$$\mathbf{h}_t = \tanh(W_{ih} \mathbf{x}_t + W_{hh} \mathbf{h}_{t-1} + \mathbf{b}_h)$$

```python
import torch.nn as nn

# RNN 层
rnn = nn.RNN(input_size=100, hidden_size=256, num_layers=2, batch_first=True)
output, h_n = rnn(x)          # output: (N, L, 256), h_n: (2, N, 256)
```

## 时间步展开

```
输出:           y₁        y₂        y₃        y₄
               ↑         ↑         ↑         ↑
隐藏层:   → h₀ → h₁ → h₂ → h₃ → h₄ →
               ↑         ↑         ↑         ↑
输入:           x₁        x₂        x₃        x₄

关键：所有时间步共享同一套参数 (W_ih, W_hh, b_h)
```

| 特点 | 含义 | 优势 |
|:----:|------|------|
| **参数共享** | 每个时间步用相同权重 | 可处理任意长度序列 |
| **循环连接** | $\mathbf{h}_t$ 依赖于 $\mathbf{h}_{t-1}$ | 捕捉时序依赖关系 |
| **上下文记忆** | $\mathbf{h}_t$ 编码了前 $t$ 步信息 | 有"记忆"能力 |

## 主要局限

```python
# RNN 面临严重的梯度消失问题
# tanh 导数值域 (0, 1]，连乘后指数衰减
# 长序列中，早期信息几乎无法传到后期
```

| 局限 | 表现 | 解决方案 |
|:----:|------|----------|
| **梯度消失** | 长距离依赖无法学习 | LSTM / GRU |
| **梯度爆炸** | 训练不稳定，loss = NaN | 梯度裁剪 |
| **长程记忆弱** | 超过 10 步后的信息基本丢失 | LSTM 门控机制 |
| **无法并行** | 串行计算，训练慢 | Transformer 取代 |

## ML 中的 RNN

| 应用场景 | 序列类型 | 变体 |
|----------|----------|:----:|
| **语言模型** | 词序列 → 下一词 | LSTM / GRU |
| **机器翻译** | 源语言序列 → 目标语言序列 | Seq2Seq + Attention |
| **情感分类** | 文本序列 → 情感标签 | BiLSTM + 池化 |
| **语音识别** | 音频帧序列 → 音素序列 | Bidirectional RNN |
| **时间序列预测** | 历史值序列 → 未来值 | LSTM / GRU |
| **命名实体识别** | 词序列 → 标签序列 | BiLSTM-CRF |

> **趋势**：在 NLP 领域，RNN 族已被 **Transformer** 全面取代。但在时序预测、语音等场景中，LSTM 仍然有效。

> 参见 [[12-LSTM与门控机制]]、[[13-GRU]]、[[06-梯度消失与梯度爆炸]]
