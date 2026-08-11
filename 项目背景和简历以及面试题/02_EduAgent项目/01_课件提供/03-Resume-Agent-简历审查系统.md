# 简历构造

### ResumeAgent｜基于 LangGraph 的智能简历评审 Agent

**技术栈：** LangGraph、LangChain、DeepSeek、FastAPI、PostgreSQL、PyMuPDF、Pydantic

- 基于 LangGraph 设计并实现 8 节点 Agent Workflow，完成 PDF 简历解析、结构化信息提取、多维度评审、问题诊断及评审报告生成全流程自动化；
- 基于 TypedDict + Pydantic 构建 ResumeState 状态管理机制，结合 Structured Output 实现教育经历、项目经历、工作经历等关键信息结构化抽取；
- 设计项目深度、技术匹配度、表达规范性等六维度评审体系，基于 asyncio.gather 实现并行评审，相比串行执行整体耗时降低约 70%；
- 引入 Think→Diagnose 两阶段推理链路，结合重试、降级及异常恢复机制，提升问题诊断质量与 Agent 执行稳定性；
- 构建 Agent Evaluation 评测体系，基于专家标注简历数据集，从问题召回率（Issue Recall）和评分一致性（MAE）两个维度评估系统效果，实现 Agent 输出质量的量化验证与持续优化闭环；

**项目成果：** 在 200+ 简历测试集中，问题召回率达到 84.7%，评分误差（MAE）控制在 3.8 分以内，实现与资深面试官评审结果的高一致性。



#  面试高频问题与参考答案

> 项目名称：ResumeAgent —— 基于 LangGraph 的智能简历评审 Agent
>
> 技术栈：LangGraph、LangChain、DeepSeek、FastAPI、PostgreSQL、PyMuPDF、Pydantic

------

# 一、项目背景与方案设计

## Q1：为什么要做这个项目？

### 回答

传统简历审核主要依赖就业老师或面试官人工完成，存在审核效率低、评审标准不统一、反馈质量依赖个人经验等问题。

因此设计并实现 ResumeAgent，通过 Agent Workflow 自动完成：

```text
PDF解析
↓
结构化提取
↓
六维度评审
↓
问题诊断
↓
总结生成
↓
评审报告输出
```

帮助求职者快速发现简历问题并进行优化。

------

## Q2：为什么不用一个 Prompt 直接完成？

### 回答

项目初期尝试过单 Prompt 方案。

但是发现：

- 输出格式不稳定
- Token消耗较高
- 提示词难维护
- 问题定位能力较弱

例如同时要求：

```text
提取简历信息
评分
问题诊断
总结建议
```

模型容易出现遗漏字段、评分不稳定等问题。

因此拆分为多个独立节点，每个节点只负责单一职责，通过 LangGraph 统一编排。

------

## Q3：为什么选择 LangGraph？

### 回答

因为该项目属于典型的 Workflow Agent。

需要：

- 状态管理
- 节点编排
- 多步骤推理
- 错误恢复

LangGraph天然适合：

```text
Extract
↓
Review
↓
Diagnose
↓
Summary
```

这种多阶段工作流场景。

相比普通 LangChain Chain 更容易维护和扩展。

------

# 二、系统架构设计

## Q4：整个系统架构是什么样的？

### 回答

整体采用：

```text
FastAPI
    │
    ▼

LangGraph Workflow

    │
    ├── PDF解析
    ├── 信息提取
    ├── 六维度评审
    ├── 问题诊断
    ├── 总结生成
    └── 结果持久化

    ▼

DeepSeek

    ▼

PostgreSQL
```

核心思想：

```text
State驱动
Workflow编排
```

------

## Q5：整个 Workflow 有哪些节点？

### 回答

主要包含：

```text
parse_pdf

↓

extract_structured

↓

run_six_dimensions

↓

think

↓

diagnose_issues

↓

generate_summary

↓

persist
```

总共8个核心节点。

------

## Q6：为什么要设计 ResumeState？

### 回答

ResumeState 是整个 Agent 的数据总线。

主要存储：

```python
raw_text

structured_resume

dimension_scores

issues

summary
```

所有节点共享同一个 State。

避免复杂的参数传递问题。

------

## Q7：如果后面新增面试评测 Agent 怎么办？

### 回答

直接扩展 State 即可。

例如：

```python
InterviewState
```

新增：

```python
conversation
evaluation
feedback
```

即可复用现有架构。

无需推翻重构。

------

# 三、Structured Output

## Q8：为什么使用 Structured Output？

### 回答

因为传统 Prompt 输出存在格式不稳定问题。

例如：

第一次返回：

```json
{
  "name":"张三"
}
```

第二次可能返回：

```text
候选人姓名为张三
```

导致程序无法稳定解析。

------

## Q9：Pydantic 在项目中起什么作用？

### 回答

利用 Pydantic 定义输出 Schema。

