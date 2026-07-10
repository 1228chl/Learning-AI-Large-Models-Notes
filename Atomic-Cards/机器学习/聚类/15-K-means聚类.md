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

$$
\min \sum_{i=1}^n \|\mathbf{x}_i - \mu_{c_i}\|_2^2
$$

- $n$：样本总数
- $\mathbf{x}_i$：第 $i$ 个样本的特征向量
- $\mu_{c_i}$：样本 $\mathbf{x}_i$ 所属簇的中心（$c_i$ 为簇编号）

```python
from sklearn.cluster import KMeans

# 创建K-means聚类器，将数据划分为5个簇，固定随机种子确保结果可复现
kmeans = KMeans(n_clusters=5, random_state=42)
kmeans.fit(X)  # 迭代优化：分配样本到最近中心 → 更新中心 → 重复直到收敛


labels = kmeans.labels_                # 每个样本所属簇的编号（0到K-1）

centers = kmeans.cluster_centers_      # 簇中心坐标（K个点的位置）

inertia = kmeans.inertia_              # 簇内平方和（所有样本到其簇中心的距离平方和），越小越紧密
```

## 算法步骤

```python
# K-means 手动实现核心逻辑：迭代执行分配-更新步骤直到收敛
import numpy as np


def kmeans(X, K, max_iters=100):
    # 1. 随机初始化 K 个簇中心：从数据中随机抽取K个样本作为初始中心
    centers = X[np.random.choice(len(X), K, replace=False)]

    for _ in range(max_iters):
        # 2. 分配步骤：每个样本归到最近的簇中心
        distances = np.linalg.norm(X[:, None] - centers, axis=2)  # 计算所有样本到所有中心的距离

        labels = np.argmin(distances, axis=1)  # 每个样本选择最近的中心作为所属簇

        # 3. 更新步骤：重新计算每个簇的中心（取簇内所有点的均值）
        new_centers = np.array([X[labels == k].mean(axis=0) for k in range(K)])

        # 4. 收敛检查：如果中心不再变化，说明算法已收敛
        if np.all(centers == new_centers):
            break

        centers = new_centers

    return labels, centers
```

## 如何选择 K

```python
# 肘部法（Elbow Method）：通过观察惯性随K值变化的曲线选择最优K
inertias = []

K_range = range(1, 11)

for k in K_range:

    kmeans = KMeans(n_clusters=k, random_state=42)
    kmeans.fit(X)
    inertias.append(kmeans.inertia_)  # 记录当前K下的簇内平方和

# 画图观察：惯性下降变缓的"拐点"即为最优 K
# silhouette_score（轮廓系数）：衡量簇内紧密度和簇间分离度，取值范围[-1,1]，越大越好
from sklearn.metrics import silhouette_score

for k in range(2, 11):

    kmeans = KMeans(n_clusters=k, random_state=42)

    labels = kmeans.fit_predict(X)   # 训练并直接获取聚类标签

    score = silhouette_score(X, labels)  # 计算当前K的轮廓系数

    print(f"K={k}, Silhouette={score:.4f}")
```

## 优点与局限

| 优点 | 局限 |
|------|------|
| 简单快速， $O(n \cdot K \cdot d \cdot I)$（$n$：样本数，$d$：特征维数，$I$：迭代次数） | 需预设 $K$ 值 |
| 可扩展到大数据集 | 对初始中心敏感 |
| 容易解释 | 假设球状簇（不能处理复杂形状） |
| 常用于数据探索第一步 | 对异常值敏感 |

### 局部最优与多次运行

K-means 每次从随机初始中心开始，收敛到的是**局部最优**而非全局最优。不同初始中心会收敛到不同结果。实践中用 `n_init=10` 运行 10 次取 inertia 最小的那次，或使用 K-means++ 初始化（使初始中心尽可能分散）来改善。

### 球状簇假设的失效场景

K-means 假设簇是各向同性的球状（因为距离度量是欧氏距离），在以下场景严重失效：

| 失效场景 | 原因 | 替代方案 |
|:---------|:-----|:---------|
| **月牙形/螺旋形簇** | 形状非凸，K-means 强行切割 | DBSCAN（密度聚类） |
| **密度差异大** | 稀疏簇的点被归入附近的密集簇 | 谱聚类 |
| **簇大小悬殊** | 大簇"吞噬"小簇的边界点 | 层次聚类 |

## K-means 变体

| 变体 | 改进点 | 适用场景 |
|------|--------|----------|
| **K-means++** | 智能初始化中心 | 默认使用，更稳定 |
| **Mini-Batch K-means** | 用 mini-batch 加速 | 海量数据 |
| **K-medoids** | 用真实数据点作中心 | 对异常值鲁棒 |

```python
from sklearn.cluster import MiniBatchKMeans

# Mini-Batch K-means：适合大数据集，每次用一小批样本更新簇中心，大幅提升训练速度
mbk = MiniBatchKMeans(n_clusters=5, batch_size=1024)  # batch_size控制每次处理的样本数
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

## 面试追问

**Q1（基础）**：K-means 算法的核心步骤是什么？它的优化目标是什么？
**回答要点**：

1. 步骤：初始化 K 个簇中心 → 每个样本归到最近的中心 → 重新计算各簇中心 → 重复直到收敛
2. 优化目标：最小化所有样本到其所属簇中心的距离平方和（惯性/inertia）
3. 算法保证收敛但只能找到局部最优

**Q2（深挖）**：选择 K 值的肘部法和轮廓系数分别怎么用？各自的优缺点是什么？
**回答要点**：

1. 肘部法画 inertia 随 K 变化的曲线，找下降变缓的拐点，直观但拐点可能不明显
2. 轮廓系数衡量簇内紧密度和簇间分离度，分数[-1,1]，越大越好，可定量评估但计算开销大
3. 实践中两者结合使用，同时结合业务可解释性选 K

**Q3（实战）**：K-means 对初始中心非常敏感，实践中怎么处理？K-means++ 解决了什么问题？
**回答要点**：

1. K-means++ 通过智能初始化（让初始中心尽可能分散）显著提升稳定性和收敛质量
2. 实践中设置不同的 random_state 运行多次取最优结果（因为算法到局部最优）
3. Mini-Batch K-means 适合海量数据，每次用小批样本更新

**Q4（边界）**：K-means 假设簇是球状的——这个假设在什么场景下会严重失效？有什么替代方案？
**回答要点**：

1. 当簇形状不规则（如月牙形、螺旋形）、密度差异大、簇大小悬殊时，K-means 表现严重下降
2. K-means 会将一个不规则簇强行切成几块或将多个簇合并，导致聚类结果失真
3. 替代方案：DBSCAN（任意形状+自动识别噪声）、层次聚类（树状图分析）、谱聚类（图结构聚类）

## 参考引用
- 需要理解层次聚类与DBSCAN的相关知识，参见 [层次聚类与DBSCAN](16-层次聚类与DBSCAN.md)
- 需要理解PCA与降维的相关知识，参见 [PCA与降维](../降维/17-PCA与降维.md)
- 需要理解评估指标的相关知识，参见 [评估指标](../基础/04-评估指标.md)
