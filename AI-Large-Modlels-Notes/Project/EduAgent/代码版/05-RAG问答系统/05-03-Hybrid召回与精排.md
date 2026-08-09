# Hybrid 混合检索与精排

> 源文件：`backend/core/reranker.py`（211 行）

---

## 全文行号速查表

| 行号范围 | 符号 | 层级 | 说明 |
|----------|------|------|------|
| 1-26 | 注释 | 文件头 | 两阶段检索理由、Bi-Encoder vs CrossEncoder 对比、置信度阈值 |
| 27-38 | import | 模块级 | 导入 os, dataclass, typing, torch, CrossEncoder, config, logger |
| 40-42 | 常量 | 模块级 | `RERANK_MAX_INPUT_CHARS = 1200` |
| 46-52 | `@dataclass RankedDocument` | 类 | 精排后的单个文档结果 |
| 54-161 | `class BGEReranker` | 类 | BGE-Reranker 精排服务（单例） |
| 54-91 | `__init__` | 方法 | 初始化：禁用 meta device + 加载 CrossEncoder |
| 70 | `_instance` | 类变量 | 单例持有 |
| 93-98 | `get_instance()` | 类方法 | 获取单例 |
| 100-160 | `rerank_with_confidence()` | 方法 | 精排并返回置信度 |
| 163-211 | `def retrieve()` | 函数 | 完整检索流水线：BGE-M3 编码 → Milvus Hybrid 召回 → BGE-Reranker 精排 |

---

## 一、类签名与动机

### 1.1 为什么需要两阶段检索？

| 阶段 | 方法 | 输入 | 速度 | 精度 | 用途 |
|------|------|------|------|------|------|
| 粗排 | 向量检索（Bi-Encoder） | Query 和 Doc 分别编码 | 快，doc 可离线预计算 | 较好 | 海量数据快速筛选 |
| 精排 | CrossEncoder | Query + Doc 拼接后编码 | 慢，每次需完整过模型 | 更高 | 小规模精细排序 |

**为什么精排只对 Hybrid 召回的 Top-10 候选做？** 因为 CrossEncoder 每次推理要完整跑一遍模型，速度比向量检索慢 10-100 倍，只能用在候选数量少的阶段。

### 1.2 置信度阈值

```
≥ 0.75 → 高置信度，走 RAG 生成（严格基于知识库）
< 0.75 → 低置信度，走 Web 搜索兜底或 LLM 直答
```

### 1.3 检索流水线

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

---

## 二、RankedDocument 数据类

```python
# reranker.py 第 46~52 行
@dataclass
class RankedDocument:
    content:        str    # 文档文本
    score:          float  # BGE-Reranker 输出的相关性概率 [0, 1]
    original_index: int    # 在原始召回列表中的位置（0 起）
    metadata:       dict   # 来源元数据
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 46 | `@dataclass` | Python dataclass 装饰器 |
| 49 | `score: float` | BGE-Reranker 输出的相关性概率 [0, 1]，可直接用作置信度 |
| 50 | `original_index: int` | 在原始召回列表中的位置，用于追溯和调试 |
| 51 | `metadata: dict` | 来源元数据（source_name / chunk_type / course_id 等） |

---

## 三、BGEReranker 逐行精读

### 3.1 __init__ 初始化

```python
# reranker.py 第 54~91 行
class BGEReranker:
    _instance: Optional["BGEReranker"] = None

    def __init__(self):
        os.environ["ACCELERATE_USE_META_DEVICE"] = "0"
        settings = get_settings()
        model_path = os.path.join(backend_path, settings.reranker_model_path)

        use_local = (
            os.path.exists(model_path)
            and os.path.isdir(model_path)
            and any(f.endswith((".bin", ".safetensors", ".json")) for f in os.listdir(model_path))
        )
        model_id = model_path if use_local else "BAAI/bge-reranker-v2-m3"
        device = "cuda" if torch.cuda.is_available() else "cpu"

        self._model = CrossEncoder(model_id, device=device, max_length=512)
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 54-68 | 类签名 + docstring | BGE-Reranker-v2-m3 精排服务（单例）。对 Hybrid 召回的候选文档做 CrossEncoder 精排，直接返回 [0, 1] 置信度，无需额外归一化（CrossEncoder 内部已做 sigmoid） |
| 70 | `_instance: Optional["BGEReranker"] = None` | 单例持有 |
| 72-91 | `def __init__(self):` | 构造函数 |
| 74 | `os.environ["ACCELERATE_USE_META_DEVICE"] = "0"` | 禁用 accelerate 的 meta device（避免与 CrossEncoder 的 device 参数冲突） |
| 80-84 | `use_local = ...` | 优先加载本地模型，检查模型目录是否存在且包含模型文件（.bin / .safetensors / .json） |
| 85 | `model_id = model_path if use_local else "BAAI/bge-reranker-v2-m3"` | 本地不存在时回退到 HuggingFace 在线加载 |
| 86 | `device = "cuda" if torch.cuda.is_available() else "cpu"` | CUDA 优先，否则 CPU |
| 90 | `self._model = CrossEncoder(model_id, device=device, max_length=512)` | 加载 CrossEncoder 模型，max_length=512 是输入 token 限制 |

