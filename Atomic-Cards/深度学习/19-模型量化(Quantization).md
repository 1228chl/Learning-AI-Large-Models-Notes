---
author: "XunZong"
created: "2026-07-07"
tags: ["深度学习", "模型压缩", "量化"]
aliases: ["量化", "Quantization", "模型量化"]
---

# 模型量化（Quantization）

## 定义

模型量化（Model Quantization）是将神经网络参数从高精度浮点数（如 FP32）映射到低精度表示（如 INT8、FP16、INT4）的过程，以减小模型体积和降低推理延迟。对于权重矩阵 $W \in \mathbb{R}^{m \times n}$ ，量化映射为：

$$
Q(W) = \text{round}\left(\frac{W - \text{min}}{\Delta}\right), \quad \Delta = \frac{\text{max} - \text{min}}{2^b - 1}
$$

其中 $\Delta$ 为缩放因子（scale）， $b$ 为量化比特数， $2^b - 1$ 为量化等级数，$\text{min}$ 和 $\text{max}$ 分别为权重 $W$ 的最小值和最大值。反量化还原为 $\hat{W} = Q(W) \cdot \Delta + \text{min}$ ，其中 $\hat{W}$ 为反量化后的近似权重矩阵。

## 量化方式分类

| 量化类型 | 精度保留 | 速度提升 | 适用场景 |
|:--------:|:--------:|:--------:|:--------|
| **FP16（半精度）** | 几乎无损 | 2x | GPU 训练/推理 |
| **动态量化** | FP32 的 99\%+ | 2-3x | LLM 推理（仅权重量化） |
| **静态量化** | FP32 的 99\%+ | 3-4x | CNN 推理（需校准数据集） |
| **INT8 量化** | FP32 的 98-99\% | 4x | 通用边缘部署 |
| **INT4 量化** | FP32 的 90-95\% | 6-8x | 端侧 LLM 推理（Mobile/Web） |

**PTQ（Post-Training Quantization）**：训练后直接量化权重，无需重新训练，速度快但低比特下精度损失较大。**QAT（Quantization-Aware Training）**：训练中插入伪量化节点（FakeQuant）模拟量化误差，模型学习自适应，精度更高但需微调计算量。

## 直观理解

量化相当于将一张照片从 32 位真彩色（FP32）降低到 8 位灰度（INT8）：文件体积缩小 4 倍，但画面整体细节仍可辨识；降到 4 位时色彩块状感明显，但核心轮廓依然保持。

## 代码示例：PyTorch 动态量化

```python
import torch
import torch.nn as nn

# ---------- 定义简单模型 ----------
class TextClassifier(nn.Module):
    """一个简单的文本分类模型，包含 Embedding + Linear 层"""
    def __init__(self, vocab_size=10000, embed_dim=256, num_classes=10):
        super().__init__()
        self.embedding = nn.Embedding(vocab_size, embed_dim)
        self.fc1 = nn.Linear(embed_dim, 128)
        self.fc2 = nn.Linear(128, num_classes)

    def forward(self, x):
        x = self.embedding(x).mean(dim=1)       # 平均池化
        x = torch.relu(self.fc1(x))
        return self.fc2(x)

model = TextClassifier()
model.eval()                                    # 量化前必须切换为评估模式

# ---------- 训练后动态量化（仅量化 Linear 层，保留 Embedding 为 FP32） ----------
quantized_model = torch.quantization.quantize_dynamic(
    model,                                      # 原始 FP32 模型
    qconfig_spec={nn.Linear},                   # 指定要量化的层类型
    dtype=torch.qint8                           # 量化精度（INT8）
)

# ---------- 对比量化前后模型大小 ----------
def print_model_size(m, label):
    """计算模型参数量（MB）"""
    param_size = sum(p.numel() * p.element_size() for p in m.parameters())
    print(f"{label}: {param_size / 1024 / 1024:.2f} MB")

print_model_size(model, "FP32 原始模型")
print_model_size(quantized_model, "INT8 动态量化后")

# ---------- 推理（API 完全一致，自动执行量化计算） ----------
dummy_input = torch.randint(0, 10000, (1, 20))
with torch.no_grad():
    fp32_output = model(dummy_input)
    int8_output = quantized_model(dummy_input)

# 输出差异极小（INT8 量化误差 < 1%）
print(f"输出差异: {torch.abs(fp32_output - int8_output).max().item():.6f}")
```

## ML/DL 应用场景

| 应用场景 | 使用方式 | 效果 |
|:--------:|:--------|:----|
| **LLaMA 本地部署** | 4-bit GPTQ / AWQ / GGML | 13B 模型仅需 8GB 显存 |
| **Whisper 语音识别** | FP16 量化 | 推理加速 2x |
| **YOLO 边缘部署** | INT8 静态量化 | Jetson Nano 实时 30fps |
| **BERT 服务端部署** | 动态量化（仅 Linear 层） | 显存降低 4x，延迟降低 2-3x |

## 面试追问

**Q1（基础）**：量化和剪枝在减小模型尺寸的原理上有什么本质区别？
**回答要点**：

1. 量化降低每个参数的存储精度（FP32→INT8 减少 4 倍），不改变网络结构
2. 剪枝直接移除部分参数（置零），改变网络稀疏度
3. 量化对所有参数等比例压缩，剪枝选择性移除"不重要"的参数

**Q2（深挖）**：PTQ 和 QAT 的主要区别和各自适用场景是什么？
**回答要点**：

1. PTQ 训练后直接量化，无需数据和重新训练，速度快但低比特下精度下降明显
2. QAT 在训练中插入伪量化节点（FakeQuant），模型自适应量化误差，精度更高但需微调
3. 对 LLM 常用 PTQ（GPTQ/AWQ），对小型 CNN 常用 QAT 以保证精度

**Q3（实战）**：如何为部署场景选择合适的量化比特数？
**回答要点**：

1. GPU 服务器优先 FP16，几乎无精度损失
2. CPU 边缘端用 INT8，提供 4x 压缩和硬件加速支持
3. 移动端/浏览器用 INT4 或混合精度（关键层 INT8 + 非关键层 INT4），需在目标硬件上评测精度-延迟-功耗的 trade-off

**Q4（边界）**：4-bit 量化对 LLM 的生成质量影响有多大？哪些任务损失最明显？
**回答要点**：

1. 4-bit 量化通常保持 90%+ 的原始质量，但数学推理、代码生成等需精确数值的任务下降明显
2. 量化误差在低比特下累积，长文本生成中可能产生更多幻觉
3. 不同量化方法（GPTQ vs AWQ vs GGML）效果差异显著，需针对任务评测选择

## 参考引用
- 需要理解知识蒸馏(Distillation)的相关知识，参见 [知识蒸馏(Distillation)](./21-知识蒸馏%28Distillation%29.md)
- 需要理解模型剪枝(Pruning)的相关知识，参见 [模型剪枝(Pruning)](./20-模型剪枝%28Pruning%29.md)
- 需要了解模型压缩总览以理解量化在压缩中的定位的相关知识，参见 [模型压缩量化剪枝蒸馏](./15-模型压缩量化剪枝蒸馏.md)
