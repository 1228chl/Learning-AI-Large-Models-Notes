---
author: "XunZong"
created: "2026-07-08"
tags: ["工程实践", "Claude", "LLM"]
aliases: ["Claude", "Anthropic", "Claude Code", "Claude API"]
---

# Claude 使用指南

## 定义

Claude 是 Anthropic 开发的大语言模型（LLM）系列，以**长上下文**、**安全对齐**和**推理能力**著称。用户在开发工作中主要通过三种方式使用 Claude：

| 使用方式 | 说明 | 适用场景 |
|:---------|:-----|:---------|
| **Claude Code（CLI）** | 终端中的交互式 AI 编程助手 | 代码编写、调试、重构、项目分析 |
| **Claude API** | 通过 HTTP 调用模型能力 | 集成到自己的应用、自动化流程 |
| **Claude 网页/App** | 对话式 AI 助手（claude.ai） | 知识问答、文档撰写、头脑风暴 |

## Claude Code（CLI 工具）

Claude Code 是 Anthropic 官方的终端交互式 AI 编程助手。以下完整列出所有命令和配置项。

### 安装

```bash
npm install -g @anthropic-ai/claude-code          # Node.js 18+，全局安装

# 验证安装
claude --version                                   # 输出版本号，确认安装成功
```

### 启动参数详解（完整）

```bash
# ════════════════════════════════════════
# 1. 模型选择
# ════════════════════════════════════════
claude --model claude-sonnet-4-20250514           # 指定模型 ID。不指定则用当前账号可用的最智能模型
claude --model claude-haiku-4-20251001            # Haiku 最快最便宜，适合简单快速任务

# ════════════════════════════════════════
# 2. 执行模式
# ════════════════════════════════════════
claude                                            # 交互模式（默认）。启动后进入持续对话，自动感知项目文件结构和 git 上下文
claude -p "解释这个项目的架构"                      # 一次性指令模式。执行后立即退出，stdout 输出回复内容，适合 CI/CD 脚本
claude -p "重构这个函数" --print                   # 交互 + 一次性混合：用户可继续追问，同时将初始回复打印到 stdout
claude --resume LAST                              # 恢复最近一次意外退出的会话（断开/崩溃后重新附着到原会话）
claude --resume <session-id>                      # 恢复指定会话 ID 的历史会话

# ════════════════════════════════════════
# 3. 系统提示词 & 预置指令
# ════════════════════════════════════════
claude --prompt "你是一个 Rust 安全专家"           # 设置 system prompt（角色和行为规则），覆写默认 prompt
claude --prompt "用 Python 3.11+ 风格"            # 可以使用项目特定的编码规范作为提示词

# ════════════════════════════════════════
# 4. 输出控制
# ════════════════════════════════════════
claude --output-format json                       # 输出格式设为 JSON，便于程序化解析
claude --output-format markdown                   # 默认 markdown 格式输出，适合阅读
claude -p "列出文件树" --quiet                    # 静默模式：只输出回复本身，不打印 banner/提示等元信息

# ════════════════════════════════════════
# 5. 调试与配置
# ════════════════════════════════════════
claude --verbose                                  # 详细日志模式：输出每个工具调用的参数和结果，便于调试
claude --verbose                                  # 查看 Claude 每一步在想什么、做了什么工具调用
claude --max-requests 50                          # 限制本次会话最大工具调用次数（默认无限制）
claude --no-tools                                 # 禁止使用任何工具（仅文本对话），纯 LLM 聊天模式
claude --no-tools                                 # 纯聊天模式，不读写文件不执行命令

# ════════════════════════════════════════
# 6. 权限与安全
# ════════════════════════════════════════
claude --allowed-tools "Read,Edit,Bash"           # 只允许指定工具，其余禁用。逗号分隔，大小写不敏感
claude --dangerously-skip-permissions             # 跳过所有权限确认弹窗。仅适用于可控自动环境（如 CI），日常开发勿用

# 启动时通过 settings.json 设置权限模式：
# 编辑 ~/.claude/settings.json 或项目 .claude/settings.json：
# {
#   "permissions": {
#     "edits": "accept",             # accept edits on：自动接受编辑操作
#     "reads": "accept",             # accept reads on：自动接受读操作
#     "bash": "accept",              # accept bash on：自动接受命令执行
#   }
# }

# ════════════════════════════════════════
# 7. 自动模式（Auto Mode）
# ════════════════════════════════════════
claude --auto                                     # 自动模式：无需逐条确认，Claude 自主执行多步操作
claude -a                                         # --auto 的简写
                                                  # 适用于：已信任的自动化流程、批量处理、CI 场景
                                                  # 注意：与 --dangerously-skip-permissions 不同，
                                                  # auto mode 仍遵循 settings.json 中的权限白名单

# 等价设置（在 settings.json 中）：
# {
#   "permissions": {
#     "tool_calls": "accept" 
#   }
# }

# ════════════════════════════════════════
# 8. 会话与历史
# ════════════════════════════════════════
claude --session-tags "bugfix,api"                # 给本次会话打标签，便于后续搜索和管理
claude 2>&1 | tee claude.log                      # 将完整会话输出同时写入文件和终端（标准 shell 技巧）

# ════════════════════════════════════════
# 9. 监视模式（Watch Mode）
# ════════════════════════════════════════
claude --watch "**/*.py" -p "检查语法错误"        # 监视文件变更，自动执行指令。适合 TDD/持续测试
claude --watch "src/**/*.rs" --debounce-ms 2000   # 防抖间隔 2000ms，避免保存时频繁触发
# 触发条件：git 管理的文件被修改保存后，自动执行 -p 指定的指令
# 典型场景：保存代码后自动运行 lint / 测试 / 代码审查
```

