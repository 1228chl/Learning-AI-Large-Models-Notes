**上一级：** [[14-1Pandas模块（课堂版）]]

**下一级：**  [[15Matplotlib]]

**标签：** #Pandas #基础 

---

# 一、Pandas优势

## 学习目标

- 目标
    - 了解 Pandas 与 NumPy 的区别
    - 知道 Pandas 的核心数据结构：Series 与 DataFrame
    - 理解 Pandas 在数据处理和分析中的优势

## 1 Pandas 介绍

**Pandas** 是一个基于 NumPy 构建的开源 Python 数据分析库，提供了**高效、灵活且表达性强的数据结构**，专门用于**数据清洗、转换、分析和可视化**。

- Pandas 的名字源自 **Panel Data**（面板数据）。
- 核心数据结构：**Series**（一维带标签数组）和 **DataFrame**（二维带标签表格）。
- 相比于 NumPy 的 ndarray，Pandas 支持**异构数据**（不同列可以是不同数据类型）、**缺失值处理**、**标签索引**、**分组聚合**、**时间序列**等高级功能。

## 2 Pandas 与 NumPy 的对比

| 特性       | NumPy                 | Pandas                            |
| ---------- | --------------------- | --------------------------------- |
| 数据结构   | ndarray（同质，多维） | Series、DataFrame（异构，带标签） |
| 索引       | 整数索引              | 整数索引 + 标签索引               |
| 缺失值处理 | 不支持（需手动）      | 内置 NaN 处理（dropna、fillna）   |
| 分组聚合   | 需要手动实现          | 强大的 groupby 功能               |
| 数据对齐   | 需要形状相同          | 自动按标签对齐                    |
| 适用场景   | 数值计算、线性代数    | 数据清洗、分析、探索性数据分析    |

## 3 Pandas 核心数据结构

### 3.1 Series（一维带标签数组）

- 类似于带索引的 NumPy 一维数组。
- 每个元素可以是不同数据类型（但通常建议同质）。
- 索引：默认整数索引（0,1,2,...）或自定义标签索引。

```python
import pandas as pd
import numpy as np

# 从列表创建 Series
s1 = pd.Series([1, 2, 3, 4])
print(s1)
# 0    1
# 1    2
# 2    3
# 3    4
# dtype: int64

# 指定索引
s2 = pd.Series([1, 2, 3, 4], index=['a', 'b', 'c', 'd'])
print(s2)
# a    1
# b    2
# c    3
# d    4
# dtype: int64

# 从字典创建（键为索引）
s3 = pd.Series({'语文': 85, '数学': 92, '英语': 88})
print(s3)
```

### 3.2 DataFrame（二维表格）

- 类似于 Excel 表格或 SQL 表。
- 每列可以是不同的数据类型（int, float, string, datetime 等）。
- 拥有行索引和列索引。

```python
# 从字典创建 DataFrame（键为列名）
data = {
    '姓名': ['张三', '李四', '王五'],
    '年龄': [22, 25, 21],
    '成绩': [85, 92, 78]
}
df = pd.DataFrame(data)
print(df)
#    姓名  年龄  成绩
# 0  张三  22  85
# 1  李四  25  92
# 2  王五  21  78

# 指定行索引
df = pd.DataFrame(data, index=['s1', 's2', 's3'])
print(df)
#     姓名  年龄  成绩
# s1  张三  22  85
# s2  李四  25  92
# s3  王五  21  78
```

## 4 Pandas 的优势

### 4.1 数据对齐（自动按标签匹配）

Pandas 在进行运算时，会自动根据**行索引和列索引**对齐数据，缺失部分用 NaN 填充。

```python
s1 = pd.Series([1,2,3], index=['a','b','c'])
s2 = pd.Series([4,5,6], index=['b','c','d'])
print(s1 + s2)
# a    NaN
# b    6.0
# c    8.0
# d    NaN
# dtype: float64
```

### 4.2 缺失值处理

内置 `NaN`（Not a Number）表示缺失数据，并提供 `dropna()`、`fillna()`、`isna()` 等方法。

### 4.3 强大的 I/O 支持

可以轻松读取/写入多种格式：CSV、Excel、SQL、JSON、Parquet、HDF5 等。

```python
df = pd.read_csv('data.csv')      # 读取 CSV
df.to_excel('data.xlsx')          # 写入 Excel
```

### 4.4 分组聚合（类似 SQL 的 GROUP BY）

```python
df.groupby('班级')['成绩'].mean()
```

### 4.5 时间序列处理

支持日期范围生成、重采样、滑动窗口等高级时间序列操作。

## 5 小结

- Pandas 是 Python 数据分析的核心库，基于 NumPy 构建。
- 核心数据结构：**Series**（一维带标签）和 **DataFrame**（二维表格）。
- 优势：数据对齐、缺失值处理、丰富 I/O、分组聚合、时间序列等。
- 安装：`pip install pandas`，导入：`import pandas as pd`。

---

## 第二部分：Series 与 DataFrame 的详细操作、索引与选择数据

### 学习目标

- 目标
  - 掌握 Series 的创建、属性和常用方法
  - 掌握 DataFrame 的创建、属性和常用方法
  - 学会使用行索引、列索引、条件筛选等方式选择数据
  - 理解 loc 和 iloc 的区别

---

## 1 Series 详解

### 1.1 Series 的创建方式

```python
import pandas as pd
import numpy as np

# 1. 从列表创建
s1 = pd.Series([10, 20, 30, 40])
# 0    10
# 1    20
# 2    30
# 3    40
# dtype: int64

# 2. 从列表创建并指定索引
s2 = pd.Series([10, 20, 30, 40], index=['a', 'b', 'c', 'd'])

# 3. 从字典创建（键为索引）
s3 = pd.Series({'math': 85, 'english': 92, 'python': 88})

# 4. 从标量创建（需指定索引，值会重复填充）
s4 = pd.Series(5, index=['x', 'y', 'z'])   # x 5, y 5, z 5

# 5. 从 NumPy 数组创建
arr = np.array([1, 3, 5, 7])
s5 = pd.Series(arr, index=['p', 'q', 'r', 's'])
```

### 1.2 Series 的属性

| 属性           | 说明                     |
| -------------- | ------------------------ |
| `s.values`     | 返回 NumPy 数组形式的值  |
| `s.index`      | 返回索引对象             |
| `s.dtype`      | 返回数据类型             |
| `s.shape`      | 返回形状元组 (n,)        |
| `s.size`       | 返回元素个数             |
| `s.nbytes`     | 返回底层数据占用的字节数 |
| `s.name`       | Series 名称              |
| `s.index.name` | 索引名称                 |

```python
s = pd.Series([1,2,3], index=['a','b','c'], name='分数')
print(s.values)          # [1 2 3]
print(s.index)           # Index(['a', 'b', 'c'], dtype='object')
print(s.dtype)           # int64
print(s.shape)           # (3,)
print(s.name)            # 分数
s.index.name = '学生'
print(s)
# 学生
# a    1
# b    2
# c    3
# Name: 分数, dtype: int64
```

### 1.3 Series 的常用方法

| 方法                      | 说明                       |
| ------------------------- | -------------------------- |
| `s.head(n)`               | 查看前 n 行                |
| `s.tail(n)`               | 查看后 n 行                |
| `s.info()`                | 基本信息（类型、内存）     |
| `s.describe()`            | 统计摘要（均值、标准差等） |
| `s.value_counts()`        | 统计各值出现次数           |
| `s.sort_values()`         | 按值排序                   |
| `s.sort_index()`          | 按索引排序                 |
| `s.isna()` / `s.isnull()` | 判断缺失值                 |
| `s.dropna()`              | 删除缺失值                 |
| `s.fillna(value)`         | 填充缺失值                 |

```python
s = pd.Series([5, 2, 8, np.nan, 5, 2], index=['a','b','c','d','e','f'])
print(s.head(3))
print(s.describe())
print(s.value_counts())
print(s.sort_values())
```

