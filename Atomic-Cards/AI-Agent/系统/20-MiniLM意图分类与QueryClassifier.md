---
author: "XunZong"
created: "2026-08-04"
tags: ["AI-Agent", "RAG", "意图分类", "MiniLM", "QueryClassifier"]
aliases: ["MiniLM分类", "QueryClassifier", "意图分类器", "三层分类策略"]
---

# MiniLM 意图分类与 QueryClassifier

## 定义

意图分类器（QueryClassifier）是 RAG 系统的第二道关卡，在 Redis 缓存和 MySQL FAQ 均未命中后触发，判断用户查询属于"通用知识"（General）还是"专业咨询"（Professional）。通用知识由 LLM 直接回答（免向量检索成本），专业咨询走 Milvus RAG 检索生成路径。

### 三层分类策略

```
用户查询
  → 第一层：Redis 缓存（高频查询命中）
  → 第二层：MySQL FAQ（标准问答命中）
  → 第三层：MiniLM 意图分类器（通用/专业二分类）
      → 通用知识 → LLM 直接回答
      → 专业咨询 → Milvus RAG 检索生成
```

三层分类的设计理念是"让最便宜的拦截器处理最多的请求"：Redis 毫秒级响应拦截高频问题，MySQL 处理标准 FAQ，MiniLM 只处理剩余的非标查询。

### 为什么选 MiniLM 而非 BERT 或 LLM

| 方案 | 推理速度 | 内存占用 | 准确率 | 适用场景 |
|:----|:--------:|:--------:|:-----:|:---------|
| **MiniLM 本地推理** | 快（3-5ms） | 低（~200MB） | 高（95%+） | 本项目的默认选择 |
| **BERT 微调** | 快（10-50ms） | 中（~400MB） | 高（95%+） | 类别数多的场景 |
| **LLM Prompt 分类** | 慢（500-2000ms） | 高（GPU 显存） | 依赖 LLM 能力 | 类别动态变化 |

MiniLM 的优势在于：推理速度极快（3-5ms）、内存占用低（可在 CPU 上运行）、准确率 95%+，是 RAG 系统入口高频调用的最优选择。

## QueryClassifier 实现

```python
from sentence_transformers import SentenceTransformer
import torch
import torch.nn.functional as F

class QueryClassifier:
    """MiniLM 意图分类器：通用知识 vs 专业咨询"""

    GENERAL_CONFIDENCE_THRESHOLD = 0.85  # 通用知识置信度阈值

    def __init__(self, model_path: str = "models/classifier/all-MiniLM-L6-v2"):
        self.model = SentenceTransformer(model_path)
        self.labels = ["general", "professional"]

    def classify(self, query: str) -> dict:
        """对用户查询进行意图分类，返回分类结果和置信度"""
        # 1. 编码查询文本
        emb = self.model.encode(query, convert_to_tensor=True)

        # 2. 计算与两个类别的相似度（使用预定义的类别向量）
        with torch.no_grad():
            logits = self.model.similarity(emb, self.class_vectors)
            probs = F.softmax(logits, dim=-1)

        pred_idx = torch.argmax(probs, dim=-1).item()
        confidence = probs[0][pred_idx].item()

        # 3. 规则：置信度低于阈值时，默认走专业咨询（保守策略）
        if confidence < self.GENERAL_CONFIDENCE_THRESHOLD:
            return {"intent": "professional", "confidence": confidence}

        return {"intent": self.labels[pred_idx], "confidence": confidence}
```

**阈值设计的业务逻辑**：`GENERAL_CONFIDENCE_THRESHOLD=0.85` 偏高的设定意味着只有当模型非常确信是通用知识时，才走 LLM 直接回答；否则保守地走专业咨询路径进行 RAG 检索。这是因为"通用知识误判为专业咨询"的代价（多一次向量检索）远低于"专业咨询误判为通用知识"的代价（LLM 无法回答需要检索才能获取的信息）。

