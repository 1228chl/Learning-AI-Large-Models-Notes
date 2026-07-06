---
author: "XunZong"
created: "2026-07-06"
tags: ["数据分析", "Pandas", "DataFrame"]
aliases: ["Pandas", "DataFrame", "数据清洗"]
---

# Pandas 与 DataFrame

## 定义

Pandas 是 Python 生态中最核心的**结构化数据处理**库。核心数据结构有两个：**DataFrame**（表格，类似 Excel）和 **Series**（单列，类似数组）。

```python
import pandas as pd
import numpy as np

# 创建 DataFrame
df = pd.DataFrame({
    'name': ['Alice', 'Bob', 'Charlie'],
    'age': [25, 30, 35],
    'score': [0.85, 0.92, 0.78]
})

# 读取文件
df = pd.read_csv('train.csv')
df = pd.read_excel('data.xlsx')
df = pd.read_json('data.json')
```

## 核心操作

```python
# 查看数据
df.head(10)                # 前 10 行
df.info()                  # 列类型、非空数
df.describe()              # 数值列的统计摘要
df.shape                   # (行数, 列数)

# 选择
df['name']                 # 单列 → Series
df[['name', 'score']]      # 多列 → DataFrame
df.loc[0:5]                # 按标签切片
df.iloc[0:5]               # 按位置切片

# 条件过滤
df[df['score'] > 0.8]      # 筛选高分样本
df[(df['age'] > 25) & (df['score'] > 0.8)]

# 排序
df.sort_values('score', ascending=False)
```

## 数据清洗

```python
# 缺失值处理
df.isnull().sum()                    # 统计每列缺失值
df.dropna()                          # 删除含缺失值的行
df.fillna({'age': df['age'].mean()}) # 用均值填充

# 删除重复
df.drop_duplicates()

# 类型转换
df['age'] = df['age'].astype('float32')

# 异常值处理
df[df['age'].between(0, 120)]        # 过滤年龄范围
```

## 分组与聚合

```python
# 分组统计
df.groupby('category')['score'].mean()
df.groupby('category').agg({
    'score': ['mean', 'std', 'count'],
    'age': 'median'
})

# 透视表
pd.pivot_table(df, values='score', index='category', columns='gender')

# 合并
pd.merge(df1, df2, on='user_id', how='left')
pd.concat([df1, df2], axis=0)
```

## ML 中的 Pandas

| 应用场景 | 代码 | 说明 |
|:--------:|:----|:----|
| **数据探索（EDA）** | `df.describe()`、`df['col'].hist()` | 快速了解数据分布 |
| **特征工程** | `df['new_feat'] = df['a'] / df['b']` | 构造新特征 |
| **数据清洗** | `df.dropna()`、`df.fillna()` | 处理缺失值和异常值 |
| **标签编码** | `df['cat'].astype('category').cat.codes` | 类别特征编码 |
| **训练数据准备** | `X = df.drop('label', axis=1).values` | 转为 NumPy 供模型训练 |
| **训练结果分析** | `df['pred'] = y_pred` | 将预测写回 DataFrame |

```python
# 完整 ML 数据预处理流程
df = pd.read_csv('data.csv')
df = df.drop_duplicates()
df = df.fillna(df.median(numeric_only=True))
X = df.drop('target', axis=1).values
y = df['target'].values
```

> 参见 [[01-NumPy与ndarray]]、[[18-特征工程]]
