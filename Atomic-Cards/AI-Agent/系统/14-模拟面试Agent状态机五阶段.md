---
author: "XunZong"
created: "2026-07-30"
tags: ["AI-Agent", "模拟面试", "状态机", "SSE流式", "多轮对话", "LangGraph"]
aliases: ["Mock Interview Agent", "面试状态机", "五阶段对话", "AnswerQuality评估", "摘要压缩"]
---

# 模拟面试 Agent 状态机五阶段

## 定义

模拟面试 Agent 是 EduAgent 中唯一使用**状态机 + SSE 流式**范式的 LangGraph 图。它将面试过程建模为 5 个有序阶段的有限状态机（WARMUP → TECH_BASE → PROJECT → CLOSING → FINISHED），每个阶段有各自的行为规则和推进条件，阶段转换由纯代码逻辑控制（不依赖 LLM 推断）。

核心创新：将"现在到哪一步了"从对话内容中独立出来，由 `check_stage` 节点（零 LLM 调用）根据轮数、题库完成度、回答质量等指标判定阶段推进。整个图只有一个条件分支（正常对话路径 vs 报告生成路径），两条路径最终汇合到 `save_memory` 节点。

## 五阶段状态机

$$ \text{WARMUP} \xrightarrow{\geq 1 \text{ 轮且自我介绍完成}} \text{TECH\_BASE} \xrightarrow{\geq 6 \text{ 轮且 } \geq 8 \text{ 题}} \text{PROJECT} \xrightarrow{\text{项目覆盖完或 } \geq 2 \text{ 轮}} \text{CLOSING} \xrightarrow{\geq 2 \text{ 轮}} \text{FINISHED} $$

| 阶段 | 职责 | 最小轮数 | 最大轮数 | 推进条件 |
|------|------|---------|---------|---------|
| WARMUP | 破冰开场，邀请自我介绍 | 1 | 4 | 学员完成自我介绍 |
| TECH_BASE | 技术知识考察，题库+追问 | 6 | 无硬上限（受总轮数 38 限制） | ≥ 6 轮且已问 ≥ 8 题或题库耗尽 |
| PROJECT | 简历项目深挖 | 2 | 无硬上限 | 所有简历项目深挖完毕或 ≥ 2 轮 |
| CLOSING | 反问收尾，邀请学员提问 | 2 | 无硬上限 | ≥ 2 轮（学员提问 + 面试官作答） |
| FINISHED | 生成五维度报告，持久化 | — | — | 触发终态，不可逆 |

**强制终止**：总轮数 ≥ 38 或学员发送"结束面试" → 直接跳转 FINISHED。

## 直观理解

> 这不是一个"随便聊"的聊天机器人，而是有严格流程的面试官——开场先破冰让你自我介绍（WARMUP），然后进入技术考察环节连续出题和追问（TECH_BASE），接着深挖你简历上的项目经历（PROJECT），最后请你提问并做收尾（CLOSING），全部结束后生成一份五维度评分报告。每一个阶段都有明确的"入场条件"和"出场条件"，就像闯关游戏——没答够题数就不能进入下一关。

## 回答质量评估与追问规则

```python
class AnswerQuality(str, Enum):
    EXCELLENT = "excellent"   # 有技术细节/量化/原理理解
    ADEQUATE  = "adequate"    # 方向对但缺深度
    WEAK      = "weak"        # 方向偏差或太表面
    NO_ANSWER = "no_answer"   # 明说不知道或为空
```

| 质量标签 | TECH_BASE 追问策略 | PROJECT 追问策略 |
|---------|-------------------|-----------------|
| EXCELLENT | 追问（最多 2 次），深挖原理 | 追问实现细节 |
| ADEQUATE | 换下一题 | 追问补充 |
| WEAK | 提示思路后换题 | 提示后换下一个项目 |
| NO_ANSWER | 提示思路后换题 | 提示后换下一个项目 |

评估通过 Think Tool 实现：LLM 先调用 `think()` 内部推理（学员不可见），再调用 `final_answer()` 输出质量标签，避免直接分类的草率判断。

## 图拓扑：唯一条件分支

```python
START → load_context → check_stage ─┬→ evaluate_answer → generate_response ─┐
                                    │                                       │
                                    └→ generate_report → save_report ───────┘
                                                                             │
                                                          save_memory ←──────┘
                                                                             │
                                                                            END
```

`check_stage` 是唯一的条件分支点（纯代码逻辑，不调 LLM）：读取 `current_stage`，若为 FINISHED 走报告路径，否则走正常对话路径。两条路径最终汇合到 `save_memory`，确保摘要持久化逻辑只写一次。

## 摘要压缩机制

