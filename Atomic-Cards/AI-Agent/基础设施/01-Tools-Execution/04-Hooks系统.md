---
author: "XunZong"
created: "2026-07-19"
tags: ["AI-Agent", "Harness", "扩展机制"]
aliases: ["Hooks System", "Hooks系统", "钩子系统", "事件驱动"]
---

# Hooks 系统（Hooks System）

## 定义

Hooks 系统是一种基于事件注册表的扩展机制，将 Agent 循环中的横切关注点（权限检查、日志、审计、统计）从循环体代码中分离出来，通过注册回调函数的方式实现可插拔扩展。

$$
\text{Hook System} = \text{Event Registry} + \text{Callback Functions} + \text{Trigger Pipeline}
$$


## 问题描述

每次加一个新功能——比如“记录每次 bash 调用”、“操作后自动 git add”、“通知 Slack”——都要修改 agent_loop 函数。循环很快就从 10 行变成 50 行，横切关注点（日志、权限、通知）和核心逻辑（调用模型、执行工具）纠缠在一起。

你想扩展的是 Agent 的行为，但你改的却是循环本身。循环应该是一个稳定的核心，扩展应该挂在外面。

### 核心代码

```python
# 事件注册表：事件类型 → 回调函数列表
HOOKS = {
    "UserPromptSubmit": [],  # 用户输入后、LLM 调用前
    "PreToolUse": [],        # 工具执行前
    "PostToolUse": [],       # 工具执行后
    "Stop": [],              # 循环结束时
}

def register_hook(event: str, callback):
    """注册一个 Hook：将回调函数挂载到指定事件"""
    HOOKS[event].append(callback)

def trigger_hooks(event: str, *args):
    """触发事件：依次执行所有注册的回调"""
    for callback in HOOKS[event]:
        result = callback(*args)
        if result is not None:  # 返回非 None 即阻断该事件
            return result
    return None
```

- `register_hook(event, callback)`：将回调函数注册到指定事件类型，可多次注册
- `trigger_hooks(event, *args)`：遍历执行该事件的所有回调，按注册顺序
- **非阻断 vs 阻断**：回调返回 `None` 继续执行后续回调；返回非 `None` 值立即阻断整个事件

## 事件类型对比

| 事件 | 触发时机 | 参数 | 用途 | 阻断行为 |
|:-----|:---------|:-----|:-----|:---------|
| UserPromptSubmit | 用户输入后、LLM 前 | 用户消息 | 上下文注入、输入日志 | 可阻止输入提交 |
| PreToolUse | 工具执行前 | tool_use block | 权限检查、操作日志 | 可阻止工具执行 |
| PostToolUse | 工具执行后 | tool_use block, result | 大输出告警、审计 | 可修改结果 |
| Stop | 循环结束时 | 最终消息列表 | 统计、清理、审计 | 无法阻断 |

## 直观理解

Hooks 系统像电器上的"插座口"——循环体是电器本体，Hooks 是插座（扩展接口）。权限系统是插上去的"漏电保护器"，日志系统是"电量监测仪"。新增功能不需要拆开电器，只需要插上对应的扩展模块。

## Agent 工程应用场景

| 应用场景 | Hook 事件 | 实现 |
|:---------|:----------|:-----|
| 权限检查 | PreToolUse | 注册权限检查回调，返回 False 阻断危险操作 |
| 操作日志 | PreToolUse + PostToolUse | 记录每次工具调用的时间、参数和结果 |
| 大输出告警 | PostToolUse | 检查工具返回结果是否超过阈值，注入告警提醒 |
| 使用统计 | Stop | 统计本轮会话的工具调用次数、token 消耗 |
| 上下文注入 | UserPromptSubmit | 注入当前时间、工作目录等上下文信息 |

## 面试追问

**Q1（基础）**：Hooks 系统的核心机制是什么？事件注册表如何工作？
**回答要点**：

1. 核心是事件驱动 + 回调注册：先定义事件类型，再注册回调函数，最后在对应时机触发
2. 注册表是 `dict[event_name] -> list[callable]` 的结构，每个事件可挂多个回调
3. 触发时按注册顺序依次执行，回调返回非 None 值即阻断后续执行
4. 阻断机制使 Hook 不仅可以"观察"，还可以"干预"循环流程

**Q2（深挖）**：Hooks 系统和直接在循环体写 if-else 有什么本质区别？
**回答要点**：

1. 关注点分离：Hooks 把横切关注点（权限、日志、审计）从核心业务逻辑中拆出
2. 可组合性：功能模块通过 Hook 注册组合，无需修改循环体代码
3. 可测试性：每个 Hook 可独立测试，无需启动完整 Agent 循环
4. 运行时灵活性：理论上可在运行时注册/注销 Hook（实现动态行为变更）

**Q3（实战）**：如何实现一个 Hook 的执行时间阈值告警——当某个工具执行超过 30 秒时发出告警？
**回答要点**：

1. 在 PreToolUse 中记录开始时间：`start_time = time.time()`
2. 将开始时间存入当前上下文的临时存储（如 `threading.local()`）
3. 在 PostToolUse 中计算耗时：`elapsed = time.time() - start_time`
4. 如果 `elapsed > 30`，返回告警消息注入到下一轮对话中

**Q4（边界）**：如果注册了多个 Hook 且它们之间有依赖关系，如何处理执行顺序？
**回答要点**：

1. 当前实现按注册顺序执行，无显式优先级控制
2. 改进方案：为每个 Hook 添加 `priority` 字段，触发时按优先级排序
3. 依赖关系更复杂时：引入 DAG 来声明 Hook 间的前置条件
4. 实际工程建议：保持 Hook 间无状态依赖，让每个 Hook 独立工作，避免耦合

## 参考引用

- 需要理解权限系统如何作为 Hook 实现参见 [权限系统](../01-Tools-Execution/03-权限系统.md)
- 需要了解 Agent 循环中 Hook 的触发位置参见 [Agent 循环](../01-Tools-Execution/01-Agent循环.md)
- 需要掌握工具分发流程参见 [工具分发系统](../01-Tools-Execution/02-工具分发系统.md)
- 需要了解 Agent 整体架构参见 [Agent Harness（基础设施层）](../05-Multi-Agent-Platform/01-Agent-Harness基础设施层.md)
- 需要了解该机制在 Claude Code 中的工程实现参见 [Claude 使用指南](../../Tools/工具/04-Claude使用指南.md)