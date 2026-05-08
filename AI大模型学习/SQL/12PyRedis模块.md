## 详细笔记：Python操作Redis（redis-py）

### 一、redis-py 模块安装

`redis-py` 是 Redis 官方推荐的 Python 客户端库，完全支持 Redis 的命令。

**安装方式：**

```bash
# 方式1：使用 pip
pip install redis

# 方式2：指定版本
pip install redis==4.5.0

# 方式3：使用 conda（如果使用 Anaconda）
conda install redis-py
```

**验证安装：**

```python
import redis
print(redis.__version__)   # 例如 4.5.0
```

> 注意：在代码中导入时使用 `import redis`，无论通过 pip 还是 conda 安装的库都叫 `redis`。

---

### 二、连接 Redis 数据库

#### 2.1 连接参数详解

| 参数                     | 说明                                             | 默认值        |
| ------------------------ | ------------------------------------------------ | ------------- |
| `host`                   | Redis 服务器地址                                 | `'localhost'` |
| `port`                   | Redis 服务端口                                   | `6379`        |
| `db`                     | 数据库编号（0~15）                               | `0`           |
| `password`               | 密码（如果设置了 requirepass）                   | `None`        |
| `decode_responses`       | 是否自动将返回的字节解码为字符串（推荐设为True） | `False`       |
| `socket_timeout`         | 连接超时时间（秒）                               | `None`        |
| `socket_connect_timeout` | 连接建立超时                                     | `None`        |
| `max_connections`        | 连接池最大连接数                                 | `None`        |

#### 2.2 基本连接示例

```python
import redis

# 创建 Redis 连接对象
r = redis.Redis(
    host='localhost',
    port=6379,
    db=0,
    password=None,           # 若无密码则省略或设为None
    decode_responses=True    # 关键：使返回值为字符串而非字节
)

# 测试连接
try:
    response = r.ping()      # 返回 True 表示连接正常
    print("Redis 连接成功:", response)
except redis.ConnectionError as e:
    print("Redis 连接失败:", e)
```

> **说明**：`decode_responses=True` 会让所有命令返回字符串，而不是 `b'value'` 形式的字节串，非常方便。

#### 2.3 连接池方式（推荐生产环境）

```python
pool = redis.ConnectionPool(
    host='localhost',
    port=6379,
    db=0,
    decode_responses=True,
    max_connections=10
)
r = redis.Redis(connection_pool=pool)
```

---

### 三、数据类型操作（详细代码示例）

#### 3.1 字符串（String）

Redis 字符串是最基础的类型，可以存储文本、数字、JSON 等。

| 方法                                | 说明                       |
| ----------------------------------- | -------------------------- |
| `set(key, value)`                   | 设置键值                   |
| `get(key)`                          | 获取值，不存在返回 None    |
| `mset({k1:v1, k2:v2})`              | 批量设置                   |
| `mget([key1, key2])`                | 批量获取                   |
| `setex(key, seconds, value)`        | 设置值并指定过期时间（秒） |
| `incr(key)` / `incrby(key, amount)` | 原子递增                   |
| `decr(key)` / `decrby(key, amount)` | 原子递减                   |

**代码示例：**

```python
import redis
r = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)

# 基本设置与获取
r.set('name', '张三')
name = r.get('name')
print(name)  # 输出: 张三

# 批量操作
r.mset({'age': '25', 'city': '北京'})
values = r.mget(['name', 'age', 'city'])
print(values)  # 输出: ['张三', '25', '北京']

# 带过期时间的设置（60秒后自动删除）
r.setex('temp_token', 60, 'abc123')

# 数值操作
r.set('counter', '0')
r.incr('counter')          # 自增1
print(r.get('counter'))    # 1
r.incrby('counter', 5)     # 增加5
print(r.get('counter'))    # 6
r.decr('counter')          # 自减1
print(r.get('counter'))    # 5
```

#### 3.2 哈希（Hash）

Hash 适合存储对象，一个 key 对应多个 field-value 对。

| 方法                          | 说明                            |
| ----------------------------- | ------------------------------- |
| `hset(name, key, value)`      | 设置单个字段                    |
| `hget(name, key)`             | 获取单个字段                    |
| `hmset(name, mapping)`        | 批量设置（**4.0以上可用hset**） |
| `hmget(name, keys)`           | 批量获取                        |
| `hgetall(name)`               | 获取所有字段和值（返回字典）    |
| `hkeys(name)` / `hvals(name)` | 获取所有字段名 / 所有值         |
| `hdel(name, *keys)`           | 删除一个或多个字段              |

**注意**：在 redis-py 4.0+ 中，`hmset` 已被废弃，直接使用 `hset` 传入字典即可。

**代码示例：**

