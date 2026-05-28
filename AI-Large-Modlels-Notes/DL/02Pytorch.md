**上一级：** [01深度学习概述](01深度学习概述.md)

**下一级：** [[]]

**标签：** #DL

---

# PyTorch 框架详解——超详细学习笔记

## 第一部分：PyTorch 概述与安装

### 1. 什么是 PyTorch

PyTorch 是一个基于 Python 语言的深度学习框架，由 Facebook（现 Meta）的 AI 研究团队开发。它将数据封装成**张量（Tensor）** 来进行处理，提供了灵活且高效的工具，用于构建、训练和部署机器学习和深度学习模型。

**核心特点**：

- **动态计算图**（Define-by-Run）：计算图在代码执行时动态构建，调试方便，支持复杂的控制流。
- **Python 优先**：API 设计贴近 NumPy，与 Python 生态无缝集成，易于上手。
- **GPU 加速**：基于 CUDA 和 cuDNN，张量操作可以透明地在 GPU 上运行，大幅提升计算速度。
- **自动微分**：通过 `requires_grad` 和 `torch.autograd` 自动计算梯度，简化反向传播实现。

**应用领域**：

- 学术研究（论文复现、新模型开发）
- 计算机视觉（图像分类、目标检测、图像分割）
- 自然语言处理（文本分类、机器翻译、对话系统）
- 强化学习
- 生成模型（GAN、扩散模型）

---

### 2. PyTorch 的发展历史

| 年份 | 重要事件 |
|------|----------|
| **2016 年** | Facebook 正式发布了 PyTorch 的第一个版本（v 0.1.0），基于前身 Torch（Lua 语言）重新设计，采用 Python 作为主要接口。 |
| **2017 年** | PyTorch 0.3 版本发布，增加了对分布式训练的支持，社区迅速壮大。 |
| **2018 年** | PyTorch 1.0 版本发布，标志着其正式进入生产级应用阶段。整合了 Caffe 2 的部署能力，引入了 TorchScript（静态图优化）和 JIT 编译器。 |
| **2019 年** | PyTorch 1.3 版本增加了对移动端部署的支持（PyTorch Mobile）。 |
| **2020 年** | PyTorch 1.6 版本引入了自动混合精度训练（AMP），提升了训练效率。 |
| **2022 年** | PyTorch 2.0 发布，核心改进是 `torch.compile` 编译技术，大幅提升训练和推理性能。 |

目前 PyTorch 已成为学术界最主流的深度学习框架，绝大多数顶级会议（NeurIPS、ICML、CVPR、ACL）的论文代码使用 PyTorch 实现。

---

### 3. PyTorch 的安装

**基本安装命令**（使用 pip）：

```bash
# 安装 CPU 版本
pip install torch

# 安装 GPU 版本（需要 CUDA 环境，以 CUDA 11.8 为例）
pip install torch --index-url https://download.pytorch.org/whl/cu118

# 使用国内镜像加速（清华源）
pip install torch -i https://pypi.tuna.tsinghua.edu.cn/simple
```

**安装注意事项**：

- 建议使用虚拟环境（conda 或 venv）隔离项目依赖。
- GPU 版本需要提前安装 NVIDIA 驱动和 CUDA Toolkit（推荐使用 conda 自动安装 cuDNN 等依赖）。
- 使用 conda 安装：`conda install pytorch torchvision torchaudio cudatoolkit=11.8 -c pytorch -c conda-forge`
- 安装后验证：`import torch; print(torch.__version__); print(torch.cuda.is_available())`。

---

## 第二部分：PyTorch 张量（Tensor）详解

张量是 PyTorch 中的核心数据结构，理解张量的创建、类型转换、数值计算和操作是掌握 PyTorch 的基础。

---

### 1. 张量概述

#### 1.1 什么是张量

在 PyTorch 中，**张量（Tensor）** 本质上是一个元素类型相同的**多维数组**（类似于 NumPy 的 `ndarray`）。但 PyTorch 张量额外提供了以下功能：

- **GPU 加速**：可以将张量移动到 GPU 上进行并行计算（`.cuda()` 或 `.to(device)`）。
- **自动微分**：通过设置 `requires_grad=True`，PyTorch 会自动记录张量上的操作，构建计算图，支持反向传播计算梯度。
- **动态计算图**：计算图在运行时构建，便于调试和动态修改。

**张量的基本属性**：

| 属性 | 说明 | 示例 |
|------|------|------|
| `dtype` | 张量元素的数据类型 | `torch.float32`, `torch.int64`, `torch.bool` |
| `shape` | 张量的形状（各维度大小） | `torch.Size([3, 4])` 表示 3 行 4 列 |
| `ndim` | 张量的维度数（秩） | 标量: 0, 向量: 1, 矩阵: 2, 更高维: 3+ |
| `device` | 张量所在的设备 | `cpu` 或 `cuda:0` |
| `requires_grad` | 是否需要计算梯度 | `True` 或 `False` |

**张量的维度示例**：

- 0 维（标量）：`tensor(5)`
- 1 维（向量）：`tensor([1, 2, 3])`，形状 `(3,)`
- 2 维（矩阵）：`tensor([[1,2],[3,4]])`，形状 `(2, 2)`
- 3 维（例如 RGB 图像）：`(batch, height, width, channels)` 或 `(batch, channels, height, width)`，形状 `(32, 3, 224, 224)`

---

#### 1.2 数据类型对照表

| PyTorch 类型 | NumPy 对应类型 | 常见用途 |
|-------------|---------------|----------|
| `torch.float32` (默认) | `np.float32` | 权重、激活值 |
| `torch.float64` (double) | `np.float64` | 高精度计算 |
| `torch.float16` (half) | `np.float16` | 混合精度训练 |
| `torch.int64` (long) | `np.int64` | 标签索引 |
| `torch.int32` (int) | `np.int32` | 一般整数 |
| `torch.int8` | `np.int8` | 量化模型 |
| `torch.bool` | `np.bool_` | 掩码操作 |

---

### 2. 张量的创建方式

PyTorch 提供了多种创建张量的方法，根据需求选择合适的方式。

---

#### 2.1 根据指定数据创建张量

 `torch.tensor(data, dtype=None)` ：从现有数据（列表、元组、NumPy 数组等）创建张量。

```python
import torch

# 从列表创建
t1 = torch.tensor([1, 2, 3])
print(t1)  # tensor([1, 2, 3])
print(t1.dtype, t1.ndim, t1.shape)  # torch.int64 1 torch.Size([3])

# 从二维列表创建，指定数据类型
t2 = torch.tensor([[1, 2], [3, 4]], dtype=torch.float32)
print(t2)  # tensor([[1., 2.], [3., 4.]])

# 注意事项：不指定 dtype 时，整数默认为 torch.int64，浮点数默认为 torch.float32
```

 `torch.Tensor(data/size)` ：这是 `torch.FloatTensor` 的别名，默认创建 `float32` 类型的张量。

```python
# 从数据创建
t3 = torch.Tensor([1, 2, 3])  # 等价于 torch.FloatTensor([1,2,3])
print(t3.dtype)  # torch.float32

# 从形状创建（未初始化，包含随机垃圾值）
t4 = torch.Tensor(2, 3)  # 形状为 (2, 3) 的未初始化张量
print(t4)  # 数值不确定，建议使用 torch.empty() 替代
```

**指定类型创建函数**：

