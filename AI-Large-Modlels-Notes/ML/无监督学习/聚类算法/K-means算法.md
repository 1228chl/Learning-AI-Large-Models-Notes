**下一级：** [[]]

**标签：** #K-means #ML

---

# 聚类算法完整学习笔记

## 第一部分：聚类算法简介

### 1.1 什么是聚类算法

**聚类（Clustering）** 是一种无监督学习算法，其目标是在**没有先验标签**的情况下，根据样本之间的**相似性**，将数据自动划分到不同的类别（簇）中。同一簇内的样本相似度高，不同簇之间的样本相似度低。

**核心概念**：

- **无监督学习**：训练数据没有标签（目标值），算法需要自己发现数据中的内在结构和模式。
- **相似性度量**：常用欧氏距离（Euclidean Distance）来衡量样本之间的距离，距离越近表示越相似。
- **聚类准则**：不同的聚类算法采用不同的准则（如距离、密度、连通性），会得到不同的聚类结果。

**示例**：动物分类

- 特征：繁衍方式（胎生/卵生）、呼吸方式（肺/腮）、生活环境（陆地/两栖/水中）
- 聚类算法可以根据这些特征将动物自动分成哺乳动物、鸟类、鱼类等群体，无需事先告诉算法每个动物属于哪一类。

---

### 1.2 聚类算法的应用场景

聚类算法广泛应用于各个领域，以下是一些典型应用：

| 领域 | 应用示例 |
|------|----------|
| **市场营销** | 用户画像、广告推荐、客户分群（如找出黄金客户） |
| **搜索引擎** | 流量推荐、恶意流量识别 |
| **位置服务** | 基于位置信息的商业推送（如附近商家推荐） |
| **文本挖掘** | 新闻聚类、自动筛选和排序 |
| **图像处理** | 图像分割、降维、目标识别 |
| **金融风控** | 离群点检测、信用卡异常消费识别 |
| **生物信息学** | 发掘相同功能的基因片段 |

**生活中的例子**：购物网站根据用户的购买历史、浏览行为，自动将用户分成“高价值客户”、“价格敏感客户”、“新客户”等群体，然后针对不同群体推送不同的营销活动。

---

### 1.3 聚类算法的分类

根据不同的维度，聚类算法可以分为以下几类：

---

#### 1.3.1 按聚类颗粒度分类

| 类型 | 说明 |
|------|------|
| **粗聚类** | 将样本划分成较少的、较大的簇，关注宏观结构 |
| **细聚类** | 将样本划分成较多的、较小的簇，关注微观细节 |

---

#### 1.3.2 按实现方法分类

| 方法 | 核心思想 | 代表算法 | 特点 |
|------|----------|----------|------|
| **基于质心** | 用簇的中心（质心）代表整个簇，通过迭代优化质心位置 | **K-Means** | 简单、高效、应用最广泛 |
| **层次聚类** | 对数据进行逐层划分，形成树状结构 | Agglomerative（自底向上）、Divisive（自顶向下） | 可生成层次关系，计算量大 |
| **基于密度** | 将高密度区域划分为簇，能发现任意形状的簇 | **DBSCAN** | 可处理噪声点，不需要指定簇数 |
| **基于图论** | 将样本看作图的节点，边表示相似度，通过图划分进行聚类 | **谱聚类** | 适用于非凸形状，计算复杂度高 |

本笔记重点介绍 **K-Means 聚类算法**，因为它是最常用、最基础的聚类方法。

---

## 第二部分：K-Means 算法 API 使用

### 2.1 K-Means API 介绍

Scikit-learn 提供的 K-Means 聚类器位于 `sklearn.cluster.KMeans`。

**导入方式**：

```python
from sklearn.cluster import KMeans
```

**构造函数与主要参数**：

```python
KMeans(
    n_clusters=8,           # 聚类中心数量（即K值），默认8
    init='k-means++',       # 初始化方法，'k-means++' 能加速收敛
    n_init=10,              # 不同初始质心运行的次数，最终选最优
    max_iter=300,           # 单次运行的最大迭代次数
    tol=1e-4,               # 收敛容忍度，两次迭代质心变化小于tol则停止
    random_state=None,      # 随机种子，保证可重复性
    algorithm='lloyd'       # 算法实现，'lloyd' 或 'elkan'
)
```

**主要方法**：

