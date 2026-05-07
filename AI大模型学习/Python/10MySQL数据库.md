# MySQL 数据库详解 - 详细思维导图与笔记

---

## 一、思维导图（文本层级）

```
MySQL 数据库详解
│
├── 1. 数据库简介
│   ├── 什么是数据库
│   │   └── 存储和管理数据的系统（可进行增、删、改、查）
│   ├── 数据库的作用和分类
│   │   ├── 关系型数据库（SQL数据库）
│   │   │   ├── 数据形式：行列表格（表）
│   │   │   └── 常见产品：MySQL、Oracle、DB2、SQL Server
│   │   └── 非关系型数据库（NoSQL数据库）
│   │       ├── 数据形式：键值对、文档、列式、图式
│   │       └── 常见产品：MongoDB、Redis、Hbase、Neo4j
│
├── 2. SQL 语言简介
│   ├── SQL 定义
│   │   └── 结构化查询语言，关系型数据库必须遵循的规范
│   ├── SQL 的作用
│   │   └── 管理数据库中的数据（增、删、改、查）
│   ├── SQL 分类
│   │   ├── DDL（数据定义语言）：create、drop、alter
│   │   ├── DML（数据操作语言）：insert、delete、update
│   │   ├── DQL（数据查询语言）：select、from、where（重点）
│   │   └── DCL（数据控制语言）：权限、安全、用户
│   └── SQL 通用语法
│       ├── 以分号 `;` 结尾
│       ├── 不区分大小写，关键字建议大写
│       ├── 注释：`/* */`、`--`、`#`
│       └── 可使用空格/缩进增强可读性
│
├── 3. MySQL 数据库入门
│   ├── MySQL 特点
│   │   ├── 最流行的开源关系型数据库
│   │   ├── 免费，中小企业首选
│   │   └── 易上手，学习SQL的好选择
│   ├── 连接 MySQL 服务端
│   │   ├── 命令行方式
│   │   │   └── mysql -h IP -P 端口 -u 用户名 -p 密码
│   │   └── 开发工具方式（DataGrip / PyCharm）
│   │       └── 配置数据源 → 测试连接 → 保存
│
├── 4. SQL-DDL（数据定义语言）
│   ├── 数据库操作
│   │   ├── 创建：CREATE DATABASE [IF NOT EXISTS] 库名 [CHARSET=utf8];
│   │   ├── 查看：SHOW DATABASES;
│   │   ├── 使用：USE 库名;
│   │   └── 删除：DROP DATABASE 库名;
│   ├── 数据类型
│   │   ├── 整数：tinyint、smallint、mediumint、int、bigint
│   │   ├── 小数：decimal(M,N)、double、float
│   │   ├── 字符串：char(长度)、varchar(长度)、text
│   │   └── 日期时间：date、time、datetime
│   ├── 数据约束（了解）
│   │   ├── 主键 PRIMARY KEY：唯一标识一行，建议 id int unsigned
│   │   ├── 非空 NOT NULL：字段不能为 NULL
│   │   ├── 唯一 UNIQUE：字段值不能重复
│   │   ├── 默认 DEFAULT：不填时使用默认值
│   │   └── 外键 FOREIGN KEY：关联其他表的主键
│   ├── 数据表操作
│   │   ├── 创建表：CREATE TABLE 表名 (字段 数据类型 [约束], ...);
│   │   ├── 查看表：SHOW TABLES;
│   │   ├── 查看表结构：DESC 表名;
│   │   └── 删除表：DROP TABLE 表名;
│
├── 5. SQL-DML（数据操作语言）
│   ├── 增加（INSERT）
│   │   └── INSERT INTO 表名(字段列表) VALUES(值列表), ...;
│   ├── 修改（UPDATE）
│   │   └── UPDATE 表名 SET 字段=值 [WHERE 条件];
│   └── 删除（DELETE）
│       └── DELETE FROM 表名 [WHERE 条件];
│
├── 6. SQL-DQL（数据查询语言）—— 单表查询
│   ├── 简单查询
│   │   ├── 查询所有列：SELECT * FROM 表名;
│   │   ├── 查询指定列：SELECT 字段1,字段2 FROM 表名;
│   │   ├── 起别名：SELECT 字段 AS 别名 FROM 表名 AS 别名;
│   │   └── 去重：SELECT DISTINCT 字段 FROM 表名;
│   ├── 条件查询（WHERE）
│   │   ├── 比较运算符：=、>、<、>=、<=、!=、<>
│   │   ├── 逻辑运算符：AND、OR、NOT
│   │   ├── 范围查询
│   │   │   ├── BETWEEN ... AND ...（连续范围）
│   │   │   └── IN (值1,值2,...)（非连续范围）
│   │   ├── 模糊查询（LIKE）
│   │   │   ├── %：任意多个任意字符
│   │   │   └── _：任意一个字符
│   │   └── 空值判断：IS NULL、IS NOT NULL
│   ├── 排序查询（ORDER BY）
│   │   ├── 升序：ORDER BY 字段 ASC（ASC可省略）
│   │   ├── 降序：ORDER BY 字段 DESC
│   │   └── 多列排序：ORDER BY 字段1 ASC, 字段2 DESC
│   ├── 聚合函数
│   │   ├── COUNT(col)：总记录数（忽略NULL）
│   │   ├── MAX(col)：最大值
│   │   ├── MIN(col)：最小值
│   │   ├── SUM(col)：和
│   │   ├── AVG(col)：平均值
│   │   └── COUNT(*) ：统计行数
│   ├── 分组查询（GROUP BY）
│   │   ├── 先分组：按指定列的值划分组
│   │   ├── 再聚合：对每组使用聚合函数
│   │   ├── SELECT 后只能跟分组字段或聚合函数
│   │   └── 分组后过滤：HAVING（与WHERE区别：HAVING在分组后，可用聚合函数）
│   ├── 分页查询（LIMIT）
│   │   └── SELECT ... FROM 表名 LIMIT M, N;  （M: 起始索引，N: 查询条数）
│   └── SQL 执行顺序
│       └── FROM → WHERE → GROUP BY → 聚合函数 → HAVING → SELECT → DISTINCT → ORDER BY → LIMIT
│
└── 7. SQL-DQL（多表查询）
    ├── 表之间的三种关系
    │   ├── 一对多（如：分类 → 商品）
    │   ├── 多对多（如：学生 ↔ 课程，需要中间表）
    │   └── 一对一（如：员工基础信息 ↔ 员工详细信息）
    ├── 外键与外键约束
    │   ├── 外键：从表中引用主表主键的列
    │   ├── 外键约束作用：保证数据准确性和完整性
    │   └── 实际开发中较少使用外键约束（从代码层保证）
    ├── 关联查询（有条件连接）
    │   ├── 笛卡尔积（交叉连接）
    │   │   ├── 语法：SELECT * FROM 表1, 表2;
    │   │   └── 结果行数 = 左表行数 × 右表行数（可能巨大）
    │   ├── 内连接（INNER JOIN / JOIN）
    │   │   └── 返回两表都满足连接条件的交集
    │   ├── 左外连接（LEFT JOIN）
    │   │   └── 返回左表全部 + 右表匹配部分（右表无匹配则填充NULL）
    │   ├── 右外连接（RIGHT JOIN）
    │   │   └── 返回右表全部 + 左表匹配部分（左表无匹配则填充NULL）
    │   └── 全外连接（FULL JOIN）
    │       ├── 返回左表全部 + 右表全部
    │       └── MySQL不支持，可用 LEFT JOIN UNION RIGHT JOIN 实现
    ├── 自关联
    │   ├── 同一张表既作为左表又作为右表（如地区表省市区）
    │   └── 查询时必须用别名区分
    └── 子查询
        ├── 定义：一个 SELECT 语句中嵌入另一个 SELECT
        ├── 子查询的结果可充当：
        │   ├── 主查询的条件（WHERE / HAVING）
        │   ├── 主查询的数据源（FROM 后作为临时表）
        │   └── 主查询的查询字段（SELECT 后）
        └── 示例：查询价格大于平均价格的商品
