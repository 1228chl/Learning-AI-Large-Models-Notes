---
author: "XunZong"
created: "2026-07-30"
tags: ["AI-Agent", "HitL", "人在环中", "人工审核", "interrupt"]
aliases: ["Human-in-the-Loop", "HitL", "人在环中", "人工审核回路", "interrupt"]
---

# Human-in-the-Loop 设计模式

## 定义

**Human-in-the-Loop（HitL，人在环中）** 是一种在 AI 自动化流程中插入人工审核节点的设计模式。AI 完成自动化处理后暂停，等待人工确认或修正，然后再继续后续流程。它解决了 AI 在某些场景下"不可完全信任"的问题。

### 核心公式

```
HitL = AI 自动化处理 → interrupt() 暂停 → 人工审核 → Command(resume=) 恢复 → 继续执行
```

### 直观理解

> 好比"AI 初筛 + 主管终审"——AI 先把 100 份简历过滤出 10 份候选，然后主管逐一确认，主管说"通过"的才发面试通知。AI 做粗活，人做决策。

## 为什么需要 HitL

AI 批改不能完全自动发布，原因有三：

| 原因 | 说明 | 例子 |
|:----|:-----|:-----|
| **边缘情况** | AI 对非常规答案把握不准 | 学员用不同表述正确回答，AI 低估 |
| **无法自动验证** | 有些结果 AI 无法自证正确 | 代码题无法自动运行验证 |
| **法律效力** | 最终结果需要人负责 | 发布的分数是最终成绩 |

## 实现机制

### 暂停：interrupt()

在 LangGraph 节点中使用 `interrupt()` 暂停图执行：

```python
from langgraph.types import interrupt

def human_review_node(state: ExamState) -> dict:
    """暂停图，等待教师确认"""
    result = interrupt({
        "question": "需要教师审核以下批改结果",
        "review_items": state["review_items"],
        "stats": {
            "total": len(state["review_items"]),
            "auto_passed": state["auto_passed_count"],
        }
    })

    # result 是教师通过 Command(resume=...) 传回的数据
    if result["action"] == "approve":
        return {"status": "reviewed", "teacher_feedback": "全部通过"}
    elif result["action"] == "modify":
        return {"status": "reviewed", "teacher_feedback": result["modifications"]}
```

### 恢复：Command(resume=...)

通过 API 传入教师决策，恢复图执行：

```python
from langgraph.types import Command

# 教师通过 API 传入决策
thread_config = {"configurable": {"thread_id": "exam-001"}}
graph.invoke(
    Command(resume={"action": "approve"}),
    config=thread_config
)
```

## 完整流程：试卷批改 HitL

```python
试卷 → [拆解题目] → [三轨并行批改]
                     ├── 客观题轨 → 自动计分
                     ├── 编程题轨 → 代码审查 → [置信度低?] → [人工审核] → 修正
                     └── 主观题轨 → 语义评估 → [置信度低?] → [人工审核] → 修正
                     → [汇总评分] → interrupt() 等待教师 → [确认发布] → 评分报告
```

**关键判断逻辑**：

```python
def should_request_review(state: ExamState) -> str:
    """条件边：根据批改结果决定是否需要人工审核"""
    review_items = []
    for question in state["all_results"]:
        if question.get("confidence", 1.0) < 0.7:  # 置信度低于 0.7
            review_items.append(question)

    if review_items:
        return "human_review"   # 需要人工审核
    else:
        return "publish"        # 全部高置信度，直接发布
```

## 设计要点

| 要点 | 说明 |
|:-----|:-----|
| **置信度判断** | 设定置信度阈值（如 0.7），低于阈值才进 HitL |
| **中断点选择** | 在"不可逆操作"之前中断（如发布分数之前） |
| **恢复数据** | interrupt 传出的数据让教师做决策，Command(resume) 传回决策结果 |
| **超时处理** | 教师长时间不处理，应该有超时提醒或自动降级 |
| **审计日志** | 记录 AI 原始结果和教师修改记录，便于追溯 |

## 适用场景

| 场景 | AI 做什么 | 人做什么 |
|:-----|:----------|:---------|
| 试卷批改 | AI 自动批改，标记低置信度题目 | 教师复核修改 |
| 简历审查 | AI 初筛评分 | HR 确认最终结果 |
| 内容审核 | AI 识别可疑内容 | 审核员最终判定 |
| 代码审查 | AI 自动审查代码质量 | 负责人确认是否合并 |

## 面试追问

**Q1（基础）**：什么是 Human-in-the-Loop？为什么需要它？
**回答要点**：
1. HitL 是在 AI 自动化流程中插入人工审核节点的设计模式
2. 需要的原因：AI 对边缘情况把握不准、有些结果无法自动验证、最终结果需要人负责

**Q2（深挖）**：interrupt 和 Command(resume=...) 的通信机制是什么？数据如何传递？
**回答要点**：
1. interrupt() 暂停图，传出当前 State 和处理数据（供人工审核参考）
2. Command(resume=data) 恢复图，传入人工决策结果
3. 通过 Checkpointer 持久化中断点，确保进程重启后仍能恢复

**Q3（实战）**：EduAgent 的试卷批改中，如何判断是否需要进入 HitL？
**回答要点**：
1. 每道题批改后附带置信度分数（0-1.0）
2. 置信度低于 0.7 的题目标记为"待审核"
3. 条件边根据 review_items 是否为空决定路由：有 → human_review，无 → publish

**Q4（边界）**：如果教师长时间不处理 HitL 请求，系统应该如何应对？
**回答要点**：
1. 设置超时提醒：超过一定时间（如 24 小时）发送提醒通知
2. 自动降级：超时后自动采用 AI 评分（或标记为"AI 评分，待教师确认"）
3. 优先级排序：待审核项按紧急程度排序，让教师优先处理最紧急的

## 参考引用
- 需要理解 LangGraph Checkpointer 与 interrupt 机制的相关知识，参见 [LangGraph Checkpointer与记忆](../LangGraph/04-LangGraph Checkpointer与记忆.md)
- 需要理解三层兜底重试机制中降级策略的相关知识，参见 [三层兜底重试机制](../工程实践/02-三层兜底重试机制.md)