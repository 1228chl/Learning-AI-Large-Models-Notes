## 一、Pandas 框架概述

### 1.1 什么是 Pandas？

- **定义**：Pandas 是 Python 的一个第三方库，专为**结构化数据**处理而设计，提供高效、灵活的数据清洗、处理和分析工具。
- **核心优势**：
    - **基于** **NumPy**：底层使用 NumPy 数组，运算速度快。
    - **缺失值处理**：内置丰富的缺失值检测与填充方法。
    - **分组/聚合/转换**：强大而灵活的分组操作（类似 SQL 的 GROUP BY）。
    - **数据整合**：支持合并、连接、拼接多种数据源。

---

### 1.2 适用场景

- 单机数据量较大，Excel 无法流畅处理时。
- 数据清洗、特征工程、探索性数据分析（EDA）。
- 大数据 ETL 流程中作为预处理环节。

---

### 1.3 安装与环境

```Bash
pip install pandas
# 或使用清华镜像加速
pip install -i https://pypi.tuna.tsinghua.edu.cn/simple pandas
```

> **注意**：Anaconda 已预装 Pandas，可直接使用 Jupyter Notebook。

---
## 二、Pandas 核心数据结构与数据类型

### 2.1 数据结构层级

Pandas 主要包含两种数据结构：**Series** 和 **DataFrame**。

- **DataFrame**：二维表格，类似 Excel 或 SQL 表，包含行索引和列索引。
- **Series**：一维数组，是 DataFrame 的列（或行），每个 Series 带有索引。

```Plain
DataFrame
├── 索引列（行索引） → 索引名、索引值、行号
└── 数据列
    ├── 列名
    └── 列值（Series）
```


---

### 2.2 Series 对象

#### 2.2.1 创建 Series

```Python
import pandas as pd
import numpy as np

# 从列表创建（默认整数索引）
s1 = pd.Series([1, 2, 3])

# 自定义索引
s2 = pd.Series([1, 2, 3], index=['A', 'B', 'C'])

# 从字典创建（键为索引）
s3 = pd.Series({'A':1, 'B':2, 'C':3})

# 从 NumPy 创建
s4 = pd.Series(np.arange(5))
```


---

#### 2.2.2 Series 属性与索引

```Python
s = pd.Series([10, 20, 30], index=['x', 'y', 'z'])
print(s.index)      # Index(['x', 'y', 'z'], dtype='object')
print(s.values)     # [10 20 30]
print(s['y'])       # 20
```


---

### 2.3 DataFrame 对象

#### 2.3.1 创建 DataFrame

**方式一：字典 + 列表**

```Python
data = {
    '日期': ['2021-08-21', '2021-08-22', '2021-08-23'],
    '温度': [25, 26, 27],
    '湿度': [81, 50, 56]
}
df = pd.DataFrame(data)
```


**方式二：列表 + 元组**

```Python
data = [
    ('2021-08-21', 25, 81),
    ('2021-08-22', 26, 50),
    ('2021-08-23', 27, 56)
]
df = pd.DataFrame(data, columns=['日期', '温度', '湿度'], index=['row1','row2','row3'])
```


**方式三：NumPy 数组 + 指定行列索引**

```Python
score = np.random.randint(40, 100, (10, 5))
subjects = ['语文','数学','英语','政治','体育']
students = [f'同学{i}' for i in range(10)]
df = pd.DataFrame(score, columns=subjects, index=students)
```


---
#### 2.3.2 DataFrame 常用属性

| 属性        | 说明          | 示例                     |
| --------- | ----------- | ---------------------- |
| `shape`   | 形状 (行数, 列数) | `(10, 5)`              |
| `index`   | 行索引列表       | `Index(['同学0',...])`   |
| `columns` | 列索引列表       | `Index(['语文',...])`    |
| `values`  | 底层 NumPy 数组 | `array([[92,55,...]])` |
| `T`       | 转置（行列互换）    | `df.T`                 |
| `dtypes`  | 各列数据类型      | `温度 int64`             |


---

#### 2.3.3 DataFrame 常用方法

| 方法           | 说明               |
| ------------ | ---------------- |
| `head(n)`    | 返回前 n 行，默认 5     |
| `tail(n)`    | 返回后 n 行，默认 5     |
| `info()`     | 查看基本信息（列类型、非空数量） |
| `describe()` | 生成描述性统计摘要        |

---

### 2.4 索引的设置与修改

**修改行索引**（必须整体赋值）：

```Python
df.index = ['新索引1', '新索引2', ...]   # 长度必须一致
```


**重置索引**：

```Python
df.reset_index(drop=False)   # drop=False 保留原索引为新列
df.reset_index(drop=True)    # 丢弃原索引，生成默认整数索引
```


**将某一列设为新索引**：

```Python
df.set_index('列名', drop=True)   # drop=True 删除该列
```


---

### 2.5 Pandas 数据类型速查表

