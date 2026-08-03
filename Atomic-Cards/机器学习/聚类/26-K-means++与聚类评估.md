---
author: "XunZong"
created: "2026-07-10"
tags: ["机器学习", "聚类", "K-means"]
aliases: ["K-means++", "初始化优化", "K-Means++", "聚类评估"]
---

# K-means++ 与聚类调参

## 定义

K-means++ 是对传统 K-means 的**初始化优化**方法。原始 K-means 随机选择初始聚类中心，容易陷入局部最优；K-means++ 通过**概率加权采样**选择初始中心，大幅提升聚类质量和收敛速度。

## K-means++ 初始化算法

**核心思想**：初始聚类中心应尽可能分散——新中心选在距离已有中心较远的位置。

1. 从数据集中**随机**选择第一个聚类中心 $c_1$
2. 对每个样本 $x$，计算其到最近聚类中心的距离 $D(x)$
3. 以概率 $P(x) = \frac{D(x)^2}{\sum_{x'} D(x')^2}$ 选择下一个聚类中心（距离越远概率越大）
4. 重复 2-3 步直到选出 $K$ 个中心

```python
import numpy as np

def kmeans_pp_init(X, k, random_state=42):
    """K-means++ 初始化：概率加权的远距离采样"""
    rng = np.random.RandomState(random_state)
    n_samples = X.shape[0]

    # 第一步：随机选第一个中心
    centers = [X[rng.randint(n_samples)]]

    for _ in range(1, k):
        # 计算每个样本到最近中心的距离
        distances = np.array([min(np.linalg.norm(x - c) for c in centers) for x in X])
        # 概率加权采样：距离越远的样本被选中的概率越大
        probs = distances ** 2 / np.sum(distances ** 2)
        # 按概率分布随机选择下一个中心
        next_idx = rng.choice(n_samples, p=probs)
        centers.append(X[next_idx])

    return np.array(centers)

# 对比实验：随机初始化 vs K-means++
from sklearn.cluster import KMeans

# 传统 K-means（随机初始化）
kmeans_random = KMeans(n_clusters=5, init='random', n_init=10, random_state=42)
# n_init=10: 随机初始化 10 次，选最优结果

# K-means++ 初始化（sklearn 默认）
kmeans_pp = KMeans(n_clusters=5, init='k-means++', n_init=10, random_state=42)
# k-means++ 是 sklearn 的默认初始化方法
```

## K 值选择方法

### 肘部法

绘制不同 $K$ 下的 SSE（误差平方和）曲线，选择下降速度显著放缓的点：

```python
import matplotlib.pyplot as plt
from sklearn.cluster import KMeans

sse = []
K_range = range(1, 11)

for k in K_range:
    kmeans = KMeans(n_clusters=k, random_state=42)
    kmeans.fit(X)
    sse.append(kmeans.inertia_)                   # inertia_ = SSE

# 绘制肘部图：选择曲线"拐点"对应的 K 值
plt.plot(K_range, sse, 'bo-')
plt.xlabel('K')
plt.ylabel('SSE')
plt.title('肘部法选择 K 值')
```

### 轮廓系数法

计算轮廓系数（Silhouette Score），选择分数最高的 $K$：

$$
s(i) = \frac{b(i) - a(i)}{\max(a(i), b(i))}
$$

- $a(i)$：样本 $i$ 到同簇其他样本的平均距离（簇内紧密度）
- $b(i)$：样本 $i$ 到最近其他簇样本的平均距离（簇间分离度）
- $s(i) \in [-1, 1]$，越接近 1 表示聚类效果越好

### Gap 统计量

比较真实数据的 SSE 与随机均匀分布数据的 SSE 差距，选择差距最大的 $K$：

$$
\text{Gap}(k) = \mathbb{E}^*[\log \text{SSE}_k] - \log \text{SSE}_k
$$

## 聚类结果评估

### 内部评估指标（无标签）

| 指标 | 范围 | 方向 | 计算复杂度 | 说明 |
|:-----|:----:|:----:|:---------:|:------|
| **SSE** | $[0, \infty)$ | 越小越好 | $O(n)$ | 肘部法目测辅助 |
| **轮廓系数** | $[-1, 1]$ | 越大越好 | $O(n^2)$ | 中小数据集推荐 |
| **CH 指数** | $[0, \infty)$ | 越大越好 | $O(n)$ | 大数据集自动选 K |
| **Davies-Bouldin** | $[0, \infty)$ | 越小越好 | $O(n)$ | 数值直观 |

### 外部评估指标（有标签）

