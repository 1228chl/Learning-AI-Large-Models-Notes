
# DL-Question

## Pytorch and Base

### 理解深度学习与机器学习的差别

- 提取特征方式不同：
	- 机器学习是人工提取
	- 深度学习是自动提取

---

### 知道 torch 创建张量的方法

- 最基本方式：`torch.tensor(data=数据,dtype=类型)`
- `Tensor()`
- `类型Tensor()`:Byte/Short/Int/Long/Half/Float/Double
- `arange()`
- `linspace()`
- `zeros()`
- `ones()`
- `full()`
- `rand()`
- `randn() `
- `randint()`

---

### 知道张量进行类型转换的方法

- `张量.byte()/short()/int()/long()/half()/float()/double()`
- `张量.type(torch.int 8/int 16/int 32/float 16/float 32/float 64)`

---

### 掌握张量类型转换的方法

- 张量和 Numpy 互转：`torch.tensor(numpy 数组)`
- 张量和单数字互转：`张量.item()`

---

### 掌握张量的基本运算

- `+`, `-`, `*`, `/`
- `add()/add_()`
- `sub()/sub_()`
- `mul()/mul_()`
- `div()/div_()`
- `@` and `torch.matmul()`

---

### 掌握张量的索引操作

- 一维张量[索引]
- 二维张量[行索引，列索引]
- 三维张量[0 轴索引，1 轴索引，2 轴索引]

## ANN

### 常见的激活函数及其特点

### 能够使用 torch 构建神经网络

### 了解常见的参数初始化方法
