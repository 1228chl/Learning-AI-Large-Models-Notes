---
author: "XunZong"
created: "2026-07-09"
tags: ["AI-Agent", "RAG", "意图识别"]
aliases: ["BERT微调", "意图分类", "BERT Fine-tuning", "Intent Classification"]
---

# 意图识别（BERT微调分类模型）

## 定义

意图识别（Intent Classification）是 RAG 系统的第三道关卡，在 Redis 缓存和 MySQL FAQ 均未命中后触发，判断用户查询属于"通用知识"还是"专业咨询"——通用走 LLM 直接回答，专业走 Milvus RAG 检索生成。通过微调 BERT 分类模型实现意图识别，比使用 LLM Prompt 分类更快、更稳定、更便宜。

### 形式化定义

意图识别是一个多分类问题：给定用户查询 $q$，预测其意图类别 $y \in \mathcal{Y}$：

$$
y^* = \arg\max_{y \in \mathcal{Y}} P(y \mid q; \theta)
$$

其中 $P(y \mid q; \theta)$ 是 BERT 模型预测查询 $q$ 属于类别 $y$ 的概率，$\theta$ 为 BERT 微调后的模型参数。$\mathcal{Y}$ 为预定义的意图类别集合：

$$
\mathcal{Y} = \{\text{通用知识}, \text{专业咨询}\}
$$

- $\mathcal{Y}$：意图类别集合，根据业务需求定义
- $P(y \mid q; \theta)$：BERT [CLS] 向量通过全连接层 + softmax 得到的类别概率分布
- $\theta$：BERT 预训练权重 + 分类头全连接层的参数，通过微调更新

## BERT 微调三阶段流程

### 第一阶段：数据准备（约 5000 条）

```python
import pandas as pd
from sklearn.model_selection import train_test_split

# 1. 收集用户真实查询，人工标注意图标签
#    数据量：约 5000 条，覆盖所有意图类别

data = [
    # (query, intent)
    ("什么是神经网络", "通用知识"),
    ("Transformer 自注意力机制原理", "专业咨询"),
    ("你好", "通用知识"),
    ("JAVA课程费用多少", "专业咨询"),
    # ... 约 5000 条
]

df = pd.DataFrame(data, columns=["query", "intent"])

# 2. 按类别分层抽样，保证各类别都有代表性样本
#    训练集 4000 条 + 测试集 1000 条（后续扩展至 2000 条测试）
train_df, test_df = train_test_split(
    df,
    test_size=0.2,          # 20% 作为测试集
    stratify=df["intent"],  # 分层抽样，保持各类别比例一致
    random_state=42
)

print(f"训练集: {len(train_df)} 条")
print(f"测试集: {len(test_df)} 条")
print(f"意图类别: {df['intent'].value_counts().to_dict()}")
```

### 第二阶段：模型训练与优化

```python
from transformers import (
    BertTokenizer,
    BertForSequenceClassification,
    Trainer,
    TrainingArguments
)
import torch

# 1. 加载预训练 BERT 模型和分词器
model_name = "bert-base-chinese"        # 中文 BERT 预训练模型
tokenizer = BertTokenizer.from_pretrained(model_name)
model = BertForSequenceClassification.from_pretrained(
    model_name,
    num_labels=len(df["intent"].unique())  # 分类数 = 意图类别数
)

# 2. 数据预处理：将 query 编码为 BERT 输入格式
def encode(examples):
    return tokenizer(
        examples["query"],
        padding="max_length",    # 填充至统一长度
        truncation=True,         # 超出 max_length 的截断
        max_length=128           # 短文本分类，128 足够
    )

# 3. 配置训练参数
training_args = TrainingArguments(
    output_dir="./intent_model",
    learning_rate=2e-5,              # BERT 微调典型学习率
    per_device_train_batch_size=32,   # 根据 GPU 显存调整
    per_device_eval_batch_size=64,
    num_train_epochs=3,               # 3 个 epoch 足够（防止过拟合）
    weight_decay=0.01,                # L2 正则化
    evaluation_strategy="epoch",      # 每个 epoch 评估一次
    save_strategy="epoch",
    load_best_model_at_end=True,      # 训练结束时加载最优模型
    metric_for_best_model="accuracy", # 以准确率作为选优指标
)

# 4. 创建 Trainer 并开始训练
trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=train_encoded,
    eval_dataset=test_encoded,
    tokenizer=tokenizer,
)

trainer.train()
```

### 第三阶段：评估与部署（准确率约 95%）

