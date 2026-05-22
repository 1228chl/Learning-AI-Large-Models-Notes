**上一级：** [04Dify](04Dify.md)

**下一级：** [[]]

**标签：** #Dify #Agent #重点 

---

# 详细解读：TF、IDF、TF-IDF 与 BM 25

> 本文档结合 Dify / RAGFlow 中的全文检索与混合检索机制，深度解析 TF、IDF、TF‑IDF 及 BM 25 算法的原理、公式、代码示例以及它们在检索系统中的实际应用。

---

## 一、全文检索基础：倒排索引

在理解 TF、IDF 等概念之前，需要先了解全文检索的核心数据结构——**倒排索引**。

倒排索引类似于书籍末尾的“关键词索引”：它记录了 **每个词出现在哪些文档中**，以及出现的位置、次数等信息。

### 1.1 示例：三篇文档

- **doc 1**：全文检索技术是信息检索领域的重要研究方向。它通过构建倒排索引，实现大规模文档的快速搜索。相比顺序扫描，全文检索的效率更高。
- **doc 2**：现代搜索引擎普遍采用全文检索技术。倒排索引是全文检索系统的核心数据结构。百度、Google 都依赖倒排索引来实现毫秒级查询。
- **doc 3**：中文分词是全文检索中非常关键的一步。分词质量直接影响搜索效果和召回率。常用工具包括 jieba、HanLP 等。

### 1.2 倒排索引结构（简化）

| 词项     | 包含该词的文档                     | 词频（在各文档中）                       | 位置信息（示例）         |
| -------- | ---------------------------------- | ---------------------------------------- | ------------------------ |
| 全文检索 | doc 1, doc 2, doc 3                   | doc 1:2, doc 2:1, doc 3:1                   | doc 1:[0,5], doc 2:[0]...  |
| 倒排索引 | doc 1, doc 2                         | doc 1:1, doc 2:2                           | doc 1:[2], doc 2:[1,4]...  |
| 分词     | doc 3                               | doc 3:2                                   | doc 3:[0,4]               |
| 效率     | doc 1                               | doc 1:1                                   | doc 1:[6]                 |
| ...      | ...                                | ...                                      | ...                      |

当用户搜索“全文检索 效率”时，系统会分别查找两个词项，取文档集合的交集（doc 1），再根据相关度排序（如 BM 25）。

---

## 二、TF（Term Frequency，词频）

**定义**：  
词频是指某一个词在 **某一篇文档** 中出现的次数。它反映了该词对这篇文档的重要性。

**原始词频**：  
`tf_raw = 词 t 在文档 d 中出现的次数`

**归一化词频**（常用形式）：  
为了避免长文档天然具有更高词频的问题，通常会对词频进行归一化：

$$TF\left(t,d\right)=\frac{词t在文档d中出现的次数}{文档d的总词数}$$

> 示例：doc 1 总词数 = 20，其中“全文检索”出现 2 次，则 TF = 2/20 = 0.1。

在 Dify / RAGFlow 的全文检索中，TF 是 BM 25 公式的输入之一。

---

## 三、IDF（Inverse Document Frequency，逆文档频率）

**定义**：  
逆文档频率衡量一个词的 **普遍重要性**。如果一个词在很多文档中都出现，说明它很普通（如“的”、“是”），重要性低；如果只在少数文档中出现，则它很有区分度，重要性高。

**公式**：

$$IDF\left(t\right)=\log_{}\left(\frac{N}{n\left(t\right)+1}\right)$$

- N：文档集中的总文档数
- n(t)：包含词 t 的文档数量
- +1 防止分母为零

**变体（BM 25 中使用）**：

$$IDF\left(t\right)=\log\left(1+\frac{N-n\left(t\right)+0.5}{n\left(t\right)+0.5}\right)$$

> 示例：总文档数 N = 1000，包含“全文检索”的文档有 50 篇，则 IDF ≈ log(1000/51) ≈ 1.29；而包含“的”的文档有 990 篇，IDF ≈ log(1000/991) ≈ 0.004，几乎无区分度。

在 Dify 的全文检索节点中，IDF 通常是在索引构建时预先计算并存储的，用于后续的检索排序。

---

## 四、TF‑IDF（词频-逆文档频率）

**定义**：  
TF‑IDF 综合了词频（局部重要性）和逆文档频率（全局独特性），用来评估一个词对某篇文档的重要程度。

**公式**：

