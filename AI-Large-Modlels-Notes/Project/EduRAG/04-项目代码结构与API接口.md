# 项目代码结构与API接口 - 详细学习笔记

## 一、项目整体结构

### 1.1 目录结构

```
Itcast_qa_system/
├── app.py              # 主应用入口（FastAPI）
├── base/               # 基础模块
│   ├── config.py       # 配置管理
│   ├── logger.py       # 日志管理
│   └── utils.py        # 工具函数
├── mysql_qa/           # MySQL问答模块
│   ├── __init__.py
│   ├── bm25.py         # BM25检索
│   ├── faq.py          # FAQ问答
│   └── models.py       # 数据模型
├── rag_qa/             # RAG问答模块
│   ├── __init__.py
│   ├── embedding.py    # 向量化
│   ├── retriever.py    # 检索器
│   ├── generator.py    # 答案生成
│   └── vector_store.py # 向量存储
├── config.ini          # 配置文件
├── requirements.txt    # Python依赖
├── docker-compose.yml  # Docker配置
├── Dockerfile          # Docker镜像配置
├── 接口文档.md         # API接口文档
├── logs/               # 日志目录
├── static/             # 静态文件
└── notebooks/          # Jupyter笔记本
```

### 1.2 核心模块说明

| 模块 | 作用 | 关键文件 |
|------|------|----------|
| **app.py** | FastAPI主应用，提供API接口 | 入口文件 |
| **base/** | 基础工具，配置、日志、通用函数 | config.py, logger.py |
| **mysql_qa/** | MySQL问答，BM25检索FAQ | bm25.py, faq.py |
| **rag_qa/** | RAG问答，向量检索+LLM生成 | retriever.py, generator.py |

---

## 二、API接口详解

### 2.1 基础信息

- **服务地址**: `http://IP:8003`
- **技术栈**: FastAPI + WebSocket
- **版本**: v1.0

### 2.2 健康检查

**请求**：
```
GET /health
```

**响应**：
```json
{
  "status": "healthy"
}
```

**用途**：检查服务是否正常运行，可用于监控和负载均衡器健康检查。

### 2.3 创建会话

**请求**：
```
POST /api/create_session
```

**响应**：
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**说明**：创建新会话，返回UUID格式的会话ID。后续请求需携带此session_id。

### 2.4 获取会话历史

**请求**：
```
GET /api/history/{session_id}
```

**路径参数**：
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| session_id | string | 是 | 会话ID |

**响应**：
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "history": [
    {
      "role": "user",
      "content": "什么是 Python？"
    },
    {
      "role": "assistant",
      "content": "Python 是一种高级编程语言..."
    }
  ]
}
```

### 2.5 清除会话历史

**请求**：
```
DELETE /api/history/{session_id}
```

**响应**：
```json
{
  "status": "success",
  "message": "历史记录已清除"
}
```

### 2.6 非流式查询 ⭐

**请求**：
```
POST /api/query
```

**请求体**：
```json
{
  "query": "什么是 Python？",
  "source_filter": "python",
  "session_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**字段说明**：
| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| query | string | 是 | - | 用户提问内容 |
| source_filter | string | 否 | null | 学科类别过滤（java, ai, python等） |
| session_id | string | 否 | 自动生成 | 会话ID |

**响应场景1**：日常问候或BM25可直接回答
```json
{
  "answer": "你好！我是黑马程序员，专注于为学生答疑解惑，很高兴为你服务！",
  "is_streaming": false,
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "processing_time": 0.023
}
```

**响应场景2**：需要RAG处理，建议使用流式接口
```json
{
  "answer": "请使用WebSocket接口获取流式响应",
  "is_streaming": true,
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "processing_time": 0.156
}
```

**日常问候识别**：
| 问候类型 | 示例输入 | 返回回复 |
|---------|---------|---------|
| 打招呼 | 你好、您好、hi、hello | 你好！我是黑马程序员... |
| 询问身份 | 你是谁、您是谁 | 我是黑马程序员，你的智能学习助手... |
| 在线确认 | 在吗、在不在 | 我在！随时为你解答问题！ |

### 2.7 流式查询（WebSocket）⭐⭐

**连接**：
```
WS /api/stream
```

**发送消息格式**：
```json
{
  "query": "请详细解释 Python 的装饰器",
  "source_filter": "python",
  "session_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**接收消息格式**：

#### 开始消息 (type: "start")
```json
{
  "type": "start",
  "session_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### 令牌消息 (type: "token")
```json
{
  "type": "token",
  "token": "Python",
  "session_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### 结束消息 (type: "end")
```json
{
  "type": "end",
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "is_complete": true,
  "processing_time": 3.245
}
```

#### 错误消息 (type: "error")
```json
{
  "type": "error",
  "error": "错误描述信息"
}
```

### 2.8 获取学科类别

**请求**：
```
GET /api/sources
```

**响应**：
```json
{
  "sources": ["java", "ai", "python", "frontend", "bigdata"]
}
```

---

## 三、前端调用示例

### 3.1 JavaScript调用非流式接口

```javascript
// 创建会话
async function createSession() {
  const response = await fetch('http://localhost:8003/api/create_session', {
    method: 'POST'
  });
  const data = await response.json();
  return data.session_id;
}

// 非流式查询
async function query(sessionId, question) {
  const response = await fetch('http://localhost:8003/api/query', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: question,
      source_filter: 'python',
      session_id: sessionId
    })
  });
  const data = await response.json();
  return data;
}

// 使用示例
const sessionId = await createSession();
const result = await query(sessionId, '什么是Python？');
console.log(result.answer);
```

### 3.2 JavaScript调用流式接口

```javascript
// WebSocket流式查询
function streamQuery(sessionId, question) {
  const ws = new WebSocket('ws://localhost:8003/api/stream');
  
  let fullAnswer = '';
  
  ws.onopen = function() {
    console.log('WebSocket连接已建立');
    
    // 发送查询请求
    const request = {
      query: question,
      source_filter: 'python',
      session_id: sessionId
    };
    
    ws.send(JSON.stringify(request));
  };
  
  ws.onmessage = function(event) {
    const data = JSON.parse(event.data);
    
    switch(data.type) {
      case 'start':
        console.log('开始接收回答');
        fullAnswer = '';
        break;
        
      case 'token':
        fullAnswer += data.token;
        console.log('收到片段:', data.token);
        // 实时更新UI
        document.getElementById('answer').textContent = fullAnswer;
        break;
        
      case 'end':
        console.log('回答完成，耗时:', data.processing_time, '秒');
        break;
        
      case 'error':
        console.error('发生错误:', data.error);
        break;
    }
  };
  
  ws.onclose = function(event) {
    console.log('WebSocket连接已关闭');
  };
  
  ws.onerror = function(error) {
    console.error('WebSocket错误:', error);
  };
}

// 使用示例
streamQuery(sessionId, '请详细解释Python的装饰器');
```

### 3.3 Python调用示例

```python
import asyncio
import websockets
import json

async def stream_query():
    uri = "ws://localhost:8003/api/stream"
    
    async with websockets.connect(uri) as websocket:
        # 发送查询请求
        request = {
            "query": "请详细解释 Python 的装饰器",
            "source_filter": "python",
            "session_id": "550e8400-e29b-41d4-a716-446655440000"
        }
        
        await websocket.send(json.dumps(request))
        
        full_answer = ""
        
        # 接收流式响应
        async for message in websocket:
            data = json.loads(message)
            
            if data["type"] == "start":
                print(f"开始接收回答，会话ID: {data['session_id']}")
                
            elif data["type"] == "token":
                full_answer += data["token"]
                print(data["token"], end="", flush=True)
                
            elif data["type"] == "end":
                print(f"\n回答完成，耗时: {data['processing_time']}秒")
                print(f"完整回答: {full_answer}")
                break
                
            elif data["type"] == "error":
                print(f"错误: {data['error']}")
                break

# 运行
asyncio.run(stream_query())
```

---

## 四、系统工作流程

### 4.1 非流式查询流程

```
用户提问
    ↓
接收请求（POST /api/query）
    ↓
判断问题类型
    ├─ 日常问候 → 返回预设回复
    ├─ 简单问题 → BM25检索MySQL FAQ
    └─ 复杂问题 → 提示使用流式接口
    ↓
返回完整答案
```

### 4.2 流式查询流程

```
用户提问
    ↓
建立WebSocket连接
    ↓
接收请求（WS /api/stream）
    ↓
发送开始消息（type: "start"）
    ↓
RAG处理流程
    ├─ 查询向量化
    ├─ Milvus检索相关文档
    ├─ 组装Prompt（上下文+问题）
    └─ LLM流式生成答案
    ↓
逐个发送token消息（type: "token"）
    ↓
发送结束消息（type: "end"）
```

### 4.3 RAG处理流程详解

```python
# 伪代码：RAG处理流程
def rag_process(query):
    # 1. 查询向量化
    query_vector = embedding_model.embed_query(query)
    
    # 2. 向量检索
    relevant_docs = milvus_db.similarity_search(query_vector, k=3)
    
    # 3. 组装上下文
    context = "\n".join([doc.page_content for doc in relevant_docs])
    
    # 4. 构建Prompt
    prompt = f"""根据以下上下文回答问题：
    
上下文：
{context}

问题：{query}

请基于上下文回答，如果上下文没有相关信息，请说明。"""
    
    # 5. LLM生成答案（流式）
    for token in llm.stream(prompt):
        yield token
```

---

## 五、错误码说明

| HTTP状态码 | 说明 | 处理建议 |
|------------|------|----------|
| 200 | 请求成功 | - |
| 400 | 请求参数错误 | 检查请求体格式 |
| 404 | 资源未找到 | 检查URL和参数 |
| 500 | 服务器内部错误 | 查看服务器日志 |

---

## 六、使用建议

### 6.1 何时使用非流式接口

- 简单的问候语或常见问题
- BM25检索可以直接匹配的答案
- 不需要实时显示回答进度的场景
- 对响应速度要求不高

### 6.2 何时使用流式接口

- 需要RAG和LLM处理的复杂问题
- 希望实时显示回答进度，提升用户体验
- 长文本回答的场景
- 聊天机器人界面

### 6.3 最佳实践

1. **会话管理**：
   - 首次使用时调用 `/api/create_session` 创建会话
   - 将 `session_id` 保存在前端状态或本地存储中
   - 后续请求携带相同的 `session_id` 以保持上下文

2. **错误处理**：
   - WebSocket连接可能断开，需要实现重连机制
   - 捕获并处理各种错误情况

3. **性能优化**：
   - 对于简单问题优先使用非流式接口
   - 合理使用 `source_filter` 缩小检索范围

4. **前端展示**：
   - 流式回答时使用打字机效果逐字显示
   - 显示加载状态和处理时间

---

## 七、启动服务

```bash
# 本地启动
python app.py

# Docker启动
docker-compose up -d
```

服务将在 `http://0.0.0.0:8003` 启动。

---

## 八、测试查询示例

### 8.1 不同类型的查询

| 查询类型 | 示例 | 说明 |
|----------|------|------|
| 简单列举 | "黑马课程有哪些" | 返回课程列表 |
| 详细信息 | "详细介绍黑马大模型课程" | 返回详细描述 |
| 多条件查询 | "Python课程的学费和学习周期" | 需要检索多个属性 |
| 价值分析 | "学习大模型有什么用" | 需要语义理解 |

### 8.2 测试代码

```python
# 测试不同类型的查询
test_queries = [
    {"query": "黑马课程有哪些", "source_filter": None},
    {"query": "Python课程学费多少", "source_filter": "python"},
    {"query": "大模型课程学完能做什么", "source_filter": "ai"},
]

for test in test_queries:
    response = requests.post("http://localhost:8003/api/query", json=test)
    print(f"查询: {test['query']}")
    print(f"回答: {response.json()['answer']}")
    print("---")
```

---

## 九、学习要点总结

1. **项目结构**：清晰的模块划分，mysql_qa和rag_qa分离
2. **两种查询方式**：非流式（简单问题）和流式（复杂问题）
3. **会话管理**：通过session_id保持多轮对话上下文
4. **学科过滤**：source_filter可以缩小检索范围
5. **WebSocket**：实现流式输出，提升用户体验
6. **错误处理**：完善的错误码和错误消息机制
7. **测试查询**：覆盖简单列举、详细描述、多条件、价值分析等类型