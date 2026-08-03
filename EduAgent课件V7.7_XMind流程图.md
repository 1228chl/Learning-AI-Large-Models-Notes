# EduAgent 课件 V7.7 — 文字版 XMind 思维导图（深度版）

> 共 10 大块，每块展开至技术细节层

---

## 第1章 · 项目简介
### 1.1 项目全景介绍
- **项目背景**
  - 教培机构四大痛点：简历筛选耗时、知识问答重复、试卷批改繁重、模拟面试缺标准
  - 通用 LLM 三大不足：无企业私有知识、无业务流程编排、无工程容错机制
  - 解法：AI 原生教学辅助系统，每个业务一个专用 Agent
- **四大核心 Agent**
  - 简历审查 Agent — 上传 PDF → 结构化提取 → 六维度并行评分 → 问题诊断 → 整体评价 → 持久化
  - RAG 问答系统 — 混合检索 + 意图分类 + 记忆管理 + MCP 工具（Web 搜索兜底）
  - 试卷批改 Agent — 三轨并行（规则引擎/LLM评分/代码评估）+ Human-in-the-Loop 教师确认
  - 模拟面试 Agent — 五阶段状态机驱动 + Think Tool 质量评估 + 多维报告生成
  - 上层编排：Orchestrator 统一路由 + Pipeline 串联（如简历→面试全链路）
- **技术栈全景**
  - 语言/框架：Python 3.11 + LangChain 1.x + LangGraph 1.0 + FastAPI
  - 数据库：PostgreSQL（业务数据）+ Milvus（向量库）
  - 本地模型：BGE-M3（稠密/稀疏双向量）、BGE-Reranker（CrossEncoder 精排）、MiniLM-L6（意图分类）
  - 大模型：DeepSeek（主力）、GLM-4-Flash（兜底）
  - 基础设施：Docker Compose + SQLAlchemy 异步 + Pydantic v2 + SSE
  - 关键约束：**进程内**本地模型（不另起微服务，直接函数调用）
- **分层架构**
  - 前端层（Vue 3）→ Nginx/Vite 代理 → API 网关层（FastAPI）→ Agent 层（LangGraph 图）→ 基础设施层（PG/Milvus/本地模型）
- **交付物**
  - 后端完整系统：4 个独立 Agent + 统一入口 + 前端 Vue 3 集成
  - 可复用的多 Agent 开发方法论（迁移到任何业务场景）
- **课件使用方式**
  - 复刻式教学：逐行写代码、逐步跑通
  - 建议：边看边敲，每章独立可运行
### 1.2 多 Agent 系统核心概念
- **什么是 Agent**
  - 对比：普通 LLM 调用 = 一问一答；Agent = 有感知/记忆/决策/行动/循环的工作流程
  - 四大能力：感知(Perceive) → 记忆(Memory) → 决策(Decide) → 行动(Act) → 可循环/可中断
  - EduAgent 每个 Agent 都满足：如 QA Agent 会判断问题类型→决定检索策略→置信度判断→Web 兜底→记忆压缩
- **Agent 四种形态**
  - 形态一：普通 LLM 调用（无 Agent 特征）
  - 形态二：工作流（人为编排固定步骤，LLM 在部分环节出力 — EduAgent 主要形态）
  - 形态三：单 Agent（LLM 自主决策调工具/循环，灵活但不可控）
  - 形态四：多 Agent（复杂问题拆给专精 Agent + 编排者调度 — EduAgent 采用）
  - EduAgent 选择 = 形态二（受控工作流）+ 形态四（多 Agent 编排）
- **为什么拆四个 Agent**
  - 四个业务**流程形状根本不同**：RAG（检索→判断→生成）、HitL（并行打分→等人→发布）、扇出（抽取→并行评分→汇总）、状态机（多轮推进→评估→报告）
  - 单一全能 Agent 无法兼顾所有流程形状
- **实现框架：LangGraph**
  - 四要素：State（共享数据工单）、Node（函数/读 State 返增量）、Edge（固定边/条件边）、Checkpointer（检查点/持久化）
  - 心智模型：Agent = 图，数据在节点间流动，State 驱动流转
- **编排者 Orchestrator**
  - 职责：理解用户意图 → 路由到正确 Agent
  - 两种模式：单 Agent 直达（纯问答）、多 Agent 串联 Pipeline（简历→面试全链路）
  - 约束：不修改 Agent 内部逻辑，只做分发和结果聚合

---

## 第2章 · 工具预备知识
### 2.1 Python 异步编程速成
- **为什么需要异步**
  - EduAgent 后端多数操作是 I/O 密集型：调 LLM API（几秒~十几秒）、查 PG/Milvus
  - 同步写法：串行等待，总耗时 = 各耗时相加
  - 异步写法：等待重叠，总耗时 ≈ 最慢的那个
  - 类比：咖啡店点三杯——同步是"一杯等完再点下一杯"，异步是"三杯一起下单"
- **协程、async/await 与 asyncio.run**
  - async def 定义协程函数（调用后返回协程对象，不执行）
  - await 等待协程执行完拿结果（只能在 async def 内用）
  - asyncio.run() = 异步世界入口，启动事件循环
  - 关键区别：await asyncio.sleep(1) 让出控制权，time.sleep(1) 死等
  - EduAgent 中 FastAPI 已启动事件循环，接口函数直接 async def
- **asyncio.gather 并发**
  - 同时启动多个协程，一起等待，顺序返回结果列表
  - 总耗时 ≈ 最慢的一个协程
  - EduAgent 应用：启动时并行预热 BGE-M3/BGE-Reranker/MiniLM 三个本地模型；简历六维度并行评分
- **run_in_executor — 在异步里跑同步代码**
  - 同步阻塞函数（如 PDF 解析、本地模型推理）会阻塞事件循环
  - loop.run_in_executor(None, sync_fn) 扔到线程池执行
  - EduAgent 应用：PDF 文本提取（PyMuPDF 同步库）、BGE-M3 嵌入推理
- **后台任务陷阱**
  - create_task() 创建后台任务，但 Task 对象被 GC 回收 → 任务"消失"
  - 解法：必须保留 Task 引用（如存到全局列表）
- **异步上下文管理器 @asynccontextmanager**
  - async with 语法：进入时 await 打开，退出时 await 关闭
  - EduAgent 应用：数据库会话管理、MCP Server 生命周期
- **三个常见坑**
  - 同步里调异步：需要 asyncio.run() 包装
  - 忘记 await：协程未执行，返回 coroutine object
  - 混用同步/异步库：同步库阻塞事件循环
### 2.2 Pydantic 速成
- **Pydantic 是什么**
  - 自动校验外部数据（用户输入/DB 查询/API 返回）
  - EduAgent 两大用途：**LLM 结构化输出 Schema**（最重要）+ 配置/接口参数校验
- **BaseModel 与自动校验**
  - 继承 BaseModel，类型注解声明字段
  - 自动类型校验 + 合理转换（"18" → 18）
  - 不可转换时抛出 ValidationError
- **Field 字段配置**
  - default/default_factory：必填 vs 可选
  - description：字段含义说明（**with_structured_output 的关键**）
  - 坑：列表/字典默认值必须用 default_factory=list，不用 default=[]（避免实例共享）
- **description = 大模型结构化输出关键**
  - with_structured_output 底层把 description 转为 Function Calling 参数说明
  - 描述越清晰，LLM 提取越准确
  - 示例：`Field(description="公司名称，如'北京传智教育'")`
- **嵌套模型与列表**
  - 组合复杂结构：子模型 + list[SubModel] + Optional
  - 示例：`resume: ResumeStructured`（内含 list[EducationItem]、list[ProjectItem] ）
