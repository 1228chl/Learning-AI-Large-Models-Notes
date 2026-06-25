**标签：** #NLP

---

# 模型压缩技术

## 一、模型压缩概述

### 1.1 为什么需要模型压缩？

在深度学习实际部署中，我们常面临一个矛盾：**效果好的模型往往太大，而资源受限的设备（如手机、摄像头、嵌入式芯片）无法承载**。

因此，**模型压缩**应运而生——它是一系列技术的统称，目标是在**尽量不损失模型性能的前提下，减小模型体积、加快推理速度、降低功耗**，使大模型能够在边缘设备或低资源环境中落地。

---

### 1.2 模型压缩的四种主流技术

| 技术名称 | 核心思想 | 典型效果 |
|---------|---------|---------|
| **剪枝（Pruning）** | 移除冗余的神经元或权重，使网络变稀疏 | 参数量减少 30%~90%，精度损失<2% |
| **量化（Quantization）** | 用低精度（如 int8）代替高精度（float32）存储权重 | 模型体积缩小 4 倍，推理加速 2~4 倍 |
| **知识蒸馏（Knowledge Distillation）** | 用大模型（教师）指导小模型（学生）学习 | 小模型达到大模型 80%~95%的性能 |
| **低秩分解（Low-rank Factorization）** | 将权重矩阵分解为两个小矩阵的乘积 | 减少参数量，适合全连接层或卷积核 |

> 注：本课程重点讲解前三种，低秩分解仅作了解。

---

## 二、模型量化

### 2.1 什么是模型量化

**量化（Quantization）** 是一种模型压缩技术，其核心思想是：将模型中的权重和激活值从高精度数据类型（通常是 32 位浮点数，即 `float32`）转换为低精度数据类型（如 8 位整数 `int8` 或 16 位浮点数 `float16`）。

#### 2.1.1 为什么要量化

- **减小模型体积**：`float32` 转 `int8` 后，模型大小直接缩减为原来的 **1/4**。
- **降低内存带宽**：整数运算需要的带宽更少，读取速度更快。
- **加速推理计算**：整数矩阵运算比浮点运算更快，尤其在支持 SIMD 指令的 CPU 上，推理速度可提升 **2~4 倍**。
- **适配边缘设备**：许多嵌入式芯片（如 ARM Cortex-M 系列）仅支持整数运算，量化是模型在这些设备上运行的先决条件。

#### 2.1.2 量化引入的代价

量化本质上是**有损压缩**——将连续的浮点数映射到离散的整数网格上，必然会引入近似误差。但实践证明，深度学习模型对参数精度具有较强的鲁棒性，在合理量化策略下，**精度损失通常控制在 1%~3% 以内**，完全可以接受。

---

### 2.2 常见低精度数据类型对比

| 数据类型              | 累积数据类型  | 值域范围           | 特点                                                 |
| ----------------- | ------- | -------------- | -------------------------------------------------- |
| **float16**（半精度）  | float16 | ±6.55×10⁴      | 16 位浮点，精度较低，范围有限，适合 GPU 加速                         |
| **bfloat16**（脑浮点） | float32 | ±3.39×10³⁸     | 16 位，指数范围与 float32 相同（保留大数表达能力），精度较低，Google TPU 常用 |
| **int16**         | int32   | -32768 ~ 32767 | 16 位有符号整数，无小数部分，适合权重分布对称的场景                        |
| **int8**          | int32   | -128 ~ 127     | 8 位有符号整数，范围最小，压缩率最高，适合推理加速                         |

#### 2.2.1 关键概念：累积数据类型（Accumulation Data Type）

在神经网络的矩阵乘法中，我们需要对大量数值进行**累加操作**（如卷积或全连接层的乘加运算）。如果每次都用低精度数据类型进行累加，很容易造成**溢出**或**精度丢失**。

累积数据类型的作用就是：**在累加中间结果时，使用更高精度的数据类型（如 int32）来暂存，待所有运算完成后再转换回目标低精度**。

**通俗比喻**：  
就像用计算器做很多次加法，输入的数字可能都是小整数，但计算器内部会用一个更大的寄存器来保存中间结果，防止溢出。累积数据类型就是那个“更大的寄存器”。

---

### 2.3 量化的三种常见方式

在实际部署中，根据量化发生的阶段不同，主要分为以下三类：

