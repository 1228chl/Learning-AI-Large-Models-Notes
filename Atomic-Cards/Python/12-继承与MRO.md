---
author: "XunZong"
created: "2026-07-07"
tags: ["Python", "面向对象", "继承"]
aliases: ["继承", "Inheritance", "MRO", "多继承", "C3线性化"]
---

# 继承与 MRO

## 定义

继承（Inheritance）允许子类自动获得父类的所有公有属性和方法，实现代码复用。Python 支持单继承、多继承和链式继承，并通过 **C3 线性化算法** 解决多继承中的方法查找顺序问题。

## 继承类型

```python
class Animal:
    def __init__(self, name):
        self.name = name
    def speak(self):
        pass

class Dog(Animal):                 # 单继承
    def speak(self):
        return f"{self.name} says Woof!"

class Cat(Animal):                 # 另一个子类
    def speak(self):
        return f"{self.name} says Meow!"
```

| 继承类型 | 说明 | 适用场景 |
|----------|------|----------|
| **单继承** | 一个子类继承一个父类 | 简单的 is-a 关系 |
| **多继承** | 一个子类继承多个父类 | 需要组合多个类的能力 |
| **多层继承** | A → B → C 的链式继承 | 层次化抽象 |

## MRO（Method Resolution Order）

多继承时的方法查找顺序，Python 使用 **C3 线性化算法**：

```python
class A: pass
class B(A): pass
class C(A): pass
class D(B, C): pass

# MRO: D → B → C → A → object
print(D.__mro__)
# 或用:
print(D.mro())
```

**MRO 三条原则**：

1. **子类优先**：子类方法优先于父类
2. **从左到右**：父类按定义顺序从左到右查找
3. **只出现一次**：每个类在 MRO 中只出现一次（单调性）

### super() 与 MRO

`super()` 不单纯是"调用父类方法"，而是**沿着 MRO 链调用下一个类的方法**：

```python
class A:
    def __init__(self):
        print("A.__init__")

class B(A):
    def __init__(self):
        print("B.__init__")
        super().__init__()

class C(A):
    def __init__(self):
        print("C.__init__")
        super().__init__()

class D(B, C):
    def __init__(self):
        print("D.__init__")
        super().__init__()

d = D()
# 输出顺序：D.__init__ → B.__init__ → C.__init__ → A.__init__
# MRO：[D, B, C, A, object]
```

## 方法重写（Override）

子类可以重写父类方法以改变或扩展其行为：

```python
class BaseModel:
    def train(self, X, y):
        print("Base training...")

class CustomModel(BaseModel):
    def train(self, X, y):                   # 完全重写
        print("Custom training...")
        
    def train(self, X, y):                   # 扩展父类行为
        super().train(X, y)
        print("Extra step: validation...")
```

## ML/DL 应用场景

| 应用场景 | 体现 | 说明 |
|----------|------|------|
| PyTorch 模型 | `class MyModel(nn.Module)` | 继承 `nn.Module` 获得参数管理和训练能力 |
| 自定义 Dataset | `class MyDataset(Dataset)` | 继承 `Dataset`，实现 `__len__` 和 `__getitem__` |
| 优化器基类 | `SGD(Optimizer)`、`Adam(Optimizer)` | 共享优化器核心逻辑，不同子类实现不同更新规则 |
| 回调钩子 | `class MyCallback(Callback)` | 继承训练回调基类，重写 `on_epoch_end` 等钩子方法 |

## 面试追问

**Q1（基础）**：Python 多继承时方法查找顺序（MRO）的规则是什么？如何查看？

**回答要点**：MRO 使用 C3 线性化算法，保证单调性（优先从左到右、从子到父），可通过 `类名.__mro__` 或 `类名.mro()` 查看；遵循"子类优先、父类从左到右、所有父类只出现一次"的原则。

**Q2（深挖）**：super() 在多重继承中是如何确定调用哪个父类方法的？它并非简单调用"父类"。

**回答要点**：`super()` 根据**当前类的 MRO 链**决定调用顺序，调用 MRO 中当前类之后的下一个类的方法；这使得所有类可以按 MRO 顺序协作完成操作（如 `__init__` 链式调用），而非直接跳过兄弟类只调用直接父类。

**Q3（实战）**：在 PyTorch 中，自定义模型继承 `nn.Module` 后为什么不需要手动管理参数？内部的实现机制是什么？

**回答要点**：`nn.Module.__setattr__` 会拦截属性赋值，当检测到赋值的对象是 `nn.Parameter` 或 `nn.Module` 时，自动将其注册到模块的 `_parameters` 或 `_modules` 字典中；因此 `model.parameters()` 能递归收集所有子模块的参数，无须手动管理。

**Q4（边界）**：多重继承在什么情况下会导致复杂难以维护的代码？有什么替代设计模式？

**回答要点**：菱形继承（Diamond Problem）使 MRO 逻辑复杂；父类接口冲突时增加理解难度；替代方案包括：用**组合优于继承**（将功能委托给独立类而非继承）、用 Mixin 类（专注单一功能的抽象基类，保持 MRO 简单）、或用装饰器扩展功能。

> 参见 [[02-继承与多态]]、[[11-封装(Encapsulation)]]、[[13-多态与鸭子类型]]
