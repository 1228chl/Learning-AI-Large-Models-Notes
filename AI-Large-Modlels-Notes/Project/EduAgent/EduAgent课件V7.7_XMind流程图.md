# EduAgent 课件 V7.7 — 文字版 XMind 思维导图（深度版）

> 共 10 大块，每块展开至技术细节层，总计 964 节点

---

## 第1章 · 项目简介

### 1.1 项目全景介绍
- **项目背景**
  - 教育机构的真实痛点
    - 简历筛选耗时
      - 人工筛选一份简历平均5-10分钟
      - 培训高峰期每日数百份简历
      - 筛选标准不统一，依赖个人经验
    - 知识问答重复
      - 学员常见问题高度重复（如"什么是多态"）
      - 讲师每天花费大量时间回答相同问题
      - 下班后仍有大量学员咨询，无法及时响应
    - 试卷批改繁重
      - 主观题（简答/代码）需要逐字批改
      - 批改标准不一致，学员投诉
      - 批改周期长，反馈不及时
    - 模拟面试缺标准
      - 面试官水平参差不齐，问题质量不一
      - 缺乏统一的评估维度
      - 面试记录不完整，难以跟踪学员进步
  - 通用LLM三大不足
    - 无企业私有知识：通用LLM未学习企业内部课程/题库/简历 / 无法回答"我们课程里讲了什么" / 知识截止于训练数据
    - 无业务流程编排：审查简历需解析PDF→提取→评分→诊断 / 这些流程LLM单次调用无法完成
    - 无工程容错机制：线上系统不能一出错就崩溃 / 需要重试/降级/超时控制/日志/监控
  - 解法：AI原生教学辅助系统，每个业务一个专用Agent / Agent内部封装完整业务流程 / 融合企业私有知识库 / 工程化容错机制保底
- **四大核心Agent**
  - 简历审查Agent
    - 上传PDF（PyMuPDF解析文本 + run_in_executor不阻塞）
    - 结构化提取（LLM with_structured_output + 提取教育/工作/项目经历）
    - 六维度并行评分（asyncio.gather并发6维度 + 加权综合分计算）
    - 问题诊断（Think前置推理 + 优先级排序）
    - 整体评价（亮点/改进/评语/匹配度）
    - 持久化（写入PostgreSQL JSONB）
  - RAG问答系统
    - 混合检索（Dense+Sparse双路召回 + WeightedRanker(0.7,0.3)融合）
    - 意图分类（MiniLM三层分类 + SPECIFIC/VAGUE/BROAD/GENERAL）
    - 记忆管理（滑动窗口+摘要压缩 + MemorySaver持久化）
    - MCP工具（知识库MCP Server + Web搜索MCP Server兜底）
  - 试卷批改Agent
    - 三轨并行
      - 规则引擎（选择题/判断题精确比对 + 答案标准化三步：大写→去空格→排序）
      - LLM评分（Think推理→结构化评分 + 分组并行asyncio.gather）
      - 代码评估（多维度：正确性/可读性/效率/健壮性）
    - Human-in-the-Loop教师确认
  - 模拟面试Agent
    - 五阶段状态机驱动（WARMUP→TECH_BASE→PROJECT→CLOSING→REPORT / 双阈值控制：MIN_TURNS防过早/MAX_TURNS防卡死）
    - Think Tool质量评估（两步：自由推理→打标签 / EXCELLENT/ADEQUATE/WEAK/NO_ANSWER）
    - 多维报告生成（五维度评估 / 三层结构：总体→维度→细项）
  - 上层编排
    - Orchestrator统一路由（LLM意图路由：6个label映射 / 前置拦截：五类零Token回复）
    - Pipeline串联（如求职全链路：简历审查→模拟面试 / 前序structured注入后序context）
- **技术栈全景**
  - 语言/框架
    - Python 3.11（异步编程async/await + 类型注解支持）
    - LangChain（统一LLM调用接口 + with_structured_output结构化输出）
    - LangGraph（Agent=图心智模型 + State/Node/Edge/Checkpointer四要素）
    - FastAPI（异步Web框架 + 依赖注入/SSE流式响应）
  - 数据库
    - PostgreSQL（业务数据存储 + UUID主键/JSONB/事务）
    - Milvus（向量数据库 + Dense+Sparse双路检索）
  - 本地模型
    - BGE-M3（稠密+稀疏双向量输出 + 进程内加载，不另起服务）
    - BGE-Reranker（CrossEncoder精排 + 召回50条→精排取Top-3）
    - MiniLM-L6（意图二分类 + 22M参数，推理极快）
  - 大模型
    - DeepSeek（主力模型 + 所有Agent默认使用）
    - GLM-4-Flash（兜底模型 + DeepSeek不可用时自动切换）
  - 基础设施
    - Docker Compose（一键启动PG/Milvus/Redis）
    - SQLAlchemy异步（create_async_engine + text()+参数化查询）
    - Pydantic v2（数据校验/配置管理 + LLM结构化输出Schema）
    - SSE（StreamingResponse流式输出 + 事件格式data: {json}\n\n）
  - 关键约束：本地模型进程内加载（不另起微服务，直接函数调用 / 启动时asyncio.gather并行预热）
