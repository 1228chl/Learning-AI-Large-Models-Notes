
# Transformers 库和 Bert 应用（核心精简版）

## 一、Transformers 库简介

- **开发**：Huggingface
- **核心价值**：提供大量 SOTA 预训练模型（BERT、GPT、RoBERTa 等），统一 API，支持 PyTorch/TensorFlow，可微调、可部署。
- **安装**：`pip install transformers`

---

## 二、三种使用层次（由简到繁）

| 层次 | 方式 | 代码量 | 灵活性 | 适用场景 |
|------|------|--------|--------|----------|
| **第一层** | Pipeline | 最少 | 低 | 快速原型、教学 |
| **第二层** | AutoModel | 中等 | 中 | 大多数微调、推理任务 |
| **第三层** | SpecificModel | 中等 | 高 | 研究、修改模型内部 |

---

### 2.1 Pipeline（极简）

- 自动完成分词、前向、后处理。
- 支持任务：`text-classification`, `feature-extraction`, `fill-mask`, `question-answering`, `summarization`, `translation`, `text-generation`, `ner`, `zero-shot-classification` 等。

```python
from transformers import pipeline

# 特征提取
model = pipeline('feature-extraction', model='bert-base-chinese')
result = model("我爱你")   # 返回 (1, seq_len, 768)

# 情感分类
classifier = pipeline('text-classification', model='distilbert-base-uncased-finetuned-sst-2')
classifier("I love this movie!")
```

---

### 2.2 AutoModel（自动模型，推荐）

- 通过模型名称自动加载对应的分词器和模型架构，更换模型只需改名字。

```python
from transformers import AutoTokenizer, AutoModel

tokenizer = AutoTokenizer.from_pretrained('bert-base-chinese')
model = AutoModel.from_pretrained('bert-base-chinese')

texts = ["我爱你", "我喜欢你"]
inputs = tokenizer(texts, padding=True, truncation=True, return_tensors='pt')
outputs = model(**inputs)
last_hidden = outputs.last_hidden_state   # (batch, seq_len, 768)
pooled = outputs.pooler_output            # (batch, 768)
```

- 特定任务自动模型：
  - `AutoModelForSequenceClassification`（分类）
  - `AutoModelForTokenClassification`（NER）
  - `AutoModelForQuestionAnswering`（问答）
  - `AutoModelForCausalLM`（生成）

---

### 2.3 SpecificModel（具体模型）

- 明确指定模型类（如 `BertTokenizer`, `BertModel`），可访问特有参数和内部结构。

```python
from transformers import BertTokenizer, BertModel

tokenizer = BertTokenizer.from_pretrained('bert-base-chinese')
model = BertModel.from_pretrained('bert-base-chinese', output_attentions=True)
```

- 适合需要修改模型、获取中间层注意力权重等高级场景。

---

## 三、Tokenizer 关键参数

```python
tokenizer(text, 
          padding=True,           # 批次内填充到最长
          truncation=True,        # 截断超过max_length的部分
          max_length=128,         # 最大长度
          return_tensors='pt')    # 返回PyTorch张量（'tf'/'np'）
```

- 返回字典：`input_ids`, `token_type_ids`, `attention_mask`。

---

## 四、BERT 微调实战（以文本分类为例）

### 4.1 数据准备（使用 datasets 库或自定义）

```python
from datasets import load_dataset
dataset = load_dataset('csv', data_files={'train': 'train.csv', 'test': 'test.csv'})
```

### 4.2 加载模型与分词器

```python
from transformers import AutoTokenizer, AutoModelForSequenceClassification

model_name = 'bert-base-chinese'
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForSequenceClassification.from_pretrained(model_name, num_labels=2)
```

### 4.3 预处理函数

```python
def preprocess(examples):
    return tokenizer(examples['text'], truncation=True, padding='max_length', max_length=128)

encoded = dataset.map(preprocess, batched=True)
```

### 4.4 训练参数与 Trainer

```python
from transformers import TrainingArguments, Trainer

training_args = TrainingArguments(
    output_dir='./results',
    evaluation_strategy='epoch',
    learning_rate=2e-5,
    per_device_train_batch_size=16,
    num_train_epochs=3,
    weight_decay=0.01,
    load_best_model_at_end=True,
)

trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=encoded['train'],
    eval_dataset=encoded['test'],
    tokenizer=tokenizer,
)

trainer.train()
model.save_pretrained('./my_model')
tokenizer.save_pretrained('./my_model')
```

### 4.5 常用微调技巧

- **学习率**：BERT 微调常用 2e-5 或 3e-5。
- **动态填充**：使用 `DataCollatorWithPadding(tokenizer)` 提高效率。
- **混合精度**：`fp16=True`（需 GPU 支持）。
- **梯度累积**：`gradient_accumulation_steps=4` 模拟大批次。
- **冻结主体**：`for param in model.bert.parameters(): param.requires_grad = False` 只训练分类头。

---

## 五、常见任务速查

| 任务 | 模型类 | Pipeline 任务名 |
|------|--------|----------------|
| 文本分类 | `AutoModelForSequenceClassification` | `text-classification` |
| 序列标注（NER） | `AutoModelForTokenClassification` | `ner` |
| 问答 | `AutoModelForQuestionAnswering` | `question-answering` |
| 特征提取 | `AutoModel` | `feature-extraction` |
| 文本生成（GPT） | `AutoModelForCausalLM` | `text-generation` |
| 掩码填充 | `AutoModelForMaskedLM` | `fill-mask` |

---

## 六、常见错误与解决

| 错误 | 原因 | 解决 |
|------|------|------|
| 序列长度超限 | 未截断 | `truncation=True` |
| 显存不足 | batch 太大或序列太长 | 减小 batch、max_length，开梯度累积、混合精度 |
| 批次内长度不一致 | 未填充 | `padding=True` |
| 标签数量不匹配 | `num_labels` 设置错误 | 检查分类头输出维度 |

---

## 七、总结速查

- **加载**：`from_pretrained('model_name')`
- **分词**：`tokenizer(text, padding=True, truncation=True, return_tensors='pt')`
- **前向**：`model(**inputs)`
- **保存**：`model.save_pretrained('./path')`, `tokenizer.save_pretrained('./path')`
- **最简方式**：`pipeline(task, model)`
