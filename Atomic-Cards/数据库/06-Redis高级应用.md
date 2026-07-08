---
author: "XunZong"
created: "2026-07-06"
tags: ["数据库", "Redis", "缓存策略"]
aliases: ["缓存策略", "过期时间", "Redis管道", "连接池"]
---

# Redis 高级应用

## 过期时间与失效策略

```python
# 设置过期时间 —— 避免缓存永久占用内存，自动清理冷数据
r.setex('cache:key', 300, 'value')         # 300 秒过期（set 与 expire 原子操作）
r.expire('cache:key', 600)                 # 设置/修改过期时间，适用于已存在的 key
r.ttl('cache:key')                         # 查看剩余秒数（-2=key 已删除，-1=永不过期）
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
# Cache Aside（旁路缓存）— 最常用，应用层主动管理缓存，与计算层解耦
def get_prediction(model_id, input_data):
    # 拼接唯一缓存键，以模型 ID 和输入哈希为标识，避免不同请求互相覆盖
    cache_key = f"pred:{model_id}:{hash(input_data)}"

    # 1. 先查缓存 —— 利用 Redis 内存高速读取，避免重复的模型推理
    result = r.get(cache_key)
    if result is not None:
        # 缓存命中，直接返回结果，跳过昂贵的模型推理
        return result

    # 2. 缓存未命中，执行模型推理（耗时操作，应尽量减少调用次数）
    result = model.predict(input_data)

    # 3. 写入缓存并设置过期时间 —— 确保冷数据自动淘汰，防止内存持续膨胀
    r.setex(cache_key, 3600, result)
    return result
```

## 连接池

```python
# 创建连接池 —— 复用 TCP 连接，避免每次操作都经历三次握手与四次挥手
pool = redis.ConnectionPool(
    host='localhost',       # Redis 服务器地址，生产环境应改用配置变量替代硬编码
    port=6379,               # Redis 默认端口
    max_connections=20,      # 最大连接数，防止突发流量打满单机端口资源
    decode_responses=True    # 自动将 bytes 解码为 str，避免手动 decode 的繁琐
)
# 使用连接池创建客户端，后续所有 Redis 操作自动从池中获取/归还连接
r = redis.Redis(connection_pool=pool)
```

## 管道（Pipeline）

在一次网络请求中批量执行多条命令，大幅减少网络开销：

```python
# 创建管道对象 —— 将多条命令暂存于客户端缓冲区，而非逐条发送
pipe = r.pipeline()
for i in range(1000):
    pipe.set(f'key:{i}', f'value:{i}')      # 仅入队，不实际发送
# execute() 一次性将所有命令发往 Redis —— 将 1000 次网络往返减少为 1 次
pipe.execute()
```

## 发布订阅（Pub/Sub）

```python
# ===== 发布者（Publisher）=====
# 向频道发布消息 —— 所有订阅该频道的客户端会实时收到通知
r.publish('channel:train', 'start_epoch_10')

# ===== 订阅者（Subscriber）=====
# 创建订阅对象并订阅频道 —— 建立持久连接监听消息
pubsub = r.pubsub()
pubsub.subscribe('channel:train')
# listen() 返回一个阻塞式生成器，持续等待并处理新消息
for message in pubsub.listen():
    # message['data'] 为消息体，实际使用前通常需要 decode 为字符串
    print(message['data'])
```

## ML 中的典型缓存架构

```python
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

**Q1（基础）**：Redis 的过期策略有哪些？惰性删除和定期删除是如何配合工作的？

**回答要点**：① 三种策略：定时删除（到期立即删，CPU 负担大）、惰性删除（访问时检查过期，CPU 友好但过期 Key 可能残留）、定期删除（周期扫描部分 Key 清理，折中方案）。② Redis 默认使用惰性删除+定期删除的配合方案。③ 定期删除每秒扫描多次，每次取部分 Key 检查，避免一次性扫描全部 Key 导致卡顿。

**Q2（深挖）**：Cache Aside（旁路缓存）模式的核心流程是什么？在模型推理缓存中如何实现？

**回答要点**：① 查缓存→命中返回；未命中→执行推理→写入缓存→返回结果。② 写入缓存时一定要设过期时间（setex），避免缓存永久占用内存。③ 缓存更新策略：更新数据库时先淘汰缓存而非更新缓存，延迟加载直到下次请求时重建，以保持最终一致性。④ 需要考虑缓存穿透、缓存雪崩和缓存击穿问题。

**Q3（实战）**：Redis 的 Pipeline 和 Pub/Sub 分别适合 ML 系统中的什么场景？请举例说明。

**回答要点**：① Pipeline 将多条命令一次性发送到 Redis 执行，适合批量写入 1000 条训练日志或批量设置实验配置的场景，可大幅减少网络 RTT 开销。② Pub/Sub 用于发布-订阅模式，适合 ML 训练的进度通知（如 epoch 完成时广播消息）、分布式 Worker 之间的协调信号。③ Pipeline 注意事项：批量太大时需分批避免阻塞；Pub/Sub 不持久化消息，订阅者离线会丢失消息。

**Q4（边界）**：当 Redis 内存超出 maxmemory 限制时会发生什么？各淘汰策略如何选择？

**回答要点**：① 根据 maxmemory-policy 策略执行淘汰：noeviction（默认）拒绝写操作返回错误；allkeys-lru 淘汰最近最少使用的 Key（最常用）；volatile-lru/ttl 仅在设置了过期时间的 Key 中淘汰。② 不适合缓存的重要数据不应使用设置了淘汰策略的 Redis 存储。③ 生产环境中通常设置为 allkeys-lru，配合合理的 maxmemory 和监控告警，避免数据被意外淘汰。

## 参考引用
- 需要理解SQL基础与数据库设计的相关知识，参见 [SQL基础与数据库设计](./01-SQL基础与数据库设计.md)
- 需要了解 Socket网络编程的相关知识，参见 [Socket网络编程](../Python/09-Socket网络编程.md)
- 需要理解Redis核心数据结构的相关知识，参见 [Redis核心数据结构](./05-Redis核心数据结构.md)