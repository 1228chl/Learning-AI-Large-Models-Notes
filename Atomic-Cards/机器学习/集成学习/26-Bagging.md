---
author: "XunZong"
created: "2026-07-07"
tags: ["机器学习", "集成学习", "Bagging"]
aliases: ["Bagging", "Bootstrap Aggregating", "装袋"]
---

# Bagging

## 定义

Bagging（Bootstrap Aggregating）通过对原始训练数据进行**有放回采样**（Bootstrap Sampling）生成 $M$ 个不同的子集，在每个子集上独立训练一个基学习器，最终通过**投票**（分类）或**平均**（回归）整合所有基学习器的输出。

设 $x$ 为输入样本，$\hat{f}_m(x)$ 为第 $m$ 个基模型的回归预测值，$\hat{y}_m$ 为第 $m$ 个基模型的分类预测类别，则 Bagging 的预测可以表示为：

$$
 \hat{f}_{\text{bag}}(x) = \frac{1}{M} \sum_{m=1}^{M} \hat{f}_m(x) \quad (\text{回归}) 
$$

$$
 \hat{y}_{\text{bag}} = \text{mode}\{\hat{y}_1, \hat{y}_2, \ldots, \hat{y}_M\} \quad (\text{分类}) 
$$

## 核心公式：偏差-方差分解

Bagging 的核心优势在于**降低方差**。假设每个基模型方差为 $\sigma^2$ ，且模型间相关性为 $\rho$ ：

| 概念 | 公式 | 说明 |
|------|------|------|
| 单个模型方差 | $\sigma^2$ | 基模型的预测方差 |
| Bagging 方差 | $\rho \sigma^2 + \frac{1-\rho}{M} \sigma^2$ | $M$ 个模型平均后的方差 |
| 完全独立时 | $\sigma^2 / M$ | $\rho = 0$ ，方差降至 $1/M$ |
| 完全相同时 | $\sigma^2$ | $\rho = 1$ ，无方差降低效果 |

当基模型独立性较强时，Bagging 可显著降低方差，而偏差保持不变。

## 直观理解

**Bagging 的核心逻辑**：多个不完美的专家独立判断，然后综合他们的意见——错误会相互抵消，正确的判断会被放大。

### Bootstrap 采样为何有效？

Bootstrap 采样的关键性质：每个子集包含了原始数据约 63.2% 的不同样本（其余 36.8% 是重复的），这些重复样本并非浪费——它们模拟了数据分布的不确定性。不同子集之间的差异使得基模型学到略有不同的决策边界，这种差异正是集成降低方差所需的关键"多样性"。

### Bagging vs 深度学习的 Dropout

Dropout 可视为 Bagging 在神经网络中的近似：每次前向传播随机丢弃一部分神经元，相当于采样了一个不同的"子网络"。与标准 Bagging 不同，Dropout 的子网络共享权重，且训练时在权重层面做集成而非在模型层面。这使 Dropout 在计算上比完整 Bagging 高效得多，但集成的多样性也相对受限。

## ML/DL 应用场景

| 应用场景 | 数学形式 | 说明 |
|----------|----------|------|
| 随机森林 | $\hat{y} = \text{majority vote}\{h_1(x), \ldots, h_T(x)\}$ | 在 Bagging 基础上引入特征随机选择，进一步降低相关性（$h_t(x)$ 为第 $t$ 棵决策树的预测，$T$ 为决策树数量） |
| 深度集成 | $\hat{y} = \frac{1}{M} \sum_{i=1}^{M} f_{\theta_i}(x)$ | 同一网络结构不同初始化训练多个模型后平均预测（$f_{\theta_i}(x)$ 为参数 $\theta_i$ 对应的网络输出） |
| Dropout | $\hat{y} = \frac{1}{T} \sum_{t=1}^{T} f(x; \theta \odot z_t)$ | 可视为 Bagging 在神经网络中的近似实现（子网络集成）（$\theta$ 为网络参数，$z_t$ 为第 $t$ 次前向传播的 Dropout 掩码，$\odot$ 为逐元素乘法） |
| 置信度校准 | $p(y \vert x) = \frac{1}{M} \sum_{m=1}^{M} p_m(y \vert x)$ | 多模型平均概率输出，提升预测置信度可靠性（$p_m(y|x)$ 为第 $m$ 个模型预测的条件概率） |