---

## 2 DataFrame 详解

### 2.1 DataFrame 的创建方式

```python
# 1. 从字典创建（键为列名，值为列表或数组）
data = {
    '姓名': ['张三', '李四', '王五'],
    '年龄': [22, 25, 21],
    '成绩': [85, 92, 78]
}
df1 = pd.DataFrame(data)

# 2. 从字典列表创建（每个字典代表一行）
rows = [
    {'姓名': '张三', '年龄': 22, '成绩': 85},
    {'姓名': '李四', '年龄': 25, '成绩': 92},
    {'姓名': '王五', '年龄': 21, '成绩': 78}
]
df2 = pd.DataFrame(rows)

# 3. 从 NumPy 数组创建
arr = np.array([[1,2,3],[4,5,6]])
df3 = pd.DataFrame(arr, columns=['A','B','C'], index=['r1','r2'])

# 4. 从 Series 字典创建
data = {
    '数学': pd.Series([85,90,78], index=['张三','李四','王五']),
    '英语': pd.Series([88,92,80], index=['张三','李四','王五'])
}
df4 = pd.DataFrame(data)

# 5. 从 CSV / Excel 等文件读取（后续 I/O 部分详细讲）
# df = pd.read_csv('file.csv')
```

### 2.2 DataFrame 的属性

| 属性         | 说明                        |
| ------------ | --------------------------- |
| `df.shape`   | 行数、列数元组              |
| `df.columns` | 列名 Index                  |
| `df.index`   | 行索引 Index                |
| `df.dtypes`  | 各列数据类型                |
| `df.values`  | 返回 NumPy 数组（不含索引） |
| `df.size`    | 元素总数（行×列）           |
| `df.ndim`    | 维度数（总是 2）            |
| `df.T`       | 转置（行列互换）            |

```python
df = pd.DataFrame({'A':[1,2,3], 'B':[4,5,6]}, index=['x','y','z'])
print(df.shape)        # (3, 2)
print(df.columns)      # Index(['A','B'], dtype='object')
print(df.index)        # Index(['x','y','z'], dtype='object')
print(df.dtypes)       # A int64, B int64
print(df.values)       # [[1 4],[2 5],[3 6]]
print(df.T)            # 转置
```

### 2.3 DataFrame 的常用方法

| 方法                    | 说明                     |
| ----------------------- | ------------------------ |
| `df.head(n)`            | 查看前 n 行              |
| `df.tail(n)`            | 查看后 n 行              |
| `df.info()`             | 概览：行数、列类型、内存 |
| `df.describe()`         | 数值列的统计信息         |
| `df.dtypes`             | 各列数据类型             |
| `df.isnull().sum()`     | 统计各列缺失值个数       |
| `df.dropna()`           | 删除含缺失值的行/列      |
| `df.fillna(value)`      | 填充缺失值               |
| `df.rename(columns={})` | 重命名列名               |
| `df.sort_values(by)`    | 按指定列排序             |
| `df.sort_index()`       | 按行索引排序             |
| `df.reset_index()`      | 重置行索引               |
| `df.set_index(col)`     | 将某列设为行索引         |

```python
df = pd.DataFrame({
    '姓名': ['张三', '李四', '王五'],
    '年龄': [22, 25, 21],
    '成绩': [85, 92, 78]
})
print(df.info())
print(df.describe())
print(df.sort_values(by='成绩', ascending=False))
```

---

## 3 索引与选择数据

### 3.1 选择列

```python
# 单列：返回 Series
df['姓名']          # 推荐
df.姓名             # 仅当列名是合法 Python 标识符时可用

# 多列：返回 DataFrame（传入列表）
df[['姓名', '成绩']]
```

### 3.2 选择行

```python
# 使用行索引标签（需要知道具体索引值）
df.loc['行标签']      # 示例：df.loc[0] 或 df.loc['学生1']

# 使用行位置（整数索引）
df.iloc[行位置]       # 示例：df.iloc[0] 第一行

# 切片（左闭右闭 vs 左闭右开）
df[0:2]               # 选择第0行和第1行（左闭右开）
```

### 3.3 loc 和 iloc 详解

| 方法        | 说明                       | 示例                                  |
| ----------- | -------------------------- | ------------------------------------- |
| `df.loc[]`  | **标签索引**，包含结束位置 | `df.loc['a':'c']` 包含 'c' 行         |
| `df.iloc[]` | **位置索引**，不含结束位置 | `df.iloc[0:3]` 取 0,1,2 行，不含第3行 |

```python
# 准备数据
df = pd.DataFrame(
    [[1,2,3],[4,5,6],[7,8,9],[10,11,12]],
    index=['r1','r2','r3','r4'],
    columns=['A','B','C']
)

# loc：标签索引，包含结束
print(df.loc['r1':'r3', 'A':'B'])   # 行: r1,r2,r3；列: A,B
# 结果：
#     A  B
# r1  1  2
# r2  4  5
# r3  7  8

# iloc：位置索引，不含结束
print(df.iloc[0:3, 0:2])            # 行: 0,1,2；列: 0,1
# 结果同上（数据一样，但索引标签保留）

# 单行单列
print(df.loc['r2', 'B'])            # 5
print(df.iloc[1, 1])                # 5

# 条件筛选（返回 bool Series）
mask = df['A'] > 5
print(df.loc[mask])                 # 只显示 A > 5 的行
```

### 3.4 条件筛选（布尔索引）

```python
df = pd.DataFrame({
    '姓名': ['张三','李四','王五','赵六'],
    '年龄': [22, 25, 21, 24],
    '成绩': [85, 92, 78, 88]
})

# 单一条件
result = df[df['成绩'] > 85]          # 返回成绩大于85的行

# 多个条件（使用 & 和 |，注意括号）
result = df[(df['成绩'] > 80) & (df['年龄'] < 24)]

# 使用 query 方法（更简洁）
result = df.query('成绩 > 80 and 年龄 < 24')

# isin 方法（筛选某列包含在列表中的行）
result = df[df['姓名'].isin(['张三','王五'])]
```

### 3.5 使用 at / iat 快速访问单个值

- `at`：基于标签，比 loc 更快（仅取单个值）
- `iat`：基于位置，比 iloc 更快

```python
# 获取 r2 行 B 列的值
value = df.at['r2', 'B']
# 使用位置
value = df.iat[1, 1]
# 设置值
df.at['r2', 'B'] = 100
```

### 3.6 设置新列

```python
# 直接赋值
df['总分'] = df['数学'] + df['英语']

# 根据条件赋值
df['等级'] = df['成绩'].apply(lambda x: '优秀' if x >= 90 else '良好' if x >= 75 else '及格')

# 使用 np.where
df['是否及格'] = np.where(df['成绩'] >= 60, '是', '否')
```

### 3.7 删除行/列

```python
# 删除列（axis=1）
df_drop = df.drop('某列名', axis=1)
# 删除行（axis=0）
df_drop = df.drop([0, 2], axis=0)   # 删除索引0和2的行

# 原地删除（修改原 DataFrame）
df.drop('某列名', axis=1, inplace=True)
```

### 3.8 常用索引技巧总结

| 操作                   | 代码示例                           |
| ---------------------- | ---------------------------------- |
| 选择单列               | `df['列名']`                       |
| 选择多列               | `df[['列1','列2']]`                |
| 按标签选择行           | `df.loc['行标签']`                 |
| 按位置选择行           | `df.iloc[0]`                       |
| 按标签切片（含结束）   | `df.loc['a':'c']`                  |
| 按位置切片（不含结束） | `df.iloc[0:3]`                     |
| 按标签选择行列子集     | `df.loc['a':'c', ['列1','列2']]`   |
| 按位置选择行列子集     | `df.iloc[0:3, 0:2]`                |
| 条件筛选               | `df[df['列名'] > 阈值]`            |
| 复合条件               | `df[(df['A']>1) & (df['B']<5)]`    |
| 快速取单个值           | `df.at['行','列']` / `df.iat[0,0]` |
| 取前/后几行            | `df.head(5)` / `df.tail(3)`        |

