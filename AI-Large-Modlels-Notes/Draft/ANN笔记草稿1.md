
# 人工神经网络（ANN）详解——超详细学习笔记

本笔记基于人工神经网络的核心知识体系，系统讲解神经网络的基本概念、激活函数、参数初始化、损失函数、优化方法、正则化策略以及一个完整的分类案例。内容涵盖原理、数学公式、代码示例和调优建议。

---

## 第一部分：神经网络概述与基本结构

### 1. 什么是人工神经网络

人工神经网络（Artificial Neural Network，ANN）是一种模仿生物神经网络结构和功能的计算模型。生物大脑由大量神经元相互连接而成，每个神经元接收来自树突的输入信号，在细胞体内进行加权积累，当电位超过阈值时，通过轴突输出电信号。

人工神经网络借鉴了这一机制，将输入信号进行加权求和，再经过激活函数产生输出，从而模拟复杂的非线性映射关系。

---

### 2. 神经网络的核心概念

#### 2.1 神经元（Neuron）

神经网络的基本单元是神经元。一个神经元接收多个输入 $x_1, x_2, ..., x_n$ ，每个输入对应一个权重 $w_1, w_2, ..., w_n$ ，还有一个偏置项 $b$ 。神经元首先计算加权和：

$$
z = \sum_{i=1}^{n} w_i x_i + b = \mathbf{w}^T \mathbf{x} + b
$$

然后将 $z$ 通过一个**激活函数** $f$ 得到输出：

$$
a = f(z)
$$

这个输出 $a$ 会传递给下一层的神经元。

---

#### 2.2 神经网络的结构

一个典型的前馈全连接神经网络包含三层：

- **输入层**：接收原始数据特征，每个特征对应一个神经元。输入层不进行任何计算，仅传递数据。
- **隐藏层**：位于输入层和输出层之间，可以有多个。隐藏层的神经元对输入进行加权求和并应用激活函数。网络的“深度”通常指隐藏层的数量。
- **输出层**：产生最终的预测结果。对于回归任务，输出层通常没有激活函数（或使用恒等激活）；对于二分类，输出层常用 Sigmoid；对于多分类，输出层常用 Softmax。

**全连接（Fully Connected）** 的含义：第 $N$ 层的每个神经元与第 $N-1$ 层的所有神经元相连。同一层内的神经元之间没有连接。

---

#### 2.3 内部状态值与激活值

在神经网络的前向传播过程中，每个神经元会产生两个关键值：

- **内部状态值** $z = \mathbf{w}^T \mathbf{x} + b$ ：加权求和结果。
- **激活值** $a = f(z)$ ：经过激活函数后的输出。

在反向传播过程中，还会计算梯度：

- 激活值的梯度 $\frac{\partial L}{\partial a}$
- 内部状态值的梯度 $\frac{\partial L}{\partial z}$

---

#### 2.4 神经网络的参数量计算

对于全连接层，如果输入维度为 $d_{in}$ ，输出维度为 $d_{out}$ ，则该层的参数量为：

$$
\text{参数个数} = d_{in} \times d_{out} \quad (\text{权重}) + d_{out} \quad (\text{偏置})
$$

例如：输入层 20 个神经元，第一隐藏层 128 个神经元，则第一隐藏层的参数量 = $20 \times 128 + 128 = 2688$ 。

---

### 3. 神经网络的前向传播与反向传播简述

- **前向传播**：数据从输入层流向输出层，逐层计算 $z$ 和 $a$ ，最终得到预测值。
- **反向传播**：根据损失函数计算输出层的误差，然后利用链式法则逐层向后传播梯度，计算每个权重和偏置对损失的贡献，用于参数更新。

PyTorch 的 `autograd` 模块自动完成反向传播，无需手动推导。

---

## 第二部分：激活函数详解

激活函数是神经网络中引入**非线性因素**的关键组件。如果没有激活函数，无论网络有多少层，最终都等价于一个线性模型，无法拟合复杂的非线性关系。激活函数通过对每层的输出进行非线性变换，使神经网络能够逼近任意函数。

---

### 1. 激活函数的作用

- **引入非线性**：让神经网络具备强大的表达能力，可以拟合曲线、曲面等复杂函数。
- **控制输出范围**：某些激活函数（如 Sigmoid、Tanh）可以将输出压缩到固定区间，便于后续处理。
- **影响梯度流动**：不同激活函数的导数特性会影响反向传播时的梯度大小，从而影响训练效率。

---

### 2. 常见激活函数详解

#### 2.1 Sigmoid 激活函数

**公式**：

$$
\sigma(x) = \frac{1}{1 + e^{-x}}
$$

**导数**：

$$
\sigma'(x) = \sigma(x) \cdot (1 - \sigma(x))
$$

**函数图像特点**：

- 输出范围：`(0, 1)`，可以理解为概率。
- 光滑且连续，处处可导。
- 以 `(0, 0.5)` 为中心对称。

**代码示例与绘图**：

```python
import torch
import matplotlib.pyplot as plt

# 创建画布
_, axes = plt.subplots(1, 2, figsize=(12, 4))

# 函数图像
x = torch.linspace(-20, 20, 1000)
y = torch.sigmoid(x)
axes[0].plot(x, y)
axes[0].grid()
axes[0].set_title('Sigmoid 函数图像')

# 导数图像
x = torch.linspace(-20, 20, 1000, requires_grad=True)
torch.sigmoid(x).sum().backward()
axes[1].plot(x.detach(), x.grad)
axes[1].grid()
axes[1].set_title('Sigmoid 导数图像')

plt.show()
```

**优点**：

- 平滑、易于求导。
- 输出在 `(0,1)` 之间，适合作为概率输出（如二分类的输出层）。

**缺点**：

- **梯度饱和**：当输入绝对值很大时，梯度接近于 0，导致参数更新极慢（梯度消失）。
- 输出不是零中心（zero-centered），导致梯度更新效率低。
- 指数运算计算量较大。

**适用场景**：二分类问题的输出层（配合 `BCELoss`）。

---

#### 2.2 Tanh 激活函数

**公式**：

$$
\tanh(x) = \frac{e^x - e^{-x}}{e^x + e^{-x}}
$$

**导数**：

$$
\tanh'(x) = 1 - \tanh^2(x)
$$

**函数图像特点**：

- 输出范围：`(-1, 1)`，**零中心**。
- 形状与 Sigmoid 相似，但输出包含负数。

**代码示例与绘图**：

```python
_, axes = plt.subplots(1, 2, figsize=(12, 4))

x = torch.linspace(-20, 20, 1000)
y = torch.tanh(x)
axes[0].plot(x, y)
axes[0].grid()
axes[0].set_title('Tanh 函数图像')

x = torch.linspace(-20, 20, 1000, requires_grad=True)
torch.tanh(x).sum().backward()
axes[1].plot(x.detach(), x.grad)
axes[1].grid()
axes[1].set_title('Tanh 导数图像')

plt.show()
```

**优点**：

- 输出零中心，有利于梯度下降的收敛速度。
- 比 Sigmoid 的梯度饱和区域稍宽。

**缺点**：

- 仍存在梯度饱和问题（当输入绝对值较大时，梯度接近 0）。
- 计算量稍大（指数运算）。

**适用场景**：隐藏层（但通常不如 ReLU 常用），尤其是需要零中心输出的场合。

---

#### 2.3 ReLU 激活函数（Rectified Linear Unit）

**公式**：

$$
\text{ReLU}(x) = \max(0, x)
$$

**导数**：

$$
\text{ReLU}'(x) = \begin{cases} 1 & x > 0 \\ 0 & x \leq 0 \end{cases}
$$

**函数图像特点**：

- 负半轴输出为 0，正半轴线性输出。
- 在 `x=0` 处不可导（但在实现中通常取左导数或右导数）。

**代码示例与绘图**：

