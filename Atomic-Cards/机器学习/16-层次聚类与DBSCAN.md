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

## 面试追问

**Q1（基础）**：DBSCAN 的两个核心参数是什么？它们各自控制什么？
**回答要点**：eps（邻域半径）和 min_samples（核心点的最小邻居数）；eps 决定邻域大小——太小大多数点成噪声，太大簇合并；min_samples 决定密度阈值——越大核心点要求越严格，越容易形成噪声点；两者需联合调参。

**Q2（深挖）**：DBSCAN 相比 K-means 最大的优势是什么？什么时候你选 DBSCAN 而不选 K-means？
**回答要点**：DBSCAN 最大优势是能发现任意形状的簇（月牙形、螺旋形等）且自动识别噪声点（-1 标签）；选择 DBSCAN 的场景：不知道 K 值、簇形状不规则、数据含大量噪声点、需要异常检测；但 DBSCAN 在密度差异大和高维数据下效果差。

**Q3（实战）**：层次聚类中四种连接方式（ward/complete/average/single）有什么区别？如何选择？
**回答要点**：ward 最小化簇内方差，默认首选生成近似球状簇；complete 以最远两点距离为准，生成紧凑簇；average 取平均距离，折中方案；single 以最近两点为准，易形成链状簇（将不相干点拉成一条链）；实践中 ward 最常用。

**Q4（边界）**：DBSCAN 在密度不均匀的数据和高维数据下有什么问题？怎么解决？
**回答要点**：密度不均匀时单一 (eps, min_samples) 无法适应全局——稀疏区域的簇被当作噪声，密集区域簇合并；高维数据中距离度量失效（维度灾难），且密度定义困难；解决方案：用 OPTICS（对 eps 不敏感）、先降维（PCA）再用 DBSCAN、或选其他算法。

> 参见 [[15-K-means聚类]]、[[17-PCA与降维]]