| 方式 | 英文缩写 | 发生阶段 | 特点 |
|------|---------|---------|------|
| **训练后量化** | PTQ（Post-Training Quantization） | 模型训练完成后 | 简单快速，无需重新训练，精度略有损失 |
| **量化感知训练** | QAT（Quantization-Aware Training） | 训练过程中 | 在训练时模拟量化误差，精度恢复最好，但需要训练成本 |
| **动态量化** | Dynamic Quantization | 推理时 | 仅对权重进行量化，激活值在推理时动态量化，适合 LSTM/Transformer 等模型 |

---

### 2.4 PyTorch 动态量化 API

PyTorch 在 `torch.quantization` 模块中提供了动态量化的便捷接口：

```python
torch.quantization.quantize_dynamic(
    model,           # 待量化的模型
    qconfig_spec,    # 指定要量化的层类型，如 {torch.nn.Linear}
    dtype=torch.qint8  # 量化后的数据类型
)
```

**参数说明**：

- `model`：需要量化的 PyTorch 模型。
- `qconfig_spec`：一个集合或字典，指定哪些模块的哪些参数需要被量化。通常我们指定 `{torch.nn.Linear}`，表示对所有线性层进行量化。
- `dtype`：量化目标类型，一般为 `torch.qint8`（8 位有符号整数）。

**核心机制**：动态量化会在推理前，将模型中的 `Linear` 层替换为 `DynamicQuantizedLinear` 层。这些新层在**前向传播时**，会动态地将输入激活值从 `float32` 量化为 `int8`，进行整数矩阵乘法，再将结果反量化回 `float32` 输出。

> ⚠️ **重要注意事项**：  
> PyTorch 的动态量化**目前仅支持在 CPU 上运行**。如果在 GPU 上执行量化，会报以下错误：
> 
> RuntimeError: Could not run 'quantized::linear_prepack' with arguments from the 'UNKNOWN_TENSOR_TYPE_ID' backend. 'quantized::linear_prepack' is only available for [QuantizedCPU].
> 
> 因此，量化操作必须在 CPU 上进行，量化后的模型仍可在 CPU 上高效推理。

---

### 2.5 代码实现（基于 BERT 分类模型）

#### 2.5.1 配置文件修改

`config.py` 在原有配置基础上，增加量化模型的存储路径，并将 `device` 强制设为 `'cpu'`：

```python
import torch
import os
import datetime
from transformers import BertModel, BertTokenizer, BertConfig

current_date = datetime.datetime.now().date().strftime("%Y%m%d")

class Config(object):
    def __init__(self):
        # ... 原有配置保持不变 ...
        self.model_save_path = r""
        
        # 新增：量化模型存储路径
        self.save_model_path2 = r""
        if not os.path.exists(self.save_model_path2):
            os.mkdir(self.save_model_path2)
        self.save_model_path2 += "\\" + self.model_name + current_date + "_quantized.pt"
        
        # 重点：量化必须在 CPU 上进行
        self.device = 'cpu'
        
        # ... 其余配置 ...
```

**说明**：

- 量化前必须将 `device` 设置为 `'cpu'`，这是 PyTorch 的硬性要求。
- 量化后的模型会保存为一个独立的 `.pt` 文件，方便后续部署使用。

---

#### 2.5.2 量化主脚本

`bert_model_quantization.py` 代码完整实现如下，关键步骤已用注释标注：

```python
from bert_classifer_model import BertClassifier
from config import Config
import numpy as np
import torch
from utils import build_dataloader
from train import model2dev

# 初始化配置
conf = Config()

if __name__ == '__main__':
    # 1. 加载数据迭代器
    print('加载数据...')
    train_dataloader, test_dataloader, dev_dataloader = build_dataloader()

    # 2. 加载已训练好的 BERT 分类模型
    print("加载模型...")
    device = conf.device  # 此时为 'cpu'
    model = BertClassifier()
    model_path = conf.model_save_path
    # map_location='cpu' 确保权重加载到 CPU
    model.load_state_dict(torch.load(model_path, map_location='cpu'))
    model.eval()  # 切换为评估模式

    # 3. 核心：执行动态量化
    # 指定对所有的 Linear 层进行 int8 量化
    quantized_model = torch.quantization.quantize_dynamic(
        model, 
        {torch.nn.Linear}, 
        dtype=torch.qint8
    )
    
    # 4. 查看量化后的模型结构（Linear 层已变为 DynamicQuantizedLinear）
    print(quantized_model)

    # 5. 在测试集上评估量化模型的性能
    report, f1score, accuracy, precision = model2dev(
        quantized_model, 
        test_dataloader, 
        device
    )
    print("Test Classification Report:", report)
    print("Test F1:", f1score)
    print("Test Accuracy:", accuracy)
    print("Test Precision:", precision)

    # 6. 保存量化模型
    torch.save(quantized_model, conf.save_model_path2)
    print("保存量化模型成功！地址为：", conf.save_model_path2)
```

