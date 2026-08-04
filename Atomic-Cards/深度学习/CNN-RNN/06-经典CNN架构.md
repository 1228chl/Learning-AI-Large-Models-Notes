---
author: "XunZong"
created: "2026-07-10"
tags: ["深度学习", "CNN", "网络架构"]
aliases: ["LeNet", "AlexNet", "VGG", "ResNet", "Inception", "经典CNN架构"]
---

# 经典 CNN 架构

## 定义

卷积神经网络（CNN）自 2012 年起经历了快速演进，多个经典架构通过创新的网络设计不断推动图像识别性能的边界。这些架构的共同趋势是：**更深、更宽、更高效**。

## 架构演进时间线

```
LeNet (1998)    5层卷积
    ↓
AlexNet (2012)  8层卷积 + ReLU + Dropout  → ImageNet 分类突破
    ↓
VGG (2014)      16-19层，小卷积核堆叠
    ↓
Inception (2014) 多尺度并行卷积 → GoogLeNet
    ↓
ResNet (2015)   残差连接 → 152层，解决退化问题
```

## 各架构详解

### LeNet-5（1998）

LeNet-5 是最早的 CNN 架构之一，由 Yann LeCun 提出，用于手写数字识别（MNIST）。

| 特性 | 说明 |
|:-----|:------|
| **提出时间** | 1998 |
| **核心结构** | 卷积 → 池化 → 卷积 → 池化 → 全连接 → 全连接 → 输出 |
| **卷积核大小** | 5×5 |
| **池化方式** | 平均池化（Average Pooling） |
| **激活函数** | Sigmoid / Tanh |
| **参数数量** | ~6 万 |
| **意义** | 证明卷积+池化+全连接的标准模式有效 |

### AlexNet（2012）

AlexNet 在 2012 年 ImageNet 比赛中以巨大优势夺冠，是深度学习复兴的标志性工作。

| 特性 | 说明 |
|:-----|:------|
| **提出时间** | 2012 |
| **核心创新** | ReLU 激活函数、Dropout、数据增强、LRN |
| **卷积核大小** | 11×11（第一层）、5×5、3×3 |
| **池化方式** | 最大池化（Max Pooling） |
| **激活函数** | ReLU（首次在 CNN 中大规模使用） |
| **参数数量** | ~6,000 万 |
| **训练技巧** | Dropout（p=0.5）、数据增强（随机裁剪+水平翻转） |

### VGG（2014）

VGG 探索了"深度"对 CNN 性能的影响，核心贡献是用 **3×3 小卷积核堆叠** 替代大卷积核。

| 特性 | VGG16 | VGG19 |
|:-----|:-----:|:-----:|
| **卷积层数** | 13 层 | 16 层 |
| **全连接层** | 3 层 | 3 层 |
| **总层数** | 16 层 | 19 层 |
| **核心理念** | 两个 3×3 卷积堆叠等效一个 5×5（参数更少，非线性更强） |
| **参数数量** | ~1.38 亿 | ~1.44 亿 |

**3×3 卷积堆叠的优势**：
- 两个 3×3 卷积的感受野为 5×5，但参数为 $2 \times 9 = 18$，少于 5×5 的 25 个参数
- 三个 3×3 卷积的感受野为 7×7，参数为 $3 \times 9 = 27$，少于 7×7 的 49 个参数
- 更多的非线性层使决策函数更具判别力

### Inception / GoogLeNet（2014）

Inception 的核心创新是 **多尺度并行卷积**：在同一层使用 1×1、3×3、5×5 卷积和池化，拼接后输出。

```
            ┌─── 1×1 卷积 ───┐
输入 ────┤─── 3×3 卷积 ───├─── 拼接 ─── 输出
            └─── 5×5 卷积 ───┘
```

**关键设计**：
- 使用 1×1 卷积降维，大幅减少参数量和计算量
- 多尺度卷积捕捉不同粒度的空间特征
- GoogLeNet（Inception v1）仅 500 万参数（远少于 VGG 的 1.38 亿）

