# CNN卷积神经网络

**标签：** #CNN #计算机视觉

---

## 1. 什么是CNN

卷积神经网络（CNN）是专门处理**网格结构数据**（如图像）的深度学习模型。

**核心思想**：
- **局部连接**：每个神经元只与输入图像的一个局部区域相连
- **权重共享**：同一个卷积核在整个图像上滑动时使用相同的权重
- **层次化特征提取**：浅层提取边缘、纹理，深层提取形状、物体部件

---

## 2. 核心组件

### 2.1 卷积层

```python
import torch.nn as nn

# 二维卷积层
conv = nn.Conv2d(
    in_channels=3,    # 输入通道数（RGB=3）
    out_channels=64,  # 输出通道数（卷积核数量）
    kernel_size=3,    # 卷积核大小
    stride=1,         # 步长
    padding=1         # 填充
)
```

**卷积计算公式**：

$$
O = \lfloor \frac{W - K + 2P}{S} \rfloor + 1
$$

其中：$W$是输入大小，$K$是卷积核大小，$P$是填充，$S$是步长

### 2.2 池化层

```python
# 最大池化
pool = nn.MaxPool2d(kernel_size=2, stride=2)

# 平均池化
pool = nn.AvgPool2d(kernel_size=2, stride=2)

# 全局平均池化
gap = nn.AdaptiveAvgPool2d((1, 1))
```

### 2.3 批量归一化

```python
bn = nn.BatchNorm2d(64)  # 对64个通道进行归一化
```

---

## 3. 经典CNN架构

| 网络 | 年份 | 核心贡献 |
|------|------|----------|
| **LeNet-5** | 1998 | 最早的CNN，手写数字识别 |
| **AlexNet** | 2012 | ReLU、Dropout、GPU训练 |
| **VGGNet** | 2014 | 多个小卷积核堆叠 |
| **GoogLeNet** | 2014 | Inception模块 |
| **ResNet** | 2015 | 残差连接，解决梯度消失 |

---

## 4. 优缺点

| 优点 | 缺点 |
|------|------|
| 参数共享大幅减少参数量 | 对几何变换敏感 |
| 层次化特征提取 | 需要大量标注数据 |
| 硬件加速良好 | 感受野有限 |
