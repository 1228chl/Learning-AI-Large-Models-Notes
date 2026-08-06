# Hybrid 检索：`_hybrid_search` 深度解析

> 源文件：`backend/core/knowledge_base.py` 第 276~354 行
> 对应课件：5.6 Hybrid 检索

## 一、方法定位

`_hybrid_search` 是 `KnowledgeBaseClient` 的核心检索方法，同时用稠密向量和稀疏向量去 Milvus 搜索，再把两路结果加权融合排序。

```
KnowledgeBaseClient
  ├─ upsert_chunks()           ← 写入
  ├─ delete_document_chunks()  ← 删除
  └─ _hybrid_search()          ← 检索（核心）
```

---

## 二、方法签名（第 291~297 行）

```python
def _hybrid_search(
    self,
    query_embedding: list[float],   # 查询的稠密向量（1024 维）
    query_sparse: dict,             # 查询的稀疏向量（{token_id: weight}）
    top_k: int,                     # 返回前 N 条
    filters: Optional[str] = None,  # 过滤条件（如 course_id == "xxx"）
) -> list[dict]:
```

四个参数，两个向量 + 数量 + 过滤。返回的是已解析的候选列表，不是原始的 Milvus 结果。

---

## 三、核心逻辑：两路并行 + 加权融合

### 3.1 构造稠密检索请求（第 307~313 行）

```python
dense_req = AnnSearchRequest(
    data=[query_embedding],
    anns_field="embedding",                          # 在 embedding 字段上搜索
    param={"metric_type": "COSINE", "params": {"ef": self.ANN_EF}},
    limit=top_k,
    expr=filters,
)
```

| 参数 | 值 | 说明 |
|------|-----|------|
| `anns_field` | `"embedding"` | 在稠密向量字段上搜索 |
| `metric_type` | `"COSINE"` | 余弦相似度，和建索引时一致 |
| `ef` | 64 | HNSW 搜索候选集大小，越大精度越高但越慢 |
| `expr` | 外部传入 | 过滤条件，如 `course_id == "xxx"` |

### 3.2 构造稀疏检索请求（第 314~319 行）

```python
sparse_req = AnnSearchRequest(
    data=[query_sparse],
    anns_field="sparse_embedding",                   # 在稀疏向量字段上搜索
    param={"metric_type": "IP"},
    limit=top_k,
    expr=filters,
)
```

稀疏向量用 `metric_type="IP"`（内积），和建索引时一致。

### 3.3 输出字段裁剪（第 322~325 行）

```python
output_fields = [
    "content", "source_name", "chunk_type",
    "course_id", "document_id", "chunk_index",
]
```

只选 5 个展示字段，**不包含向量**——检索结果不需要返回向量，节省带宽和序列化开销。

### 3.4 两路并行执行 + 加权融合（第 327~333 行）

```python
results = self._client.hybrid_search(
    collection_name=COLLECTION_NAME,
    reqs=[dense_req, sparse_req],
    ranker=WeightedRanker(0.7, 0.3),
    limit=top_k,
    output_fields=output_fields,
)
```

**Milvus 内部的执行流程**：

```
查询向量（dense + sparse）
        │
        ▼
  ┌─────────────┐     ┌──────────────────┐
  │ AnnSearch   │     │ AnnSearch         │
  │ embedding   │     │ sparse_embedding  │
  │ HNSW+COSINE │     │ SPARSE_INVERTED+IP│
  │ ef=64       │     │                   │
  └──────┬──────┘     └───────┬───────────┘
         │                    │
         ▼                    ▼
    top_k 条稠密结果     top_k 条稀疏结果
         │                    │
         └───────┬────────────┘
                 ▼
        WeightedRanker(0.7, 0.3)
          score = 0.7 × d_score + 0.3 × s_score
                 ▼
          最终 top_k 条结果
```

两路搜索在 Milvus 服务端**并行执行**，拿到各自的结果后做加权融合。

---

## 四、`WeightedRanker(0.7, 0.3)` 的选择（第 278~289 行）

```python
# WeightedRanker(0.7, 0.3) vs RRFRanker 的选择理由：
#   RRFRanker（倒数排名融合）：
#     score = Σ 1 / (k + rank_i)，只看排名不看原始分数
#     优点：鲁棒，不受原始分数量纲影响
#     缺点：无法表达"语义相似度比关键词匹配更重要"的业务意图
#   WeightedRanker（加权平均分）：
#     score = w_dense × score_dense + w_sparse × score_sparse
#     可以指定 Dense 和 Sparse 各自的权重比例
#   本项目选 WeightedRanker(0.7, 0.3) 的原因：
#     课程问答以语义性问题为主（"为什么要用 IOC？"、"AOP 和代理模式有什么关系？"），
#     语义检索应该主导。但技术问答里偶尔出现精确的 API 名称、报错信息，
#     稀疏检索不能完全忽视。7:3 在实践中效果较好，可按实际场景调整。
```