```python
_, axes = plt.subplots(1, 2, figsize=(12, 4))

x = torch.linspace(-20, 20, 1000)
y = torch.relu(x)
axes[0].plot(x, y)
axes[0].grid()
axes[0].set_title('ReLU 函数图像')

x = torch.linspace(-20, 20, 1000, requires_grad=True)
torch.relu(x).sum().backward()
axes[1].plot(x.detach(), x.grad)
axes[1].grid()
axes[1].set_title('ReLU 导数图像')

plt.show()
```

**优点**：

- **计算简单**：只需比较和取最大值，没有指数运算。
- **缓解梯度消失**：正半轴梯度恒为 1。
- **稀疏激活**：负半轴输出为 0，使部分神经元不激活，增加模型稀疏性。
- 实际训练中收敛速度快。

**缺点**：

- **Dead ReLU 问题**：如果某个神经元的所有输入都是负数，那么它的梯度为 0，参数永远不会更新，导致神经元“死亡”。通常由学习率过高或权重初始化不当引起。
- 输出不是零中心。

**改进版本**（Leaky ReLU / PReLU / ELU）：

- **Leaky ReLU**：负半轴有一个小的正斜率，如 `LeakyReLU(x) = max(0.01x, x)`，解决 Dead ReLU。
- **PReLU**：负半轴的斜率作为可学习参数。
- **ELU**：负半轴使用指数函数，输出接近零中心。

**适用场景**：**隐藏层的默认首选**，除非有特殊问题。

---

#### 2.4 Softmax 激活函数

Softmax 通常用于**多分类**任务的输出层，将多个类别的 logits（原始得分）转换为概率分布。

**公式**：

$$
\text{Softmax}(z_i) = \frac{e^{z_i}}{\sum_{j=1}^{C} e^{z_j}}, \quad i = 1, 2, ..., C
$$

其中 $C$ 是类别总数。

**特点**：

- 输出值在 `(0, 1)` 之间。
- 所有类别的输出概率之和为 1。
- 保持原有大小顺序（单调递增）。

**代码示例**：

```python
scores = torch.tensor([0.2, 0.02, 0.15, 0.15, 1.3, 0.5, 0.06, 1.1, 0.05, 3.75])
probabilities = torch.softmax(scores, dim=0)
print(probabilities)
# tensor([0.0212, 0.0177, 0.0202, 0.0202, 0.0638, 0.0287, 0.0185, 0.0522, 0.0183, 0.7392])
```

**优点**：

- 输出具有概率解释。
- 与交叉熵损失结合时梯度形式简单。

**缺点**：

- 计算涉及指数，可能产生数值上溢（可用减去最大值稳定化）。
- 对异常值敏感。

**适用场景**：多分类问题的输出层。

---

### 3. 其他常见激活函数（简要）

| 激活函数 | 公式 | 特点 |
|----------|------|------|
| **Identity**（恒等） | $f(x)=x$ | 用于回归任务的输出层 |
| **Leaky ReLU** | $f(x)=\max(0.01 x, x)$ | 缓解 Dead ReLU |
| **ELU** | $f(x)=x$ if $x>0$ , else $\alpha(e^x-1)$ | 接近零中心，负值饱和 |
| **Swish** | $f(x)=x \cdot \text{sigmoid}(x)$ | 谷歌提出，有时优于 ReLU |
| **GELU** | $f(x)=x \cdot \Phi(x)$ | Transformer 中常用 |

---

### 4. 激活函数选择指南

| 网络位置 | 推荐激活函数 | 备注 |
|----------|--------------|------|
| **隐藏层** | ReLU（首选） | 速度快，效果好；若出现 Dead ReLU，尝试 Leaky ReLU / PReLU |
| **隐藏层**（备选） | Tanh | 输出零中心，但存在饱和问题 |
| **隐藏层**（不推荐） | Sigmoid | 梯度消失严重，训练慢 |
| **输出层（二分类）** | Sigmoid | 输出为单个概率值 |
| **输出层（多分类）** | Softmax | 输出为概率分布 |
| **输出层（多标签分类）** | Sigmoid（每个输出独立） | 每个标签独立二分类 |
| **输出层（回归）** | Identity（无激活） | 直接输出数值 |

---

## 第三部分：参数初始化方法

参数初始化是神经网络训练前的关键步骤。良好的初始化可以加速收敛、避免梯度消失/爆炸，而不当的初始化则可能导致模型难以训练。PyTorch 的 `torch.nn.init` 模块提供了多种初始化方法。

---

### 1. 为什么参数初始化很重要？

在训练开始前，我们需要为模型的权重 $W$ 和偏置 $b$ 赋予初始值。如果初始化不当，可能出现：

- **梯度消失**：权重过小，激活值逐渐趋近于 0，反向传播时梯度指数级衰减。
- **梯度爆炸**：权重过大，激活值和梯度指数级增长，导致数值溢出。
- **对称性问题**：如果同一层的所有神经元初始化为相同值，它们会学习到相同的特征，丧失表达多样性。

因此，好的初始化应满足：

- 各层的激活值方差保持稳定，避免过小或过大。
- 打破对称性（通常使用随机初始化）。

---

### 2. 常见的初始化方法

#### 2.1 均匀分布初始化（Uniform Initialization）

从指定区间 `[a, b]` 的均匀分布中随机采样。默认区间为 `(0, 1)`，但通常需要根据输入维度调整范围。

**代码示例**：

```python
import torch
import torch.nn as nn

linear = nn.Linear(5, 3)
nn.init.uniform_(linear.weight, a=-0.1, b=0.1)  # 从 [-0.1, 0.1] 均匀分布采样
print(linear.weight)
```

**常见变体**：在 Xavier 和 Kaiming 初始化中也包含均匀分布版本。

---

#### 2.2 正态分布初始化（Normal Initialization）

从指定均值和标准差的正态分布中随机采样。常用的简单版本是均值为 0、标准差为 0.01 或 0.001 的分布。

**代码示例**：

```python
nn.init.normal_(linear.weight, mean=0.0, std=0.01)
```

**问题**：对于深层网络，固定标准差可能导致梯度消失或爆炸。

---

#### 2.3 常数初始化（Constant Initialization）

所有权重初始化为同一个常数。通常用于偏置的初始化（例如将偏置初始化为 0 或小正数）。

- **全 0 初始化**：`nn.init.zeros_(linear.weight)`
- **全 1 初始化**：`nn.init.ones_(linear.weight)`
- **固定值初始化**：`nn.init.constant_(linear.weight, 0.5)`

**注意**：**不能将权重全部初始化为相同值**，否则同一层的神经元将无法学习到不同的特征。常数初始化通常只用于偏置或特定层（如 BN 的 `weight` 初始化为 1，`bias` 初始化为 0）。

---

#### 2.4 Xavier / Glorot 初始化

Xavier 初始化（由 Glorot 和 Bengio 在 2010 年提出）**适用于 Sigmoid 和 Tanh 等饱和激活函数**。其目标是使前向传播和反向传播时，各层激活值的方差保持一致。

**原理**：假设输入均值为 0，希望输出的方差与输入的方差相等。推导得出权重应从以下分布中采样：

- **正态分布**： $W \sim \mathcal{N}(0, \text{std}^2)$ ，其中 $\text{std} = \sqrt{\frac{2}{\text{fan\_in} + \text{fan\_out}}}$
- **均匀分布**： $W \sim U(-\text{limit}, \text{limit})$ ，其中 $\text{limit} = \sqrt{\frac{6}{\text{fan\_in} + \text{fan\_out}}}$

其中：

- `fan_in`：该层输入神经元的个数
- `fan_out`：该层输出神经元的个数

**代码示例**：

```python
# 正态分布 Xavier
nn.init.xavier_normal_(linear.weight)

# 均匀分布 Xavier
nn.init.xavier_uniform_(linear.weight)
```

**适用激活函数**：Sigmoid、Tanh 等以 0 为中心且饱和的激活函数。

---

#### 2.5 Kaiming / He 初始化

