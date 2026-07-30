---
author: "XunZong"
created: "2026-07-30"
tags: ["数据库", "SQLAlchemy", "异步", "PostgreSQL", "asyncpg"]
aliases: ["SQLAlchemy异步", "asyncpg", "create_async_engine", "AsyncSession", "异步三件套"]
---

# SQLAlchemy 异步操作三件套

## 定义

**SQLAlchemy 异步操作三件套** 是 `create_async_engine`、`async_sessionmaker`、`AsyncSession` 三个核心组件的组合，用于在 Python 异步应用中（如 FastAPI）安全地执行数据库操作，避免同步阻塞事件循环。

### 三件套定义

```python
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

# ① 引擎 + 连接池
DATABASE_URL = "postgresql+asyncpg://user:password@localhost:5433/eduagent"
engine = create_async_engine(DATABASE_URL, echo=False)

# ② 会话工厂
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

# ③ AsyncSession → 执行 SQL 和管理事务
```

**三件套各自职责**：

| 组件 | 类比 | 职责 |
|------|------|------|
| `create_async_engine` | 数据库连接池（总水管） | 管理到数据库的异步连接池，所有 SQL 通过它发送 |
| `async_sessionmaker` | 会话工厂（水龙头制造机） | 创建 `AsyncSession` 实例的工厂，绑定引擎和默认参数 |
| `AsyncSession` | 工作单元（水龙头） | 执行 SQL、管理事务、持有连接，用完即还 |

### 换数据库只需改 URL

```python
# PostgreSQL（asyncpg 驱动）
DATABASE_URL = "postgresql+asyncpg://user:password@localhost:5433/eduagent"

# MySQL（aiomysql 驱动）
# DATABASE_URL = "mysql+aiomysql://user:password@localhost:3306/eduagent"

# SQLite（aiosqlite 驱动）
# DATABASE_URL = "sqlite+aiosqlite:///./eduagent.db"
```

### 参数化查询（防 SQL 注入）

```python
# ✅ 必用：参数化查询（字典传参，自动转义）
result = await db.execute(
    text("SELECT * FROM users WHERE username = :name AND role = :role"),
    {"name": "小明", "role": "student"}
)

# ❌ 禁用：f-string 拼接 SQL（存在注入风险）
# result = await db.execute(f"SELECT * FROM users WHERE username = '{name}'")
```

### 读取结果的方式

```python
# ✅ 推荐：mappings() 返回字典，方便按字段名取值
row = result.mappings().fetchone()   # 返回 {"id": ..., "username": ...}
rows = result.mappings().fetchall()  # 返回字典列表

# 或：fetchone/fetchall 返回 Row 对象（按索引或列名访问）
row = result.fetchone()              # 返回 Row 对象
rows = result.fetchall()             # 返回 Row 列表
```

### 完整 CRUD 示例

```python
async with AsyncSessionLocal() as db:
    # 建表
    await db.execute(text("CREATE TABLE IF NOT EXISTS ..."))
    await db.commit()

    # 插入
    await db.execute(
        text("INSERT INTO users (name, role) VALUES (:name, :role)"),
        {"name": "小明", "role": "student"}
    )
    await db.commit()

    # 查询
    result = await db.execute(text("SELECT * FROM users WHERE role = :role"), {"role": "student"})
    for row in result.mappings():
        print(row["name"])

    # 更新
    await db.execute(
        text("UPDATE users SET score = :score WHERE name = :name"),
        {"score": 90, "name": "小明"}
    )
    await db.commit()

    # 删除
    await db.execute(
        text("DELETE FROM users WHERE name = :name"),
        {"name": "小明"}
    )
    await db.commit()
```

### 直观理解

> 异步数据库操作好比"外卖配送"——你下单（请求）后不用在店里等，可以去做别的事。`create_async_engine` 是中央厨房（连接池），`async_sessionmaker` 是外卖平台（接单派单），`AsyncSession` 是骑手（送货上门）。货送到后骑手被平台回收（归还连接），不用你管。

## 应用场景

| 应用场景 | 具体用法 | 说明 |
|----------|---------|------|
| FastAPI 接口查询 | `Depends(get_db)` 注入 AsyncSession | 每个请求自动获取独立会话 |
| 用户登录 | `db.execute(text(...), {...})` 查用户 | 参数化查询防注入 |
| 插入试卷批改结果 | `db.execute(text(...), {...})` + `commit` | `expire_on_commit=False` 防止会话过期 |
| 批量写入简历评分 | 循环 `execute` + 一次 `commit` | 事务内批量操作，失败自动回滚 |

## 面试追问

**Q1（基础）**：SQLAlchemy 异步三件套是哪三个组件？各自的作用是什么？
**回答要点**：

1. `create_async_engine`：创建异步数据库引擎，管理连接池，所有 SQL 通过它发送到数据库
2. `async_sessionmaker`：绑定引擎的会话工厂，配置默认参数（如 `expire_on_commit=False`）
3. `AsyncSession`：实际执行 SQL 和管理事务的工作单元，一个会话对应一个数据库连接

**Q2（深挖）**：为什么异步数据库操作中必须使用参数化查询？f-string 拼接有什么问题？
**回答要点**：

1. SQL 注入风险：用户输入直接拼接到 SQL 字符串中，恶意输入 `' OR 1=1 --` 可绕过认证
2. 参数化查询通过驱动程序将参数与 SQL 模板分离，自动转义特殊字符
3. 参数化查询还能让数据库缓存查询计划（相同 SQL 模板不同参数复用计划），提升性能
4. 在 EduAgent 项目中，所有 `db.execute(text(...), {...})` 必须用字典传参，禁用 f-string 拼接

**Q3（实战）**：在 FastAPI 中如何集成 SQLAlchemy 异步会话？`get_db` 依赖注入如何工作？
**回答要点**：

1. 定义 `async def get_db()` 异步生成器函数，`yield AsyncSession`，FastAPI 自动注入
2. `yield` 前创建会话，`yield` 后 `commit`（正常结束）或 `rollback`（异常）
3. 接口路由声明 `db = Depends(get_db)`，FastAPI 自动调用依赖注入
4. 每个请求获得独立会话，请求结束后自动提交或回滚并归还连接到池

**Q4（边界）**：`expire_on_commit=False` 的作用是什么？什么场景下需要设置？
**回答要点**：

1. 默认 `expire_on_commit=True`：`commit()` 后会话中的所有对象被标记为"过期"，后续访问属性会触发新的 SQL 查询
2. 设置 `expire_on_commit=False`：`commit()` 后对象保持可用，不会触发额外查询
3. 适用场景：EduAgent 中 `commit()` 后还需要读取刚刚写入的数据，或需要将对象返回给前端
4. 注意事项：`expire_on_commit=False` 会让对象持有过期的数据快照，如果其他事务修改了数据，当前对象不会自动感知

## 参考引用

- 需要理解 PostgreSQL 与 MySQL 关键差异和 UUID 主键设计的相关知识，参见 [PostgreSQL高级特性](./05-PostgreSQL高级特性.md)
- 需要了解 FastAPI 依赖注入如何集成 `get_db` 的相关知识，参见 [JWT认证与bcrypt密码安全](../AI-Agent/工程实践/04-JWT认证与bcrypt密码安全.md)
- 需要了解异步编程基础中 `async/await` 的相关知识，参见 [Python 异步编程](../Python/并发/06-异步编程基础.md)
- 需要了解 PyMySQL 同步操作与 SQLAlchemy 异步对比的相关知识，参见 [PyMySQL模块](./04-PyMySQL模块.md)