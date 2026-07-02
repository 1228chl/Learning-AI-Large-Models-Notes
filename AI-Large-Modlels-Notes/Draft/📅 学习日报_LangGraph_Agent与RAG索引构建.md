> 📁 `day_02` | 共 6 个文件

## 📊 今日概要
今天从零搭建了 LangGraph Agent 的**记忆系统**（内存 → MySQL 持久化），然后进入 RAG 的**索引构建阶段**：文档加载 → 文本分割 → 向量化 → 存入 Chroma → 相似度检索。最后还学习了用 Pydantic 强制 LLM 输出**结构化数据**。一条完整的 "Agent 记忆 + RAG 检索 + 结构化输出" 链路。

## 🧩 前置知识检查

在开始今天的学习前，确认你已经理解以下概念：

| 需要掌握 | 为什么需要 | 快速回顾 |
|----------|-----------|---------|
| LangChain `create_agent` 基础用法 | 今天三个文件都用它创建 agent | `create_agent(llm, tools=[], checkpointer=...)` 返回可调用的 agent 对象 |
| Python 上下文管理器 `with` | `PyMySQLSaver` 必须用 `with` 管理连接生命周期 | `with X as x:` 进入时 `__enter__`，退出时 `__exit__` 自动释放资源 |
| `os.getenv()` 读取环境变量 | 今天所有 LLM/Embedding 调用都用它获取 API Key | `os.getenv("KEY_NAME")` 从 `.env` 或系统环境读取，避免硬编码 |
| 向量/Embedding 基本概念 | 向量存储和相似度检索的核心前提 | 文本 → Embedding 模型 → 高维向量，相似的文本向量距离近 |

> ⚠️ 如果对 `create_agent` 不熟悉，建议先回顾 day_01 中 agent 基础用法的文件。

## 🔗 知识关联图谱

### 今日知识结构
```
LangGraph Agent 记忆
├── InMemorySaver (01) ──→ 会话随进程销毁，开发/测试用
└── PyMySQLSaver  (02) ──→ 持久化到 MySQL，生产环境用
    └── thread_id ←→ 对话隔离（同一 thread_id = 同一会话上下文）

RAG 索引构建管线（03 → 04 → 05）
├── ① 文档加载
│   ├── UnstructuredLoader ──→ 智能分区（按语义、格式）
│   └── TextLoader         ──→ 整文件读入，简单场景用
├── ② 文本分割
│   ├── CharacterTextSplitter       ──→ 按分隔符切分，简单直接
│   └── RecursiveCharacterTextSplitter ──→ 递归按 \n\n → \n → 空格 → 字符 逐级切割
│       chunk_size=100, chunk_overlap=20
├── ③ 向量化 ──→ DashScopeEmbeddings (text-embedding-v3)
├── ④ 存储   ──→ Chroma.from_texts(persist_directory="outputs/chroma.db")
└── ⑤ 检索   ──→ similarity_search / as_retriever(k=2)

结构化输出 (06)
└── Pydantic BaseModel ──→ create_agent(response_format=PersonInfo)
    └── Field(description=...) ──→ 让 LLM 知道每个字段的含义
```

### 关键关系说明
| 关系 | 说明 |
|------|------|
| `InMemorySaver` → `PyMySQLSaver` | 后者是前者的持久化替代方案，API 完全一致（都实现 `checkpointer` 接口），切换只需改 import 和连接字符串 |
| `CharacterTextSplitter` → `RecursiveCharacterTextSplitter` | 前者简单粗暴按分隔符切，后者**递归尝试多种分隔符**，切出的 chunk 语义更完整 |
| `similarity_search` ⇄ `as_retriever` | 前者是直接检索方法，后者返回一个 `Retriever` 对象方便集成到 LangChain Chain 中；底层逻辑相同，接口不同 |
| `create_agent` 贯穿 (01/02/06) | LangGraph 的统一入口，三个文件分别演示了它的三个能力：记忆(01/02)、结构化输出(06) |
| `chunk_size` ←→ `chunk_overlap` | overlap 为相邻 chunk 的**重叠字符数**，保证关键信息不会被切断在 chunk 边界上 |

### 在深度学习知识体系中的位置
本课属于 **RAG（检索增强生成）** 体系中的**索引构建 + Agent 记忆管理**模块，前承 day_01 的 Agent 基础调用，后接检索策略优化与多轮对话系统。