Kaiming 初始化（由何恺明等人在 2015 年提出）**专为 ReLU 及其变体（Leaky ReLU、PReLU）设计**。由于 ReLU 会将一半的神经元输出置为 0，导致方差减半，因此需要调整方差尺度。

**公式**（对于 ReLU）：

- 正态分布： $W \sim \mathcal{N}(0, \text{std}^2)$ ，其中 $\text{std} = \sqrt{\frac{2}{\text{fan\_in}}}$
- 均匀分布： $W \sim U(-\text{limit}, \text{limit})$ ，其中 $\text{limit} = \sqrt{\frac{6}{\text{fan\_in}}}$

**代码示例**：

```python
# Kaiming 正态分布（He 初始化）
nn.init.kaiming_normal_(linear.weight, mode='fan_in', nonlinearity='relu')

# Kaiming 均匀分布
nn.init.kaiming_uniform_(linear.weight, mode='fan_in', nonlinearity='relu')
```

- `mode='fan_in'`：保持前向传播的方差稳定（推荐）。
- `mode='fan_out'`：保持反向传播的方差稳定。
- `nonlinearity`：可选 `'relu'` 或 `'leaky_relu'`，用于调整增益。

**适用激活函数**：ReLU、Leaky ReLU、PReLU 等。

---

### 3. 偏置的初始化

偏置通常初始化为 0 或小常数。在分类任务的输出层，偏置可初始化为某一类别的先验概率的对数（不常用）。

```python
# 偏置初始化为 0
nn.init.zeros_(linear.bias)

# 偏置初始化为小常数（如 0.01）
nn.init.constant_(linear.bias, 0.01)
```

---

### 4. 初始化方法的选择策略

| 激活函数 | 推荐初始化方法 |
|----------|----------------|
| Sigmoid / Tanh | Xavier (Glorot) 初始化 |
| ReLU / Leaky ReLU / PReLU | Kaiming (He) 初始化 |
| 线性层（无激活） | Xavier 或 Kaiming 均可 |
| 深层网络 | 使用 Xavier / Kaiming，避免简单高斯初始化（如 N(0,0.01)） |
| 迁移学习（微调） | 使用预训练模型的权重，不需要随机初始化 |

**PyTorch 默认初始化**：大多数层（如 `nn.Linear`）默认使用 Kaiming 均匀分布初始化，适合 ReLU。

---

### 5. 完整示例：自定义网络的参数初始化

以下示例定义了一个两层网络，分别对不同的隐藏层使用不同的初始化方法：

```python
import torch
import torch.nn as nn

class MyModel(nn.Module):
    def __init__(self, input_dim=20, hidden_dim=128, output_dim=4):
        super().__init__()
        self.fc1 = nn.Linear(input_dim, hidden_dim)   # 第一隐藏层
        self.fc2 = nn.Linear(hidden_dim, hidden_dim)  # 第二隐藏层
        self.out = nn.Linear(hidden_dim, output_dim)  # 输出层
        
        # 自定义初始化
        self._initialize_weights()
    
    def _initialize_weights(self):
        # 第一层：Xavier 均匀分布（假设使用 Tanh）
        nn.init.xavier_uniform_(self.fc1.weight)
        nn.init.zeros_(self.fc1.bias)
        
        # 第二层：Kaiming 正态分布（使用 ReLU）
        nn.init.kaiming_normal_(self.fc2.weight, mode='fan_in', nonlinearity='relu')
        nn.init.zeros_(self.fc2.bias)
        
        # 输出层：简单的正态分布（小标准差）
        nn.init.normal_(self.out.weight, mean=0.0, std=0.01)
        nn.init.zeros_(self.out.bias)
    
    def forward(self, x):
        x = torch.tanh(self.fc1(x))   # 第一层用 Tanh
        x = torch.relu(self.fc2(x))   # 第二层用 ReLU
        x = self.out(x)               # 输出层无激活（后续加 Softmax）
        return x

model = MyModel()
```

---

### 6. 初始化方法总结表

| 初始化方法 | 分布 | 公式（方差/范围） | 适用激活函数 |
|------------|------|------------------|--------------|
| **Xavier 正态** | 正态 | std = sqrt(2/(fan_in+fan_out)) | Sigmoid, Tanh |
| **Xavier 均匀** | 均匀 | limit = sqrt(6/(fan_in+fan_out)) | Sigmoid, Tanh |
| **Kaiming 正态** | 正态 | std = sqrt(2/fan_in) | ReLU, Leaky ReLU |
| **Kaiming 均匀** | 均匀 | limit = sqrt(6/fan_in) | ReLU, Leaky ReLU |
| **普通正态** | 正态 | 固定 std（如 0.01） | 浅层网络 |
| **常数** | 恒定 | 固定值 | 偏置，或特殊情况 |

---

## 第四部分：损失函数详解

损失函数（Loss Function）用于衡量模型预测值与真实值之间的差异。训练神经网络的过程就是通过优化算法不断减小损失函数值的过程。不同任务类型（分类、回归）需要使用不同的损失函数。

---

### 1. 损失函数概述

在深度学习中，损失函数有时也被称为代价函数（Cost Function）或目标函数（Objective Function，有时包含正则化项）。常见的命名方式包括：

- **损失（Loss）**：单个样本的误差。
- **代价（Cost）**：整个训练集上的平均损失。
- **目标（Objective）**：优化问题的最终函数，通常为代价 + 正则化项。

PyTorch 的 `torch.nn` 模块提供了丰富的损失函数实现，它们都继承自 `nn.Module`。

---

### 2. 分类任务损失函数

#### 2.1 多分类交叉熵损失（Cross-Entropy Loss）

多分类任务中，输出层通常使用 Softmax 将 logits 转换为概率分布，然后使用交叉熵衡量真实分布与预测分布的差异。

**数学公式**：

对于单个样本，真实标签为 $y$ （类别索引，非 one-hot），预测的 logits 为 $\hat{y}_1, \hat{y}_2, ..., \hat{y}_C$ ，则损失为：

$$
\text{Loss}(y, \hat{y}) = -\log\left( \frac{e^{\hat{y}_y}}{\sum_{j=1}^{C} e^{\hat{y}_j}} \right) = -\hat{y}_y + \log\left(\sum_{j=1}^{C} e^{\hat{y}_j}\right)
$$

实际上，`nn.CrossEntropyLoss` 将 **LogSoftmax** 和 **Negative Log-Likelihood (NLLLoss)** 合并为一个数值稳定的实现。

**重要特性**：

- 输入是 **未经 Softmax 的原始 logits**（形状 `(N, C)`），而不是概率。
- 真实标签是 **类别索引**（形状 `(N,)`），类型为 `torch.int64`，取值范围 `[0, C-1]`。
- 输出为标量损失（如果 `reduction='mean'`）或每个样本的损失向量。

**代码示例**：

```python
import torch
import torch.nn as nn

# 示例：3 个样本，4 个类别
logits = torch.tensor([[0.2, 0.6, 0.1, 0.1],
                       [0.8, 0.1, 0.05, 0.05],
                       [0.1, 0.2, 0.5, 0.2]], requires_grad=True)
targets = torch.tensor([1, 0, 2], dtype=torch.int64)  # 真实类别索引

criterion = nn.CrossEntropyLoss()  # reduction='mean' 默认
loss = criterion(logits, targets)
print(loss.item())  # 输出标量损失

# 手动验证（第一个样本）：
# softmax = exp(0.6)/sum(...) ≈ 0.42, loss1 = -log(0.42) ≈ 0.87
```

**注意事项**：

- 输入 logits 可以是任意实数，内部会进行数值稳定化处理（减去最大值）。
- 对于高维度输入（如图片分割），标签可以是形状 `(N, H, W)`，logits 形状 `(N, C, H, W)`，损失函数会自动处理。
- 多分类问题中，不需要手动对输出做 Softmax，直接使用 `CrossEntropyLoss` 即可。

---

#### 2.2 二分类交叉熵损失（Binary Cross-Entropy Loss）

