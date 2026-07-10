---
author: "XunZong"
created: "2026-07-09"
tags: ["数据库", "向量检索", "嵌入模型"]
aliases: ["BGE-M3", "多向量编码", "Multi-Vector Encoding"]
---

# BGE-M3 多向量编码模型

## BGE-M3 多向量编码模型

BGE-M3（BAAI General Embedding - **M**ulti-lingual, **M**ulti-function, **M**ulti-granularity）是北京智源人工智能研究院（BAAI）于 2024 年发布的多功能嵌入模型。

- **Multi-lingual（多语言）**：支持 100+ 语言的跨语种检索和语义匹配
- **Multi-function（多功能）**：单次前向传播**同时**输出稠密向量、稀疏向量、多向量三种表征
- **Multi-granularity（多粒度）**：支持从短句到长文档（最长 8192 Token）的编码

它对文本编码后，可**同时**输出三种表征向量，用于不同类型的检索匹配。

### 稠密向量（Dense）

低维稠密向量（默认 1024 维），使用 Transformer 输出中 `[CLS]` Token 的隐藏状态作为全局语义向量。

$$
e_q = \text{norm}(\mathrm{H}_q[0])
$$

> **变量说明**：$e_q$ 为查询的稠密向量（归一化后）；$\mathrm{H}_q$ 为 Transformer 最后一层输出的隐藏状态矩阵（形状 $L \times d$，$L$ 为序列长度，$d$ 为隐藏维度）；$\mathrm{H}_q[0]$ 取 `[CLS]` Token 对应位置的向量；$\text{norm}$ 为 L2 归一化，使向量模长为 1。

$$
s_{\text{dense}} = f_{\text{sim}}(e_q, e_p)
$$

> **变量说明**：$s_{\text{dense}}$ 为稠密向量相似度分数；$e_q$、$e_p$ 分别为查询和文档的归一化稠密向量；$f_{\text{sim}}$ 为相似度函数，可以是**余弦距离**（Cosine Similarity）、**内积**（Dot Product）或 **L2 距离**的负值。

稠密向量的核心优势在于**语义泛化**：即使查询和文档使用不同词汇表达同一含义（如"汽车"与"车辆"），它们在稠密空间中仍然距离相近。

### 稀疏向量（Sparse）

高维稀疏向量，维度等于模型词表大小（数万至百万级）。仅对输入文本中出现的 Token 赋予非零权重，类似 BM25 的精确词匹配，但权重由神经网络学习得到。

$$
w_{qt} = \text{ReLU}(W_{\text{lex}}^T \mathrm{H}_q[i])
$$

> **变量说明**：$w_{qt}$ 为查询中 Token $t$ 的稀疏权重（非负值）；$W_{\text{lex}} \in \mathbb{R}^{d \times 1}$ 为可学习的线性投影矩阵，将隐藏状态 $d$ 维映射到 1 维标量；$\mathrm{H}_q[i]$ 为 Token $i$ 对应的隐藏状态向量；$\text{ReLU}$ 确保权重非负。

$$
s_{\text{lex}} = \sum_{t \in q \cap p} (w_{qt} \times w_{pt})
$$

> **变量说明**：$s_{\text{lex}}$ 为稀疏向量相似度分数；$q \cap p$ 表示查询与文档中共同出现的 Token 集合；$w_{qt}$、$w_{pt}$ 分别为查询和文档中 Token $t$ 的稀疏权重。

稀疏向量的核心优势在于**精确命中**：对专有名词、缩写、编号等需要精确匹配的场景效果优于稠密向量。

### 多向量（Multi-Vector）

对每个 Token 维度分别进行线性变换，查询和文档各自得到一个 Token 级向量序列。通过 **MaxSim**（最大相似度）操作计算非对称交互分数。

$$
E_q = \text{norm}(W_{\text{mul}}^T H_q)
$$

> **变量说明**：$E_q$ 为查询的多向量矩阵（形状 $N \times d$，$N$ 为查询 Token 数）；$W_{\text{mul}} \in \mathbb{R}^{d \times d}$ 为可学习的线性变换矩阵；$H_q$ 为 Transformer 隐藏状态矩阵。$\text{norm}$ 对每个 Token 向量分别做 L2 归一化。

$$
s_{\text{mul}} = \frac{1}{N} \sum_{i=1}^N \max_{j=1}^M E_q[i] \cdot E_p^T[j]
$$

> **变量说明**：$s_{\text{mul}}$ 为多向量交互分数；$N$、$M$ 分别为查询和文档的 Token 数；$E_q[i]$ 为查询第 $i$ 个 Token 的多向量；$E_p[j]$ 为文档第 $j$ 个 Token 的多向量；$\max_{j=1}^M$ 对每个查询 Token $i$ 找出文档中与之最相似的 Token $j$；$\frac{1}{N} \sum_{i=1}^N$ 对所有查询 Token 的 MaxSim 分数取均值。

多向量的核心优势在于**细粒度交互**：不像稠密向量将整句压缩为一个向量，也不像稀疏向量仅依赖词重叠，而是允许一个查询 Token 与文档中的多个 Token 进行最佳匹配，捕捉更丰富的语义关联。

