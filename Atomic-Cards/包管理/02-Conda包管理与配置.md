---
author: "XunZong"
created: "2026-07-06"
tags: ["包管理", "Conda", "包管理"]
aliases: ["Conda包管理", "conda install", "换源"]
---

# Conda 包管理与配置

## 包管理核心命令

```bash
# 安装包
conda install numpy pandas            # 安装多个包
conda install -c conda-forge xgboost  # 从指定频道安装

# 查看已安装
conda list                            # 列出当前环境所有包
conda list | grep torch               # 搜索特定包

# 更新
conda update numpy                    # 更新指定包
conda update --all                    # 更新当前环境全部包

# 删除
conda remove numpy                    # 移除指定包
```

## 频道（Channel）配置

Conda 的频道是包的来源。默认频道速度慢且包不全，推荐配置：

```bash
# 查看当前频道配置
conda config --show channels

# 添加 conda-forge（社区维护，包最全）
conda config --add channels conda-forge

# 添加 PyTorch 官方频道
conda config --add channels pytorch

# 设置频道优先级（strict 强制不跨频道）
conda config --set channel_priority strict

# 国内镜像加速（以清华源为例）
conda config --add channels https://mirrors.tuna.tsinghua.edu.cn/anaconda/pkgs/main/
conda config --add channels https://mirrors.tuna.tsinghua.edu.cn/anaconda/pkgs/free/
conda config --add channels https://mirrors.tuna.tsinghua.edu.cn/anaconda/cloud/conda-forge/
```

## 清理与维护

```bash
# 清理缓存和未使用的包
conda clean --all                     # 释放磁盘空间
conda clean -p                        # 清理未使用的包缓存
conda clean -t                        # 清理 tar 包缓存
```

## 安装 PyTorch 示例

```bash
# GPU 版本（推荐用官网命令生成器 https://pytorch.org）
conda install pytorch torchvision torchaudio cudatoolkit=11.8 -c pytorch -c conda-forge

# CPU 版本
conda install pytorch torchvision torchaudio cpuonly -c pytorch
```

## 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| `Solving environment` 卡死 | 依赖解析复杂 | 使用 `mamba` 替代 conda |
| `PackagesNotFoundError` | 包不在当前频道 | 添加 conda-forge 频道 |
| 安装速度慢 | 默认源在国外 | 配置国内镜像源 |
| conda 版本过低 | 功能缺失 | `conda update conda` |

> **mamba**：Conda 的 C++ 重写版，依赖解析速度提升数十倍，命令完全兼容（`mamba install` = `conda install`）。

## ML 中的 Conda 实践

| 场景 | 命令 | 说明 |
|------|------|------|
| **安装 PyTorch（GPU）** | `conda install pytorch torchvision cudatoolkit=11.8 -c pytorch` | 自动处理 CUDA 依赖 |
| **可复现环境** | `conda env export > environment.yml` | 论文实验的精确复现 |
| **多项目隔离** | `conda create -n proj_a python=3.10 && conda activate proj_a` | 各项目独立环境，避免依赖冲突 |
| **Jupyter 内核** | `python -m ipykernel install --user --name my_env` | 将 Conda 环境注册为 Jupyter 内核 |

> 参见 [[01-Conda环境管理]]、[[03-UV包管理器]]
