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
x = torch.tensor([[1, 2], [3, 4]])         # 从Python嵌套列表直接创建2x2张量，自动推断数据类型

x = torch.zeros(3, 4)                       # 创建3行4列的全零张量，常用于初始化占位或偏置

x = torch.randn(2, 3)                       # 创建2x3的标准正态分布随机张量，用于权重随机初始化

x = torch.ones(2, 3, dtype=torch.float32)   # 创建2x3的全1张量，显式指定float32数据类型

# 设备管理
x_cpu = torch.tensor([1, 2])                # 在CPU上创建一维张量，数据默认驻留在CPU内存

x_gpu = x_cpu.cuda()                        # 将张量从CPU迁移到GPU显存，启用GPU加速后续计算

x_back = x_gpu.cpu()                        # 将张量从GPU显存移回CPU内存，便于与NumPy等CPU端库交互
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
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')  # 自动选择计算设备：有GPU则用cuda加速，否则回退到cpu

x = torch.randn(1000, 1000, device=device)                              # 直接在指定设备上创建1000x1000随机张量，省去手动搬运步骤

# 数据类型
x_f32 = torch.tensor([1.0], dtype=torch.float32)   # 创建float32张量，此为PyTorch默认浮点精度类型

x_f16 = x_f32.half()                                 # 转换为半精度float16，用于混合精度训练以节省显存并加速计算

x_i64 = torch.tensor([1], dtype=torch.long)          # 创建int64长整型张量，分类任务标签通常使用该类型
```

## ML 中的张量

| 应用场景 | 张量形状 | 说明 |
|----------|----------|------|
| **图像数据** | $(N, C, H, W)$ | 批量、通道、高、宽 |
| **文本数据** | $(N, L)$ 或 $(N, L, d)$ | 批量、序列长度、嵌入维度 |
| **模型参数** | 各层 $W$ 形状不同 | 线性层 $(d_{in}, d_{out})$ |
| **梯度** | 与对应参数形状相同 | $\frac{\partial L}{\partial W} \in \mathbb{R}^{d_{in} \times d_{out}}$ |
| **注意力** | $(N, H, L, L)$ | 批量、头数、序列×序列 |

## 面试追问

**Q1（基础）**：PyTorch 张量和 NumPy ndarray 的主要区别有哪些？

**回答要点**：PyTorch Tensor 支持 GPU 加速（.cuda()），NumPy 仅 CPU；Tensor 集成自动微分（requires_grad），NumPy 无此功能；两者可互相转换（torch.from_numpy() / .numpy()），共享内存需注意同步。

**Q2（深挖）**：x.view() 和 x.reshape() 有什么区别？

**回答要点**：view() 要求张量在内存中连续（contiguous），否则需先调用 .contiguous()；reshape() 自动处理连续性，在不连续时返回副本而非视图；用 view() 更高效（无拷贝），但在 Transpose 等操作后需注意连续性。

**Q3（实战）**：训练时遇到 "CUDA out of memory"，你会从哪些方面优化？

**回答要点**：减小 batch size（最直接）；用 torch.no_grad() 禁用推理时的梯度计算；使用梯度累积模拟大 batch；检查是否有未释放的张量引用，用 del 及时释放；开启混合精度训练（AMP）减少显存占用。

**Q4（边界）**：张量广播机制在什么情况下会导致隐式 bug 或性能问题？

**回答要点**：广播在维度不匹配时自动扩展，可能导致意外的大张量创建（如 (N,1) 与 (1,M) 广播为 (N,M)）；大维度广播显著增加显存和计算开销；调试时用 .shape 显式检查，避免隐式广播掩盖形状不匹配的错误。

## 参考引用
- 需要理解自动微分机制的相关知识，参见 [自动微分机制](./08-自动微分机制.md)
- 需要理解损失函数的相关知识，参见 [损失函数](./03-损失函数.md)
- 需要理解反向传播算法的相关知识，参见 [反向传播算法](./04-反向传播算法.md)