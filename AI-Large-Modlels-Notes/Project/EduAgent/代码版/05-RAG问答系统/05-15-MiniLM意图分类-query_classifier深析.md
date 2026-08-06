# MiniLM 意图分类：`query_classifier.py` 深度解析

> 源文件：`backend/core/query_classifier.py`（共 420 行）
> 对应课件：5.3 意图分类

## 一、文件定位

`query_classifier.py` 是 QA Agent 分类流水线的 **Layer 1**——基于 MiniLM（all-MiniLM-L6-v2）微调的二分类器，判断用户问题是"通用问题"（general）还是"专业问题"（specialized）。

```
QA Agent 分类流水线（4 层，由快到慢）：
  Layer 0a：规则精确匹配（"你好"→GENERAL，<1ms）
  Layer 0b：关键词快判（"课程"→SPECIALIZED，<1ms）
  Layer 1：MiniLM 二分类（本模块，~10ms）
  Layer 2：LLM 精判检索策略（~500ms，仅对复杂问题）
```

---

## 二、模块级 docstring 精读（第 1~15 行）

```python
"""MiniLM 意图分类"""
# backend/core/query_classifier.py
# 基于 MiniLM 微调的 QA Query 二分类器，判断用户问题是"通用问题"还是"专业问题"。
#
# 为什么需要这个分类器？
#   通用问题（如"什么是面向对象？"）LLM 自身知识就能回答，不需要查知识库。
#   专业问题（如"我们课程里双塔召回怎么实现？"）必须查知识库，否则 LLM 可能答错。
#   分类器让 QA Agent 能区分这两种情况，避免不必要的检索开销。
#
# 分层分类体系（和 classify_query_node 配合）：
#   Layer 0a：规则精确匹配（"你好"→GENERAL，最快，<1ms）
#   Layer 0b：关键词快判（"课程"→SPECIALIZED，<1ms）
#   Layer 1：MiniLM 二分类（本模块，~10ms）
#   Layer 2：LLM 精判检索策略（~500ms，仅对 SPECIALIZED 且规则判为 VAGUE/BROAD 时调用）
```

**核心设计决策**：分类器不是独立工作的，而是 4 层流水线中的一环。Layer 0 的规则匹配最快（<1ms），能处理 80% 的问题；Layer 1 的 MiniLM 用于规则无法判断的模糊问题；Layer 2 的 LLM 最慢（~500ms），只在必要时调用。

---

## 三、import 分析（第 16~28 行）

```python
import json
import os
import random
from pathlib import Path
from typing import Any, Optional

import torch

from backend.config import get_settings
from backend.core.logger import get_logger
backend_path = os.path.dirname(os.path.dirname(__file__))  # backend/ 目录的绝对路径

logger = get_logger(__name__)
```

| import | 用途 | 说明 |
|--------|------|------|
| `json` | 解析 JSONL 训练数据 | 标准库 |
| `os` | 路径拼接、环境变量 | 标准库 |
| `random` | 分层切分时打乱数据 | 标准库 |
| `Path` | 路径操作 | 标准库 |
| `Any, Optional` | 类型标注 | 标准库 |
| `torch` | CUDA 设备检测 | 只在 `torch.cuda.is_available()` 中使用 |
| `get_settings` | 获取模型路径配置 | 项目配置中心 |
| `get_logger` | 结构化日志 | 项目日志模块 |

**`backend_path` 的计算**：

```python
backend_path = os.path.dirname(os.path.dirname(__file__))
```

`__file__` 是 `backend/core/query_classifier.py`，`os.path.dirname` 两次得到 `backend/` 目录的绝对路径。用于拼接模型文件的本地路径。

---

## 四、常量定义（第 30~39 行）

### 4.1 标签映射（第 33~34 行）

```python
LABEL2ID = {"general": 0, "specialized": 1}
ID2LABEL = {0: "general",  1: "specialized"}
```

| 变量 | 用途 | 使用场景 |
|------|------|---------|
| `LABEL2ID` | 标签名 → 数字 ID | 训练时，把 JSONL 中的标签名转成模型可用的数字 |
| `ID2LABEL` | 数字 ID → 标签名 | 模型配置中设置，使 pipeline 输出时能直接映射回标签名 |

**为什么需要双向映射？** HuggingFace 的 `AutoModelForSequenceClassification` 需要 `label2id` 和 `id2label` 参数才能正确配置分类头。

### 4.2 置信度阈值（第 37~39 行）

