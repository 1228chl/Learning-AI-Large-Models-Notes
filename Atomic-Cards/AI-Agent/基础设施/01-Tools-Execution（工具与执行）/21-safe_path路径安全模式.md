---
author: "XunZong"
created: "2026-07-19"
tags: ["AI-Agent", "Harness", "安全"]
aliases: ["safe_path", "路径安全", "路径穿越防护", "Path Safety"]
---

# safe_path 路径安全模式

## 定义

`safe_path` 是 Agent Harness 中防止路径穿越（Path Traversal）的核心安全函数，基于 `Path.resolve()` + `is_relative_to()` 的组合校验，确保 Agent 操作的文件始终在工作区边界内，无法读取或写入系统敏感文件。

$$
\text{safe\_path}(p) = \begin{cases}
\text{Path}(p) & \text{if } \text{Path}(p).\text{resolve}() \text{ is relative to } \text{WORKDIR} \\
\text{raise ValueError} & \text{otherwise}
\end{cases}
$$


## 问题描述

Agent 的文件操作工具（read_file、write_file、edit_file）接收用户和模型提供的路径参数。如果不对路径做安全校验，恶意构造的路径（如 ../../etc/passwd）可能导致敏感文件泄露或系统文件被篡改。

路径穿越（Path Traversal）是最常见的文件系统攻击方式之一，所有文件操作工具都需要统一的路径安全校验机制。

### 核心代码

```python
from pathlib import Path

def safe_path(p: str) -> Path:
    """将用户提供的路径解析为安全路径，防止路径穿越。"""
    # 1. 拼接工作目录并解析为绝对路径（消除 ../ 和符号链接）
    path = (WORKDIR / p).resolve()

    # 2. 检查解析后的路径是否仍在工作目录下
    if not path.is_relative_to(WORKDIR):
        raise ValueError(f"Path escapes workspace: {p}")

    return path
```

- `WORKDIR / p`：将用户路径拼接在工作目录下，确保路径有明确根目录
- `.resolve()`：将路径解析为绝对路径，消除 `../`、`.` 和符号链接
- `.is_relative_to(WORKDIR)`：Python 3.9+ 方法，检查路径是否在工作目录内
- 所有工具函数（`run_read`、`run_write`、`run_edit`）都通过 `safe_path` 校验后再操作

## 攻击场景与防护

| 攻击路径 | 输入示例 | resolve() 结果 | 是否拦截 |
|:---------|:---------|:---------------|:---------|
| 简单上级目录 | `../../etc/passwd` | `/etc/passwd` | ✅ 拦截 |
| 多层嵌套 | `../../../etc/shadow` | `/etc/shadow` | ✅ 拦截 |
| 符号链接绕过 | 工作区内链接指向 `/etc` | 指向 `/etc` | ✅ 拦截（resolve() 解引用） |
| 合法路径 | `data/notes.txt` | `/workdir/data/notes.txt` | ✅ 放行 |
| 空路径 | `` | `/workdir`（等于 WORKDIR） | ✅ 放行 |

## 直观理解

`safe_path` 就像"门禁卡"——Agent 想进任何房间（路径），都要先刷卡验证。门禁卡确保 Agent 只能在办公区（工作目录）内活动，无法进入机房（`/etc`）或仓库（`/tmp`）。`resolve()` 是"拆穿伪装"——即使 Agent 想通过"绕路"（`../../`）或"暗道"（符号链接）进入禁区，也会被拆穿。

## Agent 工程应用场景

| 工具 | safe_path 的使用方式 | 防护效果 |
|:-----|:--------------------|:---------|
| `run_read` | `safe_path(path).read_text()` | 防止读取工作区外的敏感文件 |
| `run_write` | `safe_path(path).parent.mkdir()` | 防止写入系统目录 |
| `run_edit` | `safe_path(path).read_text()` | 防止修改工作区外的文件 |
| `run_glob` | 检查每个匹配结果是否在 WORKDIR 内 | 防止通过 glob 泄露路径信息 |

## 面试追问

**Q1（基础）**：`safe_path` 是如何防止路径穿越的？`resolve()` 和 `is_relative_to()` 各起什么作用？
**回答要点**：

1. `resolve()` 将路径解析为绝对路径，消除 `../`、`.` 等相对路径引用
2. `resolve()` 还会解引用符号链接，防止通过软链接绕过路径检查
3. `is_relative_to(WORKDIR)` 检查解析后的路径是否在工作目录内
4. 两者配合：先解析（消除所有伪装），再检查（确保在边界内）

**Q2（深挖）**：为什么要在 `WORKDIR / p` 拼接后再 `resolve()`，而不是直接 `resolve(p)`？
**回答要点**：

1. `WORKDIR / p` 确保路径锚定在工作目录下，即使 `p` 是绝对路径
2. 直接 `resolve(p)` 如果是绝对路径（如 `/etc/passwd`），会直接解析到系统路径
3. 拼接后：`/workdir + /etc/passwd` 经 resolve() 得到 `/etc/passwd`，仍然能检测到越界
4. 双重保障：拼接确保相对路径不逃逸，resolve 确保绝对路径被检测到

**Q3（实战）**：`is_relative_to()` 是 Python 3.9+ 才有的方法，如果需要兼容更低版本怎么实现？
**回答要点**：

1. 使用 `os.path.commonpath()` 比较两个路径的公共前缀
2. 实现：`commonpath([path, WORKDIR]) == WORKDIR`
3. 或使用 `str(path).startswith(str(WORKDIR))`——但需要先加 `/` 分隔符防止误匹配
4. 更健壮的方式：`path.resolve().relative_to(WORKDIR.resolve())` 成功则安全，抛出异常则越界

**Q4（边界）**：`safe_path` 能防御所有路径相关的安全攻击吗？还有什么盲区？
**回答要点**：

1. 能防御：路径穿越（`../`）、符号链接绕过、绝对路径攻击
2. 不能防御：Agent 在合法路径内执行恶意操作（如删除工作区内的重要文件）
3. 不能防御：竞态条件（TOCTOU）——检查后文件被替换为符号链接
4. 不能防御：路径编码绕过（如 URL 编码的 `/`）——但 resolve() 后仍会被解码

## 参考引用

- 需要了解权限系统的整体架构参见 [权限系统](../01-Tools-Execution（工具与执行）/04-权限系统（Permission%20System）.md)
- 需要掌握工具分发中 safe_path 的使用参见 [工具分发系统](../01-Tools-Execution（工具与执行）/03-工具分发系统（Tool%20Dispatch）.md)
- 需要了解 Deny List 与 safe_path 的配合参见 [权限系统](../01-Tools-Execution（工具与执行）/04-权限系统（Permission%20System）.md)
- 需要了解 Harness 整体安全设计参见 [Agent Harness（基础设施层）](../05-Multi-Agent-Platform（多Agent平台）/01-Agent%20Harness（基础设施层）.md)
- 需要了解 Python 路径处理的最佳实践参见 [工具体系](../../Project/工具/09-Claude使用指南.md)