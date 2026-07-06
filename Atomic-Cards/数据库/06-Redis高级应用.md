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

> 参见 [[05-Redis核心数据结构]]、[[04-PyMySQL模块]]、[[03-文本处理三剑客]]