---

## 4 小结

- **Series**：一维带标签数组，类似带索引的 Python 列表或字典。
  - 创建：`pd.Series(list, index=...)`、`pd.Series(dict)`
  - 属性：`.values`, `.index`, `.dtype`, `.shape`, `.name`
  - 方法：`.head()`, `.describe()`, `.value_counts()`, `.sort_values()`
- **DataFrame**：二维表格，每列可以是不同类型。
  - 创建：`pd.DataFrame(dict)`、`pd.DataFrame(rows_list)`、`pd.read_csv()`
  - 属性：`.shape`, `.columns`, `.index`, `.dtypes`, `.values`
  - 方法：`.info()`, `.describe()`, `.dropna()`, `.fillna()`, `.sort_values()`
- **索引与选择**：
  - `df[列名]` 选列，`df[['列1','列2']]` 选多列
  - `df.loc[行标签, 列标签]` 标签索引 —— 包含结束
  - `df.iloc[行位置, 列位置]` 位置索引 —— 不含结束
  - 布尔索引：`df[df['列'] > 值]`
  - 快速取单个值：`.at[]` / `.iat[]`

---

## 第三部分：文件读写、缺失值处理与数据清洗

### 学习目标

- 目标
  - 掌握 Pandas 读取和写入常见文件格式（CSV、Excel、JSON、SQL）
  - 理解缺失值的识别、统计、删除与填充方法
  - 学会数据清洗的基本操作：重复值处理、数据类型转换、字符串处理
  - 掌握常用数据清洗技巧

---

## 1 文件读写（I/O）

Pandas 支持读取和写入多种数据格式，最常用的是 CSV、Excel、JSON、SQL 等。

### 1.1 CSV 文件

CSV（Comma-Separated Values）是最通用的表格数据格式。

```python
import pandas as pd

# ---------------------- 读取 CSV ----------------------
# 基本读取
df = pd.read_csv('data.csv')

# 常见参数
df = pd.read_csv(
    'data.csv',
    sep=',',                # 分隔符，默认逗号
    header=0,               # 指定第几行作为列名（0表示第一行），None表示无列名
    names=['col1','col2'],  # 自定义列名
    index_col=0,            # 将第0列作为行索引
    usecols=[0,2,3],        # 只读取指定列（列索引或列名）
    dtype={'age': int, 'score': float},  # 指定列的数据类型
    parse_dates=['date'],   # 将指定列解析为日期类型
    encoding='utf-8',       # 文件编码
    nrows=100,              # 只读取前100行
    skiprows=[0,2],         # 跳过第0行和第2行（索引从0开始）
    na_values=['NA', 'NULL', '']  # 将指定值识别为缺失值
)

# ---------------------- 写入 CSV ----------------------
df.to_csv('output.csv', 
          index=False,      # 不写入行索引
          encoding='utf-8',
          sep=',',
          columns=['col1','col2'])   # 只写入指定列
```

### 1.2 Excel 文件

需要安装 `openpyxl`（.xlsx）或 `xlrd`（旧版 .xls）。

```python
# 读取 Excel
df = pd.read_excel('data.xlsx', 
                   sheet_name='Sheet1',    # 工作表名或索引（0开始）
                   header=0,
                   usecols='A:C,E',        # 使用 Excel 列字母范围
                   dtype={'id': str})

# 读取多个工作表
sheets = pd.read_excel('data.xlsx', sheet_name=None)   # 返回字典 {sheet_name: df}

# 写入 Excel（需要 openpyxl）
with pd.ExcelWriter('output.xlsx', engine='openpyxl') as writer:
    df1.to_excel(writer, sheet_name='Sheet1', index=False)
    df2.to_excel(writer, sheet_name='Sheet2', index=False)
```

### 1.3 JSON 文件

```python
# 读取 JSON（支持多种格式）
df = pd.read_json('data.json')
# 或从字符串读取
df = pd.read_json('{"a": [1,2], "b": [3,4]}')

# 写入 JSON
df.to_json('output.json', orient='records', indent=2)
# orient 常用选项：
#   'records' : [{col: val}, ...]
#   'index'   : {index: {col: val}}
#   'columns' : {col: {index: val}}
```

### 1.4 SQL 数据库

需要 SQLAlchemy 和相应的数据库驱动（如 `sqlite3`、`pymysql`、`psycopg2`）。

```python
from sqlalchemy import create_engine

# 创建数据库连接
engine = create_engine('sqlite:///data.db')        # SQLite
# engine = create_engine('mysql+pymysql://user:pass@host:port/dbname')

# 读取 SQL 查询结果
df = pd.read_sql('SELECT * FROM table WHERE age > 30', engine)

# 读取整张表
df = pd.read_sql_table('table_name', engine)

# 将 DataFrame 写入数据库
df.to_sql('table_name', engine, 
          if_exists='replace',   # 'fail', 'replace', 'append'
          index=False)
```

### 1.5 其他常用格式

| 格式          | 读取方法                 | 写入方法               | 说明                  |
| ------------- | ------------------------ | ---------------------- | --------------------- |
| **HTML**      | `pd.read_html(url)`      | `df.to_html()`         | 读取网页中的表格      |
| **Parquet**   | `pd.read_parquet(path)`  | `df.to_parquet(path)`  | 列式存储，高效        |
| **HDF5**      | `pd.read_hdf(path, key)` | `df.to_hdf(path, key)` | 适合大型数据集        |
| **Pickle**    | `pd.read_pickle(path)`   | `df.to_pickle(path)`   | Python 序列化格式     |
| **Clipboard** | `pd.read_clipboard()`    | `df.to_clipboard()`    | 从系统剪贴板读取/写入 |

---

## 2 缺失值处理

现实数据中常存在缺失值，Pandas 中使用 `NaN`（Not a Number）或 `None` 表示。

### 2.1 识别缺失值

```python
# 创建含缺失值的示例
import numpy as np
df = pd.DataFrame({
    'A': [1, 2, np.nan, 4],
    'B': [5, np.nan, np.nan, 8],
    'C': ['x', 'y', None, 'z']
})

# 判断每个元素是否为缺失值
df.isna()          # 等价于 df.isnull()
#        A      B      C
# 0  False  False  False
# 1  False   True  False
# 2   True   True   True
# 3  False  False  False

# 判断是否非缺失值
df.notna()         # 等价于 df.notnull()

# 统计每列缺失值个数
df.isna().sum()
# A    1
# B    2
# C    1

# 统计总缺失值个数
df.isna().sum().sum()   # 4

# 查看缺失值占比
df.isna().mean()        # 每列缺失比例
```

### 2.2 删除缺失值

```python
# 删除包含任何缺失值的行（默认 axis=0）
df_dropped = df.dropna()

# 删除所有值都为缺失的行
df_dropped = df.dropna(how='all')

# 删除行，要求至少保留指定数量的非空值（thresh=2 表示至少2个非空）
df_dropped = df.dropna(thresh=2)

# 删除包含缺失值的列（axis=1）
df_dropped = df.dropna(axis=1)

# 原地修改
df.dropna(inplace=True)
```

### 2.3 填充缺失值