| 指标 | 范围 | 说明 |
|:-----|:----:|:------|
| **ARI（调整兰德指数）** | $[-1, 1]$ | 对随机划分有惩罚，最常用的外部指标 |
| **NMI（归一化互信息）** | $[0, 1]$ | 基于信息论，对标签顺序不敏感 |
| **同质性/完整性/V-measure** | $[0, 1]$ | 分别衡量簇的纯净度和覆盖度 |

```python
from sklearn.metrics import silhouette_score, calinski_harabasz_score
from sklearn.metrics import davies_bouldin_score, adjusted_rand_score

# 内部评估
kmeans = KMeans(n_clusters=5, random_state=42)
labels = kmeans.fit_predict(X)

sil = silhouette_score(X, labels)                  # 轮廓系数：-1~1，越大越好
ch = calinski_harabasz_score(X, labels)            # CH 指数：越大越好
db = davies_bouldin_score(X, labels)               # Davies-Bouldin：越小越好

# 外部评估（需要真实标签 y_true）
ari = adjusted_rand_score(y_true, labels)          # 调整兰德指数：-1~1，越大越好
```

## ML/DL 应用场景

| 应用场景 | 评估方法 | 说明 |
|:---------|:---------|:------|
| 客户分群 | 轮廓系数 + 业务验证 | 选择业务可解释的 K 值，而非纯数学最优 K |
| 图像分割 | CH 指数（大数据量） | 像素级聚类，K 通常较大（10~50） |
| 文档聚类 | NMI / ARI（有标签） | 用已知类别评估聚类质量 |
| 异常检测 | SSE + 簇大小分布 | 离群点通常是一个很小的簇或远离所有簇 |

## 面试追问

**Q1（基础）**：K-means++ 相比传统 K-means 的初始化有什么改进？为什么这种改进有效？
**回答要点**：

1. 传统 K-means 随机选择初始中心，可能选到相近的点导致收敛到局部最优；K-means++ 以距离平方加权的概率选择新中心，使初始中心尽可能分散。
2. 实验证明 K-means++ 在速度和聚类质量上都显著优于随机初始化，且在最坏情况下的聚类质量有理论保证（$O(\log K)$ 近似比）。
3. sklearn 的 KMeans 默认使用 k-means++ 初始化，`init='random'` 回退到传统随机方式。

**Q2（深挖）**：肘部法选择 K 值有什么局限性？轮廓系数相比肘部法有什么优势？
**回答要点**：

1. 肘部法的局限：SSE 随 K 增加单调递减，不一定有明显"肘点"；主要靠目测，主观性强；在分布不光滑的数据上可能无法识别拐点。
2. 轮廓系数同时考虑簇内紧密度和簇间分离度，有明确的取值范围 [-1, 1]，可以用最大值自动选择 K，无需目测。
3. 轮廓系数的局限：计算复杂度 $O(n^2)$，不适合大数据集；假设凸形簇，对不规则形状的聚类效果评估不准确。

**Q3（实战）**：在 10 万样本的客户分群任务中，你会选择哪个聚类评估指标？为什么不用轮廓系数？
**回答要点**：

1. 选择 CH 指数：计算复杂度 $O(n)$，适合大数据集；虽然值无上界不直观，但相对大小（不同 K 之间的对比）具有参考意义。
2. 不用轮廓系数的原因：$O(n^2)$ 的时间复杂度在 10 万样本上不可接受（约 100 亿次距离计算）。
3. 补充业务验证：用每个簇的业务指标（如平均消费金额、活跃度）和簇的大小分布来评估聚类的业务价值，而不纯靠数学指标。

**Q4（边界）**：Gap 统计量相比肘部法和轮廓系数有什么独特优势？为什么工业界用得少？
**回答要点**：

1. Gap 统计量通过在随机均匀分布的数据上计算期望 SSE 作为基准，消除了 SSE 单调递减的偏差，能更客观地判断"当前 K 是否真的带来了显著的聚类结构改善"。
2. 工业界用得少的原因：计算成本高（需要对每个 K 值多次在随机数据上模拟），实现和解释都比肘部法复杂。
3. 实践建议：先用肘部法快速初筛 K 的大致范围，再在 2~3 个候选 K 值上用轮廓系数或业务指标做最终选择。

## 参考引用

- 需要理解 K-means 聚类的基本原理参见 [K-means聚类](./15-K-means聚类.md)
- 需要理解 DBSCAN 密度聚类与 K-means 的对比参见 [DBSCAN密度聚类](./24-DBSCAN密度聚类.md)
- 需要理解聚类评估中的轮廓系数和 CH 指数参见 [层次聚类](./25-层次聚类.md)
- 需要理解距离度量对聚类的影响参见 [距离度量](../../数学基础/线性代数/向量/14-距离度量.md)