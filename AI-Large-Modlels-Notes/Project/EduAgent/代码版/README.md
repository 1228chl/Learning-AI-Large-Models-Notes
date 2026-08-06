# EduAgent 学习路线图

> 按课件章节顺序，从零开始学完整项目
> 课件对照：`F:\Heima_File\11Agent学习\EduAgent课件V7.7\EduAgent课件V7.7\`

## 预备知识

文件位置：`LearnKnowledge/day01/`

| 文件 | 知识点 | 优先级 |
|------|--------|--------|
| `01-0-协程.py` | async/await 基础 | ⭐⭐⭐ |
| `01-1-async-gather.py` | 并发执行 | ⭐⭐⭐ |
| `01-2-loop_run_in_executor.py` | 线程池执行阻塞操作 | ⭐⭐⭐ |
| `01-3-create_task.py` | 后台任务 | ⭐⭐ |
| `01-5-contextmanager.py` | 上下文管理器 | ⭐⭐ |
| `02-0-basemodel.py` | Pydantic BaseModel | ⭐⭐⭐ |
| `02-1-basemodel-validationError.py` | 数据校验 | ⭐⭐⭐ |
| `02-2-field.py` | Field 配置 | ⭐⭐ |

---

## 01-项目简介

对应课件：`01-项目全景介绍.html`、`02-多Agent系统核心概念.html`

> ⏳ 暂无文档，待补充

---

## 02-工具介绍

对应课件：`01-Python异步编程速成.html` ~ `10-测试FastAPI(扩展).html`

> ⏳ 暂无文档，待补充

---

## 03-环境搭建与工程地基

对应课件：`01-环境与基础设施.html` ~ `07-数据库表结构说明(扩展).html`

| 步骤 | 学习文档 | 源文件 | 知识点 |
|------|---------|--------|--------|
| 1 | [03-01-结构化日志](03-环境搭建与工程地基/03-01-结构化日志.md) | `backend/core/logger.py` | 结构化日志，事件名+键值对 |
| 2 | [03-02-配置中心](03-环境搭建与工程地基/03-02-配置中心.md) | `backend/config.py` | pydantic-settings，单例模式 |
| 3 | [03-03-异常体系](03-环境搭建与工程地基/03-03-异常体系.md) | `backend/core/exceptions.py` | 统一异常，可重试 vs 不可重试 |
| 4 | [03-04-三层兜底重试](03-环境搭建与工程地基/03-04-三层兜底重试.md) | `backend/core/retry.py` | 装饰器模式，重试→降级→兜底 |
| 5 | [03-05-数据库与JWT鉴权](03-环境搭建与工程地基/03-05-数据库与JWT鉴权.md) | `backend/dependencies.py` + `auth.py` | 异步数据库，JWT 鉴权 |

---

## 04-简历审查 Agent

对应课件：`01-简历Agent全景与数据流.html` ~ `09-拓展-简历API常见疑问.html`

| 步骤 | 学习文档 | 源文件 | 知识点 |
|------|---------|--------|--------|
| 1 | [04-01-简历Agent-State与数据模型](04-简历审查Agent/04-01-简历Agent-State与数据模型.md) | `backend/agents/resume/state.py` | LangGraph State，Pydantic 模型 |
| 2 | [04-02-简历Agent-提示词](04-简历审查Agent/04-02-简历Agent-提示词.md) | `backend/agents/resume/prompts.py` | 提示词设计，评分标准 |
| 3 | [04-03-简历Agent-节点函数](04-简历审查Agent/04-03-简历Agent-节点函数.md) | `backend/agents/resume/nodes.py` | 8 个节点，asyncio.gather 并行 |
| 4 | [04-04-简历Agent-图装配与API](04-简历审查Agent/04-04-简历Agent-图装配与API.md) | `graph.py` + `resume.py` | 直线流水线，异步后台任务 |

### 节点深析

| 文档 | 覆盖节点 | 核心知识点 |
|------|---------|-----------|
| [04-05-PDF文本提取-sync_extract_text深析](04-简历审查Agent/04-05-PDF文本提取-sync_extract_text深析.md) | `extract_text_node` | PyMuPDF 双栏布局，run_in_executor |
| [04-06-结构化提取-extract_structured_node深析](04-简历审查Agent/04-06-结构化提取-extract_structured_node深析.md) | `extract_structured_node` | LLM Function Calling，重试+降级 |
| [04-07-六维度并行评审-run_six_dimensions_node深析](04-简历审查Agent/04-07-六维度并行评审-run_six_dimensions_node深析.md) | `run_six_dimensions_node` | asyncio.gather 并行，加权评分 |
| [04-08-问题诊断-diagnose_issues_node深析](04-简历审查Agent/04-08-问题诊断-diagnose_issues_node深析.md) | `diagnose_issues_node` | Think 前置推理，优先级排序 |
| [04-09-整体评价-generate_summary_node深析](04-简历审查Agent/04-09-整体评价-generate_summary_node深析.md) | `generate_summary_node` | 三明治反馈，ResumeSummary |
| [04-10-结果持久化-save_results_node深析](04-简历审查Agent/04-10-结果持久化-save_results_node深析.md) | `save_results_node` | JSONB 持久化，双重清理 |

---

## 05-RAG 问答系统

对应课件：`05-01-RAG问答系统全景.html` ~ `05-17-端到端测试.html`

| 步骤 | 学习文档 | 源文件 | 知识点 |
|------|---------|--------|--------|
| 1 | [05-01-BGE-M3嵌入](05-RAG问答系统/05-01-BGE-M3嵌入.md) | `backend/core/knowledge_base.py` | 稠密+稀疏向量，单例模型 |
| 2 | [05-02-Milvus初始化与知识库构建](05-RAG问答系统/05-02-Milvus初始化与知识库构建.md) | `scripts/init_milvus.py` + `build_knowledge_base.py` | 向量库 Schema，建库流水线 |
| 3 | [05-03-Hybrid召回与精排](05-RAG问答系统/05-03-Hybrid召回与精排.md) | `backend/core/reranker.py` | 混合检索，CrossEncoder 精排 |
| 4 | [05-04-MiniLM意图分类](05-RAG问答系统/05-04-MiniLM意图分类.md) | `backend/core/query_classifier.py` | 三层分类，微调训练 |
| 5 | [05-05-QA-Agent-节点函数](05-RAG问答系统/05-05-QA-Agent-节点函数.md) | `backend/agents/qa/` | 10 个节点，三层分类体系 |
| 6 | [05-06-QA-Agent-图装配与API](05-RAG问答系统/05-06-QA-Agent-图装配与API.md) | `graph.py` + `qa.py` | 条件路由，SSE 流式输出 |
| 7 | [05-07-MCP工具](05-RAG问答系统/05-07-MCP工具.md) | `backend/mcp/` | JSON-RPC 协议，FastMCP |

### 构建流水线深析

| 文档 | 覆盖函数 | 核心知识点 |
|------|---------|-----------|
| [05-08-文档加载-load_document深析](05-RAG问答系统/05-08-文档加载-load_document深析.md) | `load_document` / `load_pdf` / `load_markdown` | PyPDFLoader，TextLoader，简单工厂 |
| [05-09-智能分块-split_documents深析](05-RAG问答系统/05-09-智能分块-split_documents深析.md) | `split_documents` / `split_pdf_documents` / `split_markdown_documents` | 两阶段分块，RecursiveCharacterTextSplitter，MarkdownHeaderTextSplitter |
| [05-10-上下文增强与嵌入-add_context_embed_chunks深析](05-RAG问答系统/05-10-上下文增强与嵌入-add_context_embed_chunks深析.md) | `add_context` / `embed_chunks` | Contextual RAG，BGE-M3 双向量，并发限流 |
| [05-11-写入Milvus-write_to_milvus深析](05-RAG问答系统/05-11-写入Milvus-write_to_milvus深析.md) | `write_to_milvus` | 先删后插，幂等重建，防注入 |
| [05-12-初始化Milvus集合-init_milvus深析](05-RAG问答系统/05-12-初始化Milvus集合-init_milvus深析.md) | `init_milvus.py` 全文件 | 集合 Schema，HNSW 索引，双向量 |
| [05-13-Hybrid检索-_hybrid_search深析](05-RAG问答系统/05-13-Hybrid检索-_hybrid_search深析.md) | `_hybrid_search` | Hybrid 检索，WeightedRanker，两路并行 |
| [05-14-BGE-Reranker精排-reranker深析](05-RAG问答系统/05-14-BGE-Reranker精排-reranker深析.md) | `reranker.py` 全文件 | Bi-Encoder vs CrossEncoder，两阶段检索，置信度阈值 |

### 分类器 & 记忆管理深析

| 文档 | 覆盖函数 | 核心知识点 |
|------|---------|-----------|
| [05-15-MiniLM意图分类-query_classifier深析](05-RAG问答系统/05-15-MiniLM意图分类-query_classifier深析.md) | `query_classifier.py` 全文件 | MiniLM 微调，分层分类，阈值 0.85 |
| [05-16-对话记忆管理-memory深析](05-RAG问答系统/05-16-对话记忆管理-memory深析.md) | `backend/core/memory.py` 全文件 | MemorySaver 单例，滑动窗口，摘要压缩，thread_id 隔离 |

### MCP 工具深析

| 文档 | 覆盖函数 | 核心知识点 |
|------|---------|-----------|
| [05-17-MCP工具-mcp深析](05-RAG问答系统/05-17-MCP工具-mcp深析.md) | `backend/mcp/` 全 3 文件 | JSON-RPC 2.0，FastMCP，stateless_http，双后端降级，run_in_executor |

### QA Agent 深析

| 文档 | 覆盖函数 | 核心知识点 |
|------|---------|-----------|
| [05-18-QA-Agent-State与Prompts深析](05-RAG问答系统/05-18-QA-Agent-State与Prompts深析.md) | `state.py` + `prompts.py` | QAState 五组字段，TypedDict + add_messages，7 个 Prompt 触发场景 |
| [05-19-QA-Agent-节点分类HyDE多Query深析](05-RAG问答系统/05-19-QA-Agent-节点分类HyDE多Query深析.md) | `nodes.py` 第 1~491 行 | 三层分类，规则快判，LLM 精判，HyDE，Multi-Query |
| [05-20-QA-Agent-节点检索与精排深析](05-RAG问答系统/05-20-QA-Agent-节点检索与精排深析.md) | `nodes.py` 第 498~597 行 | 三路检索，BROAD 并行合并，run_in_executor，空召回兜底 |
| [05-21-QA-Agent-生成Web兜底存记忆深析](05-RAG问答系统/05-21-QA-Agent-生成Web兜底存记忆深析.md) | `nodes.py` 第 600~966 行 | 4 种 answer_mode，增量压缩，UPSERT 幂等，失败静默 |
| [05-22-QA-Agent-图装配graph深析](05-RAG问答系统/05-22-QA-Agent-图装配graph深析.md) | `graph.py` 全文件 | 3 个路由函数，5 条路径，固定边+条件边，web_search 共用 |
| [05-23-QA-Agent-HTTP接口qa深析](05-RAG问答系统/05-23-QA-Agent-HTTP接口qa深析.md) | `qa.py` 全文件 | SSE 流式、4 类事件、web_search 重置、双数据源历史 |
| [05-24-QA-Agent-端到端测试深析](05-RAG问答系统/05-24-QA-Agent-端到端测试深析.md) | `test_qa.py` 全文件 | 8 个场景，路径覆盖，多轮记忆，会话隔离 |

---

## 06-试卷批改 Agent

对应课件：`06-01-试卷批改Agent全景.html` ~ `06-13-端到端测试.html`

> ⏳ 暂无文档，待补充

---

## 07-模拟面试 Agent

对应课件：`07-00-模拟面试Agent概览.html` ~ `07-13-端到端测试.html`

> ⏳ 暂无文档，待补充

---

## 08-系统集成

对应课件：`08-01-系统集成全景.html` ~ `08-07-端到端测试.html`

> ⏳ 暂无文档，待补充

---

## 09-前端集成扩展

对应课件：`09-01-前端集成全景.html` ~ `09-03-完整系统启动与联调验证.html`

> ⏳ 暂无文档，待补充

---

## 10-收尾与扩展

对应课件：`10-01-全景回顾与系统总览.html` ~ `扩展-Langfuse监控与评估完整指南.html`

> ⏳ 暂无文档，待补充

---

## 学习建议

```
学习顺序：按课件章节 01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10

