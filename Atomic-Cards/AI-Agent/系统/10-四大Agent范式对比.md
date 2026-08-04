---
author: "XunZong"
created: "2026-07-30"
tags: ["AI-Agent", "EduAgent", "范式对比", "系统设计"]
aliases: ["四大Agent", "Agent范式", "并行评审", "RAG", "HitL", "状态机", "QA", "Exam", "Resume", "Interview"]
---

# 四大 Agent 范式对比

## 定义

EduAgent 的四个业务 Agent 分别代表了四种不同的 AI Agent 设计范式：**并行评审**（简历审查）、**RAG 检索增强**（智能问答）、**Human-in-the-Loop**（试卷批改）、**状态机驱动**（模拟面试）。每种范式对应不同的技术方案、状态管理方式和复杂度级别。

### 范式对比总览

| 维度 | QA（智能问答） | Exam（试卷批改） | Resume（简历审查） | Interview（模拟面试） |
|------|---------------|-----------------|-------------------|---------------------|
| 技术方案 | RAG 检索增强生成 | 三轨并行批改 + HitL | 结构化抽取 + 多维并行评分 | 状态机多阶段对话 + 流式输出 |
| 核心教你 | RAG 管线/向量检索/嵌入模型 | 并行任务编排/HitL | 信息抽取/并行评分聚合 | 状态机设计/流式/对话管理 |
| 状态管理 | 无状态（每次独立） | 有状态（批改进度） | 有状态（评估进度） | 复杂状态机（5 阶段） |
| 流程形态 | 带分支（12 节点） | 线性链 + 中断（9 节点） | 一条直线（8 节点） | 循环 + 分支（7 节点） |
| 复杂度 | 中等 | 高 | 中等 | 很高 |
| 依赖模型 | DeepSeek API + 3 个本地模型 | DeepSeek API | DeepSeek API | DeepSeek API |
| 多轮记忆 | 需要（MemorySaver） | 不需要（一次性） | 不需要（一次性） | 需要（MemorySaver + 摘要压缩） |
| 对外接口 | 流式/非流式对话 | 上传/查询/确认 | 上传/轮询/列表 | 开始/对话/报告/流式 |

### 四种范式的核心公式

**并行评审范式（Resume）**
$$
\text{Score}_{\text{final}} = \sum_{i=1}^{6} \text{Score}_i \cdot w_i
$$

- $\text{Score}_i$：第 $i$ 个维度的评分（0-100）
- $w_i$：第 $i$ 个维度的权重，$\sum w_i = 1.0$
- 实现方式：`asyncio.gather` 并行执行 6 个 LLM 调用，耗时 = 最慢维度而非 6 个累加

**RAG 检索增强范式（QA）**
$$
\text{Answer} = \text{LLM}(\text{Question} \oplus \text{Retrieved}_{\text{topK}} \oplus \text{Memory})
$$

- $\text{Question}$：用户提问
- $\text{Retrieved}_{\text{topK}}$：从向量库召回的最相关 K 个文档片段，经 Reranker 精排后取 topN
- $\text{Memory}$：基于 MemorySaver 的多轮对话历史摘要
- $\oplus$：拼接操作，将检索结果和记忆作为上下文注入 LLM

**Human-in-the-Loop 范式（Exam）**
$$
\text{Result} = \text{Interrupt}(\text{AI\_Review}) \rightarrow \text{Resume}(\text{Teacher\_Decision})
$$

- $\text{AI\_Review}$：AI 三轨并行批改完成后的预评分结果
- $\text{Interrupt}$：LangGraph 的 `interrupt()` 暂停图执行，等待外部输入
- $\text{Teacher\_Decision}$：教师的 approve/modify 决策
- $\text{Resume}$：通过 `Command(resume=decision)` 恢复图执行

**状态机驱动范式（Interview）**
$$
\text{Stage}_{t+1} = f(\text{Stage}_t, \text{Turn\_Count}, \text{Answer\_Quality})
$$

- $\text{Stage}_t$：当前面试阶段（WARMUP / TECH_BASE / PROJECT / CLOSING / FINISHED）
- $\text{Turn\_Count}$：当前阶段轮数计数器
- $\text{Answer\_Quality}$：学员回答质量标签（EXCELLENT / ADEQUATE / WEAK / NO_ANSWER）
- $f$：`check_stage` 纯逻辑节点，不调 LLM，通过代码规则判断是否推进阶段

