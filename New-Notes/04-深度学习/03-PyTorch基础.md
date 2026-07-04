# PyTorch基础

**标签：** #PyTorch #框架

---

## 1. 什么是PyTorch

PyTorch是一个基于Python的深度学习框架，由Meta的AI研究团队开发。

**核心特点**：
- **动态计算图**：计算图在代码执行时动态构建，调试方便
- **Python优先**：API设计贴近NumPy，易于上手
- **GPU加速**：张量操作可以透明地在GPU上运行
- **自动微分**：通过`requires_grad`自动计算梯度

---

## 2. 张量（Tensor）基础

### 2.1 什么是张量

张量是PyTorch中的核心数据结构，本质上是一个元素类型相同的**多维数组**。

| 属性 | 说明 | 示例 |
|------|------|------|
| `dtype` | 数据类型 | `torch.float32`, `torch.int64` |
| `shape` | 形状 | `torch.Size([3, 4])` |
| `ndim` | 维度数 | 标量: 0, 向量: 1, 矩阵: 2 |
| `device` | 设备 | `cpu` 或 `cuda:0` |
| `requires_grad` | 是否需要梯度 | `True` 或 `False` |

### 2.2 张量创建方式

```python
import torch

# 从列表创建
t1 = torch.tensor([1, 2, 3])

# 从二维列表创建，指定数据类型
t2 = torch.tensor([[1, 2], [3, 4]], dtype=torch.float32)

# 创建全零张量
t3 = torch.zeros(3, 4)

# 创建全一张量
t4 = torch.ones(2, 3)

# 创建随机张量
t5 = torch.randn(3, 4)  # 标准正态分布
t6 = torch.rand(3, 4)   # [0, 1)均匀分布
```

---

## 3. 自动微分（Autograd）

```python
# 创建需要梯度的张量
x = torch.tensor([2.0, 3.0], requires_grad=True)
w = torch.tensor([1.0, 1.0], requires_grad=True)

# 前向传播
y = w * x  # 逐元素乘法
loss = y.sum()

# 反向传播
loss.backward()

# 查看梯度
print(x.grad)  # tensor([1., 1.])
print(w.grad)  # tensor([2., 3.])
```

---

## 4. GPU加速

```python
# 检查GPU是否可用
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

# 将张量移到GPU
tensor = tensor.to(device)

# 将模型移到GPU
model = model.to(device)
```
