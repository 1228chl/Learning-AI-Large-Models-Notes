---
author: "XunZong"
created: "2026-07-10"
tags: ["工程实践", "部署", "ONNX"]
aliases: ["ONNX", "模型部署", "模型转换", "推理加速"]
---

# ONNX 模型部署

## 定义

ONNX（Open Neural Network Exchange）是一个开放的神经网络模型交换格式，**将不同框架（PyTorch、TensorFlow、Keras）训练的模型统一为通用的中间表示**，实现在不同推理引擎上的高效部署。

## ONNX 的核心价值

```
PyTorch 模型 (.pt) ──┐
                     ├──→ ONNX 模型 (.onnx) ──→ CPU 推理（ONNX Runtime）
TensorFlow 模型      ──┘                      ├── GPU 推理（TensorRT, CUDA）
                                              ├── 移动端（CoreML, NNAPI）
                                              └── Web 端（ONNX.js, WebGL）
```

| 优势 | 说明 |
|:-----|:------|
| **框架无关** | PyTorch 训练的模型可用 TensorRT 推理，无需重写 |
| **推理优化** | 图优化 + 算子融合 + 量化，推理速度提升 2~5 倍 |
| **跨平台** | Server（Linux/Windows）→ 移动端（iOS/Android）→ Web |
| **生产部署** | 解耦训练和推理环境，无需安装 PyTorch 即可推理 |

## 导出流程

```python
import torch
import torch.nn as nn

# 1. 定义或加载模型
class SimpleModel(nn.Module):
    def __init__(self):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(784, 256),
            nn.ReLU(),
            nn.Linear(256, 10)
        )

    def forward(self, x):
        return self.net(x)

model = SimpleModel()
model.load_state_dict(torch.load('model_weights.pth'))
model.eval()                                         # ONNX 导出前必须切换到评估模式

# 2. 创建 dummy input（形状、数据类型必须与实际推理一致）
dummy_input = torch.randn(1, 784)                    # batch_size=1，特征维度 784

# 3. 导出 ONNX
torch.onnx.export(
    model,                                            # 待导出的模型
    dummy_input,                                      # 示例输入（确定输入形状和 dtype）
    'model.onnx',                                     # 输出文件名
    input_names=['input'],                            # 输入节点名称
    output_names=['output'],                          # 输出节点名称
    dynamic_axes={
        'input': {0: 'batch_size'},                   # batch 维度动态变化
        'output': {0: 'batch_size'}
    },
    opset_version=17,                                 # ONNX opset 版本，越高支持更多算子
    do_constant_folding=True                           # 常量折叠优化：将常量计算在导出时预计算
)
```

## ONNX Runtime 推理

```python
import onnxruntime as ort
import numpy as np

# CPU 推理
session = ort.InferenceSession('model.onnx')          # 创建推理会话
input_name = session.get_inputs()[0].name               # 获取输入节点名称
output_name = session.get_outputs()[0].name             # 获取输出节点名称

# 执行推理
input_data = np.random.randn(1, 784).astype(np.float32)  # 输入必须是 numpy 数组，float32
result = session.run([output_name], {input_name: input_data})  # 推理结果

# GPU 推理（需安装 onnxruntime-gpu）
# session = ort.InferenceSession('model.onnx', providers=['CUDAExecutionProvider'])
```

## 模型优化

### 量化

| 量化方式 | 精度损失 | 速度提升 | 说明 |
|:---------|:--------:|:--------:|:------|
| FP32 → FP16 | < 0.5% | ~2 倍 | 半精度推理，GPU 上显著加速 |
| FP32 → INT8 | 1%~3% | ~4 倍 | 整数量化，需校准数据集 |

```python
from onnxruntime.quantization import quantize_dynamic, QuantType

# 动态量化：权重量化为 INT8，激活值运行时决定
quantize_dynamic(
    'model.onnx',                                     # 输入 ONNX 模型
    'model_int8.onnx',                                # 输出量化后的模型
    weight_type=QuantType.QUInt8                       # 8-bit 无符号整数量化
)
```

