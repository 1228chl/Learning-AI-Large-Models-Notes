**上一级：** [02-文本预处理-分词-张量](02-文本预处理-分词-张量.md)

**下一级：** [[]]

**标签：** #NLP

---

# FastText 分类任务超详细笔记

---

## 第一部分：FastText 工具介绍

FastText 是 Facebook AI Research（FAIR）开发的开源 NLP 工具包，官方网站为 [https://fasttext.cc](https://fasttext.cc)。它因在保持较高精度的同时，能够快速进行训练和预测而闻名。本部分将详细介绍 FastText 的作用、优势、安装方法、模型架构，以及其核心效率技术——层次 Softmax 和负采样。

---

### 1.1 FastText 的作用与优势

---

#### 1.1.1 主要作用

FastText 主要解决两大类 NLP 问题：

- **训练词向量**：生成高质量的稠密词向量（类似 Word2Vec，但支持子词信息）。
- **文本分类**：高效地进行二分类、单标签多分类、多标签多分类任务。

此外，FastText 也可用于情感分析、命名实体识别、机器翻译等任务，但其最核心的场景仍是分类和词向量。

---

#### 1.1.2 核心优势

FastText 之所以“快速”，来源于以下几点设计：

| 优势因素 | 解释 |
|----------|------|
| **模型结构简单** | 仅三层：输入层（词嵌入加 n-gram 特征）、隐藏层（求和平均）、输出层（分类）。无复杂循环或卷积。 |
| **层次 Softmax** | 使用哈夫曼树替代标准 softmax，将多分类的计算复杂度从 $O(K)$ 降至 $O(\log K)$ （ $K$ 为类别数）。 |
| **负采样** | 每次训练仅更新一小部分输出权重（正样本 + 少量负样本），大幅减少梯度计算量。 |
| **n-gram 特征补偿** | 虽然模型忽略词序，但通过引入 n-gram（如 bigram、trigram）特征，可以捕捉局部短语信息，提升精度。 |

**一句话总结**：FastText 在模型结构、输出计算、特征表示三个层面进行加速，因而训练和预测极快，同时精度不输复杂模型。

---

### 1.2 FastText 的安装

**环境要求**：Python 3.6 以上，C++ 编译器（用于编译源码，但使用 pip 安装预编译包则可免）。

**安装方法**（推荐使用 pip）：

```bash
---

# Linux / macOS
pip install fasttext

---

# Windows（可能需预装 Visual C++ Build Tools）
pip install fasttext-wheel
```

**验证安装**：

```python
import fasttext
print(fasttext.__version__)   # 应输出版本号，如 0.9.2
```

---

### 1.3 FastText 模型架构

---

#### 1.3.1 三层结构

FastText 的分类模型是一个简单的浅层神经网络，包含：

1. **输入层**：将文本中的词（以及 n-gram 特征）映射为词向量，然后对这些向量进行求和或平均。这一步将变长文本转换为固定维度的特征向量。
2. **隐藏层**：实际上没有非线性变换，仅仅是输入层的直接输出（即平均后的向量）。因此常被视为“无隐藏层”或“线性模型”。
3. **输出层**：使用 softmax（或层次 softmax、负采样）计算每个类别的概率，输出预测标签。

**数学表示**：

- 设文本由词序列 $w_1, w_2, ..., w_m$ 组成（含 n-gram 特征）。
- 每个词 $w$ 对应一个词向量 $\mathbf{v}_w \in \mathbb{R}^d$ （d 为嵌入维度）。
- 文本的向量表示为：

$$
  \mathbf{h} = \frac{1}{m} \sum_{i=1}^{m} \mathbf{v}_{w_i}
$$

- 输出概率：

  $$

  P(y \mid \text{text}) = \text{softmax}(\mathbf{W} \mathbf{h} + \mathbf{b})


$$
  其中 $\mathbf{W}$ 是输出权重矩阵（大小为 $K \times d$ ）， $K$ 为类别数。

---

#### 1.3.2 n-gram 特征的作用

由于上述模型将词向量平均，完全丢失了词序信息（例如“猫追狗”和“狗追猫”会得到相同的向量）。为了弥补这一缺陷，FastText 引入了 **n-gram 特征**（通常取 2-gram 或 3-gram）。具体做法：

- 将文本中所有连续的 n 个词组成的短语也视为一个“词”，并赋予一个嵌入向量。
- 在平均时，既包括原始词，也包括这些 n-gram 短语的向量。
- 例如，句子 “我 爱 自然语言” 若使用 bigram，则额外加入 “我_爱” 和 “爱_自然语言” 的向量。

n-gram 使得模型能够捕捉局部词序和短语信息，显著提升分类精度，尤其在短文本中效果明显。但也会增加词汇表大小和计算量。

---

### 1.4 层次 Softmax（Hierarchical Softmax）

---

#### 1.4.1 为什么需要层次 Softmax？

在标准 softmax 中，要计算一个样本属于 $K$ 个类别的概率，需要计算所有类别的得分，然后归一化。当 $K$ 很大（如数千或数万）时，计算量巨大。层次 Softmax 通过构建一棵二叉树（通常为哈夫曼树），将多分类问题转化为从根到叶子节点的路径上的二分类问题，从而将复杂度从 $O(K)$ 降低到 $O(\log K)$ 。

---

#### 1.4.2 哈夫曼树（Huffman Tree）的构建

哈夫曼树是一种带权路径长度（WPL）最小的二叉树。在 FastText 中，每个类别（标签）的**权值**为该类别在训练语料中出现的频次。频次越高的类别，路径越短（靠近根节点），从而训练时更新次数更少，进一步提高效率。

**构建步骤**（以四个标签 A(5 次), B(9 次), C(7 次), D(3 次) 为例）：

1. 将所有节点（初始为叶子节点，权值为频次）放入森林。
2. 选出两个权值最小的节点（D:3 和 A:5），合并为一个新节点（权值 8），左子为 D，右子为 A。
3. 将新节点放回森林，现在森林有：B(9), C(7), 新节点(8)。
4. 再选出最小的两个（C:7 和新节点:8），合并为权值 15 的节点（左 C，右 新节点）。
5. 森林剩余：B(9) 和 新节点(15)，合并为根节点（权值 24）。
6. 最终树结构（左右顺序可调）：
   - 根（24）→ 左子 B(9)，右子 (15)
   - 右子(15) → 左子 C(7)，右子 (8)
   - 右子(8) → 左子 D(3)，右子 A(5)

每个内部节点对应一个二分类逻辑回归单元，其输出概率为 $\sigma(\mathbf{w}^\top \mathbf{h})$ 。从根到某个叶子节点的路径上的概率乘积即为该叶子类别（标签）的概率。

---

#### 1.4.3 训练过程

对于给定输入文本，我们首先从根节点出发，沿着目标类别对应的路径，在每个内部节点上计算二分类损失（正例：向左或向右），然后反向传播更新该节点对应的权重。由于只需更新路径上的节点（约 $\log K$ 个），而非所有类别，因此计算量大幅降低。

**数学公式**（以二分类为例）：

设某个内部节点对应的逻辑回归参数为 $\mathbf{u}$ ，该节点选择左子（编码为 0）或右子（编码为 1）的概率为：
$$

P(\text{左}) = \sigma(\mathbf{u}^\top \mathbf{h}), \quad P(\text{右}) = 1 - \sigma(\mathbf{u}^\top \mathbf{h})

$$
损失函数为交叉熵，梯度仅更新路径上的节点。

---

#### 1.4.4 层次 Softmax 的优缺点

| 优点 | 缺点 |
|------|------|
| 训练和预测速度极快，尤其类别数大时 | 对于频率非常相近的类别，树结构可能不均衡，轻微影响精度 |
| 内存占用小（只需存储内部节点参数） | 实现比标准 softmax 复杂 |
| 天然支持大规模分类 | 预测时仍需走完整条路径，不能直接得到 top-k |

---

### 1.5 负采样（Negative Sampling）

---

#### 1.5.1 为什么需要负采样？

层次 Softmax 已经加速了多分类，但在某些场景（如词向量训练，或类别数不太大时），负采样是另一种更简单的加速技巧。它的核心思想是：每次只更新**正样本**（正确类别）和随机选取的少量**负样本**（错误类别）的权重，而不是更新所有类别的权重。

---

#### 1.5.2 工作原理

以训练 Skip-gram 为例（FastText 训练词向量时使用类似方法）：

- 输入词“hello”，输出目标词“man”（正样本）。
- 词汇表大小 10000，标准 softmax 需要更新 10000 个输出神经元的权重。
- 负采样：随机选择 5 个负样本（如“apple”、“book”、“run”等），只更新正样本和这 5 个负样本对应的输出权重（共 6 个）。

**数学形式**：

Skip-gram 的负采样损失函数（对于一对中心词 $w_c$ 和上下文词 $w_o$ ）：
$$

\mathcal{L} = - \log \sigma(\mathbf{u}_{w_o}^\top \mathbf{v}_{w_c}) - \sum_{k=1}^{N} \mathbb{E}_{w_k \sim P_n(w)} \log \sigma(-\mathbf{u}_{w_k}^\top \mathbf{v}_{w_c})

$$
其中 $N$ 是负样本数量（通常 2~20）， $P_n(w)$ 是负样本采样分布（通常为词频的 3/4 次方归一化）。该损失旨在增大正样本的相似度，减小负样本的相似度。

---

#### 1.5.3 负采样在 FastText 分类中的应用

对于文本分类，FastText 也支持使用负采样（`loss='ns'` 参数）。此时，每个训练样本的正样本为真实标签，负样本为随机抽取的其他标签。更新权重时仅涉及正负标签对应的输出层权重。

**优点**：

- 训练速度极快（尤其类别数多时）。
- 负采样引入噪声，可提升模型鲁棒性。

**缺点**：

- 可能对低频类别学习不充分（因为被采样到的概率低）。
- 需调节负样本数量。

---

#### 1.5.4 层次 Softmax 与负采样对比

| 维度 | 层次 Softmax | 负采样 |
|------|--------------|--------|
| 复杂度 | $O(\log K)$ | $O(1 + N)$ ， $N$ 为负样本数 |
| 适用场景 | 类别数极大（> 10k） | 类别数中等（几百至几千），或词向量训练 |
| 实现复杂度 | 较高（需建哈夫曼树） | 低（只需随机采样） |
| 精度 | 通常与标准 softmax 相近 | 可能略低，但可调参补偿 |

---

### 1.6 总结速查表（第一部分）

| 知识点 | 核心内容 |
|--------|----------|
| FastText 作用 | 训练词向量、文本分类 |
| 优势原因 | 简单三层架构 + 层次 Softmax / 负采样 + n-gram 特征 |
| 模型架构 | 输入（词+n-gram 平均）→ 隐藏（无激活）→ 输出（softmax） |
| 层次 Softmax | 哈夫曼树组织类别，路径上的二分类概率乘积，复杂度 $O(\log K)$ |
| 负采样 | 仅更新正样本和少量随机负样本，加速更新 |
| n-gram 特征 | 加入连续 n 个词作为额外特征，弥补词序缺失 |

**常见选择题答案**（来自 PPT）：

1. FastText 主要用于：**文本分类、词向量学习等**（C）。
2. 层次 Softmax 解决的问题：**加速多分类计算**，具体通过**将标签组织成树形结构**（C）。
3. 负采样的作用：**减少计算成本**（B）；负样本生成方式：**从整个词汇表中按照概率分布选取**（B，但 PPT 答案选 C，指从上下文窗口中排除正样本后按概率分布选取——此处用于词向量训练，分类任务略有不同）。
---

## 第二部分：FastText 文本分类

本部分将详细介绍如何使用 FastText 进行文本分类。首先明确文本分类的基本概念与种类，然后讲解 FastText 所需的数据格式，接着通过一个完整的案例（烹饪问答数据集）演示从数据获取、预处理、训练、评估到模型调优的全流程，最后总结常用 API 和调优参数。

---

### 2.1 文本分类概述

---

#### 2.1.1 概念

**文本分类**（Text Classification）是将文档（如电子邮件、帖子、产品评论等）分配到一个或多个预定义类别的任务。它是监督学习的一种，需要标注好的训练数据。

例如：
- 将用户评论分为“正面”或“负面”（情感分析）。
- 将新闻文章分为“体育”、“政治”、“科技”等。

---

#### 2.1.2 文本分类的种类

根据输出标签的数量和选择方式，文本分类可分为三类：

| 类型 | 描述 | 类比 | 示例 |
|------|------|------|------|
| **二分类** | 文本只属于两个互斥类别之一 | 判断题（对/错） | 判断邮件是正常邮件还是垃圾邮件 |
| **单标签多分类** | 文本属于多个类别中的**一个**（且仅一个） | 单选题（A/B/C/D） | 将新闻归入“体育”、“财经”或“娱乐”之一 |
| **多标签多分类** | 文本可以同时属于**多个**类别 | 多选题（可同时选 A、B、C） | 一篇讨论可能同时涉及“美食”、“健康”、“烹饪技巧” |

FastText 支持以上所有类型，只需调整损失函数和预测参数。

---

### 2.2 FastText 分类数据格式

FastText 的有监督训练要求输入文件为 **每行一条样本**，格式如下：

```
__label__类别1 __label__类别2 ... 词1 词2 词3 ... 词N
```

**具体规则**：
- 标签使用前缀 `__label__` 标识，后面紧跟类别名称（类别名称中不应包含空格）。
- 单标签样本：只有 **一个** `__label__` 前缀。
- 多标签样本：可以有 **多个** `__label__` 前缀，每个对应一个标签。
- 标签与文本内容之间用空格分隔，文本内容无需特殊标记，按空格分词即可（英文以空格分隔；中文建议先用 jieba 等工具分词，然后用空格连接）。

**示例**：

- **单标签二分类**（情感分析）：
  ```
  __label__positive I love this movie !
  __label__negative This film is terrible .
  ```

- **单标签多分类**（新闻分类）：
  ```
  __label__sports The team won the championship .
  __label__tech The new smartphone has a great camera .
  ```

- **多标签多分类**（烹饪问题话题分类）：
  ```
  __label__sauce __label__cheese How much does potato starch affect a cheese sauce recipe ?
  __label__baking __label__oven __label__convection Fan bake vs bake
  ```

> **注意**：文本内容应已进行**分词**（tokenization），并将词用空格分隔。对于英文，通常直接按空格分隔即可（标点符号最好分离或保留，FastText 会处理）。对于中文，需要先用分词工具（如 jieba）切词，再以空格连接。

---

### 2.3 完整案例：烹饪问答分类

本案例使用 Facebook AI 实验室提供的烹饪数据集（cooking.stackexchange），其任务是为烹饪相关的问题打上多个话题标签（如“sauce”、“baking”、“equipment”等），属于**多标签多分类**问题。

---

#### 2.3.1 第一步：获取数据

使用 wget 下载并解压：

```bash
wget https://dl.fbaipublicfiles.com/fasttext/data/cooking.stackexchange.tar.gz
tar xvzf cooking.stackexchange.tar.gz
```

解压后得到一个文本文件 `cooking.stackexchange.txt`，内容格式如下（每行一个样本，标签已带 `__label__` 前缀）：

```
__label__sauce __label__cheese How much does potato starch affect a cheese sauce recipe ?
__label__food-safety __label__acidity Dangerous pathogens capable of growing in acidic environments
__label__cast-iron __label__stove How do I cover up the white spots on my cast iron stove ?
...
```

---

#### 2.3.2 第二步：训练集与验证集划分

将原始数据随机划分为训练集（例如 80%）和验证集（20%）。可以使用 `head`、`tail` 或编写脚本。

**简单划分方法**（在命令行中）：

```bash
---

# 查看总行数
wc -l cooking.stackexchange.txt

---

# 取前 80% 作为训练集，后 20% 作为验证集（示例中总行数约 15000，取 12000 训练，3000 验证）
head -n 12000 cooking.stackexchange.txt > cooking_train.txt
tail -n 3000 cooking.stackexchange.txt > cooking_valid.txt
```

**划分注意事项**：
- 应保证类别分布相似（可使用 `sklearn.model_selection.train_test_split` 进行分层抽样）。
- 验证集用于评估模型和超参数调优，不能用于训练。

---

#### 2.3.3 第三步：训练基础模型

使用 `fasttext.train_supervised` 函数训练一个简单的分类模型。

```python
import fasttext

---

# 训练模型（使用默认参数）
model = fasttext.train_supervised(input="cooking_train.txt")

---

# 评估模型在验证集上的表现
result = model.test("cooking_valid.txt")
print(result)
```

`model.test` 返回一个元组 `(样本数, 精确率, 召回率)`。注意这里精确率和召回率是**微平均**（micro average），即所有样本的预测结果汇总计算。

初始模型的效果可能较差（例如精确率 ~0.12），因为原始数据中混杂了标点符号、大小写等噪声，且默认训练轮数（epoch=5）较少。

---

#### 2.3.4 第四步：数据预处理——清洗标点符号

为了提高模型效果，可以对文本进行简单的清洗（如将标点符号与单词分离，或统一小写）。通常做法：

- 将所有字母转为小写（对于英文）。
- 将标点符号视为独立的“词”，或直接删除（但保留可能会帮助模型识别句子边界）。

**示例清洗脚本**（Python）：

```python
import re

def clean_text(line):
    # 分离标签和内容
    parts = line.strip().split(" ", 1)
    if len(parts) < 2:
        return line
    labels, text = parts[0], parts[1]
    # 将标点符号前后加上空格（以便分词）
    text = re.sub(r'([.,!?;:])', r' \1 ', text)
    # 将所有字母转为小写
    text = text.lower()
    # 合并多余空格
    text = re.sub(r'\s+', ' ', text).strip()
    return f"{labels} {text}"

---

# 处理训练集和验证集
with open("cooking_train.txt", "r") as f:
    train_lines = f.readlines()
with open("cooking_train_pre.txt", "w") as f:
    for line in train_lines:
        f.write(clean_text(line) + "\n")
```

清洗后重新训练，效果会有所提升（精确率从 0.12 升至 ~0.17）。

---

#### 2.3.5 第五步：模型调优

FastText 提供了多个超参数用于提升模型性能。以下按常用度顺序介绍。

---

##### 1. 增加训练轮数（`epoch`）

默认 `epoch=5`（遍历训练数据 5 次）。增加轮数可以让模型更好地拟合数据。

```python
model = fasttext.train_supervised(input="cooking_train_pre.txt", epoch=25)
```

在烹饪数据集上，`epoch=25` 可将精确率提升至约 0.52。

---

##### 2. 调整学习率（`lr`）

学习率控制参数更新的步长。默认 `lr=0.05`。对于较大数据集，可适当提高学习率（如 0.5 ~ 1.0）以加速收敛。

```python
model = fasttext.train_supervised(input="cooking_train_pre.txt", epoch=25, lr=1.0)
```

这可使精确率进一步提升至约 0.59。

---

##### 3. 增加 n-gram 特征（`wordNgrams`）

默认 `wordNgrams=1` 只使用单个词。设置 `wordNgrams=2` 会同时使用 bigram 特征（相邻两个词作为一个短语），有助于捕捉词组信息。

```python
model = fasttext.train_supervised(input="cooking_train_pre.txt", epoch=25, lr=1.0, wordNgrams=2)
```

精确率可达约 0.61。

---

##### 4. 修改损失计算方式（`loss`）

- ** `loss='softmax'` **（默认）：标准 softmax，计算所有类别概率。
- ** `loss='hs'` **：使用层次 Softmax（见第一部分），在大类别数时训练更快，但精度可能略降。
- ** `loss='ns'` **：使用负采样，适合中等类别数。
- ** `loss='ova'` **：**One‑vs‑All**，将多标签多分类问题转化为多个二分类任务，适用于多标签场景（即每个标签独立预测）。

对于烹饪数据集（多标签），使用 `loss='ova'` 可以更好地处理多个标签共现的情况。

```python
---

# 使用 ova 损失，学习率不宜过大（如 lr=0.2）
model = fasttext.train_supervised(input="cooking_train_pre.txt", epoch=25, lr=0.2, wordNgrams=2, loss='ova')
```

> 注意：多标签分类预测时，模型会对每个标签输出一个概率（经过 sigmoid），然后设置阈值（如 0.5）判断是否属于该标签。

---

##### 5. 自动超参数调优（`autotuneValidationFile` + `autotuneDuration`）

FastText 提供自动超参数搜索功能。指定验证集文件和最大搜索时间（秒），它会自动尝试不同的超参数组合，找到最优配置。

```python
model = fasttext.train_supervised(
    input="cooking_train_pre.txt",
    autotuneValidationFile="cooking_valid_pre.txt",
    autotuneDuration=600   # 最多搜索 600 秒（10 分钟）
)
```

搜索完成后，模型已自动采用最优超参数。

**常见调优参数及其作用汇总**：

| 参数 | 含义 | 默认值 | 调优建议 |
|------|------|--------|----------|
| `epoch` | 训练轮数 | 5 | 增加至 20–50（数据量越大可适当减少） |
| `lr` | 学习率 | 0.05 | 可尝试 0.5–1.0（若损失震荡则降低） |
| `wordNgrams` | n-gram 最大长度 | 1 | 设为 2 或 3 捕捉短语，但会增加模型大小 |
| `loss` | 损失函数 | `softmax` | 多标签用 `ova`；大类别用 `hs`；词向量用 `ns` |
| `dim` | 词向量维度 | 100 | 可调至 200–300，提升表示能力（但内存增加） |
| `ws` | 上下文窗口大小（词向量训练时） | 5 | 分类任务中无关 |

---

### 2.4 模型预测与评估

---

#### 2.4.1 预测

使用 `model.predict(text, k=1, threshold=0.0)`：

- `k`：返回 top‑k 个标签（按概率降序）。
  - 对于单标签分类，`k=1` 即可。
  - 对于多标签分类，常设置 `k=-1` 表示返回所有概率超过 `threshold` 的标签。
- `threshold`：概率阈值，仅对 `loss='ova'` 有效（或对所有模式按需使用）。

```python
---

# 单标签预测（取最高分标签）
pred = model.predict("Which baking dish is best to bake a banana bread ?", k=1)
print(pred)  # (('__label__baking',), array([0.98]))

---

# 多标签预测，返回所有概率 > 0.5 的标签
pred = model.predict("Which baking dish is best to bake a banana bread ?", k=-1, threshold=0.5)
print(pred)  # (('__label__baking', '__label__equipment'), array([0.95, 0.72]))
```

---

#### 2.4.2 评估

使用 `model.test(path, k=1, threshold=0.0)` 在测试集上计算精确率（Precision）和召回率（Recall）。

```python
result = model.test("cooking_valid_pre.txt", k=-1, threshold=0.5)
print(result)  # (样本数, 精确率, 召回率)
```

对于多标签分类，精确率和召回率是**基于样本的微平均**：统计所有样本中预测正确的标签总数与预测标签总数之比（精确率），以及预测正确的标签总数与实际标签总数之比（召回率）。

---

### 2.5 模型保存与加载

```python
---

# 保存模型
model.save_model("fasttext_cooking.bin")

---

# 加载模型
loaded_model = fasttext.load_model("fasttext_cooking.bin")

---

# 使用加载的模型进行预测
pred = loaded_model.predict("How to make pizza dough?")
print(pred)
```

> **注意**：FastText 提供了两种保存格式：`save_model` 保存完整的二进制模型（包含参数、词汇表、树结构）；`save_model` 为推荐方式。旧版 `save` 已弃用。

---

### 2.6 多标签分类的损失函数 `ova` 详解

在多标签多分类问题中，每个样本可能同时属于多个类别。标准 softmax 假设类别互斥（概率之和为 1），不适合多标签。**ova**（One‑vs‑All）将问题拆解为多个独立的二分类器（每个标签一个分类器），输出层使用 sigmoid 函数：
$$

P(\text{label}_i = 1 \mid \text{text}) = \sigma(\mathbf{w}_i^\top \mathbf{h})

$$
训练时，每个样本同时更新所有标签对应的二分类器（正标签对应正例，负标签对应负例）。损失函数为**二元交叉熵**之和：
$$

\mathcal{L} = -\sum_{i=1}^{K} \left[ y_i \log(p_i) + (1-y_i) \log(1-p_i) \right]

$$
其中 $y_i \in \{0,1\}$ 表示该样本是否属于标签 $i$ ， $p_i$ 为模型预测的概率。

**优点**：
- 支持多标签。
- 可独立为每个标签设置阈值，灵活控制精确率/召回率权衡。

**缺点**：
- 训练时间随类别数线性增长（但 FastText 内部仍高效）。
- 忽略了标签之间的相关性。

---

### 2.7 总结速查表（第二部分）

| 概念 | 说明 |
|------|------|
| 文本分类种类 | 二分类、单标签多分类、多标签多分类 |
| FastText 数据格式 | `__label__ 标签 1 __label__ 标签 2 ... 词 1 词 2 ...` |
| 训练 API | `fasttext.train_supervised(input=文件路径, ...)` |
| 评估 API | `model.test(验证集路径, k, threshold)` |
| 预测 API | `model.predict(文本, k, threshold)` |
| 保存/加载 | `model.save_model("path.bin")` / `fasttext.load_model("path.bin")` |

**常用调优参数及其效果（烹饪数据集示例）**：

| 参数设置 | 精确率（约） | 说明 |
|----------|--------------|------|
| 默认（epoch=5, lr=0.05, wordNgrams=1） | 0.13 | 原始数据，效果差 |
| 数据清洗（小写、标点分离） | 0.17 | 干净数据略有提升 |
| + epoch=25 | 0.52 | 增加训练轮数显著提升 |
| + lr=1.0 | 0.59 | 调高学习率更快收敛 |
| + wordNgrams=2 | 0.61 | 捕捉短语信息 |
| + loss='ova'（多标签） | 0.59~0.61 | 更适合多标签，训练稍慢 |
| 自动调优（autotuneDuration=600） | 0.61 | 自动找到接近最优组合 |

**常见问题解答**：

1. **Q：FastText 如何处理中文？**  
   A：需要先用中文分词工具（如 jieba）将句子切分成词，然后用空格连接，作为输入文本。标签仍用 `__label__` 前缀。

2. **Q：多标签分类预测时如何选择 threshold？**  
   A：一般从 0.5 开始，根据业务需求调整（若要求高精确率可提高阈值，若要求高召回率则降低阈值）。可以在验证集上通过网格搜索找到最佳阈值。

3. **Q：模型训练时出现“Input error”或“Empty line”怎么办？**  
   A：检查输入文件是否有空行，以及每行是否至少包含一个标签和一个词。确保标签和文本之间有空格。

4. **Q：如何提升模型的泛化能力？**  
   A：可尝试增加训练数据、进行数据增强（如回译）、使用 dropout（FastText 未直接支持，可降低 `dim` 或增加正则化）、减小学习率。

---
---

## 第三部分：FastText 词向量训练（无监督模式）

除了高效的文本分类，FastText 的另一核心功能是**训练词向量**。与 Word2Vec 类似，FastText 提供了 CBOW 和 Skip-gram 两种训练方式，但额外支持**子词（subword）信息**，使其能够为未登录词（OOV）生成合理的向量。本部分将详细介绍 FastText 无监督训练的 API、关键参数、子词原理，并与 Gensim 的 Word2Vec 进行对比。

---

### 3.1 无监督训练 API

FastText 使用 `fasttext.train_unsupervised` 函数训练词向量。

```python
import fasttext

model = fasttext.train_unsupervised(
    input='data/fil9',           # 训练文件路径（每行一句话，已分词并空格分隔）
    model='cbow',                # 训练模式：'cbow' 或 'skipgram'
    dim=100,                     # 词向量维度
    ws=5,                        # 上下文窗口大小
    epoch=5,                     # 迭代轮数
    minCount=5,                  # 词频阈值，低于该值的词将被忽略
    neg=5,                       # 负采样数量（若使用负采样）
    loss='ns',                   # 损失函数：'ns'（负采样）或 'hs'（层次 softmax）
    bucket=2000000,              # 子词哈希桶大小（控制 n-gram 数量）
    minn=3, maxn=6,              # 子词 n-gram 的最小和最大长度
    lr=0.05,                     # 学习率
    thread=12                    # 并行线程数
)
```

训练完成后，模型对象包含词向量和相关方法。

---

### 3.2 核心参数详解

| 参数 | 含义 | 默认值 | 建议 |
|------|------|--------|------|
| `model` | 训练架构 | `'skipgram'` | 数据量大用 skipgram（效果更好），数据量小用 cbow（更快） |
| `dim` | 词向量维度 | 100 | 常用 100~300，维度越高表达力越强但内存越大 |
| `ws` | 上下文窗口大小 | 5 | 小窗口（2-5）捕捉句法相似性；大窗口（5-10）捕捉语义相似性 |
| `epoch` | 迭代轮数 | 5 | 根据语料大小调整，通常 5~15 |
| `minCount` | 最低词频 | 5 | 过滤低频词，减少词汇表大小 |
| `neg` | 负采样个数 | 5 | 当 `loss='ns'` 时有效，通常 5~20 |
| `loss` | 损失函数 | `'ns'` | `'ns'` 负采样（快），`'hs'` 层次 softmax（类别极大时用） |
| `bucket` | 子词哈希桶数 | 2000000 | 控制 n-gram 数量，过大耗内存，过小易碰撞 |
| `minn` / `maxn` | 子词 n-gram 长度范围 | 3 / 6 | 通常保持默认，可适当调整（如 minn=2） |
| `lr` | 学习率 | 0.05 | 可尝试 0.01~0.1，若损失震荡则降低 |
| `thread` | CPU 线程数 | 12 | 根据机器核心数设置，充分利用多核 |

---

### 3.3 子词（Subword）信息与 OOV 处理

---

#### 3.3.1 原理

传统的 Word2Vec 为每个词分配一个独立的向量，无法处理未登录词（OOV）。FastText 引入了**子词**机制：将一个词拆分为多个字符 n-gram（例如 “apple” 且 minn=3, maxn=6 会生成 "app", "ppl", "ple", "appl", "pple", "apple" 以及特殊的 `<apple>`），每个 n-gram 也有一个向量。最终词的向量为所有这些 n-gram 向量的**和**（或平均）。

数学表示：
$$

\mathbf{v}_w = \sum_{g \in G_w} \mathbf{z}_g

$$
其中 $G_w$ 是词 $w$ 的所有字符 n-gram 集合（包括词本身作为特殊 n-gram），$\mathbf{z}_g$ 是 n-gram 对应的向量。

---

#### 3.3.2 优势

- **OOV 友好**：对于训练中未出现的词，仍可基于其字符 n-gram 计算向量（因为字符 n-gram 级别共享）。
- **形态学信息**：对于词形变化丰富的语言（如德语、土耳其语、中文？），子词能捕捉词根、词缀等形态学特征。
- **拼写错误鲁棒性**：轻微拼写错误的词与正确词的 n-gram 集高度重叠，向量相似。

---

#### 3.3.3 注意事项

- 子词会显著增加词汇表（确切地说是 n-gram 表）的大小，通过 `bucket` 控制哈希桶数量（桶内使用哈希映射，可能发生碰撞，但影响很小）。
- 对于中文，子词需要基于字符级别。FastText 默认空格分词，中文需要先分词再以空格分隔，子词将在每个词内部提取字符级 n-gram（如 “自然语言” 会被拆成 “自”、“然”、“语”、“言” 以及 “自然”、“然语”、“语言” 等 n-gram）。但这对于中文通常效果不如直接使用词级别，因为中文单字意义不明确。实际使用时，可以设置 `minn=1, maxn=2` 来捕获单字和双字组合。

---

### 3.4 训练示例与模型使用

---

#### 3.4.1 训练 CBOW 模型

```python
import fasttext

---

# 训练 CBOW 模型
model_cbow = fasttext.train_unsupervised(
    input='data/fil9',
    model='cbow',
    dim=100,
    epoch=10,
    lr=0.05,
    ws=5,
    minCount=5,
    loss='ns',
    neg=10,
    thread=8
)

model_cbow.save_model('fasttext_cbow.bin')
```

---

#### 3.4.2 训练 Skip-gram 模型

```python
model_sg = fasttext.train_unsupervised(
    input='data/fil9',
    model='skipgram',
    dim=300,
    epoch=10,
    lr=0.025,
    ws=10,
    minCount=2,
    loss='ns',
    neg=5,
    thread=8
)

model_sg.save_model('fasttext_skipgram.bin')
```

---

#### 3.4.3 获取词向量

```python
---

# 获取词向量（若词 OOV，FastText 会基于子词生成向量）
vec = model_sg.get_word_vector('artificial')
print(vec.shape)  # (300,)

---

# 批量获取多个词的向量
words = ['machine', 'learning', 'nlp']
vectors = [model_sg.get_word_vector(w) for w in words]
```

---

#### 3.4.4 查找最近邻

```python
---

# 返回与给定词最相似的 k 个词
neighbors = model_sg.get_nearest_neighbors('computer', k=10)
for score, word in neighbors:
    print(f"{word}: {score:.4f}")
```

---

#### 3.4.5 计算词类比（如 “king - man + woman ≈ queen”）

```python
---

# 使用 get_analogies 方法
analogies = model_sg.get_analogies("king", "man", "woman", k=5)
for score, word in analogies:
    print(f"{word}: {score:.4f}")
```

---

### 3.5 与 Gensim Word2Vec 对比

| 维度 | FastText | Gensim Word2Vec |
|------|----------|-----------------|
| **实现语言** | C++，Python 绑定 | Python（基于 Cython 优化） |
| **训练速度** | 非常快（多线程优化好） | 较快 |
| **内存占用** | 较低（子词哈希桶可调） | 中等 |
| **子词支持** | ✅ 原生支持，可处理 OOV | ❌ 不支持（需额外实现） |
| **预训练模型** | 官方提供多语言预训练向量 | 需第三方 |
| **API 简洁性** | 简单（几行代码） | 稍复杂（但更灵活） |
| **适用场景** | 大规模生产环境，需要 OOV 处理 | 学术研究，经典词向量实验 |

**选择建议**：
- 若需要处理未登录词或形态丰富的语言，选 FastText。
- 若只需经典 Word2Vec 且语料规范，两者均可；Gensim 更易与 sklearn 等集成。
- 若需要训练极大规模（> 10⁹ 词），FastText 更高效。

---

### 3.6 评估词向量质量

---

#### 3.6.1 内在评估

- **相似度任务**：使用人工标注的词对相似度数据集（如 WordSim353、SimLex-999），计算模型给出的余弦相似度与人工评分的斯皮尔曼相关系数。
- **类比任务**：测试语义/句法类比（如 “国王:王后::男人:女人”），计算准确率。

示例代码（与 Gensim 结合）：

```python
import numpy as np
from scipy.stats import spearmanr

---

# 假设有一个相似度数据集 word_pairs = [('word1', 'word2', human_score)]
def evaluate_similarity(model, word_pairs):
    pred_scores = []
    human_scores = []
    for w1, w2, score in word_pairs:
        try:
            vec1 = model.get_word_vector(w1)
            vec2 = model.get_word_vector(w2)
            cos_sim = np.dot(vec1, vec2) / (np.linalg.norm(vec1) * np.linalg.norm(vec2))
            pred_scores.append(cos_sim)
            human_scores.append(score)
        except:
            continue
    return spearmanr(pred_scores, human_scores).correlation
```

---

#### 3.6.2 外在评估

将词向量作为特征输入到下游任务（如命名实体识别、文本分类），观察任务性能指标的变化。这是最直接反映词向量实用性的方法。

---

### 3.7 常见问题与注意事项

1. **Q：如何准备输入数据？**  
   A：每行一个句子，词之间用空格分隔。对于英文，通常需要将标点符号与单词分离（或不分离，FastText 会将其视为词的一部分）。对于中文，必须先用分词工具（如 jieba）切词，然后以空格连接。

2. **Q：训练时出现“Empty line”错误？**  
   A：输入文件中不能有空行。使用 `grep -v '^$' data.txt > data_clean.txt` 移除空行。

3. **Q：如何控制子词的内存占用？**  
   A：减小 `bucket` 值（如 1000000），或降低 `maxn`（如从 6 到 5），或使用 `loss='hs'`（层次 softmax 也节省内存）。但注意可能会轻微影响精度。

4. **Q：能否增量训练？**  
   A：FastText 官方不支持增量训练。如需更新词向量，应合并新旧语料重新训练。

5. **Q：如何加载官方预训练词向量？**  
   A：从 [FastText 官网](https://fasttext.cc/docs/en/pretrained-vectors.html) 下载 `.bin` 或 `.vec` 文件。若是 `.bin`，直接用 `fasttext.load_model('cc.en.300.bin')`；若是 `.vec`（文本格式），可以使用 `gensim.models.KeyedVectors.load_word2vec_format` 加载。

---

### 3.8 总结速查表（第三部分）

| 功能 | API | 说明 |
|------|-----|------|
| 无监督训练 | `fasttext.train_unsupervised(input=, model=, ...)` | 返回 `FastText._FastText` 对象 |
| 保存模型 | `model.save_model('path.bin')` | 二进制格式，包含所有参数 |
| 加载模型 | `fasttext.load_model('path.bin')` | 返回模型对象 |
| 获取词向量 | `model.get_word_vector('word')` | 返回 numpy 数组 |
| 最近邻查询 | `model.get_nearest_neighbors('word', k=10)` | 返回 (score, word) 列表 |
| 词类比 | `model.get_analogies(pos1, neg1, pos2, k=5)` | 实现 `pos1 - neg1 + pos2` |

**关键参数默认值（`train_unsupervised`）**：
- `model='skipgram'`
- `dim=100`
- `ws=5`
- `epoch=5`
- `minCount=5`
- `neg=5`
- `loss='ns'`
- `bucket=2000000`
- `minn=3`, `maxn=6`
- `lr=0.05`

---
---

## 第四部分：FastText 实战进阶

在前三部分中，我们学习了 FastText 的基本概念、文本分类流程以及词向量训练方法。本部分将深入探讨三个进阶主题：**多语言词向量与跨语言应用**、**超参数自动调优的深入案例**、**将 FastText 与深度学习模型结合**。这些内容将帮助您在实际项目中更灵活地运用 FastText。

---

### 4.1 多语言词向量与跨语言应用

FastText 官方提供了 **157 种语言的预训练词向量**（包括中文、英文、法文等），并且支持跨语言向量对齐，即不同语言的词向量映射到同一个向量空间中，使得我们可以计算跨语言词语的相似度或进行双语词典抽取。

---

#### 4.1.1 加载预训练多语言词向量

从 [FastText 官网](https://fasttext.cc/docs/en/pretrained-vectors.html) 下载需要的语言模型（`.bin` 或 `.vec` 文件）。例如，中文的 **cc.zh.300.bin**（使用 Common Crawl 训练，维度 300）。

```python
import fasttext

---

# 加载中文预训练词向量
zh_model = fasttext.load_model('cc.zh.300.bin')

---

# 获取中文词的向量
vec_北京 = zh_model.get_word_vector('北京')
vec_上海 = zh_model.get_word_vector('上海')

---

# 查找中文词的最近邻
neighbors = zh_model.get_nearest_neighbors('苹果', k=5)
print("苹果的相似词:", neighbors)
```

---

#### 4.1.2 跨语言相似度（需要对齐的向量）

官方提供的不同语言向量是**独立训练**的，不在同一空间中。若要进行跨语言比较（如中文“苹果”与英文“apple”相似），需要使用**对齐**技术。常见方法：
- 使用双语词典通过 Procrustes 分析学习一个线性映射矩阵。
- 使用 MUSE 工具包（Facebook 开源）进行无监督或监督的跨语言对齐。

但 FastText 本身不直接提供对齐功能。不过，FastText 提供了**从 .vec 文件提取词向量**的简单方式，可以配合其他工具（如 Gensim 或 MUSE）完成对齐。

**简单示例：加载 .vec 文本格式（词表有限）**

```python
---

# .vec 文件格式：第一行是 词数 维度，之后每行 "word vector"
def load_fasttext_vec(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        vocab_size, dim = map(int, f.readline().split())
        vectors = {}
        for line in f:
            parts = line.rstrip().split(' ')
            word = parts[0]
            vec = [float(x) for x in parts[1:]]
            vectors[word] = vec
    return vectors

---

# 加载中文和英文的 .vec 文件（需要先下载或自己训练）
---

# zh_vectors = load_fasttext_vec('cc.zh.300.vec')
---

# en_vectors = load_fasttext_vec('cc.en.300.vec')
```

---

#### 4.1.3 多语言文本分类

可以使用 FastText 直接在**多语言混合语料**上训练分类模型（但要求所有语言都使用相同的标签）。FastText 的 n-gram 和子词机制对多语言有一定适应性（因为字符 n-gram 跨语言共享）。例如，同时使用中文和英文的训练数据，模型能学到一些跨语言的模式。

```python
---

# 准备多语言训练数据（每行格式：__label__category 词1 词2 ...）
---

# 例如：
---

# __label__sport 篮球 比赛 决赛
---

# __label__sport basketball game final
model = fasttext.train_supervised(input='multilingual_train.txt')
```

需要注意：多语言输入文件必须统一使用空格分词，中文需要预先用 jieba 等工具切分。

---

### 4.2 超参数自动调优深入案例

原始 PPT 中提到了 `autotuneValidationFile` 和 `autotuneDuration` 参数，本部分将深入讲解其工作原理和最佳实践。

---

#### 4.2.1 自动调优机制

FastText 的自动调优会在指定的时间（秒）内，使用验证集评估多个超参数组合，最终选择在验证集上性能最好的模型。调优的超参数包括：`lr`（学习率）、`epoch`（轮数）、`wordNgrams`、`dim`、`ws`、`minCount`、`neg`、`loss` 等。

**工作原理**（简化）：
- 从默认超参数开始，进行小范围扰动（如随机搜索或贝叶斯优化）。
- 每次评估一组超参数时，在训练集的一个子集上快速训练（可能减少 epoch 或采用早期停止），然后在验证集上评估。
- 根据有限的评估结果，选择最有希望的参数组合，最后使用完整训练集和最优参数重新训练最终模型。

---

#### 4.2.2 自动调优代码示例

```python
import fasttext

---

# 使用自动调优，最大搜索时间 300 秒（5分钟）
model = fasttext.train_supervised(
    input='cooking_train_pre.txt',
    autotuneValidationFile='cooking_valid_pre.txt',
    autotuneDuration=300,      # 单位：秒
    verbose=2                  # 输出调优过程细节
)

---

# 查看最终使用的超参数（通过 model 的属性或调优日志）
print(f"最终学习率: {model.lr}")
print(f"最终 epoch: {model.epoch}")
print(f"最终 wordNgrams: {model.wordNgrams}")
```

**注意**：
- 自动调优会修改模型对象的属性，训练出的模型已经是优化后的结果。
- 自动调优时间设置需合理：时间越长，搜索越充分，但耗时也越久。通常根据数据集大小设置 300~3600 秒。
- 调优过程中会临时创建多个模型，占用额外磁盘空间，确保有足够空闲空间。

---

#### 4.2.3 手动调优与自动调优的对比

| 方法 | 优点 | 缺点 |
|------|------|------|
| **手动调优** | 可解释性强，可结合领域知识；无需额外搜索时间 | 效率低，依赖经验，可能遗漏好的组合 |
| **自动调优** | 自动化，可探索大量组合，适合调参新手 | 耗时较长，可能过拟合验证集（若验证集太小） |

**最佳实践**：先用自动调优得到一个参考参数范围，然后手动进行微调。

---

### 4.3 将 FastText 与深度学习模型结合

FastText 的核心优势是快速、轻量，适合作为复杂深度学习模型的第一层嵌入或特征提取器。以下介绍两种结合方式：

---

#### 4.3.1 作为特征提取器（静态词向量）

训练好 FastText 词向量后，将其作为深度学习模型的**预训练嵌入层**，并在模型训练过程中**固定**词向量（不更新），或**微调**（更新）。

**示例：使用 PyTorch 加载 FastText 词向量并冻结**

```python
import torch
import torch.nn as nn
import fasttext
import numpy as np

---

# 1. 训练或加载 FastText 模型
ft_model = fasttext.load_model('fasttext_cbow.bin')

---

# 2. 构建词汇表（仅包含训练集中出现的词）
vocab = {'<PAD>': 0, '<UNK>': 1}   # 预留特殊 token
word_vectors = []

---

# 假设我们已经有了词汇表列表 words_list
for word in words_list:
    if word not in vocab:
        vocab[word] = len(vocab)
        # 获取 FastText 词向量
        vec = ft_model.get_word_vector(word)
        word_vectors.append(vec)

---

# 添加 <PAD> 和 <UNK> 的向量（全零 或 随机初始化）
pad_vec = np.zeros(ft_model.get_dimension())
unk_vec = np.random.randn(ft_model.get_dimension()) * 0.01
word_vectors = [pad_vec, unk_vec] + word_vectors

---

# 3. 创建 PyTorch 嵌入层并加载预训练权重
embedding_weight = torch.tensor(np.array(word_vectors), dtype=torch.float32)
embedding_layer = nn.Embedding.from_pretrained(embedding_weight, freeze=True)   # freeze=True 表示固定

---

# 4. 在模型中使用该嵌入层
class TextCNN(nn.Module):
    def __init__(self, embedding_layer, num_classes):
        super().__init__()
        self.embedding = embedding_layer
        self.conv = nn.Conv1d(in_channels=embedding_layer.embedding_dim, out_channels=100, kernel_size=3)
        self.fc = nn.Linear(100, num_classes)

    def forward(self, x):
        # x: (batch, seq_len) 词索引
        emb = self.embedding(x)   # (batch, seq_len, dim)
        emb = emb.permute(0, 2, 1)  # (batch, dim, seq_len) 适配 Conv1d
        conv_out = self.conv(emb)
        pooled = torch.max(conv_out, dim=2)[0]   # 最大池化
        logits = self.fc(pooled)
        return logits
```

---

#### 4.3.2 联合训练（可训练的嵌入 + FastText 作为正则化）

另一种方式：将 FastText 的预训练向量作为**正则化项**，与端到端训练的嵌入层结合。例如，在损失函数中加入约束，使得可训练的嵌入不偏离 FastText 向量太远。

这种方法不常见，通常直接使用预训练嵌入并微调（`freeze=False`）即可。

---

#### 4.3.3 作为文本分类的基线模型

在使用 BERT 等大模型之前，可以先用 FastText 训练一个简单分类器，作为**基线模型**。基线模型可以快速验证数据可学习性，并为复杂模型提供性能下限。

```python
---

# 快速构建 FastText 基线
baseline = fasttext.train_supervised(input='train.txt', epoch=10, lr=0.5)
baseline_acc = baseline.test('valid.txt')[1]
print(f"FastText Baseline Accuracy: {baseline_acc:.4f}")
```

如果 FastText 基线已经达到较高准确率（如 90%），可能不需要更复杂的模型；如果基线效果很差（如 < 50%），则可能数据本身有问题或任务太难。

---

### 4.4 补充：FastText 的局限性

尽管 FastText 高效且实用，它也有明显的局限性，在选择模型时需要权衡：

| 局限性 | 说明 | 解决方案/替代 |
|--------|------|---------------|
| **忽略长距离依赖** | 平均词向量的操作丢失了词序和远距离依赖 | 使用 RNN、CNN 或 Transformer |
| **无法处理一词多义** | 同一个词在不同上下文中只有一个向量 | 使用 ELMo、BERT 等上下文嵌入 |
| **对长文本分类效果一般** | 平均向量可能稀释重要信息 | 使用层次注意力网络或长文本模型 |
| **子词可能对中文不友好** | 中文字符 n-gram 意义有限 | 可尝试词级别模型，或使用专门的中文预训练向量 |
| **不支持 GPU 训练** | FastText 只支持 CPU 多线程 | 对于超大规模数据，可考虑使用 GPU 的深度学习框架 |

---

### 4.5 总结速查表（第四部分）

| 进阶主题 | 关键点 |
|----------|--------|
| **多语言词向量** | 官方提供多语言预训练模型；跨语言相似度需对齐；多语言混合分类可行 |
| **自动调优** | `autotuneValidationFile` + `autotuneDuration`，自动搜索超参数 |
| **与深度学习结合** | 作为静态特征提取器（预训练嵌入）或基线模型 |
| **局限性** | 词序丢失、一词多义、不适合长文本、无 GPU 支持 |

---
