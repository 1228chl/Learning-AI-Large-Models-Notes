**上一级：** [[14Pandas（AI大全版）]]

**标签：** #Pandas #基础 

---

# Matplotlib

# 一、Matplotlib 基础与快速绘图

## 学习目标

- 目标
  - 了解 Matplotlib 的基本架构和绘图流程
  - 掌握 `pyplot` 模块的基础绘图方法
  - 理解图形、子图、坐标轴的概念
  - 学会绘制简单的折线图并添加标签、标题、图例

---

## 1 Matplotlib 介绍

**Matplotlib** 是 Python 中最流行的数据可视化库，由 John D. Hunter 创建。它可以生成**高质量的二维图形**，广泛用于科学计算、数据分析、机器学习结果展示等场景。

- 设计理念：类似 MATLAB 的绘图接口
- 核心模块：`matplotlib.pyplot`（常用别名 `plt`）
- 支持图形类型：折线图、散点图、柱状图、直方图、饼图、箱线图、等高线图、3D 图等
- 高度可定制：几乎可以控制图形的每一个元素

```python
import matplotlib.pyplot as plt
import numpy as np

# 基本用法
x = [1, 2, 3, 4]
y = [2, 4, 6, 8]
plt.plot(x, y)
plt.show()
```

## 2 两种绘图风格

### 2.1 MATLAB 风格（状态机接口）

- 通过 `plt` 模块直接调用函数，自动在“当前”图形/坐标轴上绘制。
- 适合快速绘图、交互式探索。

```python
plt.figure(figsize=(8,4))
plt.plot(x, y, 'r--', label='y=2x')
plt.xlabel('X轴')
plt.ylabel('Y轴')
plt.title('示例图')
plt.legend()
plt.grid(True)
plt.show()
```

### 2.2 面向对象风格（推荐）

- 显式创建 `Figure`（画布）和 `Axes`（坐标轴/子图）对象。
- 更灵活、适合复杂图形、易于复用。

```python
fig, ax = plt.subplots(figsize=(8,4))
ax.plot(x, y, 'r--', label='y=2x')
ax.set_xlabel('X轴')
ax.set_ylabel('Y轴')
ax.set_title('示例图')
ax.legend()
ax.grid(True)
plt.show()
```

> **建议**：日常使用两种都可以，编写可重用代码建议面向对象风格。

## 3 图形的组成要素

| 组件                 | 说明                                                |
| -------------------- | --------------------------------------------------- |
| **Figure**           | 整个画布，可以包含多个 Axes                         |
| **Axes**             | 数据绘制区域（坐标系），一个 Figure 可以有多个 Axes |
| **Axis**             | 坐标轴（X轴、Y轴），包含刻度、标签等                |
| **Title**            | 图形标题                                            |
| **Legend**           | 图例                                                |
| **Grid**             | 网格线                                              |
| **Spines**           | 边框线（上、下、左、右）                            |
| **Tick & TickLabel** | 刻度位置和刻度标签                                  |

```python
# 示意图（可运行）
fig, ax = plt.subplots()
ax.plot([0,1], [0,1])
ax.set_title('Title')
ax.set_xlabel('X label')
ax.set_ylabel('Y label')
ax.legend(['Line'], loc='best')
ax.grid(True)
plt.show()
```

## 4 基本绘图函数

### 4.1 `plt.plot()` – 折线图

```python
x = np.linspace(0, 2*np.pi, 100)
y1 = np.sin(x)
y2 = np.cos(x)

plt.plot(x, y1, 'b-', label='sin(x)')      # 蓝色实线
plt.plot(x, y2, 'r--', linewidth=2, label='cos(x)')  # 红色虚线，线宽2
plt.legend()
plt.show()
```

**颜色与线型格式**：`'[marker][line][color]'`

| 字符 | 线型   | 字符 | 颜色 | 字符 | 标记点样式 |
| ---- | ------ | ---- | ---- | ---- | ---------- |
| `-`  | 实线   | `b`  | 蓝色 | `o`  | 圆圈       |
| `--` | 虚线   | `g`  | 绿色 | `s`  | 方块       |
| `-.` | 点划线 | `r`  | 红色 | `^`  | 上三角     |
| `:`  | 点线   | `c`  | 青色 | `*`  | 星号       |
|      |        | `m`  | 品红 | `+`  | 加号       |
|      |        | `y`  | 黄色 | `x`  | X号        |
|      |        | `k`  | 黑色 | `D`  | 菱形       |
|      |        | `w`  | 白色 | `|`  | 竖线       |

