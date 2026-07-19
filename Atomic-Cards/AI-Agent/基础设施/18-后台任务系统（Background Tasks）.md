---
author: "XunZong"
created: "2026-07-19"
tags: ["AI-Agent", "Harness", "并发"]
aliases: ["Background Tasks", "后台任务", "异步执行", "task_notification"]
---

# 后台任务系统（Background Tasks）

## 定义

后台任务系统是一种基于 `threading.Thread` 的异步执行机制，将慢操作（如 `pip install`、`docker build`）放入 daemon 线程执行，Agent 可以继续处理其他任务，完成后通过 `<task_notification>` 格式注入结果通知。

$$
\text{Background Task} = \text{Daemon Thread} + \text{背景 ID} + \text{Notification}
$$

### 核心代码

```python
_bg_counter = 0
background_tasks: dict[str, dict] = {}   # bg_id → {tool_use_id, command, status}
background_results: dict[str, str] = {}   # bg_id → output
background_lock = threading.Lock()

def start_background_task(block) -> str:
    """在 daemon 线程中运行工具，返回后台任务 ID。"""
    global _bg_counter
    _bg_counter += 1
    bg_id = f"bg_{_bg_counter:04d}"

    def worker():
        result = execute_tool(block)  # 在后台线程中执行
        with background_lock:
            background_tasks[bg_id]["status"] = "completed"
            background_results[bg_id] = result

    with background_lock:
        background_tasks[bg_id] = {"tool_use_id": block.id, "command": "...", "status": "running"}
    threading.Thread(target=worker, daemon=True).start()
    return bg_id  # 立即返回 ID，不等待结果

def collect_background_results() -> list[str]:
    """收集已完成的后台任务，包装为通知。"""
    with background_lock:
        ready_ids = [bid for bid, t in background_tasks.items() if t["status"] == "completed"]
    notifications = []
    for bg_id in ready_ids:
        with background_lock:
            task = background_tasks.pop(bg_id)
            output = background_results.pop(bg_id, "")
        notifications.append(
            f"<task_notification>\n"
            f"  <task_id>{bg_id}</task_id>\n"
            f"  <status>completed</status>\n"
            f"  <summary>{output[:200]}</summary>\n"
            f"</task_notification>")
    return notifications
```

## 两阶段调度决策

| 触发方式 | 判断逻辑 | 优先级 | 说明 |
|:---------|:---------|:-------|:-----|
| 显式请求 | `tool_input.get("run_in_background")` 为 True | 高 | 模型主动指定异步执行 |
| 启发式兜底 | `is_slow_operation()` 判断命令是否包含 `install`、`build`、`test` 等关键词 | 低 | 模型未指定时的自动判断 |

## 通知格式

```xml
<task_notification>
  <task_id>bg_0001</task_id>
  <status>completed</status>
  <command>pip install transformers</command>
  <summary>... (输出前 200 字符) ...</summary>
</task_notification>
```

## 直观理解

后台任务像"点外卖"——你下单后（派发任务），不用在厨房门口等着，可以继续做其他事。外卖到了（任务完成），外卖员通知你取餐（注入通知）。对外卖送达前的多次询问，你只会说"还没到"（占位结果）。

## Agent 工程应用场景

| 应用场景 | 触发方式 | 说明 |
|:---------|:---------|:-----|
| 安装依赖 | 启发式（`install` 关键词） | `pip install` 放入后台，Agent 继续写代码 |
| 编译代码 | 启发式（`build`、`compile` 关键词） | 编译过程后台执行，Agent 做其他工作 |
| 长时间运行测试 | 显式请求（`run_in_background=true`） | Agent 主动指定 `pytest` 后台执行 |
| 等待外部服务 | 显式请求 | 等待 API 响应时不阻塞 Agent 循环 |

## 面试追问

**Q1（基础）**：后台任务系统的核心流程是什么？`bg_id` 有什么作用？
**回答要点**：

1. 判断是否后台执行：模型显式请求或启发式匹配到慢操作关键词
2. 派发后台任务：生成 `bg_id`，创建 daemon 线程执行，返回占位结果
3. 收集结果：`collect_background_results` 检查已完成的任务
4. 注入通知：将结果包装为 `<task_notification>` 格式，追加到下一轮 user 消息
5. `bg_id` 唯一标识每次后台任务，用于关联通知和原始调用

**Q2（深挖）**：为什么用 `threading.Lock` 保护 `background_tasks` 和 `background_results`？
**回答要点**：

1. 主线程（agent_loop）和后台线程（worker）同时访问这两个字典
2. 没有锁的话，`worker` 写入结果时主线程可能正在读取，导致数据竞争
3. `with background_lock` 确保同一时刻只有一个线程访问字典
4. `pop` 操作也是原子的——取出已完成任务的同时移出字典，避免重复处理

**Q3（实战）**：如何实现 `is_slow_operation` 启发式判断？什么命令算"慢操作"？
**回答要点**：

1. 只对 bash 工具做判断，文件操作通常很快不需要后台
2. 检查命令中是否包含特定关键词：`install`、`build`、`test`、`deploy`、`compile`
3. 具体匹配：`docker build`、`pip install`、`npm install`、`cargo build`、`pytest`、`make`
4. 匹配方式：`any(kw in cmd.lower() for kw in slow_keywords)`

**Q4（边界）**：后台任务执行过程中如果 Agent 循环结束了，后台线程会怎样？
**回答要点**：

1. 后台线程设置为 `daemon=True`，主进程退出时 daemon 线程自动终止
2. 这意味着未完成的后台任务结果会丢失
3. 改进方案：在 Stop hooks 中检查是否有运行中的后台任务，等待它们完成或记录警告
4. 生产级方案：后台任务持久化到文件系统，即使进程崩溃也能恢复

## 参考引用

- 需要了解子 Agent 与后台任务的区别参见 [子 Agent](./06-子Agent（Subagent）.md)
- 需要掌握消息总线中的通知机制参见 [消息总线与 Agent 团队](./09-消息总线与Agent团队（MessageBus）.md)
- 需要理解 Cron 调度器与后台任务的关系参见 [Cron 调度器](./19-Cron调度器（Cron%20Scheduler）.md)
- 需要了解 Harness 整体设计参见 [Agent Harness（基础设施层）](./01-Agent%20Harness（基础设施层）.md)
- 需要了解该机制在 Claude Code 中的工程实现参见 [Claude 使用指南](../../工程实践/工具/09-Claude使用指南.md)