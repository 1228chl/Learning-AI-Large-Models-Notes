**上一级：** [02Pytorch](基础/02Pytorch.md)

**下一级：** [[]]

**标签：** #DL

---

# PyTorch 自动微分（Autograd）详解——超详细学习笔记

---

## 第一部分：自动微分概述与梯度基本计算

### 1. 什么是自动微分

自动微分（Automatic Differentiation，简称 AD）是 PyTorch 的核心功能之一，通过 `torch.autograd` 模块实现。它能够自动计算张量的梯度，无需手动推导和实现反向传播，极大简化了神经网络的训练过程。

在训练神经网络时，最常用的算法是**反向传播**（Backpropagation）。反向传播过程中，模型参数（权重和偏置）会根据**损失函数关于该参数的梯度**进行调整。手动计算这些梯度对于复杂网络几乎不可行，而 PyTorch 的 `autograd` 模块能够自动完成这一任务。

**核心思想**：PyTorch 会记录所有对张量的操作，构建一个有向无环图（DAG）。当调用 `.backward()` 时，它会沿着这个图反向传播，自动计算每个需要梯度的张量的梯度，并将结果累加到该张量的 `.grad` 属性中。

---

### 2. 基本使用步骤

要实现自动微分，需要遵循以下步骤：

1. **创建需要梯度的张量**：设置 `requires_grad=True`。
2. **定义计算过程**：通过张量运算构建计算图。
3. **调用反向传播**：对标量结果（通常是损失值）调用 `.backward()`。
4. **访问梯度**：通过张量的 `.grad` 属性获取梯度。

---

### 3. 梯度基本计算示例

以下代码演示了如何对一个简单张量求导。

```python
import torch

# 1. 定义权重张量，并开启自动微分
w = torch.tensor([10, 20], requires_grad=True, dtype=torch.float)
print("权重 w:", w)  # tensor([10., 20.], requires_grad=True)

# 2. 定义损失函数（假设 loss = 2 * w^2）
loss = 2 * w ** 2
print("loss (每个元素):", loss)  # tensor([200., 800.], grad_fn=<MulBackward0>)

# 注意：loss 目前是一个向量（两个元素）。PyTorch 的 backward() 要求被求导的对象是标量。
# 因此我们需要对 loss 求和，得到一个标量。
loss_sum = loss.sum()
print("loss_sum (标量):", loss_sum)  # tensor(1000., grad_fn=<SumBackward0>)

# 3. 反向传播，计算梯度
loss_sum.backward()

# 4. 查看梯度
print("w 的梯度:", w.grad)  # tensor([40., 80.])
```

**梯度推导验证**：

- 对于 `loss = 2 * w^2`，导数 `dloss/dw = 4 * w`。
- 当 `w = 10` 时，梯度为 `40`；当 `w = 20` 时，梯度为 `80`。与计算结果一致。

---

### 4. 梯度累加与手动清零

**重要特性**：`.grad` 属性会**累加**多次反向传播的梯度，而不是覆盖。这在某些需要累积梯度的场景中很有用（如梯度累积），但在常规训练中，我们需要在每次迭代前手动清零梯度。

```python
# 示例：多次反向传播导致梯度累加
w = torch.tensor([10.], requires_grad=True)
loss1 = w ** 2
loss1.backward()
print("第一次 backward 后梯度:", w.grad)  # tensor([20.])

loss2 = 2 * w
loss2.backward()
print("第二次 backward 后梯度:", w.grad)  # tensor([22.]) = 20 + 2
```

**梯度清零方法**：

- 使用 `w.grad.zero_()` 或 `w.grad = None`。
- 更常见的是在优化器中使用 `optimizer.zero_grad()`。

```python
# 清零梯度
w.grad.zero_()
print("清零后梯度:", w.grad)  # tensor([0.])
```

---

### 5. 使用梯度更新参数（手动实现）

在得到梯度后，可以手动更新权重参数。梯度下降更新公式为：

$$
w_{\text{new}} = w_{\text{old}} - \eta \cdot \frac{\partial L}{\partial w}
$$

其中 $\eta$ 是学习率。