| 方法 | 说明 |
|------|------|
| `fit(X)` | 训练模型，计算聚类中心 |
| `predict(X)` | 预测每个样本所属的簇 |
| `fit_predict(X)` | 先 fit 再 predict，一步完成，返回每个样本的簇标签 |
| `fit_transform(X)` | 将样本转换到簇距离空间 |
| `transform(X)` | 计算样本到每个簇中心的距离 |

**重要属性**：

- `cluster_centers_`：簇中心坐标（形状 `(n_clusters, n_features)`）
- `labels_`：训练样本的簇标签
- `inertia_`：所有样本到其最近簇中心的距离平方和（即 **SSE**，误差平方和）

**示例**：

```python
from sklearn.cluster import KMeans

# 创建数据（假设X是二维数组）
X = [[1, 2], [1, 4], [1, 0], [10, 2], [10, 4], [10, 0]]

# 实例化KMeans，聚类为2类
kmeans = KMeans(n_clusters=2, random_state=22)

# 训练并预测
y_pred = kmeans.fit_predict(X)

print("簇标签:", y_pred)
print("簇中心:", kmeans.cluster_centers_)
print("SSE:", kmeans.inertia_)
```

---

### 2.2 使用 K-Means 对人工数据集进行聚类

**案例**：随机生成二维数据集，使用 K-Means 聚类并可视化效果。

```python
# 1. 导入工具包
from sklearn.cluster import KMeans
import matplotlib.pyplot as plt
from sklearn.datasets import make_blobs
from sklearn.metrics import calinski_harabasz_score

# 2. 创建数据集：1000个样本，每个样本2个特征，4个中心点，簇标准差不同
x, y = make_blobs(
    n_samples=1000, 
    n_features=2, 
    centers=[[-1, -1], [0, 0], [1, 1], [2, 2]], 
    cluster_std=[0.4, 0.2, 0.2, 0.2], 
    random_state=22
)

# 3. 可视化原始数据
plt.figure(figsize=(12, 5))
plt.subplot(1, 2, 1)
plt.scatter(x[:, 0], x[:, 1], marker='o')
plt.title("原始数据")

# 4. 使用 K-Means 进行聚类（设定簇数为3，实际有4个簇，故意调低观察效果）
y_pred = KMeans(n_clusters=3, random_state=22).fit_predict(x)

# 5. 可视化聚类结果
plt.subplot(1, 2, 2)
plt.scatter(x[:, 0], x[:, 1], c=y_pred, cmap='viridis')
plt.title("K-Means 聚类结果 (n_clusters=3)")
plt.show()

# 6. 评估聚类效果（Calinski-Harabasz 指数，后面详细介绍）
ch_score = calinski_harabasz_score(x, y_pred)
print(f"Calinski-Harabasz 指数: {ch_score:.2f}")
```

**效果说明**：

- 当设置 `n_clusters=4` 时，聚类效果会更好（因为数据本身有 4 个簇）。
- 选择合适的 K 值是 K-Means 的关键，需要借助评估方法（如肘方法）。

---

## 第三部分：K-Means 算法实现流程

### 3.1 算法步骤

K-Means 是一种迭代优化算法，其目标是最小化所有样本到其所属簇中心的距离平方和（SSE）。具体步骤如下：

1. **确定常数 K**：事先决定最终的聚类类别数（超参数）。

2. **初始化 K 个聚类中心**：随机选择 K 个样本点作为初始聚类中心（质心）。

3. **分配样本**：计算每个样本到 K 个中心的距离，将样本归到距离最近的中心所代表的簇。

4. **更新中心**：对于每个簇，计算该簇内所有样本的**平均值**，得到新的聚类中心。

5. **判断收敛**：
   - 如果新的中心与旧的中心完全相同（或变化小于阈值），则算法收敛，停止迭代。
   - 否则，返回第 3 步，用新的中心继续分配和更新。

---

### 3.2 流程图解

```python
开始
  ↓
指定 K 值
  ↓
随机初始化 K 个聚类中心
  ↓
计算每个样本到各中心的距离，分配到最近簇
  ↓
重新计算每个簇的中心（均值）
  ↓
中心是否变化？ ──是──→ 循环
  ↓ 否
结束，输出聚类结果
```

---

### 3.3 详细举例（手工计算）

**数据**：二维平面上的 6 个点 A(1,1), B(2,1), C(4,3), D(5,4), E(4,5), F(6,5)，设 K=2。

