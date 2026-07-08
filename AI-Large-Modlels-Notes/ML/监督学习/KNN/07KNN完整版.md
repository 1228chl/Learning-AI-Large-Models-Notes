
# KNN 算法完整学习笔记

## 第一部分：KNN 算法简介

### 1. 什么是 K-近邻算法（KNN）

**K-近邻算法（K Nearest Neighbor，简称 KNN）** 是一种基本且简单的机器学习算法，既可以用于分类任务，也可以用于回归任务。它的核心思想非常直观：**“近朱者赤，近墨者黑”**——一个样本的类别由其邻居的类别决定。

---

#### 1.1 算法思想

如果一个样本在特征空间中的 **k 个最相似（即特征空间中最邻近）的样本** 中的大多数属于某一个类别，则该样本也属于这个类别。

**示例**：假设你想知道一个人是“运动型”还是“书呆子型”，你可以观察他平时最常接触的 5 个朋友。如果这 5 个朋友中有 4 个是运动型的，那么这个人很可能也是运动型的。这就是 KNN 的思想。

---

#### 1.2 样本相似性的度量

在 KNN 中，“相似性”通常用**距离**来衡量。两个样本在特征空间中的距离越近，它们就越相似。最常用的距离是**欧氏距离（Euclidean Distance）**。

**欧氏距离公式**：

- 二维空间（两个特征）：

 $$
  d = \sqrt{(x_1 - x_2)^2 + (y_1 - y_2)^2}
$$

- 三维空间（三个特征）：

 $$
  d = \sqrt{(x_1 - x_2)^2 + (y_1 - y_2)^2 + (z_1 - z_2)^2}
$$

- n 维空间（n 个特征）：

 $$
  d = \sqrt{\sum_{k=1}^{n} (x_{1 k} - x_{2 k})^2}
$$

其中， $x_{1 k}$ 和 $x_{2 k}$ 分别表示两个样本在第 $k$ 个特征上的取值。

---

### 2. KNN 解决分类问题

#### 2.1 分类问题的处理流程

1. 计算未知样本到**每一个**训练样本的距离。
2. 将训练样本按照距离大小**升序排列**。
3. 取出距离最近的 **K 个**训练样本（即 K 个最近邻）。
4. 对这 K 个样本进行**多数表决**：统计它们中每个类别的出现次数。
5. 将未知样本归类到**出现次数最多的类别**。

---

#### 2.2 示例：使用 KNN 预测电影类型

假设我们有一个电影数据集，包含三部电影类型（喜剧片、动作片、爱情片），特征为“搞笑镜头”、“拥抱镜头”、“打斗镜头”的数量。现在有一部新电影（序号 10），我们想预测它的类型。

**数据表**：

| 序号 | 电影名称 | 搞笑镜头 | 拥抱镜头 | 打斗镜头 | 电影类型 |
|------|----------|----------|----------|----------|----------|
| 1 | 功夫熊猫 | 3 | 90 | 31 | 喜剧片 |
| 2 | 叶问 | 3 | 32 | 65 | 动作片 |
| 3 | 伦敦陷落 | 2 | 35 | 55 | 动作片 |
| 4 | 代理人 | 9 | 38 | 2 | 爱情片 |
| 5 | 新步步惊心 | 8 | 34 | 17 | 爱情片 |
| 6 | 谍影重重 | 5 | 25 | 57 | 动作片 |
| 7 | 功夫熊猫 2 | 3 | 90 | 31 | 喜剧片 |
| 8 | 美人鱼 | 2 | 11 | 75 | 喜剧片 |
| 9 | 宝贝当家 | 4 | 5 | 29 | 喜剧片 |
| 10 | 唐人街探案 | 23 | 3 | 17 | ？ |

**计算距离**：取 K=5。以第 10 部电影与第 1 部电影的距离为例：

$$
d = \sqrt{(23-3)^2 + (3-90)^2 + (17-31)^2}  = \sqrt{20^2 + (-87)^2 + (-14)^2} = \sqrt{400 + 7569 + 196} = \sqrt{8165} \approx 90.36
$$

实际计算时，需要计算与所有 9 部电影的距离，然后取最近的 5 个。假设计算后距离最近的 5 部电影是：

- 第 4 部（爱情片）
- 第 5 部（爱情片）
- 第 7 部（喜剧片）
- 第 8 部（喜剧片）
- 第 9 部（喜剧片）

统计：爱情片 2 票，喜剧片 3 票 → 预测结果为**喜剧片**。

---

### 3. KNN 解决回归问题

KNN 同样可以用于回归（预测连续数值）。例如，预测某人的体重、房价等。

---

#### 3.1 回归问题的处理流程

1. 计算未知样本到每一个训练样本的距离。
2. 将训练样本按照距离大小升序排列。
3. 取出距离最近的 **K 个**训练样本。
4. 把这 K 个样本的**目标值取平均值**。
5. 将该平均值作为未知样本的预测值。

**示例**：预测房价。找到与待预测房屋最相似的 K 个房屋，将这 K 个房屋的实际价格取平均值，作为预测价格。

---

### 4. K 值的选择

**K 值**是 KNN 算法中最重要的超参数。它的选择会显著影响模型性能。

---

#### 4.1 K 值过小（例如 K=1）

- 模型变得复杂，容易受到**噪声点**和**异常点**的影响。
- 如果邻近的样本恰好是异常点，预测就会出错。
- 容易产生**过拟合**：在训练集上表现很好，但在测试集上表现差。

---

#### 4.2 K 值过大（例如 K=N，N 为训练样本总数）

- 模型变得简单，预测结果会趋向于训练集中**样本数量最多的类别**（分类）或全局平均值（回归）。
- 忽略了样本的局部信息，容易产生**欠拟合**。

---

#### 4.3 如何选择最优 K 值？

- 通常采用**交叉验证**（Cross-Validation）和**网格搜索**（Grid Search）来寻找最佳 K 值。
- 一般情况下，K 值取较小的奇数（如 3、5、7），以避免平局（当两个类别票数相等时）。
- 常见的 K 值范围：1 ~ 20。

---

### 5. KNN 的优缺点

| 优点 | 缺点 |
|------|------|
| 简单直观，易于理解 | 计算复杂度高：预测时需要计算到所有训练样本的距离 |
| 无需训练（懒惰学习），可即时添加样本 | 内存消耗大：需要存储全部训练数据 |
| 对异常值不敏感（当 K 较大时） | 特征尺度敏感：需要标准化/归一化 |
| 适用于分类和回归 | 维度灾难：高维空间中距离度量失效 |

---

### 6. 本部分小结

1. **KNN 思想**：一个样本的类别由其最近邻的 K 个样本的多数类别决定。
2. **距离度量**：常用欧氏距离，也可是曼哈顿距离、闵可夫斯基距离等。
3. **分类流程**：找 K 个最近邻 → 多数表决。
4. **回归流程**：找 K 个最近邻 → 平均值。
5. **K 值选择**：过小易过拟合，过大易欠拟合；通常用交叉验证确定。

---

# 第二部分：KNN 算法 API 介绍

在前面的部分，我们学习了 KNN 算法的核心思想和工作流程。这一部分将转向实践：使用 Python 的 `scikit-learn` 库中的 KNN 算法 API，快速实现分类和回归任务。

---

## 1. KNN 分类 API：KNeighborsClassifier

### 1.1 API 简介

`KNeighborsClassifier` 是 scikit-learn 中用于 KNN 分类的类，位于 `sklearn.neighbors` 模块。

**导入方式**：

```python
from sklearn.neighbors import KNeighborsClassifier
```

**构造函数**：

```python
KNeighborsClassifier(n_neighbors=5, weights='uniform', algorithm='auto', leaf_size=30, p=2, metric='minkowski', metric_params=None, n_jobs=None)
```

---

### 1.2 主要参数详解

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `n_neighbors` | int | 5 | K 值，即最近邻的数量。这是最重要的参数。 |
| `weights` | str 或 callable | 'uniform' | 预测时的权重策略。'uniform'（所有邻居权重相同）、'distance'（权重与距离成反比，越近权重越大）或自定义函数。 |
| `algorithm` | str | 'auto' | 计算最近邻的算法。可选：'ball_tree'、'kd_tree'、'brute'（暴力计算）、'auto'（自动选择最快算法）。 |
| `leaf_size` | int | 30 | 当使用 BallTree 或 KDTree 时，叶节点的大小。影响树的构建和查询速度。 |
| `p` | int | 2 | 闵可夫斯基距离的幂参数。p=1 为曼哈顿距离，p=2 为欧氏距离。 |
| `metric` | str | 'minkowski' | 距离度量方式。常用：'euclidean'、'manhattan'、'chebyshev'等。 |
| `n_jobs` | int | None | 并行计算的线程数。-1 表示使用所有 CPU 核心。 |

---

### 1.3 主要方法

| 方法 | 说明 |
|------|------|
| `fit(X, y)` | 训练模型（KNN 是懒惰学习，fit 只是存储数据） |
| `predict(X)` | 预测新样本的类别 |
| `predict_proba(X)` | 返回样本属于各个类别的概率 |
| `score(X, y)` | 返回在给定测试集上的准确率（accuracy） |
| `kneighbors(X)` | 返回每个样本的 K 个最近邻的索引和距离 |

---

### 1.4 完整示例