```python
learning_rate = 0.01

# 更新权重（注意：需要操作 .data 或使用 with torch.no_grad() 以避免构建新的计算图）
w.data = w.data - learning_rate * w.grad
print("更新后的 w:", w.data)
```

**注意事项**：

- 直接修改 `w.data` 不会影响 `requires_grad` 状态，但会破坏计算图的历史。通常建议使用 `with torch.no_grad():` 上下文管理器。
- 实际工程中，我们通常使用 `torch.optim` 中的优化器（如 SGD、Adam）来自动管理参数更新。

---

## 第二部分：完整的自动微分示例（更新权重 w 和偏置 b）

### 1. 场景描述

假设我们有一个简单的线性模型：

$$
z = X \cdot W + b
$$

其中：

- `X` 是输入数据，形状 `(2, 5)`（2 个样本，每个样本 5 个特征）。
- `W` 是权重矩阵，形状 `(5, 3)`（5 输入 → 3 输出）。
- `b` 是偏置向量，形状 `(3,)`。
- `z` 是模型输出，形状 `(2, 3)`。

我们有一个目标输出 `y`（形状 `(2, 3)`），使用均方误差（MSE）作为损失函数。通过自动微分计算 `W` 和 `b` 的梯度，用于后续参数更新。

---

### 2. 完整代码实现

```python
import torch

# 1. 准备训练数据
x = torch.ones(2, 5)          # 输入：2个样本，每个样本5个特征，全1
y = torch.zeros(2, 3)         # 目标：2个样本，每个样本3个输出，全0

# 2. 初始化参数（需要梯度）
w = torch.randn(5, 3, requires_grad=True)   # 权重矩阵，随机初始化
b = torch.randn(3, requires_grad=True)      # 偏置向量，随机初始化

print("初始 w:\n", w)
print("初始 b:\n", b)

# 3. 定义损失函数（MSE 损失）
loss_fn = torch.nn.MSELoss()

# 4. 前向传播：计算预测值 z = x @ w + b
z = x.matmul(w) + b   # x.shape (2,5), w.shape (5,3) -> z.shape (2,3)
print("预测值 z:\n", z)

# 5. 计算损失值（标量）
loss = loss_fn(z, y)
print("损失值 loss:", loss)

# 6. 反向传播，计算梯度
loss.backward()   # 因为 loss 是一个标量，可以直接 backward

# 7. 查看梯度
print("w 的梯度:\n", w.grad)
print("b 的梯度:\n", b.grad)
```

**输出示例**（由于随机初始化，具体数值会变化）：

```python
初始 w:
 tensor([[-0.1234,  0.5678, -0.9012],
         [ 0.3456, -0.7890,  0.1234],
         ... ], requires_grad=True)
初始 b:
 tensor([-0.4567,  0.7891, -0.2345], requires_grad=True)
预测值 z:
 tensor([[...]], grad_fn=<AddBackward0>)
损失值 loss: tensor(2.3456, grad_fn=<MseLossBackward0>)
w 的梯度:
 tensor([[...]])
b 的梯度:
 tensor([...])
```

---

### 3. 手动更新参数（带梯度清零）

在实际训练中，我们通常迭代多次。每次迭代需要：

- 计算损失。
- 反向传播。
- 更新参数。
- **清零梯度**，避免累积。

```python
learning_rate = 0.01

# 模拟一个训练步骤
loss = loss_fn(z, y)
loss.backward()

# 手动更新参数（注意：使用 torch.no_grad() 避免构建计算图）
with torch.no_grad():
    w -= learning_rate * w.grad
    b -= learning_rate * b.grad

# 清零梯度
w.grad.zero_()
b.grad.zero_()
```

---

### 4. 使用优化器（推荐方式）

实际开发中，几乎不会手动更新参数，而是使用 `torch.optim` 中的优化器。

```python
import torch.optim as optim

# 定义优化器
optimizer = optim.SGD([w, b], lr=learning_rate)

# 训练循环中的标准步骤
loss = loss_fn(z, y)
optimizer.zero_grad()   # 清零所有参数的梯度
loss.backward()         # 反向传播
optimizer.step()        # 更新参数
```

---

### 5. 对 backward() 的深入理解

