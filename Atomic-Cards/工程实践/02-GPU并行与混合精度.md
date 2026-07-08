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

# 检查 GPU 状态：任何 GPU 训练脚本的第一步，确认 CUDA 环境就绪后才能执行后续操作
# 避免在不支持 GPU 的环境下运行时报错，便于快速定位硬件配置问题
print(torch.cuda.is_available())          # 返回 bool，确认 CUDA 驱动和库是否可用
print(torch.cuda.device_count())          # 返回 GPU 数量，用于规划数据并行时的设备分配
print(torch.cuda.get_device_name(0))      # 获取 GPU 型号名称，便于区分开发与生产环境的硬件差异
print(torch.cuda.get_device_properties(0))  # 打印显存总量、计算能力等详细硬件属性，辅助判断模型能否装入
```

## 混合精度训练（AMP）

```python
from torch.cuda.amp import autocast, GradScaler

model = MyModel().cuda()
# 初始化梯度缩放器：FP16 的动态范围远小于 FP32，微小梯度会下溢为 0
# GradScaler 在反向传播前放大 loss，使所有梯度进入 FP16 可表示范围，更新权重前再缩小复原
scaler = GradScaler()

for data, target in dataloader:
    optimizer.zero_grad()

    # autocast 上下文管理器：自动为每个算子选择 FP16 或 FP32 执行
    # 矩阵乘法、卷积等密集运算使用 FP16 加速（2-8x），LayerNorm、Softmax 等敏感操作保留 FP32
    with autocast():
        output = model(data)
        loss = criterion(output, target)

    # 缩放后的反向传播：scaler.scale(loss) 将 loss 乘以当前缩放因子，防止 FP16 下溢
    scaler.scale(loss).backward()
    # step 内部将累积的梯度除以缩放因子恢复原始尺度，再用 FP32 精度更新参数
    scaler.step(optimizer)
    # 动态调整缩放因子：若本轮无梯度上溢，下次增大缩放因子；有上溢则跳过本轮更新并缩小因子
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
# 单机多卡方案一（DataParallel）：一行代码即可启用，但存在性能瓶颈
# 主卡作为汇聚节点负责梯度汇总，通信量随卡数线性增长，且不支持多节点扩展
model = nn.DataParallel(model)

# 推荐方案二：DistributedDataParallel（DDP）—— 官方推荐的高性能方案
# 每个进程独立维护完整模型副本，仅在反向传播时通过 NCCL 后端异步同步梯度
# 无主卡瓶颈，通信效率远高于 DataParallel，支持多机多卡
# 启动方式：torchrun --nproc_per_node=4 train.py
import torch.distributed as dist
dist.init_process_group(backend='nccl')  # 初始化分布式进程组，NCCL 是 NVIDIA 优化的 GPU 通信库
model = nn.DDP(model, device_ids=[local_rank])  # 包装为分布式模型，local_rank 为当前进程绑定的 GPU 编号
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
- 需要理解PyTorch张量与运算的相关知识，参见 [PyTorch张量与运算](../深度学习/07-PyTorch张量与运算.md)
- 需要掌握进程与线程以理解编程实现机制，参见 [进程与线程](../Python/06-进程与线程.md)
- 需要理解PyTorch张量与运算的深度学习机制与实现，参见 [PyTorch张量与运算](../深度学习/07-PyTorch张量与运算.md)