```

---

## 二、详细笔记

### 第1部分：数据库简介

#### 1.1 什么是数据库
- **定义**：数据库（Database）是**存储和管理数据的系统**。数据按照一定格式存储，用户可以对数据进行**增、删、改、查**操作。
- **作用**：解决数据持久化存储、高效检索、数据一致性和共享等问题。

#### 1.2 数据库的分类

| 类型                              | 特点                                              | 常见产品                       |
| --------------------------------- | ------------------------------------------------- | ------------------------------ |
| **关系型数据库（SQL数据库）**     | 数据以**行列表格**（二维表）形式存储，通过SQL操作 | MySQL、Oracle、DB2、SQL Server |
| **非关系型数据库（NoSQL数据库）** | 存储形式多样：键值对、文档、列式、图式            | MongoDB、Redis、Hbase、Neo4j   |

> 注：本课程重点学习**关系型数据库 MySQL**。

---

### 第2部分：SQL 语言简介

#### 2.1 SQL 定义与作用
- **SQL**：Structured Query Language，结构化查询语言。
- **作用**：所有关系型数据库管理系统都必须遵循的规范，用于管理数据库中的数据（增、删、改、查）。

#### 2.2 SQL 分类

| 分类    | 全称                       | 说明                                           | 关键字                       |
| ------- | -------------------------- | ---------------------------------------------- | ---------------------------- |
| **DDL** | Data Definition Language   | 数据定义语言，定义数据库、表、列的结构         | `CREATE`、`DROP`、`ALTER`    |
| **DML** | Data Manipulation Language | 数据操作语言，操作表中的**记录**（增、删、改） | `INSERT`、`DELETE`、`UPDATE` |
| **DQL** | Data Query Language        | 数据查询语言，查询表中的记录（重点）           | `SELECT`、`FROM`、`WHERE` 等 |
| **DCL** | Data Control Language      | 数据控制语言，管理权限、安全、用户             | `GRANT`、`REVOKE`            |

#### 2.3 SQL 通用语法
- 一条 SQL 语句可以单行或多行书写，**以分号 `;` 结尾**。
- MySQL 中 SQL 语句**不区分大小写**，但关键字**建议使用大写**（提高可读性）。
- 注释方式：
  - 多行注释：`/* 注释内容 */`
  - 单行注释：`-- 注释内容`（注意 `--` 后有一个空格）
  - 单行注释：`# 注释内容`
