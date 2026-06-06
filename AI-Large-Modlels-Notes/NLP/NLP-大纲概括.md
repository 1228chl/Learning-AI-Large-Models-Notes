**下一级：** [[]]

**标签：** #NLP

---

# NLP 大纲概括

---

## 第一部分：NLP 概述与核心概念

---

### 1.1 什么是自然语言处理（NLP）？

自然语言处理是计算机科学、人工智能与语言学的交叉学科，其核心目标是**让计算机能够理解、解释、生成人类语言**。通俗地说，就是让机器“读懂”文本或语音，并做出合理的响应。

NLP 的两大子领域：

- **自然语言理解（NLU, Natural Language Understanding）**：从语言中提取意义，包括词义消歧、句法分析、语义角色标注、意图识别等。
- **自然语言生成（NLG, Natural Language Generation）**：根据结构化数据或语义表示生成自然语言文本，如自动摘要、对话生成、机器翻译中的目标语生成。

---

### 1.2 NLP 面临的主要挑战

| 挑战类型 | 说明 | 示例 |
|---------|------|------|
| 歧义性 | 词汇、句法、语义层面均存在多种可能解释 | “他吃了一个苹果公司的香蕉” – 苹果公司 ≠ 水果 |
| 上下文依赖 | 一词多义需靠上下文消解 | “我去银行取钱” vs “河边的银行” |
| 指代消解 | 代词或别名需指向真实实体 | “小明说他没有吃饭” – “他”指小明 |
| 常识推理 | 需要世界知识 | “她淋雨后感冒了” – 隐含因果关系 |
| 语言多样性 | 同一意思多种表达 | “快一点” vs “加速” |
| 低资源语言 | 缺乏标注数据 | 许多少数民族语言 |

---

### 1.3 典型应用场景

- **语音助手**（如 Siri、小爱同学）：语音识别 + NLU + 对话管理 + NLG
- **机器翻译**（如 Google Translate）：将一种语言自动转换为另一种语言
- **搜索引擎**：查询理解、相关性排序、摘要生成
- **智能客服与问答系统**：基于 FAQ 或知识库回答用户问题
- **情感分析**：判断文本情感倾向（正面/负面/中性）
- **文本分类与垃圾邮件过滤**：将文档归类到预定义标签
- **命名实体识别（NER）**：提取人名、地名、组织名等
- **文本摘要**：生成长文档的简短摘要（抽取式或生成式）

> **思考**：NLU 与 NLG 往往联合使用，例如聊天机器人先理解用户意图（NLU），再生成回复（NLG）。

---

### 1.4 数学符号与基本定义

在进入方法之前，统一符号表示：

- 一个句子（序列）由 $T$ 个词组成：$\mathbf{x} = (x_1, x_2, ..., x_T)$
- 每个词 $x_t$ 来自词汇表 $V$，通常用 one‑hot 向量或词嵌入向量表示
- 词嵌入矩阵：$\mathbf{E} \in \mathbb{R}^{|V| \times d}$，$d$ 为嵌入维度
- 对于分类任务，输出 $\hat{y} = f(\mathbf{x})$，通常是一个概率分布

---

### 1.5 PyTorch 基础：词嵌入层与简单文本分类骨架

下面展示 PyTorch 中 `torch.nn.Embedding` 的基本用法，并给出一个极简的文本分类模型（仅作 API 示意，未包含数据处理细节）。

```python
import torch
import torch.nn as nn

---

# 假设词汇表大小 1000，嵌入维度 128
vocab_size = 1000
embedding_dim = 128

embedding_layer = nn.Embedding(num_embeddings=vocab_size, embedding_dim=embedding_dim)

---

# 模拟一个 batch 的输入：3 个句子，每个句子 5 个词（词索引）
input_ids = torch.tensor([[ 12,  45,  99,   2, 341],
                          [  5, 123,   8,  12,  56],
                          [ 78,  34, 567,   1,  89]])  # shape: (batch_size=3, seq_len=5)

---

# 通过嵌入层得到词向量
embeddings = embedding_layer(input_ids)  # shape: (3, 5, 128)

print("词嵌入输出形状:", embeddings.shape)

---

# 简单分类模型：平均池化 + 线性层
class SimpleTextClassifier(nn.Module):
    def __init__(self, vocab_size, embed_dim, num_classes):
        super().__init__()
        self.embedding = nn.Embedding(vocab_size, embed_dim)
        self.fc = nn.Linear(embed_dim, num_classes)

    def forward(self, x):
        # x shape: (batch, seq_len)
        embedded = self.embedding(x)  # (batch, seq_len, embed_dim)
        # 对序列维度取平均
        pooled = embedded.mean(dim=1)  # (batch, embed_dim)
        logits = self.fc(pooled)       # (batch, num_classes)
        return logits

model = SimpleTextClassifier(vocab_size=1000, embed_dim=128, num_classes=5)
output = model(input_ids)  # (3, 5)
print("分类 logits 形状:", output.shape)
```

> 说明：实际应用中需要先构建词汇表、将文本转换为索引序列、定义 DataLoader 等。这里只展示核心 API。

---

## 第二部分：NLP 发展简史与主要范式

---

### 2.1 四个发展阶段

NLP 经历了从**小规则**到**大数据**再到**大模型**的演进，核心主线是**从符号主义到统计学习再到深度学习与预训练**。

| 阶段 | 时间 | 代表性方法 | 核心思想 |
|------|------|------------|----------|
| 1. 规则/符号主义 | 1950s–1980s | 基于人工编写规则、有限状态自动机、上下文无关文法 | 语言是符号系统，可通过逻辑规则描述 |
| 2. 统计学习 | 1990s–2010s | 隐马尔可夫模型（HMM）、最大熵模型、条件随机场（CRF）、支持向量机（SVM） | 从数据中学习概率分布，替代手工规则 |
| 3. 深度学习（非预训练） | 2013–2017 | 词向量（Word2Vec）、RNN/LSTM、CNN、Seq2Seq + Attention | 端到端学习表示，捕捉远距离依赖 |
| 4. 预训练大模型 | 2018–今 | ELMo、BERT、GPT 系列、T5、LLaMA 等 Transformer 架构 | 海量预训练 + 任务微调；涌现能力 |

---

### 2.2 关键节点与贡献

- **1950 年**：图灵提出“机器能否思考”的测试标准，启发自然语言理解。
- **1950s–1970s**：基于规则的机器翻译（如 Georgetown 实验），但效果差，导致 ALPAC 报告（1966）削减经费。
- **1980s**：统计方法开始萌芽，IBM 在机器翻译中引入基于词对齐的统计模型。
- **1990s**：隐马尔可夫模型（HMM）用于词性标注；宾州树库（Penn Treebank）推动句法分析。
- **2001 年**：神经语言模型（Bengio 等）首次使用神经网络预测下一个词。
- **2013 年**：**Word2Vec**（Mikolov 等）发布，词向量成为 NLP 的标准输入表示。
- **2014 年**：Seq2Seq + Attention（Bahdanau 等）彻底改变机器翻译。
- **2017 年**：**Transformer**（Vaswani 等）提出“Attention is All You Need”，取代 RNN。
- **2018 年**：**BERT**（Devlin 等）开启预训练微调范式，刷新 11 项 NLP 任务。
- **2020 年代**：GPT-3、ChatGPT 等大语言模型（LLM）展示出强大的少样本与指令跟随能力。

---

### 2.3 两大主要范式的对比

在 1980s–2000s 期间，NLP 曾存在激烈争论的两大阵营：

| 特征 | 基于规则（理性主义） | 基于统计（经验主义） |
|------|---------------------|----------------------|
| 知识来源 | 语言学家手工编写规则 | 从大规模语料中自动学习 |
| 优点 | 小数据或冷门领域可用；可解释性强 | 鲁棒、可扩展、覆盖长尾现象 |
| 缺点 | 规则冲突、维护难；无法覆盖未知现象 | 需要大量标注数据；可解释性较差 |
| 典型方法 | 有限状态转录机、HPSG | HMM、MEMM、CRF、统计机器翻译 |

如今，统计方法中的概率模型思想（如贝叶斯、隐变量）已深度融合到神经网络中，不再对立。

---

### 2.4 从词向量到 Transformer：数学原理简述

---

#### 2.4.1 Word2Vec（Skip‑gram 模型）

目标：给定中心词 $w_c$，最大化其上下文词 $w_o$ 出现的概率。  
使用负采样后的损失函数为：

$$
\mathcal{L} = -\sum_{(w_c, w_o) \in \text{正样本}} \log \sigma(\mathbf{u}_o^T \mathbf{v}_c) \;-\; \sum_{(w_c, w_k) \in \text{负样本}} \log \sigma(-\mathbf{u}_k^T \mathbf{v}_c)
$$

其中 $\mathbf{v}_c$ 是中心词的嵌入向量，$\mathbf{u}_o$ 是上下文词的嵌入向量，$\sigma$ 是 sigmoid 函数。训练后得到词嵌入矩阵。

---

#### 2.4.2 Transformer 自注意力机制

对于输入序列 $X \in \mathbb{R}^{T \times d}$，通过三个权重矩阵 $W^Q, W^K, W^V$ 得到 Query、Key、Value：

$$
Q = X W^Q,\quad K = X W^K,\quad V = X W^V
$$

缩放点积注意力：

$$
\text{Attention}(Q,K,V) = \text{softmax}\left( \frac{QK^T}{\sqrt{d_k}} \right) V
$$

其中 $d_k$ 为 Key 的维度，除以 $\sqrt{d_k}$ 防止梯度饱和。

多头注意力将多个注意力结果拼接后线性变换：

$$
\text{MultiHead}(Q,K,V) = \text{Concat}(\text{head}_1,...,\text{head}_h)W^O
$$

Transformer 块还包含残差连接、层归一化、前馈网络（FFN）。这一架构成为现代 NLP 的基石。

---

### 2.5 优缺点对比（传统统计 vs 深度学习 vs 预训练大模型）

| 维度 | 统计方法（HMM/CRF） | 深度非预训练（LSTM/CNN） | 预训练大模型（BERT/GPT） |
|------|---------------------|--------------------------|---------------------------|
| 所需数据量 | 中等 | 大 | 极大（预训练）+ 少量（微调） |
| 特征工程 | 需要 | 自动学习 | 自动学习+语境化表示 |
| 远距离依赖 | 有限（n-gram 受限） | 较好（LSTM 有遗忘问题） | 极好（注意力机制） |
| 上下文理解 | 静态（位置独立） | 单向或有限双向 | 深度双向或单向生成 |
| 计算资源 | 低 | 中高 | 极高（训练）/ 中等（微调） |
| 可解释性 | 中（概率图可解释） | 低 | 很低 |
| 适用场景 | 低资源、需严格可控 | 中等规模任务 | 通用任务，少样本学习 |

---

### 2.6 PyTorch 示例：用预训练 BERT 进行文本分类（API 使用）

使用 `transformers` 库加载预训练模型并微调（仅展示模型定义与训练循环的关键部分）。

```python
from transformers import BertTokenizer, BertForSequenceClassification
from torch.utils.data import DataLoader
import torch.optim as optim

---

# 1. 加载分词器和模型
model_name = "bert-base-uncased"
tokenizer = BertTokenizer.from_pretrained(model_name)
model = BertForSequenceClassification.from_pretrained(model_name, num_labels=2)  # 二分类

---

# 2. 示例输入（单个句子）
texts = ["I love this movie!", "This film is terrible."]
labels = [1, 0]  # 1=正面，0=负面

---

# 3. 对文本进行分词、填充、截断、生成 attention mask
encodings = tokenizer(texts, truncation=True, padding=True, return_tensors="pt")

---

# 4. 简单训练循环（演示）
optimizer = optim.AdamW(model.parameters(), lr=2e-5)
model.train()
for epoch in range(1):
    outputs = model(input_ids=encodings["input_ids"],
                    attention_mask=encodings["attention_mask"],
                    labels=torch.tensor(labels))
    loss = outputs.loss
    loss.backward()
    optimizer.step()
    optimizer.zero_grad()
    print(f"Loss: {loss.item()}")

---

# 5. 推理
model.eval()
with torch.no_grad():
    preds = model(input_ids=encodings["input_ids"], attention_mask=encodings["attention_mask"])
    print("Logits:", preds.logits)
    print("Predictions:", torch.argmax(preds.logits, dim=-1))
```

