# 09RAG学习 - 学习笔记目录

## 文件说明

本目录包含对 `09RAG学习` 文件夹中所有文件的学习笔记，共9个文件。

---

## 笔记列表

### 01-LangChain框架介绍.md
**内容**：LangChain核心组件和使用
- LangChain概述和六大组件
- Models（LLMs、Chat Models、Embeddings）
- Prompts（Zero-shot、Few-shot）
- Memory（ChatMessageHistory、InMemorySaver、MySQL长期记忆）
- Chains（简单链、多步骤链）
- Agents（内置工具、自定义工具）
- Indexes（文档加载器、分割器、向量数据库、检索器）
- 结构化输出

### 02-RAG系统架构与原理.md
**内容**：RAG原理和EduRAG项目架构
- RAG基本原理（索引、检索、生成三个阶段）
- 双系统架构（MySQL FAQ + Milvus RAG）
- **文档处理模块**（多格式支持、分层切分/父子块策略）
- **查询分类**（BERT二分类：通用知识/专业咨询）
- **检索策略**（直接检索、HyDE、子查询、回溯问题）
- RAG核心逻辑（完整工作流程）
- **RAG系统评估**（RAGAS框架、四个评估指标）

### 03-向量数据库与距离计算.md
**内容**：Milvus和向量距离计算
- 向量数据库概述（Chroma、Milvus、FAISS对比）
- 向量距离计算（欧式距离、内积、余弦相似度）
- **BGE-M3嵌入模型**（稠密向量+稀疏向量）
- **混合检索**（WeightedRanker加权融合）
- **重排序**（BGE-Reranker-v2-m3）
- Milvus详解（Schema、索引类型）
- LangChain中的向量存储

### 04-项目代码结构与API接口.md
**内容**：项目结构和API文档
- 项目目录结构
- API接口详解（7个接口）
- 前端调用示例（JavaScript、Python）
- 系统工作流程（非流式、流式）
- 错误码说明
- 使用建议和最佳实践

### 05-BM25算法与Redis缓存.md
**内容**：BM25算法、Redis应用和Python日志
- **Python日志**（logging模块、日志级别、项目实现）
- **Redis数据库**（数据结构、客户端实现、缓存策略）
- BM25算法详解（公式、三个核心组件、完整实现）
- **文本预处理**（jieba分词、停用词过滤）
- **MySQL数据库**（FAQ问答表、对话历史表）
- 项目中的BM25实现（Softmax归一化、阈值判断）

### 06-Docker部署与项目实践.md
**内容**：Docker部署和运维实践
- Docker基础（镜像、容器、仓库）
- EduRAG项目Docker配置（Dockerfile、docker-compose.yml）
- 部署步骤（环境准备、项目部署、服务验证）
- 生产环境配置（环境变量、日志、监控）
- 运维实践（备份、扩展、安全）
- 常见问题解决
- 完整部署脚本

### 07-学习总结与项目要点.md
**内容**：学习总结和项目要点
- 学习内容总结（六大技术栈）
- EduRAG项目要点（架构、技术栈、API、工作流程）
- 学习收获（技术能力、项目实践、工程思维）
- 未来学习方向
- 项目文件说明
- 学习建议
- 常见面试题

### 08-项目源码深度分析.md
**内容**：基于实际代码的深度分析
- app.py（FastAPI应用、WebSocket、日常问候识别）
- new_main.py（集成系统、双系统架构、对话历史）
- bm25_search.py（BM25检索、Softmax、Redis缓存）
- new_rag_system.py（RAG系统、多种检索策略、查询分类）
- vector_store.py（Milvus向量存储、混合检索、BGE-M3、重排序）
- query_classifier.py（BERT查询分类器）
- strategy_selector.py（LLM策略选择）
- config.ini（完整配置参数）
- 关键设计模式

---

## 原始文件结构

```
09RAG学习/
├── day01/                # LangChain框架介绍
│   └── 02-笔记/
│       └── 3.1 LangChain框架介绍(v1.2).md
├── day02/                # LangChain框架介绍(续)
├── day03/                # 项目背景与架构
│   └── 03-笔记/
│       └── 01-项目背景与架构.md
├── day04/                # 常见的距离计算
│   └── 02-笔记/
│       └── 常见的距离.md
├── EduRAG_V7.5讲义/      # 项目讲义（HTML）
│   ├── ① 项目概述/       # 1.1-1.3
│   ├── ② 项目工具/       # 2.1-2.3
│   ├── ③ 基于Mysql库的问答系统/  # 3.1-3.4
│   ├── ④ 基于Milvus库的问答系统/ # 4.1-4.9
│   ├── ⑤ RAG系统评估/    # 5.1-5.3
│   ├── ⑥ 融合Mysql的RAG系统/    # 6.1-6.4
│   └── ⑦ 企业级生产环境部署/    # 7.1-7.2
├── Itcast_qa_system/     # 项目代码
│   ├── app.py            # 主应用
│   ├── new_main.py       # 集成系统
│   ├── base/             # 配置、日志
│   ├── mysql_qa/         # MySQL问答模块
│   ├── rag_qa/           # RAG问答模块
│   ├── 接口文档.md       # API文档
│   └── requirements.txt  # 依赖
└── 学习笔记/             # 本目录
```

---

## 使用建议

1. **按顺序阅读**：建议从01开始，按顺序阅读学习笔记
2. **结合代码**：参考 `Itcast_qa_system` 目录中的实际代码
3. **查阅讲义**：对于详细内容，可查看 `EduRAG_V7.5讲义` 中的HTML文件
4. **动手实践**：运行项目代码，加深理解