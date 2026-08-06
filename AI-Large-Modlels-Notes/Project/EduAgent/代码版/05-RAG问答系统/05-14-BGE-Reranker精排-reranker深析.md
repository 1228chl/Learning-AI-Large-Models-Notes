# BGE-Reranker 精排：`reranker.py` 深度解析

> 源文件：`backend/core/reranker.py`（共 212 行）
> 对应课件：5.6 Hybrid 检索与精排

## 一、文件定位

`reranker.py` 是两阶段检索流水线的**第二步**——先用 Milvus Hybrid 粗召回，再用 BGE-Reranker CrossEncoder 精排。

```
知识库检索流水线：
  Query → BGE-M3 编码 → Milvus Hybrid 召回（粗排）→ BGE-Reranker 精排 → LLM 生成
                            ↑                            ↑
                     knowledge_base.py              reranker.py
                     _hybrid_search()               retrieve()
```

---

## 二、为什么需要两阶段？

文件开头有一段清晰的对比注释（第 10~19 行）：

```
Bi-Encoder（BGE-M3） vs CrossEncoder（BGE-Reranker）：
               Bi-Encoder (BGE-M3)     CrossEncoder (Reranker)
输入方式       Query 和 Doc 分别编码     Query + Doc 拼接后编码
计算方式       向量内积/余弦相似度        全序列交叉注意力
速度           快，doc 可离线预计算        慢，每次需完整过模型
精度           较好，适合大规模粗排         更高，适合精细排序
输出           向量相似度（需后处理）        sigmoid 概率 [0,1] 直接用
```

**核心思路**：先用快的（Bi-Encoder）从海量文档中召回 Top-10 候选，再用慢但准的（CrossEncoder）精排取 Top-3。

| 阶段 | 模型 | 输入 | 速度 | 精度 |
|------|------|------|------|------|
| 粗排 | BGE-M3（Bi-Encoder） | 百万级文档 | 快 | 较好 |
| 精排 | BGE-Reranker（CrossEncoder） | 10 条候选 | 慢 | 更高 |

---

## 三、`RankedDocument`：精排结果（第 45~52 行）

```python
@dataclass
class RankedDocument:
    """精排后的单个文档结果"""
    content:        str    # 文档文本
    score:          float  # BGE-Reranker 输出的相关性概率 [0, 1]
    original_index: int    # 在原始召回列表中的位置（0 起），用于追溯
    metadata:       dict   # 来源元数据（source_name / chunk_type / course_id 等）
```

`original_index` 保留原始召回位置，方便溯源——如果精排结果有问题，可以追溯到粗召回阶段。

---

## 四、`BGEReranker`：单例精排服务（第 54~98 行）

### 4.1 模型初始化（第 72~91 行）

```python
def __init__(self):
    os.environ["ACCELERATE_USE_META_DEVICE"] = "0"
    settings = get_settings()
    model_path = os.path.join(backend_path, settings.reranker_model_path)

    # 优先加载本地模型（下载到本地的 bge-reranker-v2-m3）
    use_local = (
        os.path.exists(model_path)
        and os.path.isdir(model_path)
        and any(f.endswith((".bin", ".safetensors", ".json")) for f in os.listdir(model_path))
    )
    model_id = model_path if use_local else "BAAI/bge-reranker-v2-m3"
    device = "cuda" if torch.cuda.is_available() else "cpu"

    self._model = CrossEncoder(model_id, device=device, max_length=512)
```

**本地优先**：先检查本地是否有下载好的模型文件（`.bin` / `.safetensors` / `.json`），有则用本地，没有则从 HuggingFace 在线加载。离线部署友好。

**`max_length=512`**：CrossEncoder 的输入长度限制。对应的常量 `RERANK_MAX_INPUT_CHARS=1200`（第 42 行）确保截断后的文本在 512 token 以内。

### 4.2 单例模式（第 93~98 行）

```python
@classmethod
def get_instance(cls) -> "BGEReranker":
    if cls._instance is None:
        cls._instance = cls()
    return cls._instance
```

模型加载约 5-10 秒，全局只加载一次。

---

## 五、`rerank_with_confidence`：精排核心（第 100~160 行）

```python
def rerank_with_confidence(
    self,
    query: str,
    documents: list[dict],     # 每个 dict 需含 "content" 字段
    top_k: int = 3,
) -> tuple[list[RankedDocument], float]:
```

### 5.1 构建句对（第 126~129 行）

```python
pairs = [
    (query, (doc.get("content") or "")[:RERANK_MAX_INPUT_CHARS])
    for doc in documents
]
```

CrossEncoder 的输入是 `(query, document)` 句对。`[:1200]` 截断到 1200 字符，防止超出 `max_length=512` 的限制。

### 5.2 逐对打分（第 132 行）

```python
scores: list[float] = self._model.predict(pairs).tolist()
```

`predict()` 返回 `[0, 1]` 概率——CrossEncoder 内部做了 sigmoid 激活，**不需要额外归一化**。

### 5.3 排序 + 取 Top-K（第 135~151 行）

