# 补充知识点 - 讲义详细内容整理

> 以下内容基于 EduRAG_V7.5讲义 中尚未覆盖的章节整理

---

## 一、Python日志（3.1节）

### 1.1 为什么需要日志？

程序运行时需要记录关键信息用于调试和监控。Python内置`logging`模块。

### 1.2 日志级别

| 级别 | 数值 | 用途 |
|------|------|------|
| DEBUG | 10 | 调试信息 |
| INFO | 20 | 一般信息 |
| WARNING | 30 | 警告信息 |
| ERROR | 40 | 错误信息 |
| CRITICAL | 50 | 严重错误 |

### 1.3 项目中的日志实现

```python
# base/logger.py
import logging
import os

def setup_logger(log_file="logs/app.log"):
    os.makedirs(os.path.dirname(log_file), exist_ok=True)
    
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # 文件处理器
    file_handler = logging.FileHandler(log_file, encoding='utf-8')
    file_handler.setFormatter(formatter)
    
    # 控制台处理器
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    
    logger = logging.getLogger()
    logger.setLevel(logging.INFO)
    logger.addHandler(file_handler)
    logger.addHandler(console_handler)
    
    return logger

logger = setup_logger()
```

### 1.4 使用方式

```python
from base import logger

logger.info("BM25模型初始化完成")
logger.error(f"搜索失败: {e}")
logger.warning("未加载到问题")
```

---

## 二、Redis数据库（3.2节）

### 2.1 Redis是什么？

Redis（Remote Dictionary Server）是一个开源的内存数据结构存储系统，可用作数据库、缓存和消息中间件。

### 2.2 Redis数据结构

| 类型 | 说明 | 示例 |
|------|------|------|
| String | 字符串 | `SET name "张三"` |
| Hash | 哈希表 | `HSET user:1 name "张三"` |
| List | 列表 | `LPUSH queue "task1"` |
| Set | 集合 | `SADD tags "python"` |
| Sorted Set | 有序集合 | `ZADD scores 100 "A"` |

### 2.3 项目中的Redis使用

```python
# base/redis_client.py
import redis
import json

class RedisClient:
    def __init__(self, host='localhost', port=6379, db=0, password='1234'):
        self.client = redis.Redis(
            host=host, port=port, db=db, password=password,
            decode_responses=True
        )
    
    def set_data(self, key, value, ttl=3600):
        """设置数据，支持过期时间"""
        self.client.set(key, json.dumps(value, ensure_ascii=False), ex=ttl)
    
    def get_data(self, key):
        """获取数据"""
        data = self.client.get(key)
        return json.loads(data) if data else None
    
    def get_answer(self, query):
        """获取缓存的答案"""
        return self.get_data(f"answer:{query}")
    
    def set_answer(self, query, answer):
        """缓存答案"""
        self.set_data(f"answer:{query}", answer)
```

### 2.4 项目中Redis的作用

1. **缓存FAQ数据**：将MySQL中的问答对缓存到Redis，启动时一次性加载
2. **缓存查询结果**：相同查询直接返回缓存答案，避免重复检索
3. **会话管理**（可选）：存储用户会话历史

---

## 三、基于MySQL的问答系统（3.3节）

### 3.1 系统流程

```
┌─────────────────────────────────────────────────┐
│               MySQL FAQ问答系统                  │
├─────────────────────────────────────────────────┤
│  1. 启动时从MySQL加载FAQ数据到Redis              │
│  2. 用户输入查询                                  │
│  3. jieba分词预处理                               │
│  4. BM25计算相似度分数                            │
│  5. Softmax归一化到0-1                           │
│  6. 判断是否超过阈值(0.85)                        │
│  7. 超过则返回答案，否则进入RAG系统               │
└─────────────────────────────────────────────────┘
```

### 3.2 MySQL数据库设计

```sql
-- FAQ问答表
CREATE TABLE IF NOT EXISTS qa_table (
    id INT AUTO_INCREMENT PRIMARY KEY,
    question VARCHAR(500) NOT NULL,
    answer TEXT NOT NULL,
    source VARCHAR(50)
);

-- 对话历史表
CREATE TABLE IF NOT EXISTS conversations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(36) NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    timestamp DATETIME NOT NULL,
    INDEX idx_session_id (session_id)
);
```

### 3.3 文本预处理

