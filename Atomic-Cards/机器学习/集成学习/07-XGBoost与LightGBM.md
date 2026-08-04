---
author: "XunZong"
created: "2026-07-10"
tags: ["机器学习", "集成学习", "XGBoost", "LightGBM"]
aliases: ["XGBoost", "LightGBM", "梯度提升树", "GBDT", "CatBoost"]
---

# XGBoost 与 LightGBM

## 定义

XGBoost 和 LightGBM 是梯度提升决策树（GBDT）的工业级高效实现，在 Kaggle 竞赛和工业应用中长期占据统治地位。核心思想是**串行训练多棵决策树**，每棵新树拟合前一棵树的残差。

形式化：最终预测为所有树的预测之和：

$$
\hat{y}_i = \sum_{k=1}^{K} f_k(x_i), \quad f_k \in \mathcal{F}
$$

其中 $f_k$ 为第 $k$ 棵决策树，$\mathcal{F}$ 为所有树的函数空间，$K$ 为树的棵数。

## XGBoost

### 核心创新

| 创新点 | 说明 |
|:-------|:------|
| **二阶泰勒展开** | 损失函数展开到二阶，比传统 GBDT（一阶）收敛更快 |
| **正则化目标函数** | 加入树的叶子节点数 $T$ 和叶子权重的 L2 正则，防止过拟合 |
| **列采样** | 类似随机森林的特征列采样，增加随机性 |
| **加权分位数** | 对非均匀分布的特征用加权分位数草图确定分裂点 |
| **稀疏感知** | 自动处理缺失值，学习最佳分裂方向 |

目标函数（在每一步迭代中）：

$$
\mathcal{L}^{(t)} = \sum_{i=1}^{n} \underbrace{\left[ g_i f_t(x_i) + \frac{1}{2} h_i f_t^2(x_i) \right]}_{\text{二阶泰勒展开}} + \underbrace{\gamma T + \frac{1}{2} \lambda \sum_{j=1}^{T} w_j^2}_{\text{正则化项}}
$$

其中 $g_i = \partial_{\hat{y}^{(t-1)}} \ell(y_i, \hat{y}^{(t-1)})$ 为一阶梯度，$h_i$ 为二阶梯度，$w_j$ 为叶子权重，$T$ 为叶子数，$\gamma, \lambda$ 为正则化系数。

### 树的分裂增益

XGBoost 用二阶导计算分裂后的增益，选择增益最大的特征和分裂点：

$$
\text{Gain} = \frac{1}{2} \left[ \frac{(\sum g_i)^2}{\sum h_i + \lambda} + \frac{(\sum g_r)^2}{\sum h_r + \lambda} - \frac{(\sum g)^2}{\sum h + \lambda} \right] - \gamma
$$

## LightGBM

### 核心创新

| 创新点 | 说明 | 效果 |
|:-------|:-----|:------|
| **GOSS（梯度单边采样）** | 保留大梯度样本，随机采样小梯度样本 | 减少数据量，聚焦难样本 |
| **EFB（互斥特征捆绑）** | 将互斥的特征合并为单一特征 | 降维，加速特征分裂搜索 |
| **叶子节点分裂（Leaf-wise）** | 每次选增益最大的叶子分裂 | 更快收敛，但需控制深度防过拟合 |
| **直方图算法** | 将连续特征离散化为直方图桶 | 大幅减少分裂候选点 |

```python
import xgboost as xgb
import lightgbm as lgb
from sklearn.datasets import load_boston
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error

X, y = load_boston(return_X_y=True)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2)

# ==================== XGBoost ====================
xgb_model = xgb.XGBRegressor(
    n_estimators=100,              # 树的数量，越多越容易过拟合
    max_depth=6,                   # 树的最大深度，控制单棵树的复杂度
    learning_rate=0.1,             # 学习率（步长收缩），每棵树的贡献乘以该系数
    subsample=0.8,                 # 行采样比例，每棵树使用 80% 的样本训练
    colsample_bytree=0.8,          # 列采样比例，每棵树使用 80% 的特征
    reg_lambda=1.0,                # L2 正则化系数，控制叶子权重的平方和
    reg_alpha=0.0,                 # L1 正则化系数
    random_state=42
)
xgb_model.fit(X_train, y_train)
xgb_pred = xgb_model.predict(X_test)
xgb_rmse = mean_squared_error(y_test, xgb_pred, squared=False)

# ==================== LightGBM ====================
lgb_model = lgb.LGBMRegressor(
    n_estimators=100,
    max_depth=-1,                  # -1 表示不限制深度（叶子节点分裂），需配合 num_leaves
    num_leaves=31,                 # 每棵树的最大叶子数，控制模型复杂度（关键超参数）
    learning_rate=0.1,
    subsample=0.8,
    colsample_bytree=0.8,
    reg_lambda=1.0,
    random_state=42
)
lgb_model.fit(X_train, y_train)
lgb_pred = lgb_model.predict(X_test)
lgb_rmse = mean_squared_error(y_test, lgb_pred, squared=False)

# 特征重要性
importance = xgb_model.feature_importances_     # 默认基于分裂次数
# lgb_model.feature_importances_                # LightGBM 同理
```

