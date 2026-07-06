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

> 参见 [[06-Redis高级应用]]、[[04-PyMySQL模块]]、[[03-MySQL高级特性]]