**代码逻辑解读**：

- **步骤 3** 是整个脚本的核心：`quantize_dynamic` 会遍历模型，将所有 `torch.nn.Linear` 模块替换为 `DynamicQuantizedLinear`，并对其权重进行 int8 量化。
- **步骤 5** 的评估代码与常规模型完全一致，因为量化后的模型接口未发生变化，可直接调用。

---

#### 2.5.3 输出结果分析

**模型结构变化**

量化前，BERT 的注意力层为普通 `Linear`：

```python
(query): Linear(in_features=768, out_features=768, bias=True)
(key): Linear(in_features=768, out_features=768, bias=True)
(value): Linear(in_features=768, out_features=768, bias=True)
```

量化后，变为：

```python
(query): DynamicQuantizedLinear(in_features=768, out_features=768, dtype=torch.qint8, qscheme=torch.per_tensor_affine)
(key): DynamicQuantizedLinear(in_features=768, out_features=768, dtype=torch.qint8, qscheme=torch.per_tensor_affine)
(value): DynamicQuantizedLinear(in_features=768, out_features=768, dtype=torch.qint8, qscheme=torch.per_tensor_affine)
```

所有全连接层（包括 BERT 中的 Q/K/V、FFN 以及最后的分类层）均被替换为量化版本。

**性能指标对比**

| 模型 | 测试准确率 | 测试 F1 |
|------|-----------|--------|
| 原始 BERT（float32） | ~0.9348 | ~0.9349 |
| 量化 BERT（int8） | ~0.8934 | ~0.8950 |

**分析**：

- 准确率下降约 4 个百分点，F1 下降约 4 个百分点。
- 说明量化确实带来了精度损失，但在可接受范围内（许多场景下依然可用）。

**模型体积缩减**

量化后的模型文件大小约为原始模型的 **1/2.6**（即压缩了约 2.6 倍）。对于更大型的模型（如 LLaMA），int8 量化通常可达到 **4 倍压缩**。

---

### 2.6 量化常见问题与应对策略

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| 量化后精度下降明显 | 激活值分布不均匀，低精度无法有效表示 | 改用 QAT（量化感知训练）或在量化前进行激活值校准 |
| 报错“Could not run 'quantized::linear_prepack'” | 在 GPU 上调用了量化 API | 将模型移至 CPU 再量化，量化后再移回 GPU（虽然 GPU 支持有限） |
| 量化后模型大小未减小 | 保存时使用了 `state_dict` 而非完整模型 | 使用 `torch.save(model, path)` 保存完整模型对象，或确保保存的是量化后的权重 |
| 模型包含不支持量化的层 | 如 `LayerNorm` 或自定义层 | 在 `qconfig_spec` 中排除这些层，或为其编写自定义量化配置 |

---

### 2.7 本部分小结

1. **量化原理**：通过降低权重和激活的数值精度，大幅减小模型体积并加速推理，是一种成熟的部署优化手段。
2. **PyTorch 实现**：使用 `torch.quantization.quantize_dynamic` 对模型中的 `Linear` 层进行一键量化，操作简单，无需重新训练。
3. **效果评估**：在本项目的 BERT 分类任务中，量化后模型体积压缩约 2.6 倍，准确率下降约 4 个百分点，在资源受限场景下具备实用价值。
4. **局限性**：动态量化目前仅支持 CPU 部署，且对某些模型精度影响较大；若需更高精度保留，可考虑 QAT 方案。

---

## 三、模型知识蒸馏

### 3.1 什么是知识蒸馏

**模型蒸馏**（Knowledge Distillation, KD）给出了不同的答案。它不是直接压缩参数，而是**让一个小模型“模仿”大模型的思维方式**，从而在保持性能的同时，从根源上减少参数量。

