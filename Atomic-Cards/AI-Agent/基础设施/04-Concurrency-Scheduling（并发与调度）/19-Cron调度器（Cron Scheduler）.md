---
author: "XunZong"
created: "2026-07-19"
tags: ["AI-Agent", "Harness", "定时任务"]
aliases: ["Cron Scheduler", "Cron调度器", "定时任务", "调度器"]
---

# Cron 调度器（Cron Scheduler）

## 定义

Cron 调度器是一种基于独立 daemon 线程和队列的定时任务机制。调度线程每秒轮询时间，匹配五段式 cron 表达式，到点时将任务塞入队列，Agent 空闲时从队列消费并注入到对话中。

$$
\text{Cron System} = \text{Scheduler Thread} + \text{Cron Queue} + \text{Queue Processor} + \text{Consumer}
$$

### 四层模型

```
Scheduler（daemon 线程，每秒轮询）
    → Queue（cron_queue，调度线程写入）
    → Queue Processor（Agent 空闲时消费）
    → Consumer（agent_loop 将任务注入 messages）
```


## 问题描述

定期任务需要人为记住和执行——“每天早上检查 CI 状态”、“每小时同步数据”、“每周清理日志”。这些重复劳动消耗用户的注意力和时间，而且容易遗忘。

Cron 调度器让 Harness 自身管理定时任务：注册一个 cron 表达式 + 任务描述，Harness 在指定时间自动触发，无需用户介入。

### 核心数据结构

```python
@dataclass
class CronJob:
    id: str          # "cron_{random:06d}"
    cron: str        # "0 9 * * *"（五段式 cron 表达式）
    prompt: str      # 触发时注入的消息内容
    recurring: bool  # True=循环, False=一次
    durable: bool    # True=持久化到磁盘, False=仅会话

# 调度器线程：每秒轮询，匹配到点任务
def cron_scheduler_loop():
    while True:
        time.sleep(1)
        now = datetime.now()
        minute_marker = now.strftime("%Y-%m-%d %H:%M")
        for job in list(scheduled_jobs.values()):
            if cron_matches(job.cron, now):
                if _last_fired.get(job.id) != minute_marker:
                    cron_queue.append(job)       # 写入队列
                    _last_fired[job.id] = minute_marker
                    if not job.recurring:
                        scheduled_jobs.pop(job.id, None)  # 一次性任务自动移除
```

## 交互流程

```
Agent: schedule_cron(cron="0 9 * * *", prompt="日常检查")
  → 注册 CronJob → 调度线程监测 → 到点触发
  → cron_queue 收到任务 → agent_loop 消费
  → 注入 [Scheduled] 日常检查 到 messages
  → Agent 看到并处理
```

## 直观理解

Cron 调度器像一个"定时闹钟"——你设置好时间（cron 表达式）和闹铃内容（prompt），一个独立的计时器线程（调度线程）每秒检查时间，到点了就把闹铃塞进"待响列表"（队列），Agent 空闲时看到闹铃就响起来（注入对话）。

## Agent 工程应用场景

| 应用场景 | cron 表达式 | 说明 |
|:---------|:------------|:-----|
| 每日报告 | `0 9 * * *` | 每天早上 9 点生成项目状态报告 |
| 定时检查 | `*/30 * * * *` | 每 30 分钟检查一次后台任务状态 |
| 一次性提醒 | `0 14 * * *`（非 recurring） | 下午 2 点提醒一次，不重复 |
| 工作日任务 | `0 10 * * 1-5` | 工作日每天上午 10 点执行 |

## 面试追问

**Q1（基础）**：Cron 调度器的四层模型分别是什么？为什么需要队列解耦？
**回答要点**：

1. Scheduler：daemon 线程，每秒轮询时间，匹配 cron 表达式
2. Queue：`cron_queue` 列表，调度线程写入，Agent 消费
3. Queue Processor：Agent 空闲时检查队列，有任务时启动 Agent 循环
4. Consumer：Agent 循环从队列取出任务，注入到 messages 中
5. 队列解耦使调度器不阻塞 Agent 循环，调度器专注时间判断，Agent 专注任务执行

**Q2（深挖）**：cron 表达式匹配中，DOM（日）和 DOW（星期）的 OR 语义是什么？
**回答要点**：

1. 标准 cron 中，当 DOM 和 DOW 都明确指定（非 `*`）时，两者是 OR 关系
2. 即 `30 4 1 * 5` 表示"每月 1 日 4:30"或"每周五 4:30"（满足任一即触发）
3. 如果 DOM 或 DOW 之一是 `*`（未约束），则只按另一个匹配
4. 实现逻辑：`if dom_unconstrained and dow_unconstrained: return True`

**Q3（实战）**：如何实现 durable 持久化，让 cron 任务跨重启不丢失？
**回答要点**：

1. 持久化文件：`.scheduled_tasks.json`，存储所有 durable 任务的 `CronJob` 数据
2. 每次注册/取消 durable 任务时调用 `save_durable_jobs()` 写入文件
3. 启动时调用 `load_durable_jobs()` 从文件恢复任务
4. 恢复时验证 cron 表达式合法性，无效的跳过并记录警告

**Q4（边界）**：如果调度线程中的某个 cron 任务抛出异常，会怎样？
**回答要点**：

1. 单个任务异常不应导致调度线程崩溃，否则所有定时任务都会停止
2. 实现上用 `try/except` 包裹每个任务的执行，异常只影响该任务
3. 异常记录日志后继续执行下一任务，调度线程保持运行
4. 生产环境应添加告警机制，多次异常的任务自动禁用

## 参考引用

- 需要了解后台任务与 Cron 调度的区别参见 [后台任务系统](../04-Concurrency-Scheduling（并发与调度）/18-后台任务系统（Background%20Tasks）.md)
- 需要掌握消息总线中的队列机制参见 [消息总线与 Agent 团队](../05-Multi-Agent-Platform（多Agent平台）/09-消息总线与Agent团队（MessageBus）.md)
- 需要理解自主 Agent 的轮询机制参见 [自主 Agent](../05-Multi-Agent-Platform（多Agent平台）/15-自主Agent（Autonomous%20Agent）.md)
- 需要了解 Harness 整体设计参见 [Agent Harness（基础设施层）](../05-Multi-Agent-Platform（多Agent平台）/01-Agent%20Harness（基础设施层）.md)
- 需要了解该机制在 Claude Code 中的工程实现参见 [Claude 使用指南](../../工程实践/工具/09-Claude使用指南.md)