- `torch.IntTensor(size/data)`：`int32` 类型
- `torch.LongTensor(size/data)`：`int64` 类型
- `torch.FloatTensor(size/data)`：`float32` 类型
- `torch.DoubleTensor(size/data)`：`float64` 类型

```python
t5 = torch.IntTensor([1, 2, 3])   # dtype=torch.int32
t6 = torch.LongTensor([1, 2, 3])  # dtype=torch.int64
t7 = torch.DoubleTensor([1, 2, 3]) # dtype=torch.float64
```

**总结**：

- `torch.tensor()`：最通用，推荐用于从 Python 数据创建。
- `torch.Tensor()`：旧式用法，默认 float 32。
- 类型专用函数：用于确保特定数据类型。

---

#### 2.2 创建线性序列张量

 `torch.arange(start=0, end, step=1)` ：生成左闭右开区间 `[start, end)` 的等差数列，**不包含** `end` 。

```python
# 从 1 到 9，步长为 2
t1 = torch.arange(start=1, end=10, step=2)
print(t1)  # tensor([1, 3, 5, 7, 9])

# 只有 end，默认 start=0, step=1
t2 = torch.arange(5)  # tensor([0, 1, 2, 3, 4])
```

 `torch.linspace(start, end, steps)` ：生成区间 `[start, end]` 内的等间隔 `steps` 个数，**包含** `end` 。

```python
# 从 1 到 10，共 5 个数
t3 = torch.linspace(start=1, end=10, steps=5)
print(t3)  # tensor([ 1.0000,  3.2500,  5.5000,  7.7500, 10.0000])
```

---

#### 2.3 创建随机张量

**随机种子设置**：为了保证实验结果可复现，通常需要固定随机种子。

```python
# 设置 CPU 随机种子
torch.manual_seed(42)

# 查看当前随机种子
print(torch.initial_seed())  # 42

# 对于 CUDA（如果使用 GPU），需要额外设置
torch.cuda.manual_seed_all(42)
```

**随机浮点张量**：

| 函数 | 分布 | 取值范围 |
|------|------|----------|
| `torch.rand(size)` | 均匀分布 | `[0, 1)` |
| `torch.randn(size)` | 标准正态分布 | 均值 0，方差 1 |
| `torch.rand_like(tensor)` | 均匀分布 | 与输入形状相同，值域 `[0,1)` |
| `torch.randn_like(tensor)` | 标准正态分布 | 与输入形状相同 |

```python
# 均匀分布 [0,1)，形状 (2, 2, 3)
t5 = torch.rand(size=(2, 2, 3))
print(t5.shape)  # torch.Size([2, 2, 3])

# 标准正态分布
t6 = torch.randn(size=(2, 2, 3))

# 使用 rand_like 复制形状
t7 = torch.rand_like(t5)  # 形状与 t5 相同
```

**随机整数张量**：

`torch.randint(low, high, size)`：生成 `[low, high)` 范围内的随机整数。

```python
# 生成 0 到 9 之间的随机整数，形状 (2, 2)
t8 = torch.randint(low=0, high=10, size=(2, 2))
print(t8)  # tensor([[6, 1], [4, 9]])  # 结果会因随机种子不同而不同
```

---

#### 2.4 创建全 0、全 1、指定值张量

| 函数 | 说明 |
|------|------|
| `torch.zeros(size)` | 创建全 0 张量，默认 float 32 |
| `torch.zeros_like(tensor)` | 创建与指定张量形状相同的全 0 张量 |
| `torch.ones(size)` | 创建全 1 张量 |
| `torch.ones_like(tensor)` | 创建与指定张量形状相同的全 1 张量 |
| `torch.full(size, fill_value)` | 创建全为 `fill_value` 的张量 |
| `torch.full_like(tensor, fill_value)` | 创建与指定张量形状相同的全 `fill_value` 张量 |

```python
# 全 0
t9 = torch.zeros(size=(2, 3))
print(t9)  # tensor([[0., 0., 0.], [0., 0., 0.]])

# 全 1
t10 = torch.ones(size=(2, 3))
print(t10)  # tensor([[1., 1., 1.], [1., 1., 1.]])

# 全为指定值
t11 = torch.full(size=(2, 3), fill_value=6.0)
print(t11)  # tensor([[6., 6., 6.], [6., 6., 6.]])

# 使用 _like 版本（参考已有张量形状）
ref = torch.tensor([[1, 2, 3], [4, 5, 6]])
t12 = torch.zeros_like(ref)   # 形状 (2, 3)，全 0
t13 = torch.ones_like(ref)    # 形状 (2, 3)，全 1
t14 = torch.full_like(ref, fill_value=6.0)  # 形状 (2, 3)，全 6
```

---

#### 2.5 创建对角矩阵和单位矩阵

```python
# 创建对角矩阵（对角线为1，其余为0）
eye = torch.eye(3)  # 3x3 单位矩阵
print(eye)
# tensor([[1., 0., 0.],
#         [0., 1., 0.],
#         [0., 0., 1.]])

# 创建空张量（未初始化，不推荐直接使用）
empty = torch.empty(2, 3)  # 内容取决于内存状态
```

---

### 3. 张量数据类型转换

在实际操作中，经常需要转换张量的数据类型（例如从整数转为浮点数用于计算）。

**方法一：使用内置类型转换函数**

| 函数 | 目标类型 |
|------|----------|
| `tensor.byte()` | `torch.uint8` |
| `tensor.short()` | `torch.int16` |
| `tensor.int()` | `torch.int32` |
| `tensor.long()` | `torch.int64` |
| `tensor.half()` | `torch.float16` |
| `tensor.float()` | `torch.float32` |
| `tensor.double()` | `torch.float64` |

```python
t = torch.zeros(2, 3)  # dtype = torch.float32

print(t.short().dtype)   # torch.int16
print(t.int().dtype)     # torch.int32
print(t.long().dtype)    # torch.int64
print(t.half().dtype)    # torch.float16
print(t.float().dtype)   # torch.float32
print(t.double().dtype)  # torch.float64
```

**方法二：使用 `tensor.type()` 方法**

```python
# 转换为指定类型
t = torch.zeros(2, 3)

print(t.type(torch.int8).dtype)   # torch.int8
print(t.type(torch.int16).dtype)  # torch.int16
print(t.type(torch.int32).dtype)  # torch.int32
print(t.type(torch.int64).dtype)  # torch.int64
print(t.type(torch.float16).dtype) # torch.float16
print(t.type(torch.float32).dtype) # torch.float32
print(t.type(torch.float64).dtype) # torch.float64
```

**方法三：使用 `to()` 方法（最通用）**

```python
t = torch.zeros(2, 3)
t_float16 = t.to(torch.float16)
t_int64 = t.to(torch.int64)
t_cuda = t.to('cuda')  # 同时可以改变设备
```

**注意事项**：

- 数据类型转换会创建新的张量，原始张量不变（除非使用赋值操作）。
- 进行矩阵乘法等数值计算时，建议统一为 `float32` 或 `float64`，避免整数溢出。

---

### 4. 张量与 NumPy 互转

PyTorch 张量与 NumPy 数组可以高效地互相转换，且可以**共享内存**（不复制数据）或**复制数据**。

---

#### 4.1 NumPy → PyTorch

 `torch.from_numpy(ndarray)` ：将 NumPy 数组转换为张量，**共享内存**。修改其中一个会影响另一个。

