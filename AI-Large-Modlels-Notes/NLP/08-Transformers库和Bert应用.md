**上一级：** [07-Bert系列模型](07-Bert系列模型.md)

**标签：** #NLP

---

# Transformers 库和 Bert 应用

## 第一部分：Transformers 库简介

### 1.1 什么是 Huggingface Transformers？

**Transformers 库**是由 **Huggingface** 公司开发并开源的、基于 Transformer 模型结构的**预训练语言模型库**。它提供了 NLP 领域大量**最先进（State-of-the-Art，SOTA）** 的预训练语言模型和统一的调用框架。

**Huggingface 公司背景**：

- 总部位于纽约，是一家专注于自然语言处理、人工智能和分布式系统的创业公司。
- 他们不仅开发聊天机器人技术，更以 NLP 开源社区的贡献而闻名。
- 使命是推动 NLP 技术的**平民化（democratize）**，让每个人都能用上最先进的模型，而不因训练资源的匮乏而受限。

**社区资源**：

- 官方网址：https://huggingface.co/
- **Models**：可查看、下载成千上万个预训练模型（BERT、GPT-2、RoBERTa、T5、Llama 等）。
- **Datasets**：可查看、下载大量 NLP 数据集（GLUE、SQuAD、IMDb 等）。
- **Docs**：详细的编程文档，包含教程、API 参考、模型卡片。

---

### 1.2 Transformers 库支持的模型与框架

Transformers 库提供了大量 SOTA 预训练模型，包括但不限于：

- **BERT**（Google）
- **GPT-2**、**GPT-3**（OpenAI，通过 API 或本地推理）
- **RoBERTa**（Facebook）
- **XLM**（跨语言模型）
- **DistilBERT**（蒸馏版 BERT，更小更快）
- **XLNet**（广义自回归）
- **CTRL**（可控文本生成）
- 以及后来的 **T5**、**BART**、**ALBERT**、**ELECTRA**、**Llama** 等。

**框架支持**：

- 原生支持 **PyTorch** 和 **TensorFlow 2.0**。
- 模型可以在两个框架之间相互转换（如使用 `from_pretrained` 并指定 `from_tf=True`）。
- 还支持 **JAX**（Flax）。

---

### 1.3 Transformers 库的核心价值

| 价值 | 说明 |
| --- | --- |
| **预训练模型仓库** | 无需自己从头训练，直接下载使用经过数十亿 token 预训练的模型。 |
| **统一 API** | 无论是 BERT、GPT 还是 RoBERTa，都使用相似的 `from_pretrained`、`tokenizer`、`model` 接口。 |
| **支持微调** | 可以在自己的数据集上轻松微调（fine-tune）预训练模型，适配下游任务。 |
| **开源与社区驱动** | 代码完全开源，社区贡献活跃，持续更新最新模型。 |
| **生产就绪** | 提供优化部署（如 ONNX、TensorRT），也提供 `pipeline` 快速原型。 |

---

### 1.4 安装 Transformers 库

建议使用 **conda** 或 **pip** 在指定的 Python 虚拟环境中安装。

**步骤**：

1. 查看已有虚拟环境：`conda env list`
2. 激活目标环境：`conda activate your_env_name`
3. 安装 transformers 库：`pip install transformers`

如果需要同时安装 PyTorch 或 TensorFlow：

```bash
# 安装PyTorch（根据CUDA版本选择）
pip install torch torchvision torchaudio

# 或安装TensorFlow
pip install tensorflow

# 安装transformers
pip install transformers
```

**可选依赖**（提升功能）：

- `pip install datasets`：加载 Huggingface 数据集
- `pip install tokenizers`：快速分词器
- `pip install accelerate`：分布式训练加速

---

### 1.5 快速验证安装

```python
import transformers
print(transformers.__version__)  # 例如 4.36.0
```

---

## 第二部分：Transformers 库三层应用结构

Transformers 库为开发者提供了**三种不同抽象层次**的 API，以适应不同需求场景：从极速入门到高度定制。这三层分别是：

| 层次 | 名称 | 抽象程度 | 适用人群 | 灵活性 |
| --- | --- | --- | --- | --- |
| **第一层** | 管道（Pipeline） | 最高（极简） | 初学者、快速原型 | 低 |
| **第二层** | 自动模型（AutoModel） | 中等 | 大多数应用开发者 | 中等 |
| **第三层** | 具体模型（SpecificModel） | 最低（原生） | 研究人员、专业人士 | 高 |

---

### 2.1 第一层：管道（Pipeline）方式

#### 2.1.1 什么是 Pipeline？

Pipeline 是 Transformers 库中**高度集成**的使用方式，只需几行代码即可完成一个完整的 NLP 任务（如情感分析、文本生成、特征提取、问答等）。它封装了**分词、模型前向传播、输出后处理**的全流程。