```python
# 用常数填充
df_filled = df.fillna(0)                    # 所有缺失填0
df['A'] = df['A'].fillna(0)                 # 单列填充

# 用前向填充（用上一个非缺失值填充）
df_filled = df.fillna(method='ffill')       # 或 'pad'
# 用后向填充（用下一个非缺失值填充）
df_filled = df.fillna(method='bfill')       # 或 'backfill'

# 用统计量填充
df['A'].fillna(df['A'].mean(), inplace=True)   # 均值
df['A'].fillna(df['A'].median(), inplace=True) # 中位数
df['A'].fillna(df['A'].mode()[0], inplace=True)# 众数（可能有多个，取第一个）

# 用插值法填充（线性、二次等）
df['A'] = df['A'].interpolate(method='linear')   # 线性插值

# 使用字典为不同列指定不同填充值
df.fillna({'A': 0, 'B': df['B'].mean(), 'C': 'unknown'}, inplace=True)

# 限制填充数量（limit=1 表示最多连续填充1个缺失）
df.fillna(method='ffill', limit=1)
```

### 2.4 缺失值处理的最佳实践

- **先分析原因**：缺失是随机还是系统性？是否可忽略？
- **删除的条件**：缺失比例极低（<5%）且随机，或缺失主要集中在少数列。
- **填充的策略**：
  - 数值列：均值、中位数（对异常值鲁棒）
  - 分类列：众数、新建"未知"类别
  - 时间序列：前向/后向填充或插值
- **避免数据泄露**：填充统计量时只能用训练集计算（在机器学习中需注意）。

---

## 3 数据清洗（Data Cleaning）

### 3.1 重复值处理

```python
# 创建示例
df = pd.DataFrame({
    'A': [1,1,2,2,3],
    'B': ['x','x','y','y','z']
})

# 判断是否有重复行
df.duplicated()          # 返回布尔 Series
# 0    False
# 1     True
# 2    False
# 3     True
# 4    False

# 统计重复行数
df.duplicated().sum()    # 2

# 删除重复行（保留第一次出现）
df_unique = df.drop_duplicates()
# 删除重复行（保留最后一次出现）
df_unique = df.drop_duplicates(keep='last')
# 基于指定列判断重复
df.drop_duplicates(subset=['A'], keep='first')
```

### 3.2 数据类型转换

```python
# 查看各列类型
df.dtypes

# 转换单列类型
df['age'] = df['age'].astype('int32')
df['score'] = df['score'].astype('float64')

# 转换为分类类型（节省内存，适合取值少的列）
df['gender'] = df['gender'].astype('category')

# 转换为日期时间类型
df['date'] = pd.to_datetime(df['date'], format='%Y-%m-%d')
# 常用 format 代码：%Y-年, %m-月, %d-日, %H-时, %M-分, %S-秒

# 自动推断类型（适合从字符串转换）
df = df.convert_dtypes()

# 自定义转换函数
df['new_col'] = df['old_col'].apply(lambda x: x*2)
```

### 3.3 字符串处理（vectorized string methods）

通过 `.str` 访问器可以对字符串列进行向量化操作。

```python
df = pd.DataFrame({'name': ['  Alice ', 'Bob', 'Charlie', 'David  '],
                   'phone': ['123-4567', '987-6543', '555-1212', '444-8888'],
                   'email': ['ALICE@example.com', 'bob@test.org', 'charlie@work.net', 'DAVID@mail.com']})

# 去空格
df['name'] = df['name'].str.strip()           # 去掉两端空格
df['name'] = df['name'].str.lstrip()          # 去掉左端
df['name'] = df['name'].str.rstrip()          # 去掉右端

# 大小写转换
df['email_lower'] = df['email'].str.lower()
df['email_upper'] = df['email'].str.upper()
df['name_capital'] = df['name'].str.capitalize()  # 首字母大写
df['name_title'] = df['name'].str.title()         # 每个单词首字母大写

# 判断是否包含子串
df['contains_a'] = df['name'].str.contains('a', case=False)

# 提取子串
df['first_char'] = df['name'].str[0]                 # 第一个字符
df['phone_prefix'] = df['phone'].str.split('-').str[0]  # 分割后取第一部分

# 替换
df['phone'] = df['phone'].str.replace('-', '')       # 删除横线

# 获取长度
df['name_len'] = df['name'].str.len()

# 填充缺失空字符串
df['name'] = df['name'].str.fillna('')

# 判断是否为数字
df['is_digit'] = df['phone'].str.isdigit()
```

### 3.4 重命名列名

```python
# 方式1：使用 rename 方法（推荐）
df.rename(columns={'old_name': 'new_name', 'old2': 'new2'}, inplace=True)

# 方式2：直接修改 columns 属性
df.columns = ['col1', 'col2', 'col3']

# 方式3：使用 str 方法批量修改
df.columns = df.columns.str.lower()                 # 全部转小写
df.columns = df.columns.str.replace(' ', '_')       # 空格替换为下划线

# 方式4：添加前缀/后缀
df_add_prefix = df.add_prefix('col_')
df_add_suffix = df.add_suffix('_suffix')
```

### 3.5 值替换与映射

```python
# 单值替换
df['gender'] = df['gender'].replace('M', 'Male')

# 多值替换（字典）
df['gender'] = df['gender'].replace({'M': 'Male', 'F': 'Female', 'U': 'Unknown'})

# 使用 map 进行映射（Series 方法，适合基于现有列创建新列）
status_map = {'S': 'Single', 'M': 'Married', 'D': 'Divorced'}
df['marital_status'] = df['status_code'].map(status_map)

# 使用 apply 进行任意函数映射
df['age_group'] = df['age'].apply(lambda x: 'Young' if x < 30 else 'Old')
```

### 3.6 异常值处理

```python
# 1. 通过描述性统计发现异常
df.describe()

# 2. 使用箱线图原理：超出 (Q1 - 1.5*IQR, Q3 + 1.5*IQR) 视为异常
Q1 = df['value'].quantile(0.25)
Q3 = df['value'].quantile(0.75)
IQR = Q3 - Q1
lower_bound = Q1 - 1.5 * IQR
upper_bound = Q3 + 1.5 * IQR
outliers = df[(df['value'] < lower_bound) | (df['value'] > upper_bound)]

# 3. 处理异常：删除、替换或截断
df['value'] = np.where(df['value'] > upper_bound, upper_bound, df['value'])
df['value'] = np.where(df['value'] < lower_bound, lower_bound, df['value'])

# 4. 使用 z-score 方法（3σ 原则）
from scipy import stats
z_scores = np.abs(stats.zscore(df['value']))
df_no_outliers = df[z_scores < 3]
```

### 3.7 数据清洗常用函数汇总

| 功能           | 方法/函数                                 |
| -------------- | ----------------------------------------- |
| 删除重复行     | `df.drop_duplicates()`                    |
| 转换类型       | `df.astype()`, `pd.to_datetime()`         |
| 字符串处理     | `df['col'].str.xxx()`                     |
| 重命名列       | `df.rename(columns={})`                   |
| 替换值         | `df.replace()`, `df.map()`, `df.apply()`  |
| 处理缺失值     | `df.isna()`, `df.dropna()`, `df.fillna()` |
| 离散化（分箱） | `pd.cut()`, `pd.qcut()`                   |

---

## 4 案例：完整的数据清洗流程

```python
# 1. 读取原始数据
df = pd.read_csv('raw_data.csv', encoding='utf-8')

# 2. 查看数据概览
print(df.info())
print(df.head())
print(df.describe())

# 3. 处理列名：统一小写、替换空格为下划线
df.columns = df.columns.str.lower().str.replace(' ', '_')

# 4. 删除完全重复的行
df.drop_duplicates(inplace=True)

# 5. 处理缺失值：不同列采取不同策略
df['age'].fillna(df['age'].median(), inplace=True)      # 年龄用中位数
df['gender'].fillna('Unknown', inplace=True)            # 性别用"Unknown"
df.dropna(subset=['id'], inplace=True)                  # id缺失则删除行

# 6. 类型转换
df['age'] = df['age'].astype('int')
df['signup_date'] = pd.to_datetime(df['signup_date'])

# 7. 字符串清洗
df['email'] = df['email'].str.lower().str.strip()
df['phone'] = df['phone'].str.replace(r'\D', '', regex=True)  # 只保留数字

# 8. 异常值处理（年龄范围[0,120]）
df = df[(df['age'] >= 0) & (df['age'] <= 120)]

# 9. 新增衍生列
df['age_group'] = pd.cut(df['age'], bins=[0,18,35,60,120], labels=['少年','青年','中年','老年'])

# 10. 保存清洗后的数据
df.to_csv('cleaned_data.csv', index=False)
```

