# EduRAG 学习步骤与流程

## 一、项目概述与学习目标

### 1.1 项目背景

EduRAG 是一个基于 RAG（Retrieval-Augmented Generation，检索增强生成）架构的 AI 学科在线答疑系统，旨在解决大模型的幻觉问题和知识截止日期问题。项目采用 MySQL + Milvus 双系统架构，实现教育领域的智能问答。

### 1.2 学习目标

1. 理解 RAG 架构的基本原理和工作流程
2. 掌握 LangChain 框架的核心组件和使用方法
3. 学会使用 Milvus 向量数据库进行向量存储和检索
4. 掌握 MySQL + Redis 缓存架构的设计与实现
5. 理解 BM25 算法原理及其在问答系统中的应用
6. 能够独立部署和运维 RAG 系统

---

## 二、学习阶段规划

### 阶段一：基础理论学习（1-2天）

#### 2.1 LangChain 框架基础

**学习内容：**

- LangChain 的核心概念和组件
- Models 组件：LLMs、Chat Models、Embeddings Models
- Prompts 组件：提示词模板设计
- Chains 组件：链式调用
- Agents 组件：代理和工具使用
- Memory 组件：对话历史管理
- Indexes 组件：文档处理

**实践任务：**

1. 使用 LangChain 调用通义千问 API
2. 实现简单的对话链
3. 创建自定义工具和代理

**参考资源：**

- `day01/02-笔记/3.1 LangChain框架介绍(v1.2).md`
- `day02/02-笔记/3.1 LangChain框架介绍(v1.2)-2.pdf`

#### 2.2 RAG 基本原理

**学习内容：**

- RAG 的定义和核心思想
- RAG 的主要步骤：文档加载、切片、向量化、检索、生成
- 大模型幻觉问题及其解决方案
- 微调 vs RAG 的对比

**实践任务：**

1. 阅读 `day03/03-笔记/01-项目背景与架构.md`
2. 理解项目整体架构
3. 分析 MySQL FAQ 系统和 Milvus RAG 系统的区别

**面试题准备：**

- Q1: 什么是 RAG？它解决了 LLM 的什么问题？
- Q2: 为什么项目采用 MySQL + Milvus 双系统架构？
- Q3: RAG 流程中为什么要做文档切片（Chunking）？
- Q4: 向量数据库和传统数据库的核心区别？

### 阶段二：核心技术学习（3-5天）

#### 2.3 Milvus 向量数据库

**学习内容：**

- Milvus 的概述和核心概念
- Collection 与 Field 的关系
- Field Schema 关键属性
- 索引类型：FLAT、IVF_FLAT、IVF_SQ8、IVF_PQ、HNSW
- 相似度度量：欧氏距离、内积、余弦相似度
- Milvus 数据库的基本操作

**实践任务：**

1. 安装和配置 Milvus
2. 创建数据库和 Collection
3. 实现向量的增删改查操作
4. 实现混合检索（WeightedRanker、RRFRanker）

**参考资源：**

- `day04/02-笔记/03-milvus向量数据库.md`
- `EduRAG_V7.5讲义/② 项目工具/2.3 Milvus向量数据库.html`

**面试题准备：**

- Q1: FLAT 和 IVF_FLAT 的区别？
- Q2: 什么是 Embedding？为什么非结构化数据需要它？
- Q3: 余弦相似度和欧氏距离的区别？哪个更好？

#### 2.4 Redis 数据库

**学习内容：**

- Redis 的概念和核心特性
- 五种数据结构：String、Hash、List、Set、ZSet
- 持久化机制：RDB 和 AOF
- Python 连接 Redis 的方法
- JSON 序列化和反序列化

**实践任务：**

1. 安装和配置 Redis
2. 使用 Python 操作 Redis
3. 实现缓存策略
4. 理解 `decode_responses=True` 的作用

**参考资源：**

- `day05/02-笔记/01-redis数据库介绍与使用.md`

**面试题准备：**

- Q1: Redis 为什么读写速度快？
- Q2: RDB 和 AOF 持久化的区别？
- Q3: Redis 五种数据类型？
- Q4: `decode_responses=True` 的作用？

#### 2.5 BM25 算法

**学习内容：**

- BM25 算法概述和原理
- 核心公式参数：fi、N、ni、|D|、avgdl、k1、b
- BM25 相比 TF-IDF 的改进
- Python 实现 BM25 检索

**实践任务：**

1. 使用 jieba 进行中文分词
2. 使用 rank_bm25 库实现 BM25 检索
3. 实现 BM25 与 Softmax 的结合
4. 调整 k1 和 b 参数观察效果