## 💡 API / 知识点
| 标记 | API / 函数 | 作用 | 关键参数 | 文件 |
|------|------------|------|----------|------|
| 🔴 | `InMemorySaver()` | Agent 对话记忆（内存版，进程结束即丢失） | 无参数（所有数据在内存 dict 中） | `01-InMemorySave.py` |
| 🔴 | `PyMySQLSaver.from_conn_string()` | Agent 对话记忆（MySQL 持久化版） | DB URI（`mysql+pymysql://user:pass@host:port/db`） | `02-mysql-memory.py` |
| 🟡 | `checkpointer.setup()` | 自动创建 MySQL 存储所需的表结构 | 无参数 | `02-mysql-memory.py` |
| 🔴 | `UnstructuredLoader()` | 智能文档加载（自动识别格式、语义分区） | `file_path`, `encoding` | `03-indexes_loader.py` |
| 🟡 | `TextLoader()` | 简单文本文件加载（整文件读入一个 Document） | `file_path`, `encoding` | `03-indexes_loader.py` |
| 🔴 | `CharacterTextSplitter()` | 按分隔符切分文本 | `separator`, `chunk_size`, `chunk_overlap` | `04-indexes_splitter.py` |
| 🔴 | `RecursiveCharacterTextSplitter()` | 递归多层分隔符切分（推荐优先使用） | `chunk_size`, `chunk_overlap` | `04-indexes_splitter.py` |
| 🟡 | `split_text()` vs `create_documents()` | 前者返回字符串列表，后者返回 Document 对象列表 | 字符串 / 字符串列表 | `04-indexes_splitter.py` |
| 🔴 | `DashScopeEmbeddings()` | 阿里云文本向量化（embedding） | `dashscope_api_key`, `model`（如 `text-embedding-v3`） | `05-indexes_vector_store.py` |
| 🔴 | `Chroma.from_texts()` | 创建 Chroma 向量数据库并存入数据 | `texts`, `embeddings`, `persist_directory` | `05-indexes_vector_store.py` |
| 🔴 | `docsearch.similarity_search()` | 相似度检索（返回 top-k 相关文档） | `query`（字符串） | `05-indexes_vector_store.py` |
| 🟠 | `docsearch.as_retriever()` | 将向量库包装为 Retriever 对象 | `search_kwargs={"k": N}` | `05-indexes_vector_store.py` |
| 🔴 | `BaseModel` (Pydantic) | 定义结构化数据模型，强制 LLM 按格式输出 | 类属性 + `Field(description=...)` | `06-structured_output.py` |
| 🟡 | `create_agent(response_format=...)` | 让 Agent 输出符合 Pydantic 模型的结构化 JSON | `response_format=<BaseModel子类>` | `06-structured_output.py` |
| 🟠 | `thread_id` vs `config` | thread_id 区分不同对话线程，同一线程保持上下文连续性 | `{"configurable": {"thread_id": "1"}}` | `01, 02` |

## 🛠 代码实操
| 文件 | 做了什么 | 核心步骤（每步用 → 连接） |
|------|----------|---------------------------|
| `01-InMemorySave.py` | Agent 内存记忆 + 多线程对话 | (1) 创建 LLM → (2) `create_agent(checkpointer=InMemorySaver())` → (3) 不同 thread_id 发起对话 → (4) 同一 thread_id 下 Agent 记住之前的问题 |
| `02-mysql-memory.py` | Agent 持久化记忆（MySQL） | (1) 拼接 MySQL URI → (2) `PyMySQLSaver.from_conn_string(DB_URI)` + `checkpointer.setup()` 建表 → (3) 创建 agent 并传入 checkpointer → (4) 同一 config 下多轮对话验证记忆 |
| `03-indexes_loader.py` | 对比两种文档加载器 | (1) `UnstructuredLoader` 加载并自动分区 → (2) `TextLoader` 加载整文件 → (3) 对比 `len(docs)` 和返回格式差异 |
| `04-indexes_splitter.py` | 对比两种文本分割器 | (1) `CharacterTextSplitter(separator=" ", chunk_size=5)` 按空格分割 → (2) `split_text()` 返回字符串列表 → (3) `create_documents()` 返回 Document 列表 → (4) 用长文本对比 `RecursiveCharacterTextSplitter` 和 `CharacterTextSplitter` 的切割质量 |
| `05-indexes_vector_store.py` | 完整 RAG 检索管线 | (1) 读取 pku.txt → (2) `CharacterTextSplitter(chunk_size=100, overlap=20)` 切分 → (3) `DashScopeEmbeddings` 向量化 → (4) `Chroma.from_texts(persist_directory=...)` 持久化存储 → (5) `similarity_search` 检索 → (6) `as_retriever(k=2)` 包装为检索器 |
| `06-structured_output.py` | LLM 结构化信息抽取 | (1) 定义 `PersonInfo(BaseModel)` 含 name/age/city → (2) `create_agent(response_format=PersonInfo)` → (3) 输入自由文本 → (4) `response['structured_response']` 提取结构化字段 |

