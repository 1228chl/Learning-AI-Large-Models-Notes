---
author: "XunZong"
created: "2026-07-30"
tags: ["数据库", "PostgreSQL", "UUID", "JSONB", "触发器"]
aliases: ["PostgreSQL高级特性", "UUID主键", "JSONB", "RETURNING", "upsert", "触发器"]
---

# PostgreSQL 高级特性工程实践

## 定义

PostgreSQL 相比 MySQL 提供了一系列高级特性，在 EduAgent 中用于构建生产级数据存储：UUID 主键、JSONB 灵活存储、RETURNING 一步拿回结果、ON CONFLICT upsert、CHECK 约束、触发器自动维护时间戳。

### 直观理解

> MySQL 像"自动挡轿车"——好开、常见，但一些高级操作需要绕路。PostgreSQL 像"手动挡越野车"——需要多学点操作，但给你更多的控制权和高级功能。

## 六大特性详解

### ① UUID 主键

所有表的主键都用 `UUID DEFAULT gen_random_uuid()`，而不是自增整数：

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(64) NOT NULL
);
```

**优点**：
- 全局唯一，不怕冲突
- 前端不暴露自增 ID，防止猜数据量
- 适合分布式场景

### ② JSONB 存储与查询

JSONB（二进制 JSON）比 MySQL 的 JSON 类型更快，支持索引：

**写入**：先 `json.dumps` 转成 JSON 字符串
```python
import json
await db.execute(
    text("UPDATE resume_reviews SET scores = :scores WHERE id = :id"),
    {"scores": json.dumps({"dimension_scores": [...], "weighted_score": 85.5}, ensure_ascii=False),
     "id": review_id}
)
```

**读取**：asyncpg 自动反序列化成 Python dict/list（不需要 json.loads）

**查询**：使用 JSON 操作符直接按 JSON 内部字段过滤
```sql
-- ->> 取文本，-> 取 JSON
SELECT username, profile ->> 'city' AS city, profile -> 'tags' AS tags
FROM members
WHERE profile ->> 'city' = '上海';
```

### ③ RETURNING：插入后一步拿回结果

MySQL 插入后要另外查 `LAST_INSERT_ID()`，PG 用 `RETURNING` 一步到位：

```sql
INSERT INTO users (username, role) VALUES ('alice', 'student')
RETURNING id, username;
-- 直接返回：id=xxx, username=alice
```

### ④ ON CONFLICT：upsert（有则更新，无则插入）

```sql
INSERT INTO users (username, role) VALUES ('alice', 'teacher')
ON CONFLICT (username) DO UPDATE
    SET role = EXCLUDED.role       -- EXCLUDED 代表"本次想插入的那行"
RETURNING username, role;
```

### ⑤ CHECK 约束：数据库层面拦截非法值

**和 MySQL 不同，PG 的 CHECK 一直严格生效**：

```sql
CREATE TABLE exam_reviews (
    score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100)
);

-- 插入非法值会被直接拒绝
INSERT INTO exam_reviews (score) VALUES (150);
-- 报错：violates check constraint
```

### ⑥ 触发器自动维护 updated_at

PG 没有 MySQL 的 `ON UPDATE CURRENT_TIMESTAMP`，改为触发器实现：

```sql
-- 1. 创建触发器函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. 挂到表上
CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

## MySQL 用户快速迁移对照

| 操作 | MySQL | PostgreSQL |
|:----|:------|:-----------|
| 命令行工具 | `mysql -u root -p` | `psql -U 用户 -d 库` |
| 列出所有库 | `SHOW DATABASES;` | `\l` |
| 切换库 | `USE 库名;` | `\c 库名` |
| 主键自增 | `INT AUTO_INCREMENT` | `UUID DEFAULT gen_random_uuid()` |
| 布尔类型 | `TINYINT(1)` | `BOOLEAN (true/false)` |
| JSON 类型 | `JSON` | `JSONB`（更快，可索引） |
| 自动更新时间 | `ON UPDATE CURRENT_TIMESTAMP` | TIMESTAMPTZ + 触发器 |
| upsert | `INSERT ... ON DUPLICATE KEY UPDATE` | `INSERT ... ON CONFLICT ... DO UPDATE` |
| 插入后拿主键 | 另调 `LAST_INSERT_ID()` | 直接 `... RETURNING id` |
| CHECK 约束 | 8.0.16 前被忽略 | 一直严格生效 |

## 面试追问

**Q1（基础）**：PostgreSQL 和 MySQL 在 UUID 主键、JSONB、RETURNING、upsert 四个方面各有什么差异？
**回答要点**：
1. UUID 主键：PG 用 `gen_random_uuid()`，MySQL 用 `INT AUTO_INCREMENT`
2. JSONB：PG 用 `JSONB`（二进制存储，可建索引），MySQL 用 `JSON`
3. RETURNING：PG 可以在 INSERT/UPDATE 后直接返回结果，MySQL 需另调 LAST_INSERT_ID()
4. upsert：PG 用 `ON CONFLICT ... DO UPDATE`，MySQL 用 `ON DUPLICATE KEY UPDATE`

**Q2（深挖）**：JSONB 的 `->` 和 `->>` 操作符有什么区别？如何按 JSON 内部字段过滤？
**回答要点**：
1. `->>` 取出文本值，`->` 取出 JSON 值（仍为 JSON 类型）
2. 按 JSON 内部字段过滤：`WHERE profile ->> 'city' = '上海'`
3. 这是 JSONB 比 MySQL 的 JSON 更顺手的地方之一

**Q3（实战）**：PostgreSQL 如何实现自动维护 updated_at 字段？
**回答要点**：
1. 分两步：创建触发器函数（将 NEW.updated_at 设为 NOW()）和创建触发器（将函数挂到表上）
2. 指定 `BEFORE UPDATE ... FOR EACH ROW`
3. 开发者不需要在每次 UPDATE 时手动设置 updated_at，数据库自动完成

**Q4（边界）**：为什么写 JSONB 要 json.dumps，读 JSONB 却不需要 json.loads？
**回答要点**：
1. 写 JSONB：通过 text() 参数化写入时，Python dict 需要先转成 JSON 字符串
2. 读 JSONB：asyncpg 驱动自动把 JSON 反序列化成 Python dict/list
3. `ensure_ascii=False` 确保中文以原文存储，而不是 \uXXXX 转义

## 参考引用
- 需要理解 SQL 基础与数据库设计的相关知识，参见 [SQL基础与数据库设计](../SQL/01-SQL基础与数据库设计.md)
- 需要理解 MySQL 高级特性的相关知识，参见 [MySQL高级特性](../SQL/03-MySQL高级特性.md)