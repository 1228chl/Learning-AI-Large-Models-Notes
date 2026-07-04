# KNN算法

**标签：** #KNN #分类

---

## 1. 基本概念

KNN（K-Nearest Neighbors）是一种基于实例的学习算法，核心思想是：**如果一个样本在特征空间中的K个最相似的样本大多数属于某个类别，则该样本也属于这个类别**。

---

## 2. 算法步骤

1. 计算待分类样本与训练集中每个样本的距离
2. 选择距离最近的K个样本
3. 统计这K个样本中各类别的数量
4. 数量最多的类别作为预测结果

---

## 3. 距离度量

| 距离类型 | 公式 | 适用场景 |
|----------|------|----------|
| 欧氏距离 | $d(x,y) = \sqrt{\sum_{i=1}^{n}(x_i-y_i)^2}$ | 连续值特征 |
| 曼哈顿距离 | $d(x,y) = \sum_{i=1}^{n}\vert x_i-y_i\vert$ | 稀疏数据 |
| 闵可夫斯基距离 | $d(x,y) = (\sum_{i=1}^{n}\vert x_i-y_i\vert^p)^{1/p}$ | 通用 |
| 余弦相似度 | $\cos(\theta) = \frac{x \cdot y}{\vert\vert x\vert\vert \cdot \vert\vert y\vert\vert}$ | 文本分类 |

---

## 4. K值选择

- **K值过小**：模型复杂，容易过拟合，对噪声敏感
- **K值过大**：模型简单，容易欠拟合，边界模糊
- **一般选择**：$K = \sqrt{n}$，其中n为样本数量

---

## 5. 特征预处理

### 归一化（Min-Max Scaling）

$$
x' = \frac{x - x_{min}}{x_{max} - x_{min}}
$$

### 标准化（Z-score Standardization）

$$
x' = \frac{x - \mu}{\sigma}
$$

---

## 6. sklearn代码示例

```python
from sklearn.neighbors import KNeighborsClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline

# 创建Pipeline
pipe = Pipeline([
    ('scaler', StandardScaler()),
    ('knn', KNeighborsClassifier(n_neighbors=5))
])

# 训练
pipe.fit(X_train, y_train)

# 预测
accuracy = pipe.score(X_test, y_test)
print(f"准确率：{accuracy:.2f}")
```

---

## 7. 优缺点

| 优点 | 缺点 |
|------|------|
| 简单直观 | 计算量大，预测慢 |
| 无需训练 | 对高维数据效果差 |
| 适合多分类 | 对不平衡数据敏感 |