每个模块的方法：
  1. 读课件（.html 文件，对应章节文件夹内）
  2. 读学习笔记（docs/ 下的 .md 文件）
  3. 读源文件注释（项目里注释很详细）
  4. 跑模块自测（if __name__ == "__main__"）
  5. 自己改代码验证理解
  6. 画出流程图

阅读顺序：
  先读小文件（config.py → logger.py → exceptions.py → retry.py）
  再读中文件（state.py → prompts.py → graph.py）
  最后读大文件（nodes.py → resume.py → qa.py）
```

## 已完成的文档

### 03-环境搭建与工程地基

- [03-01-结构化日志](03-环境搭建与工程地基/03-01-结构化日志.md)
- [03-02-配置中心](03-环境搭建与工程地基/03-02-配置中心.md)
- [03-03-异常体系](03-环境搭建与工程地基/03-03-异常体系.md)
- [03-04-三层兜底重试](03-环境搭建与工程地基/03-04-三层兜底重试.md)
- [03-05-数据库与JWT鉴权](03-环境搭建与工程地基/03-05-数据库与JWT鉴权.md)

### 04-简历审查 Agent

- [04-01-简历Agent-State与数据模型](04-简历审查Agent/04-01-简历Agent-State与数据模型.md)
- [04-02-简历Agent-提示词](04-简历审查Agent/04-02-简历Agent-提示词.md)
- [04-03-简历Agent-节点函数](04-简历审查Agent/04-03-简历Agent-节点函数.md)
- [04-04-简历Agent-图装配与API](04-简历审查Agent/04-04-简历Agent-图装配与API.md)
- [04-05-PDF文本提取-sync_extract_text深析](04-简历审查Agent/04-05-PDF文本提取-sync_extract_text深析.md)
- [04-06-结构化提取-extract_structured_node深析](04-简历审查Agent/04-06-结构化提取-extract_structured_node深析.md)
- [04-07-六维度并行评审-run_six_dimensions_node深析](04-简历审查Agent/04-07-六维度并行评审-run_six_dimensions_node深析.md)
- [04-08-问题诊断-diagnose_issues_node深析](04-简历审查Agent/04-08-问题诊断-diagnose_issues_node深析.md)
- [04-09-整体评价-generate_summary_node深析](04-简历审查Agent/04-09-整体评价-generate_summary_node深析.md)
- [04-10-结果持久化-save_results_node深析](04-简历审查Agent/04-10-结果持久化-save_results_node深析.md)

### 05-RAG 问答系统

- [05-01-BGE-M3嵌入](05-RAG问答系统/05-01-BGE-M3嵌入.md)
- [05-08-文档加载-load_document深析](05-RAG问答系统/05-08-文档加载-load_document深析.md)
- [05-09-智能分块-split_documents深析](05-RAG问答系统/05-09-智能分块-split_documents深析.md)
- [05-10-上下文增强与嵌入-add_context_embed_chunks深析](05-RAG问答系统/05-10-上下文增强与嵌入-add_context_embed_chunks深析.md)
- [05-11-写入Milvus-write_to_milvus深析](05-RAG问答系统/05-11-写入Milvus-write_to_milvus深析.md)
- [05-12-初始化Milvus集合-init_milvus深析](05-RAG问答系统/05-12-初始化Milvus集合-init_milvus深析.md)
- [05-13-Hybrid检索-_hybrid_search深析](05-RAG问答系统/05-13-Hybrid检索-_hybrid_search深析.md)
- [05-14-BGE-Reranker精排-reranker深析](05-RAG问答系统/05-14-BGE-Reranker精排-reranker深析.md)
- [05-15-MiniLM意图分类-query_classifier深析](05-RAG问答系统/05-15-MiniLM意图分类-query_classifier深析.md)
- [05-16-对话记忆管理-memory深析](05-RAG问答系统/05-16-对话记忆管理-memory深析.md)
- [05-17-MCP工具-mcp深析](05-RAG问答系统/05-17-MCP工具-mcp深析.md)
- [05-18-QA-Agent-State与Prompts深析](05-RAG问答系统/05-18-QA-Agent-State与Prompts深析.md)
- [05-19-QA-Agent-节点分类HyDE多Query深析](05-RAG问答系统/05-19-QA-Agent-节点分类HyDE多Query深析.md)
- [05-20-QA-Agent-节点检索与精排深析](05-RAG问答系统/05-20-QA-Agent-节点检索与精排深析.md)
- [05-21-QA-Agent-生成Web兜底存记忆深析](05-RAG问答系统/05-21-QA-Agent-生成Web兜底存记忆深析.md)
- [05-22-QA-Agent-图装配graph深析](05-RAG问答系统/05-22-QA-Agent-图装配graph深析.md)
- [05-23-QA-Agent-HTTP接口qa深析](05-RAG问答系统/05-23-QA-Agent-HTTP接口qa深析.md)
- [05-24-QA-Agent-端到端测试深析](05-RAG问答系统/05-24-QA-Agent-端到端测试深析.md)
- [05-02-Milvus初始化与知识库构建](05-RAG问答系统/05-02-Milvus初始化与知识库构建.md)
- [05-03-Hybrid召回与精排](05-RAG问答系统/05-03-Hybrid召回与精排.md)
- [05-04-MiniLM意图分类](05-RAG问答系统/05-04-MiniLM意图分类.md)
- [05-05-QA-Agent-节点函数](05-RAG问答系统/05-05-QA-Agent-节点函数.md)
- [05-06-QA-Agent-图装配与API](05-RAG问答系统/05-06-QA-Agent-图装配与API.md)
- [05-07-MCP工具](05-RAG问答系统/05-07-MCP工具.md)