**问题**：给定一组简单的数据点，特征为 x 值，目标为类别（0 或 1），预测 x=4 的类别。

**数据**：

- X = $[0, 1, 2, 3]$
- y = $[0, 0, 1, 1]$

**代码实现**：

```python
from sklearn.neighbors import KNeighborsClassifier

def knn_classification_demo():
    # 1. 准备数据（特征必须是二维数组）
    X = [[0], [1], [2], [3]]   # 特征值
    y = [0, 0, 1, 1]            # 目标类别
    
    # 2. 实例化KNN分类器（设置K=1）
    estimator = KNeighborsClassifier(n_neighbors=1)
    
    # 3. 训练模型（KNN的训练只是保存数据）
    estimator.fit(X, y)
    
    # 4. 预测新样本
    new_sample = [[4]]
    prediction = estimator.predict(new_sample)
    print(f"预测结果: {prediction[0]}")  # 输出: 1
    
    # 5. 查看最近邻
    distances, indices = estimator.kneighbors(new_sample)
    print(f"最近邻距离: {distances}")
    print(f"最近邻索引: {indices}")
    
# 运行示例
knn_classification_demo()
```

**运行结果解释**：

- K=1 时，x=4 的最近邻是 x=3（距离为 1），x=3 的类别是 1，所以预测为 1。
- 如果设置 K=3，则最近邻为 x=3（类别 1）、x=2（类别 1）、x=1（类别 0），多数为 1，预测仍为 1。

---

## 2. KNN 回归 API：KNeighborsRegressor

### 2.1 API 简介

`KNeighborsRegressor` 是 scikit-learn 中用于 KNN 回归的类，同样位于 `sklearn.neighbors` 模块。

**导入方式**：

```python
from sklearn.neighbors import KNeighborsRegressor
```

**构造函数**：

```python
KNeighborsRegressor(n_neighbors=5, weights='uniform', algorithm='auto', leaf_size=30, p=2, metric='minkowski', metric_params=None, n_jobs=None)
```

参数含义与分类器基本相同，不同的是 `predict` 方法返回的是 K 个邻居的目标值的平均值（或加权平均值）。

---

### 2.2 主要方法

| 方法            | 说明             |
| ------------- | -------------- |
| `fit(X, y)`   | 训练模型           |
| `predict(X)`  | 预测新样本的目标值（连续值） |
| `score(X, y)` | 返回决定系数 $R^2$ |

---

### 2.3 完整示例

**问题**：给定 4 个样本，每个样本有 3 个特征，目标值为连续数值。预测新样本 $[3, 11, 10]$ 的目标值。

**数据**：

| 特征 1 | 特征 2 | 特征 3 | 目标值 |
|-------|-------|-------|--------|
| 0 | 0 | 1 | 0.1 |
| 1 | 1 | 0 | 0.2 |
| 3 | 10 | 10 | 0.3 |
| 4 | 11 | 12 | 0.4 |

**代码实现**：

```python
from sklearn.neighbors import KNeighborsRegressor

def knn_regression_demo():
    # 1. 准备数据
    X = [[0, 0, 1], [1, 1, 0], [3, 10, 10], [4, 11, 12]]
    y = [0.1, 0.2, 0.3, 0.4]
    
    # 2. 实例化KNN回归器（设置K=2）
    estimator = KNeighborsRegressor(n_neighbors=2)
    
    # 3. 训练模型
    estimator.fit(X, y)
    
    # 4. 预测新样本
    new_sample = [[3, 11, 10]]
    prediction = estimator.predict(new_sample)
    print(f"预测值: {prediction[0]}")
    
    # 5. 查看最近邻
    distances, indices = estimator.kneighbors(new_sample)
    print(f"最近邻距离: {distances}")
    print(f"最近邻索引: {indices}")
    print(f"最近邻的目标值: {[y[i] for i in indices[0]]}")
    print(f"平均值: {sum([y[i] for i in indices[0]]) / len(indices[0])}")

knn_regression_demo()
```

**运行结果解释**：

- 计算新样本[3,11,10]到每个训练样本的距离（欧氏距离）。
- 距离最近的 2 个样本是第 3 个（索引 2，目标 0.3）和第 4 个（索引 3，目标 0.4）。
- 预测值 = (0.3 + 0.4) / 2 = 0.35。

---

## 3. KNN 算法的注意事项

### 3.1 特征尺度问题

KNN 算法使用距离来度量相似性。如果不同特征的尺度差异很大（例如一个特征范围 0~1，另一个特征范围 0~10000），那么大尺度特征会主导距离计算，导致模型失效。

**解决方案**：对特征进行**归一化**或**标准化**，使所有特征处于同一量级。

具体方法将在第三部分详细讲解。

---

### 3.2 懒惰学习的含义

KNN 是一种**懒惰学习（Lazy Learning）**算法，也称为**基于实例的学习（Instance-based Learning）**。它的特点：

- **没有显式的训练过程**：`fit` 方法只是存储数据，并不学习参数。
- **预测时计算量大**：每次预测都需要计算到所有训练样本的距离。
- **可以随时添加新数据**：不需要重新训练。

---

### 3.3 维度灾难

当特征维度很高时，KNN 的性能会急剧下降。因为在高维空间中，样本之间的距离趋向于相等（所有点都变得“相似”）。这就是所谓的**维度灾难（Curse of Dimensionality）**。

**应对策略**：

- 使用特征选择或降维（如 PCA）减少特征数。
- 增加训练样本量（指数级增长才能维持距离的区分度）。

---

## 4. API 参数调优建议

| 参数 | 调优建议 |
|------|----------|
| `n_neighbors` | 最重要的参数。用小范围尝试（如 3,5,7,9），结合交叉验证选择最佳值。 |
| `weights` | 如果数据分布均匀，用'uniform'；如果希望近邻影响更大，用'distance'。 |
| `algorithm` | 一般用'auto'自动选择。当样本量很大时，可手动指定'kd_tree'或'ball_tree'加速。 |
| `p` | 通常用 2（欧氏距离）。如果特征之间存在相关性，可尝试曼哈顿距离（p=1）。 |
| `metric` | 大多数情况用欧氏距离。文本数据可能用余弦相似度。 |

---

## 5. 本部分小结

1. **分类 API**：`KNeighborsClassifier`，通过多数表决确定类别。
2. **回归 API**：`KNeighborsRegressor`，通过 K 个邻居的目标值平均值进行预测。
3. **核心参数**：`n_neighbors`（K 值）最重要；`weights` 控制权重策略；`algorithm` 控制搜索算法。
4. **注意事项**：KNN 对特征尺度敏感，需要进行标准化/归一化；懒惰学习导致预测耗时。
5. **代码示例**：分别演示了分类和回归的完整使用流程。

---

# 第三部分：特征预处理

在前面的部分中，我们提到 KNN 算法对特征的尺度非常敏感。本部分将详细讲解为什么需要进行特征预处理，以及两种最常用的方法：**归一化**和**标准化**。最后，通过**鸢尾花分类**案例，演示完整的 KNN 建模流程。

---

## 1. 为什么需要特征预处理

### 1.1 问题引入

假设我们有一个健康数据集，包含三个特征：身高（米）、体重（公斤）、视力（0.2~2.0）。目标是根据这些特征判断一个人是否健康（健康=1，不健康=2）。

| 编号 | 身高(m) | 体重(kg) | 视力 | 健康状况 |
|------|---------|----------|------|----------|
| 1 | 1.70 | 67 | 1.5 | 1 |
| 2 | 1.71 | 80 | 0.8 | 2 |
| 3 | 1.75 | 70 | 1.5 | 1 |
| 4 | 1.76 | 68 | 1.2 | 1 |
| 5 | 1.80 | 80 | 1.8 | 1 |
| 6 | 1.81 | 90 | 0.6 | 2 |

**问题**：计算两个样本之间的距离时，体重特征的数值（60~90）远大于身高（1.7~1.8）和视力（0.6~1.8）。因此，体重会主导距离计算结果，身高和视力的影响几乎可以忽略。这显然不合理——体重不应该有这么大的“权重”。

**解决方案**：将不同量纲的特征变换到相同的尺度范围内，这就是特征预处理的核心目的。

---

### 1.2 特征预处理的作用

- 消除不同量纲对模型的影响，使每个特征公平参与距离计算。
- 加快梯度下降等优化算法的收敛速度（对于非 KNN 算法也适用）。
- 提高模型的精度和稳定性。

---

## 2. 归一化（Normalization）

### 2.1 原理

归一化是将原始数据线性变换到某个指定区间（通常是 **[0, 1]** 或 **[-1, 1]**）的方法。最常用的是** Min-Max 归一化**。

**计算公式**：

$$
X' = \frac{x - \min}{\max - \min}
$$

$$
X'' = X' \times (mx - mi) + mi
$$

其中：

- $x$ 是原始数据
- $\min$ 是特征列的最小值
- $\max$ 是特征列的最大值
- $mi$ 是目标区间的最小值（默认 0）
- $mx$ 是目标区间的最大值（默认 1）

当目标区间为 [0,1] 时，公式简化为：

$$
X_{norm} = \frac{x - \min}{\max - \min}
$$

---

### 2.2 计算示例

假设某特征的值：[90, 60, 75]，我们将其归一化到 [0,1]：

- $\min = 60$ ， $\max = 90$

