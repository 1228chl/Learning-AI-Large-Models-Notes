---
author: XunZong
created: 2026-07-08
tags:
  - MySQL
  - 问答系统
aliases: []
---

# 基于MySQL数据库实现问答系统

## 一、FQA 系统架构概述

本章将前面所学的组件整合为完整的 FQA（Frequently Question Answering）系统，核心流程：

```python
用户查询 → 分词预处理 → BM25计算相似度 → Softmax归一化
→ 得分>0.85且MySQL有答案 → 直接返回 + 写入Redis缓存
→ 得分低/无答案 → 调用RAG系统检索生成
```

系统涉及的核心组件：

* MySQL（存储 FAQ 数据）
* 【补充：BM25】（文本相似度计算）
* 【补充：Softmax】（概率归一化）
* 【补充：Redis】（缓存加速）

---

## 二、项目代码架构

```python
integrated_qa_system/
├── config.ini                     # 配置文件，包含所有模块的配置
├── base/
│   ├── config.py              # 配置管理，加载 config.ini
│   ├── logger.py              # 日志设置
├── mysql_qa/
│   ├── data/
│   │   ├── JP学科知识问答.csv    # FQA数据集
│   ├── db/
│   │   ├── mysql_client.py    # MySQL 数据库操作
│   ├── cache/
│   │   ├── redis_client.py    # Redis 缓存操作
│   ├── retrieval/
│   │   ├── bm25_search.py     # BM25 搜索
│   ├── utils/
│   │   ├── preprocess.py      # 文本预处理
│   ├── main.py                # MySQL 系统独立入口，支持查询
├── requirements.txt           # 依赖文件
└── logs/
    └── app.log                # 日志文件
```

### 2.1 配置模块 (`config.py`)

`Config` 类集中管理所有配置参数：数据库连接信息、模型选择、分块策略、API 设置等。通过【补充：环境变量】实现灵活配置，适配不同部署环境。

### 2.2 预处理模块 (`preprocess.py`)

使用【补充：jieba】分词库，将输入文本转换为小写并进行分词，返回分词结果列表。支持日志记录以监控处理状态。

### 2.3 MySQL 客户端 (`mysql_client.py`)

核心操作：

| 方法 | 功能 |
|------|------|
| 连接数据库 | 使用 pymysql 库，从 Config 读取连接参数 |
| `create_table()` | 创建 FAQ 问答对表 |
| `insert_from_csv()` | 从 CSV 文件批量导入 FAQ 数据 |
| `query_question()` | 根据问题文本查询 MySQL 中的答案 |
| `close()` | 安全关闭数据库连接 |

### 2.4 BM25 检索模块 (`bm25_search.py`)

核心类封装了以下流程：

```python
加载问题库 → jieba分词 → BM25Okapi建模 → 
用户query分词 → get_scores计算得分 → Softmax归一化 → 
得分>0.85 → 从Redis/MySQL获取答案
```

- BM25 模型使用 `rank_bm25` 库的【补充：BM25Okapi】类
- Softmax 将 BM25 得分转换为【补充：概率分布】，所有文档得分之和为 1
- 阈值设为【补充：0.85】，高于此值认为答案可靠

### 2.5 缓存策略

Redis 缓存策略：仅缓存【补充：高可靠性结果】（相似度 > 0.85 且有答案），key 格式为 `问题文本`。缓存未命中时查 MySQL，查到后回写 Redis。

---

## 三、运行结果解读

```python
2025-04-01 10:00:00,123 - INFO - MySQL连接成功
2025-04-01 10:00:00,125 - INFO - Redis连接成功
2025-04-01 10:00:00,126 - INFO - BM25模型初始化完成
欢迎使用 MySQL 问答系统！
输入查询进行问答，输入 'exit' 退出。
2025-04-01 10:00:00,127 - INFO - 检索成功，Softmax相似度: 0.892
2025-04-01 10:00:00,128 - INFO - 数据存入Redis: answer:特殊符号的切割
2025-04-01 10:00:00,129 - INFO - MySQL答案: 使用split函数
2025-04-01 10:00:00,130 - INFO - MySQL连接已关闭
```

- FAQ 数据从 CSV 导入 MySQL
- BM25 得分 0.92 > 阈值 0.85，认为答案可靠
- 优先从 Redis 缓存获取，减少 MySQL 查询压力

---

## 四、本章核心要点

1. FQA 系统流程：【补充：分词】→【补充：BM25 评分】→【补充：Softmax 归一化】→ 阈值判断 → 返回答案
2. MySQL 操作使用【补充：pymysql】库，FAQ 数据从 CSV 批量导入
3. Softmax 作用是将得分转为【补充：概率值】，阈值为【补充：0.85】
4. 缓存策略：【补充：只缓存高可靠性结果】，避免缓存低质量答案
5. 检索无结果时回退到【补充：RAG 系统】进行知识库检索 + LLM 生成

---

## 面试题

**Q1: 系统中 Softmax 的作用是什么？为什么需要它？**

Softmax 将 BM25 原始得分转换为【补充：0-1 之间的概率分布】，所有文档概率之和为 1。好处：① 得分可解释性强，0.85 就是 85% 的置信度；② 不同查询的得分具有可比性，原始 BM25 得分随查询长度和文档数变化，Softmax 归一化后阈值更稳定。

---

**Q2: 项目中 MySQL 和 Redis 如何分工？**

MySQL 负责【补充：持久化存储 FAQ 数据】，是数据的源头，支持复杂 SQL 查询。Redis 负责【补充：热数据缓存】，存储高频查询的答案，减少 MySQL 查询压力。两者关系：先查 Redis → 未命中查 MySQL → 查到后回写 Redis。

---

**Q3: 如果 FAQ 数据量从 100 条增长到 10 万条，系统哪些环节会出问题？**

三个瓶颈点：

① BM25 计算复杂度随文档数【补充：线性增长】，10 万条做全量得分计算延迟可达秒级，需要引入倒排索引优化；

② MySQL 全表扫描不可接受，需要给问题字段加【补充：全文索引或向量索引】；

③ Redis 内存随缓存条目增长，需要设置【补充：过期策略（LRU）】淘汰冷数据。

【不过从业务角度出发，高频问答数据不可能存在 10 万条】
