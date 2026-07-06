---
author: "XunZong"
created: "2026-07-06"
tags: ["数学", "微积分", "Hessian"]
aliases: ["Hessian矩阵", "二阶导数", "曲率", "Hessian Matrix"]
---

# Hessian 矩阵与二阶导

## 定义

Hessian 矩阵是多元函数的**二阶偏导数矩阵**，描述了函数在某点的曲率：

$$H_{ij} = \frac{\partial^2 f}{\partial x_i \partial x_j}$$

对于 $f: \mathbb{R}^n \to \mathbb{R}$，$H \in \mathbb{R}^{n \times n}$ 是一个对称矩阵（当二阶偏导连续时）：

$$H = \begin{bmatrix}
\frac{\partial^2 f}{\partial x_1^2} & \frac{\partial^2 f}{\partial x_1 \partial x_2} & \cdots \\
\frac{\partial^2 f}{\partial x_2 \partial x_1} & \frac{\partial^2 f}{\partial x_2^2} & \cdots \\
\vdots & \vdots & \ddots
\end{bmatrix}$$

## 几何意义

| 一阶导（梯度） | 二阶导（Hessian） |
|---------------|-------------------|
| 告诉"往哪走"（方向） | 告诉"曲面有多弯"（曲率） |
| 决定更新方向 | 决定应该走多快（步长） |
| 线性近似 | 二次近似 |

通过泰勒展开理解：

$$f(\mathbf{x} + \Delta \mathbf{x}) \approx f(\mathbf{x}) + \nabla f(\mathbf{x})^T \Delta \mathbf{x} + \frac{1}{2} \Delta \mathbf{x}^T H(\mathbf{x}) \Delta \mathbf{x}$$

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
| **牛顿法** | $\theta_{t+1} = \theta_t - H^{-1}\nabla L(\theta_t)$ | 利用曲率加速收敛 |
| **凸函数判别** | Hessian 半正定 $\iff$ 凸函数 | 全局最优性的保证 |
| **优化条件** | $\nabla L(\theta^*) = 0, H(\theta^*) \succ 0$ | 极小值的充分条件 |
| **自然梯度** | $F = \mathbb{E}[\nabla \log p \cdot \nabla \log p^T]$ | Fisher 信息矩阵是 Hessian 的期望 |

> 参见 [[03-梯度与方向导数]]、[[01-导数与偏导数]]、[[16-正定矩阵与二次型]]
