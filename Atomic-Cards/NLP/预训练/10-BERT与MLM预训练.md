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

## 直观理解

### 掩码语言模型的训练方式

MLM 预训练的直觉：**给模型一段挖掉部分词的文本，让模型根据上下文填空**。这迫使模型学到双向的上下文理解能力——预测"我 [MASK] 自然语言处理"时，模型需要同时看左边的"我"和右边的"自然语言处理"来推断被遮住的是"爱"。

与 GPT 的自回归语言模型（从左到右逐词预测）相比，MLM 的关键优势是**双向上下文**：模型可以同时利用被预测词左右两侧的信息，这对理解类任务至关重要。代价是训练时需要 mask 处理，且生成任务无法直接使用。

### BERT 的 "预训练-微调" 范式

BERT 的工作流程分为两个阶段：
1. **预训练**：在大规模无标注语料上通过 MLM 学习通用语言知识（语法、语义、世界知识）
2. **微调**：在特定任务的小规模标注数据上调整参数，将通用知识适配到具体任务

这类似于"先读万卷书（预训练），再学某个具体技能（微调）"。预训练阶段的无标注数据几乎是无限的（整个互联网的文本），而微调只需少量标注数据即可取得良好效果——这是 BERT 成功的关键。

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

# 从 HuggingFace Hub 加载预训练的 BERT-base 英文模型（uncased：不区分大小写）
# 该模型含 12 层 Transformer 编码器，已在超大规模英文语料上完成预训练
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

### 激活函数：GELU

BERT 在前馈网络（FFN）中使用 **GELU（Gaussian Error Linear Unit）** 而非 ReLU，使负值区域的梯度更平滑：

$$
\text{GELU}(x) = x \cdot \Phi(x)
$$

- $\Phi(x)$：标准正态分布的累积分布函数

计算中采用近似公式（RoBERTa / GPT-1/2 均使用该版本）：

$$
\text{GELU}(x) \approx 0.5x\left(1 + \tanh\left(\sqrt{\frac{2}{\pi}}(x + 0.044715x^3)\right)\right)
$$

相比 ReLU 在负值区域直接截断为零，GELU 在负值区域保留软性的非线性变换，有助于提升模型表达能力和训练稳定性。

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
# 加载带分类输出头的 BERT 模型，在预训练权重基础上添加线性分类层用于微调
model = BertForSequenceClassification.from_pretrained(
    'bert-base-chinese',  # 加载中文预训练 BERT 权重，适应中文文本分类任务

    num_labels=2           # 指定输出类别数为 2（二分类任务，如正面/负面情感）
)
```

## 面试追问

**Q1（基础）**：BERT 的 Masked Language Model（MLM）预训练任务是什么？为什么对选中的 15% token 采用 80/10/10 的混合策略？
**回答要点**：

1. MLM 随机遮盖 15% 的 token，让模型根据上下文预测被遮盖的词，从而学到双向语言表示。
2. 对选中 token 采用 80/10/10 混合策略：80% 替换为 [MASK]、10% 替换为随机词、10% 保持不变。
3. 混合策略是为了解决预训练-微调不匹配问题：微调阶段输入中不存在 [MASK] token，迫使模型在非 [MASK] 输入时仍关注上下文。

**Q2（深挖）**：从架构和预训练目标两个维度，比较 BERT 和 GPT 的核心区别。
**回答要点**：

1. 架构上：BERT 是双向编码器架构，使用全注意力能看到完整上下文；GPT 是单向解码器架构，使用掩码自注意力只能看左侧上下文。
2. 预训练目标上：BERT 使用 MLM+NSP 预训练，天然适合理解类任务；GPT 使用下一个词预测（自回归生成），天然适合生成类任务。
3. 应用上：BERT 广泛应用于文本分类、NER、问答等理解任务；GPT 广泛应用于文本生成、对话等生成任务。

**Q3（实战）**：你用 BERT 做文本分类时，标注数据只有几百条，如何微调效果最好？你有什么经验技巧？
**回答要点**：

1. 使用小学习率微调（如 2e-5），可选择微调全部层或仅微调顶层分类头并冻结底层 BERT 参数。
2. 使用数据增强技术扩充训练数据，如回译（back translation）、同义词替换等。
3. 搭配分层学习率衰减策略（底层使用更小学习率）；必要时使用 Focal Loss 处理类别不均衡。

**Q4（边界）**：RoBERTa 等后续研究表明 BERT 的 NSP 任务并非必要。BERT 的原始设计还有哪些被后续模型改进的局限性？
**回答要点**：

1. NSP 被 RoBERTa 证明并非必要，删除 NSP 后模型在下游任务上的效果反而更好。
2. BERT 使用静态掩码策略（预训练时一次性确定掩码位置），不如 RoBERTa 的动态掩码策略。
3. BERT 作为编码器架构无法直接用于文本生成（架构的天生限制）；对句子级语义理解任务的效果不如后续的句子对训练方式（如 Sentence-BERT）。

## 参考引用
- 需要理解残差连接与LayerNorm的相关知识，参见 [残差连接与LayerNorm](../组件/09-残差连接与LayerNorm.md)
- 需要理解HuggingFace Transformers库的相关知识，参见 [HuggingFace Transformers库](12-HuggingFace Transformers库.md)
- 需要理解GPT与自回归生成的相关知识，参见 [GPT与自回归生成](11-GPT与自回归生成.md)
- 需要理解自注意力与Transformer的相关知识，参见 [自注意力与Transformer](../架构/06-自注意力与Transformer.md)
- 需要理解多头注意力的相关知识，参见 [多头注意力](../架构/07-多头注意力.md)
