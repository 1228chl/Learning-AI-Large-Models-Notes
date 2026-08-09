# QA Agent 节点②：检索与精排 `retrieve_node` 深度解析

> 源文件：`backend/agents/qa/nodes.py`（共 969 行，本节覆盖 493~596 行）
> 对应课件：5.13 节点②：检索与精排
> 前置依赖：`backend/core/reranker.py` 的 `retrieve()` 函数
> 前置节点：`classify_query_node` →（`hyde_generate_node` / `multi_query_rewrite_node`）→ `retrieve_node`

## 全文行号速查表

| 行号范围 | 函数/代码段 | 说明 |
|---------|-------------|------|
| 493~496 | 分区注释 | 节点：retrieve — 混合召回 + 精排 |
| 497~513 | `retrieve_node` 签名 + docstring | 三条路径概述 + 同步函数注意事项 |
| 514 | `from backend.core.reranker import retrieve, RankedDocument` | 延迟导入（避免模型加载） |
| 516~521 | 读取 State 参数 | `query_type` / `tenant_id` / `course_id` / `original_query` |
| 523~548 | **BROAD 路径** | 并行多 Query 检索 + 合并去重 |
| 525 | `broad_queries = state["rewritten_queries"][:MAX_BROAD_QUERIES]` | 取子 Query 列表 |
| 528~535 | `retrieve_one` 内部函数 | 单 Query 检索封装 |
| 538 | `results = await asyncio.gather(...)` | 并行检索 3 个子 Query |
| 541~548 | 合并去重 | `content[:100]` 为 key，保留最高分，取 Top-3 |
| 550~567 | **PRECISE / VAGUE 路径** | 单路检索 |
| 553~555 | VAGUE 分支 | 用 `hyde_document` 替代 `original_query` |
| 556~558 | 默认分支 | 用 `original_query` + `RECALL_TOP_K_PRECISE` |
| 560~566 | `run_in_executor` 调用 | 线程池执行同步 `retrieve()` |
| 569~595 | **结果转换与置信度计算** | `RankedDocument` → dict + 置信度 |

---

## 一、节点定位

`retrieve_node` 是 QA Agent 的核心检索节点，调用 `retrieve()` Pipeline（BGE-M3 编码 → Milvus Hybrid 搜索 → BGE-Reranker 精排），根据 `query_type` 选择不同的检索路径。

```
classify_query_node
  │
  ├─ GENERAL → generate_general_node（跳过检索）
  │
  └─ SPECIALIZED
       │
       ├─ PRECISE → retrieve_node（直接检索）
       ├─ VAGUE → hyde_generate_node → retrieve_node（用假设文档检索）
       └─ BROAD → multi_query_rewrite_node → retrieve_node（并行多 Query 检索）
            │
            ▼
       retrieve_node 输出：
         ranked_chunks      → generate_rag_node（高置信度）
         confidence         → 判断走哪条生成路径
         is_high_confidence → 路由分支
```

---

## 二、函数签名（第 497~513 行）

```python
# nodes.py 第 497~513 行
async def retrieve_node(state: QAState) -> dict:
    """
    调用 retrieve() Pipeline 完成检索与精排。

    三条路径：
      PRECISE → 用 original_query 直接检索（recall_top_k=8）
      VAGUE   → 用 hyde_document 替代 original_query（recall_top_k=10）
      BROAD   → 对所有 rewritten_queries 并行检索，合并去重

    BROAD 合并去重策略：
    - 3 条子 Query 各自检索 4 条候选，共 12 条
    - content[:100] 相同视为重复，保留最高分
    - 去重后按 score 降序取 3 条

    retrieve() 是同步函数（BGE-M3 CPU 推理 + Milvus 阻塞 IO），
    必须用 run_in_executor 包装，避免阻塞 asyncio 事件循环。
    """
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 497~498 | `async def retrieve_node(state: QAState) -> dict:` | 异步检索节点 |
| 499~513 | docstring | 三条路径说明 + 同步函数注意事项 |

**输入**：`QAState`——从 State 中读取 `query_type`、`tenant_id`、`course_id`、`original_query`、`hyde_document`（VAGUE）、`rewritten_queries`（BROAD）。

**输出**：`dict`——`ranked_chunks`、`confidence`、`is_high_confidence`。

---

## 三、参数读取与延迟导入（第 514~521 行）

```python
# nodes.py 第 514~521 行
from backend.core.reranker import retrieve, RankedDocument

query_type     = state.get("query_type", "PRECISE").upper()
tenant_id      = state["tenant_id"]
course_id      = state.get("course_id")
original_query = state["original_query"]