---

## 5 小结

- **文件读写**：
  - CSV：`pd.read_csv()` / `df.to_csv()`
  - Excel：`pd.read_excel()` / `df.to_excel()`
  - JSON、SQL 等通过相应函数读取
- **缺失值处理**：
  - 识别：`.isna()`, `.isnull()`
  - 删除：`.dropna()`（行或列）
  - 填充：`.fillna()`（常数、前向、后向、均值、中位数、插值）
- **数据清洗**：
  - 重复值：`.duplicated()`, `.drop_duplicates()`
  - 类型转换：`.astype()`, `pd.to_datetime()`
  - 字符串处理：`.str` 访问器（`strip`, `lower`, `replace`, `contains`, `split` 等）
  - 重命名列：`.rename(columns=...)`
  - 值映射：`.replace()`, `.map()`, `.apply()`
  - 异常值：分位数法、z-score 法后删除或截断

---

## 第四部分：数据合并、分组聚合与时间序列

### 学习目标

- 目标
  - 掌握 `concat`、`merge`、`join` 进行数据合并
  - 理解 `groupby` 分组聚合的原理与使用
  - 学会时间序列的处理（日期范围、重采样、滑动窗口）

---

## 1 数据合并

### 1.1 `pd.concat()` – 沿轴拼接

沿行（轴0）或列（轴1）将多个 DataFrame 拼接在一起。

```python
import pandas as pd
import numpy as np

# 准备示例数据
df1 = pd.DataFrame({'A': [1,2], 'B': [3,4]}, index=['a','b'])
df2 = pd.DataFrame({'A': [5,6], 'B': [7,8]}, index=['c','d'])
df3 = pd.DataFrame({'C': [9,10], 'D': [11,12]}, index=['a','b'])

# ----- 垂直拼接（增加行）-----
result = pd.concat([df1, df2], axis=0)
#      A  B
# a    1  3
# b    2  4
# c    5  7
# d    6  8

# 忽略原索引，重新生成整数索引
result = pd.concat([df1, df2], axis=0, ignore_index=True)

# ----- 水平拼接（增加列）-----
result = pd.concat([df1, df3], axis=1)
#    A  B  C   D
# a  1  3  9  11
# b  2  4  10 12

# ----- 处理索引重叠的合并方式 -----
# join='outer'：取所有索引的并集（默认）
# join='inner'：取索引的交集
result = pd.concat([df1, df3], axis=1, join='inner')   # 只保留 a,b 行

# ----- 添加层级索引（keys）-----
result = pd.concat([df1, df2], keys=['first', 'second'])
#            A  B
# first a    1  3
#       b    2  4
# second c   5  7
#       d    6  8
```

### 1.2 `pd.merge()` – 类似 SQL 的表连接

根据一个或多个公共列（key）将两个 DataFrame 合并。

```python
# 准备示例数据
left = pd.DataFrame({
    'id': [1, 2, 3],
    'name': ['张三', '李四', '王五'],
    'dept_id': [10, 20, 10]
})

right = pd.DataFrame({
    'dept_id': [10, 20, 30],
    'dept_name': ['技术部', '市场部', '人事部']
})

# ----- 内连接（inner）：只保留两个表中键匹配的行 -----
result = pd.merge(left, right, on='dept_id', how='inner')
#    id name  dept_id dept_name
# 0   1  张三       10       技术部
# 1   3  王五       10       技术部
# 2   2  李四       20       市场部

# ----- 左连接（left）：保留左表所有行，右表无匹配填充 NaN -----
result = pd.merge(left, right, on='dept_id', how='left')

# ----- 右连接（right）和全外连接（outer）-----
result_outer = pd.merge(left, right, on='dept_id', how='outer')

# ----- 多个连接键 -----
left2 = pd.DataFrame({'key1': ['K0','K0','K1','K2'],
                      'key2': ['K0','K1','K0','K1'],
                      'A': [1,2,3,4]})
right2 = pd.DataFrame({'key1': ['K0','K1','K1','K2'],
                       'key2': ['K0','K0','K0','K0'],
                       'B': [5,6,7,8]})
result = pd.merge(left2, right2, on=['key1','key2'], how='inner')

# ----- 当列名不同时，使用 left_on 和 right_on -----
left3 = pd.DataFrame({'id': [1,2], 'name': ['张三','李四']})
right3 = pd.DataFrame({'emp_id': [1,2], 'salary': [5000,6000]})
result = pd.merge(left3, right3, left_on='id', right_on='emp_id')

# ----- 重复列名的后缀控制 -----
left4 = pd.DataFrame({'id': [1,2], 'value': [10,20]})
right4 = pd.DataFrame({'id': [1,2], 'value': [30,40]})
result = pd.merge(left4, right4, on='id', suffixes=('_left', '_right'))
#    id  value_left  value_right
# 0   1          10           30
# 1   2          20           40
```

**连接方式总结**

| how     | 说明                      |
| ------- | ------------------------- |
| `inner` | 只保留两边都存在的键      |
| `left`  | 保留左表所有键            |
| `right` | 保留右表所有键            |
| `outer` | 保留所有键，无匹配填充NaN |

### 1.3 `df.join()` – 基于索引的连接

`join` 是基于**索引**进行连接的简便方法，默认左连接。

```python
df_left = pd.DataFrame({'A': [1,2]}, index=['a','b'])
df_right = pd.DataFrame({'B': [3,4]}, index=['a','c'])

# 默认左连接，基于索引
result = df_left.join(df_right)
#    A    B
# a  1  3.0
# b  2  NaN

# 内连接
result = df_left.join(df_right, how='inner')

# 指定右表的列作为连接键（而不是索引）
df_right2 = pd.DataFrame({'key': ['a','b'], 'C': [5,6]})
result = df_left.join(df_right2.set_index('key'), on=None)  # 需要先设置索引
```

### 1.4 合并方法对比

| 方法     | 合并依据         | 适用场景                       |
| -------- | ---------------- | ------------------------------ |
| `concat` | 轴（行或列）     | 简单拼接，不基于公共列         |
| `merge`  | 列值（类似 SQL） | 需要按共同列进行复杂连接       |
| `join`   | 索引             | 基于行索引合并，多用于时间序列 |

---

## 2 分组聚合（GroupBy）

### 2.1 分组聚合的基本流程

**拆分-应用-组合**（Split-Apply-Combine）：

1. **split**：根据一个或多个键将数据拆分为多个组
2. **apply**：对每个组应用函数（聚合、转换、过滤）
3. **combine**：将结果组合为新的数据结构

```python
# 准备示例数据
df = pd.DataFrame({
    '部门': ['技术部', '市场部', '技术部', '市场部', '财务部'],
    '姓名': ['张三', '李四', '王五', '赵六', '周七'],
    '工资': [8000, 6000, 9000, 6500, 7000],
    '工龄': [3, 2, 5, 1, 4]
})

# ----- 单列分组，单列聚合 -----
grouped = df.groupby('部门')['工资']
print(grouped.mean())      # 各部门平均工资
print(grouped.sum())       # 各部门工资总和
print(grouped.max())       # 各部门最高工资

# ----- 单列分组，多列聚合 -----
result = df.groupby('部门')[['工资', '工龄']].mean()

# ----- 多列分组 -----
result = df.groupby(['部门', '工龄'])['工资'].sum()

# ----- 多个聚合函数同时使用（agg）-----
result = df.groupby('部门')['工资'].agg(['mean', 'sum', 'max', 'min', 'count'])
#            mean   sum   max  min  count
# 部门
# 技术部    8500  17000  9000  8000    2
# 市场部    6250  12500  6500  6000    2
# 财务部    7000   7000  7000  7000    1

# ----- 为聚合结果自定义列名 -----
result = df.groupby('部门').agg(
    平均工资=('工资', 'mean'),
    总工资=('工资', 'sum'),
    最高工龄=('工龄', 'max')
)
```

