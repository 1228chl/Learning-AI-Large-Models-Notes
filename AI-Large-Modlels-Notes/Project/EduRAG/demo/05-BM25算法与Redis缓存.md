# BM25算法、Redis与Python日志 - 深度学习笔记

---

## 一、BM25算法的底层数学原理

### 1.1 从TF-IDF到BM25

**TF-IDF的局限**：
- TF（词频）：词出现越多，权重越高，但没有上限
- 问题：一个词出现100次和10次，权重差10倍，但实际重要性差距没那么大

**BM25的改进**：引入**词频饱和**机制

### 1.2 BM25公式推导

$$
score(D, Q) = \sum_{i=1}^{n} IDF(q_i) \cdot \frac{TF(q_i, D) \cdot (k_1 + 1)}{TF(q_i, D) + k_1 \cdot (1 - b + b \cdot \frac{|D|}{avgdl})}
$$

**三个核心组件**：

#### 1）IDF（逆文档频率）

$$
IDF(q_i) = \log \frac{N - n(q_i) + 0.5}{n(q_i) + 0.5}
$$

- $N$：总文档数
- $n(q_i)$：包含词$q_i$的文档数

**直觉**：
- "的"出现在99%的文档中 → IDF接近0 → 权重低
- "Python"只出现在10%的文档中 → IDF较高 → 权重高

```
IDF("的") = log((1000-990+0.5)/(990+0.5)) ≈ 0.004  # 常见词
IDF("Python") = log((1000-100+0.5)/(100+0.5)) ≈ 2.2  # 罕见词
```

#### 2）TF饱和（词频饱和）

$$
TF_{sat}(tf) = \frac{tf \cdot (k_1 + 1)}{tf + k_1}
$$

- $tf$：词在文档中出现的次数
- $k_1$：饱和参数（典型值1.2-2.0）

**直觉**：词频增长到一定程度后，贡献趋于饱和

```
tf=1:  TF = 1×(1.5+1)/(1+1.5) = 1.0
tf=5:  TF = 5×2.5/6.5 = 1.92
tf=10: TF = 10×2.5/11.5 = 2.17
tf=100: TF = 100×2.5/101.5 = 2.46  # 接近饱和值2.5
```

#### 3）文档长度归一化

$$
length\_norm = 1 - b + b \cdot \frac{|D|}{avgdl}
$$

- $|D|$：文档长度
- $avgdl$：平均文档长度
- $b$：归一化参数（典型值0.75）

**直觉**：长文档的词频会被"稀释"

```
短文档(50词): length_norm = 0.25 + 0.75×(50/100) = 0.625
平均文档(100词): length_norm = 0.25 + 0.75×(100/100) = 1.0
长文档(200词): length_norm = 0.25 + 0.75×(200/100) = 1.25
```

### 1.3 BM25 vs TF-IDF

| 对比项 | TF-IDF | BM25 |
|--------|--------|------|
| 词频处理 | 线性增长 | 饱和增长 |
| 长度归一化 | 无 | 有 |
| 参数 | 无 | k₁, b |
| 效果 | 基准 | 更好 |

### 1.4 Softmax归一化的原理

**问题**：BM25原始分数范围不确定，无法设置统一阈值

**解决方案**：用Softmax将分数映射到0-1的概率分布

$$
softmax(s_i) = \frac{e^{s_i}}{\sum_{j} e^{s_j}}
$$

**示例**：
```
BM25原始分数: [2.5, 1.8, 0.3, -0.5]
Softmax:      [0.45, 0.22, 0.08, 0.04]  # 和为1

最高分0.45 < 阈值0.85 → 未达到，需要RAG
```

---

## 二、Redis的底层原理

### 2.1 为什么Redis这么快？

| 原因 | 说明 |
|------|------|
| **内存存储** | 数据在内存中，读写速度比磁盘快10万倍 |
| **单线程模型** | 避免上下文切换和锁竞争 |
| **IO多路复用** | 一个线程处理多个连接 |
| **高效数据结构** | SDS、跳表、压缩列表等 |