示例：`'ro--'` 红色圆圈虚线；`'gs-'` 绿色方块实线。

### 4.2 常用参数

```python
plt.plot(x, y,
         color='red',           # 颜色名/十六进制 '#FF0000'
         linestyle='dashed',    # 或 '--'
         linewidth=2,           # 线宽
         marker='o',            # 标记点样式
         markersize=6,          # 标记点大小
         markerfacecolor='blue',# 标记点填充色
         markeredgewidth=1,     # 标记点边框宽度
         alpha=0.7,             # 透明度
         label='曲线')          # 图例标签
```

### 4.3 其他基本绘图函数

| 函数                          | 说明     |
| ----------------------------- | -------- |
| `plt.scatter(x, y)`           | 散点图   |
| `plt.bar(x, height)`          | 柱状图   |
| `plt.hist(data, bins)`        | 直方图   |
| `plt.pie(data)`               | 饼图     |
| `plt.boxplot(data)`           | 箱线图   |
| `plt.stem(x, y)`              | 茎叶图   |
| `plt.fill_between(x, y1, y2)` | 填充区域 |

## 5 子图（Subplots）

一个 Figure 中包含多个子图（Axes）。

### 5.1 `plt.subplot()` – 网格子图（MATLAB风格）

```python
# 2行2列，选中第1个
plt.subplot(2, 2, 1)
plt.plot([1,2],[1,2])

plt.subplot(2, 2, 2)
plt.plot([1,2],[2,1])

plt.subplot(2, 2, 3)
plt.plot([1,2],[1,3])

plt.subplot(2, 2, 4)
plt.plot([1,2],[3,1])

plt.tight_layout()  # 自动调整间距
plt.show()
```

### 5.2 `plt.subplots()` – 批量创建（面向对象）

```python
fig, axes = plt.subplots(2, 2, figsize=(8,6))  # axes 是 (2,2) 的 numpy 数组
axes[0,0].plot([1,2],[1,2])
axes[0,1].plot([1,2],[2,1])
axes[1,0].plot([1,2],[1,3])
axes[1,1].plot([1,2],[3,1])

for ax in axes.flat:
    ax.set_xlabel('X')
    ax.set_ylabel('Y')
    ax.grid(True)

plt.tight_layout()
plt.show()
```

### 5.3 灵活布局 – `add_subplot()` / `add_axes()`

```python
fig = plt.figure(figsize=(8,5))
ax1 = fig.add_subplot(2, 1, 1)          # 上半个
ax2 = fig.add_subplot(2, 2, 3)          # 左下
ax3 = fig.add_subplot(2, 2, 4)          # 右下
```

## 6 图形样式与美化

### 6.1 内置样式表

```python
print(plt.style.available)   # 查看所有可用样式

plt.style.use('ggplot')      # 使用样式（放在绘图之前）
# 其他样式： 'seaborn', 'fivethirtyeight', 'bmh', 'dark_background' 等

# 临时样式上下文
with plt.style.context('dark_background'):
    plt.plot(x, y)
```

### 6.2 全局参数配置（rcParams）

```python
plt.rcParams['font.sans-serif'] = ['SimHei']      # 中文字体
plt.rcParams['axes.unicode_minus'] = False        # 正常显示负号
plt.rcParams['figure.figsize'] = (10, 6)          # 默认图形尺寸
plt.rcParams['lines.linewidth'] = 2               # 默认线宽
```

### 6.3 常用美化函数

```python
ax.set_xlim(0, 10)           # X轴范围
ax.set_ylim(-1, 1)           # Y轴范围
ax.set_xticks([0, 5, 10])    # 设置刻度位置
ax.set_xticklabels(['低', '中', '高'])  # 自定义刻度标签
ax.tick_params(axis='both', labelsize=12)  # 刻度标签字体大小
ax.legend(loc='upper left', fontsize=12)   # 图例位置及大小
ax.grid(True, linestyle='--', alpha=0.7)   # 网格线样式
```

## 7 保存图形

```python
# 保存为图片文件
plt.savefig('myplot.png', dpi=300, bbox_inches='tight')
# 参数：dpi 分辨率，bbox_inches='tight' 去除空白边缘

# 在 plt.show() 之前调用，否则可能保存空白图
```

## 8 小结