```python
ranked = sorted(
    [RankedDocument(...) for i in range(len(documents))],
    key=lambda x: x.score,
    reverse=True,
)
top_results = ranked[:top_k]
confidence = top_results[0].score if top_results else 0.0
```

### 5.4 置信度阈值

`confidence` 是 Top-1 的分数，下游用这个值判断走哪个路径：

| 置信度 | 路径 | 说明 |
|--------|------|------|
| ≥ 0.75 | RAG 生成 | 严格基于知识库回答 |
| < 0.75 | Web 搜索兜底或 LLM 直答 | 知识库不够相关，换其他来源 |

---

## 六、`retrieve`：完整检索流水线（第 165~212 行）

```python
def retrieve(
    query: str,
    tenant_id: str,
    course_id: str | None = None,
    recall_top_k: int = 10,
    rerank_top_k: int = 3,
) -> tuple[list[RankedDocument], float]:
```

### 6.1 三步流程

```python
# Step 1：BGE-M3 编码
embedder = BGEMEmbedder.get_instance()
dense_vec, sparse_vec = embedder.encode_query(query)

# Step 2：Milvus Hybrid 检索
kb = KnowledgeBaseClient()
filters = kb._build_filter(tenant_id, course_id)
candidates = kb._hybrid_search(dense_vec, sparse_vec, top_k=recall_top_k, filters=filters)

if not candidates:
    return [], 0.0

# Step 3：BGE-Reranker 精排
reranker = BGEReranker.get_instance()
return reranker.rerank_with_confidence(query, candidates, top_k=rerank_top_k)
```

| 步骤 | 函数 | 输入 → 输出 | 数量变化 |
|------|------|------------|---------|
| ① BGE-M3 编码 | `encode_query` | query → dense + sparse 向量 | — |
| ② Milvus Hybrid 召回 | `_hybrid_search` | 向量 → 候选文档 | 全量 → 10 |
| ③ BGE-Reranker 精排 | `rerank_with_confidence` | 候选 → 排序后结果 | 10 → 3 |

### 6.2 为什么是同步函数？

注释特别说明（第 175~177 行）：

```python
# 注意：这是一个同步函数（内部包含 BGE-M3 CPU 推理 + Milvus 阻塞 IO），
# 在 async 环境中调用时必须用 run_in_executor 包装，避免阻塞事件循环。
# 在 QA Agent 的 retrieve_node 中就是这样做的。
```

BGE-M3 推理是 CPU-bound，Milvus 查询是阻塞 IO——两者都不是纯异步的，所以 async 环境里要用 `run_in_executor` 包装。

---

## 七、完整数据流

```
用户查询："什么是 Spring IOC？"
          │
          ▼
BGE-M3 编码查询
          │
          ├─ dense_vec  (1024 维, 语义)
          └─ sparse_vec ({token_id: weight}, 关键词)
          │
          ▼
Milvus Hybrid 检索（粗排，top_k=10）
          │
          ├─ 候选 1: "IOC 容器..."        score: 0.82
          ├─ 候选 2: "Spring 框架..."     score: 0.75
          ├─ 候选 3: "AOP 与代理..."      score: 0.62
          ├─ ...
          └─ 候选 10: "事务管理..."       score: 0.31
          │
          ▼
BGE-Reranker CrossEncoder 精排（top_k=3）
          │
          ├─ 1: "IOC 容器..."             score: 0.91  ← 置信度 0.91 ≥ 0.75
          ├─ 2: "Spring 框架..."          score: 0.83
          └─ 3: "Bean 生命周期..."        score: 0.72
          │
          ▼
置信度判断
          │
          ├─ ≥ 0.75 → RAG 生成（严格基于知识库）
          └─ < 0.75 → Web 搜索兜底或 LLM 直答
```

---

## 八、`★` 设计亮点总结

### 8.1 两阶段检索

```
粗排（Bi-Encoder）：快，覆盖百万级文档
精排（CrossEncoder）：准，交叉注意力交互
```

### 8.2 10 → 3 的候选缩减

召回 10 条候选，精排取 3 条。10 条足够覆盖相关信息，3 条喂给 LLM 生成回答。经验平衡值，可按实际场景调整。

### 8.3 置信度阈值 0.75

精排结果指导下游路径选择：

| 置信度 | 行为 |
|--------|------|
| ≥ 0.75 | RAG 生成（严格基于知识库） |
| < 0.75 | Web 搜索兜底或 LLM 直答 |

### 8.4 本地模型优先

先检查本地文件，没有再下载。离线部署友好，生产环境不需要访问 HuggingFace。

### 8.5 单例模式

`get_instance()` 模型只加载一次，后续调用零开销。

### 8.6 同步包装

显式标注为同步函数，提示在 async 环境用 `run_in_executor` 包装，避免阻塞事件循环。

### 8.7 与 `_hybrid_search` 的协作

| 组件 | 文件 | 职责 |
|------|------|------|
| `_hybrid_search` | `knowledge_base.py` | 向量检索粗排，返回候选 |
| `rerank_with_confidence` | `reranker.py` | CrossEncoder 精排，重排序 |
| `retrieve` | `reranker.py` | 编排以上两步，对外提供统一接口 |