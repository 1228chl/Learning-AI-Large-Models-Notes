---
author: "XunZong"
created: "2026-07-06"
tags: ["机器学习", "聚类", "DBSCAN"]
aliases: ["DBSCAN", "层次聚类", "密度聚类"]
---

# 层次聚类与 DBSCAN

## DBSCAN — 密度聚类

DBSCAN (Density-Based Spatial Clustering of Applications with Noise) 基于样本的**密度**进行聚类，能发现任意形状的簇，并自动识别**噪声点**。

**两个参数**：
- `eps`：邻域半径
- `min_samples`：核心点的最小邻居数

```python
from sklearn.cluster import DBSCAN

dbscan = DBSCAN(eps=0.5, min_samples=5)
labels = dbscan.fit_predict(X)

# -1 表示噪声点
n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
n_noise = list(labels).count(-1)
print(f"簇数量: {n_clusters}, 噪声点: {n_noise}")
```

## DBSCAN vs K-means

| 对比 | K-means | DBSCAN |
|------|:-------:|:------:|
| **簇形状** | 仅球状 | **任意形状** |
| **K 值** | 需预设 | 自动发现 |
| **噪声处理** | ❌ 所有点强制入簇 | ✅ 自动识别噪声 |
| **异常值敏感** | 敏感 | 鲁棒 |
| **密度不均** | 好 | 差（不同密度需调参） |
| **高维数据** | 好 | 差（维度灾难） |

## 层次聚类（Hierarchical Clustering）

构建一个聚类的**树状图**（Dendrogram），可展示不同粒度下的聚类结果：

```python
from sklearn.cluster import AgglomerativeClustering
from scipy.cluster.hierarchy import dendrogram, linkage
import matplotlib.pyplot as plt

# 聚合聚类（自底向上）
hc = AgglomerativeClustering(n_clusters=5, linkage='ward')
labels = hc.fit_predict(X)

# 画树状图
Z = linkage(X, method='ward')
plt.figure(figsize=(10, 5))
dendrogram(Z)
plt.show()
```

| 连接方式 | 原理 | 特点 |
|----------|------|------|
| **ward** | 最小化簇内方差 | 默认，生成近似球状簇 |
| **complete** | 最长距离（最远点） | 紧凑簇 |
| **average** | 平均距离 | 折中 |
| **single** | 最短距离（最近点） | 易形成链状簇 |

## 聚类算法选择指南

```python
# 选择策略
if data_size > 10000:
    choose = "Mini-Batch K-means"
elif cluster_shape == "任意形状":
    choose = "DBSCAN"
elif need_hierarchy or n_clusters不确定:
    choose = "层次聚类"
else:
    choose = "K-means"
```

| 场景 | 推荐算法 | 原因 |
|------|----------|------|
| 大量样本（>10 万） | Mini-Batch K-means | 线性复杂度 |
| 任意形状簇 + 噪声 | DBSCAN | 密度聚类 |
| 需要树状图分析 | 层次聚类 | 可视化不同粒度 |
| 高维数据 | K-means | 距离在高维仍有效 |
| 默认首选 | K-means++ | 简单快速效果好 |

> 参见 [[15-K-means聚类]]、[[17-PCA与降维]]