### 2.2 使用字典对不同列应用不同聚合函数

```python
result = df.groupby('部门').agg({
    '工资': ['mean', 'sum'],
    '工龄': ['max', 'min']
})
```

### 2.3 遍历分组

```python
for name, group in df.groupby('部门'):
    print(f"部门: {name}")
    print(group)
    print("---")
```

### 2.4 分组后转换（transform）

`transform` 返回与原始数据相同形状的结果，常用于组内标准化、填充组内均值等。

```python
# 计算各部门工资的组内均值，并将原工资替换为离差（工资 - 组内均值）
df['工资离差'] = df.groupby('部门')['工资'].transform(lambda x: x - x.mean())

# 用组内均值填充缺失值
df['工资_filled'] = df.groupby('部门')['工资'].transform(lambda x: x.fillna(x.mean()))
```

### 2.5 分组后过滤（filter）

根据组的属性筛选组，返回满足条件的**所有行**。

```python
# 只保留平均工资大于 6500 的部门
result = df.groupby('部门').filter(lambda x: x['工资'].mean() > 6500)
```

### 2.6 分组后应用自定义函数（apply）

`apply` 是最灵活的方法，可以对每个组做任意操作。

```python
# 返回每组前两条记录
def top_two(group):
    return group.head(2)
result = df.groupby('部门').apply(top_two)

# 返回每组工资最高的记录
def top_salary(group):
    return group.nlargest(1, '工资')
result = df.groupby('部门').apply(top_salary)
```

### 2.7 分组聚合常用函数

| 函数                 | 说明              |
| -------------------- | ----------------- |
| `mean()`             | 均值              |
| `sum()`              | 求和              |
| `count()`            | 非空值个数        |
| `size()`             | 总行数（含NaN）   |
| `min()` / `max()`    | 最小值/最大值     |
| `std()` / `var()`    | 标准差/方差       |
| `first()` / `last()` | 第一个/最后一个值 |
| `nunique()`          | 去重后计数        |
| `quantile()`         | 分位数            |

### 2.8 透视表（pivot_table）

类似 Excel 的数据透视表，是 `groupby` 的高级封装。

```python
# 准备示例：销售数据
sales = pd.DataFrame({
    '日期': ['2024-01-01', '2024-01-01', '2024-01-02', '2024-01-02'],
    '产品': ['A', 'B', 'A', 'B'],
    '销售额': [100, 150, 200, 180],
    '数量': [2, 3, 4, 3]
})

# 基本透视表：行=日期，列=产品，值=销售额总和
pivot = pd.pivot_table(sales, values='销售额', index='日期', columns='产品', aggfunc='sum')
# 产品          A      B
# 日期
# 2024-01-01  100    150
# 2024-01-02  200    180

# 多级索引、多值、多聚合函数
pivot2 = pd.pivot_table(sales, 
                        values=['销售额', '数量'],
                        index='日期',
                        columns='产品',
                        aggfunc={'销售额': 'sum', '数量': 'mean'})

# 重置透视表索引（转为普通 DataFrame）
pivot_reset = pivot.reset_index()

# 交叉表（crosstab）：专门用于频数统计
cross = pd.crosstab(sales['日期'], sales['产品'])
```

---

## 3 时间序列（Time Series）

### 3.1 日期时间类型转换

```python
# 将字符串列转为 datetime 类型
df['date'] = pd.to_datetime(df['date'])
# 指定格式（加快速度，避免歧义）
df['date'] = pd.to_datetime(df['date'], format='%Y-%m-%d %H:%M:%S')

# 获取日期时间分量
df['year'] = df['date'].dt.year
df['month'] = df['date'].dt.month
df['day'] = df['date'].dt.day
df['hour'] = df['date'].dt.hour
df['weekday'] = df['date'].dt.weekday   # 周一=0, 周日=6
df['quarter'] = df['date'].dt.quarter
df['week_of_year'] = df['date'].dt.isocalendar().week
```

### 3.2 生成日期范围

```python
# 生成固定频率日期范围
dates = pd.date_range(start='2024-01-01', end='2024-01-10', freq='D')
# 结果：DatetimeIndex(['2024-01-01', ..., '2024-01-10'], freq='D')

# 常见频率：'D'日, 'B'工作日, 'H'小时, 'T'分钟, 'S'秒, 'W'周, 'M'月末, 'MS'月初
dates_hourly = pd.date_range('2024-01-01', periods=24, freq='H')
dates_monthly = pd.date_range('2023-01-01', periods=12, freq='M')

# 生成指定数量的日期
dates = pd.date_range('2024-01-01', periods=10, freq='D')
```

### 3.3 将日期设为索引

```python
# 设置 datetime 列为索引
df.set_index('date', inplace=True)

# 按时间索引选择数据
df['2024']                    # 选择2024全年
df['2024-01']                 # 选择2024年1月
df['2024-01-01':'2024-01-05'] # 切片
```

### 3.4 重采样（resample）

改变时间序列的频率，进行降采样（高频→低频）或升采样（低频→高频）。

```python
# 创建示例：日数据
rng = pd.date_range('2024-01-01', periods=30, freq='D')
ts = pd.Series(np.random.randn(30), index=rng)

# ----- 降采样：从天降到月 -----
ts_monthly_mean = ts.resample('M').mean()     # 月均值
ts_monthly_sum = ts.resample('M').sum()       # 月总和
ts_monthly_first = ts.resample('M').first()   # 每月第一天

# 多种聚合
ts_monthly_agg = ts.resample('M').agg(['mean', 'sum', 'max'])

# ----- 升采样：从月升到天（产生缺失值）-----
ts_daily = ts_monthly_mean.resample('D').asfreq()   # 填充NaN
# 填充方法：向前填充
ts_daily_ffill = ts_monthly_mean.resample('D').ffill()
# 向后填充
ts_daily_bfill = ts_monthly_mean.resample('D').bfill()
# 线性插值
ts_daily_interp = ts_monthly_mean.resample('D').interpolate(method='linear')
```

**常用重采样频率**

| 频率代码         | 说明           |
| ---------------- | -------------- |
| `'D'`            | 日历日         |
| `'B'`            | 工作日         |
| `'H'`            | 小时           |
| `'T'` 或 `'min'` | 分钟           |
| `'S'`            | 秒             |
| `'W'`            | 周（周日结束） |
| `'W-MON'`        | 以周一结束     |
| `'M'`            | 月末           |
| `'MS'`           | 月初           |
| `'Q'`            | 季末           |
| `'A'`            | 年末           |
| `'BM'`           | 业务月结束     |

### 3.5 滑动窗口（rolling）

计算滚动统计量，常用于平滑时间序列。

```python
# 创建示例
ts = pd.Series(np.random.randn(100), index=pd.date_range('2024-01-01', periods=100, freq='D'))

# 7天滚动平均值
rolling_mean = ts.rolling(window=7).mean()
# 14天滚动标准差
rolling_std = ts.rolling(window=14).std()

# 自定义窗口函数
rolling_custom = ts.rolling(window=5).apply(lambda x: x.max() - x.min())

# 中心化窗口（窗口居中）
rolling_center = ts.rolling(window=7, center=True).mean()

# 加权移动平均（需自定义，通常用 ewm）
ewm_mean = ts.ewm(span=7, adjust=False).mean()   # 指数加权移动平均
```

### 3.6 位移与差分