**参考资源：**

- `day05/02-笔记/02-bm25算法原理与使用.md`

**面试题准备：**

- Q1: BM25 相比 TF-IDF 改进了什么？
- Q2: BM25 公式中 k1 和 b 参数的作用？

### 阶段三：项目实践（5-7天）

#### 2.6 MySQL 问答系统实现

**学习内容：**

- FAQ 系统架构
- MySQL 数据库操作
- BM25 检索模块
- Softmax 归一化
- Redis 缓存策略

**实践任务：**

1. 创建 MySQL 数据库和表
2. 导入 FAQ 数据
3. 实现 BM25 检索功能
4. 实现 Redis 缓存
5. 测试问答系统

**参考资源：**

- `day06/02-笔记/03-MySQL问答模块.md`
- `Itcast_qa_system/mysql_qa/` 目录

**面试题准备：**

- Q1: 系统中 Softmax 的作用是什么？为什么需要它？
- Q2: 项目中 MySQL 和 Redis 如何分工？
- Q3: 如果 FAQ 数据量从 100 条增长到 10 万条，系统哪些环节会出问题？

#### 2.7 RAG 系统实现

**学习内容：**

- RAG 系统的整体架构
- 文档加载器使用
- 文本分割器使用
- 向量数据库操作
- 检索器实现
- LLM 调用

**实践任务：**

1. 实现文档加载和预处理
2. 实现文本分割
3. 实现向量化存储
4. 实现检索功能
5. 实现 LLM 生成

**参考资源：**

- `Itcast_qa_system/rag_qa/` 目录
- `EduRAG_V7.5讲义/④ 基于Milvus库的问答系统/`

#### 2.8 系统集成

**学习内容：**

- 集成 MySQL 和 RAG 系统
- 流式输出实现
- WebSocket 通信
- 对话历史管理
- API 接口设计

**实践任务：**

1. 理解 `new_main.py` 的集成逻辑
2. 实现非流式查询接口
3. 实现流式查询接口
4. 测试完整系统

**参考资源：**

- `Itcast_qa_system/new_main.py`
- `Itcast_qa_system/app.py`
- `Itcast_qa_system/接口文档.md`

### 阶段四：进阶与优化（3-5天）

#### 2.9 系统评估与优化

**学习内容：**

- RAG 系统评估指标
- 检索效果优化
- 生成效果优化
- 性能优化

**实践任务：**

1. 学习 RAG 评估指标
2. 分析系统瓶颈
3. 优化检索策略
4. 优化生成效果

**参考资源：**

- `EduRAG_V7.5讲义/⑤ RAG系统评估/`
- `Itcast_qa_system/rag_qa/rag_assesment/`

#### 2.10 融合 MySQL 的 RAG 系统

**学习内容：**

- 混合检索策略
- 结果融合算法
- 权重调整

**实践任务：**

1. 实现 MySQL 和 Milvus 的结果融合
2. 调整权重参数
3. 测试混合检索效果

**参考资源：**

- `EduRAG_V7.5讲义/⑥ 融合Mysql的RAG系统/`

#### 2.11 生产环境部署

**学习内容：**

- Docker 容器化部署
- 服务配置和管理
- 监控和日志
- 故障排查

**实践任务：**

1. 编写 Dockerfile
2. 配置 docker-compose
3. 部署完整系统
4. 测试系统稳定性

**参考资源：**

- `Itcast_qa_system/Dockerfile`
- `Itcast_qa_system/docker-compose.yml`
- `EduRAG_V7.5讲义/⑦ 企业级生产环境部署/`

---

## 三、学习路径图

```python
基础理论学习 → 核心技术学习 → 项目实践 → 进阶优化
     ↓              ↓              ↓          ↓
LangChain基础   Milvus/Redis   MySQL问答   系统评估
RAG原理       BM25算法      RAG系统     融合优化
                           系统集成     生产部署
```

---

## 四、关键文件清单

### 4.1 学习笔记

- `day01/02-笔记/3.1 LangChain框架介绍(v1.2).md`
- `day03/03-笔记/01-项目背景与架构.md`
- `day04/02-笔记/03-milvus向量数据库.md`
- `day05/02-笔记/01-redis数据库介绍与使用.md`
- `day05/02-笔记/02-bm25算法原理与使用.md`
- `day06/02-笔记/03-MySQL问答模块.md`

### 4.2 项目代码

- `Itcast_qa_system/new_main.py` - 集成系统主逻辑
- `Itcast_qa_system/app.py` - FastAPI 应用
- `Itcast_qa_system/mysql_qa/` - MySQL 问答模块
- `Itcast_qa_system/rag_qa/` - RAG 问答模块
- `Itcast_qa_system/base/` - 基础配置和工具

