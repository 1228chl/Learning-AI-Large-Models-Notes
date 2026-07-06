---
author: "XunZong"
created: "2026-07-06"
tags: ["数据库", "MySQL", "SQL"]
aliases: ["MySQL", "CRUD", "表连接", "JOIN"]
---

# MySQL 核心操作

## 基本 CRUD

```sql
-- 插入
INSERT INTO users (name, age, email) VALUES ('Alice', 25, 'alice@example.com');

-- 查询
SELECT * FROM users WHERE age > 20 ORDER BY age DESC LIMIT 10;

-- 更新
UPDATE users SET age = 26 WHERE name = 'Alice';

-- 删除
DELETE FROM users WHERE id = 100;
```

## 表连接（JOIN）

```sql
-- INNER JOIN：两表交集
SELECT u.name, o.order_id
FROM users u
INNER JOIN orders o ON u.id = o.user_id;

-- LEFT JOIN：左表全部 + 右表匹配
SELECT u.name, o.order_id
FROM users u
LEFT JOIN orders o ON u.id = o.user_id;

-- 多表 JOIN：特征工程常用，组合多张表为宽表
SELECT u.*, o.order_amount, p.category
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
LEFT JOIN products p ON o.product_id = p.id;
```

| JOIN 类型 | 返回 |
|-----------|------|
| `INNER JOIN` | 两表都匹配的记录 |
| `LEFT JOIN` | 左表全部记录，右表无匹配时为 NULL |
| `RIGHT JOIN` | 右表全部记录，左表无匹配时为 NULL |
| `FULL OUTER JOIN` | 两表全部记录（MySQL 不直接支持） |

## 分组与聚合

```sql
-- 统计每个用户的总订单金额
SELECT user_id, COUNT(*) AS order_count, SUM(amount) AS total_amount
FROM orders
WHERE status = 'completed'
GROUP BY user_id
HAVING total_amount > 1000
ORDER BY total_amount DESC;
```

**执行顺序**：`FROM` → `WHERE` → `GROUP BY` → `HAVING` → `SELECT` → `ORDER BY` → `LIMIT`

## 常用聚合函数

| 函数 | 作用 | 函数 | 作用 |
|------|------|------|------|
| `COUNT(*)` | 计数 | `SUM(col)` | 求和 |
| `AVG(col)` | 平均值 | `MAX(col)` | 最大值 |
| `MIN(col)` | 最小值 | `DISTINCT col` | 去重 |

## ML 数据准备典型查询

```sql
-- 1. 构建训练特征宽表
SELECT u.user_id, u.age, u.gender,
       COUNT(o.order_id) AS order_count,
       AVG(o.amount) AS avg_order_amount,
       MAX(o.created_at) AS last_order_date
FROM users u
LEFT JOIN orders o ON u.user_id = o.user_id
WHERE u.registered_date >= '2024-01-01'
GROUP BY u.user_id;

-- 2. 样本平衡：按类别统计
SELECT category, COUNT(*) AS sample_count
FROM train_data
GROUP BY category
ORDER BY sample_count;

-- 3. 检查缺失值和异常值
SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN age IS NULL THEN 1 ELSE 0 END) AS age_missing,
  SUM(CASE WHEN age < 0 OR age > 120 THEN 1 ELSE 0 END) AS age_outlier
FROM users;
```

> 参见 [[01-SQL基础与数据库设计]]、[[03-MySQL高级特性]]、[[04-PyMySQL模块]]