- **分层架构**
  - 前端层（Vue 3 + Element Plus / Vite开发服务器）
  - Nginx/Vite代理（开发：Vite代理转发/api / SSE绕过代理直连后端）
  - API网关层（FastAPI统一入口 / 前置拦截→LLM路由→Orchestrator分发）
  - Agent层（LangGraph图执行引擎 / 4个独立Agent图）
  - 基础设施层（PostgreSQL/Milvus/本地模型 / Docker Compose编排）

### 1.2 多Agent系统核心概念
- **什么是Agent**
  - 对比
    - 普通LLM调用 = 一问一答：输入问题→模型返回→结束 / 无记忆、无工具、无状态 / 每次调用独立，不感知上下文
    - Agent = 有感知/记忆/决策/行动/循环的工作流程：感知（接收用户输入和上下文）/ 记忆（记住之前的对话或中间结果）/ 决策（判断下一步该做什么）/ 行动（调用工具、检索知识、生成内容）/ 可循环/可中断（反复执行直到完成）
  - 四大能力
    - 感知（Perceive）：接收用户输入和上下文 / 理解当前状态
    - 记忆（Memory）：记住之前的对话 / 记住中间结果
    - 决策（Decide）：判断下一步做什么 / 是否需要查知识库/联网/走哪条分支
    - 行动（Act）：调用工具 / 检索知识库 / 生成内容
    - 可循环/可中断：反复执行直到完成 / 中途停下来等人介入（HitL）
- **Agent四种形态**
  - 形态一：普通LLM调用 — 无Agent特征 / 一次问答，无状态无记忆
  - 形态二：工作流 — 流程是人为编排好的固定步骤 / LLM只在部分环节出力 / 可控、可预测，但不够灵活 / EduAgent主要采用此形态
  - 形态三：单Agent — 把决策权交给LLM / LLM自主决定调用哪些工具/循环多少次 / 灵活但有时不可控
  - 形态四：多Agent — 复杂问题拆给多个专精Agent / 由编排者统一调度 / EduAgent采用此形态
- **为什么拆成四个Agent**
  - 四种业务流程形状根本不同：RAG（检索→判断→生成）/ HitL（并行打分→等人→发布）/ 扇出（抽取→并行评分→汇总）/ 状态机（多轮推进→评估→报告）
- **实现框架：LangGraph**
  - 四要素：State（共享数据）+ Node（读State返增量）+ Edge（固定/条件边）+ Checkpointer（检查点持久化）
  - 心智模型：Agent = 图，数据在节点间流动
- **编排者Orchestrator**
  - 职责：理解用户意图 → 路由到正确Agent
  - 两种模式：单Agent直达 / 多Agent串联Pipeline

---

## 第2章 · 工具预备知识

### 2.1 Python异步编程速成
- **为什么需要异步**
  - 同步模型的问题：I/O操作时CPU空闲等待 / 多个请求串行，总耗时=各耗时之和 / 示例：3次LLM调用各2秒，串行=6秒
  - 异步模型优势：等待I/O时让出控制权，去干别的事 / 多个等待重叠，总耗时≈最慢的那个 / 示例：3次LLM调用各2秒，异步≈2秒
  - EduAgent中的I/O密集型场景：调用DeepSeek API（秒级~十几秒）/ 查询PostgreSQL数据库 / 检索Milvus向量库 / 本地模型推理（BGE嵌入/Reranker）
- **协程、async/await、asyncio.run**
  - async def定义协程函数：调用后返回协程对象，不执行 / 必须在事件循环中运行
  - await等待协程执行：只能在async def函数内部使用 / 让出控制权，事件循环可以干别的
  - asyncio.run()入口：启动事件循环并运行最外层协程 / 整个程序通常只有一个入口 / FastAPI已自动启动，业务代码直接async def
  - 关键区别：await asyncio.sleep(1)→让出控制权 / time.sleep(1)→死等，阻塞整个线程
- **asyncio.gather并发**
  - 基本用法：asyncio.gather(*tasks)同时启动多个协程 / 按传入顺序返回结果列表 / 总耗时≈最慢的那个协程
  - EduAgent应用场景：启动时并行预热BGE-M3/BGE-Reranker/MiniLM / 简历六维度并行评分（6倍提速）/ 简答题分组并行批改 / load_context并行加载多个数据源
  - 异常处理：默认一抛全停，需用return_exceptions=True / 单维度失败不影响其他维度
- **run_in_executor：同步代码不阻塞**
  - 为什么需要：同步阻塞函数（如PyMuPDF解析）会阻塞事件循环 / BGE模型推理是同步CPU密集操作
  - 使用方法：loop.run_in_executor(None, sync_fn, arg) / asyncio.to_thread(sync_fn) Python 3.9+简洁写法
  - EduAgent应用：PDF文本提取（PyMuPDF同步库）/ BGE-M3嵌入推理 / BGE-Reranker精排 / MCP Server中的同步工具调用
- **后台任务陷阱**
  - 问题现象：create_task创建的后台任务被GC回收 / 任务消失，不执行也不报错
  - 解决方案：保留Task引用（如存到全局列表）/ 用asyncio.TaskGroup管理
  - EduAgent应用：简历审查上传接口的后台异步审查 / 试卷批改后台任务
