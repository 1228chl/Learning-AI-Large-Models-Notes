---
author: "XunZong"
created: "2026-07-09"
tags: ["机器学习", "评估指标", "LLM"]
aliases: ["LLM评估指标", "BLEU", "ROUGE", "PPL", "困惑度"]
---

# LLM 评估指标

## 定义

LLM（大语言模型）生成任务的评估指标与传统的分类/回归指标不同，需要衡量**生成文本的质量**。核心指标包括：**BLEU**（基于精确率的 N-gram 匹配）、**ROUGE**（基于召回率的 N-gram 匹配）和 **PPL**（困惑度，衡量概率分布质量）。

> 传统 ML 评估指标关注分类正确率或回归误差，LLM 评估指标关注生成文本与参考文本的语义/词汇重合度，以及模型对序列的预测置信度。

## BLEU（Bilingual Evaluation Understudy）

BLEU 衡量候选文本（candidate）与参考文本（reference）的 **N-gram 精确匹配**程度，取值范围 $[0, 1]$，越高越好。

### 数学公式

$$BLEU = bp \cdot \exp\left(\sum_{i=1}^n w_i \log p_i\right)$$

- $bp$（Brevity Penalty）：长度惩罚系数，当 candidate 比 reference 短时惩罚得分
- $w_i$：各 N-gram 的权重，通常取均匀权重 $w_i = \frac{1}{n}$
- $p_i$：第 $i$ 阶 N-gram 的精确率，$p_i = \frac{\text{匹配的 N-gram 个数}}{\text{candidate 中 N-gram 个数}}$
- $n$：最大 N-gram 阶数，常用 $n=4$（BLEU-4）

### 修正版 Count 计算

$$count_k = \min(c_k, s_k)$$

- $c_k$：某个 N-gram 在 candidate 中出现的次数
- $s_k$：该 N-gram 在 reference 中出现的最大次数
- 取 $\min$ 防止重复词的过度加分

### 常用变种

| 变种 | 说明 |
|:----:|:-----|
| **BLEU-1** | 仅匹配 unigram（单个词） |
| **BLEU-2** | 匹配 unigram + bigram |
| **BLEU-3** | 匹配 unigram + bigram + trigram |
| **BLEU-4** | 匹配 unigram + bigram + trigram + 4-gram，最常用 |

实践中通常取 BLEU-1 到 BLEU-4 的加权平均。

### Python 示例

```python
from nltk.translate.bleu_score import sentence_bleu, SmoothingFunction

# 参考文本（reference）：标准答案
reference = [["the", "cat", "is", "on", "the", "mat"]]

# 候选文本（candidate）：模型生成的翻译结果
candidate = ["the", "cat", "sat", "on", "the", "mat"]

# 计算 BLEU-4 分数（加权平均 unigram 到 4-gram）
# 使用平滑函数避免 n-gram 未匹配时得分为零
smoothie = SmoothingFunction().method4
score = sentence_bleu(reference, candidate, smoothing_function=smoothie)
print(f"BLEU-4: {score:.4f}")  # 输出约 0.8000+

# 单独计算 BLEU-1 到 BLEU-4
for i in range(1, 5):
    weights = tuple(1.0 / i if j < i else 0.0 for j in range(4))
    score_i = sentence_bleu(reference, candidate, weights=weights, smoothing_function=smoothie)
    print(f"BLEU-{i}: {score_i:.4f}")
```

## ROUGE（Recall-Oriented Understudy for Gisting Evaluation）

ROUGE 基于**召回率**出发，衡量 reference 中有多少 N-gram 被 candidate 覆盖。与 BLEU 形成互补。

### ROUGE-N

$$ROUGE\text{-}N = \frac{\text{匹配的 N-gram 个数}}{\text{reference 中 N-gram 个数}}$$

- 分子：candidate 与 reference 中共同出现的 N-gram 数量
- 分母：reference 中 N-gram 的总数

