---
author: "XunZong"
created: "2026-07-09"
tags: ["数据库", "Milvus", "RAG", "文档处理"]
aliases: ["文档存储到Milvus", "数据导入", "Milvus Insert", "分块上传"]
---

# 分块文档存储到 Milvus

## 定义

分块文档存储到 Milvus 是指将经过切分的文档块（及其向量表示）批量写入 Milvus Collection 的过程，是 RAG 系统数据管道的核心环节。该过程涉及**数据准备**、**向量化**、**批量插入**和**刷新确认**四个阶段。

## 设计原理

### 父子块策略的权衡

父子块策略在**检索精度**与**上下文完整性**之间做权衡：

- **子块**（~200 字符）：粒度细，语义单一，检索命中精度高——查询与子块的向量相似度计算更聚焦，不易引入不相关噪声
- **父块**（~800 字符）：上下文完整，包含子块周围的背景信息，LLM 回答时不易因缺乏上下文而幻觉

**设计选择**：检索时用子块匹配 query，找到匹配后返回对应的父块给 LLM。这相当于"先精确瞄准，再完整呈现"。

### 稠密 + 稀疏双向量检索

每个子块同时存储稠密向量和稀疏向量，检索时加权融合：

| 向量类型 | 维度 | 捕获信息 | 优点 | 缺点 |
|:--------|:----:|:--------|:----|:-----|
| **稠密向量**（Dense） | 768 | 语义相似度 | 理解同义词、近义表达 | 对精确关键词不敏感 |
| **稀疏向量**（BM25） | 词典大小 | 关键词精确匹配 | 精确命中专有名词、术语 | 无法理解语义近似 |

两者互补：用户查询"如何安装 Milvus"——稠密向量找到语义相近的"部署配置"文档，稀疏向量确保名字中含"Milvus"的文档被精确召回。

### 端到端流程

$$
\text{RawDoc} \xrightarrow{\text{Chunking}} \{\text{Chunks}\} \xrightarrow{\text{Embedding}} \{\text{Chunks} + \text{Vectors}\} \xrightarrow{\text{Insert}} \text{Milvus Collection}
$$

每个分块最终在 Milvus 中的表示为一条记录 $r$：

$$
r = (\text{id}, \text{text}, \text{parent\_text}, \mathbf{v}_{\text{dense}}, \mathbf{v}_{\text{sparse}}, \text{metadata}, \text{timestamp})
$$

- $\text{id}$：主键，唯一标识一个分块
- $\text{text}$：子块原文，作为检索匹配的基本单元
- $\text{parent\_text}$：父块原文，检索命中后返回给 LLM 的完整上下文
- $\mathbf{v}_{\text{dense}}$：稠密向量 $\in \mathbb{R}^{768}$，用于语义检索
- $\mathbf{v}_{\text{sparse}}$：稀疏向量，用于关键词精确匹配
- $\text{metadata}$：元数据（来源文档名、页码、章节等），用于标量过滤
- $\text{timestamp}$：时间戳，用于增量更新和数据淘汰

## 完整代码实现

### 1. 文档切分与父子块关联

```python
import hashlib
from langchain.text_splitter import RecursiveCharacterTextSplitter

def split_document(text: str, doc_id: str) -> list[dict]:
    """
    将文档切分为父块和子块，建立父子关联。

    Args:
        text: 原始文档全文
        doc_id: 文档唯一标识

    Returns:
        list[dict]: [{parent_id, parent_text, child_text}, ...]
    """
    # 父块切分器：按段落切，保留语义完整性
    parent_splitter = RecursiveCharacterTextSplitter(
        chunk_size=800,       # 每个父块约 800 字符
        chunk_overlap=100,    # 块间重叠 100 字符，防止语义断裂
        separators=["\n\n", "\n", "。", " ", ""]  # 逐级降级切分
    )
    parent_chunks = parent_splitter.split_text(text)

    # 子块切分器：更细粒度
    child_splitter = RecursiveCharacterTextSplitter(
        chunk_size=200,
        chunk_overlap=50,
        separators=["\n", "。", " ", ""]
    )

    records = []
    for p_idx, parent in enumerate(parent_chunks):
        # 父块唯一 ID
        parent_id = f"{doc_id}_p{p_idx:04d}"

        # 从父块中切出子块
        child_chunks = child_splitter.split_text(parent)

        for c_idx, child in enumerate(child_chunks):
            child_id = f"{parent_id}_c{c_idx:04d}"
            records.append({
                "child_id": child_id,
                "parent_id": parent_id,
                "child_text": child,
                "parent_text": parent,
            })

    return records
```