> **说明**：实际训练需要划分验证集、使用 DataLoader、调整学习率调度等。此示例展示 `transformers` 的高层 API 简洁性。

---

### 第二部分速查表

| 概念 | 关键点 |
|------|--------|
| 规则时代 | 小范围有效，无法扩展 |
| 统计时代 | HMM、CRF，需要特征工程 |
| 词向量 | Word2Vec、GloVe，静态表示 |
| 深度学习 | RNN/LSTM + Attention，端到端 |
| Transformer | 自注意力、并行、长距离依赖 |
| 预训练模型 | BERT（双向）、GPT（自回归） |
| 当前趋势 | LLM + 指令微调 + RLHF |

---

## 第三部分：NLP 核心任务与经典方法

本部分聚焦于 NLP 的经典任务及其中最具代表性的建模方法。这些任务构成了更高级应用（如问答、对话）的基础。

---

### 3.1 词性标注（POS Tagging）

**任务定义**：给定一个句子，为每个单词赋予一个词性标签（名词、动词、形容词等）。  
**标签集**：Penn Treebank（45 个标签，如 NN、VB、JJ）或 Universal Dependencies（17 个标签）。

---

#### 3.1.1 常用方法

| 方法 | 核心思想 | 优点 | 缺点 |
|------|----------|------|------|
| 基于规则的 Brili 标注器 | 先给每个词赋最常见标签，再应用上下文规则修正 | 可解释、无需标注数据 | 规则维护难，覆盖率有限 |
| 隐马尔可夫模型（HMM） | 联合建模标签序列与观测词：$P(T\|W) \propto P(T)P(W\|T)$ | 生成式、解码快（Viterbi） | 观测独立性假设过强 |
| 条件随机场（CRF） | 判别式直接建模标签序列的条件概率 | 可任意使用上下文特征，无独立性假设 | 训练较慢，需要特征模板 |
| BiLSTM + CRF | 双向 LSTM 捕捉上下文，CRF 解码全局最优序列 | 自动特征学习，序列准确率高 | 需要较大标注数据 |

---

#### 3.1.2 数学原理（线性链 CRF）

对于输入序列 $\mathbf{x} = (x_1,...,x_T)$ 和标签序列 $\mathbf{y} = (y_1,...,y_T)$，线性链 CRF 定义：

$$
P(\mathbf{y} | \mathbf{x}) = \frac{1}{Z(\mathbf{x})} \exp\left( \sum_{t=1}^{T} \sum_{k} \lambda_k f_k(y_{t-1}, y_t, \mathbf{x}, t) \right)
$$

其中 $f_k$ 是特征函数，$\lambda_k$ 是权重，$Z(\mathbf{x})$ 是配分函数（对所有可能标签序列求和）。  
在深度学习方法中，特征函数用 BiLSTM 输出的标签得分替代，CRF 层学习转移得分矩阵 $A_{i,j}$（从标签 i 到标签 j）。

---

#### 3.1.3 PyTorch 示例：BiLSTM+CRF 用于词性标注（核心 API 片段）

```python
import torch
import torch.nn as nn
from torchcrf import CRF   # 需要安装 pytorch-crf

class BiLSTM_CRF_POS(nn.Module):
    def __init__(self, vocab_size, tagset_size, embedding_dim, hidden_dim):
        super().__init__()
        self.embedding = nn.Embedding(vocab_size, embedding_dim)
        self.lstm = nn.LSTM(embedding_dim, hidden_dim // 2, batch_first=True, bidirectional=True)
        self.hidden2tag = nn.Linear(hidden_dim, tagset_size)
        self.crf = CRF(tagset_size, batch_first=True)

    def forward(self, x, tags=None):
        # x: (batch, seq_len)
        embeds = self.embedding(x)            # (batch, seq_len, embed_dim)
        lstm_out, _ = self.lstm(embeds)       # (batch, seq_len, hidden_dim)
        emissions = self.hidden2tag(lstm_out) # (batch, seq_len, tagset_size)
        if tags is not None:
            # 训练：计算负对数似然损失
            loss = -self.crf(emissions, tags, mask=(x != 0))  # 忽略填充位
            return loss
        else:
            # 推理：Viterbi 解码
            predictions = self.crf.decode(emissions, mask=(x != 0))
            return predictions
```

> 说明：`torchcrf` 或 `transformers` 中的 CRF 均可。实际应用需处理 padding mask。

---

#### 3.1.4 应用场景

- 作为语法分析的前置模块
- 改进分词（中文 POS 可辅助分词）
- 问答系统中识别动词短语结构

---

### 3.2 命名实体识别（NER）

**任务定义**：识别文本中的专有名词（人名、地名、组织名、日期等）。  
**典型标签方案**：BIO（Begin, Inside, Outside）或 BIOES。

---

#### 3.2.1 方法与对比

| 方法 | 特点 | 适用场景 |
|------|------|----------|
| 基于规则/字典 | 高精度、低召回 | 专业领域（如医疗术语） |
| CRF（特征工程） | 需要手工设计特征（词缀、词性、词典） | 小数据、可控性要求高 |
| BiLSTM + CRF | 主流方法（2015–2018） | 通用 NER，精度高 |
| 预训练模型（BERT） + 线性层 | 效果最好，甚至无需 CRF | 有足够计算资源 |
| 大语言模型（LLM） | 提示方式抽取实体 | 少样本、快速验证 |

---

#### 3.2.2 常用评估指标

- **精确率（Precision）** = 正确识别的实体数 / 识别出的实体总数  
- **召回率（Recall）** = 正确识别的实体数 / 样本中实体总数  
- **F1 分数** = 2 * (P * R) / (P + R)  

严格评估要求边界和类型完全正确。

---

#### 3.2.3 PyTorch 示例：使用 HuggingFace BERT 做 NER

```python
from transformers import AutoTokenizer, AutoModelForTokenClassification
from transformers import pipeline

model_name = "dslim/bert-base-NER"   # 一个预训练的 NER 模型
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForTokenClassification.from_pretrained(model_name)

nlp_ner = pipeline("ner", model=model, tokenizer=tokenizer, aggregation_strategy="simple")
text = "Apple Inc. is planning to open a new store in Beijing next year."
entities = nlp_ner(text)
for ent in entities:
    print(f"{ent['word']} -> {ent['entity_group']} (score: {ent['score']:.2f})")
```

输出示例：  
`Apple Inc. -> ORG (score: 0.99)`  
`Beijing -> LOC (score: 0.98)`

---

#### 3.2.4 应用场景

- 信息抽取（从新闻中提取公司、人物关系）
- 知识图谱构建
- 智能推荐（基于用户提及的产品实体）

---

### 3.3 句法分析（Syntactic Parsing）

---

#### 3.3.1 类型

- **成分句法分析（Constituency Parsing）**：将句子分解为名词短语（NP）、动词短语（VP）等成分，形成树结构。代表方法：基于 PCFG（概率上下文无关文法）、基于转移（Transition‑based）的神经网络。
- **依存句法分析（Dependency Parsing）**：识别词与词之间的二元依赖关系（主谓、动宾等），形成有向图。常用方法：基于图的（Eisner 算法）、基于转移的（Arc‑Eager）。

---

#### 3.3.2 依存句法的数学定义

一条依存弧 $(h, m, l)$ 表示核心词 $h$ 与修饰词 $m$ 之间有标签为 $l$ 的依赖关系。  
整个句子的依赖树需满足：唯一根节点、无环、连通。  
概率依存句法模型计算所有可能树的条件概率，输出最大生成树。

深度学习时代：用 BiLSTM 或 Transformer 为每个词对打分，然后使用 MST（最大生成树）解码（Chu–Liu–Edmonds 算法）。

---

#### 3.3.3 常用工具与模型

| 工具/模型 | 特点 |
|-----------|------|
| Stanford CoreNLP | 支持多语言，基于神经网络 |
| spaCy | 快速、工业级，支持 70+ 语言 |
| biaffine parser (Dozat & Manning, 2017) | 双仿射注意力，成为标准方法 |
| SuPar | 基于 PyTorch 的库，实现 biaffine |

---

#### 3.3.4 应用场景

- 机器翻译中对齐长距离成分
- 问答系统中提取关系三元组（通过依存路径）
- 语义角色标注（SRL）的基础

---

### 3.4 文本分类

---

#### 3.4.1 定义与变体

- **二分类/多分类**：情感分析（正面/负面）、主题分类（体育/政治/科技）
- **多标签分类**：一个文本可属于多个类别（如电影标签：动作+喜剧）
- **层次分类**：类别具有层级结构（如国家 → 省份 → 城市）

---

#### 3.4.2 方法演进

| 时期 | 代表方法 | 特点 |
|------|----------|------|
| 早期 | TF‑IDF + 朴素贝叶斯/SVM | 简单、可解释 |
| 深度初期 | word averaging / CNN / RNN | 自动特征提取 |
| 预训练 | BERT / RoBERTa 微调 | 达到人类水平 |

---

#### 3.4.3 损失函数（多分类）

使用交叉熵损失：

$$
\mathcal{L} = -\sum_{i=1}^{N} \sum_{c=1}^{C} y_{i,c} \log \hat{y}_{i,c}
$$

其中 $y_{i,c}$ 为 one‑hot 标签，$\hat{y}_{i,c}$ 为模型预测的 softmax 概率。

---

#### 3.4.4 PyTorch 示例：微调 DistilBERT 进行情感分析

```python
from transformers import DistilBertTokenizer, DistilBertForSequenceClassification
from datasets import load_dataset
from transformers import Trainer, TrainingArguments

---

# 加载 IMDB 数据集（需先安装 datasets）
dataset = load_dataset("imdb")
tokenizer = DistilBertTokenizer.from_pretrained("distilbert-base-uncased")

def tokenize(batch):
    return tokenizer(batch["text"], truncation=True, padding="max_length", max_length=512)

train_dataset = dataset["train"].map(tokenize, batched=True)
val_dataset = dataset["test"].map(tokenize, batched=True)

model = DistilBertForSequenceClassification.from_pretrained("distilbert-base-uncased", num_labels=2)

training_args = TrainingArguments(
    output_dir="./results",
    evaluation_strategy="epoch",
    num_train_epochs=2,
    per_device_train_batch_size=32,
    per_device_eval_batch_size=64,
    logging_steps=100,
)

trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=train_dataset,
    eval_dataset=val_dataset,
)

trainer.train()
```

---

#### 3.4.5 应用场景

- 垃圾邮件过滤
- 用户评论自动分类
- 新闻推荐（根据类别匹配兴趣）

---

### 3.5 序列标注的统一视角

上述任务（POS、NER、句法依存可转化为序列标注）均可视为**序列标注问题**，即对每个位置输出一个标签。通用架构：

1. **编码层**：将输入转换为上下文表示（RNN、CNN、Transformer）
2. **解码层**：输出标签分布（独立 softmax 或 CRF）

| 任务 | 标签粒度 | 约束条件 |
|------|----------|----------|
| POS | 词级标签 | 无特殊约束（但语言规则隐含） |
| NER (BIO) | 标签需符合 BIO 模式（I 不能单独出现） | CRF 强制转移约束 |
| Chunking | 短语边界 | 类似 NER 的约束 |

---

### 第三部分速查表

| 任务 | 经典方法 | 深度学习主流 | 评估指标 |
|------|----------|--------------|----------|
| 词性标注 | HMM, CRF | BiLSTM+CRF, BERT | 准确率 |
| 命名实体识别 | CRF + 特征 | BERT+线性层 | 精确率/召回率/F1 |
| 依存句法 | 基于图/转移 | biaffine parser | UAS, LAS |
| 文本分类 | TF‑IDF + SVM | BERT 微调 | Accuracy, F1 macro |

---

## 第四部分：语言模型与序列生成

