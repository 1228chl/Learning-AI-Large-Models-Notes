---
author: "XunZong"
created: "2026-07-06"
tags: ["包管理", "Conda", "环境管理"]
aliases: ["Conda环境", "conda env", "虚拟环境"]
---

# Conda 环境管理

## 定义

Conda 是一个开源的**包管理**和**环境管理**工具。它不仅管理 Python 包，还支持 R、C/C++ 库等非 Python 依赖。其**环境管理**功能允许在同一台机器上创建多个隔离的虚拟环境，彻底解决项目间的依赖冲突问题。

## 环境管理核心命令

| 命令 | 说明 |
|------|------|
| `conda create -n my_env python=3.9` | 创建名为 my_env 的环境，指定 Python 3.9 |
| `conda activate my_env` | 激活环境 |
| `conda deactivate` | 退出当前环境 |
| `conda env list` | 列出所有环境 |
| `conda remove -n my_env --all` | 删除整个环境及其所有包 |
| `conda rename -n old_name new_name` | 重命名环境 |

## 环境导出与共享

```bash
# 导出当前环境的精确依赖（推荐用于可复现）
conda env export > environment.yml

# 仅导出显式安装的包（不含依赖树的哈希）
conda env export --from-history > environment.yml

# 从文件创建一模一样的复现环境
conda env create -f environment.yml

# 根据文件更新已有环境
conda env update -f environment.yml
```

## 指定 Python 版本创建环境

```bash
# 常见 ML 环境配置
conda create -n torch_env python=3.10
conda create -n tf_env python=3.9
conda create -n ml_dev python=3.11 numpy pandas scikit-learn

# 查看当前环境的 Python 版本
python --version
```

## 典型工作流

```bash
# 1. 为新项目创建隔离环境
conda create -n project_alpha python=3.10
conda activate project_alpha

# 2. 安装依赖
conda install pytorch torchvision cudatoolkit=11.8 -c pytorch
pip install transformers datasets  # pip 与 conda 可混用

# 3. 导出依赖供复现
conda env export > environment.yml

# 4. 完成后退出
conda deactivate
```

## Conda vs venv vs pip

| 对比 | Conda | venv | pip |
|------|-------|------|-----|
| **包范围** | Python + 非 Python（CUDA、C库） | 仅 Python | 仅 Python |
| **环境管理** | 内置 | 内置 | 需配合 venv/poetry |
| **依赖解析** | 强（SAT 求解器） | 无 | 弱（无冲突检测） |
| **二进制包** | 预编译（.tar.bz2 / .conda） | 无 | 源码 / wheel |
| **典型场景** | 数据科学、ML 全栈 | 纯 Python 项目 | Python 包安装 |

> 参见 [[02-Conda包管理与配置]]、[[03-UV包管理器]]