$${TF\text {-}IDF}\left(t,d\right)=TF\left(t,d\right)\cdot IDF\left(t\right)$$

**特点**：

- 词在文档中出现越多，TF‑IDF 越高（对这篇文档重要）
- 词在所有文档中出现越少，TF‑IDF 越高（越独特）
- 常见的停用词（的、是、在）TF 可能较高，但 IDF 极低，因此最终得分也很低。

**局限性**（为什么需要 BM 25）：

- TF‑IDF 没有上限：一个词在文档中出现 100 次，得分就是 100 倍，可能导致过分强调重复词。
- 对文档长度不敏感：长文档更容易获得高分，即使内容不相关。

---

## 五、BM 25（Okapi BM 25）

BM 25 是目前 **全文检索中最主流的排序算法**，被 Elasticsearch、Lucene、Dify 全文检索节点等广泛采用。它是对 TF‑IDF 的改进，引入了 **词频饱和** 和 **文档长度归一化** 机制。

### 5.1 BM 25 公式

$$score\left(D,Q\right)=\sum_{i=1}^{n}IDF\left(t_{i}\right)\cdot\frac{f\left(t_{i},D\right)\cdot\left(k1+1\right)}{f\left(t_{i},D\right)+k1\cdot\left(1-b+b\cdot\frac{\left|D\right|}{avgd1}\right)}$$

参数解释：

- `D`：文档  
- `Q`：查询（由多个词 t_i 组成）  
- `f(t_i, D)`：词 t_i 在文档 D 中的词频（原始次数）  
- `|D|`：文档 D 的长度（词数）  
- `avgdl`：所有文档的平均长度  
- `k1`：控制词频饱和度的参数，默认 1.2（值越大，词频的影响越线性；值越小，词频很快达到饱和）  
- `b`：控制文档长度归一化程度，默认 0.75（b=0 时不归一化，b=1 完全归一化）  
- `IDF(t_i)`：通常使用 BM 25 变体 `log(1 + (N - n(t_i) + 0.5) / (n(t_i) + 0.5))`

### 5.2 BM 25 的关键改进

1. **词频饱和**  
   - 分子中的 `(k1+1)` 和分母中的 `+ k1` 使得词频增加时得分增长速度逐渐放缓。  
   - 当 `f` 很大时，整个分数趋向于 `(k1+1)` 倍 IDF，不会无限增长。

2. **文档长度归一化**  
   - 项 `(1-b + b×|D|/avgdl)` 衡量文档长度与平均长度的比例。  
   - 长文档会受到适当惩罚，避免长文档仅因词数多而排名靠前。

3. **IDF 变体**  
   - 使用平滑的 IDF 公式，避免极端情况。

### 5.3 BM 25 计算示例

假设：

- 文档 D：`"全文检索 倒排索引 效率"`，长度 |D| = 3  
- avgdl = 5，k 1 = 1.2，b = 0.75  
- 查询 Q：`"全文检索 效率"`  
- N = 100，n(全文检索) = 10，n(效率) = 20

计算 IDF：

```
IDF(全文检索) = log(1 + (100-10+0.5)/(10+0.5)) = log(1 + 90.5/10.5) ≈ log(9.62) ≈ 0.983
IDF(效率) = log(1 + (100-20+0.5)/(20+0.5)) = log(1 + 80.5/20.5) ≈ log(4.93) ≈ 0.693
```

计算词频部分（文档中两个词都出现 1 次）：

- 分母长度项 = 1 - 0.75 + 0.75*(3/5) = 0.25 + 0.45 = 0.7
- 对于每个词：分数贡献 = 1.2×1 / (1 + 1.2×0.7) = 1.2 / 1.84 ≈ 0.652

总分：

```
score = 0.983×0.652 + 0.693×0.652 = (0.983+0.693)×0.652 ≈ 1.676×0.652 ≈ 1.093
```

---

## 六、在 Dify / RAGFlow 中的应用

### 6.1 全文检索节点

Dify 的 **全文检索** 模式底层使用 BM 25 算法（或类似变体）。当你在知识库设置中选择“全文检索”时：

1. 系统对所有文档分段建立倒排索引（使用 jieba 分词）。  
2. 用户查询经过同样的分词处理。  
3. 通过倒排索引快速定位候选分段。  
4. 使用 BM 25 计算每个候选分段的得分。  
5. 按得分降序返回 Top‑K 分段。

### 6.2 混合检索中的全文检索部分