```python
# general 侧置信度阈值设为 0.85（偏高）：
# 专业问题被误判为通用问题的代价更高——LLM 会用自身知识回答，
# 可能与课程内容矛盾。宁可多走一次 RAG，不要漏掉课程相关问题。
GENERAL_CONFIDENCE_THRESHOLD = 0.85
```

**阈值设计**：

| 阈值 | 选择理由 | 影响 |
|------|---------|------|
| 0.85（偏高） | 专业问题误判为通用问题的代价更高 | 只有 P(general) ≥ 0.85 时才判 general |
| 如果设为 0.5 | 中性 | 两类错误概率均等 |
| 如果设为 0.95（过高） | 几乎所有问题都判 specialized | 大量问题多走 RAG，浪费 Token |

**业务决策**：宁可多走一次 RAG，不要漏掉课程相关问题。

---

## 五、`QueryClassifier` 类（第 42~365 行）

### 5.1 类 docstring（第 42~57 行）

```python
class QueryClassifier:
    """
    QA Query 二分类器：general / specialized。

    基于 MiniLM（all-MiniLM-L6-v2）微调，推理速度快（~10ms），
    适合作为 QA Agent 分类流水线的 Layer 1。

    训练阶段：
        qc = QueryClassifier(model_path="models/classifier/all-MiniLM-L6-v2")
        qc.train("backend/training_data.jsonl", output_dir="models/classifier/finetuned")

    推理阶段：
        qc = QueryClassifier()  # 默认加载微调模型
        label, conf = qc.classify("什么是 Spring IOC？")
        # → ("general", 0.92) 或 ("specialized", 0.87)
    """
```

**使用方法**：训练时传入基座模型路径，推理时用无参构造（自动加载微调模型）。

### 5.2 单例持有（第 59 行）

```python
_instance: Optional["QueryClassifier"] = None  # 单例持有
```

类变量，用于实现单例模式。`Optional` 类型标注，初始为 `None`，首次调用 `get_instance()` 时赋值。

### 5.3 `__init__`：模型初始化（第 61~93 行）

#### 5.3.1 函数签名

```python
def __init__(self, model_path: Optional[str] = None):
```

#### 5.3.2 模型路径选择（第 68~77 行）

```python
settings = get_settings()

if model_path:
    # 显式传入：用于训练时加载基座，或临时切换其他模型
    model_id = model_path
    self._is_finetuned = False if model_path == os.path.join(backend_path, settings.classifier_model_path) else True
else:
    # 默认：加载微调模型（假设已训练完成）
    model_id = os.path.join(backend_path, settings.finetuned_classifier_path)
    self._is_finetuned = True
```

**路径选择逻辑**：

| 传入 `model_path` | 使用的模型 | `_is_finetuned` |
|-------------------|-----------|-----------------|
| `None`（默认） | `settings.finetuned_classifier_path` | `True` |
| 基座模型路径 | 基座 MiniLM | `False` |
| 其他微调模型路径 | 传入的路径 | `True` |

**两个配置项**：

| 配置项 | 示例值 | 说明 |
|--------|--------|------|
| `classifier_model_path` | `"models/classifier/all-MiniLM-L6-v2"` | 基座模型路径 |
| `finetuned_classifier_path` | `"models/classifier/finetuned"` | 微调后的模型路径 |

#### 5.3.3 设备选择（第 80 行）

```python
device = 0 if torch.cuda.is_available() else -1
```

| 设备 | 条件 | 值 |
|------|------|-----|
| GPU | `torch.cuda.is_available()` 为 True | `0`（第一个 GPU） |
| CPU | 无 CUDA 设备 | `-1` |

#### 5.3.4 HuggingFace Pipeline 配置（第 82~93 行）

```python
from transformers import pipeline as hf_pipeline
self._pipeline = hf_pipeline(
    task="text-classification",   # 文本分类任务
    model=model_id,               # 模型路径或 HuggingFace 模型名
    device=device,                # 推理设备
    top_k=None,                   # 返回所有标签的分数
    truncation=True,              # 超长文本自动截断
    max_length=128,               # Query 分类用不到长文本，128 token 足够
)
```

**Pipeline 参数详解**：

| 参数 | 值 | 说明 |
|------|-----|------|
| `task` | `"text-classification"` | 告诉 Pipeline API 加载分类头 |
| `model` | `model_id` | 本地路径或 HuggingFace 模型名 |
| `device` | 0 或 -1 | 推理设备 |
| `top_k` | `None` | 返回所有标签的分数（不截断），默认只返回最高分 |
| `truncation` | `True` | 超长文本自动截断到 `max_length` |
| `max_length` | `128` | 最大 token 数。Query 通常很短，128 足够 |

