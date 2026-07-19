---
author: "XunZong"
created: "2026-07-19"
tags: ["AI-Agent", "Harness", "并行"]
aliases: ["Worktree Isolation", "工作树隔离", "Git Worktree", "并行沙箱"]
---

# 工作树隔离（Worktree Isolation）

## 定义

工作树隔离是一种基于 Git worktree 的并行沙箱机制，为每个任务创建独立的工作目录和分支，多个 Agent 的修改互不干扰。任务完成后可选择保留（keep）或清理（remove）对应的工作树。

$$
\text{Worktree Isolation} = \text{Git Worktree} + \text{Independent Branch} + \text{Task Binding}
$$


## 问题描述

多个 Agent 并行工作时，它们在同一个文件系统上操作——Agent A 正在修改的文件被 Agent B 覆盖，Agent C 创建的临时目录和 Agent D 的冲突。并发写入导致数据损坏，并行工作变成互相破坏。

工作树隔离为每个 Agent 创建独立的文件系统副本——每个 Agent 有自己的工作目录，互不干扰。完成后将变更合并回主工作区。

### 核心代码

```python
def create_worktree(name: str, task_id: str = "") -> str:
    """为任务创建独立的工作树。"""
    validate_worktree_name(name)  # 安全校验：只允许 [A-Za-z0-9._-]{1,64}
    path = WORKTREES_DIR / name
    # 创建 git worktree 和独立分支
    ok, result = run_git(["worktree", "add", str(path), "-b", f"wt/{name}", "HEAD"])
    if ok and task_id:
        bind_task_to_worktree(task_id, name)  # 绑定任务到工作树
    return f"Worktree '{name}' created at {path}"

def remove_worktree(name: str) -> str:
    """安全清理工作树。"""
    path = WORKTREES_DIR / name
    if not path.exists():
        return f"Worktree '{name}' not found"
    run_git(["worktree", "remove", "--force", str(path)])  # 强制删除
    run_git(["branch", "-D", f"wt/{name}"])  # 删除对应分支
    return f"Worktree '{name}' removed"

def validate_worktree_name(name: str):
    """防止路径穿越和非法字符。"""
    if not re.match(r'^[A-Za-z0-9._-]{1,64}$', name):
        raise ValueError(f"Invalid worktree name: {name}")
```

## 工作树生命周期

| 阶段 | 操作 | 说明 |
|:-----|:-----|:-----|
| 创建 | `create_worktree(name, task_id)` | 创建 worktree + 独立分支 + 绑定任务 |
| 使用 | Agent 在 worktree 目录内工作 | 修改文件不影响主仓库和其他 worktree |
| 清理 | `remove_worktree(name)` | 删除 worktree 目录和分支，任务标记完成 |
| 保留 | `keep_worktree(name)` | 保留 worktree 目录，任务完成但不清理 |

## 直观理解

工作树隔离就像"每个人的独立工作台"——在一个大办公室（主仓库）里，每个人有自己的办公桌（worktree），桌上文件（分支）互不干扰。项目完成后，可以保留办公桌（keep）或清理出来给其他人用（remove）。`validate_worktree_name` 就像门禁卡——确保只进入合法的办公桌，不会跑到机房或储藏室。

## Agent 工程应用场景

| 应用场景 | 实现方式 | 说明 |
|:---------|:---------|:-----|
| 并行代码修改 | 不同任务创建不同 worktree | 同时修改同一项目的不同文件，互不冲突 |
| 安全隔离 | 每个 worktree 有独立分支 | 一个任务的操作不会影响其他任务 |
| 实验性修改 | 在 worktree 中测试 | 不影响主分支，不满意直接删除 worktree |
| 任务绑定 | task → worktree 映射 | 通过任务 ID 可追溯到对应的 worktree |

## 面试追问

**Q1（基础）**：工作树隔离的核心机制是什么？为什么用 Git worktree 而非 `tempfile`？
**回答要点**：

1. Git worktree 是基于同一仓库的多个独立工作目录，每个有自己的分支和文件
2. 相比 `tempfile`：worktree 保留 Git 历史，可提交、合并、分支管理
3. 相比 `subprocess` 在新目录执行：worktree 的修改可合并回主分支
4. 核心优势：共享仓库对象存储（节省磁盘），独立工作目录（避免冲突）

**Q2（深挖）**：`validate_worktree_name` 为什么要做严格的安全校验？路径穿越风险是什么？
**回答要点**：

1. worktree 名称可能被用于文件路径拼接，如 `WORKTREES_DIR / name`
2. 如果没有校验，`name = "../../etc/passwd"` 可能导致路径穿越
3. 校验规则：只允许字母、数字、点、下划线、连字符，长度 1-64 字符
4. 正则 `^[A-Za-z0-9._-]{1,64}$` 严格限制字符集，彻底杜绝路径穿越

**Q3（实战）**：如何实现任务到 worktree 的绑定？任务完成后怎么处理 worktree？
**回答要点**：

1. 在 Task 数据类中添加 `worktree: str | None` 字段，存储绑定的 worktree 名称
2. `create_worktree` 时可选传入 `task_id`，绑定后更新任务的 worktree 字段
3. 任务完成时用 `remove_worktree(name)` 或 `keep_worktree(name)` 处理
4. 清理操作：删除 worktree 目录、删除对应分支、更新任务状态

**Q4（边界）**：如果同时有多个 Agent 在同一个 worktree 中工作，会发生什么？
**回答要点**：

1. 设计上每个 worktree 绑定一个任务，不应有多个 Agent 同时操作
2. 如果多个 Agent 同时写同一文件，后写入的会覆盖先写入的（数据竞争）
3. 解决方案：在 worktree 级别加文件锁，或通过任务系统的 `claim_task` 确保唯一认领
4. 更严格的方案：Agent 在 worktree 中工作前先检查是否有其他 Agent 已绑定该 worktree

## 参考引用

- 需要了解任务系统与 worktree 的绑定参见 [任务系统](../05-Multi-Agent-Platform（多Agent平台）/13-任务系统（Task%20System）.md)
- 需要掌握自主 Agent 在 worktree 中的工作方式参见 [自主 Agent](../05-Multi-Agent-Platform（多Agent平台）/15-自主Agent（Autonomous%20Agent）.md)
- 需要理解子 Agent 的隔离执行参见 [子 Agent](../02-Planning-Control（规划与控制）/06-子Agent（Subagent）.md)
- 需要了解 Harness 整体设计参见 [Agent Harness（基础设施层）](../05-Multi-Agent-Platform（多Agent平台）/01-Agent%20Harness（基础设施层）.md)
- 需要了解该机制在 Claude Code 中的工程实现参见 [Claude 使用指南](../../工程实践/工具/09-Claude使用指南.md)