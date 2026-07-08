---
author: "XunZong"
created: "2026-07-06"
tags: ["数据库", "MySQL", "索引", "事务"]
aliases: ["索引", "事务", "ACID", "数据库优化"]
---

# MySQL 高级特性

## 索引

索引是对数据库表中一列或多列值进行排序的**数据结构**，目的是加速查询检索。好比书的目录——通过目录快速定位内容，而不需翻遍整本书。

```sql
-- 创建索引
CREATE INDEX idx_user_name ON users(name);
CREATE UNIQUE INDEX idx_user_email ON users(email);  -- 唯一索引

-- 复合索引（多列）
CREATE INDEX idx_user_age_name ON users(age, name);

-- 查看索引
SHOW INDEX FROM users;

-- 删除索引
DROP INDEX idx_user_name ON users;
```

| 索引类型 | 特点 | 适用场景 |
|----------|------|----------|
| **主键索引** | 唯一且非空，自动创建 | 每张表的 `id` 列 |
| **唯一索引** | 索引列值不能重复 | 邮箱、身份证号等 |
| **普通索引** | 仅加速查询 | 频繁出现在 `WHERE` 中的列 |
| **复合索引** | 多列组合索引 | 多条件联合查询（最左前缀匹配） |
| **全文索引** | 支持全文搜索 | 文本内容的模糊匹配 |

**索引使用原则**：索引不是越多越好——写操作（INSERT/UPDATE/DELETE）会维护索引，降低写入性能。适合加索引的列：频繁出现在 `WHERE`、`JOIN`、`ORDER BY` 中的列。

## 事务与 ACID

事务（Transaction）是一组不可分割的数据库操作，要么全部成功，要么全部失败。

```sql
START TRANSACTION;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;     -- 提交（两笔都成功）
-- ROLLBACK; -- 回滚（两笔都撤销）
```

| ACID | 含义 | 保证方式 |
|------|------|----------|
| **A**tomicity（原子性） | 事务中的所有操作要么全做，要么全不做 | `ROLLBACK` 回滚 |
| **C**onsistency（一致性） | 事务前后数据完整性约束不被破坏 | 业务逻辑约束 |
| **I**solation（隔离性） | 并发事务之间互不干扰 | MVCC、锁机制 |
| **D**urability（持久性） | 提交的事务永久保存到磁盘 | WAL（Write-Ahead Logging） |

## 事务隔离级别

| 隔离级别 | 脏读 | 不可重复读 | 幻读 | 性能 |
|----------|:----:|:----------:|:----:|:----:|
| READ UNCOMMITTED | 可能 | 可能 | 可能 | 最高 |
| READ COMMITTED | 避免 | 可能 | 可能 | |
| REPEATABLE READ（MySQL 默认） | 避免 | 避免 | 可能 | |
| SERIALIZABLE | 避免 | 避免 | 避免 | 最低 |

## ML 数据管理的索引实践

```bash
# 在 ML 数据流水线中，常用特征的查询列都应有索引
# 例如：user_id、item_id、timestamp
# 这样在 JOIN 构建特征宽表时能大幅加速
```

## 面试追问

**Q1（基础）**：MySQL 中有哪些索引类型？它们的适用场景是什么？

**回答要点**：① 主键索引（唯一且非空，表的主键自动创建）；唯一索引（列值不能重复，如邮箱）；普通索引（加速查询）；复合索引（多列组合，最左前缀匹配）；全文索引（文本模糊匹配）。② 核心原则：频繁出现在 WHERE、JOIN、ORDER BY 中的列适合建索引。

**Q2（深挖）**：MySQL 索引底层通常用 B+树实现，B+树的哪些特性让其适合数据库索引？索引越多越好吗？

**回答要点**：① B+树是多路平衡查找树，高度低（3-4 层即可支撑千万级数据），查询稳定（每次 I/O 次数固定）。② 叶子节点链表结构支持高效的范围查询和排序。③ 索引不是越多越好：每个 INSERT/UPDATE/DELETE 都需要维护索引树，写性能会下降；索引也占用磁盘空间。

**Q3（实战）**：在 ML 数据流水线中，哪些字段应该加索引？为什么？请结合特征宽表构建场景说明。

**回答要点**：① 出现在 JOIN 条件中的字段（user_id、item_id）必须加索引，否则多表关联会全表扫描。② 出现在 WHERE 过滤中的字段（registered_date、category）和 ORDER BY 排序字段也建议加索引。③ 构建特征宽表时，源表的关联主键和外键有索引能将 JOIN 性能提升数倍到数十倍。

**Q4（边界）**：索引在什么情况下会失效？举例说明哪些查询不走索引。

**回答要点**：① 复合索引违反最左前缀原则（如索引(a,b,c)，但 WHERE 只用了 b 列）。② 对索引列使用函数或计算（WHERE DATE(create_time) = '2024-01-01'或 WHERE age + 1 = 20）。③ LIKE 左模糊匹配（LIKE '%keyword'）；OR 条件中部分列无索引；数据类型隐式转换。④ 失效时 MySQL 退化为全表扫描（type=ALL），性能显著下降。

## 参考引用

- 需要理解MySQL核心操作的相关知识，参见 [MySQL核心操作](./02-MySQL核心操作.md)
- 需要理解PyMySQL模块的相关知识，参见 [PyMySQL模块](./04-PyMySQL模块.md)
- 需要理解SQL基础与数据库设计的相关知识，参见 [SQL基础与数据库设计](./01-SQL基础与数据库设计.md)