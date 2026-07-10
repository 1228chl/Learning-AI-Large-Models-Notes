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

# 创建 DataFrame：字典构造时键为列名、值为列数据，适合手动构建小规模测试数据
df = pd.DataFrame({
    'name': ['Alice', 'Bob', 'Charlie'],
    'age': [25, 30, 35],
    'score': [0.85, 0.92, 0.78]
})

# 读取文件：Pandas 支持多种格式直接加载，无需手动解析文件格式
df = pd.read_csv('train.csv')      # CSV 是最常见的表格格式，read_csv 自动推断列类型和分隔符

df = pd.read_excel('data.xlsx')    # Excel 读取代处理多 sheet 和合并单元格，适合业务数据

df = pd.read_json('data.json')     # JSON 适合嵌套结构数据，Pandas 自动展平为表格
```

## 核心操作

```python
# 查看数据：快速了解数据集概貌，是探索性数据分析（EDA）的第一步
df.head(10)                # 预览前 10 行，检查列名和数据格式是否与预期一致
df.info()                  # 打印列类型和非空计数，快速发现类型错误和缺失情况
df.describe()              # 数值列统计摘要（均值、标准差、分位数），初步了解数据分布
df.shape                   # (行数, 列数) — 确认数据量级，判断是否小样本或大规模数据

# 选择：根据后续操作类型决定返回 Series 还是保留 DataFrame 结构
df['name']                 # 单列 → Series，适合后续统计运算或绘图
df[['name', 'score']]      # 多列 → DataFrame，保留表格结构
df.loc[0:5]                # 按标签切片 — 包含终点，适合按行名选取
df.iloc[0:5]               # 按位置切片 — 不包含终点，适合按整数位置选取

# 条件过滤：布尔索引筛选子集，类比 SQL WHERE 但更直观
df[df['score'] > 0.8]      # 筛选高分样本，用于分析优质数据或检测异常
df[(df['age'] > 25) & (df['score'] > 0.8)]  # 多条件组合，注意用 & 而非 and，括号不可省略

# 排序：按指定列排序，常用于 Top-K 分析和排名展示
df.sort_values('score', ascending=False)    # 按分数降序排列，ascending=False 表示从高到低
```

## 数据清洗

```python
# 缺失值处理：数据分析前必须处理的常见问题，处理策略取决于缺失比例和业务含义
df.isnull().sum()                    # 统计每列缺失数量，定位缺失严重列以决定处理策略
df.dropna()                          # 含缺失的行直接删除，适用于缺失比例低且样本充足时
df.fillna({'age': df['age'].mean()}) # 用均值填充缺失值，适用于数值型且分布近似对称时

# 删除重复：确保样本独立性，避免同一数据点被重复计数造成指标失真
df.drop_duplicates()

# 类型转换：降低精度以节省内存（float64→float32），或修正自动推断错误的列类型
df['age'] = df['age'].astype('float32')

# 异常值处理：根据业务知识设定合理范围，过滤明显不符合实际的噪声数据
df[df['age'].between(0, 120)]        # 过滤年龄范围，剔除超出人类寿命的录入错误
```

## 分组与聚合

```python
# 分组统计：split-apply-combine 模式，按类别拆分后聚合，发现组间差异
df.groupby('category')['score'].mean()          # 单列单聚合 — 快速查看各类别平均得分
df.groupby('category').agg({                    # 多列多聚合 — 不同列可指定不同统计函数
    'score': ['mean', 'std', 'count'],          #   分数列计算均值、标准差和计数
    'age': 'median'                             #   年龄列用中位数抵抗异常值影响
})

# 透视表：类似 Excel 数据透视表，行列交叉展示多维度统计量
pd.pivot_table(df, values='score', index='category', columns='gender')  # 按类别和性别交叉展示得分

# 合并：类似 SQL JOIN，将多张表按关联键拼接，常用于特征拼接
pd.merge(df1, df2, on='user_id', how='left')    # 左连接 — 以 df1 为基准保留所有行，无匹配填充 NaN

pd.concat([df1, df2], axis=0)                   # 行拼接 — 上下堆叠，要求列名一致，用于追加新数据
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
# 完整 ML 数据预处理流程：从原始数据到模型输入的典型 Pipeline
df = pd.read_csv('data.csv')                    # 读入原始数据，自动解析列名和推断列类型

df = df.drop_duplicates()                       # 去重 — 避免同一样本重复出现导致训练偏差

df = df.fillna(df.median(numeric_only=True))    # 用中位数填充缺失值 — 中位数比均值更抗异常干扰

X = df.drop('target', axis=1).values            # 特征矩阵：去掉标签列并转为 NumPy 数组供模型训练

y = df['target'].values                         # 标签向量：提取目标列用于监督学习反向传播
```

## 面试追问

**Q1（基础）**：DataFrame 和 Series 的区别是什么？如何从 DataFrame 中选取单列、多列以及按条件筛选行？
**回答要点**：

1. DataFrame 是二维表格结构，Series 是单列一维数据；`df['col']` 取单列返回 Series，`df[['col1','col2']]` 取多列返回 DataFrame
2. 条件筛选使用布尔索引：`df[df['score'] > 0.8]` 返回满足条件的行子集
3. `.loc[]` 按标签索引（包含终点），`.iloc[]` 按整数位置索引（不包含终点）

**Q2（深挖）**：Pandas 的 groupby 操作背后遵循怎样的计算模型？与 SQL 的 GROUP BY 相比有何异同？
**回答要点**：

1. split-apply-combine 三步模型：按 key 切分数据、对每组应用聚合/变换/过滤函数、合并各组结果
2. 相比 SQL GROUP BY 更灵活——支持 agg 传入多种聚合函数、transform 保留原行数、apply 执行自定义逻辑
3. 内置方法如 `.mean()` 调用更简洁，无需像 SQL 那样显式书写聚合函数和 GROUP BY 子句

**Q3（实战）**：在 ML 项目中，请梳理一条完整的 Pandas 数据预处理 Pipeline，说明常见数据质量问题及处理方式。
**回答要点**：

1. 读数据 → 去重 `drop_duplicates()` → 缺失值处理 `fillna()` / `dropna()` → 类型转换 `astype()` → 异常值过滤（3σ 或箱线图） → 特征构造 → 类别编码 `get_dummies()` → 拆分 X/y → 转 NumPy `.values`
2. 使用中位数而非均值填充缺失值，能更好抵抗异常值对数据中心位置估计的干扰
3. 类别编码应区分有序和无序特征：有序用 LabelEncoder，无序用 OneHotEncoder / get_dummies

**Q4（边界）**：Pandas 在处理大规模数据集时有哪些瓶颈？如何优化？
**回答要点**：

1. 数据全部加载到内存易导致 OOM 崩溃，无法处理超出物理内存大小的数据集
2. 单线程执行架构无法利用多核 CPU 并行计算，大表操作耗时长
3. 优化方案：分块读取 `read_csv(chunksize=)`、使用高效数据类型（category/int32/float32）、用 Dask/Modin/Polars 替代、在 SQL 层预聚合后再读入、利用 `.query()` 和 `.eval()` 通过 numexpr 加速

## 参考引用
- 需要理解NumPy与ndarray的相关知识，参见 [NumPy与ndarray](01-NumPy与ndarray.md)
- 需要理解特征工程的机器学习原理与应用，参见 [特征工程](../机器学习/特征工程/18-特征工程.md)
- 需要理解Matplotlib与数据可视化的相关知识，参见 [Matplotlib与数据可视化](04-Matplotlib与数据可视化.md)
