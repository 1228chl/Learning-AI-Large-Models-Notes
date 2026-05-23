**下一级：** [[]]

**标签：** #K-means #ML

---

# 聚类算法完整学习笔记

## 第一部分：聚类算法简介

### 1.1 什么是聚类算法

**聚类（Clustering）** 是一种**无监督学习**算法，其目标是在**没有先验标签**的情况下，根据样本之间的**相似性**自动将数据划分到不同的类别（簇）中。同一簇内的样本相似度高，不同簇之间的样本相似度低。

**定义**：

- 根据样本之间的相似性，将样本划分到不同的类别中。
- 不同的相似度计算方法，会得到不同的聚类结果。常用的相似度度量包括**欧氏距离**、曼哈顿距离、余弦相似度等。
- 聚类算法能够自动发现数据集中的内在结构和模式，而不需要人工标注。

**与监督学习的区别**：

| 对比维度 | 监督学习（分类/回归） | 无监督学习（聚类） |
|----------|----------------------|-------------------|
| 是否有标签 | 有（已知 y） | 无（未知 y） |
| 目标 | 学习从 x 到 y 的映射 | 发现数据内在结构 |
| 评价方式 | 准确率、MSE 等（有真实值） | 内部指标（轮廓系数、SSE 等） |
| 典型算法 | 线性回归、决策树、SVM | KMeans、DBSCAN、层次聚类 |

### 1.2 聚类算法的应用场景

聚类算法在现实生活中有着广泛的应用，几乎渗透到各行各业：

| 领域 | 应用示例 |
|------|----------|
| **电商与营销** | 用户画像、广告推荐、客户分群（如高价值客户、潜力客户、流失倾向客户） |
| **搜索引擎** | 流量推荐、恶意流量识别、查询聚类 |
| **位置服务** | 基于位置信息的商业推送（如寻找附近相似用户） |
| **内容管理** | 新闻聚类、文档自动分类、筛选排序 |
| **计算机视觉** | 图像分割、降维、物体识别 |
| **金融风控** | 离群点检测、信用卡异常消费识别 |
| **生物信息学** | 发掘相同功能的基因片段、蛋白质结构分类 |

**示例：客户分群**  
某商场根据客户的年收入和消费指数，将客户分为不同群体（如“高收入高消费”、“高收入低消费”、“低收入高消费”等），然后针对不同群体制定差异化的营销策略。

### 1.3 聚类算法的分类

聚类算法可以从不同角度进行分类：

#### 1.3.1 根据聚类颗粒度分类

| 类型 | 说明 |
|------|------|
| **粗聚类** | 将数据划分为较少的、范围较大的簇，每个簇包含较多样本 |
| **细聚类** | 将数据划分为较多的、范围较小的簇，每个簇包含较少样本 |

颗粒度的选择取决于业务需求。例如，客户分群可能需要 5~10 个群体（中颗粒度），而图像分割可能需要成百上千个像素簇（细颗粒度）。

#### 1.3.2 根据实现方法分类

| 算法 | 核心思想 | 特点 |
|------|----------|------|
| **K-means** | 基于质心（中心点）的划分 | 简单、高效、通用，适用于球形簇、数据规模大 |
| **层次聚类** | 对数据进行逐层划分（自底向上或自顶向下） | 可得到树状图，不要求指定 K，但计算复杂度高 |
| **DBSCAN** | 基于密度的聚类 | 可发现任意形状簇，能识别噪声点，不需指定 K |
| **谱聚类** | 基于图论，利用样本间的相似度矩阵进行谱分解 | 适用于非凸形状簇，计算复杂 |

本笔记重点讲解**K-means**，因为它是最经典、最常用、最容易理解的聚类算法。

---

## 第二部分：KMeans 算法 API 与快速入门

### 2.1 KMeans API 介绍

Scikit-learn 提供了 KMeans 算法的实现，位于 `sklearn.cluster.KMeans`。

```python
from sklearn.cluster import KMeans
```

**构造函数**：

```python
KMeans(n_clusters=8, init='k-means++', n_init=10, max_iter=300, 
       tol=1e-4, random_state=None, algorithm='lloyd')
```

