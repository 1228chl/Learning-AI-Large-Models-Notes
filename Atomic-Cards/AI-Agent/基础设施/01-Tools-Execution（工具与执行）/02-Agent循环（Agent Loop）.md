---
author: "XunZong"
created: "2026-07-19"
tags: ["AI-Agent", "Harness", "Agent循环"]
aliases: ["Agent Loop", "Agent循环", "核心循环"]
---

# Agent 循环（Agent Loop）

## 定义

Agent 循环是 Agent Harness 的最外层控制流骨架，基于 `while True` 循环和 LLM 的 `stop_reason` 机制实现模型调用的自动迭代。所有 Agent 系统（无论多复杂）都围绕这个核心模式构建。

$$
\text{Agent Loop} = \text{LLM 调用} \rightarrow \text{工具执行} \rightarrow \text{结果追加} \rightarrow \text{继续/停止}
$$


## 问题描述

你向大模型提问：“帮我读取目录下有哪些文件，并且执行 XXX.py”。模型能输出一条 bash 命令，但输出完了就停了——它不会自己跑，也不会看到结果后继续推理。你可以手动把命令复制到终端执行，再把输出粘贴回对话框，让它接着干。下一个命令出来，你再跑一遍、再贴回去。

每一个来回，你都在做中间层——而把它自动化，就是 Agent 循环要做的事。

### 核心代码

```python
while stop_reason == "tool_use":
    response = client.messages.create(
        model=MODEL, system=SYSTEM, messages=messages,
        tools=TOOLS, max_tokens=8000,
    )
    messages.append({"role": "assistant", "content": response.content})

    if response.stop_reason != "tool_use":
        return  # 模型决定停止

    for block in response.content:
        if block.type == "tool_use":
            output = execute_tool(block)  # 分发到对应处理器
            messages.append({
                "type": "tool_result",
                "tool_use_id": block.id,
                "content": output,
            })
```

- `response.stop_reason`：模型返回的控制信号，`"tool_use"` 表示需要继续调用工具，其他值表示结束
- `block.type == "tool_use"`：识别模型输出的工具调用请求，每个 block 包含 `id`、`name`、`input` 三个字段
- `tool_use_id`：将工具执行结果与对应的调用请求关联，确保消息结构的正确性

## 核心概念表

| 概念 | 说明 | 作用 |
|:-----|:-----|:-----|
| Messages API | `user` → `assistant` → `tool_use` → `tool_result` 的轮次结构 | 定义 Agent 与模型之间的通信协议 |
| stop_reason | 模型返回的停止原因 | `"tool_use"` 继续循环，其他值退出 |
| tool_use block | 模型输出的工具调用请求 | 包含 `id`（唯一标识）、`name`（工具名）、`input`（参数字典） |
| tool_result | 工具执行结果 | 通过 `tool_use_id` 关联回对应的调用请求 |
| 最大轮次限制 | 防止无限循环的安全上限 | 如 `max_rounds=50`，超限后强制返回 |

## 直观理解

Agent 循环就像一个"思考→行动→观察→再思考"的认知闭环：模型思考后决定调用工具，工具执行后返回结果，模型看到结果后继续思考，直到认为任务完成。

## Agent 工程应用场景

| 应用场景 | 数学/代码形式 | 说明 |
|:---------|:--------------|:-----|
| 单步工具调用 | 模型输出 1 个 tool_use block | 最简单的 Agent 交互，如"帮我读一个文件" |
| 多步推理链 | 多轮循环，每轮 1~3 个 tool_use | 复杂任务分解，如"搜索资料→分析→写报告" |
| 并行工具调用 | 模型同时输出多个 tool_use blocks | 多个独立操作同时执行，如同时读多个文件 |
| 循环终止判断 | `stop_reason` 不是 `"tool_use"` | 模型认为任务完成或需要用户输入 |

## 面试追问

**Q1（基础）**：Agent 循环的基本流程是什么？
**回答要点**：

1. 调用 LLM 获取响应，将响应追加到消息历史
2. 检查 `stop_reason`：如果为 `"tool_use"` 继续循环，否则退出
3. 遍历响应中的 `tool_use` blocks，依次执行对应工具
4. 将工具执行结果作为 `tool_result` 追加到消息历史，返回步骤 1

**Q2（深挖）**：为什么用 `while True` 而不是递归？`stop_reason` 有哪些可能值？
**回答要点**：

1. `while True` 避免递归深度限制，更易于实现中断和超时控制
2. `stop_reason` 主要值：`"tool_use"`（需要调用工具）、`"end_turn"`（模型主动结束）、`"max_tokens"`（输出被截断）、`"stop_sequence"`（命中停止序列）
3. 不同模型和 API 版本的 stop_reason 值可能略有差异

**Q3（实战）**：如何防止 Agent 循环陷入无限循环？
**回答要点**：

1. 设置最大轮次限制（如 50 轮），超限后强制返回并提示用户
2. 实现超时机制（如单次循环总时间超 600 秒终止）
3. 检测重复模式（连续 N 轮调用相同工具并返回相同结果）
4. 使用催办提醒（如连续 3 轮未更新任务规划时注入提醒）

**Q4（边界）**：流式响应和非流式响应在 Agent 循环中有何区别？
**回答要点**：

1. 非流式：一次性获取完整响应，解析 tool_use blocks，实现简单
2. 流式：需要实时拼接 content blocks，在流结束时才能判断 stop_reason
3. 流式下 tool_use 可能分段到达，需要缓冲解析直到 block 完整
4. 流式优势：用户可以实时看到模型思考过程，体验更好但实现更复杂

## 参考引用

- 需要理解 Harness 整体架构参见 [Agent Harness（基础设施层）](../05-Multi-Agent-Platform（多Agent平台）/01-Agent%20Harness（基础设施层）.md)
- 需要了解工具分发实现参见 [工具分发系统](../01-Tools-Execution（工具与执行）/03-工具分发系统（Tool%20Dispatch）.md)
- 需要掌握权限控制参见 [权限系统](../01-Tools-Execution（工具与执行）/04-权限系统（Permission%20System）.md)
- 需要了解子 Agent 的独立循环参见 [子 Agent](../02-Planning-Control（规划与控制）/06-子Agent（Subagent）.md)
- 需要理解错误恢复对循环的影响参见 [错误恢复与重试](../02-Planning-Control（规划与控制）/08-错误恢复与重试（Error%20Recovery）.md)
- 需要了解该机制在 Claude Code 中的工程实现参见 [Claude 使用指南](../../Project/工具/09-Claude使用指南.md)