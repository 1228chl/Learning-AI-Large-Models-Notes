**上一级：** [[]]

**下一级：** [[]]

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
| **剪枝（Pruning）** | 移除冗余的神经元或权重，使网络变稀疏 | 参数量减少30%~90%，精度损失<2% |
| **量化（Quantization）** | 用低精度（如int8）代替高精度（float32）存储权重 | 模型体积缩小4倍，推理加速2~4倍 |
| **知识蒸馏（Knowledge Distillation）** | 用大模型（教师）指导小模型（学生）学习 | 小模型达到大模型80%~95%的性能 |
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

#### 2.5.1 配置文件修改（`config.py`）

在原有配置基础上，增加量化模型的存储路径，并将 `device` 强制设为 `'cpu'`：

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

#### 2.5.2 量化主脚本（`bert_model_quantization.py`）

代码完整实现如下，关键步骤已用注释标注：

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
