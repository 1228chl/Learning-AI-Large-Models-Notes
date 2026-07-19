---
author: "XunZong"
created: "2026-07-19"
tags: ["AI-Agent", "Harness", "知识管理"]
aliases: ["Skill Loading", "技能加载", "两级注入", "SKILL.md"]
---

# 技能加载系统（Skill Loading）

## 定义

技能加载系统是一种两级按需知识注入机制。第一层在启动时将所有技能的目录（名称 + 一行描述）注入 SYSTEM prompt（约 100 tokens），第二层在 Agent 调用 `load_skill` 时通过 tool_result 返回完整 SKILL.md 内容（约 2000 tokens）。

$$
\text{Skill Loading} = \text{L1: 目录（SYSTEM 注入）} + \text{L2: 内容（按需 load\_skill）}
$$

### 核心代码

```python
# 第一层：启动时扫描 skills/ 目录，构建技能注册表
SKILL_REGISTRY: dict[str, dict] = {}

def _parse_frontmatter(text: str) -> tuple[dict, str]:
    """解析 SKILL.md 中的 YAML frontmatter。"""
    if not text.startswith("---"):
        return {}, text
    parts = text.split("---", 2)
    if len(parts) < 3:
        return {}, text
    meta = yaml.safe_load(parts[1]) or {}
    return meta, parts[2].strip()

def _scan_skills():
    """扫描 skills/ 目录，构建注册表。"""
    for d in sorted(SKILLS_DIR.iterdir()):
        if not d.is_dir():
            continue
        manifest = d / "SKILL.md"
        if manifest.exists():
            raw = manifest.read_text()
            meta, body = _parse_frontmatter(raw)
            name = meta.get("name", d.name)
            desc = meta.get("description", raw.split("\n")[0].lstrip("#").strip())
            SKILL_REGISTRY[name] = {"name": name, "description": desc, "content": raw}

# 第二层：构建含目录的 SYSTEM prompt
def build_system() -> str:
    catalog = list_skills()  # 名称 + 一行描述，约 100 tokens
    return (
        f"可用技能：\n{catalog}\n"
        "如需完整细节，请使用 load_skill 加载。"
    )

# 运行时按需加载完整内容
def load_skill(name: str) -> str:
    """通过注册表查找，返回完整 SKILL.md 内容。"""
    skill = SKILL_REGISTRY.get(name)
    if not skill:
        return f"Skill not found: {name}"
    return skill["content"]  # 约 2000 tokens
```

## 两级加载对比

| 层级 | 内容 | 成本 | 注入方式 | 时机 |
|:-----|:-----|:-----|:---------|:-----|
| L1: 目录 | 技能名称 + 一行描述 | ~100 tokens/技能 | SYSTEM prompt 常驻 | 启动时一次 |
| L2: 内容 | 完整 SKILL.md（含 YAML frontmatter） | ~2000 tokens/技能 | tool_result 返回 | Agent 调用 `load_skill` 时 |

## SKILL.md 格式

```
---
name: "code-review"
description: "审查代码变更，查找 bug 和改进机会"
---

# Code Review Skill

审查代码时的检查清单：
1. 逻辑正确性
2. 边界条件
3. 安全漏洞
4. 性能问题
```

## 直观理解

技能加载就像一本"工具书目录"——L1 是目录页（"code-review：代码审查，查找 bug"），放在桌面随时查看；L2 是具体章节的内容（完整检查清单），需要时再去翻。这样既让桌面不杂乱，又能在需要时找到完整信息。

## Agent 工程应用场景

| 应用场景 | 实现方式 | 说明 |
|:---------|:---------|:-----|
| 代码审查 | 加载 code-review 技能 | 让 Agent 获得代码审查的完整检查清单 |
| MCP 构建 | 加载 mcp-builder 技能 | 提供 MCP Server 的构建指南 |
| PDF 处理 | 加载 pdf 技能 | 提供 PDF 解析和处理的最佳实践 |

## 面试追问

**Q1（基础）**：技能加载的两级设计解决了什么问题？为什么不分一级全部注入？
**回答要点**：

1. 全部注入的 token 成本高（10 个技能 × 2000 tokens = 20000 tokens），浪费上下文空间
2. 大多数技能在单次会话中不需要，按需加载更高效
3. 两级设计：目录（低成本）始终在 SYSTEM prompt 中，让 Agent 知道"有什么可用"
4. 内容（高成本）通过 `load_skill` 按需加载，用多少花多少

**Q2（深挖）**：SKILL_REGISTRY 为什么用 `dict` 注册表而不是直接读文件？安全性考虑是什么？
**回答要点**：

1. 注册表是启动时扫描构建的，`load_skill` 通过注册表查找，不走文件路径
2. 直接读文件存在路径穿越风险（`load_skill("../../etc/passwd")` 可能读取敏感文件）
3. 注册表只包含合法技能名称，`dict.get()` 不存在则返回错误，天然安全
4. 同时注册表查找比文件 I/O 更快

**Q3（实战）**：如何实现一个不依赖 `pyyaml` 的 frontmatter 解析器？
**回答要点**：

1. 检查文本是否以 `---` 开头
2. 用 `text.split("---", 2)` 分割为 [前导空, 元数据, 正文]
3. 对元数据部分逐行解析，每行按 `key: value` 格式解析
4. 处理引号（`strip('"').strip("'")`）和空值

**Q4（边界）**：如果 skills/ 目录中有 100 个技能，两级加载设计还适用吗？
**回答要点**：

1. L1 目录会膨胀到 ~10000 tokens，占用大量 SYSTEM prompt 空间
2. 改进方案：对技能做分类，SYSTEM 中只注入分类名称，Agent 先选分类再选技能
3. 或使用"最近使用"缓存：在 SYSTEM 中只注入常用技能的目录，其余按需搜索
4. 极端情况下，需要引入技能搜索工具 `search_skills(keyword)` 替代全量目录

## 参考引用

- 需要了解系统提示词组装中的技能注入参见 [系统提示词组装](./12-系统提示词组装（System%20Prompt%20Assembly）.md)
- 需要理解上下文压缩与技能加载的配合参见 [上下文压缩管线](./07-上下文压缩管线（Context%20Compression）.md)
- 需要掌握工具分发系统参见 [工具分发系统](./03-工具分发系统（Tool%20Dispatch）.md)
- 需要了解 Harness 整体设计参见 [Agent Harness（基础设施层）](./01-Agent%20Harness（基础设施层）.md)
- 需要了解该机制在 Claude Code 中的工程实现参见 [Claude 使用指南](../../工程实践/工具/09-Claude使用指南.md)