> **技术目标**：通过“教师-学生”的方式，将大型复杂模型（教师）的知识迁移到轻量级模型（学生），使学生在显著降低计算成本的同时，尽可能接近教师的性能。

其中有很多分支：

- **输出层蒸馏**（Logits-based Distillation）
	- 学生模仿教师的最终输出概率分布（相当于直接抄答案），实现最简单，是经典方法。
- **特征蒸馏**（Feature-based Distillation）
	- 学生模仿教师的中间层特征表示（学会其方法），知识传递更丰富。
- **关系蒸馏**（Relation-based Distillation）
	- 学生模仿教师捕捉的样本间关系，适合复杂结构化任务。
- **自蒸馏**（Self-Distillation）
	- 无独立教师模型，模型自己“教”自己，适合无额外大模型可用的场景。

知识蒸馏的**核心思想**：**让学生模型模仿教师模型的输出分布，而不仅仅是拟合真实标签**。

---

#### 3.1.1 教师模型

**概述**：教师模型是一个已经训练好的、提醒庞大且精度很高的模型。

**作用**：主要是进行**知识输出**，它不需要再参与训练，只负责在蒸馏阶段给出预测结果。

**通俗理解**：好比一位资深的大学教授，知识渊博，解题能力极强，但他的解题思路（模型）太复杂，不方便随身携带。

---

#### 3.1.2 学生模型

**概述**：学生模型是一个结构简单、参数较少的小模型，蒸馏开始前没有进行训练。

**作用**：主要是进行**知识接收**，它是最终的交付产物，负责在实际场景中快速推理。

**通俗理解**：好比一个聪明的本科生，底子薄，但理解能力强。他的任务是模仿教授的思路，用最精简的语言把复杂的题目讲清楚。

---

#### 3.1.3 硬标签

**概述**：硬标签主要是传统的、绝对的“标准答案”，例如 One-hot 形式。

**表现形式**：三分类中，[0,1,0]表示“它就是第 2 类”，只有对错，没有中间地带。

**局限性**：信息量极少。它告诉模型“这是猫”，却没告诉模型“猫和老虎有点像，和汽车完全不像”。相当于题目中的标准答案，只判对错，不讲缘由。

---

#### 3.1.4 软标签

**概述**：软标签主要是教师模型输出的“概率分布”（经过 Softmax 处理）。

**表现形式**：三分类中，[0.2,0.7,0.1]表示“模型 70% 确信是第 2 类，20% 觉得像第 1 类”。

**核心价值**：这是蒸馏的关键核心。它包含了“**暗知识**”——即样本间的相似性结构（类比关系）。学生看软标签，能学到“为什么像 B 而不像 C”。

---

#### 3.1.5 中间层

**概述**：中间层是神经网络在倒数第二层或某个隐藏层输出的“特征向量”或“特征图”。

**核心作用**：它比最终结果（软标签）包含更高维度的信息。软标签是结论，中间层是推导过程。

**通俗理解**：软标签是教授直接给的“口头结论”；中间层是教授手里的“完整板书和推到草稿”。学生如果能模仿这份草稿，学到的知识会比只看结论更扎实。

---

#### 3.1.6 五个概念的相关逻辑

1. **教师模型（博导）** 接收输入数据。
2. 生成**软标签（解题思路）**，同时提取内部的**中间层（板书细节）**。
3. **学生模型（本科生）** 同时接收三样东西：
	- **硬标签（标准答案）**——保证方向不跑偏
	- **软标签（解题思路）**——主要模仿对象，学会举一反三
	- **中间层（板书笔记）**——进阶模仿，加深理解
4. 在**硬标签、软标签、中间层**三重信号的指导下，学生模型最终被训练成一个体量小、但思维方式接近教师的高效模型。
一句话**教师是本源，学生是目标，硬标签定方向，软标签传思想，中间层递细节**。

### 3.2 知识蒸馏架构

#### 3.2.1 三种蒸馏方式

- **硬标签蒸馏**
	- 学生模型直接学习教师模型硬标签，即教师模型预测的具体类别作为学生的的 label。
	- 损失函数：交叉熵损失
- **软标签蒸馏**
	- 学生模型学习真实的标签和教师模型软标签，将两种 loss 进行相加来更新学生模型的参数。
- **中间层蒸馏**
	- 教师模型中间层的特征表达方式，让学生具备更相似的“思考过程”。
