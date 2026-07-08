---
author: "XunZong"
created: "2026-07-07"
tags: ["机器学习", "正则化", "L2"]
aliases: ["L2正则化", "Ridge", "权重衰减", "Weight Decay", "岭回归"]
---

# L2 正则化（Ridge / 权重衰减）

## 定义

L2 正则化（Ridge / 权重衰减）在损失函数中添加权重的 **平方和** 作为惩罚项，迫使权重趋向于较小的值但**不压为零**。所有特征都保留但贡献被均匀减弱。

$$
L_{\text{ridge}} = L_{\text{data}} + \lambda \sum_{j=1}^p w_j^2 = L_{\text{data}} + \lambda \|\mathbf{w}\|_2^2
$$

其中 $\lambda$ 控制正则化强度： $\lambda$ 越大 → 权重缩小越强， $\lambda$ 越小 → 越接近普通最小二乘。

## 核心公式

梯度更新中的权重衰减效果：

$$
w_{t+1} = w_t - \eta (\nabla L_{\text{data}} + \lambda w_t) = w_t(1 - \eta\lambda) - \eta \nabla L_{\text{data}}
$$

每一步更新前权重先按 $(1 - \eta\lambda)$ 的比例**衰减**，这就是"权重衰减"名称的来源。

```python
from sklearn.linear_model import Ridge, RidgeCV

# 自动用交叉验证选最优 alpha（= λ）
ridge = RidgeCV(alphas=[0.01, 0.1, 1.0, 10.0], cv=5)
ridge.fit(X_train, y_train)
print(f"最佳 alpha: {ridge.alpha_}")

# 手动指定
ridge = Ridge(alpha=1.0)
ridge.fit(X_train, y_train)
```

## 几何解释

L2 的约束区域是**圆形**：

- 等高线与圆形边界相切处为最优解
- 圆形光滑，切点各维度都非零
- 所有权重均匀缩小，但都不为零

```python
约束条件：w₁² + w₂² ≤ t
　　　　↕
三维中是球体，高维中是超球体
```

## 特性总结

| 特性 | 说明 |
|------|------|
| 权重效果 | 缩小（趋向 0 但不为 0） |
| 特征选择 | ❌ 不选特征，全部保留 |
| 解的唯一性 | ✅ 严格凸，唯一解 |
| 相关特征处理 | 一起保留，权重均分 |
| 适用场景 | 特征数较少、所有特征都有用 |

## ML/DL 应用场景

| 应用场景 | 数学形式 | 说明 |
|----------|----------|------|
| 线性回归（Ridge） | $\min \ |Xw - y\|^2 + \lambda\|w\|_2^2$ | sklearn `Ridge` / `RidgeCV` |
| 神经网络权重衰减 | $L + \frac{\lambda}{2}\sum\ |W\|_2^2$ | PyTorch `weight_decay` 参数（AdamW 将 weight_decay 与学习率解耦） |
| 逻辑回归正则化 | sklearn `LogisticRegression(penalty='l2')` | 默认使用 L2 正则化 |
| 推荐系统矩阵分解 | $\min\ |R-UV\|_F^2 + \lambda(\|U\|_F^2+\|V\|_F^2)$ | 防止用户/物品隐向量过拟合 |

## 面试追问

**Q1（基础）**：L2 正则化为什么叫"权重衰减"？这个名字的由来是什么？

**回答要点**：SGD 更新公式中 $w_{t+1} = w_t(1-\eta\lambda) - \eta\nabla L_{\text{data}}$ ，权重 $w_t$ 每次更新前先乘以 $(1-\eta\lambda)$ 进行等比缩小——即每一步权重都"衰减"一点；与 L1 将权重直接压为零不同，L2 是等比缩小所有权重。

**Q2（深挖）**：为什么 L2 正则化的解是唯一的？从凸优化角度解释。

**回答要点**： $L_{\text{data}}$ 通常是凸函数（如 MSE），加上 $\lambda\|w\|_2^2$ （严格凸）后整体成为**严格凸函数**；严格凸函数有唯一全局最小值，保证了 Ridge 的解唯一；Lasso（L1）的正则项不是严格凸（在零点不可导），高维时可能有多组解。

**Q3（实战）**：PyTorch 中 weight_decay 参数和 AdamW 优化器的 weight_decay 有什么不同？

**回答要点**：标准 SGD 中 weight_decay 等价于 L2 正则化（权重直接衰减）；但在 Adam 中由于自适应学习率，weight_decay 不等于 L2 正则化（L2 梯度被自适应学习率缩放，衰减效果不均匀）；AdamW 将 weight_decay 从梯度更新中分离，在参数更新后直接做权重衰减，效果等价于 SGD 的 weight_decay。

**Q4（边界）**：L2 正则化的 $\lambda$ 过大或过小分别会导致什么问题？如何选择合适值？

**回答要点**： $\lambda$ 过大的权重被过度缩小，模型过于简单导致欠拟合（高偏差）； $\lambda$ 过小则正则化几乎无效，模型仍可能过拟合（高方差）；实践中用交叉验证选择——RidgeCV/LassoCV 自动搜索对数尺度上的 $\lambda$ 网格。

> 理解前置知识可参见 [正则化](./20-正则化.md)；理解前置知识可参见 [ElasticNet正则化](./23-ElasticNet正则化.md)；理解前置知识可参见 [线性回归](./06-线性回归.md)