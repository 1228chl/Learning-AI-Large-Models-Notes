# Matplotlib可视化

**标签：** #Matplotlib #可视化

---

## 1. 什么是Matplotlib

Matplotlib是Python最基础的可视化库，提供类似MATLAB的绘图功能。

---

## 2. 基本图形

### 2.1 折线图

```python
import matplotlib.pyplot as plt

x = [1, 2, 3, 4, 5]
y = [2, 4, 6, 8, 10]

plt.plot(x, y, label='数据')
plt.xlabel('X轴')
plt.ylabel('Y轴')
plt.title('折线图')
plt.legend()
plt.show()
```

### 2.2 柱状图

```python
categories = ['A', 'B', 'C', 'D']
values = [23, 45, 56, 78]

plt.bar(categories, values, color=['red', 'green', 'blue', 'orange'])
plt.title('柱状图')
plt.show()
```

### 2.3 散点图

```python
x = [1, 2, 3, 4, 5]
y = [2, 4, 5, 4, 5]

plt.scatter(x, y, c='red', s=100, alpha=0.6)
plt.title('散点图')
plt.show()
```

### 2.4 饼图

```python
labels = ['A', 'B', 'C', 'D']
sizes = [30, 25, 25, 20]
colors = ['gold', 'lightblue', 'lightgreen', 'pink']

plt.pie(sizes, labels=labels, colors=colors, autopct='%1.1f%%')
plt.title('饼图')
plt.show()
```

### 2.5 子图

```python
fig, axes = plt.subplots(2, 2, figsize=(10, 8))

axes[0, 0].plot(x, y)
axes[0, 0].set_title('子图1')

axes[0, 1].bar(categories, values)
axes[0, 1].set_title('子图2')

plt.tight_layout()
plt.show()
```

---

## 3. 图形美化

```python
# 设置中文字体
plt.rcParams['font.sans-serif'] = ['SimHei']
plt.rcParams['axes.unicode_minus'] = False

# 设置样式
plt.style.use('ggplot')

# 保存图形
plt.savefig('figure.png', dpi=300, bbox_inches='tight')
```