**初始中心**：随机选 A(1,1) 和 D(5,4) 作为初始中心。

**步骤 1：分配样本**

- 计算每个点到两个中心的欧氏距离，归到最近中心。
  - A: 到 A 距离 0，到 D 距离 5 → 归到 A 簇
  - B: 到 A 距离 1，到 D 距离 4.24 → 归到 A 簇
  - C: 到 A 距离 3.61，到 D 距离 1.41 → 归到 D 簇
  - D: 到 A 距离 5，到 D 距离 0 → 归到 D 簇
  - E: 到 A 距离 5，到 D 距离 1.41 → 归到 D 簇
  - F: 到 A 距离 6.4，到 D 距离 1.41 → 归到 D 簇
结果：簇 1 = {A, B}，簇 2 = {C, D, E, F}

**步骤 2：更新中心**

- 新中心 1 = ((1+2)/2, (1+1)/2) = (1.5, 1)
- 新中心 2 = ((4+5+4+6)/4, (3+4+5+5)/4) = (19/4, 17/4) = (4.75, 4.25)

**步骤 3：重复**，直到中心不再变化。

---

### 3.4 K-Means 的特点

| 优点 | 缺点 |
|------|------|
| 算法简单，易于理解和实现 | 需要预先指定 K 值（通常不知道） |
| 计算速度快，适合大规模数据 | 对初始中心敏感，可能陷入局部最优 |
| 可解释性强（簇中心有明确意义） | 对异常值敏感（异常点会拉偏中心） |
| 收敛性有保证 | 只能发现球形簇，不能发现任意形状 |
| 适用于数值型数据 | 对特征尺度敏感（需要标准化） |

---

### 3.5 关于初始中心的选择

随机初始化可能导致不同的结果（局部最优）。K-Means 对初始中心敏感，常见改进方法：

- **多次运行**：用不同的随机种子运行多次，选择 SSE 最小的结果（`n_init` 参数）。
- **K-Means++**：一种智能初始化策略，随机选择第一个中心，然后以与已有中心距离平方成比例的概率选择后续中心，能更快收敛到更好的解。Scikit-learn 默认使用 `init='k-means++'`。

---

## 第四部分：模型评估方法

对于聚类算法，由于没有真实标签，评估指标需要从**簇内紧密度**和**簇间分离度**两个角度衡量。

---

### 4.1 误差平方和（SSE）

**定义**：SSE（Sum of Squared Errors）是所有样本到其所属簇中心距离的平方和。

$$
SSE = \sum_{i=1}^{k} \sum_{p \in C_i} \|p - m_i\|^2
$$

- $C_i$ ：第 $i$ 个簇
- $p$ ：簇 $C_i$ 中的样本点
- $m_i$ ：簇 $C_i$ 的中心（质心）
- $k$ ：聚类个数（K 值）

**性质**：

- SSE 越小，表示簇内样本越紧密，聚类效果越好。
- SSE 随着 K 的增加而单调递减（K 越大，每个簇越集中，SSE 越小）。
- 当 K 等于样本数时，SSE = 0（每个点自己成一簇）。

**获取方式**：在 sklearn 中，训练后的 KMeans 对象的 `inertia_` 属性即为 SSE。

---

### 4.2 肘方法（Elbow Method）—— 确定最佳 K 值

**思想**：当 K 较小时，增加 K 会显著降低 SSE；当 K 达到某个临界值后，再增加 K，SSE 的下降幅度会变得平缓。这个临界点就是“肘部”，对应的 K 值被认为是最佳聚类数。

**实现步骤**：

1. 对于 K = 1 到某个上限（如 10），分别运行 K-Means，记录 SSE。
2. 绘制 K 与 SSE 的关系折线图。
3. 观察曲线，找到“肘点”（拐点），即 SSE 下降速度突然变缓的位置。

**代码示例**：

```python
from sklearn.cluster import KMeans
from sklearn.datasets import make_blobs
import matplotlib.pyplot as plt

# 生成数据
x, _ = make_blobs(n_samples=1000, n_features=2, centers=4, cluster_std=0.5, random_state=22)

sse_list = []
K_range = range(1, 11)

for k in K_range:
    kmeans = KMeans(n_clusters=k, max_iter=100, random_state=0)
    kmeans.fit(x)
    sse_list.append(kmeans.inertia_)

# 绘制肘方法曲线
plt.figure(figsize=(8, 5))
plt.plot(K_range, sse_list, 'bo-')
plt.xlabel('K值')
plt.ylabel('SSE')
plt.title('肘方法确定最佳K值')
plt.xticks(K_range)
plt.grid(True)
plt.show()
```