对于二分类问题（输出只有一个概率值），使用 `nn.BCELoss`。该损失函数要求**输入是经过 Sigmoid 的概率值**（范围 `[0,1]`）。

**数学公式**：

$$
\text{BCE}(y, \hat{y}) = -[y \cdot \log(\hat{y}) + (1-y) \cdot \log(1-\hat{y})]
$$

其中 $y$ 为真实标签（0 或 1）， $\hat{y}$ 为预测概率。

**代码示例**：

```python
# 预测概率（经过 Sigmoid），形状 (N,)
probabilities = torch.tensor([0.6901, 0.5459], requires_grad=True)
targets = torch.tensor([0., 1.], dtype=torch.float32)

criterion = nn.BCELoss()
loss = criterion(probabilities, targets)
print(loss.item())
```

**数值稳定的版本**：`nn.BCEWithLogitsLoss` 将 Sigmoid 和 BCE 合并，并在内部进行数值稳定处理，推荐使用。

```python
criterion = nn.BCEWithLogitsLoss()   # 输入是原始 logits
logits = torch.tensor([1.0, -0.5])   # 未经过 Sigmoid
targets = torch.tensor([1., 0.])
loss = criterion(logits, targets)
```

**使用场景**：

- 二分类问题的输出层（一个神经元）。
- 多标签分类（每个标签独立二分类）。

---

### 3. 回归任务损失函数

回归任务的目标是预测连续数值，常见的损失函数有 MAE（L1 Loss）、MSE（L2 Loss）和 Smooth L1 Loss。

---

#### 3.1 MAE 损失（L1 Loss）

**公式**：

$$
\text{L1 Loss}(y, \hat{y}) = \frac{1}{N} \sum_{i=1}^{N} |y_i - \hat{y}_i|
$$

**特点**：

- 对异常值（离群点）的鲁棒性较好，因为梯度绝对值恒为 ±1。
- 在零点处不可导（但 PyTorch 实现中会处理）。
- 收敛速度可能较慢，尤其在接近最优解时。

**代码示例**：

```python
y_pred = torch.tensor([1.0, 1.0, 1.9], requires_grad=True)
y_true = torch.tensor([2.0, 2.0, 2.0])

criterion = nn.L1Loss()
loss = criterion(y_pred, y_true)
print(loss.item())   # (|1-2| + |1-2| + |1.9-2|)/3 = (1+1+0.1)/3 = 0.7
```

---

#### 3.2 MSE 损失（L2 Loss）

**公式**：

$$
\text{MSELoss}(y, \hat{y}) = \frac{1}{N} \sum_{i=1}^{N} (y_i - \hat{y}_i)^2
$$

**特点**：

- 光滑可导，优化简单。
- 对异常值非常敏感（平方放大误差），可能导致梯度爆炸。
- 在接近最优解时梯度变小，有利于精细调整。

**代码示例**：

```python
criterion = nn.MSELoss()
loss = criterion(y_pred, y_true)  # (1^2 + 1^2 + 0.1^2)/3 = 0.67
print(loss.item())
```

---

#### 3.3 Smooth L1 损失

**公式**：

$$
\text{SmoothL1 Loss}(x) = \begin{cases}
0.5 x^2 & \text{if } |x| < 1 \\
|x| - 0.5 & \text{otherwise}
\end{cases}
$$

其中 $x = y_i - \hat{y}_i$ 。

**特点**：

- 结合了 L1 和 L2 的优点：当误差较小时，表现为 L2 损失（光滑）；当误差较大时，表现为 L1 损失（对异常值鲁棒，梯度不会爆炸）。
- 常用于目标检测中的边界框回归（如 Faster R-CNN）。

**代码示例**：

```python
criterion = nn.SmoothL1Loss()
loss = criterion(y_pred, y_true)
print(loss.item())
```

---

### 4. 损失函数选择总结

| 任务类型 | 推荐损失函数 | PyTorch 实现 | 说明 |
|----------|--------------|--------------|------|
| **多分类** | 交叉熵损失 | `nn.CrossEntropyLoss` | 输入为 logits，标签为索引 |
| **二分类** | 带 logits 的 BCE | `nn.BCEWithLogitsLoss` | 输入为 logits，标签为 0/1 |
| **二分类（概率）** | BCE | `nn.BCELoss` | 输入为概率（需先 Sigmoid） |
| **回归（通用）** | MSE Loss | `nn.MSELoss` | 平滑，对异常值敏感 |
| **回归（稳健）** | MAE Loss | `nn.L1Loss` | 对异常值鲁棒 |
| **回归（平衡）** | Smooth L1 Loss | `nn.SmoothL1Loss` | 结合 L1/L2 优点 |

**其他常用损失**：

- **KL 散度**：`nn.KLDivLoss`，用于衡量两个概率分布的距离。
- **余弦嵌入损失**：`nn.CosineEmbeddingLoss`，用于度量学习。
- **铰链损失**：`nn.HingeEmbeddingLoss`，用于 SVM 等。

---

### 5. 损失函数与评估指标的区别

- **损失函数**：用于**优化**，必须可导，通常在整个训练集上计算并反向传播。
- **评估指标**（如准确率、F 1、AUC）：用于**评估**模型性能，不要求可导，在验证/测试阶段使用。

例如，在多分类任务中，训练时使用交叉熵损失，但监控的指标通常是准确率。

---

## 第五部分：网络优化方法

神经网络训练的核心是使用优化算法不断更新模型参数，以最小化损失函数。传统的批量梯度下降（BGD）每次迭代使用全部数据计算梯度，计算量大且容易陷入局部极小值；随机梯度下降（SGD）每次使用一个样本，波动大但收敛快；小批量梯度下降（Mini‑batch SGD）结合两者优点，是最常用的基础优化器。然而，标准 SGD 在遇到平缓区域、鞍点或局部最小值时可能收敛缓慢。为此，研究者提出了多种改进的优化算法。

---

### 1. 优化算法面临的问题

- **平缓区域（Plateau）**：梯度值很小，参数更新极慢。
- **鞍点（Saddle Point）**：梯度为零，但既不是局部极小也不是极大，参数无法更新。
- **局部最小值（Local Minima）**：梯度为零，但不是全局最优。
- **震荡（Oscillation）**：由于 mini‑batch 随机采样，梯度方向可能在不同批次间剧烈变化，导致收敛路径曲折。

---

### 2. 指数加权平均（Exponential Weighted Moving Average, EWMA）

许多优化算法（如 Momentum、RMSProp、Adam）都依赖指数加权平均来平滑梯度或梯度平方。其公式为：

$$
S_t = \beta S_{t-1} + (1 - \beta) Y_t
$$

- $S_t$ ：第 $t$ 时刻的加权平均值。
- $Y_t$ ：第 $t$ 时刻的观测值（如梯度）。
- $\beta$ ：衰减率，通常取 0.9 或 0.99，值越大平均值越平滑。

**作用**：赋予最近的数据更大的权重，过去的数据权重指数衰减，从而减少噪声，使更新方向更稳定。

**代码演示**（模拟 30 天气温的 EWMA）：

```python
import torch
import matplotlib.pyplot as plt

torch.manual_seed(0)
temperature = torch.randn(30) * 10   # 随机气温

def exp_weighted_avg(data, beta=0.9):
    avg = []
    for i, temp in enumerate(data, 1):
        if i == 1:
            avg.append(temp)
        else:
            new_avg = avg[-1] * beta + (1 - beta) * temp
            avg.append(new_avg)
    return avg

days = torch.arange(1, 31)
plt.scatter(days, temperature, label='原始温度')
plt.plot(days, exp_weighted_avg(temperature, beta=0.5), label='β=0.5')
plt.plot(days, exp_weighted_avg(temperature, beta=0.9), label='β=0.9')
plt.legend()
plt.show()
```

从图中可见，β 越大（如 0.9），曲线越平滑。

---

### 3. 主流优化算法详解

#### 3.1 Momentum（动量法）