```python
# 1. 在 2000 条测试集上评估
eval_results = trainer.evaluate()
print(f"评估准确率: {eval_results['eval_accuracy']:.2%}")
# 输出: 评估准确率: 95.00%

# 2. 保存模型供推理使用
model.save_pretrained("./intent_model_final")
tokenizer.save_pretrained("./intent_model_final")

# 3. 推理示例：对用户查询进行意图分类
def classify_intent(query: str) -> dict:
    """使用微调后的 BERT 模型进行意图分类"""
    inputs = tokenizer(
        query,
        return_tensors="pt",
        padding=True,
        truncation=True,
        max_length=128
    )

    with torch.no_grad():
        outputs = model(**inputs)
        probs = torch.softmax(outputs.logits, dim=-1)
        pred_id = torch.argmax(probs, dim=-1).item()

    intent_labels = {0: "通用知识", 1: "专业咨询"}
    return {
        "intent": intent_labels[pred_id],
        "confidence": probs[0][pred_id].item()
    }

# 使用示例
result = classify_intent("Transformer 为什么需要多头注意力")
print(f"意图: {result['intent']}, 置信度: {result['confidence']:.2%}")
# 输出: 意图: 专业咨询, 置信度: 98.50%
```

## BERT vs LLM Prompt 分类对比

| 对比维度 | BERT 微调分类 | LLM Prompt 分类 |
|:--------|:-------------|:----------------|
| **推理速度** | 快（10-50ms） | 慢（500-2000ms） |
| **推理成本** | 低（CPU 可运行） | 高（每次调用消耗 token） |
| **准确率** | 高（任务特定，>95%） | 依赖 LLM 能力 |
| **新增类别** | 需重新训练 | 仅需改 Prompt |
| **冷启动** | 需标注数据 | 零样本即可 |
| **可解释性** | 黑盒（仅输出标签+置信度） | 可输出推理过程 |
| **适用场景** | 固定类别、高频调用 | 类别多变、低频调用 |

## ML/DL 应用场景

| 应用场景 | BERT 意图类别 | 路由目标 |
|:--------|:-------------|:---------|
| **EduRAG 问答系统** | 通用知识 / 专业咨询 | MySQL → BERT → (LLM 直答 \| Milvus RAG) |
| **客服系统** | 退换货 / 投诉 / 咨询 / 闲聊 | 各业务子系统 |
| **智能文档检索** | 精确定位 / 概念理解 / 对比分析 | Direct / HyDE / SubQuery |
| **多轮对话路由** | 追问 / 新话题 / 闲聊 | 保留对话历史 / 重置检索 |

## 面试追问

**Q1（基础）**：为什么在 RAG 系统中使用 BERT 微调而不是直接用 LLM 做意图分类？
**回答要点**：

1. BERT 推理速度更快（10-50ms），远低于 LLM 的 500-2000ms，适合作为 RAG 系统入口的高频调用
2. BERT 推理成本更低，可在 CPU 上运行，不需要 GPU 或消耗 API token
3. BERT 在固定类别分类任务上准确率可达 95%+，且远低于 LLM 的调用成本

**Q2（深挖）**：BERT 微调时学习率和训练轮次如何选择？为什么？
**回答要点**：

1. 学习率典型值 2e-5 ~ 5e-5：BERT 已在海量语料上预训练，只需微调，过大学习率会破坏预训练权重
2. 训练轮次通常 2-4 个 epoch：BERT 参数量大，过多轮次容易过拟合到训练集
3. 使用 learning rate warmup + linear decay：训练初期逐步增大学习率稳定收敛，后期线性衰减精细调优

**Q3（实战）**：如何保证 5000 条标注数据的质量和类别平衡？
**回答要点**：

1. 从真实用户日志中采样查询，保证数据分布的"真实性"，而非人工编造
2. 多人交叉标注+一致性校验：同一查询至少由两人标注，不一致的讨论确定
3. 类别平衡：若某些类别天然稀疏，通过数据增强（同义改写、回译）补充样本
4. 分层抽样划分训练/测试集，保证各类别在测试集中也有代表性

**Q4（边界）**：BERT 意图分类在实际部署中会面临哪些挑战？如何应对？
**回答要点**：

1. 新意图/类别扩展：需重新收集标注数据并微调，可以预留"未知类别"作为兜底
2. 长尾查询分布：少量类别占据大多数查询，少数类别样本不足导致分类偏差 → 类别加权损失函数
3. 模型漂移：用户查询随时间变化，原有分类边界失效 → 定期（如每月）用新数据重新评估和微调
4. 对抗性输入：恶意或拼写错误输入导致分类错误 → 输入预处理（拼写校正）+ 置信度阈值（低于阈值走 LLM 兜底）

## 参考引用

- 需要理解 BERT 与 MLM 预训练的原理，参见 [BERT与MLM预训练](../../NLP/预训练/10-BERT与MLM预训练.md)
- 需要理解 RAG 系统查询改写与意图识别的基础概念，参见 [RAG查询改写与意图识别](27-RAG查询改写与意图识别.md)
- 需要理解策略选择与多路径检索的后续路由逻辑，参见 [策略选择与多路径RAG检索](32-策略选择与多路径RAG检索.md)
- 需要理解预训练-微调范式的整体框架，参见 [迁移学习与微调](../../深度学习/迁移学习/17-迁移学习与微调.md)
- 需要理解分类模型评估指标的计算方法，参见 [评估指标](../../机器学习/基础/04-评估指标.md)