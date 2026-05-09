**标签：** #conda #命令

---

首先，要明确一个核心概念：**Conda** 是一个开源的**包管理工具**和**环境管理工具**。

- **包管理**：它可以安装、更新、删除软件包（不仅限于 Python，还包括 R、C/C++ 库等）。
- **环境管理**：它可以创建独立的虚拟环境，允许你在同一台机器上管理不同项目、不同版本的软件及其依赖，解决“项目依赖冲突”问题。

**核心运维管理命令**

以下是您提供的 Conda 命令说明的 Markdown 表格形式，按三个类别分别整理。

# 1. 环境管理

| 命令                                     | 说明                                      |
| -------------------------------------- | --------------------------------------- |
| `conda create -n my_env python=3.9`    | 创建一个名为 my_env 的新环境，并指定 Python 版本为 3.9   |
| `conda activate my_env`                | 激活（进入）my_env 环境                         |
| `conda deactivate`                     | 退出当前环境                                  |
| `conda env list` 或 `conda info --envs` | 列出所有已创建的环境                              |
| `conda remove -n my_env --all`         | 删除整个 my_env 环境及其中的所有包                   |
| `conda env export > environment.yml`   | 将当前环境的所有依赖包及其精确版本导出到 environment.yml 文件 |
| `conda env create -f environment.yml`  | 根据 environment.yml 文件创建一个一模一样的新环境       |
| `conda env update -f environment.yml`  | 根据 environment.yml 文件更新当前环境             |

# 2. 包管理

| 命令                                          | 说明                        |
| ------------------------------------------- | ------------------------- |
| `conda install numpy pandas`                | 在当前环境中安装 numpy 和 pandas 包 |
| `conda install -c conda-forge package_name` | 从 conda-forge 频道安装包       |
| `conda list`                                | 列出当前环境中安装的所有包             |
| `conda update numpy`                        | 更新 numpy 包                |
| `conda update --all`                        | 更新当前环境中的所有包               |
| `conda remove numpy`                        | 从当前环境中移除 numpy 包          |

# 3. 配置与清理

| 命令                                        | 说明                          |
| ----------------------------------------- | --------------------------- |
| `conda config --show`                     | 显示当前的 Conda 配置              |
| `conda config --add channels conda-forge` | 添加 conda-forge 频道到配置中，提升优先级 |
| `conda clean --all`                       | 清理未使用的包和缓存，释放磁盘空间           |