loop = asyncio.get_running_loop()
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 514 | `from backend.core.reranker import retrieve, RankedDocument` | **函数内部 import**：避免模块加载时触发 BGE-Reranker 模型加载（5-10 秒） |
| 516 | `query_type = state.get("query_type", "PRECISE").upper()` | 防御性默认值 + 大小写容错 |
| 517 | `tenant_id = state["tenant_id"]` | 必填字段，用 `[]` 访问 |
| 518 | `course_id = state.get("course_id")` | 可选字段，用 `.get()` 访问 |
| 519 | `original_query = state["original_query"]` | 原始查询文本 |
| 521 | `loop = asyncio.get_running_loop()` | 获取事件循环，后续 `run_in_executor` 使用 |

---

## 四、BROAD 路径：并行多 Query 检索（第 523~548 行）

### 4.1 取子 Query 列表（第 524~525 行）

```python
# nodes.py 第 524~525 行
if query_type == "BROAD" and state.get("rewritten_queries"):
    broad_queries = state["rewritten_queries"][:MAX_BROAD_QUERIES]
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 524 | `if query_type == "BROAD" and state.get("rewritten_queries"):` | 双重检查：类型 + 子 Query 非空 |
| 525 | `broad_queries = state["rewritten_queries"][:MAX_BROAD_QUERIES]` | 截断到最多 3 条 |

### 4.2 单 Query 检索封装（第 528~535 行）

```python
# nodes.py 第 528~535 行
async def retrieve_one(sub_query: str) -> tuple[list, float]:
    return await loop.run_in_executor(
        None,
        lambda: retrieve(
            sub_query, tenant_id, course_id,
            recall_top_k=RECALL_TOP_K_BROAD_PER,
            rerank_top_k=RECALL_TOP_K_BROAD_PER,
        ),
    )
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 528~529 | `async def retrieve_one(sub_query: str) -> tuple[list, float]:` | 内部嵌套函数，封装单 Query 检索 |
| 530~535 | `await loop.run_in_executor(None, lambda: retrieve(...))` | 线程池执行同步检索 |
| 533 | `recall_top_k=RECALL_TOP_K_BROAD_PER` | 每个子 Query 召回 4 条 |
| 534 | `rerank_top_k=RECALL_TOP_K_BROAD_PER` | 精排也保留 4 条（不丢弃候选） |

**`rerank_top_k=RECALL_TOP_K_BROAD_PER`（都为 4）**：BROAD 路径的精排数等于召回数，保留所有候选供合并步骤使用。

### 4.3 并行执行（第 538 行）

```python
# nodes.py 第 538 行
results = await asyncio.gather(*[retrieve_one(q) for q in broad_queries])
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 538 | `results = await asyncio.gather(*[retrieve_one(q) for q in broad_queries])` | 3 条子 Query 的检索任务**并行执行** |

**BROAD 路径的时序**：

```
时间线 →
子 Query 1:  ████████████░░░░░░░░░
子 Query 2:  ████████████████░░░░░
子 Query 3:  ████████████████████░
            ↑ gather 同时启动     ↑ gather 等待所有完成
```

总耗时 = 最慢的单条检索时间，而不是 3 条顺序执行的时间之和。

### 4.4 合并去重（第 541~548 行）

```python
# nodes.py 第 541~548 行
seen: dict[str, RankedDocument] = {}
for ranked_docs, _ in results:
    for doc in ranked_docs:
        key = doc.content[:100]
        if key not in seen or doc.score > seen[key].score:
            seen[key] = doc

merged = sorted(seen.values(), key=lambda x: x.score, reverse=True)[:RERANK_TOP_K]
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 541 | `seen: dict[str, RankedDocument] = {}` | 去重字典，key=content 前 100 字符 |
| 542~546 | `for ranked_docs, _ in results: for doc in ranked_docs:` | 遍历所有子 Query 的召回结果 |
| 544 | `key = doc.content[:100]` | 文档开头 100 字符为去重 key |
| 545 | `if key not in seen or doc.score > seen[key].score:` | 重复时保留最高分 |
| 548 | `merged = sorted(seen.values(), key=lambda x: x.score, reverse=True)[:RERANK_TOP_K]` | 按 score 降序取 Top-3 |

**BROAD 合并示例**：