**主要特点**：

- 极简：通常只需要一行代码加载模型，一行代码执行任务。
- 任务自动适配：根据任务名称自动选择合适的模型和分词器。
- 支持常见 NLP 任务：情感分析、特征提取、文本生成、问答、掩码填充、摘要、翻译等。

---

#### 2.1.2 Pipeline 支持的任务类型

| 任务参数                     | 任务名称     | 说明                               | 输出示例                 |
|:---------------------------- |:------------ | ---------------------------------- | ------------------------ |
| `"text-classification"`      | 文本分类     | 情感分析、主题分类                 | 标签 + 分数              |
| `"feature-extraction"`       | 特征提取     | 获取文本的词向量/句向量            | 张量                     |
| `"fill-mask"`                | 掩码填充     | 预测 `[MASK]` 位置的词             | 候选词 + 分数            |
| `"question-answering"`       | 问答         | 从上下文中抽取答案                 | 答案文本、起始位置、分数 |
| `"summarization"`            | 摘要         | 生成长文本摘要                     | 摘要文本                 |
| `"translation"`              | 翻译         | 语言翻译（需指定源语言和目标语言） | 翻译文本                 |
| `"text-generation"`          | 文本生成     | 给定提示，续写文本                 | 生成文本                 |
| `"zero-shot-classification"` | 零样本分类   | 不训练即可分类到任意标签           | 标签 + 分数              |
| `"ner"`                      | 命名实体识别 | 识别实体（人名、地名等）           | 实体词 + 类型            |

---

#### 2.1.3 Pipeline 示例：特征提取（Feature Extraction）

**应用场景**：将文本转换为固定维度的向量表示（例如用于下游分类、相似度计算）。

```python
import transformers
import numpy as np

# 使用pipeline加载预训练模型（中文BERT）
# task='feature-extraction' 表示特征提取任务
# model参数指定模型路径或名称（可以是本地目录或Huggingface模型名）
model = transformers.pipeline(task='feature-extraction', model='bert-base-chinese')

# 待处理的文本
text = '我爱你'

# 调用模型（自动完成分词、编码、前向传播）
result = model(text)

# 输出结果是一个列表，包含输入序列每个token的特征向量
# 形状：(1, seq_len, hidden_dim) 
# 其中1是batch_size，seq_len是分词后的token数，hidden_dim是模型隐层维度（BERT-base为768）
print(np.array(result).shape)  # 输出类似 (1, 5, 768)
```

**解释**：

- 输入文本 `"我爱你"` 经过 BERT 分词器后会变成：`[CLS] 我 爱 你 [SEP]`，共 5 个 token。
- 每个 token 被映射为 768 维的向量，所以输出形状为 `(1, 5, 768)`。
- `[CLS]` 位置的向量通常用于句子级别的任务（如分类）。

---

#### 2.1.4 Pipeline 示例：其他任务快速演示

```python
# 情感分类
classifier = transformers.pipeline('text-classification', model='distilbert-base-uncased-finetuned-sst-2')
result = classifier("I love this movie!")
print(result)  # [{'label': 'POSITIVE', 'score': 0.999...}]

# 问答
qa = transformers.pipeline('question-answering', model='distilbert-base-cased-distilled-squad')
answer = qa(question="What is the capital of France?", context="Paris is the capital of France.")
print(answer)  # {'answer': 'Paris', 'start': 0, 'end': 5, 'score': ...}

# 掩码填充
fill = transformers.pipeline('fill-mask', model='bert-base-uncased')
output = fill("I love [MASK].")
print(output)  # 返回top-5候选词
```

---

#### 2.1.5 Pipeline 的优缺点

| 优点 | 缺点 |
| --- | --- |
| 代码量极少，入门快 | 灵活性低，无法修改模型内部细节 |
| 自动处理分词、设备放置、批处理 | 不适合复杂的自定义预处理 |
| 支持多框架（PyTorch/TF） | 某些任务的自定义参数有限 |
| 适合快速原型和教学演示 | 生产环境中可能需要更精细的控制 |

---

### 2.2 第二层：自动模型（AutoModel）方式

#### 2.2.1 什么是 AutoModel？

AutoModel 是 Transformers 库提供的**自动模型加载接口**。它允许开发者**不显式指定具体的模型类**（如 BertModel、GPT2Model），而是通过模型名称或路径，让库自动推断并加载正确的模型架构。

**主要组件**：

- `AutoTokenizer`：自动加载对应的分词器。
- `AutoModel`：自动加载基础模型（不含任务头）。
- 特定任务自动类：`AutoModelForSequenceClassification`（分类）、`AutoModelForQuestionAnswering`（问答）等。

**优势**：

