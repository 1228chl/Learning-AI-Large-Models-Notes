**上一级：** [[01面向对象基础]]

**标签：** #python #进阶 

---

# 面向对象（OOP）

## 1. 面向对象基础

- 面向过程：
  - 解决问题/需求时，需要将问题/需求拆解为一步一步的步骤，用代码来实现每一步，侧重过程
  - 可以将代码封装到==函数==中

- 面向对象：对象实体调用，分配任务，由对象实体进行任务细节的执行。
  - 功能和数据进行分离，功能用方法实现，数据用属性进行设计
  - 解决问题/需求时，将需求抽象出==类==和==对象==，将代码以属性和方法形式进行封装，通过对象进行调用，实现需求
  - 三大特性：封装、继承、多态
    - 封装：将属性和方法封装到类中，给属性和方法添加访问权限
    - 继承：子类继承父类的公有属性和方法
    - 多态：不同类的同一个方法有不同的展现形态

---

### 1.1 类

- 一类具有相似特征和行为事物的统称
  - 抽象的 泛指，看不见摸不着

- 对象是类底下的具体的事物，由类创建出来（没有类就没有对象）
  - Python中一切皆对象
  - 看的见摸得着

---

### 1.2 类的定义

 - 面向对象：对象具有的基本属性
   - 属性：管理数据
   - 方法：操作数据
 - 类和对象的关系：类相当于模板，对象是制作的实体

~~~python
class 类名:
    属性 property
    方法 method
class 类名(object):#其中object是所有类的基类
    属性 property
    方法 method
~~~

~~~python
# defined class
class Person(object):
    # defined property
    name = "zhangsan "
    age = 18
    # defined method
    def speak(self):
        print(f"hello {self.name}")
~~~

---

### 1.3 类的实例化（创建对象）

类的实例化就是通过类获得对象

~~~python
对象名 = 类名()
~~~

> 在其他的编程语言中，类的实例化一般是通过new关键字进行实例化生成，但是在python中，我们不需要new关键字，只需要`类名` + `()`就代表类的实例

~~~python
# 1、定义一个类
class Person(object):
    # 定义相关方法
    def eat(self):
        print('吃零食')
    def drink(self):
        print('喝可乐')
# 2、实例化对象
p1 = Person()
# 3、调用类中的方法
p1.eat()
p1.drink()
p2 = Person()
~~~

> 类是一个抽象概念，在定义时，不会真正的占用计算机的内存空间。但是对象是一个具体的事物，所以需要占用计算机的内存空间。

---

### 1.4 类中的self关键字

> `self`是python内置的关键字之一，作用是指向**类实例对象本身**。
>
> 默认在传参的时候是第一个，所以在定义函数或方法时，需要注意。

~~~python
# 1、定义一个类
class Person():
    # 定义一个方法
    def speak(self):
        print(self)
        print('Nice to meet you!')
~~~

## 2. 对象的的属性添加与获取

### 2.1 在类的外面添加属性和获取属性

#### 2.1.1 设置

~~~python
对象名.属性 = 属性值
~~~

~~~python
# 1、定义一个Person类
class Person(object):
    pass

# 2、实例化Person类，生成p1对象
p1 = Person()
# 3、为p1对象添加属性
p1.name = '老王'
p1.age = 18
p1.address = '北京市顺义区京顺路99号'
~~~

---

#### 2.1.2 获取

> 在python中我们可以通过==对象名.属性==来获取

~~~python
# 1、定义一个Person类
class Person():
    pass
# 2、实例化Person类，生成p1对象
p1 = Person()
# 3、为p1对象添加属性
p1.name = '老王'
p1.age = 18
p1.address = '北京市顺义区京顺路99号'
# 4、获取p1对象的属性
print(f'我的姓名：{p1.name}')
print(f'我的年龄：{p1.age}')
print(f'我的住址：{p1.address}')
~~~

---

### 2.2 在类的内部获取外部定义的属性

~~~python
# 1、定义一个Person类
class Person():
    def speak(self):
        print(f'我的名字：{self.name}，我的年龄：{self.age}，我的住址：{self.address}')
# 2、实例化Person类，生成p1对象
p1 = Person()
# 3、添加属性
p1.name = '孙悟空'
p1.age = 500
p1.address = '花果山水帘洞'
# 4、调用speak方法
p1.speak()
~~~

## 3. 魔术方法

### 3.1 什么是魔术方法

> 魔术变量：`__name__`，`__file__`这些都是魔术变量（拥有特殊功能的变量）。在Python中，`__xxx__()`的函数叫做魔法方法，指的是具有==特殊功能==的函数。
>
> 其中的一些**特定方法**是会在**特定的情况**进行触发执行的。

---

### 3.2 \_\_inti_\_方法（初始化方法或构造方法）

> ① _\_init\_\_()方法，在创建一个对象时默认被调用，不需要手动调用
>
> ② \_\_init\_\_(self)中的self参数，不需要开发者传递，python解释器会自动把当前的对象引用传递过去。

~~~python
 # 1、定义一个类
class Person():
    # 初始化实例对象属性
    def __init__(self, name, age):
        # 赋予name属性、age属性给实例化对象本身
        # self.实例化对象属性 = 参数
        self.name = name
        self.age = age

# 2、实例化对象并传入初始化属性值
p1 = Person('孙悟空', 500)
# 3、调用p1对象自身属性name与age
print(p1.name)
print(p1.age)
~~~

---

### 3.3 _\_str\_\_()方法

> ① `__str__`这个魔术方法是在类的外部，使用print(对象)时，自动被调用的
>
> ② 在类的内部定义`__str__`方法时，必须使用return返回一个字符串类型的数据

~~~python
# 1、定义一个类
class Car():
    # 首先定义一个__init__方法，用于初始化实例对象属性
    def __init__(self, brand, model, color):
        self.brand = brand
        self.model = model
        self.color = color

    # 定义一个__str__内置魔术方法，用于输出小汽车的相关信息
    def __str__(self):
        return f'汽车品牌：{self.brand}，汽车型号：{self.model}，汽车颜色：{self.color}'

# 2、实例化对象c1
c1 = Car('奔驰', 'S600', '黑色')
print(c1)
~~~

---

### 3.4 _\_del\_\_()方法

> 当删除对象时（调用del删除对象或者文件执行结束后），python解释器会自动调用`__del__()`方法。
>
> **主要作用：**适用于关闭文件、关闭数据库连接等等。

~~~python
class Person():
    # 构造函数__init__
    def __init__(self, name, age):
        self.name = name
        self.age = age

    # 析构方法__del__
    def __del__(self):
        print(f'{self}对象已经被删除')

# 实例化对象
p1 = Person('白骨精', 100)
# 删除对象p1
del p1
~~~

---

### 3.5  _\_mro\_\_()方法

> MRO(Method Resolution Order)：方法解析顺序，我们可以通过`类名.__mro__`或`类名.mro()`获得“类的层次结构”，方法解析顺序也是按照这个“类的层次结构”寻找到。

~~~python
class Car(object):
    def __init__(self, brand, model, color):
        self.brand = brand
        self.model = model
        self.color = color

    def run(self):
        print('i can run')


class GasolineCar(Car):
    def run(self):
        print('i can run with gasoline')


class ElectricCar(Car):
    def __init__(self, brand, model, color, battery):
        super().__init__(brand, model, color)
        # 电池属性
        self.battery = battery

    def run(self):
        print(f'i can run with electric，i has a {self.battery} + "kwh battery"')

print(ElectricCar.__mro__)
print(ElectricCar.mro())
~~~

> **综上**：object类还是所有类的基类（因为这个查找关系到object才终止）