```python
import numpy as np
import torch

# 创建 NumPy 数组
my_numpy = np.array([1, 2, 3])
print(my_numpy)  # [1 2 3]

# 转换为张量（共享内存）
t1 = torch.from_numpy(my_numpy)
print(t1)  # tensor([1, 2, 3])

# 修改 NumPy 数组，张量同步改变
my_numpy[0] = 100
print(my_numpy)  # [100   2   3]
print(t1)        # tensor([100,   2,   3])
```

 `torch.tensor(ndarray)` ：将 NumPy 数组转换为张量，**不共享内存**（复制数据）。

```python
my_numpy = np.array([1, 2, 3])
t2 = torch.tensor(my_numpy)  # 复制数据
my_numpy[1] = 200
print(my_numpy)  # [1 200 3]
print(t2)        # tensor([1, 2, 3])  不受影响
```

---

#### 4.2 PyTorch → NumPy

 `tensor.numpy()` ：将张量转换为 NumPy 数组，**共享内存**。

```python
my_tensor = torch.tensor([1, 2, 3])
n1 = my_tensor.numpy()
print(n1)  # [1 2 3]

my_tensor[0] = 100
print(my_tensor)  # tensor([100, 2, 3])
print(n1)         # [100   2   3]  同步改变
```

 `tensor.numpy().copy()` ：复制数据，**不共享内存**。

```python
n2 = my_tensor.numpy().copy()
my_tensor[1] = 200
print(my_tensor)  # tensor([100, 200, 3])
print(n2)         # [100   2   3]  不受影响
```

**注意事项**：

- 共享内存的张量需要在 CPU 上。如果张量在 GPU 上，需要先调用 `.cpu()` 再转 NumPy。
- 使用共享内存可以减少数据拷贝开销，但要注意副作用（意外修改）。

---

### 5. 标量张量与 Python 数字互转

**标量张量**：形状为 `()`（0 维）的张量，只包含一个元素。

---

#### 5.1 Python 数字 → 标量张量

```python
# 使用 torch.tensor()
a = 10
t = torch.tensor(a)
print(t, type(t), t.ndim)  # tensor(10) <class 'torch.Tensor'> 0
```

---

#### 5.2 标量张量 → Python 数字

使用 `.item()` 方法提取标量张量中的 Python 数字。

```python
t = torch.tensor(10)
val = t.item()
print(val, type(val))  # 10 <class 'int'>

# 浮点数示例
t_float = torch.tensor(3.14)
val_float = t_float.item()  # 3.14 (float)
```

**注意**：`.item()` 只能用于只有一个元素的张量。多元素张量需要索引后再 `.item()` 或使用 `.tolist()`。

```python
t_multi = torch.tensor([1, 2, 3])
# print(t_multi.item())  # 错误！RuntimeError
print(t_multi[0].item())  # 1，正确
print(t_multi.tolist())    # [1, 2, 3]
```

---

### 6. 张量创建与转换方法总结表

| 操作类别 | 函数 | 说明 |
|----------|------|------|
| **从数据创建** | `torch.tensor(data)` | 推荐，可指定 dtype |
| | `torch.Tensor(data)` | 旧式，默认 float 32 |
| | `torch.IntTensor(data)` | 创建 int 32 类型 |
| **线性序列** | `torch.arange(start, end, step)` | 不包含 end |
| | `torch.linspace(start, end, steps)` | 包含 end |
| **随机张量** | `torch.rand(size)` | 均匀分布 [0,1) |
| | `torch.randn(size)` | 标准正态分布 |
| | `torch.randint(low, high, size)` | 随机整数 |
| **常数张量** | `torch.zeros(size)` / `torch.zeros_like(t)` | 全 0 |
| | `torch.ones(size)` / `torch.ones_like(t)` | 全 1 |
| | `torch.full(size, val)` / `torch.full_like(t, val)` | 全指定值 |
| | `torch.eye(n)` | 单位矩阵 |
| **类型转换** | `tensor.float()` / `tensor.long()` | 转换为指定类型 |
| | `tensor.type(torch.float32)` | 通用类型转换 |
| | `tensor.to(dtype, device)` | 最通用 |
| **与 NumPy 互转** | `torch.from_numpy(ndarray)` | 共享内存 |
| | `tensor.numpy()` | 共享内存 |
| **标量互转** | `torch.tensor(scalar)` | 数字 → 标量张量 |
| | `tensor.item()` | 标量张量 → 数字 |

---

## 第三部分：张量数值计算与运算函数

在深度学习中，张量之间需要进行大量的数值计算，包括基本算术运算、矩阵乘法、聚合运算和数学函数运算。PyTorch 提供了丰富且高效的运算接口。

---

### 1. 张量基本算术运算

PyTorch 支持张量与张量、张量与标量之间的基本算术运算，包括加法、减法、乘法、除法。这些运算支持**逐元素操作**（element-wise）。

---

#### 1.1 运算符形式（最常用）

使用 Python 运算符 `+`、`-`、`*`、`/` 进行运算，简洁直观。

```python
import torch

t = torch.tensor([1, 2, 3], dtype=torch.float32)
print(t)  # tensor([1., 2., 3.])

# 张量与标量运算（广播到每个元素）
print(t + 2)   # tensor([3., 4., 5.])
print(t - 2)   # tensor([-1.,  0.,  1.])
print(t * 2)   # tensor([2., 4., 6.])
print(t / 2)   # tensor([0.5000, 1.0000, 1.5000])

# 张量与张量逐元素运算
t1 = torch.tensor([1, 2, 3])
t2 = torch.tensor([4, 5, 6])
print(t1 + t2)  # tensor([5, 7, 9])
print(t1 * t2)  # tensor([4, 10, 18])   # 逐元素相乘，不是矩阵乘法
```

---

#### 1.2 函数形式

PyTorch 提供了对应的函数：`torch.add`、`torch.sub`、`torch.mul`、`torch.div`。

```python
result = torch.add(t1, t2)
result = torch.sub(t1, t2)
result = torch.mul(t1, t2)
result = torch.div(t1, t2)  # 注意：整数除法会转为浮点数
```

---

#### 1.3 原地操作（In-place operation）

以 `_` 结尾的函数表示**原地操作**，会直接修改原始张量，而不创建新张量。原地操作可以节省内存，但会丢失原始数据。

```python
t = torch.tensor([1, 2, 3], dtype=torch.float32)

# 原地加法
t.add_(2)
print(t)  # tensor([3., 4., 5.])

# 原地减法
t.sub_(2)
print(t)  # tensor([1., 2., 3.])

# 原地乘法
t.mul_(2)
print(t)  # tensor([2., 4., 6.])

# 原地除法（注意：除法的原地操作会自动转为浮点数）
t.div_(2)
print(t)  # tensor([1., 2., 3.])
```

**原地操作的注意事项**：

- 原地操作会改变张量的值，如果后续计算需要使用原始值，请使用非原地版本。
- 对于需要计算梯度的张量（`requires_grad=True`），原地操作可能干扰自动微分，需谨慎使用。

---

### 2. 矩阵乘法运算

在神经网络中，矩阵乘法（也称为点积或叉积）是最核心的运算之一（例如全连接层的计算）。PyTorch 提供了多种矩阵乘法的方式。

---

#### 2.1 使用 `@` 运算符

