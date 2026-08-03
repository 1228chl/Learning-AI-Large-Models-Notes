---
author: "XunZong"
created: "2026-07-19"
tags: ["AI-Agent", "Harness", "任务规划"]
aliases: ["TodoWrite", "任务规划", "催办提醒", "任务清单"]
---

# TodoWrite 任务规划（TodoWrite）

## 定义

TodoWrite 是 Agent Harness 中实现"先规划再执行"的机制，通过 `todo_write` 工具让模型在动手前先创建任务清单，并通过 `rounds_since_todo` 计数器检测模型是否遗忘规划，连续多轮未更新时注入催办提醒。

$$
\text{TodoWrite} = \text{任务清单} + \text{轮次计数器} + \text{催办提醒}
$$


## 问题描述

长任务（如“重构这个模块”）没有可见的计划——用户不知道 Agent 在做什么、做到哪一步了、还需要多久。Agent 可能在错误的道路上越走越远，用户却无法及时发现和纠正。

需要 Agent 在执行前先输出一份明确的计划（Todo List），每完成一步标记进度。用户可以看到计划、修改计划、在 Agent 偏离方向时及时纠正。

### 核心代码

```python
# 催办提醒：连续 3 轮未更新 todo 就注入提醒
rounds_since_todo = 0

def agent_loop(messages: list):
    global rounds_since_todo
    while True:
        # 每轮开始时检查是否需要催办
        if rounds_since_todo >= 3 and messages:
            messages.append({"role": "user",
                             "content": "<reminder>Update your todos.</reminder>"})
            rounds_since_todo = 0

        # ... LLM 调用 ...

        rounds_since_todo += 1  # 每轮递增
        # ... 工具执行 ...
        if block.name == "todo_write":
            rounds_since_todo = 0  # 调用 todo_write 后重置
```

- `rounds_since_todo`：距上次调用 todo_write 的轮次数，每轮末自动 +1
- `>= 3`：连续 3 轮未更新即触发催办，阈值可调
- `<reminder>Update your todos.</reminder>`：以 user 角色注入的催办消息，模型会看到并响应
- `block.name == "todo_write"`：调用 todo_write 后重置计数器

## 任务状态

| 状态 | 含义 | 显示图标 | 转换条件 |
|:-----|:-----|:---------|:---------|
| `pending` | 待处理 | `[ ]` | 任务创建时的默认状态 |
| `in_progress` | 进行中 | `[▸]` | 开始执行该任务时更新 |
| `completed` | 已完成 | `[✓]` | 任务完成后更新 |

## 数据结构

```python
@dataclass
class TodoItem:
    content: str    # 任务描述，如"安装依赖包"
    status: str     # pending | in_progress | completed
```

## 直观理解

TodoWrite 像一个"项目进度白板"——Agent 动手前先在白板上写下任务步骤，每完成一步就更新状态。如果白板太久没更新，系统会提醒"该更新进度了"。

## Agent 工程应用场景

| 应用场景 | 实现方式 | 说明 |
|:---------|:---------|:-----|
| 多步骤任务规划 | 先调用 todo_write 创建步骤列表 | 引导模型有条理地执行复杂任务 |
| 任务进度跟踪 | 每完成一步就更新对应任务状态 | 用户可实时看到 Agent 的进度 |
| 遗忘恢复 | 连续 3 轮未更新时注入提醒 | 防止模型在复杂任务中偏离规划 |

## 面试追问

**Q1（基础）**：TodoWrite 的催办机制是如何工作的？
**回答要点**：

1. `rounds_since_todo` 计数器每轮末递增，调用 todo_write 时重置为 0
2. 当计数器 >= 3 时，在下一轮开始前注入 `<reminder>Update your todos.</reminder>`
3. 提醒以 user 角色消息注入，Agent 看到后会响应并更新任务清单
4. 阈值 3 轮可配置，不同任务复杂度可能需要不同值

**Q2（深挖）**：为什么选择注入 user 消息而不是直接修改 SYSTEM prompt 来催办？
**回答要点**：

1. user 消息更接近"用户提醒"的自然交互，模型更可能响应
2. SYSTEM prompt 在每轮 LLM 调用前已固定，修改需重新组装且有缓存问题
3. user 消息可携带具体内容（如"你还有 3 个任务未完成"），更灵活
4. 注入 user 消息后模型会看到并响应，行为更可控

**Q3（实战）**：如何实现一个 todo_write 的数据校验函数？
**回答要点**：

1. 检查 `todos` 是否为 list 类型，每个元素是否为 dict
2. 检查每个 dict 是否包含 `content` 和 `status` 字段
3. 检查 `status` 值是否在 `["pending", "in_progress", "completed"]` 中
4. 如果 `todos` 是 JSON 字符串，先用 `json.loads` 解析，失败则用 `ast.literal_eval` 兜底

**Q4（边界）**：如果 Agent 频繁调用 todo_write（每轮都调用），催办机制会怎样？
**回答要点**：

1. 每轮调用 todo_write 都会重置 `rounds_since_todo` 为 0，催办永不触发
2. 这本身不是问题——说明 Agent 在持续更新规划，不需要催办
3. 但如果 Agent 频繁更新但进度停滞（如总是 pending），说明规划有问题
4. 改进方案：增加"进度检查"——如果连续 N 轮没有任务状态变为 completed，也触发提醒

## 参考引用

- 需要理解 Agent 循环中 TodoWrite 的位置参见 [Agent 循环](../01-Tools-Execution（工具与执行）/02-Agent循环（Agent%20Loop）.md)
- 需要了解任务系统与 TodoWrite 的区别参见 [任务系统](../05-Multi-Agent-Platform（多Agent平台）/13-任务系统（Task%20System）.md)
- 需要了解 Hooks 系统如何与 TodoWrite 配合参见 [Hooks 系统](../01-Tools-Execution（工具与执行）/05-Hooks系统（Hooks%20System）.md)
- 需要掌握 Harness 整体设计参见 [Agent Harness（基础设施层）](../05-Multi-Agent-Platform（多Agent平台）/01-Agent%20Harness（基础设施层）.md)
- 需要了解该机制在 Claude Code 中的工程实现参见 [Claude 使用指南](../../Tools/工具/09-Claude使用指南.md)