## XGBoost vs LightGBM 对比

| 维度 | XGBoost | LightGBM |
|:-----|:-------:|:--------:|
| **分裂策略** | 按层分裂（Level-wise） | 按叶子分裂（Leaf-wise） |
| **训练速度** | 较快（10 万+样本） | **最快**（百万级样本优势显著） |
| **内存占用** | 较高 | **低**（直方图算法） |
| **高维稀疏特征** | 较好（稀疏感知） | 一般（直方图离散化丢失稀疏信息） |
| **小数据集** | **更好**（<1 万样本） | 容易过拟合 |
| **缺失值处理** | 自动学习分裂方向 | 自动学习 |
| **类别特征** | 需手动编码 | **原生支持**（categorical_feature）|
| **分布式支持** | 完善（Spark/Flink） | 较新 |

## 面试追问

**Q1（基础）**：XGBoost 相比传统 GBDT 的核心改进是什么？
**回答要点**：

1. 使用**二阶泰勒展开**近似损失函数（传统 GBDT 只用一阶梯度），更精确地近似损失函数，收敛更快。
2. 目标函数加入**正则化项**（叶子数 + 叶节点权重的 L2 范数），防止过拟合。
3. 支持列采样、学习率收缩、自定义损失函数。

**Q2（深挖）**：LightGBM 的 GOSS 和 EFB 分别解决什么问题？为什么 LightGBM 比 XGBoost 快？
**回答要点**：

1. GOSS（梯度单边采样）：保留大梯度样本（信息量大），随机采样小梯度样本（信息量小），减少数据量的同时尽量保留有用信息。
2. EFB（互斥特征捆绑）：将互斥的特征合并为单一特征，降低特征维度，减少分裂候选点搜索时间。
3. 直方图算法将连续特征离散化为 255 个桶，使分裂点搜索从 $O(\text{样本数})$ 降到 $O(\text{桶数})$，这是 LightGBM 比 XGBoost 快数倍的主要原因。

**Q3（实战）**：在百万级数据上做分类任务，你会选择 XGBoost 还是 LightGBM？如何调参？
**回答要点**：

1. 百万级数据选 LightGBM：训练速度快数倍，内存占用低。小数据（<1 万）选 XGBoost 更稳定。
2. 优先调节的超参数：num_leaves（LightGBM）/ max_depth（XGBoost）控制复杂度；min_child_samples / min_child_weight 防止过拟合；subsample / colsample_bytree 增加随机性。
3. 早停：用 early_stopping_rounds=50 监控验证集损失，自动找到最佳迭代次数。
4. 类别不平衡：设置 scale_pos_weight / is_unbalance，或使用 AUC 作为评估指标。

**Q4（边界）**：树模型在深度学习时代还有价值吗？什么场景下树模型优于神经网络？
**回答要点**：

1. **表格数据**（结构化数据）：XGBoost/LightGBM 通常优于深度学习，因为树模型对特征缩放不敏感、能自动处理缺失值和异常值、可解释性强。
2. **小数据场景**（<1 万样本）：树模型泛化能力优于神经网络。
3. **低延迟要求**：树模型推理时间微秒级，远快于神经网络。
4. 深度学习在图像、文本、语音等非结构化数据上占绝对优势，树模型在这些场景无效。

## 参考引用

- 需要理解梯度提升树的基础原理参见 [梯度提升机](./03-梯度提升机.md)
- 需要理解 Boosting 思想与 Bagging 的区别参见 [Boosting](./05-Boosting.md)
- 需要理解特征重要性作为可解释性工具参见 [模型可解释性](../../机器学习/基础/08-模型可解释性.md)
- 需要理解决策树的分裂原理参见 [决策树](../../机器学习/监督学习/06-决策树.md)