---

## 4. 面向对象的三大特性

### 4.1 封装

> **概念：**
>
> ①把现实世界中主体的属性和方法写到类里面的操作即为封装。
>
> ②封装可以为属性和方法添加为私有权限，不能直接被外部访问。
>
> **意义：**
>
> ①以面向对象的编程思想进行项目开发
>
> ②封装数据属性：明确的区分内外，控制外部对隐藏的属性的操作（过滤异常数据）
>
> ③私有方法封装的意义：降低程序的复杂度

~~~python
class Person():
    封装属性
    封装方法
~~~

---

#### 4.1.1 私有属性的访问限制

> 设置私有属性和私有方法的方式：在属性名和方法名前面加上两个下划线`__`即可

~~~python
class Girl():
    def __init__(self, name):
        self.name = name
        self.__age = 18
xiaomei = Girl('小美')
print(xiaomei.name)
print(xiaomei.__age)  # 报错，提示Girl对象没有__age属性
# 或者可以通过 类名._类名__属性名 访问
print(xiaomei._Girl__age)
~~~

> 类中的私有属性和方法，不能被其子类继承

---

#### 4.1.2 私有属性设置于访问“接口”

> 外部可以通过特定的“接口”来实现对私有属性的访问。
>
> 接口一般是一个函数，这个函数可以实现对某些属性的访问（设置于获取）。
>
> 在python中，一般定义函数名`get_xxx`用来获取私有属性，定义`set_xxx`用来修改私有属性。

~~~python
class Girl():
    def __init__(self, name):
        self.name = name
        self.__age = 18
    # 公共方法：提供给外部的访问接口
    def get_age(self):
        # 内部访问：允许直接访问
        # 外部访问：根据需求要添加限制条件
        return self.__age
    # 公共方法：提供给外部的设置接口
    def set_age(self, age):
        self.__age = age
girl = Girl('小美')
girl.set_age(19)
print(girl.get_age())
~~~

---

#### 4.1.3 私有方法

> 私有方法与私有属性基本一致，在方法名的前面添加两个下划线`__方法名()`

---

### 4.2 继承

> 继承是实现**代码复用**和**建立类层级**的核心机制，允许子类自动拥有父类的公共属性和方法。

> - **继承**：一个类从另一个已有的类获得其成员的相关特性，即继承。
> - **派生**：从一个已有的类产生一个新的类，称为派生。
> - **父类**：也叫做基类，即使指已有被继承的类。
> - **子类**：也叫做派生类或者扩展类。
> - **扩展**：在子类中增加一些自己特有的特性，就叫做扩展，没有扩展，继承也就没有意义了。
> - **单继承**：一个类只能继承自一个其他的类，不能继承多个类，单继承也是大多数面向对象的特性。
> - **多继承**：一个类同时继承了多个父类。

---

#### 4.2.1 继承的基本语法

~~~python
class B(object):
    pass
class A(B):
    pass
a = A()
a.B中的所有公共属性
a.B中的所有公共方法
~~~

---

#### 4.2.2 单继承

~~~python
# 1、定义一个共性类（父类）
class Person(object):
    pass
# 2、定义一个个性类（子类）
class Student(Person):
    pass
~~~

---

#### 4.2.3 单继承（多层继承）

~~~python
class C(object):
    def func(self):
        print('我是C类中的相关方法func')
class B(C):
    pass
class A(B):
    pass
a = A()
a.func()
~~~

> 在python继承中，A类继承了B类，B类又继承了C类。则根据继承的传递性，则A类也会自动继承C类中所有**公共属性**和**公共方法**。

---

#### 4.2.4 多继承

> python是少数支持多继承的一门编程语言，所谓的多继承就是允许一个类同时继承自多个类的特性。

~~~python
class B(object):
    pass
class C(object):
    pass
class A(B, C):
    pass
a = A()
a.B中的所有属性和方法
a.C中的所有属性和方法
~~~

> **注意**：虽然多继承允许同时继承自多个类，但实际开发中，应尽量避免使用多继承，因为如果两个类中出现了相同的属性和方法就会产生命名冲突。

> **拓展**：如果在多继承的父类中有同名方法，可以使用`父类名.同名方法名`来使用特定的方法

~~~python
class B(object):
    def a():
        pass
class C(object):
    def a():
        pass
class A(B, C):
    B.a()
    C.a()
~~~

---

### 4.3 多态

> 多态是一种使用对象的方式，子类重写父类方法调用不同子类对象的相同方法，可以产生不同的执行结果。

> ①多态依赖继承（不是必须的）
>
> ②子类方法必须要重写父类方法

> 首先定义一个父类，其可能拥有多个子类对象。当我们调用一个公共方法（接口）时，传递的对象不同，则返回的结果不同。
>
> **好处**：调用灵活，有了多态，更容易编写出通用的代码，做出通用的编程，以适应需求的不断变化。

---

#### 4.3.1 代码实现

~~~python
class Fruit:
    def makejuice(self):
        print("i can make juice")
class Apple(Fruit):
    # 重写父类方法
    def makejuice(self):
        print('i can make apple juice')

class Banana(Fruit):
    # 重写父类方法
    def makejuice(self):
        print('i can make banana juice')

class Orange(Fruit):
    # 重写父类方法
    def makejuice(self):
        print('i can make orange juice')

# 定义一个公共接口（专门用于实现榨汁操作）
def service(obj):
    # obj要求是一个实例化对象，可以传入苹果对象/香蕉对象
    obj.makejuice()
# 调用公共方法
service(Orange())
~~~

---

### 4.4 重写

> 重写也叫作==覆盖==，就是当子类成员与父类成员名字相同的时候，从父类继承下来的成员会重新定义。此时，通过子类实例化出来的对象访问相关成员的时候，真正作用的是子类中定义的成员。
>
> **注意**：
>
> 如果子类中的属性和方法与父类中的属性或方法同名，则子类中的属性或方法会对父类中的同名属性或方法进行重写（覆盖）。
>
> 类方法的调用顺序，当我们在子类中重构父类的方法后，Cat子类的实例先会在自己的类 Cat 中查找该方法，当找不到该方法时才会去父类 Animal 中查找对应的方法。

~~~python
class  Father(object):
       # 属性
       # 方法
class Son(Father):
       # 默认继承父类属性和方法
       # 自己的属性和方法
~~~

> **重写的意义**：继承让子类继承父类的所有公共属性和方法，但是如果仅仅是为了继承公共属性和方法，继承就没有实际的意义了，应该是在继承以后，子类应该有一些自己的属性和方法。

---

### 4.5 super()方法

> **super()作用**：调用父类属性或方法。
>
> **super()完整写法**：`super(当前类名,self).属性或方法()`，在python3以后版本中，钓鱼呢父类的属性方法只需要使用`super().属性或super().方法名()`就可以完成调用。

~~~python
class Car(object):
    def __init__(self, brand, model, color):
        self.brand = brand
        self.model = model
        self.color = color

    def run(self):
        print('i can run')

class GasolineCar(Car):
    def run(self):
        print('i can run with gasoline')


class ElectricCar(Car):
    def __init__(self, brand, model, color, battery):
        super().__init__(brand, model, color)
        # 电池属性
        self.battery = battery

    def run(self):
        print(f'i can run with electric，i have a {self.battery} + "kwh battery"')


bwm = GasolineCar('宝马', 'X5', '白色')
bwm.run()

tesla = ElectricCar('特斯拉', 'Model S', '红色', 70)
tesla.run()
~~~

## 5. 编写面向对象代码种的常见问题

### 5.1 类名问题