- Matplotlib 是 Python 最基础的可视化库，`pyplot` 模块提供类似 MATLAB 的接口。
- 两种绘图风格：
  - **状态机（plt.xxx）**：简单快速
  - **面向对象（fig, ax）**：更加灵活，推荐使用
- 核心组件：`Figure`（画布）和 `Axes`（子图/坐标系）。
- 常用函数：`plot()`、`scatter()`、`bar()`、`hist()`、`subplots()` 等。
- 样式定制：颜色、线型、标记、标签、标题、图例、网格、刻度。
- 样式表：`plt.style.use()` 快速美化。

---

## 第二部分：常见图表详解（散点图、柱状图、直方图、饼图、箱线图、热力图等）

### 学习目标

- 目标
  - 掌握散点图、柱状图、直方图、饼图、箱线图、热力图的绘制方法
  - 学会调整图表的各种参数（颜色、宽度、边缘、标签、图例等）
  - 理解不同图表的适用场景
  - 能够在一个图形中组合多种图表

---

## 1 散点图（Scatter Plot）

散点图用于展示两个连续变量之间的关系，观察是否存在相关性、聚类、离群点等。

### 1.1 基本散点图

```python
import matplotlib.pyplot as plt
import numpy as np

# 准备数据
np.random.seed(42)
x = np.random.randn(100)
y = 2 * x + np.random.randn(100) * 0.5   # 线性相关加噪声

plt.scatter(x, y, color='blue', alpha=0.6, edgecolors='white', linewidth=0.5)
plt.xlabel('X')
plt.ylabel('Y')
plt.title('散点图示例')
plt.grid(True, alpha=0.3)
plt.show()
```

### 1.2 散点图常用参数

| 参数           | 说明                                     |
| -------------- | ---------------------------------------- |
| `s`            | 点的大小（标量或数组）                   |
| `c`            | 点的颜色（标量、颜色名、或根据数值映射） |
| `marker`       | 点的形状（`'o'`, `'s'`, `'^'`, `'*'`等） |
| `alpha`        | 透明度（0-1）                            |
| `edgecolors`   | 点的边框颜色                             |
| `linewidth`    | 边框宽度                                 |
| `cmap`         | 颜色映射（当 `c` 为数值数组时有效）      |
| `vmin`, `vmax` | 颜色映射的范围                           |

```python
# 大小和颜色映射
np.random.seed(42)
n = 200
x = np.random.randn(n)
y = np.random.randn(n)
sizes = np.random.randint(20, 200, n)      # 点的大小随机
colors = np.random.randn(n)                # 颜色值

plt.scatter(x, y, s=sizes, c=colors, alpha=0.6, cmap='viridis', edgecolors='black', linewidth=0.5)
plt.colorbar(label='颜色值')                # 显示颜色条
plt.title('散点图：大小和颜色编码')
plt.show()
```

### 1.3 散点图进阶：分组着色

```python
# 多类数据散点图
np.random.seed(42)
n = 50
class1_x = np.random.randn(n) + 1
class1_y = np.random.randn(n) + 1
class2_x = np.random.randn(n) - 1
class2_y = np.random.randn(n) - 1

plt.scatter(class1_x, class1_y, label='Class 1', c='red', alpha=0.7)
plt.scatter(class2_x, class2_y, label='Class 2', c='blue', alpha=0.7)
plt.legend()
plt.title('分组散点图')
plt.show()
```

---

## 2 柱状图（Bar Chart）

柱状图用于比较不同类别之间的数值。

### 2.1 垂直柱状图

```python
categories = ['A', 'B', 'C', 'D']
values = [23, 45, 12, 67]

plt.bar(categories, values, color='steelblue', width=0.6, edgecolor='black')
plt.xlabel('类别')
plt.ylabel('数值')
plt.title('垂直柱状图')
plt.show()
```

**常用参数**：

- `width`：柱宽（0-1，默认0.8）
- `align`：`'center'`（默认）或 `'edge'`
- `color` / `edgecolor`
- `tick_label`：自定义刻度标签
- `log`：是否对数坐标

### 2.2 水平柱状图（barh）

```python
plt.barh(categories, values, color='coral', height=0.6)
plt.xlabel('数值')
plt.ylabel('类别')
plt.title('水平柱状图')
plt.show()
```

### 2.3 分组柱状图