| Pandas 类型    | 说明   | Python 对应类型          |
| ------------ | ---- | -------------------- |
| `object`     | 字符串  | `str`                |
| `int64`      | 整数   | `int`                |
| `float64`    | 浮点数  | `float`              |
| `datetime64` | 日期时间 | `datetime.datetime`  |
| `timedelta`  | 时间差  | `datetime.timedelta` |
| `category`   | 分类数据 | 无（自定义）               |
| `bool`       | 布尔   | `bool`               |

> **拓展**：`category` 类型可节省内存，适合取值有限的列（如性别、星期几）。


---
## 三、Pandas 基本数据操作

### 3.1 索引取值（三种方式）


**直接索引**（先列后行）：

```Python
df['列名']['行标签']        # 先列后行，不推荐，易混淆
```


**loc 索引**（基于标签，先行后列）：

```Python
df.loc['行标签', '列名']                # 单个值
df.loc['行标签1':'行标签2', '列名']     # 切片（包含端点）
```

  
**iloc 索引**（基于整数下标，先行后列）：

```Python
df.iloc[0, 1]                # 第一行第二列
df.iloc[:3, :5]              # 前3行，前5列
```


---
### 3.2 赋值操作

```Python
df['新列'] = 值                  # 新增或修改整列
df.列名 = 值                     # 等价形式（列名不能有空格）
```


---

### 3.3 排序

**按值排序**：

```Python
df.sort_values(by='列名', ascending=False)   # 降序
df.sort_values(by=['列1', '列2'])             # 多列排序
```


**按索引排序**：

```Python
df.sort_index(ascending=True)
```


**Series 排序**：

```Python
series.sort_values(ascending=False)
series.sort_index()
```


---
## 四、DataFrame 运算

### 4.1 算术运算

```Python
df['列名'].add(10)    # 每个元素 +10
df['列名'].sub(5)     # 每个元素 -5
# 也可直接使用运算符：df['列名'] + 10
```


---
### 4.2 逻辑筛选

**使用逻辑运算符**：

```Python
# 筛选开盘价大于23的股票数据
df[df['open'] > 23]

# 复合条件： & 表示且，| 表示或
df[(df['open'] > 23) & (df['open'] < 24)]
```


**使用查询函数** **`query()`**：

```Python
df.query("open > 23 and open < 24")
```


**使用** **`isin()`**：

```Python
df[df['open'].isin([23.53, 23.85])]
```


### 4.3 统计运算

#### 常用统计函数

| 函数         | 说明      |
| ---------- | ------- |
| `min()`    | 最小值     |
| `max()`    | 最大值     |
| `mean()`   | 平均值     |
| `median()` | 中位数     |
| `std()`    | 标准差     |
| `var()`    | 方差      |
| `sum()`    | 总和      |
| `idxmax()` | 最大值所在索引 |
| `idxmin()` | 最小值所在索引 |


**指定轴**：`axis=0`（默认）表示跨行（列方向），`axis=1` 表示跨列（行方向）。


```Python
df.max(axis=0)          # 每列最大值
df.mean(axis=1)         # 每行平均值
```

#### 累计统计函数

| 函数          | 作用       |
| ----------- | -------- |
| `cumsum()`  | 累计和（前缀和） |
| `cummax()`  | 累计最大值    |
| `cummin()`  | 累计最小值    |
| `cumprod()` | 累计乘积     |

```Python
df['p_change'].cumsum()    # 按时间累积收益率
```

> **拓展**：累积统计常用于分析趋势，例如股票累计收益、销售额累计等。

---
### 4.4 自定义运算 `apply()`

```Python
# 对每列应用 lambda 函数
df.apply(lambda x: x.max() - x.min())

# 对每行应用：axis=1
df.apply(lambda row: row['close'] - row['open'], axis=1)
```

---

## 五、文件读取与存储

### 5.1 CSV 文件

**读取**：

```Python
pd.read_csv('file.csv', sep=',', usecols=['col1','col2'], encoding='utf-8')
```

**保存**：

```Python
df.to_csv('out.csv', index=False, columns=['col1'], mode='w')
```

---

### 5.2 JSON 文件

**读取**（常见格式 records）：

```Python
pd.read_json('data.json', orient='records', lines=True)
```

- `orient` 指定 JSON 结构，常用 `'records'`（每行一个对象）或 `'index'`。
- `lines=True` 表示每行一个 JSON 对象。

**保存**：

```Python
df.to_json('out.json', orient='records', lines=True)
```

---

### 5.3 MySQL 数据库

> 需要安装 pymysql 和 sqlalchemy。

```Python
from sqlalchemy import create_engine

# 创建引擎
engine = create_engine('mysql+pymysql://user:password@host:port/db?charset=utf8')

# 写入数据库
df.to_sql('table_name', engine, index=False, if_exists='append')

# 从数据库读取
df = pd.read_sql('SELECT * FROM table_name', engine)
```

---
## 六、高级处理 – 缺失值处理

### 6.1 缺失值检测