- 第一个值 90： $(90 - 60) / (90 - 60) = 30 / 30 = 1.0$
- 第二个值 60： $(60 - 60) / 30 = 0$
- 第三个值 75： $(75 - 60) / 30 = 15 / 30 = 0.5$

结果：[1.0, 0, 0.5]

---

### 2.3 归一化 API：MinMaxScaler

**导入**：

```python
from sklearn.preprocessing import MinMaxScaler
```

**构造函数**：

```python
MinMaxScaler(feature_range=(0, 1), copy=True)
```

- `feature_range`：指定缩放的目标区间，默认 (0,1)

**主要方法**：

| 方法 | 说明 |
|------|------|
| `fit(X)` | 计算训练数据的最小值和最大值 |
| `transform(X)` | 使用计算好的最小值和最大值进行缩放 |
| `fit_transform(X)` | 先 fit 再 transform，一步完成 |

**示例代码**：

```python
import numpy as np
from sklearn.preprocessing import MinMaxScaler

def minmax_scaler_demo():
    # 1. 准备数据（每列是一个特征，每行是一个样本）
    data = [[90, 2, 10, 40],
            [60, 4, 15, 45],
            [75, 3, 13, 46]]
    
    # 2. 实例化归一化器（目标区间默认为[0,1]）
    scaler = MinMaxScaler()
    
    # 3. 对数据进行归一化
    data_scaled = scaler.fit_transform(data)
    
    print("原始数据:")
    print(np.array(data))
    print("\n归一化后的数据:")
    print(data_scaled)
    print("\n各列最小值:", scaler.data_min_)
    print("各列最大值:", scaler.data_max_)

minmax_scaler_demo()
```

**输出示例**：

```python
原始数据:
[[90  2 10 40]
 [60  4 15 45]
 [75  3 13 46]]

归一化后的数据:
[[1.   0.   0.   0.  ]
 [0.   1.   1.   0.6]
 [0.5  0.5  0.4  1.  ]]
```

---

### 2.4 归一化的优缺点

| 优点 | 缺点 |
|------|------|
| 计算简单，容易理解 | 受异常值影响极大 |
| 将数据固定到明确区间 | 如果新数据超出原 min/max，需要重新计算 |
| 适合需要严格边界的场景 | 鲁棒性较差 |

**应用场景**：传统的小规模精确数据，或者对数据范围有明确要求的场景（如图像像素值归一化到 0-255）。

---

## 3. 标准化（Standardization）

### 3.1 原理

标准化是将原始数据转换为**均值为 0，标准差为 1** 的标准正态分布数据。它不要求数据有固定的上下界，而是通过减去均值、除以标准差来实现。

**计算公式**：

$$
X' = \frac{x - \mu}{\sigma}
$$

其中：

- $\mu$ 是特征列的均值（mean）
- $\sigma$ 是特征列的标准差（standard deviation）
- 标准差： $\sigma = \sqrt{\frac{1}{n}\sum_{i=1}^{n}(x_i - \mu)^2}$

---

### 3.2 标准差与正态分布

**方差**：衡量数据离散程度的指标，计算每个数据与均值的差的平方的平均值。

$$
\sigma^2 = \frac{\sum_{i=1}^{n}(x_i - \mu)^2}{n}
$$

**标准差**：方差的平方根，将量纲恢复到原始数据的单位。

**正态分布的 3σ法则（68-95-99.7 法则）**：

- 约 68%的数据落在 $[\mu - \sigma, \mu + \sigma]$ 区间内
- 约 95%的数据落在 $[\mu - 2\sigma, \mu + 2\sigma]$ 区间内
- 约 99.7%的数据落在 $[\mu - 3\sigma, \mu + 3\sigma]$ 区间内

标准化后，数据变成标准正态分布 $N(0, 1)$ ，大部分值在-3 到 3 之间。

实际使用 $3\sigma$ 法则：异常检测

---

### 3.3 计算示例

某特征值：[90, 60, 75]

- 均值 $\mu = (90+60+75)/3 = 75$
- 方差 $\sigma^2 = [(90-75)^2 + (60-75)^2 + (75-75)^2] / 3 = (225 + 225 + 0) / 3 = 150$
- 标准差 $\sigma = \sqrt{150} \approx 12.247$

标准化后：

- (90 - 75) / 12.247 ≈ 1.22
- (60 - 75) / 12.247 ≈ -1.22
- (75 - 75) / 12.247 = 0

结果：[1.22, -1.22, 0]

---

### 3.4 标准化 API：StandardScaler

**导入**：

```python
from sklearn.preprocessing import StandardScaler
```

**构造函数**：

```python
StandardScaler(copy=True, with_mean=True, with_std=True)
```

- `with_mean`：是否将均值中心化为 0（一般设为 True）
- `with_std`：是否将方差缩放到 1（一般设为 True）

**主要方法**：

| 方法 | 说明 |
|------|------|
| `fit(X)` | 计算训练数据的均值和标准差 |
| `transform(X)` | 使用计算好的均值和标准差进行缩放 |
| `fit_transform(X)` | 先 fit 再 transform |
| `mean_` | 属性，各特征的均值 |
| `var_` | 属性，各特征的方差（注意是方差，不是标准差） |

**示例代码**：

```python
from sklearn.preprocessing import StandardScaler

def standard_scaler_demo():
    # 1. 准备数据
    data = [[90, 2, 10, 40],
            [60, 4, 15, 45],
            [75, 3, 13, 46]]
    
    # 2. 实例化标准化器
    scaler = StandardScaler()
    
    # 3. 对数据进行标准化
    data_scaled = scaler.fit_transform(data)
    
    print("原始数据:")
    for row in data:
        print(row)
    print("\n标准化后的数据:")
    for row in data_scaled:
        print([f"{x:.4f}" for x in row])
    print("\n各列均值:", scaler.mean_)
    print("各列标准差:", np.sqrt(scaler.var_))

standard_scaler_demo()
```

**输出示例**：

```python
原始数据:
[90, 2, 10, 40]
[60, 4, 15, 45]
[75, 3, 13, 46]

标准化后的数据:
['1.2247', '-1.2247', '-1.2978', '-1.2247']
['-1.2247', '1.2247', '0.6489', '0.0000']
['0.0000', '0.0000', '0.6489', '1.2247']

各列均值: [75.  3. 12.66666667 43.66666667]
各列标准差: [12.24744871  0.81649658  2.05480467  2.49443826]
```

---

## 4. 归一化 vs 标准化

### 4.1 对比表格

| 对比维度 | 归一化 (MinMaxScaler) | 标准化 (StandardScaler) |
|----------|----------------------|--------------------------|
| 原理 | 线性变换到固定区间 [0,1] | 转换为均值为 0、标准差为 1 的分布 |
| 输出范围 | 固定边界（如 0~1） | 无固定边界，多数值在-3~3 之间 |
| 受异常值影响 | 非常敏感（异常值会改变 min/max） | 影响较小（均值和标准差受异常值影响相对小） |
| 数据分布要求 | 无要求 | 数据大致服从正态分布时效果更好 |
| 适用场景 | 需要严格边界、小规模精确数据 | 现代机器学习（尤其是深度学习）默认选择 |
| API | `MinMaxScaler` | `StandardScaler` |

---

### 4.2 如何选择

- **优先选择标准化**：大多数情况下，标准化更稳健，尤其是数据量较大、可能存在异常值时。
- **使用归一化的场景**：
  - 需要将数据严格限定在某个区间（如图像像素值[0,255]）
  - 算法本身对输入范围有要求（如 SVM 的 RBF 核）
  - 数据分布本身近似均匀，无异常值

**工程建议**：在实际项目中，如果不确定，可以先尝试标准化。KNN 算法通常使用标准化效果更好。

---

## 5. 鸢尾花分类案例

现在，我们将综合运用前面学习的内容，完成一个完整的 KNN 分类任务：**鸢尾花（Iris）种类识别**。

---

### 5.1 数据集介绍

鸢尾花数据集是机器学习中最经典的分类数据集之一，由 R.A. Fisher 在 1936 年收集。包含 150 个样本，每个样本有 4 个特征，目标是对应鸢尾花的 3 个种类。

**特征**（单位：厘米）：

- `sepal length (cm)`：花萼长度
- `sepal width (cm)`：花萼宽度
- `petal length (cm)`：花瓣长度
- `petal width (cm)`：花瓣宽度

**目标类别**：

- 0：Setosa（山鸢尾）
- 1：Versicolor（变色鸢尾）
- 2：Virginica（维吉尼亚鸢尾）

---

### 5.2 加载数据集并探索

```python
from sklearn.datasets import load_iris
import pandas as pd
import seaborn as sns
import matplotlib.pyplot as plt

# 1. 加载数据集
iris = load_iris()

# 2. 查看数据集基本信息
print("特征名称:", iris.feature_names)
print("目标类别:", iris.target_names)
print("特征矩阵形状:", iris.data.shape)
print("前5个样本:\n", iris.data[:5])
print("前5个目标值:", iris.target[:5])

# 3. 转换为DataFrame便于分析
df = pd.DataFrame(iris.data, columns=iris.feature_names)
df['species'] = iris.target
df['species_name'] = df['species'].map({0: 'setosa', 1: 'versicolor', 2: 'virginica'})

print("\n数据集前5行:")
print(df.head())

# 4. 数据可视化：使用seaborn的散点图矩阵
sns.pairplot(df, hue='species_name', vars=iris.feature_names)
plt.suptitle("鸢尾花特征散点图矩阵", y=1.02)
plt.show()

# 5. 单独绘制花瓣宽度与花萼长度的关系
plt.figure(figsize=(8, 6))
sns.scatterplot(data=df, x='sepal length (cm)', y='petal width (cm)', hue='species_name', style='species_name', s=100)
plt.title('花萼长度 vs 花瓣宽度')
plt.show()
```

