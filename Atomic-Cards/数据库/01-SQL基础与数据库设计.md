---
author: "XunZong"
created: "2026-07-06"
tags: ["数据库", "SQL", "基础"]
aliases: ["SQL基础", "关系型数据库", "NoSQL"]
---

# SQL 基础与数据库设计

## 数据库分类

| 类型 | 存储方式 | 特点 | 代表产品 |
|------|----------|------|----------|
| **关系型（SQL）** | 行列表格（二维表），通过 SQL 操作 | 数据一致性强，支持复杂查询和事务 | MySQL、PostgreSQL、Oracle |
| **非关系型（NoSQL）** | 键值/文档/列式/图 | 灵活、高扩展性、大数据量下性能好 | Redis（键值）、MongoDB（文档） |

## SQL 分类

| 分类 | 全称 | 作用 | 关键字 |
|------|------|------|--------|
| **DDL** | Data Definition Language | 定义数据库、表、列的结构 | `CREATE`、`DROP`、`ALTER` |
| **DML** | Data Manipulation Language | 操作表中的记录（增、删、改） | `INSERT`、`DELETE`、`UPDATE` |
| **DQL** | Data Query Language | 查询表中的记录（最核心） | `SELECT`、`FROM`、`WHERE` |
| **DCL** | Data Control Language | 管理权限和安全 | `GRANT`、`REVOKE` |

## 数据库设计范式

| 范式 | 规则 | 通俗理解 |
|------|------|----------|
| **1NF（第一范式）** | 每列不可再分 | 字段是原子值，不存列表 |
| **2NF（第二范式）** | 满足 1NF，且非主键列完全依赖主键 | 每列描述的是"这一个"实体 |
| **3NF（第三范式）** | 满足 2NF，且非主键列不传递依赖主键 | 每列只描述自身，不描述其他列 |

**反范式化**：在实际 ML 项目中，为了查询性能有时会刻意冗余数据（如将标签名直接存在行为表中，避免每次 JOIN）。

## ML 工程师的 SQL 场景

| 场景 | SQL 操作 | 说明 |
|------|----------|------|
| **数据探索** | `SELECT ... WHERE ... GROUP BY ... ORDER BY` | 快速了解数据集分布、统计信息 |
| **特征工程** | `JOIN` 多表、`CASE WHEN` 分箱、聚合统计 | 从原始表组合出特征宽表 |
| **数据清洗** | `DISTINCT` 去重、`COALESCE` 填充空值、`WHERE` 过滤异常 | 清洗脏数据 |
| **训练数据导出** | `SELECT ... INTO OUTFILE` 或 Python 读取 | 导出 CSV 供模型训练 |

> 参见 [[02-MySQL核心操作]]、[[03-MySQL高级特性]]、[[04-PyMySQL模块]]