### 直观理解

> 四种范式就像一个软件开发团队的四条流水线：简历审查是"自动质检线"（并行跑 6 个检测项出报告），智能问答是"客服+知识库"（去资料室查档案再回答），试卷批改是"AI 初筛+主管终审"（机器先批完，主管签字确认），模拟面试是"分阶段面试流程"（先热身再技术面最后 HR 面，流程固定）。

## 应用场景

| 范式 | 典型应用 | 可迁移场景 |
|------|---------|-----------|
| 并行评审（fan-out/fan-in） | 简历六维度评分 | 代码审查（多维度）、论文审稿（多维度评分）、商品评价（多维度分析） |
| RAG 检索增强 | 课程知识问答 | 企业知识库问答、法律文档咨询、医疗病历问答 |
| Human-in-the-Loop | 试卷批改确认 | 内容审核（AI 初筛 + 人工确认）、交易审批（AI 风控 + 人工复核） |
| 状态机驱动 | 模拟面试 | 电话客服 IVR 流程、游戏 NPC 对话、问卷调查流程 |

## 面试追问

**Q1（基础）**：EduAgent 的四个 Agent 分别对应哪四种范式？
**回答要点**：

1. 简历审查 Agent → 并行评审（fan-out/fan-in）范式，六维度并行评分
2. 智能问答 Agent → RAG 检索增强范式，检索+重排+生成
3. 试卷批改 Agent → Human-in-the-Loop 范式，AI 批改+教师确认
4. 模拟面试 Agent → 状态机驱动范式，五阶段多轮对话

**Q2（深挖）**：四种范式中，哪些需要状态管理？哪些不需要？为什么？
**回答要点**：

1. 简历审查（无状态）：一次性任务，8 个节点顺序执行，跑完就出报告，不需要跨请求记忆
2. 智能问答（有状态）：需要 MemorySaver 记录对话历史，支持多轮追问的上下文感知
3. 试卷批改（有状态）：需要记录批改进度和 `interrupt` 暂停点，等待教师确认后恢复
4. 模拟面试（复杂状态机）：需要跨越 5 个阶段管理轮数计数器和回答质量，复杂度最高

**Q3（实战）**：假设你要设计一个"AI 自动批改作文 + 教师终审"系统，应该采用哪种范式？为什么？
**回答要点**：

1. 采用 Human-in-the-Loop 范式（试卷批改的模式），因为作文批改有主观性，AI 无法 100% 确定
2. AI 先按评分维度（内容、结构、语言、逻辑）并行评分，`confidence < 0.7` 的标记需复核
3. `interrupt` 等待教师确认或修改评分，教师确认后 `resume` 发布最终成绩
4. 保留 AI 分和教师分两个字段，用于事后评估 AI 准确性

**Q4（边界）**：四种范式在什么情况下应该切换或组合？
**回答要点**：

1. 高召回需求场景：RAG 范式 + 并行评审 → 先多路检索（HyDE + Multi-Query）再并行评分
2. 长流程审批：状态机 + HitL → 每个阶段结束都 `interrupt` 等待审批人确认
3. 知识库更新频繁：RAG 范式需要离线重建索引，可改为双库滚动更新（热库切换）
4. 低延迟要求：RAG 范式的检索+重排带来 200-500ms 额外延迟，不可用于实时场景

## 参考引用

- 需要理解 EduAgent 系统整体定位和痛点的相关知识，参见 [四大痛点与EduAgent定位](./09-四大痛点与EduAgent定位.md)
- 需要了解并行评审模式的具体实现的相关知识，参见 [并行评审(fan-out-fan-in)](../设计模式/05-并行评审(fan-out-fan-in).md)
- 需要了解 Human-in-the-Loop 中断恢复机制的相关知识，参见 [Human-in-the-Loop设计模式](../设计模式/01-Human-in-the-Loop设计模式.md)
- 需要了解状态机对话设计模式的相关知识，参见 [状态机对话设计模式](../设计模式/02-状态机对话设计模式.md)
- 需要了解 RAG 三阶段流程的相关知识，参见 [RAG三阶段流程](../RAG流程/01-RAG三阶段流程.md)
- 需要了解 Orchestrator 如何路由到四个 Agent 的相关知识，参见 [Orchestrator 编排器设计](./07-Orchestrator编排器设计.md)