- 代码与具体模型解耦，更换模型时只需修改模型名称。
- 统一调用方式，降低学习成本。
- 支持 BERT、RoBERTa、DistilBERT、ALBERT 等众多“BERTology”系列模型。

---

#### 2.2.2 自动模型的三个关键步骤

1. **加载分词器**（Tokenizer）：将文本转换为模型可接受的输入格式。
2. **加载模型**（Model）：加载预训练权重。
3. **处理文本**：使用 tokenizer 将文本转为 input_ids、attention_mask 等。
4. **前向传播**：将处理后的张量输入模型，获得输出。

---

#### 2.2.3 完整代码示例（单个文本）

```python
import transformers
import torch

# 准备文本（使用较长句子，确保超过 max_length 以触发截断）
text = '我爱你，我也非常恨你，同时又对你充满好奇和期待。'

# 使用自动模型加载分词器（指定模型名称或本地路径）
tokenizer = transformers.AutoTokenizer.from_pretrained('bert-base-chinese')
# 使用自动模型加载基础模型（同样路径）
model = transformers.AutoModel.from_pretrained('bert-base-chinese')

# 处理文本：进行分词、添加特殊标记、填充、截断、返回PyTorch张量
# 注意：新版 transformers 建议使用 padding='max_length' 替代 pad_to_max_length=True
tk_data = tokenizer(
    text, 
    max_length=8,               # 最大序列长度（超过截断）设为8，强制截断长文本
    truncation=True,            # 启用截断（超出max_length的部分丢弃）
    padding='max_length',       # 填充到max_length（确保所有样本长度一致）
    return_tensors='pt'         # 返回PyTorch张量（'tf'表示TensorFlow，'np'表示NumPy）
)

# 查看编码后的内容
print(tk_data)  
# 输出包含：
# - 'input_ids': token索引序列，包含[CLS]和[SEP]，形状(1, 8)  → 长度被固定为8
# - 'token_type_ids': 句子分段标识（0表示第一个句子，1表示第二个），这里全0
# - 'attention_mask': 注意力掩码（1表示真实token，0表示填充位置）
# 由于max_length=8小于实际token数，后面的token被截断，且填充不足部分（本例中没有不足）自动处理

# 将模型设置为评估模式（关闭dropout等）
model.eval()

# 前向传播（将字典解包作为参数传入）
with torch.no_grad():  # 不计算梯度，节省内存
    result = model(**tk_data)

# result是一个BaseModelOutput对象，包含多个字段
print(result['last_hidden_state'].shape)  # (batch_size, seq_len, hidden_dim) -> (1, 8, 768)
print(result['pooler_output'].shape)      # (batch_size, hidden_dim) -> (1, 768)

# 验证截断效果：解码后可见序列长度正好是8，原始长句末尾被截断
print("解码后的token序列:", tokenizer.decode(tk_data['input_ids'][0]))
# 输出类似：[CLS] 我 爱 你 ， 我 [SEP] （后面原本有“也非常恨你...”但被截断）
```

**关键概念解释**：

- `input_ids`：每个 token 在词汇表中的索引。例如 `[CLS]` 对应 101，`[SEP]` 对应 102。
- `token_type_ids`：用于区分两个句子的编码（BERT 的 NSP 任务需要）。单句子时全为 0。
- `attention_mask`：指示哪些位置是真实 token（1），哪些是填充（0）。模型不应关注填充位置。
- `last_hidden_state`：编码器最后一层所有位置的输出，形状 `(batch, seq_len, hidden_dim)`。
- `pooler_output`：经过额外全连接层和 tanh 激活后的 `[CLS]` 表示，常用于分类任务。

---

#### 2.2.4 处理多个不等长文本（自动填充）

当输入是一个文本列表时，可以设置 `padding=True` 让 tokenizer 自动将批次内所有样本填充到**最长样本的长度**。

```python
# 准备多个不同长度的文本
texts = ['我爱你', '我喜欢你我喜欢你我喜欢你']

tokenizer = transformers.AutoTokenizer.from_pretrained('bert-base-chinese')
model = transformers.AutoModel.from_pretrained('bert-base-chinese')

# padding=True: 自动填充到该批次中最长序列的长度
# 不指定max_length时，填充长度由批次内最长样本决定
tk_data = tokenizer(texts, padding=True, return_tensors='pt')

print(tk_data['input_ids'].shape)       # (2, max_len_in_batch)
print(tk_data['attention_mask'].shape)  # (2, max_len_in_batch)

model.eval()
result = model(**tk_data)

print(result['last_hidden_state'].shape)  # (2, max_len, 768)
print(result['pooler_output'].shape)      # (2, 768)
```

**注意事项**：

- 不同长度句子填充后，`attention_mask` 会正确标记填充位置为 0。
- 模型中自注意力机制会根据 `attention_mask` 忽略填充位置。

---

#### 2.2.5 自动模型用于特定任务