### 三种向量的对比

| 对比维度 | 稠密向量（Dense） | 稀疏向量（Sparse） | 多向量（Multi-Vector） |
|----------|:-----------------:|:------------------:|:----------------------:|
| **维度** | 1024（固定低维） | 词表大小（非常高维） | Token 数 $\times$ 隐藏维 |
| **匹配粒度** | 整句级语义 | 词级精确匹配 | Token 级交互匹配 |
| **核心操作** | 余弦/内积相似度 | 共现 Token 权重乘积 | MaxSim + 均值 |
| **匹配哲学** | 全局语义对齐 | 精确词汇命中 | 细粒度最近邻对齐 |
| **对偶长** | 语义泛化、同义词 | 精确术语、缩写 | 短语级细粒度匹配 |
| **计算开销** | 低 | 低 | 中等 |
| **可索引性** | 可建 ANN 索引 | 可建倒排索引 | 需特殊处理 |

## BGE-M3 底层模型架构

### 基础骨架：XLM-RoBERTa

BGE-M3 基于 **XLM-RoBERTa**（Cross-lingual Language Model - RoBERTa）构建，这是 Meta 发布的多语言版本 RoBERTa：

| 配置项 | 值 |
|:-------|:---|
| **模型类型** | `xlm-roberta`（XLMRobertaModel） |
| **隐藏维度** | 1024 |
| **前馈网络维度** | 4096 |
| **注意力头数** | 16 |
| **Transformer 层数** | 24 |
| **词表大小** | 250,002（含 100+ 语言） |
| **位置编码方式** | 绝对位置编码 |
| **最大序列长度** | **8192**（原始 XLM-RoBERTa 为 512，经 RetroMAE 扩展） |

每一层 Transformer Block 由多头自注意力（Multi-Head Self-Attention）+ 前馈网络（FFN）+ LayerNorm 组成。BGE-M3 保留 XLM-RoBERTa 的完整结构，并在其基础上添加了三种检索专用的输出头。

### 三阶段训练流程

BGE-M3 经历了三个阶段从零到完整的训练过程：

```text
阶段 1: RetroMAE 预训练
    XLM-RoBERTa (512) ──→ bge-m3-retromae (8192)
    目标：将最大序列长度从 512 扩展到 8192
    方法：RetroMAE（回溯式掩码自编码器）
    数据：Pile + mC4 + WuDao（大规模多语言语料）

阶段 2: 无监督对比学习
    bge-m3-retromae ──→ bge-m3-unsupervised (dim=1024)
    目标：学习高质量稠密嵌入
    方法：对比学习（无标注数据）

阶段 3: 统一微调（自知识蒸馏）
    bge-m3-unsupervised ──→ bge-m3 (最终模型)
    目标：联合优化稠密 + 稀疏 + 多向量三种检索模式
    核心技术：自知识蒸馏 (Self-Knowledge Distillation)
```

### 阶段一：RetroMAE 预训练

**动机**：原始 XLM-RoBERTa 的最大序列长度为 512 Token，不足以处理长文档（如学术论文、法律合同）。需要在不改变核心架构的前提下扩展上下文窗口。

**方法**：RetroMAE（Retrogressive Masked Auto-Encoder）是一种改进的掩码语言模型预训练方法，包含两个步骤：

1. **编码阶段**：对输入序列以较高掩码率（30%~50%）随机遮盖，编码器仅需处理可见 Token
2. **解码阶段**：使用一个轻量级解码器（几层 Transformer）基于编码器的隐状态重建原始序列

与标准 MLM（如 BERT 的 15% 掩码率）相比，RetroMAE 的更高掩码率迫使模型学习更长距离的依赖关系，从而能够有效扩展到 8192 Token 的上下文长度。

**输出**：`BAAI/bge-m3-retromae`（主干网络，尚无固定嵌入维度）

### 阶段二：无监督对比学习

**方法**：从 RetroMAE 检查点出发，在无标注数据上进行对比学习。核心公式：

$$
\mathcal{L}_{\text{contrast}} = -\log \frac{e^{\text{sim}(q, p^+) / \tau}}{e^{\text{sim}(q, p^+) / \tau} + \sum_{j=1}^{N} e^{\text{sim}(q, p_j^-) / \tau}}
$$

> **变量说明**：$\mathcal{L}_{\text{contrast}}$ 为对比损失；$q$ 为查询嵌入向量；$p^+$ 为正例文档（与 $q$ 语义匹配）的嵌入向量；$p_j^-$ 为第 $j$ 个负例文档（不匹配）的嵌入向量；$\text{sim}$ 为余弦相似度函数；$\tau$ 为温度参数，控制分布平滑程度。

对比学习的目标是：拉近正样本对（语义相似的句子）的距离，推远负样本对（不相似的句子）的距离。**In-batch negatives**（批次内其他样本的 query 作为当前 query 的负样本）是提高训练效率的关键技巧。

**输出**：`BAAI/bge-m3-unsupervised`（嵌入维度 1024，最大长度 8192）

### 阶段三：自知识蒸馏统一微调