## ⚠️ 注意事项
| 标记 | 注意点 | 说明 | 文件 |
|------|--------|------|------|
| 🔴重点 | `thread_id` 是对话记忆的关键 | 同一 thread_id 共享上下文（Agent 记得之前说了什么），不同 thread_id 完全隔离 | `01, 02` |
| 🟠易混淆 | `InMemorySaver` vs `PyMySQLSaver` 适用场景 | InMemorySaver 开发测试用（重启丢失），PyMySQLSaver 生产环境用（持久化）；API 相同可无缝切换 | `01, 02` |
| 🔴重点 | `chunk_overlap` 的作用 | overlap 让相邻 chunk 有重叠内容，避免关键信息被切在 chunk 边界导致检索不到；典型值 chunk_size 的 10%~20% | `04` |
| 🟡难点 | `RecursiveCharacterTextSplitter` 优于 `CharacterTextSplitter` | Recursive 版按 `\n\n` → `\n` → 空格 → 字符 的优先级逐级切割，尽量保持段落/句子完整；Character 版直接按分隔符切，可能断句 | `04` |
| 🟠易混淆 | `split_text()` vs `create_documents()` | 前者返回 `List[str]`，后者返回 `List[Document]`（含 metadata）；进向量库用 Documents | `04` |
| 🔴重点 | `persist_directory` 必须设置才能持久化 | 不设这个参数 Chroma 默认存内存，重启丢失；`Chroma.from_texts(persist_directory="outputs/")` 才能落盘 | `05` |
| 🟠易混淆 | `similarity_search` vs `as_retriever` | 前者直接用，后者返回 Retriever 对象方便集成 LangChain Chain；功能等价，`as_retriever` 是更"工程化"的写法 | `05` |
| 🟡难点 | Pydantic `Field(description=...)` 的重要性 | 这个 description 会传给 LLM 作为 prompt 的一部分，告诉 LLM"这个字段是什么含义"，写清楚能大幅提高抽取准确率 | `06` |
| 🔴重点 | `UnstructuredLoader` 自动识别文档结构 | 不像 `TextLoader` 整文件读入，Unstructured 会自动按标题、段落、表格等语义单元分割 | `03` |

## 🐛 常见报错与排查
| 报错信息（关键部分） | 原因 | 排查步骤 | 涉及文件 |
|---------------------|------|---------|---------|
| `sqlalchemy.exc.OperationalError: (pymysql.err.OperationalError) (1045, "Access denied")` | MySQL 用户名或密码错误 | 1. 确认 MySQL 服务在运行 2. `mysql -u root -p` 验证密码 3. 检查 DB_URI 中的密码是否和 MySQL 一致 | `02` |
| `pymysql.err.OperationalError: (1049, "Unknown database 'db_hw'")` | MySQL 中不存在该数据库 | 1. 登录 MySQL 2. `CREATE DATABASE db_hw CHARACTER SET utf8mb4;` 手动建库 3. 或检查 URI 中的库名是否拼错 | `02` |
| `FileNotFoundError: '../data/衣服属性.txt'` | 文件路径相对于脚本运行目录，不是相对于脚本文件 | 1. 确认运行脚本时的 `cwd`（当前工作目录） 2. 使用 `os.path.join(os.path.dirname(__file__), '../data/...')` 或用绝对路径 | `03, 05` |
| `ModuleNotFoundError: No module named 'langchain_unstructured'` | 未安装 Unstructured 相关依赖 | 1. `pip install langchain-unstructured unstructured` 2. `UnstructuredLoader` 属于 `langchain_unstructured` 包，不是 `langchain_community` | `03` |
| `ValueError: chunk_size must be greater than chunk_overlap` | 重叠量不能 ≥ 切分大小 | 1. 确保 `chunk_size > chunk_overlap` 2. 典型设置：`chunk_size=100, chunk_overlap=20` | `04, 05` |