- **model_dump() 转换**
  - Pydantic 对象 → 普通字典（用于 State 存储、JSON 序列化）
  - 注意：State 里存的是 dict 而非 Pydantic 对象，节点间传递需转换
- **Enum + BaseSettings**
  - Enum：固定取值（如面试阶段、题型分类）
  - BaseSettings：从 .env 文件/环境变量读取配置（自动校验）
### 2.3 LangChain 速成
- **LangChain 在项目里的角色**
  - 提供统一 LLM 调用接口（init_chat_model）
  - 消息体系（System/Human/AI）
  - 流式输出（astream）
  - 结构化输出（with_structured_output）— 核心能力
- **init_chat_model 创建模型**
  - LangChain 1.x 新写法，统一接口
  - 参数：model、model_provider、temperature、base_url、api_key
- **消息体系**
  - SystemMessage：系统提示词
  - HumanMessage：用户输入
  - AIMessage：模型回复（含 tool_calls）
- **ainvoke 调用模型**
  - await llm.ainvoke(messages) 异步调用
  - result.content 取文本内容
- **with_structured_output — 核心技能**
  - llm.with_structured_output(PydanticModel, method="function_calling")
  - 调用后 LLM 直接返回 Pydantic 对象（不返回自由文本）
  - 依赖 Pydantic 模型的 description 字段指导 LLM 提取
- **astream 流式输出**
  - 逐 token 返回，用于 SSE 实时展示
  - async for chunk in llm.astream(messages):
- **新版 API 对照表**
  - 禁用：ChatOpenAI()、ChatDeepSeek() 等直接构造
  - 必用：init_chat_model()、with_structured_output()
### 2.4 LangGraph 速成
- **心智模型：Agent = 图**
  - State（贯穿全程的工单）→ Node（读/写工单的工人）→ Edge（决定流向的管道）→ Checkpointer（存档点）
- **第一步：定义 State**
  - TypedDict 定义图状态字段（类型声明）
  - 示例：`class AgentState(TypedDict): question: str; category: str; answer: str`
- **第二步：写节点**
  - 节点函数约定：接收 State → 返回 dict（要更新的字段）
  - 不直接修改 State，返回增量更新，LangGraph 自动合并
  - 真实项目：节点内调 LLM、查知识库，return {"字段": 结果}
- **第三步：搭图、编译、运行**
  - StateGraph(StateType) → add_node("名", 函数) → add_edge(起点, 终点) → compile() → invoke()
  - START/END 是内置特殊起点/终点
- **条件边 add_conditional_edges**
  - 根据 State 字段值走不同分支
  - 路由函数：接收 State → 返回分支名
  - 示例：`{"concept": "answer_concept", "coding": "answer_coding", "chat": "answer_chat"}`
- **记忆：MemorySaver + thread_id**
  - MemorySaver 持久化 State（默认内存中）
  - thread_id 标识多轮对话会话
  - add_messages reducer：自动追加消息到列表，避免覆盖
- **interrupt 与 Command（HitL）**
  - interrupt(value)：图在此处冻结，保存 State，返回
  - Command(resume=decision)：从保存点恢复，继续执行
  - 新 API：编译时不传 interrupt_before，只在节点内调用 interrupt()
- **LangGraph 规范小结**
  - State 驱动、节点纯函数、边定义流向
  - 禁用：直接修改 State 对象、节点内调外部 API 不通过装饰器
### 2.5 FastAPI 速成
- **最小应用**
  - FastAPI() → @app.get("/") → uvicorn.run()
- **Pydantic 接收请求体**
  - POST 请求体自动校验为 Pydantic 模型
- **路径参数与查询参数**
  - /items/{id} 路径参数，?q=xxx 查询参数
- **依赖注入 Depends（核心）**
  - get_db：yield 型依赖，获取 AsyncSession，自动管理事务
  - get_current_user：从 JWT Token 提取用户，校验登录态
  - 在接口参数里声明依赖，FastAPI 自动注入
- **文件上传**
  - UploadFile 类型，异步读取文件内容
- **SSE 流式响应**
  - StreamingResponse(chat_stream(), media_type="text/event-stream")
  - 事件格式：`data: {json}\n\n`
  - 用于大模型逐 token 输出
- **错误处理**
  - HTTPException 抛出标准 HTTP 错误
  - 自定义异常 + 全局异常处理器统一格式
### 2.6 PostgreSQL 实操
- **PG vs MySQL 差异**
  - UUID 主键、JSONB 类型、RETURNING 子句、ON CONFLICT DO UPDATE
- **连接方式**
  - psql 命令行 / PyCharm 数据库工具
- **PG 专属特性（项目用到）**
  - UUID 主键 + uuid-ossp 扩展（避免自增 ID 暴露数据量）
  - RETURNING：INSERT/UPDATE 后直接返回生成的值
  - JSONB：直接存查结构化数据（简历审查结果、面试报告）
  - ON CONFLICT DO UPDATE：Upsert 操作（存在则更新，不存在则插入）
  - CHECK 约束：数据库层面拦截非法值
  - TIMESTAMPTZ + 触发器：自动维护 created_at/updated_at
- **schema 与清空重建**
  - DROP SCHEMA public CASCADE → CREATE SCHEMA public
  - 开发阶段快速重建表结构
### 2.7 SQLAlchemy 异步操作数据库
- **异步连接配置**
  - create_async_engine + AsyncSession
- **text() + 参数化查询**
  - 项目核心写法：直接写 SQL，不用 ORM 模型
  - 参数化：`text("SELECT * FROM users WHERE id = :id")`，传参 `{"id": uid}`
- **完整 CRUD 示例**
  - 执行 SQL、获取结果、事务管理
- **在接口里操作数据库**
  - Depends(get_db) 获取 AsyncSession → 执行查询 → 返回响应

---

## 第3章 · 环境搭建与工程地基
### 3.1 环境与基础设施
- **项目目录骨架**
  - backend/（后端代码）、scripts/（脚本）、frontend/（Vue 前端）、docker-compose.yml
- **Python 环境**
  - conda 创建 Python 3.11 环境
- **依赖安装**
  - pip install -r requirements.txt（含 LangChain/LangGraph/FastAPI/本地模型等）
- **Docker Compose 启动**
  - PostgreSQL（业务数据）+ Milvus（向量库）+ Redis（缓存）
- **环境变量 .env.local**
  - 数据库连接串、DeepSeek API Key、模型路径、JWT Secret
- **Windows 特别说明**
  - Docker Desktop 配置、路径转义、WSL2 支持
- **验证连通性**
  - 测试脚本：PostgreSQL ping、Milvus health check
### 3.2 数据库设计与建表
- **三大贯穿设计**
  - UUID 主键（不暴露数据量、防枚举）
  - 多租户 tenant_id（数据隔离，所有表携带）
  - 时间戳 + 自动更新（created_at/updated_at 触发器）
- **11 张表一览**
  - users：用户/权限/角色
  - knowledge_pending_queue：RAG 低置信度问题入队待补充
  - exams/questions/scoring_points：试卷结构
  - exam_submissions：提交记录（HitL 状态流转字段）
  - exam_reviews：逐题批改结果（JSONB 存详细评分）
  - resume_reviews：简历审查结果（JSONB 存六维度评分）
  - interview_questions/interview_sessions：面试题库与会话
  - qa_sessions：RAG 问答会话历史
- **多租户设计**
  - 所有业务表携带 tenant_id
  - 查询时 WHERE tenant_id = :tid 自动过滤
- **数据库会话依赖**
  - dependencies.py：AsyncSession 工厂 + 依赖注入
- **自动迁移**
  - migrations.py：检查表是否存在，不存在则自动建表（开发期简化方案）
