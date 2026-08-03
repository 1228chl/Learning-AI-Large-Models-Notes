---
author: "XunZong"
created: "2026-07-19"
tags: ["AI-Agent", "Harness", "提示词工程"]
aliases: ["System Prompt Assembly", "系统提示词组装", "动态提示词", "Prompt Sections"]
---

# 系统提示词组装（System Prompt Assembly）

## 定义

系统提示词组装是一种将硬编码的 SYSTEM 字符串拆分为独立段落（Section）的动态构建机制。每个 Section 按主题独立维护，运行时根据真实状态（如文件是否存在、工具是否启用）按需拼接，并通过缓存避免重复组装。

$$
\text{System Prompt} = \sum_{\text{section} \in \text{active}} \text{section\_content}
$$


## 问题描述

System Prompt 包含了模型行为的所有约束和指导：工具定义、权限规则、技能知识、记忆内容……手动维护这个庞大字符串，容易遗漏、冲突、重复。

更糟糕的是，这些内容来自不同来源——内置规则、加载的技能、记忆系统提取的信息——需要一种机制在运行时动态组装 System Prompt，按需注入、自动合并、去重排序。

### 核心代码

```python
# 提示词段落定义（按主题拆分，独立维护）
PROMPT_SECTIONS = {
    "identity": "你是一个编程 agent。直接行动，不要解释。",
    "tools": "可用工具: bash、read_file、write_file。",
    "workspace": f"工作目录: {WORKDIR}",
    "memory": "相关记忆会在可用时注入到下方。",
}

def assemble_system_prompt(context: dict) -> str:
    # 始终加载的段落
    sections = [
        PROMPT_SECTIONS["identity"],
        PROMPT_SECTIONS["tools"],
        PROMPT_SECTIONS["workspace"],
    ]
    # 按需加载的段落（基于真实状态判断）
    memories = context.get("memories", "")
    if memories:
        sections.append(f"相关记忆:\n{memories}")
    return "\n\n".join(sections)

def get_system_prompt(context: dict) -> str:
    # 缓存：相同上下文返回相同结果
    key = json.dumps(context, sort_keys=True, ensure_ascii=False, default=str)
    if key == _last_context_key and _last_prompt:
        return _last_prompt  # 缓存命中
    _last_context_key = key
    _last_prompt = assemble_system_prompt(context)
    return _last_prompt
```

- `PROMPT_SECTIONS`：按主题拆分的提示词段落字典，每个段落独立维护
- `context`：运行时上下文，包含记忆、技能等动态信息
- `json.dumps`：确定性序列化，将 context 转换为唯一的缓存 key
- `_last_context_key` + `_last_prompt`：缓存上一轮的组装结果，避免重复 API 调用

## Section 类型对比

| 类型 | 加载策略 | 内容示例 | 变化频率 |
|:-----|:---------|:---------|:---------|
| identity | 始终加载 | 角色定义、行为准则 | 从不变化 |
| tools | 始终加载 | 可用工具列表 | 会话启动时确定 |
| workspace | 始终加载 | 工作目录路径 | 会话启动时确定 |
| memory | 有记忆文件时加载 | 用户偏好、项目事实 | 每轮可能变化 |
| skills | 有技能注册时加载 | 技能目录列表 | 会话启动时确定 |
| context | 有上下文时加载 | 时间、会话信息 | 每轮变化 |

## 直观理解

系统提示词组装就像一个"三明治制作台"——面包（identity、tools、workspace）是每次都有的基础部分，而生菜、番茄、芝士（memory、skills、context）是根据顾客需求（真实状态）按需添加的配料。使用缓存就像一个"记住上次搭配"的配方卡，同样的需求不用重新想。

## Agent 工程应用场景

| 应用场景 | 动态内容 | 说明 |
|:---------|:---------|:-----|
| 多项目切换 | 切换 workspace | 不同工作目录自动切换不同的 System Prompt |
| 记忆注入 | 有记忆时加载 | 有 `.memory/MEMORY.md` 文件时自动注入记忆 |
| 技能注册 | 有技能时加载 | `skills/` 目录非空时注入技能目录列表 |
| 工具启用 | 有工具时加载 | 根据当前启用的工具动态更新 tools section |

## 面试追问

**Q1（基础）**：System Prompt 为什么要分段维护？直接写一个长字符串有什么问题？
**回答要点**：

1. 可维护性：每个段落独立修改，不影响其他段落，降低维护成本
2. 条件加载：只有在需要时才加载某些段落，避免不必要的 Token 消耗
3. 可测试性：每个段落可独立测试效果，快速定位问题段落
4. 可组合性：不同场景（如编程、写作、数据分析）可组合不同的段落集合

**Q2（深挖）**：组装缓存使用 `json.dumps(context)` 作为 key，context 中的哪些变化会导致缓存失效？
**回答要点**：

1. memory 内容变化：新提取的记忆被注入，context 中的 memories 字段变化
2. session 状态变化：如轮次计数器、已执行工具数等
3. 工作目录变化：如果切换了工作目录，workspace section 变化
4. 工具变化：MCP 工具连接或断开，tools section 变化
5. 关键设计：`sort_keys=True` 确保相同内容生成的 key 相同，不受字段顺序影响

**Q3（实战）**：如何实现一个"实时时钟"Section——让 Agent 知道当前时间，但又不想每轮都重新组装？
**回答要点**：

1. 将时间信息放在"始终加载"段落中，但每轮更新 context 中的时间字段
2. 缓存策略：时间字段变化导致缓存 key 变化，自动触发重新组装
3. 或者将时间作为独立工具（如 `get_current_time`）而非 System Prompt 的一部分
4. 更优方案：在 UserPromptSubmit Hook 中注入时间，而非放在 System Prompt 中

**Q4（边界）**：如果某个 Section 非常长（如完整的技能目录或项目规范），全部注入 System Prompt 会怎样？
**回答要点**：

1. 长 Section 会占用大量上下文窗口，挤占对话和工具结果的空间
2. 解决方案：采用两级加载，System Prompt 中只放目录/摘要（~100 tokens），完整内容按需加载
3. 自动截断：超过阈值的 Section 自动截断，末尾加 `[内容被截断，可使用 load_skill 加载完整内容]`
4. 评估优先级：identity 和 tools 优先级最高，context 和 memory 优先级较低，优先被截断

## 参考引用

- 需要了解记忆系统注入到 System Prompt 的方式参见 [记忆系统](../03-Memory-Management（记忆管理）/11-记忆系统（Memory%20System）.md)
- 需要理解技能加载中的两级注入参见 [上下文压缩管线](../03-Memory-Management（记忆管理）/07-上下文压缩管线（Context%20Compression）.md)
- 需要掌握 Agent 循环中 System Prompt 的使用参见 [Agent 循环](../01-Tools-Execution（工具与执行）/02-Agent循环（Agent%20Loop）.md)
- 需要了解提示词工程核心原则参见 [提示词工程核心原则](../基础/06-提示词工程核心原则.md)
- 需要了解该机制在 Claude Code 中的工程实现参见 [Claude 使用指南](../../Project/工具/09-Claude使用指南.md)