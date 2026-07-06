---
author: "XunZong"
created: "2026-07-06"
tags: ["NLP", "HuggingFace", "Transformers"]
aliases: ["HuggingFace", "Transformers", "Pipeline"]
---

# HuggingFace Transformers 库

## 定义

HuggingFace Transformers 是目前最主流的 NLP/DL 模型库，提供统一的 API 来使用 **BERT、GPT、T5、LLaMA** 等数万个预训练模型。

## Pipeline — 一行代码完成推理

```python
from transformers import pipeline

# 情感分析
classifier = pipeline("sentiment-analysis")
result = classifier("I love this course!")
# [{'label': 'POSITIVE', 'score': 0.987}]

# 文本生成
generator = pipeline("text-generation", model="gpt2")
generator("AI will", max_length=30)

# 问答
qa = pipeline("question-answering")
qa(context="Paris is capital of France", question="Where is Paris?")
```

| Pipeline 任务 | 说明 |
|:------------:|------|
| `sentiment-analysis` | 情感二分类 |
| `text-generation` | 文本生成（GPT） |
| `fill-mask` | 完形填空（BERT MLM） |
| `ner` | 命名实体识别 |
| `question-answering` | 抽取式问答 |
| `summarization` | 文本摘要 |
| `translation` | 机器翻译 |

## 模型加载与使用

```python
from transformers import AutoTokenizer, AutoModel, AutoModelForSequenceClassification

# 加载 tokenizer 和模型
model_name = "bert-base-chinese"
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForSequenceClassification.from_pretrained(model_name)

# 编码
inputs = tokenizer("我爱自然语言处理", return_tensors="pt")
# {'input_ids': tensor([[101, ...]]), 'attention_mask': tensor([[1, ...]])}

# 推理
outputs = model(**inputs)
logits = outputs.logits
```

| API | 用途 |
|:----|:----|
| `AutoTokenizer` | 自动加载对应模型的分词器 |
| `AutoModel` | 加载基础模型（输出隐状态） |
| `AutoModelForSequenceClassification` | 加载模型 + 分类头 |
| `AutoModelForCausalLM` | 加载自回归生成模型（GPT） |
| `AutoModelForSeq2SeqLM` | 加载 Seq2Seq 模型（T5、BART） |

## 训练与微调

```python
from transformers import Trainer, TrainingArguments

training_args = TrainingArguments(
    output_dir="./results",
    num_train_epochs=3,
    per_device_train_batch_size=16,
    learning_rate=2e-5,
    warmup_steps=500,
    logging_steps=100,
    save_strategy="epoch",
)

trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=train_dataset,
    eval_dataset=eval_dataset,
    tokenizer=tokenizer,
)
trainer.train()
```

## ML 中的 HuggingFace

| 应用场景 | 使用方式 |
|:--------:|:--------|
| **微调 BERT 做分类** | `AutoModelForSequenceClassification` + `Trainer` |
| **推理加速** | 模型量化、ONNX 导出、Flash Attention |
| **数据集加载** | `datasets.load_dataset("imdb")` |
| **训练日志** | TensorBoard / Wandb 集成 |
| **模型分享** | `model.push_to_hub("my-finetuned-model")` |

> 参见 [[10-BERT与MLM预训练]]、[[11-GPT与自回归生成]]、[[06-自注意力与Transformer]]
