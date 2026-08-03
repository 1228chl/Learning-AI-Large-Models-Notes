---
author: "XunZong"
created: "2026-07-19"
tags: ["AI-Agent", "Harness", "工具系统"]
aliases: ["Tool Dispatch", "工具分发", "TOOL_HANDLERS", "工具注册"]
---

# 工具分发系统（Tool Dispatch）

## 定义

工具分发系统通过 `TOOL_HANDLERS` 字典映射实现从工具名到执行函数的动态分发，替代硬编码的 `if-else` 调用链。每个工具只需注册名称和处理函数，Agent 循环通过查表即可调用任意工具。

$$
\text{dispatch}(\text{name}, \text{input}) = \text{handlers[name]}(\text{**input})
$$


## 问题描述

Agent 循环中只有 bash 一个工具。读文件要 cat，写文件要 echo "..." > file.py，改文件要 sed。模型想的是“读这个文件”，却要拼出 cat path/to/file——多了一层翻译，浪费 token，还容易拼错。

给 Agent 加一个工具，就需要改循环体。工具多了，循环体里全是 if-elif-else 的分发逻辑，代码越来越臃肿，新增工具要改核心代码，不符合开闭原则。

### 核心代码

```python
# 工具注册表：工具名 → 处理函数的映射
TOOL_HANDLERS = {
    "bash": run_bash,
    "read_file": run_read,
    "write_file": run_write,
    "edit_file": run_edit,
    "glob": run_glob,
}

# 工具执行：查表分发，一行代码完成
handler = TOOL_HANDLERS.get(block.name)
output = handler(**block.input) if handler else f"未知工具: {block.name}"
```

- `block.name`：模型选择的工具名称，与 TOOLS 定义中的 name 字段对应
- `**block.input`：Python 解包操作符，将工具参数字典展开为函数关键字参数
- `handler`：查表获取的函数引用，不存在时返回错误提示而非抛出异常

## 核心工具表

| 工具 | 功能 | 关键参数 | 安全措施 |
|:-----|:-----|:---------|:---------|
| bash | 执行 shell 命令 | `command`（字符串） | 危险命令过滤、超时控制 |
| read_file | 读取文件 | `path`、`limit`（可选行数） | `safe_path` 防止路径穿越 |
| write_file | 写入文件 | `path`、`content` | 权限检查，防止覆盖系统文件 |
| edit_file | 精确替换文本 | `path`、`old_text`、`new_text` | 唯一性校验，防误替换 |
| glob | 查找文件 | `pattern` | 限制搜索范围到工作区 |

## 工具 Schema 定义（API 层）

每个工具在注册时还需定义 JSON Schema 供模型理解参数格式：

```python
TOOLS = [
    {
        "name": "bash",
        "description": "执行 shell 命令",
        "input_schema": {
            "type": "object",
            "properties": {
                "command": {"type": "string", "description": "要执行的命令"}
            },
            "required": ["command"]
        }
    },
    # ... 其他工具
]
```

## 直观理解

工具分发类似于一个"电话总机"——模型拨号（工具名），总机查表找到对应的接线员（处理函数），把通话内容（参数）转接过去。新增工具只需在总机表上登记一个新号码。

## Agent 工程应用场景

| 应用场景 | 实现方式 | 说明 |
|:---------|:---------|:-----|
| 新增工具 | 添加处理函数 + 注册到 TOOL_HANDLERS + 定义 schema | 无需修改循环体代码 |
| 工具重命名 | 修改 TOOL_HANDLERS 的 key 和 schema 中的 name | 后端函数无需改动 |
| 动态工具池 | 运行时合并内置工具和 MCP 工具 | `assemble_tool_pool` 函数组装 |
| 工具降级 | 返回错误提示而非抛出异常 | 模型可自行决定重试或换工具 |

## 面试追问

**Q1（基础）**：TOOL_HANDLERS 字典映射相比 `if-else` 链有什么优势？
**回答要点**：

1. 开闭原则：新增工具只需添加映射条目，无需修改循环体
2. 可组合性：工具注册表可被序列化、动态修改或合并（如 MCP 工具池）
3. 测试便利：可以单独测试每个 handler 函数，无需启动完整 Agent 循环
4. 错误处理统一：`dict.get()` 加默认值，优雅处理未知工具名

**Q2（深挖）**：`**block.input` 解包在实际使用中有什么潜在问题？
**回答要点**：

1. 参数不匹配：如果 schema 定义和实际 handler 函数签名不一致，解包会抛出 `TypeError`
2. 额外参数：模型可能传 schema 中未定义的参数，需在 handler 中添加 `**kwargs` 兜底
3. 类型安全：解包不保证类型，需要在 handler 内做类型校验和转换
4. 安全风险：恶意构造的 input 可能包含预期外的参数，需做参数白名单校验

**Q3（实战）**：如何实现一个动态工具池，让运行时可以增删工具？
**回答要点**：

1. 用可变容器（如 `dict` 或 `class`）存储 TOOL_HANDLERS，支持运行时修改
2. 实现 `register_tool(name, handler, schema)` 和 `unregister_tool(name)` 接口
3. 在 Agent 循环的每次迭代前重新组装 TOOLS schema 列表
4. 对 MCP 等外部工具，通过 `assemble_tool_pool` 合并内置工具和动态发现的工具

**Q4（边界）**：当工具数量达到几十甚至上百个时，分发系统会面临什么问题？
**回答要点**：

1. Schema 膨胀：每个工具的 schema 定义都塞入 API 调用，token 消耗随工具数线性增长
2. 模型选择困难：工具太多时模型可能选错或犹豫不决，需引入工具分层或分类
3. 命名冲突：多来源工具（如不同 MCP server）可能有同名工具，需命名空间隔离
4. 性能瓶颈：线性查表在大规模时可用 Trie 树或前缀匹配优化

## 参考引用

- 需要理解 Agent 循环整体架构参见 [Agent 循环](../01-Tools-Execution（工具与执行）/02-Agent循环（Agent%20Loop）.md)
- 需要了解权限系统对工具执行的拦截参见 [权限系统](../01-Tools-Execution（工具与执行）/04-权限系统（Permission%20System）.md)
- 需要理解 Hooks 对工具执行的前后扩展参见 [Hooks 系统](../01-Tools-Execution（工具与执行）/05-Hooks系统（Hooks%20System）.md)
- 需要了解 MCP 动态工具池参见 [MCP 插件集成](../05-Multi-Agent-Platform（多Agent平台）/10-MCP插件集成（MCP%20Plugin）.md)
- 需要理解 Agent 定义参见 [Agent 定义与核心公式](../基础/01-Agent定义与核心公式.md)
- 需要了解该机制在 Claude Code 中的工程实现参见 [Claude 使用指南](../../Project/工具/09-Claude使用指南.md)