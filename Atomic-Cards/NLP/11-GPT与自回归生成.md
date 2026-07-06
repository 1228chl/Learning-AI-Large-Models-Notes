---
author: "XunZong"
created: "2026-07-06"
tags: ["NLP", "GPT", "自回归"]
aliases: ["GPT", "自回归", "语言模型", "LLM"]
---

# GPT 与自回归生成

## 定义

GPT（Generative Pre-trained Transformer）是 2018 年起 OpenAI 推出的**自回归（Autoregressive）语言模型**系列。与 BERT 的双向编码不同，GPT 使用**单向（从左到右）Transformer 解码器**，逐个 token 预测下一个词。

$$P(\mathbf{y}) = \prod_{t=1}^T P(y_t \mid y_{<t})$$

```python
from transformers import GPT2LMHeadModel

model = GPT2LMHeadModel.from_pretrained('gpt2')
# 12 层 Transformer 解码器
# 12 个注意力头
# 隐藏维度 768
```

## BERT vs GPT

| 对比 | BERT | GPT |
|:----:|:----|:----|
| **架构** | 编码器（双向） | 解码器（单向） |
| **注意力** | 双向（能看到所有位置） | **掩码自注意力**（只能看左侧） |
| **训练任务** | MLM + NSP | **下一个词预测** |
| **生成能力** | ❌ 不能生成文本 | ✅ 天然适合生成 |
| **微调** | 每种任务需不同输出头 | zero-shot / few-shot |

## 模型演进与规模

| 模型 | 年份 | 参数量 | 数据量 | 关键特性 |
|:----:|:----:|:------:|:------:|:--------|
| **GPT-1** | 2018 | 117M | 4.5GB | 证明无监督预训练有效 |
| **GPT-2** | 2019 | 1.5B | 40GB | zero-shot 能力涌现，暂不发布 |
| **GPT-3** | 2020 | **175B** | 570GB | 上下文学习（In-Context Learning） |
| **InstructGPT** | 2022 | 175B | RLHF | 指令遵循 + 人类偏好对齐 |
| **GPT-4** | 2023 | ~1.8T（估计） | — | 多模态，推理能力大幅提升 |
| **GPT-4o** | 2024 | — | — | 全模态实时交互 |

## 涌现能力（Emergent Abilities）

随着模型规模增大（>10B），GPT 系列展现出小模型没有的能力：

| 能力 | 说明 | 示例 |
|:----|:----|:----|
| **上下文学习（ICL）** | 仅凭示例就能执行任务 | 给几个翻译示例 → 继续翻译 |
| **思维链（CoT）** | 展示推理步骤 | "Let's think step by step..." |
| **指令遵循** | 理解并执行用自然语言描述的指令 | "用简洁的语言总结..." |
| **代码生成** | 根据描述生成代码 | "写一个 Python 函数..." |

```python
# GPT-3 时代的关键发现
# 1. 缩放定律：性能随参数/数据/计算量幂律增长
# 2. 涌现：某些能力在参数量超过某个阈值时才出现
# 3. 少样本/零样本：无需微调，只需合适的 prompt
```

## ML 中的 GPT

| 应用场景 | 使用方式 | 说明 |
|:--------:|:--------|------|
| **文本生成** | 自回归生成 | 写作、对话、代码生成 |
| **翻译** | few-shot prompt 示例 | 无需专门训练 |
| **摘要** | "请总结以下文本：" | 指令遵循 |
| **问答** | 上下文知识 + 问题 | 检索增强生成（RAG） |
| **代码生成** | Codex / Copilot | 自然语言→代码 |

> 参见 [[10-BERT与MLM预训练]]、[[06-自注意力与Transformer]]、[[12-HuggingFace Transformers库]]
