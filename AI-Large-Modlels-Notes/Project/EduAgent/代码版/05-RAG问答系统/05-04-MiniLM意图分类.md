# MiniLM 意图分类 — 从零理解

## 一、为什么需要意图分类？

在 QA Agent 中，用户的问题分为两类：

| 类型 | 例子 | 处理方式 |
|------|------|----------|
| **通用问题（general）** | "什么是面向对象编程？" | LLM 直接回答，不需要查知识库 |
| **专业问题（specialized）** | "我们课程里双塔召回怎么实现？" | 查知识库，RAG 回答 |

**为什么不全部走 RAG？** 通用问题 LLM 自己就能回答，走 RAG 浪费资源（嵌入+检索+精排）。

**为什么不全部走 LLM 直答？** 专业问题涉及课程专属内容，LLM 没学过，必须查知识库。

## 二、三层分类体系

```
Layer 0a：规则精确匹配
  检测到"你好"、"谢谢"、"你是谁"等 → GENERAL
  检测到"课程"、"项目"、"章节"等 → SPECIALIZED

Layer 0b：关键词快判 RAG 策略
  检测到"没懂"、"解释一下" → VAGUE
  检测到"全面"、"总结" → BROAD
  其余 → PRECISE

Layer 1：MiniLM 二分类
  P(general) ≥ 0.85 → GENERAL
  其余 → SPECIALIZED（进入 Layer 2）

Layer 2：LLM 精判检索策略
  PRECISE / VAGUE / BROAD 三选一
```

## 三、QueryClassifier

### 3.1 初始化

```python
class QueryClassifier:
    def __init__(self, model_path=None):
        if model_path:
            model_id = model_path  # 加载指定模型
        else:
            model_id = finetuned_path  # 加载微调模型

        from transformers import pipeline
        self._pipeline = pipeline(
            task="text-classification",
            model=model_id,
            device=0 if torch.cuda.is_available() else -1,
            top_k=None,
            max_length=128,
        )
```

### 3.2 推理

```python
def classify(self, text: str) -> tuple[str, float]:
    raw_outputs = self._pipeline(text)[0]

    # 查找 general 标签的分数
    for item in raw_outputs:
        if item["label"].lower() in ("general", "label_0"):
            general_score = item["score"]
            break

    # P(general) >= 0.85 → general，否则 → specialized
    if general_score >= GENERAL_CONFIDENCE_THRESHOLD:  # 0.85
        return "general", general_score
    else:
        return "specialized", 1.0 - general_score
```

### 3.3 阈值为什么是 0.85？

```python
GENERAL_CONFIDENCE_THRESHOLD = 0.85
```

**宁可多走一次 RAG，不要漏掉课程相关问题。** 专业问题被误判为通用问题，LLM 用自身知识回答，可能与课程内容矛盾。

## 四、微调训练

### 4.1 训练数据格式

```jsonl
{"text": "什么是面向对象编程？", "label": "general"}
{"text": "Java 中 final 关键字有什么作用？", "label": "general"}
{"text": "商品聚合大模型中双塔召回怎么实现？", "label": "specialized"}
{"text": "LlamaFactory 怎么做 Qwen VL 微调？", "label": "specialized"}
```

### 4.2 训练流程

```python
qc = QueryClassifier(model_path="models/classifier/all-MiniLM-L6-v2")
qc.train(
    data_path="backend/training_data.jsonl",
    output_dir="models/classifier/finetuned",
    epochs=8,
    batch_size=64,
)
```

关键参数：
- `epochs=8`：训练轮数
- `batch_size=64`：批大小
- `lr=2e-5`：学习率
- `max_length=128`：Query 分类用不到长文本

## 五、分类器在 QA Agent 中的位置

```python
async def classify_query_node(state: QAState) -> dict:
    # Layer 0a：规则 → GENERAL
    if _rule_classify_general(original_query):
        return {"query_type": "GENERAL"}

    # Layer 0b：关键词 → 专业，快判策略
    if _rule_classify_specialized(original_query):
        strategy = await _determine_rag_strategy_fast(original_query)
        return {"query_type": strategy}

    # Layer 1：MiniLM 二分类
    label, confidence = await loop.run_in_executor(
        None, get_query_classifier().classify, original_query
    )

    if label == "general":
        return {"query_type": "GENERAL"}

    # Layer 2：LLM 精判检索策略
    strategy = await _determine_rag_strategy_fast(original_query)
    return {"query_type": strategy}
```

## 六、总结

```
三层分类体系：
  Layer 0a：规则匹配（< 1ms）
  Layer 0b：关键词快判（< 1ms）
  Layer 1：MiniLM 二分类（~10ms）
  Layer 2：LLM 精判（~500ms，仅对专业问题）

召回策略：
  GENERAL  → LLM 直答，跳过 RAG
  PRECISE  → 直接向量检索
  VAGUE    → 先 HyDE 再检索
  BROAD    → 先 Multi-Query 改写再并行检索
```

**核心思想：规则最快，MiniLM 次之，LLM 最慢但最准确。分层判断，尽可能早地返回。**