**`top_k=None` 的作用**：默认 `text-classification` pipeline 只返回最高分标签。`top_k=None` 返回所有标签的分数，让调用方可以看 general 和 specialized 各自的置信度。

**`hf_pipeline` 封装的内容**：tokenizer（文本转 token IDs）→ model（推理）→ softmax（转概率），一行代码完成推理全流程。

### 5.4 `get_instance`：单例模式（第 95~100 行）

```python
@classmethod
def get_instance(cls) -> "QueryClassifier":
    """获取单例（首次调用时懒加载，后续复用）"""
    if cls._instance is None:
        cls._instance = cls()
    return cls._instance
```

**懒加载**：模型在第一次调用 `get_instance()` 时才加载，而不是模块导入时加载。避免启动时加载不需要的模型。

**类方法 `@classmethod`**：不依赖实例，直接用类名调用：`QueryClassifier.get_instance()`。

---

## 六、`train`：微调训练（第 104~246 行）

### 6.1 函数签名

```python
def train(
    self,
    data_path: str,
    output_dir: str,
    epochs: int = 8,
    batch_size: int = 64,
    lr: float = 2e-5,
    max_length: int = 128,
    val_ratio: float = 0.1,
    test_ratio: float = 0.1,
    seed: int = 42,
) -> None:
```

**参数默认值的设计理由**：

| 参数 | 默认值 | 理由 |
|------|--------|------|
| `epochs` | 8 | MiniLM 参数量小（22M），不需要太多轮次 |
| `batch_size` | 64 | 二分类任务简单，批大小可以较大 |
| `lr` | 2e-5 | 标准微调学习率，BERT 系列模型的常用值 |
| `max_length` | 128 | Query 分类用不到长文本 |
| `val_ratio` | 0.1 | 10% 做验证集，足够评估模型 |
| `test_ratio` | 0.1 | 10% 做测试集，最终评估 |
| `seed` | 42 | 固定随机种子，保证可复现 |

### 6.2 延迟导入（第 137~149 行）

```python
# 训练库仅在此方法内 import，推理路径不加载这些依赖（减少启动时间）
import numpy as np
from datasets import Dataset
from sklearn.metrics import accuracy_score, precision_recall_fscore_support
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    DataCollatorWithPadding,
    EarlyStoppingCallback,
    Trainer,
    TrainingArguments,
    set_seed,
)
```

**为什么延迟导入？** 这些依赖只在训练时需要，推理时不需要：
- `numpy`、`sklearn`、`datasets`：训练评估用
- `Trainer`、`TrainingArguments`、`EarlyStoppingCallback`：训练循环用
- `AutoModelForSequenceClassification`、`AutoTokenizer`：训练时重新加载模型

推理时只需要 `pipeline`，已经在 `__init__` 中导入。延迟导入减少推理时的启动时间和内存占用。

### 6.3 数据加载与切分（第 153~159 行）

```python
set_seed(seed)  # 固定随机种子，保证可复现

rows = self._load_jsonl(data_path)        # 从 JSONL 文件加载数据
train_rows, val_rows, test_rows = self._stratified_split(
    rows, val_ratio=val_ratio, test_ratio=test_ratio, seed=seed
)
logger.info("query_classifier.split",
            train=len(train_rows), val=len(val_rows), test=len(test_rows))
```

**训练流程 Step 1**：加载 JSONL → 分层切分。日志记录三个集合的样本数。

### 6.4 Tokenizer + Model 加载（第 162~171 行）

```python
model_id = self._pipeline.model.config._name_or_path
tokenizer = AutoTokenizer.from_pretrained(model_id, use_fast=True)
model = AutoModelForSequenceClassification.from_pretrained(
    model_id,
    num_labels=2,
    label2id=LABEL2ID,
    id2label=ID2LABEL,
    ignore_mismatched_sizes=True,
)
```

**`model_id` 的来源**：从 `self._pipeline.model.config._name_or_path` 取当前 pipeline 加载的模型路径。确保训练和推理用同一个基座模型。

**`tokenizer` 配置**：

| 参数 | 值 | 说明 |
|------|-----|------|
| `use_fast` | `True` | 使用 Rust 实现的 fast tokenizer，速度更快 |

