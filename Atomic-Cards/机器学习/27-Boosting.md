---
author: "XunZong"
created: "2026-07-07"
tags: ["机器学习", "集成学习", "Boosting"]
aliases: ["Boosting", "提升", "AdaBoost", "GBDT"]
---

# Boosting

## 定义

Boosting 通过**串行训练**多个弱学习器，每个新模型重点关注前一轮预测错误的样本，逐步降低整体偏差，最终将一组弱学习器提升为一个强学习器。

AdaBoost 的权重更新公式：

$$
 w_i^{(t+1)} = w_i^{(t)} \cdot \exp\left(-\alpha_t y_i h_t(x_i)\right) 
$$

其中 $\alpha_t$ 是第 $t$ 个弱学习器的权重， $h_t(x_i)$ 为其预测结果， $y_i \in \{-1, +1\}$ 为真实标签。

梯度提升（GBDT）的通用形式：

$$
 F_m(x) = F_{m-1}(x) + \nu \cdot \gamma_m h_m(x) 
$$

其中 $\nu$ 为学习率， $\gamma_m$ 为步长， $h_m(x)$ 拟合前一轮的负梯度 $-\nabla_{F} L(y, F(x))$ 。

## 核心分类表

| 流派 | 更新策略 | 权重机制 | 代表算法 |
|------|----------|----------|----------|
| **Adaptive Boosting** | 调整样本权重 | 错误样本权重增大 | AdaBoost |
| **Gradient Boosting** | 拟合负梯度 | 无显式样本权重 | GBDT、XGBoost、LightGBM |
| **Binomial/Multinomial** | 拟合对数几率 | 概率代理损失 | LogitBoost |

## 直观理解

**Boosting 的核心逻辑**：一个学生做错的题，下次考试重点复习——每次迭代都在修正前一次的遗留错误，逐步逼近正确答案。

## ML/DL 应用场景

| 应用场景           | 数学形式                                                                              | 说明                                            |
| -------------- | --------------------------------------------------------------------------------- | --------------------------------------------- |
| GBDT / XGBoost | $F_m(x) = F_{m-1}(x) + \eta \cdot \arg\min_h \sum_i L(y_i, F_{m-1}(x_i) + h(x_i))$ | 竞赛和工业界最常用的表格数据建模方法                            |
| AdaBoost 人脸检测  | $H(x) = \sum_{t=1}^T \alpha_t h_t(x)$                                             | Viola-Jones 人脸检测器：级联弱分类器实现实时检测                |
| CatBoost       | 对称决策树 + 有序提升                                                                      | 处理类别特征的专用梯度提升变体                               |
| 深度 Boosting    | 残差网络（ResNet）                                                                      | $x_{l+1} = x_l + F(x_l)$ 可视为 Boosting 思想的深度实现 |

## 代码示例

```python
from sklearn.ensemble import AdaBoostClassifier, GradientBoostingClassifier
from sklearn.tree import DecisionTreeClassifier
from sklearn.datasets import make_classification
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score

# 生成二分类数据集：1000个样本，20个特征
X, y = make_classification(n_samples=1000, n_features=20, n_informative=15,
                           n_redundant=5, random_state=42)

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2,
                                                    random_state=42)

# ========== AdaBoost ==========
# AdaBoost 使用深度为1的决策树桩（stump）作为弱学习器
# 每轮训练后增大误分类样本的权重，让下一个弱学习器重点关注这些困难样本
ada = AdaBoostClassifier(
    estimator=DecisionTreeClassifier(max_depth=1),  # 弱学习器：单层决策树桩
    n_estimators=50,                                # 串行训练50个弱学习器
    learning_rate=1.0,                              # 每个弱学习器的贡献缩系数
    random_state=42
)
ada.fit(X_train, y_train)
y_pred_ada = ada.predict(X_test)
print(f"AdaBoost 测试集准确率: {accuracy_score(y_test, y_pred_ada):.4f}")

# ========== Gradient Boosting ==========
# Gradient Boosting 通过拟合前一轮的负梯度来迭代优化损失函数
# 学习率 learning_rate 控制每棵树的贡献步长，避免过拟合
gb = GradientBoostingClassifier(
    n_estimators=100,          # 100棵决策树，串行训练
    learning_rate=0.1,         # 学习率：缩小每棵树的贡献，留出更多迭代空间
    max_depth=3,               # 每棵树的最大深度，控制单个基模型复杂度
    subsample=0.8,             # 行采样比例：每棵树只用80%样本训练，增加随机性
    random_state=42
)
gb.fit(X_train, y_train)
y_pred_gb = gb.predict(X_test)
print(f"Gradient Boosting 测试集准确率: {accuracy_score(y_test, y_pred_gb):.4f}")
```

## 面试追问

**Q1（基础）**：Boosting 的工作流程是怎样的？AdaBoost 和 Gradient Boosting 的核心区别是什么？
**回答要点**：

1. Boosting 采用串行训练方式，每轮训练的新模型重点关注前一轮预测错误的样本，逐步降低整体偏差
2. AdaBoost 通过动态调整样本权重来关注错误样本，错误率高的样本权重增大，迫使后继模型重点学习
3. Gradient Boosting 不调整样本权重，而是通过拟合前一轮损失函数的负梯度来迭代逼近最优点

**Q2（深挖）**：为什么 Boosting 主要降低偏差而非方差？在什么情况下 Boosting 容易过拟合？
**回答要点**：

1. Boosting 每轮迭代都在拟合残差或负梯度方向，逐步逼近真实函数，因此主要降低偏差而非方差
2. 当 Boosting 过度关注噪声样本等困难样本时，模型复杂度显著增加，方差随之升高
3. 在噪声数据较多的场景中 Boosting 容易过拟合，需要配合正则化、早停或降低学习率等策略缓解

**Q3（实战）**：GBDT 和 XGBoost 相比有哪些改进？为什么要加入学习率 $\nu$ 和行/列采样？
**回答要点**：

1. XGBoost 引入二阶梯度近似（牛顿法），相比 GBDT 的一阶近似收敛更快、精度更高；同时加入正则化项控制树叶权重防止过拟合
2. 学习率 $\nu \in (0,1]$ 缩小每步更新幅度，为后续迭代留出更多优化空间，配合更多弱学习器可找到更优解
3. 行采样（subsample）和列采样（colsample_bytree）增加每棵树的随机性，降低基学习器间的相关性，提升泛化能力

**Q4（边界）**：Boosting 对噪声数据和异常值是否敏感？如何处理？
**回答要点**：

1. Boosting 对噪声和异常值非常敏感——异常值在迭代中会获得极高权重，导致后续模型偏离正常分布
2. Gradient Boosting 可使用 Huber 损失或 Quantile 损失等鲁棒损失函数来降低异常值的影响
3. AdaBoost 可设置样本权重上限限制异常值权重膨胀；此外提前停止、降低学习率也能有效缓解过拟合

## 参考引用
- 需要理解决策树的相关知识，参见 [决策树](./11-决策树.md)
- 需要理解梯度提升机的相关知识，参见 [梯度提升机](./14-梯度提升机.md)
- 需要理解集成学习的相关知识，参见 [集成学习](./12-集成学习.md)