- **异步上下文管理器@asynccontextmanager**
  - async with语法：进入和退出都await
  - EduAgent应用：数据库会话、MCP Server生命周期
- **三个常见坑**
  - 同步里调异步：在同步函数里直接await会报错 / 必须用asyncio.run()包装
  - 忘记await：协程未执行，返回coroutine对象 / 容易出现在gather传参时
  - 混用同步/异步库：同步库阻塞事件循环 / 必须用run_in_executor包裹

### 2.2 Pydantic速成
- **Pydantic是什么**
  - 自动校验外部数据：用户输入、DB查询结果、API返回的JSON / 不再手动写if type(x) != str的校验代码
  - EduAgent两大用途：LLM结构化输出Schema（最核心）/ 配置读取BaseSettings + 接口参数校验
  - Pydantic v2特性：基于Rust的pydantic-core，速度更快 / 支持model_validator/field_validator
- **BaseModel与自动校验**
  - 定义模型：继承BaseModel，类型注解声明字段
  - 自动类型转换："18"→18
  - 校验失败抛出ValidationError（含详细错误位置）
- **Field字段配置**
  - default / default_factory：default=值（固定默认值）/ default_factory=list（每次新建空列表）
  - description参数：字段含义说明，非注释 / with_structured_output底层转Function Calling参数
  - 必须用default_factory的坑：default=[]导致所有实例共享同一个列表 / 一个实例修改会污染其他实例
- **description是大模型输出的关键**
  - with_structured_output原理：description→Function Calling参数说明
  - 描述越清晰，LLM提取越准确
  - 示例：Field(description="公司名称，如北京传智教育")
- **嵌套模型与组合**
  - 子模型嵌套：ResumeStructured含EducationItem
  - 列表类型：list[ProjectItem]
  - 可选字段：Optional[str]
- **model_dump() 转换**
  - Pydantic对象→普通字典，用于State存储、JSON序列化
  - State里存dict而非Pydantic对象的原因
- **Enum + BaseSettings**
  - Enum：固定取值（面试阶段、题型分类）
  - BaseSettings：从.env文件/环境变量读配置

### 2.3 LangChain速成
- **LangChain在项目里的角色**
  - 统一LLM调用接口（init_chat_model）
  - 消息体系（System/Human/AI）
  - 结构化输出（with_structured_output）
  - 流式输出（astream）
- **init_chat_model创建模型**
  - LangChain 1.x新写法
  - 参数：model/provider/temperature/base_url/api_key
  - 注意：禁用ChatOpenAI()等直接构造方式
- **消息体系**
  - SystemMessage：系统提示词
  - HumanMessage：用户输入
  - AIMessage：模型回复（含tool_calls）
- **ainvoke异步调用**
  - await llm.ainvoke(messages)
  - result.content取文本内容
- **with_structured_output（核心）**
  - llm.with_structured_output(Model, method="function_calling")
  - LLM直接返回Pydantic对象，无需解析
  - 依赖Pydantic模型的description字段
- **astream流式输出**
  - async for chunk in llm.astream(messages)
  - 用于SSE实时展示
- **新版API对照表**
  - 禁用：ChatOpenAI() / ChatDeepSeek() 直接构造
  - 必用：init_chat_model() / with_structured_output()

### 2.4 LangGraph速成
- **心智模型：Agent = 图**
  - State：贯穿全程的共享数据工单
  - Node：函数节点，读State返增量字典
  - Edge：决定节点流向的管道
    - 固定边 add_edge：无条件执行
    - 条件边 add_conditional_edges：根据State分支
  - Checkpointer：检查点，持久化State
- **定义State**
  - TypedDict定义字段类型
  - add_messages reducer处理消息列表：自动追加消息到列表，避免覆盖 / 用于多轮对话的消息累积
  - 字段命名规范：按阶段分组
- **写节点**
  - 函数签名：(state: StateType) -> dict
  - 返回增量更新字典，不直接修改State
  - LangGraph自动合并返回的字段到State
  - 真实项目：节点内调LLM/查知识库
- **搭图、编译、运行**
  - StateGraph(StateType) 创建构建器
  - add_node("name", fn) 注册节点
  - add_edge(START, "node") / add_edge("node", END)
  - compile() 编译为可执行图
  - invoke({"input": data}) 运行
- **条件边 add_conditional_edges**
  - 路由函数：接收State→返回分支名
  - 映射字典：{"分支名": "目标节点"}
  - 示例：分类路由→概念/代码/闲聊
- **记忆：MemorySaver + thread_id**
  - MemorySaver持久化State（默认内存）
  - thread_id标识多轮对话会话
  - add_messages自动追加消息
- **interrupt / Command（HitL）**
  - interrupt(value)：图暂停，保存State，返回
  - Command(resume=decision)：恢复执行
  - 新API：编译时不传interrupt_before
- **LangGraph规范小结**
  - State驱动、节点纯函数、边定义流向
  - 禁用直接修改State对象
  - 禁用节点内调外部API不通过装饰器