```Python
pd.isnull(df)          # 返回布尔 DataFrame
pd.notnull(df)         # 取反

# 判断是否存在缺失值
np.any(pd.isnull(df))  # 只要有一个缺失值返回 True
np.all(pd.notnull(df)) # 只有全部非空返回 True
```

---

### 6.2 缺失值处理方式

**方式一：删除缺失值**

```Python
df.dropna(axis=0, how='any', inplace=False)
# axis=0 删除行，how='any' 只要有一个缺失就删除
```

**方式二：填充缺失值**

```Python
# 用常数填充
df.fillna(0, inplace=True)

# 用列均值填充
df['col'] = df['col'].fillna(df['col'].mean())

# 用前向/后向填充
df.fillna(method='ffill')   # 用上一个有效值填充
```

**异常情况**：如果缺失值用 `?` 或其他占位符表示，先替换为 `np.nan`：

```Python
df.replace('?', np.nan, inplace=True)
```

---
## 七、高级处理 – 数据合并

### 7.1 `concat` – 沿轴拼接

```Python
pd.concat([df1, df2], axis=0)   # 垂直拼接（行增加）
pd.concat([df1, df2], axis=1)   # 水平拼接（列增加）
```

---

### 7.2 `merge` – 数据库风格连接

```Python
pd.merge(left, right, how='inner', on='key')
pd.merge(left, right, left_on='左键', right_on='右键')
```

**连接方式**：

| how       | 对应 SQL     | 说明         |
| --------- | ---------- | ---------- |
| `'inner'` | INNER JOIN | 只保留键值都存在的行 |
| `'left'`  | LEFT JOIN  | 保留左表所有行    |
| `'right'` | RIGHT JOIN | 保留右表所有行    |
| `'outer'` | FULL JOIN  | 保留左右表所有行   |

> **拓展**：熟悉 SQL 的同学可以对比理解，Pandas 的 merge 非常灵活。

---
## 八、高级处理 – 数据分组聚合

### 8.1 `groupby` 基本用法

```Python
# 单列分组
grouped = df.groupby('gender_group')

# 多列分组
grouped = df.groupby(['city', 'channel'])

# 查看分组内容
grouped.first()          # 每组第一条数据
grouped.get_group(('Female', '线上'))  # 获取特定组
```

---

### 8.2 分组聚合 – `agg()`

```Python
df.groupby(['city', 'channel']).agg({
    'revenue': 'mean',
    'unit_cost': 'sum',
    'customer': ['count', 'sum']   # 多函数
})
```

---

### 8.3 分组过滤 – `filter()`

```Python
# 保留每组 revenue 平均值大于 200 的行
df.groupby('city').filter(lambda x: x['revenue'].mean() > 200)
```

> **拓展**：分组后还可用 `transform()` 将聚合结果广播回原 DataFrame，常用于特征工程。

---
## 九、高级处理 – 交叉表与透视表

### 9.1 交叉表 `crosstab`

- **作用**：统计两列数据的频数分布（类似 Excel 数据透视表的计数）。

```Python
pd.crosstab(df['性别'], df['购买'])
```

---

### 9.2 透视表 `pivot_table`

- **作用**：对某一列进行聚合，以另一列作为行索引，第三列作为列索引。

```Python
pd.pivot_table(df, values='金额', index='性别', columns='购买', aggfunc='mean')
```

等价于：

```Python
df.pivot_table(index='性别', columns='购买', values='金额', aggfunc='mean')
```


**常用参数**：

- `values`：需要聚合的数值列
- `index`：行分组键
- `columns`：列分组键
- `aggfunc`：聚合函数（默认 `'mean'`）
- `fill_value`：填充缺失值

> **示例**：探究股票涨跌与星期几的关系：
>
> ```Python
> pd.crosstab(df['week'], df['涨跌'])
> ```

  

---

  

## 十、总结与学习建议

### 10.1 核心知识点回顾

| 模块    | 关键点                                               |
| ----- | ------------------------------------------------- |
| 数据结构  | Series（一维带标签数组）、DataFrame（二维表格）                   |
| 索引    | loc（标签）、iloc（位置）、布尔索引、query                       |
| 缺失值   | isnull、dropna、fillna                              |
| 合并    | concat（拼接）、merge（连接）                              |
| 分组聚合  | groupby、agg、filter、transform                      |
| 透视    | crosstab（频数）、pivot_table（聚合）                      |
| 文件 IO | read_csv/to_csv、read_json/to_json、read_sql/to_sql |


---

### 10.2 学习建议

1. **多实践**：找一份真实数据（如 Kaggle 上的 Titanic、房价数据）从头到尾做一次数据清洗和分析。
2. **对比 SQL**：将 groupby、merge 和 SQL 语句对应理解。
3. **善用文档**：`help(pd.DataFrame.merge)` 或访问 [Pandas 官方文档](https://pandas.pydata.org/)。
4. **性能优化**：大数据集时注意使用 `category` 类型、避免循环、使用 `inplace=False` 时注意内存。
---