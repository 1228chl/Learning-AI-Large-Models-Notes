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

# 连接本地 Redis 服务实例；decode_responses=True 使响应自动解码为字符串，避免手动处理 bytes 类型
r = redis.Redis(host='localhost', port=6379, decode_responses=True)
```

### String（字符串）— 最基础

```python
r.set('key', 'value')           # 设置键值对，若 key 已存在则覆盖旧值
r.get('key')                    # 根据 key 获取值，key 不存在时返回 None → 'value'
r.incr('counter')               # 原子自增操作，线程/进程安全，适合并发环境下的计数器（如 PV/UV）
r.setex('token', 3600, 'abc')   # 写入带过期时间的键值对（秒级 TTL），到期自动删除，适合存储临时凭证或缓存数据
```

| 适用场景 | 示例 |
|----------|------|
| 缓存模型权重路径 | `model:bert:path → /data/models/bert.pt` |
| 计数器 | `page:view:123 → 1024` |
| 分布式锁 | `lock:job:train → 1` (NX) |

### Hash（哈希）— 存储对象

```python
r.hset('user:1001', 'name', 'Alice')       # 在哈希 user:1001 中设置字段 name 的值，同个 key 下可存多个字段
r.hset('user:1001', 'score', 0.95)         # 继续向同一哈希添加字段 score，适合表示对象的多个属性
r.hgetall('user:1001')                     # 获取哈希下的所有字段与值，以字典形式返回 → {'name': 'Alice', 'score': '0.95'}
r.hincrby('user:1001', 'score', 1)         # 对哈希中某数值字段原子自增，无需先读取再写入，避免竞态条件
```

适合存储结构化对象，如实验配置、用户画像特征。

### List（列表）— 消息队列

```python
r.lpush('queue:train', 'job_1')      # 从队列左侧插入元素（头插法），生产者/任务分发方使用
r.rpop('queue:train')                 # 从队列右侧移除并返回元素（尾出法），消费者 Worker 取出任务 → 'job_1'
r.llen('queue:train')                 # 返回队列当前长度，用于监控任务积压情况和消费者处理能力
```

适用于简单的消息队列、日志队列。

### Set（集合）— 去重与关系

```python
r.sadd('model:runned', 'bert-01', 'gpt-02')      # 向集合添加一个或多个元素，重复元素自动去重
r.smembers('model:runned')                        # 返回集合中的所有元素（无顺序保证）→ 所有已运行模型
r.sismember('model:runned', 'bert-01')            # O(1) 时间检查元素是否存在，比遍历列表更高效 → True
```

适用于去重、共同关注、交并补运算。

### Sorted Set（有序集合）— 排行榜

```python
r.zadd('leaderboard', {'model_a': 0.95, 'model_b': 0.92, 'model_c': 0.88})   # 添加成员并指定分数，分数作为排序依据，支持批量添加

r.zrevrange('leaderboard', 0, 2, withscores=True)                            # 按分数从高到低取 Top 3，withscores=True 同时返回分数值
r.zscore('leaderboard', 'model_a')                                            # 获取指定成员的分数，用于快速查分或在更新前判断当前值
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

**Q1（基础）**：Redis 的 5 种核心数据结构分别是什么？各自适合什么应用场景？
**回答要点**：

1. String（字符串）：缓存、计数器、分布式锁。
2. Hash（哈希）：存储结构化对象如用户画像、实验配置。
3. List（列表）：消息队列、日志队列。
4. Set（集合）：去重、共同关注、交并补运算。
5. Sorted Set（有序集合）：排行榜、带权重的任务队列。
6. 每种结构的操作命令不同，选对数据结构比优化命令更重要。

**Q2（深挖）**：Redis（内存型）和 MySQL（磁盘型）在读写速度、数据持久化、查询能力和适用场景上有哪些关键区别？
**回答要点**：

1. Redis 是微秒级读写（纯内存操作），MySQL 是毫秒级（磁盘 I/O）。
2. Redis 支持 RDB/AOF 持久化但不是强持久化（有丢数据风险），MySQL 通过 WAL 保证强持久化。
3. Redis 只支持简单键值/集合操作，MySQL 支持复杂 SQL JOIN 和聚合。
4. 两者互补：Redis 做缓存加速，MySQL 做持久化存储和复杂查询。

**Q3（实战）**：在 ML 推理缓存场景中，如何用 Redis 避免重复推理计算？请描述 Cache Aside 模式的实现。
**回答要点**：

1. 以模型 ID+输入数据的哈希为 Key，推理结果为 Value，设置合理过期时间。
2. 请求先查 Redis 缓存：命中直接返回；未命中执行推理，然后将结果写入缓存。
3. 需要处理缓存雪崩（大量 Key 同时过期）和缓存穿透（查询不存在的 Key）问题，可通过随机过期时间和布隆过滤器缓解。

**Q4（边界）**：Redis 不适合哪些场景？什么情况下应该选择其他数据库？
**回答要点**：

1. 存储 GB 级以上的全量数据：Redis 受内存限制成本高昂，应选磁盘数据库。
2. 复杂结构化查询：Redis 没有 SQL JOIN 和聚合能力，适合简单的键值存取。
3. 强事务和一致性要求高的场景：Redis 的持久化机制不是 ACID 级别的。
4. 大规模向量相似度搜索：Redis 的 Search 模块能力有限，应选 Milvus 等专用向量数据库。

## 参考引用
- 需要理解Redis高级应用的相关知识，参见 [Redis高级应用](02-Redis高级应用.md)
- 需要了解进程与多进程的相关知识，参见 [进程与多进程](../../Python/并发/03-进程与多进程.md)
- 需要理解Redis高级应用的相关知识，参见 [Redis高级应用](02-Redis高级应用.md)