**`model` 配置**：

| 参数 | 值 | 说明 |
|------|-----|------|
| `num_labels` | `2` | 二分类：general / specialized |
| `label2id` | `LABEL2ID` | `{"general": 0, "specialized": 1}` |
| `id2label` | `ID2LABEL` | `{0: "general", 1: "specialized"}` |
| `ignore_mismatched_sizes` | `True` | 分类头从 2 类随机初始化（基座模型没有分类头） |

**`ignore_mismatched_sizes=True`**：基座模型（all-MiniLM-L6-v2）原本没有分类头，或者分类头维度不同。设置这个参数后，HuggingFace 会自动随机初始化分类头，而不是报错。

### 6.5 数据集构建（第 173~186 行）

```python
def to_dataset(rows_: list[dict]) -> Dataset:
    return Dataset.from_dict({
        "text":  [r["text"]              for r in rows_],
        "label": [LABEL2ID[r["label"]]   for r in rows_],
    })

def tokenize(batch):
    return tokenizer(batch["text"], truncation=True, max_length=max_length)

train_ds = to_dataset(train_rows).map(tokenize, batched=True, remove_columns=["text"])
val_ds   = to_dataset(val_rows).map(tokenize,   batched=True, remove_columns=["text"])
test_ds  = to_dataset(test_rows).map(tokenize,  batched=True, remove_columns=["text"])
```

**`Dataset.from_dict`**：HuggingFace `datasets` 库的数据集构造方式。输入是 `{"text": [...], "label": [...]}` 字典。

**`.map(tokenize, batched=True)`**：批量 tokenize，`batched=True` 让 tokenizer 一次性处理一批文本，内部做 padding 对齐，比逐条处理快。

**`remove_columns=["text"]`**：tokenize 后原始文本不再需要，移除以节省内存。`label` 列保留，用于损失计算。

### 6.6 评估指标（第 188~196 行）

```python
def compute_metrics(eval_pred):
    logits, labels = eval_pred
    preds = np.argmax(logits, axis=-1)  # 取 logits 最大的索引作为预测类别
    acc = accuracy_score(labels, preds)
    _, _, f1, _ = precision_recall_fscore_support(
        labels, preds, average="macro", zero_division=0
    )
    return {"accuracy": float(acc), "f1_macro": float(f1)}
```

**`eval_pred` 的结构**：Trainer 传入的 `EvalPrediction` 对象，包含 `predictions`（logits）和 `label_ids`（真实标签）。

**`np.argmax(logits, axis=-1)`**：对每个样本的 logits 取最大值索引。logits 形状为 `(batch_size, 2)`，`axis=-1` 表示在最后一个维度（类别维度）上取 argmax。

**`precision_recall_fscore_support`**：sklearn 的指标计算函数，返回 `(precision, recall, f1, support)` 四元组。用 `_` 忽略不需要的 precision、recall 和 support。

**`average="macro"`**：宏平均，各类别 F1 的算术平均。在类别不均衡时，宏平均比加权平均更能反映模型在小类别上的表现。

**`zero_division=0`**：如果某个类别在预测中没有出现（分母为 0），F1 设为 0 而不是报错。

### 6.7 TrainingArguments（第 198~220 行）

```python
use_cuda = torch.cuda.is_available()
checkpoint_dir = str(Path(output_dir) / "_checkpoints")

train_args = TrainingArguments(
    output_dir=checkpoint_dir,            # checkpoint 保存目录
    eval_strategy="epoch",                # 每轮训练后在验证集上评估
    save_strategy="epoch",                # 每轮训练后保存 checkpoint
    load_best_model_at_end=True,          # 训练结束自动加载最优 checkpoint
    metric_for_best_model="f1_macro",     # 以 f1_macro 为最优指标
    greater_is_better=True,               # f1 越大越好
    num_train_epochs=epochs,              # 训练轮数
    per_device_train_batch_size=batch_size,  # 每设备训练批大小
    per_device_eval_batch_size=batch_size * 2,  # 评估批大小可以大一些（不需要梯度）
    learning_rate=lr,                     # 学习率
    warmup_ratio=0.1,                     # 前 10% 的 step 做 warmup
    weight_decay=0.01,                    # 权重衰减，防止过拟合
    save_total_limit=1,                   # 只保留 1 个 checkpoint，节省磁盘空间
    logging_steps=20,                     # 每 20 步打印一次日志
    fp16=use_cuda,                        # CUDA 上启用混合精度训练
    report_to="none",                     # 不向 wandb/tensorboard 报告
    seed=seed,                            # 随机种子
)
```