**核心思想**：利用梯度的指数加权平均来加速收敛并抑制震荡。相当于模拟物理中的动量：当前更新方向不仅取决于当前梯度，还受之前梯度积累的方向影响。

**更新公式**：

$$
v_t = \beta v_{t-1} + (1 - \beta) g_t
$$

$$
w_t = w_{t-1} - \eta v_t
$$

- $v_t$ ：当前时刻的动量（梯度加权平均）。
- $g_t$ ：当前 mini‑batch 的梯度。
- $\beta$ ：动量系数，通常取 0.9。
- $\eta$ ：学习率。

**优点**：

- 加速收敛，尤其在平缓区域或梯度方向一致的场景。
- 能够跨越鞍点和小的局部极小值（因为积累了历史梯度）。

**PyTorch 实现**：

```python
optimizer = torch.optim.SGD(model.parameters(), lr=0.01, momentum=0.9)
```

**示例**（演示动量对参数更新的影响）：

```python
w = torch.tensor([1.0], requires_grad=True)
loss = (w ** 2) / 2
optimizer = torch.optim.SGD([w], lr=0.01, momentum=0.9)
optimizer.zero_grad()
loss.backward()
optimizer.step()
print(f'梯度: {w.grad.item():.6f}, 更新后权重: {w.item():.6f}')
# 输出: 梯度: 1.000000, 更新后权重: 0.990000
# 第二次更新后权重会进一步减小
```

---

#### 3.2 AdaGrad（自适应梯度算法）

**核心思想**：为每个参数分配不同的学习率，对频繁更新的参数使用较小学习率，对稀疏更新的参数使用较大学习率。通过累积历史梯度平方和来实现。

**更新公式**：

$$
r_t = r_{t-1} + g_t \odot g_t
$$

$$
\Delta w_t = -\frac{\eta}{\sqrt{r_t + \epsilon}} \odot g_t
$$

$$
w_t = w_{t-1} + \Delta w_t
$$

- $r_t$ ：历史梯度平方的累积和。
- $\epsilon$ ：防止除零的小常数（如 1 e‑8）。

**优点**：适合稀疏数据（如 NLP 中的词嵌入）和特征维度差异大的问题。

**缺点**：学习率单调递减，训练后期学习率过小，导致模型难以继续学习。

**PyTorch 实现**：

```python
optimizer = torch.optim.Adagrad(model.parameters(), lr=0.01)
```

---

#### 3.3 RMSProp（均方根传播）

**核心思想**：针对 AdaGrad 学习率急剧下降的问题，使用指数加权平均代替累积平方和，从而保留近期梯度信息。

**更新公式**：

$$
s_t = \beta s_{t-1} + (1 - \beta) g_t \odot g_t
$$

$$
w_t = w_{t-1} - \frac{\eta}{\sqrt{s_t + \epsilon}} \odot g_t
$$

- $\beta$ ：衰减率，通常取 0.9。

**优点**：适用于非平稳目标（如 RNN），学习率不会单调递减到零。

**PyTorch 实现**：

```python
optimizer = torch.optim.RMSprop(model.parameters(), lr=0.01, alpha=0.9)
```

---

#### 3.4 Adam（自适应矩估计）

**核心思想**：结合 Momentum（一阶矩）和 RMSProp（二阶矩），同时对梯度的一阶矩和二阶矩进行指数加权平均，并加入偏差修正，使得算法在训练初期也能稳定。

**更新公式**（简化）：

$$
m_t = \beta_1 m_{t-1} + (1 - \beta_1) g_t
$$

$$
v_t = \beta_2 v_{t-1} + (1 - \beta_2) g_t^2
$$

$$
\hat{m}_t = \frac{m_t}{1 - \beta_1^t}, \quad \hat{v}_t = \frac{v_t}{1 - \beta_2^t}
$$

$$
w_t = w_{t-1} - \eta \frac{\hat{m}_t}{\sqrt{\hat{v}_t} + \epsilon}
$$

- $\beta_1, \beta_2$ ：常用默认值 $\beta_1=0.9, \beta_2=0.999$ 。
- $t$ ：时间步数。
- 偏差修正解决了初始时刻 $m_t, v_t$ 偏向 0 的问题。

**优点**：

- 自适应学习率，对超参数敏感度较低。
- 训练快速、稳定，是当前最常用的优化器之一。

**缺点**：在某些情况下可能泛化性能不如 SGD + Momentum（尤其对于图像分类任务）。

**PyTorch 实现**：

```python
optimizer = torch.optim.Adam(model.parameters(), lr=0.001, betas=(0.9, 0.999))
```

---

### 4. 优化器对比与选择建议

| 优化器 | 自适应学习率 | 适用场景 | 缺点 |
|--------|--------------|----------|------|
| **SGD + Momentum** | 否 | 大多数 CV 任务，需要精细调参 | 需要手动调整学习率 |
| **AdaGrad** | 是 | 稀疏数据（如 NLP） | 学习率过早过小 |
| **RMSProp** | 是 | RNN、强化学习 | 可能不稳定 |
| **Adam** | 是 | 大多数任务，默认首选 | 泛化性有时不如 SGD |

**实践建议**：

- **快速原型**：直接使用 Adam（lr=0.001）。
- **图像分类**：尝试 SGD + Momentum（lr=0.01~0.1，momentum=0.9），配合学习率衰减。
- **NLP / 稀疏特征**：Adam 或 RMSProp。
- **需要收敛到更优极值**：SGD + Momentum 往往比 Adam 泛化更好。

---

### 5. 学习率衰减（Learning Rate Scheduling）

训练过程中逐步降低学习率有助于在接近最优解时进行精细调整，避免震荡。PyTorch 的 `torch.optim.lr_scheduler` 提供了多种策略。

#### 5.1 等间隔衰减（StepLR）

每隔 `step_size` 个 epoch，学习率乘以 `gamma`。

```python
scheduler = torch.optim.lr_scheduler.StepLR(optimizer, step_size=50, gamma=0.5)
```

在每个 epoch 结束后调用 `scheduler.step()`。

---

#### 5.2 指定间隔衰减（MultiStepLR）

在指定的 epoch 节点（如 [50, 125, 160]）对学习率乘以 `gamma`。

```python
scheduler = torch.optim.lr_scheduler.MultiStepLR(optimizer, milestones=[50,125,160], gamma=0.5)
```

---

#### 5.3 指数衰减（ExponentialLR）

每个 epoch 学习率乘以 `gamma^epoch`。

```python
scheduler = torch.optim.lr_scheduler.ExponentialLR(optimizer, gamma=0.95)
```

---

#### 5.4 余弦退火（CosineAnnealingLR）

学习率按照余弦函数周期变化，公式：

$$
\eta_t = \eta_{\min} + \frac{1}{2}(\eta_{\max} - \eta_{\min})(1 + \cos(\frac{T_{cur}}{T_{max}} \pi))
$$

```python
scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=50)
```

---

#### 5.5 自适应衰减（ReduceLROnPlateau）

当验证集指标停止提升时，降低学习率。

```python
scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode='min', patience=10, factor=0.1)
```

需要将验证损失传入 `scheduler.step(val_loss)`。

---

### 6. 完整训练循环模板（含优化器和学习率调度）

```python
import torch.optim as optim
from torch.optim.lr_scheduler import StepLR

model = ...                # 模型
criterion = nn.CrossEntropyLoss()
optimizer = optim.Adam(model.parameters(), lr=0.001)
scheduler = StepLR(optimizer, step_size=30, gamma=0.1)

for epoch in range(num_epochs):
    model.train()
    for inputs, labels in train_loader:
        optimizer.zero_grad()
        outputs = model(inputs)
        loss = criterion(outputs, labels)
        loss.backward()
        optimizer.step()
    
    scheduler.step()       # 更新学习率
    current_lr = optimizer.param_groups[0]['lr']
    print(f"Epoch {epoch+1}, LR: {current_lr:.6f}")
```

---

## 第六部分：正则化方法

