# 项目简历

### EduRAG｜基于 LangGraph 的企业级 RAG Agent

**技术栈：** LangGraph、LangChain、Milvus、BGE-M3、BGE-Reranker、DeepSeek、FastAPI、PostgreSQL、MCP

- 基于 LangGraph 设计多节点 RAG Workflow，实现 Query Classification、HyDE、Multi Query Rewrite、Hybrid Retrieval、Rerank、Web Search Fallback 及多轮会话记忆等核心能力；
- 构建向量检索（BGE-M3）+ 关键词检索（BM25）的 Hybrid Search 架构，并结合 BGE-Reranker 精排机制提升知识召回质量；
- 针对 PRECISE、VAGUE、BROAD 三类问题设计动态路由策略，分别采用精准检索、HyDE 假设文档生成及 Multi Query 扩展检索方案，提高复杂问题召回率；
- 基于 MCP（Model Context Protocol）集成联网搜索能力，设计低置信度路由机制，当知识库未命中或检索置信度不足时自动调用 Web Search Tool 获取实时外部知识，降低模型幻觉风险；
- 基于 FastAPI + SSE 实现流式问答服务，支持异步任务执行、多轮上下文记忆及会话管理；
- 构建 RAG Evaluation 评测体系，基于 300+ 专家标注问答数据集，从 Retrieval Recall和 Answer Correctness 两个维度量化评估系统效果，形成检索优化与生成优化闭环；

**项目成果：**

- Retrieval Recall达到 91.4%，Answer Correctness 达到 88.6%；
- Hybrid Search + Rerank 方案使复杂问题知识召回率提升 25%+；
- MCP 联网搜索有效提升长尾问题及实时问题回答能力，降低知识库覆盖盲区带来的回答错误；
- 支持企业知识库问答、课程智能助教及内部文档检索等多种场景落地。

# EduRAG 项目面试高频问题

> 项目名称：EduRAG —— 基于 LangGraph 的企业级 RAG Agent
>
> 技术栈：LangGraph、LangChain、Milvus、BGE-M3、BGE-Reranker、FastAPI、PostgreSQL、MCP

------

# 一、项目背景与架构设计

## Q1：为什么要做这个项目？

### 参考回答

企业内部沉淀了大量知识文档，例如：

- 产品文档
- 技术文档
- 培训资料
- FAQ
- 规章制度

传统大模型无法直接访问这些私有知识。

因此设计 EduRAG，通过：

```text
知识库检索
+
大模型生成
```

实现企业知识问答能力。

解决：

- 大模型知识时效性不足
- 企业私有知识无法访问
- 模型幻觉严重

等问题。

------

## Q2：为什么不直接使用大模型？

### 参考回答

直接使用大模型存在两个问题：

### 第一

无法访问企业私有知识。

例如：

```text
公司制度
内部规范
课程资料
```

模型训练时并不知道。

------

### 第二

存在幻觉问题。

模型可能编造答案。

RAG通过：

```text
检索
+
生成
```

模式，让模型基于真实知识回答问题。

------

## Q3：整个系统架构是什么？

### 参考回答

整体流程如下：

```text
User Query
      │
      ▼

Query Classification

      │
      ▼

HyDE / Multi Query

      │
      ▼

Hybrid Retrieval

      │
      ▼

Rerank

      │
      ▼

Confidence Check

      ├──────────────┐
      ▼              ▼

RAG           MCP Web Search

      │              │
      └──────┬───────┘
             ▼

        LLM Generate

             ▼

          Answer
```

核心思想：

```text
检索增强
+
动态路由
+
工具调用
```

------

# 二、LangGraph 相关

## Q4：为什么选择 LangGraph？

### 参考回答

项目属于典型 Workflow Agent。

需要：

- 多节点编排
- 状态管理
- 条件路由
- Tool Calling

LangGraph 天然适合：

```text
分类
↓
检索
↓
生成
↓
联网兜底
```

这类复杂流程。

相比传统 Chain 更容易扩展。

------

## Q5：State 中存储什么数据？

### 参考回答

主要包含：

```python
query

query_type

rewritten_queries

retrieved_docs

reranked_docs

confidence_score

web_results

final_answer
```

State 是整个 Workflow 的共享数据中心。

------

## Q6：为什么使用条件路由？

### 参考回答

因为不同问题需要不同处理策略。

例如：

```text
精准问题
↓
直接检索

模糊问题
↓
HyDE

宽泛问题
↓
Multi Query

低置信度问题
↓
联网搜索
```

如果全部走同一路径：

```text
成本高
效果差
```

------

# 三、RAG 核心原理

## Q7：什么是 RAG？

### 参考回答

RAG：

```text
Retrieval Augmented Generation
```

即：

```text
检索增强生成
```

流程：

```text
检索知识

↓

构造上下文

↓

大模型生成答案
```

本质是：

```text
给模型外挂知识库
```

------

## Q8：为什么使用向量检索？

### 参考回答

关键词检索只能匹配字面相似。

例如：

```text
用户：
什么是检索增强生成？

文档：
RAG是一种...
```

关键词可能无法匹配。

向量检索能够发现：

```text
语义相似
```

内容。

------

## Q9：为什么还要保留 BM25？

### 参考回答

因为向量检索并非万能。

例如：