### 2.5 FastAPI速成
- **最小应用**：FastAPI()→@app.get("/")→uvicorn.run()
- **Pydantic接收请求体**：POST请求体自动校验为Pydantic模型
- **路径参数与查询参数**：/items/{id}路径参数 / ?q=xxx查询参数
- **依赖注入Depends**：get_db（yield型，获取AsyncSession）/ get_current_user（从JWT提取用户）/ FastAPI自动注入，无需手动构造
- **文件上传 UploadFile**：异步读取文件内容
- **SSE流式响应**：StreamingResponse(gen(), media_type="text/event-stream") / 事件格式：data: {json}\n\n
- **错误处理**：HTTPException / 自定义异常+全局处理器

### 2.6 PostgreSQL实操
- **PG vs MySQL差异**：UUID/JSONB/RETURNING/ON CONFLICT/CHECK/触发器
- **连接方式**：psql命令行 / PyCharm数据库工具
- **基础CRUD**：与MySQL基本一致
- **PG专属特性**
  - UUID主键：避免自增ID暴露数据量
  - RETURNING：INSERT后直接返回生成值
  - JSONB：直接存查结构化数据
  - ON CONFLICT DO UPDATE：Upsert操作
  - CHECK约束：数据库层拦截非法值
  - TIMESTAMPTZ触发器：自动维护时间戳

### 2.7 SQLAlchemy异步操作数据库
- **异步连接配置**：create_async_engine + AsyncSession
- **text()+参数化查询**：项目核心写法：text("SELECT * FROM users WHERE id=:id")
- **完整CRUD示例**：执行SQL/获取结果/事务管理
- **在接口里操作数据库**：Depends(get_db)→AsyncSession→查询→返回

---

## 第3章 · 环境搭建与工程地基

### 3.1 环境与基础设施
- 项目目录骨架（backend/ scripts/ frontend/ docker-compose.yml）
- Python 3.11环境（conda）
- 安装项目依赖
- Docker Compose启动（PG + Milvus + Redis）
- 配置环境变量.env.local
- Windows用户特别说明
- 验证环境连通性

### 3.2 数据库设计与建表
- **三大贯穿设计**
  - UUID主键
  - 多租户tenant_id
  - 时间戳自动更新
- **11张表概览**
  - users（用户权限）
  - knowledge_pending_queue（知识库待补充队列）
  - exams / questions / scoring_points（试卷结构）
  - exam_submissions（提交记录，含HitL状态流转）
  - exam_reviews（逐题批改结果）
  - resume_reviews（简历审查结果）
  - interview_questions / interview_sessions（面试）
  - qa_sessions（问答会话）
- 多租户tenant_id设计（数据隔离）
- 数据库会话依赖dependencies.py
- 自动迁移migrations.py

### 3.3 配置、日志与异常体系
- **config.py**：BaseSettings读取.env.local
- **logger.py**：结构化日志
- **exceptions.py**：统一异常体系
  - AppException基类→具体业务异常
  - 全局异常处理器
  - 异常分类：可重试 vs 不可重试

### 3.4 LLM Factory：统一大模型工厂
- **为什么需要工厂**
  - 避免配置重复：每处写base_url/api_key/temperature
  - 避免重复创建：相同参数模型只创建一次
  - 统一管控：超时/代理/重试开关集中管理
  - 硬约束：禁止Agent代码直接调init_chat_model
- **绕过系统代理的httpx客户端**
  - Windows系统代理被httpx默认探测(trust_env=True)
  - 解法：自定义httpx.AsyncClient(trust_env=False)
- **Agent类型→模型路由表**
  - 字典映射：{"qa": "deepseek-chat", "resume": "deepseek-chat"}
  - 扩展性：换模型只改这一行
- **get_llm：带缓存获取模型**
  - 三步：校验agent_type→组合缓存键（模型_温度_流式）→缓存有则返/无则建
- **get_structured_llm**
  - 在get_llm基础上绑定with_structured_output
  - 返回即结构化对象，无需解析

### 3.5 三层兜底与重试机制
- **三层总览**
  - 第一层：自动重试循环（带超时，最多3次）
  - 第二层：Agent级降级（返回默认字典替代LLM结果）
  - 第三层：系统级兜底（友好提示，绝不崩溃）
- **@with_retry装饰器工厂**
  - 三层嵌套：接收agent_type→返回装饰器→包装原函数
  - 套在任意异步函数上自动拥有三层兜底
- **异常分类逻辑**
  - 可重试：网络超时、LLM限流、临时服务不可用
  - 不可重试：参数错误、认证失败、非法输入
- **第一层：自动重试循环**
  - for循环最多跑3次(第0/1/2次)
  - asyncio.wait_for给单次调用加30秒超时
  - 不可重试异常→立即抛出，不重试
  - 其他异常→等待(1s/3s)后重试→到上限去降级
- **第二层：Agent级降级**
  - 问答：跳过检索直接LLM直答
  - 批改：标记教师复核
  - 面试：跳过本轮评估
  - 降级函数返回固定字典（符合LangGraph节点约定）
- **第三层：系统兜底**
  - _system_fallback_response返回友好提示
  - 确保系统在任何异常下都不崩溃
- **降级函数返回字典的原因**
  - LangGraph节点约定：接收State→返回要更新的字段
  - 降级函数顶替节点，必须返回同样结构，否则图类型不匹配崩溃