- 可使用空格和缩进增强可读性（DataGrip 格式化快捷键：`Ctrl + Alt + L`）。

---

### 第3部分：MySQL 数据库入门

#### 3.1 MySQL 的特点
- 全世界最流行的**开源**关系型数据库。
- **免费**，中小企业首选。
- 容易快速上手，学习 SQL 的最佳选择。
- 版本发展：2015年 MySQL 5.7 正式版；2018年 MySQL 8.0 正式版。

#### 3.2 连接 MySQL 服务端

##### 方式一：命令行
```bash
mysql -h 数据库服务端IP -P 端口 -u 用户名 -p 密码
```
- 默认 IP：`127.0.0.1`（本机）
- 默认端口：`3306`
- 默认用户：`root`
- 退出：`quit` 或 `exit`

##### 方式二：开发工具（DataGrip / PyCharm）
1. 创建工程 → 添加数据源 → 选择 MySQL
2. 填写 Host、Port、User、Password
3. 点击 **Test Connection**，成功则保存
4. 第一次使用需根据提示下载驱动

---

### 第4部分：SQL-DDL（数据定义语言）

#### 4.1 数据库操作

| 操作                 | SQL 语句                                                   |
| -------------------- | ---------------------------------------------------------- |
| 创建数据库           | `CREATE DATABASE [IF NOT EXISTS] 数据库名 [CHARSET=utf8];` |
| 查看所有数据库       | `SHOW DATABASES;`                                          |
| 使用数据库           | `USE 数据库名;`                                            |
| 查看当前使用的数据库 | `SELECT DATABASE();`                                       |
| 删除数据库           | `DROP DATABASE 数据库名;`                                  |

**示例**：
```sql
CREATE DATABASE IF NOT EXISTS shop CHARSET=utf8;
USE shop;
```

#### 4.2 数据类型