> 💡 排查技巧：遇到报错先看最后一行（最关键的错误类型），再往上追溯调用栈。LangChain 的调用栈通常很深，直接搜 `Error` 关键字定位最快。

## ❓ 课后回顾
- [ ] 用 `InMemorySaver` 和 `PyMySQLSaver` 各跑一遍，对比同 thread_id 下多轮对话 Agent 是否记住上下文
- [ ] 手动调 `chunk_size` 和 `chunk_overlap`（如 50/5 → 200/50），观察 `RecursiveCharacterTextSplitter` 切出的结果差异
- [ ] 把 `05-indexes_vector_store.py` 中的 `similarity_search(query)` 改成不同的 query，对比检索结果的相关性
- [ ] 手写一个 Pydantic BaseModel（如提取"公司名、职位、薪资"），用 `create_agent(response_format=...)` 验证抽取效果
- [ ] 画出 RAG 索引阶段的完整流程图（从文档到向量库），标注每一步用的工具/API

## 📝 今日自测

> ⚠️ 用纸笔或编辑器回答，**不要直接看代码**。完成后回到对应文件自行验证。

### 填空题
1. `RecursiveCharacterTextSplitter(chunk_size=50, chunk_overlap=5)` 切分一段 200 字的文本，如果每个 chunk 都满 50 字（不含 overlap 部分），大约会切出 `____` 个 chunk。
2. `PyMySQLSaver.from_conn_string(DB_URI)` 返回的对象需要用 `____` 语句包裹以自动管理连接生命周期；创建表的方法是 `____`。

### 简答题
3. 为什么 `InMemorySaver` 不用 `with` 语句而 `PyMySQLSaver` 需要？用自己的话解释（≤ 3 句话）。
4. `similarity_search` 和 `as_retriever` 返回的结果有什么本质区别？什么时候用哪个？

### 代码纠错
5. 下面代码有什么问题？如何修改？
```python
from langchain_text_splitters import CharacterTextSplitter

splitter = CharacterTextSplitter(chunk_size=100, chunk_overlap=120)
docs = splitter.split_text("很长的文本内容...")
db = Chroma.from_texts(docs, embeddings)
```

> ✅ 全部答对即可进入下一课。有卡住的地方回到对应文件复习。

## 🎯 今日面试题

---

**第 1 题：RAG 的索引阶段包含哪些步骤？每个步骤的作用是什么？**

> 💬 面试话术：RAG 全称是检索增强生成，它的核心在于索引和检索两个阶段。先说索引——就是把私有知识变成可检索的向量……

📝 **参考答案：**

RAG 索引阶段包含 4 个核心步骤：

1. **文档加载（Load）**：从各种数据源（txt、PDF、网页、数据库）把文档读进来。根据文档格式选择不同的 Loader，比如纯文本用 `TextLoader`，复杂格式用 `UnstructuredLoader`。

2. **文本分割（Split）**：把长文档切成固定大小的 chunk。这一步非常关键——chunk 太大检索不精准，太小丢失上下文。常用 `RecursiveCharacterTextSplitter`，按 `\n\n` → `\n` → 空格 → 字符 的优先级递归切割，配合 `chunk_overlap` 保证关键信息不落在边界。典型参数：`chunk_size=500~1000`，`chunk_overlap=50~100`。

3. **向量化（Embed）**：用 Embedding 模型（如 `text-embedding-v3`、`text-embedding-ada-002`）把每个 chunk 转成高维向量（768 维或 1536 维）。相似的文本在向量空间中距离近，这就是检索的数学基础。

4. **向量存储（Store）**：把向量和原始文本一起存入向量数据库（Chroma、Milvus、Pinecone 等），并建立索引（如 HNSW、IVF）加速检索。

索引阶段是一次性的离线任务，检索阶段（Query → Embed → Search → Rerank）是线上实时任务。

---

**第 2 题：LangGraph Agent 的 InMemorySaver 和 PyMySQLSaver 有什么区别？什么场景用哪个？**

> 💬 面试话术：两者都是 LangGraph 的 checkpoint 机制，用来保存 Agent 的对话状态。选型的核心考量是"持久化需求"……

📝 **参考答案：**

