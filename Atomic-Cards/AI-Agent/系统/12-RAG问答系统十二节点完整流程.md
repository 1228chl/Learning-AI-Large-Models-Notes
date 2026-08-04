---
author: "XunZong"
created: "2026-07-30"
tags: ["AI-Agent", "RAG", "问答系统", "检索增强生成", "条件路由", "LangGraph"]
aliases: ["RAG QA Agent", "12节点图", "RAG完整流程", "混合检索", "置信度路由"]
---

# RAG 问答系统十二节点完整流程

## 定义

RAG 问答 Agent 是 EduAgent 中最复杂的 LangGraph 图，由 **12 个节点 + 3 个条件分支** 构成，实现了从用户提问到生成回答的完整闭环。核心流程为：意图分类（5 类）→ 按类选择检索策略（HyDE / Multi-Query / 直检）→ 加载多轮记忆 → 混合检索（稠密 + 稀疏）→ 重排序 → 置信度路由（高 / 低且联网 / 低且不联网）→ 保存记忆。

与简历审查 Agent 的直线图不同，本 Agent 引入了 LangGraph 的两个进阶能力：**条件边**（按意图和置信度走不同路径）和 **Checkpointer 记忆**（跨轮次持久化对话上下文）。

## 12 节点完整图示

$$ \text{START} \to \text{classify\_query} \to \begin{cases} \text{generate\_general} \\ \text{web\_search} \\ \text{hyde\_generate} \\ \text{multi\_query\_rewrite} \end{cases} \to \text{load\_memory\_and\_embed} \to \text{retrieve} \to \text{rerank} \to \begin{cases} \text{generate\_rag} \\ \text{web\_search} \to \text{generate\_direct} \\ \text{generate\_direct} \to \text{enqueue\_pending} \end{cases} \to \text{save\_memory} \to \text{END} $$

| 节点 | 职责 | 关键技术 |
|------|------|---------|
| classify_query | LLM 判 5 类意图（GENERAL / GENERAL_WEB / VAGUE / BROAD / PRECISE） | DeepSeek + structured_output |
| generate_general | 闲聊直接 LLM 答，不浪费检索 | 零检索开销 |
| web_search | 联网搜索 | DuckDuckGo MCP |
| hyde_generate | 对模糊问题：先生成假设文档，用它检索 | Hypothesis Document Embedding |
| multi_query_rewrite | 对宽泛问题：拆成 3-5 子问题分别检索 | LLM 子查询改写 |
| load_memory_and_embed | 并行：加载历史摘要 + BGE-M3 向量化问题 | MemorySaver + asyncio.gather |
| retrieve | 稠密 + 稀疏混合检索，RRF 融合 | BGE-M3 双向量 + WeightedRanker(0.7, 0.3) |
| rerank | 交叉编码器精排，计算 confidence | BGE-Reranker + sigmoid |
| generate_rag | 基于知识库上下文生成回答 | 检索结果注入 SystemMessage |
| generate_direct | 无知识库或联网后兜底答 | LLM 直答或联网搜索后答 |
| enqueue_pending | 低分问题入待办队列 | pending_queue 表 |
| save_memory | 保存本轮对话 + 摘要压缩 | MemoryManager + UPSERT |

## 7 项 RAG 关键技术

| 技术 | 解决的问题 | 实现方式 |
|------|-----------|---------|
| 意图分类 | 闲聊不必检索 | LLM 5 类分类 → 条件边分流 |
| HyDE | 问题太模糊检索不准 | LLM 生成"假设答案文档"替代问题做检索 |
| Multi-Query | 问题太宽泛 | LLM 拆 3-5 子问题 → 分别检索 → 合并去重 |
| 混合检索 | 语义 + 关键词各有所长 | 稠密（语义向量）+ 稀疏（词频向量）→ WeightedRanker 融合 |
| 重排序 | 检索 top-K 不精确 | BGE-Reranker 交叉编码器逐对打分 → confidence = sigmoid(score) |
| 置信度路由 | 知识库没答案时决定怎么答 | confidence >= 0.5: RAG 答；< 0.5 且可联网: 搜索后答；否则 LLM 直答 |
| 多轮记忆 + 摘要压缩 | 长对话超 token 限制 | 每轮保存 → 超阈值 LLM 压缩为摘要 → 用 summary 替代历史消息 |

## 直观理解

> 想象一位经验丰富的图书管理员：读者走进来问问题，管理员先判断问题类型——"闲聊"直接回答，"查资料"判断问题模糊程度——太模糊就先猜一个假设（HyDE），太宽泛就拆成几个子问题分别查，精准问题直接进书库检索。查到书后还要判断"这本书的内容够不够回答"——不够就联网搜，够了就基于书的内容回答。整个过程不是一条直线，而是根据问题类型走不同的路径。

## 关键代码模式：条件边与路由

