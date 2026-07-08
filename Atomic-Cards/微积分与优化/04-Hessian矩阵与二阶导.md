---
author: "XunZong"
created: "2026-07-06"
tags: ["数学", "微积分", "Hessian"]
aliases: ["Hessian矩阵", "二阶导数", "曲率", "Hessian Matrix"]
---

# Hessian 矩阵与二阶导

## 定义

Hessian 矩阵是多元函数的**二阶偏导数矩阵**，描述了函数在某点的曲率：

$$
H_{ij} = \frac{\partial^2 f}{\partial x_i \partial x_j}
$$

对于 $f: \mathbb{R}^n \to \mathbb{R}$ ， $H \in \mathbb{R}^{n \times n}$ 是一个对称矩阵（当二阶偏导连续时）：

$$
H = \begin{bmatrix}
\frac{\partial^2 f}{\partial x_1^2} & \frac{\partial^2 f}{\partial x_1 \partial x_2} & \cdots \\
\frac{\partial^2 f}{\partial x_2 \partial x_1} & \frac{\partial^2 f}{\partial x_2^2} & \cdots \\
\vdots & \vdots & \ddots
\end{bmatrix}
$$

## 几何意义

| 一阶导（梯度） | 二阶导（Hessian） |
|---------------|-------------------|
| 告诉"往哪走"（方向） | 告诉"曲面有多弯"（曲率） |
| 决定更新方向 | 决定应该走多快（步长） |
| 线性近似 | 二次近似 |

通过泰勒展开理解：

$$
f(\mathbf{x} + \Delta \mathbf{x}) \approx f(\mathbf{x}) + \nabla f(\mathbf{x})^T \Delta \mathbf{x} + \frac{1}{2} \Delta \mathbf{x}^T H(\mathbf{x}) \Delta \mathbf{x}$$

## 极值判定条件

| Hessian 性质 | 驻点类型 |
|-------------|----------|
| **正定**（所有特征值 > 0） | 局部极小值 |
| **负定**（所有特征值 < 0） | 局部极大值 |
| **不定**（特征值有正有负） | 鞍点 |
| **半正定**（特征值 >= 0） | 可能是极小值，需进一步判断 |

## ML 中的关键出现位置

| 应用 | 形式 | 说明 |
|------|------|------|
| **牛顿法** | $\theta_{t+1} = \theta_t - H^{-1}\nabla L(\theta_t)$ | $\theta_t$：第 $t$ 步的参数；$L$：损失函数。利用曲率加速收敛 |
| **凸函数判别** | Hessian 半正定 $\iff$ 凸函数 | 全局最优性的保证 |
| **优化条件** | $\nabla L(\theta^*) = 0, H(\theta^*) \succ 0$ | $\theta^*$：最优参数；$L$：损失函数。极小值的充分条件 |
| **自然梯度** | $F = \mathbb{E}[\nabla \log p \cdot \nabla \log p^T]$ | $F$：Fisher 信息矩阵；$p$：概率分布。Fisher 信息矩阵是 Hessian 的期望 |

## 面试追问

**Q1（基础）**：Hessian 矩阵的定义是什么？如何利用 Hessian 矩阵判断一个驻点是极小值、极大值还是鞍点？
**回答要点**：

1. Hessian 是多元函数的二阶偏导矩阵 $H_{ij} = \partial^2 f / \partial x_i \partial x_j$。
2. 在驻点处（梯度为零），若 $H$ 正定（所有特征值 > 0）则为局部极小值；$H$ 负定（所有特征值 < 0）则为局部极大值；$H$ 不定（特征值有正有负）则为鞍点。
3. 对于半正定/半负定需进一步分析更高阶项。

**Q2（深挖）**：如何从泰勒展开的角度理解"梯度提供方向、Hessian 提供曲率"这句话？为什么说 Hessian 能告诉我们应该走多快？
**回答要点**：

1. 二阶泰勒展开 $f(x+\Delta x) \approx f(x) + \nabla f^T \Delta x + \frac{1}{2} \Delta x^T H \Delta x$ 中，一阶项 $\nabla f^T \Delta x$ 指导更新方向，二阶项 $\frac{1}{2} \Delta x^T H \Delta x$ 描述曲率。
2. 曲率小的地方函数平坦，步长可大一些；曲率大的地方函数陡峭，步长需小。
3. 牛顿法 $H \Delta x = -\nabla f$ 利用 Hessian 自动调整每维度的步长，平坦方向大步长、陡峭方向小步长。

**Q3（实战）**：牛顿法利用 Hessian 加速收敛，为什么在深度学习中几乎不使用牛顿法？实践中有什么近似方案？
**回答要点**：

1. 计算量 $O(n^2)$ 存储 Hessian 和 $O(n^3)$ 求逆，对于百万参数模型不可行。
2. Hessian 在非凸区域不一定是正定的，直接求逆可能导致非下降方向。
3. 近似方案包括拟牛顿法（BFGS/L-BFGS 用梯度差近似 Hessian）、KFAC（Kronecker-Factored Approximate Curvature）将 Hessian 分解为克罗内克积、以及自然梯度法使用 Fisher 信息矩阵作为 Hessian 的期望近似。

**Q4（边界）**：在什么情况下 Hessian 矩阵的正定性判别会失效？对于非凸的深度学习损失函数，Hessian 还提供什么有用信息？
**回答要点**：

1. 在鞍点处 $H$ 不定，无法用 Hessian 直接判断；当目标函数不满足二阶连续可微时 Hessian 不存在或不连续；具有平坦区域（plateau）的函数 Hessian 可能接近零矩阵，失去判别力。
2. Hessian 的谱结构能揭示极值点的泛化特性：Hessian 大部分特征值接近零且仅有少数大的正特征值（尖锐极小值），通常泛化较差。
3. 平坦极小值（Hessian 谱范数小）通常泛化更好——这也是 SGD 偏向平坦极小值的理论解释之一。

## 参考引用
- 需要理解梯度与方向导数的相关知识，参见 [梯度与方向导数](./03-梯度与方向导数.md)
- 需要理解导数与偏导数的相关知识，参见 [导数与偏导数](./01-导数与偏导数.md)
- 需要掌握正定矩阵与二次型的相关知识，参见 [正定矩阵与二次型](../线性代数/16-正定矩阵与二次型.md)
