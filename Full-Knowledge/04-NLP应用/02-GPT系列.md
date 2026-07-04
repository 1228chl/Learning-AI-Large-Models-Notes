---
tags: [NLP/预训练模型/GPT/大语言模型]
parent_moc: [[核心依赖链]]
aliases: [GPT, GPT系列, 大语言模型, LLM]
layer: 层级4-NLP应用
prerequisites: [Transformer解码器, 自回归生成]
successers: [ChatGPT, RLHF, 指令微调]
---

# 深度卡片：GPT系列

## L1：是什么（定义/公式/结构）

### 严谨定义
GPT（Generative Pre-trained Transformer）是基于Transformer解码器的自回归语言模型，通过在大规模语料上训练"预测下一个token"的任务，学习语言的统计规律。生成时给定前文，自回归地生成下一个token，直到生成结束符。

### GPT系列演进

| 模型 | 年份 | 参数量 | 核心特点 |
|------|------|--------|----------|
| GPT-1 | 2018 | 1.17亿 | 首次预训练+微调范式 |
| GPT-2 | 2019 | 15亿 | 零样本学习能力 |
| GPT-3 | 2020 | 1750亿 | 少样本学习、涌现能力 |
| GPT-4 | 2023 | 未公开 | 多模态、更强推理 |

### 核心公式

**自回归语言模型**：
$$P(x_t \vert x_1, ..., x_{t-1}) = \text{softmax}(W_e h_t)$$

**训练目标**：
$$\mathcal{L} = -\sum_{t=1}^T \log P(x_t \vert x_1, ..., x_{t-1})$$

---

## L2：为什么（设计意图/解决什么问题）

### 为什么需要GPT？

**问题1：如何生成连贯文本？**

传统RNN语言模型存在长期依赖问题。GPT使用Transformer解码器：
1. 自注意力可以捕捉长距离依赖
2. 自回归生成保证文本连贯性
3. 大规模预训练学习丰富的语言知识

**问题2：如何实现零样本/少样本学习？**

GPT-3展示了涌现能力：
- 给几个示例就能完成新任务
- 无需微调，通过提示调整行为
- 降低了AI应用的门槛

**问题3：如何对齐人类偏好？**

ChatGPT通过RLHF：
1. 收集人类标注的偏好数据
2. 训练奖励模型
3. 使用PPO优化策略模型

### GPT vs BERT

| 特性 | GPT | BERT |
|------|-----|------|
| 架构 | 解码器（单向） | 编码器（双向） |
| 任务 | 生成任务 | 理解任务 |
| 预训练目标 | CLM（预测下一个） | MLM（预测被遮蔽） |
| 推理方式 | 自回归 | 并行 |

---

## L3：怎么用（代码实现/调参/场景）

### HuggingFace实现

```python
from transformers import GPT2LMHeadModel, GPT2Tokenizer

# 加载模型
tokenizer = GPT2Tokenizer.from_pretrained('gpt2')
model = GPT2LMHeadModel.from_pretrained('gpt2')

# 文本生成
input_text = "The future of AI is"
input_ids = tokenizer.encode(input_text, return_tensors='pt')

# 生成
output = model.generate(
    input_ids,
    max_length=100,
    num_beams=5,        # beam search
    temperature=0.7,    # 温度采样
    do_sample=True
)

print(tokenizer.decode(output[0]))
```

---

## L4：坑在哪（边界条件/失效场景/常见误解）

### 常见误解

| 误解 | 正确理解 | 后果 |
|------|----------|------|
| "GPT理解语言" | GPT是统计模型，不是真正理解 | 高估模型能力 |
| "GPT不会犯错" | GPT会产生幻觉 | 信任过度 |

### 边界条件

**1. 幻觉问题**

GPT可能生成看似合理但错误的内容。

**解决方案**：RAG、事实检查、人工审核

**2. 知识截止**

GPT的知识截止于训练数据，无法获取最新信息。

**解决方案**：RAG、持续预训练

**3. 推理能力有限**

GPT在复杂推理任务上表现不佳。

**解决方案**：思维链（CoT）、工具调用

**4. 计算成本高**

大模型推理需要大量GPU。

**解决方案**：模型压缩、量化、蒸馏

---

## 💼 面试追问树

### Q1（基础）：GPT的核心思想是什么？

**回答要点**：
1. 基于Transformer解码器
2. 自回归生成：预测下一个token
3. 大规模预训练学习语言知识

### Q2（深挖）：GPT-3的涌现能力是什么？

**回答要点**：
1. 少样本学习：给几个示例就能完成新任务
2. 上下文学习：根据提示调整行为
3. 指令遵循：理解并执行复杂指令
4. 规模效应：小模型不具备，大模型突然出现

### Q3（更深）：ChatGPT是如何对齐人类偏好的？

**回答要点**：
1. 收集人类标注的偏好数据
2. 训练奖励模型预测人类偏好
3. 使用PPO算法优化策略模型
4. 目标：安全、有用、诚实

### Q4（边界）：GPT系列有什么问题？

**回答要点**：
1. 幻觉：生成错误内容
2. 知识截止：无法获取最新信息
3. 计算成本：推理需要大量GPU
4. 可控性：难以精确控制生成内容
5. 偏见：训练数据中的偏见会被放大

---

## 🔗 关联知识网络

**上游依赖**：[[Transformer解码器]], [自回归生成]]

**下游应用**：
- [[ChatGPT]]：RLHF对齐
- [[指令微调]]：遵循指令
- [[代码生成]]：Codex
- [[多模态]]：GPT-4V

**并列概念**：[[BERT]], [LLaMA]], [Mistral]]