### 3.6 认证与依赖注入
- 认证流程总览：登录→签发JWT→请求头Bearer Token→校验
- bcrypt密码哈希（passlib库，不存明文密码）
- dependencies.py最终版：get_current_user（JWT解析→用户查询→注入）
- auth.py登录接口：POST /auth/login：校验→签发JWT（含过期时间）
- seed_data.py测试账号：管理员/教师/学员三类账号
- 端到端测试：登录获取Token→携带Token访问受保护接口

---

## 第4章 · 简历审查Agent

### 4.1 全景与数据流
- HTTP视角：上传→返回review_id→后台异步审查→轮询结果
- 8节点流水线（直线图）
- Agent = 图心智模型映射

### 4.2 State与数据模型
- 结构化提取模型（ResumeStructured嵌套结构）
- 评审/诊断/评价模型（DimensionScore / IssueList / ResumeSummary）
- ResumeState主State（TypedDict，字段按阶段分组）
- 注意：State存dict而非Pydantic对象

### 4.3 提示词
- 系统提示与提取提示
- 六维度评分提示（Rubric设计）
- 诊断/评价/Think提示

### 4.4 PDF解析与结构化提取
- extract_text：PyMuPDF + run_in_executor
- extract_structured：LLM结构化提取

### 4.5 六维度并行评审
- 为什么并行：asyncio.gather提速6倍
- 六维度定义表（权重分配：项目深度0.30 + 技术匹配0.25占大头）
- run_six_dimensions节点：三步流程
- 单维度失败降级（50分 + 人工复核）

### 4.6 问题诊断与整体评价
- diagnose_issues：Think推理→结构化生成→优先级排序
- generate_summary：整体评价生成

### 4.7 持久化与图装配
- save_results：写入PostgreSQL JSONB
- graph.py：直线图装配

### 4.8 API接口与端到端
- upload：后台任务GC保护 + 线程本地图
- get_review / delete / list（越权防护 + JSONB查询）

---

## 第5章 · RAG问答系统

### 5.1 全景与架构
- RAG是什么（检索增强生成）
- 在线查询流程图
- 对比第四章：直线→分支+记忆
- 7项RAG关键技术

### 5.2 文档读取
- LangChain Document结构（page_content + metadata）
- PDF加载（PyPDFLoader）
- Markdown加载（TextLoader）
- 统一加载函数

### 5.3 智能分块
- 为什么分块 + chunk大小选择
- PDF分块（RecursiveCharacterTextSplitter）
- Markdown分块（语义切分 + 二次切分）

### 5.4 BGE-M3嵌入
- 稠密向量 vs 稀疏向量
- BGE-M3一个模型输出两种向量
- BGEMEmbedder类实现

### 5.5 Milvus初始化与知识库写入
- 知识库集合设计（Collection Schema）
- init_milvus.py初始化脚本
- Contextual RAG：嵌入前补充上下文（LLM生成定位描述）
- KnowledgeBaseClient写入

### 5.6 Hybrid召回与WeightedRanker
- **为什么混合检索**
  - 纯Dense问题：语义好但精确术语匹配弱
  - 纯Sparse问题：关键词匹配好但语义理解弱
  - 混合=两路互补，兼顾语义+精确
- **WeightedRanker vs RRFRanker**
  - RRFRanker：只看排名不看原始分
  - WeightedRanker：可指定权重比例
  - 本项目选WeightedRanker(0.7, 0.3)：语义性问题为主，关键词不能完全忽视
- **_hybrid_search()实现**
  - 两路AnnSearchRequest：dense + sparse
  - hybrid_search(requests, reranker=WeightedRanker(0.7, 0.3))
  - distance字段存融合后的分数

### 5.7 重排序Reranker
- CrossEncoder精排原理
- BGEReranker实现
- retrieve() Pipeline：召回50条→精排取Top-3

### 5.8 意图分类器
- 三层分类策略（Layer 0关键词 / Layer 1 MiniLM / Layer 2 LLM）
- 为什么用MiniLM本地模型（22M参数，高频路径）
- QueryClassifier实现（训练+推理统一）
- 阈值0.85的业务逻辑（宁可多走RAG，不漏课程问题）
- **QueryClassifier设计细节**
  - 训练阶段：调用train()才import Trainer/datasets/sklearn
  - 推理阶段：零重型依赖，仅加载MiniLM
  - 延迟import设计：生产部署无额外开销
- **训练数据格式**
  - backend/training_data.jsonl，每行一条JSON
  - 2200条：1000 general + 1200 specialized
  - general：公开IT概念/原理/语法 / specialized：涉及课程/实战项目内容

### 5.9 记忆管理
- MemorySaver工作原理
- 两种策略：滑动窗口 + 摘要压缩

### 5.10 MCP工具
- **MCP协议**
  - Anthropic制定的AI工具调用标准协议
  - 类比USB-C：统一接口，Server实现/Client调用
  - JSON-RPC 2.0 over HTTP通信
  - 响应嵌套在result.content[0].text（JSON字符串）
- **FastMCP封装**
  - @mcp.tool()：函数签名自动生成JSON Schema
  - stateless_http=True：每次请求自包含
  - json_response=True：自动序列化为JSON
- **知识库MCP Server**
  - 封装retrieve() Pipeline对外暴露
  - run_in_executor：BGE编码和CrossEncoder是同步CPU密集