```python
# 示例：两个矩阵相乘
t1 = torch.tensor([[1, 2], [3, 4], [5, 6]])  # 形状 (3, 2)
t2 = torch.tensor([[2, 1], [1, 3], [3, 4]])  # 形状 (3, 2)

# 注意：直接 t1 @ t2 会报错，因为 (3,2) @ (3,2) 维度不匹配
# 需要转置其中一个

# 计算 (2,3) @ (3,2) = (2,2)
result = t1.T @ t2  # t1.T 形状 (2,3)，t2 形状 (3,2)
print(result)
```

---

#### 2.2 使用 `torch.matmul()` 函数

`torch.matmul` 是矩阵乘法的通用函数，支持高维张量的批量矩阵乘法（broadcasting）。

```python
# 等价于上面的 @ 运算
result = torch.matmul(t1.T, t2)
print(result)

# 示例：t1 (3,2) @ t2.T (2,3) = (3,3)
result = t1 @ t2.T
print(result)  # 形状 (3,3)
```

---

#### 2.3 使用 `torch.mm()`（仅限 2D 矩阵）

`torch.mm` 专门用于二维矩阵的乘法，不支持批处理或广播。

```python
a = torch.randn(3, 4)
b = torch.randn(4, 5)
c = torch.mm(a, b)  # 结果形状 (3, 5)
```

---

#### 2.4 使用 `torch.bmm()`（批量矩阵乘法）

用于批量处理多个矩阵乘法，输入必须是 3D 张量，形状为 (batch, n, m) 和 (batch, m, p)。

```python
batch_a = torch.randn(10, 3, 4)  # 10 个 3x4 矩阵
batch_b = torch.randn(10, 4, 5)  # 10 个 4x5 矩阵
batch_c = torch.bmm(batch_a, batch_b)  # 结果形状 (10, 3, 5)
```

**矩阵乘法函数对比**：

| 函数/运算符 | 适用维度 | 说明 |
|-------------|----------|------|
| `@` | 任意，遵循标准矩阵乘法规则 | 最简洁推荐 |
| `torch.matmul()` | 任意，支持广播 | 通用，推荐 |
| `torch.mm()` | 仅 2D | 传统，无广播 |
| `torch.bmm()` | 3D (batch) | 批量矩阵乘法 |

---

### 3. 张量聚合运算（求和、均值、最大值等）

聚合运算将张量的多个元素缩减为单个值或沿指定维度缩减。常用函数包括 `sum`、`mean`、`max`、`min`、`std` 等。

---

#### 3.1 基本聚合函数

```python
t = torch.tensor([[1, 2], [3, 4]])
print(torch.sum(t))   # 所有元素求和：10
print(torch.mean(t.float()))  # 均值：2.5（注意整数需转为浮点数）
print(torch.max(t))   # 最大值：4
print(torch.min(t))   # 最小值：1
print(torch.prod(t))  # 所有元素乘积：24
print(torch.std(t.float()))  # 标准差
```

---

#### 3.2 沿指定维度聚合（`dim` 参数）

`dim` 参数指定要缩减的维度。缩减后，该维度消失。

```python
# 创建 3 维张量，形状 (2, 2, 2)
t = torch.tensor([[[1, 2], [3, 4]], [[2, 1], [1, 3]]])
print(t.shape)  # torch.Size([2, 2, 2])

# 不指定 dim：所有元素求和
print(torch.sum(t))  # 1+2+3+4+2+1+1+3 = 17

# dim=0：沿第一维（batch 维度）求和，结果形状 (2, 2)
print(torch.sum(t, dim=0))
# tensor([[3, 3],
#         [4, 7]])

# dim=1：沿第二维（行维度）求和，结果形状 (2, 2)
print(torch.sum(t, dim=1))
# tensor([[4, 6],
#         [3, 4]])

# dim=2：沿第三维（列维度）求和，结果形状 (2, 2)
print(torch.sum(t, dim=2))
# tensor([[3, 7],
#         [3, 4]])
```

可视化理解 `dim` ：

- `dim=0`：压缩“层”维度，将每个位置上的多层元素合并。
- `dim=1`：压缩“行”维度，将每行内的元素合并。
- `dim=2`：压缩“列”维度，将每列内的元素合并。

---

#### 3.3 保持维度（`keepdim=True`）

使用 `keepdim=True` 可以保持缩减后的维度为 1，方便后续广播操作。

```python
t = torch.tensor([[1, 2], [3, 4]])

# 默认 keepdim=False，结果形状 (2,)
s1 = torch.sum(t, dim=1)
print(s1.shape)  # torch.Size([2])

# keepdim=True，结果形状 (2, 1)
s2 = torch.sum(t, dim=1, keepdim=True)
print(s2.shape)  # torch.Size([2, 1])
```

---

### 4. 数学运算函数

PyTorch 提供了丰富的数学函数，包括平方根、指数、对数、三角函数等。

---

#### 4.1 常用数学函数

```python
t = torch.tensor(4.0)

print(torch.sqrt(t))   # 平方根：2.0
print(torch.pow(t, 2)) # 幂运算：16.0
print(torch.exp(t))    # 指数函数 e^4 ≈ 54.598
print(torch.log(t))    # 自然对数：ln(4) ≈ 1.386
print(torch.log2(t))   # 以2为底对数：2.0
print(torch.log10(t))  # 以10为底对数：0.602
```

---

#### 4.2 三角函数

```python
angle = torch.tensor(3.14159 / 2)  # 90度近似
print(torch.sin(angle))   # 正弦：~1.0
print(torch.cos(angle))   # 余弦：~0.0
print(torch.tan(angle))   # 正切：极大值
```

---

#### 4.3 逐元素运算示例

这些函数也可以作用于张量的每个元素。

```python
t = torch.tensor([1.0, 4.0, 9.0])
print(torch.sqrt(t))  # tensor([1., 2., 3.])
print(torch.exp(t))   # tensor([2.7183, 54.5982, 8103.0839])
```

---

#### 4.4 其他常用函数

| 函数 | 说明 |
|------|------|
| `torch.abs(t)` | 绝对值 |
| `torch.round(t)` | 四舍五入 |
| `torch.floor(t)` | 向下取整 |
| `torch.ceil(t)` | 向上取整 |
| `torch.clamp(t, min, max)` | 截断到 [min, max] 区间 |
| `torch.sigmoid(t)` | Sigmoid 激活函数 |
| `torch.softmax(t, dim)` | Softmax 归一化 |

---

### 5. 张量数值计算总结表

| 操作类型 | 运算符/函数 | 原地版本 | 说明 |
|----------|-------------|----------|------|
| **加法** | `+`、`torch.add()` | `add_()` | 逐元素相加 |
| **减法** | `-`、`torch.sub()` | `sub_()` | 逐元素相减 |
| **乘法** | `*`、`torch.mul()` | `mul_()` | 逐元素相乘（非矩阵乘法） |
| **除法** | `/`、`torch.div()` | `div_()` | 逐元素相除 |
| **矩阵乘法** | `@`、`torch.matmul()` | 无 | 矩阵叉积 |
| **求和** | `torch.sum(t, dim)` | 无 | 沿指定维度求和 |
| **均值** | `torch.mean(t, dim)` | 无 | 沿指定维度求平均 |
| **最大值** | `torch.max(t, dim)` | 无 | 沿指定维度求最大值 |
| **最小值** | `torch.min(t, dim)` | 无 | 沿指定维度求最小值 |
| **平方根** | `torch.sqrt(t)` | `sqrt_()` | 逐元素平方根 |
| **指数** | `torch.exp(t)` | `exp_()` | 逐元素 e^x |
| **对数** | `torch.log(t)` | `log_()` | 逐元素自然对数 |
| **幂运算** | `torch.pow(t, p)` | `pow_()` | 逐元素取 p 次幂 |
| **截断** | `torch.clamp(t, min, max)` | `clamp_()` | 限制数值范围 |

