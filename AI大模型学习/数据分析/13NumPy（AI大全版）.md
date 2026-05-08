1. **NumPy 基础与数组创建**  
2. **数组属性、数据类型与形状操作**  
3. **索引与切片（普通、布尔、花式索引）**  
4. **数组运算、广播机制与通用函数（ufunc）**  
5. **统计方法、线性代数与随机数**  
6. **高级操作：拼接、分割、重复、视图/副本**  
7. **结构化数组、内存布局与性能提示**

---

## 第一部分：NumPy 基础与数组创建

### 1.1 什么是 NumPy？

- NumPy（Numerical Python）是 Python 科学计算的核心库。
- 提供了高性能的 **N 维数组对象 ndarray**，以及用于数组快速运算的函数。
- 相比 Python 列表，ndarray 在内存占用、执行速度（向量化操作）上更优。

导入方式：
```python
import numpy as np
```

### 1.2 ndarray 的核心特点

- 同一数组中所有元素的数据类型**相同**（dtype 一致）。
- 支持**向量化运算**：对数组整体操作，无需显式循环。
- 采用**连续内存**存储，访问效率高。

### 1.3 创建数组的详细方法

#### （1）从列表或元组转换

```python
# 一维
arr1 = np.array([1, 2, 3, 4])

# 二维
arr2 = np.array([[1, 2], [3, 4]])

# 指定数据类型（dtype）
arr3 = np.array([1, 2, 3], dtype=np.float32)   # 结果为 [1., 2., 3.]

# 使用 copy 参数控制是否复制原数据
arr4 = np.array([1, 2, 3], copy=True)          # 强制复制
```

#### （2）全零、全一、未初始化、填充常数

```python
zeros = np.zeros((3, 4))          # 3行4列全0，默认 float64
zeros_int = np.zeros((2, 2), dtype=int)

ones = np.ones((2, 3))            # 全1
empty = np.empty((2, 2))          # 未初始化（内存中的随机值），速度最快
full = np.full((3, 2), 7)         # 填充为7，形状 3x2
```

#### （3）等差序列 & 等差数列

```python
# arange([start,] stop[, step], dtype=None)
ar1 = np.arange(5)                # [0,1,2,3,4]
ar2 = np.arange(2, 10, 2)         # [2,4,6,8]

# linspace(start, stop, num=50, endpoint=True, retstep=False)
lin1 = np.linspace(0, 1, 5)       # [0., 0.25, 0.5, 0.75, 1.]
lin2, step = np.linspace(0,1,5, retstep=True)  # step = 0.25

# logspace(start, stop, num=50, base=10.0)
log1 = np.logspace(0, 2, 3)       # [1., 10., 100.]  即 10^0,10^1,10^2
```

#### （4）单位矩阵与对角矩阵

```python
eye = np.eye(3)                   # 3x3单位阵，对角线1，其他0
eye2 = np.eye(3, k=1)             # 偏移对角线，k=1 向右偏移
# [[0,1,0],
#  [0,0,1],
#  [0,0,0]]

diag1 = np.diag([1, 2, 3])        # 3x3对角阵，对角线为1,2,3
diag2 = np.diag([1, 2, 3], k=1)   # 偏移对角线
```

#### （5）使用 `np.fromfunction` 通过函数创建

```python
def f(i, j):
    return i + j
arr = np.fromfunction(f, (3, 4), dtype=int)   # 生成3x4矩阵，每个位置值 = i+j
```

#### （6）随机数数组（详细在后面的随机数部分展开）

```python
np.random.rand(2, 3)          # 均匀分布 [0,1)
np.random.randn(2, 3)         # 标准正态分布
np.random.randint(0, 10, (2, 3))  # 整数随机
```

### 1.4 常用辅助函数

```python
# 复制数组
copy_arr = np.copy(arr)       # 等价于 arr.copy()

# 从缓冲区/字符串创建
frombuffer = np.frombuffer(b'\x01\x02', dtype=np.uint8)   # [1,2]
fromiter = np.fromiter(range(5), dtype=int)                # [0,1,2,3,4]
```

---

## 第二部分：数组属性与形状操作

### 2.1 数组的基本属性

创建一个示例数组：
```python
import numpy as np
arr = np.array([[1, 2, 3],
            [4, 5, 6]])
```

| 属性                    | 说明                             | 示例输出                         |
| ----------------------- | -------------------------------- | -------------------------------- |
| `arr.shape`             | 元组，表示各维度的长度           | `(2, 3)`                         |
| `arr.ndim`              | 数组的维度数（秩）               | `2`                              |
| `arr.size`              | 元素总个数                       | `6`                              |
| `arr.dtype`             | 元素的数据类型                   | `int64`（或 `int32` 取决于系统） |
| `arr.itemsize`          | 每个元素的字节数                 | `8`（int64）                     |
| `arr.nbytes`            | 数组总字节数 = `size × itemsize` | `48`                             |
| `arr.T`                 | 转置（对于二维及以上）           | `shape` 变为 `(3, 2)`            |
| `arr.real` / `arr.imag` | 复数数组的实部和虚部             | 若数组是复数类型才有效           |
| `arr.flags`             | 内存布局信息（C连续/F连续等）    | 查看 `C_CONTIGUOUS` 等           |

代码演示：
```python
print("shape:", arr.shape)          # (2, 3)
print("ndim:", arr.ndim)            # 2
print("size:", arr.size)            # 6
print("dtype:", arr.dtype)          # int64
print("itemsize:", arr.itemsize)    # 8
print("nbytes:", arr.nbytes)        # 48
print("T:\n", arr.T)                # [[1,4],[2,5],[3,6]]
```

### 2.2 数据类型（dtype）详解

NumPy 支持比 Python 更丰富的数据类型，通常以 `类型名+位数` 命名。

| 类型                                  | 描述              | 示例             |
| ------------------------------------- | ----------------- | ---------------- |
| `int8`, `int16`, `int32`, `int64`     | 有符号整数        | `np.int8`        |
| `uint8`, `uint16`, `uint32`, `uint64` | 无符号整数        | `np.uint8`       |
| `float16`, `float32`, `float64`       | 浮点数            | `np.float32`     |
| `complex64`, `complex128`             | 复数（实部+虚部） | `np.complex128`  |
| `bool`                                | 布尔型            | `np.bool_`       |
| `object`                              | Python 对象       | `np.object_`     |
| `string_` / `bytes_`                  | 固定长度字节串    | `S10` 表示10字节 |
| `unicode_`                            | 固定长度 Unicode  | `U10`            |

#### 查看与转换 dtype

```python
a = np.array([1, 2, 3], dtype=np.float32)
print(a.dtype)          # float32

# 转换 dtype（返回新数组）
b = a.astype(np.int32)  # [1,2,3]
c = a.astype(np.complex64)

# 安全转换（不会溢出检查，谨慎使用）
d = np.array([300], dtype=np.uint8)   # 溢出：300 % 256 = 44
```

#### 字节顺序

```python
dt = np.dtype('>i4')    # big-endian 4字节整数
dt = np.dtype('<i4')    # little-endian
# 可通过 arr.byteswap() 交换字节序
```

### 2.3 形状操作

#### （1）查看形状

```python
arr = np.arange(12)      # shape (12,)
arr.shape                # (12,)
```

#### （2）改变形状：`reshape`、`resize`

```python
# reshape：返回新视图（尽可能），不修改原数组
arr = np.arange(12)
reshaped = arr.reshape(3, 4)   # shape (3,4)
reshaped[0,0] = 99             # 会影响 arr（因为是视图）
print(arr[0])                  # 输出 99

# 使用 -1 自动推断某一维度
arr.reshape(2, -1)             # 自动计算为 (2,6)
arr.reshape(-1, 4)             # (3,4)

# resize：两种用法
# 1. ndarray.resize(new_shape) ：原地修改，不返回新数组（可能返回 None）
arr.resize(2, 6)               # arr 形状变为 (2,6)
# 2. np.resize(arr, new_shape) ：返回新数组（不改变原数组），但会重复填充
b = np.resize(np.arange(4), (3, 3))   # 重复 [0,1,2,3] 填充
```