**数据探索结论**：

- 从散点图可以看出，Setosa 类别与其他两类在花瓣特征上区分明显。
- Versicolor 和 Virginica 在特征空间中有部分重叠，分类有一定难度。
- 特征之间存在相关性，但整体可分性较好。

---

### 5.3 KNN 分类完整流程

按照机器学习标准流程：**数据加载 → 数据划分 → 特征预处理（标准化） → 模型训练 → 模型评估**

```python
from sklearn.datasets import load_iris
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.neighbors import KNeighborsClassifier
from sklearn.metrics import accuracy_score, classification_report

def iris_knn_classification():
    # ==================== 1. 获取数据 ====================
    iris = load_iris()
    X = iris.data      # 特征 (150, 4)
    y = iris.target    # 目标 (150,)
    
    # ==================== 2. 数据划分 ====================
    # 将数据集分为训练集（70%）和测试集（30%），固定随机种子保证结果可重复
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.3, random_state=22
    )
    print(f"训练集样本数: {len(X_train)}")
    print(f"测试集样本数: {len(X_test)}")
    
    # ==================== 3. 特征预处理（标准化） ====================
    # 标准化对KNN非常重要，消除量纲影响
    scaler = StandardScaler()
    # 训练集：拟合 + 转换
    X_train_scaled = scaler.fit_transform(X_train)
    # 测试集：只转换（使用训练集的均值和标准差）
    X_test_scaled = scaler.transform(X_test)
    
    print(f"\n标准化前训练集均值: {X_train.mean(axis=0)}")
    print(f"标准化后训练集均值: {X_train_scaled.mean(axis=0)}")
    print(f"标准化后训练集标准差: {X_train_scaled.std(axis=0)}")
    
    # ==================== 4. 模型训练 ====================
    # 使用KNN分类器，K值取3
    knn = KNeighborsClassifier(n_neighbors=3)
    knn.fit(X_train_scaled, y_train)
    
    # ==================== 5. 模型预测与评估 ====================
    # 在训练集上评估（可用来检查是否过拟合）
    y_train_pred = knn.predict(X_train_scaled)
    train_acc = accuracy_score(y_train, y_train_pred)
    
    # 在测试集上评估（泛化能力）
    y_test_pred = knn.predict(X_test_scaled)
    test_acc = accuracy_score(y_test, y_test_pred)
    
    print(f"\n训练集准确率: {train_acc:.4f}")
    print(f"测试集准确率: {test_acc:.4f}")
    
    # 详细分类报告（精确率、召回率、F1值）
    print("\n分类报告:")
    print(classification_report(y_test, y_test_pred, target_names=iris.target_names))
    
    # ==================== 6. 新样本预测 ====================
    # 假设有一朵新花：花萼长5.1cm，花萼宽3.5cm，花瓣长1.4cm，花瓣宽0.2cm
    new_flower = [[5.1, 3.5, 1.4, 0.2]]
    new_flower_scaled = scaler.transform(new_flower)
    prediction = knn.predict(new_flower_scaled)
    print(f"\n新花预测类别: {iris.target_names[prediction[0]]}")

# 运行
iris_knn_classification()
```

**预期输出**（实际数值可能因随机种子略有差异）：

```python
训练集样本数: 105
测试集样本数: 45

标准化前训练集均值: [5.85 3.06 3.76 1.20]
标准化后训练集均值: [ 0.00000000e+00  1.11022302e-16 -1.94289029e-16 -1.11022302e-16]
标准化后训练集标准差: [1. 1. 1. 1.]

训练集准确率: 0.9524
测试集准确率: 0.9556

分类报告:
              precision    recall  f1-score   support
      setosa       1.00      1.00      1.00        14
  versicolor       0.94      0.94      0.94        17
   virginica       0.93      0.93      0.93        14

    accuracy                           0.96        45
   macro avg       0.96      0.96      0.96        45
weighted avg       0.96      0.96      0.96        45

新花预测类别: setosa
```

---

### 5.4 结果解读

- **训练集准确率 95.24%，测试集准确率 95.56%**：两者接近且都很高，说明模型没有过拟合，泛化能力良好。
- **分类报告**：每个类别的精确率、召回率、F 1 值都在 0.93 以上，特别是 Setosa 类别达到了 1.0（完美分类）。
- **新花预测**：输入的花萼长度 5.1 cm、花萼宽度 3.5 cm、花瓣长度 1.4 cm、花瓣宽度 0.2 cm，模型预测为 Setosa（山鸢尾），这符合领域知识——Setosa 的花瓣通常较短小。

---

### 5.5 案例要点总结

| 步骤 | 关键操作 | 说明 |
|------|----------|------|
| 数据加载 | `load_iris()` | 获取特征矩阵 X 和目标向量 y |
| 数据划分 | `train_test_split()` | 训练集用于拟合，测试集用于评估 |
| 特征预处理 | `StandardScaler` | 标准化所有特征，消除量纲影响 |
| 模型训练 | `KNeighborsClassifier(n_neighbors=3)` | 实例化 KNN 分类器并拟合 |
| 模型评估 | `accuracy_score()`、`classification_report()` | 准确率 + 精确率/召回率/F 1 |
| 新样本预测 | `scaler.transform()` + `predict()` | 新样本必须先使用训练集的 scaler 转换 |

---

## 6. 本部分小结

1. **特征预处理的必要性**：KNN 基于距离，不同量纲的特征会导致距离计算失真。
2. **归一化**：将数据线性缩放到 [0,1] 区间，使用 `MinMaxScaler`。受异常值影响大。
3. **标准化**：将数据转换为均值为 0、标准差为 1 的标准正态分布，使用 `StandardScaler`。更稳健，现代机器学习默认选择。
4. **鸢尾花案例**：完整演示了数据加载、探索、划分、标准化、KNN 训练、评估的流程。测试集准确率可达 95%以上。
5. **关键注意事项**：标准化时，测试集必须使用训练集的均值和标准差（`transform`），不能重新 `fit`。

---

# 第四部分：超参数选择方法（交叉验证与网格搜索）

在第三部分的鸢尾花分类案例中，我们直接设置了 `n_neighbors=3`，但为什么是 3？如果我们设置 K=5 或 K=7 会怎样？不同的超参数会导致模型性能的差异。**如何科学地选择最优超参数**，正是本部分要解决的问题。

---

## 1. 交叉验证（Cross-Validation）

### 1.1 为什么需要交叉验证

在机器学习中，我们通常将数据集划分为**训练集**和**测试集**。训练集用于训练模型，测试集用于评估泛化能力。但这种简单的划分存在几个问题：

- **结果依赖于随机划分**：如果某次划分恰好将难分类的样本都放入了测试集，模型评估结果可能偏低；反之可能偏高。单次划分的结果不够稳定。
- **浪费数据**：如果数据量本身就不大，分出 20%作为测试集，模型就损失了这 20%的数据进行训练。
- **无法充分利用数据**：更好的做法是让每个样本都既参与训练又参与验证。

**交叉验证**正是为了解决这些问题而设计的。

---

### 1.2 交叉验证的原理

**K 折交叉验证（K-Fold Cross-Validation）** 是最常用的交叉验证方法。步骤如下：

1. 将训练集（注意：不是全部数据集）均匀分成 **K 份**（通常 K=5 或 K=10）。
2. 对于第 1 次迭代：将第 1 份作为**验证集（Validation Set）**，其余 K-1 份作为**训练集**，训练模型并计算验证集上的准确率（或其他指标）。
3. 对于第 2 次迭代：将第 2 份作为验证集，其余 K-1 份作为训练集，训练模型并计算准确率。
4. 重复这个过程，直到每一份都做过一次验证集。
5. 计算 K 次验证准确率的**平均值**，作为该模型（该组超参数）的最终得分。

**图示思想**：

```python
数据集划分为 K 份（例如 K=5）：
[1] [2] [3] [4] [5]

第1轮：训练集 = [2,3,4,5] ，验证集 = [1] → 得分 s1
第2轮：训练集 = [1,3,4,5] ，验证集 = [2] → 得分 s2
第3轮：训练集 = [1,2,4,5] ，验证集 = [3] → 得分 s3
第4轮：训练集 = [1,2,3,5] ，验证集 = [4] → 得分 s4
第5轮：训练集 = [1,2,3,4] ，验证集 = [5] → 得分 s5

最终交叉验证得分 = (s1+s2+s3+s4+s5) / 5
```

---

### 1.3 交叉验证的优点

| 优点 | 说明 |
|------|------|
| **更稳定可靠** | 多个验证集的平均得分比单次划分更能反映模型真实性能 |
| **充分利用数据** | 每个样本都参与了训练（在 K-1 轮中）和验证（在 1 轮中） |
| **减少过拟合风险** | 验证集从未参与训练，能有效检测过拟合 |
| **可用于模型选择** | 比较不同超参数下的交叉验证得分，选择最佳参数 |

---