---

## 第四部分：张量索引操作

在实际处理张量数据时，经常需要获取或修改特定位置的元素。PyTorch 提供了灵活且强大的索引方式，包括单索引、列表索引、切片索引、布尔索引和多维索引。

---

### 1. 索引的基本格式

张量索引的通用格式为：

```python
tensor[行索引, 列索引, 深度索引, ...]
```

其中每个维度的索引可以是以下四种形式之一：

- **单索引**：一个整数，表示选择该位置的单个元素。
- **列表索引**：一个整数列表，表示选择多个不连续的位置。
- **切片索引**：`start:stop:step`，表示选择一个连续区间。
- **布尔索引**：一个布尔类型的张量，选择值为 `True` 的位置。

以下示例均基于同一个 4×4 随机整数张量：

```python
import torch

torch.manual_seed(6)
t = torch.randint(low=0, high=10, size=(4, 4))
print(t)
# 可能的输出（因随机种子固定）：
# tensor([[6, 1, 4, 9],
#         [2, 5, 4, 7],
#         [3, 8, 2, 1],
#         [6, 4, 5, 9]])
```

---

### 2. 单索引方式

使用单个整数索引某个维度，选择该维度上的特定位置。

```python
# 获取第 1 行（索引 0）的所有列
print(t[0, :])   # tensor([6, 1, 4, 9])
print(t[0])      # 等价写法，省略列索引表示全部列
```

```python
# 获取第 1 列（索引 0）的所有行
print(t[:, 0])   # tensor([6, 2, 3, 6])
```

```python
# 获取第 2 行第 3 列的元素（索引 1, 2）
print(t[1, 2])   # tensor(4)
```

**注意事项**：

- 索引从 0 开始。
- 单个索引提取后会降维（例如从 2D 张量中取一行得到 1D 张量）。
- 可以使用负索引从末尾开始，如 `t[-1]` 表示最后一行。

---

### 3. 列表索引方式

使用整数列表可以选择多个不连续的位置。列表索引可以用于任意维度。

```python
# 获取第 1 行和第 3 行（索引 0 和 2）的所有列
print(t[[0, 2], :])   # 等价于 print(t[[0, 2]])
# tensor([[6, 1, 4, 9],
#         [3, 8, 2, 1]])
```

```python
# 获取第 1 列和第 3 列（索引 0 和 2）的所有行
print(t[:, [0, 2]])
# tensor([[6, 4],
#         [2, 4],
#         [3, 2],
#         [6, 5]])
```

```python
# 同时使用列表索引行和列（获取 (0,0), (0,2), (2,0), (2,2) 四个位置）
print(t[[0, 2], [0, 2]])   # 注意：这是组合索引，不是笛卡尔积
# tensor([6, 2])   # 即 t[0,0] 和 t[2,2]
```

如果需要笛卡尔积（所有行索引与所有列索引的组合），可以使用索引广播或 `torch.meshgrid`。

```python
# 获取行索引 [0,2] 和列索引 [0,2] 的 2x2 子块
rows = torch.tensor([0, 2])
cols = torch.tensor([0, 2])
result = t[rows[:, None], cols]   # 利用广播
print(result)
# tensor([[6, 4],
#         [3, 2]])
```

---

### 4. 切片索引方式

切片使用 `start:stop:step` 语法，用于选择连续的区间。与 Python 列表切片规则相同：

- `start`：起始索引（包含），默认为 0。
- `stop`：结束索引（**不包含**），默认为维度大小。
- `step`：步长，默认为 1。

```python
# 获取前 3 行（索引 0,1,2）
print(t[0:3, :])   # 等价于 print(t[0:3])
# tensor([[6, 1, 4, 9],
#         [2, 5, 4, 7],
#         [3, 8, 2, 1]])
```

```python
# 获取前 3 列（索引 0,1,2）
print(t[:, 0:3])
# tensor([[6, 1, 4],
#         [2, 5, 4],
#         [3, 8, 2],
#         [6, 4, 5]])
```

```python
# 获取第 2 行到第 4 行（索引 1 到 3），步长为 2
print(t[1:4:2, :])
# 索引 1 和 3（因为 1:4:2 取 1 和 3）
# tensor([[2, 5, 4, 7],
#         [6, 4, 5, 9]])
```

**切片与列表索引的区别**：

- 切片返回的是原张量的**视图**（共享内存），修改视图会影响原张量。
- 列表索引返回的是**新张量**（复制数据）。

```python
# 切片视图示例
sub = t[0:2, 0:2]
sub[0, 0] = 999
print(t[0, 0])  # 999，原张量被修改

# 列表索引返回副本
sub2 = t[[0,1], [0,1]]
sub2[0] = 888
print(t[0,0])   # 仍然是 999，不受影响
```

---

### 5. 布尔索引

布尔索引使用条件表达式生成布尔张量，然后选择所有值为 `True` 的位置。这是实现条件筛选的常用方法。

```python
# 获取所有小于 5 的元素
mask = t < 5
print(mask)
# tensor([[False,  True,  True, False],
#         [ True, False,  True, False],
#         [ True, False,  True,  True],
#         [False,  True, False, False]])

selected = t[mask]
print(selected)  # tensor([1, 4, 2, 4, 3, 2, 1, 4])
```

布尔索引通常用于需要根据条件修改或提取值的场景。

```python
# 将所有大于 5 的元素设置为 0
t[t > 5] = 0
print(t)
# tensor([[0, 1, 4, 0],
#         [2, 5, 4, 0],
#         [3, 0, 2, 1],
#         [0, 4, 5, 0]])
```

```python
# 复杂条件：获取第 1 行中大于 0 的元素
first_row = t[0]
mask2 = first_row > 0
print(first_row[mask2])  # tensor([1, 4])
```

**布尔索引注意事项**：

- 布尔索引返回的是**一维张量**（所有选中元素展平），除非使用 `torch.where` 保留形状。
- 可以使用 `torch.where(condition, x, y)` 实现更灵活的选择。

```python
# torch.where 示例：将小于5的元素保留，其他设为-1
result = torch.where(t < 5, t, torch.tensor(-1))
print(result)
```

---

### 6. 多维索引（高阶）

对于 3 维及以上的张量，索引方式完全类似，只需为每个维度提供索引。

```python
# 创建一个 3 维张量，形状 (2, 3, 4)
t3d = torch.randint(0, 10, (2, 3, 4))
print(t3d.shape)  # torch.Size([2, 3, 4])

# 获取第一层（dim=0 索引 0）的所有内容
print(t3d[0].shape)  # torch.Size([3, 4])

# 获取第一层，第一行，第二列
print(t3d[0, 0, 1])

# 使用切片获取第一个层的前两行和后两列
sub = t3d[0, 0:2, 2:4]
print(sub.shape)  # torch.Size([2, 2])
```

对于更高维度，可以使用 `...`（省略号）表示“所有中间的维度”。