神经网络强大的表达能力是一把双刃剑：当模型参数远多于训练样本时，很容易发生**过拟合**（overfitting），即模型在训练集上表现极好，但在未见过的测试集上泛化能力差。**正则化**（Regularization）是一类用于缓解过拟合、提高模型泛化能力的策略。深度学习中常用的正则化方法包括范数惩罚（权重衰减）、Dropout、批量归一化（Batch Normalization）等。

---

### 1. 正则化的作用

- **降低模型复杂度**：限制模型参数的自由度，防止其过度记忆训练数据中的噪声。
- **提高泛化能力**：使模型在测试集上也能获得稳定且较好的表现。
- **平滑决策边界**：正则化倾向于让模型学习更平滑、更简单的函数。

---

### 2. 范数惩罚（权重衰减）

范数惩罚通过在损失函数中增加参数 $W$ 的范数项来约束权重大小。最常用的是 **L2 正则化**（权重衰减，Weight Decay）。

**L2 正则化公式**：

$$
L_{\text{total}}(W) = L_{\text{original}}(W) + \frac{\lambda}{2} \|W\|_2^2
$$

其中 $\|W\|_2^2 = \sum_i w_i^2$ ， $\lambda$ 为正则化系数（通常为 0.001 ~ 0.0001）。

**效果**：使权重趋向于较小的值，但不为零。小权重意味着模型对输入的微小变化不敏感，从而提高稳定性。

**L1 正则化**（Lasso）：

$$
L_{\text{total}}(W) = L_{\text{original}}(W) + \lambda \|W\|_1
$$

L1 正则化会使部分权重变为 0，产生稀疏解，可用于特征选择。

**PyTorch 中的权重衰减**：

在优化器中直接设置 `weight_decay` 参数即可，等价于 L2 正则化。

```python
# SGD 中设置 weight_decay
optimizer = torch.optim.SGD(model.parameters(), lr=0.01, weight_decay=1e-4)

# Adam 中也支持
optimizer = torch.optim.Adam(model.parameters(), lr=0.001, weight_decay=1e-4)
```

**注意事项**：

- 权重衰减通常不对偏置项使用，因为偏置对模型复杂度影响较小。
- 正则化系数 $\lambda$ 需要根据验证集调优，过大会导致欠拟合。

---

### 3. Dropout（随机失活）

Dropout 是由 Hinton 等人提出的一种简单而强大的正则化方法，特别适用于全连接层。

---

#### 3.1 Dropout 的原理

- **训练阶段**：每个神经元以概率 $p$ （通常称为 `dropout rate`）被**临时丢弃**（即其输出置为 0）。被丢弃的神经元在该次前向传播和反向传播中不参与计算。未被丢弃的神经元的输出会乘以缩放因子 $\frac{1}{1-p}$ ，以保持整体激活的期望不变。
- **测试阶段**：所有神经元都参与计算，但输出不再缩放（相当于使用了完整的网络）。

通过随机丢弃神经元，每次迭代都在训练不同的子网络（类似于集成学习），从而降低神经元之间的复杂共适应关系，增强泛化能力。

---

#### 3.2 代码示例

```python
import torch
import torch.nn as nn

dropout = nn.Dropout(p=0.4)   # p 为丢弃概率
inputs = torch.randint(0, 10, (1, 4)).float()
linear = nn.Linear(4, 5)
x = linear(inputs)
print("未失活输出:", x)

x_drop = dropout(x)
print("失活后输出:", x_drop)
# 输出中有一些元素变为 0，未变为 0 的会放大 1/(1-0.4) ≈ 1.667 倍
```

---

#### 3.3 Dropout 的使用建议

- **只在训练时启用 Dropout**：PyTorch 的 `nn.Dropout` 会自动根据 `model.train()` 和 `model.eval()` 状态切换行为。在 `eval()` 模式下 Dropout 不生效。
- **适用位置**：通常放在全连接层之后、激活函数之前或之后。对于卷积层，有时也使用 Dropout 2 d（随机丢弃整个通道）。
- **常用丢弃率**：
  - 输入层：0.2 左右
  - 隐藏层：0.3 ~ 0.5
  - 输出层：通常不使用 Dropout
- **深层网络**：越接近输出层的隐藏层，丢弃率可以适当降低。

---

#### 3.4 Dropout 的缺点

- 训练时间变长（因为需要训练更多子网络）。
- 在小型数据集或简单模型上可能效果不明显。

---

### 4. 批量归一化（Batch Normalization, BN）

批量归一化由 Google 在 2015 年提出，最初用于解决深层网络训练中的**内部协变量偏移**（Internal Covariate Shift）问题，即每层输入分布随着前面层参数变化而不断改变，导致训练不稳定。BN 通过对每个 mini-batch 的数据进行归一化，再引入可学习的缩放和平移参数，使网络训练更快速、更稳定。

---

#### 4.1 BN 的计算过程

对于一个 batch 中某个特定通道的输入 $x$ ，BN 层执行以下操作：

1. **计算 mini-batch 的均值**： $\mu_B = \frac{1}{m} \sum_{i=1}^m x_i$
2. **计算 mini-batch 的方差**： $\sigma_B^2 = \frac{1}{m} \sum_{i=1}^m (x_i - \mu_B)^2$
3. **归一化**： $\hat{x}_i = \frac{x_i - \mu_B}{\sqrt{\sigma_B^2 + \epsilon}}$ （ $\epsilon$ 为防止除零的小常数，如 $10^{-5}$ ）
4. **缩放和平移**： $y_i = \gamma \hat{x}_i + \beta$

其中 $\gamma$ 和 $\beta$ 是**可学习的参数**（与权重一样通过反向传播更新）。恢复网络一定的表达能力，因为纯粹的归一化可能破坏原始特征分布。

---

#### 4.2 BN 的优点

- **加速收敛**：可以使用更大的学习率，减少对参数初始化的敏感度。
- **缓解过拟合**：具有轻微的正则化效果，因为每个 batch 的均值和方差有微小噪声。
- **允许更高的学习率**：减少了梯度爆炸/消失的风险。
- **减少了对 Dropout 的依赖**：在一些网络中，BN 可以部分替代 Dropout。

---

#### 4.3 BN 在卷积网络和全连接网络中的区别

- **全连接层**：对每个神经元分别计算均值和方差，即每个特征维度独立进行 BN。输入形状 `(N, D)`，输出形状 `(N, D)`。
- **卷积层**：BN 通常放在卷积层之后、激活函数之前。计算时对每个通道（channel）独立进行，即同一个通道内的所有像素共享相同的均值和方差。输入形状 `(N, C, H, W)`，输出形状 `(N, C, H, W)`。

PyTorch 提供了对应的 BN 层：

- `nn.BatchNorm 1 d`：用于 2D 输入 `(N, C)` 或 3D 序列 `(N, C, L)`
- `nn.BatchNorm 2 d`：用于 4D 图像 `(N, C, H, W)`
- `nn.BatchNorm 3 d`：用于 5 D 视频/体积数据

---

#### 4.4 代码示例

```python
import torch.nn as nn

# 假设输入形状 (batch, channels, height, width)
bn = nn.BatchNorm2d(num_features=2)  # 通道数为2
input = torch.randn(1, 2, 3, 4)
output = bn(input)

print("BN 可学习的权重 γ:", bn.weight)   # 初始为 1
print("BN 可学习的偏置 β:", bn.bias)     # 初始为 0
print("输出形状:", output.shape)
```

**训练 vs 测试**：

- 训练时：BN 使用当前 batch 的均值和方差。
- 测试时：BN 使用训练过程中**通过滑动平均**累积的全局均值和方差。PyTorch 会通过 `model.eval()` 自动切换。

---

#### 4.5 BN 的注意事项