**关键参数详解**：

| 参数 | 值 | 说明 |
|------|-----|------|
| `eval_strategy="epoch"` | 每轮训练后在验证集上评估 | 替代旧的 `evaluation_strategy` |
| `save_strategy="epoch"` | 每轮训练后保存 checkpoint | 和 `eval_strategy` 一致，确保评估和保存同步 |
| `load_best_model_at_end=True` | 训练结束自动加载最优 checkpoint | 基于 `metric_for_best_model` 判断 |
| `metric_for_best_model="f1_macro"` | 以 F1 为最优指标 | 不是准确率，F1 在类别不均衡时更可靠 |
| `warmup_ratio=0.1` | 前 10% 的 step 做 warmup | 学习率从 0 线性增加到 `lr`，防止早期震荡 |
| `weight_decay=0.01` | 权重衰减 | L2 正则化，防止过拟合 |
| `save_total_limit=1` | 只保留 1 个 checkpoint | 节省磁盘空间 |
| `fp16=use_cuda` | CUDA 上启用混合精度训练 | 加速训练、减少显存 |
| `report_to="none"` | 不向外部服务报告 | 训练环境可能没有 wandb/tensorboard |

### 6.8 Trainer 构建（第 222~231 行）

```python
trainer = Trainer(
    model=model,
    args=train_args,
    train_dataset=train_ds,
    eval_dataset=val_ds,
    data_collator=DataCollatorWithPadding(tokenizer),  # 动态 padding
    compute_metrics=compute_metrics,
    callbacks=[EarlyStoppingCallback(early_stopping_patience=2)],  # 早停
)
```

**`DataCollatorWithPadding(tokenizer)`**：动态 padding。每个 batch 内的序列 padding 到该 batch 的最长长度，而不是 padding 到全局最大长度。节省计算资源。

**`EarlyStoppingCallback(early_stopping_patience=2)`**：验证集 F1 连续 2 轮不提升就提前停止训练，防止过拟合。

### 6.9 训练 + 评估 + 保存（第 233~244 行）

```python
trainer.train()
test_metrics = trainer.evaluate(test_ds)  # 在测试集上做最终评估
logger.info("query_classifier.test_metrics", **{
    k: round(v, 4) for k, v in test_metrics.items() if k.startswith("eval_")
})

Path(output_dir).mkdir(parents=True, exist_ok=True)
trainer.save_model(output_dir)       # 保存模型权重
tokenizer.save_pretrained(output_dir)  # 保存 tokenizer 配置
logger.info("query_classifier.saved", output_dir=output_dir)
```

**`trainer.evaluate(test_ds)`**：在测试集上做最终评估。测试集在整个训练过程中从未参与过训练或验证，是最终的客观评估。

**`trainer.save_model(output_dir)`**：保存模型权重 + 配置到 `output_dir`。保存的文件包括 `config.json`、`pytorch_model.bin`（或 `model.safetensors`）。

**`tokenizer.save_pretrained(output_dir)`**：保存 tokenizer 配置到同一目录，保证推理时 tokenizer 和模型一致。

---

## 七、`classify`：推理（第 250~294 行）

### 7.1 函数签名

```python
def classify(self, text: str) -> tuple[str, float]:
```

**输入**：用户 query 文本。

**输出**：`(label, confidence)`，label 是 `"general"` 或 `"specialized"`，confidence 是对应标签的置信度。

### 7.2 Pipeline 输出解析（第 268~276 行）

```python
raw_outputs: list[dict] = self._pipeline(text)[0]

# 查找 general 标签的分数（兼容大小写和 LABEL_0 格式）
general_score: Optional[float] = None
for item in raw_outputs:
    lbl = item["label"].lower()
    if lbl in ("general", "label_0"):
        general_score = item["score"]
        break
```

**Pipeline 返回格式**：

```python
# top_k=None 时：
[
    {"label": "LABEL_0", "score": 0.9523},  # general
    {"label": "LABEL_1", "score": 0.0477},  # specialized
]
# 或：
[
    {"label": "general", "score": 0.9523},
    {"label": "specialized", "score": 0.0477},
]
```

**标签名兼容性**：

| pipeline 输出 | 匹配条件 | 原因 |
|--------------|---------|------|
| `"label_0"` | `lbl in ("general", "label_0")` | 模型配置了 `id2label` 时输出标签名 |
| `"general"` | `lbl in ("general", "label_0")` | 未配置时输出 `LABEL_0` / `LABEL_1` |