```python
# ... 表示自动填充所有未显式指定的维度
t5d = torch.rand(2, 3, 4, 5, 6)
print(t5d[0, ..., 2].shape)  # 等价于 t5d[0, :, :, :, 2] -> (3,4,5)
```

---

### 7. 高级索引函数

#### 7.1 `torch.gather()`

沿指定维度收集指定索引位置的值。

```python
# 示例：逐行取指定列索引的值
t = torch.tensor([[1, 2, 3], [4, 5, 6], [7, 8, 9]])
indices = torch.tensor([[0, 2], [1, 0], [2, 1]])
result = torch.gather(t, dim=1, index=indices)
print(result)
# tensor([[1, 3],
#         [5, 4],
#         [9, 8]])
```

---

#### 7.2 `torch.scatter()`

将值写入指定索引位置，是 `gather` 的逆操作。

```python
# 将 [10, 20, 30] 写入指定位置
out = torch.zeros(3, 3)
indices = torch.tensor([[0], [2], [1]])
values = torch.tensor([10, 20, 30])
out.scatter_(dim=1, index=indices, src=values)
print(out)
# tensor([[10,  0,  0],
#         [ 0,  0, 20],
#         [ 0, 30,  0]])
```

---

#### 7.3 `torch.index_select()`

沿指定维度选择索引列表对应的子张量。

```python
t = torch.randn(3, 4)
indices = torch.tensor([0, 2])
selected = torch.index_select(t, dim=0, index=indices)  # 选择第0行和第2行
```

---

### 8. 索引操作总结表

| 索引类型 | 语法示例 | 返回类型 | 是否视图 | 适用场景 |
|----------|----------|----------|----------|----------|
| 单索引 | `t[0]`, `t[1,2]` | 降维后的张量 | 是（但对于整数索引返回的是切片视图？实际上整数索引会降维并复制？待验证）实际上整数索引返回的是一个**视图**（如果原始张量连续），但维度会减少。建议：单独整数索引一般不影响数据共享，但为避免混淆，修改时用切片 | 获取特定位置 |
| 列表索引 | `t[[0,2]]` | 新张量（复制） | 否 | 获取不连续的行/列 |
| 切片索引 | `t[0:3, 1:4]` | 视图（共享内存） | 是 | 获取连续子区域，高效 |
| 布尔索引 | `t[t>5]` | 新张量（一维） | 否 | 条件筛选 |
| `...` 省略号 | `t[0, ..., 2]` | 同规则 | 视情况 | 高维简化 |

**注意事项**：

1. 切片索引返回的是视图（共享内存），修改切片会影响原张量。
2. 列表索引和布尔索引返回的是副本（新内存），修改不影响原张量。
3. 布尔索引的结果总是一维的（所有满足条件的元素平铺）。如需保持形状，可使用 `torch.where`。
4. 使用 `t.clone()` 可以显式创建副本，避免意外修改。

---

## 第五部分：张量形状操作

在深度学习中，经常需要改变张量的形状以满足不同层的输入输出要求（例如展平特征图、调整维度顺序、增加或删除维度）。PyTorch 提供了丰富的形状操作函数。

---

### 1. `reshape()` —— 改变张量形状

`reshape()` 是最常用的形状变换函数，它可以在保证数据元素不变的情况下，将张量转换为指定的形状。新形状的总元素数量必须与原张量相同。

**语法**：`tensor.reshape(*shape)` 或 `torch.reshape(tensor, shape)`

```python
import torch

torch.manual_seed(6)
t = torch.randint(1, 10, (12,))  # 形状 (12,)
print(t.shape)  # torch.Size([12])

# 重塑为 3×4
t1 = t.reshape(3, 4)
print(t1.shape)  # torch.Size([3, 4])

# 重塑为 4×3
t2 = t.reshape(4, 3)
print(t2.shape)  # torch.Size([4, 3])

# 重塑为 2×6
t3 = t.reshape(2, 6)
print(t3.shape)  # torch.Size([2, 6])

# 重塑为 6×2
t4 = t.reshape(6, 2)
print(t4.shape)  # torch.Size([6, 2])

# 重塑为 1×1×12（三维）
t5 = t.reshape(1, 1, 12)
print(t5.shape)  # torch.Size([1, 1, 12])
```

**使用 `-1` 自动推断维度**：在 `reshape` 中可以使用 `-1` 让 PyTorch 自动计算该维度的大小。

```python
# 自动计算行数（总元素 12，列数为 4，则行数为 3）
t6 = t.reshape(-1, 4)
print(t6.shape)  # torch.Size([3, 4])

# 自动计算列数（总元素 12，行数为 2，则列数为 6）
t7 = t.reshape(2, -1)
print(t7.shape)  # torch.Size([2, 6])

# 可以多个 -1 吗？不行，只能有一个 -1
# t8 = t.reshape(-1, -1, 2)  # 错误！
```

**注意事项**：

- `reshape()` 尽可能返回视图（共享内存），但如果原张量内存不连续，则会返回副本。
- 与 `view()` 相比，`reshape()` 更安全（不会因内存不连续而报错）。

---

### 2. `squeeze()` —— 删除维度为 1 的维度

`squeeze()` 用于删除张量中所有**大小为 1 的维度**（降维）。如果不指定参数，则删除所有单维度；也可以指定 `dim` 删除特定位置的单维度（如果该维度大小不为 1，则不变）。

**语法**：`tensor.squeeze(dim=None)`

```python
# 创建一个形状 (1, 1, 12) 的张量
t6 = torch.randint(1, 10, (1, 1, 12))
print(t6.shape)  # torch.Size([1, 1, 12])

# 删除所有单维度
new_t6 = t6.squeeze()
print(new_t6.shape)  # torch.Size([12])  维度从 3 降为 1

# 删除指定 dim 的单维度（如果该维度大小为 1）
t7 = torch.randint(1, 10, (1, 3, 1, 4))
print(t7.shape)  # torch.Size([1, 3, 1, 4])

# 删除 dim=0（大小为1）
t7_squeeze0 = t7.squeeze(dim=0)
print(t7_squeeze0.shape)  # torch.Size([3, 1, 4])

# 删除 dim=2（大小为1）
t7_squeeze2 = t7.squeeze(dim=2)
print(t7_squeeze2.shape)  # torch.Size([1, 3, 4])

# 尝试删除 dim=1（大小为3，不是1）—— 不变
t7_squeeze1 = t7.squeeze(dim=1)
print(t7_squeeze1.shape)  # torch.Size([1, 3, 1, 4])  无变化
```

**典型应用**：卷积层输出通道数为 1 的特征图，使用 `squeeze()` 删除通道维度，便于可视化或送入全连接层。

---

### 3. `unsqueeze()` —— 增加维度为 1 的维度

`unsqueeze()` 在指定位置插入一个大小为 1 的新维度（升维）。通常用于在需要广播或匹配特定维度要求时。

**语法**：`tensor.unsqueeze(dim)`

- `dim` 范围：`[-dim-1, dim]`，正索引表示在指定位置前插入，负索引表示从末尾计数。

```python
t = torch.tensor([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
print(t.shape)  # torch.Size([12])

# 在 dim=0 位置插入新维度 -> (1, 12)
new_t1 = t.unsqueeze(dim=0)
print(new_t1.shape)  # torch.Size([1, 12])

# 在 dim=1 位置插入新维度 -> (12, 1)
new_t2 = t.unsqueeze(dim=1)
print(new_t2.shape)  # torch.Size([12, 1])

# 链式调用：先变为 (12,1)，再变为 (12,1,1)
new_t3 = t.unsqueeze(dim=1).unsqueeze(dim=2)
print(new_t3.shape)  # torch.Size([12, 1, 1])

# 使用负索引：在最后插入新维度 dim=-1 等价于 dim=1（对于1D张量）
new_t4 = t.unsqueeze(dim=-1)
print(new_t4.shape)  # torch.Size([12, 1])
```