| 类型分类     | 数据类型                                            | 说明                                                  |
| ------------ | --------------------------------------------------- | ----------------------------------------------------- |
| **整数**     | `tinyint`、`smallint`、`mediumint`、`int`、`bigint` | 存储整数，范围不同                                    |
| **小数**     | `decimal(M,N)`、`double`、`float`                   | `decimal` 精确小数（如金钱），`double`/`float` 浮点数 |
| **字符串**   | `char(长度)`、`varchar(长度)`、`text`               | `char` 定长，`varchar` 变长，`text` 长文本            |
| **日期时间** | `date`、`time`、`datetime`                          | 日期、时间、日期+时间                                 |

- `decimal(M,N)` 示例：`decimal(5,2)` 表示总共5位数字，小数占2位（范围 -999.99 ~ 999.99）。
- `char(3)`：固定长度3，存入 `'ab'` 会变成 `'ab '`（补空格）。
- `varchar(3)`：可变长度，存入 `'ab'` 就是 `'ab'`。

#### 4.3 数据约束（了解）

| 约束 | 关键字        | 说明                                                        |
| ---- | ------------- | ----------------------------------------------------------- |
| 主键 | `PRIMARY KEY` | 唯一标识一行，MySQL建议主键字段叫 `id`，类型 `int unsigned` |
| 非空 | `NOT NULL`    | 字段值不能为 `NULL`                                         |
| 唯一 | `UNIQUE`      | 字段值不能重复                                              |
| 默认 | `DEFAULT 值`  | 不填时使用默认值                                            |
| 外键 | `FOREIGN KEY` | 关联其他表的主键，保证数据引用完整性                        |

#### 4.4 数据表操作

| 操作       | SQL 语句                                           |
| ---------- | -------------------------------------------------- |
| 创建表     | `CREATE TABLE 表名 (字段名 数据类型 [约束], ...);` |
| 查看所有表 | `SHOW TABLES;`                                     |
| 查看表结构 | `DESC 表名;`                                       |
| 删除表     | `DROP TABLE 表名;`                                 |

**创建表示例**：
```sql
CREATE TABLE category (
    id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(20) NOT NULL UNIQUE
);
```

---

### 第5部分：SQL-DML（数据操作语言）

#### 5.1 增加记录（INSERT）

**语法**：
```sql
INSERT INTO 表名 (字段1, 字段2, ...) VALUES (值1, 值2, ...), (值1, 值2, ...);
```

**示例**：
```sql
INSERT INTO category (name) VALUES ('手机'), ('电脑');
```

#### 5.2 修改记录（UPDATE）

**语法**：
```sql
UPDATE 表名 SET 字段1 = 值1, 字段2 = 值2 [WHERE 条件];
```
- 不加 `WHERE` 会修改表中**所有**记录。

**示例**：
```sql
UPDATE category SET name = '智能手机' WHERE id = 1;
```

#### 5.3 删除记录（DELETE）

**语法**：
```sql
DELETE FROM 表名 [WHERE 条件];
```
- 不加 `WHERE` 会删除表中**所有**记录（表结构还在）。

**示例**：
```sql
DELETE FROM category WHERE id = 2;
```

> **注意**：`TRUNCATE TABLE 表名` 也可以删除全部记录，但速度更快且重置自增主键。

---

### 第6部分：SQL-DQL（单表查询）—— 重点

#### 6.1 简单查询

| 需求       | SQL                                      |
| ---------- | ---------------------------------------- |
| 查询所有列 | `SELECT * FROM 表名;`                    |
| 查询指定列 | `SELECT 字段1, 字段2 FROM 表名;`         |
| 起别名     | `SELECT 字段 AS 别名 FROM 表名 AS 别名;` |
| 去重       | `SELECT DISTINCT 字段 FROM 表名;`        |

**示例**：
```sql
SELECT id, name AS 分类名称 FROM category AS c;
SELECT DISTINCT category_id FROM product;
```

#### 6.2 条件查询（WHERE）

##### 比较运算符
| 运算符       | 含义     |
| ------------ | -------- |
| `=`          | 等于     |
| `>`          | 大于     |
| `<`          | 小于     |
| `>=`         | 大于等于 |
| `<=`         | 小于等于 |
| `!=` 或 `<>` | 不等于   |

##### 逻辑运算符
| 运算符 | 含义             |
| ------ | ---------------- |
| `AND`  | 且，同时满足     |
| `OR`   | 或，满足一个即可 |
| `NOT`  | 非，取反         |