### Slash 命令（会话内指令）

在交互式会话中，以 `/` 开头的命令控制会话行为：

```bash
# ════════════════════════════════════════
# 会话管理
# ════════════════════════════════════════
/clear                          # 清除当前会话的对话历史和上下文窗口，重置状态
                                # 不会清除已加载的 system prompt 和 CLAUDE.md
                                # 类似"新开一页"，清理 token 窗口但保留项目上下文

/compact                        # 将历史对话压缩为摘要，丢弃原始细节
                                # 大幅降低 token 消耗，同时保留关键结论和决策
                                # 上下文窗口快满时的首选操作，推荐长对话中定期使用

/help                           # 显示所有可用 slash 命令和简要说明
                                # 也列出当前会话已加载的技能列表

/init                           # 在当前项目目录生成 CLAUDE.md 配置文件
                                # 该文件包含项目描述和 Claude 行为指令，会被自动加载到每次会话中

/reset                          # 完全重置：清除会话历史 + 重新加载 CLAUDE.md 和所有技能

/permissions                    # 查看当前权限模式状态
/permissions edits accept       # accept edits on：后续编辑操作自动接受
/permissions reads accept       # accept reads on：后续读操作自动接受
/permissions reset              # 恢复默认（每步都确认）

# ════════════════════════════════════════
# 技能（Skills）
# ════════════════════════════════════════
/skill-name                     # 调用已加载的技能。技能是预定义的专用指令集
                                # 如 /code-review 加载代码审查技能，/design 加载设计技能
                                # 可用技能列表通过 /help 查看

# ════════════════════════════════════════
# 文件操作（快捷方式）
# ════════════════════════════════════════
/open src/main.py               # 在会话中打开指定文件，让 Claude 读取其内容
                                # 等价于用 Read 工具读取文件

/goto main.py:42                # 跳转到指定文件的指定行，让 Claude 定位到具体代码位置
                                # 用于修复 bug 或向 Claude 指明确切修改位置

/edit src/main.py:42 "添加错误处理"  # 直接在指定文件的指定行位置发起编辑指令
                                     # 绕过"先读再改"的两步流程

# ════════════════════════════════════════
# Bug 修复快捷指令
# ════════════════════════════════════════
/bug                             # 启用专门用于调试和修复 bug 的模式
                                 # Claude 会优先使用调试工具并给出最简修复方案

# ════════════════════════════════════════
# 上下文指令
# ════════════════════════════════════════
/fetch https://example.com/docs  # 获取网页内容并放入对话上下文
                                  # 等价于 WebFetch 工具，让 Claude 能基于网页内容回答

/search 注意力机制                # 模糊搜索当前项目中的文件内容（等价于 Grep 工具调用）

/file 训练流程                   # 搜索文件名匹配的项目文件（等价于 Glob 工具调用）
```