语言模型（Language Model, LM）是 NLP 的核心基石，它用于计算一个词序列（句子）出现的概率，或预测下一个词。从统计 n‑gram 到神经网络，再到 Transformer 大模型，语言模型的演进推动了整个领域的突破。

---

### 4.1 语言模型的定义与评价

---

#### 4.1.1 概率定义

给定一个词序列 $w_1, w_2, ..., w_T$，语言模型计算其联合概率：

$$
P(w_1, w_2, ..., w_T) = \prod_{t=1}^{T} P(w_t \mid w_1, ..., w_{t-1})
$$

其中 $P(w_t \mid w_{1:t-1})$ 是给定历史上下文时下一个词的条件概率。

---

#### 4.1.2 评价指标：困惑度（Perplexity, PPL）

困惑度是测试集上平均负对数似然的指数形式：

$$
\text{PPL}(W_{\text{test}}) = \exp\left( -\frac{1}{N} \sum_{i=1}^{N} \log P(w_i \mid w_{<i}) \right)
$$

- PPL 越低，表示模型对测试集的预测越准确。
- 完美模型的 PPL = 1，均匀随机模型的 PPL = 词汇表大小。

---

### 4.2 传统语言模型：n‑gram

---

#### 4.2.1 马尔可夫假设

n‑gram 模型假设一个词只依赖于前面 $n-1$ 个词：

$$
P(w_t \mid w_{1:t-1}) \approx P(w_t \mid w_{t-n+1 : t-1})
$$

---

#### 4.2.2 最大似然估计与平滑

使用计数比例估计：

$$
P(w_t \mid w_{t-n+1:t-1}) = \frac{\text{count}(w_{t-n+1:t-1}, w_t)}{\text{count}(w_{t-n+1:t-1})}
$$

问题：未出现的 n‑gram 概率为 0，导致整个句子概率为 0。解决方案：**平滑技术**（如拉普拉斯平滑、Good‑Turing、Kneser‑Ney）。

---

#### 4.2.3 优缺点

| 优点 | 缺点 |
|------|------|
| 简单、训练快、可解释 | 无法捕捉长距离依赖（$n$ 通常 ≤ 5） |
| 适合小规模语言模型 | 数据稀疏严重，需要平滑 |
| 无参数搜索，确定性计算 | 泛化能力弱，无法理解词义相似性 |

> n‑gram 目前主要用于拼写纠错、简单语音识别语言模型等低资源场景，已被神经网络取代。

---

### 4.3 神经网络语言模型（NNLM）

---

#### 4.3.1 前馈神经网络语言模型（Bengio 2003）

核心思想：将词嵌入和神经网络结合。  

- 输入：前 $n-1$ 个词的词向量拼接  
- 隐藏层：激活函数（如 tanh）  
- 输出层：softmax 产生词汇表上的概率分布  

优点：自动学习词的相似性，平滑地泛化到未见 n‑gram（类似词可共享统计信息）。

---

#### 4.3.2 循环神经网络语言模型（RNN‑LM）

优点：理论上可以捕获任意长度的历史信息（无固定 n 限制）。  
问题：梯度消失/爆炸，难以学习长距离依赖（>20 步）。  
改进：LSTM、GRU 通过门控机制缓解梯度消失。

LSTM 语言模型的数学更新（简化）：

$$
\begin{aligned}
f_t &= \sigma(W_f \cdot [h_{t-1}, x_t] + b_f) \\
i_t &= \sigma(W_i \cdot [h_{t-1}, x_t] + b_i) \\
\tilde{C}_t &= \tanh(W_C \cdot [h_{t-1}, x_t] + b_C) \\
C_t &= f_t \odot C_{t-1} + i_t \odot \tilde{C}_t \\
o_t &= \sigma(W_o \cdot [h_{t-1}, x_t] + b_o) \\
h_t &= o_t \odot \tanh(C_t)
\end{aligned}
$$

输出分布：$P(w_t \mid w_{<t}) = \text{softmax}(W_{out} h_{t-1} + b_{out})$

---

#### 4.3.3 PyTorch 示例：简单 LSTM 语言模型

```python
import torch
import torch.nn as nn

class LSTMLanguageModel(nn.Module):
    def __init__(self, vocab_size, embed_dim, hidden_dim, num_layers=2):
        super().__init__()
        self.embedding = nn.Embedding(vocab_size, embed_dim)
        self.lstm = nn.LSTM(embed_dim, hidden_dim, num_layers, batch_first=True)
        self.fc = nn.Linear(hidden_dim, vocab_size)

    def forward(self, x, hidden=None):
        # x shape: (batch, seq_len)
        embeds = self.embedding(x)          # (batch, seq_len, embed_dim)
        out, hidden = self.lstm(embeds, hidden)  # out: (batch, seq_len, hidden_dim)
        logits = self.fc(out)               # (batch, seq_len, vocab_size)
        return logits, hidden

    def generate(self, start_token, max_len, temperature=1.0):
        # 自回归生成，略去详细实现（见下方文本生成节）
        pass
```

训练时使用交叉熵损失，忽略 padding。

---

### 4.4 Transformer 语言模型

---

#### 4.4.1 自回归生成模型（GPT 系列）

GPT 使用**单向（因果）注意力**：预测第 t 个词时只能看到前 t-1 个词（通过注意力掩码实现）。  
训练目标：最大化句子序列的似然（自回归）。

Transformer 语言模型相比 RNN 的优势：

- 并行计算（非自回归部分）
- 没有梯度消失问题（残差连接 + LayerNorm）
- 可以捕获极长距离依赖（通过注意力机制）

---

#### 4.4.2 掩码语言模型（BERT）

BERT 使用**双向注意力**，但训练时不作为生成式语言模型，而是使用掩码语言模型（MLM）任务：随机掩盖 15% 的词，预测被掩盖词。  
BERT 不是自回归模型，不能直接用于无条件文本生成，但可以通过 masked fill 方式做填空。

---

#### 4.4.3 两种范式对比

| 特性 | 自回归（GPT） | 双向掩码（BERT） |
|------|--------------|------------------|
| 注意力视野 | 左侧单向 | 全双向 |
| 训练目标 | 预测下一个词 | 预测被掩码的词 |
| 生成文本 | 天然支持（自回归采样） | 困难（需特殊设计） |
| 自然语言理解任务 | 需要微调或提示 | 微调后效果极佳 |
| 代表模型 | GPT-1/2/3/4, LLaMA | BERT, RoBERTa, ALBERT |

---

### 4.5 文本生成策略

在自回归生成中，给定已生成的 $w_{1:t-1}$，需要从概率分布 $P(w_t \mid w_{1:t-1})$ 中选择下一个词。常见解码策略：

---

#### 4.5.1 贪婪搜索（Greedy Search）

每次选择概率最大的词。  
**缺点**：缺少多样性，容易陷入局部最优（重复、平淡）。

---

#### 4.5.2 束搜索（Beam Search）

维护 k 条候选序列（beam size），每一步扩展所有可能的下一个词，保留总分最高的 k 个序列。  
适用于机器翻译、文本摘要等需要“最合理”输出的任务。  
**缺点**：仍倾向于短句、高概率的常见词，可能造成重复。

---

#### 4.5.3 随机采样

从分布中随机采样，概率大的词更可能被选中。  
**温度调节**：

$$
P(w_t) = \frac{\exp(z_t / \tau)}{\sum_j \exp(z_j / \tau)}
$$

其中 $z_t$ 是 logits，$\tau$ 为温度：

- $\tau < 1$：分布更尖锐，输出更确定
- $\tau > 1$：分布更平滑，输出更随机多样

---

#### 4.5.4 Top‑k 采样

只从概率最高的 k 个词中采样，过滤长尾噪声。

---

#### 4.5.5 Top‑p（核采样）

从累积概率达到 p 的最小词集中采样，动态调整候选集大小。

---

#### 4.5.6 对比示例（PyTorch）

```python
def generate_with_top_p(model, input_ids, max_len, p=0.9, temperature=1.0):
    model.eval()
    for _ in range(max_len):
        with torch.no_grad():
            logits = model(input_ids).logits   # (1, seq_len, vocab)
            next_token_logits = logits[0, -1, :] / temperature
            # 获取 top-p 候选集
            sorted_logits, sorted_indices = torch.sort(next_token_logits, descending=True)
            cumulative_probs = torch.cumsum(torch.softmax(sorted_logits, dim=-1), dim=-1)
            # 移除累积概率超过 p 的 token
            sorted_indices_to_remove = cumulative_probs > p
            # 至少保留一个 token
            sorted_indices_to_remove[1:] = sorted_indices_to_remove[:-1].clone()
            sorted_indices_to_remove[0] = False
            indices_to_remove = sorted_indices[sorted_indices_to_remove]
            next_token_logits[indices_to_remove] = -float('Inf')
            # 采样
            probs = torch.softmax(next_token_logits, dim=-1)
            next_token = torch.multinomial(probs, num_samples=1)
            input_ids = torch.cat([input_ids, next_token.unsqueeze(0)], dim=-1)
    return input_ids
```

---

### 4.6 大语言模型（LLM）的涌现能力

随着模型规模、数据和计算的增加（>10B 参数），LLM 展现出小模型不具备的能力：

- **上下文学习（In‑Context Learning）**：通过提示中的示例完成新任务，无需梯度更新
- **指令遵循（Instruction Following）**：理解并执行自然语言指令
- **思维链（Chain‑of‑Thought）**：通过中间推理步骤解决复杂问题

典型模型：GPT‑3/4、Llama 2/3、Claude、PaLM。

训练范式：

1. **预训练**：自回归语言建模（海量文本）
2. **监督微调（SFT）**：指令‑回答数据
3. **人类反馈强化学习（RLHF）**：用奖励模型优化生成质量

---

### 4.7 生成任务评估指标

| 指标 | 适用范围 | 核心思想 |
|------|----------|----------|
| 困惑度 | 语言模型内部评估 | 平均负对数似然 |
| BLEU | 机器翻译、文本生成 | n‑gram 精确匹配（考虑多个参考） |
| ROUGE | 文本摘要 | 参考召回率（ROUGE‑N, ROUGE‑L） |
| METEOR | 机器翻译 | 对齐 + 同义词/词干匹配 |
| BERTScore | 通用生成评估 | 使用 BERT 计算语义相似度 |
| 人工评估 | 对话、创意写作 | 流畅性、相关性、信息量 |

> 注意：BLEU 和 ROUGE 对词序敏感，不一定与人类判断一致，近年来基于模型（如 BERTScore、GPT‑4 作为评价器）更受关注。

---

### 第四部分速查表

| 概念 | 要点 |
|------|------|
| n‑gram | 马尔可夫假设 + 平滑，无法长距离 |
| RNN‑LM | 理论上无限历史，实际梯度衰减 |
| Transformer‑LM | 因果注意力，并行训练，长距离依赖 |
| 自回归 vs 双向 | GPT vs BERT |
| 解码策略 | 贪婪、束搜索、top‑k、top‑p、温度采样 |
| 评估 | PPL, BLEU, ROUGE, BERTScore |
| LLM 涌现 | ICL, 指令遵循, CoT |

---

## 第五部分：注意力机制与 Transformer 详解

注意力机制是现代 NLP 的基石，而 Transformer 架构完全基于注意力，摒弃了循环与卷积，实现了并行计算与长距离依赖捕获。本部分深入剖析其核心组件。

---

### 5.1 注意力机制的基本形式

---

#### 5.1.1 定义

给定一个查询（Query）向量 $\mathbf{q}$ 和一组键（Key）–值（Value）对 $\{(\mathbf{k}_i, \mathbf{v}_i)\}_{i=1}^{N}$，注意力输出为值的加权和：

$$
\text{Attention}(\mathbf{q}, \{\mathbf{k}_i, \mathbf{v}_i\}) = \sum_{i=1}^{N} \alpha_i \mathbf{v}_i, \quad \alpha_i = \frac{\exp(\text{score}(\mathbf{q}, \mathbf{k}_i))}{\sum_{j} \exp(\text{score}(\mathbf{q}, \mathbf{k}_j))}
$$

其中打分函数 `score` 常见形式：

