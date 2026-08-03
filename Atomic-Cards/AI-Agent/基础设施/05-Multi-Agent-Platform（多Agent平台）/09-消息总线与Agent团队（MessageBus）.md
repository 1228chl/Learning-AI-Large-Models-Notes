---
author: "XunZong"
created: "2026-07-19"
tags: ["AI-Agent", "Harness", "多Agent"]
aliases: ["MessageBus", "消息总线", "Agent团队", "Agent Teams"]
---

# 消息总线与 Agent 团队（MessageBus）

## 定义

消息总线是一种基于 JSONL 文件的异步通信机制，实现多 Agent 间的消息传递。每个 Agent 拥有独立的文件收件箱（`{agent_name}.jsonl`），发送方追加消息到接收方的文件，接收方读取并消费收件箱内容。一个 Lead Agent 协调多个队友 Agent 组成团队。

$$
\text{MessageBus} = \text{JSONL file} + \text{Append Write} + \text{Consume Read}
$$


## 问题描述

所有工作挤在一个上下文里：Agent A 正在写代码，Agent B 要运行测试，Agent C 在审查——它们共用同一个消息历史，互相干扰、互相等待。一个 Agent 的 bash 输出变成了另一个 Agent 的“背景噪音”。

多 Agent 需要独立的消息空间，但又需要一种方式互相通信。消息总线就是 Agent 之间的“通信管道”，让每个 Agent 独立工作但又能协同。

### 核心代码

```python
MAILBOX_DIR = WORKDIR / ".mailboxes"  # 邮箱目录

class MessageBus:
    def send(self, from_agent, to_agent, content, msg_type="message"):
        """往对方的收件箱文件追加一行 JSON 消息"""
        msg = {
            "from": from_agent, "to": to_agent,
            "content": content, "type": msg_type,
            "ts": time.time()  # 时间戳，保证消息顺序
        }
        inbox = MAILBOX_DIR / f"{to_agent}.jsonl"
        with open(inbox, "a") as f:
            f.write(json.dumps(msg, ensure_ascii=False) + "\n")

    def read_inbox(self, agent):
        """读取并消费收件箱（读取后 unlink 删除文件）"""
        inbox = MAILBOX_DIR / f"{agent}.jsonl"
        if not inbox.exists():
            return []
        msgs = [json.loads(line) for line in inbox.read_text().splitlines() if line.strip()]
        inbox.unlink()  # 消费式读取：读取后删除文件
        return msgs

    def peek(self, agent):
        """非破坏性检查：检查是否有未读消息（不消费）"""
        inbox = MAILBOX_DIR / f"{agent}.jsonl"
        return inbox.exists() and inbox.stat().st_size > 0
```

- `from_agent` / `to_agent`：发送方和接收方的 Agent 名称
- `msg_type`：消息类型，如 `"message"`、`"shutdown_request"`、`"plan_approval"`
- `ts = time.time()`：时间戳，用于消息排序和延迟分析
- **消费式读取**：`read_inbox` 读取后清空文件，每条消息只被消费一次

## 团队架构

| 角色 | 职责 | 生命周期 | 通信方式 |
|:-----|:-----|:---------|:---------|
| Lead | 接收用户输入，拆解任务，协调队友 | 主线程，持续运行 | 发送 task 给队友，汇总结果 |
| 队友 | 执行子任务，返回结果 | 独立线程，可被 Lead 启动 | 读取收件箱，执行任务，返回结果 |
| 消息总线 | 中转 Agent 间的通信 | 全局单例，持续运行 | 无共享内存，仅通过文件传递 |

## 直观理解

消息总线像一个"邮政系统"——每个 Agent 有自己的邮箱（`.jsonl` 文件），发信人把信投到收件人的邮箱，收件人随时查看自己的邮箱。这个过程是异步的：发信人不需要等收件人立即阅读，收件人也不需要时刻关注消息。

## Agent 工程应用场景

| 应用场景 | 实现方式 | 说明 |
|:---------|:---------|:-----|
| 任务分解 | Lead 将大任务拆解发送给多个队友 | 每个队友独立执行子任务 |
| 结果汇总 | 队友将结果写入文件，Lead 读取 | Lead 收集所有队友结果后整合 |
| 状态通知 | 队友完成任务后发送通知 | Lead 知道何时可以进入下一步 |
| 关机协调 | Lead 发送 shutdown_request 给所有队友 | 队友确认后安全关闭 |

## 面试追问

**Q1（基础）**：消息总线为什么选用 JSONL 文件而不是数据库或消息队列？
**回答要点**：

1. 零依赖：JSONL 文件格式仅需 Python 标准库（json、pathlib），无需安装数据库或消息队列中间件
2. 调试友好：任何人都可以用 `cat`、`tail` 直接查看消息内容，无需额外工具
3. 持久化：进程重启后消息仍在文件中，不会丢失
4. 简化教学：文件系统是每个开发者都熟悉的概念，降低理解门槛

**Q2（深挖）**：JSONL 文件作为消息队列有什么局限性？如何改进？
**回答要点**：

1. 并发问题：多个 Agent 同时写同一个文件可能导致数据竞争（可用文件锁 `fcntl.flock` 解决）
2. 性能瓶颈：文件 I/O 在大规模消息下效率低（每秒处理数百条消息后开始下降）
3. 无消息确认机制：读取后清空可能丢失消息（如果处理过程中崩溃）
4. 改进方案：小规模用 JSONL + 文件锁，大规模应迁移到 Redis 队列或消息队列（RabbitMQ/Kafka）

**Q3（实战）**：如何实现 Lead 发送一个任务给队友，并等待结果返回？
**回答要点**：

1. Lead 通过 `bus.send("lead", "teammate_A", task_description, "task")` 发送任务
2. 队友在 Agent 循环中检查 `bus.read_inbox("teammate_A")` 发现新任务
3. 队友执行任务后将结果通过 `bus.send("teammate_A", "lead", result, "task_result")` 返回
4. Lead 在下一轮循环中检查收件箱，读取队友返回的结果
5. 整个过程异步：Lead 发送任务后可继续处理其他事，不阻塞等待

**Q4（边界）**：如果队友 Agent 崩溃了，Lead 如何感知并处理？
**回答要点**：

1. 当前实现中 Lead 无法直接感知队友崩溃（无心跳机制）
2. 改进方案一：实现心跳协议，队友定期发送 `heartbeat` 消息，超时未收到认定为崩溃
3. 改进方案二：为任务设置超时时间，超时未完成则重新分配
4. 改进方案三：任务结果持久化到文件系统，新队友启动后可恢复未完成的任务
5. 生产环境建议：使用 Supervisor 或 Kubernetes 管理 Agent 进程，自动重启崩溃的 Agent

## 参考引用

- 需要了解子 Agent 的隔离执行参见 [子 Agent](../02-Planning-Control（规划与控制）/06-子Agent（Subagent）.md)
- 需要掌握团队通信协议参见 [团队协议](../05-Multi-Agent-Platform（多Agent平台）/14-团队协议（Team%20Protocols）.md)
- 需要理解自主 Agent 的空闲轮询参见 [自主 Agent](../05-Multi-Agent-Platform（多Agent平台）/15-自主Agent（Autonomous%20Agent）.md)
- 需要了解 Harness 整体架构参见 [Agent Harness（基础设施层）](../05-Multi-Agent-Platform（多Agent平台）/01-Agent%20Harness（基础设施层）.md)
- 需要了解该机制在 Claude Code 中的工程实现参见 [Claude 使用指南](../../Project/工具/09-Claude使用指南.md)