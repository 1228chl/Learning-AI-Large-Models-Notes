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

# 1. 建立连接 —— charset 使用 utf8mb4 以完整支持 4 字节字符（emoji 等），关闭自动提交让应用控制事务边界
conn = pymysql.connect(

    host='localhost',

    port=3306,

    user='root',

    password='root',

    database='ml_data',

    charset='utf8mb4',

    autocommit=False      # 关闭自动提交，由应用层显式控制事务的原子性（多条操作要么全成功要么全回滚）
)

# 2. 获取游标 —— 游标是执行 SQL 和读取结果集的入口，相当于 Python 与数据库之间的管道
cursor = conn.cursor()

# 3. 执行 SQL —— 使用 %s 占位符而非字符串拼接，确保用户输入永远被当作值而非 SQL 代码执行
sql = "SELECT * FROM users WHERE age > %s"
cursor.execute(sql, (25,))          # 将参数以元组形式传入，由驱动自动转义，彻底消除 SQL 注入风险

# 4. 获取结果 —— fetchall() 一次取回所有行（适合小数据集），fetchone() 逐行读取节省内存，fetchmany(n) 分批获取平衡效率与开销
results = cursor.fetchall()         # 获取全部
# row = cursor.fetchone()            # 获取一条
# many = cursor.fetchmany(100)       # 获取 100 条

# 5. 提交事务（如果是写操作）—— 只有 commit() 后修改才会持久化到数据库；不执行 commit() 则连接关闭时所有更改自动回滚
conn.commit()

# 6. 关闭连接 —— 先关游标再关连接：游标持有服务器端的结果集资源，必须优先释放，否则可能导致连接无法正常归还或资源泄漏
cursor.close()
conn.close()
```

## 参数化查询（防止 SQL 注入）

```python
# 不安全：字符串拼接 — 用户输入直接嵌入 SQL 语句，恶意值如 "' OR '1'='1" 可改变查询逻辑
sql = f"SELECT * FROM users WHERE name = '{user_input}'"

# 安全：参数化查询 — 驱动将 %s 占位符替换为用户输入并自动转义，输入仅作为值传递，永不参与 SQL 解析
sql = "SELECT * FROM users WHERE name = %s"
cursor.execute(sql, (user_input,))
```

## 批量操作

```python
# 批量插入（适合导入大量训练数据）—— executemany 将多条 INSERT 合并为一次数据库往返，远快于逐条循环插入
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
# 事务保证原子性：转账扣款和收款两条 UPDATE 要么全部执行成功，要么全部回滚，杜绝部分更新导致数据不一致
try:
    conn.begin()                        # 显式开启事务

    cursor.execute("UPDATE accounts SET balance = balance - 100 WHERE id = 1")

    cursor.execute("UPDATE accounts SET balance = balance + 100 WHERE id = 2")
    conn.commit()                       # 两条更新均成功，持久化变更
except Exception as e:
    conn.rollback()                     # 任一更新失败，撤销全部更改，恢复数据到事务开始前的状态
    print(f"Transaction failed: {e}")
```

## 连接池（生产环境推荐）

```python
from dbutils.pooled_db import PooledDB
import pymysql

# 连接池复用数据库连接，避免每次请求都经历 TCP 三次握手和身份认证的开销
pool = PooledDB(

    creator=pymysql,

    maxconnections=10,      # 最大连接数：根据并发量估算，避免超过数据库上限

    host='localhost',

    user='root',

    password='root',

    database='ml_data'
)


conn = pool.connection()    # 从池中获取可用连接（而非新建），使用后自动归还

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
**回答要点**：

1. 建立连接：通过 pymysql.connect() 指定主机、端口、用户、密码、数据库、编码（charset='utf8mb4'）并关闭自动提交（autocommit=False），让应用控制事务边界
2. 获取游标：conn.cursor() 返回游标对象，作为执行 SQL 和读取结果集的入口
3. 执行 SQL：cursor.execute(sql, params) 使用 %s 占位符参数化传递，确保用户输入永远被当作值而非 SQL 代码
4. 获取结果：fetchall() 一次取回所有行，fetchone() 逐行读取节省内存，fetchmany(n) 分批获取平衡效率与开销
5. 提交事务：写操作后调用 conn.commit() 持久化变更，不执行则连接关闭时所有更改自动回滚
6. 关闭连接：先 cursor.close() 释放游标持有的服务器端结果集资源，再 conn.close() 关闭连接

**Q2（深挖）**：为什么必须使用参数化查询（%s 占位符）而不是 Python 字符串格式化拼接 SQL？SQL 注入是什么？
**回答要点**：

1. 字符串拼接 SQL 存在 SQL 注入风险：恶意输入可闭合引号注入破坏性 SQL 代码，如 "' OR '1'='1" 可改变查询逻辑，导致数据泄露或删除
2. 参数化查询由数据库驱动自动转义特殊字符，确保用户输入仅作为值传递而非 SQL 代码执行，从根本上消除注入风险
3. 即使工具不面向外部用户，字符串拼接也可能因特殊字符（单引号、反斜杠）导致 SQL 语法错误，参数化查询是最佳实践

**Q3（实战）**：在生产环境的 ML 数据流水线中，你会如何使用连接池而不是每次创建新连接？请说明配置要点。
**回答要点**：

1. 使用 dbutils.pooled_db.PooledDB 创建连接池，设置 maxconnections 控制最大连接数，每次从池中获取连接而非新建
2. 连接复用避免了每次请求都经历 TCP 三次握手和身份认证的开销，使用后自动归还连接池而非关闭，显著提升并发性能
3. 配置要点：maxconnections 根据并发量设定（通常 10-50）、设置超时参数防止连接泄漏、生产环境将 autocommit=False 手动管理事务

**Q4（边界）**：PyMySQL 相比 SQLAlchemy 这样的 ORM 框架有什么不足？什么场景下应考虑使用 ORM？
**回答要点**：

1. PyMySQL 需手写 SQL，表结构变化时需要手动维护所有 SQL 语句；ORM 提供对象映射，表结构变更只改模型定义即可
2. ORM 提供声明式关系、迁移工具（Alembic）、会话管理和懒加载，适合业务系统快速开发和团队协作
3. 但 ORM 存在性能开销（N+1 查询问题、自动生成的 SQL 可能不优），在 ML 高性能数据导出/批量插入场景下 PyMySQL 更灵活高效

## 参考引用
- 需要理解MySQL核心操作的相关知识，参见 [MySQL核心操作](02-MySQL核心操作.md)
- 需要理解MySQL高级特性的相关知识，参见 [MySQL高级特性](03-MySQL高级特性.md)
- 需要理解SQL基础与数据库设计的相关知识，参见 [SQL基础与数据库设计](01-SQL基础与数据库设计.md)