- **点积**：$\text{score}(\mathbf{q}, \mathbf{k}) = \mathbf{q}^\top \mathbf{k}$（最常用）
- **缩放点积**：除以 $\sqrt{d_k}$ 防止方差过大
- **加性**：$\mathbf{w}^\top \tanh(\mathbf{W}_q \mathbf{q} + \mathbf{W}_k \mathbf{k})$

---

#### 5.1.2 序列到序列的注意力（以机器翻译为例）

Encoder 输出一组隐状态 $\mathbf{h}_1, ..., \mathbf{h}_T$（作为 key & value），Decoder 当前步的隐状态 $\mathbf{s}_t$ 作为 query，计算上下文向量 $\mathbf{c}_t$，再与 decoder 状态结合预测下一个词。

---

### 5.2 自注意力（Self‑Attention）

自注意力中，query、key、value 来自同一个输入序列的不同位置。对于序列 $X = [\mathbf{x}_1; \mathbf{x}_2; ...; \mathbf{x}_T] \in \mathbb{R}^{T \times d}$，线性变换得到 Q、K、V：

$$
Q = X W^Q,\quad K = X W^K,\quad V = X W^V
$$

其中 $W^Q, W^K \in \mathbb{R}^{d \times d_k}$，$W^V \in \mathbb{R}^{d \times d_v}$。  
输出：

$$
\text{SelfAttention}(X) = \text{softmax}\left( \frac{Q K^\top}{\sqrt{d_k}} \right) V \quad \in \mathbb{R}^{T \times d_v}
$$

---

#### 5.2.1 直观解释

- 每个位置的 query 与所有位置的 key 计算相似度，得到该位置对全序列的注意力分布。
- 加权求和所有位置的 value，产生该位置的新表示。
- 因此每个位置都能直接聚合全局信息，复杂度 $O(T^2 d)$。

---

### 5.3 多头注意力（Multi‑Head Attention）

将输入投影到多个不同的表示子空间，分别执行注意力，最后拼接并线性变换：

$$
\text{MultiHead}(X) = \text{Concat}(\text{head}_1, ..., \text{head}_h) W^O
$$

$$
\text{head}_i = \text{Attention}(X W_i^Q,\; X W_i^K,\; X W_i^V)
$$

其中每个头有独立的参数 $W_i^Q, W_i^K \in \mathbb{R}^{d \times d_k}$，$W_i^V \in \mathbb{R}^{d \times d_v}$，通常 $d_k = d_v = d / h$。最终输出维度恢复为 $d$。

**作用**：不同头可以关注不同类型的依赖（如局部语法、远距离语义、共指关系），增强表达能力。

---

### 5.4 Transformer 完整架构

Transformer（Vaswani et al., 2017）由 Encoder 和 Decoder 组成，每个模块堆叠 N 层。

---

#### 5.4.1 Encoder 层

每层包含两个子层：

1. **多头自注意力**（带残差连接 + 层归一化）
2. **前馈网络（FFN）**（带残差连接 + 层归一化）

FFN 是两个线性变换中间加 ReLU：

$$
\text{FFN}(x) = \max(0, x W_1 + b_1) W_2 + b_2
$$

通常内层维度 $d_{\text{ff}} = 4d$。

---

#### 5.4.2 Decoder 层

在 Encoder 基础上增加了 **Encoder‑Decoder 注意力**（交叉注意力）：query 来自 Decoder 前一层的输出，key/value 来自 Encoder 输出。  
此外，Decoder 中的自注意力需要 **带掩码（Masked）**，防止看到未来位置（使用上三角负无穷掩码）。

---

#### 5.4.3 位置编码（Positional Encoding）

由于自注意力本身不包含顺序信息，Transformer 在输入嵌入上加入位置编码。原始论文使用正弦/余弦函数：

$$
\begin{aligned}
PE_{(pos, 2i)} &= \sin\left( \frac{pos}{10000^{2i / d}} \right) \\
PE_{(pos, 2i+1)} &= \cos\left( \frac{pos}{10000^{2i / d}} \right)
\end{aligned}
$$

也可以使用可学习的位置嵌入。

---

### 5.5 数学推导（缩放点积注意力原因）

假设 $q, k$ 的各分量独立且均值为 0、方差为 1，则点积 $q \cdot k = \sum_{i=1}^{d_k} q_i k_i$ 的均值为 0，方差为 $d_k$。softmax 输入的方差过大会使梯度极小（饱和区）。除以 $\sqrt{d_k}$ 将方差拉回 1，稳定训练。

---

### 5.6 PyTorch 实现多头自注意力（不使用内置 nn.MultiheadAttention）

```python
import torch
import torch.nn as nn
import torch.nn.functional as F

class MultiHeadSelfAttention(nn.Module):
    def __init__(self, d_model, num_heads):
        super().__init__()
        assert d_model % num_heads == 0
        self.d_model = d_model
        self.num_heads = num_heads
        self.d_k = d_model // num_heads

        # 线性变换层: Q, K, V 和 输出
        self.W_q = nn.Linear(d_model, d_model)
        self.W_k = nn.Linear(d_model, d_model)
        self.W_v = nn.Linear(d_model, d_model)
        self.W_o = nn.Linear(d_model, d_model)

    def forward(self, x, mask=None):
        batch, seq_len, _ = x.shape

        # 1. 线性投影并拆分为多头
        Q = self.W_q(x).view(batch, seq_len, self.num_heads, self.d_k)
        K = self.W_k(x).view(batch, seq_len, self.num_heads, self.d_k)
        V = self.W_v(x).view(batch, seq_len, self.num_heads, self.d_k)

        # 转置为 (batch, num_heads, seq_len, d_k)
        Q = Q.transpose(1, 2)
        K = K.transpose(1, 2)
        V = V.transpose(1, 2)

        # 2. 缩放点积注意力
        scores = torch.matmul(Q, K.transpose(-2, -1)) / (self.d_k ** 0.5)  # (batch, heads, seq, seq)
        if mask is not None:
            scores = scores.masked_fill(mask == 0, float('-inf'))
        attn_weights = F.softmax(scores, dim=-1)
        context = torch.matmul(attn_weights, V)  # (batch, heads, seq, d_k)

        # 3. 合并多头并线性变换
        context = context.transpose(1, 2).contiguous().view(batch, seq_len, self.d_model)
        output = self.W_o(context)
        return output

---

# 示例
x = torch.randn(2, 10, 512)   # batch=2, seq_len=10, d_model=512
mha = MultiHeadSelfAttention(512, 8)
out = mha(x)
print(out.shape)  # torch.Size([2, 10, 512])
```

> 实际生产使用 `torch.nn.MultiheadAttention` 性能更好，但上述实现展示内部逻辑。

---

### 5.7 与 RNN/LSTM 对比

| 特性            | RNN/LSTM         | Transformer  |
| ------------- | ---------------- | ------------ |
| 计算复杂度（序列长度 T） | $O(T * d^2)$     | $O(T^2 * d)$ |
| 并行能力          | 串行，$t$ 步依赖 $t-1$ | 完全并行（自注意力）   |
| 最长依赖距离        | 理论无限，实际 ≤ 100    | 直接连接，一步可达    |
| 参数与训练         | 较难训练长序列          | 需要大量数据 & 正则化 |
| 位置信息          | 天然顺序             | 需要显式位置编码     |

---

### 5.8 常见变体与改进

| 变体                          | 核心改动                | 目的                                  |
| --------------------------- | ------------------- | ----------------------------------- |
| 相对位置编码（Relative Position）   | 注意力计算中加入位置差         | 更好地处理长度泛化                           |
| 稀疏注意力（Longformer, BigBird）  | 限制每个位置只能注意邻近或滑动窗口   | 降低 $O(T^2)$ 到 $O(T log T)$ 或 $O(T)$ |
| 跨层参数共享（ALBERT）              | 各层 Transformer 参数共享 | 减少参数量                               |
| 自适应注意力（Adaptive Span）       | 学习每个头的注意力跨度         | 平衡效率与性能                             |
| 线性注意力（Performer, Linformer） | 用核方法或低秩近似           | 将复杂度降到 $O(T)$                       |

---

### 5.9 应用场景与注意事项

- **Encoder 仅模型**：BERT、RoBERTa（适合自然语言理解）
- **Decoder 仅模型**：GPT（适合文本生成）
- **Encoder‑Decoder**：T5、BART（适合翻译、摘要等序列转换）

训练稳定性：

- 使用 LayerNorm 在前（Pre‑LN）比原始 Post‑LN 更稳定（许多现代实现采用 Pre‑LN）。
- 学习率 warmup（前若干步线性增加），防止早期梯度震荡。
- 适当使用 dropout 和标签平滑（label smoothing）。

---

### 第五部分速查表

| 组件       | 公式/操作                      | 要点          |
| -------- | -------------------------- | ----------- |
| 缩放点积注意力  | softmax(QKᵀ/√dₖ)V          | 避免梯度饱和      |
| 多头注意力    | Concat(head₁,...,head_h)Wᴼ | 多子空间关注不同模式  |
| 位置编码     | 正余弦函数或可学习                  | 注入顺序信息      |
| FFN      | max(0, xW₁+b₁)W₂+b₂        | 增加非线性能力     |
| 残差连接     | x + Sublayer(x)            | 缓解梯度消失      |
| 层归一化     | (x - μ)/σ * γ + β          | 稳定训练        |
| 掩码（Mask） | Padding 掩码 + 因果掩码          | 忽略填充/防止窥探未来 |

---

## 第六部分：分词技术与词嵌入进阶

分词是 NLP 的第一个步骤，其质量直接影响后续任务。本部分聚焦于**中文分词的特殊性**、**子词分词算法**（BPE、WordPiece、Unigram）以及**词嵌入的进阶概念**（静态 vs 上下文嵌入、位置嵌入、对比学习等）。

---

### 6.1 中文分词（CWS, Chinese Word Segmentation）

---

#### 6.1.1 为什么中文需要分词？

- 英文等语言有天然空格分隔词边界，中文句子是连续字符序列。
- 词是语义的最小独立单位，分词错误会传播到句法分析、NER、机器翻译等任务。

---

#### 6.1.2 主要方法演进

| 时期 | 方法 | 特点 |
|------|------|------|
| 早期 | 基于词典 + 正向最大匹配（FMM）/逆向最大匹配（RMM） | 速度快，但无法处理未登录词（OOV） |
| 统计时代 | 隐马尔可夫模型（HMM）、条件随机场（CRF） | 利用字符标签（B,M,E,S）进行序列标注，较好处理 OOV |
| 深度学习 | BiLSTM+CRF，或 BERT 微调 | 精度高，依赖大规模标注语料（如人民日报、CTB） |
| 大模型时代 | 直接用预训练模型（如 ERNIE、BERT）的子词分词器，避免显式分词 | 端到端，但可解释性弱 |

---

#### 6.1.3 常用的中文分词工具

- **Jieba**：基于词典 + HMM，速度快，适合简单任务
- **HanLP**：支持 CRF 和深度学习模型，功能全面
- **LTP**（哈工大）：包括分词、词性标注、依存句法
- **THULAC**（清华）：分词和词性标注联合模型
- **Pkuseg**（北大）：领域适应能力强

---

#### 6.1.4 序列标注标签方案（BIO / BMES）

| 标签 | 含义 | 示例（“我爱北京天安门”） |
|------|------|--------------------------|
| B（Begin） | 词首 | 我（S? 单字词可用 S）|
| M（Middle） | 词中 | – |
| E（End） | 词尾 | 门（E） |
| S（Single） | 单字成词 | 我（S） |

中文分词常使用 BMES 四标签集，训练一个序列标注模型（如 BiLSTM+CRF）即可。

---

### 6.2 子词分词算法（Subword Tokenization）

为了解决 OOV（未登录词）和词汇表过大问题，现代 NLP 模型使用子词分词，将罕见词拆分为更小的、常见的子词单元。

---

#### 6.2.1 Byte Pair Encoding（BPE）

BPE 原是一种数据压缩算法，后被引入 NLP（最早用于机器翻译）。

**算法步骤**：

1. 初始化词汇表为所有字符（包括空格）。
2. 统计所有相邻符号对的频次。
3. 重复合并最频繁的符号对，作为新符号加入词汇表。
4. 直到词汇表达到预定大小或合并次数达到阈值。

