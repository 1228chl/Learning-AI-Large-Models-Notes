---
author: "XunZong"
created: "2026-07-19"
tags: ["AI-Agent", "Harness", "多Agent", "通信协议"]
aliases: ["Team Protocols", "团队协议", "关机握手", "计划审批", "ProtocolState"]
---

# 团队协议（Team Protocols）

## 定义

团队协议是 Agent 团队中结构化通信的规范，基于 request-response 模式通过 `request_id` 关联请求和响应。主要包含关机握手（shutdown）和计划审批（plan_approval）两种协议，确保 Agent 间的协调有序进行。

$$
\text{Protocol} = \text{request\_id} + \text{type} + \text{sender} + \text{target} + \text{status} + \text{payload}
$$

### 核心数据结构

```python
@dataclass
class ProtocolState:
    request_id: str      # "req_004281"，全局唯一，关联请求和响应
    type: str            # "shutdown" | "plan_approval"
    sender: str          # 发起方 Agent 名
    target: str          # 接收方 Agent 名
    status: str          # pending | approved | rejected
    payload: str         # 计划文本或关机原因
```

## 协议类型对比

| 协议 | 方向 | 触发条件 | 响应行为 | 超时处理 |
|:-----|:-----|:---------|:---------|:---------|
| `shutdown_request/response` | Lead → 队友 | 用户要求关闭 / 会话结束 | 队友完成当前任务后关闭 | 超时后强制关闭 |
| `plan_approval_request/response` | 队友 → Lead | 高风险操作前 | 审批通过则执行，拒绝则调整 | 超时后默认拒绝 |

## 关机握手流程

```
用户请求关闭
  → Lead 发送 shutdown_request 给所有队友（含 request_id）
  → 每个队友收到后：
    1. 标记 "shutdown_pending" 状态
    2. 完成当前工具执行
    3. 发送 shutdown_response（含 request_id）
  → Lead 收到所有队友的响应后：
    → 确认所有队友已关闭
    → 自身关闭
```

## 直观理解

团队协议就像办公室里的"工作交接流程"——关机协议是"我要下班了，把手头工作收尾，然后通知你"；计划审批是"我想执行这个操作，需要你批准"。通过 `request_id` 关联请求和响应，就像在邮件标题上标注"Re: [Request ID]"来追踪对话。

## Agent 工程应用场景

| 应用场景 | 协议类型 | 说明 |
|:---------|:---------|:-----|
| 安全关闭 | shutdown | 确保所有 Agent 保存状态后再退出，不丢失数据 |
| 高风险操作审批 | plan_approval | 写文件、执行可能破坏性的命令前先审批 |
| 协调工作流 | 自定义协议 | 可扩展新协议类型，如任务分配确认、进度同步 |

## 面试追问

**Q1（基础）**：request_id 的作用是什么？为什么能关联请求和响应？
**回答要点**：

1. `request_id` 是全局唯一的标识符，格式为 `req_{6位随机数}`
2. 请求方发送时携带 `request_id`，响应方回复时携带相同的 `request_id`
3. 请求方通过 `request_id` 在 `pending_requests` 字典中查找对应的响应
4. 这种机制允许异步通信——请求方发送后不阻塞，收到响应后匹配

**Q2（深挖）**：shutdown 协议为什么需要握手？直接 kill 线程有什么问题？
**回答要点**：

1. 直接 kill 线程可能导致数据丢失（正在写入的文件不完整）
2. 直接 kill 可能导致资源泄漏（打开的文件描述符、网络连接未关闭）
3. 握手让队友有机会完成当前操作、保存状态、清理资源
4. 如果队友在规定时间内不响应，才使用强制关闭（超时兜底）

**Q3（实战）**：如何实现 plan_approval 协议，让队友在执行高风险操作前先请求审批？
**回答要点**：

1. 队友在 PreToolUse Hook 中检查当前操作是否属于高风险（如写文件、执行 bash）
2. 如果是高风险，通过消息总线向 Lead 发送 `plan_approval_request`
3. Lead 在下一轮循环中读取收件箱，看到审批请求，显示给用户或自动审批
4. Lead 回复 `plan_approval_response`（approved/rejected）
5. 队友收到响应后，批准则继续执行，拒绝则调整方案

**Q4（边界）**：如果 Lead 发送了 shutdown_request 但队友正在执行一个耗时操作，怎么办？
**回答要点**：

1. 队友收到 shutdown_request 后标记 `shutdown_pending` 状态
2. 继续执行当前工具，等待工具执行完成（不中断正在进行的操作）
3. 工具执行完成后，不再开始新的操作，直接发送 shutdown_response
4. 如果工具执行超时（如 30 秒），强制中断并返回当前状态
5. Lead 端设置超时阈值（如 60 秒）：超时未收到响应则强制关闭队友

## 参考引用

- 需要了解消息总线的基础通信机制参见 [消息总线与 Agent 团队](./09-消息总线与Agent团队（MessageBus）.md)
- 需要掌握自主 Agent 的生命周期管理参见 [自主 Agent](./15-自主Agent（Autonomous%20Agent）.md)
- 需要理解权限系统在计划审批中的应用参见 [权限系统](./04-权限系统（Permission%20System）.md)
- 需要了解 Harness 整体架构参见 [Agent Harness（基础设施层）](./01-Agent%20Harness（基础设施层）.md)
- 需要了解该机制在 Claude Code 中的工程实现参见 [Claude 使用指南](../../工程实践/工具/09-Claude使用指南.md)