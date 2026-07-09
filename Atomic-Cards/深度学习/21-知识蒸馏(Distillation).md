---
author: "XunZong"
created: "2026-07-07"
tags: ["深度学习", "模型压缩", "蒸馏"]
aliases: ["蒸馏", "Distillation", "知识蒸馏"]
---

# 知识蒸馏（Knowledge Distillation）

## 定义

知识蒸馏（Knowledge Distillation）通过让一个小模型（学生）模仿大模型（教师）的输出分布来传递知识，使小模型在推理时达到接近大模型的精度。蒸馏损失函数包含软标签损失和硬标签损失：

$$
\mathcal{L}_{\text{KD}} = \alpha \cdot \text{KL}\left(\text{softmax}\left(\frac{z_t}{T}\right) \;\Big\Vert\; \text{softmax}\left(\frac{z_s}{T}\right)\right) \cdot T^2 + (1-\alpha) \cdot \text{CE}(z_s, y)
$$

其中 $z_t$ 为教师 logits， $z_s$ 为学生 logits， $T$ 为温度参数（控制软标签平滑程度）， $\alpha$ 为平衡权重， $\text{KL}$ 为 KL 散度， $\text{CE}$ 为交叉熵损失。 $T^2$ 因子用于平衡梯度尺度，使得不同 $T$ 下的梯度量级一致。

## 核心概念

| 概念 | 含义 | 作用 |
|:----:|:----|:----|
| **软标签（Soft Label）** | 教师输出概率分布 $p_t = \text{softmax}(z_t / T)$ | 提供类别间相似性（"猫"与"狗"的相似度远大于"猫"与"汽车"） |
| **硬标签（Hard Label）** | 真实标签 $y$ （one-hot 向量） | 提供真实标注约束，防止软标签误差放大 |
| **温度 T** | softmax 平滑参数 $T > 0$ | T 越大分布越平滑，暗知识越丰富；T=1 退化；T 过大则分布过于均匀失去信息 |
| **KL 散度** | $\text{KL}(P \ | Q) = \sum_i P(i) \log \frac{P(i)}{Q(i)}$ | 衡量师生输出分布的差异，值越小越接近 |

**蒸馏模式**：**离线蒸馏**（教师固定，一次推理生成软标签）、**在线蒸馏**（师生同步训练，教师也持续更新）、**自蒸馏**（自身做自己的教师，共享架构）。

## 直观理解

知识蒸馏就像一位经验丰富的老师（教师模型）将解题思路和思维方式（软标签中的暗知识）传授给学生（学生模型），而不是只让学生背诵标准答案（硬标签）。温度 T 控制老师讲解的详细程度：T 越高，老师对容易混淆的知识点讲解越细（暴露类别间相似关系），学生学得更深入。

## 代码示例：蒸馏损失函数

```python
import torch
import torch.nn as nn
import torch.nn.functional as F

def distillation_loss(student_logits, teacher_logits, labels, T=4.0, alpha=0.7):
    """
    知识蒸馏损失函数（KL 散度 + 交叉熵）

    参数:
        student_logits: 学生模型输出 logits（未经过 softmax）
        teacher_logits: 教师模型输出 logits（未经过 softmax）
        labels:         真实硬标签
        T:              温度参数（控制软标签平滑程度）
        alpha:          软标签损失的权重

    返回:
        loss:           蒸馏总损失
    """
    # ---------- 软标签损失：KL 散度 ----------
    # 教师和学生 logits 都除以 T 再做 softmax，获得平滑后的概率分布
    teacher_soft = F.softmax(teacher_logits / T, dim=-1)         # 教师软标签
    student_log = F.log_softmax(student_logits / T, dim=-1)      # 学生 log 概率
    kl_loss = nn.KLDivLoss(reduction="batchmean")(
        student_log, teacher_soft
    ) * (T ** 2)            # × T² 恢复梯度尺度，使不同 T 下的梯度量级一致

    # ---------- 硬标签损失：交叉熵 ----------
    ce_loss = nn.CrossEntropyLoss()(student_logits, labels)

    # ---------- 联合损失 ----------
    total_loss = alpha * kl_loss + (1 - alpha) * ce_loss
    return total_loss, kl_loss, ce_loss

# ---------- 使用示例 ----------
batch_size, num_classes = 4, 10
student_logits = torch.randn(batch_size, num_classes)   # 模拟学生输出
teacher_logits = torch.randn(batch_size, num_classes)   # 模拟教师输出
labels = torch.randint(0, num_classes, (batch_size,))   # 模拟真实标签

loss, kl, ce = distillation_loss(
    student_logits, teacher_logits, labels,
    T=4.0,             # 常用 T 范围 2-8
    alpha=0.7          # 常用 α 范围 0.5-0.9
)
print(f"蒸馏总损失: {loss.item():.4f} (KL: {kl.item():.4f}, CE: {ce.item():.4f})")

# ---------- 温度 T 的影响 ----------
for T in [1.0, 4.0, 8.0, 20.0]:
    _, kl_loss, _ = distillation_loss(student_logits, teacher_logits, labels, T=T)
    print(f"T={T:5.1f} -> KL 损失: {kl_loss.item():.4f}")
# T 越大，软标签越平滑，KL 散度越大（分布差异增大）
# T=1.0 退化为中心估计，T 过高则分布过于均匀失去信息量
```