##### 范围查询
- **连续范围**：`BETWEEN ... AND ...`
  ```sql
  SELECT * FROM product WHERE price BETWEEN 100 AND 500;
  ```
- **非连续范围**：`IN (值1, 值2, ...)`
  ```sql
  SELECT * FROM product WHERE category_id IN (1, 3, 5);
  ```

##### 模糊查询（LIKE）
- `%`：匹配任意多个任意字符（包括0个）
- `_`：匹配任意一个字符
```sql
SELECT * FROM product WHERE name LIKE '华为%';   -- 以“华为”开头
SELECT * FROM product WHERE name LIKE '_想_';   -- 如“理想者”三个字
```

##### 空值判断
- `IS NULL`：字段值为空
- `IS NOT NULL`：字段值非空
```sql
SELECT * FROM product WHERE description IS NULL;
```

#### 6.3 排序查询（ORDER BY）

**语法**：
```sql
SELECT ... FROM 表名 ORDER BY 字段1 [ASC|DESC], 字段2 [ASC|DESC];
```
- `ASC`：升序（从小到大），可省略
- `DESC`：降序（从大到小）
- 多列排序：前列值相同时，再按后列排序

**示例**：
```sql
SELECT * FROM product ORDER BY price DESC, id ASC;
```

#### 6.4 聚合函数

| 函数         | 说明                     | 示例                              |
| ------------ | ------------------------ | --------------------------------- |
| `COUNT(col)` | 求指定列的非NULL值记录数 | `SELECT COUNT(id) FROM product;`  |
| `MAX(col)`   | 最大值                   | `SELECT MAX(price) FROM product;` |
| `MIN(col)`   | 最小值                   | `SELECT MIN(price) FROM product;` |
| `SUM(col)`   | 总和                     | `SELECT SUM(price) FROM product;` |
| `AVG(col)`   | 平均值                   | `SELECT AVG(price) FROM product;` |
| `COUNT(*)`   | 统计所有行数（包括NULL） | `SELECT COUNT(*) FROM product;`   |

> **注意**：聚合函数会忽略 `NULL` 值（除 `COUNT(*)` 外）。

#### 6.5 分组查询（GROUP BY）

**步骤**：
1. **先分组**：按指定列的值划分，值相同的进入同一组。
2. **再聚合**：对每组使用聚合函数进行统计。

**语法**：
```sql
SELECT 分组字段, 聚合函数(字段) FROM 表名 GROUP BY 分组字段 [HAVING 条件];
```

**重要规则**：`SELECT` 后面只能出现：
- 分组字段（即 `GROUP BY` 后面的列）
- 被聚合函数统计的字段

**示例1：按分类统计商品数量**
```sql
SELECT category_id, COUNT(*) AS 商品数量 
FROM product 
GROUP BY category_id;
```

**示例2：分组后过滤（HAVING）**
```sql
-- 查询商品数量大于5的分类
SELECT category_id, COUNT(*) AS cnt
FROM product
GROUP BY category_id
HAVING cnt > 5;
```

##### HAVING 与 WHERE 的区别
|                  | WHERE          | HAVING                   |
| ---------------- | -------------- | ------------------------ |
| 执行时机         | 分组**前**过滤 | 分组**后**过滤           |
| 能否使用聚合函数 | ❌ 不能         | ✅ 能                     |
| 别名             | ❌ 不能使用     | ✅ 可以使用（部分数据库） |

#### 6.6 分页查询（LIMIT）

**语法**：
```sql
SELECT ... FROM 表名 LIMIT M, N;
```
- `M`：起始行索引（从0开始），表示跳过M行
- `N`：查询的行数（每页条数）

**示例**：
```sql
-- 第一页（每页10条）
SELECT * FROM product LIMIT 0, 10;
-- 第二页
SELECT * FROM product LIMIT 10, 10;
-- 第三页
SELECT * FROM product LIMIT 20, 10;
```

**通用公式**：`LIMIT (page-1)*pageSize, pageSize`

> 注意：如果 `LIMIT` 指定的起始索引超出总行数，不报错，返回空结果。

#### 6.7 SQL 语句执行顺序（非常重要）