### 1.4 交叉验证的注意事项

- **K 值选择**：通常取 5 或 10。K 越大，评估结果越准确，但计算开销也越大。
- **分层抽样**：对于分类问题，建议使用**分层 K 折（Stratified K-Fold）**，保证每一折中各类别的比例与原始数据集大致相同。Scikit-learn 中的 `cross_val_score` 默认对分类任务使用分层。
- **随机打乱**：在划分前应打乱数据，避免因原始顺序导致偏差。

---

## 2. 网格搜索（Grid Search）

### 2.1 为什么需要网格搜索

KNN 算法至少有一个超参数 `n_neighbors`（K 值）。此外还有 `weights`、`p`（距离类型）等。我们需要为这些超参数找到最佳组合。**手动尝试**会产生大量实验：

- 假设 K 有 5 个候选值，weights 有 2 个候选值，p 有 2 个候选值，总组合数 = 5×2×2 = 20 种。
- 每种组合如果用 5 折交叉验证，就需要训练 20×5 = 100 个模型。

手动完成非常繁琐。**网格搜索**正是自动化这一过程的工具。

---

### 2.2 网格搜索的原理

网格搜索（Grid Search）是一种**穷举搜索**方法：

1. 定义一个超参数**网格（Grid）**，即每个超参数给出若干候选值。
2. 对于每一种参数组合，使用交叉验证评估模型性能。
3. 记录每一种组合的交叉验证平均得分。
4. 选择得分最高的参数组合作为最优超参数。

**示例网格**：

```python
param_grid = {
    'n_neighbors': [1, 3, 5, 7, 9],
    'weights': ['uniform', 'distance'],
    'p': [1, 2]
}
```

共有 5×2×2 = 20 种组合，每种组合进行 5 折交叉验证，共训练 100 个模型。

---

### 2.3 网格搜索 + 交叉验证 API：GridSearchCV

Scikit-learn 提供了 `GridSearchCV` 类，它将网格搜索和交叉验证无缝集成。

**导入**：

```python
from sklearn.model_selection import GridSearchCV
```

**构造函数**：

```python
GridSearchCV(estimator, param_grid, cv=None, scoring=None, n_jobs=None, verbose=0, ...)
```

| 参数                   | 类型                              | 默认值   | 说明                                  |
| -------------------- | ------------------------------- | ----- | ----------------------------------- |
| `estimator`          | estimator object                | 必填    | 要调参的模型实例（如 KNeighborsClassifier()）  |
| `param_grid`         | dict 或 list of dict             | 必填    | 超参数网格。键为参数名，值为候选列表。                 |
| `cv`                 | int, cross-validation generator | None  | 交叉验证折数（如 5）或自定义交叉验证器                |
| `scoring`            | str, callable                   | None  | 评估指标。如 'accuracy'、'f 1'、'roc_auc' 等 |
| `n_jobs`             | int                             | None  | 并行任务数。 -1 表示使用所有 CPU 核心             |
| `verbose`            | int                             | 0     | 控制输出详细程度。越大信息越多                     |
| `return_train_score` | bool                            | False | 是否返回训练集得分（可用于检查过拟合）                 |

**主要属性（fit 后可用）**：

| 属性                | 说明                            |
| ----------------- | ----------------------------- |
| `best_params_`    | 最佳参数组合（字典）                    |
| `best_score_`     | 最佳参数下的交叉验证平均得分                |
| `best_estimator_` | 使用最佳参数训练的模型对象                 |
| `cv_results_`     | 所有参数组合的详细结果（可转为 DataFrame 分析） |
| `best_index_`     | 最佳参数在 `cv_results_` 中的索引      |

**主要方法**：

- `fit(X, y)`：执行网格搜索 + 交叉验证。
- `predict(X)`：使用最优模型进行预测。
- `score(X, y)`：返回最优模型在给定数据上的准确率。

---

## 3. 鸢尾花分类 + 网格搜索完整案例

现在，我们将使用 `GridSearchCV` 为鸢尾花 KNN 模型寻找最优的 K 值和 weights 参数。

---

### 3.1 代码实现

```python
from sklearn.datasets import load_iris
from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.preprocessing import StandardScaler
from sklearn.neighbors import KNeighborsClassifier
from sklearn.metrics import classification_report, accuracy_score
import pandas as pd

def iris_grid_search_demo():
    # ==================== 1. 加载数据 ====================
    iris = load_iris()
    X = iris.data
    y = iris.target
    
    # ==================== 2. 划分数据集（训练集+测试集） ====================
    # 注意：测试集在整个调参过程中不能碰，最终只用于评估最优模型
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=22
    )
    print(f"训练集样本数: {X_train.shape[0]}")
    print(f"测试集样本数: {X_test.shape[0]}")
    
    # ==================== 3. 特征标准化 ====================
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    
    # ==================== 4. 定义基础模型和超参数网格 ====================
    # 基础 KNN 模型（暂时不设 n_neighbors）
    knn = KNeighborsClassifier()
    
    # 定义要搜索的超参数网格
    param_grid = {
        'n_neighbors': [1, 3, 5, 7, 9, 11],   # K 值候选
        'weights': ['uniform', 'distance'],    # 权重策略
        'p': [1, 2]                           # 1:曼哈顿距离，2:欧氏距离
    }
    
    # ==================== 5. 实例化 GridSearchCV ====================
    # 使用 5 折交叉验证，评分指标为 accuracy，使用所有 CPU 核心
    grid_search = GridSearchCV(
        estimator=knn,           # 要调参的模型
        param_grid=param_grid,   # 超参数网格
        cv=5,                    # 5折交叉验证
        scoring='accuracy',      # 评估指标
        n_jobs=-1,               # 并行计算
        verbose=1                # 显示进度
    )
    
    # ==================== 6. 执行网格搜索 ====================
    # 注意：这里只传入训练集！测试集在调参过程中不参与。
    grid_search.fit(X_train_scaled, y_train)
    
    # ==================== 7. 查看结果 ====================
    print("\n" + "="*50)
    print("网格搜索完成！")
    print("="*50)
    print(f"最佳参数组合: {grid_search.best_params_}")
    print(f"最佳交叉验证准确率: {grid_search.best_score_:.4f}")
    print(f"最佳模型: {grid_search.best_estimator_}")
    
    # 详细结果（转换为 DataFrame 查看）
    cv_results = pd.DataFrame(grid_search.cv_results_)
    # 只显示关键列
    result_cols = ['param_n_neighbors', 'param_weights', 'param_p', 
                   'mean_test_score', 'std_test_score', 'rank_test_score']
    print("\n各参数组合的交叉验证结果（前5行）:")
    print(cv_results[result_cols].head())
    
    # 找出所有组合中 rank_test_score == 1 的（即最佳组合）
    best_rows = cv_results[cv_results['rank_test_score'] == 1]
    print("\n所有最佳参数组合（可能有多个并列）:")
    print(best_rows[result_cols])
    
    # ==================== 8. 使用最优模型在测试集上评估 ====================
    best_knn = grid_search.best_estimator_
    y_test_pred = best_knn.predict(X_test_scaled)
    test_accuracy = accuracy_score(y_test, y_test_pred)
    print(f"\n最优模型在测试集上的准确率: {test_accuracy:.4f}")
    print("\n测试集分类报告:")
    print(classification_report(y_test, y_test_pred, target_names=iris.target_names))
    
    # ==================== 9. 对比：如果不调参（默认K=5）的效果 ====================
    default_knn = KNeighborsClassifier()  # n_neighbors=5, weights='uniform', p=2
    default_knn.fit(X_train_scaled, y_train)
    default_pred = default_knn.predict(X_test_scaled)
    default_acc = accuracy_score(y_test, default_pred)
    print(f"\n默认参数模型（K=5, uniform, p=2）测试集准确率: {default_acc:.4f}")
    
    return grid_search

# 运行
iris_grid_search_demo()
```

---

### 3.2 输出示例及解读

```python
训练集样本数: 120
测试集样本数: 30
Fitting 5 folds for each of 6*2*2 = 24 candidates, totalling 120 fits

==================================================
网格搜索完成！
==================================================
最佳参数组合: {'n_neighbors': 5, 'p': 2, 'weights': 'uniform'}
最佳交叉验证准确率: 0.9667
最佳模型: KNeighborsClassifier(n_neighbors=5, p=2, weights='uniform')

各参数组合的交叉验证结果（前5行）:
   param_n_neighbors param_weights param_p  mean_test_score  std_test_score  rank_test_score
0                  1        uniform       1         0.950000        0.050000                4
1                  1        uniform       2         0.966667        0.047140                1
2                  1       distance       1         0.950000        0.050000                4
3                  1       distance       2         0.966667        0.047140                1
4                  3        uniform       1         0.958333        0.043301                3

最优模型在测试集上的准确率: 0.9333

测试集分类报告:
              precision    recall  f1-score   support
      setosa       1.00      1.00      1.00        10
  versicolor       0.90      0.90      0.90        10
   virginica       0.90      0.90      0.90        10

    accuracy                           0.93        30
   macro avg       0.93      0.93      0.93        30
weighted avg       0.93      0.93      0.93        30

默认参数模型（K=5, uniform, p=2）测试集准确率: 0.9333
```

**解读**：