**问题**：在定义类时，有没有遵循类的命名规则

> 在python中，类理论上是区分大小写的（在python中类可以全部大写也可以全部小写）。但是要遵循一定的命名规范：首字母必须是字母或下划线，其中可以包含字母、数字、下划线，而且要求其命名方式采用大驼峰。
>
> 电动汽车：EletricCar
> 父类：Father
> 子类：Son

---

### 5.2 继承问题

**问题**：父类一定要继承object么？

> 在python面向对象代码中，建议在编写父类时，让其自动继承object类。但是其实不写也可以，因为默认情况下，Python中的所有类都继承自object。

---

### 5.3 书写问题

**问题**：初始化对象属性的魔术方法？

> 在定义魔术方法`__init__`名字经常会错误的写为`__int__`

## 6. 面向对象其他特性（重点）

### 6.1 类属性

> python中，属性可以分为==实例属性==和==类属性==。
>
> 类属性就是类对象中定义的属性，它被该类的所有实例对象所共有。通常用来记录与这类相关的特征，类属性不会用于记录具体对象的特征。

> 在Python中，一切皆对象。类也是一个特殊的对象，我们可以单独为类定义属性。

~~~python
class Person(object):
    # 定义类属性
    count = 0
    def __init__(self, name, age):
        self.name = name
        self.age = age

p1 = Person('Tom', 23)
p2 = Person('Harry', 26)
~~~

> 注意：
>
> 使用`对象.类属性`修改类属性，只会影响**调用对象**
>
> 使用`类名.类属性`修改类属性，会影响**所有对象**

---

### 6.2 类属性代码实现

~~~python
class Person(object):
    # 定义类属性count
    count = 0

    # 定义一个__init__魔术方法，用于进行初始化操作
    def __init__(self, name):
        self.name = name
        # 对count类属性进行+1操作，用于记录这个Person类一共生成了多少个对象
        Person.count += 1

# 1、实例化对象p1
p1 = Person('Tom')
p2 = Person('Harry')
p3 = Person('Jennifer')
# 2、在类外部输出类属性
print(f'我们共使用Person类生成了{Person.count}个实例对象')
~~~

---

### 6.3 类方法

> 类方法主要用于操作类属性或类中的其他方法。
>
> 为什么需要类方法，在面向对象中，特别强调数据封装性。所以不建议直接在类的外部对类属性进行直接获取。所以我们如果想操作类属性，建议使用类方法。
>
> 使用装饰器`@classmethod`来定义方法为**类方法**，其中的参数需要换成`类对象`

~~~python
class Tool(object):
    # 定义一个类属性count
    count = 0
    # 定义一个__init__初始化方法
    def __init__(self, name):
        self.name = name
        Tool.count += 1
    # 封装一个类方法：专门实现对Tool.count类属性进行操作
    @classmethod
    def get_count(cls):
        print(f'我们使用Tool类共实例化了{cls.count}个工具')
t1 = Tool('斧头')
t2 = Tool('榔头')
t3 = Tool('铁锹')
Tool.get_count()
~~~

---

### 6.4 静态方法

> **静态方法的使用时机**：
>
> ①**既**不需要访问**实例属性**或者调用**实例方法**
>
> ②**也**不需要访问**类属性**或者调用**类方法**
>
> 用装饰器`@staticmethod`来定义静态方法

~~~python
# 开发一款游戏
class Game(object):
    # 开始游戏，打印游戏功能菜单
    @staticmethod
    def menu():
        print('1、开始游戏')
        print('2、游戏暂停')
        print('3、退出游戏')
# 开始游戏、打印菜单
Game.menu()
~~~

# 闭包和装饰器

## 1. 全局变量和局部变量

### 1.1 作用域

> 在Python代码中，作用域分为两种情况：全局作用域 与 局部作用域

---

### 1.2 变量的作用域

> 在全局定义的变量 => 全局变量
>
> 在局部定义的变量 => 局部变量

---

### 1.3 全局变量与局部变量的访问范围

> ① 在全局作用域中可以访问全局变量，在局部作用域中可以访问局部变量

~~~python
# 全局作用域（全局变量）
num1 = 10
def func():
    # 局部作用域（局部变量）
    num2 = 20
    # ① 在局部访问局部变量
    print(num2)
# ① 在全局访问全局变量
print(num1)
# 调用函数
func()
~~~

> ② 在局部作用域中可以访问全局变量

~~~python
# 全局作用域（全局变量）
num1 = 10
def func():
    # 局部作用域（局部变量）
    # ② 在局部作用域中可以访问全局变量
    print(num1)
# 调用函数
func()
~~~

> ③ 在全局作用域中不能访问局部变量

~~~python
# 全局作用域（全局变量）
num1 = 10
def func():
    # 局部作用域（局部变量）
    num2 = 20
# 调用函数
func()
# 在全局作用域中调用局部变量num2
print(num2)
~~~

> ④在局部作用域中修改全局变量用`global`关键字

~~~python
# 全局作用域（全局变量）
num1 = 10# 全局变量
def fun1():
    # 局部作用域
    global num1 # 局部变量
    num1 = 20
    print(num1)
fun1()
print(num1)

~~~

---

### 1.4 为什么在全局作用域中无法访问局部变量

> 主要原因在于，在Python的底层存在一个“垃圾回收机制”，主要的作用就是回收内存空间。加快计算机的运行。我们在Python代码中定义的变量也是需要占用内存的，所以Python为了回收已经被已经过的内存，会自动将函数运行以后的内部变量和程序直接回收。

---

## 2. 闭包

### 2.1 闭包的作用

> 在==函数嵌套==的前提下，内部函数==使用了外部函数的变量==，并且外部函数==返回了内部函数==，我们把这个使用外部函数变量的内部函数称为闭包。

---

### 2.2 闭包的构成条件（三步走）

> 第一步：有嵌套
>
> 第二步：有引用
>
> 第三步：有返回

~~~python
def func():
    num = 20  # 局部变量
    def inner():
        print(num)
    return inner  # 实际上inner函数并没有执行，只是返回了inner函数在内存中的地址

f = func()  # 相当于把inner在内存中的地址0x...赋值给变量f
f()  # 找到inner函数的内存地址，并执行器内部的代码（num=20)，在于闭包函数保留了num=20这个局部变量
~~~

> **闭包的作用**：正常情况下，当执行`func()`的时候，函数内部的变量`num = 20`，会随着函数的`func`函数的结束而被垃圾回收机制所回收。
>
> **所以闭包的真正作用**：就是可以在全局作用域中，实现间接对局部变量进行访问。

---

### 2.3 在闭包的内部实现对外部变量的修改

> **新知识点**：nonlocal关键字（在函数内部修改函数外部的变量，这个变量非全局变量）
>
> **老知识点**：global关键字（在函数内部声明变量，代表引用全局作用域中的全局变量）

~~~python
def func():
    num = 10
    def inner():
        nonlocal num
        num = 20
        print("内部",num)
    print("外部",num)
    inner()
    print("外部",num)
    return inner
f = func()
f()
~~~

---

### 2.4 带参闭包实现数值累加

> **闭包的使用场景**：实现携带记忆状态的功能（闭包 + 引用外部函数作用域的参数（作为记忆状态））

~~~python
def func():
    # 初始化累加初始值
    result = 0
    def inner(num):
        nonlocal result
        result += num
        print("n",result)
    return inner

f = func()
f(1)
f(2)
f(3)
~~~

---

## 3. 装饰器

> **在不改变现有函数源代码以及函数调用方式的前提下，实现给函数增加额外的功能。**
>
> **装饰器的本质就是一个闭包函数**（三步：① 有嵌套 ② 有引用 ③ 有返回）