### 2. 向量化（稠密 + 稀疏）

```python
from sentence_transformers import SentenceTransformer
from pymilvus import model as milvus_model

# 稠密向量模型：BGE-M3 或 text2vec
dense_encoder = SentenceTransformer(
    "BAAI/bge-m3",               # 支持稠密+稀疏+多语言
    device="cpu"
)

# 稀疏向量模型：Milvus 内置 BM25 或 SPLADE
sparse_encoder = milvus_model.sparse.BM25EmbeddingFunction("zh")  # 中文 BM25

def encode_chunks(records: list[dict]) -> list[dict]:
    """
    为每条记录生成稠密向量和稀疏向量。
    """
    child_texts = [r["child_text"] for r in records]

    # 生成稠密向量：每条文本 -> 768 维浮点数组
    dense_vectors = dense_encoder.encode(
        child_texts,
        normalize_embeddings=True,   # L2 归一化，使内积等价于余弦相似度
        show_progress_bar=True
    )

    # 生成稀疏向量：BM25 稀疏表示
    sparse_vectors = sparse_encoder.encode_documents(child_texts)

    # 将向量附加到记录
    for i, r in enumerate(records):
        r["dense_vector"] = dense_vectors[i].tolist()
        r["sparse_vector"] = sparse_vectors[i]

    return records
```

### 3. 批量插入 Milvus

```python
from pymilvus import Collection, utility

def insert_to_milvus(
    collection: Collection,
    records: list[dict],
    batch_size: int = 100
) -> int:
    """
    将分块记录批量插入 Milvus 集合。

    Args:
        collection: 已创建的 Milvus Collection 对象
        records: 包含向量和文本的记录列表
        batch_size: 每批插入的记录数（Milvus 推荐 100~500）

    Returns:
        int: 成功插入的记录总数
    """
    total_inserted = 0

    for i in range(0, len(records), batch_size):
        batch = records[i:i + batch_size]

        # 按字段组织插入数据（field_name -> values）
        insert_data = [
            [r["child_text"] for r in batch],        # text 字段
            [r["parent_text"] for r in batch],        # parent_text 字段
            [r["dense_vector"] for r in batch],       # dense_vector 字段
            [r["sparse_vector"] for r in batch],      # sparse_vector 字段
            [r.get("source", "") for r in batch],     # source 字段
            [r.get("timestamp", 0) for r in batch],   # created_at 字段
        ]

        # 执行插入
        insert_result = collection.insert(insert_data)
        total_inserted += len(batch)

        print(f"  已插入 {total_inserted}/{len(records)} 条")

    # 手动刷新（立即生效，否则需等待 ~1 秒自动刷新）
    collection.flush()

    return total_inserted
```

### 4. 完整调用示例

```python
# ===== 执行完整流程 =====

# 1. 准备文档
raw_text = open("document.txt", encoding="utf-8").read()

# 2. 切分
chunks = split_document(raw_text, doc_id="doc_001")
print(f"文档切分为 {len(chunks)} 个子块")

# 3. 向量化
chunks_with_vec = encode_chunks(chunks)

# 4. 连接并获取 Collection
connections.connect(host="localhost", port="19530")
collection = Collection("rag_docs")

# 5. 插入
insert_count = insert_to_milvus(collection, chunks_with_vec)
print(f"成功插入 {insert_count} 条记录到 Milvus")
```

## 批量插入注意事项