- **完整 SQL 脚本**
  - scripts/init_db.sql：11 张表的完整建表语句
### 3.3 配置、日志与异常体系
- **config.py：BaseSettings 配置管理**
  - 从 .env.local 读取：数据库/模型/API Key/环境标识
  - 类型校验 + 默认值 + 自动转换
- **logger.py：结构化日志**
  - 日志格式：时间戳 + 级别 + 模块名 + 消息
  - 日志级别控制：DEBUG/INFO/WARNING/ERROR
  - 统一日志输出，不上传敏感信息
- **exceptions.py：统一异常体系**
  - AppException 基类 → 具体业务异常（AuthError/NotFound/LLMError/RetryExhausted）
  - 全局异常处理器：捕获所有异常 → 统一 JSON 响应格式
  - 异常分类：可重试异常（网络超时、限流）vs 不可重试（参数错误、认证失败）
### 3.4 LLM Factory：统一大模型工厂
- **为什么需要工厂**
  - 避免配置重复（每处写 base_url/api_key/temperature）
  - 避免重复创建实例（浪费资源）
  - 统一管控（超时、代理、重试开关）
  - 核心约束：**禁止 Agent 代码直接调用 init_chat_model**
- **绕过系统代理的 httpx 客户端**
  - Windows 系统代理/HTTPS_PROXY 被 httpx 默认探测
  - 解法：自定义 httpx.AsyncClient(trust_env=False)
- **Agent 类型 → 模型路由表**
  - 字典映射：{"qa": "deepseek-chat", "resume": "deepseek-chat", ...}
  - 扩展性：想换模型只改这一行
- **get_llm 核心入口**
  - 三件事：校验 agent_type → 按"模型_温度_流式"组合缓存键 → 有缓存直接返回，无缓存新建
  - 相同参数模型只创建一次
- **get_structured_llm**
  - 在 get_llm 基础上绑定 with_structured_output(model, method="function_calling")
  - 返回即结构化对象，无需解析
### 3.5 三层兜底与重试机制
- **三层总览**
  - 第一层：自动重试循环（带超时，最多 3 次）
  - 第二层：Agent 级降级（返回默认字典替代 LLM 结果）
  - 第三层：系统级兜底（友好提示，不崩溃）
- **实现方式：装饰器 @with_retry(agent_type="qa")**
  - 装饰器工厂：三层嵌套函数（接收参数→返回装饰器→包装原函数）
  - 套在任意异步函数上，自动拥有三层兜底
- **异常分类**
  - 可重试：网络超时、LLM 限流、临时服务不可用
  - 不可重试：参数错误、认证失败、非法输入
- **第一层：自动重试循环**
  - for 循环最多跑 3 次（第 0/1/2 次）
  - asyncio.wait_for 给单次调用加 30 秒超时
  - 不可重试异常 → 立即抛出不重试
  - 其他异常 → 记下来，等待(1s/3s)后重试，到上限去降级
- **第二层：Agent 级降级**
  - AgentFallbackHandler 按 agent_type 找对应降级策略
  - 问答：跳过检索直接 LLM 直答
  - 批改：标记教师复核
  - 面试：跳过本轮评估
  - 降级函数返回固定字典（**必须符合 LangGraph 节点约定**）
- **第三层：系统兜底**
  - _system_fallback_response 返回友好提示
  - 确保系统在任何异常下都不崩溃
- **为什么都返回字典**
  - LangGraph 节点约定：接收完整 State → 返回要更新的字段（字典）
  - 降级函数顶替节点工作，必须返回同样结构的字典，否则图类型不匹配崩溃
### 3.6 认证与依赖注入
- **认证流程总览**
  - 用户登录 → 签发 JWT Token → 请求头 Bearer Token → 中间件校验
- **密码安全**
  - bcrypt 哈希（passlib 库），不存明文密码
- **dependencies.py 最终版**
  - get_current_user：从 Authorization 头提取 JWT → 解析 → 查询用户 → 注入
  - get_db：获取 AsyncSession
- **auth.py 登录接口**
  - POST /auth/login：校验用户名密码 → 签发 JWT（含过期时间）
  - JWT 载荷：user_id、tenant_id、role
- **seed_data.py 测试账号**
  - 灌入：管理员/教师/学员 三类测试账号
- **端到端测试**
  - 真正登录一次：获取 Token → 携带 Token 访问受保护接口

---

## 第4章 · 简历审查 Agent
### 4.1 全景与数据流
- **HTTP 视角**
  - 上传简历(POST) → 返回 review_id → 后台异步审查 → 轮询结果(GET)
  - 先返回再审查：避免用户等待 LLM 耗时
- **8 节点流水线**
  - extract_text（PDF 文本提取）→ extract_structured（LLM 结构化提取）→ run_six_dimensions（六维度并行评分）→ diagnose_issues（问题诊断）→ generate_summary（整体评价）→ save_results（持久化）
- **Agent = 图 心智模型**
  - 直线流水线图，无分支/循环，最简范式
### 4.2 State 与数据模型
- **结构化提取模型**
  - ResumeStructured 嵌套：基本信息 + 教育经历(列表) + 工作经历(列表) + 项目经历(列表) + 技能标签
  - 每个子模型 Field(description=...) 指导 LLM 提取
  - default="" / default_factory=list 标记可选字段（LLM 提取不到时用默认值）
- **评审/诊断/评价模型**
  - DimensionScore：维度名(代码填)、权重(代码填)、分数(LLM 填)、理由(LLM 填)
  - IssueList 包装：**with_structured_output 不能返回裸列表**，必须用对象包装
  - ResumeSummary：亮点、核心改进、综合评语、匹配度
- **ResumeState（TypedDict）**
  - 字段按阶段分组：输入(messages/student_id) → 解析(raw_text/page_count) → 结构化(structured) → 评审(dimension_scores/weighted_score) → 诊断(issues) → 评价(summary) → 降级标记
  - State 存 dict 而非 Pydantic 对象（节点间 .model_dump() 转换）
### 4.3 提示词
- **系统提示与提取提示**
  - 简历提取系统提示：定义角色 + 输出格式要求
  - 提取提示：指导 LLM 从纯文本中提取结构化的简历字段
- **六维度评分提示（Rubric 设计）**
  - 每个维度有独立评分提示模板，含 {focus} 占位变量
  - 评分标准定义：优秀(90+)/良好(75-89)/一般(60-74)/较差(<60)
- **诊断/评价/Think 提示**
  - Think 前置推理提示："先分析，再回答"
  - 诊断提示：汇总各维度问题，输出优先级排序的问题清单
  - 评价提示：生成整体评价报告
### 4.4 PDF 解析与结构化提取
- **extract_text 节点**
  - 同步提取函数 _sync_extract_text（PyMuPDF 库）
  - run_in_executor 扔到线程池，不阻塞事件循环
  - 输出：纯文本 + 页数
- **extract_structured 节点**
  - LLM 结构化提取：with_structured_output(ResumeStructured)
  - 输入：纯文本简历 → 输出：结构化 ResumeStructured 对象
  - 降级：LLM 失败时返回空结构
### 4.5 六维度并行评审
- **为什么并行**
  - 6 个维度相互独立，串行 30-60 秒，并行缩短到 5-10 秒
  - asyncio.gather 把耗时从"相加"变成"取最大"
- **六维度定义表 SIX_DIMENSIONS**
  - 技术栈匹配度(0.25)、项目经验深度(0.30)、教育背景(0.10)、工作年限(0.15)、技能完整性(0.10)、综合潜力(0.10)
  - 权重之和 = 1.0，加权综合分天然落在 0-100