**编码时**：将词拆分为子词，优先使用最长匹配（贪心）。  
**示例**：  
常见 BPE 合并：`e` 和 `r` → `er`，`er` 和 `##` 可继续合并，得到 `lower`、`lowest` 等共享子词。

**变体**：GPT 系列使用 BPE（GPT-2 使用 Byte‑level BPE，支持任意 Unicode）。

---

#### 6.2.2 WordPiece（Google，BERT 使用）

与 BPE 类似，但合并准则不是最大频次，而是**最大化语言模型似然**（即合并后使得训练数据的概率提升最多）。

实际操作中，WordPiece 首先用所有字符初始化，然后迭代选择合并后能使训练集似然增加最大的子词对。BERT 的 tokenizer 就是 WordPiece。

---

#### 6.2.3 Unigram Language Model（SentencePiece 支持）

核心思想：假设所有子词独立出现，用 EM 算法学习一个子词词汇表及其概率。对于给定的句子，选择似然最高的切分方式。

Unigram 与 BPE/WordPiece 不同：

- 从一个大词汇表开始（所有可能的子词），逐步删除低频/不重要的子词。
- 最终词汇表大小可控。

---

#### 6.2.4 对比总结

| 算法 | 合并准则 | 代表模型 | 特点 |
|------|----------|----------|------|
| BPE | 最高频相邻符号对 | GPT, RoBERTa | 简单、可控，可能产生非语言学子词 |
| WordPiece | 最大化语言模型似然 | BERT, DistilBERT | 类似 BPE，更偏向语言模型 |
| Unigram | 移除最小似然贡献的子词 | XLNet, ALBERT (via SentencePiece) | 基于概率，更平滑 |

> **SentencePiece** 是一个开源工具，实现了 BPE 和 Unigram，且可以直接处理原始文本（无需预分词），支持日语、中文等无空格语言。

---

### 6.3 词嵌入进阶

---

#### 6.3.1 静态词嵌入 vs 上下文词嵌入

| 类型 | 代表 | 特点 | 缺点 |
|------|------|------|------|
| 静态（Static） | Word2Vec, GloVe, FastText | 每个词一个固定向量，与上下文无关 | 无法处理一词多义（如“bank”） |
| 上下文（Contextual） | ELMo, BERT, GPT | 根据上下文动态生成表示 | 计算开销大，需要 deep 模型 |

**FastText** 的改进：n-gram 字符级嵌入，可以生成 OOV 词的嵌入（通过子词和叠加）。

---

#### 6.3.2 位置编码的变体

Transformer 使用的位置编码（绝对正弦）外推到更长序列时性能下降。改进方法：

- **可学习位置嵌入**（如 BERT）：直接让模型学习每个位置的一个向量，但位置索引有上限。
- **相对位置编码**（Relative Position Encoding）：注意力计算时加入位置偏置，例如 $score = q_i · k_j + a_{i-j}$ ，其中 `a` 是可学习的相对距离嵌入。Transformer XL、XLNet、T5 采用此类方法。
- **旋转位置编码（RoPE，Rotary Position Embedding）**：将位置信息以旋转矩阵形式与词向量相乘，不增加参数量，且具备相对位置特性。用于 LLaMA、GPT-NeoX 等。

---

#### 6.3.3 对比学习与句子嵌入

在句子级别，为了获得鲁棒的语义表示，对比学习（Contrastive Learning）被广泛使用：

- **SimCSE**：利用 dropout 作为噪声，同一句话两次前向得到正例对，batch 内其他句子为负例，训练模型使得相似句子表示相近。
- **Sentence‑BERT**：在 BERT 上使用孪生网络和 triplet loss，用于语义相似度、聚类等。

损失函数（InfoNCE）：

$$
\mathcal{L} = -\log \frac{\exp(\text{sim}(h_i, h_i^+)/\tau)}{\sum_{j=1}^{N} \exp(\text{sim}(h_i, h_j^-)/\tau)}
$$

其中 `sim` 常为余弦相似度，`τ` 为温度超参。

---

### 6.4 PyTorch 示例：BPE 分词（使用 HuggingFace Tokenizers）

```python
from tokenizers import Tokenizer, models, trainers, pre_tokenizers

---

# 初始化一个 BPE tokenizer
tokenizer = Tokenizer(models.BPE())
tokenizer.pre_tokenizer = pre_tokenizers.ByteLevel(add_prefix_space=False)  # GPT‑2 风格

---

# 训练（需要提供文件列表）
trainer = trainers.BpeTrainer(vocab_size=30000, special_tokens=["<unk>", "<pad>"])
---

# tokenizer.train(files=["path/to/corpus.txt"], trainer=trainer)

---

# 或者使用预训练的 BERT tokenizer
from transformers import BertTokenizerFast
bert_tokenizer = BertTokenizerFast.from_pretrained("bert-base-chinese")
tokens = bert_tokenizer.tokenize("我爱北京天安门")
print(tokens)   # ['我', '爱', '北', '京', '天', '安', '门'] (中文按字切分，因为 bert-base-chinese 是词表包含汉字)
```

对于英文 BERT：`bert-base-uncased` 使用 WordPiece，会将 `"playing"` 切分为 `["play", "##ing"]`。

---

### 6.5 评估与注意事项

- **分词质量对下游任务的影响**：对于分类、情感分析等鲁棒任务，粗略分词也可接受；对于翻译、语法解析，错误的分词会降低性能。
- **领域迁移**：医学、法律等专业领域分词效果可能差，需用领域语料重新训练分词器或子词模型。
- **跨语言**：子词分词（如 SentencePiece）可以同时处理多种语言，不必依赖空格分隔。

---

### 第六部分速查表

| 概念 | 核心点 |
|------|--------|
| 中文分词 | 序列标注（BMES），常用工具 Jieba/HanLP |
| BPE | 合并高频相邻符号，贪心编码 |
| WordPiece | 最大化似然合并，BERT 使用 |
| Unigram | 从大词汇表逐步删除低概率子词 |
| SentencePiece | 直接处理原始文本，支持 BPE/Unigram |
| 静态嵌入 | Word2Vec, GloVe，无多义性 |
| 上下文嵌入 | ELMo, BERT，动态按语境变化 |
| 位置编码 | 绝对正弦 / 可学习 / 相对 / RoPE |
| 对比学习 | SimCSE, Sentence‑BERT，优化句子表示 |

---

## 第七部分：预训练与微调范式

自 BERT 于 2018 年提出后，**预训练 + 微调**成为 NLP 的主流范式。其核心思想是：在海量无标注文本上预训练一个通用语言模型，然后在少量标注数据上微调，即可取得远超从零训练的效果。

---

### 7.1 预训练-微调的核心优势

| 优势 | 说明 |
|------|------|
| 数据效率 | 下游任务仅需少量标注样本即可获得较好性能 |
| 泛化能力 | 预训练阶段学习到通用的语法、语义、世界知识 |
| 计算复用 | 同一个预训练模型可服务多个下游任务 |
| 领域适应 | 在领域语料上继续预训练可进一步提升 |

---

### 7.2 BERT：双向编码器表示

BERT（Bidirectional Encoder Representations from Transformers）是一个**多层 Transformer Encoder** 堆叠，通过两个预训练任务学习深度双向上下文表示。

---

#### 7.2.1 预训练任务

**1. 掩码语言模型（MLM, Masked Language Modeling）**

- 随机掩盖输入中 15% 的 token：
  - 80% 替换为 `[MASK]`
  - 10% 替换为随机 token
  - 10% 保持不变
- 模型需要预测被掩盖的原始 token。
- 目的：学习双向上下文，避免单向自回归的“窥探”问题。

**2. 下一句预测（NSP, Next Sentence Prediction）**

- 输入两段文本 A 和 B，判断 B 是否是 A 的下一句（50% 是，50% 随机负例）。
- 目的：让模型理解句子间的关系，对问答、自然语言推理等任务有益。
- 后续研究（如 RoBERTa）发现 NSP 并非必要，移除后性能反而提升。

---

#### 7.2.2 输入表示

每个输入 token 的最终嵌入 = **token 嵌入** + **segment 嵌入**（区分第一句和第二句）+ **position 嵌入**（可学习）。  
特殊 token：

- `[CLS]`：通常用于分类任务的输出向量
- `[SEP]`：分隔两个句子

---

#### 7.2.3 BERT 变体规模

| 模型 | 层数 | 隐层维度 | 注意力头数 | 参数量 |
|------|------|----------|------------|--------|
| BERT-base | 12 | 768 | 12 | 110M |
| BERT-large | 24 | 1024 | 16 | 340M |

---

### 7.3 主要改进与变体

---

#### 7.3.1 RoBERTa（Robustly optimized BERT approach）

- **移除 NSP**：使用更大的 batch 和更多数据训练。
- **动态掩码**：每次输入时重新随机 mask，而非静态掩码。
- **更大词汇表**：使用 Byte‑level BPE（50K 词表）。
- 结果：在 GLUE、SQuAD 等任务上显著超越 BERT。

---

#### 7.3.2 ALBERT（A Lite BERT）

- **参数共享**：跨层共享注意力与 FFN 参数，大幅减少参数量。
- **嵌入分解**：将 token 嵌入矩阵分解为两个小矩阵（`V×E` + `E×H`），其中 `E << H`。
- **SOP（Sentence Order Prediction）**：用句子顺序预测替代 NSP（正例：正常顺序；负例：交换顺序）。
- ALBERT-xxlarge 参数量仅 235M（而 BERT-large 为 340M），但效果更好。

---

#### 7.3.3 DistilBERT

- 知识蒸馏：用 BERT 作为教师，训练一个更小的学生模型（保留 95% 性能，体积减少 40%）。

---

#### 7.3.4 T5（Text‑to‑Text Transfer Transformer）

- 将所有 NLP 任务统一为文本到文本的生成框架（输入文本 → 输出文本）。
- 采用 Encoder‑Decoder 架构，预训练任务为 **Span Corruption**（遮盖连续的一段 token，要求生成被遮盖的内容）。
- 在 Colossal Clean Crawled Corpus（C4）上预训练，通过前缀提示区分任务（如 `"translate English to German: ..."`）。

---

#### 7.3.5 GPT 系列（与 BERT 对比）

GPT 是单向自回归模型（Decoder‑only），预训练任务为标准语言建模。微调时处理 NLU 任务需特殊设计（如添加 `[START]`、`[DELIM]`、`[EXTRACT]` token）。GPT‑3 及以后更强调 **上下文学习**（In‑Context Learning）而非微调。

| 特性 | BERT | GPT |
|------|------|-----|
| 架构 | Encoder only | Decoder only |
| 注意力 | 双向 | 单向（因果） |
| 预训练任务 | MLM + NSP | 自回归 LM |
| 优势任务 | 自然语言理解 | 文本生成 |
| 微调方式 | 直接加分类头 | 需适配生成格式 |

---

### 7.4 高效微调（Parameter‑Efficient Fine‑Tuning）

全参数微调（Full Fine‑Tuning）对每个下游任务都保存完整模型副本，成本高。高效微调方法只更新极少参数。

---

#### 7.4.1 Adapter

- 在 Transformer 层之间插入小型瓶颈模块（先降维、非线性、再升维）。
- 微调时冻结原模型参数，只训练 Adapter 和 LayerNorm 参数。
- 参数量通常为原始模型的 0.5%～5%。

---

#### 7.4.2 LoRA（Low‑Rank Adaptation）

- 核心思想：在预训练模型的权重矩阵旁路添加一个低秩分解矩阵。  
  对于权重 $W \in \mathbb{R}^{d \times k}$，更新时 $W' = W + BA$，其中 $B \in \mathbb{R}^{d \times r}$，$A \in \mathbb{R}^{r \times k}$，且 $r \ll \min(d, k)$。
- 微调时只更新 $A$ 和 $B$，冻结 $W$。
- 参数量极小（通常 $r=4$ 或 8），且推理时可将 $BA$ 合并到 $W$ 中，无额外延迟。

**对比**：