**编写顺序**（我们写的SQL）：
```sql
SELECT DISTINCT 字段
FROM 表
WHERE 条件
GROUP BY 分组字段
HAVING 分组后条件
ORDER BY 排序字段
LIMIT M, N;
```

**实际执行顺序**：
```
1. FROM          -- 确定数据源
2. WHERE         -- 过滤行数据
3. GROUP BY      -- 分组
4. 聚合函数       -- 计算每组统计值
5. HAVING        -- 过滤分组后的结果
6. SELECT        -- 选择字段（包括计算别名）
7. DISTINCT      -- 去重
8. ORDER BY      -- 排序
9. LIMIT         -- 限制返回行数
```

> **常见错误**：在 `WHERE` 中使用聚合函数或别名，因为 `WHERE` 执行时还没有计算聚合函数，也没有生成别名。

---

### 第7部分：SQL-DQL（多表查询）

#### 7.1 表之间的三种关系

| 关系       | 说明                           | 举例                            |
| ---------- | ------------------------------ | ------------------------------- |
| **一对多** | 主表一条记录对应从表多条记录   | 分类表（一） → 商品表（多）     |
| **多对多** | 双方都对应多条记录，需要中间表 | 学生表 ↔ 课程表（选课中间表）   |
| **一对一** | 一条记录对应另一表唯一一条记录 | 员工基础信息表 ↔ 员工详细信息表 |

#### 7.2 外键与外键约束

- **外键**：从表中引用主表主键的列。
- **外键约束**：保证数据引用的完整性。
  - 插入：从表外键值必须在主表主键中存在。
  - 删除：主表记录被从表引用时，不能直接删除。
- **实际开发**：很少使用外键约束（影响性能、增加开发难度），而是从**代码层面**维护表之间的关系。

**创建外键约束的语法**（了解）：
```sql
ALTER TABLE 从表 ADD CONSTRAINT 外键名 FOREIGN KEY (外键列) REFERENCES 主表(主键列);
```

#### 7.3 关联查询（有条件连接）

##### 7.3.1 笛卡尔积（交叉连接）
- **定义**：左表每一行与右表每一行无条件组合。
- **语法**：`SELECT * FROM 表1, 表2;` 或 `SELECT * FROM 表1 CROSS JOIN 表2;`
- **结果行数** = 左表行数 × 右表行数（可能非常巨大）。
- **问题**：结果中包含大量无意义的数据，必须加上连接条件。

##### 7.3.2 内连接（INNER JOIN）
- **作用**：返回两表中**都满足连接条件**的行（交集）。
- **语法**：
  ```sql
  SELECT * FROM 表1 INNER JOIN 表2 ON 表1.外键 = 表2.主键;
  -- INNER 可省略
  ```
- **示例**：查询所有商品及其分类名称
  ```sql
  SELECT p.name, c.name AS category_name
  FROM product p
  JOIN category c ON p.category_id = c.id;
  ```

##### 7.3.3 左外连接（LEFT JOIN）
- **作用**：返回左表**所有行** + 右表中满足条件的行（右表无匹配则填充 `NULL`）。
- **语法**：
  ```sql
  SELECT * FROM 表1 LEFT JOIN 表2 ON 连接条件;
  ```
- **示例**：查询所有分类及其商品（没有商品的分类也显示）
  ```sql
  SELECT c.name, p.name AS product_name
  FROM category c
  LEFT JOIN product p ON c.id = p.category_id;
  ```

##### 7.3.4 右外连接（RIGHT JOIN）
- **作用**：返回右表**所有行** + 左表中满足条件的行（左表无匹配则填充 `NULL`）。
- **语法**：`SELECT * FROM 表1 RIGHT JOIN 表2 ON 连接条件;`

##### 7.3.5 全外连接（FULL JOIN）
- **作用**：返回左表和右表的**所有行**（对方无匹配则填充 `NULL`）。
- **MySQL 不支持** `FULL JOIN`，需用 `UNION` 组合左连接和右连接实现：
  ```sql
  SELECT * FROM 表1 LEFT JOIN 表2 ON 条件
  UNION
  SELECT * FROM 表1 RIGHT JOIN 表2 ON 条件;
  ```

#### 7.4 自关联

- **定义**：一张表同时作为左表和右表进行连接。
- **使用场景**：地区表（省、市、区县存储在一张表中）。
- **注意**：必须给表起**不同的别名**以区分。

