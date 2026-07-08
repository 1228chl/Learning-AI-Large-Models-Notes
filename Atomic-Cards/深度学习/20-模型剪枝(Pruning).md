---
author: "XunZong"
created: "2026-07-07"
tags: ["深度学习", "模型压缩", "剪枝"]
aliases: ["剪枝", "Pruning", "模型剪枝"]
---

# 模型剪枝（Pruning）

## 定义

模型剪枝（Model Pruning）通过移除神经网络中不重要的权重、通道或层，在保持模型精度的前提下减少参数量和计算量。对于权重矩阵 $W \in \mathbb{R}^{m \times n}$ ，剪枝操作定义为一个掩码 $M \in \{0,1\}^{m \times n}$ ：

$$
W_{\text{pruned}} = W \odot M, \quad M_{ij} = \begin{cases} 1 & |W_{ij}| > \tau \\ 0 & \text{otherwise} \end{cases}
$$

其中 $\tau$ 为剪枝阈值， $\odot$ 为逐元素乘法。剪枝后模型稀疏度定义为 $S = 1 - \frac{\|M\|_0}{m \times n}$ ，即被置零参数的比例。

## 核心分类

| 剪枝类型 | 粒度 | 是否改变网络结构 | 硬件加速 | 典型压缩比 |
|:--------:|:----:|:---------------:|:--------:|:----------:|
| **非结构化剪枝** | 单个权重 | 否 | 不支持通用 GPU | 5-10x |
| **结构化剪枝（通道）** | 整通道 | 是 | 支持 | 2-4x |
| **结构化剪枝（层）** | 整层 | 是 | 支持 | 1.5-2x |
| **注意力头剪枝** | 整个头 | 是 | 支持 | 1.5-2x |

**剪枝流程**：完整训练 → 评估参数重要性（L1 范数、梯度、Hessian 矩阵）→ 移除不重要参数 → 微调恢复精度 → 迭代至目标稀疏度。LLM 专用方法包括 SparseGPT（一步剪枝无需微调）和 Wanda（基于权重和激活的乘积重要性评估）。

## 直观理解

剪枝如同修剪一棵树的枝叶而非砍伐树干：移除对整体输出贡献微弱的权重（细枝末节），保留承载主要信息的通道（主枝干）。非结构化剪枝是随意移除树叶（稀疏分散），结构化剪枝是移除整根枝条（连续块状，硬件友好）。

## 代码示例：PyTorch 剪枝

```python
import torch
import torch.nn as nn
import torch.nn.utils.prune as prune

# ---------- 定义简单模型 ----------
class SimpleMLP(nn.Module):
    """一个简单的三层 MLP，用于演示剪枝流程"""
    def __init__(self):
        super().__init__()
        self.fc1 = nn.Linear(784, 256)
        self.fc2 = nn.Linear(256, 128)
        self.fc3 = nn.Linear(128, 10)

    def forward(self, x):
        x = torch.relu(self.fc1(x))
        x = torch.relu(self.fc2(x))
        return self.fc3(x)

model = SimpleMLP()

# ---------- 方法一：非结构化剪枝（L1 范数） ----------
# 对 fc1 的权重进行 50% 稀疏度剪枝（移除绝对值最小的 50% 参数）
prune.l1_unstructured(model.fc1, name="weight", amount=0.5)
# 剪枝后权重为 weight_orig（原始）+ weight_mask（掩码）
# weight = weight_orig * weight_mask

# 查看剪枝效果
sparsity = 1.0 - model.fc1.weight_mask.mean().item()
print(f"fc1 权重稀疏度: {sparsity:.1%}")            # 输出: 50.0%

# ---------- 方法二：结构化剪枝（L1 范数，按通道） ----------
# 对 fc2 的权重按 L1 范数移除 20% 的输入通道
prune.ln_structured(model.fc2, name="weight", amount=0.2, n=1, dim=0)
# dim=0 表示沿输出通道维度剪枝（移除整行权重）

# ---------- 方法三：全局剪枝（同时剪枝多个层） ----------
prune.global_unstructured(
    [(model.fc1, "weight"), (model.fc2, "weight"), (model.fc3, "weight")],
    pruning_method=prune.L1Unstructured,
    amount=0.3,                                     # 整体稀疏度 30%
)

# ---------- 永久化剪枝（移除掩码，不可逆） ----------
prune.remove(model.fc1, "weight")                   # weight_orig → weight
prune.remove(model.fc2, "weight")
prune.remove(model.fc3, "weight")
# 注意：remove 后权重不再可继续剪枝（掩码已移除）

print("所有层剪枝完成并永久化")
print(f"fc1 稀疏度: {1.0 - (model.fc1.weight == 0).float().mean():.1%}")
```

## ML/DL 应用场景

| 应用场景 | 剪枝方案 | 效果 |
|:--------:|:--------|:----|
| **BERT 模型压缩** | 注意力头剪枝 + 结构化剪枝 | 参数量减少 40\%，推理加速 1.5x |
| **YOLO 边缘部署** | 通道结构化剪枝 | 模型大小减半，Jetson Nano 实时 |
| **LLM 压缩** | SparseGPT / Wanda（非结构化） | 50\% 稀疏度精度几乎无损 |
| **MobileNet 移动端** | 结构化剪枝 + 微调 | 体积从 16MB 降至 8MB |

## 面试追问

**Q1（基础）**：非结构化剪枝和结构化剪枝的核心区别是什么？

**回答要点**：非结构化剪枝以单个权重为粒度，产生稀疏矩阵，通用 GPU 无法加速需专用稀疏张量核心；结构化剪枝以通道/层为粒度，移除后仍保持密集矩阵乘法，可直接获得推理加速。

**Q2（深挖）**：为什么非结构化剪枝在通用 GPU 上难以获得实际加速？

**回答要点**：非结构化剪枝产生稀疏权重矩阵，GPU 的并行计算基于密集矩阵乘法优化；稀疏矩阵需特殊硬件或库支持（如 NVIDIA 的稀疏张量核心），通用 GPU 无法利用；结构化剪枝（通道/层级别）权重仍为密集矩阵，可直接获得加速。

**Q3（实战）**：如何评估一个权重或通道的重要性？

**回答要点**：常见方法有：基于权重大小（L1/L2 范数，越小越不重要）；基于梯度（Fisher 信息量，梯度小的参数信息少）；基于特征图响应（BN 层缩放因子 $\gamma$ ， $\gamma$ 接近 0 的通道可移除）；以及基于二阶信息（OBD/OBS 使用 Hessian 矩阵）。

**Q4（边界）**：剪枝后模型可能出现什么副作用？如何缓解？

**回答要点**：过度剪枝导致欠拟合，模型容量不足以拟合数据；被剪枝参数可能包含重要信息，造成精度骤降；缓解策略：迭代式剪枝（逐步剪枝→充分微调）、使用学习率回退、结合知识蒸馏恢复性能。

## 参考引用
- 需要理解知识蒸馏(Distillation)的相关知识，参见 [知识蒸馏(Distillation)](./21-知识蒸馏(Distillation).md)
- 需要理解模型量化(Quantization)的相关知识，参见 [模型量化(Quantization)](./19-模型量化(Quantization).md)
- 需要了解模型压缩总览以理解剪枝在压缩中的定位，参见 [模型压缩量化剪枝蒸馏](./15-模型压缩量化剪枝蒸馏.md)