| 方法 | 参数量 | 推理延迟 | 适用场景 |
|------|--------|----------|----------|
| 全微调 | 100% | 无 | 资源充足 |
| Adapter | ~1% | 有轻微增加 | 多任务部署 |
| LoRA | <0.5% | 无（可合并） | 大模型高效适配 |

---

#### 7.4.3 Prefix Tuning / P‑Tuning

- 在输入序列前添加可学习的连续向量（“前缀”），微调时仅更新这些向量。
- 适用于生成任务。

---

### 7.5 PyTorch 示例：微调 BERT 进行文本分类（完整流程）

使用 HuggingFace 的 `transformers`、`datasets` 库，以情感分析为例。

```python
from transformers import AutoTokenizer, AutoModelForSequenceClassification, Trainer, TrainingArguments
from datasets import load_dataset
import numpy as np
from sklearn.metrics import accuracy_score, f1_score

---

# 1. 加载数据集（IMDB）
dataset = load_dataset("imdb")
---

# 取子集加快演示速度（可选）
small_train = dataset["train"].shuffle(seed=42).select(range(2000))
small_test = dataset["test"].shuffle(seed=42).select(range(500))

---

# 2. 加载分词器
model_name = "bert-base-uncased"
tokenizer = AutoTokenizer.from_pretrained(model_name)

def tokenize(batch):
    return tokenizer(batch["text"], truncation=True, padding="max_length", max_length=256)

train_enc = small_train.map(tokenize, batched=True)
test_enc = small_test.map(tokenize, batched=True)
train_enc.set_format("torch", columns=["input_ids", "attention_mask", "label"])
test_enc.set_format("torch", columns=["input_ids", "attention_mask", "label"])

---

# 3. 加载模型
model = AutoModelForSequenceClassification.from_pretrained(model_name, num_labels=2)

---

# 4. 定义评估指标
def compute_metrics(eval_pred):
    logits, labels = eval_pred
    preds = np.argmax(logits, axis=-1)
    acc = accuracy_score(labels, preds)
    f1 = f1_score(labels, preds)
    return {"accuracy": acc, "f1": f1}

---

# 5. 配置训练参数
training_args = TrainingArguments(
    output_dir="./bert_imdb",
    evaluation_strategy="epoch",
    save_strategy="epoch",
    num_train_epochs=2,
    per_device_train_batch_size=16,
    per_device_eval_batch_size=32,
    logging_steps=100,
    load_best_model_at_end=True,
    metric_for_best_model="accuracy",
)

---

# 6. Trainer API
trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=train_enc,
    eval_dataset=test_enc,
    compute_metrics=compute_metrics,
)

---

# 7. 训练与评估
trainer.train()
eval_results = trainer.evaluate()
print(eval_results)
```

---

#### 7.5.1 使用 LoRA 高效微调（`peft` 库）

```python
from peft import LoraConfig, get_peft_model, TaskType

lora_config = LoraConfig(
    task_type=TaskType.SEQ_CLS,   # 序列分类
    r=8,
    lora_alpha=32,
    lora_dropout=0.1,
    target_modules=["query", "value"]   # 对哪些模块添加 LoRA
)

model = AutoModelForSequenceClassification.from_pretrained(model_name, num_labels=2)
model = get_peft_model(model, lora_config)
model.print_trainable_parameters()  # 仅显示可训练参数量（远小于全量）

---

# 后续 Trainer 使用同上，但只训练 LoRA 参数
```

---

### 7.6 预训练模型的评估与选择指南

| 需求 | 推荐模型 |
|------|----------|
| 英文通用 NLU，计算资源充足 | RoBERTa-large, DeBERTa |
| 资源有限或需快速迭代 | DistilBERT, ALBERT-base |
| 中文任务 | BERT‑wwm‑ext, RoBERTa‑wwm‑ext, ERNIE 3.0 |
| 生成任务（摘要、翻译） | T5, BART, PEGASUS |
| 对话与代码生成 | GPT‑3.5/4, LLaMA‑2, CodeLlama |
| 多语言任务 | XLM‑RoBERTa, mT5 |

---

### 7.7 注意事项

- **灾难性遗忘**：微调可能破坏预训练知识，可尝试结合 adapter 或提示学习。
- **数据泄露**：预训练数据可能包含下游任务的测试集，评估时应使用未污染数据。
- **领域适应**：若预训练语料与目标领域差异大（如医疗、法律），建议先进行继续预训练（domain‑adaptive pretraining）。
- **计算资源**：全微调大模型（>1B 参数）对显存要求高，推荐使用 LoRA + 量化（QLoRA）。

---

### 第七部分速查表

| 概念      | 关键点                                        |
| ------- | ------------------------------------------ |
| 预训练-微调  | 先海量无监督预训练，后少量监督微调                          |
| BERT    | Encoder only，MLM + NSP                     |
| RoBERTa | 移除 NSP，动态掩码，更大 batch                       |
| ALBERT  | 参数共享 + 嵌入分解 + SOP                          |
| T5      | 文本到文本框架，Span Corruption                    |
| GPT     | Decoder only，自回归，少样本上下文学习                  |
| Adapter | 插入小型模块，冻结原参数                               |
| LoRA    | 低秩旁路矩阵，推理无额外开销                             |
| 评估指标    | GLUE, SuperGLUE, SQuAD（理解），BLEU, ROUGE（生成） |

---

## 第八部分：大语言模型前沿

近年来，模型规模从百万级（BERT-base）跃升至千亿甚至万亿级（GPT-4、PaLM 2）。这些大语言模型（Large Language Model, LLM）不仅延续了预训练-微调范式，更展示出小模型所不具备的**涌现能力**，彻底改变了 NLP 的研究与应用方式。

---

### 8.1 涌现能力（Emergent Abilities）

当模型参数超过某个阈值（通常约 10B），在特定任务上会突然出现显著的性能提升，这种能力在更小的模型中并不存在。

| 涌现能力 | 描述 | 示例 |
|----------|------|------|
| 上下文学习（In‑Context Learning, ICL） | 仅通过提示中的几个示例就能完成新任务，无需参数更新 | 给两个英法翻译示例，第三个直接输出译文 |
| 指令遵循（Instruction Following） | 理解自然语言指令并按指令执行 | “请将下面句子翻译成日语：‘你好’” |
| 思维链（Chain‑of‑Thought, CoT） | 生成中间推理步骤后再给出最终答案，显著提升多步推理能力 | “A 比 B 大，B 比 C 大，所以 A 比 C 大” |
| 工具使用 | 自主调用外部 API（计算器、搜索引擎、代码解释器） | 用户问“25×17 等于多少？”模型生成代码计算 |

---

### 8.2 从预训练到指令微调

传统预训练模型（如 GPT-3）虽然能进行上下文学习，但往往不直接遵循指令（例如补全而非回答问题）。**指令微调（Instruction Tuning）** 在多样化指令-回答数据上进一步训练，使模型学会遵循人类指令。

---

#### 8.2.1 典型指令微调流程

1. **收集指令数据**：从用户查询、多任务数据集（如 FLAN, SuperGLUE, 问答、摘要、翻译）构造（指令，输入，输出）三元组。
2. **有监督微调（SFT, Supervised Fine‑Tuning）**：在指令数据上继续训练语言模型，使用标准自回归损失。
3. **评估**：在 held‑out 指令集和真实用户查询上测试。

---

#### 8.2.2 代表模型

- **FLAN**（Google）：137 个任务，通过指令微调提升零样本性能。
- **T0**（HuggingFace）：将多个 NLP 任务统一为文本到文本格式，zero-shot 能力显著。
- **Alpaca**（Stanford）：从 GPT-3.5 生成 52K 指令数据，微调 LLaMA 7B 得到低成本指令模型。
- **Vicuna**（LMSYS）：从 ShareGPT 收集用户对话数据微调 LLaMA，聊天能力更强。

---

### 8.3 人类反馈强化学习（RLHF）

RLHF 让模型与人类偏好对齐，减少有害、不真实或无用输出。ChatGPT、GPT-4、Claude、LLaMA‑2‑chat 均采用此方法。

---

**三阶段流程**：

---

#### 8.3.1 步骤 1：有监督微调（SFT）

在高质量对话数据上微调预训练模型，使其初步具备对话能力。

---

#### 8.3.2 步骤 2：训练奖励模型（Reward Model, RM）

- 对于同一个提示，SFT 模型生成 $K$（通常 $K=4$ 或 9）个不同回复。
- 人类标注员对这些回复进行排序（从最好到最差）。
- 训练一个奖励模型 $r_\phi(y \mid x)$ 来预测人类偏好的分数。通常使用对比损失（Bradley–Terry 模型）：

$$
\mathcal{L} = -\mathbb{E}_{(x, y_w, y_l)} \left[ \log \sigma\left( r_\phi(x, y_w) - r_\phi(x, y_l) \right) \right]
$$

其中 $y_w$ 是偏好中更好的回复，$y_l$ 是较差的。

---

#### 8.3.3 步骤 3：使用强化学习优化（通常 PPO）

将 SFT 模型作为初始策略 $\pi^{\text{SFT}}$，通过 PPO 算法最大化奖励模型的得分，同时用 KL 散度约束避免偏离原始分布过远。

优化目标：

$$
\mathbb{E}_{x \sim D, y \sim \pi_\theta(\cdot|x)} \left[ r_\phi(x, y) \right] - \beta \cdot \mathbb{KL}\left( \pi_\theta \| \pi^{\text{SFT}} \right)
$$

其中 $\beta$ 控制 KL 惩罚强度。

---

#### 8.3.4 RLHF 的挑战

- **昂贵标注**：需要大量人类偏好比较。
- **不稳定性**：强化学习训练敏感，可能产生“奖励 hacking”。
- **模式坍塌**：模型可能只生成奖励模型偏好的高风格回复，牺牲多样性。

---

### 8.4 思维链（Chain‑of‑Thought, CoT）

思维链是一种**提示技术**，鼓励模型在给出最终答案前输出中间的推理步骤。尤其对数学、常识推理、多跳问答等需要多步逻辑的任务提升巨大。

---

#### 8.4.1 两种主要形式

| 形式 | 描述 | 示例 |
|------|------|------|
| 少样本 CoT | 在提示中提供几个带推理过程的示例 | “Q: 罗杰有 5 个网球，他买了 2 罐，每罐 3 个，现在他有几个？A: 罗杰原本有 5 个。他买了 2×3=6 个。总共 5+6=11 个。” |
| 零样本 CoT | 在问题后添加“让我们一步步思考”触发推理 | “Q: 一个农夫有 15 只鸡和 7 只兔子。总共多少条腿？A: 让我们一步步思考。” |

---

#### 8.4.2 自我一致性（Self‑Consistency）

对同一个问题多次采样 CoT 推理路径，取多数答案作为最终输出，可进一步提高准确率。

---

#### 8.4.3 思维树（Tree‑of‑Thoughts, ToT）

CoT 是线性推理链；ToT 让模型探索多个推理分支，并通过自我评估选择最优路径，在复杂规划任务上表现更好。

---

### 8.5 检索增强生成（RAG）

LLM 的知识截止于训练数据，无法回答最新或私有知识问题，且容易产生“幻觉”。**检索增强生成**（Retrieval-Augmented Generation, RAG）通过检索外部知识库来解决。

---

#### 8.5.1 基本流程

1. **索引**：将文档库切分成块，用嵌入模型（如 `text-embedding-ada-002`）编码，存入向量数据库（如 FAISS, Chroma, Pinecone）。
2. **检索**：用户查询同样编码，在数据库中检索最相关的 $k$ 个文档块。
3. **生成**：将检索到的内容与原始查询拼接成增强提示，输入 LLM 生成答案。

---

#### 8.5.2 优点

- 知识可更新：只需更新文档库，无需重新训练模型。
- 可溯源：答案可引用检索来源，减少幻觉。
- 节省参数：不需要将所有知识存储在模型参数中。

---

#### 8.5.3 变体

- **Self‑RAG**：模型自我判断是否需要检索，并可标注检索内容的可靠性。
- **REPLUG**：将检索器视为插件，端到端训练语言模型来选择检索结果。

---

