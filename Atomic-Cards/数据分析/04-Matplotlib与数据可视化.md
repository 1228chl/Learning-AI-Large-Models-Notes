---
author: "XunZong"
created: "2026-07-06"
tags: ["数据分析", "Matplotlib", "可视化"]
aliases: ["Matplotlib", "可视化", "画图"]
---

# Matplotlib 与数据可视化

## 定义

Matplotlib 是 Python 生态中最基础的数据可视化库。其核心哲学：**一步步构建图表**——创建画布、添加元素、调整样式。

```python
import matplotlib.pyplot as plt
import numpy as np

x = np.linspace(0, 10, 100)
y = np.sin(x)

plt.figure(figsize=(8, 4))    # 创建画布
plt.plot(x, y, label='sin(x)')
plt.xlabel('x'); plt.ylabel('y')
plt.title('Sine Wave')
plt.legend()
plt.grid(True)
plt.show()
```

## 常用图表类型

| 图表 | 函数 | 适用场景 | 示例 |
|:----:|:----|:--------|:----|
| **折线图** | `plt.plot()` | 连续趋势、时间序列 | loss 曲线、准确率变化 |
| **散点图** | `plt.scatter()` | 两变量关系 | 特征 vs 标签、聚类结果 |
| **柱状图** | `plt.bar()` | 类别对比 | 各模型准确率对比 |
| **直方图** | `plt.hist()` | 数据分布 | 特征分布、标签分布 |
| **箱线图** | `plt.boxplot()` | 异常值检测 | 特征的值域和离群情况 |
| **热力图** | `plt.imshow()` | 矩阵可视化 | 混淆矩阵、相关性矩阵 |

```python
# ML 常见组合
fig, axes = plt.subplots(2, 2, figsize=(12, 8))

axes[0, 0].plot(train_loss, label='Train Loss')
axes[0, 0].plot(val_loss, label='Val Loss')
axes[0, 0].legend()
axes[0, 0].set_title('Training Curve')

axes[0, 1].scatter(y_test, y_pred, alpha=0.5)
axes[0, 1].plot([y.min(), y.max()], [y.min(), y.max()], 'r--')
axes[0, 1].set_xlabel('True'); axes[0, 1].set_ylabel('Predicted')

axes[1, 0].hist(model.predict_proba(X_test)[:, 1], bins=50)

axes[1, 1].imshow(confusion_matrix, cmap='Blues', interpolation='nearest')
plt.tight_layout()
```

## 训练过程可视化

```python
# 绘制训练过程中的 loss 和准确率
def plot_training(history):
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 4))
    
    ax1.plot(history['train_loss'], label='Train')
    ax1.plot(history['val_loss'], label='Validation')
    ax1.set_xlabel('Epoch'); ax1.set_ylabel('Loss')
    ax1.legend(); ax1.grid(True)
    
    ax2.plot(history['train_acc'], label='Train')
    ax2.plot(history['val_acc'], label='Validation')
    ax2.set_xlabel('Epoch'); ax2.set_ylabel('Accuracy')
    ax2.legend(); ax2.grid(True)
    
    plt.tight_layout()
    plt.show()
```

## 可视化最佳实践

```python
# 1. 使用子图对比
# 2. 坐标轴标签必须加（别人能看懂）
# 3. 图例必须加
# 4. 颜色使用专业配色（viridis / plasma / tab10）
# 5. 图片用矢量格式保存（SVG/PDF）
plt.savefig('figure.pdf', bbox_inches='tight', dpi=150)
```

## ML 中的可视化

| 应用场景 | 图表 | 说明 |
|:--------:|:----|:----|
| **训练监控** | 折线图 | Loss 曲线、学习率变化 |
| **模型对比** | 柱状图 | 各模型的精度/F1/AUC 对比 |
| **分类结果** | 混淆矩阵热力图 | 各类别的预测情况 |
| **回归结果** | 散点图 + 对角线 | 预测值 vs 真实值 |
| **特征分布** | 直方图 / 箱线图 | 各特征的值分布 |
| **高维可视化** | PCA/t-SNE 散点图 | 高维数据降维后可视化 |
| **特征重要性** | 水平柱状图 | 随机森林/XGBoost 的特征重要性排序 |

> 参见 [[01-NumPy与ndarray]]、[[03-Pandas与DataFrame]]
