
---
name: token-saver
description: deepseek-v4-flash 极致省 token 模式——零 agent 零 Workflow，一切直接工具调用，每步自问"这一下值多少 token"
---

# Token Saver Skill（deepseek-v4-flash 极严模式）

## 铁律

**禁止一切 agent 和 Workflow。** 无论任务多复杂，只能用 Read / Write / Edit / Bash 四个直接工具。

## 为什么这么严

deepseek-v4-flash 按 input + output 双向计费。一次 agent 调用 = 数万 token 固定开销（系统提示 + 工具定义 + 指令上下文）。13 个 agent = 300 万 token 不是 bug 是必然结果。

**直接 Write 一张 200 行的卡片 ≈ 2000 token。用 agent 建同一张卡 ≈ 20000+ token。10 倍差距。**

## 规则

### 规则 1：每次调用前自问

**"这一下值多少 token？"**

| 动作 | Token 成本 | 值得做？ |
|:-----|:-----------|:---------|
| Read 一个文件 | ~文件行数 | ✅ 必要 |
| Grep 搜索关键词 | ~结果行数 | ✅ 必要 |
| Write 写完整文件 | ~文件内容 | ✅ 一次性 |
| Edit 替换一段 | ~10-50 token | ✅ 必须做 |
| **启动 agent** | **~5000-20000+ token 框架费** | **❌ 永不** |
| **启动 Workflow** | **~50000+ token** | **❌ 永不** |
| 为确认而 Read 刚写的文件 | ~同一文件重复读 | **❌ 信任工具** |
| 输出 Markdown 总结/解释 | 不等 | **❌ 省掉** |

### 规则 2：没有 agent，只有直接工具

```
任务 ──→ 用 Read/Grep 收集信息 ──→ 用 Write/Edit 动手 ──→ 用 Bash 跑 Python 做验证
           ↑ 没有 agent        ↑ 没有 agent         ↑ 没有 agent
```

- **创建卡片** → Read 源文件 → Write 完整写入。不调 agent，不分多次编辑
- **修改文件** → Read 目标区域 → Edit 精确替换。不调 agent
- **批量检查** → Bash 执行 Python 脚本。不调 agent
- **语义任务**（判断变量标注、重写段落）→ 你直接在对话中完成，不外包给 agent

### 规则 3：一次性收集，不重复读

```bash
# 一次 bash 收集全部所需信息
grep -rn "pattern" src/ && cat target.py && ls data/

# 而不是：
# grep "pattern" src/        ← 第1次调用
# cat target.py              ← 第2次调用
```

### 规则 4：信任工具，不 Verify

- `Edit` 执行成功 = 文件已修改，**不再 Read 确认**
- `Write` 执行成功 = 文件已创建，**不再 Read 确认**
- `Bash` 脚本执行成功 = 任务已完成，**不再跑第二次**

### 规则 5：零废话输出

- 不做任务总结
- 不做 Markdown 报告
- 不做"已完成"宣告（工具成功即信号）
- 不输出建议、优化、下一步提示
- 对话中只输出必要的内容（问题澄清、决策、工具调用）

### 规则 6：Python 执行规范（Windows）

```
解释器：G:\Software\Python\python.exe
禁止：python3 / py / py.exe / 双引号 -c
```

### 规则 7：Workflow 适用的唯一场景

当且仅当用户明确要求"使用 Workflow"或"ultracode"时，才可以打破规则 1。除此之外，任何情况下不调用 Workflow。