```python
# 设置单个字段
r.hset('user:1001', 'name', '李四')
r.hset('user:1001', 'age', 30)

# 批量设置字段
r.hset('user:1002', mapping={
    'name': '王五',
    'age': 28,
    'city': '广州'
})

# 获取单个字段
name = r.hget('user:1001', 'name')
print(name)  # 李四

# 获取多个字段
fields = r.hmget('user:1002', ['name', 'age'])
print(fields)  # ['王五', '28']

# 获取所有字段（字典）
user_info = r.hgetall('user:1001')
print(user_info)  # {'name': '李四', 'age': '30'}

# 获取所有字段名
keys = r.hkeys('user:1001')
print(keys)  # ['name', 'age']

# 获取所有字段值
values = r.hvals('user:1001')
print(values)  # ['李四', '30']

# 删除字段
r.hdel('user:1001', 'age')
print(r.hgetall('user:1001'))  # {'name': '李四'}
```

#### 3.3 列表（List）

Redis 列表是双向链表，支持从两端推入/弹出。

| 方法                      | 说明                       |
| ------------------------- | -------------------------- |
| `lpush(key, *values)`     | 从左侧插入一个或多个元素   |
| `rpush(key, *values)`     | 从右侧插入一个或多个元素   |
| `lpop(key)`               | 从左侧弹出一个元素         |
| `rpop(key)`               | 从右侧弹出一个元素         |
| `llen(key)`               | 获取列表长度               |
| `lrange(key, start, end)` | 获取指定范围的元素（索引） |
| `lindex(key, index)`      | 获取指定索引的元素         |
| `lrem(key, count, value)` | 删除指定数量的值           |

**代码示例：**

```python
# 从左侧插入
r.lpush('tasks', 'task3', 'task2', 'task1')  # 最终顺序: task1, task2, task3

# 从右侧插入
r.rpush('tasks', 'task4', 'task5')

# 获取列表长度
length = r.llen('tasks')
print(f"长度: {length}")  # 5

# 获取全部元素
all_tasks = r.lrange('tasks', 0, -1)
print(all_tasks)  # ['task1', 'task2', 'task3', 'task4', 'task5']

# 获取前三个元素
first_three = r.lrange('tasks', 0, 2)
print(first_three)  # ['task1', 'task2', 'task3']

# 从左侧弹出（队列行为）
left_task = r.lpop('tasks')
print(f"左侧弹出: {left_task}")  # task1

# 从右侧弹出（栈行为）
right_task = r.rpop('tasks')
print(f"右侧弹出: {right_task}")  # task5

# 剩余列表
print(r.lrange('tasks', 0, -1))  # ['task2', 'task3', 'task4']
```

#### 3.4 集合（Set）

无序、唯一元素的集合，支持交集、并集、差集运算。

| 方法                     | 说明                           |
| ------------------------ | ------------------------------ |
| `sadd(key, *members)`    | 添加一个或多个元素             |
| `smembers(key)`          | 返回所有元素（无序）           |
| `sismember(key, member)` | 判断元素是否存在               |
| `scard(key)`             | 获取集合元素个数               |
| `spop(key, count=1)`     | 随机弹出一个或多个元素         |
| `srem(key, *members)`    | 移除一个或多个元素             |
| `sinter(keys)`           | 返回多个集合的交集             |
| `sunion(keys)`           | 返回多个集合的并集             |
| `sdiff(keys)`            | 返回第一个集合与其它集合的差集 |

**代码示例：**

```python
# 添加元素
r.sadd('tags', 'python', 'redis', 'database', 'cache')

# 获取所有元素
tags = r.smembers('tags')
print(tags)  # {'redis', 'python', 'cache', 'database'}

# 判断是否存在
exists = r.sismember('tags', 'python')
print(exists)  # True

# 元素个数
count = r.scard('tags')
print(count)  # 4

# 随机弹出一个元素
random_tag = r.spop('tags')
print(f"随机弹出: {random_tag}")

# 移除指定元素
r.srem('tags', 'database')
print(r.smembers('tags'))

# 集合运算
r.sadd('set1', 'a', 'b', 'c')
r.sadd('set2', 'b', 'c', 'd')

inter = r.sinter('set1', 'set2')
print("交集:", inter)  # {'b', 'c'}

union = r.sunion('set1', 'set2')
print("并集:", union)  # {'a', 'b', 'c', 'd'}

diff = r.sdiff('set1', 'set2')
print("差集(set1 - set2):", diff)  # {'a'}
```

#### 3.5 有序集合（Sorted Set）

每个元素关联一个分数（score），按分数排序。