**观察**：当 K=4 时，曲线出现明显的拐点，之后 SSE 下降平缓，因此最佳 K=4。

---

### 4.3 Calinski-Harabasz 指数（CH 指数）

**定义**：CH 指数通过计算簇间离散度与簇内离散度的比值来评估聚类效果。

$$
CH = \frac{\text{Tr}(B_k)}{\text{Tr}(W_k)} \times \frac{N - k}{k - 1}
$$

- $B_k$ ：簇间离差矩阵（Between-cluster scatter matrix）
- $W_k$ ：簇内离差矩阵（Within-cluster scatter matrix）
- $N$ ：样本总数
- $k$ ：簇数

**特点**：

- CH 指数**越大**越好，表示簇间距离大、簇内距离小。
- 不需要真实标签，仅基于特征空间计算。
- 计算速度快。

**API**：

```python
from sklearn.metrics import calinski_harabasz_score

ch_score = calinski_harabasz_score(X, labels)
print(f"CH指数: {ch_score:.2f}")
```

**注意**：在旧版 sklearn 中函数名为 `calinski_harabaz_score`（拼写少一个 's'），新版已修正为 `calinski_harabasz_score`。

---

### 4.4 轮廓系数（Silhouette Coefficient）

虽然 PDF 中没有详细展开，但轮廓系数是另一种常用聚类评估指标，补充如下：

**定义**：每个样本的轮廓系数为：

$$
s = \frac{b - a}{\max(a, b)}
$$

- $a$ ：样本到同簇内其他样本的平均距离（簇内紧密度）
- $b$ ：样本到最近的其他簇的平均距离（簇间分离度）

**特点**：

- 取值范围 $[-1, 1]$ ，越接近 1 表示聚类效果越好。
- 0 表示样本在两个簇的边界上。
- 负值表示可能分错了簇。

**API**：

```python
from sklearn.metrics import silhouette_score

sil_score = silhouette_score(X, labels)
print(f"轮廓系数: {sil_score:.3f}")
```

---

## 第五部分：案例——顾客数据聚类分析

### 5.1 案例背景

某商场拥有客户数据，包含以下字段：

- CustomerID：客户编号
- Gender：性别
- Age：年龄
- Annual Income (k$)：年收入（千美元）
- Spending Score (1-100)：消费指数（1-100，越高表示消费倾向越强）

**任务**：对客户进行聚类分析，找出不同客户群体，为精准营销提供依据（例如找出“黄金客户”——收入高、消费高的群体）。

**数据示例**：

| CustomerID | Gender | Age | Annual Income (k$) | Spending Score |
|------------|--------|-----|---------------------|----------------|
| 1 | Male | 19 | 15 | 39 |
| 2 | Male | 21 | 15 | 81 |
| 3 | Female | 20 | 16 | 6 |
| ... | ... | ... | ... | ... |

---

### 5.2 实现步骤

```python
import pandas as pd
import matplotlib.pyplot as plt
from sklearn.cluster import KMeans

# 1. 读取数据
dataset = pd.read_csv('data/customers.csv')

# 2. 选择用于聚类的特征（年收入和消费指数）
X = dataset.iloc[:, [3, 4]]   # 假设第4列是年收入，第5列是消费指数

# 3. 使用肘方法确定最佳K值（可选，此处直接设定K=5）
# 根据业务经验和肘方法，选择5个簇

# 4. 训练K-Means模型
kmeans = KMeans(n_clusters=5, random_state=42)
kmeans.fit(X)

# 5. 预测簇标签
y_kmeans = kmeans.predict(X)

# 6. 可视化聚类结果
plt.figure(figsize=(10, 7))

# 分别绘制每个簇的散点图（使用不同颜色）
colors = ['red', 'blue', 'green', 'cyan', 'magenta']
labels = ['Standard', 'Traditional', 'Normal', 'Youth', 'TA']  # 自定义标签

for i in range(5):
    plt.scatter(
        X.values[y_kmeans == i, 0],   # 年收入
        X.values[y_kmeans == i, 1],   # 消费指数
        s=100, c=colors[i], label=labels[i]
    )

# 绘制聚类中心
plt.scatter(
    kmeans.cluster_centers_[:, 0],
    kmeans.cluster_centers_[:, 1],
    s=300, c='black', marker='X', label='Centroids'
)

plt.title('Clusters of customers')
plt.xlabel('Annual Income (k$)')
plt.ylabel('Spending Score (1-100)')
plt.legend()
plt.show()
```