### 配置文件（CLAUDE.md）

项目根目录下的 `CLAUDE.md` 是项目级别的配置文件，每次启动时自动加载：

```markdown
# CLAUDE.md — 项目行为配置

## 项目描述
这是一个 AI 知识库项目，包含 181 张原子卡片。

## 用户偏好
- Python 3.11+，类型注解必须完整
- 代码注释使用中文
- 变量名使用 snake_case

## 常用指令
- 测试: `pytest tests/`
- Lint: `ruff check .`
```

支持以下配置规则：
- `# /项目描述`：顶层标题 `#` 开头的内容作为项目级 system prompt
- `# /用户偏好`：记录用户的编码习惯和偏好，每次会话自动遵循
- `# /常用指令`：列出常用命令，Claude 在需要执行操作时优先使用
- `# /工具配置`：可以用 `project.tools` 字段限制允许的工具范围

### 退出与恢复

```bash
# 在交互会话中
/exit                           # 正常退出会话
Ctrl+C                          # 中断当前生成，返回提示符（按两次完全退出）
Ctrl+D                          # 直接退出会话

# 恢复会话（意外断开后）
claude --resume LAST            # 恢复最近一次会话
claude --resume <session-id>    # 恢复指定会话

# 会话持久化
# 会话被压缩后下次 --resume 时仍可恢复
# 注意：/clear 会清空可恢复的历史，之后无法 resume
```

### 效率优化建议

```bash
# 1. 用一次性指令完成简单任务
claude -p "给这个函数添加类型注解"  # 比启动交互模式更轻量

# 2. 批量机械操作优先用脚本而非 Claude
# ❌ 让 Claude 替换 180 个文件中的同一模式（高 token 消耗）
# ✅ 写一个 Python 脚本用 glob + 正则替换（零 token 消耗）
python -c "
import glob, re
for f in glob.glob('**/*.md', recursive=True):
    content = open(f).read()
    content = content.replace('旧文本', '新文本')
    open(f, 'w').write(content)
"

# 3. 大文件分段处理
# 超大文件（>10万行）分多次读取或先 grep 筛选关键段

# 4. 使用 /compact 控制 token 消耗
# 长对话中定期使用 /compact 压缩历史，避免上下文窗口溢出
```

## Claude API

```python
from anthropic import Anthropic

# 初始化客户端
client = Anthropic(api_key="sk-ant-xxx")  # API Key 从 console.anthropic.com 获取

# 基础文本生成
response = client.messages.create(
    model="claude-sonnet-4-20250514",  # 模型标识符，控制能力和成本
    max_tokens=1024,                    # 最大输出 token 数
    temperature=0.7,                    # 0=确定，1=随机
    system="你是资深AI工程师",          # system prompt：设定角色和行为规则
    messages=[
        {"role": "user", "content": "解释什么是反向传播"}
    ]
)
print(response.content[0].text)

# 流式输出（Streaming）：逐 token 推送，首 token 延迟更低
with client.messages.stream(
    model="claude-sonnet-4-20250514",
    max_tokens=1024,
    messages=[{"role": "user", "content": "写一首诗"}]
) as stream:
    for chunk in stream.text_stream:
        print(chunk, end="", flush=True)  # 打字机效果
```

## Claude 模型对比

| 模型 | 特点 | 适用场景 |
|:----|:-----|:---------|
| **Claude Fable 5 / Mythos 5** | 最强大，推理能力顶级 | 复杂代码生成、数学推理、深度分析 |
| **Claude Opus 4.8** | 强推理 + 高准确性 | 代码审查、文档撰写、复杂问答 |
| **Claude Sonnet 5** | 速度与能力平衡 | 日常编码、通用对话、快速响应 |
| **Claude Haiku 4.5** | 最快、最便宜 | 简单任务、分类、摘要、大批量处理 |

## 使用技巧