### ResNet（2015）

ResNet 通过 **残差连接（Skip Connection）** 解决了深层网络的退化问题。

残差块定义：

$$
\mathbf{y} = \mathcal{F}(\mathbf{x}, \{W_i\}) + \mathbf{x}
$$

其中 $\mathcal{F}(\mathbf{x}, \{W_i\})$ 为残差映射（堆叠的卷积层），$\mathbf{x}$ 为恒等映射（Identity Mapping）。

| 特性 | ResNet-18 | ResNet-50 | ResNet-152 |
|:-----|:---------:|:---------:|:----------:|
| **总层数** | 18 | 50 | 152 |
| **瓶颈块** | 不使用 | 1×1 → 3×3 → 1×1 | 1×1 → 3×3 → 1×1 |
| **参数数量** | ~1,100 万 | ~2,560 万 | ~6,000 万 |
| **ImageNet Top-5 错误率** | ~10.9% | ~7.8% | ~5.7% |

**残差连接为何有效**：
- 梯度可以直接通过恒等路径反向传播，缓解梯度消失
- 网络在训练初期可以退化为较浅的网络（忽略残差层），逐步学习更复杂的特征
- 相当于在优化空间上做了重参数化，使深层网络更容易优化

```python
import torch.nn as nn

# ResNet 残差块实现（简化版）
class BasicBlock(nn.Module):
    """ResNet 基础残差块：两个 3x3 卷积 + 残差连接"""
    expansion = 1  # 输出通道数相对于输入通道数的倍率

    def __init__(self, in_channels, out_channels, stride=1):
        super().__init__()
        # 第一个 3×3 卷积：可能通过 stride 降低空间分辨率
        self.conv1 = nn.Conv2d(in_channels, out_channels, 3, stride, padding=1)
        self.bn1 = nn.BatchNorm2d(out_channels)    # 批归一化稳定训练
        self.conv2 = nn.Conv2d(out_channels, out_channels, 3, stride=1, padding=1)
        self.bn2 = nn.BatchNorm2d(out_channels)
        self.relu = nn.ReLU(inplace=True)

        # 当输入输出形状不同时，用 1×1 卷积调整恒等路径
        if stride != 1 or in_channels != out_channels:
            self.shortcut = nn.Sequential(
                nn.Conv2d(in_channels, out_channels, 1, stride),
                nn.BatchNorm2d(out_channels)
            )
        else:
            self.shortcut = nn.Identity()  # 形状相同则直接传递

    def forward(self, x):
        residual = self.shortcut(x)          # 恒等路径（或 1×1 调整路径）
        out = self.relu(self.bn1(self.conv1(x)))
        out = self.bn2(self.conv2(out))
        out += residual                      # 残差连接：逐元素相加
        return self.relu(out)
```

## 架构对比

| 维度 | LeNet | AlexNet | VGG | Inception | ResNet |
|:-----|:-----:|:-------:|:---:|:---------:|:------:|
| 提出年份 | 1998 | 2012 | 2014 | 2014 | 2015 |
| 深度 | 5 | 8 | 16-19 | 22 | 50-152 |
| 参数数量 | 6 万 | 6,000 万 | 1.38 亿 | 500 万 | 2,560 万 |
| 核心创新 | CNN 奠基 | ReLU + Dropout | 小卷积核堆叠 | 多尺度并行 | 残差连接 |
| ImageNet 错误率 | — | Top-5: 16.4% | Top-5: 7.3% | Top-5: 6.7% | Top-5: 3.6% |
| 现代使用 | 教学 | 几乎不用 | 特征提取主干 | 较少 | 广泛应用 |

## ML/DL 应用场景

