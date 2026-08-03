# Learning-AI-Large-Models-Notes

[![GitHub](https://img.shields.io/badge/GitHub-1228chl%2FLearning--AI--Large--Models--Notes-181717?logo=github)](https://github.com/1228chl/Learning-AI-Large-Models-Notes)

系统的 AI 大模型知识学习仓库，涵盖机器学习、深度学习、自然语言处理、AI Agent 等领域的知识笔记和原子卡片。仓库分为两大部分：原子卡片库和传统笔记库。

---

## 原子卡片库 (Atomic-Cards)

原子卡片是基于原子化知识理念设计的知识点卡片，每张卡片围绕一个独立概念展开，包含定义（含 LaTeX 公式）、核心公式、直观理解、ML/DL 应用场景、面试追问 Q1-Q4 以及跨域引用链接。共 **260 张卡片**，覆盖 12 个分类。

| 分类 | 子分类 | 卡片数 | 说明 |
|:-----|:-------|:------:|:-----|
| Linux | -- | 8 | 基础命令、文件管理、进程、网络监控 |
| Python | OOP / Pydantic / 并发 / 工具 | 20 | 类与对象、Pydantic 数据建模、asyncio 异步、threading.local 等 |
| 数据分析 | -- | 4 | NumPy、Pandas、Matplotlib |
| 数学基础 | 线性代数 / 微积分与优化 / 概率统计 | 33 | 向量空间、矩阵运算、贝叶斯公式、梯度下降、凸优化等 |
| 数据库 | SQL / Redis / Milvus / 检索 | 22 | SQL 基础、Redis 数据结构、向量数据库、HNSW 索引、嵌入与检索 |
| 机器学习 | 基础 / 监督学习 / 集成学习 / 聚类 / 降维 / 特征工程 / 正则化 / LLM 评估 / 实践 | 37 | 回归、SVM、决策树、K-means、PCA、半监督学习、强化学习等 |
| 深度学习 | 基础 / PyTorch / CNN-RNN / 迁移学习 / 训练优化 / 模型压缩 / LLM | 40 | 感知机、激活函数、反向传播、CNN、RNN、LSTM、GAN、GNN、BatchNorm、数据增强等 |
| NLP | 基础 / 架构 / 预训练 / 组件 / 任务 | 18 | 概述、分词、词嵌入、Seq2Seq、注意力机制、BERT、GPT 等 |
| AI-Agent | 基础 / LangChain / LangGraph / RAG 流程 / 检索 / 系统 / 设计模式 / 工程实践 / 基础设施 | 41 | Agent 定义、RAG 实现、多 Agent 系统、LLM-as-Judge、Agent 评估、系统健康度等 |
| 数据结构与算法 | 基础结构 / 树堆图 / 算法 | 15 | 数组、链表、栈、树、图、排序、动态规划 |
| Tools | Docker / 部署 / 工具 / 网络 | 18 | Docker 编排、Git、LLM API 部署、Vue3 前端集成、FastAPI 后台任务等 |
| 知识体系 | -- | 2 | 核心依赖链、面试追问树 |

> 如需增加新卡片，注意保持格式规范（参照已有卡片模板）。

## 传统笔记库 (AI-Large-Modlels-Notes)

原始完整学习笔记，共 **154 篇**，覆盖更广泛的主题，包含完整的项目实战记录。

| 模块 | 内容 |
|:-----|:-----|
| **Agent** | 提示词工程、Coze/Dify 平台实践、RAG 构建、提示词模板 |
| **NLP** | NLP 概述、文本预处理、FastText、RNN、Transformer、BERT 系列（含精简版 8 篇） |
| **DL** | 深度学习概述、PyTorch 教程、ANN/CNN/RNN 理论与实践 |
| **ML** | 机器学习基础、监督学习（线性回归/KNN/决策树/随机森林）、无监督学习 |
| **Math** | 线性代数、微积分、统计学、向量距离计算 |
| **Project** | 4 个完整项目（见下方） |
| **Python** | 面向对象、装饰器、网络编程、进程线程、协程、正则、进阶语法 |
| **Algorithm** | 算法题解（如两数之和） |
| **Linux** | Linux 命令整理 |
| **SQL** | MySQL、PyMySQL、Redis 操作 |
| **DataAnalysis** | 数据分析方法 |
| **PackageManager** | Conda 基础命令 |
| **Modify-Obsidian-Plugin** | MathLive、NotePix 插件修改记录 |
| **Draft** | 进行中的草稿 |
| **Question** | DL 常见面试问题整理 |

### 项目实战记录

| 项目 | 说明 |
|:-----|:------|
| **EduAgent** | 多 Agent 教学辅助系统 — LangGraph + FastAPI + DeepSeek + Milvus，四大 Agent（QA/试卷批改/简历审查/模拟面试）完整实现（含 31 篇项目笔记） |
| **EduRAG** | 教育领域 RAG 问答系统 — LangChain 框架、Milvus 向量数据库、BM25 混合检索、Redis 缓存、Docker 部署（含 21 篇项目笔记） |
| **NLP-DangDangBookClassifier** | 当当图书分类器 — FastText、Bert-Base、RandomForest 多模型对比 |
| **SubmitAFullScoreProject** | 满分项目实践 — FastText 文本分类、模型压缩、反馈记录 |

## 其他目录与文件

| 路径 | 说明 |
|:-----|:------|
| **Atomic-Cards/** | 原子卡片库（260 张，12 分类） |
| **AI-Large-Modlels-Notes/** | 传统笔记库（154 篇） |
| **Assets/** | 图片资源（Agent/Coze/Dify 截图等） |
| **Templates/** | Obsidian 笔记模板 |
| **AI-Learning-知识点总表.md** | 全仓库知识点索引总表 |
| **CLAUDE.md** | 项目级 AI 助手规则（质量门禁、请求合并、输出精简） |
| **token-saver.md** | Token 消耗统计与分析 |
| **token-skill.md** | Token 优化技能笔记 |

## 仓库统计

| 指标 | 数值 |
|:-----|:----:|
| 原子卡片总数 | **260 张** |
| 原子卡片分类 | 12 个 |
| 传统笔记总数 | 154 篇 |
| 项目实战记录 | 4 个（EduAgent、EduRAG、图书分类器、满分项目） |
| 仓库总文件数 | 703 |

## 使用说明

本仓库使用 **Obsidian** 笔记软件组织管理。原子卡片之间通过相对路径链接相互引用，形成知识网络。推荐的学习路径：

1. 从 **知识体系/核心依赖链** 卡片了解整体结构
2. 按 **Linux → Python → 数据分析 → 数学基础 → 数据库 → 机器学习 → 深度学习 → NLP → AI-Agent → 数据结构与算法 → Tools** 顺序学习
3. 每个知识点配合 **面试追问** 检验理解深度
4. 章节末尾有 `AI-Learning-知识点总表.md` 作为全仓库索引