![](https://raw.githubusercontent.com/1228chl/Learning-AI-Large-Models-Notes/master/Assets/Image/AI-Large-Modlels-Notes/Project/SubmitAFullScoreProject/ModelCompression/1.3.2.1-1.png)

---

#### 3.2.2 KL 散度损失

##### 3.2.2.1 KL 散度的定义

KL 散度（Kullback-Leibler divergence）是一种用于衡量两个概率分布之间差异的非对称度量，在机器学习中常作为损失函数使用。

**简单来说**：KL 散度就是“我们用一个分布去模仿另一个分布，结果差多少”的一个衡量方式。

KL 散度定义两个概率分布 P(x)和 Q(x)之间的“差距”为：

$$
D_{KL}\left(P\Vert{Q}\right)=\sum_{x}^{}P\left(x\right)\log_{}\frac{P\left(x\right)}{Q\left(x\right)}
$$

KL 散度越小，说明 Q 越接近 P。**当且仅当 P = Q 时，KL 散度为 0**。

---

##### 3.2.2.2 KL 散度的解释

$$
D_{KL}\left(P\Vert{Q}\right)=\sum_{x}^{}P\left(x\right)\log_{}\frac{P\left(x\right)}{Q\left(x\right)}
$$

$$
D_{KL}\left(P\Vert Q\right)=H\left(P,Q\right)-H\left(P\right)
$$

---

###### 信息熵 H(P)

是从**真实分布 P(x)** 的角度，看它自己有多“混乱”：

$$
H\left(P\right)=-\sum_{x}^{}P\left(x\right)\log_{}P\left(x\right)
$$

它表示我们在 P(x)下编码一个样本所需的**最小信息量**（期望的 bits 数）。

---

###### 交叉熵 H(P,Q)

是我们用分布 Q(x)来编码样本，但样本的真实分布其实是 P(x)时，所消耗的信息量：

$$
H\left(P,Q\right)=-\sum_{x}^{}P\left(x\right)\log_{}Q\left(x\right)
$$

**以下是交叉熵与熵和相对熵(KL 散度)的关系**：

>  熵 = 交叉熵 - 相对熵（KL 散度）
>  相对熵 = 交叉熵 - 熵
>  交叉熵 = 熵 + 相对熵

---

###### KL 散度的直观含义

我们用分布 Q 来模仿 P，那么代价多大？

$$
\begin{flalign}
D_{KL}\left(P\left|\right|Q\right)&=\sum_{x}^{}P\left(x\right)\log_{}\frac{P\left(x\right)}{Q\left(x\right)}&\\
&=\sum_{x}^{}P\left(x\right)\left\lbrack\log_{}P\left(x\right)-\log_{}Q\left(x\right)\right\rbrack&\\
&=-\sum_{x}^{}P\left(x\right)\log_{}Q\left(x\right)+\sum_{x}^{}P\left(x\right)\log_{}P\left(x\right)&\\
&=H\left(P,Q\right)-H\left(P\right)&\\
\end{flalign}
$$

KL 散度就是你比最优编码（信息熵）多花了多少啊信息量（交叉熵）

**为什么硬编码只需要算交叉熵？**

因为硬编码信息熵为 0。

---

##### 3.2.2.3 举例理解

盲猜彩票数字（预测 vs 现实）

场景：

- 彩票的真实中奖概率是：P = [红 70%，蓝 30%]（这是现实，也就是 P）
- 你不知道，瞎猜它是平均的：Q = [红 50%，蓝 50%]
- 你天天根据 Q 去猜，结果常常猜错

| 项目         | 对应公式     | 含义                        |
| ---------- | -------- | ------------------------- |
| 信息熵 H(P)   | 最小需要的信息量 | 理想情况下，你知道 P，自然能更好预测（最省信息） |
| 交叉熵 H(P,Q) | 实际花掉的信息量 | 你不知道真相，用 Q 来猜，浪费了信息       |
| KL 散度      | 差距或损失    | 你不懂 P，结果多浪费了信息量（或猜错更多）    |

---

##### 3.2.2.4 KL 散度损失计算举例

假设我们有两个概率分布：

- **真实分布(P)**：你想要的目标
- P = [0.7,0.2,0.1]
- **预测分布(Q)**：模型给出的预测
- Q = [0.6,0.3,0.1]
我们现在计算：

$$
D_{KL}\left(P\left|\right|Q\right)=\sum_{i}^{}P\left(i\right)\log_{}\frac{P\left(i\right)}{Q\left(i\right)}
$$

**逐项计算**

- 第一项： $0.7\cdot\log_{}\frac{0.7}{0.6}=0.7\cdot\log_{}\left(1.1667\right)\approx0.7\cdot0.154=0.1078$
- 第二项： $\displaylines{0.2\cdot\frac{0.2}{0.3}=0.2\cdot\left(0.6667\right)}\approx0.2\cdot\left(-0.176\right)=-0.0352$
- 第三项： $0.1\cdot\log_{}\frac{0.1}{0.1}=0.1\cdot\log_{}\left(1\right)=0$
**逐项相加**

$$
D_{KL}\left(P\Vert Q\right)\approx0.1078+\left(-0.0352\right)+0=0.0726
$$

这就是模型预测分布 Q 与真实分布 P 之间的 KL 散度损失

---

#### 3.2.3 软标签蒸馏的两个超参数

##### 3.2.3.1 两个关键参数

软标签蒸馏（Knowledge Distillation，知识蒸馏）中的两个关键参数：

- $\alpha$ （权重系数）
- $T$ （温度）

---

##### 3.2.3.2 T（温度）

温度 $T$ 可以控制**软标签**的软硬程度，用于**调节 teacher 模型输出 softmax 的平滑程度**，让学生模型学习 teacher 的“潜在知识”。

**普通 softmax 是**：

$$
P_{i}=\frac{e^{z_{i}}}{\sum_{j}^{}e^{z_{j}}}
$$

加入温度后的 softmax：

$$
P_{i}^{\left(T\right)}=\frac{e^{\frac{z_{i}}{T}}}{\sum_{j}^{}e^{\frac{z_{j}}{T}}}
$$

- 如果 $T = 1$ ：就是普通 softmax。
- 如果 $T>1$ ：输出变得更平滑，**弱类别概率也变大**，学生能学到更多“细节”。
- 如果 $T$ 趋近于 $0$ ：softmax 趋近 one-hot，更像硬标签。
- 如果 $T$ 趋近于无穷大：softmax 趋近于均匀的分布。

> 把 teacher 模型的输出看作“专家的信心”。
> 温度越高，专家越“谦虚”，告诉学生：“其实 B 类也有点可能”
> 温度越低，专家越“武断”：“就是 A，别问！”

一般 $T$ 选 2 到 5 之间，太高或太低都可能让学生难以学习。

---

##### 3.2.3.3 $\alpha$ （权重系数）

$\alpha$ 可以平衡自主学习和老师学习的重要性。

$\alpha$ 控制总损失中**蒸馏损失(软标签)** 与**普通交叉熵(硬标签)** 的权重比例。

总损失函数一般是这样的：

$$
\mathcal{L} = (1 - \alpha) \cdot \text{CE}(y_{\text{hard}}, p_s) + \alpha \cdot T^2 \cdot \text{KL}(p_t^{(T)} \| p_s^{(T)})
$$

- $CE$ ：交叉熵损失，硬标签。
- $KL$ ：KL 散度损失，蒸馏用的软标签。
- $p_t$ ：teacher 模型的软输出。
- $p_s$ ：student 模型的软输出。

**α起什么作用？**
- $\alpha$ 趋近 1：更重视 teacher 的软标签（偏向模仿老师）
- $\alpha$ 趋近 0：更重视 ground truth 的硬标签（偏向传统训练）
一般 $\alpha$ 设置在 0.5 到 0.9 之间。

---

##### 3.2.3.4 乘以 $T^2$ 的原因

乘以 $T^2$ 的主要目的是**保持梯度的量级与温度无关**。具体推导如下：

- 原始 KL 散度的梯度是 $O(\frac{1}{T})$ 量级。
- 乘以 $T^2$ 后，梯度变为：

$$
\frac{\partial (T^2 \cdot \text{KL})}{\partial z_s} = T(p_s^{(T)} - p_t^{(T)})
$$

	这样，梯度量级从 $O(\frac{1}{T})$ 调整为 $O(T)$ ，与温度 $T$ 线性相关。

在原始论文（Hinton et al.，2015）中，作者发现：

- 当温度 $T$ 较高时，KL 散度的梯度会非常小，导致知识蒸馏的效果不明显。
- 乘以 $T^2$ 可以抵消温度对梯度的影响，使得在高温时蒸馏仍然有效。

---
 