除了基础 `AutoModel`，Transformers 还提供了**带任务头的自动模型**，例如：

| 自动模型类 | 任务 | 输出 |
| --- | --- | --- |
| `AutoModelForSequenceClassification` | 文本分类 | logits (batch, num_labels) |
| `AutoModelForQuestionAnswering` | 问答 | start_logits, end_logits |
| `AutoModelForTokenClassification` | 序列标注（如 NER） | logits (batch, seq_len, num_labels) |
| `AutoModelForMaskedLM` | 掩码语言模型 | logits (batch, seq_len, vocab_size) |
| `AutoModelForCausalLM` | 自回归生成（GPT） | logits (batch, seq_len, vocab_size) |

**示例：文本分类**

```python
from transformers import AutoTokenizer, AutoModelForSequenceClassification

tokenizer = AutoTokenizer.from_pretrained('bert-base-chinese')
model = AutoModelForSequenceClassification.from_pretrained('bert-base-chinese', num_labels=2)

texts = ["这部电影很棒", "这部电影很糟糕"]
inputs = tokenizer(texts, padding=True, truncation=True, return_tensors='pt')
outputs = model(**inputs)
logits = outputs.logits  # (batch, 2)
```

---

#### 2.2.6 自动模型的优缺点

| 优点 | 缺点 |
| --- | --- |
| 模型更换方便（只改模型名） | 仍需要理解 tokenizer 和模型的基本用法 |
| 支持大量 BERTology 模型 | 相比 pipeline 需要更多代码 |
| 可访问模型中间输出（如 last_hidden_state） | 不适用于非 BERT 架构的差异处理（但 AutoModel 会自动适配） |

---

### 2.3 第三层：具体模型（SpecificModel）方式

#### 2.3.1 什么是具体模型方式？

具体模型方式要求开发者**明确指定要使用的模型类**（如 `BertModel`、`GPT2Model`），并按照该模型特定的参数进行调用。这是**最底层、最灵活**的使用方式，适合专业人士和对模型内部有精细控制需求的场景。

**特点**：

- 需要知道模型的具体类名（如 `BertTokenizer`、`BertModel`）。
- 可以访问模型特有的配置和参数。
- 可以修改模型内部组件（如自定义注意力层）。
- 适合研究、调试、实现新模型变体。

---

#### 2.3.2 代码示例（与自动模型对比）

自动模型方式：

```python
tokenizer = transformers.AutoTokenizer.from_pretrained('bert-base-chinese')
model = transformers.AutoModel.from_pretrained('bert-base-chinese')
```

具体模型方式（等价）：

```python
from transformers import BertTokenizer, BertModel

tokenizer = BertTokenizer.from_pretrained('bert-base-chinese')
model = BertModel.from_pretrained('bert-base-chinese')
```

两者功能完全一致，但具体模型方式明确表明了使用的是 BERT 架构。当需要修改 BERT 特有的参数时（如 `output_attentions`、`output_hidden_states`），可以直接在 `BertModel` 中设置。

---

#### 2.3.3 使用具体模型进行文本特征提取（完整示例）

```python
import transformers
import torch

# 准备数据
texts = ['我爱你', '我喜欢你我喜欢你我喜欢你']

# 使用具体的BERT分词器和模型
tokenizer = transformers.BertTokenizer.from_pretrained('bert-base-chinese')
model = transformers.BertModel.from_pretrained('bert-base-chinese')

# 处理文本（与自动模型完全相同的API）
tk_data = tokenizer(texts, padding=True, return_tensors='pt')

# 评估模式
model.eval()
with torch.no_grad():
    result = model(**tk_data)

print(result['last_hidden_state'].shape)  # (2, 10, 768)
print(result['pooler_output'].shape)      # (2, 768)
```

---

#### 2.3.4 何时使用具体模型方式？

| 场景                        | 推荐方式                              |
| ------------------------- | --------------------------------- |
| 快速原型、演示、入门学习              | Pipeline                          |
| 大多数微调任务、更换模型实验            | AutoModel                         |
| 需要修改模型内部结构（如添加层）          | 具体模型                              |
| 使用模型特有功能（如 BERT 的输出注意力权重） | 具体模型（设置 `output_attentions=True`） |
| 调试或研究特定架构细节               | 具体模型                              |
| 导出模型到 ONNX/TensorRT 等     | 具体模型（更可控）                         |

---

#### 2.3.5 具体模型的高级用法：输出注意力权重和隐藏状态

