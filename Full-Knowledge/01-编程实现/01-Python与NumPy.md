---
tags: [编程/Python/NumPy]
parent_moc: [[核心依赖链]]
aliases: [Python, NumPy, 张量操作]
layer: 层级1-编程实现
prerequisites: [向量, 矩阵]
successors: [PyTorch基础, 数据预处理, 特征工程]
---

# 深度卡片：Python与NumPy

## L1：是什么（定义/公式/结构）

### Python核心概念

| 概念 | 定义 | ML应用 |
|------|------|--------|
| 列表 | 有序可变序列 | 数据存储 |
| 字典 | 键值对映射 | 配置、特征映射 |
| 函数 | 可复用代码块 | 数据处理管道 |
| 类 | 面向对象编程 | 模型定义 |
| 装饰器 | 函数增强 | 框架API设计 |
| 生成器 | 惰性计算 | 大数据集加载 |

### NumPy核心概念

| 概念 | 定义 | 公式/结构 | ML应用 |
|------|------|-----------|--------|
| ndarray | N维数组 | 同类型数据的多维容器 | 张量运算基础 |
| 广播 | 不同形状数组运算 | 自动扩展较小数组 | 批量计算 |
| 索引 | 数组元素访问 | 切片、布尔索引 | 数据筛选 |
| 向量化运算 | 批量数学运算 | 无需显式循环 | 加速计算 |

### 核心API

```python
# NumPy核心操作
np.array()           # 创建数组
np.zeros/ones/eye()  # 特殊数组
np.random.*          # 随机数
np.dot()             # 点积/矩阵乘法
np.linalg.norm()     # 范数
np.mean/std()        # 统计量
```

---

## L2：为什么（设计意图/解决什么问题）

### 为什么需要Python？

**问题1：如何快速原型开发？**

Python语法简洁，开发效率高，适合：
- 数据探索和可视化
- 模型原型设计
- 算法验证

**问题2：如何与C/C++库集成？**

Python作为胶水语言，可以调用：
- NumPy（C实现的数组运算）
- PyTorch（C++实现的深度学习框架）
- OpenCV（C++实现的计算机视觉库）

**问题3：如何构建生态系统？**

Python拥有丰富的ML生态：
- 数据处理：Pandas、Polars
- 机器学习：scikit-learn
- 深度学习：PyTorch、TensorFlow
- 可视化：Matplotlib、Seaborn

### 为什么需要NumPy？

**问题1：Python列表运算太慢**

Python列表是动态类型的，每个元素都是对象，运算需要类型检查和动态调度。NumPy数组是同类型的，可以直接调用C函数，速度快10-100倍。

**问题2：如何进行向量化运算？**

NumPy支持向量化运算，无需显式循环：
```python
# Python循环（慢）
result = [x * 2 for x in range(1000000)]

# NumPy向量化（快）
arr = np.arange(1000000)
result = arr * 2
```

**问题3：如何进行批量矩阵运算？**

NumPy的广播机制允许不同形状的数组进行运算，适合批量处理数据。

---

## L3：怎么用（代码实现/调参/场景）

### Python进阶技巧

```python
# 列表推导式
squares = [x**2 for x in range(10)]

# 字典推导式
word_count = {word: text.count(word) for word in words}

# 生成器
def infinite_sequence():
    num = 0
    while True:
        yield num
        num += 1

# 装饰器
def timer(func):
    def wrapper(*args, **kwargs):
        start = time.time()
        result = func(*args, **kwargs)
        print(f"{func.__name__} took {time.time()-start:.4f}s")
        return result
    return wrapper
```

### NumPy核心操作

```python
import numpy as np

# 创建数组
arr = np.array([[1, 2, 3], [4, 5, 6]])

# 数学运算
np.dot(arr, arr.T)  # 矩阵乘法
np.linalg.norm(arr) # 范数
np.mean(arr, axis=0)# 沿轴求均值

# 广播
arr + 1  # 每个元素加1
arr * np.array([1, 2, 3])  # 每列乘以不同系数

# 索引
arr[arr > 3]  # 布尔索引
arr[0, :]     # 第一行
```

---

## L4：坑在哪（边界条件/失效场景/常见误解）

### 常见误解

| 误解 | 正确理解 | 后果 |
|------|----------|------|
| "Python很慢" | Python慢，但NumPy是C实现的 | 忽略NumPy的性能优势 |
| "NumPy数组就是列表" | NumPy数组是同类型的，连续内存 | 性能差异巨大 |

### 边界条件

**1. 内存限制**

NumPy数组占用连续内存，大数组可能超出内存：
- 1000×1000的float64数组：8MB
- 10000×10000的float64数组：800MB

**解决方案**：使用内存映射、分块处理、稀疏数组

**2. 数据类型问题**

NumPy默认使用float64，可能：
- 内存占用过大
- 计算速度较慢（GPU通常使用float32）

**解决方案**：使用dtype参数指定类型，如`np.float32`

**3. 广播陷阱**

广播可能产生意外结果：
```python
a = np.array([[1], [2], [3]])  # (3, 1)
b = np.array([1, 2, 3])        # (3,)
a + b  # 结果是(3, 3)，不是(3, 1)
```

---

## 💼 面试追问树

### Q1（基础）：NumPy数组和Python列表有什么区别？

**回答要点**：
1. 类型：NumPy数组同类型，列表可混合
2. 性能：NumPy运算快10-100倍（C实现）
3. 内存：NumPy连续内存，列表是对象引用
4. 功能：NumPy支持向量化运算、广播

### Q2（深挖）：什么是NumPy的广播机制？

**回答要点**：
1. 定义：不同形状数组进行算术运算
2. 规则：从右向左对齐维度，大小为1的维度可以扩展
3. 应用：批量计算、特征缩放
4. 陷阱：结果形状可能不符合预期

### Q3（边界）：什么时候不应该用NumPy？

**回答要点**：
1. 数据不是数值型：使用Pandas
2. 数据非常稀疏：使用稀疏数组（scipy.sparse）
3. 需要GPU加速：使用PyTorch张量
4. 需要自动微分：使用PyTorch/TensorFlow

---

## 🔗 关联知识网络

**上游依赖**：[[向量]], [[矩阵]]

**下游应用**：
- [[PyTorch基础]]：NumPy的GPU版本
- [[数据预处理]]：Pandas建立在NumPy之上
- [[特征工程]]：数值计算基础

**并列概念**：[[Pandas]], [[Matplotlib]]