### 2.2 Redis数据结构的底层实现

| 数据类型 | 底层结构 | 特点 |
|----------|----------|------|
| **String** | SDS（简单动态字符串） | O(1)读写 |
| **Hash** | ziplist + hashtable | 小数据用ziplist，大数据用hashtable |
| **List** | quicklist | 双向链表+压缩列表 |
| **Set** | intset + hashtable | 整数用intset，其他用hashtable |
| **Sorted Set** | ziplist + skiplist | 小数据用ziplist，大数据用跳表 |

### 2.3 项目中Redis的作用

```
启动时:
MySQL FAQ数据 → 缓存到Redis → 后续查询直接从Redis读取

查询时:
用户查询 → 查Redis缓存 → 命中则返回 → 未命中则BM25检索 → 结果缓存到Redis
```

**缓存策略**：
```python
# 启动时预热
def warmup_cache():
    questions = mysql_client.fetch_questions()
    redis_client.set_data("qa_original_questions", questions, ttl=86400)

# 查询时缓存
def get_answer(query):
    cached = redis_client.get_answer(query)
    if cached:
        return cached  # 命中缓存
    answer = bm25_search(query)
    redis_client.set_answer(query, answer, ttl=3600)  # 写入缓存
    return answer
```

---

## 三、Python日志的底层原理

### 3.1 为什么需要日志？

**程序调试的困境**：
- print语句：临时使用，难以管理
- 异常处理：只能捕获错误，无法记录运行状态
- 日志系统：结构化记录，支持级别控制、持久化、远程收集

### 3.2 日志级别的设计原理

| 级别 | 数值 | 用途 | 生产环境 |
|------|------|------|----------|
| DEBUG | 10 | 调试信息，变量值 | 不输出 |
| INFO | 20 | 一般信息，关键节点 | 输出 |
| WARNING | 30 | 警告，不影响运行 | 输出 |
| ERROR | 40 | 错误，功能受影响 | 输出 |
| CRITICAL | 50 | 严重错误，程序可能崩溃 | 输出 |

**设计原理**：通过级别过滤，在开发环境看到详细信息，在生产环境只看关键信息。

### 3.3 Handler的设计模式

```python
# 日志处理器（Handler）的设计
logger = logging.getLogger()

# 文件Handler：持久化到文件
file_handler = logging.FileHandler("app.log")

# 控制台Handler：输出到终端
console_handler = logging.StreamHandler()

# 添加Handler
logger.addHandler(file_handler)
logger.addHandler(console_handler)
```

**设计模式**：观察者模式，一个日志事件可以被多个Handler处理。

---

## 四、MySQL在问答系统中的应用

### 4.1 数据库设计原理

```sql
-- FAQ问答表：存储标准问答对
CREATE TABLE qa_table (
    id INT AUTO_INCREMENT PRIMARY KEY,
    question VARCHAR(500) NOT NULL,  -- 问题
    answer TEXT NOT NULL,            -- 答案
    source VARCHAR(50)               -- 学科类别
);

-- 对话历史表：存储用户对话记录
CREATE TABLE conversations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(36) NOT NULL,  -- 会话ID
    question TEXT NOT NULL,           -- 问题
    answer TEXT NOT NULL,             -- 答案
    timestamp DATETIME NOT NULL,     -- 时间戳
    INDEX idx_session_id (session_id)  -- 索引加速查询
);
```

### 4.2 连接池的原理

```python
# 为什么需要连接池？
# 每次查询都创建新连接：慢（TCP握手、认证）
# 连接池：预先创建一批连接，复用

import pymysql
from dbutils.pooled_db import PooledDB

pool = PooledDB(
    creator=pymysql,
    maxconnections=10,  # 最大连接数
    host='localhost',
    user='root',
    password='123456',
    database='subjects_kg'
)

# 获取连接
conn = pool.connection()
cursor = conn.cursor()
```

