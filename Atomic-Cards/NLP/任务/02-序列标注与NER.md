---
author: "XunZong"
created: "2026-07-09"
tags: ["NLP", "序列标注", "NER"]
aliases: ["序列标注", "NER", "命名实体识别", "BIO标注"]
---

# 序列标注与命名实体识别（NER）

## 定义

序列标注（Sequence Labeling）是给输入序列中的**每个位置**（token）预测一个标签。本质上是一个**基于 token 的分类任务**。

给定输入序列 $\mathbf{X} = [x_1, x_2, \dots, x_n]$，模型输出每个 token 对应的标签 $\hat{y}_i$：

$$
\hat{y}_i = \arg\max_{c \in \{1,\dots,C\}} P(y_i = c \mid \mathbf{X};\theta)
$$

其中 $x_i$ 表示第 $i$ 个 token，$n$ 为序列长度，$C$ 为标签类别总数，$\theta$ 为模型参数，$P(y_i = c \mid \mathbf{X};\theta)$ 表示第 $i$ 个 token 属于类别 $c$ 的归一化概率。

## BIO 标注法

BIO 是最常用的序列标注编码方案，将每个 token 标注为三类之一：

| 标签 | 含义 | 说明 |
|:----:|:----|------|
| **B** | Begin（开始） | 实体的第一个 token |
| **I** | Inside（内部） | 实体内部的 token（非首个） |
| **O** | Outside（其他） | 非实体 token |

**示例**：`"欢迎刘德华来深圳黑马学习AI大模型"`

| 欢 | 迎 | 刘 | 德 | 华 | 来 | 深 | 圳 | 黑 | 马 | 学 | 习 | AI | 大 | 模 | 型 |
|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| O | O | B-PER | I-PER | I-PER | O | B-LOC | I-LOC | B-ORG | I-ORG | O | O | O | O | O | O |

- **PER**（Person）：刘德华
- **LOC**（Location）：深圳
- **ORG**（Organization）：黑马（机构名）

## 应用场景

| 任务 | 说明 | 标签示例 |
|:----:|:-----|:--------:|
| **命名实体识别（NER）** | 识别文本中的地名、人名、机构名等实体 | B-PER, I-PER, B-LOC, I-LOC, B-ORG, I-ORG |
| **分词任务** | 确定当前 token 是否需要分割或合并 | B, I, E, S（四词位标注） |
| **词性标注（POS Tagging）** | 标注每个词的词性（名词、动词、形容词等） | NN, VB, JJ |
| **组块分析（Chunking）** | 识别短语组块边界 | B-NP, I-NP, B-VP, I-VP |

## 计算原理（基于 BERT）

基于 BERT 的序列标注模型在编码器输出后接入分类层，流程如下：

```
[B, L, H]  →  Linear(H, C)  →  Softmax  →  ArgMax
```

1. **取每个 token 的向量**：BERT 输出每个 token 的表征，维度为 $[B, L, H]$，其中 $B$ 为批次大小，$L$ 为序列长度，$H$ 为隐藏层维度（BERT-base 为 768）。
2. **线性变换**：接入分类层 $\mathbf{W} \in \mathbb{R}^{H \times C}$ 将 $H$ 维向量映射到 $C$ 个标签类别：

   $$
   \mathbf{z}_i = \mathbf{h}_i \mathbf{W} + \mathbf{b}
   $$
   其中 $\mathbf{h}_i \in \mathbb{R}^H$ 为第 $i$ 个 token 的 BERT 输出向量，$\mathbf{W} \in \mathbb{R}^{H \times C}$ 为权重矩阵，$\mathbf{b} \in \mathbb{R}^C$ 为偏置项。
3. **归一化概率**：通过 softmax（多分类）或 sigmoid（多标签）得到每个类别的概率分布：

   $$
   P(y_i = c \mid \mathbf{X}) = \frac{\exp(z_{i,c})}{\sum_{k=1}^{C} \exp(z_{i,k})}
   $$
4. **取最大概率标签**：$\hat{y}_i = \arg\max_c P(y_i = c \mid \mathbf{X})$ 作为最终预测标签。