| 方法                                             | 说明                           |
| ------------------------------------------------ | ------------------------------ |
| `zadd(key, {member: score, ...})`                | 添加一个或多个带分数的元素     |
| `zrange(key, start, stop, withscores=False)`     | 按分数升序获取元素（索引范围） |
| `zrevrange(key, start, stop, withscores=False)`  | 按分数降序获取                 |
| `zscore(key, member)`                            | 获取元素的分数                 |
| `zincrby(key, amount, member)`                   | 增加元素的分数                 |
| `zrank(key, member)` / `zrevrank(key, member)`   | 获取升序/降序排名（从0开始）   |
| `zrangebyscore(key, min, max, withscores=False)` | 按分数范围获取元素             |
| `zrem(key, *members)`                            | 删除一个或多个元素             |

**代码示例：**

```python
# 添加带分数的元素
r.zadd('leaderboard', {
    'player1': 1000,
    'player2': 1500,
    'player3': 800,
    'player4': 2000
})

# 升序获取（分数从小到大）
asc = r.zrange('leaderboard', 0, -1, withscores=True)
print("升序:", asc)  # [('player3', 800.0), ('player1', 1000.0), ('player2', 1500.0), ('player4', 2000.0)]

# 降序获取（分数从大到小）
desc = r.zrevrange('leaderboard', 0, -1, withscores=True)
print("降序:", desc)  # [('player4', 2000.0), ('player2', 1500.0), ('player1', 1000.0), ('player3', 800.0)]

# 获取元素分数
score = r.zscore('leaderboard', 'player2')
print(f"player2分数: {score}")  # 1500.0

# 增加分数
r.zincrby('leaderboard', 500, 'player1')
print(r.zscore('leaderboard', 'player1'))  # 1500.0

# 获取排名（降序排名，0为第一名）
rank = r.zrevrank('leaderboard', 'player4')
print(f"player4排名: {rank + 1}")  # 1

# 按分数范围获取（1000~2000）
high_scores = r.zrangebyscore('leaderboard', 1000, 2000, withscores=True)
print("高分玩家:", high_scores)
```

---

### 四、键操作与过期时间

| 方法                         | 说明                                     |
| ---------------------------- | ---------------------------------------- |
| `exists(key)`                | 返回键是否存在（1存在，0不存在）         |
| `expire(key, seconds)`       | 设置过期时间（秒）                       |
| `pexpire(key, milliseconds)` | 设置过期时间（毫秒）                     |
| `ttl(key)`                   | 返回剩余生存时间（秒），-1表示永不过期   |
| `pttl(key)`                  | 返回剩余生存时间（毫秒）                 |
| `persist(key)`               | 移除过期时间，使键永久存在               |
| `keys(pattern)`              | 查找匹配模式的键（生产环境慎用，会阻塞） |
| `delete(*keys)`              | 删除一个或多个键                         |
| `flushdb()`                  | 清空当前数据库所有键（危险操作）         |

**代码示例：**

```python
# 设置一个带过期时间的键
r.setex('session:abc', 300, 'user_data')   # 5分钟后过期

# 检查存在
if r.exists('session:abc'):
    print("键存在")
else:
    print("键已过期或不存在")

# 查看剩余时间
ttl = r.ttl('session:abc')
print(f"剩余 {ttl} 秒")

# 修改过期时间
r.expire('session:abc', 600)  # 改为10分钟

# 移除过期时间，使其永久
r.persist('session:abc')
print(r.ttl('session:abc'))  # -1 表示永不过期

# 查找所有以 'user:' 开头的键
user_keys = r.keys('user:*')
print(user_keys)

# 删除键
r.delete('session:abc')
```

> **警告**：`keys()` 命令在 Redis 生产环境大数据量下会造成阻塞，推荐使用 `scan_iter()` 代替。

```python
# 使用 scan_iter 安全遍历
for key in r.scan_iter(match='user:*', count=100):
    print(key)
```

---

### 五、实战案例：简单的缓存系统

下面封装一个通用的缓存类，支持任意 Python 对象（通过 JSON 序列化），并提供自动过期功能。