### 3.2 get_instance() 单例

```python
# reranker.py 第 93~98 行
@classmethod
def get_instance(cls) -> "BGEReranker":
    if cls._instance is None:
        cls._instance = cls()
    return cls._instance
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 93 | `@classmethod` | 类方法 |
| 96-97 | `if cls._instance is None: cls._instance = cls()` | 懒加载：首次调用时创建实例 |
| 98 | `return cls._instance` | 返回单例 |

### 3.3 rerank_with_confidence() 精排核心方法

```python
# reranker.py 第 100~160 行
def rerank_with_confidence(
    self, query: str, documents: list[dict], top_k: int = 3,
) -> tuple[list[RankedDocument], float]:
    if not documents:
        return [], 0.0

    pairs = [
        (query, (doc.get("content") or "")[:RERANK_MAX_INPUT_CHARS])
        for doc in documents
    ]
    scores: list[float] = self._model.predict(pairs).tolist()

    ranked = sorted(
        [
            RankedDocument(
                content=documents[i].get("content", ""),
                score=scores[i],
                original_index=i,
                metadata=documents[i].get("metadata", {}),
            )
            for i in range(len(documents))
        ],
        key=lambda x: x.score, reverse=True,
    )
    top_results = ranked[:top_k]
    confidence = top_results[0].score if top_results else 0.0
    return top_results, confidence
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 100-105 | `def rerank_with_confidence(self, query, documents, top_k=3):` | 精排方法签名。返回 `(ranked_docs, confidence)`，`confidence` 是 Top-1 文档的 BGE 相关性概率 [0, 1] |
| 121-122 | `if not documents: return [], 0.0` | 空列表快速返回 |
| 126-129 | `pairs = [...]` | 构建 CrossEncoder 输入格式：`(query, document)` 句对。对过长文档截断到 `RERANK_MAX_INPUT_CHARS=1200` 字符（约 300 token，在 512 限长内） |
| 132 | `scores = self._model.predict(pairs).tolist()` | CrossEncoder 推理，返回 [0, 1] 概率。`predict()` 内部做 sigmoid 激活 |
| 135-147 | `ranked = sorted(...)` | 按 score 降序排列，构造 `RankedDocument` 列表 |
| 150 | `top_results = ranked[:top_k]` | 取 top_k |
| 151 | `confidence = top_results[0].score if top_results else 0.0` | Top-1 置信度，用于下游判断：≥ 0.75 走 RAG 生成，< 0.75 走 Web 兜底 |

---

## 四、retrieve() 对外接口