#### （3）展平：`flatten` vs `ravel`

```python
arr = np.arange(6).reshape(2, 3)
# flatten：返回副本，不共享数据
flat_copy = arr.flatten()
flat_copy[0] = 99
print(arr[0,0])          # 仍是 0

# ravel：尽可能返回视图（若内存连续），否则返回副本
ravel_view = arr.ravel()
ravel_view[0] = 88
print(arr[0,0])          # 变为 88

# ravel 可以指定 order 参数：'C'（行主序），'F'（列主序），'A'（按存储顺序）
arr.ravel(order='F')
```

#### （4）转置与轴交换

```python
arr = np.arange(6).reshape(2, 3)
trans = arr.T                     # 转置 (3,2)

# 更高维：transpose 可以指定轴的顺序
arr3d = np.arange(24).reshape(2, 3, 4)
transposed = arr3d.transpose(1, 0, 2)   # 原轴(0,1,2) -> (1,0,2)

# 更简单的轴交换：swapaxes
swapped = arr3d.swapaxes(0, 1)          # 交换第0和第1轴
```

#### （5）增加或删除维度

```python
a = np.array([1, 2, 3])           # shape (3,)

# 增加新维度
b = a[np.newaxis, :]              # shape (1,3)
c = a[:, np.newaxis]              # shape (3,1)

# 使用 np.expand_dims
d = np.expand_dims(a, axis=0)     # shape (1,3)

# 删除长度为1的维度
e = np.squeeze(b)                 # 变回 (3,)
# 可指定 axis 删除特定单维度
arr = np.zeros((1,2,1,3))
squeezed = np.squeeze(arr, axis=(0,2))   # shape (2,3)
```

### 2.4 数组连接与堆叠（部分基础，详细在第6部分）

简单示例：
```python
a = np.array([[1,2],[3,4]])
b = np.array([[5,6],[7,8]])

# 垂直堆叠
v = np.vstack((a,b))     # (4,2)
# 水平堆叠
h = np.hstack((a,b))     # (2,4)
# 深度堆叠（用于三维）
d = np.dstack((a,b))     # (2,2,2)
```

---

## 第三部分：索引与切片（普通、布尔、花式索引）

### 3.1 基本索引（与 Python 列表类似但支持多维）

#### 一维数组索引

```python
import numpy as np
arr = np.array([10, 20, 30, 40, 50])

# 正向索引（从 0 开始）
print(arr[0])     # 10
print(arr[2])     # 30

# 负向索引（从 -1 开始）
print(arr[-1])    # 50
print(arr[-3])    # 30
```

#### 多维数组索引

```python
arr2d = np.array([[1, 2, 3],
                  [4, 5, 6],
                  [7, 8, 9]])

# 标准方式：arr[行, 列]
print(arr2d[0, 1])     # 2
print(arr2d[2, 2])     # 9

# 也可以写成 arr[0][1]（不推荐，效率略低）
print(arr2d[0][1])     # 2

# 获取整行
print(arr2d[1])        # [4,5,6]

# 获取整列（通过切片，见下文）
print(arr2d[:, 0])     # [1,4,7]
```

### 3.2 切片（slice）

语法：`start:stop:step`，与列表一致，但**多维数组每维可单独切片**。

#### 一维切片

```python
arr = np.array([0, 1, 2, 3, 4, 5])
print(arr[1:4])       # [1,2,3]
print(arr[:3])        # [0,1,2]
print(arr[3:])        # [3,4,5]
print(arr[::2])       # [0,2,4]
print(arr[::-1])      # [5,4,3,2,1,0] 反转
```

#### 多维切片

```python
arr2d = np.arange(12).reshape(3, 4)
# array([[ 0,  1,  2,  3],
#        [ 4,  5,  6,  7],
#        [ 8,  9, 10, 11]])

# 取前两行、后两列
sub = arr2d[:2, 2:4]   # [[2,3],[6,7]]

# 所有行，第1列（索引1）
col = arr2d[:, 1:2]    # 注意保持二维形状 -> [[1],[5],[9]]
# 若想得到一维：arr2d[:, 1]

# 步进切片
step = arr2d[::2, ::2]  # [[0,2],[8,10]]

# 省略号（...）代表“所有剩下的维度”
arr3d = np.arange(24).reshape(2, 3, 4)
print(arr3d[0, ...])     # 等价于 arr3d[0, :, :]
print(arr3d[..., 1])     # 等价于 arr3d[:, :, 1]
```

**重要：切片返回的是原数组的视图（view）**，修改视图会影响原数组。

```python
arr = np.arange(5)
view = arr[1:4]
view[0] = 99
print(arr)   # [0,99,2,3,4]  原数组被改变
```

如果需要独立副本，使用 `.copy()`：
```python
copy_slice = arr[1:4].copy()
copy_slice[0] = 100
print(arr)   # 未改变
```

### 3.3 整数数组索引（花式索引，Fancy Indexing）

使用整数列表或数组作为索引，返回**副本**（不是视图）。

#### 一维花式索引

```python
arr = np.array([10, 20, 30, 40, 50])
indices = [0, 2, 4]
print(arr[indices])      # [10,30,50]

indices = np.array([-1, -2])
print(arr[indices])      # [50,40]
```

#### 二维花式索引

可以分别指定行索引和列索引，形状由广播决定。

```python
arr2d = np.arange(12).reshape(3, 4)
# [[ 0, 1, 2, 3],
#  [ 4, 5, 6, 7],
#  [ 8, 9,10,11]]

# 取 (0,1) 和 (2,3) 两个元素
rows = [0, 2]
cols = [1, 3]
print(arr2d[rows, cols])   # [1, 11]

# 如果行/列索引是列向量和行向量，会生成矩形区域（广播）
rows = [[0], [2]]          # shape (2,1)
cols = [1, 2]              # shape (2,)
result = arr2d[rows, cols] # shape (2,2)
# [[1,2],
#  [9,10]]
```

#### 花式索引与切片混用

```python
# 取第0行和第2行的第1~3列
arr2d[[0,2], 1:4]   # shape (2,3)
```

### 3.4 布尔索引（Boolean Indexing）

使用布尔数组作为索引，返回**满足条件**的元素（副本）。

#### 一维布尔索引

```python
arr = np.array([1, 2, 3, 4, 5])
mask = arr > 3
print(mask)           # [False, False, False, True, True]
print(arr[mask])      # [4,5]

# 直接写条件
print(arr[arr > 3])   # [4,5]

# 组合条件（使用 & | ~，注意括号）
print(arr[(arr > 2) & (arr < 5)])   # [3,4]
print(arr[(arr <= 2) | (arr >= 4)]) # [1,2,4,5]
print(arr[~(arr == 3)])             # [1,2,4,5]
```

#### 二维布尔索引

```python
arr2d = np.arange(12).reshape(3, 4)
# [[ 0, 1, 2, 3],
#  [ 4, 5, 6, 7],
#  [ 8, 9,10,11]]

mask = arr2d > 5
print(arr2d[mask])   # 返回一维数组 [6,7,8,9,10,11]

# 按行应用条件：选取所有大于5的行的整行？
# 若需要选取满足条件的行，可以使用 any 或 all
row_mask = np.any(arr2d > 10, axis=1)  # 每行是否有>10的元素
print(arr2d[row_mask])                 # 第3行 [[8,9,10,11]]
```

#### 布尔索引的赋值

布尔索引可以直接赋值，非常高效。

```python
arr = np.arange(10)
arr[arr % 2 == 1] = -1     # 将所有奇数设为 -1
print(arr)                 # [ 0, -1, 2, -1, 4, -1, 6, -1, 8, -1]

arr2d = np.random.rand(4, 4)
arr2d[arr2d > 0.5] = 1
arr2d[arr2d <= 0.5] = 0
```