- **run_six_dimensions 节点**
  - 三步：① 准备结构化摘要(_build_structured_summary) → ② 并行 6 个维度 → ③ 算加权分
  - 单维度失败不影响其他：try/重试/降级，某维度挂了自己降级为 50 分
  - 降级：_empty_dimension_score 返回 50 分 + "建议人工复核"
- **辅助函数**
  - _build_structured_summary：浓缩简历为几行摘要（省 token + 抓重点）
  - _empty_dimension_score：降级结果模板
### 4.6 问题诊断与整体评价
- **diagnose_issues 节点**
  - 四步：① 汇总各维度原始问题 → ② Think 前置推理（"先想后答"）→ ③ 结构化生成问题清单 → ④ 按优先级排序
  - IssueList 包装：with_structured_output 要求顶层是对象，不能是裸列表
- **generate_summary 节点**
  - 输入：所有维度评分 + 问题清单
  - 输出：亮点、核心改进、综合评语、匹配度评分
  - 降级：LLM 失败时返回模板化评价
### 4.7 持久化与图装配
- **save_results 节点**
  - 写入 PostgreSQL JSONB 列：先 json.dumps 序列化
  - 用 AsyncSessionLocal，不直接用 asyncpg
- **graph.py 装配**
  - StateGraph(ResumeState) → 6 个节点直线串联 → compile()
  - 无分支、无循环，最简直线图
### 4.8 API 接口与端到端
- **upload 上传接口**
  - 后台任务 GC 保护：保留 Task 引用避免被回收
  - 线程本地图（thread-local graph）：每个线程独立图实例
  - 先返回 review_id 再异步审查
- **get_review 轮询查询**
  - GET /resume/{review_id}：查询审查结果
  - 返回：审查中/已完成/失败
- **delete / list**
  - 越权防护：只允许操作自己的数据
  - JSONB 查询：PostgreSQL JSONB 字段查询技巧

---

## 第5章 · RAG 问答系统
### 5.1 全景与架构
- **RAG 是什么**
  - 检索增强生成：知识库检索 + LLM 生成的组合
  - 解决 LLM 知识截止、幻觉、缺乏私有知识的问题
- **在线查询流程图**
  - 用户 → 意图分类 → HyDE/多Query → 混合检索 → 精排 → 生成 → 记忆保存
  - 低置信度分支：Web 搜索兜底 / LLM 直答
- **对比第四章：从直线到分支 + 记忆**
  - 简历：直线流水线（无分支）
  - RAG：分支判断（意图分类/置信度路由）+ 循环（多轮记忆）
- **7 项关键技术**
  - 文档分块、BGE-M3 双向量嵌入、Milvus 向量库、Hybrid 召回、Reranker 精排、意图分类、记忆管理
### 5.2 文档读取
- **LangChain Document 结构**
  - page_content（文本内容）+ metadata（元数据：来源/页码/标题）
- **PDF 加载**
  - PyPDFLoader：逐页加载，保留页码元数据
- **Markdown 加载**
  - TextLoader：加载 md 文件，按标题分割
- **统一加载函数**
  - 根据文件扩展名自动选择加载器
  - 返回 list[Document]
### 5.3 智能分块
- **为什么分块**
  - chunk 大小选择：太小编码冗余，太大丢失精确度
  - 经验值：PDF 512 tokens，Markdown 按标题语义切分
- **PDF 分块**
  - RecursiveCharacterTextSplitter：递归分割（段落→句子→字符）
- **Markdown 分块**
  - 语义切分（按标题/章节）→ 二次切分（超长块再切）
- **两种策略对比**
  - PDF：固定大小，无语义边界
  - Markdown：保留语义边界，质量更高
### 5.4 BGE-M3 嵌入
- **稠密向量 vs 稀疏向量**
  - 稠密(Dense)：语义相似度，理解同义词和语义关联
  - 稀疏(Sparse)：关键词精确匹配，基于词频权重
  - BGE-M3 一个模型同时输出两种向量
- **BGEMEmbedder 类实现**
  - 本地模型加载（FlagEmbedding 库）
  - encode_dense() / encode_sparse() / encode() 三种方法
  - 进程内加载，不另起服务
### 5.5 Milvus 初始化与知识库写入
- **集合设计**
  - Collection Schema：id(UUID)、text(文本)、dense_vector(1024维)、sparse_vector(稀疏)、metadata(JSON)
- **MilvusClient API**
  - create_collection / insert / flush / search / hybrid_search
- **init_milvus.py 初始化脚本**
  - 创建 Collection + 索引参数配置
- **Contextual RAG 增强**
  - 问题：孤立 chunk 丢失"在哪里"的信息
  - 解法：LLM 生成一句定位描述（如"来自第三章 3.2 节关于数据库设计"），拼在 chunk 前面再嵌入
  - 工程实现：在写入前调 LLM 生成上下文描述
- **KnowledgeBaseClient 写入**
  - 封装 Milvus 操作：写入、检索、管理
  - build_knowledge_base.py 完整版：读→分块→嵌入→Contextual RAG→写入
### 5.6 Hybrid 召回与 WeightedRanker
- **为什么混合检索**
  - 纯 Dense：语义好但精确术语匹配弱
  - 纯 Sparse：关键词匹配好但语义理解弱
  - 混合 = 两路互补
- **WeightedRanker vs RRFRanker**
  - RRFRanker：只看排名不看原始分，Dense 和 Sparse 权重相同
  - WeightedRanker：可指定权重比例
  - 本项目选 WeightedRanker(0.7, 0.3)：语义为主，关键词为辅
- **_hybrid_search() 实现**
  - 两路 AnnSearchRequest（dense + sparse）→ hybrid_search → 返回融合结果
  - distance 字段存融合后的分数
### 5.7 重排序 Reranker
- **召回分数 ≠ 回答质量**
  - 向量相似度高不一定与问题相关
  - 需要 CrossEncoder 精排
- **CrossEncoder 精排原理**
  - 输入：(query, chunk) 对 → 输出相关性分数
  - 比向量检索更精确，但计算成本高
  - 适合对 Top-K 召回结果做二次排序
- **BGEReranker 实现**
  - 本地 BGE-Reranker 模型（FlagReranker）
  - 进程内加载，直接函数调用
- **retrieve() Pipeline 完整数据流**
  - Query → 嵌入 → Hybrid 召回(50条) → Reranker 精排(取 Top-3) → 返回
  - 召回 50 条，精排后取 3 条
### 5.8 意图分类器
- **为什么需要意图分类**
  - 不是所有问题都需要检索知识库（通用问题直接 LLM 答）
  - 分类让两类问题走不同路径，各取所长
- **三层分类策略**
  - Layer 0：关键词快速通道（nodes.py 实现）
  - Layer 1：MiniLM 二分类（本节实现）
  - Layer 2：LLM 细分检索策略（nodes.py 实现）
  - 最终分类：SPECIFIC（精确检索）/ VAGUE（模糊/HyDE）/ BROAD（宽泛/多Query）/ GENERAL（闲聊直答）
- **为什么用 MiniLM 本地模型**
  - 每条 Query 都要分类，高频路径
  - MiniLM-L6-v2 仅 22M 参数，推理极快
  - 而 LLM 一次分类调用成本高、延迟大
- **QueryClassifier 实现**
  - 训练与推理统一在一个类里
  - train()：用 datasets + sklearn + Trainer 微调
  - classify()：推理，返回标签 + 置信度
  - 延迟 import：训练库仅在 train() 时加载，推理路径不加载
- **训练数据**
  - 2200 条标注数据（1000 general + 1200 specialized）
  - 阈值 0.85：宁可多走一次 RAG，不能漏掉课程相关问题
### 5.9 记忆管理
- **LangGraph MemorySaver 工作原理**
  - 每次 invoke 自动保存 State
  - thread_id 标识会话，实现跨轮记忆