- 最佳参数为 `n_neighbors=5, p=2, weights='uniform'`，交叉验证平均准确率 96.67%。
- 默认参数（K=5）其实也是这个组合，说明默认值已经足够好。但在其他数据集中，调参可能带来显著提升。
- 测试集准确率为 93.33%，略低于交叉验证得分，属于正常波动。
- 并列的最佳组合：`n_neighbors=1` 搭配 `p=2, weights='uniform'` 也同样得到了 96.67% 的交叉验证分数，但 K=1 容易过拟合，实际通常选择稍大的 K。

---

### 3.3 可视化调参结果（可选）

为了更直观地理解不同 K 值对准确率的影响，可以绘制折线图：

```python
import matplotlib.pyplot as plt

def plot_k_vs_accuracy(cv_results):
    # 提取 weights='uniform' 且 p=2 的结果
    uniform_p2 = cv_results[(cv_results['param_weights'] == 'uniform') & (cv_results['param_p'] == 2)]
    uniform_p2 = uniform_p2.sort_values('param_n_neighbors')
    
    plt.figure(figsize=(8, 5))
    plt.plot(uniform_p2['param_n_neighbors'], uniform_p2['mean_test_score'], 'bo-', linewidth=2, markersize=8)
    plt.fill_between(uniform_p2['param_n_neighbors'], 
                     uniform_p2['mean_test_score'] - uniform_p2['std_test_score'],
                     uniform_p2['mean_test_score'] + uniform_p2['std_test_score'], 
                     alpha=0.2, color='blue')
    plt.xlabel('K值 (n_neighbors)')
    plt.ylabel('交叉验证准确率')
    plt.title('K值对模型准确率的影响 (weights=uniform, p=2)')
    plt.xticks(uniform_p2['param_n_neighbors'])
    plt.grid(True, linestyle='--', alpha=0.6)
    plt.show()

# 在 grid_search 之后调用
# cv_results = pd.DataFrame(grid_search.cv_results_)
# plot_k_vs_accuracy(cv_results)
```

从图中可以看到，K=1 时准确率很高但方差较大（可能不稳定），K=3、5、7 都很接近，K 再增大准确率逐渐下降（欠拟合）。

---

## 4. 超参数选择的注意事项

### 4.1 防止数据泄露（Data Leakage）

- **绝对不能用测试集进行调参**。测试集只能在整个流程的最后使用一次，评估最优模型的泛化能力。
- 交叉验证是在**训练集**内部进行的，不会用到测试集。
- 标准化时，`StandardScaler` 需要在训练集上 `fit`，然后转换训练集和测试集。在交叉验证内部，`GridSearchCV` 会自动处理：对于每一折，它会在该折的训练集上重新 `fit` 标准化器吗？**注意**：如果你在外部先对整个训练集做了标准化，然后传给 `GridSearchCV`，那么标准化器已经用了全部训练集的统计量，这在小范围内是可以接受的。更严格的做法是将标准化器也纳入 `Pipeline`，确保每一折的标准化只在当前折的训练集上计算。但为简单起见，我们通常先整体标准化。

---

### 4.2 计算资源与时间

- 网格搜索随着参数数量和候选值的增加，计算量呈**指数增长**。例如 5 个参数各 10 个候选，就是 10^5 = 10 万种组合，每种组合 5 折交叉验证 = 50 万次训练。非常耗时。
- 可考虑使用**随机搜索（RandomizedSearchCV）**，它在超参数空间中随机采样，适合高维空间。
- 设置 `n_jobs=-1` 利用多核加速。

---

### 4.3 其他超参数搜索方法

| 方法 | 类 | 特点 |
|------|-----|------|
| 网格搜索 | `GridSearchCV` | 穷举，保证找到全局最优（在给定网格内） |
| 随机搜索 | `RandomizedSearchCV` | 随机采样，效率高，适合高维空间 |
| 贝叶斯优化 | 第三方库（如 `hyperopt`、`optuna`） | 智能采样，迭代次数少，但需要额外安装 |

对于 KNN，通常 `n_neighbors` 的搜索范围不会太大（比如 1~30），使用网格搜索即可。

---

## 5. 练习

**题目 1**：交叉验证和网格搜索的目的是什么？（多选题）

A. 为了让被评估的模型更加准确可信，一般会使用交叉验证网格搜索去完成任务。  
B. 有些算法模型本身自带较多的超参数，无法高效的去筛选比较合适的超参数组合。  
C. 使用交叉验证和网格搜索可以提升模型的可信度和查找最佳参数组合的效率。  
D. 仅交叉验证功能能够提升模型的准确率。

**答案**：**A、B、C**。D 错误，交叉验证本身不提升准确率，只是更可靠地评估准确率。

---

## 6. 本部分小结

1. **交叉验证**：将训练集分成 K 份，轮流用其中一份做验证集，其余做训练集，最终取 K 次验证得分的平均值。它提供了更稳定可靠的模型评估。
2. **网格搜索**：自动遍历超参数网格中的所有组合，结合交叉验证评估每组参数的性能，选出最优参数。
3. **GridSearchCV**：将交叉验证和网格搜索封装在一起，极大简化了调参流程。
4. **关键属性**：`best_params_`（最佳参数）、`best_score_`（最佳交叉验证分数）、`best_estimator_`（最优模型）。
5. **鸢尾花调参案例**：通过网格搜索发现 K=5、weights='uniform'、p=2 是最佳组合，测试集准确率达到 93%+。
6. **注意事项**：测试集不能参与调参；计算量随参数指数增长；可考虑随机搜索加速。

---

# 第五部分：分类问题评估（混淆矩阵、精确率、召回率、F 1-score）

在前面的 KNN 分类案例中，我们主要使用**准确率（Accuracy）**来评估模型表现。然而，准确率在某些场景下会掩盖严重的问题。本部分将引入更全面的分类评估指标：**混淆矩阵、精确率、召回率、F 1-score**，帮助你在实际项目中更准确地评价分类模型。

---

## 1. 为什么准确率可能不够用

### 1.1 问题引入：癌症检测场景

假设我们开发了一个癌症检测模型，用于判断患者是否患有恶性肿瘤（正例）还是良性（负例）。已知数据集中只有 **1%** 的样本是恶性肿瘤（正例），99% 是良性（负例）。如果模型简单地将所有样本都预测为**良性**，那么它的准确率是：

$$
\text{Accuracy} = \frac{99}{100} = 99\%
$$

看起来非常优秀！然而，这个模型**一个恶性肿瘤都检测不出来**，对于癌症诊断来说是灾难性的——所有真正的癌症患者都会被误判为健康，从而错过治疗。

**结论**：在类别不平衡问题中，准确率不是可靠的指标。我们需要更细致的评估指标：**精确率（Precision）**、**召回率（Recall）** 和 **F 1-score**。

---

### 1.2 核心思想

评估分类模型时，我们关心的不仅仅是“对了多少”，还包括：

- **找出来的正例中有多少是对的**（精确率/查准率）
- **真正的正例被找出来了多少**（召回率/查全率）

这两个指标从不同角度反映了模型在**正类上的表现**，对于不平衡类别问题至关重要。

---

## 2. 混淆矩阵（Confusion Matrix）

### 2.1 定义

混淆矩阵是一个 **2×2 的表格**，用于展示分类模型的预测结果与真实标签的对比情况。它以真实类别为行、预测类别为列，将样本分为四类：

| 真实 \ 预测          | 正例（Positive）    | 反例（Negative）    |
| ---------------- | --------------- | --------------- |
| **正例（Positive）** | **TP**（真正例）     | **FN**（伪反例/假负例） |
| **反例（Negative）** | **FP**（伪正例/假正例） | **TN**（真反例）     |

**术语解释**：

- **TP（True Positive，真正例）**：真实为正例，模型预测为正例 → 正确
- **FN（False Negative，伪反例/假负例）**：真实为正例，模型预测为负例 → 错误（漏报）
- **FP（False Positive，伪正例/假正例）**：真实为负例，模型预测为正例 → 错误（虚报）
- **TN（True Negative，真反例）**：真实为负例，模型预测为负例 → 正确

---

### 2.2 示例计算

**场景**：样本集共 10 个样本，其中 6 个是恶性肿瘤（正例），4 个是良性肿瘤（负例）。

**模型 A**：预测对了 3 个恶性肿瘤，4 个良性肿瘤。  
**模型 B**：预测对了 6 个恶性肿瘤，1 个良性肿瘤。

计算四个指标：

| 指标 | 模型 A | 模型 B |
|------|-------|-------|
| TP（正例预测正确） | 3 | 6 |
| FN（正例预测为负例） | 6-3=3 | 6-6=0 |
| FP（负例预测为正例） | 4-4=0 | 4-1=3 |
| TN（负例预测正确） | 4 | 1 |

**混淆矩阵（模型 A）**：

|       | 预测为正例 | 预测为负例 |
|-------|------------|------------|
| 真实正例 | 3 | 3 |
| 真实负例 | 0 | 4 |

**混淆矩阵（模型 B）**：

|       | 预测为正例 | 预测为负例 |
|-------|------------|------------|
| 真实正例 | 6 | 0 |
| 真实负例 | 3 | 1 |

---

### 2.3 混淆矩阵 API