## 训练与推理合一

QueryClassifier 的独特设计是**训练与推理使用同一套代码**：

```python
def train_and_save(train_data, model_path, num_epochs=3):
    """训练 MiniLM 分类模型并保存"""
    model = SentenceTransformer("all-MiniLM-L6-v2")
    # 构造训练数据：通用知识/专业咨询 二分类
    train_examples = [
        (query, label) for query, label in train_data
    ]
    # 训练分类头
    model.fit(train_examples, epochs=num_epochs)
    model.save(model_path)
```

## ML/DL 应用场景

| 应用场景 | 分类策略 | 说明 |
|:--------:|:---------|:------|
| **RAG 问答系统** | MiniLM 二分类缓存+FAQ 未命中后判断通用/专业知识路由 |
| **客服系统** | MiniLM 多分类 | 退换货 / 投诉 / 咨询 / 闲聊，每类路由到不同子系统 |
| **智能文档检索** | MiniLM 三分类 | 精确定位 / 概念理解 / 对比分析，选择不同检索策略 |

## 面试追问

**Q1（基础）**：为什么 RAG 系统入口需要三层分类策略？每层各自解决什么问题？
**回答要点**：
1. 第一层 Redis 缓存：拦截高频重复查询，毫秒级响应，零计算成本
2. 第二层 MySQL FAQ：命中标准问答对，精确匹配，无需语义检索
3. 第三层 MiniLM 分类器：对剩余非标查询做通用/专业分类，决定路由策略
4. 设计理念：让最便宜的拦截器处理最多的请求，逐层递减查询量

**Q2（深挖）**：为什么本项目选择 MiniLM 而不是 BERT 或 LLM 做意图分类？
**回答要点**：
1. MiniLM 推理速度 3-5ms，远快于 BERT 的 10-50ms 和 LLM 的 500-2000ms
2. MiniLM 内存占用约 200MB，可在 CPU 上运行，无需 GPU
3. 二分类任务固定且边界清晰，MiniLM 即可达到 95%+ 准确率，无需更大的模型
4. 成本效益比最优：MiniLM 是"足够好 + 足够快"的最佳平衡点

**Q3（实战）**：`GENERAL_CONFIDENCE_THRESHOLD=0.85` 为什么设得偏高？设低或设高各有什么影响？
**回答要点**：
1. 偏高设定意味着只有模型非常确信是通用知识时才走 LLM 直接回答
2. 偏低设定（如 0.7）：更多查询走 LLM 直接回答，速度快但可能遗漏需要检索的专业信息
3. 偏高设定（如 0.85）：保守策略，宁可多一次向量检索，也不让专业问题得不到检索支持
4. 业务逻辑：通用→专业误判的代价（多一次检索）远低于专业→通用误判的代价（LLM 无法回答）

**Q4（边界）**：MiniLM 意图分类器在实际部署中面临哪些挑战？如何应对？
**回答要点**：
1. 新意图类别扩展：需重新收集数据训练，可预留"未知类别"兜底
2. 长尾分布：少量类别占大多数查询 → 类别加权损失函数
3. 模型漂移：用户查询随时间变化 → 定期用新数据重新评估
4. 对抗性输入：恶意或拼写错误 → 置信度阈值低于 0.85 时默认走专业咨询（保守兜底）

## 参考引用

- 需要理解 BERT 微调分类模型的完整原理，参见 [意图识别(BERT微调分类模型)](06-意图识别(BERT微调分类模型).md)
- 需要理解 RAG 系统查询改写与意图识别的基础概念，参见 [RAG查询改写与意图识别](04-RAG查询改写与意图识别.md)
- 需要理解策略选择与多路径检索的后续路由逻辑，参见 [策略选择与多路径RAG检索](05-策略选择与多路径RAG检索.md)
- 需要理解预训练-微调范式的整体框架，参见 [迁移学习与微调](../../深度学习/迁移学习/01-迁移学习与微调.md)