**主要参数**：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `n_clusters` | int | 8 | 聚类中心的数量（即要分成几类）。**最重要的参数** |
| `init` | str 或 array | 'k-means++' | 初始化质心的方法。'k-means++'（推荐）能加速收敛；'random'（随机） |
| `n_init` | int | 10 | 用不同初始质心运行算法的次数，最终选择 SSE 最小的结果 |
| `max_iter` | int | 300 | 单次运行的最大迭代次数 |
| `tol` | float | 1 e-4 | 收敛容差：当质心移动距离小于该值时停止 |
| `random_state` | int | None | 随机种子，保证结果可重复 |
| `algorithm` | str | 'lloyd' | KMeans 算法实现，可选 'lloyd'、'elkan'（用于加速） |

**主要属性**（`fit` 后可用）：

| 属性 | 说明 |
|------|------|
| `cluster_centers_` | 最终的聚类中心坐标（每个簇的质心） |
| `labels_` | 每个样本的簇标签（0 ~ n_clusters-1） |
| `inertia_` | 样本到最近聚类中心的平方距离之和，即**SSE（误差平方和）** |

**主要方法**：

| 方法 | 说明 |
|------|------|
| `fit(X)` | 训练模型，计算聚类中心 |
| `predict(X)` | 预测每个样本属于哪个簇 |
| `fit_predict(X)` | 先 `fit` 再 `predict`，一步完成，返回标签 |
| `transform(X)` | 将样本映射到距离空间（每个特征到各中心的距离） |

### 2.2 快速入门：使用 make_blobs 生成模拟数据并进行 KMeans 聚类

```python
from sklearn.cluster import KMeans
import matplotlib.pyplot as plt
from sklearn.datasets import make_blobs

# 1. 生成模拟数据集：1000个样本，每个样本2个特征，设定4个中心点
# 各簇的标准差分别为 [0.4, 0.2, 0.2, 0.2]
X, y_true = make_blobs(n_samples=1000, n_features=2,
                       centers=[[-1,-1], [0,0], [1,1], [2,2]],
                       cluster_std=[0.4, 0.2, 0.2, 0.2],
                       random_state=22)

# 查看生成的数据（散点图）
plt.figure(figsize=(8, 6))
plt.scatter(X[:, 0], X[:, 1], marker='o', alpha=0.6)
plt.title("原始数据（无标签）")
plt.show()

# 2. 使用KMeans聚类（假设我们不知道真实类别数，先设为3）
kmeans = KMeans(n_clusters=3, random_state=22)
y_pred = kmeans.fit_predict(X)   # 训练并预测

# 3. 可视化聚类结果（不同颜色代表不同簇）
plt.figure(figsize=(8, 6))
plt.scatter(X[:, 0], X[:, 1], c=y_pred, cmap='viridis')
plt.scatter(kmeans.cluster_centers_[:, 0], kmeans.cluster_centers_[:, 1],
            s=200, marker='X', c='red', label='Centroids')
plt.title("KMeans聚类结果 (k=3)")
plt.legend()
plt.show()

# 4. 查看SSE（惯性）
print(f"SSE (Inertia): {kmeans.inertia_:.2f}")
```

**输出**：散点图展示聚类效果，红色 X 标记为质心位置。

### 2.3 评估聚类效果的指标：Calinski-Harabasz 指数

`calinski_harabasz_score`（CH 指数）是一种内部评估指标，用于评估聚类效果。其值越大，表示聚类效果越好（类间距离大、类内距离小）。

```python
from sklearn.metrics import calinski_harabasz_score

ch_score = calinski_harabasz_score(X, y_pred)
print(f"Calinski-Harabasz指数: {ch_score:.2f}")
```

**注意**：原 PDF 中提到的 `calinski_harabaz_score` 已废弃，应使用 `calinski_harabasz_score`（拼写略有不同）。

---

## 第三部分：KMeans 算法实现流程

KMeans 算法通过**迭代优化**的方式找到最佳的聚类中心。其步骤清晰、易于理解。

### 3.1 算法步骤（详细版）