```
子 Query 1 召回：文档 A(0.9), 文档 B(0.8), 文档 C(0.7), 文档 D(0.6)
子 Query 2 召回：文档 B(0.85), 文档 E(0.75), 文档 F(0.65), 文档 G(0.55)
子 Query 3 召回：文档 A(0.88), 文档 H(0.72), 文档 I(0.62), 文档 J(0.52)

seen 去重后：
  A → 0.9（保留最高分）
  B → 0.85（保留最高分）
  C → 0.7
  D → 0.6
  E → 0.75
  F → 0.65
  G → 0.55
  H → 0.72
  I → 0.62
  J → 0.52

排序后取 Top-3：A(0.9), B(0.85), E(0.75)
```

---

## 五、PRECISE / VAGUE 路径：单路检索（第 550~567 行）

```python
# nodes.py 第 550~567 行
else:
    if query_type == "VAGUE" and state.get("hyde_document"):
        query_text   = state["hyde_document"]
        recall_top_k = RECALL_TOP_K_VAGUE
    else:
        query_text   = original_query
        recall_top_k = RECALL_TOP_K_PRECISE

    merged, _ = await loop.run_in_executor(
        None,
        lambda: retrieve(
            query_text, tenant_id, course_id,
            recall_top_k=recall_top_k,
            rerank_top_k=RERANK_TOP_K,
        ),
    )
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 550 | `else:` | 非 BROAD 路径（PRECISE / VAGUE） |
| 553 | `if query_type == "VAGUE" and state.get("hyde_document"):` | VAGUE 双重检查 |
| 554 | `query_text = state["hyde_document"]` | 用假设文档替换原始 query |
| 555 | `recall_top_k = RECALL_TOP_K_VAGUE` | 10 条候选（补偿对齐误差） |
| 556~558 | `else:` | PRECISE 默认分支 |
| 557 | `query_text = original_query` | 用原始 query 直接检索 |
| 558 | `recall_top_k = RECALL_TOP_K_PRECISE` | 8 条候选 |
| 560~566 | `await loop.run_in_executor(None, lambda: retrieve(...))` | 线程池执行 |

**VAGUE 路径的检索文本替换**：

```
用户说："Hard Negative Sampling 没懂"（original_query）
  │
  ▼
HyDE 生成假设文档：
"Hard Negative Sampling 是大模型检索微调的关键技术，
通过挑选与正样本高度相似但标签不同的负样本提升模型判别能力..."
  │
  ▼
retrieve_node 用 hyde_document 检索（而不是 original_query）
  │
  ▼
找到"Hard Negative Sampling"相关的课程内容 ✅
```

**三路参数差异对比**：

| 路径 | 检索文本 | recall_top_k | rerank_top_k | 为什么 |
|------|---------|-------------|-------------|--------|
| PRECISE | `original_query` | 8 | 3 | 问题明确，命中率高，8 条候选足够 |
| VAGUE | `hyde_document` | **10** | 3 | HyDE 文档与知识库对齐有误差，多召回 2 条补偿 |
| BROAD | 每个子 Query | 4 | **4** | 精排保留全部候选，合并后统一取 Top-3 |

---

## 六、结果转换与置信度计算（第 569~595 行）

```python
# nodes.py 第 569~595 行
ranked_chunks = [
    {
        "content":  doc.content,
        "score":    doc.score,
        "metadata": doc.metadata,
    }
    for doc in merged
]

confidence         = ranked_chunks[0]["score"] if ranked_chunks else 0.0
is_high_confidence = confidence >= 0.75

logger.info(
    "retrieve.done",
    query_type=query_type,
    ranked=len(ranked_chunks),
    confidence=round(confidence, 4),
    is_high_confidence=is_high_confidence,
)

return {
    "ranked_chunks":      ranked_chunks,
    "confidence":         confidence,
    "is_high_confidence": is_high_confidence,
}
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 570~577 | `ranked_chunks = [{"content": doc.content, "score": doc.score, "metadata": doc.metadata} for doc in merged]` | `RankedDocument` → dict 转换，确保可序列化 |
| 580 | `confidence = ranked_chunks[0]["score"] if ranked_chunks else 0.0` | 置信度 = Top-1 文档的 BGE-Reranker 评分 |
| 581 | `is_high_confidence = confidence >= 0.75` | 预计算布尔值，阈值 0.75 |
| 583~589 | `logger.info("retrieve.done", ...)` | 记录检索结果 |
| 591~595 | `return { ... }` | 返回三个字段 |

---

## 七、空召回处理

当 `retrieve()` 返回空结果时：

```python
# reranker.py retrieve() 内部
if not candidates:
    return [], 0.0
```

对应 `retrieve_node` 的输出：

```python
ranked_chunks      = []           # 空列表
confidence         = 0.0          # 0.0
is_high_confidence = False        # 0.0 < 0.75
```