### 4.3 配置文件

- `Itcast_qa_system/config.ini` - 系统配置
- `Itcast_qa_system/requirements.txt` - 依赖包
- `Itcast_qa_system/接口文档.md` - API 文档

### 4.4 讲义资料

- `EduRAG_V7.5讲义/① 项目概述/`
- `EduRAG_V7.5讲义/② 项目工具/`
- `EduRAG_V7.5讲义/③ 基于Mysql库的问答系统/`
- `EduRAG_V7.5讲义/④ 基于Milvus库的问答系统/`
- `EduRAG_V7.5讲义/⑤ RAG系统评估/`
- `EduRAG_V7.5讲义/⑥ 融合Mysql的RAG系统/`
- `EduRAG_V7.5讲义/⑦ 企业级生产环境部署/`

---

## 五、技术栈详解

### 5.1 核心技术栈

| 层 | 技术 | 作用 |
|----|------|------|
| LLM 管理 | 通义千问 (qwen3-max) | 大语言模型 |
| LLM 框架 | LangChain | 统一接口和组件管理 |
| 向量数据库 | Milvus | 存储和检索向量 |
| 关系型数据库 | MySQL | 存储结构化 FAQ 数据 |
| 缓存 | Redis | 缓存热点数据，加速查询 |
| API 框架 | FastAPI | 提供 RESTful API |
| 部署 | Docker | 容器化部署 |

### 5.2 关键依赖包

- `langchain` - LLM 应用开发框架
- `langchain-openai` - OpenAI 兼容接口
- `pymilvus` - Milvus Python SDK
- `pymysql` - MySQL 连接驱动
- `redis` - Redis 客户端
- `rank-bm25` - BM25 算法实现
- `jieba` - 中文分词
- `fastapi` - Web 框架
- `uvicorn` - ASGI 服务器

---

## 六、学习建议

### 6.1 学习方法

1. **理论与实践结合**：先理解概念，再动手实践
2. **循序渐进**：按照阶段逐步深入
3. **代码阅读**：仔细阅读项目代码，理解实现逻辑
4. **动手实验**：修改参数，观察效果变化
5. **问题驱动**：带着问题学习，解决问题

### 6.2 常见问题

1. **环境配置问题**：确保 Python 版本、依赖包版本正确
2. **数据库连接问题**：检查 MySQL、Redis、Milvus 服务状态
3. **API 调用问题**：确保 API Key 配置正确
4. **性能问题**：优化索引、调整参数

### 6.3 扩展学习

1. **向量数据库进阶**：学习 Milvus 高级特性
2. **RAG 优化**：学习最新的 RAG 优化技术
3. **大模型微调**：了解 LoRA、QLoRA 等微调方法
4. **部署运维**：学习 Kubernetes、监控告警等

---

## 七、评估标准

### 7.1 基础阶段

- [ ] 理解 LangChain 核心组件
- [ ] 掌握 RAG 基本原理
- [ ] 了解项目整体架构

### 7.2 技术阶段

- [ ] 能够操作 Milvus 向量数据库
- [ ] 能够操作 Redis 数据库
- [ ] 理解 BM25 算法原理
- [ ] 能够实现简单的检索功能

### 7.3 实践阶段

- [ ] 能够独立搭建 MySQL 问答系统
- [ ] 能够独立搭建 RAG 系统
- [ ] 能够集成完整系统
- [ ] 能够部署和测试系统

### 7.4 进阶阶段

- [ ] 能够优化系统性能
- [ ] 能够进行系统评估
- [ ] 能够进行生产部署
- [ ] 能够解决常见问题

---

## 八、学习资源汇总

### 8.1 官方文档

- LangChain 官方文档：https://python.langchain.com/
- Milvus 官方文档：https://milvus.io/docs
- Redis 官方文档：https://redis.io/documentation
- FastAPI 官方文档：https://fastapi.tiangolo.com/

### 8.2 项目文档

- `Itcast_qa_system/接口文档.md` - API 接口文档
- `EduRAG_V7.5讲义/index.html` - 讲义主页
- 各阶段笔记文件

### 8.3 代码仓库

- `Itcast_qa_system/` - 完整项目代码
- 包含 MySQL 问答模块和 RAG 问答模块

---

**学习时间预估：** 12-19 天（根据个人基础和学习进度调整）

**最后更新：** 2026年7月

Session   项目文档学习指南

  Continue  mimo -s ses_0bf629dd7ffe14mgRTGPapIjYd