**输入**：样本集 $D = \{x_1, x_2, \dots, x_m\}$ ，聚类簇数 $K$ （需预先指定）

**输出**： $K$ 个簇的划分 $C = \{C_1, C_2, \dots, C_K\}$

**步骤**：

1. **初始化 K 个聚类中心**：从样本集中**随机选择** $K$ 个样本点作为初始质心 $\mu_1, \mu_2, \dots, \mu_K$ 。
2. **分配样本**：对于每个样本 $x_i$ ，计算它到每个质心 $\mu_j$ 的距离（通常为欧氏距离），将其归属到距离最近的质心所在的簇。
3. **更新质心**：对于每个簇 $C_j$ ，重新计算该簇所有样本的平均值，作为新的质心：

   $$
   \mu_j = \frac{1}{|C_j|} \sum_{x \in C_j} x
   $$

4. **判断收敛**：如果新的质心与旧的质心相同（或变化小于某个阈值），则算法停止；否则返回第 2 步继续迭代。

### 3.2 流程图解

```
开始
  ↓
指定K值，随机初始化K个质心
  ↓
计算每个样本到各质心的距离，归入最近的簇
  ↓
重新计算每个簇的均值，更新质心
  ↓
质心是否变化？ → 是 → 返回“计算距离”步骤
  ↓ 否
输出最终聚类结果
  ↓
结束
```

### 3.3 手工演算示例（二维数据）

假设有 4 个点：A(1,1), B(2,1), C(4,3), D(5,4)。设 K=2。

1. **初始化**：随机选 A 和 C 作为初始质心： $\mu_1=(1,1)$ , $\mu_2=(4,3)$
2. **分配**：
   - A 到 $\mu_1$ 距离 0，到 $\mu_2$ 距离约 3.6 → 归入簇 1
   - B 到 $\mu_1$ 距离 1，到 $\mu_2$ 距离约 2.8 → 归入簇 1
   - C 到 $\mu_1$ 距离约 3.6，到 $\mu_2$ 距离 0 → 归入簇 2
   - D 到 $\mu_1$ 距离 5，到 $\mu_2$ 距离约 1.4 → 归入簇 2
   → 簇 1: {A, B}；簇 2: {C, D}
1. **更新质心**：
   - 新 $\mu_1 = ((1+2)/2, (1+1)/2) = (1.5, 1)$
   - 新 $\mu_2 = ((4+5)/2, (3+4)/2) = (4.5, 3.5)$
1. **再次分配**：重新计算距离，若质心不再变化则停止。本例中，新的质心后分配结果不变，算法结束。

### 3.4 K 值的选择（肘方法）

K 值是 KMeans 算法最重要的超参数。如何选择合适的 K？常用**肘方法（Elbow Method）**：

- 对于 $k = 1, 2, \dots, 10$ ，分别运行 KMeans，记录每次的 SSE（`inertia_`）。
- 绘制 $k$ 与 SSE 的曲线。
- 当 $k$ 小于真实簇数时，SSE 下降很快；当 $k$ 达到真实簇数后，SSE 下降变得平缓。这个拐点对应的 $k$ 即为最佳选择。

```python
sse_list = []
for k in range(1, 11):
    kmeans = KMeans(n_clusters=k, random_state=22)
    kmeans.fit(X)
    sse_list.append(kmeans.inertia_)

plt.plot(range(1, 11), sse_list, 'bo-')
plt.xlabel('k')
plt.ylabel('SSE')
plt.title('肘方法确定最佳K值')
plt.show()
```

**输出示例**：图中在 k=4 处出现明显拐点，说明最佳聚类数为 4。

---

## 第四部分：聚类模型评估方法

由于聚类是无监督学习，没有真实标签，评估指标主要基于**簇内内聚性**和**簇间分离性**。

### 4.1 误差平方和（SSE）

**SSE（Sum of Squared Errors）** 是所有样本点到其所属簇质心距离的平方和。也称为**惯性（inertia）**。

$$

SSE = \sum_{i=1}^{k} \sum_{p \in C_i} \| p - m_i \|^2

$$

