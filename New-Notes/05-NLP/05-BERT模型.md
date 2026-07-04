# BERT模型

**标签：** #NLP #BERT

---

## 1. 什么是BERT

BERT（Bidirectional Encoder Representations from Transformers）是Google在2018年发布的预训练语言模型，横扫11项NLP任务最佳成绩。

**核心特点**：
- **双向编码**：同时利用左右两侧的上下文信息
- **预训练-微调范式**：在大规模语料上预训练，然后在下游任务上微调

---

## 2. BERT的预训练任务

### 2.1 掩码语言模型（MLM）

随机遮蔽输入中的15%的token，让模型预测它们。

**策略**：
- 80%的token被替换为[MASK]
- 10%的token被替换为随机token
- 10%的token保持不变

### 2.2 下一句预测（NSP）

判断两个句子是否为连续上下文。

---

## 3. BERT的变体

| 模型 | 特点 |
|------|------|
| **RoBERTa** | 去掉NSP任务，使用更多数据和更长训练 |
| **ALBERT** | 参数共享，减少模型大小 |
| **BERT-wwm** | 全词掩码，更适合中文 |
| **DistilBERT** | 知识蒸馏，模型更小更快 |

---

## 4. BERT应用示例

```python
from transformers import pipeline

# 文本分类
classifier = pipeline("text-classification")
result = classifier("I love this movie!")
print(result)  # [{'label': 'POSITIVE', 'score': 0.9998}]

# 命名实体识别
ner = pipeline("ner")
result = ner("Apple is looking at buying U.K. startup for $1 billion")
print(result)

# 问答系统
qa = pipeline("question-answering")
result = qa(question="What is the capital of France?", context="France is a country in Europe. Its capital is Paris.")
print(result)  # {'answer': 'Paris', 'score': 0.98}
```