```python
# mysql_qa/utils/preprocess.py
import jieba

def preprocess_text(text):
    """文本预处理：分词"""
    words = jieba.lcut(text)
    # 去除停用词和标点
    stopwords = {"的", "了", "是", "在", "有", "什么", "？", "！", "，"}
    return [w for w in words if w not in stopwords and len(w) > 0]
```

---

## 四、BM25算法详解（3.4节）

### 4.1 BM25原理回顾

$$
score(D, Q) = \sum_{i=1}^{n} IDF(q_i) \cdot \frac{TF(q_i, D) \cdot (k_1 + 1)}{TF(q_i, D) + k_1 \cdot (1 - b + b \cdot \frac{|D|}{avgdl})}
$$

**三个核心因子**：
- **TF（词频）**：词在文档中出现的次数，但有饱和机制
- **IDF（逆文档频率）**：罕见词权重高，常见词权重低
- **长度归一化**：考虑文档长度，避免长文档优势

### 4.2 项目中的BM25实现

```python
from rank_bm25 import BM25Okapi
import numpy as np

# 初始化BM25
bm25 = BM25Okapi(tokenized_questions)

# 搜索
scores = bm25.get_scores(query_tokens)

# Softmax归一化
exp_scores = np.exp(scores - np.max(scores))
softmax_scores = exp_scores / exp_scores.sum()

# 获取最高分
best_idx = softmax_scores.argmax()
best_score = softmax_scores[best_idx]

# 阈值判断
if best_score >= 0.85:
    return answer, False  # 找到答案
else:
    return None, True     # 需要RAG
```

### 4.3 Softmax的作用

BM25原始分数范围不确定，Softmax将其映射到0-1的概率分布，便于设置阈值。

---

## 五、RAG系统详细架构（4.1节）

### 5.1 系统整体流程

```
用户查询
    ↓
┌─────────────────┐
│ 查询分类(BERT)  │ → 通用知识 → 直接调用LLM
└─────────────────┘
    ↓ 专业咨询
┌─────────────────┐
│ 策略选择(LLM)   │ → 直接检索 / HyDE / 子查询 / 回溯
└─────────────────┘
    ↓
┌─────────────────┐
│ 文档检索(Milvus)│ → 混合检索 + 重排序
└─────────────────┘
    ↓
┌─────────────────┐
│ 答案生成(LLM)   │ → 流式输出
└─────────────────┘
```

### 5.2 模块化设计

| 模块 | 文件 | 作用 |
|------|------|------|
| base/ | config.py, logger.py | 配置管理、日志 |
| rag_qa/core/ | vector_store.py | 向量存储与检索 |
| rag_qa/core/ | rag_system.py | RAG核心逻辑 |
| rag_qa/core/ | prompts.py | Prompt模板 |
| rag_qa/core/ | query_classifier.py | 查询分类 |
| rag_qa/core/ | strategy_selector.py | 策略选择 |
| mysql_qa/ | bm25_search.py | BM25检索 |

---

## 六、文档处理模块（4.3节）

### 6.1 支持的文件格式

| 格式 | 加载器 | 说明 |
|------|--------|------|
| .txt | TextLoader | 纯文本 |
| .pdf | OCRPDFLoader | PDF（支持OCR） |
| .docx | OCRDOCLoader | Word文档 |
| .ppt | OCRPPTLoader | PPT演示文稿 |
| .md | TextLoader | Markdown |
| .png/.jpg | OCRIMGLoader | 图片（OCR） |

### 6.2 分层切分策略

**为什么要分层切分？**

```
原始文档
    ↓ 大块（父块，1200字符）
┌──────────────────────────────┐
│ 父块：包含完整上下文          │
│ ┌────────┐ ┌────────┐       │
│ │ 子块1  │ │ 子块2  │ ...   │
│ │ 300字符│ │ 300字符│       │
│ └────────┘ └────────┘       │
└──────────────────────────────┘
```

**好处**：
- 检索时用子块（小而精），提高检索精度
- 返回时用父块（大而全），保留完整上下文

### 6.3 文档处理代码

```python
from langchain_text_splitters import RecursiveCharacterTextSplitter

# 父块分割器
parent_splitter = RecursiveCharacterTextSplitter(
    chunk_size=1200,    # 父块大小
    chunk_overlap=50    # 重叠
)

# 子块分割器
child_splitter = RecursiveCharacterTextSplitter(
    chunk_size=300,     # 子块大小
    chunk_overlap=50    # 重叠
)
```

