# Pandas基础

**标签：** #Pandas #数据分析

---

## 1. 什么是Pandas

Pandas是Python数据分析库，提供两种核心数据结构：
- **Series**：一维数组
- **DataFrame**：二维表格

---

## 2. Series

```python
import pandas as pd

# 创建Series
s1 = pd.Series([1, 2, 3, 4, 5])
s2 = pd.Series([1, 2, 3, 4, 5], index=['a', 'b', 'c', 'd', 'e'])

# 访问元素
print(s2['a'])      # 1
print(s2[['a', 'c']])  # a:1, c:3
```

---

## 3. DataFrame

### 3.1 创建DataFrame

```python
# 从字典创建
data = {
    '姓名': ['张三', '李四', '王五'],
    '年龄': [25, 30, 35],
    '城市': ['北京', '上海', '广州']
}
df = pd.DataFrame(data)

# 从CSV文件创建
df = pd.read_csv('data.csv')
```

### 3.2 查看数据

```python
print(df.head())      # 前5行
print(df.shape)       # 形状
print(df.columns)     # 列名
print(df.dtypes)      # 数据类型
print(df.describe())  # 统计信息
```

### 3.3 数据选择

```python
# 选择列
print(df['姓名'])
print(df[['姓名', '年龄']])

# 选择行
print(df.loc[0])           # 按标签选择
print(df.iloc[0])          # 按位置选择

# 条件选择
print(df[df['年龄'] > 25])
```

### 3.4 数据处理

```python
# 处理缺失值
df.dropna()
df.fillna(0)

# 处理重复值
df.drop_duplicates()

# 添加列
df['薪资'] = [10000, 15000, 20000]

# 删除列
df.drop(columns=['薪资'])
```

### 3.5 分组聚合

```python
# 按城市分组，计算平均年龄
df.groupby('城市')['年龄'].mean()
```