```python
# 向前移位（前一天的值）
ts_shift = ts.shift(1)      # 前一天
ts_shift_back = ts.shift(-1) # 后一天

# 差分（今天减前一天）
ts_diff1 = ts.diff(1)       # 一阶差分
ts_diff2 = ts.diff(2)       # 二阶差分（间隔2）

# 百分比变化
ts_pct_change = ts.pct_change(1)
```

### 3.7 时区处理

```python
# 创建带时区的时间戳
ts = pd.Timestamp('2024-01-01 12:00:00', tz='Asia/Shanghai')
# 转换为其他时区
ts_utc = ts.tz_convert('UTC')

# 将 Series 转换为特定时区
s = pd.Series(pd.date_range('2024-01-01', periods=3, freq='D'))
s_local = s.dt.tz_localize('UTC')           # 赋予时区
s_converted = s_local.dt.tz_convert('Asia/Shanghai')
```

---

## 4 案例：时间序列数据分析流程

```python
# 1. 读取数据并解析日期列
df = pd.read_csv('sales.csv', parse_dates=['order_date'], index_col='order_date')

# 2. 确保索引是 DatetimeIndex
df.index = pd.to_datetime(df.index)

# 3. 按月份重采样聚合
monthly_sales = df['amount'].resample('M').sum()

# 4. 计算7日滚动均值平滑趋势
df['sales_ma7'] = df['amount'].rolling(window=7).mean()

# 5. 计算同比（与去年同期比较）
df['sales_yoy'] = df['amount'] / df['amount'].shift(365) - 1

# 6. 提取月份特征用于分组分析
df['month'] = df.index.month
monthly_avg = df.groupby('month')['amount'].mean()

# 7. 绘制趋势图（需要 matplotlib）
import matplotlib.pyplot as plt
monthly_sales.plot(title='Monthly Sales')
plt.show()
```

---

## 5 小结

- **数据合并**：
  - `concat`：简单拼接（行/列）
  - `merge`：基于列的 SQL 风格连接（inner/left/right/outer）
  - `join`：基于索引的连接
- **分组聚合**：
  - `groupby` 拆分后可使用 `agg`、`transform`、`filter`、`apply`
  - `pivot_table` 提供类似 Excel 透视表的功能
- **时间序列**：
  - 日期列转换：`pd.to_datetime()`，通过 `.dt` 访问器提取分量
  - 日期范围：`pd.date_range()`
  - 重采样：`.resample()`（降采样/升采样）
  - 滑动窗口：`.rolling()` 计算滚动统计
  - 位移/差分：`.shift()`、`.diff()`、`.pct_change()`

---

## 第五部分：数据可视化、性能优化与高级应用

### 学习目标

- 目标
  - 掌握 Pandas 内置的绘图方法（基于 Matplotlib）
  - 了解数据可视化常用图表类型（折线图、柱状图、直方图、散点图、箱线图）
  - 学会性能优化技巧（向量化、数据类型优化、使用 eval/query）
  - 了解高级应用：分类数据、管道、内存优化等

---

## 1 数据可视化（基于 Matplotlib）

Pandas 的 `.plot()` 方法是对 Matplotlib 的封装，可以快速绘制常用图表。

### 1.1 基础设置

```python
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt

# 设置中文显示（避免乱码）
plt.rcParams['font.sans-serif'] = ['SimHei']      # 中文字体
plt.rcParams['axes.unicode_minus'] = False        # 正常显示负号

# 准备工作数据
df = pd.DataFrame({
    '日期': pd.date_range('2024-01-01', periods=100, freq='D'),
    '销售额': np.random.randint(1000, 5000, 100),
    '成本': np.random.randint(500, 3000, 100),
    '利润': np.random.randint(200, 2000, 100)
})
df.set_index('日期', inplace=True)

# 基础绘图
df['销售额'].plot()          # 折线图
plt.title('每日销售额趋势')
plt.show()
```

### 1.2 常用图表类型

| 图表类型     | 方法                            | 适用场景           |
| ------------ | ------------------------------- | ------------------ |
| 折线图       | `df.plot(kind='line')`          | 时间序列、趋势分析 |
| 柱状图       | `df.plot(kind='bar')`           | 类别对比           |
| 水平柱状图   | `df.plot(kind='barh')`          | 类别对比（横向）   |
| 直方图       | `df.plot(kind='hist')`          | 数值分布           |
| 箱线图       | `df.plot(kind='box')`           | 查看异常值和分布   |
| 散点图       | `df.plot(kind='scatter', x, y)` | 两变量关系         |
| 面积图       | `df.plot(kind='area')`          | 累积趋势           |
| 饼图         | `df.plot(kind='pie', y=col)`    | 占比（少量类别）   |
| 密度图       | `df.plot(kind='kde')`           | 连续分布           |
| 六边形分箱图 | `df.plot(kind='hexbin', x, y)`  | 大数据散点图替代   |

```python
# 柱状图（聚合后）
monthly = df.resample('M').sum()
monthly['销售额'].plot(kind='bar', color='skyblue')
plt.title('月度销售额')
plt.xlabel('月份')
plt.ylabel('销售额')
plt.xticks(rotation=45)

# 直方图
df['销售额'].plot(kind='hist', bins=30, alpha=0.7, edgecolor='black')
plt.title('销售额分布')

# 箱线图
df[['销售额', '成本', '利润']].plot(kind='box')
plt.title('数据分布箱线图')

# 散点图（销售额 vs 利润）
df.plot(kind='scatter', x='销售额', y='利润', alpha=0.5)
plt.title('销售额与利润关系')
```

### 1.3 多子图与布局

```python
# 多列分别绘图（subplots=True）
df[['销售额', '成本', '利润']].plot(subplots=True, layout=(3,1), figsize=(8,10))
plt.tight_layout()

# 多图并列
fig, axes = plt.subplots(2, 2, figsize=(12, 8))
df['销售额'].plot(ax=axes[0,0], title='销售额')
df['成本'].plot(ax=axes[0,1], title='成本', color='orange')
df['利润'].hist(ax=axes[1,0], bins=20)
df.boxplot(ax=axes[1,1])
plt.tight_layout()
```

### 1.4 自定义样式

```python
# 使用样式表
plt.style.use('ggplot')      # 可选：'seaborn', 'fivethirtyeight', 'bmh'

# 链式调用设置样式
df['销售额'].plot(
    kind='line',
    linestyle='--',
    marker='o',
    color='red',
    linewidth=2,
    markersize=4,
    alpha=0.8,
    figsize=(10,4),
    grid=True
)
plt.legend(['销售额'])
```

### 1.5 其他可视化注意点

- 大数据量时，不要用散点图，改用 `hexbin` 或采样。
- 饼图不宜超过 5-6 个扇形；用柱状图更清晰。
- 箱线图非常适合发现离群值。
- 时间序列可以使用 `resample()` 降采样后绘图提高可读性。

---

## 2 性能优化

### 2.1 向量化操作（Vectorization）

**黄金法则**：避免 `for` 循环和 `.apply()`（尤其自定义函数），优先使用向量化操作。

```python
# 慢：Python 循环
result = []
for i in range(len(df)):
    result.append(df.loc[i, 'col1'] + df.loc[i, 'col2'])

# 快：向量化运算
df['sum'] = df['col1'] + df['col2']

# 中等：.apply()（某些场景可用，但不如原生向量化快）
df['sum'] = df.apply(lambda row: row['col1'] + row['col2'], axis=1)
```

### 2.2 数据类型优化（内存节省）

```python
# 查看内存占用
df.info(memory_usage='deep')
df.memory_usage(deep=True).sum()

# 优化整数：根据实际范围选择更小的类型
df['age'] = df['age'].astype('int16')        # 原本 int64 -> 内存减少75%
# 优化浮点数
df['score'] = df['score'].astype('float32')  # 原本 float64 -> 减半

# 优化分类数据（低基数，如性别、省份等）
df['gender'] = df['gender'].astype('category')  # 可以大幅节省内存

# 使用 pd.to_numeric 带 errors='coerce' 安全转换
df['col'] = pd.to_numeric(df['col'], errors='coerce')

# 使用 convert_dtypes 自动优化
df = df.convert_dtypes()
```