> 有返回代表外部函数返回内部函数的内存地址（内部函数的名称），不带

~~~python
def decorator(func):
    def wrapper():
        print("登录")
        func()
        print("登出")
    return wrapper

def comment():
    print("评论")

def download():
    print("下载")

f = decorator(comment)
f()
f = decorator(download)
f()

@decorator
def comment():
    print("评论")
@decorator
def download():
    print("下载")

comment()
download()
~~~

> 上面有两种用法：
>
> ①使用`变量名 = 装饰器名（方法名）`
>
> ②使用`@装饰器名`来注释后，可以直接使用原方法

---

### 3.1 装饰器的作用：获取程序的执行时间

~~~python
import time

def get_time(fn):
    def inner():
        # ① 添加装饰器修饰功能（获取程序的执行时间）
        begin = time.time()
        # ② 调用fn函数，执行原函数代码
        fn()
        end = time.time()
        print(f'这个函数的执行时间：{end - begin}')
    return inner

@get_time
def demo():
    for i in range(1000000):
        print(i)

demo()
~~~

---

### 3.2 装饰器进阶

#### 3.2.1 带有参数装饰器

~~~python
'''
带有参数的装饰器：① 有嵌套 ② 有引用 ③ 有返回
'''
def logging(fn):
    def inner(*args, **kwargs):
        # 添加装饰器代码（输出日志信息）
        print('-- 日志信息：正在努力计算机 --')
        # 执行要修饰的函数
        fn(*args, **kwargs)  # sum_num(a, b)
    return inner

@logging
def sum_num(*args, **kwargs):
    result = 0
    # *args代表不定长元组参数，args = (10, 20)
    for i in args:
        result += i
    # **kwargs代表不定长字典参数， kwargs = {a:30, b:40}
    for i in kwargs.values():
        result += i
    print(result)

# sum_num带4个参数，而且类型不同，10和20以元组形式传递，a=30，b=40以字典形式传递
sum_num(10, 20, a=30, b=40)
~~~

---

#### 3.2.2 带有返回值装饰器

~~~python
'''
带有返回值的装饰器：① 有嵌套 ② 有引用 ③ 有返回
如果一个函数执行完毕后，没有return返回值，则默认返回None
'''
def logging(fn):
    def inner(*args, **kwargs):
        print('-- 日志信息：正在努力计算 --')
        return fn(*args, **kwargs)  # fn() = sub_num(20, 10) = result
    return inner

@logging
def sub_num(a, b):
    result = a - b
    return result

print(sub_num(20, 10))
~~~

---

#### 3.2.3 通用版本的装饰器

~~~python
'''
通用装饰器：① 有嵌套 ② 有引用 ③ 有返回 ④ 有不定长参数 ⑤ 有return返回值
'''
def logging(fn):
    def inner(*args, **kwargs):
        # 输出装饰器功能
        print('-- 正在努力计算 --')
        # 调用fn函数
        return fn(*args, **kwargs)
    return inner

@logging
def sum_num1(a, b):
    result = a + b
    return result

print(sum_num1(20, 10))

@logging
def sum_num2(a, b, c):
    result = a + b + c
    return result

print(sum_num2(10, 20, 30))
~~~

---

#### 3.2.4 装饰器高级：使用装饰器传递参数（了解）

基本语法：

~~~python
def 装饰器(fn):
    ...

@装饰器('参数')
def 函数():
    # 函数代码
~~~

实例代码：根据传递参数不同，打印不同的日志信息

~~~python
'''
通用装饰器：① 有嵌套 ② 有引用 ③ 有返回 ④ 有不定长参数 ⑤ 有return返回值
真正问题：通过装饰器传递参数，我们应该如何接收这个参数呢？
答：在logging方法的外侧在添加一个函数，专门用于接收传递过来的参数
'''
def logging(flag):
    # flag = + 或 flag = -
    def decorator(fn):
        def inner(*args, **kwargs):
            if flag == '+':
                print('-- 日志信息：正在努力进行加法运算 --')
            elif flag == '-':
                print('-- 日志信息：正在努力进行减法运算 --')
            return fn(*args, **kwargs)
        return inner
    return decorator

@logging('+')
def sum_num(a, b):
    result = a + b
    return result

@logging('-')
def sub_num(a, b):
    result = a - b
    return result

print(sum_num(10, 20))
print(sub_num(100, 80))
~~~

---

# 网络编程

## 1. 计算机网络概述

### 1.1 网络的概念

> 网络就是将具有独立功能的多台计算机通过通信线路和通信设备连接起来，在网络管理软件及网络通信协议下，实现资源共享和信息传递的虚拟平台。

---

### 1.2 IP地址概述

> IP地址是分配给网络设备上网使用的数字标签，它能够标识网络中唯一的一台设备，好比现实中每个人都有一个手机号

---

### 1.3 端口和端口号

> 每运行一个程序都会有一个端口，想要给对应的程序发送数据，找到对应的端口即可。端口就是传输数据的通道，好比教室的门，是数据传输必经之路。
>
> 而且每一个端口都会有一个对应的端口号（操作系统为了统一管理这么多端口，就对端口进行了编号，这就是端口号，端口号其实就是一个数字，好比我们现实生活中的门牌号），想要找到端口通过端口号即可。
>
> **最终通信结果**：通过IP地址找到对应的设备，通过端口号找到对应的端口，然后通过端口把数据给应用程序。

> 拓展：
>
> ①知名端口号：
>
> 知名端口号是指众所周知的端口号，范围从0到1023，这些端口号一般固定分配给一些服务，比如21端口分配给FTP（文件传输协议）服务，22端口分配给SSH（安全外壳  协议，主要用于远程连接与文件传输），25端口分配给SMTP（简单邮件传输协议）服务，80端口分配给HTTP服务，443端口分配给HTTPS服务等等。
>
> ②动态端口号
>
> 一般程序员开发应用程序使用端口号称为动态端口号。
>
> 动态端口号的范围是从1024到65535，如果程序员开发的程序没有设置端口号，操作系统会在动态端口号这个范围内随机生成一个给开发的应用程序使用。

> **注意**：当运行一个程序默认会有一个端口号，当程序退出时，所占用的这个端口号就会被释放。

---

### 1.4 TCP协议

> TCP的英文全拼(Transmission Control Protocol)简称传输控制协议，它是一种面向连接的、可靠的、基于字节流的传输层通信协议。
>
> **TCP通信步骤**：① 创建连接 ② 传输数据 ③ 关闭连接
>
> TCP通信模型相当于生活中的’打电话‘，在通信开始之前，一定要先建立好连接，才能发送数据，通信结束要关闭连接。

> **特点：**
>
> **①面向连接**：通信双方必须先建立好连接才能进行数据的传输，并且双方都会为此连接分配必要资源用来记录连接的状态和信息。当数据传输完成后，双方必须断开此连接，以释放系统资源。
>
> **②可靠传输**：
>
> - TCP采用发送应答机制
>   - 通过TCP这种方式发送的每个报文段都必须得到接收方的应答才认为这个TCP报文段传送成功
> - 超时重传
>   - 发送端发送一个报文之后就会启动定时器，如果指定时间内没有得到应答就会重新发送这个报文段
> - 错误校验
>   - TCP用一个校验和函数来校验数据是否有错误，在发送和接收时都要计算校验和
> - 流量控制和阻塞管理
>   - 流量控制用来避免发送端发送过快而使得接收方来不及接收