| 要点 | 推荐做法 | 原因 |
|:----|:---------|:-----|
| **批次大小** | 100~500 条/批 | 过小导致网络开销大，过大导致内存压力大 |
| **数据格式** | 字段按 `collection.insert()` 的顺序组织 | Milvus 接受列式数据（每个字段一个列表） |
| **主键冲突** | `auto_id=True` 或手动去重 | 主键重复会覆盖已有记录，可能导致数据丢失 |
| **索引状态** | 插入前索引已创建，数据自动索引 | 插入后无需重新创建索引，但需调用 `load()` 才能检索 |
| **数据校验** | 向量维度与 Schema 中 `dim` 一致 | 维度不一致导致插入失败 |
| **Flush** | 批量插入后调用 `collection.flush()` | 确保数据持久化到磁盘，检索时才可见 |

## ML/DL 应用场景

| 应用场景 | 数据流 | 说明 |
|:--------|:-------|:-----|
| **RAG 知识库构建** | PDF/文档->切分->向量化->Milvus | 企业知识库批量入库，支持增量更新 |
| **增量更新** | 新增文档只插入新记录，`auto_id` 避免冲突 | 定期爬取新文档后增量追加到 Milvus |
| **数据清洗** | 按 `source` 字段删除旧数据，重新插入 | 文档更新后删除旧版本记录，重新插入新版本 |
| **多租户隔离** | 用 `tenant_id` 字段区分不同用户的数据 | 所有数据在同一集合，检索时用标量过滤隔离 |

## 面试追问

**Q1（基础）**：将分块文档存入 Milvus 需要哪几个步骤？
**回答要点**：

1. 文档切分：将长文档切分为父子文档块，建立父子关联 ID
2. 向量化：为每个子块生成稠密向量（语义）和稀疏向量（关键词）
3. 按字段组织数据：text、parent_text、dense_vector、sparse_vector、metadata
4. 批量插入：每批 100-500 条，调用 `collection.insert()` 写入
5. 刷新确认：调用 `collection.flush()` 确保持久化

**Q2（深挖）**：批量插入时批次大小对性能有什么影响？如何选择最优批次？
**回答要点**：

1. 批次过小（<10）：网络往返次数多，gRPC 连接开销占比高，总吞吐下降
2. 批次过大（>1000）：Milvus 服务端内存压力大，可能触发 OOM 或 GC 停顿
3. 推荐 100-500：平衡网络开销和服务端内存压力，实测吞吐最高
4. 如果使用 GPU 索引（GPUIVF），建议更小的批次（50-100）以避免 GPU 内存溢出

**Q3（实战）**：如何处理大规模文档（百万级）的 Milvus 入库？
**回答要点**：

1. 使用批量导入工具 `bulk_insert`（基于 pandas/numpy 的高效格式），比逐批 insert 快 10x+
2. 使用分布式 Milvus（Mishards 或 Milvus Cluster），分片并行写入
3. 数据先写入临时集合，建索引后 `load()`，再用 `rename` 切换生产集合实现零停机更新
4. 结合消息队列（如 Kafka），用生产者-消费者模式实现流式入库

**Q4（边界）**：Milvus 插入数据后立刻检索查不到结果是什么原因？如何解决？
**回答要点**：

1. 原因：插入的数据需要等待索引构建和刷新，不是实时可见的
2. 解决：插入后调用 `collection.flush()` 强制持久化（或等待约 1 秒自动 flush）
3. 索引构建是异步的：大批量插入后索引排队构建，未构建索引的数据段使用暴力搜索（速度慢但结果正确）
4. 生产建议：批量插入完成后显式调用 `flush()`，再用 `collection.load()` 加载到内存后开始检索

## 参考引用

- 需要理解父子文档分块的原理和参数配置，参见 [父文档与子文档分块策略](../../AI-Agent/RAG流程/04-父文档与子文档分块策略.md)
- 需要理解 Milvus 集合创建与 Schema 设计，参见 [Milvus集合创建与字段设计](05-Milvus集合创建与字段设计.md)
- 需要理解稠密向量与稀疏向量的区别，参见 [稠密向量与稀疏向量](../检索/06-稠密向量与稀疏向量.md)
- 需要理解 Milvus 索引类型和距离度量的选择，参见 [Milvus核心概念](02-Milvus核心概念.md)
- 需要理解 Milvus Python SDK 的基本操作，参见 [Milvus Python操作指南](03-Milvus Python操作指南.md)