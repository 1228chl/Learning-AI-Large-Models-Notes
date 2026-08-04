---
author: "XunZong"
created: "2026-07-19"
tags: ["AI-Agent", "Harness", "安全"]
aliases: ["Permission System", "权限系统", "安全流水线"]
---

# 权限系统（Permission System）

## 定义

权限系统是 Agent Harness 中防止模型执行危险操作的多层安全流水线。在工具执行前插入三道关卡，逐级过滤：先检查硬性拒绝列表，再匹配上下文敏感规则，最后在必要时请求用户确认。

$$
\text{Security Pipeline} = \text{Deny List} \rightarrow \text{Rule Matching} \rightarrow \text{User Confirmation}
$$


## 问题描述

Agent 可以执行任意命令——rm -rf / 删除系统文件、sudo 提权操作、curl 外传数据——模型的一个错误决策就可能导致严重后果。没有权限系统，Agent 就像一把没有保险栓的枪。

但简单的“全部禁止”也不可行——Agent 需要 git push 提交代码、需要 pip install 安装依赖。权限系统需要在“安全”和“可用”之间找到平衡：自动拦截已知危险操作，同时允许合法的开发行为。

### 核心代码

```python
def check_permission(block) -> bool:
    # 关卡 1：硬性拒绝列表（零容忍）
    if block.name == "bash":
        reason = check_deny_list(block.input.get("command", ""))
        if reason:
            return False  # 直接拒绝，无需用户确认

    # 关卡 2：上下文敏感规则匹配
    reason = check_rules(block.name, block.input)
    if reason:
        # 关卡 3：用户确认
        decision = ask_user(block.name, block.input, reason)
        if decision == "deny":
            return False
    return True
```

- `check_deny_list`：匹配永远禁止的命令模式，如 `rm -rf /`、`sudo`、`mkfs`、`dd if=`、`> /dev/sda` 等
- `check_rules`：评估上下文敏感的规则，如"写文件到工作区外"、"读取敏感文件"
- `ask_user`：向用户展示操作详情并等待确认，是最后一道防线

## 三层关卡对比

| 关卡 | 过滤方式 | 示例 | 自动化程度 | 绕过方式 |
|:-----|:---------|:-----|:-----------|:---------|
| Deny List | 字符串模式匹配 | `rm -rf /`、`sudo`、`mkfs` | 全自动 | 模型可尝试绕过（如 `rm -rf --no-preserve-root /`） |
| Rule Matching | 上下文函数判断 | 写文件到工作区外、读取 `.env` | 全自动 | 规则需覆盖全面 |
| User Confirmation | 交互式提示 | "确认执行 bash 命令: rm -rf /tmp/xxx?" | 手动 | 用户需警惕社会工程 |

## 直观理解

权限系统像机场安检的三道闸门：第一道刷身份证（Deny List 拦截已知危险品），第二道行李扫描（Rule Matching 检测可疑行为），第三道人工开箱检查（User Confirmation 最终确认）。每一层都在拦截前一层的漏网之鱼。

## Agent 工程应用场景

| 应用场景 | 实现方式 | 说明 |
|:---------|:---------|:-----|
| 防止系统破坏 | Deny List 拦截 `rm -rf /`、`sudo` 等 | 保护宿主机安全 |
| 数据隔离 | Rule 检查文件路径是否在工作区内 | 防止读取敏感系统文件或写入非法位置 |
| 高危操作确认 | 写文件到系统目录时弹窗确认 | 用户可阻止模型做出的危险决策 |
| 审计日志 | 所有权限检查结果记录到日志 | 安全审计和事后追溯 |

## 面试追问

**Q1（基础）**：权限系统的三层关卡分别是做什么的？为什么要三层？
**回答要点**：

1. 第一层 Deny List：匹配已知危险命令模式，全自动拦截，零容忍
2. 第二层 Rule Matching：上下文敏感的规则判断，如路径是否越界
3. 第三层 User Confirmation：人工确认，兜底所有自动规则无法覆盖的情况
4. 三层设计体现深度防御原则：单层可能被绕过，多层叠加显著提高安全性

**Q2（深挖）**：Deny List 模式匹配有什么局限性？如何改进？
**回答要点**：

1. 简单字符串匹配容易被绕过（如 `rm -rf /` 可改为 `rm -rf --no-preserve-root /`）
2. 正则匹配可以提升，但仍有盲区（如 base64 编码的命令）
3. 改进方式：对 bash 命令做 AST 解析，提取实际执行的命令和参数后再匹配
4. 终极方案：对 Agent 执行沙箱化（容器或虚拟机），从系统层面隔离

**Q3（实战）**：如何实现一个防止路径穿越的 `safe_path` 函数？
**回答要点**：

1. 用 `os.path.abspath()` 或 `pathlib.Path.resolve()` 将路径解析为绝对路径
2. 用 `os.path.commonpath()` 比较解析后的路径是否在工作区前缀内
3. 处理符号链接：用 `Path.resolve()` 解析真实路径后再检查
4. 示例：`Path(path).resolve().relative_to(Path(WORKDIR).resolve())` 成功则安全，失败则越界

**Q4（边界）**：权限系统如何平衡安全性和用户体验？频繁的确认弹窗会怎样？
**回答要点**：

1. 频繁弹窗导致"确认疲劳"——用户可能会不经思考地点击确认，使权限系统失效
2. 优化策略：对已确认的相似操作加入临时白名单（会话内有效）
3. 分级策略：低风险操作自动放行（如读文件），中风险匹配规则，高风险才弹窗
4. 学习策略：记录用户历史确认模式，逐渐减少弹窗频率

## 参考引用

- 需要了解 Hooks 如何实现权限检查的插拔参见 [Hooks 系统](../01-Tools-Execution（工具与执行）/05-Hooks系统（Hooks%20System）.md)
- 需要理解工具分发与权限的关系参见 [工具分发系统](../01-Tools-Execution（工具与执行）/03-工具分发系统（Tool%20Dispatch）.md)
- 需要掌握 Agent 循环整体流程参见 [Agent 循环](../01-Tools-Execution（工具与执行）/02-Agent循环（Agent%20Loop）.md)
- 需要了解生产部署中的权限管理参见 [LLM API 部署](../../Tools/部署/07-LLM%20API调用与ChatBot.md)