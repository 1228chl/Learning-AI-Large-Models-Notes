# QA Agent 节点②：检索与精排 `retrieve_node` 深度解析

> 源文件：`backend/agents/qa/nodes.py` 第 498~597 行
> 对应课件：5.13 节点②：检索与精排
> 前置依赖：`backend/core/reranker.py` 的 `retrieve()` 函数

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

## 二、函数签名（第 498~515 行）

```python
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

**输入**：`QAState`——从 State 中读取 `query_type`、`tenant_id`、`course_id`、`original_query`、`hyde_document`（VAGUE）、`rewritten_queries`（BROAD）。

**输出**：`dict`——`ranked_chunks`、`confidence`、`is_high_confidence`。

---

## 三、三条检索路径参数配置

### 3.1 常量回顾（第 44~48 行）

```python
MAX_BROAD_QUERIES        = 3    # BROAD 分支最多并行的子 Query 数
RECALL_TOP_K_PRECISE     = 8    # PRECISE：直接检索召回数
RECALL_TOP_K_VAGUE       = 10   # VAGUE：HyDE 语义扩充后多召回些
RECALL_TOP_K_BROAD_PER   = 4    # BROAD：每个子 Query 的召回数
RERANK_TOP_K             = 3    # 精排后保留的最终 chunk 数
```

### 3.2 三路参数差异对比

| 路径 | 检索文本 | recall_top_k | rerank_top_k | 为什么 |
|------|---------|-------------|-------------|--------|
| PRECISE | `original_query` | 8 | 3 | 问题明确，命中率高，8 条候选足够 |
| VAGUE | `hyde_document` | **10** | 3 | HyDE 文档与知识库对齐有误差，多召回 2 条补偿 |
| BROAD | 每个子 Query | 4 | **4** | 精排保留全部候选，合并后统一取 Top-3 |

**BROAD 的 rerank_top_k 为什么等于 recall_top_k（都是 4）？**

设为 4（等于召回数）相当于"把所有召回候选都保留"——每个子 Query 返回 4 条，3 个子 Query 最多 12 条候选，后续合并步骤统一取最优 Top-3。如果设为 3，每个子 Query 就已经丢掉了一部分候选，合并时覆盖面更窄。

---

## 四、`retrieve_node` 逐行精读

### 4.1 延迟导入（第 515 行）

```python
from backend.core.reranker import retrieve, RankedDocument
```

**为什么在函数内部 import？** 避免模块加载时触发 `reranker.py` 的导入（BGE-Reranker 模型加载约 5-10 秒）。首次调用 `retrieve_node` 时才加载模型。

### 4.2 读取 State 参数（第 517~522 行）

```python
query_type     = state.get("query_type", "PRECISE").upper()
tenant_id      = state["tenant_id"]
course_id      = state.get("course_id")
original_query = state["original_query"]

loop = asyncio.get_running_loop()
```

**`state.get("query_type", "PRECISE")`**：防御性默认值。如果 `query_type` 未设置（如直接从 PRECISE 入口进入），默认走 PRECISE 路径。

**`.upper()`**：容错处理。State 中的 `query_type` 可能是小写 `"precise"`，转大写确保匹配。

**`state["tenant_id"]`**：使用 `[]` 而不是 `.get()`，因为 `tenant_id` 是必填字段，不应该缺失。

**`state.get("course_id")`**：使用 `.get()`，因为 `course_id` 是可选字段，可能为 `None`。

### 4.3 BROAD 路径：并行多 Query 检索（第 525~550 行）

```python
if query_type == "BROAD" and state.get("rewritten_queries"):
    broad_queries = state["rewritten_queries"][:MAX_BROAD_QUERIES]
```

**`[:MAX_BROAD_QUERIES]`**：截断到最多 3 条子 Query。`multi_query_rewrite_node` 可能返回超过 3 条，这里做了硬限制。

#### 4.3.1 单 Query 检索封装（第 529~537 行）

```python
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

**`retrieve_one` 是内部嵌套函数**：每个子 Query 独立调用 `retrieve()`，通过 `run_in_executor` 放入线程池执行。

**`rerank_top_k=RECALL_TOP_K_BROAD_PER`**：BROAD 路径的精排数等于召回数（都是 4），保留所有候选供合并步骤使用。

#### 4.3.2 并行执行（第 540 行）

```python
results = await asyncio.gather(*[retrieve_one(q) for q in broad_queries])
```

**`asyncio.gather`**：3 条子 Query 的检索任务**并行执行**。总耗时 = 最慢的单条检索时间，而不是 3 条顺序执行的时间之和。

