---
author: "XunZong"
created: "2026-07-19"
tags: ["AI-Agent", "Harness", "子Agent"]
aliases: ["Subagent", "子Agent", "子任务", "隔离执行"]
---

# 子 Agent（Subagent）

## 定义

子 Agent 是一种上下文隔离的执行机制，通过创建全新的 `messages[]` 和独立的 `SUB_SYSTEM` 提示词来派生子 Agent 进程。子 Agent 无法访问父 Agent 的对话历史，也无法再派生子子 Agent，形成安全的递归限制。

$$
\text{Subagent} = \text{Fresh messages} + \text{Independent System Prompt} + \text{30-round Cap} + \text{Summary Return}
$$


## 问题描述

多步骤任务（如“搜索资料→分析→写报告”）放在一个上下文里，后续步骤的中间结果会污染消息历史。每轮循环的 token 消耗线性增长，上下文窗口很快被填满，模型开始“遗忘”早期的关键信息。

子任务之间的消息互相干扰——收集资料的 bash 输出混杂在写报告的思考中，既浪费 token 又影响模型注意力。需要为每个子任务创建独立的“工作台”，让它们互不干扰。

### 核心代码

```python
def spawn_subagent(description: str) -> str:
    # 全新上下文，完全隔离父 Agent 的对话历史
    messages = [{"role": "user", "content": description}]

    for _ in range(30):  # 安全上限，防止无限循环
        response = client.messages.create(
            model=MODEL, system=SUB_SYSTEM,  # 独立 system prompt
            messages=messages, tools=SUB_TOOLS, max_tokens=8000,
        )
        messages.append({"role": "assistant", "content": response.content})
        if response.stop_reason != "tool_use":
            break
        # ... 执行工具（子 Agent 的工具列表不含 task 工具）
    return extract_text(messages[-1]["content"])  # 只返回摘要，丢弃中间过程
```

- `SUB_SYSTEM`：子 Agent 的独立系统提示词，与父 Agent 不同
- `SUB_TOOLS`：子 Agent 的工具列表，**不包含 `task` 工具**，防止递归派生子 Agent
- 30 轮限制：子 Agent 最多执行 30 轮工具调用，超限强制返回
- `extract_text`：只返回最终结论的文本摘要，丢弃中间对话过程

## 关键设计对比

| 特性 | 父 Agent | 子 Agent |
|:-----|:---------|:---------|
| 上下文 | 完整对话历史 | 全新 messages，仅含任务描述 |
| System Prompt | 全局 SYSTEM | 独立的 SUB_SYSTEM |
| 工具列表 | 完整工具集 | 受限工具集（不含 task） |
| 最大轮次 | 50（可配置） | 30（硬编码上限） |
| 返回结果 | 持续对话 | 仅返回摘要文本 |
| 递归能力 | 可派生子 Agent | 不可再派生子 Agent |

## 直观理解

子 Agent 就像让一个"实习生"去独立完成一项任务——你给他一个明确的任务描述（`description`），给他一套受限的工具（`SUB_TOOLS`），告诉他自己的行为准则（`SUB_SYSTEM`）。他做完后只回来汇报结果，中间过程你不需要知道。

## Agent 工程应用场景

| 应用场景 | 实现方式 | 说明 |
|:---------|:---------|:-----|
| 并行子任务 | 主 Agent 同时派发多个子 Agent | 每个子 Agent 独立执行，结果汇总 |
| 安全隔离 | 子 Agent 无法访问父 Agent 的敏感上下文 | 保护对话历史中的密钥、API token 等 |
| 递归防止 | 子 Agent 工具列表不含 task | 防止无限递归或资源耗尽 |
| 结果摘要 | 只返回最终结论，丢弃中间过程 | 节省父 Agent 的上下文空间 |

## 面试追问

**Q1（基础）**：子 Agent 和父 Agent 的上下文是如何隔离的？
**回答要点**：

1. 子 Agent 使用全新的 `messages[]` 列表，仅包含任务描述一条消息
2. 父 Agent 的完整对话历史不会传递给子 Agent
3. 子 Agent 使用独立的 `SUB_SYSTEM` 提示词，与父 Agent 的 SYSTEM 完全分离
4. 子 Agent 执行完毕后只返回摘要结果，不合并中间对话

**Q2（深挖）**：为什么要把子 Agent 的最大轮次设为 30？这个数字怎么来的？
**回答要点**：

1. 30 轮是安全上限，防止子 Agent 无限循环消耗 API 费用
2. 大多数简单任务 5-10 轮即可完成，30 轮给复杂任务留足余量
3. 这个值可根据任务复杂度动态调整（如代码审查任务可设为 50）
4. 超限后应返回当前部分结果而非抛出异常，保证系统鲁棒性

**Q3（实战）**：如何实现子 Agent 的结果传递给其他子 Agent 或父 Agent？
**回答要点**：

1. 父 Agent 获取子 Agent 的摘要结果后，可将其作为上下文传递给下一个子 Agent
2. 通过消息总线（MessageBus）实现子 Agent 间接通信，而非直接共享上下文
3. 文件系统作为共享存储：子 Agent 将结果写入约定文件，其他 Agent 读取
4. 注意：子 Agent 间不应直接通信，应通过父 Agent 协调，避免 Agent 网络失控

**Q4（边界）**：子 Agent 执行过程中如果父 Agent 崩溃了，子 Agent 会怎样？
**回答要点**：

1. 如果子 Agent 是同步调用（阻塞等待），父 Agent 崩溃后子 Agent 仍在运行但结果丢失
2. 如果子 Agent 是后台线程（异步），父 Agent 崩溃后 daemon 线程自动终止
3. 改进方案：子 Agent 的执行结果持久化到文件系统，崩溃后可恢复
4. 生产级方案：使用独立进程或容器执行子 Agent，父 Agent 崩溃不影响子 Agent 执行

## 参考引用

- 需要理解 Agent 循环的整体架构参见 [Agent 循环](../01-Tools-Execution（工具与执行）/02-Agent循环（Agent%20Loop）.md)
- 需要了解后台任务与子 Agent 的区别参见 [后台任务系统](../04-Concurrency-Scheduling（并发与调度）/18-后台任务系统（Background%20Tasks）.md)
- 需要掌握消息总线通信参见 [消息总线与 Agent 团队](../05-Multi-Agent-Platform（多Agent平台）/09-消息总线与Agent团队（MessageBus）.md)
- 需要了解 Harness 整体设计参见 [Agent Harness（基础设施层）](../05-Multi-Agent-Platform（多Agent平台）/01-Agent%20Harness（基础设施层）.md)
- 需要了解该机制在 Claude Code 中的工程实现参见 [Claude 使用指南](../../Project/工具/09-Claude使用指南.md)