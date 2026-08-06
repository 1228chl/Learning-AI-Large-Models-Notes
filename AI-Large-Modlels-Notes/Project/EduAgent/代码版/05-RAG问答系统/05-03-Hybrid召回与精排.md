# Hybrid 混合检索与精排 — 从零理解

## 一、检索流水线

```
用户 Query
    │
    ▼
BGE-M3 编码（同时输出 dense + sparse 向量）
    │
    ▼
Milvus Hybrid Search
  ├── Dense ANN（语义相似度，COSINE 度量）
  ├── Sparse ANN（关键词匹配，IP 度量）
  └── WeightedRanker 融合（0.7 稠密 + 0.3 稀疏）
    │
    ▼
BGE-Reranker 精排（CrossEncoder 逐对打分）
    │
    ▼
置信度 ≥ 0.75 → RAG 生成
置信度 < 0.75 → Web 搜索兜底
```

## 二、Hybrid 搜索

### 2.1 KnowledgeBaseClient._hybrid_search

```python
def _hybrid_search(self, query_embedding, query_sparse, top_k, filters=None):
    # 稠密检索请求
    dense_req = AnnSearchRequest(
        data=[query_embedding],
        anns_field="embedding",
        param={"metric_type": "COSINE", "params": {"ef": self.ANN_EF}},
        limit=top_k,
    )

    # 稀疏检索请求
    sparse_req = AnnSearchRequest(
        data=[query_sparse],
        anns_field="sparse_embedding",
        param={"metric_type": "IP"},
        limit=top_k,
    )

    # 两路并行，WeightedRanker 融合
    results = self._client.hybrid_search(
        reqs=[dense_req, sparse_req],
        ranker=WeightedRanker(0.7, 0.3),  # 稠密权重 0.7，稀疏权重 0.3
        limit=top_k,
    )
```

### 2.2 WeightedRanker 为什么是 0.7 和 0.3？

- **稠密向量（0.7）**：语义匹配是主要手段，权重高
- **稀疏向量（0.3）**：关键词匹配是辅助手段，权重低
- 两者互补：稠密找不到的用稀疏找，稀疏找不到的用稠密找

## 三、BGE-Reranker 精排

### 3.1 为什么需要精排？

Hybrid 搜索返回的候选文档排序不够精确。Reranker 用 CrossEncoder 对 `(query, document)` 对逐对打分，比向量检索更准确。

向量检索 vs CrossEncoder 精排：

```
向量检索：query → 向量 → 最近邻搜索（粗排，速度快）
CrossEncoder：query + document → 逐对打分（精排，速度慢但准确）
```

### 3.2 BGEReranker

```python
class BGEReranker:
    _instance: Optional["BGEReranker"] = None

    def __init__(self):
        model_path = os.path.join(backend_path, settings.reranker_model_path)
        self._model = CrossEncoder(model_id, device=device, max_length=512)

    def rerank_with_confidence(self, query, documents, top_k=3):
        # CrossEncoder 输入：(query, document) 对
        pairs = [(query, doc["content"][:1200]) for doc in documents]

        # predict() 直接输出 [0, 1] 概率
        scores = self._model.predict(pairs).tolist()

        # 按 score 降序排列
        ranked = sorted(zip(documents, scores), key=lambda x: x[1], reverse=True)

        top_results = ranked[:top_k]
        confidence = top_results[0].score if top_results else 0.0

        return top_results, confidence
```

### 3.3 置信度阈值

```python
confidence >= 0.75 → 高置信度，走 RAG 生成（严格基于知识库）
confidence < 0.75  → 低置信度，走 Web 搜索兜底或 LLM 直答
```

## 四、检索流水线函数

```python
def retrieve(query, tenant_id, course_id=None, recall_top_k=10, rerank_top_k=3):
    # 1. BGE-M3 编码
    embedder = BGEMEmbedder.get_instance()
    dense_vec, sparse_vec = embedder.encode_query(query)

    # 2. Milvus 混合检索
    kb = KnowledgeBaseClient()
    filters = kb._build_filter(tenant_id, course_id)
    candidates = kb._hybrid_search(dense_vec, sparse_vec, top_k=recall_top_k, filters=filters)

    # 3. BGE-Reranker 精排
    reranker = BGEReranker.get_instance()
    return reranker.rerank_with_confidence(query, candidates, top_k=rerank_top_k)
```

## 五、检索路径（QA Agent）

| 路径 | query 文本 | recall_top_k | 说明 |
|------|-----------|-------------|------|
| PRECISE | `original_query` | 8 | 直接检索 |
| VAGUE | `hyde_document` | 10 | 用假设文档检索 |
| BROAD | 每个 rewritten_query | 4/每个 | 并行检索后合并去重 |

## 六、总结

```
BGE-M3 编码
    │
    ▼
Milvus Hybrid Search（Dense + Sparse → WeightedRanker）
    │
    ▼
BGE-Reranker 精排（CrossEncoder → [0,1] 概率）
    │
    ▼
置信度 ≥ 0.75 → RAG 生成
置信度 < 0.75 → Web 搜索 → LLM 直答
```

**核心思想：粗排（向量检索）+ 精排（CrossEncoder）两阶段，兼顾速度和精度。**