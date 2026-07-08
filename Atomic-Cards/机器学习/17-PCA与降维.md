---
author: "XunZong"
created: "2026-07-06"
tags: ["机器学习", "降维", "PCA"]
aliases: ["PCA", "主成分分析", "降维", "t-SNE"]
---

# PCA 与降维

## 定义

主成分分析（Principal Component Analysis, PCA）是最常用的**无监督线性降维**方法。它找到数据中**方差最大的方向**（主成分），将数据投影到低维子空间，同时尽可能保留原始数据的方差信息。

```python
from sklearn.decomposition import PCA
import matplotlib.pyplot as plt

# 降维到 2 维（用于可视化），将高维数据投影到方差最大的两个方向上
pca = PCA(n_components=2)
X_2d = pca.fit_transform(X)  # 拟合PCA模型并将数据投影到2维空间

print(f"解释方差比: {pca.explained_variance_ratio_}")  # 每个主成分解释的方差比例
print(f"累积方差: {pca.explained_variance_ratio_.cumsum()}")  # 前k个主成分累积解释的方差比例
# 可视化：用2维散点图展示高维数据的聚类结构
plt.scatter(X_2d[:, 0], X_2d[:, 1], c=y, cmap='viridis')
plt.xlabel('PC1'); plt.ylabel('PC2')
```

## 数学本质

PCA 对**协方差矩阵** $\Sigma = \frac{1}{n} X^T X$ 做**特征值分解**：

$$
\Sigma \mathbf{v}_i = \lambda_i \mathbf{v}_i
$$

- 特征向量 $\mathbf{v}_i$ → 主成分方向
- 特征值 $\lambda_i$ → 该方向上的方差大小

```python
# 选择主成分数量：自动保留解释95%方差所需的最少主成分数
pca = PCA(n_components=0.95)          # 保留 95% 的方差，丢弃5%的噪声/冗余
X_reduced = pca.fit_transform(X)
print(f"保留 {pca.n_components_} 个主成分")

# 查看各特征的贡献（载荷矩阵）：每个主成分是原始特征的加权线性组合
loadings = pca.components_            # 每一行是一个主成分，值为原始特征的权重
```

## PCA 的应用

| 用途 | 说明 |
|------|------|
| **数据可视化** | 降到 2D/3D 后 scatter plot |
| **去噪** | 丢弃方差小（即噪声）的维度 |
| **加速训练** | 减少特征数，加速模型训练 |
| **缓解维度灾难** | 高维 → 低维，距离计算更稳定 |
| **多重共线性处理** | PCA 去相关后再建模 |

```python
# 用 PCA 加速分类：先降维再训练分类器，减少特征数降低模型复杂度
pipe = Pipeline([
    ('pca', PCA(n_components=100)),          # 先降到100维，去除噪声和冗余特征
    ('clf', RandomForestClassifier())        # 在降维后的特征上训练随机森林
])
pipe.fit(X_train, y_train)  # 流水线自动完成先降维再分类的流程
```

## 线性 vs 非线性降维

降维方法分为线性（PCA）和非线性（t-SNE、UMAP）两大类，各自适用不同场景：

| 降维方法 | 线性？ | 核心思想 | 适用场景 | 详细卡片 |
|:--------:|:------:|:---------|:---------|:--------:|
| **PCA** | ✅ | 保留最大方差方向（协方差矩阵特征分解） | 加速训练、去噪、特征提取 | [29-PCA主成分分析](./29-PCA主成分分析.md) |
| **t-SNE** | ❌ | 保留局部邻域（概率分布匹配） | 数据可视化探索 | [30-t-SNE与UMAP非线性降维](./30-t-SNE与UMAP非线性降维.md) |
| **UMAP** | ❌ | 流形学习 + 拓扑数据分析 | 可视化、可作特征 | [30-t-SNE与UMAP非线性降维](./30-t-SNE与UMAP非线性降维.md) |

## 何时使用

- **用 PCA**：需要加速训练、去噪、去相关、特征数 > 样本数、需要可逆变换
- **用 t-SNE/UMAP**：仅用于可视化探索、数据有复杂流形结构

## 参考引用
- 需要理解PCA主成分分析的相关知识，参见 [PCA主成分分析](./29-PCA主成分分析.md)
- 需要理解t-SNE与UMAP非线性降维的相关知识，参见 [t-SNE与UMAP非线性降维](./30-t-SNE与UMAP非线性降维.md)
- 需要掌握特征值分解以理解向量运算与相似度计算的数学基础，参见 [特征值分解](../线性代数/10-特征值分解.md)