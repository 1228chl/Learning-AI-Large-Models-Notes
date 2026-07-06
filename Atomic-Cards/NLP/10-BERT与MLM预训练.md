---
author: "XunZong"
created: "2026-07-06"
tags: ["NLP", "BERT", "预训练"]
aliases: ["BERT", "MLM", "NSP", "预训练"]
---

# BERT 与 MLM 预训练

## 定义

BERT（Bidirectional Encoder Representations from Transformers）是 2018 年由 Google 提出的**双向编码器预训练模型**。它通过在大规模无标注文本上预训练，学到通用的语言表示，然后在下游任务上微调。

**里程碑意义**：BERT 在 11 项 NLP 任务上刷新 SOTA，开启了 NLP 的"预训练-微调"范式。

## 预训练任务

### MLM（Masked Language Model）

随机遮盖 15% 的 token，让模型根据上下文预测被遮盖的词：

```python
输入: 我 [MASK] 自然 [MASK] 处理
目标: 爱      语言
```

| 策略 | 操作（对选中 token 的 15%） | 比例 |
|:----:|:---------------------------|:----:|
| 替换为 [MASK] | `我 [MASK] 语言处理` | 80% |
| 替换为随机词 | `我 吃 语言处理` | 10% |
| 保持不变 | `我 爱 语言处理` | 10% |

**为什么不全用 [MASK]？** 微调时不会有 [MASK] token，做这种混合策略使模型知道"即使输入不是 [MASK] 也要关注上下文"。

### NSP（Next Sentence Prediction）

判断两句话是否为连续的上下句（下句预测——BERT 原创，后续模型发现 NSP 并非必需）：

```python
# 正例：实际连续的句子
[CLS] 我 爱 自然 语言 处理 [SEP] 它 很 有 趣 [SEP] → IsNext

# 负例：随机拼接的句子
[CLS] 我 爱 自然 语言 处理 [SEP] 月球 是 卫星 [SEP] → NotNext
```

## BERT 的架构

```python
from transformers import BertModel

model = BertModel.from_pretrained('bert-base-uncased')
# 12 层 Transformer 编码器
# 12 个注意力头
# 隐藏维度 768
# 总参数: 110M
```

| 版本 | 层数 | 头数 | 隐藏维度 | 参数量 |
|:----:|:----:|:----:|:--------:|:------:|
| **BERT-base** | 12 | 12 | 768 | 110M |
| **BERT-large** | 24 | 16 | 1024 | 340M |

## BERT 的输入表示

```
输入 = Token 嵌入 + 段嵌入 + 位置嵌入

[CLS] 我 爱 NLP [SEP] 它 很 有 趣 [SEP]
  ↑                                    ↑
分类表示                            句子分隔符
```

| 特殊 Token | 作用 |
|:----------:|:----|
| **[CLS]** | 序列最前，其输出向量作为整句的表示（分类任务） |
| **[SEP]** | 分隔两个句子 |

## ML 中的 BERT

| 下游任务 | 微调方式 | 说明 |
|:--------:|:--------|------|
| **文本分类** | [CLS] 向量 → Linear → Softmax | 情感分析、意图识别 |
| **命名实体识别** | 每个 token 输出 → Linear → 标签 | 人名、地名、组织 |
| **问答系统** | 预测答案起始和结束位置 | SQuAD 数据集 |
| **文本相似度** | [CLS] 向量余弦相似度 | STS-B 任务 |
| **序列标注** | token 级输出 | POS 标注、分词 |

```python
from transformers import BertForSequenceClassification

# 加载预训练 BERT + 分类头
model = BertForSequenceClassification.from_pretrained(
    'bert-base-chinese', num_labels=2
)
```

> 参见 [[06-自注意力与Transformer]]、[[09-残差连接与LayerNorm]]、[[11-GPT与自回归生成]]、[[12-HuggingFace Transformers库]]

> **面试追问**
>
> Q1（基础）：BERT 的 Masked Language Model（MLM）预训练任务是什么？为什么对选中的 15% token 采用 80/10/10 的混合策略？
> 回答要点：随机遮盖 15% 的 token 让模型预测；80% 替换为 [MASK]、10% 替换为随机词、10% 保持不变；原因是微调阶段输入中不存在 [MASK] token，混合策略迫使模型在非 [MASK] 输入时仍关注上下文，避免预训练-微调不匹配。
>
> Q2（深挖）：从架构和预训练目标两个维度，比较 BERT 和 GPT 的核心区别。
> 回答要点：BERT 是双向编码器架构，注意力无掩码，能看全上下文；GPT 是单向解码器架构，使用掩码自注意力只能看左侧；BERT 用 MLM+NSP 预训练，天然适合理解类任务；GPT 用下一个词预测，天然适合生成类任务。
>
> Q3（实战）：你用 BERT 做文本分类时，标注数据只有几百条，如何微调效果最好？你有什么经验技巧？
> 回答要点：加载预训练权重后使用小学习率（2e-5），微调全部层或仅微调顶层分类头；使用数据增强（回译、随机替换）扩充数据；搭配分层学习率衰减或冻结底层；必要时使用 Focal Loss 处理类别不均衡。
>
> Q4（边界）：RoBERTa 等后续研究表明 BERT 的 NSP 任务并非必要。BERT 的原始设计还有哪些被后续模型改进的局限性？
> 回答要点：NSP 被 RoBERTa 证明无用，删除后效果更好；静态掩码策略不如动态掩码；BERT 无法生成文本（编码器架构的天生限制）；对句子级理解任务（如语义相似度）的效果不如句子对训练的方式。
