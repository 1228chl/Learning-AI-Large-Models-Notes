#  AI-Learning 知识点总表

> 生成日期：2026-07-06 | 更新日期：2026-07-30
> 说明：本表覆盖了仓库中除 `Full-Notes` 和 `New-Notes` 外的全部内容，按知识维度重新组织和归纳。

---

## 一、基础数学（Math）

| 知识点 | 子知识点 |
|:-------|:---------|
| **线性代数基础** | 向量与标量、矩阵运算、特征值与特征向量、矩阵分解 |
| **微积分基础** | 导数与偏导数、链式法则、梯度、优化基础 |
| **统计学基础** | 概率分布、期望与方差、贝叶斯定理、假设检验 |
| **多维向量距离计算** | 欧氏距离、余弦相似度、曼哈顿距离、内积、向量归一化 |

---

## 二、编程语言（Python）

| 知识点 | 子知识点 |
|:-------|:---------|
| **面向对象基础** | 类与对象、封装、继承、多态、魔术方法 |
| **面向对象高级** | 抽象类、多继承、MRO、`@property`、`__slots__` |
| **闭包和装饰器** | 闭包概念、装饰器原理、带参装饰器、`@wraps` |
| **网络编程** | Socket 编程、TCP/UDP、HTTP 协议基础 |
| **深浅拷贝** | 引用、浅拷贝 vs 深拷贝、`copy` 模块 |
| **进程** | 多进程、`multiprocessing`、进程池、进程间通信 |
| **线程** | 多线程、`threading`、GIL、线程锁、线程池 |
| **迭代器 & 生成器 & 协程** | 可迭代对象、`__iter__` / `__next__`、`yield`、`async/await`、`gevent` |
| **正则表达式** | 元字符、匹配规则、`re` 模块、分组与捕获 |
| **Python 进阶** | 高阶函数、`map/filter/reduce`、上下文管理器、`with` 语句 |
| **Pydantic 数据建模** | BaseModel、Field.description、类型校验、LLM 结构化输出（with_structured_output）、BaseSettings |
| **异步编程进阶** | asynccontextmanager、FastAPI lifespan 模式、yield 依赖注入、后台任务 GC 保护 |
| **线程本地存储** | threading.local() 线程隔离变量、全局变量竞态问题、contextvars 协程隔离 |

---

## 三、Linux 命令

| 知识点 | 子知识点 |
|:-------|:---------|
| **Linux 基础命令** | 文件操作（`ls/cd/cp/mv/rm`）、文本处理（`grep/sed/awk`）、权限管理 |
| **Linux 进阶** | 进程管理、网络配置、Shell 脚本、定时任务、系统监控 |

---

## 四、数据库（SQL）

| 知识点 | 子知识点 |
|:-------|:---------|
| **MySQL 数据库** | 数据库设计、CRUD、表连接、索引、事务、ACID |
| **PyMySQL 模块** | 连接池、参数化查询、事务处理、ORM 对比 |
| **PyRedis 模块** | Redis 数据结构（string/hash/set/zset）、缓存策略、过期时间 |
| **Milvus 向量索引** | HNSW 分层可导航小世界索引、M/efConstruction/ef 参数调优、NSW 图原理 |

---

## 五、工程实践（Engineering Practice）

| 知识点 | 子知识点 |
|:-------|:---------|
| **Conda 环境管理** | 环境创建/管理、包安装/更新/删除、换源、环境导出、环境克隆 |
| **UV 包管理器** | 极速 pip 替代（Rust）、虚拟环境、依赖解析、lock 文件 |
| **Docker 容器化** | 镜像与容器、Dockerfile、Docker Compose、多服务编排（PostgreSQL+Milvus+etcd+MinIO+Attu）、部署 |
| **前端集成** | Vue 3 + Vite、Element Plus、SSE 流式事件处理、JWT 鉴权全流程、Pinia 状态管理 |
| **FastAPI 异步处理** | 文件上传 + 202 Accepted + 后台任务 + 前端轮询模式、_background_tasks GC 保护 |

---

## 六、数据结构与算法（Algorithm）

| 知识点 | 子知识点 |
|:-------|:---------|
| **算法复杂度分析** | 大 O 表示法、时间复杂度、空间复杂度、最好/最坏/平均复杂度 |
| **数据结构** | 栈、队列、哈希表、树、图 |
| **数组与链表** | 动态数组、单向/双向链表、增删改查性能对比 |

---

## 七、机器学习（ML）

### 7.1 基础