```python
from transformers import BertModel, BertTokenizer

tokenizer = BertTokenizer.from_pretrained('bert-base-chinese')
model = BertModel.from_pretrained(
    'bert-base-chinese',
    output_attentions=True,   # 返回每层的注意力权重
    output_hidden_states=True # 返回每层的隐藏状态
)

text = "我爱自然语言处理"
inputs = tokenizer(text, return_tensors='pt')
outputs = model(**inputs)

# outputs是一个包含多个字段的元组或对象
# outputs.last_hidden_state: (1, seq_len, 768)
# outputs.hidden_states: tuple of 13 layers (embedding + 12 encoder layers)
# outputs.attentions: tuple of 12 layers, each (batch, num_heads, seq_len, seq_len)
print(f"Number of hidden states: {len(outputs.hidden_states)}")
print(f"Number of attention matrices: {len(outputs.attentions)}")
```

---

### 2.4 三层方式对比总结

| 维度       | Pipeline     | AutoModel                   | SpecificModel   |
| -------- | ------------ | --------------------------- | --------------- |
| **代码行数** | 最少           | 中等                          | 中等              |
| **自动分词** | 是            | 需手动调用 tokenizer             | 需手动调用 tokenizer |
| **模型选择** | 任务名+模型名      | 模型名字符串                      | 模型类名            |
| **输出格式** | 任务特定（如标签+分数） | 原始模型输出（last_hidden_state 等） | 同 AutoModel     |
| **可定制性** | 极低           | 中等（可通过参数调整）                 | 高（可修改类内部）       |
| **适用人群** | 初学者、快速原型     | 大多数开发者                      | 研究人员、专业人士       |
| **典型场景** | 快速测试、演示、教学   | 微调、特征提取、推理部署                | 修改模型、自定义训练、研究   |

---

### 2.5 常见问题与注意事项

#### Q1：如何下载并使用本地已下载的预训练模型？

将所有模型文件（`config.json`, `pytorch_model.bin`, `vocab.txt` 等）放在一个本地文件夹中，然后使用 `from_pretrained('本地路径')` 即可。例如：

```python
tokenizer = BertTokenizer.from_pretrained('./my_bert_model/')
model = BertModel.from_pretrained('./my_bert_model/')
```

---

#### Q2：`return_tensors='pt'` 和 `'tf'` 的区别是什么？

- `'pt'`：返回 PyTorch 张量（`torch.Tensor`），需要在 PyTorch 环境下使用。
- `'tf'`：返回 TensorFlow 张量（`tf.Tensor`），用于 TensorFlow 模型。
- `'np'`：返回 NumPy 数组。

---

#### Q3：为什么需要 `attention_mask`？如何处理填充？

模型不应关注填充的 `[PAD]` 位置，否则会引入噪声。`attention_mask` 中的 0 位置在注意力计算时会被置为 `-inf`（通过 `masked_fill`），使得 Softmax 后权重为 0。在调用模型时，只需将 `attention_mask` 作为参数传入，模型内部会自动处理。

---

#### Q4：如何节省内存/加速推理？

- 使用 `.eval()` 模式关闭 dropout 和 batch norm 的随机性。
- 使用 `with torch.no_grad():` 禁用梯度计算。
- 减小 `max_length`（例如从 512 减到 128）。
- 使用更小的模型（如 DistilBERT、TinyBERT）。
- 使用半精度（`model.half()`）和 CUDA 设备。

---

#### Q5：Pipeline、AutoModel、SpecificModel 的性能有差异吗？

三种方式在推理性能上**没有本质差异**，因为底层都是相同的模型前向计算。区别仅在于封装层次和易用性。

---

### 第二部分总结速查表

| 方式                | 加载代码示例                                                                 | 输出示例                 |
| ----------------- | ---------------------------------------------------------------------- | -------------------- |
| **Pipeline**      | `pipeline('feature-extraction', model='bert-base-chinese')`            | 列表/张量                |
| **AutoModel**     | `AutoTokenizer.from_pretrained(...)`, `AutoModel.from_pretrained(...)` | `BaseModelOutput` 对象 |
| **SpecificModel** | `BertTokenizer.from_pretrained(...)`, `BertModel.from_pretrained(...)` | 同上                   |

**核心 API 记忆**：

- `from_pretrained(model_name_or_path)`：加载预训练模型或分词器。
- `tokenizer(text, padding=True, truncation=True, return_tensors='pt')`：文本编码。
- `model(**inputs)`：前向传播，返回各种输出。

---

### 3.1 练习一：使用 Pipeline 进行特征提取

#### 3.1.1 代码回顾与解释

```python
import transformers
import numpy as np

# 使用pipeline加载特征提取模型
model = transformers.pipeline(task='feature-extraction', model='model/bert-base-chinese')

text = '我爱你'
result = model(text)
print(np.array(result).shape)  # (1, 5, 768)
```

**逐步解释**：