**BROAD 路径的时序**：

```
时间线 →
子 Query 1:  ████████████░░░░░░░░░
子 Query 2:  ████████████████░░░░░
子 Query 3:  ████████████████████░
            ↑ gather 同时启动     ↑ gather 等待所有完成
```

#### 4.3.3 合并去重（第 542~550 行）

```python
seen: dict[str, RankedDocument] = {}
for ranked_docs, _ in results:
    for doc in ranked_docs:
        key = doc.content[:100]
        if key not in seen or doc.score > seen[key].score:
            seen[key] = doc

merged = sorted(seen.values(), key=lambda x: x.score, reverse=True)[:RERANK_TOP_K]
```

**`content[:100]` 去重 key**：文档开头 100 字符足以区分不同段落，同一段落被多次召回时前 100 字相同，去重生效。

**`if key not in seen or doc.score > seen[key].score`**：发生重复时保留分数更高的那条。

**`sorted(seen.values(), key=lambda x: x.score, reverse=True)[:RERANK_TOP_K]`**：按 score 降序排列，取 Top-3。

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

### 4.4 PRECISE / VAGUE 路径：单路检索（第 553~569 行）

```python
else:
    # VAGUE 用 hyde_document 代替 original_query 检索
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

**`if query_type == "VAGUE" and state.get("hyde_document")`**：双重检查。即使 `query_type` 是 VAGUE，如果 `hyde_document` 为空（如 HyDE 生成失败），也回退到 `original_query`。

### 4.5 结果转换与置信度计算（第 571~597 行）

```python
ranked_chunks = [
    {
        "content":  doc.content,
        "score":    doc.score,
        "metadata": doc.metadata,
    }
    for doc in merged
]

# 置信度 = Top-1 文档的 BGE 相关性概率 [0, 1]
confidence         = ranked_chunks[0]["score"] if ranked_chunks else 0.0
is_high_confidence = confidence >= 0.75  # 阈值 0.75
```

**`RankedDocument → dict` 转换**：`RankedDocument` 是 dataclass，不能直接序列化。转换为 dict 后存入 State，供后续节点使用。

**`confidence = ranked_chunks[0]["score"] if ranked_chunks else 0.0`**：置信度取 Top-1 文档的 BGE-Reranker 评分。空召回时置信度为 0.0。

**`is_high_confidence = confidence >= 0.75`**：预计算布尔值，生成节点直接读取，不需要自己实现阈值判断。

---

## 五、空召回处理

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

## 六、`run_in_executor` 的必要性

### 6.1 retrieve() 内部的阻塞操作

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

### 6.2 阻塞 vs 非阻塞对比

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

## 七、完整数据流

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

## 八、`★` 设计亮点总结

### 8.1 三路参数差异化配置

| 路径 | recall_top_k | 理由 |
|------|-------------|------|
| PRECISE | 8 | 问题明确，命中率高 |
| VAGUE | 10 | 补偿 HyDE 文档对齐误差 |
| BROAD | 4 × 3 | 覆盖多角度，合并后取最优 |

### 8.2 BROAD 并行检索 + 合并去重

`asyncio.gather` 并行执行 3 个子 Query 的检索，`content[:100]` 做近似去重。总耗时 = 最慢的单条检索时间，而不是顺序执行的总和。

### 8.3 空召回兜底

`retrieve()` 返回 `([], 0.0)` → `confidence=0.0, is_high_confidence=False` → 走低置信度分支。不抛异常，调用方不需要 try/except。

### 8.4 `run_in_executor` 防止阻塞

BGE-M3 编码（CPU 推理）+ Milvus 检索（同步 IO）+ CrossEncoder 精排（CPU/GPU）都是同步阻塞操作，通过线程池执行，事件循环继续运转。

### 8.5 延迟导入

`from backend.core.reranker import retrieve` 在函数内部导入，避免模块加载时触发 BGE-Reranker 模型加载（5-10 秒）。

### 8.6 预计算布尔值

`is_high_confidence` 在 `retrieve_node` 中预先计算好，生成节点直接读取，不需要自己实现阈值判断。

### 8.7 防御性编程

| 代码 | 作用 |
|------|------|
| `state.get("query_type", "PRECISE")` | 默认值 PRECISE |
| `query_type.upper()` | 容错大小写 |
| `state.get("rewritten_queries")` | BROAD 空检查 |
| `state.get("hyde_document")` | VAGUE 空检查，回退 original_query |
| `ranked_chunks[0]["score"] if ranked_chunks else 0.0` | 空召回默认值 |