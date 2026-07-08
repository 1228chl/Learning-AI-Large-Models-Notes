---
author: "XunZong"
created: "2026-07-06"
tags: ["NLP", "FastText", "子词"]
aliases: ["FastText", "子词", "Subword", "n-gram"]
---

# FastText 与子词信息

## 定义

FastText 是 Facebook 于 2016 年提出的词向量训练工具和文本分类器，由 Word2Vec 的 Skip-gram 改进而来——每个词表示为**字符 n-gram 向量的和**，因此可以处理**未登录词（OOV）**。

$$
\text{vec}(\text{"apple"}) = \text{vec}(\text{"apple"}) + \text{vec}(\text{"<ap"}) + \text{vec}(\text{"app"}) + \text{vec}(\text{"ppl"}) + \cdots
$$

```python
from gensim.models import FastText

# 训练 FastText 词向量
model = FastText(
    sentences=sentences,        # 分词后的句子列表
    vector_size=100,             # 向量维度
    window=5,                    # 窗口大小
    min_count=1,                 # 最低词频
    min_n=3, max_n=6            # n-gram 长度范围（3~6 字符）
)

print(model.wv['自然语言'])       # 词向量
print(model.wv['自然语言处理'])   # OOV 词也能得到向量！
```

## FastText vs Word2Vec

| 对比 | Word2Vec（Skip-gram） | FastText |
|:----:|:--------------------:|:--------:|
| 词表示 | 整个词的向量 | **词向量 + 子词向量之和** |
| OOV 词 | ❌ 无法处理 | ✅ 可用子词组合表示 |
| 罕见词 | 效果差 | 利用子词信息，效果更好 |
| 训练速度 | 快 | 慢（需计算子词） |
| 参数量 | $V \times d$ | 更多（子词 n-gram 也需存储） |

## 层次 Softmax（加速训练）

FastText（和 Word2Vec）使用**层次 Softmax**（Huffman Tree）替代标准 Softmax，将计算复杂度从 $O(V)$ 降低到 $O(\log V)$ ：

```python
# 标准 Softmax：计算所有 V 个词的概率——O(V)
P(w_i) = exp(s_i) / Σ_j exp(s_j)

# 层次 Softmax：用二叉树编码，每次只需 O(log V) 次判断
# 每个叶子节点对应一个词，路径由 Huffman 编码决定
```

| 加速方法 | 原理 | 复杂度 |
|:--------:|:----:|:------:|
| 标准 Softmax | 计算所有词的概率 | $O(V)$ |
| 层次 Softmax | 二分搜索词表二叉树 | $O(\log V)$ |
| 负采样 | 只更新目标词 + K 个负样本 | $O(K+1)$ |

## FastText 文本分类

```python
# FastText 用作文本分类
import fasttext

# 训练分类器（数据格式：__label__<标签> <文本>）
model = fasttext.train_supervised(
    input="train.txt",
    lr=1.0, epoch=25, wordNgrams=2
)

# 预测
labels, probs = model.predict("今天天气真好")
print(labels, probs)
```

## ML 中的 FastText

| 应用场景 | 说明 |
|----------|------|
| **文本分类基线** | 快速构建分类模型，精度往往不错 |
| **词向量预训练** | 用大规模语料训练，作为下游模型的初始化 |
| **多语言 NLP** | 支持 157 种语言的词向量 |
| **罕见词处理** | 利用子词信息得到合理的向量表示 |

## 面试追问

**Q1（基础）**：FastText 如何解决 Word2Vec 无法处理的未登录词（OOV）问题？它的核心创新点是什么？

**回答要点**：将每个词表示为字符 n-gram 向量的和，而非整个词一个向量；OOV 词的子词片段可与训练语料中的已知子词重叠，从而组合出合理向量；字符 n-gram 信息在罕见词上也有明显提升。

**Q2（深挖）**：FastText 相对于 Word2Vec 在参数量、训练速度和内存占用上的代价是什么？这种权衡值不值？

**回答要点**：需要额外存储所有字符 n-gram 的向量，参数量显著增加；训练速度慢于 Word2Vec；对于形态丰富的语言或含大量 OOV/罕见词的场景，收益远大于代价。

**Q3（实战）**：在一个领域专有术语极多的文本分类项目中，你会选择 FastText 还是 BERT？说说你的考量。

**回答要点**：FastText 训练极快，适合做基线快速验证；BERT 精度更高但需要 GPU；工业级实践常先用 FastText 建立基线，再用知识蒸馏或小模型替代；FastText 的可解释性也更好（可直接看词向量）。

**Q4（边界）**：FastText 的子词策略在什么情况下反而会损害性能？举例说明。

**回答要点**：对于形态简单的语言（如中文），字符 n-gram 的信息增益有限；当 n-gram 长度范围选得不好时可能引入噪声；语料覆盖已很完整时子词造成不必要的存储开销；部分语言中超长的 n-gram 组合量爆炸。

> 参见 [02-词嵌入与分布式表示](./02-词嵌入与分布式表示.md)、[01-分词算法](./01-分词算法.md)、[12-向量范数](../线性代数/12-向量范数.md)