**`break`**：找到 general 标签后立即停止遍历，不需要继续检查 specialized。

### 7.3 兜底机制（第 278~282 行）

```python
if general_score is None:
    # 兜底：标签名不匹配时返回 specialized
    logger.warning("query_classifier.unexpected_labels",
                   labels=[x["label"] for x in raw_outputs])
    return "specialized", 0.5
```

**触发条件**：pipeline 输出的标签名既不是 `"general"` 也不是 `"label_0"`。

**保守降级**：返回 `("specialized", 0.5)`——走知识库检索路径。置信度 0.5 表示"不确定，但保守起见查知识库"。

### 7.4 阈值判断（第 284~294 行）

```python
if general_score >= GENERAL_CONFIDENCE_THRESHOLD:
    label, confidence = "general", general_score
else:
    label, confidence = "specialized", 1.0 - general_score

logger.info("query_classifier.result",
            text_preview=text[:50],
            label=label,
            confidence=round(confidence, 4))
return label, confidence
```

**分类规则**：

| 条件 | label | confidence | 含义 |
|------|-------|-----------|------|
| P(general) ≥ 0.85 | `"general"` | P(general) | 高置信度通用问题，LLM 直答 |
| 其余 | `"specialized"` | 1 - P(general) | 判为专业问题，查知识库 |

**示例**：

```python
# 场景 1：P(general) = 0.95
# → ("general", 0.95)

# 场景 2：P(general) = 0.60
# → ("specialized", 0.40)  ← 1 - 0.60 = 0.40

# 场景 3：P(general) = 0.05
# → ("specialized", 0.95)  ← 1 - 0.05 = 0.95
```

**日志记录**：`text_preview=text[:50]` 只记录前 50 个字符，避免日志过长。`confidence` 四舍五入到 4 位小数。

---

## 八、`_load_jsonl`：训练数据加载（第 298~325 行）

### 8.1 函数签名

```python
@staticmethod
def _load_jsonl(path: str) -> list[dict]:
```

**`@staticmethod`**：不依赖实例（不需要 `self`），纯工具函数。

### 8.2 JSONL 格式

```jsonl
{"text": "什么是面向对象编程？", "label": "general"}
{"text": "我们课程里双塔召回怎么实现？", "label": "specialized"}
```

每行一个 JSON 对象，包含 `text` 和 `label` 两个字段。

### 8.3 逐行解析（第 309~325 行）

```python
rows: list[dict] = []
with open(path, "r", encoding="utf-8") as f:
    for line_no, line in enumerate(f, 1):
        line = line.strip()
        if not line:
            continue  # 跳过空行
        obj = json.loads(line)
        text  = (obj.get("text") or "").strip()
        label = obj.get("label")
        if not text:
            raise ValueError(f"第 {line_no} 行 text 为空")
        if label not in LABEL2ID:
            raise ValueError(f"第 {line_no} 行 label 非法: {label!r}")
        rows.append({"text": text, "label": label})
if not rows:
    raise ValueError(f"训练数据为空：{path}")
return rows
```

**`enumerate(f, 1)`**：行号从 1 开始计数，便于错误信息定位。

**`line.strip()`**：去掉首尾空白字符。空行（`""` 或只含空白）用 `continue` 跳过。

**`(obj.get("text") or "").strip()`**：`get("text")` 可能返回 `None`，`or ""` 确保 `None` 转为空字符串，再 `.strip()` 去掉空白。

**`label not in LABEL2ID`**：验证标签名是否合法。只接受 `"general"` 或 `"specialized"`。

**空数据检查**：`if not rows: raise ValueError`，防止训练时传入空数据不报错。

---

## 九、`_stratified_split`：分层切分（第 327~365 行）

### 9.1 函数签名

```python
@staticmethod
def _stratified_split(
    rows: list[dict],
    val_ratio: float,
    test_ratio: float,
    seed: int,
) -> tuple[list[dict], list[dict], list[dict]]:
```

**返回值**：`(train_rows, val_rows, test_rows)` 三元组。

### 9.2 为什么需要分层？

```
如果 general 样本 100 条、specialized 样本 10 条，
随机切分可能把 specialized 样本全部分到训练集，验证集一条都没有。
分层切分保证每个集合中各类别的比例和原始数据一致。
```