- $k$ ：聚类个数
- $C_i$ ：第 $i$ 个簇
- $p$ ：簇内的样本点
- $m_i$ ：第 $i$ 个簇的质心

**特点**：

- SSE 越小，表示样本点越接近其质心，聚类效果越好。
- SSE 随着 $k$ 的增加而**单调递减**（极端情况：k = 样本数时 SSE=0）。因此不能仅用 SSE 最小化选择 k，需结合肘方法。

### 4.2 肘方法（Elbow Method）

核心思想：随着 $k$ 增加，SSE 下降速度会变慢。绘制 SSE-k 曲线，寻找“肘部”拐点作为最佳 k 值。

### 4.3 Calinski-Harabasz 指数（CH 指数）

CH 指数通过计算**类间离散度与类内离散度之比**来评估聚类效果。

$$

CH = \frac{\text{trace}(B_k)}{\text{trace}(W_k)} \times \frac{N - k}{k - 1}

$$

- $B_k$ ：类间协方差矩阵
- $W_k$ ：类内协方差矩阵
- $N$ ：样本总数， $k$ ：类别数

**特点**：CH 值越大，表示聚类效果越好（类间分散、类内紧凑）。不需要指定真实标签，但计算较复杂。

### 4.4 轮廓系数（Silhouette Coefficient）

轮廓系数结合了内聚度和分离度，取值范围 [-1, 1]。越接近 1 表示聚类效果越好。

公式略，可通过 `sklearn.metrics.silhouette_score` 计算。

---

## 第五部分：案例——顾客数据聚类分析

### 5.1 案例背景

我们有一份客户数据（Mall Customers），包含以下字段：

| 字段 | 含义 |
|------|------|
| CustomerID | 客户 ID |
| Gender | 性别（Male/Female） |
| Age | 年龄 |
| Annual Income (k$) | 年收入（千美元） |
| Spending Score (1-100) | 消费指数（1~100，越高消费越强） |

**任务**：对客户进行聚类分析，识别出不同的客户群体，帮助业务发现“黄金客户”（高收入、高消费群体）以及制定针对性营销策略。

### 5.2 数据预处理与 KMeans 聚类

```python
import pandas as pd
import matplotlib.pyplot as plt
from sklearn.cluster import KMeans

# 1. 读取数据
df = pd.read_csv('data/customers.csv')   # 请根据实际路径调整

# 2. 选择特征：年收入和消费指数（第3、4列，索引从0开始）
X = df.iloc[:, [3, 4]].values   # 获取 Annual Income 和 Spending Score

# 3. 使用肘方法确定最佳K值
sse = []
for k in range(1, 11):
    kmeans = KMeans(n_clusters=k, random_state=42)
    kmeans.fit(X)
    sse.append(kmeans.inertia_)

plt.plot(range(1, 11), sse, 'bo-')
plt.xlabel('k')
plt.ylabel('SSE')
plt.title('肘方法确定K值')
plt.show()
# 观察图形，拐点在 k=5 附近，因此选择 n_clusters=5

# 4. 使用 k=5 进行聚类
kmeans = KMeans(n_clusters=5, random_state=42)
y_kmeans = kmeans.fit_predict(X)

# 5. 可视化聚类结果
colors = ['red', 'blue', 'green', 'cyan', 'magenta']
labels = ['Standard', 'Traditional', 'Normal', 'Youth', 'TA']  # 自定义标签

plt.figure(figsize=(10, 8))
for i in range(5):
    plt.scatter(X[y_kmeans == i, 0], X[y_kmeans == i, 1],
                s=100, c=colors[i], label=labels[i], alpha=0.7)

# 绘制质心
plt.scatter(kmeans.cluster_centers_[:, 0], kmeans.cluster_centers_[:, 1],
            s=300, c='black', marker='X', label='Centroids')

plt.title('客户分群结果')
plt.xlabel('Annual Income (k$)')
plt.ylabel('Spending Score (1-100)')
plt.legend()
plt.grid(True, linestyle='--', alpha=0.5)
plt.show()
```

### 5.3 结果解读

通过聚类得到的 5 个客户群：