1. `pipeline(task='feature-extraction', model='...')`：创建一个特征提取管道。`task` 告诉 Pipeline 要执行的任务类型；`model` 可以是 Huggingface 模型 ID（如 `'bert-base-chinese'`）或本地路径（如 `'model/bert-base-chinese'`）。
2. `model(text)`：内部自动完成：
   - 加载对应的分词器（bert-base-chinese 使用的分词器是 `BertTokenizer`）。
   - 对 `text` 进行分词、添加 `[CLS]` 和 `[SEP]`、转换为 `input_ids`、`attention_mask` 等。
   - 将张量传入 BERT 模型进行前向传播。
   - 提取最后一层的隐藏状态（`last_hidden_state`）并返回。
1. 返回结果是一个 **Python 列表**，形状为 `(batch_size, seq_len, hidden_dim)`。这里 batch_size=1，seq_len=5（token 数），hidden_dim=768（BERT-base 维度）。

---

#### 3.1.2 Pipeline 的局限性及应对

- **不能自定义批处理大小**：Pipeline 默认逐个样本处理，大批量时效率低。可以传入文本列表来触发内部批处理。
- **不能获取中间层输出**：Pipeline 只返回 `last_hidden_state`。如需特定层输出或注意力权重，必须使用 AutoModel 或 SpecificModel。
- **无法精细控制分词参数**：如 `max_length`、`truncation` 策略等。可通过传递 `truncation=True` 等参数给 Pipeline 的 `__call__` 方法，但支持有限。

**改进示例**（批量+调整最大长度）：

```python
texts = ["我爱你", "我喜欢自然语言处理"]
# 在调用时传入truncation和max_length（部分Pipeline支持）
result = model(texts, truncation=True, max_length=128)
```

---

#### 3.1.3 使用场景

- **快速验证**：测试 BERT 能否为你的文本生成合理的向量。
- **特征提取用于下游模型**：例如将 BERT 的输出作为传统机器学习模型（SVM、逻辑回归）的输入。
- **相似度计算**：对两个句子分别提取 `[CLS]` 向量，计算余弦相似度。

---

### 3.2 练习二：使用 AutoModel 进行特征提取（单句与多句）

#### 3.2.1 单句处理代码详解

```python
import transformers
import torch

text = '我爱你'

tokenizer = transformers.AutoTokenizer.from_pretrained('model/bert-base-chinese')
model = transformers.AutoModel.from_pretrained('model/bert-base-chinese')

tk_data = tokenizer(text, max_length=10, truncation=True, pad_to_max_length=True, return_tensors='pt')
print(tk_data)

model.eval()
with torch.no_grad():
    result = model(**tk_data)

print(result['last_hidden_state'].shape)  # (1, 10, 768)
print(result['pooler_output'].shape)      # (1, 768)
```

**关键参数说明**：

- `max_length=10`：限制序列最大长度（包括 `[CLS]` 和 `[SEP]`）。原始 `"我爱你"` 分词后为 `['[CLS]', '我', '爱', '你', '[SEP]'`，长度 5，未超过 10，故填充到 10。
- `truncation=True`：如果文本分词后超过 `max_length`，则截断。
- `pad_to_max_length=True`：将序列填充到 `max_length`（此处为 10）。填充 token 是 `[PAD]`（索引 0）。
- `return_tensors='pt'`：返回 PyTorch 张量。若需要 TensorFlow 张量则用 `'tf'`，NumPy 数组用 `'np'`。

**输出解释**：

- `tk_data` 是一个字典，包含 `input_ids`、`token_type_ids`、`attention_mask`。
- `result['last_hidden_state']` 形状 `(1,10,768)`：10 个位置（含填充位），每个位置 768 维向量。注意填充位置的向量也有值（但实际使用时需通过 `attention_mask` 忽略）。
- `result['pooler_output']` 形状 `(1,768)`：取自 `last_hidden_state` 的第一个位置（`[CLS]`），经过一个全连接层+tanh 激活，常用于句子分类。

---

#### 3.2.2 多句不等长处理（自动填充）

```python
texts = ['我爱你', '我喜欢你我喜欢你我喜欢你']

tokenizer = transformers.AutoTokenizer.from_pretrained('model/bert-base-chinese')
model = transformers.AutoModel.from_pretrained('model/bert-base-chinese')

tk_data = tokenizer(texts, padding=True, return_tensors='pt')
# 此时不会设置max_length，填充长度等于该批次中最长序列的长度
print(tk_data['input_ids'].shape)  # (2, 9) 假设第二个句子分词后长度9，则第一个句子填充到9

model.eval()
with torch.no_grad():
    result = model(**tk_data)

print(result['last_hidden_state'].shape)  # (2, 9, 768)
print(result['pooler_output'].shape)      # (2, 768)
```

**注意**：如果不指定 `max_length` 且不使用 `pad_to_max_length`，则每个样本独立编码，无法组成批次。而 `padding=True` 会使批次内所有样本填充到相同长度，但批次间的长度可能不同（取决于该批次最长样本）。通常配合 `return_tensors='pt'` 使用。