### 3.5 使用 `np.where` 进行条件选择

`where(condition, x, y)` 返回满足 condition 的位置取 x，否则取 y。类似三元运算符。

```python
arr = np.array([1, 2, 3, 4, 5])
result = np.where(arr > 3, arr, 0)    # [0,0,0,4,5]

# 仅返回满足条件的索引（一维）
indices = np.where(arr > 3)           # (array([3,4]),)
```

对于多维，`np.where` 返回满足条件的索引元组，常与布尔索引配合。

```python
arr2d = np.array([[1,2],[3,4]])
rows, cols = np.where(arr2d > 2)      # rows=[0,1], cols=[1,1]
```

### 3.6 其他高级索引技巧

#### `np.take` 和 `np.put`

- `take`：沿轴取指定索引的元素（类似花式索引但可指定axis）
- `put`：将值放入指定位置

```python
arr = np.arange(10)
indices = [1, 3, 5]
print(np.take(arr, indices))      # [1,3,5]

# 沿轴
arr2d = np.arange(12).reshape(3,4)
np.take(arr2d, [0,2], axis=0)     # 取第0行和第2行

# put 会修改原数组
np.put(arr, indices, [99,100,101])
print(arr)   # [0,99,2,100,4,101,6,7,8,9]
```

#### `np.ix_` 构造笛卡尔积索引

```python
arr = np.arange(12).reshape(3,4)
rows = np.ix_([0,2], [1,3])       # 返回一个可广播的索引元组
print(arr[rows])                  # 取 (0,1),(0,3),(2,1),(2,3)
# [[1,3],
#  [9,11]]
```

### 3.7 索引与视图/副本总结

| 索引方式                    | 返回类型       | 是否共享数据             |
| --------------------------- | -------------- | ------------------------ |
| 基本索引（标量）            | 标量           | 不适用                   |
| 切片 `[start:stop:step]`    | 视图（view）   | 是，修改影响原数组       |
| 整数数组索引（花式索引）    | 副本（copy）   | 否                       |
| 布尔索引                    | 副本           | 否                       |
| `arr.take()`                | 副本           | 否                       |
| `arr.reshape()`（可能视图） | 视图（若可能） | 通常是视图（内存连续时） |
| `arr.flatten()`             | 副本           | 否                       |
| `arr.ravel()`               | 视图（若可能） | 共享（内存连续时）       |

**验证视图还是副本**：通过 `np.may_share_memory(a, b)` 或修改后观察原数组。

---

## 第四部分：数组运算、广播机制与通用函数（ufunc）

### 4.1 数组算术运算（逐元素）

NumPy 支持标准的算术运算符，对数组执行**逐元素**操作。

```python
import numpy as np

a = np.array([1, 2, 3, 4])
b = np.array([10, 20, 30, 40])

# 加法
print(a + b)               # [11 22 33 44]
print(np.add(a, b))        # 等价

# 减法
print(b - a)               # [ 9 18 27 36]
print(np.subtract(b, a))

# 乘法
print(a * b)               # [ 10  40  90 160]
print(np.multiply(a, b))

# 除法
print(b / a)               # [10. 10. 10. 10.]
print(np.divide(b, a))

# 整数除法
print(b // a)              # [10 10 10 10]
print(np.floor_divide(b, a))

# 取余（模运算）
print(b % a)               # [0 0 0 0]
print(np.mod(b, a))

# 幂运算
print(a ** 2)              # [ 1  4  9 16]
print(np.power(a, 2))

# 负数
print(-a)                  # [-1 -2 -3 -4]
print(np.negative(a))
```

**运算符优先级**与 Python 一致，建议使用括号明确意图。

### 4.2 比较运算（返回布尔数组）

逐元素比较，返回布尔型数组。

```python
a = np.array([1, 2, 3, 4])
b = np.array([3, 2, 1, 4])

print(a > b)        # [False False  True False]
print(a >= b)       # [False  True  True  True]
print(a < b)        # [ True False False False]
print(a <= b)       # [ True  True False  True]
print(a == b)       # [False  True False  True]
print(a != b)       # [ True False  True False]
```

### 4.3 逻辑运算组合

对布尔数组使用 `&`（与）、`|`（或）、`~`（非）进行逐元素逻辑运算。

```python
a = np.arange(10)
mask1 = a > 3
mask2 = a < 7
print(mask1 & mask2)        # (a>3) and (a<7)
print(np.logical_and(mask1, mask2))   # 等价的函数形式

print(mask1 | mask2)        # (a>3) or (a<7)
print(np.logical_or(mask1, mask2))

print(~mask1)               # not (a>3)
print(np.logical_not(mask1))
```

**注意**：不能使用 `and`、`or`、`not`（它们试图把整个数组当作一个布尔值，会抛出 `ValueError`）。

### 4.4 广播机制（Broadcasting）

当两个数组形状不同时，NumPy 会尝试**广播**使得形状兼容，然后执行逐元素操作。

#### 广播规则

1. **从尾部维度开始比较**（即从最后一个轴向前）。
2. **每个维度上的长度必须相等**，或者其中一个为 1，或者其中一个缺失。
3. 符合规则后，长度为 1 的维度会被“拉伸”到匹配另一个数组的长度。

#### 示例 1：标量与数组

```python
arr = np.array([1, 2, 3])
result = arr + 10          # 10 被广播为 [10,10,10]
print(result)              # [11,12,13]
```

#### 示例 2：列向量与行向量

```python
col = np.array([[1], [2], [3]])   # shape (3,1)
row = np.array([10, 20, 30])      # shape (3,)
# 广播后 col 变为 (3,3)，row 变为 (3,3)
result = col + row
# [[11,21,31],
#  [12,22,32],
#  [13,23,33]]
```

#### 示例 3：二维与一维

```python
A = np.ones((4, 5))        # shape (4,5)
b = np.array([1,2,3,4,5])  # shape (5,)
# 广播：b 被加到 A 的每一行上
C = A + b                  # shape (4,5)
```

#### 示例 4：不兼容情况

```python
A = np.ones((3, 4))
B = np.ones((2, 4))
# A + B  会抛出 ValueError: operands could not be broadcast together
# 因为维度 3 != 2 且没有一个为 1
```
>这是因为 NumPy 的广播机制（broadcasting）规则不满足。广播允许两个形状不同数组进行运算，但必须满足：
>从尾部（最后一个维度）开始向前对齐，每个维度上的长度要么相等，要么其中一个为 1，否则无法广播。
>对于 `A.shape = (3, 4)`，`B.shape = (2, 4)`：
> - 尾部维度：`4` 和 `4` → 相等 ✅
> - 向前一个维度：`3` 和 `2` → 不相等，并且两个都不是 1 ❌
>
>因此广播失败，抛出 `ValueError: operands could not be broadcast together`。

#### 手动广播：`np.broadcast_to`

```python
arr = np.array([1,2,3])
broadcasted = np.broadcast_to(arr, (4,3))   # 将一维数组广播到 4x3
print(broadcasted)
# [[1,2,3],
#  [1,2,3],
#  [1,2,3],
#  [1,2,3]]
```

#### 广播后的形状推断：`np.broadcast_shapes`

```python
from numpy import broadcast_shapes
shape = broadcast_shapes((3,1), (5,))   # 返回 (3,5)
```

### 4.5 通用函数（ufunc）

**ufunc** 是对数组进行逐元素运算的函数，支持广播和多种方法（如 `reduce`、`accumulate`、`outer` 等）。

#### 常用数学 ufunc

| 分类     | 函数名                                                     |
| -------- | ---------------------------------------------------------- |
| 三角函数 | `sin`, `cos`, `tan`, `arcsin`, `arccos`, `arctan`, `hypot` |
| 双曲函数 | `sinh`, `cosh`, `tanh`, `arcsinh`, `arccosh`, `arctanh`    |
| 指数对数 | `exp`, `exp2`, `expm1`, `log`, `log2`, `log10`, `log1p`    |
| 幂运算   | `power`, `sqrt`, `cbrt`, `square`                          |
| 四舍五入 | `ceil`, `floor`, `trunc`, `rint`（四舍五入到整数）         |
| 符号处理 | `absolute`（`abs`）, `sign`, `negative`, `reciprocal`      |
| 比较     | `greater`, `less`, `equal`, `not_equal` 等（见前文）       |
| 逻辑     | `logical_and`, `logical_or`, `logical_not`, `logical_xor`  |