```python
from sklearn.metrics import confusion_matrix
import pandas as pd

# 示例：模型A的混淆矩阵
y_true = ["恶性", "恶性", "恶性", "恶性", "恶性", "恶性", 
          "良性", "良性", "良性", "良性"]
y_pred_A = ["恶性", "恶性", "恶性", "良性", "良性", "良性", 
            "良性", "良性", "良性", "良性"]

# 计算混淆矩阵（需要指定标签顺序，否则按字母排序）
labels = ["恶性", "良性"]  # 顺序：正例在前，负例在后
cm = confusion_matrix(y_true, y_pred_A, labels=labels)

df_cm = pd.DataFrame(cm, columns=["预测为正例", "预测为负例"], 
                     index=["真实正例", "真实负例"])
print("模型A混淆矩阵：")
print(df_cm)

# 输出：
#           预测为正例  预测为负例
# 真实正例         3         3
# 真实负例         0         4
```

---

## 3. 精确率（Precision / 查准率）

### 3.1 定义

**精确率** 是指在所有被模型预测为正例的样本中，实际为正例的比例。它回答了：**“模型预测出来的正例中，有多少是真正的正例？”**

$$
\text{Precision} = \frac{TP}{TP + FP}
$$

- 精确率越高，说明模型“宁缺毋滥”，预测的正例可信度高。
- 精确率低，说明模型虚报了太多负例（FP 大）。

---

### 3.2 示例计算

接上面癌症检测的例子：

- **模型 A**：TP=3，FP=0 → Precision = 3/(3+0) = **100%**
- **模型 B**：TP=6，FP=3 → Precision = 6/(6+3) = **66.7%**

**解读**：模型 A 虽然只检测出 3 个癌症患者，但它预测为癌症的样本全都是真的癌症（100%精准）。模型 B 预测了 9 个癌症（6+3），其中只有 6 个是真的，精度较低，因为它把 3 个良性误判为癌症。

---

### 3.3 精确率 API

```python
from sklearn.metrics import precision_score

# 注意：需要将标签转换为字符串或整数，并指定正例类别
y_true = [1,1,1,1,1,1,0,0,0,0]   # 1:恶性, 0:良性
y_pred_A = [1,1,1,0,0,0,0,0,0,0]
y_pred_B = [1,1,1,1,1,1,1,1,1,0]

prec_A = precision_score(y_true, y_pred_A, pos_label=1)
prec_B = precision_score(y_true, y_pred_B, pos_label=1)

print(f"模型A精确率: {prec_A:.1%}")   # 100.0%
print(f"模型B精确率: {prec_B:.1%}")   # 66.7%
```

---

## 4. 召回率（Recall / 查全率）

### 4.1 定义

**召回率** 是指在所有真实为正例的样本中，被模型正确预测为正例的比例。它回答了：**“所有的真正例中，模型找出来了多少？”**

$$
\text{Recall} = \frac{TP}{TP + FN}
$$

- 召回率越高，说明模型“宁可错杀一千，不可放过一个”，漏报少。
- 召回率低，说明模型遗漏了许多正例（FN 大）。

---

### 4.2 示例计算

- **模型 A**：TP=3，FN=3 → Recall = 3/(3+3) = **50%**
- **模型 B**：TP=6，FN=0 → Recall = 6/(6+0) = **100%**

**解读**：模型 A 漏掉了 3 个癌症患者（50%召回率），而模型 B 找出了所有癌症患者（100%召回率）。在癌症检测中，高召回率更为重要——宁可误判几个良性为癌症，也不能放过任何一个真正的癌症患者。

---

### 4.3 召回率 API

```python
from sklearn.metrics import recall_score

recall_A = recall_score(y_true, y_pred_A, pos_label=1)
recall_B = recall_score(y_true, y_pred_B, pos_label=1)

print(f"模型A召回率: {recall_A:.1%}")   # 50.0%
print(f"模型B召回率: {recall_B:.1%}")   # 100.0%
```

---

## 5. 精确率 vs 召回率（权衡）

### 5.1 矛盾关系

- **提高精确率**（减少误报）通常会导致召回率下降：当你只敢预测那些“非常像”正例的样本时，可能会漏掉一些正例。
- **提高召回率**（减少漏报）通常会导致精确率下降：为了抓住所有正例，你可能会把许多负例也预测为正例。

在实际情况中，需要根据业务场景权衡这两个指标。

---

### 5.2 业务场景举例

| 场景 | 更看重 | 原因 |
|------|--------|------|
| 癌症筛查 | **召回率** | 错过一个癌症患者后果严重，误报可以接受（后续复查） |
| 垃圾邮件过滤 | **精确率** | 宁可漏掉一些垃圾邮件，也不能把正常邮件误判为垃圾 |
| 信用卡欺诈检测 | 两者均衡 | 既要抓住欺诈交易，又要避免打扰正常用户 |

---

## 6. F 1-score（综合指标）

### 6.1 定义

**F 1-score** 是精确率和召回率的**调和平均数（Harmonic Mean）**，它综合了两者，避免只偏向某一方。公式：

$$
F 1 = 2 \times \frac{\text{Precision} \times \text{Recall}}{\text{Precision} + \text{Recall}}
$$

**为什么用调和平均而不是算术平均？**  
调和平均对极端值更敏感，能惩罚精确率和召回率的严重不平衡。例如，Precision=1.0，Recall=0.1，算术平均为 0.55，但调和平均只有约 0.18，更能反映“一个指标很差”的真实情况。

---

### 6.2 示例计算

- **模型 A**：Precision=100%，Recall=50%  
 $F 1 = 2 \times \frac{1.0 \times 0.5}{1.0 + 0.5} = 2 \times \frac{0.5}{1.5} = \frac{1}{1.5} \approx 0.667$（66.7%）

- **模型 B**：Precision=66.7%，Recall=100%  
 $F 1 = 2 \times \frac{0.667 \times 1.0}{0.667 + 1.0} = 2 \times \frac{0.667}{1.667} \approx 0.80$（80%）

**结论**：虽然两个模型在某个指标上“完美”，但 F 1 值更均衡地评价了整体表现。模型 B 的 F 1 更高（0.80 > 0.667），说明它在精确率和召回率之间取得了更好的平衡。

---

### 6.3 F 1-score API

```python
from sklearn.metrics import f1_score

f1_A = f1_score(y_true, y_pred_A, pos_label=1)
f1_B = f1_score(y_true, y_pred_B, pos_label=1)

print(f"模型A F1-score: {f1_A:.1%}")   # 66.7%
print(f"模型B F1-score: {f1_B:.1%}")   # 80.0%
```

---

## 7. 多分类问题的评估

KNN 可以处理多分类（如鸢尾花的 3 个类别）。对于多分类，常用的评估方法有：

1. **宏平均（Macro-averaging）**：分别计算每个类别的 Precision/Recall/F 1，然后简单平均（每个类别权重相等）。
2. **微平均（Micro-averaging）**：将所有类别的 TP、FP、FN 累计，再统一计算 Precision/Recall/F 1。对于类别不平衡，微平均更偏向样本数多的类别。
3. **加权平均（Weighted-averaging）**：按每个类别的样本数加权平均，是分类报告中的默认方式。

在 `classification_report` 中会自动给出这些指标：

```python
from sklearn.metrics import classification_report

y_true_multi = [0, 0, 1, 1, 2, 2]
y_pred_multi = [0, 0, 1, 2, 2, 2]
print(classification_report(y_true_multi, y_pred_multi, 
                            target_names=['setosa', 'versicolor', 'virginica']))
```

输出示例：

```python
              precision    recall  f1-score   support
      setosa       1.00      1.00      1.00         2
  versicolor       0.50      0.50      0.50         2
   virginica       1.00      0.50      0.67         2

    accuracy                           0.67         6
   macro avg       0.83      0.67      0.72         6
weighted avg       0.83      0.67      0.72         6
```

---

## 8. 综合实战：鸢尾花分类的完整评估

将前面学习的交叉验证、网格搜索找到的最优模型，在测试集上输出完整的混淆矩阵、精确率、召回率、F 1-score。

```python
from sklearn.datasets import load_iris
from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.preprocessing import StandardScaler
from sklearn.neighbors import KNeighborsClassifier
from sklearn.metrics import confusion_matrix, classification_report, accuracy_score
import pandas as pd
import seaborn as sns
import matplotlib.pyplot as plt

def evaluate_best_knn():
    # 1. 加载数据
    iris = load_iris()
    X, y = iris.data, iris.target
    target_names = iris.target_names
    
    # 2. 划分 + 标准化
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=22)
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    
    # 3. 网格搜索（简化版，只搜索 n_neighbors）
    param_grid = {'n_neighbors': [1,3,5,7,9,11]}
    knn = KNeighborsClassifier()
    gs = GridSearchCV(knn, param_grid, cv=5, scoring='accuracy', n_jobs=-1)
    gs.fit(X_train_scaled, y_train)
    best_knn = gs.best_estimator_
    print(f"最佳K值: {gs.best_params_['n_neighbors']}")
    
    # 4. 预测测试集
    y_pred = best_knn.predict(X_test_scaled)
    
    # 5. 评估指标
    print("\n" + "="*50)
    print("测试集评估结果")
    print("="*50)
    print(f"准确率: {accuracy_score(y_test, y_pred):.4f}")
    print("\n分类报告（包含精确率/召回率/F1）:")
    print(classification_report(y_test, y_pred, target_names=target_names))
    
    # 6. 混淆矩阵可视化
    cm = confusion_matrix(y_test, y_pred)
    plt.figure(figsize=(6,5))
    sns.heatmap(cm, annot=True, fmt='d', cmap='Blues', 
                xticklabels=target_names, yticklabels=target_names)
    plt.xlabel('预测类别')
    plt.ylabel('真实类别')
    plt.title('混淆矩阵')
    plt.tight_layout()
    plt.show()

evaluate_best_knn()
```