| 知识点 | 子知识点 |
|:-------|:---------|
| **机器学习概论** | 定义（数据+模型+算法）、三大类型（监督/无监督/强化学习）、过拟合与欠拟合 |
| **机器学习基础** | AI/ML/DL 关系、数据集划分（train/val/test）、评估指标、交叉验证 |

### 7.2 监督学习

| 知识点 | 子知识点 |
|:-------|:---------|
| **K-近邻（KNN）** | 算法思想（物以类聚）、距离度量（欧氏/曼哈顿）、特征预处理（标准化/归一化）、K 值选择、模型拟合判断、超参数搜索（GridSearchCV） |
| **线性回归** | 最小二乘法、损失函数（MSE）、梯度下降（批量/随机/小批量）、正规方程、正则化（L1/L2/Ridge/Lasso） |
| **决策树** | 树结构（内部节点/叶子）、特征选择（信息增益/基尼系数）、剪枝策略（预剪枝/后剪枝）、CART 算法 |
| **集成学习 / 随机森林** | Bagging 思想、随机森林（特征+样本双随机）、Out-of-Bag 评估、特征重要性、与 Boosting 对比 |

### 7.3 无监督学习

| 知识点 | 子知识点 |
|:-------|:---------|
| **聚类算法 / K-means** | 聚类概念、K 值选择（肘部法/轮廓系数）、距离计算、迭代收敛、初始中心点影响 |

---

## 八、深度学习（DL）

### 8.1 基础

| 知识点 | 子知识点 |
|:-------|:---------|
| **深度学习概述** | AI/ML/DL 关系、神经网络基础、前向传播、激活函数（Sigmoid/Tanh/ReLU） |
| **PyTorch 框架** | 张量（Tensor）操作、GPU 加速、动态计算图、Dataset & DataLoader、模型定义（`nn.Module`） |
| **PyTorch 自动微分** | 计算图（DAG）、`requires_grad`、`backward()`、梯度累加、`torch.no_grad()` |

### 8.2 人工神经网络（ANN）

| 知识点 | 子知识点 |
|:-------|:---------|
| **ANN 完整拓展+** | 网络结构设计、激活函数详解、损失函数选择、权重初始化、梯度消失/爆炸 |
| **完整的模型训练流程** | 数据加载→模型创建→损失函数→优化器→调度器→训练循环→评估 |
| **手机价格预测（基础版）** | 回归任务实战、特征工程、模型评估 |
| **手机价格预测（进阶版）** | 特征选择、超参数调优、模型对比 |

### 8.3 卷积神经网络（CNN）

| 知识点 | 子知识点 |
|:-------|:---------|
| **CNN** | 卷积核、特征图、池化层（最大/平均）、填充与步长、经典架构（LeNet/AlexNet/VGG/ResNet） |

### 8.4 循环神经网络（RNN）

| 知识点 | 子知识点 |
|:-------|:---------|
| **RNN 及其变体** | 序列建模、隐藏状态、时间步展开、梯度消失/爆炸、LSTM（门控机制）、GRU |

---

## 九、自然语言处理（NLP）

### 9.1 核心路线

| 知识点 | 子知识点 |
|:-------|:---------|
| **NLP 概述** | NLP 定义、NLU vs NLG、核心技术领域（分类/翻译/摘要/问答）、歧义性与挑战 |
| **文本预处理 — 分词 — 张量** | 分词（jieba/BPE/WordPiece）、文本清洗、停用词过滤、词表构建、序列填充/截断、张量转换 |
| **FastText 分类任务** | 词向量训练、n-gram 子词、层次 Softmax、负采样、文本分类实战 |
| **RNN 及其变体** | RNN 结构、LSTM（遗忘/输入/输出门）、GRU（重置/更新门）、双向 RNN、堆叠 RNN |
| **注意力机制 & Seq2Seq** | Encoder-Decoder 架构、注意力计算（加性/点积/缩放点积）、Bahdanau/Luong Attention、Beam Search |
| **Transformer** | 自注意力（Self-Attention）、多头注意力（Multi-Head）、位置编码（Sinusoidal/可学习）、FFN、LayerNorm、Mask 机制 |
| **BERT 系列模型** | 预训练（MLM + NSP）、微调范式、BERT 变体（RoBERTa/ALBERT/DistilBERT）、ELMo/GPT 对比 |
| **Transformers 库 & BERT 应用** | HuggingFace 生态、Pipeline、Tokenizer、模型加载/保存、下游任务微调 |

### 9.2 精简版

| 知识点 | 说明 |
|:-------|:-----|
| 上述全部 8 个模块的精简版 | 压缩核心概念、公式、重要结论，删除图片和冗余细节，适合快速复习 |

---

