---
author: "XunZong"
created: "2026-07-19"
tags: ["AI-Agent", "Harness", "上下文管理"]
aliases: ["Context Compression", "上下文压缩", "压缩管线", "Compact"]
---

# 上下文压缩管线（Context Compression）

## 定义

上下文压缩管线是一种多层级的 Token 管理策略，按照从廉价到昂贵的顺序依次执行四种压缩方法，在保持对话连续性的前提下将上下文控制在模型限制内。核心原则是**先做便宜的，再做贵的**。

$$
\text{Compression Pipeline} = \text{L3: Budget} \rightarrow \text{L1: Snip} \rightarrow \text{L2: Micro} \rightarrow \text{L4: LLM Summary}
$$

### 四层压缩管线

```python
# 在 LLM 调用前运行压缩管线（按成本从低到高排序）
messages[:] = tool_result_budget(messages)    # L3: 超大结果持久化到磁盘
messages[:] = snip_compact(messages)          # L1: 裁剪中间部分消息
messages[:] = micro_compact(messages)         # L2: 旧结果替换为占位符

# 如果仍超过阈值 → 使用 LLM 摘要（最贵）
if estimate_size(messages) > CONTEXT_LIMIT:
    messages[:] = compact_history(messages)   # L4: LLM 生成摘要替换全部历史
```


## 问题描述

长对话中，消息数组不断膨胀：用户输入、模型思考、工具调用、执行结果……每轮循环都在追加。当上下文窗口接近上限时，模型开始“遗忘”早期内容——用户的需求、已经完成的步骤、关键决策。

简单截断最旧的消息会丢失重要信息，而全部保留又超出 token 限制。需要一套策略性的压缩管线，按优先级决定保留什么、丢弃什么、摘要什么。

## 四层压缩对比

| 层级 | 方法 | 成本 | 触发条件 | 关键参数 |
|:-----|:-----|:-----|:---------|:---------|
| L1: snip_compact | 保留头尾消息，裁剪中间 | 0 API 调用 | `len(messages) > 50` | 保留头尾各 3 条，中间插入 `[snipped N messages]` |
| L2: micro_compact | 用占位符替换旧 tool_result | 0 API 调用 | tool_result 数 > 3 | 保留最近 3 条，更早的大于 120 字符的替换 |
| L3: tool_result_budget | 超大结果持久化到磁盘 | 0 API 调用 | 总大小 > 200000 字符 | 持久化阈值 30000 字符，输出到 `.task_outputs/tool-results/` |
| L4: compact_history | LLM 生成摘要替换全部历史 | 1 API 调用 | `estimate_size > 50000` 字符 | `CONTEXT_LIMIT=50000`，transcript 写到 `.transcripts/` |
| 紧急: reactive_compact | 应急压缩 | 1 API 调用 | API 抛出 `prompt_too_long` | 保留末尾 5 条消息，其余 LLM 摘要 |

## 直观理解

压缩管线就像整理房间：先把大件家具搬到仓库（L3 磁盘持久化，放在最前面做），再扔掉明显没用的垃圾（L1 裁剪中间消息），然后把旧杂志堆到角落（L2 占位符替换），最后如果房间还是太小，就找设计师重新规划空间（L4 LLM 摘要）。

## Agent 工程应用场景

| 应用场景 | 对应层级 | 说明 |
|:---------|:---------|:-----|
| 长对话管理 | L1 + L2 | 每轮自动执行，保持对话可管理 |
| 超大文件处理 | L3 | 读取大文件的结果持久化，只保留前 1000 字符预览 |
| 持续工作会话 | L4 | 数小时的长对话，定期摘要压缩 |
| API 紧急处理 | reactive_compact | 模型上下文窗口超限时的最后手段 |

## 面试追问

**Q1（基础）**：上下文压缩管线的四层分别是什么？执行顺序是什么？
**回答要点**：

1. L3 tool_result_budget：超大 tool_result 持久化到磁盘——零 API 成本（最先执行）
2. L1 snip_compact：保留头尾消息，裁剪中间部分——零 API 成本
3. L2 micro_compact：用短占位符替换旧的 tool_result——零 API 成本
4. L4 compact_history：用 LLM 生成摘要——1 次 API 调用（最贵）
5. 执行顺序为 L3→L1→L2→L4，而非按层级编号顺序。L3 放在最前面是因为需要先持久化超大结果，再裁剪和替换

**Q2（深挖）**：所有压缩方法都有信息损失。如何在不同压缩层级间做权衡？
**回答要点**：

1. L1 裁剪中间消息：损失的是"中间推理过程"，保留"当前任务进展"和"最终结果"
2. L2 占位符替换：损失的是"旧工具输出的具体内容"，但上下文中的分析结论仍然保留
3. L3 磁盘持久化：损失的是"大结果的全量内容"，但模型可通过 read_file 随时读取
4. L4 LLM 摘要：损失最大，但可在 `.transcripts/` 中保留备份供恢复
5. 核心原则：保留"当前任务所需的最少上下文"，而非"全部历史"

**Q3（实战）**：如何判断当前上下文是否应该触发压缩？
**回答要点**：

1. 维护一个 `estimate_size(messages)` 函数，用 `len(str(msgs))` 估算当前消息列表的字符数
2. 设置 `CONTEXT_LIMIT` 阈值（源码中为 50000 字符）
3. 如果 `estimate_size() > CONTEXT_LIMIT`，触发压缩管线
4. 更精细的方案：根据本轮 tool_result 的增长量预测是否需要压缩

**Q4（边界）**：如果在压缩后模型仍然需要之前被压缩掉的信息，怎么办？
**回答要点**：

1. L3 持久化的超大结果可通过 read_file 直接读取恢复
2. L4 压缩前的完整对话应备份到 `.transcripts/` 目录，必要时可恢复
3. 模型可以在压缩后的摘要中看到"之前分析过什么"，需要具体细节时请求恢复
4. 终极方案：采用滑动窗口压缩，保留最近 N 轮完整消息，只压缩更早的历史

## 参考引用

- 需要理解 Agent 循环中压缩的触发时机参见 [Agent 循环](../01-Tools-Execution（工具与执行）/02-Agent循环（Agent%20Loop）.md)
- 需要了解记忆系统与压缩管线的配合参见 [记忆系统](../03-Memory-Management（记忆管理）/11-记忆系统（Memory%20System）.md)
- 需要掌握错误恢复中的 reactive_compact 参见 [错误恢复与重试](../02-Planning-Control（规划与控制）/08-错误恢复与重试（Error%20Recovery）.md)
- 需要理解 Harness 整体设计参见 [Agent Harness（基础设施层）](../05-Multi-Agent-Platform（多Agent平台）/01-Agent%20Harness（基础设施层）.md)
- 需要了解系统提示词组装中的上下文管理参见 [系统提示词组装](../02-Planning-Control（规划与控制）/12-系统提示词组装（System%20Prompt%20Assembly）.md)
- 需要了解该机制在 Claude Code 中的工程实现参见 [Claude 使用指南](../../Tools/工具/09-Claude使用指南.md)