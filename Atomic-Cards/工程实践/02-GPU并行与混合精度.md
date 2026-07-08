---
author: "XunZong"
created: "2026-07-06"
tags: ["工程", "GPU", "训练加速"]
aliases: ["GPU", "CUDA", "混合精度", "分布式训练"]
---

# GPU 并行与混合精度训练

## 定义

GPU 通过数千个 CUDA 核心并行执行**矩阵乘法**等运算。混合精度训练使用 FP16 进行前向和反向传播，FP32 保存参数，在几乎不损失精度的情况下将训练速度提升 2-3x，显存占用减半。

## GPU 架构基础

| 概念 | 说明 | 类比 |
|:----|:----|:----|
| **CUDA Core** | GPU 的基本计算单元 | 一个工人 |
| **SM（流式多处理器）** | 包含多个 CUDA Core | 一个车间 |
| **显存（VRAM）** | GPU 专用内存 | 工作台 |
| **内存带宽** | 数据从显存到核心的速度 | 传送带速度 |
| **PCIe 带宽** | CPU ↔ GPU 数据传输速度 | 仓库到车间的通道 |

```python
import torch

# 检查 GPU 状态
print(torch.cuda.is_available())          # CUDA 是否可用
print(torch.cuda.device_count())          # GPU 数量
print(torch.cuda.get_device_name(0))      # GPU 型号
print(torch.cuda.get_device_properties(0))  # 显存等信息
```

## 混合精度训练（AMP）

```python
from torch.cuda.amp import autocast, GradScaler

model = MyModel().cuda()
scaler = GradScaler()                     # 梯度缩放（防止 FP16 下溢）

for data, target in dataloader:
    optimizer.zero_grad()

    with autocast():                      # 自动混合精度
        output = model(data)
        loss = criterion(output, target)

    scaler.scale(loss).backward()          # FP16 梯度放大
    scaler.step(optimizer)                # 缩小后更新 FP32 参数
    scaler.update()
```

| 精度 | 存储类型 | 显存占用 | 计算速度 | 精度 |
|:----:|:--------:|:--------:|:--------:|:----:|
| **FP32** | 单精度 | 基准 | 基准 | 最高 |
| **FP16** | 半精度 | **50%** | **2-8x** | 可能有溢出 |
| **BF16** | 脑浮点 | 50% | 2-8x | **同 FP32 动态范围** |
| **INT8** | 整型 8-bit | 25% | — | 推理可用 |

## 分布式训练

```python
# 单机多卡（DataParallel — 简单但慢）
model = nn.DataParallel(model)

# 推荐：DistributedDataParallel（更快）
# 启动命令：
# torchrun --nproc_per_node=4 train.py
import torch.distributed as dist
dist.init_process_group(backend='nccl')
model = nn.DDP(model, device_ids=[local_rank])
```

| 并行策略 | 原理 | 适用 | 通信开销 |
|:--------:|:----|:----|:--------:|
| **数据并行（DDP）** | 每卡一份模型，处理不同 batch | 模型能放进单卡 | 梯度同步 |
| **模型并行** | 模型分片到不同卡 | 模型太大放不进单卡 | 中间激活传输 |
| **流水线并行** | 不同层在不同卡上 | 超大模型 | 层间通信 |
| **张量并行** | 单层分到多卡 | Transformer FFN/Attention | 频繁 |

## ML 中的 GPU 配置

```bash
# 常用 GPU 命令
nvidia-smi                     # GPU 状态
watch -n 1 nvidia-smi          # 实时监控
nvitop                         # 交互式 GPU 监控
gpustat                        # 简洁 GPU 状态

# 设置可见 GPU
export CUDA_VISIBLE_DEVICES=0,1,2,3

# PyTorch 全自动混合精度（一行启用）
torch.compile(model, mode='reduce-overhead')  # PyTorch 2.0 编译
```

## 面试追问

**Q1（基础）**：什么是混合精度训练？它的核心思想是什么？

**回答要点**：同时使用 FP16 和 FP32；前向和反向传播用 FP16（节省显存、加速计算），权重更新用 FP32 保持精度；通过 GradScaler 防止 FP16 梯度下溢。

**Q2（深挖）**：FP16 和 BF16 有何区别？为什么 BF16 在训练中越来越受欢迎？

**回答要点**：FP16 有 5 位指数 + 10 位尾数，动态范围窄易溢出；BF16 有 8 位指数 + 7 位尾数，动态范围与 FP32 相同（同范围），仅尾数精度降低；BF16 不需要 loss scaling，训练更稳定。

**Q3（实战）**：你在项目中使用 `torch.cuda.amp` 遇到过哪些坑？如何排查显存不足问题？

**回答要点**：GradScaler 初始化后每步需调用 `scaler.update()`；某些算子不支持 AMP 需手动强制 FP32；显存不足时使用梯度 checkpoint、梯度累积、`batch_size` 减半排查。

**Q4（边界）**：分布式训练中数据并行（DDP）和模型并行各自的最佳适用场景是什么？混合并行策略如何选择？

**回答要点**：DDP 适合模型能放入单卡时，通信量为梯度同步（中等）；模型并行适合单卡放不下的超大模型，通信量为中间激活（频繁）；超大 Transformer 常组合数据并行 + 张量并行 + 流水线并行。

## 参考引用

- 需要掌握进程与线程以理解编程实现机制，参见 [进程与线程](../Python/06-进程与线程.md)
- 需要理解PyTorch张量与运算的深度学习机制与实现，参见 [PyTorch张量与运算](../深度学习/07-PyTorch张量与运算.md)
- 需要理解卷积运算的深度学习机制与实现，参见 [卷积运算](../深度学习/09-卷积运算.md)
- 需要理解反向传播算法的深度学习机制与实现，参见 [反向传播算法](../深度学习/04-反向传播算法.md)
- 需要理解模型保存格式的相关知识，参见 [模型保存格式](./05-模型保存格式.md)