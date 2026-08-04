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
# 银行账户类，演示 Python 三种访问级别的命名约定及其访问限制效果
class BankAccount:
    def __init__(self, owner):
        # 公有属性：外部可以直接读写，没有任何访问限制
        self.owner = owner
        # 受保护属性（约定）：以下划线开头，表示"内部使用，外部请勿直接访问"，但 Python 不做强制限制
        self._balance = 0
        # 私有属性（名字修饰）：双下划线开头触发 Name Mangling，自动重命名为 _BankAccount__pin，
        # 子类和外部无法通过原名访问，避免意外覆盖和误用
        self.__pin = "1234"

    # 公有接口方法：外部只需调用 deposit 即可完成存款，无需了解内部余额的存储和管理细节
    def deposit(self, amount):

        self._balance += amount

# 以下代码展示外部对三种访问级别属性的实际访问结果，验证各命名约定的约束力
acc = BankAccount("Alice")
print(acc.owner)                    # 公有属性可直接访问 → Alice
print(acc._balance)                 # 受保护属性虽可访问（Python 不强制阻止），但按约定不应在外部直接读写
print(acc.__pin)                    # 私有属性触发 Name Mangling，原名访问导致 AttributeError
print(acc._BankAccount__pin)        # 绕过名字修饰后的实际名称，技术上可访问但不推荐这样做
```

## property 装饰器

通过 `@property` 实现**可控的属性访问**，在外部看起来像属性访问，内部可执行校验逻辑：

```python
# 温度类，演示 @property 如何将方法伪装成属性，实现可控的读写访问
class Temperature:

    def __init__(self, celsius=0):
        # 将原始温度值存储在受保护属性中，外部应通过 property 接口访问
        self._celsius = celsius

    @property
    def celsius(self):
        """celsius 属性的获取器（getter）——外部可以像访问普通属性一样读取 t.celsius，
        内部返回受保护字段 _celsius 的值，隐藏了实际的存储细节"""
        return self._celsius

    @celsius.setter
    def celsius(self, value):
        """celsius 属性的设置器（setter）——为赋值操作注入校验逻辑，
        阻止低于绝对零度的不合理温度写入，确保数据始终合法"""
        if value < -273.15:
            raise ValueError("温度不能低于绝对零度")

        self._celsius = value

    @property
    def fahrenheit(self):
        """只读计算属性：没有定义 setter，因此外部无法赋值修改；
        每次访问时由摄氏温度实时换算得出，保证两个温度值始终同步"""
        return self._celsius * 9/5 + 32

# 创建温度实例并验证 property 的读写行为和校验逻辑
t = Temperature(25)
print(t.celsius)                     # 像访问普通属性一样读取，触发 getter 返回 25

t.celsius = 30                       # 像给普通属性赋值一样写入，触发 setter 并执行校验
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
**回答要点**：

1. `name` 为公有（Public）：到处可访问，是 Python 属性的默认级别
2. `_name` 为受保护（Protected）：约定为内部使用，Python 不强制限制访问，IDE 会给出弱提示
3. `__name` 为私有（Private）：触发名字修饰（Name Mangling），自动改写为 `_ClassName__name`，子类无法通过原名直接访问

**Q2（深挖）**：名字修饰（Name Mangling）的目的是什么？什么场景下它反而会带来问题？
**回答要点**：

1. 避免子类意外覆盖父类的"私有"属性，子类定义 `__name` 会变为 `_ChildClass__name` 而非 `_ParentClass__name`
2. 调试时属性实际名称改变可能导致困惑，在复杂继承链中属性访问路径不直观
3. 可通过 `dir(obj)` 查看被修饰后的实际属性名称，但依赖内部实现细节存在风险

**Q3（实战）**：property 装饰器在实际项目中有哪些典型用法？它在封装中扮演什么角色？
**回答要点**：

1. 典型用法：定义只读属性（getter 无 setter）、带校验逻辑的赋值、延迟计算（首次访问时计算并缓存）、计算派生属性
2. property 提供"看起来像属性、用起来像方法"的封装接口，对外隐藏内部实现细节
3. 可在不破坏外部 API 的前提下重构内部实现，提升代码的可维护性

**Q4（边界）**：Python 的封装机制和 Java/C++ 的 private/protected 有什么本质不同？这带来什么好处和风险？
**回答要点**：

1. Python 所有属性本质上都可访问（名字修饰只改名不禁止），体现"我们都是成年人"的哲学
2. 好处：调试方便、单元测试可直接访问内部状态、灵活性高
3. 风险：库使用者可能依赖内部实现细节，库升级后代码因内部变更而损坏

## 参考引用
- 需要理解类与对象的相关知识，参见 [类与对象](01-类与对象.md)
- 需要理解继承与多态的相关知识，参见 [继承与多态](02-继承与多态.md)
- 需要理解继承与MRO的相关知识，参见 [继承与MRO](04-继承与MRO.md)