- **Web搜索MCP Server**
  - 两个后端：Tavily(质量高有配额) / DuckDuckGo(免费)
  - asyncio.to_thread跑同步搜索库
- **MCP Client + 挂载FastAPI**
  - 通用客户端，解析JSON-RPC响应
  - 两个MCP Server挂载在FastAPI主进程

### 5.11 State与Prompts
- QAState五组字段（输入/分类/检索/生成/记忆）
- 七个Prompt模板

### 5.12 节点①：分类、HyDE、Multi-Query
- 联网指令识别
- classify_query_node（SPECIFIC/VAGUE/BROAD/GENERAL）
- hyde_generate_node（VAGUE分支：生成假设文档代替Query检索）
- multi_query_rewrite_node（BROAD分支：生成多个子问题分别检索）

### 5.13 节点②：检索与精排
- 三条检索路径（SPECIFIC直查 / VAGUE HyDE / BROAD多Query）
- retrieve_node实现（run_in_executor / 空召回早退 / 去重）

### 5.14 节点③：生成、Web兜底、存记忆
- generate_rag_node（高置信度RAG生成）
- web_search_node（低置信度Web搜索兜底）
- generate_direct_node（低置信度LLM直答）
- generate_general_node（GENERAL分支直答）
- enqueue_pending_node（低置信度问题入队待补充）
- save_memory_node（记忆保存）

### 5.15 图装配
- 三个路由函数（分类路由 / 置信度路由 / 记忆路由）
- build_qa_graph() 分支+循环图

### 5.16 HTTP接口
- POST /chat（同步接口）
- POST /chat/stream（SSE流式接口）
- GET /sessions/{id}/history（历史查询）

### 5.17 端到端测试
- 四条分类路径验证 / 低置信度Web兜底 / 多轮记忆验证 / SSE流式接口验证

---

## 第6章 · 试卷批改Agent

### 6.1 全景与架构
- 为什么需要HitL（LLM批改不可全信）
- 完整数据流（提交→三轨并行→HitL→决策→发布）
- 三轨并行设计（客观题规则引擎 + 简答题LLM评分 + 代码题评估）
- HitL机制（interrupt / Command）
- 涉及的数据库表

### 6.2 State与Prompts
- 五个Pydantic子模型（ObjectiveResult / SubjectiveResult / CodingResult / AggregateResult / WeakPointAnalysis）
- ExamState
- 四个Prompt模板

### 6.3 Word文件解析
- parse_word_node（python-docx）
- 试卷模板约定 + 学生答案提取

### 6.4 题目元数据加载
- load_questions_meta_node（动态IN子句）

### 6.5 三轨①：客观题规则引擎
- 答案标准化 _normalize_answer（大写→去空格→排序）
- 排序使BD和DB视为等价
- needs_review=False（不进入教师必看列表）

### 6.6 三轨②：简答题LLM评分
- 两步批改（Think推理→结构化评分）
- 分组并行（每3题一组，asyncio.gather）

### 6.7 三轨③：代码题评估
- 多维度评估（正确性/可读性/效率/健壮性）

### 6.8 三轨组装与汇总
- run_three_tracks_node
- aggregate_results_node（总分+各题型得分率）
- analyze_weak_points_node（知识薄弱点分析）

### 6.9 Human-in-the-Loop
- **interrupt()底层机制**
  - 执行到interrupt(value)→LangGraph抛Interrupt异常
  - ainvoke捕获异常，保存完整State到MemorySaver
  - 按thread_id存储，图进入暂停状态
  - State包含中断点位置(next=["teacher_review"])
  - 后续Command(resume=decision)从保存点恢复
- **notify_teacher_node**
  - 职责：更新DB状态为pending_review
  - 教师轮询GET /pending-reviews可看到新提交
- **teacher_review_node**
  - interrupt(display_data)暂停，等待教师审核
  - display_data暴露给教师端查看的数据
  - 可通过GET /submissions/{id}/review读取State
- **Command(resume=decision)恢复**
  - 从MemorySaver加载thread_id对应的State
  - 找到interrupt()位置，从那里继续执行
  - decision包含：逐题确认/修改/驳回
- **关键约束**
  - 编译图时不传interrupt_before（LangGraph 1.0新API）
  - 只在节点内调用interrupt()
  - 旧写法compile(interrupt_before=["teacher_review"])已废弃

### 6.10 合并决策与发布
- apply_teacher_decision_node（合并教师修改）
- publish_results_node（发布最终成绩）

### 6.11 图装配
- 图结构：解析→三轨并行→HitL→决策→发布
- 端到端测试（一个asyncio.run()跑完整流程）

### 6.12 HTTP接口
- POST /submit（学员提交试卷）
- 学员查询接口 / 教师接口（待审核列表 / 详细批改）
- POST /confirm（教师确认，恢复interrupt）

### 6.13 端到端测试

---

## 第7章 · 模拟面试Agent

### 7.0 架构概览
- 一场完整面试的能力（破冰→技术→项目→反问→报告）
- 双轨考察（基础技术题 + 项目深挖题）
- 五阶段状态机（WARMUP→TECH_BASE→PROJECT→CLOSING→REPORT）
- 图拓扑：7个节点 + 两条路径（单轮循环 / 报告生成结束）
- 与简历Agent的数据接口（Pipeline衔接）
- 五维度评估报告

