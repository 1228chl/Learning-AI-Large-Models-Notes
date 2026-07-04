# NumPy基础

**标签：** #NumPy #数据分析

---

## 1. 什么是NumPy

NumPy（Numerical Python）是Python科学计算库，核心对象是`ndarray`（N-dimensional array）——同类型数据的N维容器。

**为什么用NumPy而不是Python原生列表？**

| 对比项 | Python列表 | NumPy ndarray |
|--------|------------|---------------|
| 内存存储 | 分离式存储 | 连续内存块 |
| 数据类型 | 可混合 | 必须同一类型 |
| 运算速度 | 慢 | 快（底层C语言） |
| 并行支持 | 无 | 自动利用多核 |

---

## 2. ndarray属性

```python
import numpy as np

score = np.array([
    [80, 89, 86, 67, 79],
    [78, 97, 89, 67, 81],
    [90, 94, 78, 67, 74]
])

# 属性
print(score.shape)    # (3, 5) - 维度元组
print(score.ndim)     # 2 - 维度数
print(score.size)     # 15 - 元素总数
print(score.dtype)    # int64 - 元素类型
print(score.itemsize) # 8 - 每个元素字节数
```

---

## 3. 创建数组

```python
# 从列表创建
arr1 = np.array([1, 2, 3, 4, 5])

# 全0数组
arr2 = np.zeros((3, 4))

# 全1数组
arr3 = np.ones((2, 3))

# 等差序列
arr4 = np.arange(0, 10, 2)  # [0, 2, 4, 6, 8]

# 随机数
arr5 = np.random.random((3, 4))  # [0, 1)均匀分布
arr6 = np.random.randn(3, 4)    # 标准正态分布
```

---

## 4. 数组索引与切片

```python
arr = np.array([[1, 2, 3], [4, 5, 6], [7, 8, 9]])

# 二维索引
print(arr[0, 0])    # 1
print(arr[1, 2])    # 6

# 切片
print(arr[0:2, 0:2])  # [[1, 2], [4, 5]]
print(arr[:, 1])      # [2, 5, 8] - 第2列
```

---

## 5. 运算

```python
arr1 = np.array([[1, 2], [3, 4]])
arr2 = np.array([[5, 6], [7, 8]])

# 逐元素运算
print(arr1 + arr2)   # 加法
print(arr1 * arr2)   # 乘法

# 归约运算
print(np.sum(arr1))        # 求和
print(np.mean(arr1))       # 均值
print(np.max(arr1))        # 最大值
```