| 群体 | 年收入 | 消费指数 | 特征描述 | 营销建议 |
|------|--------|----------|----------|----------|
| 红（Standard） | 中等 | 中等 | 普通客户群体 | 推送常规优惠 |
| 蓝（Traditional） | 中等偏低 | 较低 | 传统节俭型 | 提供性价比高的商品 |
| 绿（Normal） | 中等偏高 | 中等偏高 | 潜力客户 | 提升忠诚度计划 |
| 青（Youth） | 低 | 高 | 年轻高消费但收入不高（可能受家庭支持） | 社交营销、时尚新品 |
| 紫（TA，黄金客户） | 高 | 高 | **高收入高消费** | VIP 服务、高端产品推荐 |

**黄金客户（右上角紫色簇）** 是业务的核心目标，应提供专属优惠、优先服务，保持高粘性。

### 5.4 完整代码说明

原 PDF 中的代码还包含了绘制质心的操作，并且使用了 `plt.scatter` 分别绘制每个簇，便于标记不同类别的含义。

```python
# 另一种写法：分别绘制每个簇（便于设置图例）
plt.scatter(X[y_kmeans == 0, 0], X[y_kmeans == 0, 1], s=100, c='red', label='Standard')
plt.scatter(X[y_kmeans == 1, 0], X[y_kmeans == 1, 1], s=100, c='blue', label='Traditional')
plt.scatter(X[y_kmeans == 2, 0], X[y_kmeans == 2, 1], s=100, c='green', label='Normal')
plt.scatter(X[y_kmeans == 3, 0], X[y_kmeans == 3, 1], s=100, c='cyan', label='Youth')
plt.scatter(X[y_kmeans == 4, 0], X[y_kmeans == 4, 1], s=100, c='magenta', label='TA')
```

---

## 第六部分：总结速查表

### 6.1 聚类算法核心概念

| 概念 | 说明 |
|------|------|
| **无监督学习** | 没有标签，自动发现数据结构 |
| **相似性度量** | 常用欧氏距离、曼哈顿距离、余弦相似度 |
| **KMeans 目标** | 最小化 SSE（样本到质心距离平方和） |

### 6.2 KMeans 算法步骤

```
1. 指定K，随机初始化K个质心
2. 分配样本到最近的质心
3. 更新质心（计算簇内均值）
4. 重复2-3直到质心不变或达到最大迭代次数
```

### 6.3 API 速查

| 任务 | 类/函数 | 关键参数 |
|------|---------|----------|
| KMeans 聚类 | `KMeans` | `n_clusters`, `random_state` |
| 生成模拟数据 | `make_blobs` | `n_samples`, `centers`, `cluster_std` |
| CH 指数 | `calinski_harabasz_score` | `X`, `labels` |
| 肘方法 | 自定义循环 | 计算不同 k 的 `inertia_` |

### 6.4 评估指标

| 指标 | 含义 | 选择标准 |
|------|------|----------|
| **SSE** | 簇内误差平方和 | 越小越好，但需结合肘方法 |
| **肘方法** | 通过 SSE 曲线拐点选 K | 拐点处为最佳 K |
| **CH 指数** | 类间/类内离散度比 | 越大越好 |

### 6.5 练习

**题目 1**：下列关于聚类算法 API 的描述正确的是？（多选）

A）它是通过 sklearn.cluster.Kmeans 来实现的  
B）可以通过 n_clusters 参数指定样本最终被归为多少个聚类  
C）右图中的样本一共被分为 4 个类  
D）右图中的样本一共被分为 2 个类  

**答案**：**A、B、D**（C 错误，图中聚类成 2 个类别）

**题目 2**：下列是 Kmeans 算法的实现流程，请对它们进行排序：

A）将该未知样本点归类为与 D 值最小时的中心点相同的类别  
B）计算未知样本点分别到这 K 个中心点的距离 D  
C）重复上述过程，直至新的中心点与旧的中心点一致，则迭代停止  
D）随机初始化 K 个中心点  
E）计算这 K 个分类簇的均值分别作为这 K 个簇新的中心点  

**正确顺序**：**D → B → A → E → C**

---