#### 示例

```python
x = np.linspace(0, np.pi, 4)
print(np.sin(x))      # [0.0000000e+00 8.6602540e-01 8.6602540e-01 1.2246468e-16]
print(np.exp(x))      # [ 1.          2.71828183  7.3890561  20.08553692]
print(np.sqrt(x))     # [0.         1.         1.41421356 1.73205081]
```

#### ufunc 的 `out` 参数（避免创建新数组）

```python
a = np.array([1,2,3])
b = np.array([4,5,6])
result = np.empty(3)
np.add(a, b, out=result)   # 将结果存入 result，无新分配
```

#### ufunc 的 `reduce` 方法（累积运算到单一值）

类似于 Python 的 `reduce`，沿指定轴连续应用 ufunc。

```python
a = np.array([1,2,3,4])
print(np.add.reduce(a))      # 1+2+3+4 = 10
print(np.multiply.reduce(a)) # 1*2*3*4 = 24

# 沿轴 reduce
arr2d = np.array([[1,2,3],[4,5,6]])
print(np.add.reduce(arr2d, axis=0))  # [5,7,9]  列求和
print(np.add.reduce(arr2d, axis=1))  # [6,15]   行求和
```

#### ufunc 的 `accumulate` 方法（保留中间结果）

```python
a = np.array([1,2,3,4])
print(np.add.accumulate(a))   # [1,3,6,10]  累加
print(np.multiply.accumulate(a))  # [1,2,6,24]
```

#### ufunc 的 `outer` 方法（外积）

```python
a = np.array([1,2,3])
b = np.array([4,5,6])
print(np.add.outer(a, b))
# [[5,6,7],
#  [6,7,8],
#  [7,8,9]]

print(np.multiply.outer(a, b))
# [[ 4, 5, 6],
#  [ 8,10,12],
#  [12,15,18]]
```

#### 自定义 ufunc：`np.frompyfunc` 和 `np.vectorize`

- `frompyfunc` 将 Python 函数转换为 ufunc，效率较低，仅作兼容。
- `vectorize` 类似装饰器，也是方便语法，但不提升性能。

```python
def my_func(x, y):
    return x**2 + y**2

ufunc_my = np.frompyfunc(my_func, 2, 1)  # 2个输入，1个输出
a = np.array([1,2,3])
b = np.array([4,5,6])
print(ufunc_my(a, b))   # 返回 object 数组，可 astype(float)
```

### 4.6 聚合函数（Aggregations）

虽然是单独的函数，但许多底层也是 ufunc 的 `reduce`。

#### 常用聚合

| 函数            | 作用                   | 可用的 axis 参数 |
| --------------- | ---------------------- | ---------------- |
| `np.sum`        | 求和                   | 是               |
| `np.prod`       | 求积                   | 是               |
| `np.mean`       | 算术平均               | 是               |
| `np.std`        | 标准差                 | 是               |
| `np.var`        | 方差                   | 是               |
| `np.min`        | 最小值                 | 是               |
| `np.max`        | 最大值                 | 是               |
| `np.argmin`     | 最小值的索引（平铺后） | 是               |
| `np.argmax`     | 最大值的索引           | 是               |
| `np.median`     | 中位数                 | 是（需注意轴）   |
| `np.percentile` | 百分位数               | 是               |
| `np.any`        | 是否存在 True          | 是               |
| `np.all`        | 是否全部 True          | 是               |

#### 示例

```python
arr = np.array([[1,2,3],[4,5,6]])
print(np.sum(arr))          # 21
print(np.sum(arr, axis=0))  # [5,7,9]
print(np.sum(arr, axis=1))  # [6,15]

print(np.mean(arr, axis=0)) # [2.5,3.5,4.5]
print(np.std(arr))          # 1.707825...
print(np.argmax(arr))       # 5（平铺后的索引，一维位置）
print(np.argmax(arr, axis=1))  # [2,2] 每行最大值的列索引
```

**注意**：`np.median` 和 `np.percentile` 在 NumPy 中不是 ufunc，但也可指定轴。

### 4.7 向量化操作 vs Python 循环

向量化（使用 ufunc/聚合）比显式 Python 循环快 1~3 个数量级。

```python
# 慢：Python 循环
a = np.arange(1000000)
total = 0
for x in a:
    total += x

# 快：向量化
total = np.sum(a)
```

**基本原则**：尽量避免对 ndarray 进行 Python 级循环，优先使用 NumPy 内置的向量化操作。

### 4.8 高级 ufunc 技巧

#### （1）`np.where` 的 ufunc 版本：`np.place` 和 `np.putmask`

```python
arr = np.arange(10)
np.putmask(arr, arr > 5, 0)   # 将大于5的元素置0
print(arr)   # [0,1,2,3,4,5,0,0,0,0]

arr = np.arange(10)
np.place(arr, arr > 5, [99,100])  # 满足条件的依次填充 99,100,99,100...
```

#### （2）`np.clip` 限制范围

```python
arr = np.array([1,5,10,20])
clipped = np.clip(arr, 3, 15)   # 小于3变3，大于15变15 → [3,5,10,15]
```

#### （3）`np.isclose` 比较浮点数是否接近

```python
a = 0.1 + 0.2
b = 0.3
print(a == b)           # False
print(np.isclose(a,b))  # True，默认相对容差 1e-8
```

---

## 第五部分：统计方法、线性代数与随机数

### 5.1 统计方法

NumPy 提供了大量统计函数，可以计算整个数组或沿指定轴（`axis` 参数）的统计量。

#### 5.1.1 基本统计函数

```python
import numpy as np

arr = np.array([[1, 2, 3],
                [4, 5, 6],
                [7, 8, 9]])

# 总和
print(np.sum(arr))             # 45
print(arr.sum())               # 方法形式同样可用

# 乘积
print(np.prod(arr))            # 1*2*...*9 = 362880

# 平均值
print(np.mean(arr))            # 5.0

# 标准差 (总体标准差，默认 ddof=0)
print(np.std(arr))             # 2.58198889747161

# 方差 (总体方差，默认 ddof=0)
print(np.var(arr))             # 6.666666666666667

# 中位数
print(np.median(arr))          # 5.0

# 最小值、最大值
print(np.min(arr))             # 1
print(np.max(arr))             # 9

# 最小值和最大值同时返回 (更高效)
print(np.minimum(arr, 5))      # 逐元素比较取小
print(np.maximum(arr, 5))      # 逐元素比较取大
```

#### 5.1.2 沿轴统计（axis 参数）

`axis=0` 表示沿着行方向（跨行），结果形状为 `(列数,)`；`axis=1` 沿着列方向（跨列），结果形状为 `(行数,)`。

```python
arr = np.array([[1, 2, 3],
                [4, 5, 6]])

# 沿 axis=0 (按列)
print(np.sum(arr, axis=0))    # [5, 7, 9]
print(np.mean(arr, axis=0))   # [2.5, 3.5, 4.5]

# 沿 axis=1 (按行)
print(np.sum(arr, axis=1))    # [6, 15]
print(np.mean(arr, axis=1))   # [2., 5.]

# 保持维度 (keepdims=True)
col_sums = np.sum(arr, axis=0, keepdims=True)   # shape (1,3)
row_means = np.mean(arr, axis=1, keepdims=True) # shape (2,1)
```

#### 5.1.3 累计运算

