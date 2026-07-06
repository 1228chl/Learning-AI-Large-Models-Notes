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

# 降维到 2 维（用于可视化）
pca = PCA(n_components=2)
X_2d = pca.fit_transform(X)

print(f"解释方差比: {pca.explained_variance_ratio_}")
print(f"累积方差: {pca.explained_variance_ratio_.cumsum()}")
# 可视化
plt.scatter(X_2d[:, 0], X_2d[:, 1], c=y, cmap='viridis')
plt.xlabel('PC1'); plt.ylabel('PC2')
```

## 数学本质

PCA 对**协方差矩阵** $\Sigma = \frac{1}{n} X^T X$ 做**特征值分解**：

$$\Sigma \mathbf{v}_i = \lambda_i \mathbf{v}_i$$

- 特征向量 $\mathbf{v}_i$ → 主成分方向
- 特征值 $\lambda_i$ → 该方向上的方差大小

```python
# 选择主成分数量
pca = PCA(n_components=0.95)          # 保留 95% 的方差
X_reduced = pca.fit_transform(X)
print(f"保留 {pca.n_components_} 个主成分")

# 查看各特征的贡献
loadings = pca.components_            # 每个主成分是原始特征的线性组合
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
# 用 PCA 加速分类
pipe = Pipeline([
    ('pca', PCA(n_components=100)),
    ('clf', RandomForestClassifier())
])
pipe.fit(X_train, y_train)
```

## t-SNE 与 UMAP（非线性降维）

```python
from sklearn.manifold import TSNE

# t-SNE：擅长可视化高维数据的流形结构
tsne = TSNE(n_components=2, perplexity=30, random_state=42)
X_tsne = tsne.fit_transform(X)        # 只能做变换，不能做逆变换
```

| 降维方法 | 线性？ | 速度 | 可视化效果 | 特点 |
|----------|:-----:|:----:|:----------:|------|
| **PCA** | ✅ | 快 | 一般 | 保留全局结构 |
| **t-SNE** | ❌ | 慢 | **极好** | 保留局部邻域，用于可视化 |
| **UMAP** | ❌ | 快 | 极好 | 保留更多全局结构 |

## 何时使用

```python
# 用 PCA（线性降维）：
# - 需要加速后续模型训练
# - 需要去噪或去相关
# - 特征数 > 样本数

# 用 t-SNE/UMAP（非线性降维）：
# - 仅用于可视化探索
# - 数据有复杂的流形结构
```

> 参见 [[15-K-means聚类]]、[[10-特征值分解]]、[[11-奇异值分解]]