> **拓展：UDP协议（不可靠传输协议）**
>
> TCP可靠协议（数据可以100%传输）
>
> 日常通信、数据传输一定要保证可靠性，使用TCP。
>
> UDP不可靠协议（只能保证速度，但是没办法保证数据传输质量，发送5M => 接收3.75M）
>
> 有些情况下，我们对数据的质量没有要求，可以考虑使用UDP，如视频通话。

---

## 2. Python3编码转换

> 在计算机网络中，数据都是以二进制的形式进行传输的。所以在网络传输数据的时候，数据需要先编码转化为二进制（bytes）数据类型
>
> I Love Python => 字符串 => 转换为二进制数据 => 网络中传输

- 数据的编码转换
  - `encode`：**编码** 将字符串转化为字节码
  - `decode`：**解码** 将字节码转化为字符串

> **提示**：`encoed()`和`decode()`函数可以接受参数，`encoding`是指在编解码过程中使用的编码方案。

字符串编码：

~~~python
str.encode(encoding = "utf-8")
~~~

二进制解码：

~~~python
bytes.decode(encoding = "utf-8")
~~~

---

## 3. socket网络编程

### 3.1 socket套接字

> socket套接字工具，它是计算机之间进行**通信**的**一种约定**或一种方式。通过 socket 这种约定，一台计算机可以接收其他计算机的数据，也可以向其他计算机发送数据。

---

### 3.2 TCP客户端程序开发流程及应用实践（五步走）

> 1. 创建客户端套接字对象（买电话）
> 2. 和服务端套接字建立连接（打电话）
> 3. 发送数据（说话）
> 4. 接受数据（接听）
> 5. 关闭客户端套接字（挂电话）

#### socket类的介绍

~~~python
① 导入socket模块
import socket

② 创建客户端socket对象使用socket类
socket.socket(AddressFamily, Type)
~~~

#### 客户端socket类的参数和方法说明

| 参数名        | 说明                       |
| ------------- | -------------------------- |
| AddressFamily | IP地址类型，分为IPv4和IPv6 |
| Type          | 传输协议类型               |

#### 开发客户端需要使用的函数

| 方法名  | 说明                   |
| ------- | ---------------------- |
| connect | 和服务端套接字建立连接 |
| send    | 发送数据               |
| recv    | 接收数据               |
| close   | 关闭连接               |

#### TCP客户端程序开发实践

~~~python
import socket
if __name__ = '__main__':
    # 1、创建客户端套接字对象
    tcp_client_socket = socket.socket(socket.AF_INET,socket.SOCK_STREAM)
    # 2、和服务器端套接字建立连接(参数必须是一个元祖)
    tcp_client_socket.connect(("192.168.31.181",8000))
    # 3、发送数据
    tcp_client_socket.send('hell,itheima'.encode(encoding='utf-8'))
    # 4、接收数据
    recv_data = tcp_client_socket.recv(1024).decode('utf-8')
    print(recv_data)
    # 5、关闭客户端套接字
    tcp_client_socket.close()
~~~

---

### 3.3 TCP服务端开发流程及应用实践（七步走）

> 1. 创建服务端套接字对象
> 2. 绑定IP地址和端口号
> 3. 设置监听
> 4. 等待接收客户端的连接请求
> 5. 接收数据
> 6. 发送数据
> 7. 关闭套接字

#### socket类的介绍

~~~python
① 导入socket模块
import socket

② 创建客户端socket对象使用socket类
socket.socket(AddressFamily, Type)
~~~

#### 客户端socket类的参数和方法说明

| 参数名        | 说明                       |
| ------------- | -------------------------- |
| AddressFamily | IP地址类型，分为IPv4和IPv6 |
| Type          | 传输协议类型               |

####  开发服务器端需要使用的函数

| 方法名 | 说明                     |
| ------ | ------------------------ |
| bind   | 绑定IP地址和端口号       |
| listen | 设置监听                 |
| accept | 等待接收客户端的连接请求 |
| send   | 发送数据                 |
| recv   | 接收数据                 |

#### TCP服务器端程序开发实践

~~~python
import socket
if __name__ = '__main__':
    # 1、创建服务器端套接字对象
    tcp_server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    # 2、绑定IP地址与端口号
    tcp_server_socket.bind(("", 8888))
    # 3、开启监听
    tcp_server_socket.listen(128)
    # 4、等待接收客户端连接请求
    conn_socket, ip_port = tcp_server_socket.accept()
    print('客户端IP+端口：', ip_port)
    # 5、接收数据
    recv_data = conn_socket.recv(1024)
    print('接收到的数据：', recv_data.decode())
    # 6、发送数据
    conn_socket.send("客户端的数据已经收到了".encode())
    # 7、关闭套接字
    conn_socket.close()
    tcp_server_socket.close()
~~~

#### 拓展：TCP服务器端开发之多客户端

~~~python
# 导入模块
import socket

# 1、创建套接字对象
tcp_server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
# 2、绑定IP与端口
tcp_server_socket.bind(("", 8090))
# 3、设置监听
tcp_server_socket.listen(128)
# 4、等待客户端连接
while True:
    # 使用try...except捕获连接异常
    try:
        new_socket, ip_port = tcp_server_socket.accept()
        while True:
            try:
                # 5、接收客户端发送过来的消息
                recv_data = new_socket.recv(1024)

                recv_data = recv_data.decode('gbk')
                print(f'{ip_port}：{recv_data}')

                content = input('服务器端消息：').encode('gbk')
                new_socket.send(content)

            except ConnectionResetError:
                print(f'{ip_port}客户端连接已经断开')
                break
    except:
        print('出错，退出服务器监听')
        break

# 关闭套接字对象
tcp_server_socket.close()
~~~

#### TCP网络应用程序开发注意点

> 1. 当TCP客户端程序想要和TCP服务端程序进行通信的时候必须要先**建立连接**
> 2. TCP客户端程序一般不需要绑定端口号，因为客户端是主动发起建立连接的
> 3. **TCP服务端程序必须绑定端口号**，否则客户端找不到这个TCP服务端程序
> 4. `listen`后的套接字是被动套接字，**只负责接收新的客户端的连接请求，不能收发信息**
> 5. 当TCP客户端程序和TCP服务端程序连接成功后，TCP服务端程序会产生一个**新的套接字**，收发客户端消息使用该套接字
> 6. 关闭`accept`返回的套接字意味着**和这个客户端已经通信完毕**
> 7. **当客户端的套接字调用close后，服务器端的recv会解阻塞，返回的数据长度为0**，服务端可以通过返回数据的长度来判断客户端是否已经下线，反之**服务端关闭套接字，客户端的recv也会解阻塞，返回的数据长度也为0**

**端口复用**：

~~~python
import socket

if __name__ == '__main__':
    # 1、创建服务器端套接字对象
    tcp_server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    # 设置端口复用
    tcp_server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, True)
    # 2、绑定IP地址与端口号
    tcp_server_socket.bind(("", 8888))
    # 3、开启监听
    tcp_server_socket.listen(128)
    # 4、等待接收客户端连接请求
    conn_socket, ip_port = tcp_server_socket.accept()
    print('客户端IP+端口：', ip_port)
    # 5、接收数据
    recv_data = conn_socket.recv(1024)
    print('接收到的数据：', recv_data.decode())
    # 6、发送数据
    conn_socket.send("客户端的数据已经收到了".encode())
    # 7、关闭套接字
    conn_socket.close()
    tcp_server_socket.close()
~~~

---

### 3.4 拓展：飞秋消息

~~~python
content = '1:134871264:斌哥:黑马程序员:32:你好，帅哥！'


