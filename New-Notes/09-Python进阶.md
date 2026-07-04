# Python进阶完整指南

**标签：** #Python #面向对象 #高级特性

---

## 目录

1. [面向对象编程](#一面向对象编程)
2. [装饰器](#二装饰器)
3. [迭代器与生成器](#三迭代器与生成器)
4. [正则表达式](#四正则表达式)
5. [多线程与多进程](#五多线程与多进程)

---

# 一、面向对象编程

## 1. 编程思想对比

| 对比项 | 面向过程 | 面向对象 |
|--------|----------|----------|
| 视角 | 步骤过程 | 操作对象 |
| 中心 | 函数/过程 | 对象（数据+方法） |
| 数据与操作 | 分离 | 封装在一起 |
| 适用 | 简单、一次性任务 | 复杂、大型、可扩展系统 |

---

## 2. 类与对象

### 2.1 类（Class）

类是对现实事物的抽象描述，是创建对象的模板/图纸。

```python
class Car:
    def __init__(self, brand, color):
        self.brand = brand
        self.color = color
    
    def run(self):
        print(f"{self.brand}汽车跑起来了")
```

### 2.2 对象（Object）

对象是根据类创建出来的实体（实例）。

```python
# 创建对象
car1 = Car("宝马", "白色")
car2 = Car("奔驰", "黑色")

# 调用方法
car1.run()  # 宝马汽车跑起来了
car2.run()  # 奔驰汽车跑起来了
```

---

## 3. 三大特性

### 3.1 封装

将数据和操作数据的方法绑定在一起，对外隐藏实现细节。

```python
class BankAccount:
    def __init__(self, balance):
        self.__balance = balance  # 私有属性
    
    def deposit(self, amount):
        if amount > 0:
            self.__balance += amount
    
    def withdraw(self, amount):
        if 0 < amount <= self.__balance:
            self.__balance -= amount
    
    def get_balance(self):
        return self.__balance
```

### 3.2 继承

子类可以继承父类的属性和方法，并可以重写或扩展。

```python
class Animal:
    def __init__(self, name):
        self.name = name
    
    def speak(self):
        pass

class Dog(Animal):
    def speak(self):
        return "汪汪汪"

class Cat(Animal):
    def speak(self):
        return "喵喵喵"

dog = Dog("旺财")
cat = Cat("小花")

print(dog.speak())  # 汪汪汪
print(cat.speak())  # 喵喵喵
```

### 3.3 多态

同一个方法在不同对象上有不同的行为。

```python
def animal_sound(animal):
    print(animal.speak())

animal_sound(dog)  # 汪汪汪
animal_sound(cat)  # 喵喵喵
```

---

## 4. 特殊方法（魔法方法）

```python
class Student:
    def __init__(self, name, score):
        self.name = name
        self.score = score
    
    def __str__(self):
        return f"学生: {self.name}, 成绩: {self.score}"
    
    def __repr__(self):
        return f"Student('{self.name}', {self.score})"
    
    def __eq__(self, other):
        return self.score == other.score
    
    def __lt__(self, other):
        return self.score < other.score
    
    def __len__(self):
        return len(self.name)

s1 = Student("张三", 90)
s2 = Student("李四", 85)

print(s1)           # 学生: 张三, 成绩: 90
print(s1 == s2)     # False
print(s1 < s2)      # False
print(len(s1))      # 2
```

---

# 二、装饰器

## 1. 什么是装饰器

装饰器是一种设计模式，用于在不修改原函数代码的情况下，为函数添加额外功能。

---

## 2. 基本装饰器

```python
import time

def timer(func):
    def wrapper(*args, **kwargs):
        start = time.time()
        result = func(*args, **kwargs)
        end = time.time()
        print(f"{func.__name__} 执行时间: {end - start:.4f}秒")
        return result
    return wrapper

@timer
def slow_function():
    time.sleep(1)
    print("函数执行完成")

slow_function()
# 输出：
# 函数执行完成
# slow_function 执行时间: 1.0012秒
```

---

## 3. 带参数的装饰器

```python
def repeat(n):
    def decorator(func):
        def wrapper(*args, **kwargs):
            for _ in range(n):
                result = func(*args, **kwargs)
            return result
        return wrapper
    return decorator

@repeat(3)
def greet(name):
    print(f"Hello, {name}!")

greet("World")
# 输出3次 "Hello, World!"
```

---

## 4. 类装饰器

```python
class CountCalls:
    def __init__(self, func):
        self.func = func
        self.num_calls = 0
    
    def __call__(self, *args, **kwargs):
        self.num_calls += 1
        print(f"调用次数: {self.num_calls}")
        return self.func(*args, **kwargs)

@CountCalls
def say_hello():
    print("Hello!")

say_hello()  # 调用次数: 1, Hello!
say_hello()  # 调用次数: 2, Hello!
```

---

# 三、迭代器与生成器

## 1. 迭代器

迭代器是一个可以记住遍历位置的对象，实现了`__iter__`和`__next__`方法。

```python
class CountDown:
    def __init__(self, start):
        self.start = start
    
    def __iter__(self):
        return self
    
    def __next__(self):
        if self.start <= 0:
            raise StopIteration
        self.start -= 1
        return self.start + 1

for num in CountDown(5):
    print(num)  # 5, 4, 3, 2, 1
```

---

## 2. 生成器

生成器是一种特殊的迭代器，使用`yield`关键字返回值，每次返回后暂停执行。

### 2.1 生成器函数

```python
def countdown(n):
    while n > 0:
        yield n
        n -= 1

for num in countdown(5):
    print(num)  # 5, 4, 3, 2, 1
```

### 2.2 生成器表达式

```python
# 列表推导式（立即创建所有元素）
squares_list = [x**2 for x in range(10)]

# 生成器表达式（惰性计算）
squares_gen = (x**2 for x in range(10))

print(next(squares_gen))  # 0
print(next(squares_gen))  # 1
```

### 2.3 生成器的优势

- **节省内存**：不需要一次性加载所有数据
- **惰性计算**：按需生成值
- **可以表示无限序列**

---

# 四、正则表达式

## 1. 基本语法

| 符号 | 说明 | 示例 |
|------|------|------|
| `.` | 匹配任意字符 | `a.c` 匹配 abc, a1c |
| `^` | 匹配开头 | `^Hello` 匹配 Hello World |
| `$` | 匹配结尾 | `world$` 匹配 Hello world |
| `*` | 匹配0次或多次 | `ab*c` 匹配 ac, abc, abbc |
| `+` | 匹配1次或多次 | `ab+c` 匹配 abc, abbc |
| `?` | 匹配0次或1次 | `ab?c` 匹配 ac, abc |
| `\d` | 匹配数字 | `\d+` 匹配 123 |
| `\w` | 匹配字母数字下划线 | `\w+` 匹配 hello_123 |
| `\s` | 匹配空白字符 | `\s+` 匹配空格、制表符 |

---

## 2. 常用函数

```python
import re

text = "我的电话是13812345678，邮箱是test@example.com"

# 查找
pattern = r'\d{11}'
match = re.search(pattern, text)
if match:
    print(match.group())  # 13812345678

# 查找所有
pattern = r'\d+'
matches = re.findall(pattern, text)
print(matches)  # ['13812345678']

# 替换
new_text = re.sub(r'\d{11}', '****', text)
print(new_text)  # 我的电话是****，邮箱是test@example.com

# 分割
parts = re.split(r'[，,]', text)
print(parts)
```

---

## 3. 分组

```python
text = "2024-01-15"

# 分组提取
pattern = r'(\d{4})-(\d{2})-(\d{2})'
match = re.search(pattern, text)
if match:
    print(match.group(0))  # 2024-01-15
    print(match.group(1))  # 2024
    print(match.group(2))  # 01
    print(match.group(3))  # 15
```

---

# 五、多线程与多进程

## 1. 线程 vs 进程

| 特性 | 线程 | 进程 |
|------|------|------|
| 资源共享 | 共享内存空间 | 独立内存空间 |
| 创建开销 | 小 | 大 |
| 通信方式 | 直接共享变量 | 需要IPC |
| Python限制 | GIL限制并行 | 不受GIL限制 |

---

## 2. 多线程

```python
import threading
import time

def print_numbers():
    for i in range(5):
        print(i)
        time.sleep(1)

def print_letters():
    for letter in 'abcde':
        print(letter)
        time.sleep(1)

# 创建线程
t1 = threading.Thread(target=print_numbers)
t2 = threading.Thread(target=print_letters)

# 启动线程
t1.start()
t2.start()

# 等待线程完成
t1.join()
t2.join()
```

---

## 3. 多进程

```python
from multiprocessing import Process
import time

def print_numbers():
    for i in range(5):
        print(i)
        time.sleep(1)

def print_letters():
    for letter in 'abcde':
        print(letter)
        time.sleep(1)

# 创建进程
p1 = Process(target=print_numbers)
p2 = Process(target=print_letters)

# 启动进程
p1.start()
p2.start()

# 等待进程完成
p1.join()
p2.join()
```

---

## 4. 线程池

```python
from concurrent.futures import ThreadPoolExecutor
import time

def task(n):
    time.sleep(1)
    return n * n

# 使用线程池
with ThreadPoolExecutor(max_workers=5) as executor:
    results = executor.map(task, range(10))
    for result in results:
        print(result)
```

---

## 5. 进程池

```python
from concurrent.futures import ProcessPoolExecutor

def task(n):
    return n * n

# 使用进程池
with ProcessPoolExecutor(max_workers=5) as executor:
    results = executor.map(task, range(10))
    for result in results:
        print(result)
```

---

**参考资源**：
- Python官方文档：https://docs.python.org/
- 《Python编程：从入门到实践》
- 《流畅的Python》