| 技巧 | 说明 |
|:-----|:------|
| **清晰的系统提示词** | 设定角色、行为边界、输出格式，极大影响回复质量 |
| **分步骤指令** | 复杂任务拆解为多步指令，引导模型逐步推理 |
| **补充上下文** | 提供相关代码、错误信息、背景知识，帮助模型理解 |
| **反问澄清** | Claude 会在需求不明确时主动反问，这是优势而非不足 |
| **善用工具调用** | 读文件、搜索、执行命令——让 Claude 拿到真实信息，减少幻觉 |
| **用 Workflow 做大任务** | 批量处理大量文件时使用 Workflow 编排而非逐一手动操作 |

## ML 中的 Claude

| 应用场景 | 使用方式 | 说明 |
|:---------|:---------|:------|
| **代码生成与重构** | Claude Code 交互 | 理解项目结构，生成符合代码风格的高质量代码 |
| **Bug 修复** | 粘贴错误栈 + 上下文 | Claude 定位根因并给出修复方案 |
| **代码审查** | 提交代码 diff | 从正确性、安全性、性能维度审查变更 |
| **文档撰写** | 提供框架和要点 | 生成 API 文档、README、技术方案设计 |
| **知识问答/学习** | 网页对话 | 充当私教，逐步解析复杂概念 |
| **脚本自动化** | API 调用编程 | 将 Claude 集成到自己的自动化流水线中 |

## 面试追问

**Q1（基础）**：Claude Code 启动后如何感知项目结构？它和传统代码补全工具有何不同？
**回答要点**：

1. Claude Code 自动读取当前项目的文件系统结构和 git 上下文，通过 Glob/Grep/Read 等工具按需获取文件内容，而非一次性加载全部
2. 传统代码补全工具（如 Copilot）以 IDE 插件形式存在，聚焦单行/单函数补全；Claude Code 是终端交互式代理，能理解跨文件依赖并执行多步骤操作
3. Claude Code 能主动调用 Shell、读写文件、搜索代码、联网，是一个可以独立完成开发任务的代理而非编辑器插件

**Q2（深挖）**：Claude 的长上下文能力（如 200K tokens）是如何影响它的使用方式的？有哪些限制？
**回答要点**：

1. 长上下文使 Claude 能一次性处理整个项目代码库或整本技术书籍，无需分多次传入
2. 但上下文越长，"大海捞针"式的信息提取准确率会下降——中间部分的内容可能被忽略
3. 使用策略：关键信息放在开头或结尾（System Prompt 和最新消息优先级最高），中间部分用检索/压缩降低干扰

**Q3（实战）**：你在使用 Claude Code 进行批量代码修改时，如何控制 Token 消耗避免成本失控？
**回答要点**：

1. 纯机械性替换（统一格式、追加固定文本、正则替换）使用本地 Python 脚本完成，零 Token 消耗
2. 需要语义理解的任务才交给 Claude，且先用 grep 筛选出需要修改的文件，避免全部文件无差别遍历
3. 多项修改合并为一次遍历完成，不重复加载同一批文件；长对话中定期使用 /compact 压缩历史

**Q4（边界）**：Claude 等大模型生成的代码可能有哪些潜在风险？如何保证代码质量？
**回答要点**：

1. 幻觉风险：模型可能生成不存在的 API、算法或库，尤其对新发布或小众的框架容易出错
2. 安全风险：生成的代码可能包含 SQL 注入、XSS 等漏洞，或建议不安全的加密方案
3. 缓解措施：对生成代码做单元测试和静态分析（SonarQube、Bandit 等），关键安全逻辑需人工审查；对不熟悉的 API 验证官方文档

## 参考引用
- 需要理解 LLM API 调用与聊天机器人开发的相关知识，参见 [LLM API调用与ChatBot](../部署/05-LLM API调用与ChatBot.md)
- 需要理解 Ollama 与本地 LLM 部署的相关知识，参见 [Ollama与本地LLM部署](../部署/04-Ollama与本地LLM部署.md)
- 需要理解 Prompt Engineering 核心原则的相关知识，参见 [提示词工程核心原则](../../AI-Agent/基础/03-提示词工程核心原则.md)
- 需要理解 Agent 定义与核心公式的相关知识，参见 [Agent定义与核心公式](../../AI-Agent/基础/01-Agent定义与核心公式.md)