### 图优化

ONNX Runtime 自动执行算子融合（Fuse）、常数折叠（Constant Folding）、冗余消除（Dead Code Elimination）等图优化，无需手动配置。

## 部署架构

```
训练环境                   部署环境
─────────                 ─────────
PyTorch 训练              ONNX Runtime 推理
    │                          │
    ├──→ export ONNX ──────→   │
    │                          │
    └──→ 保存权重 ─────────→   ├──→ REST API (FastAPI/Flask)
                               │
                               └──→ gRPC 服务
```

## 面试追问

**Q1（基础）**：ONNX 的作用是什么？它为什么能实现框架无关的模型部署？
**回答要点**：

1. ONNX 定义了一套标准化的计算图中间表示（算子集 + 图结构），PyTorch/TF/Keras 模型的算子都可映射到 ONNX 算子，实现跨框架兼容。
2. 模型在训练框架中导出为 ONNX 后，可以用任何支持 ONNX 的推理引擎（ONNX Runtime、TensorRT、OpenVINO）加载运行，无需安装原始训练框架。
3. ONNX 的算子集（opsets）持续更新覆盖新的模型结构，确保主流模型都能成功导出。

**Q2（深挖）**：ONNX 导出的常见问题有哪些？dynamic_axes 的作用是什么？
**回答要点**：

1. 常见问题：算子不兼容（if/loop/自定义算子无法导出）、动态shape问题（模型运行时依赖输入尺寸）、eval/train模式混淆（Dropout/BN 在 eval 模式下才能正确导出）。
2. dynamic_axes 允许导出的 ONNX 模型接受不同 batch_size 或不同序列长度的输入，而不需要为每种尺寸重新导出。
3. 解决方案：用 `torch.onnx.export` 的 `dynamic_axes` 参数指定动态维度；自定义算子用 `register_custom_op` 注册；export 前确保 `model.eval()`。

**Q3（实战）**：如何将一个 BERT 模型部署为线上服务？你会选择 ONNX Runtime 还是 TensorRT？
**回答要点**：

1. 导出为 ONNX：固定 seq_length（如 128/512），用 dynamic_axes 让 batch_size 动态，注意注意力 mask 的处理。
2. ONNX Runtime 适合 CPU 和通用场景，部署简单，生态兼容性好；TensorRT 适合 GPU 场景，推理速度更快但导出更严格（需 FP16/INT8 校准）。
3. 实践方案：先用 ONNX Runtime 快速上线，追求极致性能时切换到 TensorRT。建议用 Triton Inference Server 统一管理多框架推理。

**Q4（边界）**：ONNX 在大模型（LLM）部署中面临哪些挑战？有哪些替代方案？
**回答要点**：

1. 大模型的 KV Cache 动态增长、变长序列、条件分支（if-else）等控制流在 ONNX 导出中难以处理。
2. 大模型部署更常用专用推理框架：vLLM（PagedAttention 高效管理 KV Cache，LLM 推理速度提升 2~4 倍）、TensorRT-LLM（NVIDIA 官方，支持 GPTQ/AWQ 量化）、llama.cpp（纯 CPU 推理，量化到 4-bit 后单机可跑 7B 模型）。
3. ONNX 在大模型领域逐渐被专用框架替代，但仍然是中小模型部署的首选格式。

## 参考引用

- 需要理解模型保存格式与 ONNX 的关系参见 [模型保存格式](05-模型保存格式.md)
- 需要理解 Flask/FastAPI 部署 REST API 参见 [Flask与FastAPI模型部署](04-Flask与FastAPI模型部署.md)
- 需要理解模型量化与 ONNX 量化的关系参见 [模型量化](../../深度学习/模型压缩/19-模型量化(Quantization).md)
- 需要理解 Docker 容器化部署参见 [Docker基础与容器化](../Docker/01-Docker基础与容器化.md)