### 9.3 逐行精读（第 345~365 行）

```python
random.seed(seed)  # 固定随机种子，保证可复现

# 按标签分组：{"general": [...], "specialized": [...]}
buckets: dict[str, list[dict]] = {}
for row in rows:
    buckets.setdefault(row["label"], []).append(row)

train_rows, val_rows, test_rows = [], [], []

# 对每个类别分别切分，保证各类别在三个集合中比例一致
for label, group in buckets.items():
    random.shuffle(group)  # 随机打乱，防止原始顺序带来偏差
    n = len(group)
    n_test = max(1, int(n * test_ratio))  # 至少取 1 条
    n_val = max(1, int(n * val_ratio))
    test_rows.extend(group[:n_test])                    # 前 n_test 条 → 测试集
    val_rows.extend(group[n_test:n_test + n_val])        # 接着 n_val 条 → 验证集
    train_rows.extend(group[n_test + n_val:])            # 剩余 → 训练集

random.shuffle(train_rows)  # 训练集再打乱一次，避免类别或样本顺序过于集中
return train_rows, val_rows, test_rows
```

**`buckets.setdefault(row["label"], []).append(row)`**：如果标签不存在，先初始化为空列表再追加。等价于：

```python
if row["label"] not in buckets:
    buckets[row["label"]] = []
buckets[row["label"]].append(row)
```

**`max(1, int(n * test_ratio))`**：至少取 1 条。如果类别样本很少（如 3 条），`int(3 * 0.1) = 0`，但至少要有 1 条测试数据。

**切分示例**（假设 100 general + 10 specialized，val_ratio=0.1, test_ratio=0.1）：

| 类别 | 总数 | 测试集 (10%) | 验证集 (10%) | 训练集 (80%) |
|------|------|-------------|-------------|-------------|
| general | 100 | 10 | 10 | 80 |
| specialized | 10 | 1 | 1 | 8 |
| 总计 | 110 | 11 | 11 | 88 |

**比例一致性**：general 和 specialized 在三个集合中的比例都是 10:1，和原始数据一致。

---

## 十、模块级单例 `get_query_classifier`（第 368~384 行）

```python
_classifier: Optional[QueryClassifier] = None

def get_query_classifier() -> QueryClassifier:
    """
    获取 QueryClassifier 单例。

    QA Agent 的 classify_query_node 通过此函数获取分类器实例。
    使用模块级变量的方式实现单例（而不是 classmethod），
    因为 classify_query_node 需要的是"函数调用"而不是"类方法调用"。
    """
    global _classifier
    if _classifier is None:
        _classifier = QueryClassifier.get_instance()
    return _classifier
```

**为什么需要模块级单例？** QA Agent 的 `classify_query_node` 是 LangGraph 的节点函数，用 `get_query_classifier()` 函数调用比 `QueryClassifier.get_instance()` 类方法调用更自然。

**两层单例**：
- `QueryClassifier._instance`（类变量）：防止多次构造 `QueryClassifier` 实例
- `_classifier`（模块变量）：缓存实例引用，避免每次调用 `get_query_classifier()` 都走 `get_instance()` 的路径

---

## 十一、自测代码精读（第 389~420 行）

### 11.1 环境初始化（第 389~400 行）

```python
if __name__ == "__main__":
    """
    离线测试：加载微调模型，对测试用例做分类预测。

    首次运行需先训练：
        qc = QueryClassifier(model_path="models/classifier/all-MiniLM-L6-v2")
        qc.train(data_path="backend/training_data.jsonl", output_dir="models/classifier/finetuned")
    """
    import sys
    sys.path.insert(0, str(__file__).split("/backend/")[0])
    from dotenv import load_dotenv
    load_dotenv(".env.local")
```

**`sys.path.insert(0, ...)`**：把项目根目录加入 Python 模块搜索路径。`__file__` 是 `backend/core/query_classifier.py`，`split("/backend/")[0]` 取 `/backend/` 之前的部分。

### 11.2 测试用例（第 405~413 行）

```python
test_cases = [
    # 通用问题：LLM 自身知识已覆盖，预期 general
    ("什么是面向对象编程？",                          "general"),
    ("Python 中 list 和 tuple 有什么区别？",          "general"),
    # 专业问题：涉及课程专属内容，预期 specialized
    ("商品聚合大模型中双塔召回怎么实现？",              "specialized"),
    ("LlamaFactory 怎么做 Qwen VL 微调？",           "specialized"),
    ("Hard Negative Sampling 在大模型微调中的作用是什么？", "specialized"),
]
```

