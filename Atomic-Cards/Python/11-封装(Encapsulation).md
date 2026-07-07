---
author: "XunZong"
created: "2026-07-07"
tags: ["Python", "面向对象", "封装"]
aliases: ["封装", "Encapsulation", "访问控制", "Name Mangling"]
---

# 封装（Encapsulation）

## 定义

封装将数据和操作数据的方法绑定在类内部，对外隐藏实现细节。通过**访问控制机制**限定外部对内部状态的访问权限，只暴露安全、稳定的公有接口。

## 访问级别

Python 通过命名约定控制访问权限（没有 Java/C++ 的 `private/protected` 关键字）：

| 命名方式 | 访问级别 | 示例 | 说明 |
|----------|----------|------|------|
| `name` | **公有** | `self.name` | 到处可访问，默认级别 |
| `_name` | 受保护 | `self._balance` | 约定为内部使用（非强制，仍可访问） |
| `__name` | **私有** | `self.__secret` | 触发名字修饰（Name Mangling），子类无法直接访问 |

## 私有属性与 Name Mangling

双下划线前缀触发 Python 的**名字修饰**机制，自动将 `__name` 改写为 `_ClassName__name`：

```python
class BankAccount:
    def __init__(self, owner):
        self.owner = owner          # 公有
        self._balance = 0           # 受保护（约定）
        self.__pin = "1234"         # 私有（名字修饰 → _BankAccount__pin）

    def deposit(self, amount):      # 公有接口
        self._balance += amount

# 外部访问
acc = BankAccount("Alice")
print(acc.owner)                    # ✅ 公有 → Alice
print(acc._balance)                 # ⚠️ 可访问但不推荐
print(acc.__pin)                    # ❌ AttributeError（名字修饰）
print(acc._BankAccount__pin)        # ⚠️ 实际名称，可绕过但不推荐
```

## property 装饰器

通过 `@property` 实现**可控的属性访问**，在外部看起来像属性访问，内部可执行校验逻辑：

```python
class Temperature:
    def __init__(self, celsius=0):
        self._celsius = celsius

    @property
    def celsius(self):               # 获取（像属性一样访问）
        return self._celsius

    @celsius.setter
    def celsius(self, value):        # 设置（带校验）
        if value < -273.15:
            raise ValueError("温度不能低于绝对零度")
        self._celsius = value

    @property
    def fahrenheit(self):            # 只读属性（无 setter）
        return self._celsius * 9/5 + 32

t = Temperature(25)
print(t.celsius)                     # 25（像属性一样读）
t.celsius = 30                       # 像属性一样写（触发校验）
```

## 封装的 ML/DL 应用

| 应用场景 | 体现 | 说明 |
|----------|------|------|
| PyTorch `nn.Module` | `forward()` 公有接口，内部实现细节隐藏 | 用户只需调用 `model(x)`，反向传播等细节在内部封装 |
| sklearn Estimator | `fit()` / `predict()` 统一接口 | 算法实现被封装，用户只需调用标准接口 |
| 配置管理 | 模型超参通过构造函数注入，不暴露内部变量管理逻辑 | 防止外部意外修改关键参数 |
| 数据集封装 | `Dataset.__getitem__()` 隐藏数据加载细节 | 用户只需通过索引获取样本，内部处理文件 IO、预处理等 |

## 面试追问

**Q1（基础）**：Python 中 `_name`、`__name` 和 `name` 三种命名方式的访问权限有什么区别？
**回答要点**：`name` 为公有，到处可访问；`_name` 为受保护（约定俗成，非强制，IDE 会弱提示）；`__name` 为私有，触发名字修饰变为 `_ClassName__name`，子类无法直接访问；Python 的访问控制是"君子协定"而非强制。

**Q2（深挖）**：名字修饰（Name Mangling）的目的是什么？什么场景下它反而会带来问题？
**回答要点**：目的是避免子类意外覆盖父类的"私有"属性，`__name` 在子类中变为 `_ChildName__name` 而非 `_ParentName__name`；问题：调试时属性名称改变导致困惑，继承链复杂时属性访问路径不直观，可通过 `dir(obj)` 查看实际名称。

**Q3（实战）**：property 装饰器在实际项目中有哪些典型用法？它在封装中扮演什么角色？
**回答要点**：只读属性（getter 无 setter）、带校验的赋值、延迟计算（首次访问时计算并缓存）、计算属性（从其他属性派生）；property 提供了"看起来像属性、用起来像方法"的封装接口，在不破坏外部 API 的前提下重构内部实现。

**Q4（边界）**：Python 的封装机制和 Java/C++ 的 private/protected 有什么本质不同？这带来什么好处和风险？
**回答要点**：Python 所有属性本质上都是可访问的（名字修饰只是改名而非禁止），体现了"我们都是成年人"哲学；好处：调试方便，单元测试可以直接访问内部状态，灵活性强；风险：库使用者可能依赖内部实现细节，升级后代码损坏。

> 参见 [[02-继承与多态]]、[[12-继承与MRO]]、[[13-多态与鸭子类型]]
