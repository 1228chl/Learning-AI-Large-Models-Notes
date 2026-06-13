**上一级：** [02-文本预处理-分词-张量精简版](02-文本预处理-分词-张量精简版.md)

**下一级：** [04-RNN及其变体精简版](04-RNN及其变体精简版.md)

**标签：** #NLP

---
# FastText 分类任务（核心精简版）

## 一、FastText 概述

- **开发**：Facebook AI Research
- **两大功能**：训练词向量 + 文本分类
- **核心优势**：训练极快、内存小、精度高（得益于简单架构 + 层次 Softmax/负采样 + n-gram 特征）

---

## 二、安装与验证

```bash
pip install fasttext               # Linux/macOS
pip install fasttext-wheel         # Windows
```

```python
import fasttext
print(fasttext.__version__)
```

---

## 三、模型架构（一句话）

**输入**（词向量 + n-gram 平均） → **隐藏**（无激活，直接输出平均向量） → **输出**（Softmax / 层次 Softmax / 负采样）

- **n-gram**：用连续 n 个词的组合作为额外特征，弥补词序缺失（参数 `wordNgrams`）。
- **层次 Softmax**（`loss='hs'`）：哈夫曼树组织类别，复杂度 O(log K)，适合大类别数。
- **负采样**（`loss='ns'`）：只更新正样本 + 少量随机负样本，加速训练。

---

## 四、文本分类（有监督）

### 4.1 数据格式

每行一个样本：`__label__标签1 __label__标签2 ... 词1 词2 ...`（文本需已分词，空格分隔）

示例（多标签）：

```python
__label__sauce __label__cheese How much does potato starch affect a cheese sauce recipe ?
```

### 4.2 训练 API

```python
model = fasttext.train_supervised(
    input='train.txt',
    lr=0.5,                # 学习率（默认0.05）
    epoch=25,              # 轮数（默认5）
    wordNgrams=2,          # n-gram长度（默认1）
    loss='softmax',        # 'softmax', 'hs', 'ns', 'ova'（多标签用ova）
    dim=100,               # 向量维度（默认100）
    thread=12
)
```

### 4.3 评估与预测

```python
# 评估：返回 (样本数, 精确率, 召回率)
result = model.test('valid.txt', k=-1, threshold=0.5)

# 单标签预测
labels, probs = model.predict("text", k=1)

# 多标签预测（loss='ova'时，返回概率>threshold的所有标签）
labels, probs = model.predict("text", k=-1, threshold=0.5)
```

### 4.4 保存与加载

```python
model.save_model("model.bin")
model = fasttext.load_model("model.bin")
```

### 4.5 常用超参数调优速查

| 参数 | 默认 | 调优建议 | 效果（烹饪数据示例） |
|------|------|----------|----------------------|
| `epoch` | 5 | 增至 20-50 | 0.13 → 0.52 |
| `lr` | 0.05 | 0.5~1.0 | 0.52 → 0.59 |
| `wordNgrams` | 1 | 2 或 3 | 0.59 → 0.61 |
| `loss` | softmax | 多标签用 `ova`，大类别用 `hs` | 适配任务 |

### 4.6 自动调优

```python
model = fasttext.train_supervised(
    input='train.txt',
    autotuneValidationFile='valid.txt',
    autotuneDuration=300   # 搜索秒数
)
```

---

## 五、训练词向量（无监督）

### 5.1 API

```python
model = fasttext.train_unsupervised(
    input='data.txt',      # 每行一句话，已分词空格分隔
    model='cbow',          # 'cbow' 或 'skipgram'（默认skipgram）
    dim=100,
    ws=5,                  # 窗口大小
    epoch=5,
    minCount=5,            # 最低词频
    neg=5,                 # 负采样个数
    loss='ns',             # 'ns' 或 'hs'
    bucket=2000000,        # 子词哈希桶数
    minn=3, maxn=6         # 子词n-gram长度范围
)
```

### 5.2 常用操作

```python
# 获取词向量（OOV也能得到向量）
vec = model.get_word_vector("word")

# 最近邻
neighbors = model.get_nearest_neighbors("word", k=10)  # [(score, word), ...]

# 词类比（king - man + woman）
analogies = model.get_analogies("king", "man", "woman", k=5)
```

### 5.3 子词（Subword）机制

- 将词拆成字符 n-gram（如“apple” → "app","ppl","ple"...），词向量 = 所有 n-gram 向量之和。
- **优点**：可处理未登录词（OOV），对形态丰富语言友好。

---

## 六、与深度学习模型结合（作为预训练嵌入）

```python
import torch.nn as nn
import fasttext
import numpy as np

# 加载FastText模型
ft = fasttext.load_model("cc.zh.300.bin")

# 构建词汇表并提取向量
vocab = {'<PAD>':0, '<UNK>':1}
vectors = [np.zeros(300), np.random.randn(300)*0.01]
for word in word_list:
    if word not in vocab:
        vocab[word] = len(vocab)
        vectors.append(ft.get_word_vector(word))

# 创建PyTorch嵌入层（冻结或微调）
embedding = nn.Embedding.from_pretrained(torch.tensor(vectors), freeze=True)
```

---

## 七、FastText 局限性（快速了解）

| 局限 | 说明 | 替代方案 |
|------|------|----------|
| 忽略词序 | 平均向量丢失顺序 | RNN/CNN/Transformer |
| 一词多义 | 静态向量 | ELMo/BERT |
| 长文本一般 | 平均稀释信息 | 层次注意力 |
| 无 GPU 支持 | 仅 CPU | 深度学习框架 |

---

## 八、速查表

| 任务 | API |
|------|-----|
| 有监督训练 | `fasttext.train_supervised()` |
| 无监督训练 | `fasttext.train_unsupervised()` |
| 预测 | `model.predict(text, k, threshold)` |
| 评估 | `model.test(file, k, threshold)` |
| 保存/加载 | `save_model()` / `load_model()` |
| 获取词向量 | `model.get_word_vector(word)` |
| 最近邻 | `model.get_nearest_neighbors(word, k)` |
| 词类比 | `model.get_analogies(pos1, neg1, pos2, k)` |

---