| 测试用例 | 预期 | 类型特征 |
|---------|------|---------|
| "什么是面向对象编程？" | general | 通用计算机概念 |
| "Python 中 list 和 tuple 有什么区别？" | general | 通用编程语言知识 |
| "商品聚合大模型中双塔召回怎么实现？" | specialized | 课程专属内容（含"双塔召回"） |
| "LlamaFactory 怎么做 Qwen VL 微调？" | specialized | 课程专属工具（LlamaFactory） |
| "Hard Negative Sampling 在大模型微调中的作用是什么？" | specialized | 课程专属知识点 |

### 11.3 执行与输出（第 415~420 行）

```python
print(f"\n{'Query':<44} {'预期':<12} {'预测':<12} {'置信度'}")
print("-" * 78)
for text, expected in test_cases:
    label, conf = qc.classify(text)
    mark = "✓" if label == expected else "✗"
    print(f"{text:<44} {expected:<12} {label:<12} {conf:.4f}  {mark}")
```

**输出格式控制**：

| 格式符 | 含义 |
|--------|------|
| `{text:<44}` | 左对齐，宽度 44 字符 |
| `{expected:<12}` | 左对齐，宽度 12 字符 |
| `{label:<12}` | 左对齐，宽度 12 字符 |
| `{conf:.4f}` | 浮点数，保留 4 位小数 |

---

## 十二、完整数据流

```
用户提问："什么是面向对象编程？"
          │
          ▼
QA Agent classify_query_node
          │
          ├─ Layer 0a：规则匹配 → "你好"？不是 → 继续
          ├─ Layer 0b：关键词匹配 → 含"课程"？不是 → 继续
          │
          ▼
Layer 1：get_query_classifier().classify(text)
          │
          ├─ hf_pipeline(text) → [{"label": "general", "score": 0.95}, ...]
          │
          ├─ 查找 general 标签 → score = 0.95
          │
          ├─ 0.95 ≥ 0.85 → return ("general", 0.95)
          │
          ▼
QA Agent 路由逻辑
          │
          ├─ "general" → LLM 直答（不查知识库）
          └─ "specialized" → 查知识库 → RAG 生成
```

---

## 十三、`★` 设计亮点总结

### 13.1 分层分类体系

```
Layer 0a（规则，<1ms）→ Layer 0b（关键词，<1ms）→ Layer 1（MiniLM，~10ms）→ Layer 2（LLM，~500ms）
```

逐层递进，每层都在上一层的结论上做更精细的判断。80% 的问题在 Layer 0 就结束了，不需要走 LLM。

### 13.2 偏高的阈值 0.85

业务决策：宁可多走一次 RAG，不要漏掉课程相关问题。专业问题误判为通用问题的代价更高。

### 13.3 训练代码内嵌

训练和推理在同一个类里，而不是分开的脚本。训练参数（epochs=8, batch_size=64, lr=2e-5）都是合理的默认值，开箱即用。

### 13.4 延迟导入

训练依赖（numpy、sklearn、datasets、Trainer）在 `train()` 方法内导入，推理路径不加载，减少启动时间和内存占用。

### 13.5 分层切分

`_stratified_split` 按标签分层切分，保证训练/验证/测试集的类别比例一致。小样本场景下特别重要。

### 13.6 保守兜底

标签名不匹配时返回 `("specialized", 0.5)`，降级到最保守的路径——查知识库，而不是用 LLM 自身知识回答。

### 13.7 标签名兼容

推理时兼容 `"general"` / `"label_0"` 两种标签格式，不依赖模型是否有 `id2label` 配置。

### 13.8 函数式单例

`get_query_classifier()` 函数式调用，`classify_query_node` 直接 import 使用，不需要关心类实例化。

### 13.9 早停机制

`EarlyStoppingCallback(patience=2)` 防止过拟合，验证集 F1 连续 2 轮不提升就停止训练。

### 13.10 结构化日志

所有操作都有结构化日志记录：

| 事件名 | 记录时机 |
|--------|---------|
| `query_classifier.loaded` | 模型加载完成 |
| `query_classifier.split` | 数据切分完成 |
| `query_classifier.test_metrics` | 测试集评估完成 |
| `query_classifier.saved` | 模型保存完成 |
| `query_classifier.result` | 每次推理完成 |
| `query_classifier.unexpected_labels` | 标签名不匹配（兜底触发） |