### ROUGE-L（基于 LCS）

ROUGE-L 基于**最长公共子序列（LCS）**，同时计算精确率、召回率和 F1：

$$P_{LCS} = \frac{LCS(X, Y)}{n},\quad R_{LCS} = \frac{LCS(X, Y)}{m},\quad F_1 = \frac{2 \cdot P_{LCS} \cdot R_{LCS}}{P_{LCS} + R_{LCS}}$$

- $X$：候选文本，长度 $n$ 个词
- $Y$：参考文本，长度 $m$ 个词
- $LCS(X, Y)$：$X$ 与 $Y$ 的最长公共子序列长度
- $P_{LCS}$：基于精确率的 LCS 匹配度
- $R_{LCS}$：基于召回率的 LCS 匹配度
- $F_1$：精确率与召回率的调和平均

### Python 示例

```python
from rouge_score import rouge_scorer

# 参考文本和候选文本
reference = "the cat is on the mat"
candidate = "the cat sat on the mat"

# 初始化 ROUGE 评估器，计算 ROUGE-1、ROUGE-2、ROUGE-L
scorer = rouge_scorer.RougeScorer(["rouge1", "rouge2", "rougeL"], use_stemmer=True)

scores = scorer.score(reference, candidate)

for metric, result in scores.items():
    print(f"{metric}: P={result.precision:.4f}, R={result.recall:.4f}, F1={result.fmeasure:.4f}")

# 输出示例：
# rouge1: P=0.8333, R=0.8333, F1=0.8333
# rouge2: P=0.6000, R=0.6000, F1=0.6000
# rougeL: P=0.8333, R=0.8333, F1=0.8333
```

## PPL（Perplexity，困惑度）

PPL 衡量**概率分布或模型在预测样本时的好坏程度**。句子概率越大，困惑度越小，模型越好。

### 数学公式

$$PPL(S) = p(w_1, w_2, \dots, w_N)^{-\frac{1}{N}} = \exp\left(-\frac{1}{N} \sum_{i=1}^N \log p(w_i)\right)$$

- $S$：待评估的句子序列，共 $N$ 个词
- $w_i$：序列中第 $i$ 个词
- $p(w_i)$：模型预测第 $i$ 个词的概率（给定前 $i-1$ 个词）
- $PPL(S)$：整个句子的困惑度，值越小说明模型对句子的预测越自信

### 含义解读

- **PPL 越低**：模型对序列的预测越准确，生成的文本越流畅
- **PPL 越高**：模型对序列的预测越不确定，生成的文本可能偏离自然语言分布

### Python 示例

```python
import torch
import torch.nn.functional as F
from transformers import GPT2LMHeadModel, GPT2Tokenizer

# 加载预训练 GPT-2 模型和分词器，用于计算困惑度
model_name = "gpt2"
model = GPT2LMHeadModel.from_pretrained(model_name)
tokenizer = GPT2Tokenizer.from_pretrained(model_name)

def calculate_ppl(text: str) -> float:
    """计算给定文本的困惑度"""
    encodings = tokenizer(text, return_tensors="pt")
    input_ids = encodings.input_ids
    # 获取序列长度
    seq_len = input_ids.size(1)

    with torch.no_grad():
        outputs = model(input_ids, labels=input_ids)
        # 交叉熵损失（平均每个 token 的负对数似然）
        loss = outputs.loss
        # 困惑度 = exp(交叉熵损失)
        ppl = torch.exp(loss).item()

    return ppl

# 计算不同文本的困惑度，对比流畅度
text1 = "The cat sat on the mat."
text2 = "Cat mat on the sat the."

ppl1 = calculate_ppl(text1)
ppl2 = calculate_ppl(text2)

print(f"流畅句 PPL: {ppl1:.2f}")  # 值较小，说明模型对流畅句预测更自信
print(f"乱序句 PPL: {ppl2:.2f}")  # 值较大，说明模型对乱序句预测更不确定
```

