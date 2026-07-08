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


## 面试追问

**Q1（基础）**：HuggingFace 的 AutoTokenizer、AutoModel 这类 Auto 类是如何做到"自动匹配"模型架构的？
**回答要点**：每个模型在 Hub 上有 config.json 记录架构类型（如 bert、gpt2、t5）；Auto 类读取配置文件自动实例化对应的具体实现类（如 BertModel）；提供了统一的接口（from_pretrained、save_pretrained），使模型切换只需改 model_name。

**Q2（深挖）**：HuggingFace 的 Pipeline 和 Trainer 分别解决了什么场景的问题？Trainer 较自定义训练循环有哪些优势和不足？
**回答要点**：Pipeline 面向推理——一行代码完成特定任务；Trainer 面向训练——内置分布式训练、日志、检查点、评估循环；优势是减少样板代码和内置最佳实践；不足是自定义损失函数和复杂训练逻辑时不够灵活。

**Q3（实战）**：你微调了一个 BERT 模型需要部署上线，用 HuggingFace 生态你会做哪些推理优化？
**回答要点**：模型量化（bitsandbytes 4bit/8bit）减少显存；ONNX Runtime 导出 + 图优化加速推理；Flash Attention 2 加速注意力计算；TorchScript 或 TensorRT 编译优化；对于超大批量，使用 vLLM 或 Text Generation Inference 框架。

**Q4（边界）**：使用 HuggingFace Trainer 训练大模型时会遇到哪些常见陷阱？如何排查？
**回答要点**：OOM → 梯度累积、混合精度（fp16/bf16）、减小 batch size、启用梯度检查点；训练 loss 不下降 → 检查数据加载是否正确、学习率和 warmup 设置、是否有 NaN（开启 detect_anomaly）；数据加载成为瓶颈 → 增加 num_workers、使用 StreamingDataset；transformers 库版本与模型权重不兼容 → 确认 transformers 版本≥模型要求的版本。

> 参见 [10-BERT与MLM预训练](./10-BERT与MLM预训练.md)、[11-GPT与自回归生成](./11-GPT与自回归生成.md)、[06-自注意力与Transformer](./06-自注意力与Transformer.md)