#### 8.5.4 PyTorch 示例（概念性，使用 FAISS + HuggingFace）

```python
from langchain.document_loaders import TextLoader
from langchain.text_splitter import CharacterTextSplitter
from langchain.embeddings import HuggingFaceEmbeddings
from langchain.vectorstores import FAISS
from langchain.llms import HuggingFacePipeline
from langchain.chains import RetrievalQA

---

# 1. 加载文档并切分
loader = TextLoader("knowledge.txt")
documents = loader.load()
text_splitter = CharacterTextSplitter(chunk_size=500, chunk_overlap=50)
docs = text_splitter.split_documents(documents)

---

# 2. 创建嵌入与向量库
embedding_model = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
vectorstore = FAISS.from_documents(docs, embedding_model)

---

# 3. 设置检索器
retriever = vectorstore.as_retriever(search_kwargs={"k": 4})

---

# 4. 加载 LLM（本例以 GPT-2 示意，实际应用使用大模型）
from transformers import pipeline
llm = pipeline("text-generation", model="gpt2", max_new_tokens=256)

---

# 5. 创建 RAG 链
qa_chain = RetrievalQA.from_chain_type(llm=llm, chain_type="stuff", retriever=retriever)

response = qa_chain.run("公司的休假政策是什么？")
print(response)
```

> 注：生产环境通常使用 OpenAI API 或本地部署的 LLaMA 模型，并配合更高效的检索库。

---

### 8.6 LLM 评估与对齐

---

#### 8.6.1 自动评估基准

- **MMLU**（Massive Multitask Language Understanding）：57 个学科，测试知识和推理。
- **HELM**（Holistic Evaluation of Language Models）：覆盖准确性、校准、鲁棒性、公平性、偏见等。
- **HumanEval**：代码生成能力评估。
- **MT‑bench**：多轮对话质量评估。

---

#### 8.6.2 与人类对齐的核心维度

| 维度 | 描述 |
|------|------|
| 真实性 | 减少编造信息（幻觉） |
| 安全性 | 拒绝有害请求（暴力、非法） |
| 有用性 | 提供有帮助、完整的回答 |
| 诚实性 | 明确告知模型局限性（如“我不确定”） |
| 无害性 | 避免刻板印象、歧视性内容 |

---

#### 8.6.3 红队测试（Red Teaming）

请人员试图诱使模型生成有害、偏见或违规内容，据此改进安全对齐。

---

### 8.7 高效部署与量化

大模型部署需要高显存，常用技术：

| 技术 | 原理 | 效果 |
|------|------|------|
| 量化（Quantization） | 将权重从 FP16 降为 INT8 或 INT4 | 显存减少 50%～75%，速度通常提升 |
| GPTQ / AWQ | 针对生成模型的权重量化算法 | 几乎无精度损失 |
| QLoRA | 量化 + LoRA 微调 | 可以在 24GB 显存微调 33B 模型 |
| vLLM / TGI | 专用推理引擎，使用 PagedAttention 等 | 吞吐量提升 10x+ |

---

### 8.8 总结与未来方向

- **规模化**仍在继续：更大模型、更多数据、更长上下文（1M token 以上）。
- **多模态**：LLM 与视觉、语音融合（GPT‑4V, LLaVA, Flamingo）。
- **自主智能体（Agent）**：LLM 作为大脑，调用工具、规划动作、与外部环境交互。
- **边缘端 LLM**：高效小模型（Phi‑2, MobileLLaMA）可在手机、嵌入式设备运行。
- **可解释性与控制**：稀疏自编码器（SAE）机制解释、概念干预等。

---

### 第八部分速查表

| 概念 | 关键点 |
|------|--------|
| 涌现能力 | 参数超阈值后突然出现的 ICL、指令遵循、CoT 等 |
| 指令微调 | 在多样化（指令，输入，输出）数据上微调，增强遵循指令能力 |
| RLHF | SFT → RM → PPO，使模型与人类偏好对齐 |
| CoT | 生成中间推理步骤，提高多步推理准确率 |
| RAG | 检索外部知识注入提示，减少幻觉，知识可更新 |
| 评估 | MMLU, HELM, MT‑bench，红队测试 |
| 部署 | 量化（INT4/8）、QLoRA、vLLM |

---

## 第九部分：NLP 工程实践与工具生态

将 NLP 模型从研究原型落地为生产系统，需要掌握一系列工程实践：数据预处理、框架选择、模型压缩、推理优化、MLOps 等。本部分聚焦于实际开发中的关键环节与主流工具。

---

### 9.1 文本数据预处理

---

#### 9.1.1 常见预处理步骤

| 步骤 | 说明 | 常用工具/方法 |
|------|------|--------------|
| 清洗 | 去除 HTML 标签、特殊字符、多余空白 | `BeautifulSoup`, `re` |
| 标准化 | 统一大小写（英文）、全角/半角转换、Unicode 规范化 | `str.lower()`, `unicodedata.normalize` |
| 分词（Tokenization） | 将文本切分为词或子词 | `nltk`, `spaCy`, `transformers.AutoTokenizer` |
| 停用词过滤 | 移除高频无意义词（可选，视任务而定） | `nltk.corpus.stopwords` |
| 词形还原 / 词干提取 | 将单词转换为规范形式 | `nltk.WordNetLemmatizer`, `spaCy` |
| 构建词汇表 | 统计词频，设定最小频次，处理未登录词 | 手工或 `tokenizer.train()` |

> **注意**：对于预训练模型（BERT 等），通常只调用其对应的 tokenizer，不需要额外清洗或停用词过滤，因为模型已经适应原始文本。

---

#### 9.1.2 数据增强（缓解小样本）

- **回译**：原文 → 中间语言（如德语）→ 回译成原文，生成同义变体。
- **随机替换**：同义词替换、随机删除、交换词序。
- **噪声注入**：拼写错误、插入空白。
- **生成式增强**：使用 T5、LLaMA 生成相似句子（需控制语义不漂移）。

---

### 9.2 主流 NLP 框架与库

| 框架 | 定位 | 优点 | 缺点 |
|------|------|------|------|
| **HuggingFace Transformers** | 预训练模型统一接口 | 支持几乎所有 SOTA 模型，生态完善（datasets, evaluate, PEFT） | 学习曲线略陡 |
| **spaCy** | 工业级 NLP 管道 | 快速、易用、内置多种语言模型、支持生产部署 | 自定义深度学习扩展较繁琐 |
| **NLTK** | 教学与研究 | 经典算法丰富，适合学习 | 速度慢，不推荐生产 |
| **AllenNLP** | 研究框架 | 模块化设计，方便复现论文 | 社区活跃度下降 |
| **Stanford CoreNLP** | 多语言、多任务工具包 | 稳定性高，提供 Java/Python 接口 | 较重，不便于 GPU 训练 |
| **Fairseq**（Meta） | 序列生成任务 | 高效、支持分布式训练、内置翻译/语言模型 | 文档较少 |
| **DeepSpeed**（MS） | 大规模训练优化 | ZeRO 优化、混合精度、高效并行 | 需配合 PyTorch 使用 |

---

#### 9.2.1 HuggingFace 生态核心组件

```python
---

# 1. transformers：加载模型、分词器
from transformers import AutoModel, AutoTokenizer

---

# 2. datasets：加载、处理、缓存数据集
from datasets import load_dataset
dataset = load_dataset("imdb")

---

# 3. evaluate：评估指标统一接口
from evaluate import load
accuracy = load("accuracy")
accuracy.compute(predictions=[0,1], references=[0,1])

---

# 4. PEFT：参数高效微调（LoRA, Adapter）
from peft import LoraConfig, get_peft_model

---

# 5. accelerate：分布式训练简化
from accelerate import Accelerator
accelerator = Accelerator()
```

---

### 9.3 模型压缩与加速

生产环境常需减少模型大小和推理延迟。

---

#### 9.3.1 压缩技术对比

| 技术 | 原理 | 精度损失 | 压缩率 | 推理加速 |
|------|------|----------|--------|----------|
| 量化（INT8/INT4） | 降低权重和激活精度 | 较小（<1%） | 4x～8x | 2x～4x（硬件支持） |
| 剪枝（Pruning） | 移除不重要权重/神经元 | 中等到大（需重训练） | 2x～10x | 1.5x～3x |
| 知识蒸馏（Distillation） | 用小模型模仿大模型输出 | 中等到小 | 5x～20x | 5x～20x |
| 低秩分解（LoRA, SVD） | 用低秩矩阵近似 | 小 | 2x | 无加速（推理时可合并） |

---

#### 9.3.2 常用工具

- **PyTorch 自带量化**：`torch.quantization.quantize_dynamic`（动态量化）用于 LSTM、Linear 层。
- **Intel Neural Compressor**：支持 INT8 量化、剪枝、蒸馏，与 HuggingFace 集成。
- **TensorRT**（NVIDIA）：针对 GPU 的高性能推理优化，支持 INT8/FP16。
- **ONNX Runtime**：跨平台推理，支持量化、图优化。
- **GGUF / llama.cpp**：专为 CPU 推理设计的大模型量化格式（4-bit），可在普通笔记本运行 LLaMA 7B/13B。

---

#### 9.3.3 PyTorch 动态量化示例（BERT 分类）

```python
import torch
from transformers import AutoModelForSequenceClassification

model = AutoModelForSequenceClassification.from_pretrained("bert-base-uncased")
model.eval()

---

# 动态量化：仅对 Linear 层进行 INT8 量化
quantized_model = torch.quantization.quantize_dynamic(
    model, {torch.nn.Linear}, dtype=torch.qint8
)

---

# 比较大小
def print_model_size(model):
    param_size = sum(p.numel() * p.element_size() for p in model.parameters())
    print(f"Model size: {param_size / 1024 / 1024:.2f} MB")

print_model_size(model)          # ~420 MB (FP32)
print_model_size(quantized_model) # ~110 MB (INT8)
```

---

### 9.4 推理优化策略

---

#### 9.4.1 批处理（Batching）

- 将多个请求合并为一个 batch，减少内核启动开销。
- 动态 batching：不等长序列需使用 padding + attention mask，或使用 **动态填充**（每 batch 内按最长样本填充）。

---

#### 9.4.2 缓存（KV Cache）

- 自回归生成时，将之前 token 的 Key 和 Value 缓存起来，避免重复计算。在 GPT、LLaMA 推理中至关重要，可将生成加速数倍。

---

#### 9.4.3 推测解码（Speculative Decoding）

- 使用一个快速的草稿模型先生成多个 token，再用目标模型并行验证，接受正确 token，丢弃错误的。在几乎不损失精度的情况下提升 2x～3x 生成速度。

---

#### 9.4.4 推理引擎

| 引擎 | 特点 |
|------|------|
| **vLLM** | PagedAttention 技术，极高吞吐，支持连续批处理，兼容 HuggingFace 模型 |
| **HuggingFace TGI** | 专门为大模型设计的生产级推理，支持流式输出、并行计算 |
| **DeepSpeed MII** | 基于 DeepSpeed 的高速推理，支持多 GPU |
| **FastChat (LMSYS)** | 提供 WebUI 和高效的 vLLM 集成 |

---

### 9.5 MLOps for NLP

将 NLP 模型持续集成、部署、监控。

---

#### 9.5.1 实验跟踪与模型注册

- **Weights & Biases (wandb)**：超参、指标、可视化集成。
- **MLflow**：开源，支持模型打包、注册、部署。
- **TensorBoard**：基础但依然有效。

---

#### 9.5.2 模型服务化

- **FastAPI + Transformers**：轻量级自建服务。
- **BentoML**：将模型打包为 REST/gRPC 服务，支持自动缩放。
- **KServe**（Kubernetes 原生）：用于大规模模型推理。
- **TorchServe**：PyTorch 官方服务框架，支持多版本管理。

---

#### 9.5.3 持续集成与数据漂移

- **DVC**：数据版本控制。
- **Great Expectations**：数据质量验证。
- **Evidently AI**：监控模型性能和数据漂移（如特征分布变化、预测分布偏移）。

---

#### 9.5.4 典型工作流示例（简化版）

