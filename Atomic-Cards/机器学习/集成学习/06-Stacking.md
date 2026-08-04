---
author: "XunZong"
created: "2026-07-07"
tags: ["机器学习", "集成学习", "Stacking"]
aliases: ["Stacking", "堆叠", "Stacked Generalization"]
---

# Stacking

## 定义

Stacking（Stacked Generalization）通过**层级结构**组合多个不同基模型的输出：第一层训练多个异构基模型，将这些模型的预测结果（或概率）作为新的特征输入到第二层的**元模型**（Meta Model / Meta Learner）中，由元模型学习如何最优地融合基模型的判断。

数学形式，令基模型为 $h_1, h_2, \ldots, h_K$ ，元模型为 $g$ ，输入为 $x$ ，预测输出为 $\hat{y}$ ：

$$
 \hat{y} = g\left(h_1(x), h_2(x), \ldots, h_K(x)\right) 
$$

为防止信息泄露，基模型的预测通过 **K 折交叉验证**生成（out-of-fold predictions），确保元模型训练数据未经基模型在训练集上见过。

## 核心公式：两层训练流程

| 阶段 | 输入 | 输出 | 说明 |
|------|------|------|------|
| Level-1 训练 | $(X_{\text{train}}, y_{\text{train}})$ | 基模型 $h_1, \ldots, h_K$ | 每个基模型在 $K-1$ 折上训练 |
| Level-1 预测 | $X_{\text{train}}$ (OOF 折) | $\hat{y}_1, \ldots, \hat{y}_K$ | 对每折的验证集做预测，拼接成 OOF 特征 |
| Level-2 训练 | $(\hat{y}_1, \ldots, \hat{y}_K, y_{\text{train}})$ | 元模型 $g$ | 以 OOF 预测为特征训练元模型 |
| 最终预测 | $X_{\text{test}}$ | $\hat{y}_{\text{final}}$ | 基模型先对测试集预测 $\to$ 元模型输出最终结果 |

## 直观理解

**Stacking 的核心逻辑**：多个不同领域的专家给出各自判断，再由一个总编（元模型）学习每个专家的可信度和互补模式，做出最终决策。

## ML/DL 应用场景

| 应用场景 | 数学形式 | 说明 |
|----------|----------|------|
| Kaggle 竞赛 | $\hat{y} = g\left(h_{\text{GBDT}}(x), h_{\text{RF}}(x), h_{\text{NN}}(x)\right)$ | 融合树模型和神经网络的预测，通常是冠军方案标配 |
| 模型蒸馏 | $p_{\text{meta}} = g\left(p_{\text{teacher}_1}(x), \ldots, p_{\text{teacher}_K}(x)\right)$ | 用元模型融合多个教师模型的软概率输出 |
| 多模态融合 | $\hat{y} = g\left(h_{\text{text}}(x), h_{\text{image}}(x), h_{\text{audio}}(x)\right)$ | 不同模态分别建模后，元模型学习跨模态互补关系 |
| AutoML 模型选择 | $\hat{y} = \text{softmax}\left(\sum_k w_k h_k(x)\right)$ | 元模型学习各算法在特定数据上的权重，动态选择最优组合 |

## 代码示例

```python
from sklearn.ensemble import StackingClassifier
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.svm import SVC
from sklearn.datasets import make_classification
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score

# 生成二分类数据集：1000个样本，20个特征
X, y = make_classification(n_samples=1000, n_features=20, n_informative=15,
                           n_redundant=5, random_state=42)

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2,
                                                    random_state=42)

# 第一层：异构基模型（来自不同算法族，确保多样性）
base_learners = [
    ('rf',  RandomForestClassifier(n_estimators=100, random_state=42)),     # 树模型
    ('gbdt', GradientBoostingClassifier(n_estimators=100, random_state=42)), # 梯度提升
    ('svm', SVC(probability=True, random_state=42))                         # 核模型
]

# 第二层：元模型——简单的逻辑回归
#   - 元模型学习如何最优地融合三个基模型的预测概率
#   - 简单模型可有效防止过拟合
#   - cv=5：使用5折交叉验证生成基模型在训练集上的OOF预测，防止信息泄露
stacking = StackingClassifier(
    estimators=base_learners,
    final_estimator=LogisticRegression(),
    cv=5,
    stack_method='predict_proba'  # 使用概率输出作为元模型特征，信息更丰富
)

stacking.fit(X_train, y_train)                   # 训练：自动完成5折交叉验证+元模型训练

y_pred = stacking.predict(X_test)                # 预测：基模型先预测→元模型融合输出最终结果

print(f"Stacking 测试集准确率: {accuracy_score(y_test, y_pred):.4f}")

# 对比单个基模型的表现，验证集成效果
for name, model in base_learners:
    model.fit(X_train, y_train)
    acc = accuracy_score(y_test, model.predict(X_test))
    print(f"{name} 单独准确率: {acc:.4f}")
```

## 面试追问

**Q1（基础）**：Stacking 和 Bagging / Boosting 在结构上有什么本质不同？
**回答要点**：

1. 基模型同质性：Bagging 和 Boosting 通常使用同质基模型（同一算法），Stacking 必须使用异质基模型（不同算法族）。
2. 训练方式：Bagging 并行独立训练，Boosting 串行迭代训练，Stacking 采用层级结构——第一层并行训练基模型，第二层训练元模型。
3. 融合策略：Bagging 和 Boosting 通过简单平均或投票融合，Stacking 引入元模型学习基模型的输出模式，实现最优加权融合。

**Q2（深挖）**：为什么 Stacking 必须使用交叉验证生成基模型的预测？不使用会有什么后果？
**回答要点**：

1. 信息泄露风险：若直接在全部训练集上训练基模型再预测相同训练集，元模型会学到基模型在已见数据上的过拟合模式，失去泛化能力。
2. 交叉验证机制：通过 K 折交叉验证生成 out-of-fold 预测，每个样本的预测由未见过该样本的基模型产生。
3. 保证泛化性：OOF 预测模拟了基模型在未见数据上的表现，使元模型训练特征反映真实泛化能力。

**Q3（实战）**：设计 Stacking 时，基模型的数量和多样性如何选择？元模型用什么算法比较好？
**回答要点**：

1. 基模型数量：3-5 个为宜，太少缺少多样性，太多导致特征空间过大且收益递减。
2. 基模型多样性：基模型应来自不同算法族（树模型 + 线性模型 + 神经网络），确保互补性。
3. 元模型选择：推荐简单模型如逻辑回归或线性模型以降低过拟合风险；也可用 GBDT 但需强正则化。

**Q4（边界）**：Stacking 在什么场景下可能不如单个最优模型？如何规避？
**回答要点**：

1. 互补性不足：基模型之间无互补性（如高度相似的模型族）或某个基模型远劣于其他时，Stacking 可能被拖累。
2. 小数据量风险：数据量较小时，两层训练进一步减少有效样本量，容易导致过拟合。
3. 解决方案：对基模型做筛选（只保留表现好的）、使用简单元模型、增加交叉验证折数。

## 参考引用
- 需要理解随机森林的相关知识，参见 [随机森林](02-随机森林.md)
- 需要理解梯度提升机的相关知识，参见 [梯度提升机](03-梯度提升机.md)
- 需要理解集成学习的相关知识，参见 [集成学习](01-集成学习.md)