---

#### 3.2.3 常见陷阱与解决方案

| 陷阱 | 解决方案 |
| --- | --- |
| 忘记设置 `truncation=True` 导致长文本报错 | 始终设置 `truncation=True`，并合理设置 `max_length` |
| 批次内不同长度文本未填充导致无法堆叠张量 | 设置 `padding=True` 或 `pad_to_max_length=True` |
| 推理时未使用 `model.eval()` 和 `with torch.no_grad()` | 始终添加，避免梯度计算浪费内存 |
| 未传递 `attention_mask` 导致模型计算填充位置 | `tokenizer` 默认会返回 `attention_mask`，直接用 `**tk_data` 传递即可 |
| 不清楚 `pooler_output` 与 `last_hidden_state[:,0,:]` 的区别 | `pooler_output` 多了一层线性变换+tanh，通常更适合分类；但也可直接取 `[CLS]` |

---

### 3.3 练习三：使用 SpecificModel（BertModel）进行特征提取

```python
import transformers
import torch

texts = ['我爱你', '我喜欢你我喜欢你我喜欢你']

tokenizer = transformers.BertTokenizer.from_pretrained('model/bert-base-chinese')
model = transformers.BertModel.from_pretrained('model/bert-base-chinese')

tk_data = tokenizer(texts, padding=True, return_tensors='pt')

model.eval()
with torch.no_grad():
    result = model(**tk_data)

print(result['last_hidden_state'].shape)  # (2, 10, 768)  注意此处填充长度取决于批次内最长
print(result['pooler_output'].shape)      # (2, 768)
```

**与 AutoModel 的对比**：

- 代码几乎完全相同，只是类名从 `AutoTokenizer` / `AutoModel` 变为 `BertTokenizer` / `BertModel`。
- 当需要**调用 BERT 特有的方法或属性**时（如 `bert.embeddings.word_embeddings`），必须使用具体模型类。
- 如果要**修改模型架构**（如添加新的层），通常继承 `BertModel` 并修改。

---

### 3.4 BERT 下游任务微调实战

#### 3.4.1 文本分类任务（以情感分析为例）

**步骤概览**：

1. 准备数据集（如 IMDb、ChnSentiCorp）。
2. 加载预训练模型（`AutoModelForSequenceClassification`）。
3. 定义训练参数（学习率、批次大小、轮数）。
4. 编写训练循环（或使用 `Trainer` API）。
5. 评估模型。

**完整代码示例（使用 PyTorch 和 Transformers 库）**：

```python
from transformers import AutoTokenizer, AutoModelForSequenceClassification, TrainingArguments, Trainer
from datasets import load_dataset
import numpy as np
from sklearn.metrics import accuracy_score, f1_score

# 1. 加载数据集（以中文情感分析为例，假设已有CSV文件）
# 这里使用Huggingface datasets库加载内置数据集，若无则自己定义
dataset = load_dataset('csv', data_files={'train': 'train.csv', 'test': 'test.csv'})

# 2. 加载分词器和模型
model_name = 'bert-base-chinese'
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForSequenceClassification.from_pretrained(model_name, num_labels=2)

# 3. 预处理函数
def preprocess_function(examples):
    return tokenizer(examples['text'], truncation=True, padding='max_length', max_length=128)

encoded_dataset = dataset.map(preprocess_function, batched=True)

# 4. 定义评估指标
def compute_metrics(eval_pred):
    predictions, labels = eval_pred
    predictions = np.argmax(predictions, axis=1)
    acc = accuracy_score(labels, predictions)
    f1 = f1_score(labels, predictions, average='macro')
    return {'accuracy': acc, 'f1': f1}

# 5. 设置训练参数
training_args = TrainingArguments(
    output_dir='./results',
    evaluation_strategy='epoch',
    save_strategy='epoch',
    learning_rate=2e-5,
    per_device_train_batch_size=16,
    per_device_eval_batch_size=64,
    num_train_epochs=3,
    weight_decay=0.01,
    logging_dir='./logs',
    load_best_model_at_end=True,
)

# 6. 创建Trainer并训练
trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=encoded_dataset['train'],
    eval_dataset=encoded_dataset['test'],
    tokenizer=tokenizer,
    compute_metrics=compute_metrics,
)

trainer.train()

# 7. 评估
eval_results = trainer.evaluate()
print(eval_results)

# 8. 保存模型
model.save_pretrained('./my_sentiment_model')
tokenizer.save_pretrained('./my_sentiment_model')
```

**关键点**：

- `num_labels`：二分类设为 2，多分类设为类别数。
- 学习率通常设为 `2e-5` 或 `3e-5`（BERT 微调常用小学习率）。
- `padding='max_length'` 可保证批次内长度一致，但会增加计算量。也可用 `padding=True` 动态填充，配合 `DataCollatorWithPadding`。