```python
import redis
import json
import time

class RedisCache:
    def __init__(self, host='localhost', port=6379, db=0, password=None, decode_responses=True):
        self.client = redis.Redis(
            host=host,
            port=port,
            db=db,
            password=password,
            decode_responses=decode_responses
        )

    def set(self, key, value, expire_seconds=3600):
        """设置缓存，value可以是任意可JSON序列化的对象"""
        try:
            value_str = json.dumps(value, ensure_ascii=False)
            self.client.setex(key, expire_seconds, value_str)
            return True
        except Exception as e:
            print(f"设置缓存失败 [{key}]: {e}")
            return False

    def get(self, key):
        """获取缓存，自动反序列化"""
        try:
            value_str = self.client.get(key)
            if value_str is None:
                return None
            return json.loads(value_str)
        except Exception as e:
            print(f"获取缓存失败 [{key}]: {e}")
            return None

    def delete(self, key):
        """删除缓存"""
        return self.client.delete(key) > 0

    def exists(self, key):
        """判断缓存是否存在"""
        return self.client.exists(key) == 1

    def clear_all(self):
        """清空当前数据库所有缓存（危险）"""
        self.client.flushdb()
        return True

# ========== 模拟耗时操作 + 缓存使用 ==========
def expensive_operation(x):
    """模拟耗时计算（例如数据库查询或复杂运算）"""
    time.sleep(2)      # 模拟2秒延迟
    return x * x

def get_square_with_cache(cache, x):
    """使用缓存获取平方值"""
    cache_key = f"square:{x}"
    result = cache.get(cache_key)
    if result is None:
        print(f"缓存未命中，计算 {x} 的平方...")
        result = expensive_operation(x)
        cache.set(cache_key, result, expire_seconds=60)
        print("结果已缓存")
    else:
        print(f"缓存命中，直接返回 {x} 的平方")
    return result

if __name__ == "__main__":
    cache = RedisCache()

    # 第一次调用（计算并缓存）
    start = time.time()
    res1 = get_square_with_cache(cache, 5)
    print(f"结果: {res1}, 耗时: {time.time() - start:.2f}秒")

    # 第二次调用（直接从缓存获取）
    start = time.time()
    res2 = get_square_with_cache(cache, 5)
    print(f"结果: {res2}, 耗时: {time.time() - start:.2f}秒")
```

**运行效果：**
- 第一次耗时约 2 秒，输出“缓存未命中”。
- 第二次耗时接近 0 秒，输出“缓存命中”。

---

### 六、扩展知识

#### 6.1 连接池（Connection Pool）

生产环境强烈建议使用连接池，避免频繁创建和销毁连接。

```python
import redis

pool = redis.ConnectionPool(
    host='localhost',
    port=6379,
    db=0,
    decode_responses=True,
    max_connections=20
)
r = redis.Redis(connection_pool=pool)
```

#### 6.2 管道（Pipeline）

管道可以将多个命令打包一次性发送给 Redis，减少网络往返，提高批量操作性能。

```python
pipe = r.pipeline()
# 批量执行命令
pipe.set('key1', 'value1')
pipe.set('key2', 'value2')
pipe.incr('counter')
# 执行
pipe.execute()

# 或者使用上下文管理器
with r.pipeline() as pipe:
    pipe.set('a', 1)
    pipe.set('b', 2)
    pipe.execute()
```

#### 6.3 发布订阅（Pub/Sub）

```python
# 订阅者
pubsub = r.pubsub()
pubsub.subscribe('news')
for message in pubsub.listen():
    if message['type'] == 'message':
        print(f"收到: {message['data']}")

# 发布者
r.publish('news', 'Hello Redis!')
```

#### 6.4 Lua 脚本

Redis 支持 Lua 脚本，可实现原子性的复杂操作。

```python
script = """
local key = KEYS[1]
local increment = tonumber(ARGV[1])
local current = redis.call('get', key)
if current then
    current = tonumber(current) + increment
else
    current = increment
end
redis.call('set', key, current)
return current
"""
result = r.eval(script, 1, 'counter', 10)
print(result)  # 10（若之前无值则设为10）
```

#### 6.5 异常处理

```python
try:
    r.set('key', 'value')
    value = r.get('key')
except redis.ConnectionError as e:
    print("Redis连接错误:", e)
except redis.TimeoutError as e:
    print("操作超时:", e)
except redis.ResponseError as e:
    print("命令执行错误:", e)
```

#### 6.6 常见生产配置建议

- 设置 `socket_keepalive=True` 保持长连接。
- 使用 `retry` 机制（如 `tenacity` 库）处理瞬时故障。
- 对 `keys()` 使用 `scan_iter()` 代替。
- 合理设置 `decode_responses`，若不确定可保持 `False`，手动解码。

---

## 总结

| 数据类型   | 常用场景                       | 核心命令                              |
| ---------- | ------------------------------ | ------------------------------------- |
| String     | 缓存单值、计数器、分布式锁     | set, get, incr, setex                 |
| Hash       | 存储对象（用户信息、商品详情） | hset, hget, hgetall                   |
| List       | 消息队列、最新消息列表         | lpush, rpop, lrange                   |
| Set        | 标签系统、共同好友、唯一性判断 | sadd, smembers, sinter                |
| Sorted Set | 排行榜、带权重的任务队列       | zadd, zrange, zrevrank, zrangebyscore |

掌握 redis-py 的核心 API 后，可以轻松在 Python 中实现高性能缓存、队列、实时排行等功能。生产环境务必使用连接池，并注意异常处理和性能优化。