| 维度 | InMemorySaver | PyMySQLSaver |
|------|--------------|--------------|
| **存储位置** | 内存（Python dict） | MySQL 数据库 |
| **生命周期** | 进程结束即丢失 | 永久持久化 |
| **性能** | 极快（纯内存读写） | 有网络/磁盘 I/O 开销 |
| **适用场景** | 开发调试、单次会话、原型验证 | 生产环境、需要跨进程/跨重启保留对话历史 |
| **并发支持** | 不支持（单进程） | 支持（多进程共享 MySQL） |
| **API 接口** | `checkpointer=InMemorySaver()` | `with PyMySQLSaver.from_conn_string(uri) as checkpointer:` |
| **管理成本** | 零配置 | 需要安装 MySQL、建库、管理密码 |

**关键机制**：两者都通过 `thread_id` 区分对话线程。同一 `thread_id` 下的多轮对话共享上下文（Agent 知道"我刚才问过什么"），不同 `thread_id` 完全隔离。

**面试加分**：提到 LangGraph 的 checkpoint 机制不仅存对话历史，还存**图执行状态**（当前在哪个节点、中间结果），支持从任意节点恢复执行。

---

**第 3 题：如何让 LLM 输出结构化的 JSON 而不是自由文本？Pydantic 在其中的作用是什么？**

> 💬 面试话术：传统做法是在 prompt 里写"请用 JSON 格式输出"然后靠正则解析，但这很脆弱。现代做法是用 Pydantic 定义 schema，让 LLM 直接输出符合 schema 的结构化数据……

📝 **参考答案：**

**方案演进：**

```
第一代：Prompt 工程 → 不可靠，LLM 可能输出多余文字
第二代：JSON Mode（如 OpenAI 的 response_format={"type": "json_object"}） → 保证是合法 JSON，但不能保证字段/类型正确
第三代：Structured Output / Function Calling → 用 Schema 约束输出结构
```

**LangGraph + Pydantic 实现（06 文件的方式）：**

```python
from pydantic import BaseModel, Field
from langchain.agents import create_agent

# 1. 定义期望的输出结构
class PersonInfo(BaseModel):
    name: str = Field(description="姓名")
    age: str = Field(description="年龄")
    city: Optional[str] = Field(default=None, description="居住城市")

# 2. 创建 agent 时绑定 schema
agent = create_agent(model=llm, response_format=PersonInfo)

# 3. LLM 自动按 schema 输出
response = agent.invoke({"messages": [{"role": "user", "content": "我叫万嘉豪，今年28岁，住在上海"}]})
result = response['structured_response']
print(result.name, result.age, result.city)  # 直接访问字段
```

**Pydantic 的三重作用：**
1. **Schema 定义**：`Field(description=...)` 告诉 LLM 每个字段的含义，这个 description 会作为 prompt 的一部分
2. **类型校验**：`str`、`int`、`Optional[str]` 等类型注解确保输出符合预期
3. **数据访问**：返回的是强类型 Python 对象，IDE 有自动补全，不会 typo

**适用场景**：信息抽取（从简历提取姓名/技能）、结构化搜索（自然语言 → SQL 条件）、表单自动填充等。

---

## 🚀 延伸学习

### 📖 推荐论文
| 论文 | 为什么读 | 与今日的关联 |
|------|---------|-------------|
| Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks (Lewis et al., 2020) | RAG 的开山之作，定义了"检索 + 生成"范式 | 今天 05 文件实现的就是这篇论文的索引阶段 |
| Self-RAG: Learning to Retrieve, Generate, and Critique through Self-Reflection (Asai et al., 2023) | 在 RAG 基础上加入自我反思机制，选择性检索 | 与今天 Agent + RAG 的结合方向直接相关 |

### 🛠 动手项目
搭建一个**个人文档问答系统**：收集你本地的笔记/PDF/文章 → 用 `UnstructuredLoader` 加载 → `RecursiveCharacterTextSplitter` 分割 → `DashScopeEmbeddings` 向量化 → `Chroma` 存储 → 用 `create_agent` + `similarity_search` 搭建一个能回答"我某月学了什么"的问答机器人。建议加上 `streamlit` 做前端界面。

### 📚 下节预告
从文件名编号推断，下一课大概率是 RAG **检索 + 生成阶段**：query 向量化 → 多路召回 → 重排序（Rerank）→ prompt 拼接 → LLM 生成，以及可能涉及不同检索策略的对比实验。

---
> 📝 自动生成 | 分析 6 个文件
