---
author: "XunZong"
created: "2026-07-19"
tags: ["AI-Agent", "Harness", "协议"]
aliases: ["Messages API", "消息结构", "消息轮次", "tool_use", "tool_result"]
---

# Messages API 消息结构

## 定义

Messages API 是 AI Agent 与 LLM 之间的通信协议，定义了 `user` → `assistant` → `tool_use` → `tool_result` 四类消息的轮次结构。Agent 的每次思考-行动循环都通过这四类消息的交替完成，是整个 Agent 系统的通信基础。

$$
\text{Agent Round} = \text{user} \rightarrow \text{assistant} \rightarrow \text{tool\_use} \rightarrow \text{tool\_result} \rightarrow \text{user}
$$

### 消息类型

| 消息类型 | 角色 | 发送方 | 内容 | 触发时机 |
|:---------|:-----|:-------|:-----|:---------|
| `user` | 用户 | 系统/用户 | 文本消息或 `tool_result` 列表 | 用户输入、工具结果返回 |
| `assistant` | 助手 | LLM | 文本回复或 `tool_use` block 列表 | LLM 每次生成响应 |
| `tool_use` | 工具调用 | LLM（在 assistant 内） | `{id, name, input}` | 模型决定调用工具时 |
| `tool_result` | 工具结果 | 系统（在 user 内） | `{tool_use_id, content}` | 工具执行完成后 |

### 消息结构

```python
# 用户消息：可以是文本或工具结果列表
{"role": "user", "content": "帮我读取config.json文件"}

# 助手消息：包含文本和工具调用
{"role": "assistant", "content": [
    {"type": "text", "text": "我来读取这个文件。"},
    {"type": "tool_use", "id": "toolu_abc123", "name": "read_file",
     "input": {"path": "config.json"}}
]}

# 用户消息（下一轮）：包含工具结果
{"role": "user", "content": [
    {"type": "tool_result", "tool_use_id": "toolu_abc123",
     "content": "{\"version\": \"1.0\"}"}
]}
```


## 问题描述

Agent 循环依赖标准的消息结构来与 LLM 通信：user -> assistant -> tool_use -> tool_result 的轮次格式。如果消息结构不正确——比如 tool_result 缺少 tool_use_id、role 字段错误——API 调用会直接失败。

理解 Messages API 的完整结构是 Agent 开发的基础，所有后续功能（子 Agent、记忆系统、团队协议）都建立在正确的消息结构之上。

## 一轮完整交互

```
用户: "读取config.json"                    →  user 消息
LLM: "我来读取" + tool_use(read_file)      →  assistant 消息（含 tool_use block）
系统: 执行 read_file, 返回结果              →  user 消息（含 tool_result）
LLM: "文件内容是..."                        →  assistant 消息（stop_reason=end_turn）
```

## 直观理解

Messages API 像"对话记录本"——user 是"我说的话"和"工具返回的结果"，assistant 是"模型说的话"和"模型想用的工具"。`tool_use_id` 就像"快递单号"，把"发出去的快递"（tool_use）和"收到的快递"（tool_result）一一对应起来。

## Agent 工程应用场景

| 场景 | 消息模式 | 说明 |
|:-----|:---------|:-----|
| 单步工具调用 | user → assistant(含1个tool_use) → user(含tool_result) → assistant(文本) | 最简单的读文件、写文件操作 |
| 多步推理链 | 多轮 user→assistant→user 交替，每轮 1-3 个 tool_use | 复杂任务分解，如"搜索→分析→写报告" |
| 并行工具调用 | assistant 同时输出多个 tool_use blocks | 同时读多个文件、执行多个独立命令 |
| 催办提醒 | user 消息注入 `<reminder>` 文本 | 连续 3 轮未更新 todo 时注入提醒 |

## 面试追问

**Q1（基础）**：Messages API 的四类消息分别是什么？它们如何组成一个完整的 Agent 轮次？
**回答要点**：

1. user：用户输入或工具执行结果，由系统发送
2. assistant：LLM 的文本回复和工具调用请求，由 LLM 返回
3. tool_use：LLM 在 assistant 消息中输出的工具调用请求，包含 id、name、input
4. tool_result：工具执行结果，通过 tool_use_id 关联回对应的 tool_use
5. 一轮：user → LLM 返回 assistant(含 tool_use) → 执行工具 → 追加 user(含 tool_result) → 下一轮

**Q2（深挖）**：`tool_use_id` 的作用是什么？为什么 tool_result 必须有这个字段？
**回答要点**：

1. `tool_use_id` 是工具调用的唯一标识，由 LLM 在 tool_use block 中生成
2. tool_result 通过 `tool_use_id` 告诉 LLM"这个结果对应的是哪个工具调用"
3. 当模型同时输出多个 tool_use 时，tool_use_id 确保结果不会被混淆
4. 没有 tool_use_id，LLM 无法将结果与调用对应，可能导致混乱

**Q3（实战）**：为什么 tool_result 要放在 user 消息中，而不是单独的消息类型？
**回答要点**：

1. API 设计上，user 消息既可以包含文本（用户输入），也可以包含 tool_result（工具结果）
2. 放在 user 消息中让 LLM 看到"工具返回了结果，就像用户提供了新信息"
3. 不需要新增消息类型，简化了 API 的设计
4. 同一轮中可能有多个 tool_result，都放在同一条 user 消息的 content 列表中

**Q4（边界）**：如果工具执行失败，tool_result 的 content 应该返回什么？LLM 会怎么处理？
**回答要点**：

1. 返回错误信息，如 `"Error: Timeout (120s)"` 或 `"Error: Permission denied"`
2. LLM 看到错误信息后，会尝试修复（如重试、换工具、修改参数）
3. 部分实现中，权限拒绝的 tool_result 可能返回 `"Permission denied."` 让 LLM 尝试其他方案
4. 关键设计：tool_result 永远不抛异常，始终返回字符串，让 LLM 做错误处理决策

## 参考引用

- 需要了解 Agent 循环如何驱动消息轮次参见 [Agent 循环](../01-Tools-Execution（工具与执行）/02-Agent循环（Agent%20Loop）.md)
- 需要掌握工具分发中 tool_use 的处理参见 [工具分发系统](../01-Tools-Execution（工具与执行）/03-工具分发系统（Tool%20Dispatch）.md)
- 需要了解错误恢复中 tool_result 的处理参见 [错误恢复与重试](../02-Planning-Control（规划与控制）/08-错误恢复与重试（Error%20Recovery）.md)
- 需要理解 LLM API 调用方式参见 [LLM API 调用与 ChatBot](../../Project/部署/07-LLM%20API调用与ChatBot.md)