```python
# reranker.py 第 165~211 行
def retrieve(
    query: str,
    tenant_id: str,
    course_id: str | None = None,
    recall_top_k: int = 10,
    rerank_top_k: int = 3,
) -> tuple[list[RankedDocument], float]:
    from backend.core.knowledge_base import BGEMEmbedder, KnowledgeBaseClient

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

| 行号 | 代码 | 说明 |
|------|------|------|
| 165-171 | `def retrieve(query, tenant_id, course_id=None, recall_top_k=10, rerank_top_k=3):` | 完整检索流水线。同步函数，内部包含 BGE-M3 CPU 推理 + Milvus 阻塞 IO，在 async 环境中必须用 `run_in_executor` 包装 |
| 196 | `from backend.core.knowledge_base import ...` | 函数内延迟 import，避免循环依赖 |
| 199-200 | Step 1：BGE-M3 编码 | 同时得到 dense 向量（语义）+ sparse 向量（关键词） |
| 203-205 | Step 2：Milvus Hybrid 检索 | 构建过滤表达式，调用 `_hybrid_search` 用 WeightedRanker 融合两路结果 |
| 207-208 | `if not candidates: return [], 0.0` | 无候选时快速返回 |
| 211-212 | Step 3：BGE-Reranker 精排 | CrossEncoder 逐对打分，返回排序后的结果和置信度 |

---

## 五、检索路径（QA Agent 中的调用）

| 路径 | query 文本 | recall_top_k | 说明 |
|------|-----------|-------------|------|
| PRECISE | `original_query` | 8 | 直接检索 |
| VAGUE | `hyde_document` | 10 | 用假设文档检索 |
| BROAD | 每个 `rewritten_query` | 4/每个 | 并行检索后合并去重 |

---

## 六、依赖关系

```
reranker.py
  ├── sentence_transformers → CrossEncoder（精排模型）
  ├── torch → torch.cuda.is_available()（设备检测）
  ├── backend.config → get_settings（配置）
  ├── backend.core.logger → get_logger（日志）
  └── backend.core.knowledge_base → BGEMEmbedder, KnowledgeBaseClient（运行时 import）
```

---

## 七、设计亮点

```python
# ★ Insight ─── 为什么是 1200 字符（RERANK_MAX_INPUT_CHARS）？
# CrossEncoder 的 max_length=512 token，超过此长度的文档会被截断。
# 截断后丢失尾部信息，影响精排质量。
# 1200 字符 ≈ 300 token（中文字符平均约 2 个 token），在 512 限长内留有余量。
# 即使少数文档超过 1200 字符，截断后仍保留主要语义，不会严重影响精排效果。
```

```python
# ★ Insight ─── 为什么 retrieve() 在函数内延迟 import？
# reranker.py 是检索模块，knowledge_base.py 是嵌入和存储模块。
# 如果模块级 import knowledge_base，任何 import reranker 的代码都会
# 触发 BGEM3FlagModel 的导入（即使当前不需要），增加启动时间。
# 延迟 import 只在 retrieve() 实际调用时加载，启动时零开销。
```

```python
# ★ Insight ─── 置信度 0.75 阈值的设计哲学
# 宁可多走一次 Web 搜索兜底，不要用低置信度结果做 RAG 生成。
# 如果 RAG 基于不相关文档生成答案，LLM 会编造看似合理但实际错误的内容
# （hallucination）。低置信度 → Web 搜索 → LLM 直答，虽然增加了一次
# 网络请求，但比 RAG 幻觉更可控。
```

---

## 八、边界情况与异常处理

| 场景 | 表现 | 处理 |
|------|------|------|
| Milvus 不可用 | `_hybrid_search` 抛连接异常 | `retrieve()` 异常上抛，由 `retrieve_node` 的 `run_in_executor` 传播到 LangGraph，触发低置信度兜底 |
| 知识库为空（无任何 chunk） | 检索返回空列表 `[]` | `ranked_chunks` 为空 → `is_high_confidence=False` → 走 `llm_direct` 或 `web_augmented` 兜底 |
| 精排分数异常（全 0 或全 1） | `confidence` 计算异常 | `rerank_with_confidence` 的 `max_score` 可能为 0，`confidence = 0` → 低置信度兜底 |
| BGE-M3 模型加载失败 | `get_instance()` 抛异常 | 模型单例首次加载时失败，`retrieve()` 无法执行，异常上抛 |
| BGE-Reranker 模型加载失败 | `get_instance()` 抛异常 | 精排模型加载失败，`retrieve()` 退化为仅粗排 |
| 超长文档（超过 512 限制） | CrossEncoder 报错或截断 | `rerank_with_confidence` 按 512 字符截断，超过部分丢失 |

---

## 核心思想

```
BGE-M3 编码（双向量）
    │
    ▼
Milvus Hybrid Search（Dense + Sparse → WeightedRanker）
    │
    ▼
BGE-Reranker 精排（CrossEncoder → [0, 1] 概率）
    │
    ▼
置信度 ≥ 0.75 → RAG 生成
置信度 < 0.75 → Web 搜索 → LLM 直答
```

**粗排（向量检索）+ 精排（CrossEncoder）两阶段，兼顾速度和精度。置信度阈值确保 RAG 只使用高相关性文档，避免幻觉。**