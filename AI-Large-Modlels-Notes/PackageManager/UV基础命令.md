# UV 基础命令速查表（完整版）

## 1. 安装与版本

| 功能            | 命令                                                            |
| ------------- | ------------------------------------------------------------- |
| 安装（Mac/Linux） | `curl -LsSf https://astral.sh/uv/install.sh \| sh`            |
| 安装（Windows）   | `powershell -c "irm https://astral.sh/uv/install.ps1 \| iex"` |
| 通过 pip 安装     | `pip install uv`                                              |
| 查看版本          | `uv --version`                                                |

---

## 2. 虚拟环境

| 功能 | 命令 |
|------|------|
| 创建默认 `.venv` | `uv venv` |
| 创建指定目录 | `uv venv my_env` |
| 指定 Python 版本 | `uv venv --python 3.11` |
| 激活（Mac/Linux） | `source .venv/bin/activate` |
| 激活（Windows） | `.venv\Scripts\Activate.ps1` |
| 退出环境 | `deactivate` |
| **删除虚拟环境**（仅删除目录） | `rm -rf .venv`（Mac/Linux）<br> `rmdir /s .venv`（Windows） |
| **清空并重建环境**（项目依赖） | `rm -rf .venv && uv sync`（等价于重置） |

---

## 3. 包管理（兼容 pip）

| 功能 | 命令 |
|------|------|
| 安装包 | `uv pip install requests` |
| 批量安装 | `uv pip install -r requirements.txt` |
| **卸载包**（仅从当前环境移除） | `uv pip uninstall <package>` |
| **查看已安装包** | `uv pip list` |
| 导出依赖清单 | `uv pip freeze > requirements.txt` |

---

## 4. 项目依赖管理（pyproject.toml）

| 功能 | 命令 |
|------|------|
| 初始化项目 | `uv init` |
| 添加依赖 | `uv add requests` |
| 添加开发依赖 | `uv add pytest --dev` |
| 移除依赖（同时更新 `pyproject.toml` 和锁文件） | `uv remove requests` |
| 锁定版本 | `uv lock` |
| 同步所有依赖 | `uv sync` |
| 更新全部依赖 | `uv sync --upgrade` |
| 更新指定包 | `uv sync --upgrade-package requests` |

---

## 5. Python 版本管理

| 功能 | 命令 |
|------|------|
| 列出可用版本 | `uv python list` |
| 安装指定版本 | `uv python install 3.12` |

---

## 6. 运行与检查

| 功能 | 命令 |
|------|------|
| 运行脚本（自动激活环境） | `uv run script.py` |
| 临时带依赖运行 | `uv run --with requests python -c "..."` |
| 检查依赖冲突 | `uv check` |

---

## 7. 构建与发布

| 功能 | 命令 |
|------|------|
| 构建分发包 | `uv build` |
| 发布到 PyPI | `uv publish` |

---

## 8. 维护与帮助

| 功能 | 命令 |
|------|------|
| 清理缓存 | `uv clean` |
| **重置虚拟环境**（删除并重建） | `rm -rf .venv && uv sync`（同第 2 节） |
| 查看帮助 | `uv help` |

---

> **补充说明**  
> - 若项目仅使用 `requirements.txt` 而无 `pyproject.toml`，清空环境可手动执行：  
>   `rm -rf .venv && uv venv && source .venv/bin/activate && uv pip install -r requirements.txt`  
> - `uv pip uninstall` 仅影响当前环境，不会修改项目声明文件；若要从项目中彻底移除依赖，请使用 `uv remove`。  
> - 所有命令均保留了核心参数，覆盖日常开发全流程。如有特定场景需求，可组合使用参数。
