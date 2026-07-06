---
author: "XunZong"
created: "2026-07-06"
tags: ["数据库", "Redis", "缓存策略"]
aliases: ["缓存策略", "过期时间", "Redis管道", "连接池"]
---

# Redis 高级应用

## 过期时间与失效策略

```python
# 设置过期时间
r.setex('cache:key', 300, 'value')         # 300 秒过期
r.expire('cache:key', 600)                 # 设置/修改过期时间
r.ttl('cache:key')                         # 查看剩余秒数（-2=已过期）
```

| 过期策略 | 说明 | 特点 |
|----------|------|------|
| **定时删除** | 创建时启动定时器，到期立即删除 | 内存友好，CPU 负担大（不常用） |
| **惰性删除** | 访问时检查是否过期，过期则删 | CPU 友好，过期 key 可能残留 |
| **定期删除** | 每秒扫描部分 key 并删除过期 key | 折中方案，Redis 默认使用（惰性+定期） |

## 缓存淘汰策略（内存满时）

当 Redis 内存达到 `maxmemory` 限制时，按以下策略淘汰：

| 策略 | 行为 | 适用场景 |
|------|------|----------|
| `noeviction`（默认） | 不淘汰，写操作返回错误 | 不能丢数据的场景 |
| `allkeys-lru` | 淘汰最近最少使用的 key | 通用缓存，最常用 |
| `allkeys-lfu` | 淘汰最不常使用的 key | 访问频率差异大的场景 |
| `volatile-lru` | 仅在设了过期时间的 key 中淘汰 LRU | 混合存储 |
| `volatile-ttl` | 淘汰剩余 TTL 最短的 key | 优先保留新缓存 |

## 缓存模式

```python
# Cache Aside（旁路缓存）— 最常用
def get_prediction(model_id, input_data):
    cache_key = f"pred:{model_id}:{hash(input_data)}"

    # 1. 查缓存
    result = r.get(cache_key)
    if result is not None:
        return result

    # 2. 缓存未命中，执行推理
    result = model.predict(input_data)

    # 3. 写入缓存（带过期时间）
    r.setex(cache_key, 3600, result)
    return result
```

## 连接池

```python
pool = redis.ConnectionPool(
    host='localhost',
    port=6379,
    max_connections=20,
    decode_responses=True
)
r = redis.Redis(connection_pool=pool)
```

## 管道（Pipeline）

在一次网络请求中批量执行多条命令，大幅减少网络开销：

```python
pipe = r.pipeline()
for i in range(1000):
    pipe.set(f'key:{i}', f'value:{i}')
pipe.execute()          # 一次性发送到 Redis
```

## 发布订阅（Pub/Sub）

```python
# 发布者
r.publish('channel:train', 'start_epoch_10')

# 订阅者
pubsub = r.pubsub()
pubsub.subscribe('channel:train')
for message in pubsub.listen():
    print(message['data'])
```

## ML 中的典型缓存架构

```
[请求] → [查缓存 Redis] ─命中→ [直接返回]
                │
             未命中
                ↓
         [模型推理/Python计算]
                ↓
         [写入缓存 Redis]
                ↓
           [返回结果]
```


## 面试追问

**Q1（基础）**：Redis的过期策略有哪些？惰性删除和定期删除是如何配合工作的？
回答要点：① 三种策略：定时删除（到期立即删，CPU负担大）、惰性删除（访问时检查过期，CPU友好但过期Key可能残留）、定期删除（周期扫描部分Key清理，折中方案）。② Redis默认使用惰性删除+定期删除的配合方案。③ 定期删除每秒扫描多次，每次取部分Key检查，避免一次性扫描全部Key导致卡顿。

**Q2（深挖）**：Cache Aside（旁路缓存）模式的核心流程是什么？在模型推理缓存中如何实现？
回答要点：① 查缓存→命中返回；未命中→执行推理→写入缓存→返回结果。② 写入缓存时一定要设过期时间（setex），避免缓存永久占用内存。③ 缓存更新策略：更新数据库时先淘汰缓存而非更新缓存，延迟加载直到下次请求时重建，以保持最终一致性。④ 需要考虑缓存穿透、缓存雪崩和缓存击穿问题。

**Q3（实战）**：Redis的Pipeline和Pub/Sub分别适合ML系统中的什么场景？请举例说明。
回答要点：① Pipeline将多条命令一次性发送到Redis执行，适合批量写入1000条训练日志或批量设置实验配置的场景，可大幅减少网络RTT开销。② Pub/Sub用于发布-订阅模式，适合ML训练的进度通知（如epoch完成时广播消息）、分布式Worker之间的协调信号。③ Pipeline注意事项：批量太大时需分批避免阻塞；Pub/Sub不持久化消息，订阅者离线会丢失消息。

**Q4（边界）**：当Redis内存超出maxmemory限制时会发生什么？各淘汰策略如何选择？
回答要点：① 根据maxmemory-policy策略执行淘汰：noeviction（默认）拒绝写操作返回错误；allkeys-lru淘汰最近最少使用的Key（最常用）；volatile-lru/ttl仅在设置了过期时间的Key中淘汰。② 不适合缓存的重要数据不应使用设置了淘汰策略的Redis存储。③ 生产环境中通常设置为allkeys-lru，配合合理的maxmemory和监控告警，避免数据被意外淘汰。

> 参见 [[05-Redis核心数据结构]]、[[04-PyMySQL模块]]、[[03-文本处理三剑客]]