- **两种记忆控制策略**
  - 滑动窗口：确定性裁剪，保留最近 N 轮对话
  - 摘要压缩：语义保留，LLM 把历史对话压缩成摘要
- **两种策略配合**
  - 先滑动窗口裁剪到 M 轮 → 再对裁剪后的做摘要压缩
  - 长对话既保持记忆又不超 Token 限制
### 5.10 MCP 工具
- **MCP 协议**
  - Model Context Protocol：Anthropic 制定的 AI 工具调用标准协议
  - 类比 USB-C：统一接口，Server 实现，Client 调用
  - 通信格式：JSON-RPC 2.0 over HTTP
  - 响应嵌套：result.content[0].text 内含 JSON 字符串
- **FastMCP 封装**
  - stateless_http=True：每次请求自包含，无需 session
  - json_response=True：自动序列化为 JSON
  - @mcp.tool()：函数签名自动生成 JSON Schema
- **知识库 MCP Server**
  - 封装 retrieve() Pipeline，对外暴露工具
  - retrieve() 用 run_in_executor（BGE-M3 编码和 CrossEncoder 是同步 CPU 密集）
- **Web 搜索 MCP Server**
  - 两个后端：Tavily（质量高，有配额）和 DuckDuckGo（免费）
  - asyncio.to_thread 跑同步搜索库
- **MCP Client**
  - 通用客户端，连接 MCP Server
  - 调用工具：解析 JSON-RPC 响应
- **挂载到 FastAPI**
  - 两个 MCP Server 挂载在 FastAPI 主进程
  - 集成部署，统一管理
### 5.11 State 与 Prompts
- **QAState 五组字段**
  - 输入：messages、question
  - 分类：query_type、confidence
  - 检索：retrieved_docs、reranked_docs
  - 生成：answer、sources
  - 记忆：memory_summary、session_id
- **七个 Prompt 模板**
  - 分类 Prompt、HyDE Prompt、Multi-Query Prompt、RAG 生成 Prompt、Web 搜索 Prompt、LLM 直答 Prompt、记忆压缩 Prompt
  - 每个 Prompt 的触发场景和占位变量
### 5.12 节点①：分类、HyDE、Multi-Query
- **联网指令识别**
  - 含"实时/最新/今天"等关键词 → 直接走 Web 搜索
- **三层分类架构**
  - classify_query_node：LLM 判断 query_type
  - 输出：SPECIFIC / VAGUE / BROAD / GENERAL
- **HyDE 生成**
  - hyde_generate_node：VAGUE 分支，LLM 生成假设文档
  - 假设文档代替原始 Query 做检索（提高模糊查询的召回率）
- **Multi-Query 重写**
  - multi_query_rewrite_node：BROAD 分支，LLM 生成多个子问题
  - 多个子问题分别检索后合并结果
### 5.13 节点②：检索与精排
- **三条检索路径**
  - SPECIFIC → 直接检索（原始 Query）
  - VAGUE → HyDE 生成 → 检索（假设文档）
  - BROAD → Multi-Query → 多条检索 → 合并去重
- **retrieve_node 实现**
  - run_in_executor（BGE 编码是同步的）
  - 空召回早退：检索结果为空时直接标记，不走精排
  - BROAD 去重：content[:100] 前 100 字符去重
### 5.14 节点③：生成、Web 兜底、存记忆
- **generate_rag_node**
  - 高置信度分支：检索结果 + Query → LLM 生成
  - 附引用来源
- **web_search_node**
  - 低置信度分支：Web 搜索 + Query → LLM 生成
  - 通过 MCP 调 Web 搜索
- **generate_direct_node**
  - 低置信度 LLM 直答：不依赖检索
- **generate_general_node**
  - GENERAL 分支：闲聊/通用问题直接回答
- **enqueue_pending_node**
  - 低置信度问题写入 knowledge_pending_queue
  - 后续人工补充知识库
- **save_memory_node**
  - 对话摘要压缩 → 保存到 MemorySaver
### 5.15 图装配
- **三个路由函数**
  - classify_route：根据 query_type 走不同分支
  - confidence_route：根据置信度走直答/检索/Web
  - memory_route：是否保存记忆
- **build_qa_graph() 完整图**
  - 分支结构 + 循环（多轮记忆）
  - 比简历直线图复杂得多
### 5.16 HTTP 接口
- **POST /chat**
  - 同步接口：接收问题 → 返回答案
- **POST /chat/stream**
  - SSE 流式接口：逐 token 输出
  - 事件格式：`data: {content: "..."}\n\n`
  - on_chain_end 防御判断：避免重复结束事件
- **GET /sessions/{session_id}/history**
  - 查询历史对话记录
### 5.17 端到端测试
- **四条分类路径验证**
  - SPECIFIC / VAGUE / BROAD / GENERAL 各走一路
- **低置信度 + Web 兜底**
  - 故意问知识库没有的问题，验证 Web 搜索触发
- **多轮记忆验证**
  - 第二轮问"刚才我说了什么？"验证记忆生效
- **SSE 流式验证**

---

## 第6章 · 试卷批改 Agent
### 6.1 全景与架构
- **为什么需要 HitL**
  - LLM 批改不可完全信任（特别是主观题）
  - 教师最终确认：允许修改/驳回/通过
  - 关键设计：interrupt() 冻结图 → 教师审核 → Command() 恢复
- **完整数据流**
  - 学员提交 Word → 解析 → 加载元数据 → 三轨并行批改 → 组装汇总 → notify 教师 → HitL 暂停 → 教师审核 → 合并决策 → 发布成绩
- **三轨并行设计**
  - 第一轨：客观题规则引擎（选择题/判断题，精确比对，无需 LLM）
  - 第二轨：简答题 LLM 评分（Think Tool 推理 + 结构化评分）
  - 第三轨：代码题 LLM 评估（多维度评分）
  - 三轨互不依赖，asyncio.gather 并行
- **HitL 机制**
  - interrupt(value) 暂停图执行 → State 保存到 MemorySaver
  - 教师通过 API 查询 pending 列表 → 审核 → Command(resume=decision) 恢复
  - 新 API：编译时不传 interrupt_before，节点内调用 interrupt()
- **涉及的表**
  - exams：试卷主表、questions：题目表、scoring_points：评分点表
  - exam_submissions：提交记录（含 HitL 状态）、exam_reviews：批改结果
### 6.2 State 与 Prompts
- **五个 Pydantic 子模型**
  - ObjectiveResult（客观题结果）、SubjectiveResult（简答题结果）、CodingResult（代码题结果）
  - AggregateResult（汇总）、WeakPointAnalysis（薄弱点）
- **ExamState**
  - 输入：submission_id、file_path、messages
  - 解析：parsed_questions、question_meta
  - 三轨：objective_results、subjective_results、coding_results
  - HitL：teacher_decision、publish_status
- **四个 Prompt 模板**
  - 简答题批改 Prompt：逐评分点评分
  - Think Tool Prompt：批改前先推理分析
  - 代码质量评估 Prompt：多维度评价
  - 知识薄弱点分析 Prompt：提取共性薄弱点
### 6.3 Word 文件解析
- **Word 试卷模板约定**
  - 题型标记约定（如 "一、单选题" "二、简答题"）
  - 学员答案填写位置约定
- **parse_word_node 实现**
  - python-docx 解析 Word 文档
  - 按题型分类提取题目和答案
  - 学生答案提取：从约定位置读取
### 6.4 题目元数据加载
- **load_questions_meta_node**
  - 从数据库加载标准答案、评分点
  - 动态 IN 子句：`WHERE qid = ANY(:qids::uuid[])`
  - 注意：不用 ANY(:qids::uuid[]) 直接传参，需动态构造