长对话（20-40 轮）超出 LLM 上下文窗口，`save_memory` 节点每 10 轮触发一次摘要压缩：

```python
def _maybe_compress_summary(state: InterviewState):
    if len(state["dialogue_history"]) % 10 == 0:
        recent = state["dialogue_history"][-10:]              # 最近 10 轮
        existing_summary = state.get("summary", "")            # 已有摘要
        # LLM 将"已有摘要 + 最近 10 轮"压缩为新摘要
        new_summary = llm.invoke(f"将以下对话摘要整合：\n已有：{existing_summary}\n新增：{recent}")
        state["summary"] = new_summary
        state["dialogue_history"] = state["dialogue_history"][-20:]  # 只保留最近 20 轮
```

## AI/ML 工程应用场景

| 应用场景 | 状态机模式映射 | SSE 流式输出 |
|---------|-------------|-----------|
| 多轮客服对话 | 问题收集 → 诊断 → 方案 → 确认 → 结束 | 客服回复逐字输出 |
| 医疗问诊 | 主诉 → 问诊 → 检查建议 → 诊断 → 处方 | 实时输出问诊进度 |
| 在线教育辅导 | 摸底 → 讲解 → 练习 → 纠错 → 总结 | 辅导内容实时呈现 |
| 销售对话 | 开场 → 需求挖掘 → 方案演示 → 异议处理 → 成交 | 自然对话流式体验 |

## 面试追问

**Q1（基础）**：模拟面试 Agent 的 5 个阶段分别做什么？推进条件各是什么？

**回答要点**：

1. WARMUP：破冰开场，邀请学员自我介绍 → 最少 1 轮，最多 4 轮
2. TECH_BASE：技术基础考察，题库问答+追问 → 至少 6 轮且已问 8 道题
3. PROJECT：简历项目深挖 → 所有项目覆盖完或至少 2 轮
4. CLOSING：反问收尾 → 至少 2 轮
5. FINISHED：生成五维度报告（技术深度 35%、项目经验 25%、沟通表达 20%、抗压能力 10%、综合印象 10%）

**Q2（深挖）**：为什么阶段转换由 check_stage（代码逻辑）控制而不是由 LLM 推断？LLM 推断的弊端是什么？

**回答要点**：

1. LLM 推断状态转换不可靠——可能在还没问够技术题时就跳到项目阶段
2. 纯代码逻辑确定性高：轮数、题库覆盖度、回答质量标签都是精确计数，不需要"猜测"
3. LLM 推断有 token 开销且增加延迟，check_stage 是 O(1) 的字典查找
4. 状态机设计的核心原则：状态转换由显式规则+结构化数据驱动，LLM 只在需要生成内容时介入

**Q3（实战）**：摘要压缩触发时机为什么是每 10 轮？消息截断保留最近 20 轮的依据是什么？

**回答要点**：

1. 10 轮触发：在"摘要频率"和"信息丢失"间折中——太频繁遮挡最近对话流，太稀疏上下文超限
2. 保留最近 20 轮：确保 LLM 能看到完整的近期对话流（包括学员回答、追问、面试官回应），足够覆盖完整的一问一答+追问链
3. 超出 20 轮的旧消息已被摘要覆盖，重复保留浪费 token
4. system message 始终保留（面试官人设、评分标准），不被截断

**Q4（边界）**：如果简历审查结果被删除了或 status 不是 done，模拟面试 PROJECT 阶段的简历联动会怎样？有没有降级策略？

**回答要点**：

1. load_context 节点读取 resume_review_id → 查 resume_reviews 表，若不存在或 status != done，resume_data 为空
2. 降级策略：PROJECT 阶段提示词中注明"学员简历数据不可用"，面试官主动邀请学员口头描述项目经历
3. 问题生成从"基于简历项目 x 追问"变为"请描述你做过的项目，我会追问细节"
4. 五维度报告中项目经验维度的评分标注"数据不可用"，降低该维度权重至临时值

## 参考引用

- 需要理解状态机对话设计模式的抽象原理：[状态机对话设计模式](../设计模式/02-状态机对话设计模式.md)
- 需要理解 LangGraph 条件边和 check_stage 的路由机制：[LangGraph 条件边与路由](../LangGraph/02-LangGraph条件边与路由.md)
- 需要理解 LangGraph Checkpointer 在多轮对话中的记忆持久化：[LangGraph Checkpointer 与记忆](../LangGraph/04-LangGraph-Checkpointer与记忆.md)
- 需要理解 SSE 流式输出在面试对话逐字输出中的应用：[SSE 流式输出](../../Tools/网络/02-WebSocket与SSE流式输出.md)
- 需要理解 Think 前置推理在回答质量评估中的应用：[Think 前置推理增强](../设计模式/03-Think前置推理增强.md)