- **batch size 不宜过小**：一般要求 batch size ≥ 16，否则均值和方差估计不稳定。对于极小 batch（如 1 ~ 4），可改用 Layer Normalization 或 Instance Normalization。
- **RNN 中谨慎使用**：RNN 的不同时间步共享 BN 层，效果不如 Layer Normalization（如 `nn.LayerNorm`）。
- **位置**：通常放在线性层/卷积层之后、激活函数之前，即 `Conv -> BN -> ReLU`。

---

### 5. 其他正则化方法

| 方法 | 说明 |
|------|------|
| **早停（Early Stopping）** | 当验证集损失不再下降时提前终止训练，防止过拟合。 |
| **数据增强（Data Augmentation）** | 对输入数据施加随机变换（旋转、翻转、裁剪、加噪等），增加训练样本多样性。 |
| **标签平滑（Label Smoothing）** | 将 one-hot 标签的 1 替换为 $1-\epsilon$ ，0 替换为 $\epsilon/(K-1)$ ，防止模型过于自信。 |
| **Layer Normalization** | 对每个样本的所有特征维度进行归一化，适用于 RNN 和 Transformer。 |
| **Instance Normalization** | 对每个样本的每个通道独立归一化，用于风格迁移。 |

---

### 6. 正则化方法选择建议

| 场景 | 推荐正则化策略 |
|------|----------------|
| 小型全连接网络 | Dropout + 权重衰减 |
| 图像分类 CNN | Batch Normalization + 权重衰减（可减少 Dropout） |
| 大型模型 + 小数据集 | Dropout + 数据增强 + 早停 |
| Transformer / NLP | Layer Normalization + 标签平滑 |
| 生成对抗网络（GAN） | 通常使用权重衰减，BN 在某些 GAN 变体中需要谨慎使用 |

---

## 第七部分：完整案例——手机价格分类（模型构建、训练、调优）

本案例基于前六部分的知识，构建一个全连接神经网络，解决**手机价格区间分类**问题。数据集包含二手手机的多项性能指标（如 RAM、电池容量、摄像头像素等），目标是将手机划分为 4 个价格区间（0、1、2、3，数值越大价格越高）。这是一个典型的多分类任务。

我们将按照标准的机器学习/深度学习流程进行：**数据准备 → 模型设计 → 训练与验证 → 评估与调优**。

---

### 1. 数据准备与预处理

#### 1.1 数据集描述

假设数据文件 `手机价格预测.csv` 包含 2000 条样本，特征数为 20，标签为 0 ~ 3 的整数。数据示例（虚构）：

| battery_power | blue | clock_speed | dual_sim | fc | four_g | int_memory | m_dep | mobile_wt | n_cores | pc | px_height | px_width | ram | sc_h | sc_w | talk_time | three_g | touch_screen | wifi | price_range |
|---------------|------|-------------|----------|----|--------|------------|-------|-----------|---------|----|-----------|----------|-----|------|------|-----------|---------|--------------|------|-------------|
| 842           | 0    | 2.2         | 0        | 1  | 0      | 7          | 0.6   | 188       | 2       | 2  | 20        | 756      | 2549| 9    | 7    | 19        | 0       | 0            | 1    | 1           |

---

#### 1.2 完整数据加载与划分代码

```python
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
import pandas as pd
import numpy as np
import time

# 设置随机种子保证可复现
torch.manual_seed(42)
np.random.seed(42)

def load_and_prepare_data(csv_path='data/手机价格预测.csv', test_size=0.2, random_state=88):
    """
    加载数据，划分训练/验证集，并进行标准化
    返回：训练集 Dataset 对象、验证集 Dataset 对象、输入维度、类别数
    """
    # 1. 读取数据
    data = pd.read_csv(csv_path)
    X = data.iloc[:, :-1].values.astype(np.float32)
    y = data.iloc[:, -1].values.astype(np.int64)
    
    # 2. 划分训练集和验证集（80% 训练，20% 验证）
    X_train, X_valid, y_train, y_valid = train_test_split(
        X, y, test_size=test_size, random_state=random_state, stratify=y  # 分层采样保证类别分布一致
    )
    
    # 3. 标准化（重要！可显著提升收敛速度和稳定性）
    scaler = StandardScaler()
    X_train = scaler.fit_transform(X_train)
    X_valid = scaler.transform(X_valid)
    
    # 4. 转换为 PyTorch 张量
    train_dataset = TensorDataset(torch.from_numpy(X_train), torch.from_numpy(y_train))
    valid_dataset = TensorDataset(torch.from_numpy(X_valid), torch.from_numpy(y_valid))
    
    input_dim = X.shape[1]          # 特征数量
    num_classes = len(np.unique(y)) # 类别数量（本例为 4）
    
    return train_dataset, valid_dataset, input_dim, num_classes
```

---

### 2. 构建分类网络模型

我们设计一个三层全连接网络，使用 **Batch Normalization**、**Dropout** 和 **ReLU** 激活函数。参数初始化采用 Kaiming 初始化（适合 ReLU）。

```python
class PhonePriceModel(nn.Module):
    def __init__(self, input_dim, output_dim, hidden_dims=[128, 256], dropout_rate=0.3):
        super(PhonePriceModel, self).__init__()
        
        self.fc1 = nn.Linear(input_dim, hidden_dims[0])
        self.bn1 = nn.BatchNorm1d(hidden_dims[0])
        self.dropout1 = nn.Dropout(dropout_rate)
        
        self.fc2 = nn.Linear(hidden_dims[0], hidden_dims[1])
        self.bn2 = nn.BatchNorm1d(hidden_dims[1])
        self.dropout2 = nn.Dropout(dropout_rate)
        
        self.out = nn.Linear(hidden_dims[1], output_dim)
        
        # 参数初始化（Kaiming 均匀分布）
        self._initialize_weights()
    
    def _initialize_weights(self):
        for m in self.modules():
            if isinstance(m, nn.Linear):
                nn.init.kaiming_uniform_(m.weight, mode='fan_in', nonlinearity='relu')
                if m.bias is not None:
                    nn.init.constant_(m.bias, 0)
    
    def forward(self, x):
        # 第一块
        x = self.fc1(x)
        x = self.bn1(x)
        x = torch.relu(x)
        x = self.dropout1(x)
        
        # 第二块
        x = self.fc2(x)
        x = self.bn2(x)
        x = torch.relu(x)
        x = self.dropout2(x)
        
        # 输出层（不经过激活，因为 CrossEntropyLoss 内部包含 Softmax）
        x = self.out(x)
        return x
```

**设计说明**：

- `BatchNorm 1 d`：对全连接层的输出进行归一化，加速训练。
- `Dropout`：随机丢弃部分神经元，防止过拟合。
- 输出层没有激活函数，因为 `nn.CrossEntropyLoss` 内部会应用 LogSoftmax + NLLLoss。

---

### 3. 模型训练与验证

#### 3.1 训练函数

训练时使用 **Adam 优化器**（自适应学习率）和 **学习率调度**（ReduceLROnPlateau），并跟踪训练损失、验证准确率。