### 6.5 三轨①：客观题规则引擎
- **批改逻辑**
  - 单选/判断：直接字符串比对
  - 多选：排序后字符串比对
- **答案标准化 _normalize_answer**
  - 三步：大写 → 去空格/逗号 → 排序
  - 排序使 "BD" 和 "DB" 视为等价
- **needs_review=False**
  - 客观题结果确定，不进入教师必看列表
### 6.6 三轨②：简答题 LLM 评分
- **两步批改流程**
  - Step 1：Think Tool 推理（先分析回答的优缺点）
  - Step 2：结构化评分（按评分点逐一打分）
- **_review_one_subjective**
  - 单题批改：LLM 读评分点 → 逐点对比学生答案 → 打分
- **_run_subjective_track**
  - 分组并行：每 3 题一组，asyncio.gather 并行
  - 避免同时提交太多 LLM 请求
### 6.7 三轨③：代码题评估
- **评估维度**
  - 正确性、可读性、效率、健壮性
  - LLM 逐维度评分
- **完整实现**
  - 读代码题答案 → 调 LLM 评估 → 输出结构化评分
### 6.8 三轨组装与汇总
- **run_three_tracks_node**
  - 三轨结果合并，统一数据结构
- **aggregate_results_node**
  - 计算总分、各题型得分率
  - 每道题结构相同，可直接合并排序
- **analyze_weak_points_node**
  - LLM 分析共性薄弱点
  - 输出知识薄弱点清单
### 6.9 Human-in-the-Loop
- **interrupt() 工作原理**
  - 执行到 interrupt(value) → LangGraph 抛 Interrupt 异常
  - ainvoke 捕获异常，保存 State 到 MemorySaver
  - 图进入"暂停"，State 包含 next=["teacher_review"]
  - 后续 Command(resume=decision) 恢复执行
- **notify_teacher_node**
  - 更新数据库 exam_submissions 状态为 pending_review
  - 教师轮询待审核列表
- **teacher_review_node**
  - interrupt(display_data) 暂停，等待教师审核
  - display_data 暴露给教师端查看的数据
- **恢复流程**
  - Command(resume=decision) 加载 State → 从中断点继续
  - decision 包含：逐题确认/修改/驳回
### 6.10 合并决策与发布
- **apply_teacher_decision_node**
  - 合并教师修改：覆盖/修改/保持原批改结果
- **publish_results_node**
  - 更新状态为 published
  - 学员端可查看最终成绩
### 6.11 图装配
- **图结构**
  - 解析 → 加载元数据 → 三轨并行 → 组装 → HitL → 决策 → 发布
  - 有分支（三轨并行）+ 暂停点（HitL）
- **端到端测试**
  - 一个 asyncio.run() 跑完整流程
  - 测试 HitL 中断和恢复
### 6.12 HTTP 接口
- **POST /submit**
  - 学员提交 Word 试卷
- **学员查询接口**
  - GET /submissions/{id}：查询批改结果
- **教师接口**
  - GET /pending-reviews：待审核列表
  - GET /submissions/{id}/review：查看详细批改
- **POST /confirm**
  - 教师确认审核 → Command(resume=decision) 恢复图
### 6.13 端到端测试
- **准备测试 Word 文件**
  - 包含各题型的模板试卷
- **modify 路径验证**
  - 教师修改部分评分后确认
- **后端日志关键字**
  - HitL 中断/恢复的关键日志

---

## 第7章 · 模拟面试 Agent
### 7.0 架构概览
- **一场完整面试的能力**
  - 破冰热身 → 技术基础考察 → 项目深挖 → 反问收尾 → 报告生成
  - 五维度评估报告：技术基础、项目经验、沟通表达、逻辑思维、综合潜力
- **双轨考察**
  - 基础技术题：考察知识广度（八股/原理）
  - 项目深挖题：考察经验深度（STAR 法则追问）
- **五阶段状态机**
  - WARMUP → TECH_BASE → PROJECT → CLOSING → REPORT
  - 为什么不用普通多轮对话：状态不可控，无法保证面试完整性
  - 每个阶段有 MIN_TURNS（最少轮数）和 MAX_TURNS（最大轮数）
- **图拓扑：7 个节点**
  - load_context → check_stage → evaluate_answer → generate_response → save_report → save_memory
  - 两条路径：单轮对话循环 vs 报告生成结束
- **与简历 Agent 数据接口**
  - Pipeline 中简历审查结果 → 面试上下文
  - 面试官"看过"简历，能问针对性问题
- **五维度评估报告**
  - 三层结构：总体评分 → 各维度评分 → 各细项评价
### 7.1 全景
- **什么是状态机**
  - 有限状态、确定性转移
  - 每个阶段有明确的进入条件和退出条件
- **四个面试阶段**
  - WARMUP：自我介绍破冰（1 轮）
  - TECH_BASE：技术基础考察（6-10 轮，覆盖各技术栈）
  - PROJECT：项目深挖（4-8 轮，STAR 追问）
  - CLOSING：反问收尾（1-2 轮）
- **多轮对话 State 保持**
  - MemorySaver 跨轮持久化
  - thread_id 标识每个面试会话
- **涉及的表**
  - interview_sessions：面试会话主表
  - interview_questions：面试题库
  - resume_reviews：简历审查结果（只读引用）
### 7.2 State 与枚举
- **两个枚举**
  - InterviewStage：WARMUP / TECH_BASE / PROJECT / CLOSING / REPORT / FINISHED
  - QuestionType：TECH_BASE（基础题）/ PROJECT_DEEP（项目题）
- **报告模型（三层结构）**
  - InterviewReport → dimensions: list[DimensionReport] → items: list[ScoreItem]
  - 总体评分 + 各维度评分 + 细项评语
- **InterviewState 字段**
  - 会话上下文：session_id、student_id、resume_id
  - 阶段控制：current_stage、stage_turn_count、total_turn_count
  - 当前题目：current_question、followup_count
  - 对话历史：messages（add_messages reducer）
  - 评估：answer_quality、evaluation_detail
  - 报告：report、report_raw
### 7.3 Prompts 全解析
- **系统提示词**
  - 定义面试官角色、面试风格、行为准则
- **动态出题 Prompt**
  - 题库为空时的备选用题
  - 根据简历技术栈定制题目
- **各阶段 Prompt**
  - WARMUP：引导自我介绍
  - WARMUP→TECH_BASE 过渡：自然过渡提示
  - TECH_BASE：技术题提问 + 追问策略
  - PROJECT：项目深挖（STAR 法则追问）
  - CLOSING：反问环节引导
- **回答质量评估 Prompt（Think Tool）**
  - 两步推理：先分析 → 再打标签
- **报告生成 Prompt**
  - 全量对话历史 → 结构化五维度报告
### 7.4 会话初始化与上下文加载
- **load_context_node**
  - 首轮：从数据库加载简历、题库、历史会话
  - 非首轮：加载历史对话（MemorySaver）
- **LLM 动态出题**
  - 当题库中没有合适的题目时，LLM 根据简历生成
  - 动态出题 + 题库题目合并
- **并行查询**
  - asyncio.gather 同时加载简历、题库、历史
  - 减少串行等待
- **题库合并策略**
  - 数据库题目优先 → LLM 动态出题补充
  - 去重：相同技术栈的题目不重复
### 7.5 阶段推进与状态机控制
- **check_stage_node**
  - 核心逻辑：判断是否需要推进到下一阶段
- **双阈值设计**
  - MIN_TURNS：防止过早推进（TECH_BASE 最少 6 轮）
  - MAX_TURNS：防止卡死（到达上限强制切换）
