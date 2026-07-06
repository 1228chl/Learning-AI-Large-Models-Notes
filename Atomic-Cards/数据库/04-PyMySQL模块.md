---
author: "XunZong"
created: "2026-07-06"
tags: ["数据库", "MySQL", "PyMySQL"]
aliases: ["PyMySQL", "Python操作MySQL"]
---

# PyMySQL 模块

## 定义

PyMySQL 是一个纯 Python 实现的 MySQL 客户端库，兼容 Python DB API 2.0 规范，用于在 Python 中连接和操作 MySQL 数据库。

## 核心操作六步法

```python
import pymysql

# 1. 建立连接
conn = pymysql.connect(
    host='localhost',
    port=3306,
    user='root',
    password='root',
    database='ml_data',
    charset='utf8mb4',
    autocommit=False      # 关闭自动提交，手动管理事务
)

# 2. 获取游标
cursor = conn.cursor()

# 3. 执行 SQL
sql = "SELECT * FROM users WHERE age > %s"
cursor.execute(sql, (25,))          # 参数化查询防止 SQL 注入

# 4. 获取结果
results = cursor.fetchall()         # 获取全部
# row = cursor.fetchone()            # 获取一条
# many = cursor.fetchmany(100)       # 获取 100 条

# 5. 提交事务（如果是写操作）
conn.commit()

# 6. 关闭连接
cursor.close()
conn.close()
```

## 参数化查询（防止 SQL 注入）

```python
# 不安全：字符串拼接 — 有 SQL 注入风险
sql = f"SELECT * FROM users WHERE name = '{user_input}'"

# 安全：参数化查询 — 自动转义
sql = "SELECT * FROM users WHERE name = %s"
cursor.execute(sql, (user_input,))
```

## 批量操作

```python
# 批量插入（适合导入大量训练数据）
data = [
    ('Alice', 25, 0.85),
    ('Bob', 30, 0.92),
    ('Charlie', 28, 0.78),
]
sql = "INSERT INTO predictions (name, age, score) VALUES (%s, %s, %s)"
cursor.executemany(sql, data)
conn.commit()
```

## 事务管理

```python
try:
    conn.begin()
    cursor.execute("UPDATE accounts SET balance = balance - 100 WHERE id = 1")
    cursor.execute("UPDATE accounts SET balance = balance + 100 WHERE id = 2")
    conn.commit()
except Exception as e:
    conn.rollback()
    print(f"Transaction failed: {e}")
```

## 连接池（生产环境推荐）

```python
from dbutils.pooled_db import PooledDB
import pymysql

pool = PooledDB(
    creator=pymysql,
    maxconnections=10,      # 最大连接数
    host='localhost',
    user='root',
    password='root',
    database='ml_data'
)

conn = pool.connection()    # 从池中获取连接
cursor = conn.cursor()
```

> 参见 [[02-MySQL核心操作]]、[[03-MySQL高级特性]]、[[01-SQL基础与数据库设计]]