```bash
---

# 1. 数据版本管理
dvc add data/raw.csv
git add data/raw.csv.dvc

---

# 2. 训练脚本（wandb 记录）
python train.py --lr 2e-5 --model bert-base

---

# 3. 模型注册（MLflow）
mlflow models register -m runs:/<run_id>/model -n bert-imdb

---

# 4. 部署为 REST API（BentoML）
bentoml build
bentoml serve

---

# 5. 监控（Evidently）
evidently run monitoring --reference data/train.csv --current data/production.csv
```

---

### 9.6 常用数据集与基准

| 数据集 | 任务 | 规模 | 常用指标 |
|--------|------|------|----------|
| GLUE / SuperGLUE | 多任务理解 | 9～10 个任务 | 平均准确率 / F1 |
| SQuAD 2.0 | 问答（阅读理解） | ~150k 问答对 | EM, F1 |
| IMDB | 情感分析 | 50k 影评 | 准确率 |
| CoNLL‑2003 | NER | 英/德新闻 | F1 |
| WMT | 机器翻译 | 百万级句子对 | BLEU |
| CNN / DailyMail | 摘要 | 300k 文章 | ROUGE |
| HumanEval | 代码生成 | 164 个编程问题 | Pass@k |

---

### 9.7 实践常见陷阱与建议

1. **数据泄露**：预处理时确保训练/验证/测试分离（如标准化参数只在训练集上计算）。
2. **标签不平衡**：使用加权损失、过采样、Focal Loss。
3. **过长序列**：长文本分类可截断或采用 Longformer、BigBird 等。
4. **OOV 处理**：子词分词器几乎消除 OOV，但自定义词典需重新训练 tokenizer。
5. **大模型部署内存不足**：量化、卸载到 CPU（accelerate 的 `device_map="auto"`）、使用 vLLM。
6. **推理延迟不稳定**：避免动态 batch 过大，启用 warm‑up，使用异步请求处理。

---

### 第九部分速查表

| 领域 | 推荐工具/方法 |
|------|----------------|
| 预处理 | `transformers` tokenizer, `spaCy`, `nltk` |
| 数据增强 | 回译，同义词替换，生成式 |
| 框架 | HuggingFace, spaCy, Fairseq |
| 压缩 | INT8 量化，蒸馏（DistilBERT），剪枝 |
| 推理优化 | vLLM, TGI, KV Cache, 推测解码 |
| MLOps | wandb, MLflow, BentoML, Evidently AI |
| 基准 | GLUE, SQuAD, WMT, HumanEval |

---

## 第十部分：综合总结与学习资源推荐

经过前面九个部分的系统学习，我们已经覆盖了 NLP 从基础概念到前沿大模型的完整知识体系。本部分作为收尾，提炼核心脉络，并提供精心挑选的学习资源，帮助您持续深入。

---

### 10.1 知识体系总览

以下以表格形式概括九大主题的核心要点，便于快速回顾与自查。

| 部分 | 主题 | 核心概念 | 关键模型/方法 | 工程关键词 |
|------|------|----------|----------------|--------------|
| 1 | 概述与基本概念 | NLU vs NLG，歧义性，应用场景 | – | 词嵌入，序列标注 |
| 2 | 发展简史与范式 | 规则 → 统计 → 深度学习 → 预训练 | Word2Vec, Transformer | 词向量，自注意力 |
| 3 | 核心任务与经典方法 | POS, NER, 句法分析, 文本分类 | HMM, CRF, BiLSTM-CRF, biaffine | 序列标注，BIO 标签 |
| 4 | 语言模型与生成 | n‑gram, RNN‑LM, 自回归生成 | LSTM, GPT, 解码策略（top‑p, beam search） | 困惑度，BLEU |
| 5 | 注意力与 Transformer | 自注意力，多头注意力，位置编码 | Transformer Encoder/Decoder | 残差连接，层归一化 |
| 6 | 分词与词嵌入 | BPE, WordPiece, Unigram, 静态/上下文嵌入 | SentencePiece, FastText | 子词分词，对比学习 |
| 7 | 预训练与微调 | MLM, NSP, 参数高效微调 | BERT, RoBERTa, ALBERT, LoRA | GLUE, Adapter |
| 8 | 大语言模型前沿 | 涌现能力，RLHF，CoT，RAG | GPT-3/4, LLaMA, FLAN | 指令微调，思维链，向量数据库 |
| 9 | 工程实践与工具 | 预处理，量化，推理优化，MLOps | HuggingFace, vLLM, ONNX, Weights & Biases | 动态量化，KV Cache |

---

### 10.2 必读经典论文

按主题分类，建议由浅入深阅读。

---

#### 10.2.1 基础与词向量

- **Word2Vec**：Mikolov et al., “Efficient Estimation of Word Representations in Vector Space” (2013)
- **GloVe**：Pennington et al., “GloVe: Global Vectors for Word Representation” (2014)

---

#### 10.2.2 序列建模与注意力

- **Seq2Seq + Attention**：Bahdanau et al., “Neural Machine Translation by Jointly Learning to Align and Translate” (2015)
- **Transformer**：Vaswani et al., “Attention Is All You Need” (2017)

---

#### 10.2.3 预训练模型

- **ELMo**：Peters et al., “Deep contextualized word representations” (2018)
- **BERT**：Devlin et al., “BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding” (2019)
- **GPT-2**：Radford et al., “Language Models are Unsupervised Multitask Learners” (2019)
- **RoBERTa**：Liu et al., “RoBERTa: A Robustly Optimized BERT Pretraining Approach” (2019)
- **T5**：Raffel et al., “Exploring the Limits of Transfer Learning with a Unified Text-to-Text Transformer” (2020)

---

#### 10.2.4 大语言模型与对齐

- **GPT-3**：Brown et al., “Language Models are Few-Shot Learners” (2020)
- **Chain‑of‑Thought**：Wei et al., “Chain-of-Thought Prompting Elicits Reasoning in Large Language Models” (2022)
- **RLHF**：Ouyang et al., “Training language models to follow instructions with human feedback” (2022) – InstructGPT
- **LLaMA**：Touvron et al., “LLaMA: Open and Efficient Foundation Language Models” (2023)

---

#### 10.2.5 高效微调与压缩

- **LoRA**：Hu et al., “LoRA: Low-Rank Adaptation of Large Language Models” (2021)
- **QLoRA**：Dettmers et al., “QLoRA: Efficient Finetuning of Quantized LLMs” (2023)

---

#### 10.2.6 检索增强

- **RAG**：Lewis et al., “Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks” (2020)

---

### 10.3 经典课程（免费在线）

| 课程名称 | 机构 | 适合阶段 | 备注 |
|----------|------|----------|------|
| CS224n: Natural Language Processing with Deep Learning | Stanford | 中级 | 2019/2021 版视频 + 作业，含 Transformer 和 BERT 详细讲解 |
| CMU CS11-747: Neural Networks for NLP | CMU | 高级 | 研究生水平，涵盖图神经网络、结构化预测等 |
| HuggingFace NLP Course | HuggingFace | 初级至中级 | 交互式 notebook，手把手教 transformers 使用 |
| Fast.ai Practical Deep Learning for Coders | Fast.ai | 初级 | 第 8 课以后涵盖 NLP（ULMFiT，Transformer） |
| NYU David Bau’s NLP Course | NYU | 中级 | 结合 PyTorch 和现代实践，包括生成模型 |

---

### 10.4 开源项目与代码库

---

#### 10.4.1 学习与实验

- **Transformers** (HuggingFace) – [github.com/huggingface/transformers](https://github.com/huggingface/transformers)  
  ⭐ 最核心的预训练模型库，包含所有主流模型的 PyTorch/TensorFlow 实现。
- **Datasets** & **Evaluate** – 同上组织，用于快速加载基准数据集并评估。
- **PEFT** – [github.com/huggingface/peft](https://github.com/huggingface/peft)  
  实现 LoRA、Prefix Tuning 等高效微调方法。
- **Sentence Transformers** – [sbert.net](https://www.sbert.net)  
  生成高质量句子嵌入，用于语义搜索、聚类。

---

#### 10.4.2 大模型训练与推理

- **vLLM** – [github.com/vllm-project/vllm](https://github.com/vllm-project/vllm)  
  目前最流行的高吞吐量 LLM 推理引擎，支持 PagedAttention。
- **DeepSpeed** – [github.com/microsoft/DeepSpeed](https://github.com/microsoft/DeepSpeed)  
  大规模训练（ZeRO-3）和推理（DeepSpeed Inference）。
- **LLaMA.cpp** – [github.com/ggerganov/llama.cpp](https://github.com/ggerganov/llama.cpp)  
  在 CPU 上高效运行量化 LLaMA 模型。
- **LangChain** – [github.com/langchain-ai/langchain](https://github.com/langchain-ai/langchain)  
  基于 LLM 构建应用（RAG、Agent、链式调用）。

---

#### 10.4.3 中文 NLP

- **LTP** (哈工大) – 分词、词性标注、依存句法分析等。
- **HanLP** – 功能全面，支持深度学习模型和 REST API。
- **Chinese-BERT-wwm** – 哈工大发布的全词掩码 BERT。

---

### 10.5 进阶学习路径

根据您的兴趣和职业方向，推荐以下进阶专题：

---

#### 方向 A：大模型应用开发

- 掌握 **LangChain** 或 **LlamaIndex** 构建 RAG 应用。
- 学习 **提示工程**（Prompt Engineering）技巧：few‑shot, CoT, 自洽性。
- 部署开源模型（LLaMA‑3, Mistral, Qwen）并使用 **vLLM** 或 **ollama**。
- 学习 **评估与监控**：使用 HELM、MT‑bench 或 LangSmith。

---

#### 方向 B：NLP 研究与前沿

- 深入 **多模态**：CLIP, BLIP, LLaVA，以及视觉指令微调。
- 研究 **长文本建模**：Ring Attention, 稀疏注意力（LongNet, Mamba）。
- 探索 **可解释性**：机械可解释性（SAE, logit lens）。
- 关注 **Agent**：AutoGPT, BabyAGI, 规划与工具使用。

---

#### 方向 C：生产落地与 MLOps

- 学习 **模型量化**：INT8/INT4 量化原理及 GPTQ/AWQ 算法。
- 掌握 **分布式推理**：使用 TensorRT‑LLM 或 FasterTransformer。
- 实践 **持续训练与部署**：BentoML + Kubernetes + Evidently AI 监控数据漂移。

---

### 10.6 常用术语速查（Quick Reference）

| 术语 | 解释 |
|------|------|
| **NLU / NLG** | 自然语言理解 / 生成 |
| **MLM** | 掩码语言模型（BERT 预训练任务） |
| **NSP** | 下一句预测（已被部分模型抛弃） |
| **SFT** | 有监督微调（Supervised Fine‑Tuning） |
| **RLHF** | 基于人类反馈的强化学习 |
| **CoT** | 思维链提示 |
| **RAG** | 检索增强生成 |
| **LoRA** | 低秩适应，高效微调 |
| **PPL** | 困惑度，语言模型评估指标 |
| **BLEU / ROUGE** | 生成任务评估指标 |
| **KV Cache** | 生成推理时缓存的键值对 |
| **量化（Quantization）** | 降低数值精度以压缩模型 |
| **蒸馏（Distillation）** | 大模型教小模型 |
| **涌现能力** | 大模型突然出现的复杂能力 |

---

### 10.7 结语

自然语言处理正处于“大模型时代”的爆发期。从最初的规则到统计，从深度学习到万亿参数的语言模型，NLP 的核心始终是**如何让计算机有用地处理人类语言**。作为学习者，我建议您：

- **扎实基础**：不要跳过第三部分（核心任务）和第五部分（Transformer），它们是所有高级应用的基石。
- **动手实践**：至少跑通一个 BERT 微调任务，并用 vLLM 部署一个开源对话模型。
- **保持关注**：NLP 技术日新月异，定期阅读 arXiv 上的 `cs.CL` 分类以及各大实验室的博客（Google AI、Meta AI、微软 Research、HuggingFace 博客）。

希望这份系统学习笔记能成为您 NLP 旅程中的可靠伙伴。祝学习顺利！

---