-  `backward()` **只能对标量张量调用**。如果 `loss` 是向量，需要先求和或求均值，得到标量后再调用。
- 如果必须对向量调用，可以传递一个与张量同形状的 `gradient` 参数作为初始梯度。
- `loss.backward()` 会计算 `loss` 对所有 `requires_grad=True` 的张量的梯度，并累加到它们的 `.grad` 属性中。

```python
# 向量 backward 示例（不常用）
z = torch.tensor([1.0, 2.0, 3.0], requires_grad=True)
loss_vec = z ** 2
# loss_vec.backward()  # 会报错！需要传入 gradient 参数
loss_vec.backward(torch.tensor([1.0, 1.0, 1.0]))   # 对每个分量分别求导
print(z.grad)  # tensor([2., 4., 6.])
```

---

## 第三部分：常见问题与注意事项总结

### 1. 核心要点速查表

| 概念 | 说明 |
|------|------|
| `requires_grad=True` | 张量需要被跟踪计算图，用于自动微分 |
| `.grad` | 存储梯度值，多次反向传播会累加 |
| `.backward()` | 计算当前张量对所有可导张量的梯度 |
| `.detach()` | 返回一个与当前张量共享数据但不需要梯度的新张量，从计算图中分离 |
| `with torch.no_grad():` | 临时禁用梯度计算，用于推理或参数更新 |
| `.zero_()` | 梯度清零方法 |

---

### 2. 常见陷阱与解决方案

1. **梯度累加导致数值错误**：
   - 问题：每次 `backward()` 后梯度会累加。
   - 解决：每次迭代前调用 `optimizer.zero_grad()` 或手动 `w.grad.zero_()`。

2. **对非标量调用 backward() 报错**：
   - 问题：`loss` 不是标量时直接 `backward()` 会报错。
   - 解决：使用 `loss.sum().backward()` 或 `loss.mean().backward()`，或者传入 `gradient` 参数。

3. **在更新参数时误构建计算图**：
   - 问题：直接使用 `w = w - lr * w.grad` 会创建新的计算图，导致内存泄漏。
   - 解决：使用 `with torch.no_grad(): w -= lr * w.grad` 或操作 `.data`。

4. **重复使用张量时未清零梯度**：
   - 问题：同一个张量在多次 `backward` 后梯度累积。
   - 解决：在每次反向传播前清零梯度。

5. **在不需梯度的张量上设置 requires_grad=True 浪费内存**：
   - 建议：仅对需要优化的参数（如模型权重）开启自动微分；输入数据、中间计算结果通常不需要梯度。

---

### 3. 完整训练循环模板

```python
import torch
import torch.nn as nn
import torch.optim as optim

# 模型、数据、损失函数、优化器定义...
model = nn.Linear(5, 3)
criterion = nn.MSELoss()
optimizer = optim.SGD(model.parameters(), lr=0.01)

# 训练循环
for epoch in range(num_epochs):
    # 前向传播
    outputs = model(x)
    loss = criterion(outputs, y)
    
    # 反向传播与优化
    optimizer.zero_grad()   # 清零梯度
    loss.backward()         # 自动微分
    optimizer.step()        # 更新参数
    
    if epoch % 10 == 0:
        print(f'Epoch {epoch}, Loss: {loss.item()}')
```

---

### 4. 自动微分的高级特性

- **梯度钩子（Hook）**：可以使用 `register_hook` 在梯度计算过程中插入自定义操作。
- **创建自定义自动微分函数**：继承 `torch.autograd.Function` 并实现 `forward` 和 `backward` 静态方法。
- **计算图保留**：默认情况下，`backward()` 后会释放中间节点的计算图以节省内存。如果需要多次反向传播，可以设置 `retain_graph=True`。

---

## 总结

本笔记详细讲解了 PyTorch 自动微分模块 `torch.autograd` 的核心概念和使用方法，包括：

- 如何开启梯度跟踪（`requires_grad=True`）
- 如何计算梯度（`backward()`）并访问（`.grad`）
- 梯度累加特性及清零方法
- 手动参数更新与优化器使用
- 完整示例：线性回归的自动微分过程
- 常见问题与最佳实践

---