## 十、数据分析（DataAnalysis）

| 知识点 | 子知识点 |
|:-------|:---------|
| **NumPy** | ndarray、广播机制、索引与切片、矩阵运算、随机数、统计函数 |
| **Pandas** | Series/DataFrame、数据读取（CSV/Excel）、缺失值处理、分组聚合、merge/join |
| **Matplotlib** | 折线图/散点图/柱状图/直方图、子图布局、样式定制、中文显示 |

---

## 十一、AI Agent（智能体）

### 11.1 Coze（字节跳动）

| 知识点 | 子知识点 |
|:-------|:---------|
| **Coze 基础入门** | Agent 概念（LLM+记忆+规划+工具）、传统 LLM vs Agent、Coze 平台操作流程 |
| **Coze 进阶** | 私有数据访问、RAG 知识库构建（数据准备→向量化→检索→生成）、工作流设计 |
| **Coze 细节（课堂版）** | Agent 基础详解、Coze vs Dify vs LangGraph 对比、插件系统、知识库管理 |

### 11.2 Dify & RAGFlow

| 知识点 | 子知识点 |
|:-------|:---------|
| **Dify 安装与配置** | WSL/虚拟机部署、Docker-Compose、环境配置 |
| **Dify 使用** | 应用构建、知识库接入、工作流编排、模型管理 |

### 11.3 RAG & LangChain

| 知识点 | 子知识点 |
|:-------|:---------|
| **LangChain 框架** | 六大组件（Models/Prompts/Memory/Chains/Agents/Indexes）、模块化与可扩展设计、with_structured_output |
| **LangGraph 图模型** | State+Node+Edge 四要素、条件边与路由、Checkpointer 记忆、interrupt/Command HitL、流式输出（astream_events + SSE）、滑动窗口+摘要压缩记忆管理 |
| **Milvus 向量数据库** | Schema 设计、索引类型（IVF/HNSW）、相似度搜索、Collection 管理 |
| **基于 MySQL 的问答系统** | 结构化数据问答、SQL 生成、查询执行链路 |
| **多 Agent 系统 (EduAgent)** | 四大范式（并行评审/RAG/HitL/状态机）、统一入口与 SSE 路由、Orchestrator 编排、Agent 迁移方法论、多租户隔离三层设计 |
| **Agent 评估体系** | 自动化指标（Recall@K/MAE）、LLM-as-Judge 语义评判、人工基线交叉验证、系统健康度（P95 延迟/回退率/Token 消耗/TTFT） |

### 11.4 提示词工程

| 知识点 | 子知识点 |
|:-------|:---------|
| **提示词工程** | Prompt 设计原则、Few-shot/Chain-of-Thought、角色设定、输出格式化 |
| **精简笔记提示词** | 提示词模板（面向 AI 学生笔记精简）、核心保留原则、图片/代码处理规则 |
| **笔记模板提示词** | Obsidian 笔记模板定义、结构化输出 |

---

## 十二、项目实战（Project）

### 12.1 EduRAG（教育领域 RAG 问答系统）

| 知识点 | 子知识点 |
|:-------|:---------|
| **LangChain 框架介绍** | Models/Prompts/Memory/Chains/Agents/Indexes 六大组件详解、结构化输出 |
| **RAG 系统架构与原理** | 索引-检索-生成三阶段、双系统架构（MySQL FAQ + Milvus RAG）、查询分类（BERT 二分类）、检索策略（直接/HyDE/子查询/回溯）、RAGAS 评估 |
| **向量数据库与距离计算** | Milvus/Chroma/FAISS 对比、欧氏/内积/余弦、BGE-M3 嵌入（稠密+稀疏）、混合检索（WeightedRanker）、BGE-Reranker 重排序 |
| **项目代码结构与 API** | FastAPI 应用、7 个 API 接口、WebSocket 流式、前端调用示例、错误码 |
| **BM25 算法与 Redis 缓存** | BM25 公式与实现、jieba 分词、Softmax 归一化、Redis 缓存策略、Python logging |
| **Docker 部署** | Dockerfile、docker-compose、生产环境配置、日志监控、备份扩展 |
| **项目源码深度分析** | app.py / new_main.py / bm25_search.py / rag_system / vector_store / query_classifier、设计模式解析 |
| **补充知识（一）** | 日志配置、Redis 数据结构、文档处理策略、RAG 评估框架、Docker 运维 |
| **补充知识（二）** | 混合检索融合、重排序策略、父子块切分策略、检索策略选择 |

### 12.2 NLP-DangDangBookClassifier（当当图书分类）