## ML/DL 应用场景

| 应用场景 | 蒸馏方案 | 效果 |
|:--------:|:--------|:----|
| **BERT 压缩** | DistilBERT / TinyBERT | 参数量减少 40-60\%，保留 95\%+ GLUE 精度 |
| **计算机视觉** | ResNet-50 蒸馏至 MobileNet | MobileNet 精度提升 3-5\% |
| **LLM 推理加速** | Llama-70B 蒸馏至 Llama-13B | 13B 模型达到接近 70B 的效果 |
| **推荐系统** | 精排模型蒸馏至粗排模型 | 粗排 AUC 提升 0.5-1\% |

## 面试追问

**Q1（基础）**：知识蒸馏中软标签为什么比硬标签携带更多信息？
**回答要点**：

1. 硬标签是 one-hot 向量，只给出唯一正确答案，丢失了类别间相似性关系（如"猫"和"狗"的相似度远高于"猫"和"汽车"）
2. 软标签保留完整的概率分布，包含丰富的暗知识（dark knowledge）
3. 软标签让学生模型学到类别间的相对关系，提升泛化能力

**Q2（深挖）**：温度参数 T 的大小对蒸馏效果有什么影响？
**回答要点**：

1. T 越小（接近 1），软标签趋近于 one-hot，丢失暗知识，蒸馏效果退化
2. T 越大，概率分布越平滑，暴露更多类别间关系，但过大则引入过多噪声甚至趋近均匀分布
3. 常用 T=2-8，需通过验证集调优，在暗知识丰富度与噪声之间取平衡

**Q3（实战）**：训练学生模型时如何平衡软标签损失和硬标签损失？
**回答要点**：

1. 使用 $\alpha$ 系数加权，通常 $\alpha=0.7$ 侧重软标签，$1-\alpha=0.3$ 作为硬标签正则化
2. 训练初期可先增大 $\alpha$，让学生先学真实标签再迁移暗知识
3. 实践中常用网格搜索 $\alpha \in \{0.3, 0.5, 0.7, 0.9\}$ 和 $T \in \{2,4,6,8\}$ 的组合来调优

**Q4（边界）**：教师模型过于庞大或学生能力不足时会出现什么问题？
**回答要点**：

1. 师生能力差距过大时，学生无法拟合教师复杂决策边界，称为"容量差距"
2. 教师自身的偏见和错误可能被蒸馏传递给学生，造成错误放大效应
3. 解决思路：使用中间层特征蒸馏（FitNet）或渐进式蒸馏（先蒸馏到中等模型，再二次蒸馏到小模型）

## 参考引用
- 需要理解模型量化(Quantization)的相关知识，参见 [模型量化(Quantization)](./19-模型量化%28Quantization%29.md)
- 需要理解模型压缩量化剪枝蒸馏的相关知识，参见 [模型压缩量化剪枝蒸馏](./15-模型压缩量化剪枝蒸馏.md)
- 需要理解知识蒸馏详解的相关知识，参见 [知识蒸馏详解](./14-知识蒸馏详解.md)
