---
author: "XunZong"
created: "2026-07-19"
tags: ["AI-Agent", "Harness", "自治行为"]
aliases: ["Autonomous Agent", "自主Agent", "空闲轮询", "自组织"]
---

# 自主 Agent（Autonomous Agent）

## 定义

自主 Agent 是一种具备自组织能力的 Agent 模式，在完成工作后不退出，而是进入空闲轮询状态，自动检查收件箱和任务看板，发现可认领的任务时自动认领执行。它是 Agent 从"被动响应"到"主动工作"的关键进化。

$$
\text{Autonomous Agent} = \text{WORK} \rightarrow \text{IDLE（Polling）} \rightarrow \text{SHUTDOWN}
$$

### 三阶段生命周期

```
WORK（工作）→ IDLE（空闲轮询）→ SHUTDOWN（关闭）
```


## 问题描述

Agent 只能被动等待分配任务——用户说一步，Agent 做一步。当用户说“优化这个项目”，Agent 等着用户分解任务，而不是主动去发现可做的工作。

自主 Agent 能主动查看任务看板，发现待处理的任务，评估自己是否适合执行，然后领取并执行。从“等活干”变成“找活干”，才能真正解放用户。

### 核心代码

```python
def idle_poll(name, messages, role) -> str:
    """空闲轮询：每 5 秒检查一次收件箱和任务看板"""
    for _ in range(IDLE_TIMEOUT // IDLE_POLL_INTERVAL):  # 60s / 5s = 12 次
        time.sleep(IDLE_POLL_INTERVAL)

        # ① 检查收件箱（是否有 Lead 的消息）
        inbox = BUS.read_inbox(name)
        if inbox:
            if 有 shutdown_request:
                return "shutdown"
            return "work"  # 有消息，回去工作

        # ② 扫描任务看板，找可认领的任务
        tasks = scan_unclaimed_tasks()
        if tasks:
            claim_task(tasks[0]["id"])
            return "work"  # 认领到任务，回去工作

    return "timeout"  # 空闲超时，自动关闭
```

- `IDLE_POLL_INTERVAL`：轮询间隔（5 秒），检测频率
- `IDLE_TIMEOUT`：空闲超时时间（60 秒），超时后自动关闭
- `BUS.read_inbox(name)`：检查是否有新消息（来自 Lead 或其他队友）
- `scan_unclaimed_tasks()`：扫描任务看板，查找 `status=pending` 且 `blockedBy` 全部完成的任务

## 状态转换表

| 当前状态 | 触发事件 | 新状态 | 动作 |
|:---------|:---------|:-------|:-----|
| WORK | 任务完成，无新消息 | IDLE | 进入轮询循环 |
| WORK | 收到 shutdown_request | SHUTDOWN | 保存状态，关闭 |
| IDLE | 收到新消息 | WORK | 读取消息，处理任务 |
| IDLE | 找到可认领的任务 | WORK | 认领任务，开始执行 |
| IDLE | 超时（60 秒无工作） | SHUTDOWN | 自动关闭 |
| IDLE | 收到 shutdown_request | SHUTDOWN | 立即关闭 |

## 直观理解

自主 Agent 就像一个"自由的自由职业者"——做完一个项目后（WORK→IDLE），不等着老板分配新任务，而是自己刷任务平台（扫描任务看板），看到合适的项目就接单（认领任务），开始工作（IDLE→WORK）。如果暂时没有合适的项目，就休息一下再刷（轮询），一直没活就休息了（超时关闭）。

## Agent 工程应用场景

| 应用场景 | 实现方式 | 说明 |
|:---------|:---------|:-----|
| 自组织团队 | 多 Agent 独立扫描任务看板 | 无需 Lead 分配，Agent 自动认领最适合的任务 |
| 后台服务 | Agent 持续运行，等待任务 | 如 CI/CD 流水线中自动处理代码审查 |
| 弹性扩展 | 按需启动更多 Agent | 任务积压时自动增加 Agent，空闲时自动关闭 |
| 容错恢复 | 新 Agent 自动认领未完成的任务 | 某 Agent 崩溃后，其他 Agent 自动接管 |

## 面试追问

**Q1（基础）**：自主 Agent 的三阶段生命周期是什么？IDLE 状态下做什么？
**回答要点**：

1. WORK：Agent 正在执行任务，调用工具、处理消息
2. IDLE：任务完成后进入空闲轮询，每 5 秒检查收件箱和任务看板
3. SHUTDOWN：收到关闭信号或超时后关闭，释放资源
4. IDLE 状态下 Agent 不做 LLM 调用（节省成本），只做轻量级的文件检查和 sleep

**Q2（深挖）**：轮询间隔 5 秒和空闲超时 60 秒这两个参数如何影响系统行为？
**回答要点**：

1. 5 秒轮询间隔：任务从创建到被认领的最大延迟约 5 秒，平衡响应速度和 CPU 占用
2. 60 秒空闲超时：60 秒无工作即关闭，防止 Agent 长时间空转消耗资源
3. 缩短间隔（如 1 秒）：响应更快但 CPU 占用更高，适合高实时性场景
4. 延长超时（如 300 秒）：Agent 更持久等待任务，适合任务到达间隔较长的场景

**Q3（实战）**：如何实现"任务优先级"——让 Agent 优先认领高优先级任务？
**回答要点**：

1. 在 Task 数据结构中添加 `priority` 字段（high/medium/low）
2. 在 `scan_unclaimed_tasks()` 中按优先级排序，优先返回高优先级任务
3. 多个 Agent 同时扫描时，高优先级任务被认领后，低优先级任务自动被后续 Agent 认领
4. 可认领的条件还需检查 `blockedBy` 依赖——确保优先级高的依赖任务先被处理

**Q4（边界）**：如果多个 Agent 同时扫描到同一个可认领的任务，会发生什么？如何避免竞争？
**回答要点**：

1. 两个 Agent 同时 `claim_task` 同一任务，文件写入可能互相覆盖
2. 解决方案：使用文件锁（`fcntl.flock` 或 `portalocker`），认领时加锁
3. 更简单的方案：认领操作使用"先检查后写入"的原子性检查（检查文件状态 + 写入 owner）
4. 如果竞争导致两个 Agent 都认为自己是 owner，在任务看板中标记冲突，由 Lead 协调

## 参考引用

- 需要了解消息总线在空闲轮询中的作用参见 [消息总线与 Agent 团队](../05-Multi-Agent-Platform/02-消息总线与Agent团队.md)
- 需要掌握团队协议中的关闭握手参见 [团队协议](../05-Multi-Agent-Platform/05-团队协议.md)
- 需要理解任务系统的认领机制参见 [任务系统](../05-Multi-Agent-Platform/04-任务系统.md)
- 需要了解 Agent 团队整体架构参见 [Agent Harness（基础设施层）](../05-Multi-Agent-Platform/01-Agent-Harness基础设施层.md)
- 需要了解该机制在 Claude Code 中的工程实现参见 [Claude 使用指南](../../Tools/工具/09-Claude使用指南.md)