# MiniLM 意图分类

> 源文件：`backend/core/query_classifier.py`（419 行）

---

## 全文行号速查表

| 行号范围 | 符号 | 层级 | 说明 |
|----------|------|------|------|
| 1-28 | import | 模块级 | 导入 json, os, random, Path, typing, torch, config, logger |
| 30-39 | 标签映射 | 常量 | LABEL2ID, ID2LABEL, GENERAL_CONFIDENCE_THRESHOLD |
| 42-365 | `class QueryClassifier` | 类 | QA Query 二分类器：general / specialized |
| 42-59 | 类签名 + docstring + `_instance` | 类 | 类定义、单例持有 |
| 61-93 | `__init__` | 方法 | 初始化：设备检测 + pipeline 构建 |
| 95-100 | `get_instance()` | 类方法 | 获取单例 |
| 104-246 | `train()` | 方法 | 微调训练（分层切分 + HF Trainer） |
| 250-294 | `classify()` | 方法 | 推理：general / specialized 二分类 |
| 298-325 | `_load_jsonl()` | 静态方法 | 加载 JSONL 训练数据 |
| 327-365 | `_stratified_split()` | 静态方法 | 按标签分层切分 |
| 368 | `_classifier` | 模块级变量 | 单例持有 |
| 373-384 | `get_query_classifier()` | 函数 | 模块级单例获取函数 |
| 389-419 | `if __name__ == "__main__"` | 入口 | 离线测试 |

---

## 一、类签名与动机

### 1.1 为什么需要意图分类？

在 QA Agent 中，用户的问题分为两类：

| 类型 | 例子 | 处理方式 |
|------|------|----------|
| **通用问题（general）** | "什么是面向对象编程？" | LLM 直接回答，不需要查知识库 |
| **专业问题（specialized）** | "我们课程里双塔召回怎么实现？" | 查知识库，RAG 回答 |

**为什么不全部走 RAG？** 通用问题 LLM 自己就能回答，走 RAG 浪费资源（嵌入+检索+精排）。

**为什么不全部走 LLM 直答？** 专业问题涉及课程专属内容，LLM 没学过，必须查知识库。

### 1.2 分层分类体系

```
Layer 0a：规则精确匹配（"你好"→GENERAL，最快，<1ms）
Layer 0b：关键词快判（"课程"→SPECIALIZED，<1ms）
Layer 1：MiniLM 二分类（本模块，~10ms）
Layer 2：LLM 精判检索策略（~500ms，仅对 SPECIALIZED）
```

### 1.3 标签映射与阈值

```python
# query_classifier.py 第 30~39 行
LABEL2ID = {"general": 0, "specialized": 1}
ID2LABEL  = {0: "general",  1: "specialized"}
GENERAL_CONFIDENCE_THRESHOLD = 0.85
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 33 | `LABEL2ID = {"general": 0, "specialized": 1}` | 训练时把标签名转成数字 ID（模型只认数字） |
| 34 | `ID2LABEL = {0: "general", 1: "specialized"}` | 推理时把数字 ID 转回标签名 |
| 39 | `GENERAL_CONFIDENCE_THRESHOLD = 0.85` | general 侧置信度阈值设偏高。专业问题被误判为通用问题的代价更高——LLM 会用自身知识回答，可能与课程内容矛盾。宁可多走一次 RAG，不要漏掉课程相关问题 |

---

## 二、QueryClassifier 逐行精读

### 2.1 __init__ 初始化

```python
# query_classifier.py 第 61~93 行
def __init__(self, model_path: Optional[str] = None):
    settings = get_settings()
    if model_path:
        model_id = model_path
        self._is_finetuned = False if model_path == os.path.join(backend_path, settings.classifier_model_path) else True
    else:
        model_id = os.path.join(backend_path, settings.finetuned_classifier_path)
        self._is_finetuned = True
    device = 0 if torch.cuda.is_available() else -1
    from transformers import pipeline as hf_pipeline
    self._pipeline = hf_pipeline(
        task="text-classification",
        model=model_id,
        device=device,
        top_k=None,
        truncation=True,
        max_length=128,
    )
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 61 | `def __init__(self, model_path: Optional[str] = None):` | 构造函数 |
| 70-73 | `if model_path:` | 显式传入路径 → 加载该路径模型（可用于加载基座或任意微调模型） |
| 74-77 | `else:` | None（默认）→ 加载微调模型（FINETUNED_CLASSIFIER_PATH） |
| 80 | `device = 0 if torch.cuda.is_available() else -1` | device=0 表示第一个 GPU，device=-1 表示 CPU |
| 84-92 | `self._pipeline = hf_pipeline(...)` | HuggingFace pipeline 封装 tokenizer + model + softmax 全流程。`top_k=None` 返回所有标签的分数；`truncation=True` 超长文本截断；`max_length=128` Query 分类用不到长文本 |