```python
# 多组数据并列
categories = ['A', 'B', 'C']
values1 = [20, 35, 30]
values2 = [25, 32, 28]
width = 0.35
x = np.arange(len(categories))

fig, ax = plt.subplots()
ax.bar(x - width/2, values1, width, label='Group 1')
ax.bar(x + width/2, values2, width, label='Group 2')
ax.set_xticks(x)
ax.set_xticklabels(categories)
ax.legend()
plt.show()
```

### 2.4 堆叠柱状图

```python
values1 = [20, 35, 30]
values2 = [15, 25, 20]

plt.bar(categories, values1, label='Part1', color='blue')
plt.bar(categories, values2, bottom=values1, label='Part2', color='orange')
plt.legend()
plt.title('堆叠柱状图')
plt.show()
```

### 2.5 带误差棒的柱状图

```python
means = [20, 35, 30, 25]
stds = [2, 3, 4, 2]   # 标准差

plt.bar(categories, means, yerr=stds, capsize=5, color='lightgreen', edgecolor='black')
plt.title('带误差棒的柱状图')
plt.show()
```

---

## 3 直方图（Histogram）

直方图展示数据分布，将数据分成多个区间（bins），统计每个区间的频数。

### 3.1 基本直方图

```python
data = np.random.randn(1000)   # 正态分布数据

plt.hist(data, bins=30, color='skyblue', edgecolor='black', alpha=0.7)
plt.xlabel('值')
plt.ylabel('频数')
plt.title('直方图')
plt.show()
```

**常用参数**：

- `bins`：区间数（整数）或区间边界（列表）
- `density`：是否归一化为概率密度（True/False）
- `cumulative`：是否累积
- `histtype`：`'bar'`, `'step'`, `'stepfilled'`
- `orientation`：`'vertical'` 或 `'horizontal'`
- `range`：指定数据范围

### 3.2 多组直方图叠加

```python
data1 = np.random.normal(0, 1, 1000)
data2 = np.random.normal(2, 0.8, 1000)

plt.hist(data1, bins=30, alpha=0.5, label='Group1', color='blue')
plt.hist(data2, bins=30, alpha=0.5, label='Group2', color='red')
plt.legend()
plt.title('多组直方图叠加')
plt.show()
```

### 3.3 累计直方图

```python
plt.hist(data, bins=30, cumulative=True, density=True, histtype='step', linewidth=2)
plt.title('累计分布直方图')
plt.show()
```

---

## 4 饼图（Pie Chart）

饼图用于展示各部分占总体的比例，适合类别较少（<7）的情况。

### 4.1 基本饼图

```python
labels = ['苹果', '香蕉', '橙子', '葡萄']
sizes = [25, 30, 20, 25]
colors = ['lightcoral', 'gold', 'lightgreen', 'plum']

plt.pie(sizes, labels=labels, colors=colors, autopct='%1.1f%%', startangle=90)
plt.title('水果销售占比')
plt.axis('equal')   # 确保饼图为正圆
plt.show()
```

**常用参数**：

| 参数            | 说明                         |
| --------------- | ---------------------------- |
| `labels`        | 各部分的标签                 |
| `colors`        | 颜色列表                     |
| `autopct`       | 数值显示格式（如 '%1.1f%%'） |
| `startangle`    | 起始角度（默认0°从x轴开始）  |
| `explode`       | 突出某一部分（数组）         |
| `shadow`        | 是否显示阴影                 |
| `wedgeprops`    | 扇区属性（如边框线）         |
| `textprops`     | 标签文本属性                 |
| `pctdistance`   | 百分比文字距离圆心的距离     |
| `labeldistance` | 标签距离圆心的距离           |

```python
# 突出某一块
explode = (0, 0.1, 0, 0)   # 第二块突出
plt.pie(sizes, explode=explode, labels=labels, autopct='%1.1f%%', shadow=True)
plt.show()
```

---

## 5 箱线图（Box Plot）

箱线图展示数据分布的五个关键统计量：最小值、第一四分位数（Q1）、中位数、第三四分位数（Q3）、最大值，以及离群点。

### 5.1 基本箱线图

```python
data = [np.random.normal(0, 1, 100) for _ in range(4)]   # 4组数据

plt.boxplot(data, labels=['A', 'B', 'C', 'D'])
plt.title('箱线图示例')
plt.ylabel('数值')
plt.grid(axis='y', alpha=0.3)
plt.show()
```

### 5.2 箱线图参数详解