| 应用场景 | 数学形式 | 说明 |
|:---------|:---------|:------|
| 图像分类 | $y = f_{\text{CNN}}(x)$ | 经典 CNN 架构作为分类主干，从原始像素到类别概率的端到端映射 |
| 目标检测 | 特征提取 + RPN | ResNet / VGG 作为 Faster R-CNN / YOLO 的 backbone 提取特征 |
| 语义分割 | encoder-decoder 结构 | ResNet 作为 U-Net / DeepLab 的编码器提取多尺度特征 |
| 迁移学习骨干 | 冻结前层 + 微调分类层 | ImageNet 预训练的 ResNet 作为通用视觉特征提取器 |

## 面试追问

**Q1（基础）**：为什么 VGG 用多个 3×3 卷积堆叠替代更大的卷积核？这样做有什么好处？
**回答要点**：

1. 两个 3×3 卷积的感受野等于一个 5×5，参数 $2 \times 9 = 18$ < 5×5 的 $25$，参数量减少约 28%。
2. 更多非线性层（增加激活函数数量）使决策函数更具判别力——两层的 ReLU 比一层的非线性表达能力更强。
3. 多个小卷积核堆叠比一个大卷积核更紧凑，有利于在更深网络上保持计算效率。

**Q2（深挖）**：ResNet 中的残差连接为什么能支持训练 152 层的网络？恒等映射的作用是什么？
**回答要点**：

1. 梯度可以直接通过恒等路径（$\mathbf{x}$）反向传播到前层，绕过了残差层中的卷积和激活函数，缓解了梯度消失。
2. 优化视角：残差映射 $\mathcal{F}(\mathbf{x})$ 学习的是"相对于输入的增量"，比直接学习无参考的映射更容易（初始状态 $\mathcal{F}=0$ 时输出等于输入，是一个合理的初始值）。
3. ResNet 在训练初期可以退化为更浅的网络（当残差层输出接近 0 时），然后逐步学习更复杂的特征——这种渐进式学习使得深层网络易于优化。

**Q3（实战）**：你在实际项目中如何选择视觉 backbone？什么时候用 ResNet 什么时候用轻量级网络？
**回答要点**：

1. 有 GPU 资源且精度优先：ResNet-50/101 作为默认选择，通用性好，预训练权重丰富。
2. 移动端/边缘设备：MobileNet / ShuffleNet（深度可分离卷积），参数和计算量远小于 ResNet。
3. 精度要求极高且资源充足：EfficientNet 或 Swin Transformer（现代 Vision Transformer 架构），但推理成本高。
4. 实践建议：先从 ResNet-50 开始搭建流程，验证模型 pipeline 无误后再根据部署约束替换 backbone。

**Q4（边界）**：经典 CNN 架构为什么近年来逐渐被 Vision Transformer（ViT）取代？CNN 还有什么存在价值？
**回答要点**：

1. ViT 的核心优势：自注意力能捕捉全局依赖，不受 CNN 的局部感受野限制；在大规模数据下性能超越 CNN。
2. CNN 的不可替代之处：平移等变性（卷积核对图像平移自然不变）、计算效率（在相同参数下推理速度更快）、数据效率（小数据集上 CNN 仍优于 ViT）。
3. 当前趋势是 CNN + Transformer 混合架构（如 ConvNeXt、MaxViT），结合两者的局部高效性和全局建模能力。

## 参考引用

- 需要理解卷积运算的基本原理参见 [卷积运算](./01-卷积运算.md)
- 需要理解池化层的下采样作用参见 [池化层](./02-池化层.md)
- 需要理解残差连接的设计原理参见 [残差连接与LayerNorm](../../NLP/组件/01-残差连接与LayerNorm.md)
- 需要理解迁移学习中 backbone 的使用参见 [迁移学习与微调](../迁移学习/01-迁移学习与微调.md)
- 需要理解 GPU 训练大规模 CNN 的并行策略参见 [GPU并行与混合精度训练](../训练优化/01-GPU并行与混合精度.md)