### 2.2 get_instance() 单例

```python
# query_classifier.py 第 95~100 行
@classmethod
def get_instance(cls) -> "QueryClassifier":
    if cls._instance is None:
        cls._instance = cls()
    return cls._instance
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 95 | `@classmethod` | 类方法 |
| 98-99 | `if cls._instance is None: cls._instance = cls()` | 懒加载：首次调用时创建 |
| 100 | `return cls._instance` | 返回单例 |

### 2.3 train() 微调训练

```python
# query_classifier.py 第 104~246 行
def train(self, data_path, output_dir, epochs=8, batch_size=64, lr=2e-5,
          max_length=128, val_ratio=0.1, test_ratio=0.1, seed=42) -> None:
    import numpy as np
    from transformers import AutoModelForSequenceClassification, AutoTokenizer, Trainer, TrainingArguments
    set_seed(seed)
    rows = self._load_jsonl(data_path)
    train_rows, val_rows, test_rows = self._stratified_split(rows, val_ratio, test_ratio, seed)
    model_id = self._pipeline.model.config._name_or_path
    model = AutoModelForSequenceClassification.from_pretrained(
        model_id, num_labels=2, label2id=LABEL2ID, id2label=ID2LABEL,
        ignore_mismatched_sizes=True,
    )
    trainer = Trainer(model=model, args=train_args, train_dataset=train_ds,
                      eval_dataset=val_ds, data_collator=DataCollatorWithPadding(tokenizer),
                      compute_metrics=compute_metrics,
                      callbacks=[EarlyStoppingCallback(early_stopping_patience=2)])
    trainer.train()
    trainer.save_model(output_dir)
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 104-115 | `def train(self, data_path, output_dir, epochs=8, batch_size=64, ...):` | 微调当前加载的基座模型。默认 epochs=8（MiniLM 参数量小不需要太多轮次）、batch_size=64、lr=2e-5、max_length=128 |
| 137-149 | import 训练库 | **训练库仅在此方法内 import**，推理路径不加载这些依赖（减少启动时间） |
| 151 | `set_seed(seed)` | 固定随机种子，保证可复现 |
| 154-157 | `rows = self._load_jsonl(data_path)` + 分层切分 | 加载数据，按标签分层切分训练/验证/测试集 |
| 163 | `model_id = self._pipeline.model.config._name_or_path` | 从当前 pipeline 的 model 取出 model_id，确保训练和推理用同一个模型 |
| 165-171 | `AutoModelForSequenceClassification.from_pretrained(...)` | `num_labels=2` 二分类；`label2id`/`id2label` 标签映射；`ignore_mismatched_sizes=True` 分类头从 2 类随机初始化（基座模型没有分类头） |
| 223-231 | `Trainer(...)` | HF Trainer 封装训练循环。`EarlyStoppingCallback(early_stopping_patience=2)` 验证集 f1 连续 2 轮不提升就早停 |
| 234 | `trainer.train()` | 训练 |
| 241-243 | `trainer.save_model(output_dir)` + `tokenizer.save_pretrained(output_dir)` | 保存模型权重和 tokenizer 配置 |

### 2.4 classify() 推理核心方法