### 7.1 全景
- 什么是状态机 + 为什么面试要用状态机
- 四个面试阶段及轮次范围
- 多轮对话State保持（MemorySaver）
- 涉及的数据库表

### 7.2 State与枚举
- InterviewStage枚举 / QuestionType枚举
- 报告模型（三层结构：总体→维度→细项）
- InterviewState

### 7.3 Prompts全解析
- 系统提示词 / 动态出题Prompt
- 各阶段Prompt（WARMUP/TECH_BASE/PROJECT/CLOSING）
- 回答质量评估Prompt（Think Tool）/ 报告生成Prompt

### 7.4 会话初始化与上下文加载
- load_context_node（首轮加载简历/出题，非首轮加载历史）
- LLM动态出题 + 题库合并策略
- 并行查询的必要性

### 7.5 阶段推进与状态机控制
- **check_stage_node职责**
  - 判断是否需要推进到下一阶段
  - 不调用LLM、不读数据库（纯逻辑节点）
  - 可完全离线运行测试
- **双阈值设计**
  - MIN_TURNS：防止过早推进（TECH_BASE最少6轮 / WARMUP只需1轮）
  - MAX_TURNS：防止卡死（到达上限强制切换，确保面试有始有终）
- **推进逻辑决策流**
  - 轮数<MIN_TURNS→停留
  - 轮数>=MIN_TURNS且条件满足→推进
  - 轮数>=MAX_TURNS→强制推进
  - 推进时重置：stage_turn_count=0 / followup_count=0 / current_question=None
- **强制终止路径**
  - 总轮数超限或关键词触发→直接跳到FINISHED
  - 跳过CLOSING阶段
- **职责分离设计**
  - check_stage只做阶段判断+推进
  - turn_count增减由evaluate_answer负责
  - 避免两个节点竞争同一字段

### 7.6 回答质量评估
- **evaluate_answer_node两个职责**
  - 评估回答质量：打AnswerQuality标签
  - 维护轮次计数：total_turn_count+=1, stage_turn_count+=1
- **跳过评估的情况**
  - 首轮跳过（系统消息非真实回答）
  - WARMUP跳过（自我介绍无需评估）
  - 两种情况都照常增加计数
- **未作答快速路径**
  - 学员明确说"不知道"→直接NO_ANSWER
  - 不调LLM，节省一次调用
- **Think Tool两步评估**
  - 第一步：自由推理(reasoning_trace)，不约束输出格式，LLM写出判断依据
  - 第二步：打标签，严格输出EXCELLENT/ADEQUATE/WEAK/NO_ANSWER
  - 第一步的推理追加到第二步Prompt
- **质量标签解析**
  - in匹配（兼容空格/换行）
  - 兜底到ADEQUATE（模糊情况视为基本及格）

### 7.7 面试官回应生成（上）
- WARMUP回应（引导式）
- TECH_BASE回应（正误判断 + 知识补充 + 追问）

### 7.8 面试官回应生成（下）
- PROJECT回应（STAR法则追问）
- CLOSING回应（反问环节 + 总结）
- 滑动窗口大小选择

### 7.9 面试报告生成
- generate_report_node（触发条件）
- 对话历史拼接策略
- 结构化输出与重试

### 7.10 结果持久化与记忆保存
- save_report_node / save_memory_node
- UPSERT必要性 + 对话摘要压缩

### 7.11 图装配
- 完整图拓扑（7节点 + 条件路由）
- checkpointer作用
- 与其他Agent图对比（简历直线→RAG分支→面试循环）

### 7.12 HTTP接口
- POST /sessions（创建面试会话）
- POST /sessions/{id}/chat（发送消息）
- GET /sessions/{id}/report（查询报告）
- GET /sessions（历史列表）
- POST /sessions/{id}/chat/stream（SSE流式对话）

### 7.13 端到端测试

---

## 第8章 · 系统集成

### 8.1 全景
- 前四章造了什么（四个独立Agent）
- 两个核心角色（Orchestrator + 统一入口）
- 统一请求生命周期
- 两种执行模式（单Agent直达 / 多Agent串联Pipeline）
- 为什么意图路由用LLM（比本地分类模型更灵活）

### 8.2 Orchestrator：Schema与单Agent直达
- 两个枚举（AgentType / ExecutionMode）
- 三个统一Schema（AgentRequest / AgentResponse / AgentError）
- Orchestrator初始化 + 图懒加载
- handle统一入口
- _run_single_agent（单Agent直达）

### 8.3 Orchestrator：多Agent串联Pipeline
- **为什么需要串联**
  - 求职全链路：简历审查→模拟面试
  - 前序结构化输出自动注入后序上下文
  - 面试官"看过了"简历，能问针对性问题
- **_run_pipeline实现**
  - 按序执行多个Agent
  - 上下文传递：前一步structured→{agent}_result→后一步context
  - 失败处理：某步失败则break，保留已完成结果
  - 每步独立session_id：session_id_step{N}（避免MemorySaver冲突）
- **_aggregate_pipeline聚合**
  - 文本：用---分隔线拼接成一篇
  - 结构化：按step_1/step_2分层保留
  - 成功标志：取任一步成功 / 降级标志：取任一步降级