- **推进逻辑决策流**
  - 轮数 < MIN_TURNS → 停留
  - 轮数 ≥ MIN_TURNS 且条件满足 → 推进
  - 轮数 ≥ MAX_TURNS → 强制推进
  - 推进时重置：stage_turn_count=0、followup_count=0、current_question=None
- **强制终止**
  - 总轮数超限或关键词触发 → 直接跳到 FINISHED
  - 跳过 CLOSING 阶段
- **职责分离**
  - check_stage 只做阶段判断+推进
  - turn_count 增减由 evaluate_answer 负责
  - 避免两个节点竞争同一字段
### 7.6 回答质量评估
- **evaluate_answer_node 两个职责**
  - 评估回答质量：打 AnswerQuality 标签
  - 维护轮次计数：total_turn_count += 1，stage_turn_count += 1
- **跳过评估的情况**
  - 首轮跳过（系统消息，非真实回答）
  - WARMUP 跳过（自我介绍无需评估质量）
  - 两种情况都**照常增加计数**
- **未作答快速路径**
  - 学员明确说"不知道" → 直接 NO_ANSWER，不调 LLM
- **Think Tool 两步评估**
  - 第一步：自由推理（reasoning_trace，不约束输出格式）
  - 第二步：打标签（严格输出 EXCELLENT/ADEQUATE/WEAK/NO_ANSWER）
  - 第一步的推理追加到第二步 Prompt，让 LLM 有依据
- **质量标签解析**
  - in 匹配（兼容空格/换行），兜底到 ADEQUATE
  - 保守策略：模糊情况视为基本及格
### 7.7 面试官回应生成（上）
- **分派主函数**
  - 根据 current_stage 路由到不同生成函数
- **WARMUP 回应**
  - 引导式、鼓励式回应
  - 完成自我介绍后自然过渡到技术环节
- **TECH_BASE 回应**
  - 正误判断 + 知识补充 + 追问
  - 根据质量标签决定：优秀→深入追问，一般→换题，差→讲解
### 7.8 面试官回应生成（下）
- **PROJECT 回应**
  - STAR 法则追问：Situation → Task → Action → Result
  - 根据简历项目经验定制追问
  - 深入挖掘技术细节和难点
- **CLOSING 回应**
  - 反问环节：角色期望、团队技术栈、成长路径
  - 面试总结
- **滑动窗口大小选择**
  - 对话历史裁剪策略，避免超 Token 限制
  - 保留最近 N 轮对话
### 7.9 面试报告生成
- **generate_report_node**
  - 触发条件：CLOSING 完成后或强制终止
  - 五维度 LLM 评估
- **对话历史拼接策略**
  - 全量拼接（可能超 Token）vs 摘要拼接
  - 根据对话长度选取策略
- **结构化输出与重试**
  - with_structured_output(InterviewReport)
  - 失败时重试 3 次
### 7.10 结果持久化与记忆保存
- **save_report_node**
  - 写入面试报告到 interview_sessions 表
  - JSONB 列存储完整报告
- **save_memory_node**
  - 对话摘要压缩保存
  - UPSERT 必要性：避免重复写入
  - 对话摘要压缩机制：LLM 压缩长对话为摘要
### 7.11 图装配
- **完整图拓扑**
  - 7 个节点 + 条件路由（阶段路由、结束判断）
  - 循环结构：面试是多轮的，图中有循环边
- **checkpointer 作用**
  - 多轮对话状态保持
  - 面试中断后可恢复
- **与其他 Agent 图对比**
  - 简历：直线 → RAG：分支 → 面试：循环（多轮）
### 7.12 HTTP 接口
- **POST /sessions**
  - 创建面试会话（首轮请求）
  - 触发 load_context 初始化
- **POST /sessions/{id}/chat**
  - 发送消息，触发下一轮面试
  - 返回面试官回应
- **GET /sessions/{id}/report**
  - 查询完整面试报告
- **GET /sessions**
  - 历史面试列表
- **POST /sessions/{id}/chat/stream**
  - SSE 流式对话接口
  - 事件格式：`data: {type: "token"|"stage"|"done", content: "..."}\n\n`
### 7.13 端到端测试
- **正常流程测试**
  - 完整五阶段面试流程
  - 验证阶段推进、质量评估、报告生成
- **SSE 流式验证**
  - 逐 token 输出验证
- **后端日志关键字**

---

## 第8章 · 系统集成
### 8.1 全景
- **前四章造了什么**
  - 四个独立 Agent，各自有图/State/接口/数据库
  - 简历(直线)、RAG(分支+记忆)、批改(并行+HitL)、面试(循环状态机)
- **两个核心角色**
  - Orchestrator（编排者）：统一调度、单 Agent 直达 / 多 Agent Pipeline
  - 统一入口：前置拦截 + LLM 路由 + SSE 分发
- **统一请求生命周期**
  - 用户请求 → 前置拦截(零Token回复) → LLM 意图路由 → Orchestrator 分发 → Agent 执行 → SSE 响应
- **两种执行模式**
  - 单 Agent 直达：纯问答场景
  - 多 Agent 串联 Pipeline：求职全链路（简历审查 → 模拟面试）
- **为什么意图路由用 LLM**
  - 比本地分类模型更灵活，可处理复杂语义
  - 无需维护训练数据，成本可接受（一次路由请求）
### 8.2 Orchestrator：Schema 与单 Agent 直达
- **两个枚举**
  - AgentType：RESUME / QA / EXAM / INTERVIEW
  - ExecutionMode：SINGLE / PIPELINE
- **三个统一 Schema**
  - AgentRequest：agent_type、query、context、session_id
  - AgentResponse：content、structured、agent_type、success
  - AgentError：error_code、message、details
- **Orchestrator 初始化**
  - 图懒加载：用到时才 build 对应 Agent 图，启动时不加载全部
  - 预置两条 Pipeline 定义
- **handle：统一请求入口**
  - 根据 AgentType 路由到对应 Agent
  - 创建 session_id
- **_run_single_agent**
  - 单 Agent 直达：直接调对应 Agent 的 graph.ainvoke()
  - 返回统一 AgentResponse 格式
### 8.3 Orchestrator：多 Agent 串联 Pipeline
- **为什么需要串联**
  - 求职全链路：简历审查(78分) → 模拟面试(76分，基于简历结果)
  - 前序结构化输出自动注入后序上下文
- **_run_pipeline 实现**
  - 按序执行多个 Agent
  - 上下文传递：前一步 structured → {agent}_result → 后一步 context
  - 失败处理：某步失败则 break，**保留已完成步骤的结果**
  - 每步独立 session_id：session_id_step{N}，避免 MemorySaver 冲突
- **_aggregate_pipeline 聚合**
  - 文本：用 --- 分隔线拼接
  - 结构化：按 step_1/step_2 分层保留
  - 成功标志：取"任一步成功"
  - 降级标志：取"任一步降级"
- **模块级单例 get_orchestrator**
  - 全应用共享一个编排器
  - 懒加载的图缓存只 build 一次
### 8.4 统一入口：前置拦截与 LLM 路由
- **规则前置拦截**
  - 五类零 Token 回复：问候、感谢、道别、身份询问、功能询问
  - 精确匹配（整句相等）："谢谢"命中，"谢谢你"不命中
  - 正则匹配（身份/功能）：说法多变，用正则覆盖
  - 省 Token 又快：不调 LLM、不路由
- **LLM 意图路由**
  - DeepSeek 直接分类，无本地模型
  - 6 个 label：qa / resume / exam / interview / pipeline / clarify
  - 映射表：label → AgentType + ExecutionMode
  - confidence=0.85：纯展示占位（旧版 MiniLM 有真实置信度，LLM 路由后无此数）
  - 引导 vs 直达：exam/resume/interview 需专门交互 → 推引导卡片；qa 纯文本 → 直接流式
