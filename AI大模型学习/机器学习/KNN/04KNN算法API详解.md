**上一级：** [03KNN算法简介](03KNN算法简介.md)

**下一级：** [05距离度量](05距离度量.md)

**标签：** #机器学习 #KNN 

---

# KNN 算法 API 详解

## 第一部分：KNN 分类 API

### 1.1 API 基本信息

**所属库**：`sklearn.neighbors`

**类名**：`KNeighborsClassifier`

**官方文档**：[https://sikit-learn.org](https://scikit-learn.org/stable/modules/generated/sklearn.neighbors.KNeighborsClassifier.html)

**用途**：使用 K 近邻算法解决**分类问题**（输出离散类别）。

---

### 1.2 构造函数参数详解

```python
from sklearn.neighbors import KNeighborsClassifier
model = KNeighborsClassifier(n_neighbors=5, weights='uniform', algorithm='auto', 
                             leaf_size=30, p=2, metric='minkowski', 
                             metric_params=None, n_jobs=None)
```

**强调**：

> `n_neighbors`：int，可选（默认=5），k_neighbors 查询默认使用的邻居数。

---

#### 1.2.1 参数完整说明

| 参数                | 类型             | 默认值         | 说明                                                                                                                                          |
| ----------------- | -------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **n_neighbors**   | int            | 5           | K 值，即查询的邻居个数。K 越小模型越复杂，K 越大模型越简单。                                                                                                           |
| **weights**       | str 或 callable | 'uniform'   | 投票权重策略。<br>• `'uniform'`：所有邻居权重相同。<br>• `'distance'`：距离越近权重越大（权重 = 1/距离）。<br>• 自定义函数：接收距离数组返回权重数组。                                          |
| **algorithm**     | str            | 'auto'      | 计算最近邻的算法。<br>• `'auto'`：根据数据自动选择最合适的算法。<br>• `'ball_tree'`：使用 Ball Tree 算法。<br>• `'kd_tree'`：使用 KD Tree 算法。<br>• `'brute'`：暴力搜索（计算所有样本的距离）。 |
| **leaf_size**     | int            | 30          | 传递给 Ball Tree 或 KD Tree 的叶子大小。影响树的构建和查询速度。                                                                                                  |
| **p**             | int            | 2           | 闵可夫斯基距离的幂指数。<br>• p=1：曼哈顿距离。<br>• p=2：欧氏距离（默认）。<br>• p→∞：切比雪夫距离。                                                                            |
| **metric**        | str 或 callable | 'minkowski' | 距离度量方式。常用：`'euclidean'`、`'manhattan'`、`'chebyshev'`、`'minkowski'`、`'mahalanobis'` 等。                                                        |
| **metric_params** | dict           | None        | 距离度量函数的额外参数。                                                                                                                                |
| **n_jobs**        | int            | None        | 并行计算任务数。<br>• `None`：1 个核心。<br>• `-1`：使用所有核心。                                                                                               |

**示例中的参数**：

```python
estimator = KNeighborsClassifier(n_neighbors=1)  # 只设了n_neighbors
```

---

### 1.3 主要方法

| 方法                                              | 用途    | 说明                           |
| ----------------------------------------------- | ----- | ---------------------------- |
| `fit(X, y)`                                     | 训练模型  | KNN 是惰性学习，fit 只保存数据，不进行实际计算。 |
| `predict(X)`                                    | 预测类别  | 返回 X 中每个样本的预测类别标签。           |
| `predict_proba(X)`                              | 预测概率  | 返回 X 中每个样本属于各个类别的概率估计。       |
| `score(X, y)`                                   | 评估准确率 | 返回在(X,y)上的平均分类准确率。           |
| `kneighbors([X, n_neighbors, return_distance])` | 获取邻居  | 返回样本点的 K 个邻居的距离和索引。          |
| `kneighbors_graph([X, n_neighbors, mode])`      | 邻居图   | 返回样本点的 K 近邻的权重图。             |

---

### 1.4 完整代码示例

```python
from sklearn.neighbors import KNeighborsClassifier

def dm01_knnapi_分类():
    # 1. 实例化KNN分类器，指定K=1
    estimator = KNeighborsClassifier(n_neighbors=1)
    
    # 2. 准备训练数据
    X = [[0], [1], [2], [3]]   # 特征：一维数据
    y = [0, 0, 1, 1]           # 标签：0或1
    
    # 3. 训练模型（实际只是保存数据）
    estimator.fit(X, y)
    
    # 4. 预测新样本
    myret = estimator.predict([[4]])
    print('myret-->', myret)   # 输出: 1
```

**代码解析**：

- 训练集：4 个点，位于 0,1,2,3。标签：0,0,1,1。
- 预测点：4。距离计算：|4-0|=4，|4-1|=3，|4-2|=2，|4-3|=1。
- K=1：最近的是 3（标签 1），所以预测为 1。

---

### 1.5 predict_proba 方法示例

```python
# 预测概率
prob = estimator.predict_proba([[4]])
print(prob)   # 例如输出 [[0. 1.]]，表示类别0概率0，类别1概率1
```

**用途**：输出每个类别的概率，可用于衡量预测的置信度。

---

## 第二部分：KNN 回归 API

### 2.1 API 基本信息

**所属库**：`sklearn.neighbors`

**类名**：`KNeighborsRegressor`

**用途**：使用 K 近邻算法解决**回归问题**（输出连续数值）。

---

### 2.2 构造函数参数

```python
from sklearn.neighbors import KNeighborsRegressor
model = KNeighborsRegressor(n_neighbors=5, weights='uniform', algorithm='auto', 
                            leaf_size=30, p=2, metric='minkowski', 
                            metric_params=None, n_jobs=None)
```

**参数含义与分类 API 完全相同**，唯一区别是默认方法行为不同（回归取平均值，分类取投票）。

---

### 2.3 主要方法

| 方法            | 用途    | 说明                                    |
| ------------- | ----- | ------------------------------------- |
| `fit(X, y)`   | 训练模型  | 保存数据。                                 |
| `predict(X)`  | 预测连续值 | 返回 K 个邻居目标值的平均值（或加权平均）。               |
| `score(X, y)` | 评估    | 返回**决定系数 R²**（分类的 score 是准确率，这里是 R²）。 |
| `kneighbors`  | 获取邻居  | 同分类。                                  |

**关于 R²**：

- R² = 1 - (SS_res / SS_tot)
- 最大值 1，可能为负（模型比简单均值还差）。

---

### 2.4 完整代码示例

```python
from sklearn.neighbors import KNeighborsRegressor

def dm02_knnapi_回归():
    # 1. 实例化，K=2
    estimator = KNeighborsRegressor(n_neighbors=2)
    
    # 2. 准备训练数据
    X = [[0, 0, 1],
         [1, 1, 0],
         [3, 10, 10],
         [4, 11, 12]]
    y = [0.1, 0.2, 0.3, 0.4]
    
    # 3. 训练
    estimator.fit(X, y)
    
    # 4. 预测
    myret = estimator.predict([[3, 11, 10]])
    print('myret-->', myret)
```

**计算过程解析**（K=2）：

1. 计算新样本 `[3,11,10]` 与四个训练样本的欧氏距离。
2. 假设距离排序后，最近的 2 个样本是索引 2 和 3（原始数据第 3、4 行）。
3. 这两个样本的 y 值分别为 0.3 和 0.4，平均值 = 0.35。
4. 预测输出 ≈ 0.35。

---

## 第三部分：API 使用错误辨析

### 3.1 错误题目重现

题目给出了 API 使用流程的四个步骤（A、B、C、D 标记），问哪一项有误。

**代码片段**：

```python
from sklearn.neighbors import KNeighborsClassifier   # A
x = [[0], [1], [2], [3]]; y = [0, 0, 1, 1]           # B
estimator = KNeighborsClassifier(n_neighbors=2)       # C
estimator.fit(x, y)                                   # D 正确
estimator.predict([1])   # 这行有误！               # D 错误
```

**错误原因**：

> `predict` 方法要求输入是**二维数组**（即使只有一个样本），即 `[[1]]` 而非 `[1]`。

**正确写法**：

```python
estimator.predict([[1]])
```

**扩展说明**：

- `fit` 的 X 要求：形状 `(n_samples, n_features)`。当只有一个特征时，每个样本需写成 `[值]`，多个样本则为 `[[值1],[值2]]`。
- `predict` 的输入同样需要二维形状，因为可能同时预测多个样本。

---

## 第四部分：API 使用最佳实践与常见问题

### 4.1 数据形状要求

| 场景 | 正确形状 | 错误形状 |
|------|---------|---------|
| 单个样本，1 个特征 | `[[x]]` (1,1) | `[x]` (1,) |
| 单个样本，n 个特征 | `[[x1,x2,...,xn]]` (1,n) | `[x1,x2,...,xn]` (n,) |
| 多个样本，1 个特征 | `[[x1],[x2],...]` (m,1) | `[[x1,x2,...]]` 或 `[x1,x2,...]` |
| 多个样本，n 个特征 | `[[...], [...]]` (m,n) | 形状不匹配 |

**检查方法**：打印 `np.array(data).shape` 确认。

---

### 4.2 特征缩放的必要性

**前面笔记强调**：KNN 基于距离，如果特征量纲不同（如一个特征范围 0~1，另一个 0~10000），大数值特征会主导距离计算。

**建议**：在使用 KNN API 前，先做标准化或归一化。

```python
from sklearn.preprocessing import StandardScaler
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)
```

---

### 4.3 K 值的选择与 API 结合

API 中的 `n_neighbors` 是超参数，不能从数据自动学习。常用方法：

```python
from sklearn.model_selection import GridSearchCV

param_grid = {'n_neighbors': [3, 5, 7, 9]}
grid = GridSearchCV(KNeighborsClassifier(), param_grid, cv=5)
grid.fit(X_train, y_train)
best_k = grid.best_params_['n_neighbors']
```

---

### 4.4 距离度量的选择

通过 `metric` 和 `p` 参数控制：

```python
# 欧氏距离（默认）
knn_euclidean = KNeighborsClassifier(metric='euclidean')

# 曼哈顿距离
knn_manhattan = KNeighborsClassifier(metric='manhattan')

# 闵可夫斯基距离，p=3
knn_minkowski = KNeighborsClassifier(metric='minkowski', p=3)
```

---

### 4.5 权重策略的影响

- `weights='uniform'`：所有邻居平等投票。
- `weights='distance'`：距离近的邻居权重高，可提高预测精度，但计算稍多。

```python
knn_dist = KNeighborsClassifier(weights='distance')
```

---

### 4.6 算法选择（algorithm 参数）

| 算法 | 适用场景 |
|------|---------|
| `'brute'` | 小数据集（几千以内），或特征维度很高（>20）时效果反而好 |
| `'kd_tree'` | 低维数据（<20 维），样本数较多 |
| `'ball_tree'` | 高维数据（20+维），或数据分布不均匀 |
| `'auto'` | 自动判断，一般推荐 |

---

### 4.7 并行加速（n_jobs）

- 对大数据集，预测时计算量大，可设置 `n_jobs=-1` 使用所有 CPU 核心。
- **注意**：小数据集多线程开销可能反而更慢。

---

## 第五部分：KNN API 总结表

| 任务类型 | 类 | 关键参数 | 预测方法输出 | 评估方法输出 |
|---------|----|---------|-------------|-------------|
| 分类 | `KNeighborsClassifier` | n_neighbors, weights, metric | 类别标签 | 准确率 (score) |
| 回归 | `KNeighborsRegressor` | n_neighbors, weights, metric | 连续数值 | 决定系数 R² (score) |

**共同点**：

- 都需要 `fit(X, y)` 保存数据。
- 都支持 `kneighbors` 方法获取最近邻索引和距离。
- 都支持并行计算 (`n_jobs`)。
- 都依赖距离度量，因此**必须进行特征缩放**。

---

## 第六部分：扩展——自定义距离度量

如果需要使用非内置距离（如余弦相似度），可以通过 `metric='pyfunc'` 并传递自定义函数。

```python
def my_distance(u, v):
    return np.sum(np.abs(u - v))  # 曼哈顿示例

knn_custom = KNeighborsClassifier(metric=my_distance)
```

但注意：自定义距离会导致 `algorithm='auto'` 回退为 `'brute'`，性能下降。

---

