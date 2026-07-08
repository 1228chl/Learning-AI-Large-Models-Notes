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

# 从 HuggingFace Hub 加载预训练的 GPT-2 小型模型（124M 参数），用于自回归文本生成
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

## 面试追问

**Q1（基础）**：自回归语言模型是如何工作的？为什么它被称为"自回归"？
**回答要点**：

1. 逐 token 从左到右预测下一个 token，即 $P(y) = \prod P(y_t \mid y_{<t})$
2. 当前输出依赖于之前的所有输出，与时间序列中的自回归模型类比
3. 使用掩码自注意力防止看到未来位置的信息

**Q2（深挖）**：GPT-3 的上下文学习（In-Context Learning）能力与 BERT 的微调范式相比有什么本质不同？各自适合什么场景？
**回答要点**：

1. ICL 无需更新参数，仅通过 prompt 中的示例就能执行任务，而微调需要标注数据和梯度更新
2. ICL 适合通用任务和快速原型，微调在特定任务上效果更好且更稳定
3. ICL 需要大模型（>=10B）才能涌现

**Q3（实战）**：在生产环境中部署文本生成模型时，你遇到过哪些输出质量问题？你是如何通过解码策略来改善的？
**回答要点**：

1. 重复生成 → 使用 repetition penalty 或 no_repeat_ngram_size 来抑制
2. 缺乏多样性 → 采用 top-k + top-p 采样而非贪心解码
3. 需要确定性输出 → temperature 趋近 0 + 固定随机种子；长度不可控 → max_new_tokens + early stopping

**Q4（边界）**：自回归生成的根本性局限是什么？为什么说它存在 Exposure Bias 和误差累积问题？
**回答要点**：

1. 训练时 Teacher Forcing 使用真实输入，推理时只能使用自己之前的预测 → 训练/推理分布不一致（Exposure Bias）
2. 长序列生成中早期错误会不断累积放大，且单向约束使模型无法全局规划输出内容
3. 改进方向包括扩散语言模型、迭代精炼等非自回归方案

## 参考引用
- 需要理解BERT与MLM预训练的相关知识，参见 [BERT与MLM预训练](./10-BERT与MLM预训练.md)
- 需要理解自注意力与Transformer的相关知识，参见 [自注意力与Transformer](./06-自注意力与Transformer.md)
- 需要理解HuggingFace Transformers库的相关知识，参见 [HuggingFace Transformers库](./12-HuggingFace Transformers库.md)