## 对比

| 维度 | BLEU | ROUGE | PPL |
|:----:|:----:|:-----:|:---:|
| **核心视角** | 精确率（Precision） | 召回率（Recall） | 概率分布质量 |
| **依赖参考文本** | ✅ 需要 | ✅ 需要 | ❌ 不需要 |
| **适用任务** | 机器翻译、文本生成 | 摘要生成、文本生成 | 语言模型评估 |
| **计算粒度** | N-gram 精确匹配 | N-gram + LCS 匹配 | 序列概率 |
| **取值范围** | $[0, 1]$ | $[0, 1]$ | $[1, \infty)$ |
| **越高越好？** | ✅ | ✅ | ❌（越低越好） |

## ML/DL 应用场景

| 应用场景 | 说明 |
|----------|------|
| 机器翻译评估 | 使用 BLEU 衡量翻译结果与标准译文的词汇重合度 |
| 文本摘要评估 | 使用 ROUGE 衡量生成摘要与参考摘要的信息覆盖度 |
| 语言模型微调评估 | 使用 PPL 对比微调前后模型在特定语料上的预测质量 |
| 对话系统评测 | 同时使用 BLEU + ROUGE 评估生成对话的准确性和完整性 |
| 文本生成质量监控 | 使用 PPL 监控生成文本是否偏离训练数据分布 |

## 面试追问

**Q1（基础）**：BLEU 和 ROUGE 的核心区别是什么？为什么说它们分别基于精确率和召回率？
**回答要点**：

1. BLEU 从候选文本出发，看 candidate 中多少个 N-gram 在 reference 中出现过（精确率视角），惩罚候选文本过短
2. ROUGE 从参考文本出发，看 reference 中多少个 N-gram 被 candidate 覆盖到了（召回率视角），适合评估摘要任务
3. BLEU 偏向短文本，ROUGE 偏向长文本，综合使用效果更佳

**Q2（深挖）**：BLEU 为什么要引入长度惩罚系数（bp）？如果候选文本很短会怎样？
**回答要点**：

1. 没有 bp 时，候选文本越短，N-gram 匹配的比例可能越高，导致得分虚高
2. 极端情况：候选文本只包含一个完全匹配的单词，BLEU 可能接近 1.0，但信息量严重不足
3. 长度惩罚系数会对候选文本比参考文本短的情况降低得分，确保模型生成完整句子

**Q3（实战）**：在微调 GPT-2 模型前后，PPL 分别有什么变化？如何判断微调效果？
**回答要点**：

1. 在微调语料上，微调后的 PPL 应显著下降（如 50→20），说明模型对目标域数据的预测更准确
2. 在通用语料上，PPL 可能略有上升（过拟合），需配合通用测试集监控
3. 单独看 PPL 不够，需结合 BLEU/ROUGE 等指标评估生成质量，避免模型只学到重复模式

**Q4（边界）**：PPL 作为评估指标有什么局限性？什么情况下不能只看 PPL？
**回答要点**：

1. PPL 只衡量模型对 token 的预测概率，不代表生成文本的语义质量、流畅度或事实正确性
2. PPL 高度依赖分词器，不同分词器给出的 PPL 不可直接比较
3. 模型可能记忆训练数据导致 PPL 极低，但生成时只会重复训练集中的句子；需结合 BLEU/ROUGE 和人工评估

## 参考引用

- 需要理解分类与回归评估指标的相关知识，参见 [评估指标](../基础/04-评估指标.md)
- 需要理解语言模型发展脉络与核心概念，参见 [语言模型发展史](../../深度学习/LLM/01-语言模型发展史.md)
- 需要掌握交叉熵与概率分布的数学基础，参见 [损失函数：交叉熵](../../深度学习/基础/03-损失函数.md) 与 [随机变量与概率分布](../../数学基础/概率统计/03-随机变量与概率分布.md)