在混合检索中，全文检索（BM 25）与向量检索（语义）的结果会被合并。常见的合并策略：

- **线性加权**：`最终得分 = α × BM25_score + (1-α) × cosine_similarity`  
- **Rerank 模型**：将两种召回的候选集合并后，送入一个专门的 Rerank 模型（如 `qwen3-rerank`）重新打分排序。

Dify 的混合检索支持配置权重，也可以启用 Rerank 模型。

### 6.3 RAGFlow 中的全文检索增强

RAGFlow 除了支持 BM 25 全文检索外，还引入了 **RAPTOR** 策略：对文档进行递归聚类并生成摘要，再将摘要与原文一同索引，提高对长文档的检索能力。不过其全文检索核心算法仍然是基于 BM 25 的变种。

---

## 七、代码示例：使用 jieba + 手动实现 BM 25

以下是一个极简的 BM 25 实现，帮助你理解内部逻辑（实际 Dify 使用了更优化的库）。

```python
import jieba
import math
from collections import Counter

class BM25:
    def __init__(self, docs, k1=1.2, b=0.75):
        self.docs = docs                     # 文档列表（原始文本）
        self.k1 = k1
        self.b = b
        self.tokenized_docs = [list(jieba.cut_for_search(doc)) for doc in docs]
        self.doc_lengths = [len(doc) for doc in self.tokenized_docs]
        self.avgdl = sum(self.doc_lengths) / len(self.docs)
        self.doc_count = len(self.docs)
        self.idf = self._compute_idf()

    def _compute_idf(self):
        # 统计每个词出现在多少文档中
        df = Counter()
        for tokens in self.tokenized_docs:
            unique_terms = set(tokens)
            for term in unique_terms:
                df[term] += 1
        # 计算 idf
        idf = {}
        for term, freq in df.items():
            idf[term] = math.log(1 + (self.doc_count - freq + 0.5) / (freq + 0.5))
        return idf

    def score(self, query):
        query_tokens = list(jieba.cut_for_search(query))
        scores = []
        for idx, doc_tokens in enumerate(self.tokenized_docs):
            doc_len = self.doc_lengths[idx]
            score = 0.0
            term_freq = Counter(doc_tokens)
            for term in set(query_tokens):
                if term not in self.idf:
                    continue
                f = term_freq.get(term, 0)
                if f == 0:
                    continue
                idf_val = self.idf[term]
                # BM25 分数项
                numerator = f * (self.k1 + 1)
                denominator = f + self.k1 * (1 - self.b + self.b * doc_len / self.avgdl)
                score += idf_val * (numerator / denominator)
            scores.append(score)
        # 返回文档索引和得分，按得分降序排序
        ranked = sorted(enumerate(scores), key=lambda x: x[1], reverse=True)
        return ranked

# 示例
docs = [
    "全文检索技术是信息检索领域的重要研究方向。",
    "倒排索引是全文检索系统的核心数据结构。",
    "中文分词是全文检索中非常关键的一步。"
]
bm25 = BM25(docs)
query = "全文检索 分词"
results = bm25.score(query)
for idx, score in results:
    print(f"文档{idx+1}: {docs[idx][:30]}... 得分={score:.4f}")
```

---

## 八、总结表

| 概念     | 核心公式                                   | 特点                                                         | 在 Dify / RAGFlow 中的作用                   |
| -------- | ------------------------------------------ | ------------------------------------------------------------ | --------------------------------------------- |
| TF       | TF = 词在文档中的次数 / 文档总词数         | 局部重要性，长文档易偏高                                     | BM 25 的输入因子                               |
| IDF      | IDF = log(N / n(t))                        | 全局独特性，常用词得分低                                     | 单独可用于关键词权重，但通常结合 TF           |
| TF‑IDF   | TF‑IDF = TF × IDF                          | 简单直观，但无词频饱和、无长度归一化                         | 很少单独使用，被 BM 25 取代                    |
| BM 25     | 见公式（带 k 1, b 的改进版）                | 词频饱和、文档长度归一化、排序更合理，业界标准               | Dify 全文检索的默认算法；混合检索中的基础组件 |

---

以上是 TF、IDF、TF‑IDF 和 BM 25 的详细解读。在 Dify 或 RAGFlow 中配置 **全文检索** 或 **混合检索** 时，理解这些底层原理将帮助你更合理地调试参数（如分词器、k 1、b、权重比例等），从而提升检索效果。