**输出解读**：对于鸢尾花数据集，通常 Setosa 被完美区分，Versicolor 和 Virginica 之间可能有少量混淆。混淆矩阵可以清晰看到哪些样本被错分到哪一类。

---

## 9. 练习

### 题目 1

关于精确率、召回率和 F 1 值的定义，下列说法正确的是：

A. 精确率是指预测为正例中实际为正例的比例，召回率是指实际为正例中被预测为正例的比例，F 1 值是精确率和召回率的调和平均数。  
B. 精确率是指实际为正例中被预测为正例的比例，召回率是指预测为正例中实际为正例的比例，F 1 值是精确率和召回率的调和平均数。  
C. 精确率是指实际为正例中被预测为正例的比例，召回率是指预测为正例中实际为正例的比例，F 1 值是精确率和召回率的算术平均数。

**答案**：**A**

### 题目 2

如果一个二分类模型的精确率为 0.8，召回率为 0.6，那么该模型的 F 1 值为：

A. 0.44  
B. 0.60  
C. 0.69  
D. 0.75

**计算**：$F 1 = 2 \times \frac{0.8 \times 0.6}{0.8 + 0.6} = 2 \times \frac{0.48}{1.4} = 2 \times 0.342857 \approx 0.6857$

**答案**：**C（0.69）**

---

## 10. 本部分小结

| 指标 | 公式 | 含义 | 适用场景 |
|------|------|------|----------|
| **精确率** |$\frac{TP}{TP+FP}$| 预测为正例中有多少是真的 | 关注误报率（如垃圾邮件过滤） |
| **召回率** |$\frac{TP}{TP+FN}$| 真正的正例被找出了多少 | 关注漏报率（如癌症检测） |
| **F 1-score** |$2 \cdot \frac{P \cdot R}{P+R}$| 精确率和召回率的调和平均 | 需要综合平衡两者时 |

### 核心要点

1. **准确率在类别不平衡时不可靠**，必须结合混淆矩阵中的 TP、FN、FP、TN 深入分析。
2. **混淆矩阵**是计算所有指标的基础，提供了四类样本的数量分布。
3. **精确率**侧重于“预测的准确性”，**召回率**侧重于“找全正例”。
4. **F 1-score** 综合了两者，是类别不平衡问题中最常用的单一指标。
5. Scikit-learn 提供了一键计算这些指标的函数：`confusion_matrix`、`precision_score`、`recall_score`、`f 1 _score`、`classification_report`。

---

根据之前的对话，您已经完成了 KNN 算法的全部五个部分笔记。现在您说“继续”，我会输出一份 **KNN 算法总结速查表**，作为整个 KNN 笔记的收尾。如果需要继续其他内容（如下一个算法），请告知。

---

# KNN 算法总结速查表

## 1. 核心概念

| 概念 | 说明 |
|------|------|
| **算法思想** | 一个样本的类别由其最近的 K 个邻居的多数类别决定（“近朱者赤，近墨者黑”） |
| **距离度量** | 最常用**欧氏距离**：$d = \sqrt{\sum (x_i - y_i)^2}$；也可用曼哈顿距离（p=1）、闵可夫斯基距离（p 参数） |
| **懒惰学习** | 没有显式训练过程，`fit` 只保存数据；预测时计算量大 |
| **适用任务** | 分类（多数表决）和回归（K 个邻居目标值的平均） |

---

## 2. API 速查

| 任务 | 类 | 关键参数 |
|------|-----|----------|
| KNN 分类 | `KNeighborsClassifier` | `n_neighbors`（K 值）、`weights`（'uniform'/'distance'）、`p`（1/2） |
| KNN 回归 | `KNeighborsRegressor` | 同上 |
| 特征预处理 | `StandardScaler` | 标准化（推荐）；`MinMaxScaler` 归一化（对异常值敏感） |
| 数据划分 | `train_test_split` | `test_size`、`random_state` |
| 交叉验证+网格搜索 | `GridSearchCV` | `estimator`、`param_grid`、`cv`、`scoring` |
| 分类评估 | `confusion_matrix`、`precision_score`、`recall_score`、`f 1 _score`、`classification_report` | `pos_label` 指定正例类别 |

---

## 3. 超参数选择

| 超参数 | 含义 | 影响 | 调优建议 |
|--------|------|------|----------|
| `n_neighbors`（K 值） | 考虑多少个最近邻 | K 小→过拟合（易受噪声影响）；K 大→欠拟合（忽略局部信息） | 常用范围 1~30，通过交叉验证选择奇数避免平局 |
| `weights` | 邻居权重 | 'uniform'（所有邻居等权重）；'distance'（距离越近权重越大） | 数据分布不均时尝试'distance' |
| `p` | 距离类型 | p=2 欧氏距离（默认）；p=1 曼哈顿距离 | 特征独立同尺度用欧氏距离；特征相关可尝试曼哈顿距离 |
| `algorithm` | 搜索算法 | 'auto'（自动）、'kd_tree'、'ball_tree'、'brute' | 一般用'auto'；大数据量可指定树算法加速 |

---

## 4. 特征预处理

| 方法 | 公式 | 特点 | 适用场景 |
|------|------|------|----------|
| **标准化** |$X' = (x - \mu)/\sigma$| 均值为 0，标准差为 1；受异常值影响较小 | **现代机器学习默认选择**，尤其适合 KNN |
| **归一化** |$X' = (x - min)/(max - min)$| 输出固定范围[0,1]；受异常值影响大 | 需要严格边界、小规模精确数据 |

**为什么 KNN 需要特征预处理**：不同特征的量纲差异会导致距离计算失真，大尺度特征会主导结果。

---

## 5. 分类评估指标

### 混淆矩阵

| 真实\预测 | 正例 | 负例 |
|-----------|------|------|
| 正例 | TP（真正例） | FN（伪反例/漏报） |
| 负例 | FP（伪正例/虚报） | TN（真反例） |

### 常用指标

| 指标 | 公式 | 含义 | 关注点 |
|------|------|------|--------|
| **准确率** | (TP+TN)/(TP+TN+FP+FN) | 所有预测正确的比例 | **类别不平衡时不可靠** |
| **精确率** | TP/(TP+FP) | 预测为正例中有多少是真的 | 减少误报（垃圾邮件） |
| **召回率** | TP/(TP+FN) | 真正例被找出了多少 | 减少漏报（癌症检测） |
| **F 1-score** |$2 \cdot \frac{P \cdot R}{P+R}$| 精确率和召回率的调和平均 | 综合平衡两者 |

---

## 6. 交叉验证与网格搜索

| 方法 | 作用 | API |
|------|------|-----|
| **K 折交叉验证** | 将训练集均分 K 份，轮流做验证集，评估结果取平均 | `cross_val_score` 或 `GridSearchCV` 内置 |
| **网格搜索** | 穷举超参数组合，自动寻找最佳参数 | `GridSearchCV` |
| **最佳参数** | `best_params_` | `best_score_`（交叉验证得分） |
| **最佳模型** | `best_estimator_` | 可用 `predict`、`score` |

---

## 7. 完整工作流程（模板）

```python
from sklearn.datasets import load_iris
from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.preprocessing import StandardScaler
from sklearn.neighbors import KNeighborsClassifier
from sklearn.metrics import classification_report

# 1. 数据加载
X, y = load_iris(return_X_y=True)

# 2. 划分训练集和测试集
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# 3. 特征标准化（必须！）
scaler = StandardScaler()
X_train = scaler.fit_transform(X_train)
X_test = scaler.transform(X_test)

# 4. 网格搜索选择最佳K值
param_grid = {'n_neighbors': [3,5,7,9]}
knn = KNeighborsClassifier()
grid = GridSearchCV(knn, param_grid, cv=5, scoring='accuracy')
grid.fit(X_train, y_train)

# 5. 最佳模型评估
best = grid.best_estimator_
y_pred = best.predict(X_test)
print(classification_report(y_test, y_pred))
```

---

## 8. 常见问题与解决

| 问题 | 可能原因 | 解决办法 |
|------|----------|----------|
| 预测速度慢 | 样本量大或特征多 | 使用树算法（`algorithm='kd_tree'`）；降维；减少 K 值 |
| 准确率低 | 特征未标准化 | **立即标准化** |
| 对异常值敏感 | K 值太小 | 增大 K 值 |
| 类别不平衡导致多数类主导 | 多数类样本过多 | 使用加权 KNN（`weights='distance'`）；重采样；换用其他指标（F 1） |
| 高维数据表现差 | 维度灾难 | PCA 降维；增加样本量；换用基于树的方法 |

---

## 9. 优缺点总结

| 优点 | 缺点 |
|------|------|
| 简单直观，易于理解和实现 | 预测计算量大，需存储全部数据 |
| 无需训练（懒惰学习），可动态增删样本 | 特征尺度敏感，必须预处理 |
| 对异常值不敏感（K 足够大时） | 高维空间距离度量失效（维度灾难） |
| 适用于分类和回归 | 类别不平衡时表现差（除非加权） |

---
