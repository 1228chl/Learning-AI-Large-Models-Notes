**上一级：** [01MySQL数据库](01MySQL数据库.md)

**下一级：** [03PyRedis模块](03PyRedis模块.md)

**标签：** #sql #基础 

---

# 详细笔记：Python 操作 MySQL（PyMySQL）

## 一、PyMySQL 简介

PyMySQL 是一个纯 Python 实现的 MySQL 客户端库，用于在 Python 程序中连接和操作 MySQL 数据库。它完全兼容 Python DB API 2.0 规范。

**适用场景：**

- 批量数据插入/更新（例如 10 万条数据）
- 自动化数据报表生成
- Web 应用后端数据持久化
- 数据迁移、清洗等脚本

---

## 二、安装 PyMySQL

```bash
# 方式1：直接安装
pip install pymysql

# 方式2：使用国内镜像加速（清华源）
pip install pymysql -i https://pypi.tuna.tsinghua.edu.cn/simple/

# 方式3：在 PyCharm 等 IDE 中通过界面安装
```

验证安装：

```python
import pymysql
print(pymysql.__version__)   # 输出版本号，例如 1.0.2
```

---

## 三、核心操作步骤（六步法）

### 3.1 数据库连接参数说明

| 参数名       | 说明                                   | 示例值              |
| ------------ | -------------------------------------- | ------------------- |
| `host`       | MySQL 服务器地址                       | `'localhost'` 或 IP |
| `port`       | 端口号，默认 3306                      | `3306`              |
| `user`       | 登录用户名                             | `'root'`            |
| `password`   | 登录密码                               | `'root'`            |
| `database`   | 要连接的数据库名称                     | `'jing_dong'`       |
| `charset`    | 字符集，推荐 `'utf8mb4'`（支持 emoji） | `'utf8mb4'`         |
| `autocommit` | 是否自动提交（默认 False）             | `True` / `False`    |

---

### 3.2 基本流程代码框架

```python
import pymysql

# 1. 创建连接对象
conn = pymysql.connect(
    host='localhost',
    port=3306,
    user='root',
    password='your_password',
    database='your_db',
    charset='utf8mb4'
)

# 2. 创建游标对象（默认返回元组）
cursor = conn.cursor()

try:
    # 3. 执行 SQL 语句
    sql = "SELECT * FROM goods"
    rows = cursor.execute(sql)        # rows 是受影响的行数（对于查询是结果集行数）
    
    # 4. 获取结果（仅查询需要）
    result = cursor.fetchall()
    print(result)
    
    # 如果是增删改，需要提交事务
    # conn.commit()
    
except Exception as e:
    print("出错：", e)
    conn.rollback()    # 回滚
finally:
    # 5. 关闭游标
    cursor.close()
    # 6. 关闭连接
    conn.close()
```

---

## 四、查询操作（SELECT）

### 4.1 常用获取数据的方法

| 方法                     | 说明                                                |
| ------------------------ | --------------------------------------------------- |
| `cursor.execute(sql)`    | 执行 SQL，返回受影响的行数                          |
| `cursor.fetchone()`      | 获取结果集的下一行，返回元组，没有数据时返回 `None` |
| `cursor.fetchall()`      | 获取结果集中剩余的所有行，返回元组列表              |
| `cursor.fetchmany(size)` | 获取指定数量的行，默认 size=1                       |

---

### 4.2 完整查询示例

```python
import pymysql

conn = pymysql.connect(
    host='localhost',
    port=3306,
    user='root',
    password='root',
    database='jing_dong'
)

cursor = conn.cursor()

# 执行查询
sql = "SELECT id, name, price FROM goods WHERE price > %s"
rows = cursor.execute(sql, (3000,))   # 参数化查询，注意元组格式

print(f"共查询到 {rows} 条记录")

# 获取一行数据
row1 = cursor.fetchone()
print("第一行：", row1)

# 获取剩余所有行
remaining = cursor.fetchall()
print("剩余行：", remaining)

# 也可以使用 fetchmany 分批获取
cursor.execute(sql, (3000,))
while True:
    batch = cursor.fetchmany(3)
    if not batch:
        break
    for row in batch:
        print(row)

cursor.close()
conn.close()
```

---

### 4.3 使用字典游标（结果返回字典，更易读）

```python
cursor = conn.cursor(pymysql.cursors.DictCursor)
cursor.execute("SELECT id, name FROM goods LIMIT 2")
for row in cursor.fetchall():
    print(row['id'], row['name'])
```

---

## 五、增删改操作（INSERT / UPDATE / DELETE）

### 5.1 事务重要概念

- **事务（Transaction）**：一组要么全部执行成功、要么全部不执行的 SQL 操作。
- **ACID 特性**：原子性、一致性、隔离性、持久性。
- **存储引擎**：
  - `InnoDB`：支持事务、行级锁 → 需要手动 `commit()`
  - `MyISAM`：不支持事务 → 即使不 commit 也会生效（但无法回滚）

---

### 5.2 提交与回滚

```python
conn.commit()   # 提交事务，数据永久生效
conn.rollback() # 回滚事务，撤销自上次提交以来的所有更改
```

---

### 5.3 插入数据（INSERT）

```python
import pymysql

conn = pymysql.connect(
    host='127.0.0.1',
    port=3306,
    user='root',
    password='root',
    database='jing_dong'
)
cursor = conn.cursor()

# 单条插入（参数化）
sql = "INSERT INTO goods(name, cate_name, brand_name, price) VALUES (%s, %s, %s, %s)"
params = ('机械键盘', '外设', '罗技', 399.00)

try:
    rows = cursor.execute(sql, params)
    print(f"影响了 {rows} 行")
    conn.commit()   # InnoDB 必须提交
except Exception as e:
    print("插入失败：", e)
    conn.rollback()
finally:
    cursor.close()
    conn.close()
```