---

#### 3.4.2 序列标注任务（如命名实体识别 NER）

```python
from transformers import AutoTokenizer, AutoModelForTokenClassification, Trainer

labels = ['O', 'B-PER', 'I-PER', 'B-LOC', 'I-LOC', ...]  # 标签列表
label2id = {l: i for i, l in enumerate(labels)}
id2label = {i: l for l, i in label2id.items()}

model = AutoModelForTokenClassification.from_pretrained(
    'bert-base-chinese',
    num_labels=len(labels),
    id2label=id2label,
    label2id=label2id
)
tokenizer = AutoTokenizer.from_pretrained('bert-base-chinese')

# 预处理函数需对齐标签与token（注意：BERT分词可能将单词分成子词，标签需对应到子词）
# 通常使用对齐策略：第一个子词保留原标签，其他子词设为-100（忽略损失）
```

**注意事项**：

- 标签需要与每个 token 对齐（包括 `[CLS]` 和 `[SEP]` 通常设为-100 忽略）。
- 使用 `model.config.label2id` 等属性方便后续推理。

---

#### 3.4.3 使用 Pipeline 进行微调后模型推理

```python
from transformers import pipeline

classifier = pipeline('text-classification', model='./my_sentiment_model', tokenizer='./my_sentiment_model')
result = classifier("这部电影太棒了！")
print(result)  # [{'label': 'LABEL_1', 'score': 0.99}] 需要将label映射回原始标签
```

---

### 3.5 高级技巧与最佳实践

#### 3.5.1 动态填充（Dynamic Padding）提高效率

使用 `DataCollatorWithPadding` 在批处理时动态填充，避免将整个数据集填充到固定最大长度。

```python
from transformers import DataCollatorWithPadding

data_collator = DataCollatorWithPadding(tokenizer=tokenizer)
trainer = Trainer(..., data_collator=data_collator)
```

---

#### 3.5.2 混合精度训练

在 `TrainingArguments` 中设置 `fp16=True` 可大幅加速训练并减少显存（需 GPU 支持）。

---

#### 3.5.3 梯度累积

当显存不足以容纳大批次时，使用梯度累积模拟大批次：

```python
training_args = TrainingArguments(..., per_device_train_batch_size=4, gradient_accumulation_steps=4)
# 有效批次大小 = 4*4=16
```

---

#### 3.5.4 冻结部分层以加速微调

如果下游数据量很小，可以冻结 BERT 主体，只训练分类头：

```python
for param in model.bert.parameters():
    param.requires_grad = False
# 只训练分类器
```

---

#### 3.5.5 使用 `accelerate` 库自定义训练循环（更灵活）

```python
from accelerate import Accelerator

accelerator = Accelerator()
model, optimizer, dataloader = accelerator.prepare(model, optimizer, dataloader)
# 手动编写训练循环...
```

---

### 3.6 常见错误与调试

| 错误信息 | 可能原因 | 解决方法 |
| --- | --- | --- |
| `Token indices sequence length is longer than the specified maximum` | 文本分词后长度超过模型最大位置编码（如 BERT 是 512） | 设置 `truncation=True`，或使用支持更长序列的模型（如 Longformer） |
| `CUDA out of memory` | 批次太大或序列太长 | 减小 `batch_size`、`max_length`，开启梯度累积，使用混合精度 |
| `KeyError: 'attention_mask'` | 手动构造输入时未提供 `attention_mask` | 使用 tokenizer 返回完整字典，或用 `model(**inputs)` 自动接收 |
| `Expected input batch_size to match target batch_size` | 标签数量与模型输出不一致 | 检查分类头的 `num_labels` 是否正确 |
| `RuntimeError: The size of tensor a (10) must match size of tensor b (9)` | 批次内未填充 | 设置 `padding=True` |

---

### 3.7 Transformers 库与 BERT 应用总结速查表

| 任务 | 推荐方式 | 关键类/函数 |
| --- | --- | --- |
| 快速特征提取 | Pipeline | `pipeline(task='feature-extraction', model=...)` |
| 微调文本分类 | AutoModel | `AutoModelForSequenceClassification`, `Trainer` |
| 微调序列标注 | AutoModel | `AutoModelForTokenClassification` |
| 微调问答 | AutoModel | `AutoModelForQuestionAnswering` |
| 生成文本（GPT） | AutoModel | `AutoModelForCausalLM` |
| 获取中间层输出 | SpecificModel | `BertModel.from_pretrained(..., output_hidden_states=True)` |
| 本地模型加载 | from_pretrained | 本地文件夹路径 |
| 批量推理 | AutoModel | tokenizer with `padding=True`, model with `**tk_data` |
| 模型保存 | model.save_pretrained | 同时保存分词器 |

---