| 知识点 | 子知识点 |
|:-------|:---------|
| **FastText 方案** | 子词特征、层次 Softmax、81 万条 / 40+ 类别分类 |
| **BERT-Base 方案** | 预训练+微调、序列标注/分类头 |
| **RandomForests 方案** | 特征工程（TF-IDF）、传统机器学习基线、对比实验 |
| **面试准备** | 项目自我介绍、面试题目集、技术问答整理 |

### 12.3 SubmitAFullScoreProject（投满分项目）

| 知识点 | 子知识点 |
|:-------|:---------|
| **项目背景** | 今日头条推荐系统、短文本多分类、用户增长目标 |
| **FastText 实现** | 多分类模型构建、性能调优、与基线模型对比提升 33% |
| **RandomForest 实现** | 特征提取与工程、对比实验设计 |
| **模型压缩** | 量化（Post-training / 动态 / 静态量化）、剪枝（结构化 / 非结构化）、知识蒸馏（Student-Teacher） |
| **反馈与迭代** | 项目复盘、面试反馈、改进方向总结 |

---

## 十三、Obsidian 插件修改（Modify-Obsidian-Plugin）

| 知识点 | 子知识点 |
|:-------|:---------|
| **MathLive 修复** | 行内公式编辑滚动 Bug 排查、`defaultMode` 与 `inline-math` 差异、`math-field` 样式修复 |
| **NotePix 修复** | 笔记图片/像素处理功能改造、插件兼容性调整 |

---

## 十四、草稿 & 问题（Draft & Question）

| 知识点 | 子知识点 |
|:-------|:---------|
| **草稿** | ANN 笔记草稿、LangChain 框架初稿、Seq2Seq 与注意力机制草稿、LangGraph 与 RAG 学习日报 |
| **常见问题** | DL 面试题整理、概念辨析（梯度消失/爆炸原因、LSTM 门控机制等） |

---

## 十五、系统化知识体系（Full-Knowledge）

| 模块 | 知识点 | 子知识点 |
|:-----|:-------|:---------|
| **00-数学地基** | 向量与线性代数 | 向量空间、线性变换、特征分解、SVD |
| | 矩阵运算 | 矩阵乘法、逆矩阵、正交矩阵、范数 |
| | 概率统计 | 概率分布族、极大似然估计、贝叶斯推断 |
| | 微积分与优化 | 偏导、梯度、凸优化、拉格朗日乘子法 |
| **01-编程实现** | Python 与 NumPy | 向量化编程、广播、线性代数运算 |
| | PyTorch 基础 | 张量、自动微分、GPU 编程、模型构建 |
| **02-模型基础** | 线性/逻辑回归 | 分类与回归统一框架、决策边界、Softmax |
| | 神经网络与反向传播 | 多层感知机、链式法则、参数更新 |
| **03-深度模型** | CNN | 卷积/池化/全连接、经典架构演化 |
| | RNN 与 LSTM | 序列建模、长短期记忆、门控机制 |
| | 注意力与 Transformer | 自注意力、多头、位置编码、完整架构 |
| **04-NLP 应用** | BERT | 双向编码、MLM/NSP、下游任务迁移 |
| | GPT 系列 | 自回归生成、Prompt / In-Context Learning、GPT-1 到 GPT-4 |
| **05-工程应用** | RAG 检索增强生成 | Embedding→检索→融合→生成、知识库构建 |
| | AI-Agent | 智能体框架、工具调用、多 Agent 协作 |
| **06-连接词与追问树** | 连接词索引 | 知识点之间的依赖引用关系网络 |
| | 面试追问树 | 从知识点出发的面试追问链路（如：RNN→梯度消失→LSTM→Transformer→BERT） |

---

## 📊 总览统计

| 分类 | 模块数 | 主要笔记文件数 |
|:-----|:------:|:--------------:|
| 基础（Math/Python/Linux/SQL/Algorithm） | 5 | ~25 |
| 工程实践（Docker/Conda/UV/部署） | 4 | ~8 |
| 机器学习（ML） | 4 个子方向 | ~15 |
| 深度学习（DL） | 4 个子方向 | ~10 |
| 自然语言处理（NLP） | 8 个模块 + 8 个精简版 | ~20 |
| 数据分析（DataAnalysis） | 3 个工具 | ~6 |
| AI Agent | 5 个方向 | ~20 |
| 项目实战（Project） | 3 个项目 | ~25 |
| Obsidian 插件 | 2 个插件 | ~2 |
| 草稿 & 问题 | 2 类 | ~8 |
| Full-Knowledge（系统体系） | 7 个阶段 | ~20 |
| **总计** | **~40** | **~150** |
