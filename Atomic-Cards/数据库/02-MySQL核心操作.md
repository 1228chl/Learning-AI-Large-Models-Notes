---
author: "XunZong"
created: "2026-07-06"
tags: ["数据库", "MySQL", "SQL"]
aliases: ["MySQL", "CRUD", "表连接", "JOIN"]
---

# MySQL 核心操作

## 基本 CRUD

```sql
- 插入
INSERT INTO users (name, age, email) VALUES ('Alice', 25, 'alice@example.com');

- 查询
SELECT * FROM users WHERE age > 20 ORDER BY age DESC LIMIT 10;

- 更新
UPDATE users SET age = 26 WHERE name = 'Alice';

- 删除
DELETE FROM users WHERE id = 100;
```

## 表连接（JOIN）

```sql
- INNER JOIN：两表交集
SELECT u.name, o.order_id
FROM users u
INNER JOIN orders o ON u.id = o.user_id;

- LEFT JOIN：左表全部 + 右表匹配
SELECT u.name, o.order_id
FROM users u
LEFT JOIN orders o ON u.id = o.user_id;

- 多表 JOIN：特征工程常用，组合多张表为宽表
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
- 统计每个用户的总订单金额
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
- 1. 构建训练特征宽表
SELECT u.user_id, u.age, u.gender,
       COUNT(o.order_id) AS order_count,
       AVG(o.amount) AS avg_order_amount,
       MAX(o.created_at) AS last_order_date
FROM users u
LEFT JOIN orders o ON u.user_id = o.user_id
WHERE u.registered_date >= '2024-01-01'
GROUP BY u.user_id;

- 2. 样本平衡：按类别统计
SELECT category, COUNT(*) AS sample_count
FROM train_data
GROUP BY category
ORDER BY sample_count;

- 3. 检查缺失值和异常值
SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN age IS NULL THEN 1 ELSE 0 END) AS age_missing,
  SUM(CASE WHEN age < 0 OR age > 120 THEN 1 ELSE 0 END) AS age_outlier
FROM users;
```

## 面试追问

**Q1（基础）**：INNER JOIN 和 LEFT JOIN 的区别是什么？分别在什么场景下使用？

**回答要点**：① INNER JOIN 只返回两表都匹配的记录（交集）；LEFT JOIN 返回左表全部记录，右表无匹配时为 NULL。② 特征工程构建宽表时常用 LEFT JOIN 确保不丢失主表样本。③ 多表 JOIN 时要关注关联字段的索引，否则性能急剧下降。

**Q2（深挖）**：请写出 SQL 查询的执行顺序（FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT），并说明为什么理解这个顺序很重要。

**回答要点**：① FROM 确定表 → WHERE 过滤行 → GROUP BY 分组 → HAVING 过滤分组 → SELECT 选择列 → ORDER BY 排序 → LIMIT 限制行数。② 理解执行顺序有助于优化 SQL：WHERE 中过滤尽可能多的行减少后续处理量；HAVING 只用于聚合后的条件过滤。③ 别名（SELECT 中的别名）在 WHERE 中不可用，因为 SELECT 在 WHERE 之后执行。

**Q3（实战）**：在构建 ML 训练用的特征宽表时，如何通过 SQL 将用户表、订单表和商品表组合成一个特征矩阵？请写出典型查询。

**回答要点**：① 以用户表为主表 LEFT JOIN 订单表（用户 ID 关联），再 LEFT JOIN 商品表（商品 ID 关联）。② 使用 GROUP BY 对用户 ID 分组，COUNT 统计订单数、AVG 计算平均金额、MAX 获取最近下单时间。③ 在关联字段（user_id、product_id）上建索引，否则大数据量下 JOIN 非常缓慢。

**Q4（边界）**：JOIN 操作在什么情况下性能会严重下降？你会如何优化？

**回答要点**：① 大表之间无索引的 JOIN 会导致全表扫描＋嵌套循环，性能极差。② 多表 JOIN（超过 3-4 张表）且每张表数据量巨大时，临时表和中转表开销不可忽视。③ 优化手段：关联字段加索引、只 SELECT 需要的列而非*、使用子查询预聚合缩小数据集、分步创建中间结果表。

## 参考引用
- 需要理解SQL基础与数据库设计的相关知识，参见 [SQL基础与数据库设计](./01-SQL基础与数据库设计.md)
- 需要理解MySQL高级特性的相关知识，参见 [MySQL高级特性](./03-MySQL高级特性.md)
- 需要理解PyMySQL模块的相关知识，参见 [PyMySQL模块](./04-PyMySQL模块.md)