---

## 七、Prompts设计与Query意图识别（4.5节）

### 7.1 Prompt模板设计

**RAG主Prompt**：
```python
template = """
你是一个智能助手，负责帮助用户回答问题。请按照以下步骤处理：

1. **分析问题和上下文**：
   - 基于提供的上下文（如果有）和你的知识回答问题。
   - 如果答案来源于检索到的文档，请在回答中明确说明。

2. **评估对话历史**：
   - 检查对话历史是否与当前问题相关。
   - 如果相关，结合历史信息生成更准确的回答。

3. **生成回答**：
   - 提供清晰、准确的回答。
   - 如果无法回答，请回复："信息不足，无法回答，请联系人工客服。"

**上下文**: {context}
**对话历史**: {history}
**问题**: {question}
**回答**:
"""
```

**HyDE Prompt**（假设文档检索）：
```python
template = """
假设你是用户，想了解以下问题，请生成一个简短的假设答案：
问题: {query}
假设答案:
"""
```

**子查询Prompt**：
```python
template = """
将以下复杂查询分解为多个简单子查询，每行一个子查询：
查询: {query}
子查询:
"""
```

**回溯问题Prompt**：
```python
template = """
将以下复杂查询简化为一个更简单的问题：
查询: {query}
简化问题:
"""
```

### 7.2 Query意图识别

使用BERT模型进行二分类：**通用知识** vs **专业咨询**

```python
# query_classifier.py
class QueryClassifier:
    def __init__(self, model_path):
        self.tokenizer = BertTokenizer.from_pretrained(model_path)
        self.model = BertForSequenceClassification.from_pretrained(model_path, num_labels=2)
        self.label_map = {"通用知识": 0, "专业咨询": 1}
    
    def predict_category(self, query):
        encoding = self.tokenizer(query, truncation=True, padding=True, max_length=128, return_tensors="pt")
        with torch.no_grad():
            outputs = self.model(**encoding)
            prediction = torch.argmax(outputs.logits, dim=1).item()
        return "专业咨询" if prediction == 1 else "通用知识"
```

**分类结果处理**：
- 通用知识 → 直接调用LLM回答，不进行RAG检索
- 专业咨询 → 执行RAG流程（检索+生成）

---

## 八、检索策略详解（4.6节）

### 8.1 四种检索策略

| 策略 | 适用场景 | 原理 |
|------|----------|------|
| **直接检索** | 查询意图明确 | 直接用query检索 |
| **HyDE** | 查询抽象 | 先用LLM生成假设答案，再检索 |
| **子查询** | 多实体/多方面 | 拆分为多个子查询分别检索 |
| **回溯问题** | 复杂查询 | 简化query后再检索 |

### 8.2 策略选择流程

```python
class StrategySelector:
    def select_strategy(self, query):
        # 使用LLM分析查询，选择最佳策略
        strategy = self.call_dashscope(self.strategy_prompt_template.format(query=query))
        return strategy.strip()
```

**LLM决策逻辑**：
- "AI学科学费是多少？" → 直接检索
- "人工智能在教育领域的应用有哪些？" → HyDE
- "比较Milvus和Zilliz Cloud的优缺点" → 子查询
- "我有一个100亿条记录的数据集，想存储到Milvus中" → 回溯问题

---

## 九、RAG系统评估（第5章）

### 9.1 RAGAS评估框架

RAGAS（Retrieval Augmented Generation Assessment）是RAG系统的自动评估框架。

### 9.2 四个核心指标

| 指标 | 英文 | 说明 | 评估对象 |
|------|------|------|----------|
| **上下文相关性** | Context Relevance | 检索到的上下文与问题的相关性 | 检索质量 |
| **上下文召回率** | Context Recall | 检索到的上下文与真实答案的匹配程度 | 检索覆盖度 |
| **忠实度** | Faithfulness | 答案是否基于给定上下文生成 | 生成质量 |
| **答案相关性** | Answer Relevancy | 生成的答案与查询之间的相关性 | 生成质量 |

### 9.3 评估数据格式

```json
{
  "question": "用户的提问",
  "answer": "系统生成的答案",
  "contexts": ["检索到的上下文1", "检索到的上下文2"],
  "ground_truths": ["标准答案"]
}
```

### 9.4 评估代码示例

