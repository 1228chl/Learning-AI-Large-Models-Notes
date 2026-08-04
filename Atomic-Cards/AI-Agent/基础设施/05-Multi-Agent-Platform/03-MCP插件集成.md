---
author: "XunZong"
created: "2026-07-19"
tags: ["AI-Agent", "Harness", "可扩展性"]
aliases: ["MCP Plugin", "MCP插件", "MCP协议", "Model Context Protocol"]
---

# MCP 插件集成（MCP Plugin）

## 定义

MCP（Model Context Protocol）是一种标准协议，定义 Agent 发现和调用外部工具的方式。Agent 不需要知道工具是谁写的、部署在哪里，只需通过 `tools/list` 发现可用工具，通过 `tools/call` 调用具体工具。MCP 工具和内置工具在运行时组装成统一的工具池，同等对待。

$$
\text{MCP Integration} = \text{tools/list(discovery)} + \text{tools/call(invocation)} + \text{assemble\_tool\_pool(assembly)}
$$

- discovery：发现
- invocation：调用
- assembly：组装

## 问题描述

外部服务（GitHub、数据库、Slack、浏览器）不能标准地接入 Agent 的工具系统。每个服务都需要定制集成代码，接入成本高、维护负担重。

MCP（Model Context Protocol）提供了一套标准化的工具发现和调用协议——外部服务通过 MCP Server 暴露自身能力，Agent 通过 MCP Client 自动发现和调用这些工具。就像 USB 协议让各种设备即插即用，MCP 让各种服务即插即用。

### 核心架构

```python
# 运行时组装工具池：内置工具 + MCP 工具
def assemble_tool_pool() -> dict:
    tool_pool = {}
    # 1. 加载内置工具
    for name, handler in BUILTIN_HANDLERS.items():
        tool_pool[f"builtin__{name}"] = handler
    # 2. 加载 MCP 工具
    for server in connected_mcp_servers:
        tools = server.list_tools()  # tools/list 发现
        for tool in tools:
            # 命名空间前缀避免工具名冲突
            tool_pool[f"mcp__{server.name}__{tool.name}"] = tool.handler
    return tool_pool
```

## MCP 核心概念

| 概念 | 作用 | 实现方式 |
|:-----|:-----|:---------|
| MCPClient | Agent 端连接器，负责发现和调用 MCP 工具 | 连接 MCP Server，调用 `tools/list` + `tools/call` |
| MCP Server | 外部服务，实现 MCP 协议接口 | 暴露 `tools/list` 和 `tools/call` 两个端点 |
| `assemble_tool_pool` | 工具池组装函数 | 合并内置工具字典和 MCP 工具字典 |
| 命名空间 | 工具名冲突避免 | `mcp__server__tool` 格式，如 `mcp__database__query` |

## 工具发现与调用流程

```
Agent 请求工具调用
  → assemble_tool_pool 查找工具池
  → 命名空间解析
    → builtin__xxx → 内置处理函数
    → mcp__server__xxx → MCPClient.tools_call(server, tool, input)
  → 返回结果
```

## 直观理解

MCP 就像 USB 协议——外部设备只要符合 USB 标准（实现了 MCP 协议），插上就能用（`tools/list` 发现设备功能），无需为每个设备单独写驱动。Agent 通过 USB 集线器（`assemble_tool_pool`）统一管理所有接入的设备。

## Agent 工程应用场景

| 应用场景 | MCP 工具示例 | 说明 |
|:---------|:-------------|:-----|
| 数据库查询 | `mcp__database__query` | Agent 可直接查询数据库，无需人工写 SQL |
| 文件存储 | `mcp__storage__upload` | Agent 可将结果上传到云存储 |
| 外部 API | `mcp__github__create_pr` | Agent 可直接操作 GitHub 创建 PR |
| 自定义工具 | 任意 MCP Server | 第三方开发者只需实现 MCP 协议即可扩展 Agent 能力 |

## 面试追问

**Q1（基础）**：MCP 协议的核心接口是什么？Agent 如何发现和调用 MCP 工具？
**回答要点**：

1. 核心接口是 `tools/list`（发现工具列表）和 `tools/call`（调用具体工具）
2. Agent 启动时通过 `tools/list` 获取所有可用工具的名称、描述和参数 schema
3. 调用时通过 `tools/call` 传入工具名和参数，获取执行结果
4. Agent 不需要关心工具的实现细节，只需要知道"有什么工具"和"怎么调用"

**Q2（深挖）**：为什么需要 `mcp__server__tool` 这样的命名空间？如果两个 MCP Server 提供了同名工具怎么办？
**回答要点**：

1. 命名空间解决工具名冲突：不同 Server 可能有同名工具（如 `search`）
2. 格式 `mcp__server__tool` 确保全局唯一，Agent 通过完整名称区分
3. 如果有多个不同 Server 的 `search` 工具，Agent 可根据 Server 名称选择使用哪个
4. 更高级的方案：根据工具描述让模型自动选择最合适的同名工具

**Q3（实战）**：如何实现一个简单的 MCP Server 供 Agent 调用？
**回答要点**：

1. 实现 `tools/list` 端点，返回工具列表（每个工具包含 name、description、input_schema）
2. 实现 `tools/call` 端点，接收工具名和参数，执行对应操作并返回结果
3. 用轻量级 Web 框架（如 Flask/FastAPI）或 stdio 协议暴露两个端点
4. 在 Agent 端通过 MCPClient 连接 Server，通过 `connect_mcp(server_url)` 注册到工具池

**Q4（边界）**：MCP 工具和内置工具在安全性上有什么不同？如何统一管理？
**回答要点**：

1. MCP 工具来自外部服务，不可信程度更高，需要额外的安全校验
2. 内置工具在进程内执行，权限系统可直接控制（如 `safe_path`、`check_permission`）
3. MCP 工具通过远程调用执行，权限系统只能控制"是否调用"，无法控制"调用后做什么"
4. 解决方案：MCP Server 自身应实现权限控制 + Agent 端对 MCP 工具调用加独立审批流程

## 参考引用

- 需要理解工具分发系统的基础参见 [工具分发系统](../01-Tools-Execution/02-工具分发系统.md)
- 需要了解权限系统对 MCP 工具的拦截参见 [权限系统](../01-Tools-Execution/03-权限系统.md)
- 需要掌握 Agent 团队中 MCP 工具的共享参见 [消息总线与 Agent 团队](../05-Multi-Agent-Platform/02-消息总线与Agent团队.md)
- 需要了解 Harness 整体架构参见 [Agent Harness（基础设施层）](../05-Multi-Agent-Platform/01-Agent-Harness基础设施层.md)
- 需要了解该机制在 Claude Code 中的工程实现参见 [Claude 使用指南](../../Tools/工具/09-Claude使用指南.md)