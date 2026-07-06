---
author: "XunZong"
created: "2026-07-06"
tags: ["深度学习", "PyTorch", "张量"]
aliases: ["PyTorch", "张量", "Tensor", "GPU"]
---

# PyTorch 张量与运算

## 定义

张量（Tensor）是多维数组的泛化概念——标量是 0 维张量，向量是 1 维，矩阵是 2 维，图像数据 $(H,W,C)$ 是 3 维，批量图像 $(N,H,W,C)$ 是 4 维。PyTorch 的张量类似 NumPy 的 ndarray，但支持 **GPU 加速**和**自动微分**。

```python
import torch

# 创建张量
x = torch.tensor([[1, 2], [3, 4]])         # 从数据创建
x = torch.zeros(3, 4)                       # 全零
x = torch.randn(2, 3)                       # 标准正态分布随机
x = torch.ones(2, 3, dtype=torch.float32)

# 设备管理
x_cpu = torch.tensor([1, 2])
x_gpu = x_cpu.cuda()                        # 移到 GPU
x_back = x_gpu.cpu()                        # 移回 CPU
```

## 张量操作

| 操作 | 代码 | 说明 |
|------|------|------|
| **形状** | `x.shape`、`x.size()` | 查看张量维度 |
| **变形** | `x.view(3, -1)`、`x.reshape(3, -1)` | 改变形状（-1 自动推断） |
| **转置** | `x.T`、`x.transpose(0, 1)` | 交换维度 |
| **索引** | `x[0, :]`、`x[:, 1:3]` | 切片操作（同 NumPy） |
| **拼接** | `torch.cat([a, b], dim=0)` | 沿指定维度拼接 |
| **堆叠** | `torch.stack([a, b], dim=0)` | 创建新维度堆叠 |
| **扩维** | `x.unsqueeze(0)`、`x.squeeze()` | 增/删尺寸为 1 的维度 |

## 设备与数据类型

```python
# GPU 加速
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
x = torch.randn(1000, 1000, device=device)

# 数据类型
x_f32 = torch.tensor([1.0], dtype=torch.float32)   # 默认
x_f16 = x_f32.half()                                 # 半精度（混合训练）
x_i64 = torch.tensor([1], dtype=torch.long)          # 标签通常用 long
```

## ML 中的张量

| 应用场景 | 张量形状 | 说明 |
|----------|----------|------|
| **图像数据** | $(N, C, H, W)$ | 批量、通道、高、宽 |
| **文本数据** | $(N, L)$ 或 $(N, L, d)$ | 批量、序列长度、嵌入维度 |
| **模型参数** | 各层 $W$ 形状不同 | 线性层 $(d_{in}, d_{out})$ |
| **梯度** | 与对应参数形状相同 | $\frac{\partial L}{\partial W} \in \mathbb{R}^{d_{in} \times d_{out}}$ |
| **注意力** | $(N, H, L, L)$ | 批量、头数、序列×序列 |

> 参见 [[08-自动微分机制]]、[[03-损失函数]]、[[04-反向传播算法]]