### 8.5 统一入口：SSE 分发
- **unified_chat_stream 主流程**
  - 请求模型 + SSE 小工具
- **四条分发分支**
  - 单 Agent 同步、单 Agent 流式
  - Pipeline 同步、Pipeline 流式
- **_stream_qa_agent**
  - 在统一入口里流式跑 QA Agent
  - SSE 事件格式标准化
### 8.6 路由聚合与 main 集成
- **api/router.py**
  - 六个 router 聚合：auth / resume / qa / exam / interview / unified
- **完整路由表**
  - 所有 API 端点和对应的 Agent
- **main.py 应用装配**
  - lifespan：启动时预热本地模型，关闭时清理资源
  - CORS 配置、路由挂载、health 端点
  - 零件来源全景：每个模块来自哪一章（复用关系图）
### 8.7 端到端测试
- **统一入口全分支测试**
  - 问候（前置拦截）、QA 问答（单 Agent）、求职（Pipeline）
- **SSE 事件消费详解**
  - 前端如何消费 SSE 事件
- **后端日志关键字**

---

## 第9章 · 前端集成扩展
### 9.1 前端集成全景
- **本章定位**
  - 提供一个 Vue 3 前端，可视化展示后端能力
  - 不深入前端开发，重点在前后端联调
- **技术栈**
  - Vue 3 + Vite + Element Plus + Axios
- **Vite 代理**
  - 开发时跨域代理配置：Vite 代理转发 /api 到后端
- **SSE 绕过代理**
  - 流式输出直接连接后端 SSE 端点（Vite 代理不处理 SSE）
- **JWT 鉴权流程**
  - 登录 → Token 存 localStorage → Axios 拦截器自动携带
### 9.2 四大功能页面解读
- **登录页**
  - LoginView.vue：用户名密码 → JWT 登录
- **Dashboard**
  - DashboardView.vue：系统概览、各 Agent 入口
- **智能问答**
  - QAChatView.vue：RAG 问答交互界面，SSE 流式显示
- **试卷批改**
  - 提交 Word 试卷、查看批改结果、教师审核界面
- **简历审查**
  - 上传 PDF 简历、查看六维度评分雷达图
- **模拟面试**
  - 面试对话界面、五维度报告展示
### 9.3 完整系统启动与联调验证
- **前提条件**
  - 后端所有服务启动（PG + Milvus + FastAPI）
- **前端启动**
  - npm install → npm run dev
- **双终端**
  - 终端一：后端 uvicorn，终端二：前端 Vite
- **端到端验证**
  - 登录 → 智能问答（SSE 流式）→ 试卷批改（上传+审核）→ 简历审查（上传+查看）→ 模拟面试（对话+报告）
- **AI 助手统一入口**
  - UnifiedChatView：统一聊天界面，自动路由到各 Agent

---

## 第10章 · 收尾与扩展
### 10.1 全景回顾
- **从零建成了什么**
  - 完整 EduAgent 多 Agent 系统：4 个独立 Agent + 统一编排 + 前端集成
- **三层架构**
  - 前端(Vue 3) → 后端(FastAPI + LangGraph) → 基础设施(PG + Milvus + 本地模型)
- **四种 LangGraph 范式**
  - 简历审查：直线流水线（最简，适合固定流程）
  - RAG 问答：分支+记忆（适合需要判断和检索的场景）
  - 试卷批改：三轨并行+HitL（适合需要并行处理和人工介入的场景）
  - 模拟面试：多轮状态机（适合有状态推进的场景）
- **公共地基**
  - LLM Factory、三层重试降级、JWT 认证、日志异常体系
  - 所有 Agent 复用的零件
- **集成层**
  - Orchestrator + 统一入口 → 从四个孤岛到一个系统
- **请求完整生命周期**
  - 用户输入 → 前置拦截(零Token) → LLM 路由 → Orchestrator → Agent 图 → 响应
### 10.2 多 Agent 能力迁移场景
- **迁移方法论（四步法）**
  - 第一步：找"角色" — 这件事交给团队会有哪些专业人？
  - 第二步：定范式 — 每个角色的工作性质套四种范式
  - 第三步：定编排 — 互斥(路由) / 依赖(Pipeline) / 独立(并行)
  - 第四步：补地基 — get_llm / MemorySaver / with_retry / 统一入口
  - 一句话：业务=角色，角色=Agent+范式，系统=编排+地基
- **场景一：智能客服中台**
  - 意图路由(LLM路由+规则拦截) → FAQ(RAG) → 订单状态(状态机) → 退换货(HitL) → 投诉(HitL安全兜底)
  - 编排：路由分发为主，退换货场景有 Pipeline
  - 映射：几乎等同 EduAgent 换皮
- **场景二：合同/法律审查助手**
  - 合同上传(文件解析) → 条款提取(结构化提取) → 风险识别(并行审查) → 合规检查(HitL) → 报告生成
  - 映射：类似简历审查（扇出流程）
- **场景三：研发协作与代码审查平台**
  - 代码分析 → 自动审查 → 测试生成 → 文档生成
  - 编排：Pipeline 串联
- **场景四：医疗导诊与报告解读**
  - 症状分析 → 科室推荐 → 检查报告解读
  - 编排：RAG + 路由
- **场景五：智能投研分析**
  - 数据采集 → 研报生成 → 风险预警
  - 编排：并行采集 + Pipeline 生成
- **简历包装方法论**
  - 如何把迁移场景写进简历：突出范式、编排、地基
### 10.3 多 Agent 系统面试题集
- **架构与编排**
  - 为什么拆 Agent、怎么设计 Orchestrator
- **意图识别与路由**
  - LLM 路由 vs 分类模型路由的权衡
- **可靠性与容错**
  - 三层重试、降级策略、超时控制
- **记忆与上下文管理**
  - MemorySaver、滑动窗口、摘要压缩
- **结构化输出与可控性**
  - with_structured_output、Pydantic description 设计
- **RAG 与知识增强**
  - 混合检索、重排序、Contextual RAG
- **成本与性能**
  - Token 优化、本地模型 vs 云端模型、并行化
- **人工介入与安全合规**
  - HitL 设计、多租户隔离、数据审计
- **状态持久化与可观测性**
  - 数据库持久化、Langfuse 监控
- **高频追问与"诚实作答"建议**
### 扩展：Langfuse 监控与评估完整指南
- **为什么需要 Langfuse**
  - LLM 可观测性：Trace(全链路)、Span(单步)、Score(质量评分)
- **部署方式**
  - 云端快速开始（SaaS）/ 自托管（生产推荐）
- **三种接入方式**
  - LangChain 回调：最快，改动最少（加 Callback 参数即可）
  - 手动 SDK：最灵活，精确控制每个 Span
  - LangGraph 集成：节点级可见，通过回调透传
- **Token 成本监控**
  - 自动成本计算（按模型计价）
  - 手动传入 usage（最准确）
  - 成本告警设置
- **问题定位实战**
  - RAG 答错根因定位：看 retrieval span 的召回质量
  - 路由失败定位：看 LLM 路由的输入输出
  - 高延迟请求定位：看哪个 Span 耗时最长
- **Score 回写**
  - 用户反馈(👍/👎) 回写
  - LLM 评委打分回写
- **Dataset 与离线评估**
  - 创建评测集 → 批量运行 → 版本对比
- **生产监控仪表板**
  - 延迟/成本/错误率/质量评分分布

---

> **生成说明**：深度版思维导图，覆盖 10 章、全部子章节、每个知识点延伸至技术实现细节、设计原理、代码模式、决策权衡。基于 EduAgent 课件 V7.7 全文提取。