[0] 消息类型：'1'
[1] 发送者ID：'134871264'
[2] 发送者昵称：'斌哥'
[3] 群组或组织名称：'黑马程序员'
[4] 接收者ID：'32'
[5] 消息正文：'你好，帅哥！'

0.消息类型 (1)
    表示消息的类别。例如：1 可能表示文本消息；
    其他值可能代表文件传输、表情包等不同消息类型。
1. 发送者ID (134871264)
    标识发送者的唯一用户ID，在局域网内用于识别不同的用户。
2.发送者昵称 (斌哥)
    发送者的显示昵称，接收方可以直观地看到是谁发送的消息。
3.群组或组织名称 (黑马程序员)
    表示发送者所属的群组或者组织，用于标识团队或单位。
4.接收者ID (32)
    标识目标接收者的唯一用户ID，用于点对点通信时指定接收方。
5.消息正文 (你好，帅哥！)
    实际要发送的文本内容，可以是聊天信息或其他数据
~~~

**点对点消息**：

~~~python
import socket
# AF_INET: ipv4地址  SOCK_DGRAM:UDP协议
udp_client_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
# 飞秋服务器地址和端口号
server = ('192.168.109.58', 2425)
# 消息内容
content = '1:134871264:斌哥:黑马程序员:32:你好，帅哥！'
# sendto():发送消息  注意:编码是gbk
udp_client_socket.sendto(content.encode('gbk'), server)
~~~

**群发消息**：

~~~python
import socket
# AF_INET: ipv4地址  SOCK_DGRAM:UDP协议
udp_client_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
# TODO 设置广播SO_BROADCAST
udp_client_socket.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
# 飞秋服务器地址和端口号
server = ('192.168.109.255', 2425)
# 消息内容
content = '1:134871264:斌哥:黑马程序员:32:你好，帅哥！'
# sendto():发送消息  注意:编码是gbk
udp_client_socket.sendto(content.encode('gbk'), server)
~~~

---

# 多任务编程

## 1. 多任务

> 多任务是指在同一时间内执行多个任务

- **多任务的两种表现形式**

  - **并发操作：**在一段时间内交替去执行多个任务

  - **并行操作：**在一段时间内真正的同时一起执行多个任务

---

## 2. 多进程

> 在Python中，想要实现多任务可以使用==多进程==来完成

> 进程（Process）是资源分配的最小单位，它是操作系统进行资源分配和调度运行的基本单位。
>
> 通俗理解：一个正在运行的程序就是一个进程。

> **注意**：一个程序运行后至少有一个进程。

---

### 2.1 多进程完成多任务

~~~python
① 导入进程包
import multiprocessing

② 通过进程类创建进程对象 
进程对象 = multiprocessing.Process() 

③ 启动进程执行任务
进程对象.start()
~~~

---

### 2.2 通过进程类创建进程对象

~~~python
进程对象 = multiprocessing.Process([group [, target=任务名 [, name]]])
~~~

**参数说明**：

| 参数名 | 说明                                         |
| ------ | -------------------------------------------- |
| target | 执行的目标任务名，这里指的是函数名（方法名） |
| name   | 进程名，一般不用设置                         |
| group  | 进程组，目前只能使用None                     |

---

### 2.3 进程创建与启动的代码

**边听音乐边敲代码**：

~~~python
import multiprocessing
import time

def music():
    for i in range(3):
        print("听音乐。。。")
        time.sleep(0.2)
def coding():
    for i in range(3):
        print("敲代码。。。")
        time.sleep(0.2)
if __name__ == '__main__':
    music_process = multiprocessing.Process(target=music)
    coding_process = multiprocessing.Process(target=coding)
    
    music_process.start()
    coding_process.start()
~~~

---

### 2.4 进程执行带有参数的任务

~~~python
Process([group [, target [, name [, args [, kwargs]]]]])
~~~

参数说明：

| 参数名 | 说明                                                         |
| ------ | ------------------------------------------------------------ |
| args   | 以元组的方式给执行任务传参，args表示调用对象的位置参数元组，args=(1,2,’anne’,) |
| kwargs | 以字典方式给执行任务传参，kwargs表示调用对象的字典,kwargs=   |

**案例**：args参数和kwargs参数的使用：

~~~python
import multiprocessing
import time

def music(num):
    for i in range(num):
        print('听音乐...')
        time.sleep(0.2)

def coding(count):
    for i in range(count):
        print('敲代码...')
        time.sleep(0.2)

music_process = multiprocessing.Process(target=music, args=(3, ))
coding_process = multiprocessing.Process(target=coding, kwargs={'count': 3})

music_process.start()
coding_process.start()
~~~

**案例**：多个参数传递

~~~python
import multiprocessing
import time

def music(num, name):
    for i in range(num):
        print(name)
        print('听音乐...')
        time.sleep(0.2)
     
def coding(count):
    for i in range(count):
        print('敲代码...')
        time.sleep(0.2)

if __name__ == '__main__':
    music_process = multiprocessing.Process(target=music, args=(3, '多任务开始'))
    coding_process = multiprocessing.Process(target=coding, kwargs={'count': 3})

    music_process.start()
    coding_process.start()
~~~

---

### 2.5 获取进程编号

#### 2.5.1 进程编号的作用

> 当程序中进程的数量越来越多时，如果没有办法区分主进程和子进程还有不同的子进程，那么就无法进行有效的进程管理，为了方便管理实际上每个进程都是有自己的编号的。

---

#### 2.5.2 两种进程编号

- `getpid()`：获取当前进程编号
- `getppid()`：获取当前进程的父进程ppid = parent pid

---

#### 2.5.3 获取当前进程编号

~~~python
import os

def work():
    # 获取当前进程的编号
    print('work进程编号', os.getpid())
    # 获取父进程的编号
    print('work父进程的编号', os.getppid())
~~~

**案例**：获取子进程编号

~~~python
import multiprocessing
import time
import os

def music(num):
    print('music>> %d' % os.getpid())
    for i in range(num):
        print('听音乐...')
        time.sleep(0.2)

def coding(count):
    print('coding>> %d' % os.getpid())
    for i in range(count):
        print('敲代码...')
        time.sleep(0.2)
        
if __name__ == '__main__':
    music_process = multiprocessing.Process(target=music, args=(3, ))
    coding_process = multiprocessing.Process(target=coding, kwargs={'count': 3})

    music_process.start()
    coding_process.start()
~~~

**案例**：获取父进程与子进程编号

~~~python
import multiprocessing
import time
import os

def music(num):
    print('music>> %d' % os.getpid())
    print('music主进程>> %d' % os.getppid())
    for i in range(num):
        print('听音乐...')
        time.sleep(0.2)

def coding(count):
    print('coding>> %d' % os.getpid())
    print('music主进程>> %d' % os.getppid())
    for i in range(count):
        print('敲代码...')
        time.sleep(0.2)

if __name__ == '__main__':
    print('主进程>> %d' % os.getpid())
    music_process = multiprocessing.Process(target=music, args=(3, ))
    coding_process = multiprocessing.Process(target=coding, kwargs={'count': 3})

    music_process.start()
    coding_process.start()
~~~

---

### 2.6 进程应用注意点

#### 2.6.1 进程间不共享全局变量

> 实际上==创建一个子进程就是把主进程的资源进行拷贝产生一个新的进程==，这里的主进程和子进程是互相独立的。

**案例**：

~~~python
import multiprocessing

my_list = []

def write_data():
    for i in range(3):
        my_list.append(i)
        print('add:', i)
    print(my_list)

def read_data():
    print('read_data', my_list)