```python
# classify_query 后的条件路由
def route_by_intent(state: QAState) -> str:
    """根据意图分类结果决定下一个节点"""
    intent = state.get("intent_label", "PRECISE")
    routing = {
        "GENERAL":     "generate_general",       # 闲聊 → 直接答
        "GENERAL_WEB": "web_search",             # 需联网 → 搜索
        "VAGUE":       "hyde_generate",          # 模糊 → 生成假设文档
        "BROAD":       "multi_query_rewrite",    # 宽泛 → 拆子问题
        "PRECISE":     "load_memory_and_embed",  # 精准 → 正常检索
    }
    return routing.get(intent, "generate_direct")  # 兜底：直接答

graph.add_conditional_edges("classify_query", route_by_intent, {
    "generate_general":       "generate_general",
    "web_search":             "web_search",
    "hyde_generate":          "hyde_generate",
    "multi_query_rewrite":    "multi_query_rewrite",
    "load_memory_and_embed":  "load_memory_and_embed",
})
```

## AI/ML 工程应用场景

| 应用场景 | 使用的 RAG 技术 | 说明 |
|---------|---------------|------|
| 企业知识库问答 | 混合检索 + 重排序 + 多轮记忆 | 内部文档问答，HyDE 处理模糊提问 |
| 课程答疑系统 | 意图分类 + 置信度路由 + 待办队列 | 区分闲聊与技术问题，低分入待办提示教师补知识库 |
| 医疗指南查询 | HyDE + RRF 混合检索 | 模糊症状描述 → 生成推测文档 → 精准检索指南 |
| 法律条文检索 | Multi-Query + Contextual RAG | 宽泛法律问题 → 拆为具体法条检索 |

## 面试追问

**Q1（基础）**：RAG 问答 Agent 的 12 节点图中，classify_query 节点之后有 5 条分支，分别对应什么意图？

**回答要点**：

1. GENERAL：闲聊或通用问题，直接 LLM 回答，不触发检索
2. GENERAL_WEB：需要联网搜索的问题（如"今天天气"），走 web_search
3. VAGUE：问题太模糊，生成假设文档（HyDE）后再检索
4. BROAD：问题太宽泛，拆成多个子问题（Multi-Query）分别检索
5. PRECISE：精准的技术问题，走正常检索路径

**Q2（深挖）**：HyDE 为什么能提高模糊问题的检索精度？它的前提假设是什么？

**回答要点**：

1. HyDE 的核心思路：问题与文档之间可能存在"词汇鸿沟"——用户用口语提问，文档用书面语写作，直接向量匹配效果差
2. HyDE 让 LLM 生成一段"假设性的标准答案文档"，这个文档的用词风格更接近知识库，用它做检索能跨越词汇鸿沟
3. 前提假设：LLM 即使不知道正确答案，也能生成"看起来像标准答案"的文本风格
4. EduAgent 中 HyDE 用于 VAGUE 意图：学员说"那个东西怎么用来着"，LLM 推测说的是某技术组件，生成假设文档

**Q3（实战）**：WeightedRanker(0.7, 0.3) 中的权重比例为什么是 0.7 和 0.3？调参方向是什么？

**回答要点**：

1. 稠密检索（0.7 权重更高）：语义相似度在大多数技术问答中比关键词匹配更关键
2. 稀疏检索（0.3 权重较低）：关键词匹配作为补充，在"精确术语查询"时补上语义盲区
3. 调参方向：如果用户经常搜精确术语（API 名/报错码）→ 提高稀疏权重；如果用户提问偏口语化 → 提高稠密权重
4. RRF（Reciprocal Rank Fusion）替代加权求和是更稳健的选择——排序位置融合天然对不同召回源的分数尺度差异不敏感

**Q4（边界）**：如果 rerank 后所有结果的 confidence 都低于 0.5，但系统配置不允许联网搜索，会发生什么？有哪些处理方案？

**回答要点**：

1. 走 generate_direct 路径：LLM 在没有知识库上下文的情况下直接回答
2. generate_direct 后触发 enqueue_pending：将"低置信度问题"写入 knowledge_pending_queue 表
3. 教师端可查看待办队列，判断是否需要给知识库补充内容
4. 前端展示"以下回答基于我的通用知识，可能有偏差"的提示，降低用户预期

## 参考引用

- 需要理解 HyDE 假设文档检索的具体原理与实现：[HyDE 假设文档检索实现](../RAG流程/08-HyDE假设文档检索实现.md)
- 需要理解 BGE-M3 嵌入模型的稠密+稀疏双向量输出：[BGE-M3 嵌入模型与混合检索](../RAG流程/07-BGE-M3嵌入模型与混合检索.md)
- 需要理解 Reranker 交叉编码器的精排机制：[BGE-Reranker 重排序模型](../../数据库/检索/08-BGE-Reranker重排序模型.md)
- 需要理解 LangGraph 条件边和 Checkpointer 机制：[LangGraph 条件边与路由](../LangGraph/02-LangGraph条件边与路由.md)
- 需要理解 Intent Classification 的意图分类和路由机制：[FAQ 与 RAG 混合检索架构](../检索/03-FAQ与RAG混合检索架构.md)
