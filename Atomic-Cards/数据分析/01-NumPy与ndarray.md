---
author: "XunZong"
created: "2026-07-06"
tags: ["数据分析", "NumPy", "数组"]
aliases: ["NumPy", "ndarray", "数值计算"]
---

# NumPy 与 ndarray

## 定义

NumPy 是 Python 生态中**数值计算的基础库**。其核心数据结构 `ndarray`（N-dimensional array）是一个高性能的**多维数组**，支持向量化运算和广播机制。

```python
import numpy as np

# 创建数组
a = np.array([1, 2, 3])                     # 1D
b = np.zeros((3, 4))                        # 全零 2D
c = np.ones((2, 3, 4))                      # 全零 3D
d = np.random.randn(100, 10)                # 标准正态分布
e = np.arange(0, 10, 2)                     # [0, 2, 4, 6, 8]
f = np.linspace(0, 1, 5)                    # [0.0, 0.25, 0.5, 0.75, 1.0]
```

## 核心特性

| 特性 | 说明 | 优势 |
|:----|:----|:----|
| **向量化运算** | 对数组整体操作，无需显式循环 | 比 Python for 循环快 10-100x |
| **广播机制** | 不同形状的数组自动扩展 | 简化代码，避免手动扩展 |
| **内存连续** | C 风格连续存储 | 缓存友好，访问高效 |
| **通用函数（ufunc）** | 逐元素操作 | `np.exp`、`np.sin`、`np.sqrt` |

```python
# 向量化 vs 循环
# Python 循环
result = [math.sqrt(x) for x in range(1000000)]   # ≈ 500ms

# NumPy 向量化
result = np.sqrt(np.arange(1000000))                # ≈ 20ms
```

## 索引与切片

```python
arr = np.array([[1, 2, 3], [4, 5, 6], [7, 8, 9]])

arr[0, 0]             # 1 — 精确索引
arr[:, 1]             # [2, 5, 8] — 所有行的第 1 列
arr[0:2, :]           # [[1,2,3], [4,5,6]] — 前两行所有列
arr > 5               # 布尔索引 → [[F,F,F],[F,F,T],[T,T,T]]
arr[arr > 5]          # [6, 7, 8, 9]

# 花式索引
indices = [0, 2]
arr[:, indices]       # [[1,3], [4,6], [7,9]]
```

## 数组运算

```python
a = np.array([1, 2, 3])
b = np.array([4, 5, 6])

a + b                 # [5, 7, 9]
a * b                 # [4, 10, 18] — 逐元素乘
a @ b                 # 32 — 点积
a.dot(b)              # 32 — 点积

# 聚合
a.sum()               # 6
a.mean()              # 2.0
a.std()               # 0.816
a.max()               # 3
a.argmax()            # 2（索引）
```

## ML 中的 NumPy

| 应用场景 | 代码 | 说明 |
|:--------:|:----|:----|
| **数据加载** | `np.loadtxt('data.csv', delimiter=',')` | 读取 CSV 数据 |
| **特征矩阵** | `X = np.random.randn(1000, 50)` | $n$ 样本 × $d$ 特征 |
| **距离计算** | `np.linalg.norm(x - y)` | 欧氏距离 |
| **矩阵运算** | `X.T @ X` / `np.linalg.inv(X.T @ X)` | 正规方程求解 |
| **数据标准化** | `(X - X.mean(axis=0)) / X.std(axis=0)` | StandardScaler |
| **独热编码** | `np.eye(10)[labels]` | 标签转 one-hot |

> 参见 [[02-广播机制]]、[[03-Pandas与DataFrame]]、[[07-PyTorch张量与运算]]