if __name__ == '__main__':
    # 创建写入数据进程
    write_process = multiprocessing.Process(target=write_data)
    # 创建读取数据进程
    read_process = multiprocessing.Process(target=read_data)

    # 启动进程执行相关任务
    write_process.start()
    time.sleep(1)
    read_process.start()
~~~

> 三个进程分别操作的都是自己进程里面的全局变量`my_list`，不会对其他进程里面的全局变量产生影响，所以进程之间不共享全局变量，只不过进程之间的全局变量名字相同而已，但是操作的不是同一个进程里面的全局变量。

---

#### 2.6.2 主进程与子进程的结束顺序

> **主进程**—>**开启子进程**—>**直接结束主进程**—>**主进程和子进程都应该结束**

~~~python
import multiprocessing
import time

# 工作函数
def work():
    for i in range(10):
        print('工作中...')
        time.sleep(0.2)

if __name__ == '__main__':
    # 创建子进程
    work_process = multiprocessing.Process(target=work)
    # 启动子进程
    work_process.start()

    # 延迟1s
    time.sleep(1)
    print('主进程执行完毕')
~~~

> **执行结果**：主进程执行完毕，子进程还在工作

**解决方案一：**设置守护进程

~~~python
import multiprocessing
import time

# 工作函数
def work():
    for i in range(10):
        print('工作中...')
        time.sleep(0.2)

if __name__ == '__main__':
    # 创建子进程
    work_process = multiprocessing.Process(target=work)
    # 设置守护主进程，主进程退出后子进程直接销毁，不再执行子进程中的代码
    work_process.daemon = True
    # 启动子进程
    work_process.start()

    # 延迟1s
    time.sleep(1)
    print('主进程执行完毕')
~~~

**解决方案二：**销毁子进程

~~~python
import multiprocessing
import time

# 工作函数
def work():
    for i in range(10):
        print('工作中...')
        time.sleep(0.2)

if __name__ == '__main__':
    # 创建子进程
    work_process = multiprocessing.Process(target=work)
    # 启动子进程
    work_process.start()
    # 延迟1s
    time.sleep(1)
    # 让子进程直接销毁，表示终止执行， 主进程退出之前，把所有的子进程直接销毁就可以了
    work_process.terminate()

    print('主进程执行完毕')
~~~

> **提示**：以上两种方式都能保证主进程退出子进程销毁。

---

## 3. 多线程

### 3.1 线程的概念

> 在Python中，想要实现多任务还可以使用多线程来完成。

**为什么使用多线程**

> 进程是分配资源的最小单位，一旦创建一个进程就会分配一定的资源，就像两个人聊QQ就需要打开两个QQ软件一样，是比较浪费资源的。

> 线程是**程序执行的最小单位**，实际上进程只负责分配资源，而利用这些资源执行程序的是线程，也就是说进程是线程的容器，一个进程中最少有一个线程来负责执行程序。同时线程自己不拥有系统资源，只需要一点儿在运行中必不可少的资源，但它可与同属一个进程的其他线程**共享所拥有的全部资源**。
>
> 这就像通过一个QQ软件（一个进程）打开两个窗口（两个线程）跟两个人聊天一样，实现多任务的同时也节省了资源。

---

### 3.2 多线程完成多任务

#### 3.2.1 多线程完成多任务

~~~python
① 导入线程模块
import threading

② 通过线程类创建线程对象
线程对象 = threading.Thread(target=任务名) 

② 启动线程执行任务
线程对象.start()
~~~

| 参数名 | 说明                                         |
| ------ | -------------------------------------------- |
| target | 执行的目标任务名，这里指的是函数名（方法名） |
| name   | 线程名，一般不用设置                         |
| group  | 线程组，目前只能使用None                     |

---

#### 3.2.2 线程创建与启动代码

**单线程案例**：

~~~python
import time

def music():
    for i in range(3):
        print('听音乐...')
        time.sleep(0.2)

def coding():
    for i in range(3):
        print('敲代码...')
        time.sleep(0.2)

if __name__ == '__main__':
    music()
    coding()
~~~

**多线程案例**：

~~~python
import time
import threading

def music():
    for i in range(3):
        print('听音乐...')
        time.sleep(0.2)

def coding():
    for i in range(3):
        print('敲代码...')
        time.sleep(0.2)

if __name__ == '__main__':
    music_thread = threading.Thread(target=music)
    coding_thread = threading.Thread(target=coding)

    music_thread.start()
    coding_thread.start()
~~~

---

#### 3.2.3 线程执行带有参数的任务

| 参数名 | 说明                       |
| ------ | -------------------------- |
| args   | 以元组的方式给执行任务传参 |
| kwargs | 以字典方式给执行任务传参   |

~~~python
import time
import threading

def music(num):
    for i in range(num):
        print('听音乐...')
        time.sleep(0.2)

def coding(count):
    for i in range(count):
        print('敲代码...')
        time.sleep(0.2)

if __name__ == '__main__':
    music_thread = threading.Thread(target=music, args=(3, ))
    coding_thread = threading.Thread(target=coding, kwargs={'count': 3})

    music_thread.start()
    coding_thread.start()
~~~

---

#### 3.2.4 主线程和子线程的结束顺序

~~~python
import time
import threading

def work():
    for i in range(10):
        print('work...')
        time.sleep(0.2)

if __name__ == '__main__':
    # 创建子进程
    work_thread = threading.Thread(target=work)
    # 启动线程
    work_thread.start()

    # 延时1s
    time.sleep(1)
    print('主线程执行完毕')
~~~

**设置守护线程方式一**

~~~python
import time
import threading

def work():
    for i in range(10):
        print('work...')
        time.sleep(0.2)

if __name__ == '__main__':
    # 创建子线程并设置守护主线程
    work_thread = threading.Thread(target=work, daemon=True)
    # 启动线程
    work_thread.start()

    # 延时1s
    time.sleep(1)
    print('主线程执行完毕')
~~~

**设置守护线程方式二**

~~~python
import time
import threading

def work():
    for i in range(10):
        print('work...')
        time.sleep(0.2)

if __name__ == '__main__':
    # 创建子线程
    work_thread = threading.Thread(target=work)
    # 设置守护主线程
    work_thread.setDaemon(True)
    # 启动线程
    work_thread.start()

    # 延时1s
    time.sleep(1)
    print('主线程执行完毕')
~~~

---

#### 3.2.5 线程间的执行顺序

~~~python
for i in range(5):
    sub_thread = threading.Thread(target=task)
    sub_thread.start()
~~~

> **线程之间的执行是无序的。**

**获取当前线程信息**

~~~python
# 通过current_thread方法获取线程对象
current_thread = threading.current_thread()

# 通过current_thread对象可以知道线程的相关信息，例如被创建的顺序
print(current_thread)
~~~

**线程间的执行顺序**

~~~python
import threading
import time

def get_info():
    # 可以暂时先不加，查看效果
    time.sleep(0.5)
    current_thread = threading.current_thread()
    print(current_thread)


if __name__ == '__main__':
    # 创建子线程
    for i in range(10):
        sub_thread = threading.Thread(target=get_info)
        sub_thread.start()
~~~

> **总结**：线程之间执行是无序的，是由CPU调度决定某个线程先执行的。

---

#### 3.2.6 线程间共享全局变量

> 多个线程都是在同一个进程中，多个线程使用的资源都是**同一个进程中的资源**，因此多线程间是共享全局变量的。

实例代码：

~~~python
import threading
import time

my_list = []

def write_data():
    for i in range(3):
        print('add：', i)
        my_list.append(i)
    print(my_list)

def read_data():
    print('read：', my_list)