---

## 五、文本预处理的原理

### 5.1 为什么需要分词？

中文没有天然的分隔符（如英文的空格），需要分词才能进行词频统计。

```
"Python是什么编程语言"
不分词: ["Python是什么编程语言"]  # 无法统计词频
分词后: ["Python", "是", "什么", "编程", "语言"]  # 可以统计
```

### 5.2 jieba分词的原理

**jieba使用两种算法**：

1. **基于词典的分词**：查找词典中的词
2. **基于HMM的分词**：处理未登录词

```python
import jieba

# 默认模式
tokens = jieba.lcut("Python是什么编程语言")
print(tokens)  # ['Python', '是', '什么', '编程', '语言']

# 搜索模式（更多切分）
tokens = jieba.lcut_for_search("中华人民共和国")
print(tokens)  # ['中华', '人民', '共和', '中华人民共和国']
```

### 5.3 停用词过滤

**停用词**：对检索无意义的词（如"的"、"了"、"是"）

```python
stopwords = {"的", "了", "是", "在", "有", "什么", "？", "！", "，"}

def preprocess(text):
    words = jieba.lcut(text)
    return [w for w in words if w not in stopwords and len(w) > 0]
```

### 5.4 jieba自定义词典

**为什么需要自定义词典？**

jieba默认词典可能不认识专业术语，导致分词错误。

```python
import jieba

# 默认分词
print(jieba.lcut("黑马程序员大模型课程"))
# 可能输出: ['黑马', '程序员', '大', '模型', '课程']  # "大模型"被错误切分

# 添加自定义词典
jieba.add_word("大模型", freq=10000)
jieba.add_word("黑马程序员", freq=8000)

# 再次分词
print(jieba.lcut("黑马程序员大模型课程"))
# 输出: ['黑马程序员', '大模型', '课程']  # 正确切分
```

**自定义词典文件格式**：
```
大模型 10000 n
黑马程序员 8000 n
BM25算法 5000 n
```

### 5.5 停用词表

```python
# 中文停用词表（部分）
chinese_stopwords = {
    "的", "了", "是", "在", "有", "和", "就", "不", "人", "都",
    "一", "一个", "上", "也", "很", "到", "说", "要", "去", "你",
    "会", "着", "没有", "看", "好", "自己", "这", "他", "她", "它",
    "吗", "什么", "呢", "吧", "啊", "？", "！", "，", "。", "、"
}

# 英文停用词表（部分）
english_stopwords = {
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "dare", "ought",
    "used", "to", "of", "in", "for", "on", "with", "at", "by", "from"
}
```

---

## 六、完整检索流程

```
用户查询: "Python学费是多少？"
    ↓
1. 文本预处理
   jieba分词 → ["Python", "学费", "是", "多少"]
   停用词过滤 → ["Python", "学费"]
    ↓
2. BM25检索
   计算每个FAQ问题的BM25分数
   Softmax归一化 → [0.12, 0.85, 0.03, ...]
   最高分0.85 >= 阈值0.85 → 找到答案
    ↓
3. 返回答案
   从MySQL获取答案
   缓存到Redis
   返回给用户
```

---

## 七、学习要点

| 知识点 | 底层原理 | 实践要点 |
|--------|----------|----------|
| **BM25** | TF饱和+IDF+长度归一化 | k₁=1.5, b=0.75 |
| **Softmax** | 将分数映射到0-1概率分布 | 阈值0.85 |
| **Redis** | 内存存储+单线程+高效数据结构 | 缓存FAQ和查询结果 |
| **Python日志** | 级别过滤+Handler模式 | 生产环境用INFO级别 |
| **MySQL** | 关系型数据库+索引 | FAQ表+对话历史表 |
| **分词** | jieba词典+HMM | 停用词过滤 |