---

### 5.4 批量插入（executemany）

```python
data_list = [
    ('鼠标', '外设', '雷蛇', 199),
    ('显示器', '外设', '戴尔', 1299),
    ('耳机', '外设', '索尼', 599)
]

sql = "INSERT INTO goods(name, cate_name, brand_name, price) VALUES (%s, %s, %s, %s)"
cursor.executemany(sql, data_list)
conn.commit()
```

---

### 5.5 获取刚插入的自增 ID

```python
cursor.execute(sql, params)
conn.commit()
new_id = cursor.lastrowid
print(f"新记录的ID为：{new_id}")
```

---

### 5.6 更新数据（UPDATE）

```python
sql = "UPDATE goods SET price = %s WHERE name = %s"
params = (9999, '机械键盘')
cursor.execute(sql, params)
conn.commit()
```

---

### 5.7 删除数据（DELETE）

```python
sql = "DELETE FROM goods WHERE name = %s"
params = ('机械键盘',)

try:
    rows = cursor.execute(sql, params)
    conn.commit()
    print(f"删除了 {rows} 行")
except Exception as e:
    print("删除出错：", e)
    conn.rollback()
```

---

## 六、SQL 注入问题与防范

### 6.1 什么是 SQL 注入

攻击者通过在输入中插入特殊字符（如 `' or 1=1 --`），改变原有 SQL 语句的逻辑，从而绕过验证或窃取数据。

---

### 6.2 错误写法（存在注入漏洞）

```python
# 直接拼接字符串
sql = f"SELECT * FROM user WHERE user='{username}' AND pwd='{password}'"
cursor.execute(sql)
```

**攻击示例：**

- 用户名：任意（如 `admin`）
- 密码输入：`' or 1=1 or '`  
  实际执行 SQL：`SELECT * FROM user WHERE user='admin' AND pwd='' or 1=1 or ''`  
  条件恒为真，绕过登录。

---

### 6.3 正确写法（参数化查询）

```python
# 使用 %s 占位符，并将参数以列表/元组形式传入
sql = "SELECT * FROM user WHERE user=%s AND pwd=%s"
params = [username, password]
cursor.execute(sql, params)
```

PyMySQL 会自动对参数进行转义和加引号处理，彻底杜绝注入。

---

## 七、完整登录案例（含参数化查询）

```python
import pymysql

# 用户输入
username = input("请输入用户名：")
password = input("请输入密码：")

# 连接数据库
conn = pymysql.connect(
    host='127.0.0.1',
    port=3306,
    user='root',
    password='root',
    database='jing_dong',
    charset='utf8mb4'
)
cursor = conn.cursor()

# 参数化查询防止注入
sql = "SELECT * FROM user WHERE user=%s AND pwd=%s"
params = [username, password]

try:
    rows = cursor.execute(sql, params)   # rows 为匹配的行数
    if rows:
        print("登录成功")
    else:
        print("用户名或密码错误")
except Exception as e:
    print("数据库异常：", e)
finally:
    cursor.close()
    conn.close()
```

---

## 八、扩展与最佳实践

### 8.1 使用上下文管理器（with）

PyMySQL 的连接和游标对象支持上下文管理器，可自动关闭资源：

```python
import pymysql

with pymysql.connect(host='localhost', user='root', password='root', database='test') as conn:
    with conn.cursor() as cursor:
        cursor.execute("SELECT * FROM goods")
        result = cursor.fetchall()
        print(result)
    # 游标自动关闭
# 连接自动关闭（注意：with 不会自动 commit，仍需手动 conn.commit()）
```

---

### 8.2 设置自动提交

```python
conn = pymysql.connect(..., autocommit=True)   # 每条 SQL 自动提交
```

---

### 8.3 连接池（提升性能）

生产环境频繁创建连接开销大，可使用 `DBUtils` 或 `SQLAlchemy` 内置连接池。

```python
from dbutils.pooled_db import PooledDB
pool = PooledDB(pymysql, 5, host='localhost', user='root', password='root', database='test')
conn = pool.connection()
```

---

### 8.4 异常处理规范

```python
import pymysql

try:
    conn = pymysql.connect(...)
    cursor = conn.cursor()
    # 业务代码
except pymysql.Error as e:
    print(f"数据库错误：{e.args[0]} - {e.args[1]}")
finally:
    if cursor:
        cursor.close()
    if conn:
        conn.close()
```

---

### 8.5 密码等敏感信息不要硬编码

推荐使用环境变量或配置文件（如 `.env`）：

```python
import os
PASSWORD = os.getenv("MYSQL_PASSWORD")
```

---

## 九、总结

| 操作类型 | 核心方法                      | 是否需要 commit | 常用技巧             |
| -------- | ----------------------------- | --------------- | -------------------- |
| 查询     | `execute()` + `fetch*()`      | 否              | 使用 DictCursor      |
| 插入     | `execute()` / `executemany()` | 是              | 获取 `lastrowid`     |
| 更新     | `execute()`                   | 是              | 参数化查询           |
| 删除     | `execute()`                   | 是              | 谨慎使用，建议软删除 |
| 事务控制 | `commit()` / `rollback()`     | -               | 配合 try-except 使用 |

**关键记忆点：**

- 六步法：导包 → 连库 → 建游标 → 执行 SQL → 关游标 → 关连接
- 增删改必须 `commit()`
- 永远使用参数化查询防注入
- InnoDB 支持事务，MyISAM 不支持
