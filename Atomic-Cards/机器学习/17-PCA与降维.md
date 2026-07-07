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

## 面试追问

**Q1（基础）**：PCA 的核心思想是什么？它找到的"主成分"数学上是什么？
**回答要点**：PCA 找到数据中方差最大的方向（第一主成分），然后找与第一主成分正交的次大方差方向（第二主成分）；数学上是对协方差矩阵做特征值分解，特征向量=主成分方向，特征值=该方向的方差大小；数据被投影到这些方向上实现降维。

**Q2（深挖）**：如何选择 PCA 保留的主成分数量？为什么通常保留 95% 的方差？
**回答要点**：通过累积解释方差比曲线选择，保留 95% 方差表示保留了原始数据中 95% 的信息量而丢弃了 5% 的噪声/冗余；可以用 PCA(n_components=0.95) 自动选择；权衡：保留太多失去降维意义，保留太少丢失关键信息；还可通过 Kaiser 准则（特征值>1）或肘部法辅助判断。

**Q3（实战）**：PCA 在 ML 项目中有哪些典型应用？你能说出至少三个使用场景吗？
**回答要点**：数据可视化（降到 2D/3D 用散点图观察数据分布）；去噪（方差小的维度通常是噪声，丢弃后提升信噪比）；加速训练（减少特征数降低模型复杂度）；处理多重共线性（PCA 去相关后再建模）；缓解维度灾难（高维→低维使得距离计算更稳定）。

**Q4（边界）**：PCA 是一个线性降维方法，对于非线性流形数据有什么局限？t-SNE 和 UMAP 如何弥补？
**回答要点**：PCA 只能捕捉全局线性结构，对非线性流形（如瑞士卷三维数据）无法有效展开；t-SNE 保留局部邻域结构，可视化效果极好但保留全局结构差、不可逆、不适用于后续建模；UMAP 保留更多全局结构且速度更快，是 t-SNE 的升级替代；但 t-SNE/UMAP 仅用于可视化不适合建模。

> 参见 [[15-K-means聚类]]、[[10-特征值分解]]、[[11-奇异值分解]]