```python
# query_classifier.py 第 250~294 行
def classify(self, text: str) -> tuple[str, float]:
    raw_outputs: list[dict] = self._pipeline(text)[0]
    general_score: Optional[float] = None
    for item in raw_outputs:
        lbl = item["label"].lower()
        if lbl in ("general", "label_0"):
            general_score = item["score"]
            break
    if general_score is None:
        return "specialized", 0.5
    if general_score >= GENERAL_CONFIDENCE_THRESHOLD:
        label, confidence = "general", general_score
    else:
        label, confidence = "specialized", 1.0 - general_score
    return label, confidence
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 250 | `def classify(self, text: str) -> tuple[str, float]:` | 对 query 做 general / specialized 二分类 |
| 254-255 | pipeline 返回格式 | `[{"label": "LABEL_0", "score": 0.98}, {"label": "LABEL_1", "score": 0.02}]` |
| 268 | `raw_outputs = self._pipeline(text)[0]` | 调用 pipeline 推理 |
| 271-276 | 查找 general 标签分数 | 兼容大小写和 LABEL_0 格式（`"general"` / `"label_0"`） |
| 278-282 | `if general_score is None:` | 兜底：标签名不匹配时保守返回 `("specialized", 0.5)` |
| 285-288 | 阈值判断 | `P(general) >= 0.85 → general`，否则 `specialized`（置信度 = 1 - P(general)） |

### 2.5 _load_jsonl() 加载训练数据

```python
# query_classifier.py 第 298~325 行
@staticmethod
def _load_jsonl(path: str) -> list[dict]:
    rows = []
    with open(path, "r", encoding="utf-8") as f:
        for line_no, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            text = (obj.get("text") or "").strip()
            label = obj.get("label")
            if not text:
                raise ValueError(f"第 {line_no} 行 text 为空")
            if label not in LABEL2ID:
                raise ValueError(f"第 {line_no} 行 label 非法: {label!r}")
            rows.append({"text": text, "label": label})
    if not rows:
        raise ValueError(f"训练数据为空：{path}")
    return rows
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 298 | `@staticmethod` | 静态方法 |
| 306-308 | JSONL 格式 | 每行一个 JSON 对象，含 "text" 和 "label" 字段 |
| 310-314 | 逐行读取 | 跳过空行，`json.loads` 解析 |
| 316-321 | 数据校验 | text 为空或 label 非法时抛 ValueError（带行号定位） |
| 323-324 | 空数据校验 | 训练数据为空时抛 ValueError |

### 2.6 _stratified_split() 分层切分

```python
# query_classifier.py 第 327~365 行
@staticmethod
def _stratified_split(rows, val_ratio, test_ratio, seed):
    random.seed(seed)
    buckets = {}
    for row in rows:
        buckets.setdefault(row["label"], []).append(row)
    train_rows, val_rows, test_rows = [], [], []
    for label, group in buckets.items():
        random.shuffle(group)
        n = len(group)
        n_test = max(1, int(n * test_ratio))
        n_val = max(1, int(n * val_ratio))
        test_rows.extend(group[:n_test])
        val_rows.extend(group[n_test:n_test + n_val])
        train_rows.extend(group[n_test + n_val:])
    random.shuffle(train_rows)
    return train_rows, val_rows, test_rows
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 327 | `@staticmethod` | 静态方法 |
| 345 | `random.seed(seed)` | 固定随机种子 |
| 347-350 | `buckets = {}` | 按标签分组：`{"general": [...], "specialized": [...]}` |
| 355-362 | 每个类别分别切分 | **为什么要分层？** 如果 general 100 条、specialized 10 条，随机切分可能把 specialized 全部分到训练集，验证集一条都没有。分层切分保证每个集合中各类别比例一致。`n_test = max(1, ...)` 至少取 1 条 |
| 364 | `random.shuffle(train_rows)` | 训练集再打乱，避免类别或样本顺序过于集中 |

---

## 三、get_query_classifier() 模块级单例

```python
# query_classifier.py 第 370~384 行
_classifier: Optional[QueryClassifier] = None

def get_query_classifier() -> QueryClassifier:
    global _classifier
    if _classifier is None:
        _classifier = QueryClassifier.get_instance()
    return _classifier
```

| 行号 | 代码 | 说明 |
|------|------|------|
| 370 | `_classifier: Optional[QueryClassifier] = None` | 模块级变量持有单例 |
| 373-384 | `def get_query_classifier():` | 获取 QueryClassifier 单例。QA Agent 的 classify_query_node 通过此函数获取分类器实例。**使用模块级变量的方式实现单例（而不是 classmethod）**，因为 classify_query_node 需要的是"函数调用"而不是"类方法调用" |

---

## 四、三层分类体系全貌

```
Layer 0a：规则精确匹配
  检测到"你好"、"谢谢"、"你是谁"等 → GENERAL
  检测到"课程"、"项目"、"章节"等 → SPECIALIZED

Layer 0b：关键词快判 RAG 策略
  检测到"没懂"、"解释一下" → VAGUE
  检测到"全面"、"总结" → BROAD
  其余 → PRECISE

Layer 1：MiniLM 二分类（本模块）
  P(general) ≥ 0.85 → GENERAL
  其余 → SPECIALIZED（进入 Layer 2）