```python
def train_model(model, train_dataset, valid_dataset, 
                batch_size=64, lr=0.001, weight_decay=1e-4,
                num_epochs=100, patience=10):
    """
    训练模型，并采用早停策略
    """
    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True)
    valid_loader = DataLoader(valid_dataset, batch_size=batch_size, shuffle=False)
    
    # 损失函数（多分类交叉熵）
    criterion = nn.CrossEntropyLoss()
    # 优化器（Adam + 权重衰减）
    optimizer = optim.Adam(model.parameters(), lr=lr, weight_decay=weight_decay)
    # 学习率调度：当验证损失连续 patience 个 epoch 不下降时，乘以 factor
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode='min', factor=0.5, patience=5, verbose=True)
    
    best_valid_acc = 0.0
    best_epoch = 0
    epochs_no_improve = 0
    
    train_losses = []
    valid_accs = []
    
    for epoch in range(1, num_epochs + 1):
        # ---------- 训练阶段 ----------
        model.train()
        total_loss = 0.0
        for X_batch, y_batch in train_loader:
            optimizer.zero_grad()
            outputs = model(X_batch)
            loss = criterion(outputs, y_batch)
            loss.backward()
            optimizer.step()
            total_loss += loss.item() * X_batch.size(0)
        
        avg_train_loss = total_loss / len(train_dataset)
        train_losses.append(avg_train_loss)
        
        # ---------- 验证阶段 ----------
        model.eval()
        correct = 0
        total = 0
        with torch.no_grad():
            for X_batch, y_batch in valid_loader:
                outputs = model(X_batch)
                _, preds = torch.max(outputs, 1)
                correct += (preds == y_batch).sum().item()
                total += y_batch.size(0)
        valid_acc = correct / total
        valid_accs.append(valid_acc)
        
        # 学习率调整（传入验证损失）
        scheduler.step(avg_train_loss)   # 也可用验证损失，这里用训练损失示例
        
        # 打印信息
        if epoch % 10 == 0 or epoch == 1:
            print(f"Epoch {epoch:3d} | Train Loss: {avg_train_loss:.4f} | Valid Acc: {valid_acc:.4f}")
        
        # 早停与保存最佳模型
        if valid_acc > best_valid_acc:
            best_valid_acc = valid_acc
            best_epoch = epoch
            torch.save(model.state_dict(), 'best_phone_model.pth')
            epochs_no_improve = 0
        else:
            epochs_no_improve += 1
            if epochs_no_improve >= patience:
                print(f"Early stopping at epoch {epoch}, best valid acc: {best_valid_acc:.4f} at epoch {best_epoch}")
                break
    
    # 加载最佳模型
    model.load_state_dict(torch.load('best_phone_model.pth'))
    return model, best_valid_acc, train_losses, valid_accs
```

---

#### 3.2 调用训练

```python
if __name__ == "__main__":
    # 加载数据
    train_dataset, valid_dataset, input_dim, num_classes = load_and_prepare_data()
    
    # 创建模型
    model = PhonePriceModel(input_dim, num_classes, hidden_dims=[128, 256], dropout_rate=0.3)
    
    # 训练
    trained_model, best_acc, losses, accs = train_model(
        model, train_dataset, valid_dataset,
        batch_size=64, lr=0.001, weight_decay=1e-4,
        num_epochs=100, patience=10
    )
    
    print(f"最佳验证准确率: {best_acc:.4f}")
```

---

### 4. 模型评估与可视化

#### 4.1 绘制训练曲线

```python
import matplotlib.pyplot as plt

def plot_curves(train_losses, valid_accs):
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 4))
    ax1.plot(train_losses, label='Train Loss')
    ax1.set_xlabel('Epoch')
    ax1.set_ylabel('Loss')
    ax1.set_title('Training Loss')
    ax1.legend()
    
    ax2.plot(valid_accs, label='Valid Accuracy', color='orange')
    ax2.set_xlabel('Epoch')
    ax2.set_ylabel('Accuracy')
    ax2.set_title('Validation Accuracy')
    ax2.legend()
    plt.show()

# 假设已有 losses, accs
plot_curves(losses, accs)
```

---

#### 4.2 评估指标（混淆矩阵、分类报告）

```python
from sklearn.metrics import confusion_matrix, classification_report
import seaborn as sns

def evaluate_model(model, valid_dataset):
    model.eval()
    loader = DataLoader(valid_dataset, batch_size=64, shuffle=False)
    all_preds = []
    all_labels = []
    with torch.no_grad():
        for X_batch, y_batch in loader:
            outputs = model(X_batch)
            _, preds = torch.max(outputs, 1)
            all_preds.extend(preds.numpy())
            all_labels.extend(y_batch.numpy())
    
    cm = confusion_matrix(all_labels, all_preds)
    print(classification_report(all_labels, all_preds, target_names=['Class 0', 'Class 1', 'Class 2', 'Class 3']))
    
    # 绘制混淆矩阵
    plt.figure(figsize=(8,6))
    sns.heatmap(cm, annot=True, fmt='d', cmap='Blues')
    plt.title('Confusion Matrix')
    plt.xlabel('Predicted')
    plt.ylabel('True')
    plt.show()

evaluate_model(trained_model, valid_dataset)
```

---

### 5. 调优建议（如何提升准确率）

我们在案例中得到的基线准确率约为 **0.6425**（使用 SGD 和简单三层网络）。下面给出系统的调优方向。

---

#### 5.1 数据角度

- **特征工程**：分析特征重要性，移除冗余特征；构造交叉特征（如 RAM × 电池容量）。
- **数据增强**：对于表格数据，可使用合成少数类过采样（SMOTE）处理类别不平衡。
- **标准化**：已使用 `StandardScaler`，对线性层帮助很大。也可以尝试 `MinMaxScaler`。

---

#### 5.2 模型结构

- **增加深度**：尝试 4~5 个隐藏层，每层神经元数递减（如 256 → 128 → 64 → 32）。
- **调整宽度**：每层神经元数过少会欠拟合，过多易过拟合，根据训练/验证损失判断。
- **激活函数**：保持 ReLU 为主，但可以尝试 Leaky ReLU 或 ELU。
- **正则化强度**：
  - Dropout rate：0.2~0.5，通过交叉验证选择。
  - Batch Normalization：已使用，通常能提升 2~5% 准确率。
  - 权重衰减（weight_decay）：尝试 1 e-5 ~ 1 e-3。

---

#### 5.3 优化与训练

- **优化器**：基线用 Adam（lr=0.001），也可尝试 SGD + Momentum + 学习率衰减（余弦退火）。
- **学习率**：使用学习率查找器（`torch-lr-finder`）或从小学习率逐步增加观察损失变化。
- **批量大小**：64 或 128，需平衡内存和梯度稳定性。
- **早停**：已实现，耐心值 patience 可根据验证曲线调整。
- **学习率调度**：`ReduceLROnPlateau` 在验证损失停滞时降低学习率，效果好。

---

#### 5.4 损失函数与类别不平衡

如果各类别样本数量不均衡，可以使用加权交叉熵：

```python
class_weights = torch.tensor([1.0, 1.2, 1.5, 2.0])  # 根据样本比例调整
criterion = nn.CrossEntropyLoss(weight=class_weights)
```

---

#### 5.5 集成方法

- 训练多个不同初始化的模型，对预测结果进行投票或平均。
- 使用 `torch.optim.swa_utils` 实现随机权重平均（SWA），提升泛化。

---

#### 5.6 实际调参步骤

1. 固定随机种子，建立基线。
2. 先调整数据预处理（标准化、特征选择）。
3. 调整模型结构（隐藏层数和宽度）。
4. 调整正则化强度（Dropout、weight_decay）。
5. 调整优化器及学习率。
6. 尝试集成方法。

每次只改变一个变量，记录验证集准确率变化。

---

### 6. 项目总结

通过本案例，我们实践了：

- 使用 PyTorch 构建全连接神经网络。
- 数据加载、标准化和 Dataset/DataLoader 的使用。
- 自定义网络类（继承 `nn.Module`）并应用 BatchNorm、Dropout、Kaiming 初始化。
- 训练循环、验证、早停与学习率调度。
- 模型保存与评估（混淆矩阵、分类报告）。
- 调优思路与超参数选择。

完整的代码结构可以作为一个模板，适用于大多数表格数据的分类/回归任务。

---

**第七部分结束。以上内容完成了手机价格分类的完整案例，包括数据准备、模型设计、训练、评估和调优建议。**

---

## 人工神经网络知识总结

本笔记共七部分，系统覆盖了：

1. 神经网络概述与结构
2. 激活函数（Sigmoid、Tanh、ReLU、Softmax）
3. 参数初始化（Xavier、Kaiming）
4. 损失函数（分类、回归）
5. 优化方法（SGD、Momentum、Adam、学习率调度）
6. 正则化（权重衰减、Dropout、BatchNorm）
7. 完整案例（手机价格分类）

通过理论与实践结合，读者应能独立使用 PyTorch 构建和训练全连接神经网络，并根据具体任务进行调优。

---
