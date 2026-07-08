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

## ML 中的 PyMySQL 使用

| 应用场景 | 典型操作 | 说明 |
|----------|----------|------|
| **训练数据导出** | `SELECT ... INTO OUTFILE` 或 Python 读取后存为 CSV | 从业务数据库提取训练集 |
| **特征宽表构建** | 多表 `JOIN` + `GROUP BY` 聚合 | 组合用户、行为、商品表为特征矩阵 |
| **实验日志存储** | 每条实验记录 `INSERT` 到 MySQL | 记录超参数、指标、模型路径 |
| **模型元数据管理** | 模型名、版本、精度、部署状态存入表 | 追踪实验版本和模型部署状态 |

## 面试追问

**Q1（基础）**：使用 PyMySQL 操作 MySQL 数据库的标准六步法是什么？每一步的作用是什么？

**回答要点**：① 建立连接（指定主机、端口、用户、密码、数据库、编码）；② 获取游标；③ 执行 SQL（execute）；④ 获取结果（fetchall/fetchone/fetchmany）；⑤ 提交事务（写操作后 commit）；⑥ 关闭连接（先关游标再关连接）。⑥ 第⑤步容易被遗忘，导致数据未持久化。

**Q2（深挖）**：为什么必须使用参数化查询（%s 占位符）而不是 Python 字符串格式化拼接 SQL？SQL 注入是什么？

**回答要点**：① 字符串拼接 SQL 存在 SQL 注入风险：恶意输入可以闭合引号插入破坏性 SQL 代码，导致数据泄露或删除。② 参数化查询由数据库驱动自动转义特殊字符，保证输入仅作为值处理而非 SQL 代码。③ 即使只是内部工具不面向用户，字符串格式化也可能因特殊字符（单引号、反斜杠）导致 SQL 语法错误。

**Q3（实战）**：在生产环境的 ML 数据流水线中，你会如何使用连接池而不是每次创建新连接？请说明配置要点。

**回答要点**：① 使用 dbutils.pooled_db.PooledDB 创建连接池，设置 maxconnections 控制最大连接数。② 每次从池中获取连接（pool.connection()），用后归还而非关闭，避免频繁建立 TCP 连接的开销。③ 配置要点：最大连接数根据并发量设定（通常 10-50）、设置超时参数避免连接泄露、生产环境应将 autocommit 设为 False 手动管理事务。

**Q4（边界）**：PyMySQL 相比 SQLAlchemy 这样的 ORM 框架有什么不足？什么场景下应考虑使用 ORM？

**回答要点**：① PyMySQL 需手写 SQL，表结构变化时需要手动维护所有 SQL；ORM 提供对象映射，表结构变更只需改模型定义。② ORM 提供声明式关系、迁移工具（Alembic）、会话管理和懒加载，适合业务系统快速开发。③ 但 ORM 有性能开销（N+1 查询问题、自动生成的 SQL 可能不优），在 ML 高性能数据导出/批量插入场景下 PyMySQL 更灵活高效。

> 理解前置知识可参见 [MySQL核心操作](./02-MySQL核心操作.md)；理解前置知识可参见 [MySQL高级特性](./03-MySQL高级特性.md)；理解前置知识可参见 [SQL基础与数据库设计](./01-SQL基础与数据库设计.md)