例如：

```python
ResumeStructured
DimensionScore
IssueItem
ResumeSummary
```

结合：

```python
with_structured_output()
```

约束模型输出格式。

提升系统稳定性。

------

## Q10：Structured Output 失败怎么办？

### 回答

设计了：

```text
Retry
+
Fallback
```

机制。

执行流程：

```text
结构化失败

↓

自动重试

↓

仍失败

↓

降级JSON解析

↓

继续执行流程
```

保证 Agent 不会因为单次格式异常而中断。

------

# 四、性能优化

## Q11：六维度评审为什么采用并行？

### 回答

六个评审维度之间没有依赖关系。

例如：

```text
项目深度

技术匹配度

表达规范性

量化能力

真实性

结构设计
```

完全可以同时执行。

------

## Q12：具体如何实现并行？

### 回答

使用：

```python
asyncio.gather()
```

同时发起多个 LLM 调用。

示例：

```python
results = await asyncio.gather(
    task1,
    task2,
    task3,
    task4,
    task5,
    task6
)
```

------

## Q13：并行后效果提升多少？

### 回答

假设：

单次调用耗时：

```text
5秒
```

串行：

```text
5 × 6 = 30秒
```

并行：

```text
≈5秒
```

实际项目整体耗时降低约70%。

------

# 五、问题诊断设计

## Q14：为什么设计 Think 节点？

### 回答

直接让模型输出问题列表时。

经常出现：

```text
问题遗漏
诊断不充分
建议质量差
```

因此增加：

```text
Think
↓
Diagnose
```

两阶段推理。

先让模型自由分析。

再生成结构化问题。

效果明显优于单阶段方案。

------

## Q15：Think 节点输出什么？

### 回答

输出模型的分析过程。

例如：

```text
候选人项目经历较少

缺少量化指标

技术栈描述不完整
```

供后续 Diagnose 节点继续使用。

------

# 六、Agent评测体系（重点）

## Q16：如何评估 Agent 效果？

### 回答

建立 Evaluation 模块。

重点关注两个指标：

```text
Issue Recall
Score MAE
```

------

## Q17：什么是 Issue Recall？

### 回答

衡量：

```text
Agent发现的问题
÷
专家发现的问题
```

例如：

专家发现：

```text
10个问题
```

Agent发现：

```text
8个问题
```

结果：

```text
Recall = 80%
```

说明 Agent 发现了80%的关键问题。

------

## Q18：什么是 MAE？

### 回答

MAE：

```text
Mean Absolute Error
平均绝对误差
```

衡量：

```text
Agent评分
与
专家评分
之间的差距
```

例如：

```text
专家评分：82

Agent评分：86
```

误差：

```text
4分
```

统计全部样本后得到平均值。

------

## Q19：项目最终评测结果如何？

### 回答

测试集：

```text
200+简历
```

结果：

```text
Issue Recall：84.7%

Score MAE：3.8
```

说明：

- Agent能够发现绝大多数关键问题；
- Agent评分与资深面试官高度接近。

------

# 七、工程化与扩展能力

## Q20：如何保证系统稳定性？

### 回答

设计四层保障机制：

```text
异常捕获

↓

Retry

↓

Fallback

↓

日志监控
```

保证单节点失败不会影响整体流程。

------

## Q21：为什么使用 PostgreSQL？

### 回答

项目需要存储：

```json
{
  "structured_resume": {},
  "scores": {},
  "issues": [],
  "summary": ""
}
```

PostgreSQL 的 JSONB 类型非常适合存储此类半结构化数据。

同时支持：

- 查询
- 索引
- 统计分析

------

## Q22：如果继续迭代项目，你会优化什么？

### 回答

三个方向：

### 1、引入 LangSmith

实现：

```text
Trace监控
Prompt分析
成本统计
```

------

### 2、Prompt A/B Test

比较不同 Prompt 的：

```text
Recall

MAE

Token成本
```

持续优化效果。

------

### 3、Judge Agent

构建：

```text
Reviewer Agent

+

Judge Agent
```

双Agent评审体系。

进一步提高评分稳定性和一致性。

------

# 面试官最喜欢追问的三个问题

## 第一类

```text
为什么选择 LangGraph？
```

考察：

```text
Agent架构设计能力
```

------

## 第二类

```text
为什么使用 Structured Output？
```

考察：

```text
工程化开发能力
```

------

## 第三类

```text
如何评估 Agent 效果？
```

考察：

```text
Evaluation能力
企业落地能力
```

------

# 面试回答黄金公式

面对任何 Agent 项目问题，都可以按照以下结构回答：

```text
为什么这样设计？

↓

遇到了什么问题？

↓

采用什么方案解决？

↓

效果提升多少？

↓

还有哪些优化方向？
```

这套回答方式最符合企业真实面试场景，也是大模型 Agent 项目答辩中最容易获得认可的表达方式。