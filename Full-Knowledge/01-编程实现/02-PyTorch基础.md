---
tags: [编程/PyTorch/深度学习框架]
parent_moc: [[核心依赖链]]
aliases: [PyTorch, 张量, 自动微分]
layer: 层级1-编程实现
prerequisites: [NumPy]
successors: [神经网络, CNN, RNN, Transformer]
---

# 深度卡片：PyTorch基础

## L1：是什么（定义/公式/结构）

### PyTorch核心概念

| 概念 | 定义 | ML应用 |
|------|------|--------|
| Tensor | 多维数组（GPU加速） | 数据和参数的载体 |
| autograd | 自动微分 | 反向传播实现 |
| nn.Module | 神经网络基类 | 模型定义 |
| Optimizer | 优化器 | 参数更新 |
| DataLoader | 数据加载器 | 批量数据处理 |

### 张量核心属性

| 属性 | 说明 | 示例 |
|------|------|------|
| dtype | 数据类型 | torch.float32, torch.int64 |
| shape | 形状 | torch.Size([32, 128]) |
| device | 设备 | cpu 或 cuda:0 |
| requires_grad | 是否需要梯度 | True/False |

### 核心API

```python
# 张量创建
torch.tensor()           # 从数据创建
torch.zeros/ones/randn() # 特殊张量
torch.arange/linspace()  # 序列张量

# 数学运算
torch.mm()               # 矩阵乘法
torch.sum/mean/std()     # 归约运算
torch.softmax()          # softmax

# 自动微分
tensor.backward()        # 反向传播
tensor.grad              # 梯度
```

---

## L2：为什么（设计意图/解决什么问题）

### 为什么需要PyTorch？

**问题1：如何在GPU上加速计算？**

深度学习需要大量矩阵运算，GPU比CPU快10-100倍。PyTorch可以：
- 将张量移动到GPU：`tensor.to('cuda')`
- 在GPU上执行运算：自动加速
- 混合精度训练：FP16减少内存和计算

**问题2：如何自动计算梯度？**

手动实现反向传播容易出错。PyTorch的autograd可以：
- 自动构建计算图
- 自动计算梯度
- 支持动态计算图（Define-by-Run）

**问题3：如何快速构建模型？**

PyTorch提供：
- nn.Module：模型基类
- nn.Linear、nn.Conv2d等：预定义层
- nn.functional：函数式API

### PyTorch vs TensorFlow

| 特性 | PyTorch | TensorFlow |
|------|---------|------------|
| 计算图 | 动态（默认） | 静态（2.x支持动态） |
| 调试 | 容器易调试 | 相对复杂 |
| 学术界 | 主流 | 工业界主流 |
| 部署 | TorchScript | TF Serving、TF Lite |

---

## L3：怎么用（代码实现/调参/场景）

### 模型定义与训练

```python
import torch
import torch.nn as nn
import torch.optim as optim

# 定义模型
class Net(nn.Module):
    def __init__(self):
        super().__init__()
        self.fc1 = nn.Linear(784, 256)
        self.fc2 = nn.Linear(256, 10)
        self.relu = nn.ReLU()
    
    def forward(self, x):
        x = x.view(-1, 784)
        x = self.relu(self.fc1(x))
        x = self.fc2(x)
        return x

# 创建模型
model = Net()
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
model.to(device)

# 损失函数和优化器
criterion = nn.CrossEntropyLoss()
optimizer = optim.Adam(model.parameters(), lr=0.001)

# 训练循环
for epoch in range(10):
    for data, target in train_loader:
        data, target = data.to(device), target.to(device)
        
        optimizer.zero_grad()
        output = model(data)
        loss = criterion(output, target)
        loss.backward()
        optimizer.step()
```

---

## L4：坑在哪（边界条件/失效场景/常见误解）

### 常见误解

| 误解 | 正确理解 | 后果 |
|------|----------|------|
| "backward()会清零梯度" | 需要手动调用zero_grad() | 梯度累积 |
| "GPU总是更快" | 小数据量CPU可能更快 | 不必要的GPU开销 |

### 边界条件

**1. GPU内存不足**

大模型可能超出GPU内存：
- 原因：模型参数 + 中间激活值 + 梯度
- 解决：梯度检查点、混合精度、模型并行

**2. 数值不稳定**

- NaN/Inf：学习率太大、梯度爆炸
- 解决：学习率调度、梯度裁剪、混合精度

**3. 可复现性**

不同运行结果可能不同：
- 原因：随机种子、GPU并行
- 解决：设置随机种子、使用确定性算法

---

## 💼 面试追问树

### Q1（基础）：PyTorch的自动微分是如何工作的？

**回答要点**：
1. 构建计算图：前向传播时记录操作
2. 反向传播：从loss.backward()开始，沿计算图反向计算梯度
3. 梯度存储：存储在tensor.grad中
4. 清零梯度：optimizer.zero_grad()

### Q2（深挖）：PyTorch的动态计算图有什么优势？

**回答要点**：
1. 灵活性：每次前向传播可以不同
2. 调试友好：可以使用Python调试器
3. 控制流：支持if/for等动态控制流
4. 缺点：每次都要重新构建图，可能有性能开销

### Q3（边界）：如何解决GPU内存不足？

**回答要点**：
1. 梯度检查点：用计算换内存
2. 混合精度：FP16减少内存
3. 模型并行：分片到多个GPU
4. 数据并行：每个GPU处理不同batch

---

## 🔗 关联知识网络

**上游依赖**：[[NumPy]]

**下游应用**：
- [[神经网络]]：nn.Module定义模型
- [[CNN]]：nn.Conv2d定义卷积层
- [[RNN]]：nn.LSTM定义循环层
- [[Transformer]]：自注意力实现
- [[训练循环]]：完整的训练流程

**并列概念**：[[TensorFlow]], [[JAX]]