**典型应用**：

- 将一维特征向量变为批处理维度（增加 batch 维度）。
- 在图像处理中增加通道维度（例如 `(H, W)` → `(1, H, W)`）。

---

### 4. `transpose()` —— 交换两个维度

`transpose()` 用于交换张量中两个指定维度的位置。它不改变数据内容，只改变维度的排列顺序。返回的是原张量的视图（共享内存）。

**语法**：`tensor.transpose(dim0, dim1)`

```python
# 创建一个 3 维张量，形状 (2, 3, 4)
t = torch.randint(1, 10, (2, 3, 4))
print(t.shape)  # torch.Size([2, 3, 4])

# 交换维度 0 和 1 -> (3, 2, 4)
t1 = t.transpose(dim0=0, dim1=1)
print(t1.shape)  # torch.Size([3, 2, 4])

# 交换维度 1 和 2 -> (2, 4, 3)
t2 = t.transpose(dim0=1, dim1=2)
print(t2.shape)  # torch.Size([2, 4, 3])

# 连续两次 transpose 可恢复
t3 = t.transpose(0, 1).transpose(1, 2)
print(t3.shape)  # torch.Size([3, 4, 2])
```

**注意事项**：

- `transpose` 返回的张量可能是**非连续**（non-contiguous）的，之后无法直接使用 `view()` 进行形状变换（需要先调用 `.contiguous()`）。
- 如果需要同时交换多个维度，建议使用 `permute()`。

---

### 5. `permute()` —— 重排所有维度

`permute()` 可以一次性按照指定的顺序重新排列张量的所有维度。相当于对多个维度进行广义的转置。

**语法**：`tensor.permute(*dims)`

```python
t = torch.randint(1, 10, (2, 3, 4))
print(t.shape)  # (2, 3, 4)

# 将维度顺序改为 (1, 2, 0) 即 (3, 4, 2)
t1 = t.permute(1, 2, 0)
print(t1.shape)  # torch.Size([3, 4, 2])

# 将维度顺序改为 (0, 2, 1) 即 (2, 4, 3)
t2 = t.permute(0, 2, 1)
print(t2.shape)  # torch.Size([2, 4, 3])
```

**与 `transpose` 的区别**：

- `transpose` 每次只能交换两个维度。
- `permute` 可以一次性重排所有维度，更灵活。
- 两者返回的都是视图，但也可能导致内存不连续。

---

### 6. `view()` 与 `contiguous()`

#### 6.1 `view()`

`view()` 也用于改变张量形状，与 `reshape()` 类似，但要求张量在内存中**连续**（contiguous）。如果张量不连续（例如经过 `transpose` 或 `permute` 之后），`view()` 会报错。

```python
t = torch.randn(2, 3, 4)
print(t.is_contiguous())  # True

# 使用 view 改变形状
t_view = t.view(2, 12)
print(t_view.shape)  # (2, 12)

# 经过 transpose 后，张量不连续
t_t = t.transpose(0, 1)
print(t_t.is_contiguous())  # False

# 以下代码会报错
# t_view2 = t_t.view(3, 8)   # RuntimeError: view size is not compatible with input tensor's size and stride
```

---

#### 6.2 `contiguous()`

`contiguous()` 返回张量的一个连续副本。如果原张量已连续，则返回自身；否则，返回重新排列内存后的新张量（复制数据）。

```python
t_t = t.transpose(0, 1)
t_c = t_t.contiguous()
print(t_c.is_contiguous())  # True

# 现在可以安全使用 view
t_view = t_c.view(3, 8)  # 成功
```

**建议**：

- 优先使用 `reshape()`，因为它在内部会自动处理连续性问题（必要时复制数据），代码更健壮。
- 如果明确需要共享内存并确保连续性，可以使用 `view()` 配合 `contiguous()`。

---

### 7. 形状操作函数总结表

| 函数 | 作用 | 是否可能返回视图 | 是否改变元素总数 | 典型应用场景 |
|------|------|------------------|------------------|----------------|
| `reshape()` | 改变形状，自动处理连续性问题 | 尽可能返回视图，否则副本 | 否 | 通用形状变换 |
| `view()` | 改变形状，要求张量连续 | 是（视图） | 否 | 连续张量的快速变形 |
| `squeeze()` | 删除所有或指定单维度（尺寸为 1 的维度） | 是 | 是（减少维度） | 删除不必要的单维 |
| `unsqueeze()` | 在指定位置插入单维度 | 是 | 是（增加维度） | 增加 batch 或通道维度 |
| `transpose()` | 交换两个维度 | 是（可能导致不连续） | 否（仅重排） | 交换特定两维，如通道与高度 |
| `permute()` | 重排所有维度 | 是（可能导致不连续） | 否（仅重排） | 灵活调整维度顺序 |
| `contiguous()` | 返回连续内存的副本 | 否（如果原不连续则复制） | 否 | 配合 `view()` 使用 |

---

### 8. 综合示例：形状操作流水线

以下示例模拟了深度学习中常见的形状操作流程：卷积特征图 → 展平 → 全连接层。

```python
# 模拟卷积输出的特征图：batch=4，通道=32，高度=8，宽度=8
feature_map = torch.randn(4, 32, 8, 8)
print("原始形状:", feature_map.shape)  # (4, 32, 8, 8)

# 步骤1：将通道、高度、宽度合并为一维（保持 batch 维度）
# 方法1：使用 reshape
flattened = feature_map.reshape(4, -1)
print("展平后形状:", flattened.shape)  # (4, 32*8*8=2048)

# 步骤2：增加一个维度（模拟添加序列长度维度，用于 RNN）
unsqueezed = flattened.unsqueeze(1)  # (4, 1, 2048)
print("增加维度后:", unsqueezed.shape)

# 步骤3：交换维度（模拟将 batch 和序列长度交换）
transposed = unsqueezed.transpose(0, 1)  # (1, 4, 2048)
print("交换维度后:", transposed.shape)

# 步骤4：再次变形，合并前两个维度
merged = transposed.reshape(-1, 2048)  # (1*4=4, 2048)
print("合并后形状:", merged.shape)  # 回到 (4, 2048)

# 步骤5：删除多余的维度（如果某维度为1）
squeezed = merged.unsqueeze(2).squeeze()  # 演示链式调用
print("最终形状:", squeezed.shape)  # (4, 2048)
```

---

## 第六部分：张量拼接操作

在实际应用中，经常需要将多个张量组合成一个更大的张量，例如在批处理中合并多个样本、在特征拼接操作中融合不同层的输出等。PyTorch 提供了 `torch.cat()` 和 `torch.stack()` 两个核心拼接函数。

---

### 1. `torch.cat()` —— 沿已有维度拼接

`torch.cat()` 将多个张量在**已有的维度**上拼接起来，**不增加新维度**。所有输入张量在非拼接维度上的形状必须完全相同。

**语法**：`torch.cat(tensors, dim=0, out=None)`

- `tensors`：待拼接的张量序列（列表或元组）。
- `dim`：沿哪个维度进行拼接（默认为 0）。