```python
plt.boxplot(data,
            notch=True,           # 凹口箱线图（展示中位数置信区间）
            vert=True,            # 垂直放置
            patch_artist=True,    # 填充箱体颜色
            widths=0.6,           # 箱宽
            showmeans=True,       # 显示均值点
            meanline=True,        # 均值线（需showmeans）
            meanprops={'color': 'red', 'linewidth': 2},
            boxprops={'facecolor': 'lightblue', 'edgecolor': 'black'},
            whiskerprops={'color': 'black', 'linestyle': '--'},
            flierprops={'marker': 'o', 'markersize': 4, 'markerfacecolor': 'red'})
```

### 5.3 水平箱线图

```python
plt.boxplot(data, vert=False, labels=['A', 'B', 'C', 'D'])
plt.xlabel('数值')
plt.title('水平箱线图')
plt.show()
```

### 5.4 多子图箱线图对比

```python
fig, axes = plt.subplots(1, 2, figsize=(12, 5))
axes[0].boxplot(data)
axes[0].set_title('默认箱线图')
axes[1].boxplot(data, notch=True, patch_artist=True)
axes[1].set_title('凹口+填充箱线图')
plt.show()
```

---

## 6 热力图（Heatmap）

热力图用颜色表示二维数据的大小，常用于相关性矩阵、混淆矩阵等。

### 6.1 使用 `imshow` 绘制热力图

```python
# 生成相关性矩阵
data = np.random.rand(5, 5)   # 5x5 随机矩阵
plt.imshow(data, cmap='viridis', interpolation='nearest')
plt.colorbar(label='值')
plt.xticks(range(5), ['A', 'B', 'C', 'D', 'E'])
plt.yticks(range(5), ['A', 'B', 'C', 'D', 'E'])
plt.title('热力图')
plt.show()
```

### 6.2 使用 `matshow`

```python
plt.matshow(data, cmap='coolwarm', fignum=0)
plt.colorbar()
plt.show()
```

### 6.3 结合文本标注

```python
fig, ax = plt.subplots()
im = ax.imshow(data, cmap='YlOrRd', aspect='auto')
# 添加文本标注
for i in range(data.shape[0]):
    for j in range(data.shape[1]):
        text = ax.text(j, i, f'{data[i, j]:.2f}',
                       ha='center', va='center', color='white' if data[i, j] > 0.5 else 'black')
plt.colorbar(im)
plt.title('带数值标注的热力图')
plt.show()
```

---

## 7 多种图表组合

在一个图形中组合不同类型的图表，例如散点图+回归线、柱状图+折线图等。

```python
# 示例：柱状图+折线图（双纵轴）
fig, ax1 = plt.subplots()

# 柱状图
x = [1,2,3,4,5]
y1 = [10,15,7,12,9]
ax1.bar(x, y1, color='skyblue', alpha=0.7, label='销售额')
ax1.set_xlabel('月份')
ax1.set_ylabel('销售额（万元）', color='blue')
ax1.tick_params(axis='y', labelcolor='blue')

# 折线图，共享x轴，不同y轴
ax2 = ax1.twinx()
y2 = [5,8,4,6,5]
ax2.plot(x, y2, 'ro-', label='利润率')
ax2.set_ylabel('利润率（%）', color='red')
ax2.tick_params(axis='y', labelcolor='red')

fig.legend(loc='upper left')
plt.title('销售业绩双轴图')
plt.show()
```

---

## 8 小结

| 图表类型 | 函数                   | 适用场景           |
| -------- | ---------------------- | ------------------ |
| 散点图   | `plt.scatter()`        | 两个连续变量的关系 |
| 柱状图   | `plt.bar()` / `barh()` | 类别之间的数值对比 |
| 直方图   | `plt.hist()`           | 单变量分布         |
| 饼图     | `plt.pie()`            | 占比（少量类别）   |
| 箱线图   | `plt.boxplot()`        | 数据分布与异常值   |
| 热力图   | `plt.imshow()`         | 二维矩阵数值大小   |

- 所有图表均支持丰富的样式定制：颜色、透明度、标签、标题、图例、网格等。
- 可以使用 `subplots()` 组合多个图表。
- 推荐掌握常用参数，并结合实际数据选择合适的图表类型。

---

## 第三部分：3D绘图、动画、高级定制与子图布局进阶

### 学习目标

- 目标
  - 掌握三维绘图的基本方法（曲面图、散点图、线图、等高线图）
  - 学会创建动画（`FuncAnimation`）
  - 掌握高级定制技巧：刻度格式、双Y轴、颜色映射、文本标注、图形样式
  - 精通子图布局：`GridSpec`、嵌套图、混合大小子图
  - 了解图形保存与交互模式