这是 BGE-M3 的核心创新。训练单一模型同时支持稠密、稀疏、多向量三种检索模式，且三种模式之间通过自知识蒸馏互相增强。

**方法要点**：

1. **三头输出**：在共享的 XLM-RoBERTa 骨干网络上，附加三个独立的输出头：
   - 稠密头：取 `[CLS]` 位置输出 → Linear → L2 归一化 → 1024 维稠密向量
   - 稀疏头：每个 Token 的隐状态 → Linear → ReLU → 词表阈权重（$\mathbb{R}^{|V|}$）
   - 多向量头：每个 Token 的隐状态 → Linear → L2 归一化 → Token 级向量序列

2. **自知识蒸馏**：三头输出的融合得分作为"教师信号"，指导每个单独头部的训练：
   - 教师得分：$s_{\text{ensemble}} = s_{\text{dense}} + s_{\text{sparse}} + s_{\text{mul}}$
   - 学生目标：每个头部独立学习的损失 + 模仿教师得分的蒸馏损失

3. **MCLS（Mean of CLS）推理优化**：对长文档在推理时取多个片段 `[CLS]` 向量的均值，替代单个 `[CLS]` 向量，提升长文档检索效果。无需额外微调。

## 核心框架：FlagEmbedding

BAAI 将 BGE 系列模型封装在 **FlagEmbedding** 开源框架中：

```bash
pip install FlagEmbedding
```

```python
from FlagEmbedding import FlagModel, LayerWiseFlagLLMReranker

# BGE-M3 嵌入模型
model = FlagModel(
    'BAAI/bge-m3',
    query_instruction_for_retrieval="",
    use_fp16=True
)
embeddings = model.encode(["文本内容"])

# 混合检索：同时获取稠密和稀疏表示
from FlagEmbedding import BGEM3FlagModel
model = BGEM3FlagModel('BAAI/bge-m3', use_fp16=True)
output = model.encode(["文本"], return_dense=True, return_sparse=True, return_colbert_vecs=True)
```

FlagEmbedding 内部封装了 HuggingFace Transformers 的 `XLMRobertaModel`，并添加了稠密/稀疏/多向量三种输出头和推理逻辑。其主要依赖：

- **模型底层**：`transformers`（HuggingFace）
- **稀疏向量**：基于 Token 权重的词表级稀疏表示
- **ColBERT 多向量**：参考 ColBERT v2 的 MaxSim 交互
- **向量存储与检索**：支持集成 Milvus、Faiss、ElasticSearch

## 面试追问

**Q1（基础）**：BGE-M3 的三个 M（Multi-lingual、Multi-function、Multi-granularity）分别代表什么能力？
**回答要点**：

1. Multi-lingual：支持 100+ 语言的跨语种检索，统一模型无需按语言分开部署
2. Multi-function：单次前向传播同时输出稠密/稀疏/多向量三种表征，无需分别加载三个模型
3. Multi-granularity：支持从短句到 8192 Token 长文档的编码，覆盖不同粒度的检索需求

**Q2（深挖）**：BGE-M3 的自知识蒸馏（Self-Knowledge Distillation）技术是如何工作的？为什么能让三个头部互相增强？
**回答要点**：

1. 三头输出各自生成相似度得分，融合得分（$s_{\text{dense}} + s_{\text{sparse}} + s_{\text{mul}}$）作为"教师信号"
2. 每个头部单独训练时，不仅要拟合自己的损失，还要模仿融合得分这个更强的教师信号
3. 这种设计使三个头部在共享骨干网络的基础上通过蒸馏互相学习，训练单一模型同时获得三种能力

**Q3（实战）**：在实际 RAG 系统中，如何利用 BGE-M3 的同时输出特性设计检索策略？
**回答要点**：

1. 稠密向量做语义召回（泛化匹配），稀疏向量做精确关键词召回，两者通过 RRF 或加权融合合并结果
2. 多向量（ColBERT 风格）在短语级细粒度匹配场景中补充前两者的不足
3. 同一模型输出三种向量意味着只需部署一个服务、维护一套索引，运维成本远低于部署三个独立模型

**Q4（边界）**：BGE-M3 的 8192 Token 最大长度是通过什么技术实现的？与直接扩展位置编码的方法有何不同？
**回答要点**：

1. BGE-M3 使用 RetroMAE（回溯式掩码自编码器）将 XLM-RoBERTa 的 512 Token 扩展到 8192
2. 与直接扩展位置编码（如 RoPE 的线性插值）不同，RetroMAE 通过高掩码率训练让模型学习长距离依赖
3. 更高掩码率迫使模型关注更远的上下文线索，从而有效支持更长序列而不损失表征质量

## 参考引用
- 需要理解稠密向量与稀疏向量的区别，参见 [稠密向量与稀疏向量](16-稠密向量与稀疏向量.md)
- 需要理解混合检索与重排序的实现方法，参见 [混合检索与重排序](11-混合检索与重排序.md)
- 需要理解 RRF 排序器与加权排序的融合策略，参见 [RRF排序器与加权排序](14-RRF排序器与加权排序.md)
