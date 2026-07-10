---
author: "XunZong"
created: "2026-07-06"
tags: ["工程", "Git", "版本控制"]
aliases: ["Git", "版本控制", "git操作"]
---

# Git 版本控制

## 定义

Git 是一个**分布式版本控制系统**，由 Linus Torvalds 于 2005 年用 C 语言开发，用于管理 Linux 内核源码。它记录文件的每次变更，支持分支协作和历史回溯，是团队开发的标配工具。

## 设计原理

### 三区架构

Git 的核心设计是**三区分离**：工作区（实际编辑）→ 暂存区（准备提交）→ 本地仓库（历史快照）。这种设计让你可以精细控制每次提交的内容——只提交部分修改、暂存当前工作以切换分支等。相较 SVN 等集中式系统的单区模型，Git 的三区架构提供了更大的操作灵活性。

### merge vs rebase 选择

| 操作 | 历史形态 | 适用场景 |
|:----|:--------|:---------|
| **merge** | 保留分叉历史（有合并提交） | 公共分支（main/dev），保留真实协作记录 |
| **rebase** | 线性历史（无分叉） | 个人特性分支，保持提交历史整洁 |

**原则**：公共分支用 merge，个人分支用 rebase。永远不要对已推送的公共分支做 rebase（会重写 commit hash 导致团队混乱）。

## 核心概念

| 概念 | 说明 | 类比 |
|:----|:----|:----|
| **仓库（Repository）** | 存储项目所有文件和历史记录的地方 | 项目文件夹 |
| **工作区（Working Directory）** | 当前编辑的文件目录 | 办公桌 |
| **暂存区（Staging Area / Index）** | 准备提交的变更 | 待发货区 |
| **本地仓库（Local Repo）** | 本地存储的版本历史 | 本地档案柜 |
| **远程仓库（Remote Repo）** | 服务器上的版本库（GitHub/Gitee） | 中央档案库 |
| **提交（Commit）** | 一次变更的快照 | 拍照存档 |
| **分支（Branch）** | 独立的开发线 | 平行宇宙 |
| **HEAD** | 指向当前所在分支的最新提交 | 当前位置指针 |

## 基本操作流程

```bash
# 1. 配置（首次使用）
git config --global user.name "Your Name"
git config --global user.email "your@email.com"

# 2. 初始化/克隆
git init                              # 本地初始化
git clone https://github.com/user/repo.git  # 克隆远程仓库

# 3. 日常开发循环
git status                            # 查看当前状态
git add file.py                       # 将修改添加到暂存区
git add .                             # 添加所有修改
git commit -m "feat: add prediction API"  # 提交到本地仓库

# 4. 同步远程
git push origin main                  # 推送到远程
git pull origin main                  # 拉取远程更新
```

## 分支管理

```bash
# 分支操作
git branch                            # 查看本地分支
git branch feature-new-model          # 创建新分支
git checkout feature-new-model        # 切换到该分支
git checkout -b feature-new-model     # 创建并切换（一步）

# 合并
git checkout main                     # 切回主分支
git merge feature-new-model           # 将特性分支合并到当前分支

# 删除分支
git branch -d feature-new-model       # 删除已合并的分支
git branch -D feature-new-model       # 强制删除（未合并）
```

## 团队协作流程

```bash
# 标准协作流程
# 1. 组长创建远程仓库，组员克隆
git clone <repo_url>

# 2. 创建自己的开发分支
git checkout -b feature/model_training

# 3. 开发并提交
git add .
git commit -m "train initial model"

# 4. 合并主分支的最新代码（先拉后推）
git checkout main
git pull origin main             # 获取最新主分支
git checkout feature/model_training
git merge main                   # 合并到特性分支（解决可能的冲突）

# 5. 推送特性分支到远程
git push origin feature/model_training

# 6. 在 GitHub/Gitee 上创建 Pull Request（PR）
```

## 解决冲突

```bash
# 当多人修改同一文件的同一区域时，合并会产生冲突
# Git 会在冲突文件中标记：
<<<<<<< HEAD
print("当前分支的代码")
=======
print("合并进来的代码")
>>>>>>> feature-branch

# 解决方法：
# 1. 手动编辑文件，保留需要的版本
# 2. 删除冲突标记 <<< === >>>
# 3. git add 标记为已解决
# 4. git commit 完成合并
```

## .gitignore

```yaml
# 不应提交到 Git 的文件
__pycache__/
*.pyc
.env
*.pt              # 模型权重文件（太大）
*.pkl
data/raw/         # 原始数据
logs/
checkpoints/
.vscode/
.idea/
```

## ML 中的 Git 实践

| 场景 | 操作 | 说明 |
|:----|:----|:----|
| **实验管理** | 每次实验创建新分支 | 特性分支追踪不同方案 |
| **代码审查** | Pull Request + 评论 | 团队协作保证代码质量 |
| **回滚实验** | `git revert` / `git reset` | 快速回到之前的实验版本 |
| **数据版本** | Git LFS（大文件存储） | 管理数据集、模型权重 |
| **CI/CD** | GitHub Actions 自动训练 | 提交即触发训练流水线 |

## 面试追问

**Q1（基础）**：请解释 Git 中工作区（Working Directory）、暂存区（Staging Area）和本地仓库（Local Repo）三者的关系及操作流程。
**回答要点**：

1. 工作区是实际编辑目录，通过 `git add` 将修改送入暂存区，通过 `git commit` 将暂存区内容快照到本地仓库
2. `git status` 查看各区域差异
3. 三区域协作完成版本控制

**Q2（深挖）**：`git merge` 和 `git rebase` 的区别是什么？在团队协作中各适用什么场景？
**回答要点**：

1. merge 保留完整分支历史（有分叉），rebase 线性化提交历史（无分叉）
2. merge 不修改已有 commit，rebase 重写 commit hash
3. 公共分支用 merge，个人特性分支用 rebase 保持整洁

**Q3（实战）**：在 ML 项目中使用 Git 管理实验代码时，如何处理大文件（数据集、模型权重）？如何避免模型 checkpoints 误提交？
**回答要点**：

1. 使用 `.gitignore` 排除 `*.pt`、`*.pkl`、`checkpoints/`、`data/raw/`
2. 大文件用 Git LFS 管理
3. 每次实验创建独立分支追踪不同方案

**Q4（边界）**：Git 有哪些局限性？在大规模单体仓库（Monorepo）中会遇到什么问题？
**回答要点**：

1. 大二进制文件效率低（LFS 可缓解但非完美）
2. 单仓库超大时 `git clone` 慢、历史操作卡顿
3. 子模块（submodule）管理复杂
4. 超大规模项目可能需转向 Perforce 或 Google 的 Piper 等方案

## 参考引用
- 需要理解 Docker基础与容器化的相关知识，参见 [Docker基础与容器化](../Docker/01-Docker基础与容器化.md)
- 需要了解 Shell脚本基础的相关知识，参见 [Shell脚本基础](../../Linux/06-Shell脚本基础.md)
- 需要了解 Linux基础与哲学的相关知识，参见 [Linux基础与哲学](../../Linux/01-Linux基础与哲学.md)
