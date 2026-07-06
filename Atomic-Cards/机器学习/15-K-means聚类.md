---
author: "XunZong"
created: "2026-07-06"
tags: ["机器学习", "聚类", "无监督学习"]
aliases: ["K-means", "KMeans", "聚类"]
---

# K-means 聚类

## 定义

K-means 是最常用的**无监督聚类算法**。它将数据自动划分为 $K$ 个簇，使得簇内样本相似度高、簇间样本相似度低。

**目标**：最小化所有样本到其所属簇中心的距离平方和（惯性）：

$$\min \sum_{i=1}^n \|\mathbf{x}_i - \mu_{c_i}\|_2^2$$

```python
from sklearn.cluster import KMeans

kmeans = KMeans(n_clusters=5, random_state=42)
kmeans.fit(X)

labels = kmeans.labels_                # 每个样本所属簇
centers = kmeans.cluster_centers_      # 簇中心坐标
inertia = kmeans.inertia_              # 簇内平方和
```

## 算法步骤

```python
# K-means 手动实现核心逻辑
import numpy as np

def kmeans(X, K, max_iters=100):
    # 1. 随机初始化 K 个簇中心
    centers = X[np.random.choice(len(X), K, replace=False)]

    for _ in range(max_iters):
        # 2. 分配：每个样本归到最近的簇中心
        distances = np.linalg.norm(X[:, None] - centers, axis=2)
        labels = np.argmin(distances, axis=1)

        # 3. 更新：重新计算每个簇的中心
        new_centers = np.array([X[labels == k].mean(axis=0) for k in range(K)])

        # 4. 收敛检查
        if np.all(centers == new_centers):
            break
        centers = new_centers

    return labels, centers
```

## 如何选择 K

```python
# 肘部法（Elbow Method）
inertias = []
K_range = range(1, 11)

for k in K_range:
    kmeans = KMeans(n_clusters=k, random_state=42)
    kmeans.fit(X)
    inertias.append(kmeans.inertia_)

# 画图：惯性下降变缓的"拐点"即为最优 K
# silhouette_score（轮廓系数）
from sklearn.metrics import silhouette_score

for k in range(2, 11):
    kmeans = KMeans(n_clusters=k, random_state=42)
    labels = kmeans.fit_predict(X)
    score = silhouette_score(X, labels)
    print(f"K={k}, Silhouette={score:.4f}")
```

## 优点与局限

| 优点 | 局限 |
|------|------|
| 简单快速，$O(n \cdot K \cdot d \cdot I)$ | 需预设 $K$ 值 |
| 可扩展到大数据集 | 对初始中心敏感 |
| 容易解释 | 假设球状簇（不能处理复杂形状） |
| 常用于数据探索第一步 | 对异常值敏感 |

## K-means 变体

| 变体 | 改进点 | 适用场景 |
|------|--------|----------|
| **K-means++** | 智能初始化中心 | 默认使用，更稳定 |
| **Mini-Batch K-means** | 用 mini-batch 加速 | 海量数据 |
| **K-medoids** | 用真实数据点作中心 | 对异常值鲁棒 |

```python
from sklearn.cluster import MiniBatchKMeans

# 适合大数据（每次用一小批样本更新）
mbk = MiniBatchKMeans(n_clusters=5, batch_size=1024)
mbk.fit(X_large)
```

## 聚类的 ML 应用

| 应用领域 | 用途 |
|----------|------|
| **客户分群** | 根据行为特征划分用户群体 |
| **图像压缩** | 用 K 种颜色代替原图所有颜色 |
| **异常检测** | 远离任何簇中心的点可能是异常 |
| **半监督学习** | 先用聚类标注，再训练分类器 |
| **特征工程** | 簇标签作为新特征加入模型 |

> 参见 [[16-层次聚类与DBSCAN]]、[[17-PCA与降维]]、[[04-评估指标]]