```python
from ragas import evaluate
from ragas.metrics import (
    context_precision,
    context_recall,
    faithfulness,
    answer_relevancy,
)

# 准备评估数据
eval_dataset = {
    "question": ["什么是Python？"],
    "answer": ["Python是一种高级编程语言..."],
    "contexts": [["Python是Guido van Rossum于1991年发布的..."]],
    "ground_truths": [["Python是一种解释型、面向对象的高级编程语言"]]
}

# 执行评估
result = evaluate(
    dataset=eval_dataset,
    metrics=[
        context_precision,
        context_recall,
        faithfulness,
        answer_relevancy,
    ]
)
print(result)
```

---

## 十、Docker部署详解（第7章）

### 10.1 虚拟机 vs Docker

| 对比项 | 虚拟机 | Docker容器 |
|--------|--------|-----------|
| 启动时间 | 分钟级 | 秒级 |
| 资源占用 | GB级 | MB级 |
| 隔离级别 | 硬件级 | 进程级 |
| 性能损耗 | 5%-20% | 接近原生 |

### 10.2 Docker核心概念

- **镜像(Image)**：只读模板，包含运行应用所需的所有内容
- **容器(Container)**：镜像的运行实例
- **仓库(Registry)**：存储和分发镜像的服务

### 10.3 Dockerfile详解

```dockerfile
# 基础镜像
FROM python:3.10-slim

# 工作目录
WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y build-essential

# 复制依赖文件并安装
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制项目代码
COPY . .

# 暴露端口
EXPOSE 8003

# 启动命令
CMD ["python", "app.py"]
```

### 10.4 Docker常用命令

```bash
# 构建镜像
docker build -t edu-rag:1.0 .

# 运行容器
docker run -d -p 8003:8003 --name edu-rag edu-rag:1.0

# 查看运行中的容器
docker ps

# 查看日志
docker logs edu-rag

# 停止容器
docker stop edu-rag

# 进入容器
docker exec -it edu-rag /bin/bash
```

---

## 十一、FastAPI接口实现（6.3节）

### 11.1 FastAPI vs Flask

| 对比项 | FastAPI | Flask |
|--------|---------|-------|
| 性能 | 高（异步） | 中 |
| 类型检查 | 自动 | 手动 |
| 文档生成 | 自动生成 | 需要插件 |
| WebSocket | 原生支持 | 需要扩展 |
| 适用场景 | 高性能API | 简单应用 |

### 11.2 非流式查询实现

```python
@app.post("/api/query")
async def query(request: QueryRequest):
    start_time = time.time()
    session_id = request.session_id or str(uuid.uuid4())
    
    # 1. 日常问候检查
    greeting = check_greeting(request.query)
    if greeting:
        return {"answer": greeting, "is_streaming": False}
    
    # 2. BM25检索
    answer, need_rag = qa_system.bm25_search.search(request.query, threshold=0.85)
    if need_rag:
        return {"answer": "请使用WebSocket接口获取流式响应", "is_streaming": True}
    
    return {"answer": answer, "is_streaming": False}
```

### 11.3 流式查询实现

```python
@app.websocket("/api/stream")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    while True:
        data = await websocket.receive_text()
        request_data = json.loads(data)
        
        # 发送开始标志
        await websocket.send_json({"type": "start", "session_id": session_id})
        
        # 流式返回
        for token, is_complete in qa_system.query(...):
            if token:
                await websocket.send_json({"type": "token", "token": token})
            if is_complete:
                await websocket.send_json({"type": "end", "is_complete": True})
                break
```

---

## 十二、学习要点总结

| 章节 | 关键知识点 |
|------|-----------|
| 3.1 Python日志 | logging模块、日志级别、文件和控制台输出 |
| 3.2 Redis | 数据结构、缓存策略、项目中的使用 |
| 3.3 MySQL问答系统 | 系统流程、数据库设计、文本预处理 |
| 3.4 BM25算法 | TF-IDF改进、Softmax归一化、阈值判断 |
| 4.1 RAG架构 | 模块化设计、完整工作流程 |
| 4.3 文档处理 | 多格式支持、分层切分（父块+子块） |
| 4.5 Prompts与意图识别 | Prompt模板设计、BERT查询分类 |
| 4.6 检索策略 | 四种策略、LLM自动选择 |
| 5.1 RAG评估 | RAGAS框架、四个评估指标 |
| 6.1 融合系统 | MySQL FAQ + Milvus RAG |
| 7.1 Docker | 镜像/容器概念、Dockerfile编写 |