Layer 2：LLM 精判检索策略
  PRECISE / VAGUE / BROAD 三选一
```

### 分类器在 QA Agent 中的位置

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

---

## 五、训练数据与流程

### 5.1 训练数据格式

```jsonl
{"text": "什么是面向对象编程？", "label": "general"}
{"text": "Java 中 final 关键字有什么作用？", "label": "general"}
{"text": "商品聚合大模型中双塔召回怎么实现？", "label": "specialized"}
{"text": "LlamaFactory 怎么做 Qwen VL 微调？", "label": "specialized"}
```

### 5.2 训练流程

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
- `val_ratio=0.1`, `test_ratio=0.1`：验证/测试集比例
- `warmup_ratio=0.1`, `weight_decay=0.01`：防过拟合
- `EarlyStoppingCallback(patience=2)`：f1 连续 2 轮不提升就早停

---

## 六、依赖关系

```
query_classifier.py
  ├── transformers → pipeline, AutoModelForSequenceClassification, AutoTokenizer, Trainer
  ├── torch → torch.cuda.is_available()（设备检测）
  ├── sklearn → accuracy_score, precision_recall_fscore_support（训练时）
  ├── datasets → Dataset（训练时）
  ├── numpy → np（训练时）
  ├── backend.config → get_settings（配置）
  └── backend.core.logger → get_logger（日志）
```

---

## 七、设计亮点

```python
# ★ Insight ─── 阈值 0.85 的设计哲学：宁可多走一次 RAG
# 专业问题被误判为通用问题的代价更高：
#   LLM 用自身知识回答，可能与课程内容矛盾（幻觉）。
# 通用问题被误判为专业问题，只是浪费一次检索（可控开销）。
# 因此把 general 侧阈值设偏高（0.85），宁可多走一次 RAG，不要漏掉课程相关问题。
# 这是"假阴性比假阳性代价更高"的分类阈值偏移策略。
```

```python
# ★ Insight ─── 训练库延迟 import
# train() 所需的 numpy / sklearn / datasets / transformers.Trainer 只在
# 训练方法内 import。推理路径（classify）不加载这些依赖，大幅减少
# QA Agent 启动时间。
# sklearn 和 datasets 训练时才需要，推理时纯 transformers pipeline 即可。
```

```python
# ★ Insight ─── 模块级单例 vs 类方法单例
# QueryClassifier 类内部有 get_instance()（classmethod 单例）。
# 但 classify_query_node 需要的是"函数调用"而非"类方法调用"。
# 因此额外提供 get_query_classifier() 模块级函数，内部委托给类方法单例。
# 双重单例：类方法保证不重复实例化，模块级函数提供更自然的调用接口。
```

```python
# ★ Insight ─── classify() 的标签兼容兜底
# pipeline 返回的标签名可能是 "general"/"specialized" 或 "LABEL_0"/"LABEL_1"，
# 取决于模型配置。classify() 用 .lower() 归一化并同时匹配两种格式。
# 若标签名完全不匹配（general_score 为 None），保守返回 ("specialized", 0.5)
# —— 宁可走 RAG 也不漏掉可能相关的课程问题。
```

---

## 八、边界情况与异常处理

| 场景 | 表现 | 处理 |
|------|------|------|
| MiniLM 模型加载失败 | `get_query_classifier()` 抛异常 | 分类器不可用，所有 query 跳过 Layer 1，直接走 Layer 2 LLM 精判 |
| 分类分数极低（< 0.5） | `general_score` 和 `specialized_score` 都低 | 默认返回 `specialized`（保守策略，宁可多走 RAG 也不漏掉课程问题） |
| 标签名不兼容 | `LABEL_0` / `LABEL_1` 而非 `general` / `specialized` | `classify()` 用 `.lower()` 归一化，同时匹配两种格式 |
| 空输入或纯空白 query | 匹配不到任何规则，MiniLM 也可能返回低分 | 默认返回 `specialized`，走 RAG 兜底 |
| 多语言混合输入 | MiniLM 训练数据以中文为主，英文意图可能误判 | 走 Layer 2 LLM 精判校正 |
| 输入超长 | MiniLM 的 tokenizer 截断 | 截断后的语义可能丢失，但 LLM 精判可补偿 |

---

## 核心思想

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

**规则最快，MiniLM 次之，LLM 最慢但最准确。分层判断，尽可能早地返回。0.85 阈值偏移确保不漏掉课程相关问题。**