```python
import torch

torch.manual_seed(666)
t1 = torch.randint(1, 5, (3, 4))
t2 = torch.randint(1, 5, (3, 4))
print("t1:\n", t1)
print("t2:\n", t2)
```

**沿第 0 维（行）拼接**：

```python
# 沿 dim=0 拼接，要求除 dim=0 外的其他维度（此处为列数 4）相同
cat0 = torch.cat([t1, t2], dim=0)
print("沿 dim=0 拼接后的形状:", cat0.shape)  # (6, 4)
print(cat0)
# 结果：t1 的 3 行 + t2 的 3 行，共 6 行，列数不变
```

**沿第 1 维（列）拼接**：

```python
# 沿 dim=1 拼接，要求除 dim=1 外的其他维度（此处为行数 3）相同
cat1 = torch.cat([t1, t2], dim=1)
print("沿 dim=1 拼接后的形状:", cat1.shape)  # (3, 8)
print(cat1)
# 结果：t1 的 4 列 + t2 的 4 列，共 8 列，行数不变
```

**多个张量拼接**：

```python
t3 = torch.randint(1, 5, (3, 4))
cat_multi = torch.cat([t1, t2, t3], dim=0)  # (9, 4)
```

**注意事项**：

- 所有张量在非拼接维度上的形状必须完全一致，否则会报错。
- `cat()` 不会创建新维度，只是沿现有维度合并。

---

### 2. `torch.stack()` —— 在新维度上拼接

`torch.stack()` 会**创建一个新的维度**，并将输入张量沿着这个新维度堆叠起来。所有输入张量的形状必须**完全相同**。

**语法**：`torch.stack(tensors, dim=0, out=None)`

- `tensors`：待堆叠的张量序列（形状必须完全相同）。
- `dim`：新维度插入的位置（范围为 `[-len(shape)-1, len(shape)]`）。

```python
t1 = torch.randint(1, 5, (3, 4))
t2 = torch.randint(1, 5, (3, 4))

# 沿 dim=0 堆叠：新维度在最前面
stack0 = torch.stack([t1, t2], dim=0)
print("沿 dim=0 堆叠后的形状:", stack0.shape)  # (2, 3, 4)
# 结果：原来的 (3,4) 张量被放入一个长度为 2 的新维度中
```

```python
# 沿 dim=1 堆叠：新维度在第 1 维（行之后）
stack1 = torch.stack([t1, t2], dim=1)
print("沿 dim=1 堆叠后的形状:", stack1.shape)  # (3, 2, 4)
# 结果：在每个原张量的第 1 维（行）之后插入新维度
```

```python
# 沿 dim=2 堆叠：新维度在最后一维（列之后）
stack2 = torch.stack([t1, t2], dim=2)
print("沿 dim=2 堆叠后的形状:", stack2.shape)  # (3, 4, 2)
# 结果：在每个原张量的最后一维（列）之后插入新维度
```

**可视化对比（以两个 3×4 张量为例）**：

| 操作 | 结果形状 | 含义 |
|------|----------|------|
| `cat(dim=0)` | (6, 4) | 上下堆叠，行数相加 |
| `cat(dim=1)` | (3, 8) | 左右堆叠，列数相加 |
| `stack(dim=0)` | (2, 3, 4) | 新增第一维，表示“第几个张量” |
| `stack(dim=1)` | (3, 2, 4) | 新增第二维，每个行位置有两个“层” |
| `stack(dim=2)` | (3, 4, 2) | 新增第三维，每个列位置有两个“层” |

---

### 3. `cat()` 与 `stack()` 的区别总结

| 特性 | `torch.cat()` | `torch.stack()` |
|------|---------------|-----------------|
| **是否增加新维度** | 否 | 是 |
| **输入形状要求** | 除拼接维外其他维度必须相同 | 所有维度必须完全相同 |
| **输出形状变化** | 拼接维度大小 = 各张量该维度大小之和 | 新维度大小 = 输入张量个数，其他维度不变 |
| **典型应用** | 合并数据集、特征连接 | 将多个独立样本组成 batch、构建序列 |

**选择指南**：

- 如果只是简单地将多个张量“首尾相连”，用 `cat`。
- 如果需要将多个张量视为一个整体（如构成 batch 的多个样本），用 `stack` 增加新维度。

---

### 4. 完整示例代码

```python
import torch

# 创建两个形状相同的张量
a = torch.tensor([[1, 2], [3, 4]])
b = torch.tensor([[5, 6], [7, 8]])

print("a:\n", a)
print("b:\n", b)

# cat 拼接
cat_dim0 = torch.cat([a, b], dim=0)  # (4, 2)
cat_dim1 = torch.cat([a, b], dim=1)  # (2, 4)
print("cat(dim=0):\n", cat_dim0)
print("cat(dim=1):\n", cat_dim1)

# stack 堆叠
stack_dim0 = torch.stack([a, b], dim=0)  # (2, 2, 2)
stack_dim1 = torch.stack([a, b], dim=1)  # (2, 2, 2) 但排列不同
print("stack(dim=0):\n", stack_dim0)
print("stack(dim=1):\n", stack_dim1)

# 访问 stack 结果中的不同张量
print("stack(dim=0) 中的第一个张量:\n", stack_dim0[0])
print("stack(dim=1) 中的第一行第一列位置的两个值:", stack_dim1[0, :, 0])
```

---

### 5. 其他拼接相关函数

#### 5.1 `torch.vstack()` 和 `torch.hstack()`

- `torch.vstack(tensors)` 等价于 `torch.cat(tensors, dim=0)`（垂直堆叠）。
- `torch.hstack(tensors)` 等价于 `torch.cat(tensors, dim=1)`（水平堆叠）。

```python
v = torch.vstack([a, b])   # 形状 (4,2)
h = torch.hstack([a, b])   # 形状 (2,4)
```

---

#### 5.2 `torch.dstack()`

沿深度方向（第三维）堆叠，用于三维张量。

```python
# 将多个二维张量堆叠成三维张量（相当于 stack(dim=2)）
d = torch.dstack([a, b])   # 形状 (2, 2, 2)
```

---

### 6. 拼接操作注意事项

1. **数据类型和设备必须一致**：所有待拼接的张量应在同一设备上，且数据类型相同。
2. **内存效率**：拼接操作通常会产生新的内存分配，对大型张量频繁拼接可能效率不高，可考虑预分配空间后赋值。
3. **梯度传播**：拼接后的张量进行反向传播时，梯度会正确地传播到每个原始张量的相应部分。

---

**第六部分到此结束。以上内容涵盖了 `torch.cat` 和 `torch.stack` 的详细讲解，以及它们的区别、使用场景和相关函数。**

---

## PyTorch 完整学习笔记总结

根据提供的 PPT 内容，我们已经完整输出了以下六个部分：

1. **PyTorch 概述与安装** — 框架介绍、发展历史、安装方法。
2. **张量基础** — 张量概念、创建方法、类型转换、NumPy 互转、标量互转。
3. **张量数值计算与运算函数** — 基本算术、矩阵乘法、聚合运算、数学函数。
4. **张量索引操作** — 单索引、列表索引、切片索引、布尔索引、多维索引。
5. **张量形状操作** — reshape、squeeze、unsqueeze、transpose、permute、view、contiguous。
6. **张量拼接操作** — torch.cat 与 torch.stack 详解。