---

## 1 三维绘图（3D Plotting）

使用 `mpl_toolkits.mplot3d` 工具包绘制三维图形。

### 1.1 导入与项目准备

```python
import matplotlib.pyplot as plt
import numpy as np
from mpl_toolkits.mplot3d import Axes3D  # 注册3D投影

fig = plt.figure()
ax = fig.add_subplot(111, projection='3d')  # 或者 projection='3d'
```

### 1.2 3D 散点图

```python
n = 100
x = np.random.randn(n)
y = np.random.randn(n)
z = np.random.randn(n)

fig = plt.figure(figsize=(8,6))
ax = fig.add_subplot(111, projection='3d')
sc = ax.scatter(x, y, z, c=z, cmap='viridis', s=50, alpha=0.6)
ax.set_xlabel('X')
ax.set_ylabel('Y')
ax.set_zlabel('Z')
plt.colorbar(sc, ax=ax, label='Z值')
plt.title('3D散点图')
plt.show()
```

### 1.3 3D 曲面图（Surface Plot）

```python
# 生成网格数据
x = np.linspace(-3, 3, 50)
y = np.linspace(-3, 3, 50)
X, Y = np.meshgrid(x, y)
Z = np.sin(np.sqrt(X**2 + Y**2))

fig = plt.figure(figsize=(10,6))
ax = fig.add_subplot(111, projection='3d')
surf = ax.plot_surface(X, Y, Z, cmap='coolwarm', edgecolor='none', alpha=0.9)
ax.set_xlabel('X')
ax.set_ylabel('Y')
ax.set_zlabel('Z')
fig.colorbar(surf, shrink=0.5, aspect=10)
plt.title('3D曲面图')
plt.show()
```

**`plot_surface` 常用参数**：

- `cmap`：颜色映射
- `alpha`：透明度
- `edgecolor`：网格线颜色
- `linewidth`：网格线宽度
- `rstride`, `cstride`：行/列采样步长（控制网格密度）

### 1.4 3D 线图（Wireframe / Line）

```python
# 线框图
ax.plot_wireframe(X, Y, Z, color='blue', linewidth=0.5)

# 或使用 plot 绘制单条3D线
t = np.linspace(0, 4*np.pi, 200)
x_line = np.sin(t)
y_line = np.cos(t)
z_line = t
ax.plot(x_line, y_line, z_line, 'r-', linewidth=2, label='螺旋线')
ax.legend()
```

### 1.5 3D 等高线图（Contour）

```python
fig = plt.figure()
ax = fig.add_subplot(111, projection='3d')
ax.contour(X, Y, Z, levels=20, cmap='plasma', zdir='z', offset=-2)  # 投影到底面
ax.contour(X, Y, Z, levels=20, cmap='plasma')  # 3D等高线
```

### 1.6 3D 条形图（Bar3D）

```python
xpos = [1,2,3,4,5,1,2,3,4,5]
ypos = [1,1,1,1,1,2,2,2,2,2]
zpos = np.zeros(10)
dx = dy = 0.8
dz = np.random.randint(1,10,10)

fig = plt.figure()
ax = fig.add_subplot(111, projection='3d')
ax.bar3d(xpos, ypos, zpos, dx, dy, dz, shade=True, color='cyan')
ax.set_xlabel('X')
ax.set_ylabel('Y')
ax.set_zlabel('Z')
plt.show()
```

---

## 2 动画制作（Animation）

使用 `matplotlib.animation` 模块创建动态图。

### 2.1 基础动画（FuncAnimation）

```python
import matplotlib.animation as animation

fig, ax = plt.subplots()
x = np.linspace(0, 2*np.pi, 200)
line, = ax.plot(x, np.sin(x))

def animate(i):
    line.set_ydata(np.sin(x + i / 10))  # 更新数据
    return line,

ani = animation.FuncAnimation(fig, animate, frames=100, interval=50, blit=True)
# frames: 帧数，interval: 间隔毫秒，blit: 只重绘变化部分
plt.show()
```

### 2.2 保存动画

```python
# 需要安装 ffmpeg 或 imagemagick
ani.save('sine_wave.gif', writer='pillow', fps=20)
# ani.save('animation.mp4', writer='ffmpeg')
```

### 2.3 动画示例：散点图动态更新