---

### 5.3 结果解读

聚类后的散点图通常呈现以下特征：

- **右上角簇**：高收入、高消费 → **黄金客户群**（最有价值，应重点维护）
- **左上角簇**：低收入、高消费 → 可能为“冲动型”或“年轻群体”，可培养
- **右下角簇**：高收入、低消费 → 潜力客户，可通过优惠活动刺激消费
- **左下角簇**：低收入、低消费 → 普通客户，可推送性价比高的产品
- **中间区域簇**：收入与消费均衡 → 大众客户，保基础服务

---

### 5.4 业务建议

根据聚类结果，商场可以针对不同客户群体制定差异化营销策略：

- 黄金客户：VIP 服务、专属折扣、会员积分加速
- 潜力客户：精准推送新品、满减活动
- 普通客户：定期优惠券、邮件营销

---

## 第六部分：总结速查表

### 6.1 聚类算法核心概念

| 概念 | 说明 |
|------|------|
| **无监督学习** | 没有标签，自动发现数据内在结构 |
| **相似性度量** | 常用欧氏距离，其他还有曼哈顿距离、余弦相似度 |
| **K-Means 目标** | 最小化 SSE（误差平方和） |

### 6.2 K-Means 算法流程

| 步骤 | 操作 |
|------|------|
| 1 | 指定 K 值 |
| 2 | 随机初始化 K 个聚类中心 |
| 3 | 分配样本到最近的中心 |
| 4 | 更新中心（取簇内均值） |
| 5 | 重复 3-4 直到中心不再变化 |

### 6.3 K-Means 主要参数（API）

| 参数 | 含义 | 默认值 |
|------|------|--------|
| `n_clusters` | 聚类数量 | 8 |
| `init` | 初始化方法 | 'k-means++' |
| `n_init` | 不同初始化运行次数 | 10 |
| `max_iter` | 最大迭代次数 | 300 |
| `random_state` | 随机种子 | None |

### 6.4 聚类评估指标

| 指标        | 公式/原理                        | 越大越好？    | 是否需标签 |
| --------- | ---------------------------- | -------- | ----- |
| **SSE**   | $\sum \vert p - m_i\vert ^2$ | 越小越好     | 否     |
| **肘方法**   | SSE 随 K 变化曲线拐点               | 确定最佳 K   | 否     |
| **CH 指数** | (簇间/簇内) × 权重                 | 越大越好     | 否     |
| **轮廓系数**  | (b-a)/max(a,b)               | 越接近 1 越好 | 否     |

### 6.5 常见问题及解决

| 问题 | 可能原因 | 解决办法 |
|------|----------|----------|
| 聚类结果不稳定 | 初始中心随机 | 增大 `n_init`，设置 `random_state` |
| 不同特征量纲影响大 | 未标准化 | 使用 `StandardScaler` 标准化 |
| 簇形状非球形 | K-Means 局限 | 改用 DBSCAN 或谱聚类 |
| 无法确定 K 值 | 无先验知识 | 使用肘方法、轮廓系数综合判断 |
| 出现空簇 | 初始中心选择不当 | 增大 `n_init`，或使用 K-Means++ |

### 6.6 练习

**题目 1**：下列关于聚类算法 API 的描述正确的是？（多选）

A）它是通过 sklearn.cluster.Kmeans 来实现的  
B）可以通过 n_clusters 参数指定样本最终被归为多少个聚类  
C）右图中的样本一共被分为 4 个类  
D）右图中的样本一共被分为 2 个类  

**答案**：**A、B、D**。C 错误，图中聚类为 2 类。

**题目 2**：下列是 Kmeans 算法的实现流程，请对它们进行排序：

A）将该未知样本点归类为与 D 值最小时的中心点相同的类别  
B）计算未知样本点分别到这 K 个中心点的距离 D  
C）重复上述过程，直至新的中心点与旧的中心点一致，则迭代停止  
D）随机初始化 K 个中心点  
E）计算这 K 个分类簇的均值分别作为这 K 个簇新的中心点  

**答案**：**D → B → A → E → C**

---