if __name__ == '__main__':
    write_thread = threading.Thread(target=write_data)
    read_thread = threading.Thread(target=read_data)

    write_thread.start()
    time.sleep(1)
    read_thread.start()
~~~

---

### 3.3 进程和线程对比

#### 3.3.1 关系对比

> ①线程是依附在进程里面的，没有进程就没有线程。
>
> ②一个进程默认提供一条线程，进程可以创建多个线程。

---

#### 3.3.2 区别对比

> ①**进程**之间**不共享全局变量**
>
> ②**线程**之间**共享全局变量**
>
> ③创建进程的资源开销要比创建线程的资源开销要大
>
> ④进程是操作系统资源分配的基本单位，线程是CPU调度的基本单位

---

#### 3.3.3 优缺点对比

**进程优缺点**

> **优点**：可以用多核
>
> **缺点**：资源开销大

**线程优缺点**

> **优点**：资源开销小
>
> **缺点**：不能使用多核

---

## 4. 多协程

### 4.1 Python中的生成器

> 根据程序设计者制定的规则循环生成数据，当条件不成立时则生成数据结束
>
> 数据不是一次性全部生成出来，而是使用一个，再生成一个，可以节约大量的内存。

> 创建生成器的方式
>
> ①生成器推导式
>
> ②`yield`关键字

---

#### 4.1.1 生成器推导式

> 与**列表推导式（中括号）**类似，只不过**生成器推导式使用小括号**

~~~python
# 创建生成器
my_generator = (i * 2 for i in range(5))
print(my_generator)

# next获取生成器下一个值
# value = next(my_generator)
# print(value)

# 遍历生成器
for value in my_generator:
    print(value)
~~~

---

#### 4.1.2 生成器相关函数

~~~python
next 函数获取生成器中的下一个值
for  循环遍历生成器中的每一个值 
~~~

---

#### 4.1.3 yield生成器

> **yield关键字生成器的特征**：在`def`函数中具有`yield`关键字

~~~python
def generator(n):
    for i in range(n):
        print('开始生成...')
        yield i
        print('完成一次...')

g = generator(5)
print(next(g))
print(next(g))
print(next(g))
print(next(g))
print(next(g))              ----->    正常
print(next(g))              ----->    报错
~~~

> **注意点**：
>
> ①代码执行到`yield`会暂停，然后把结果返回出去，下次启动生成器会在暂停的位置继续往下执行
>
> ②生成器如果把数据生成弯沉，再次获取生成器中的下一个数据会抛出一个`StopIteration`异常，表示停止迭代异常
>
> ③`while`循环内部没有处理异常操作，需要手动添加处理异常操作
>
> ④`for`循环内部自动处理了停止迭代异常，使用起来更加方便，推荐使用

---

#### 4.1.4 yield关键字和return关键字

> **两者的区别**：
>
> 有`return`的函数直接返回所有结果，程序终止不再运行，并销毁局部变量。
>
> 而有`yield`的函数则返回一个可迭代的`generator`(生成器)对象，可以使用`for`循环或者调用`next()`方法遍历生成器对象来提取结果。

~~~python
# return
def example():
    x = 1
    return x

example = example()
print(example)

# yield
def example():
    x = 1
    y = 10
    while x < y:
        yield x
        x += 1

example = example()
print(example)
~~~

---

### 4.2 Python中的协程

Python的携程实现是从生成器发展而来的：

| 特性     | 生成器(Generator)      | 协程(Coroutine)            |
| -------- | ---------------------- | -------------------------- |
| 主要目的 | 生成值序列             | 执行异步任务               |
| 控制流   | 单向：调用者->生成器   | 双向：调用者<->协程        |
| 数据流向 | 数据向外流动（产出值） | 数据双向流动（发送和接收） |
| 调度     | 有调用者驱动           | 由事件循环调度             |
| 关键字   | `yield`                | `async`，`await`           |
| 类型     | `Generator`            | `Coroutine`                |

> **Python协程**是由`async def `定义的**异步函数**，它是一种实现了`Awaitable`协议的**状态保持执行单元**。其执行由**事件循环**调度，通过`await`表达式**主动挂起**，将控制权交还调度器，实现**协作式并发**。

> **协程三要素**：
>
> 1. 函数前加`async`
> 2. 等待处加`await`
> 3. 启动用`asyncio.run`

> **使用三步骤**：
>
> 1. 定义`async`函数
> 2. 用`create_task`创建任务
> 3. 用`await`等待结果

> **总结**：协程让`I/O`等待时不闲着，一直在运行

~~~python
import asyncio

async def hello(name):           # 1. async 定义协程函数
    print(f"开始: {name}")
    await asyncio.sleep(1)       # 2. await 让出控制权
    print(f"结束: {name}")

async def main():
    await hello("Alice")         # 3. 单个协程调用
    print("---")

    # 4. 并发执行
    task1 = asyncio.create_task(hello("Bob"))
    task2 = asyncio.create_task(hello("Charlie"))
    await task1
    await task2

asyncio.run(main())             # 5. 启动事件循环
~~~

---

### 4.3 协程vs线程vs进程区别

#### 4.3.1 全部对比

| 对比项   | 协程                  | 线程           | 进程         |
| -------- | --------------------- | -------------- | ------------ |
| 创建数量 | 轻松上万              | 最多几百       | 最多几十     |
| 适用场景 | I/O操作多(网络、文件) | I/O操作多      | 计算密集     |
| 内存占用 | 很小(几KB)            | 较大(几MB)     | 很大(几十MB) |
| 数据共享 | 直接共享              | 小心共享(加锁) | 不能直接共享 |
| 总结     | 单线程内切换做事      | 看起来同时做事 | 真正同时做事 |

---

#### 4.3.2 应用场景对比

~~~python
# 选择指南：
if 主要是网络请求 or 文件读写:    # I/O密集型
    用协程  # 最佳选择

elif 主要是数学计算:              # CPU密集型
    用多进程  # 绕过GIL

else:  # 简单的后台任务
    用多线程  # 简单易用
~~~

---

#### 4.3.3 最简记忆法

- **协程**：单线程魔术师，手里抛接多个球（I/O等待时换件事做）
- **线程**：多个魔术师，但只有一个能表演（GIL限制）
- **进程**：多个魔术师，各自独立表演（完全独立）

~~~python
import asyncio
import time
import threading

# 模拟网络请求
def mock_io(delay, name):
    time.sleep(delay)
    return f"{name}完成"

# 1. 普通顺序执行（慢）
def sync_version():
    start = time.time()
    mock_io(1, "任务1")
    mock_io(1, "任务2")
    print(f"同步: {time.time()-start:.1f}秒")

# 2. 多线程执行（快一点）
def thread_version():
    start = time.time()
    t1 = threading.Thread(target=mock_io, args=(1, "线程1"))
    t2 = threading.Thread(target=mock_io, args=(1, "线程2"))
    t1.start()
    t2.start()
    t1.join()
    t2.join()
    print(f"线程: {time.time()-start:.1f}秒")

# 3. 协程执行（最快）
async def async_version():
    start = time.time()

    async def async_io(delay, name):
        await asyncio.sleep(delay)
        return f"{name}完成"

    # 并发执行
    task1 = asyncio.create_task(async_io(1, "协程1"))
    task2 = asyncio.create_task(async_io(1, "协程2"))
    await task1
    await task2

    print(f"协程: {time.time()-start:.1f}秒")

# 运行对比
print("=== 执行时间对比 ===")
sync_version()  # 约2秒
thread_version()  # 约1秒
asyncio.run(async_version())  # 约1秒
~~~

> **记住**：Python中**协程适合网络编程**，因为网络等待时可以做其他事，效率最高。