**后续路由**：`is_high_confidence=False` → 走低置信度分支 → `web_search_node` → `generate_direct_node`。

---

## 八、`run_in_executor` 的必要性

### 8.1 retrieve() 内部的阻塞操作

```python
def retrieve(query, tenant_id, course_id, ...):
    # Step 1：BGE-M3 编码（CPU 推理，阻塞）
    embedder = BGEMEmbedder.get_instance()
    dense_vec, sparse_vec = embedder.encode_query(query)

    # Step 2：Milvus Hybrid 检索（同步 IO，阻塞）
    kb = KnowledgeBaseClient()
    candidates = kb._hybrid_search(dense_vec, sparse_vec, ...)

    # Step 3：BGE-Reranker 精排（CPU/GPU 推理，阻塞）
    reranker = BGEReranker.get_instance()
    return reranker.rerank_with_confidence(query, candidates, ...)
```

三步都没有 `await`，在 async 函数里直接调用会阻塞整个事件循环。

### 8.2 阻塞 vs 非阻塞对比

```python
# ❌ 错误：阻塞事件循环
async def retrieve_node(state):
    result = retrieve(query, ...)  # 阻塞 1-2 秒，其他请求全部卡住

# ✅ 正确：run_in_executor 放入线程池
async def retrieve_node(state):
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(
        None,
        lambda: retrieve(query, ...)  # 线程池执行，事件循环继续运转
    )
```

---

## 九、完整数据流

```
用户： "全面介绍商品聚合大模型微调"
  │
  ▼
classify_query_node
  │
  ├─ Layer 0b：含"全面"→ BROAD
  │
  ▼
multi_query_rewrite_node
  │
  ├─ 改写为 3 个子 Query：
  │   1. "商品聚合多模态大模型的双塔召回架构是什么"
  │   2. "LlamaFactory 微调 Qwen VL 的基本步骤"
  │   3. "Hard Negative Sampling 在大模型微调中的作用"
  │
  ▼
retrieve_node
  │
  ├─ asyncio.gather 并行检索 3 个子 Query
  │   ├─ 子 Query 1 → retrive() → 4 条候选
  │   ├─ 子 Query 2 → retrive() → 4 条候选
  │   └─ 子 Query 3 → retrive() → 4 条候选
  │
  ├─ content[:100] 去重 → 12 条 → 保留 10 条（去重后）
  │
  ├─ sorted by score → Top-3
  │
  ├─ confidence = Top-1.score
  │
  └─ is_high_confidence = confidence >= 0.75
       │
       ├─ True → generate_rag_node（高置信度 RAG 生成）
       └─ False → web_search_node → generate_direct_node（低置信度兜底）
```

---

## 十、`★ Insight ───` 设计亮点总结

### 10.1 三路参数差异化配置

| 路径 | recall_top_k | 理由 |
|------|-------------|------|
| PRECISE | 8 | 问题明确，命中率高 |
| VAGUE | 10 | 补偿 HyDE 文档对齐误差 |
| BROAD | 4 × 3 | 覆盖多角度，合并后取最优 |

### 10.2 BROAD 并行检索 + 合并去重

`asyncio.gather` 并行执行 3 个子 Query 的检索，`content[:100]` 做近似去重。总耗时 = 最慢的单条检索时间，而不是顺序执行的总和。

### 10.3 空召回兜底

`retrieve()` 返回 `([], 0.0)` → `confidence=0.0, is_high_confidence=False` → 走低置信度分支。不抛异常，调用方不需要 try/except。

### 10.4 `run_in_executor` 防止阻塞

BGE-M3 编码（CPU 推理）+ Milvus 检索（同步 IO）+ CrossEncoder 精排（CPU/GPU）都是同步阻塞操作，通过线程池执行，事件循环继续运转。

### 10.5 延迟导入

`from backend.core.reranker import retrieve` 在函数内部导入，避免模块加载时触发 BGE-Reranker 模型加载（5-10 秒）。

### 10.6 预计算布尔值

`is_high_confidence` 在 `retrieve_node` 中预先计算好，生成节点直接读取，不需要自己实现阈值判断。

### 10.7 防御性编程

| 代码 | 作用 |
|------|------|
| `state.get("query_type", "PRECISE")` | 默认值 PRECISE |
| `query_type.upper()` | 容错大小写 |
| `state.get("rewritten_queries")` | BROAD 空检查 |
| `state.get("hyde_document")` | VAGUE 空检查，回退 original_query |
| `ranked_chunks[0]["score"] if ranked_chunks else 0.0` | 空召回默认值 |