## 代码示例

```python
from sklearn.ensemble import BaggingClassifier
from sklearn.tree import DecisionTreeClassifier
from sklearn.datasets import make_classification
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score

# 生成一个二分类数据集：1000个样本，20个特征，其中15个有信息量
X, y = make_classification(n_samples=1000, n_features=20, n_informative=15,
                           n_redundant=5, random_state=42)

# 划分训练集和测试集：80% 训练，20% 测试
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2,
                                                    random_state=42)

# 创建 Bagging 分类器：
#   - 基模型：决策树（默认设置，易过拟合—Bagging恰好能缓解）
#   - n_estimators=50：集成50棵决策树
#   - max_samples=0.8：每个子采样集取80%的原始样本（有放回）
#   - oob_score=True：使用袋外样本评估泛化性能，无需单独验证集
bagging = BaggingClassifier(
    estimator=DecisionTreeClassifier(),
    n_estimators=50,
    max_samples=0.8,
    oob_score=True,
    random_state=42
)

bagging.fit(X_train, y_train)                    # 训练：自动生成子集并训练各基模型

y_pred = bagging.predict(X_test)                 # 预测：各基模型投票决定最终类别

print(f"测试集准确率: {accuracy_score(y_test, y_pred):.4f}")  # 输出模型在测试集上的表现
print(f"OOB 分数（泛化误差无偏估计）: {bagging.oob_score_:.4f}")  # 袋外评估分数，接近测试集表现
```

## 面试追问

**Q1（基础）**：Bagging 的全称是什么？它的训练过程和预测过程分别怎么做？
**回答要点**：

1. 全称 Bootstrap Aggregating（引导聚合）
2. 训练过程：对原始数据进行有放回采样（Bootstrap Sampling）生成 $M$ 个子集，每个子集独立训练一个基模型
3. 预测过程：分类任务用多数投票（Majority Vote），回归任务用均值平均（Averaging）

**Q2（深挖）**：为什么 Bagging 主要降低方差而非偏差？从偏差-方差分解角度推导。
**回答要点**：

1. Bootstrap 采样保持了与原始数据相同的分布，每个基模型的期望相同，因此偏差不变
2. Bagging 将多个模型平均，方差按 $\rho \sigma^2 + (1-\rho)\sigma^2/M$ 变化
3. 当基模型相关性 $\rho$ 较低时，方差可降至 $\sigma^2/M$，显著降低方差

**Q3（实战）**：如何评估 Bagging 模型的泛化性能而不需要单独的验证集？
**回答要点**：

1. 利用袋外（Out-of-Bag, OOB）样本进行无偏估计
2. 设 $N$ 为原始样本数，每个 Bootstrap 子集中约有 36.8% 的样本未被选中（$(1-1/N)^N \approx 1/e \approx 0.368$）
3. 计算所有基模型在 OOB 样本上的平均误差作为泛化性能估计，接近在测试集上的表现

**Q4（边界）**：当基模型之间高度相关时，Bagging 的效果会如何变化？如何增加模型的多样性？
**回答要点**：

1. 当基模型高度相关（$\rho \to 1$）时，方差降为 $\sigma^2$，集成几乎无效果
2. 可通过随机子空间（特征采样）增加模型间的多样性
3. 不同初始化、不同超参数配置、不同数据子集等方式也可使 $\rho$ 趋近 0

## 参考引用
- 需要理解决策树的相关知识，参见 [决策树](../监督学习/11-决策树.md)
- 需要理解随机森林的相关知识，参见 [随机森林](13-随机森林.md)
- 需要理解集成学习的相关知识，参见 [集成学习](12-集成学习.md)
