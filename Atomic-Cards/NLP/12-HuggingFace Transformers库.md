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
classifier = pipeline("sentiment-analysis")                                 # 创建情感分析 pipeline，自动加载默认的蒸馏模型

result = classifier("I love this course!")                                  # 对输入文本进行情感分类，返回标签（POSITIVE/NEGATIVE）和置信度分数
# [{'label': 'POSITIVE', 'score': 0.987}]

# 文本生成
generator = pipeline("text-generation", model="gpt2")                       # 创建文本生成 pipeline，显式指定使用 GPT-2 模型

generator("AI will", max_length=30)                                         # 以 "AI will" 为前缀，自回归逐个 token 续写，最长生成 30 个 token

# 问答
qa = pipeline("question-answering")                                         # 创建抽取式问答 pipeline，自动加载默认模型

qa(context="Paris is capital of France", question="Where is Paris?")        # 在给定上下文中定位答案，返回答案文本及其在原文中的起止位置
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
model_name = "bert-base-chinese"                                                                     # 指定模型名称，HuggingFace Hub 上的中文 BERT 基座模型

tokenizer = AutoTokenizer.from_pretrained(model_name)                                                # 自动加载与模型匹配的分词器，负责将文本切分为 token 并映射为 ID

model = AutoModelForSequenceClassification.from_pretrained(model_name)                               # 加载预训练 BERT 权重并附加序列分类头，用于句子级分类任务

# 编码
inputs = tokenizer("我爱自然语言处理", return_tensors="pt")                                        # 将输入文本分词、填充、截断，返回 PyTorch 张量（input_ids + attention_mask）
# {'input_ids': tensor([[101, ...]]), 'attention_mask': tensor([[1, ...]])}

# 推理
outputs = model(**inputs)                                                                            # 将编码后的输入送入模型前向传播，返回包含 logits、隐状态等的输出对象

logits = outputs.logits                                                                              # 提取分类头的原始分数（未经过 Softmax），形状为 (batch_size, num_labels)
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

# 配置训练超参数：控制输出路径、训练轮数、批次大小、学习率策略和保存频率
training_args = TrainingArguments(

    output_dir="./results",                        # 模型检查点、日志和配置文件的保存目录

    num_train_epochs=3,                            # 在整个训练集上迭代 3 轮（epoch），防止欠拟合

    per_device_train_batch_size=16,                # 每张 GPU 的批次大小，总 batch size = 16 × GPU 数量

    learning_rate=2e-5,                            # AdamW 优化器初始学习率（BERT 微调常用 2e-5~5e-5），过大易导致 loss 震荡

    warmup_steps=500,                              # 前 500 步学习率从 0 线性预热到目标值，稳定训练初期梯度更新

    logging_steps=100,                             # 每 100 步输出一次 loss 和学习率等训练指标，便于监控收敛状态

    save_strategy="epoch",                         # 每个 epoch 结束时保存一次模型，兼顾恢复点与存储开销
)

# 创建 Trainer 实例：封装模型、训练参数、数据集和分词器，自动管理训练循环
trainer = Trainer(

    model=model,                                   # 待微调的预训练模型（如 BERT），其权重将在训练中更新

    args=training_args,                            # 上述 TrainingArguments 配置对象

    train_dataset=train_dataset,                   # 训练数据集，应为 HuggingFace Dataset 格式，包含 input_ids 和 labels

    eval_dataset=eval_dataset,                     # 验证数据集，每个 epoch 结束后自动评估，用于监控过拟合

    tokenizer=tokenizer,                           # 分词器，保存模型时一并保存分词配置，保证推理时预处理一致
)
trainer.train()                                    # 启动完整训练循环：前向传播 → loss 计算 → 反向传播 → 参数更新 → 日志记录
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

## 参考引用
- 需要理解BERT与MLM预训练的相关知识，参见 [BERT与MLM预训练](./10-BERT与MLM预训练.md)
- 需要理解GPT与自回归生成的相关知识，参见 [GPT与自回归生成](./11-GPT与自回归生成.md)
- 需要理解自注意力与Transformer的相关知识，参见 [自注意力与Transformer](./06-自注意力与Transformer.md)