```python
arr = np.array([[1,2,3],[4,5,6]])

# 累计和 (cumulative sum)
print(np.cumsum(arr))            # 一维化后累加: [1,3,6,10,15,21]
print(np.cumsum(arr, axis=0))    # 沿行累加: [[1,2,3],[5,7,9]]
print(np.cumsum(arr, axis=1))    # 沿列累加: [[1,3,6],[4,9,15]]

# 累计积
print(np.cumprod(arr, axis=1))   # [[1,2,6],[4,20,120]]
```

#### 5.1.4 极值索引（argmin / argmax）

返回扁平化后的索引或指定轴上的索引。

```python
arr = np.array([[3,1,4],
                [1,5,2]])

# 全局最小/最大索引（平铺后的一维位置）
print(np.argmin(arr))      # 1 (因为 1 位于平铺后的索引1)
print(np.argmax(arr))      # 4 (5 位于索引4)

# 沿轴：每行/每列的最小/最大位置
print(np.argmin(arr, axis=0))   # [1,0,1] 每列最小值所在行
print(np.argmax(arr, axis=1))   # [2,1]   每行最大值所在列
```

#### 5.1.5 百分位数与分位数

```python
arr = np.array([1,2,3,4,5,6,7,8,9])

# 50th percentile = 中位数
print(np.percentile(arr, 50))    # 5.0

# 多个分位数
print(np.percentile(arr, [25, 50, 75]))   # [3. 5. 7.]

# 使用 np.quantile (取值范围 0~1)
print(np.quantile(arr, 0.5))      # 5.0
```

#### 5.1.6 加权平均

NumPy 没有直接的加权平均函数，但可以用 `np.average`。

```python
arr = np.array([1,2,3,4])
weights = np.array([0.1, 0.2, 0.3, 0.4])
print(np.average(arr, weights=weights))   # 加权平均
```

#### 5.1.7 其他统计函数

| 函数                      | 说明                               |
| ------------------------- | ---------------------------------- |
| `np.ptp`                  | 极差 (max - min)                   |
| `np.nanmin`, `np.nanmax`  | 忽略 NaN 的最小/最大               |
| `np.nansum`, `np.nanmean` | 忽略 NaN 的总和/均值               |
| `np.bincount`             | 统计非负整数数组中每个值出现的次数 |
| `np.histogram`            | 计算直方图（频数和 bin 边界）      |

```python
# 忽略 NaN 的统计
arr_with_nan = np.array([1,2,np.nan,4])
print(np.nanmean(arr_with_nan))   # (1+2+4)/3 = 2.333...

# bincount 示例
arr = np.array([0,1,1,2,0,3])
counts = np.bincount(arr)   # [2,2,1,1] 索引0出现2次，1出现2次...
```

---

### 5.2 线性代数模块（`np.linalg`）

NumPy 的线性代数模块包含矩阵分解、求逆、行列式、特征值等函数。

#### 5.2.1 矩阵乘法

```python
A = np.array([[1,2],[3,4]])
B = np.array([[5,6],[7,8]])

# 三种等价写法
C1 = np.dot(A, B)
C2 = A.dot(B)
C3 = A @ B            # Python 3.5+ 推荐
print(C3)  # [[19,22],[43,50]]
```

#### 5.2.2 向量点积与外积

```python
a = np.array([1,2,3])
b = np.array([4,5,6])

# 点积 (内积)
print(np.dot(a, b))      # 1*4+2*5+3*6 = 32
print(a @ b)             # 同上

# 外积
print(np.outer(a, b))
# [[ 4, 5, 6],
#  [ 8,10,12],
#  [12,15,18]]
```

#### 5.2.3 矩阵逆与伪逆

```python
from numpy.linalg import inv, pinv

A = np.array([[1,2],[3,4]])
A_inv = inv(A)          # 逆矩阵，要求方阵且满秩
print(A_inv)            # [[-2. ,  1. ],[ 1.5, -0.5]]
print(A @ A_inv)        # 接近单位阵

# 伪逆（适用于非方阵或奇异矩阵）
A_pinv = pinv(A)
```

#### 5.2.4 行列式

```python
from numpy.linalg import det
A = np.array([[1,2],[3,4]])
print(det(A))   # -2.0
```

#### 5.2.5 线性方程组求解

解 `Ax = b`。

```python
from numpy.linalg import solve

A = np.array([[3,1], [1,2]])
b = np.array([9,8])
x = solve(A, b)     # 返回解向量
print(x)            # [2., 3.]  即 x=2, y=3
```

#### 5.2.6 特征值与特征向量

```python
from numpy.linalg import eig

A = np.array([[1,2],[3,4]])
eigvals, eigvecs = eig(A)
print("特征值:", eigvals)       # [-0.37228132  5.37228132]
print("特征向量:", eigvecs)     # 列向量对应特征值
```

#### 5.2.7 矩阵范数

```python
from numpy.linalg import norm

A = np.array([[1,2],[3,4]])
print(norm(A))             # Frobenius 范数 (默认)
print(norm(A, ord=1))      # 1-范数 (最大列和)
print(norm(A, ord=2))      # 2-范数 (最大奇异值)
print(norm(A, ord=np.inf)) # 无穷范数 (最大行和)
```

#### 5.2.8 其他线性代数函数

| 函数                    | 作用                         |
| ----------------------- | ---------------------------- |
| `np.linalg.matrix_rank` | 矩阵的秩                     |
| `np.linalg.qr`          | QR 分解                      |
| `np.linalg.svd`         | 奇异值分解 (SVD)             |
| `np.linalg.cholesky`    | Cholesky 分解 (正定矩阵)     |
| `np.linalg.eigvals`     | 仅求特征值（不需求特征向量） |
| `np.trace`              | 矩阵的迹 (对角线之和)        |

```python
# 迹
A = np.array([[1,2],[3,4]])
print(np.trace(A))   # 1+4 = 5

# 秩
from numpy.linalg import matrix_rank
print(matrix_rank(A))  # 2
```

---

### 5.3 随机数生成（Random）

NumPy 有两个随机数接口：
- **旧版** (`np.random.*`)：仍可用，但推荐使用新版 `Generator` (NumPy 1.17+)。
- **新版** (`np.random.default_rng`)：更灵活、更快的随机数生成器。

#### 5.3.1 新版随机数生成器（推荐）

```python
# 创建生成器（可指定种子）
rng = np.random.default_rng(seed=42)

# 均匀分布 [0,1)
rng.random(size=(2,3))        # shape (2,3)
rng.random_sample()           # 标量

# 标准正态分布（均值为0，标准差为1）
rng.normal(loc=0.0, scale=1.0, size=(2,3))

# 整数均匀分布 [low, high) 注意不包含 high
rng.integers(low=0, high=10, size=(2,3), endpoint=False)

# 随机选择
arr = np.array([10,20,30,40])
rng.choice(arr, size=5, replace=True, p=None)   # 有放回抽样
rng.choice(10, size=5, replace=False)           # 从0~9中无放回抽5个

# 打乱顺序 (in-place)
arr = np.arange(10)
rng.shuffle(arr)              # 原地打乱

# 生成排列（新数组）
rng.permutation(10)           # 返回0~9的随机排列

# 其他分布
rng.uniform(0, 1, size=10)    # 均匀分布
rng.exponential(scale=1.0, size=10)   # 指数分布
rng.binomial(n=10, p=0.5, size=10)    # 二项分布
rng.beta(a=2, b=5, size=10)           # Beta 分布
rng.gamma(shape=2, scale=1, size=10)  # Gamma 分布
```

#### 5.3.2 旧版随机数接口（仍常见，但功能有限）

```python
# 设置全局种子（影响所有旧版函数）
np.random.seed(42)

# 均匀分布 [0,1)
np.random.rand(2,3)           # shape (2,3)
np.random.random_sample((2,3))

# 标准正态分布
np.random.randn(2,3)

# 整数
np.random.randint(0, 10, size=(2,3))

# 随机选择
np.random.choice([1,2,3], size=5)

# 打乱
arr = np.arange(10)
np.random.shuffle(arr)
```