```python
from transformers import BertForTokenClassification

# 加载 BERT + token 级分类头，用于序列标注任务
model = BertForTokenClassification.from_pretrained(
    'bert-base-chinese',  # 中文预训练 BERT 模型
    num_labels=9          # 标签类别数（如 B-PER, I-PER, B-LOC, I-LOC, B-ORG, I-ORG, O 等）
)
```

## ML/DL 应用场景

| 应用场景 | 数学形式 | 说明 |
|:---------|:---------|:-----|
| 命名实体识别 | $\hat{y}_i = \arg\max_c P(y_i=c \mid \mathbf{X}; \theta)$ | 识别文本中的人名、地名、机构名等实体，是信息抽取的基础 |
| 分词任务 | $\hat{y}_i \in \{\text{分割}, \text{不分割}\}$ | 确定每个 token 是否需要分割，如"南京市长江大桥"的分词消歧 |
| 词性标注 | $\hat{y}_i = \arg\max_c P(\text{POS}_i=c \mid \mathbf{X})$ | 标注每个词的词性（名词、动词、形容词等），是语法分析的前置任务 |
| 生物医学 NER | $\hat{y}_i \in \{\text{B-gene}, \text{I-gene}, \text{B-protein}, \dots\}$ | 抽取基因、蛋白质、药物等生物医学实体，使用复杂标签体系（如 BIOES） |

## 面试追问

**Q1（基础）**：BIO 标注法中的 B、I、O 各代表什么含义？为什么不能只用一个标签来标记实体？
**回答要点**：

1. B（Begin）表示实体开始、I（Inside）表示实体内部、O（Outside）表示非实体。
2. 只用单个标签无法区分相邻的同类型实体（如"李明和张华"两个人名），B 标签可以明确标识新实体的开始。
3. BIO 标注方案使模型能够同时识别实体边界和实体类型，支持多实体、多类型的序列标注任务。

**Q2（深挖）**：基于 BERT 的序列标注模型在计算原理上与基于 BERT 的文本分类模型有何本质区别？
**回答要点**：

1. 文本分类取 [CLS] token 的向量做句子级分类，输出维度为 $[B, C]$；序列标注取每个 token 的向量做 token 级分类，输出维度为 $[B, L, C]$。
2. 序列标注的损失函数对所有 token 的交叉熵求和（或取平均），而文本分类只对 [CLS] 计算一次交叉熵。
3. 序列标注需考虑 token 之间的依赖关系，常结合 CRF（条件随机场）层对标签转移进行约束，而文本分类无需这种约束。

**Q3（实战）**：在做中文 NER 项目时，标注数据中实体边界不准确或存在标注不一致怎么办？你有什么经验？
**回答要点**：

1. 制定严格的标注规范并对标注人员进行培训，确保实体边界定义一致（如"刘德华"必须完整标注为 PER，不能只标"德华"）。
2. 使用标注一致性检查工具（如计算标注者间 Kappa 系数）筛选低质量样本进行复审修正。
3. 对边界模糊的样本采用"宁漏勿错"原则，只标注有明确边界的实体；训练时使用标签平滑（label smoothing）提高模型对标注噪声的鲁棒性。

**Q4（边界）**：BIO 标注方案有哪些已知的局限性？在什么场景下其他标注方案（如 BIOES）更优？
**回答要点**：

1. BIO 无法区分单字实体（B 后直接跟 O）和实体片段（B 后跟 I），BIOES 方案通过增加 E（End）和 S（Single）标签解决了这一问题。
2. 在嵌套实体（如"北京大学"既是 ORG 又包含 LOC"北京"）场景下，BIO 单层标注无法处理，需要分层标注或多标签方案。
3. 在实体类型极多或实体边界高度重叠的复杂场景（如生物医学文献 NER），BIOES 或更细粒度的标注方案能提供更精确的边界信息，但标注成本也更高。

## 参考引用

- 需要理解BERT与MLM预训练的相关知识，参见 [BERT与MLM预训练](../预训练/01-BERT与MLM预训练.md)
- 需要理解文本分类全流程的相关知识，参见 [文本分类全流程](../../机器学习/实践/01-文本分类全流程.md)
- 需要理解分词算法的相关知识，参见 [分词算法](../基础/02-分词算法.md)
- 需要理解HuggingFace Transformers库的相关知识，参见 [HuggingFace Transformers库](../预训练/03-HuggingFace Transformers库.md)