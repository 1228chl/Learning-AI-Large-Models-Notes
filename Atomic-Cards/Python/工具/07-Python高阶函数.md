---
author: "XunZong"
created: "2026-07-10"
tags: ["Python", "高阶函数", "函数式编程"]
aliases: ["高阶函数", "map", "filter", "reduce", "Higher-Order Function"]
---

# Python 高阶函数（map/filter/reduce）

## 定义

高阶函数（Higher-Order Function）是**接受函数作为参数**或**返回函数作为结果**的函数。Python 中 `map`、`filter`、`reduce` 是三个最常用的内置高阶函数，它们将函数作用于可迭代对象，实现函数式编程风格的数据转换。

### map 函数

`map` 将指定函数依次作用于可迭代对象的每个元素，返回一个迭代器。

$$
\text{map}(f, [x_1, x_2, \dots, x_n]) = [f(x_1), f(x_2), \dots, f(x_n)]
$$

- $f$：映射函数，接收一个参数并返回一个值
- $x_i$：可迭代对象中的第 $i$ 个元素
- $\text{map}(f, \text{iterable})$：返回一个惰性迭代器，仅在迭代时计算

### filter 函数

`filter` 用指定函数过滤可迭代对象，保留使函数返回 `True` 的元素。

$$
\text{filter}(p, [x_1, x_2, \dots, x_n]) = [x_i \mid p(x_i) = \text{True}]
$$

- $p$：谓词函数，接收一个参数并返回布尔值
- $\text{filter}(p, \text{iterable})$：返回一个迭代器，包含所有满足条件的元素

### reduce 函数

`reduce` 用指定函数将可迭代对象**累积归约**为单个值，函数需接收两个参数。

$$
\text{reduce}(f, [x_1, x_2, \dots, x_n]) = f(f(\dots f(f(x_1, x_2), x_3) \dots), x_n)
$$

- $f$：二元累积函数，接收两个参数并返回一个值
- $\text{reduce}(f, \text{iterable})$：返回单个累积结果

## 代码示例

```python
from functools import reduce

# ========== map：逐元素映射 ==========
# 将列表中的每个数字平方
numbers = [1, 2, 3, 4, 5]
squared = list(map(lambda x: x ** 2, numbers))
print(squared)  # [1, 4, 9, 16, 25]

# 将多个列表对应位置元素组合
a = [1, 2, 3]
b = [4, 5, 6]
summed = list(map(lambda x, y: x + y, a, b))
print(summed)  # [5, 7, 9]

# 替代方案：列表推导式（通常更 Pythonic）
squared_v2 = [x ** 2 for x in numbers]
print(squared_v2)  # [1, 4, 9, 16, 25]

# ========== filter：按条件过滤 ==========
# 筛选出偶数
evens = list(filter(lambda x: x % 2 == 0, numbers))
print(evens)  # [2, 4]

# 筛选字符串列表中的非空字符串
words = ["hello", "", "world", "", "python"]
non_empty = list(filter(lambda s: len(s) > 0, words))
print(non_empty)  # ["hello", "world", "python"]

# 替代方案：列表推导式
evens_v2 = [x for x in numbers if x % 2 == 0]
print(evens_v2)  # [2, 4]

# ========== reduce：累积归约 ==========
# 计算列表所有元素的乘积
product = reduce(lambda x, y: x * y, numbers)
print(product)  # 120 (1*2*3*4*5)

# 找出列表中的最大值
max_val = reduce(lambda a, b: a if a > b else b, numbers)
print(max_val)  # 5

# 字符串拼接
words = ["Python", "是", "一门", "语言"]
sentence = reduce(lambda a, b: a + b, words)
print(sentence)  # "Python是一门语言"
```

## 与列表推导式对比

| 操作 | map/filter/reduce 写法 | 列表推导式写法 | 推荐 |
|:----|:----------------------|:--------------|:----:|
| 映射 | `map(f, iter)` | `[f(x) for x in iter]` | 列表推导式更清晰 |
| 过滤 | `filter(p, iter)` | `[x for x in iter if p(x)]` | 列表推导式更清晰 |
| 嵌套映射 | `map(f, map(g, iter))` | `[f(g(x)) for x in iter]` | 列表推导式更清晰 |
| 累积归约 | `reduce(f, iter)` | 无直接替代 | **必须用 reduce** |
| 多列表映射 | `map(f, iter1, iter2)` | 无简洁替代 | **map 更合适** |

## 直观理解

> `map` 像"流水线"——每个元素经过同一道工序；`filter` 像"筛子"——符合条件的通过，不符合的筛掉；`reduce` 像"折叠"——将整个列表折叠成一个值。

## ML/DL 应用场景

| 应用场景 | 使用方式 | 说明 |
|:--------|:---------|:-----|
| **数据预处理** | `map(预处理函数, 原始数据)` | 批量清洗文本、归一化数值、转换标签格式 |
| **特征筛选** | `filter(特征筛选条件, 特征列表)` | 过滤掉方差为零或缺失率过高的特征 |
| **批量指标计算** | `reduce(lambda a,b: a+b, 指标列表)` | 累积计算总损失、总准确率等聚合指标 |
| **多模型集成** | `map(预测函数, 模型列表)` | 对多个模型分别调用预测，再聚合结果 |

## 面试追问

**Q1（基础）**：`map`、`filter`、`reduce` 三者的作用和区别是什么？
**回答要点**：

1. `map` 对每个元素执行映射操作，输入输出元素数量相同
2. `filter` 按条件过滤元素，输出元素数量小于等于输入
3. `reduce` 将多个元素归约为单个值，输出只有一个元素
4. 三者都体现了函数式编程思想：将操作逻辑封装在函数中，与数据分离

**Q2（深挖）**：`map` 和列表推导式都可以实现元素映射，它们有什么区别？何时该用哪个？
**回答要点**：

1. 列表推导式更 Pythonic、可读性更好，推荐作为首选
2. `map` 返回惰性迭代器，适合处理大数据流（不一次性加载到内存）
3. `map` 可处理多个可迭代对象（`map(f, iter1, iter2)`），列表推导式无法直接做到
4. 性能上两者差异微小，优先考虑可读性而非微优化

**Q3（实战）**：在数据预处理管线中如何组合使用 `map` 和 `filter`？
**回答要点**：

1. 先用 `map` 清洗每行数据（去除空格、统一格式）
2. 再用 `filter` 过滤无效数据（空行、异常值）
3. 最后用 `map` 转换数据类型（字符串→数值）
4. 使用 `map` 和 `filter` 的惰性求值特性，构建流水线，数据逐条流过不占内存

**Q4（边界）**：`reduce` 在 Python 中为何从内置函数移到了 `functools` 模块？
**回答要点**：

1. Guido van Rossum 认为 `reduce` 可读性差，鼓励使用 `for` 循环替代
2. 除累积归约外的大部分场景，`for` 循环或显式累加更清晰
3. 函数式编程风格在 Python 中并非主流，Python 更推崇显式优于隐式
4. 但仍保留在 `functools` 中，用于确实需要累积归约的场景

## 参考引用

- 需要理解装饰器的高阶函数原理，参见 [装饰器](../工具/01-装饰器.md)
- 需要理解迭代器与生成器的惰性求值机制，参见 [迭代器与生成器](../工具/02-迭代器与生成器.md)
- 需要理解上下文管理器的 `with` 语句执行流程，参见 [上下文管理器](../工具/03-上下文管理器.md)
- 需要理解函数式编程中 `lambda` 表达式的使用，参见 [Python 进阶](../OOP/01-类与对象.md)