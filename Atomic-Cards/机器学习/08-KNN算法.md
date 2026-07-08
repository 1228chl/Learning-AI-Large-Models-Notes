---
author: "XunZong"
created: "2026-07-06"
tags: ["机器学习", "KNN", "分类"]
aliases: ["KNN", "K近邻", "K-Nearest Neighbors"]
---

# KNN 算法

## 定义

K-近邻（K-Nearest Neighbors, KNN）是一种**非参数**、**惰性学习**算法。它不显式学习模型，而是直接利用训练数据的分布进行预测：**一个样本的类别由其最近的 K 个邻居投票决定**。

## 核心思想

物以类聚，人以群分。新样本的类别由与其最相似的 K 个训练样本的类别决定。

```python
from sklearn.neighbors import KNeighborsClassifier
from sklearn.neighbors import KNeighborsRegressor

# 分类
clf = KNeighborsClassifier(n_neighbors=5, metric='euclidean')
clf.fit(X_train, y_train)
y_pred = clf.predict(X_test)

# 回归（用邻居的平均值）
reg = KNeighborsRegressor(n_neighbors=5)
reg.fit(X_train, y_train)
y_pred = reg.predict(X_test)
```

## 三个关键因素

### 1. K 值选择

| K 值 | 偏差 | 方差 | 决策边界 | 含义 |
|:----:|:----:|:----:|:--------:|------|
| **小（如 K=1）** | 低 | 高 | 复杂、锯齿 | 只参考最近邻，过拟合 |
| **大（如 K=50）** | 高 | 低 | 平滑 | 参考很多邻居，欠拟合 |
| **√n** | 适中 | 适中 | — | 经验法则 |

```python
# 用交叉验证选最优 K
from sklearn.model_selection import cross_val_score

k_range = range(1, 31)
scores = []
for k in k_range:
    knn = KNeighborsClassifier(n_neighbors=k)
    cv_score = cross_val_score(knn, X_train, y_train, cv=5).mean()
    scores.append(cv_score)

best_k = k_range[np.argmax(scores)]
```

### 2. 距离度量

| 距离 | 适用场景 | 公式 |
|------|----------|------|
| **欧氏距离（L2）** | 数值特征，默认首选 | $d = \sqrt{\sum (x_i - y_i)^2}$ |
| **曼哈顿距离（L1）** | 高维数据 | $d = \sum \vert x_i - y_i\vert$ |
| **余弦相似度** | 文本、稀疏向量 | $cos = \frac{x \cdot y}{\Vert x\Vert \Vert y\Vert}$ |
| **闵可夫斯基距离** | 一般形式（p=1 曼哈顿，p=2 欧氏） | $d = (\sum \vert x_i - y_i\vert^p)^{1/p}$ |

### 3. 特征预处理

KNN 严重依赖**距离**计算，因此特征必须**归一化/标准化**，否则量级大的特征主导距离：

```python
from sklearn.preprocessing import StandardScaler

scaler = StandardScaler()
X_train = scaler.fit_transform(X_train)
X_test = scaler.transform(X_test)        # 用训练集的参数
```

## 算法特性

| 方面 | 说明 |
|------|------|
| **训练阶段** | 仅存储数据， $O(1)$ |
| **预测阶段** | 计算所有距离并排序， $O(n \cdot d)$ |
| **非参数** | 不对数据分布做任何假设 |
| **惰性学习** | 没有显式训练过程 |

## 适用于 KNN 的场景

```python
# KNN 适合：低维、小数据、决策边界不规则
# KNN 不适合：高维（维度灾难）、大数据（预测太慢）、特征尺度不一

# 维度灾难：高维空间中所有点距离趋于相等，KNN 失效
# 对策：降维（PCA）后再用 KNN
```

## 面试追问

**Q1（基础）**：KNN 的核心思想是什么？为什么说它是"惰性学习"算法？

**回答要点**：KNN 的核心是"物以类聚"——新样本的类别由其最近的 K 个邻居投票决定；它是惰性学习的代表，因为训练阶段仅存储数据（O(1)），没有显式的模型学习过程，所有计算都在预测阶段进行。

**Q2（深挖）**：K 值的选择如何影响模型的偏差和方差？如何科学地选择最优 K？

**回答要点**：小 K（如 K=1）偏差低方差高，决策边界复杂锯齿状，容易过拟合；大 K 偏差高方差低，决策边界平滑，容易欠拟合；通过交叉验证遍历 K 值范围（1~30），选择验证集表现最优的 K；经验法则 K=√n 可作为初选。

**Q3（实战）**：为什么 KNN 必须做特征归一化/标准化？如果不做会怎样？

**回答要点**：KNN 严重依赖距离计算，若特征量级不同（如年龄 0-100 vs 收入 0-10 万），收入会主导距离计算导致年龄特征被忽略；必须用 StandardScaler 或 MinMaxScaler 使所有特征在同一尺度；先划分再 fit_transform 训练集、transform 测试集。

**Q4（边界）**：什么是高维空间下的"维度灾难"？KNN 在高维数据中为什么失效？

**回答要点**：高维空间中所有点之间的距离趋于相等，最近邻和最远邻的距离比值趋近于 1，KNN 的"邻近"概念失去意义；同时高维空间数据稀疏，需要指数级数据量才能达到同样密度；应对策略是先降维（PCA/t-SNE）再用 KNN。

> 参见 [[14-距离度量]]、[[03-数据集划分与交叉验证]]、[[17-PCA与降维]]