### 4.1 两种融合策略对比

| Ranker | 公式 | 特点 |
|--------|------|------|
| **RRFRanker** | `score = Σ 1 / (k + rank_i)` | 只看排名不看原始分数，鲁棒但无法表达权重偏好 |
| **WeightedRanker（本项目）** | `score = 0.7 × d_score + 0.3 × s_score` | 可以指定两路的重要性比例 |

### 4.2 为什么稠密 0.7 > 稀疏 0.3？

课程问答以语义性问题为主：

| 问题类型 | 示例 | 依赖的检索 |
|---------|------|-----------|
| 语义性（主要） | "为什么要用 IoC？"、"AOP 和代理模式有什么关系？" | 稠密向量（语义匹配） |
| 关键词精确（次要） | "@Autowired 注解怎么用？"、"报错 NullPointerException" | 稀疏向量（关键词匹配） |

**7:3 在实践中效果较好**，可按实际场景调整。

---

## 五、结果解析（第 335~350 行）

```python
candidates = []
for hit in results[0]:
    candidates.append({
        "content": hit["entity"].get("content") or "",
        "score":   hit.get("distance") or 0.0,
        "metadata": {
            "source_name": hit["entity"].get("source_name") or "",
            "chunk_type":  hit["entity"].get("chunk_type")  or "text",
            "course_id":   hit["entity"].get("course_id")   or "",
            "document_id": hit["entity"].get("document_id") or "",
            "chunk_index": hit["entity"].get("chunk_index") or 0,
        },
    })
```

`results[0]` 是 `hybrid_search` 返回的融合排序结果。每个 `hit` 的结构：

| hit 字段 | 类型 | 说明 |
|---------|------|------|
| `hit["distance"]` | float | 融合后的分数（WeightedRanker 输出） |
| `hit["entity"]` | dict | `output_fields` 中指定的字段 |

返回的候选列表结构：

| 字段 | 类型 | 说明 |
|------|------|------|
| `content` | str | chunk 文本 |
| `score` | float | 融合分数 |
| `metadata.source_name` | str | 来源标注 |
| `metadata.chunk_type` | str | text / code / table |
| `metadata.course_id` | str | 所属课程 |
| `metadata.document_id` | str | 所属文档 |
| `metadata.chunk_index` | int | 文档内顺序 |

---

## 六、异常处理（第 352~354 行）

```python
except Exception as e:
    logger.error("knowledge_base.hybrid_search_failed", error=str(e))
    return []
```

任何异常都返回空列表，调用方自行处理无结果的情况。**不抛异常，调用方不需要 try/except**。

---

## 七、数据流全景

```
用户提问
  │
  ▼
BGE-M3 编码查询
  │
  ├─ query_embedding (dense, 1024 维)
  └─ query_sparse (sparse, {token_id: weight})
  │
  ▼
KnowledgeBaseClient._hybrid_search()
  │
  ├─ AnnSearchRequest(embedding, COSINE, ef=64)
  ├─ AnnSearchRequest(sparse_embedding, IP)
  ├─ WeightedRanker(0.7, 0.3)
  └─ output_fields = [content, source_name, ...]
  │
  ▼
Milvus 服务端
  │
  ├─ knowledge_domain 集合
  │   ├─ HNSW 索引 → 稠密召回
  │   └─ SPARSE_INVERTED 索引 → 稀疏召回
  │
  ├─ 加权融合 → 排序
  └─ 返回 top_k 条
  │
  ▼
解析结果
  │
  └─ list[dict] = [{content, score, metadata}, ...]
  │
  ▼
下游：Reranker 精排 → LLM 生成回答
```

---

## 八、`★` 设计亮点总结

### 8.1 Hybrid 检索

两路并行（dense + sparse），WeightedRanker 融合。兼顾语义匹配和关键词匹配，取长补短。

### 8.2 权重 7:3

基于课程问答的业务特点——语义性问题为主，关键词精确为辅。稠密主导、稀疏辅助。

### 8.3 ef=64

HNSW 搜索精度和速度的平衡点。ef 越大精度越高，但搜索时间线性增长。

### 8.4 输出字段裁剪

只返回 5 个展示字段，不包含向量。节省带宽和序列化开销。

### 8.5 异常降级

检索失败返回空列表，不抛异常。调用方不需要 try/except。

### 8.6 过滤条件

`expr=filters` 支持按 `course_id` / `tenant_id` 过滤，实现多租户和课程隔离。