- **模块级单例get_orchestrator**
  - 全应用共享一个编排器
  - 懒加载的图缓存只build一次

### 8.4 统一入口：前置拦截与LLM路由
- **规则前置拦截（五类零Token回复）**
  - 问候：你好/您好/hi / 感谢：谢谢/感谢 / 道别：再见/拜拜
  - 身份询问：你是谁/你叫什么 / 功能询问：你能做什么/你有什么功能
  - 两种匹配方式：精确匹配（整句相等，"谢谢"命中，"谢谢你"不命中）/ 正则匹配（身份/功能说法多变）
  - 设计意图：省Token又快，不调LLM、不路由 / "谢谢你"不命中是避免误伤有真实诉求的输入
- **LLM意图路由**：6个label→AgentType+ExecutionMode映射
- **引导 vs 直达**：exam/resume/interview推引导卡片

### 8.5 统一入口：SSE分发
- 四条分发分支（单Agent同步/流式 + Pipeline同步/流式）
- _stream_qa_agent实现

### 8.6 路由聚合与main集成
- api/router.py：六个router聚合
- main.py：lifespan + CORS + 挂载 + health

### 8.7 端到端测试

---

## 第9章 · 前端集成扩展

### 9.1 前端集成全景
- 本章定位（Vue 3前端可视化）
- 技术栈：Vue 3 + Vite + Element Plus + Axios
- Vite代理（前端如何找到后端）
- SSE绕过代理（直接连接后端SSE端点）
- JWT鉴权流程（登录→Token→Axios拦截器）

### 9.2 四大功能页面解读
- 登录页（LoginView.vue）
- Dashboard（DashboardView.vue）
- 智能问答（QAChatView.vue，SSE流式显示）
- 试卷批改（提交Word + 查看结果 + 教师审核）
- 简历审查（上传PDF + 六维度评分雷达图）
- 模拟面试（对话界面 + 五维度报告）

### 9.3 完整系统启动与联调验证
- 前提条件（后端所有服务启动）
- 前端启动（npm install → npm run dev）
- 双终端运行（后端uvicorn + 前端Vite）
- 端到端验证步骤（登录→问答→批改→简历→面试）
- AI助手统一入口（UnifiedChatView）

---

## 第10章 · 收尾与扩展

### 10.1 全景回顾
- 从零建成了什么
- 三层架构总览
- **四种LangGraph范式对比**
  - 简历：直线流水线（固定流程）
  - RAG：分支+记忆（需要判断和检索）
  - 批改：并行+HitL（需要人工介入）
  - 面试：多轮状态机（有状态推进）
- 公共地基（所有Agent复用的零件）
- 集成层（从四个孤岛到一个系统）
- 请求完整生命周期

### 10.2 多Agent能力迁移场景
- **迁移方法论（四步法）**
  - **第一步：找角色** — 问自己：这件事交给团队会有哪些专业人？/ 每个专业角色通常对应一个Agent / 举例：客服团队有答疑/查订单/退货/投诉
  - **第二步：定范式** — 看角色工作性质，套四种LangGraph范式 / 固定流程→直线流水线 / 需要检索判断→RAG分支+记忆 / 需要人工介入→HitL并行 / 有状态推进→多轮状态机
  - **第三步：定编排** — 互斥（一次只需一个）→路由分发 / 有先后依赖→串联Pipeline / 同时进行→并行fan-out
  - **第四步：补地基** — get_llm（大模型工厂）/ MemorySaver+thread_id（记忆管理）/ with_retry（三层容错）/ 统一入口（路由+SSE）
- 场景一：智能客服中台
- 场景二：合同/法律审查助手
- 场景三：研发协作与代码审查平台
- 场景四：医疗导诊与报告解读
- 场景五：智能投研分析
- 简历包装方法论

### 10.3 多Agent系统面试题集
- 架构与编排 / 意图识别与路由 / 可靠性与容错
- 记忆与上下文管理 / 结构化输出与可控性 / RAG与知识增强
- 成本与性能 / 人工介入与安全合规 / 状态持久化与可观测性
- 高频追问与诚实作答建议

### 扩展：Langfuse监控与评估
- **为什么需要Langfuse**
  - LLM可观测性：Trace(全链路)/Span(单步)/Score(质量)
  - 定位问题：RAG答错根因/路由失败/高延迟
- **三种接入方式**
  - LangChain回调：最快，加Callback参数即可
  - 手动SDK：最灵活，精确控制每个Span
  - LangGraph集成：节点级可见，通过回调透传
- **Token成本监控**
  - 自动成本计算（按模型计价）/ 手动传入usage（最准确）/ 成本告警设置
- **问题定位实战**
  - RAG答错根因：看retrieval span的召回质量
  - 路由失败：看LLM路由的输入输出
  - 高延迟：看哪个Span耗时最长
- **Score回写**：用户反馈(👍/👎)回写 / LLM评委打分回写
- **Dataset与离线评估**：创建评测集→批量运行→版本对比
- **生产监控仪表板**：延迟/成本/错误率/质量评分分布

---

> **生成说明**：基于EduAgent课件V7.7全文提取，10大章节、964节点，覆盖全部知识点至技术细节层。