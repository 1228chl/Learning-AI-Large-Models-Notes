---
author: "XunZong"
created: "2026-07-06"
tags: ["NLP", "Seq2Seq", "Encoder-Decoder"]
aliases: ["Seq2Seq", "Encoder-Decoder", "序列到序列"]
---

# Seq2Seq 与 Encoder-Decoder

## 定义

Seq2Seq（Sequence-to-Sequence，序列到序列模型）是一种将**输入序列转换为输出序列**的框架，核心由**编码器（Encoder）** 和**解码器（Decoder）** 两部分组成：

```
编码器: x₁, x₂, ..., xₙ → 上下文表示 C
解码器: C → y₁, y₂, ..., yₘ
```

编码器将输入序列编码为固定长度的上下文向量 $C$（通常是最后一个隐状态 $h_n$），解码器根据 $C$ 逐步生成输出序列。

```python
import torch.nn as nn

class Seq2Seq(nn.Module):
    def __init__(self, vocab_size, embed_size, hidden_size):
        super().__init__()
        self.encoder = nn.LSTM(embed_size, hidden_size, batch_first=True)
        self.decoder = nn.LSTM(embed_size, hidden_size, batch_first=True)
        self.fc = nn.Linear(hidden_size, vocab_size)

    def forward(self, src, trg):
        # 编码器：一次性处理整个输入序列
        _, (h, c) = self.encoder(src)

        # 解码器：以编码器最终状态为初始状态，逐步生成
        output, _ = self.decoder(trg, (h, c))
        return self.fc(output)
```

## 编码器-解码器架构

| 组件 | 输入→输出 | 说明 |
|:----:|:---------:|------|
| **编码器（Encoder）** | 完整输入序列 → 上下文向量 $C$ | 通常用 RNN / LSTM / GRU |
| **解码器（Decoder）** | $C$ + SOS 标记 → 逐步生成输出 | 每个时间步输出一个词 |
| **上下文向量 $C$** | 编码器的最终隐藏状态 | 固定长度的"信息瓶颈" |

## 训练与推理

```python
# 训练阶段：Teacher Forcing（用真实标签作为解码器输入）
# 无论上一时间步的预测对错，解码器输入 = 真实前一词

# 推理阶段：自回归生成
# 解码器输入 = 上一时间步的预测输出
# 从 SOS 开始 → 逐个生成 → 直到 EOS
```

| 阶段 | 解码器输入 | 特点 |
|:----:|:----------|------|
| **训练（Teacher Forcing）** | 真实标签序列 | 收敛快，并行计算 |
| **推理（自回归）** | 上一步的预测结果 | 逐步生成，无法并行 |

## 主要局限

| 问题 | 表现 | 原因 |
|:----:|:----|:----|
| **信息瓶颈** | 长序列翻译质量下降 | 固定长度的上下文向量 $C$ 无法容纳全部信息 |
| **对齐问题** | 源语言和目标语言的词序不对齐 | 编码器只能生成一个全局表示 |
| **序列长度限制** | 超过训练长度时性能骤降 | RNN 长期依赖问题 |

**解决方案**：注意力机制（Attention）——解码时"关注"输入序列的不同部分，打破上下文向量的信息瓶颈。

## ML 中的 Seq2Seq

| 应用场景 | 编码器 | 解码器 | 说明 |
|:--------:|:-----:|:------:|------|
| **机器翻译** | RNN / LSTM | RNN / LSTM + Attention | 经典应用 |
| **文本摘要** | BERT / T5 | Transformer 解码器 | 长文本 → 短摘要 |
| **对话系统** | Transformer | Transformer | 上下文 → 回复 |
| **语音识别** | CNN + RNN | RNN + CTC / Attention | 音频 → 文本 |
| **代码生成** | Transformer | Transformer | NL → 代码 |

> 参见 [[05-注意力机制]]、[[11-RNN与序列建模]]、[[06-自注意力与Transformer]]

> **面试追问**
>
> Q1（基础）：Seq2Seq 模型的基本架构是怎样的？为什么固定长度的上下文向量 $C$ 被称为"信息瓶颈"？
> 回答要点：编码器将输入序列压缩为固定向量 $C$，解码器从 $C$ 逐步生成输出；长序列时 $C$ 无法容纳全部信息，导致翻译质量下降；序列越长，瓶颈效应越严重。
>
> Q2（深挖）：训练时使用的 Teacher Forcing 策略是什么？它有什么优缺点？
> 回答要点：训练时将真实标签（而非上一步预测）作为解码器输入；优点是收敛快且可并行计算；缺点是暴露偏差（Exposure Bias）——推理时只能依赖自身预测，与训练时的输入分布不一致。
>
> Q3（实战）：在一个真实机器翻译项目中，你发现 Seq2Seq 对长句子效果很差，你会采取哪些改进措施？
> 回答要点：引入注意力机制打破信息瓶颈；用 Transformer 替代 RNN 以支持并行化和长距离依赖；推理时使用 Beam Search 而非贪心解码；必要时加入长度惩罚。
>
> Q4（边界）：在什么场景下你仍然会选择传统的 Seq2Seq 而不是 Transformer？为什么？
> 回答要点：数据量极少时（Transformer 需要大数据）；计算资源受限时；输入输出长度很短时；需要 RNN 隐状态的时序可解释性时。