**区别总结**：
- 新版使用 `rng = np.random.default_rng(seed)`，每个生成器独立，线程安全。
- 新版函数名略有不同（如 `integers` 代替 `randint`， `random` 代替 `rand`）。
- 新版性能更好，随机质量更高。

#### 5.3.3 可复现性的设置

对于新版 `Generator`，可以通过 `seed` 保证可复现：

```python
rng1 = np.random.default_rng(42)
rng2 = np.random.default_rng(42)
print(rng1.random())   # 0.773956048555963
print(rng2.random())   # 0.773956048555963
```

对于旧版，使用 `np.random.seed(42)` 全局设置。

---

### 5.4 随机数分布的完整列表（新版）

| 函数                   | 分布名称                           |
| ---------------------- | ---------------------------------- |
| `beta`                 | Beta 分布                          |
| `binomial`             | 二项分布                           |
| `chisquare`            | 卡方分布                           |
| `exponential`          | 指数分布                           |
| `f`                    | F 分布                             |
| `gamma`                | Gamma 分布                         |
| `geometric`            | 几何分布                           |
| `gumbel`               | Gumbel 分布                        |
| `hypergeometric`       | 超几何分布                         |
| `laplace`              | 拉普拉斯分布                       |
| `logistic`             | 逻辑分布                           |
| `lognormal`            | 对数正态分布                       |
| `negative_binomial`    | 负二项分布                         |
| `normal`               | 正态分布                           |
| `pareto`               | Pareto 分布                        |
| `poisson`              | 泊松分布                           |
| `power`                | 幂分布                             |
| `rayleigh`             | 瑞利分布                           |
| `standard_cauchy`      | 标准柯西分布                       |
| `standard_exponential` | 标准指数分布                       |
| `standard_gamma`       | 标准 Gamma 分布                    |
| `standard_normal`      | 标准正态分布 (`normal` 的快捷方式) |
| `standard_t`           | 标准 t 分布                        |
| `triangular`           | 三角分布                           |
| `uniform`              | 均匀分布                           |
| `wald`                 | Wald 分布（逆高斯）                |
| `weibull`              | Weibull 分布                       |
| `zipf`                 | Zipf 分布                          |

使用示例：
```python
rng = np.random.default_rng()
samples = rng.poisson(lam=3, size=1000)
```

---

## 第六部分：高级操作（拼接、分割、重复、视图/副本）

### 6.1 数组拼接（Concatenation）

将多个数组沿指定轴合并成一个新数组。注意：除拼接轴外，其他轴的形状必须相同。

#### 6.1.1 `np.concatenate` – 通用拼接

```python
import numpy as np

a = np.array([[1, 2], [3, 4]])
b = np.array([[5, 6], [7, 8]])

# 沿 axis=0（垂直方向，增加行数）
c = np.concatenate((a, b), axis=0)
# [[1,2],
#  [3,4],
#  [5,6],
#  [7,8]]

# 沿 axis=1（水平方向，增加列数）
d = np.concatenate((a, b), axis=1)
# [[1,2,5,6],
#  [3,4,7,8]]
```

#### 6.1.2 `np.vstack` – 垂直堆叠（axis=0）

```python
a = np.array([1,2,3])          # shape (3,)
b = np.array([4,5,6])          # shape (3,)
c = np.vstack((a, b))          # shape (2,3)  自动将一维视为行向量
# [[1,2,3],
#  [4,5,6]]

# 也可以堆叠二维
a2 = np.array([[1,2],[3,4]])
b2 = np.array([[5,6]])
c2 = np.vstack((a2, b2))       # (3,2)
```

#### 6.1.3 `np.hstack` – 水平堆叠（axis=1）

```python
a = np.array([1,2,3])
b = np.array([4,5,6])
c = np.hstack((a, b))          # shape (6,)   一维数组直接拼接
# [1,2,3,4,5,6]

a2 = np.array([[1,2],[3,4]])
b2 = np.array([[5],[6]])
c2 = np.hstack((a2, b2))       # shape (2,3)
# [[1,2,5],
#  [3,4,6]]
```

#### 6.1.4 `np.dstack` – 深度堆叠（沿第三轴）

将二维数组沿第三轴（深度方向）堆叠，常用于图像通道合并。

```python
a = np.array([[1,2],[3,4]])
b = np.array([[5,6],[7,8]])
c = np.dstack((a, b))          # shape (2,2,2)
# 每个位置 (i,j) 包含 [a[i,j], b[i,j]]
```

#### 6.1.5 `np.column_stack` / `np.row_stack`

- `column_stack`：将一维数组作为列堆叠成二维数组。
- `row_stack`：等价于 `vstack`。

```python
a = np.array([1,2,3])
b = np.array([4,5,6])
c = np.column_stack((a, b))    # shape (3,2)
# [[1,4],
#  [2,5],
#  [3,6]]

# 对于二维数组，column_stack 相当于 hstack 但自动处理一维
```

---

### 6.2 数组分割（Splitting）

将数组分割成多个子数组，返回列表。

#### 6.2.1 `np.split` – 沿指定轴分割

```python
arr = np.arange(12).reshape(3,4)
# [[ 0, 1, 2, 3],
#  [ 4, 5, 6, 7],
#  [ 8, 9,10,11]]

# 等分：分割成3块（必须能整除）
parts = np.split(arr, 3, axis=0)   # 返回3个 (1,4) 数组

# 按指定索引分割
parts = np.split(arr, [1,2], axis=0)  # 索引1和2处切割
# 得到 [arr[0:1], arr[1:2], arr[2:3]]  共3块

# 沿列分割
parts = np.split(arr, [1,3], axis=1)  # 第1列后、第3列后切割
```

#### 6.2.2 `np.vsplit` – 垂直分割（axis=0）

等同于 `np.split(..., axis=0)`。

```python
arr = np.arange(12).reshape(3,4)
top, middle, bottom = np.vsplit(arr, 3)   # 每个 shape (1,4)
```

#### 6.2.3 `np.hsplit` – 水平分割（axis=1）

```python
arr = np.arange(12).reshape(3,4)
left, right = np.hsplit(arr, 2)   # 每个 shape (3,2)
# 或者指定索引: np.hsplit(arr, [1,3])
```

#### 6.2.4 `np.array_split` – 允许不等分

当无法等分时，允许不均匀分割。

```python
arr = np.arange(10)
parts = np.array_split(arr, 3)   # 分成3块，长度可能为 [4,3,3]
```

---

### 6.3 添加与删除元素

注意：这些函数通常**返回新数组**，原数组不变（除非使用 `resize` 等原地方法）。

#### 6.3.1 `np.append` – 将值附加到数组末尾（先展平）

```python
arr = np.array([1,2,3])
new = np.append(arr, [4,5])        # [1,2,3,4,5]

# 二维数组：默认先展平为一维再附加
arr2d = np.array([[1,2],[3,4]])
new2 = np.append(arr2d, [5,6])     # [1,2,3,4,5,6]

# 可以通过 axis 参数保持维度
new2d = np.append(arr2d, [[5,6]], axis=0)  # 增加一行
# [[1,2],
#  [3,4],
#  [5,6]]
```

#### 6.3.2 `np.insert` – 沿指定轴插入值

```python
arr = np.array([1,2,3,4])
# 在索引1之前插入 99
new = np.insert(arr, 1, 99)        # [1,99,2,3,4]

# 插入多个值
new = np.insert(arr, [1,2], [99,100])  # [1,99,100,2,3,4]

# 二维数组
arr2d = np.array([[1,2],[3,4]])
# 在第0行之前插入一行
new2d = np.insert(arr2d, 0, [5,6], axis=0)
# [[5,6],
#  [1,2],
#  [3,4]]
```

#### 6.3.3 `np.delete` – 删除子数组

```python
arr = np.array([1,2,3,4,5])
new = np.delete(arr, [1,3])        # 删除索引1和3的元素 -> [1,3,5]

# 二维
arr2d = np.array([[1,2,3],[4,5,6],[7,8,9]])
new2d = np.delete(arr2d, 1, axis=0)  # 删除第1行 -> 剩下两行
new2d_col = np.delete(arr2d, 1, axis=1)  # 删除第1列
```

