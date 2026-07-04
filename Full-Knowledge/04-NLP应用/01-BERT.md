---
tags: [NLP/预训练模型/Transformer]
parent_moc: [[核心依赖链]]
aliases: [BERT, Bidirectional Encoder Representations from Transformers]
layer: 层级4-NLP应用
prerequisites: [Transformer编码器, 词嵌入]
successors: [微调, 文本分类, NER, 问答]
---

# 深度卡片：BERT

## L1：是什么（定义/公式/结构）

### 严谨定义
BERT是基于Transformer编码器架构的预训练语言模型，通过MLM和NSP两个自监督预训练任务，在大规模无标注语料上学习深层双向上下文表示，然后通过微调适配下游NLP任务。

### 预训练任务

| 任务 | 描述 | 目标 |
|------|------|------|
| MLM（掩码语言模型） | 随机遮蔽15%的token，预测被遮蔽的token | 双向上下文理解 |
| NSP（下一句预测） | 判断两个句子是否连续 | 句子关系建模 |

### MLM策略

被选中的token中：
- 80%替换为[MASK]
- 10%替换为随机token
- 10%保持不变

### 模型结构

```
输入：[CLS] 句子A [SEP] 句子B [SEP]
      ↓
嵌入层：Token + Segment + Position
      ↓
Transformer编码器 × 12/24层
      ↓
输出：[CLS]表示（分类）/ 每个token表示（序列标注）
```

---

## L2：为什么（设计意图/解决什么问题）

### 为什么需要BERT？

**问题1：预训练-微调范式**

传统方法：每个任务从头训练
BERT方法：在大规模语料上预训练通用表示，然后在下游任务上微调

**优势**：
- 减少标注数据需求
- 提升小数据集性能
- 通用表示可复用

**问题2：双向上下文**

GPT是单向的（从左到右），无法同时利用左右上下文。BERT通过MLM实现双向建模：
- 对于"the bank of the river"，BERT可以同时看到"bank"左右的词
- 更好地理解多义词（如"bank"是河岸还是银行）

**问题3：NLP任务的统一框架**

BERT通过微调可以适配各种任务：
- 文本分类：使用[CLS]表示
- 序列标注：使用每个token的表示
- 问答：预测答案的起始和结束位置

---

## L3：怎么用（代码实现/调参/场景）

### HuggingFace实现

```python
from transformers import BertTokenizer, BertForSequenceClassification
from transformers import Trainer, TrainingArguments

# 加载模型和分词器
tokenizer = BertTokenizer.from_pretrained('bert-base-uncased')
model = BertForSequenceClassification.from_pretrained('bert-base-uncased', num_labels=2)

# 数据预处理
def tokenize_function(examples):
    return tokenizer(examples['text'], padding='max_length', truncation=True, max_length=512)

# 训练参数
training_args = TrainingArguments(
    output_dir='./results',
    num_train_epochs=3,
    per_device_train_batch_size=16,
    learning_rate=2e-5,
    evaluation_strategy='epoch',
)

# 创建Trainer并训练
trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=train_dataset,
    eval_dataset=eval_dataset,
)
trainer.train()
```

---

## L4：坑在哪（边界条件/失效场景/常见误解）

### 常见误解

| 误解 | 正确理解 | 后果 |
|------|----------|------|
| "BERT可以生成文本" | BERT是编码器，不适合生成 | 误用架构 |
| "BERT的注意力权重=特征重要性" | 注意力权重不一定反映重要性 | 解释性陷阱 |

### 边界条件

**1. 最大长度512 token**

BERT无法处理超过512 token的长文档。

**解决方案**：截断、分段编码、Longformer

**2. 预训练-微调不一致**

预训练有[MASK]，微调没有，导致分布不一致。

**解决方案**：10%随机替换和10%保持不变的策略

**3. 计算成本高**

推理需要计算所有层的注意力。

**解决方案**：DistilBERT、模型剪枝

---

## 💼 面试追问树

### Q1（基础）：BERT的预训练任务是什么？

**回答要点**：
1. MLM：随机遮蔽15%的token，预测被遮蔽的token
2. NSP：判断两个句子是否连续
3. 目标：学习双向上下文表示

### Q2（深挖）：BERT和GPT有什么本质区别？

**回答要点**：
1. 架构：BERT是编码器（双向），GPT是解码器（单向）
2. 任务：BERT适合理解任务，GPT适合生成任务
3. 预训练目标：BERT用MLM，GPT用CLM

### Q3（边界）：BERT有什么局限性？

**回答要点**：
1. 最大长度512 token
2. 预训练-微调不一致
3. 计算成本高
4. 不适合生成任务

---

## 🔗 关联知识网络

**上游依赖**：[[Transformer编码器]], [词嵌入]]

**下游应用**：
- [[微调]]：适配下游任务
- [[文本分类]]：情感分析、新闻分类
- [[命名实体识别]]：序列标注
- [[问答系统]]：抽取式问答

**并列概念**：[[GPT系列]], [RoBERTa]], [ALBERT]]
