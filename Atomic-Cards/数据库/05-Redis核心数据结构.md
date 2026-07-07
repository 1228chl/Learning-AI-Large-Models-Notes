---
author: "XunZong"
created: "2026-07-06"
tags: ["数据库", "Redis", "缓存"]
aliases: ["Redis", "缓存", "键值数据库"]
---

# Redis 核心数据结构

## 定义

Redis（Remote Dictionary Server）是一个**内存型键值数据库**。数据存储在内存中，读写速度极快（微秒级），广泛应用于缓存、会话管理、实时排行榜等场景。

## 五种核心数据结构

```python
import redis

r = redis.Redis(host='localhost', port=6379, decode_responses=True)
```

### String（字符串）— 最基础

```python
r.set('key', 'value')           # 写入
r.get('key')                    # 读取 → 'value'
r.incr('counter')               # 原子自增（分布式计数）
r.setex('token', 3600, 'abc')   # 带过期时间的写入
```

| 适用场景 | 示例 |
|----------|------|
| 缓存模型权重路径 | `model:bert:path → /data/models/bert.pt` |
| 计数器 | `page:view:123 → 1024` |
| 分布式锁 | `lock:job:train → 1`(NX) |

### Hash（哈希）— 存储对象

```python
r.hset('user:1001', 'name', 'Alice')
r.hset('user:1001', 'score', 0.95)
r.hgetall('user:1001')           # {'name': 'Alice', 'score': '0.95'}
r.hincrby('user:1001', 'score', 1)
```

适合存储结构化对象，如实验配置、用户画像特征。

### List（列表）— 消息队列

```python
r.lpush('queue:train', 'job_1')      # 左侧入队
r.rpop('queue:train')                 # 右侧出队 → 'job_1'
r.llen('queue:train')                 # 队列长度
```

适用于简单的消息队列、日志队列。

### Set（集合）— 去重与关系

```python
r.sadd('model:runned', 'bert-01', 'gpt-02')
r.smembers('model:runned')                  # 所有已运行模型
r.sismember('model:runned', 'bert-01')      # 判断是否存在 → True
```

适用于去重、共同关注、交并补运算。

### Sorted Set（有序集合）— 排行榜

```python
r.zadd('leaderboard', {'model_a': 0.95, 'model_b': 0.92, 'model_c': 0.88})
r.zrevrange('leaderboard', 0, 2, withscores=True)     # Top 3
r.zscore('leaderboard', 'model_a')                     # 查分数
```

适用于排行榜、带权重的任务队列。

## 内存 vs 磁盘数据库

| 对比 | Redis（内存） | MySQL（磁盘） |
|------|-------------|--------------|
| 读写速度 | 微秒级 | 毫秒级（有 IO） |
| 数据持久化 | 支持（RDB/AOF） | 持久化存储 |
| 查询能力 | 简单键值/集合操作 | 复杂 SQL JOIN、聚合 |
| 主要用途 | 缓存、队列、计数器 | 持久化存储、复杂查询 |

## ML 中的 Redis 应用场景

| 场景 | 使用 | 说明 |
|------|------|------|
| **推理缓存** | String 缓存模型推理结果 | 相同输入命中缓存，避免重复推理 |
| **实验配置** | Hash 存储实验参数 | `exp:exp001 → {lr:0.001, batch:32}` |
| **任务队列** | List 做训练任务队列 | 多 Worker 消费训练任务 |
| **去重检查** | Set 检查数据是否已处理 | 避免重复处理相同样本 |
| **在线训练** | Sorted Set 管理样本权重 | 根据重要性排序采样 |


## 面试追问

**Q1（基础）**：Redis的5种核心数据结构分别是什么？各自适合什么应用场景？
**回答要点**：① String（字符串）：缓存、计数器、分布式锁。② Hash（哈希）：存储结构化对象如用户画像、实验配置。③ List（列表）：消息队列、日志队列。④ Set（集合）：去重、共同关注、交并补运算。⑤ Sorted Set（有序集合）：排行榜、带权重的任务队列。⑤ 每种结构的操作命令不同，选对数据结构比优化命令更重要。

**Q2（深挖）**：Redis（内存型）和MySQL（磁盘型）在读写速度、数据持久化、查询能力和适用场景上有哪些关键区别？
**回答要点**：① Redis是微秒级读写（纯内存操作），MySQL是毫秒级（磁盘I/O）。② Redis支持RDB/AOF持久化但不是强持久化（有丢数据风险），MySQL通过WAL保证强持久化。③ Redis只支持简单键值/集合操作，MySQL支持复杂SQL JOIN和聚合。④ 两者互补：Redis做缓存加速，MySQL做持久化存储和复杂查询。

**Q3（实战）**：在ML推理缓存场景中，如何用Redis避免重复推理计算？请描述Cache Aside模式的实现。
**回答要点**：① 以模型ID+输入数据的哈希为Key，推理结果为Value，设置合理过期时间。② 请求先查Redis缓存：命中直接返回；未命中执行推理，然后将结果写入缓存。③ 需要处理缓存雪崩（大量Key同时过期）和缓存穿透（查询不存在的Key）问题，可通过随机过期时间和布隆过滤器缓解。

**Q4（边界）**：Redis不适合哪些场景？什么情况下应该选择其他数据库？
**回答要点**：① 存储GB级以上的全量数据：Redis受内存限制成本高昂，应选磁盘数据库。② 复杂结构化查询：Redis没有SQL JOIN和聚合能力，适合简单的键值存取。③ 强事务和一致性要求高的场景：Redis的持久化机制不是ACID级别的。④ 大规模向量相似度搜索：Redis的Search模块能力有限，应选Milvus等专用向量数据库。

> 参见 [[06-Redis高级应用]]、[[04-PyMySQL模块]]、[[03-MySQL高级特性]]