### 2.3 使用 `eval()` 和 `query()` 加速表达式

适用于大 DataFrame（> 10万行）时的复杂表达式运算。

```python
# 传统方式（产生中间临时数组）
df['result'] = (df['a'] + df['b']) / (df['c'] * df['d'])

# eval 方式（减少临时数组，更快）
df['result'] = df.eval('(a + b) / (c * d)')

# query 方式进行筛选（比 df[条件] 更快）
result = df.query('age > 30 and salary < 5000')
# 等价于 df[(df['age'] > 30) & (df['salary'] < 5000)]
```

### 2.4 分块读取大文件

```python
# 分块读取 CSV，每次处理一块
chunk_size = 10000
chunks = []
for chunk in pd.read_csv('large_file.csv', chunksize=chunk_size):
    # 处理每个块
    filtered = chunk[chunk['col'] > 0]
    chunks.append(filtered)
df_result = pd.concat(chunks)

# 只读取需要的列（usecols）
df = pd.read_csv('large_file.csv', usecols=['col1', 'col2', 'col3'])
```

### 2.5 `inplace` 参数的慎用

```python
# 官方建议：inplace 并不总是更快，且可能破坏链式操作
# 大多时候直接赋值即可
df = df.dropna()          # 推荐
# df.dropna(inplace=True)  # 不推荐

# 原因：inplace 操作无法链式调用，且内部仍需复制
```

### 2.6 其他性能建议

- **索引优化**：频繁筛选的列设为索引 `df.set_index('col', inplace=True)`
- **避免 `chained indexing`**：使用 `.loc` 而非 `df[df['A']>0]['B']`
- **使用 `numba`** 对循环加速（需安装 numba）
- **减少不必要的复制**：`.copy()` 只在对切片要独立修改时使用

---

## 3 高级应用

### 3.1 分类数据（Categorical）

将重复字符串列转为 `category` 类型，可以节省内存并加速某些操作。

```python
# 创建分类数据
df['city'] = pd.Categorical(df['city'], categories=['北京','上海','广州','深圳'])

# 转换为 category
df['city'] = df['city'].astype('category')

# 查看分类信息
print(df['city'].cat.categories)   # 类别列表
print(df['city'].cat.codes)        # 内部编码

# 重命名类别
df['city'] = df['city'].cat.rename_categories({'BJ':'Beijing', 'SH':'Shanghai'})

# 添加新类别
df['city'] = df['city'].cat.add_categories(['成都'])

# 删除未使用的类别（节省内存）
df['city'] = df['city'].cat.remove_unused_categories()
```

### 3.2 管道（Pipe）

管道允许将多个函数串联起来，提高代码可读性。

```python
def clean_data(df):
    df = df.dropna(subset=['id'])
    df = df[df['age'] > 0]
    return df

def add_features(df):
    df['age_group'] = pd.cut(df['age'], bins=[0,18,35,60,100], labels=['少年','青年','中年','老年'])
    return df

def aggregate(df):
    return df.groupby('age_group')['score'].mean()

# 传统方式
df_clean = clean_data(df)
df_with_features = add_features(df_clean)
result = aggregate(df_with_features)

# 管道方式（可读性更好）
result = (df.pipe(clean_data)
            .pipe(add_features)
            .pipe(aggregate))
```

### 3.3 窗口函数扩展（Window）

除了 `.rolling()`，还有 `.expanding()`、`.ewm()`

```python
# 扩展窗口（从开始到当前位置的累计统计）
df['cumsum'] = df['value'].expanding().sum()
df['cummax'] = df['value'].expanding().max()

# 指数加权移动平均（更重视近期数据）
df['ewm_07'] = df['value'].ewm(span=7, adjust=False).mean()
```

### 3.4 内存优化技巧

```python
# 1. 使用更小的整数/浮点类型
def optimize_dtypes(df):
    for col in df.columns:
        col_type = df[col].dtype
        if col_type != 'object':
            c_min = df[col].min()
            c_max = df[col].max()
            if str(col_type)[:3] == 'int':
                if c_min > np.iinfo(np.int8).min and c_max < np.iinfo(np.int8).max:
                    df[col] = df[col].astype(np.int8)
                elif c_min > np.iinfo(np.int16).min and c_max < np.iinfo(np.int16).max:
                    df[col] = df[col].astype(np.int16)
                # ... 以此类推
            else:
                # 浮点数类似处理
                pass
    return df

# 2. 处理 object 列：若为低基数分类，转为 category
for col in df.select_dtypes(include=['object']).columns:
    if df[col].nunique() / len(df) < 0.5:   # 唯一值少于一半
        df[col] = df[col].astype('category')
```

### 3.5 样式化输出（Styling）

```python
# 高亮最大值
styled = df.style.highlight_max(color='lightgreen', axis=0)
styled

# 设置格式
styled = df.style.format({'销售额': '¥{:.2f}', '利润率': '{:.2%}'})

# 条件格式
def highlight_high(x):
    return ['background-color: yellow' if v > x.mean() else '' for v in x]
df.style.apply(highlight_high, subset=['销售额'])

# 保存样式到 Excel
df.style.to_excel('styled.xlsx', engine='openpyxl')
```

### 3.6 与其它库的集成

```python
# NumPy 无缝衔接
df['new'] = np.log(df['col'])

# Scikit-learn 预处理
from sklearn.preprocessing import StandardScaler
scaler = StandardScaler()
scaled = scaler.fit_transform(df[['col1','col2']])

# 与 Matplotlib/Seaborn 配合
import seaborn as sns
sns.heatmap(df.corr(), annot=True)
```

### 3.7 数据采样与打乱

```python
# 随机采样 n 行
sample = df.sample(n=100)
# 采样比例
sample = df.sample(frac=0.1)
# 打乱顺序（无需替换）
shuffled = df.sample(frac=1, random_state=42).reset_index(drop=True)
```

---

## 4 综合案例：端到端数据处理流程

```python
# 1. 读取数据（优化类型）
df = pd.read_csv('large_sales.csv', parse_dates=['date'], dtype={'customer_id': 'int32'})

# 2. 数据清洗
df.drop_duplicates(inplace=True)
df['sales'] = pd.to_numeric(df['sales'], errors='coerce')
df.dropna(subset=['sales'], inplace=True)

# 3. 特征工程
df['year_month'] = df['date'].dt.to_period('M')
df['sales_log'] = np.log1p(df['sales'])

# 4. 分组聚合（使用 pipe）
result = (df.groupby(['year_month', 'product_id'])
          .agg(total_sales=('sales', 'sum'),
               avg_sales=('sales', 'mean'),
               order_count=('order_id', 'nunique'))
          .reset_index())

# 5. 可视化
result.pivot(index='year_month', columns='product_id', values='total_sales').plot(kind='bar', stacked=True)
plt.title('各产品月度销售额')
plt.tight_layout()
plt.savefig('sales_report.png')

# 6. 导出
result.to_parquet('sales_agg.parquet')   # 更高效的保存格式
```

---

## 5 小结

- **数据可视化**：
  - `.plot(kind='xxx')` 快速绘图
  - 常用：`line`、`bar`、`hist`、`box`、`scatter`、`area`
  - 可结合 Matplotlib 自定义：`plt.title()`、`plt.xlabels()` 等
- **性能优化**：
  - 向量化演算取代循环
  - 数据类型精简（`int16`、`float32`、`category`）
  - `eval()`/`query()` 加速复杂表达式
  - 大文件分块读取、只读取需要的列
- **高级应用**：
  - 分类数据（`category`）内存与速度优势
  - `pipe` 构建可读的数据处理流水线
  - 样式化输出（`df.style`）
  - 与 NumPy、Scikit-learn 等库无缝集成

---