```python
fig, ax = plt.subplots()
ax.set_xlim(0, 10)
ax.set_ylim(0, 10)
scat = ax.scatter([], [], c='red')

def init():
    scat.set_offsets(np.empty((0,2)))
    return scat,

def animate(i):
    np.random.seed(i)
    new_points = np.random.rand(10, 2) * 10
    scat.set_offsets(new_points)
    return scat,

ani = animation.FuncAnimation(fig, animate, frames=50, init_func=init, interval=200, blit=True)
plt.show()
```

### 2.4 使用 `ArtistAnimation`

```python
ims = []
fig, ax = plt.subplots()
for i in range(50):
    im = ax.plot(np.sin(np.linspace(0, 2*np.pi, 100) + i/10), color='blue')
    ims.append(im)
ani = animation.ArtistAnimation(fig, ims, interval=50)
plt.show()
```

---

## 3 高级定制技巧

### 3.1 双Y轴（Twin Axes）

```python
fig, ax1 = plt.subplots()
x = np.linspace(0, 10, 100)
ax1.plot(x, np.sin(x), 'b-', label='sin')
ax1.set_xlabel('x')
ax1.set_ylabel('sin(x)', color='b')
ax1.tick_params(axis='y', labelcolor='b')

ax2 = ax1.twinx()
ax2.plot(x, np.exp(x/5), 'r-', label='exp')
ax2.set_ylabel('exp(x/5)', color='r')
ax2.tick_params(axis='y', labelcolor='r')

plt.title('双Y轴示例')
plt.show()
```

### 3.2 共享轴（sharex / sharey）

```python
fig, (ax1, ax2) = plt.subplots(2, 1, sharex=True)  # 共享x轴
ax1.plot([1,2,3], [4,5,6])
ax2.plot([1,2,3], [6,5,4])
ax2.set_xlabel('共用X轴')
plt.show()
```

### 3.3 对数坐标（Log Scale）

```python
x = np.logspace(0, 3, 50)
y = x**2

plt.plot(x, y)
plt.xscale('log')
plt.yscale('log')
plt.grid(True, which='both', linestyle='--')
plt.title('对数坐标图')
plt.show()
```

### 3.4 自定义刻度格式

```python
from matplotlib.ticker import FuncFormatter, MultipleLocator

def million_formatter(x, pos):
    return f'{x/1e6:.0f}M'

fig, ax = plt.subplots()
ax.plot([1,2,3], [1e6, 2e6, 3e6])
ax.yaxis.set_major_formatter(FuncFormatter(million_formatter))
ax.yaxis.set_major_locator(MultipleLocator(1e6))
plt.show()
```

### 3.5 文本标注与箭头

```python
plt.plot([0,1], [0,1], 'k-')
plt.annotate('起点', xy=(0,0), xytext=(0.2,0.2),
             arrowprops=dict(arrowstyle='->', color='red'))
plt.text(0.6, 0.3, '直线方程 y=x', fontsize=12, bbox=dict(boxstyle='round', facecolor='yellow'))
plt.show()
```

- `annotate` 参数：`xy` 被标注点，`xytext` 文本位置，`arrowprops` 箭头属性
- `text` 简单文本

### 3.6 颜色映射（Colormap）

```python
cmap = plt.cm.viridis   # 内置 colormap
# 其他常用：'plasma', 'inferno', 'magma', 'coolwarm', 'RdBu', 'Set1', 'Pastel1'

# 获取颜色列表
colors = [cmap(i) for i in np.linspace(0, 1, 10)]
```

### 3.7 填充区域（fill / fill_between）

```python
x = np.linspace(0, 2*np.pi, 100)
y1 = np.sin(x)
y2 = np.cos(x)

plt.plot(x, y1, 'b-', label='sin')
plt.plot(x, y2, 'r-', label='cos')
plt.fill_between(x, y1, y2, where=(y1 > y2), color='lightblue', alpha=0.5, label='sin > cos')
plt.fill_between(x, y1, y2, where=(y1 <= y2), color='lightcoral', alpha=0.5, label='sin <= cos')
plt.legend()
plt.show()
```

---

## 4 子图布局进阶（GridSpec）

### 4.1 基本 GridSpec