```text
接口名
错误码
专业术语
```

BM25通常效果更好。

因此采用：

```text
Vector Search
+
BM25
```

构建 Hybrid Search。

------

## Q10：Hybrid Search 的优势是什么？

### 参考回答

兼顾：

```text
语义匹配能力

+

关键词匹配能力
```

相比单纯向量检索：

- 召回率更高
- 长尾问题效果更好
- 专业术语检索更准确

------

# 四、HyDE 与 Multi Query

## Q11：什么是 HyDE？

### 参考回答

HyDE：

```text
Hypothetical Document Embeddings
```

即：

```text
假设文档生成
```

------

流程：

```text
用户问题

↓

LLM生成假设答案

↓

向量化

↓

检索
```

------

## Q12：为什么 HyDE 能提升效果？

### 参考回答

因为用户问题通常非常短。

例如：

```text
RAG怎么优化？
```

直接向量化信息不足。

HyDE先扩展成：

```text
RAG优化包括Chunk切分、
Embedding优化、
Rerank优化...
```

再检索。

语义更加丰富。

------

## Q13：什么是 Multi Query？

### 参考回答

Multi Query：

```text
一个问题

↓

生成多个子问题

↓

分别检索

↓

合并结果
```

例如：

```text
如何优化RAG？
```

扩展为：

```text
Chunk如何优化？

Embedding如何优化？

Recall如何提升？
```

------

## Q14：什么时候使用 Multi Query？

### 参考回答

适用于：

```text
开放问题

宽泛问题

复杂问题
```

例如：

```text
如何学习大模型？
```

------

# 五、Rerank

## Q15：为什么已经检索了还要 Rerank？

### 参考回答

因为：

```text
Recall
≠
Precision
```

召回结果中仍存在噪声。

例如：

```text
Top20
```

中可能只有：

```text
Top3
```

真正相关。

------

## Q16：Rerank 的作用是什么？

### 参考回答

重新排序。

例如：

```text
检索：

A 0.81

B 0.79

C 0.78
```

经过 Rerank：

```text
C
A
B
```

更符合用户问题。

------

# 六、MCP 与联网搜索

## Q17：为什么要引入 MCP？

### 参考回答

RAG 存在天然缺陷：

```text
知识库覆盖有限
```

当知识库没有答案时：

```text
检索失败
```

模型容易幻觉。

因此引入：

```text
MCP
+
Web Search
```

作为兜底方案。

------

## Q18：什么时候触发联网搜索？

### 参考回答

通常根据：

```text
检索置信度
```

判断。

例如：

```text
TopK平均分过低

或者

召回文档不足
```

则自动路由：

```text
Web Search
```

------

## Q19：MCP 相比传统 Tool Calling 有什么优势？

### 参考回答

MCP 本质上定义了一套：

```text
模型与工具之间的标准协议
```

优势：

- 工具统一接入
- 更容易扩展
- 与 Agent 框架解耦
- 支持动态发现工具

------

# 七、评测体系（重点）

## Q20：如何评估 RAG 效果？

### 参考回答

采用两个核心指标：

```text
Retrieval Recall@3

Answer Correctness
```

分别评估：

```text
检索质量

生成质量
```

------

## Q21：什么是 Recall@3？

### 参考回答

衡量：

```text
标准知识

是否出现在

Top3结果中
```

例如：

```text
100个问题

92个召回成功
```

则：

```text
Recall@3

=

92%
```

------

## Q22：什么是 Answer Correctness？

### 参考回答

衡量：

```text
最终回答是否正确
```

通过：

```text
LLM Judge

+

人工抽检
```

评估。

------

## Q23：项目最终效果如何？

### 参考回答

测试集：

```text
300+问答数据
```

结果：

```text
Recall@3

92.4%

Correctness

88.6%
```

达到企业级可用水平。

------

# 八、工程化与优化

## Q24：为什么使用 FastAPI？

### 参考回答

因为：

- 异步支持好
- 性能高
- 与 LangGraph 集成方便

适合 Agent 服务化部署。

------

## Q25：为什么采用 SSE 流式输出？

### 参考回答

因为 Agent 执行时间较长。

如果全部完成后再返回：

```text
用户等待时间过长
```

通过 SSE：

```text
边生成
边返回
```

提升用户体验。

------

## Q26：如果知识库扩大到百万级怎么办？

### 参考回答

优化方向：

### 第一

Milvus HNSW 索引优化

------

### 第二

多级检索

```text
粗召回

↓

精召回

↓

Rerank
```

------

### 第三

文档分层管理

```text
知识分类

↓

路由检索
```

减少搜索范围。

------

# 九、面试官最喜欢深挖的问题

重点准备以下五个问题：

## 1

```text
为什么不用纯向量检索？
```

------

## 2

```text
Hybrid Search 怎么实现？
```

------

## 3

```text
HyDE 为什么有效？
```

------

## 4

```text
如何评估 RAG 效果？
```

------

## 5

```text
为什么要引入 MCP？
```

------

# 面试回答万能模板

遇到任何问题都可以按照下面结构回答：

```text
为什么会有这个问题？

↓

采用什么方案解决？

↓

为什么选择这个方案？

↓

效果提升多少？

↓

还有哪些优化空间？
```

这是企业面试官最喜欢听到的回答逻辑。