#### 6.3.4 `np.unique` – 去重并返回唯一值

```python
arr = np.array([1,2,2,3,3,3,4])
unique_vals = np.unique(arr)        # [1,2,3,4]

# 返回索引，还原原数组的位置
unique_vals, indices = np.unique(arr, return_index=True)  # 首次出现位置
unique_vals, inverse = np.unique(arr, return_inverse=True) # 用于重构
```

---

### 6.4 重复与平铺

#### 6.4.1 `np.repeat` – 重复数组元素

```python
arr = np.array([1,2,3])
# 每个元素重复2次
repeated = np.repeat(arr, 2)        # [1,1,2,2,3,3]

# 可以指定每个元素不同的重复次数
repeated = np.repeat(arr, [2,3,1])  # [1,1,2,2,2,3]

# 二维数组沿轴重复
arr2d = np.array([[1,2],[3,4]])
# 沿行（axis=0）重复：每行重复2次
row_rep = np.repeat(arr2d, 2, axis=0)
# [[1,2],
#  [1,2],
#  [3,4],
#  [3,4]]

# 沿列（axis=1）重复
col_rep = np.repeat(arr2d, 2, axis=1)
# [[1,1,2,2],
#  [3,3,4,4]]
```

#### 6.4.2 `np.tile` – 沿各个方向平铺数组

将数组像砖块一样铺开。

```python
arr = np.array([[1,2],[3,4]])
# 沿行方向铺2次，沿列方向铺3次
tiled = np.tile(arr, (2,3))
# 2行 x 3列 的块阵
# [[1,2,1,2,1,2],
#  [3,4,3,4,3,4],
#  [1,2,1,2,1,2],
#  [3,4,3,4,3,4]]

# 一维数组平铺
arr1d = np.array([1,2,3])
tiled = np.tile(arr1d, 2)          # [1,2,3,1,2,3]
```

#### 6.4.3 区别总结

- `repeat`：重复元素，适合放大内部的粒度。
- `tile`：重复整个数组，适合构造大块网格。

---

### 6.5 视图（View）与副本（Copy）

理解视图与副本对于内存和性能至关重要。

#### 6.5.1 基本概念

- **视图（view）**：共享底层数据，修改视图会影响原数组。通过 `arr.view()` 或切片得到。
- **副本（copy）**：独立的数据，修改不影响原数组。通过 `arr.copy()` 或花式索引、布尔索引得到。

```python
arr = np.arange(10)

# 视图：切片
view = arr[1:5]          # 共享数据
view[0] = 99
print(arr[1])            # 输出 99

# 副本：copy()
copy_arr = arr.copy()
copy_arr[0] = 100
print(arr[0])            # 仍是原值，未改变

# 花式索引返回副本
fancy = arr[[1,2,3]]     # 新数组，不共享数据
```

#### 6.5.2 检查是否共享内存

```python
print(np.may_share_memory(arr, view))     # True
print(np.may_share_memory(arr, copy_arr)) # False
```

#### 6.5.3 `np.view` – 显式创建视图（改变 dtype 或形状）

```python
arr = np.array([1,2,3,4], dtype=np.int32)

# 改变 dtype 但保持相同字节数（每4字节转为2个int16）
view_int16 = arr.view(np.int16)   # 长度变为 4 * 4 / 2 = 8
print(view_int16)

# 改变形状同时保持视图（reshape 通常也是视图）
reshaped_view = arr.reshape(2,2)  # 视图，共享数据
```

#### 6.5.4 `np.copy` 与 `np.copyto`

```python
# 深拷贝
new_arr = np.copy(arr)

# 将源数组的值复制到目标数组（要求形状相同或可广播）
target = np.empty_like(arr)
np.copyto(target, arr)
```

#### 6.5.5 确保副本的常用方法

- 使用 `.copy()` 方法。
- 使用 `np.array(arr, copy=True)`。
- 使用花式索引（如 `arr[[0,1]]`）会自动返回副本。

#### 6.5.6 内存布局与视图

- **C顺序（行优先）**：`arr.flags['C_CONTIGUOUS']`
- **F顺序（列优先）**：`arr.flags['F_CONTIGUOUS']`
- 某些操作（如转置）会返回改变了顺序的视图。

```python
arr = np.arange(12).reshape(3,4)
print(arr.flags['C_CONTIGUOUS'])   # True
arr_T = arr.T
print(arr_T.flags['C_CONTIGUOUS']) # False（可能是 F_CONTIGUOUS）
```

---

### 6.6 数组填充与边界处理

#### 6.6.1 `np.pad` – 填充数组边界

```python
arr = np.array([[1,2],[3,4]])
# 在每个维度上填充 (before, after) 的宽度
padded = np.pad(arr, pad_width=1, mode='constant', constant_values=0)
# 结果 4x4，周围一圈0

# 不同轴不同填充宽度
padded = np.pad(arr, pad_width=((1,2), (0,1)), mode='edge')
# 第0维上边1行下边2行复制边缘；第1维左边0列右边1列复制边缘

# mode 可选：'constant'(常数), 'edge'(边缘复制), 'reflect'(反射), 'symmetric'(对称), 'wrap'(循环) 等
```

#### 6.6.2 `np.clip` – 将值限制在范围内

已在第四部分提到，补充参数示例：

```python
arr = np.array([1,5,10,20])
np.clip(arr, 3, 15)       # [3,5,10,15]
np.clip(arr, 3, None)     # [3,5,10,20] 无上限
```

---

## 第七部分：结构化数组、内存布局与性能提示

### 7.1 结构化数组（Structured Arrays）

结构化数组允许在一个数组中存储**异构数据**（例如：姓名、年龄、成绩），类似于表格或数据库记录。每个元素可以包含多个字段（field），每个字段有独立的名称和数据类型。

#### 7.1.1 定义结构化数组的 dtype

使用 `np.dtype` 定义字段：字段名、字段类型、以及可选的字节偏移量。

```python
import numpy as np

# 方式1：元组列表
dt = np.dtype([('name', 'U10'),   # Unicode 字符串，最大10字符
               ('age', 'i4'),      # 32位整数
               ('weight', 'f8')])  # 64位浮点数

# 方式2：字典（更灵活）
dt = np.dtype({'names': ['name', 'age', 'weight'],
               'formats': ['U10', 'i4', 'f8']})

# 方式3：逗号分隔字符串（简单类型）
dt = np.dtype('U10, i4, f8')
```

#### 7.1.2 创建结构化数组

```python
# 从元组列表创建
data = [('Alice', 25, 55.5),
        ('Bob', 30, 70.2),
        ('Charlie', 35, 80.0)]
arr = np.array(data, dtype=dt)

print(arr)
# [('Alice', 25, 55.5) ('Bob', 30, 70.2) ('Charlie', 35, 80. )]

# 或者从单独的字段数组创建
names = np.array(['Alice', 'Bob', 'Charlie'], dtype='U10')
ages = np.array([25, 30, 35], dtype='i4')
weights = np.array([55.5, 70.2, 80.0], dtype='f8')
arr2 = np.empty(3, dtype=dt)
arr2['name'] = names
arr2['age'] = ages
arr2['weight'] = weights
```

#### 7.1.3 访问字段

```python
# 获取单个字段（返回视图，共享内存）
print(arr['name'])      # ['Alice' 'Bob' 'Charlie']
print(arr['age'])       # [25 30 35]

# 同时获取多个字段
print(arr[['name', 'weight']])   # 返回新的结构化数组

# 修改字段
arr['age'][1] = 31
print(arr[1])           # ('Bob', 31, 70.2)
```

#### 7.1.4 同时访问记录和字段

```python
# 按行访问（返回一个带字段的标量）
record = arr[0]
print(record['name'])   # 'Alice'
print(record['age'])    # 25

# 按字段访问后再切片
arr['weight'][:2]       # [55.5 70.2]
```