```python
fig = plt.figure(figsize=(8,6))
gs = fig.add_gridspec(3, 3)  # 3行3列网格

ax1 = fig.add_subplot(gs[0, :])   # 第一行，跨所有列
ax2 = fig.add_subplot(gs[1, :-1]) # 第二行，前两列
ax3 = fig.add_subplot(gs[1:, -1]) # 第二行开始，最后一列
ax4 = fig.add_subplot(gs[-1, 0])  # 最后一行，第一列
ax5 = fig.add_subplot(gs[-1, 1])  # 最后一行，第二列

ax1.plot([1,2],[3,4])
ax2.scatter([1,2],[3,4])
ax3.hist(np.random.randn(100))
ax4.boxplot(np.random.randn(50))
ax5.bar([1,2],[3,4])
plt.tight_layout()
plt.show()
```

### 4.2 控制行列跨度

```python
gs = fig.add_gridspec(2, 2, width_ratios=[1, 2], height_ratios=[2, 1])
# width_ratios: 列宽比例，height_ratios: 行高比例

ax1 = fig.add_subplot(gs[0, 0])
ax2 = fig.add_subplot(gs[0, 1])
ax3 = fig.add_subplot(gs[1, :])  # 整个第二行
```

### 4.3 子图之间间距调整

```python
fig.subplots_adjust(left=0.1, bottom=0.1, right=0.9, top=0.9, wspace=0.2, hspace=0.3)
# 或使用 plt.tight_layout(pad=1.08, h_pad=None, w_pad=None)
```

### 4.4 `subplot2grid` 方式

```python
ax1 = plt.subplot2grid((3,3), (0,0), colspan=3)
ax2 = plt.subplot2grid((3,3), (1,0), colspan=2)
ax3 = plt.subplot2grid((3,3), (1,2), rowspan=2)
ax4 = plt.subplot2grid((3,3), (2,0))
ax5 = plt.subplot2grid((3,3), (2,1))
```

---

## 5 图形保存与交互模式

### 5.1 保存为多种格式

```python
plt.savefig('figure.png', dpi=300, bbox_inches='tight', pad_inches=0.1, transparent=False)
# 格式可以是 png, pdf, svg, eps, pgf 等
# bbox_inches='tight' 自动裁切空白边缘
```

### 5.2 交互模式（Interactive Mode）

```python
plt.ion()          # 打开交互模式
for i in range(10):
    plt.clf()
    plt.plot(np.random.randn(100))
    plt.pause(0.1)
plt.ioff()         # 关闭交互模式
plt.show()
```

### 5.3 常用后端设置

```python
# 查看可用后端
print(plt.rcsetup.all_backends)
# 设置后端（需在导入 pyplot 前）
import matplotlib
matplotlib.use('Agg')   # 无GUI后端，适合服务器保存图片
```

---

## 6 实用技巧与常见问题

### 6.1 中文字体问题解决方案

```python
# 方法1：rcParams
plt.rcParams['font.sans-serif'] = ['SimHei']
plt.rcParams['axes.unicode_minus'] = False

# 方法2：指定路径（Linux下）
import matplotlib
matplotlib.font_manager.fontManager.addfont('/path/to/simhei.ttf')
plt.rcParams['font.family'] = 'SimHei'
```

### 6.2 消除图形周围的空白

```python
plt.subplots_adjust(left=0.05, right=0.95, top=0.95, bottom=0.05)
# 或在保存时使用 bbox_inches='tight'
```

### 6.3 在 Jupyter Notebook 中内嵌图形

```python
%matplotlib inline   # 静态图
%matplotlib notebook # 交互图（缩放、平移）
```

### 6.4 颜色循环控制

```python
from cycler import cycler
plt.rcParams['axes.prop_cycle'] = cycler(color=['r', 'g', 'b', 'c', 'm', 'y'])
```

---

## 7 小结

- **3D绘图**：通过 `projection='3d'` 创建，支持散点图、曲面图、线图、等高线、条形图等。
- **动画**：使用 `FuncAnimation` 或 `ArtistAnimation`，可保存为 GIF/MP4。
- **高级定制**：
  - 双Y轴（`twinx()`/`twiny()`）
  - 对数坐标（`set_xscale('log')`）
  - 自定义刻度格式（`FuncFormatter`）
  - 文本标注（`annotate`, `text`）
  - 填充区域（`fill_between`）
- **子图布局**：
  - `GridSpec` 提供灵活的网格布局，支持行列跨度和宽高比例调整
  - `subplot2grid` 基于网格的位置布局
- **图形保存**：`savefig` 支持 PNG、PDF、SVG 等，可控制 DPI 和边距。
- **常见问题**：中文字体、空白去除、交互模式等。

掌握以上内容，你已具备使用 Matplotlib 进行专业数据可视化的能力。

---