**地区表结构示例**：
```sql
CREATE TABLE areas (
    id INT PRIMARY KEY,
    name VARCHAR(50),
    parent_id INT   -- 上级地区ID，省为NULL
);
```

**查询广东省的所有城市**：
```sql
SELECT city.name AS city_name
FROM areas AS province
JOIN areas AS city ON province.id = city.parent_id
WHERE province.name = '广东省';
```

#### 7.5 子查询

- **定义**：一个 `SELECT` 语句中嵌套另一个 `SELECT` 语句。外层称**主查询**，内层称**子查询**。
- **作用**：子查询的结果作为主查询的**条件**、**数据源**或**字段**。

##### 7.5.1 子查询作为条件（WHERE / HAVING）
```sql
-- 查询价格大于平均价格的商品
SELECT * FROM product 
WHERE price > (SELECT AVG(price) FROM product);
```

##### 7.5.2 子查询作为数据源（FROM）
```sql
-- 查询每个分类的平均价格，并筛选平均价格>500的分类
SELECT category_id, avg_price
FROM (SELECT category_id, AVG(price) AS avg_price FROM product GROUP BY category_id) AS temp
WHERE avg_price > 500;
```

##### 7.5.3 子查询作为字段（SELECT）
```sql
-- 查询每个分类的商品数量（使用子查询）
SELECT id, name,
    (SELECT COUNT(*) FROM product WHERE product.category_id = category.id) AS product_count
FROM category;
```

---

## 三、关键知识点速查表

| 分类     | 关键词/语法                         | 说明                   |
| -------- | ----------------------------------- | ---------------------- |
| DDL      | `CREATE DATABASE`                   | 创建数据库             |
| DDL      | `CREATE TABLE`                      | 创建表                 |
| DDL      | `DROP`                              | 删除数据库/表          |
| DML      | `INSERT INTO`                       | 插入记录               |
| DML      | `UPDATE`                            | 更新记录               |
| DML      | `DELETE FROM`                       | 删除记录               |
| DQL      | `SELECT`                            | 查询                   |
| DQL      | `WHERE`                             | 条件过滤               |
| DQL      | `ORDER BY`                          | 排序                   |
| DQL      | `GROUP BY`                          | 分组                   |
| DQL      | `HAVING`                            | 分组后过滤             |
| DQL      | `LIMIT`                             | 分页                   |
| 聚合函数 | `COUNT`、`SUM`、`AVG`、`MAX`、`MIN` | 统计计算               |
| 连接     | `JOIN ... ON`                       | 内连接                 |
| 连接     | `LEFT JOIN`                         | 左外连接               |
| 连接     | `RIGHT JOIN`                        | 右外连接               |
| 连接     | `UNION`                             | 合并结果（模拟全连接） |
| 子查询   | `SELECT ... WHERE (SELECT ...)`     | 嵌套查询               |

---

## 四、常见面试/考试题

1. **SQL 的四大分类及各自作用？**  
   DDL（定义结构）、DML（操作数据）、DQL（查询数据）、DCL（权限控制）。

2. **`CHAR` 和 `VARCHAR` 的区别？**  
   `CHAR` 定长，`VARCHAR` 变长；`CHAR` 效率略高但浪费空间。

3. **`WHERE` 和 `HAVING` 的区别？**  
   `WHERE` 在分组前过滤，不能使用聚合函数；`HAVING` 在分组后过滤，可以使用聚合函数。

4. **SQL 语句的执行顺序？**  
   FROM → WHERE → GROUP BY → 聚合函数 → HAVING → SELECT → DISTINCT → ORDER BY → LIMIT

5. **内连接、左连接、右连接的区别？**  
   - 内连接：只返回匹配的行。  
   - 左连接：返回左表全部 + 右表匹配部分。  
   - 右连接：返回右表全部 + 左表匹配部分。

6. **什么是子查询？有哪些使用场景？**  
   子查询是嵌套在主查询中的 `SELECT` 语句，可作为条件、数据源或字段。

7. **如何实现 MySQL 的分页查询？**  
   `LIMIT M, N`，其中 `M` 是起始索引，`N` 是每页条数。

---

**笔记结束** 