#### 7.1.5 嵌套 dtype（字段包含子结构）

```python
dt = np.dtype([('name', 'U10'),
               ('info', [('age', 'i4'), ('city', 'U20')])])
arr = np.array([('Alice', (25, 'NYC')), ('Bob', (30, 'LA'))], dtype=dt)

print(arr['info']['age'])   # [25 30]
print(arr[0]['info']['city']) # 'NYC'
```

#### 7.1.6 结构化数组的排序、筛选

```python
# 按年龄排序
sorted_arr = np.sort(arr, order='age')

# 按年龄筛选（布尔索引）
mask = arr['age'] > 28
print(arr[mask])   # 返回符合条件的记录

# 按多个字段排序
arr_sorted = np.sort(arr, order=['age', 'name'])
```

#### 7.1.7 结构化数组与 pandas 的对比

- 结构化数组内存效率高，适合数值计算密集的场景。
- 但缺乏 pandas 的标签索引、缺失值处理、便捷的统计方法等。
- 如果是表格数据分析，推荐 pandas；如果是高性能 C 扩展或规范数据交换，结构化数组很有用。

---

### 7.2 内存布局（Memory Layout）

NumPy 数组在内存中是连续的（默认），但连续顺序可以是 **C 顺序（行优先）** 或 **F 顺序（列优先，Fortran 风格）**。

#### 7.2.1 查看内存布局

```python
arr = np.arange(12).reshape(3, 4)
print(arr.flags)
# C_CONTIGUOUS : True
# F_CONTIGUOUS : False
# OWNDATA : True
# ...

# 显式指定顺序
c_arr = np.array([[1,2],[3,4]], order='C')   # 默认
f_arr = np.array([[1,2],[3,4]], order='F')
```

#### 7.2.2 转换内存顺序

```python
arr_f = np.asfortranarray(arr)   # 转换为 F 连续（如有必要）
arr_c = np.ascontiguousarray(arr_f)  # 转回 C 连续
```

#### 7.2.3 为什么内存顺序重要？

- **性能**：访问连续内存块可以利用 CPU 缓存和向量化指令。沿存储顺序遍历比跨步遍历快。
- **外部库接口**：某些库（如 BLAS、LAPACK、Fortran 代码）期望 F 顺序的数组。

```python
# 性能测试示例（概念）
arr = np.random.rand(1000, 1000)
# 按行求和（C 顺序下快）
%timeit arr.sum(axis=1)
# 按列求和（在 C 顺序下较慢，因为跨步访问）
%timeit arr.sum(axis=0)
```

#### 7.2.4 转置与内存顺序

转置一个 C 连续数组会得到一个 F 连续的视图（不复制数据），反之亦然。

```python
arr = np.arange(12).reshape(3,4)  # C 连续
arr_T = arr.T                      # F 连续（视图）
print(arr_T.flags['C_CONTIGUOUS']) # False
print(arr_T.flags['F_CONTIGUOUS']) # True
```

#### 7.2.5 非连续数组（例如切片）

切片操作通常产生非连续的视图（例如 `arr[::2, ::2]`），此时许多 NumPy 操作仍需复制或效率降低。

```python
arr = np.arange(100)
sub = arr[::10]                # 步长切片，非连续
print(sub.flags['C_CONTIGUOUS'])  # False
# 强制连续化（如有必要）
sub_cont = np.ascontiguousarray(sub)
```

---

### 7.3 性能优化提示

以下技巧可以帮助你写出更高效的 NumPy 代码。

#### 7.3.1 使用向量化操作代替循环

```python
# 慢
arr = np.arange(1000000)
result = []
for x in arr:
    result.append(x**2)

# 快
result = arr ** 2
```

#### 7.3.2 利用 ufunc 的 `out` 参数避免临时数组

```python
a = np.random.rand(1000000)
b = np.random.rand(1000000)
result = np.empty_like(a)

# 避免创建新数组
np.add(a, b, out=result)
# 而不是 result = a + b
```

#### 7.3.3 合理选择数据类型（dtype）以节省内存

```python
# 如果数值范围小，用 float32 或 int16 替代 float64/int64
arr = np.array([1,2,3], dtype=np.int16)   # 原 int64
```

#### 7.3.4 使用视图而非副本（谨慎操作）

```python
# 视图模式（共享内存，无复制）
view = arr[1:10000]
# 若要修改而不影响原数组，才使用 copy
```

#### 7.3.5 合并操作减少遍历次数

```python
# 不好
arr[arr > 0] = 1
arr[arr <= 0] = 0

# 好（使用 where 一次性）
arr = np.where(arr > 0, 1, 0)
```

#### 7.3.6 使用 `np.einsum` 进行复杂张量运算

`einsum` 可以高效实现许多线性代数运算，并避免中间数组。

```python
A = np.random.rand(100, 100)
B = np.random.rand(100, 100)
# 矩阵乘法
C = np.einsum('ij,jk->ik', A, B)

# 迹
trace = np.einsum('ii->', A)
```

#### 7.3.7 使用 `numexpr` 或 Numba 加速极为耗时的操作

`numexpr` 可以在大型数组上加速多核计算；Numba 可以将 Python 函数编译为机器码。

```python
# numexpr 示例（需安装）
import numexpr as ne
a = np.random.rand(1000000)
b = np.random.rand(1000000)
c = ne.evaluate("a**2 + b**2")
```

#### 7.3.8 注意缓存与局部性

在遍历多维数组时，按内存连续的方向做最内层循环。

```python
arr = np.random.rand(1000, 1000)
# 快：按行遍历
for i in range(1000):
    for j in range(1000):
        arr[i, j] += 1
# 慢：按列遍历
for i in range(1000):
    for j in range(1000):
        arr[j, i] += 1
```

#### 7.3.9 使用 `np.bool` 数组而非整数 0/1 进行掩码操作

布尔数组在内存和速度上都有优势。

#### 7.3.10 大型数组的内存映射 (memmap)

如果数组太大无法放入内存，可以使用 `np.memmap` 将磁盘文件映射到虚拟内存。

```python
# 创建内存映射数组
mmap = np.memmap('large_array.dat', dtype='float32', mode='readwrite', shape=(10000, 10000))
# 访问和修改类似普通数组，但实际读写磁盘
mmap[5000, :] = 1.0
mmap.flush()  # 强制写入磁盘
```

---

### 7.4 高级内存操作

#### 7.4.1 `np.ndarray` 的 `__array_interface__`

你可以通过该接口与其他库（如 Python 的 `ctypes`、`Cython`）共享内存。

```python
arr = np.arange(10)
interface = arr.__array_interface__
print(interface['data'])  # (内存地址, 是否只读)
print(interface['shape'])
print(interface['typestr'])
```

#### 7.4.2 共享内存的跨进程使用

使用 `multiprocessing.shared_memory`（Python 3.8+）或 `shm` 模块。

#### 7.4.3 对齐要求与填充

某些硬件要求特定数据对齐，NumPy 默认会创建对齐的数组。可以通过 `np.dtype(..., align=True)` 强制对齐。

---

## 总结：NumPy 学习路线图

你已经完成了从基础到高级的全部内容：

1. **基础**：创建数组、属性、形状变化  
2. **索引**：基本、切片、布尔、花式索引  
3. **运算**：算术、比较、广播、ufunc、聚合  
4. **线性代数**：点积、逆、特征值、解方程  
5. **随机数**：新版 Generator，各种分布  
6. **操作**：拼接、分割、重复、视图/副本  
7. **高级**：结构化数组、内存布局、性能优化  

掌握这些内容，足以应对绝大多数数据分析、科学计算和机器学习数据预处理的需求。

如果需要深入学习，可以进一步探索：
- `numpy.lib.stride_tricks` 中的滑动窗口技巧  
- `numpy.polynomial` 多项式拟合  
- `numpy.fft` 快速傅里叶变换  
- `numpy.ma` 掩码数组处理缺失数据  
