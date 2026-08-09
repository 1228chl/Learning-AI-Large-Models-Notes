# MCP 工具：`backend/mcp/` 深度解析

> 源文件（3 个）：`backend/mcp/knowledge_base_server.py`（108 行）+ `backend/mcp/web_search_server.py`（139 行）+ `backend/mcp/client.py`（118 行）
> 对应课件：5.16 MCP 工具
> 协议：JSON-RPC 2.0 + FastMCP 框架

## 全文行号速查表

| 源文件 | 总行数 | 函数/类 | 行号范围 |
|--------|--------|---------|---------|
| `knowledge_base_server.py` | 108 | `search_knowledge_base()` 知识库搜索 | 32~96 |
| `web_search_server.py` | 139 | `_search_tavily()` Tavily 搜索 | 26~58 |
| `web_search_server.py` | 139 | `_search_duckduckgo()` DuckDuckGo 搜索 | 61~81 |
| `web_search_server.py` | 139 | `web_search()` 搜索入口（双后端降级） | 86~127 |
| `client.py` | 118 | `call_mcp_tool()` JSON-RPC 调用 | 22~102 |
| `client.py` | 118 | `list_mcp_tools()` 列出工具 | 105~118 |

---

## 一、MCP 协议概览

MCP（Model Context Protocol）是 Anthropic 提出的 AI Agent 工具调用协议，基于 JSON-RPC 2.0。

### 1.1 JSON-RPC 2.0 请求/响应格式

```json
// 请求
{
    "jsonrpc": "2.0",
    "id":      1,
    "method":  "tools/call",
    "params": {
        "name":      "search_knowledge_base",
        "arguments": {"query": "什么是 Spring IOC？", "tenant_id": "default"}
    }
}

// 成功响应
{
    "jsonrpc": "2.0",
    "id":      1,
    "result": {
        "content": [
            {"type": "text", "text": "[{\"content\": \"IOC 容器...\", ...}]"}
        ]
    }
}

// 错误响应
{
    "jsonrpc": "2.0",
    "id":      1,
    "error": {
        "code":    -32603,
        "message": "Internal error: ..."
    }
}
```

### 1.2 项目中的 MCP 架构

```
┌─────────────────────────────────────────────────────────────┐
│                     FastAPI 主应用                            │
│  POST /api/v1/qa/ask → QA Agent → MCP 客户端调用             │
└─────────────────────────────────────────────────────────────┘
          │                           │
          ▼                           ▼
┌─────────────────────┐   ┌─────────────────────────┐
│ Knowledge Base MCP  │   │ Web Search MCP           │
│ Server (port 8001)  │   │ Server (port 8002)       │
│                     │   │                          │
│ search_knowledge_   │   │ web_search()             │
│ base()              │   │  ├─ Tavily（首选）       │
│  ├─ retrieve()→RAG  │   │  └─ DuckDuckGo（降级）   │
│  └─ Milvus 检索     │   │                          │
└─────────────────────┘   └─────────────────────────┘
```

**为什么拆成两个独立的 MCP Server？** 两个不同职责的服务，独立部署、独立扩缩容。知识库服务依赖 Milvus，网页搜索服务依赖外部 API，拆开可以各自管理资源。

---

## 二、`knowledge_base_server.py`（108 行）：知识库 MCP 服务

### 2.1 文件头精读（第 1~11 行）

```python
# knowledge_base_server.py 第 1~11 行
"""MCP Server - 知识库服务"""
# backend/mcp/knowledge_base_server.py
# MCP（Model Context Protocol）知识库检索服务。
#
# 基于 FastMCP 框架，stateless_http=True 模式：
#   每次请求完全自包含，无需先发 initialize 握手。
#   客户端只需 POST /mcp 即可调用工具。
#
# 使用方式：
#   独立运行：python backend/mcp/knowledge_base_server.py
#   或集成到 FastAPI：app.mount("/mcp/kb", mcp.streamable_http_app())
```

**两种部署方式**：

| 方式 | 命令 | 端口 | 适用场景 |
|------|------|------|---------|
| 独立运行 | `python backend/mcp/knowledge_base_server.py` | 8001 | 开发调试/微服务部署 |
| FastAPI 挂载 | `app.mount("/mcp/kb", mcp.streamable_http_app())` | 主应用端口 | 生产集成 |

### 2.2 FastMCP 实例化（第 19~29 行）

```python
# knowledge_base_server.py 第 19~29 行
mcp = FastMCP(
    name="EduAgent-KnowledgeBase",
    stateless_http=True,
    json_response=True,
)
```

**参数详解**：

| 参数 | 值 | 说明 |
|------|-----|------|
| `name` | `"EduAgent-KnowledgeBase"` | Server 标识符，客户端通过此名称找到对应工具 |
| `stateless_http` | `True` | 无状态模式，每次请求完全自包含，无需建立 session。适合 Agent 调用——Agent 不需要维护与 MCP Server 的连接状态 |
| `json_response` | `True` | 响应格式为 JSON，工具返回值自动序列化为 JSON 字符串放入 TextContent |

### 2.3 `search_knowledge_base` 工具（第 32~96 行）

```python
# knowledge_base_server.py 第 32~96 行
@mcp.tool()
async def search_knowledge_base(
    query: str,
    tenant_id: str,
    course_id: str | None = None,
    top_k: int = 3,
) -> list[dict]:
    """
    Hybrid semantic + keyword search over the EduAgent Milvus knowledge base.
    ...
    """
    from backend.core.reranker import retrieve
    from backend.core.logger import get_logger
    logger = get_logger(__name__)

    loop = asyncio.get_running_loop()
    ranked_docs, confidence = await loop.run_in_executor(
        None,
        lambda: retrieve(query=query, tenant_id=tenant_id,
                         course_id=course_id, rerank_top_k=top_k),
    )

    logger.info("kb_mcp.search_done", query_preview=query[:50],
                hits=len(ranked_docs), confidence=round(confidence, 4))

    return [
        {
            "content":            doc.content,
            "source_name":        doc.metadata.get("source_name", ""),
            "score":              round(doc.score, 6),
            "confidence":         round(confidence, 4),
            "is_high_confidence": confidence >= 0.75,
        }
        for doc in ranked_docs
    ]
```

#### 2.3.1 逐行精读

| 行号 | 代码 | 说明 |
|------|------|------|
| 32 | `@mcp.tool()` | FastMCP 装饰器，自动完成三件事：① 注册为 MCP 工具 ② 从函数签名生成 JSON Schema ③ 从 docstring 生成工具描述 |
| 33~38 | 函数签名 | `query: str`（必填）、`tenant_id: str`（必填）、`course_id: str\|None`（可选过滤）、`top_k: int=3`（返回文档数） |
| 59~62 | `from backend.core.reranker import retrieve` | **延迟导入**：避免模块加载时触发 `reranker.py` 的导入（BGE-Reranker 模型加载约 5~10 秒，等第一次调用时再加载） |
| 69 | `loop = asyncio.get_running_loop()` | 获取当前事件循环，必须在 async 函数中调用，否则抛出 `RuntimeError` |
| 70~78 | `await loop.run_in_executor(None, lambda: retrieve(...))` | 把同步的 CPU 密集操作（BGE-M3 编码、CrossEncoder 推理）交给线程池，不阻塞事件循环 |
| 80~85 | `logger.info(...)` | 记录搜索完成日志：query 前缀、命中数、置信度 |
| 87~96 | `return [...]` | 列表推导式格式化结果，每个文档含 `content` / `source_name` / `score` / `confidence` / `is_high_confidence` |

**`@mcp.tool()` 自动完成的三件事**：
1. 将函数注册为 MCP 工具，名称自动为 `search_knowledge_base`
2. 从函数签名生成 JSON Schema（`query`: string, `tenant_id`: string, `course_id`: string|null, `top_k`: integer）
3. 从 docstring 生成工具描述

**`run_in_executor` 参数说明**：

| 参数 | 值 | 说明 |
|------|-----|------|
| 第一个参数 | `None` | 使用默认线程池（`ThreadPoolExecutor`） |
| 第二个参数 | `lambda` | 要执行的同步函数 |

**返回字段说明**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `content` | `str` | chunk 文本 |
| `source_name` | `str` | 来源文档名称和章节 |
| `score` | `float` | Reranker 评分，保留 6 位小数 |
| `confidence` | `float` | Top-1 置信度，保留 4 位小数 |
| `is_high_confidence` | `bool` | `confidence >= 0.75` 的判断结果 |

### 2.4 独立运行入口（第 99~108 行）

```python
# knowledge_base_server.py 第 99~108 行
if __name__ == "__main__":
    import uvicorn
    from dotenv import load_dotenv

    sys.path.insert(0, str(__file__).split("/backend/")[0])
    load_dotenv(".env.local")

    port = int(os.getenv("KB_MCP_SERVER_PORT", "8001"))
    print(f"Knowledge Base MCP Server → http://localhost:{port}/mcp")
    uvicorn.run(mcp.streamable_http_app(), host="0.0.0.0", port=port)
```

**`mcp.streamable_http_app()`**：FastMCP 提供的 ASGI 应用，兼容 FastAPI/Starlette 的 `mount()` 和 uvicorn 运行。端口配置：环境变量 `KB_MCP_SERVER_PORT`，默认 8001。

---

## 三、`web_search_server.py`（139 行）：网页搜索 MCP 服务

### 3.1 文件头精读（第 1~8 行）

```python
# web_search_server.py 第 1~8 行
"""MCP Server - 网页搜索服务"""
# backend/mcp/web_search_server.py
# MCP（Model Context Protocol）网页搜索服务。
#
# 双后端设计：
#   - Tavily（首选）：结构化搜索结果，需 TAVILY_API_KEY
#   - DuckDuckGo（降级）：免费，无需 API key
# 自动选择：有 Tavily Key 则用 Tavily，失败后降级 DuckDuckGo。
```

**双后端设计**：

| 后端 | 优先级 | API Key | 特点 |
|------|--------|---------|------|
| Tavily | 首选 | 需要 `TAVILY_API_KEY` | 结构化结果，稳定，速度较快 |
| DuckDuckGo | 降级 | 不需要 | 免费，不需要 API key，但结果不如 Tavily 结构化 |

### 3.2 FastMCP 实例化（第 17~21 行）

```python
# web_search_server.py 第 17~21 行
mcp = FastMCP(
    name="EduAgent-WebSearch",
    stateless_http=True,
    json_response=True,
)
```

和 `knowledge_base_server.py` 一样的配置，只是 `name` 不同。

### 3.3 `_search_tavily`：Tavily 搜索（第 26~58 行）

```python
# web_search_server.py 第 26~58 行
async def _search_tavily(query: str, max_results: int, api_key: str) -> list[dict]:
    """
    Tavily 搜索（结构化结果，需 API key，https://tavily.com）。
    """
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            "https://api.tavily.com/search",
            json={
                "api_key":             api_key,
                "query":               query,
                "max_results":         max_results,
                "include_answer":      False,
                "include_raw_content": False,
            },
        )
        resp.raise_for_status()
    return [
        {
            "title":   r.get("title", ""),
            "url":     r.get("url", ""),
            "snippet": r.get("content", "")[:500],
            "content": r.get("content", ""),
        }
        for r in resp.json().get("results", [])
    ]
```

#### 3.3.1 逐行精读

| 行号 | 代码 | 说明 |
|------|------|------|
| 26~58 | `async def _search_tavily(...)` | Tavily 搜索后端，专为 AI Agent 设计的搜索引擎，返回结构化结果 |
| 38 | `async with httpx.AsyncClient(timeout=15.0)` | 异步 HTTP 客户端，超时 15 秒 |
| 39~48 | `await client.post(...)` | POST 请求 Tavily API，`include_answer=False` 节约 token，`include_raw_content=False` snippet 足够 |
| 49 | `resp.raise_for_status()` | 非 2xx 状态码抛出 `httpx.HTTPStatusError`，由调用方捕获降级到 DuckDuckGo |
| 50~58 | `return [...]` | 提取 `title`、`url`、`content`，`snippet` 截断到 500 字符 |

**Tavily API 参数说明**：

| 参数 | 值 | 说明 |
|------|-----|------|
| `include_answer` | `False` | 不需要 AI 总结，节约 token，只要原始结果 |
| `include_raw_content` | `False` | 不需要原始内容，snippet 足够 |

### 3.4 `_search_duckduckgo`：DuckDuckGo 搜索（第 61~81 行）

```python
# web_search_server.py 第 61~81 行
async def _search_duckduckgo(query: str, max_results: int) -> list[dict]:
    """DuckDuckGo 搜索（免费，无需 API key）"""
    from duckduckgo_search import DDGS

    def _sync_search() -> list[dict]:
        results = []
        with DDGS() as ddgs:
            for r in ddgs.text(query, max_results=max_results):
                results.append({
                    "title":   r.get("title", ""),
                    "url":     r.get("href", ""),
                    "snippet": r.get("body", "")[:500],
                    "content": r.get("body", ""),
                })
        return results

    return await asyncio.to_thread(_sync_search)
```

#### 3.4.1 逐行精读

| 行号 | 代码 | 说明 |
|------|------|------|
| 61~81 | `async def _search_duckduckgo(...)` | DuckDuckGo 搜索后端，免费，无需 API key |
| 67 | `from duckduckgo_search import DDGS` | 函数内部 import，延迟加载库 |
| 69~79 | `def _sync_search()` | 同步搜索函数，`duckduckgo-search 6.x+` 移除了 `AsyncDDGS`，统一使用同步 `DDGS` |
| 71 | `with DDGS() as ddgs` | 上下文管理器，自动管理连接资源 |
| 72~78 | `ddgs.text(query, ...)` | 同步搜索调用，提取 `title` / `href`（DuckDuckGo 用 `href` 不是 `url`）/ `body` |
| 81 | `return await asyncio.to_thread(_sync_search)` | `asyncio.to_thread`：Python 3.9+ 内置线程池包装器，等价于 `loop.run_in_executor(None, ...)`，避免阻塞事件循环 |

**字段映射**：

| DuckDuckGo 字段 | 输出字段 | 说明 |
|----------------|---------|------|
| `title` | `title` | 标题 |
| `href` | `url` | 链接（DuckDuckGo 用 `href` 不是 `url`） |
| `body` | `content` / `snippet` | 内容摘要 |

### 3.5 `web_search` MCP 工具（第 86~127 行）

```python
# web_search_server.py 第 86~127 行
@mcp.tool()
async def web_search(
    query: str,
    max_results: int = 5,
) -> list[dict]:
    """
    Search the web for current information not available in the knowledge base.
    """
    from backend.config import get_settings
    from backend.core.logger import get_logger

    logger = get_logger(__name__)
    settings = get_settings()

    # 优先 Tavily，失败后降级 DuckDuckGo
    if settings.tavily_api_key:
        try:
            results = await _search_tavily(query, max_results, settings.tavily_api_key)
            logger.info("web_search_mcp.tavily_done", hits=len(results))
            return results
        except Exception as e:
            logger.warning("web_search_mcp.tavily_failed", error=str(e))

    # Tavily 不可用或失败 → 降级 DuckDuckGo
    try:
        results = await _search_duckduckgo(query, max_results)
        logger.info("web_search_mcp.ddgs_done", hits=len(results))
        return results
    except Exception as e:
        logger.error("web_search_mcp.ddgs_failed", error=str(e))
        return []  # 搜索全部失败时返回空列表
```

#### 3.5.1 逐行精读

| 行号 | 代码 | 说明 |
|------|------|------|
| 86 | `@mcp.tool()` | FastMCP 装饰器，注册为 `web_search` 工具 |
| 87~90 | 函数签名 | `query: str`（必填）、`max_results: int=5`（默认返回 5 条） |
| 105~109 | 延迟导入 | `get_settings()` 读取配置（含 `tavily_api_key`），`get_logger()` 获取日志器 |
| 112 | `if settings.tavily_api_key:` | **有 Key 才尝试 Tavily**，没有 Key 直接跳 DuckDuckGo |
| 113~118 | `try: ... except:` | Tavily 失败时打印 warning 日志，继续降级 |
| 120~126 | `try: ... except:` | DuckDuckGo 降级，失败时打印 error 日志，返回空列表 |

**降级逻辑流程图**：

```
是否有 TAVILY_API_KEY？
  ├─ YES → 调用 Tavily
  │         ├─ 成功 → 返回 Tavily 结果
  │         └─ 失败 → 降级 DuckDuckGo
  └─ NO  → 直接 DuckDuckGo
            ├─ 成功 → 返回 DuckDuckGo 结果
            └─ 失败 → 返回空列表
```

**`except Exception as e`**：捕获所有异常类型（网络超时、HTTP 错误、JSON 解析错误等），确保降级路径一定能走通。

**日志记录**：

| 事件 | 触发条件 | 级别 |
|------|---------|------|
| `web_search_mcp.tavily_done` | Tavily 搜索成功 | info |
| `web_search_mcp.tavily_failed` | Tavily 搜索失败 | warning |
| `web_search_mcp.ddgs_done` | DuckDuckGo 搜索成功 | info |
| `web_search_mcp.ddgs_failed` | DuckDuckGo 搜索失败（最终失败） | error |

### 3.6 独立运行入口（第 130~139 行）

```python
# web_search_server.py 第 130~139 行
if __name__ == "__main__":
    import uvicorn
    from dotenv import load_dotenv

    sys.path.insert(0, str(__file__).split("/backend/")[0])
    load_dotenv(".env.local")

    port = int(os.getenv("WEB_SEARCH_MCP_SERVER_PORT", "8002"))
    print(f"Web Search MCP Server → http://localhost:{port}/mcp")
    uvicorn.run(mcp.streamable_http_app(), host="0.0.0.0", port=port)
```

端口配置：环境变量 `WEB_SEARCH_MCP_SERVER_PORT`，默认 8002。

---

## 四、`client.py`（118 行）：MCP 客户端

### 4.1 文件头精读（第 1~19 行）

```python
# client.py 第 1~19 行
"""MCP 客户端"""
# backend/mcp/client.py
# MCP（Model Context Protocol）客户端，用于调用 MCP Server 的工具。
#
# MCP 协议基于 JSON-RPC 2.0：
#   - 请求：{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "...", "arguments": {...}}}
#   - 响应：{"jsonrpc": "2.0", "id": 1, "result": {"content": [{"type": "text", "text": "..."}]}}
#
# stateless_http=True 的 Server 每次 POST 完全自包含，无需先发 initialize 握手。
# 只需 POST /mcp 即可调用工具。
```

**与标准 MCP 的区别**：标准 MCP 协议需要先发 `initialize` 握手建立 session，然后才能调用工具。`stateless_http=True` 模式下，每次请求都是独立的，不需要握手。客户端只需要 POST 到 `/mcp` 端点即可。

### 4.2 `call_mcp_tool`：JSON-RPC 调用（第 22~102 行）

```python
# client.py 第 22~102 行
async def call_mcp_tool(
    server_url: str,
    tool_name: str,
    arguments: dict[str, Any],
    timeout: float = 30.0,
) -> Any:
    """
    调用 stateless MCP Server 的单个工具。
    """
    # 构建 JSON-RPC 2.0 请求体
    payload = {
        "jsonrpc": "2.0",
        "id":      1,
        "method":  "tools/call",
        "params": {
            "name":      tool_name,
            "arguments": arguments,
        },
    }

    headers = {
        "Content-Type": "application/json",
        "Accept":        "application/json",
    }

    async with httpx.AsyncClient(timeout=timeout, trust_env=False) as client:
        resp = await client.post(f"{server_url}/mcp", json=payload, headers=headers)
        resp.raise_for_status()

    data = resp.json()

    if "error" in data:
        raise ValueError(
            f"MCP tool '{tool_name}' error: {data['error'].get('message', str(data['error']))}"
        )

    content = data.get("result", {}).get("content", [])
    if not content:
        return []

    items = []
    for item in content:
        if not isinstance(item, dict):
            continue
        text = item.get("text", "")
        if not text:
            continue
        try:
            parsed = json.loads(text)
        except (json.JSONDecodeError, TypeError):
            parsed = text
        if isinstance(parsed, list):
            return parsed
        items.append(parsed)

    return items if items else content
```

#### 4.2.1 逐行精读

| 行号 | 代码 | 说明 |
|------|------|------|
| 22~27 | 函数签名 | `server_url`（MCP Server 基础 URL）、`tool_name`（工具名称）、`arguments`（工具参数字典）、`timeout=30.0`（超时秒数） |
| 47~56 | 构建 payload | JSON-RPC 2.0 请求体：`jsonrpc: "2.0"`、`id: 1`（stateless 模式固定为 1）、`method: "tools/call"`、`params: {name, arguments}` |
| 60~63 | 设置 headers | `Content-Type: application/json`、`Accept: application/json`（`json_response=True` 的 Server 要求此头，否则返回 `-32600` 错误） |
| 67~69 | 发送 HTTP 请求 | `trust_env=False` 禁止 httpx 读取代理环境变量，避免 localhost 内部调用被代理污染；`f"{server_url}/mcp"` 拼接完整端点 |
| 73~77 | JSON-RPC 错误检查 | 即使 HTTP 状态码 200，响应体也可能含 `error` 字段，表示工具执行时抛异常 |
| 83~85 | 空 content 处理 | `content` 为空时返回空列表 |
| 87~102 | 解析 content | 遍历所有 content 条目，兼容 FastMCP 两种序列化行为 |

**`"id": 1`**：JSON-RPC 请求 ID。因为是 stateless 模式，每次请求独立，ID 固定为 1 即可。在标准 MCP 中，ID 需要递增以匹配请求和响应。

**`trust_env=False`**：禁止 httpx 读取 `HTTP_PROXY`、`ALL_PROXY`、`HTTPS_PROXY` 等环境变量。对 localhost 的内部调用永远不需要代理，避免代理配置污染导致连接失败。

#### 4.2.2 Content 解析策略（第 79~102 行）

FastMCP 对 `list[dict]` 有两种序列化行为：

```python
# 行为 1：每个 dict 单独一个 TextContent（最常见）
"content": [
    {"type": "text", "text": '{"content": "文档1...", "score": 0.95}'},
    {"type": "text", "text": '{"content": "文档2...", "score": 0.83}'},
]

# 行为 2：整个列表序列化成一个 TextContent（部分版本）
"content": [
    {"type": "text", "text": '[{"content": "文档1...", "score": 0.95}, {"content": "文档2...", "score": 0.83}]'}
]
```

**解析步骤**：

| 步骤 | 代码 | 说明 |
|------|------|------|
| ① 遍历 | `for item in content:` | 遍历所有 content 条目，不取 `content[0]` |
| ② 类型检查 | `if not isinstance(item, dict): continue` | 跳过非 dict 条目 |
| ③ 文本提取 | `text = item.get("text", "")` | 提取 `text` 字段 |
| ④ JSON 解析 | `json.loads(text)` | 尝试反序列化 JSON 字符串 |
| ⑤ 列表检测 | `if isinstance(parsed, list): return parsed` | 整个列表在一个 TextContent 中，直接返回 |
| ⑥ 逐条收集 | `items.append(parsed)` | 否则收集到列表中 |

**兜底**：`return items if items else content`。如果所有解析都失败（`items` 为空），返回原始的 `content` 列表，让调用方自己处理。

### 4.3 `list_mcp_tools`：列出工具（第 105~118 行）

```python
# client.py 第 105~118 行
async def list_mcp_tools(server_url: str, timeout: float = 10.0) -> list[dict]:
    """
    列出 MCP Server 提供的所有工具（调试 / 验证用）。

    Returns:
        工具列表，每项含 name / description / inputSchema
    """
    payload = {"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}
    headers = {"Content-Type": "application/json", "Accept": "application/json"}

    async with httpx.AsyncClient(timeout=timeout, trust_env=False) as client:
        resp = await client.post(f"{server_url}/mcp", json=payload, headers=headers)
        resp.raise_for_status()

    return resp.json().get("result", {}).get("tools", [])
```

#### 4.3.1 逐行精读

| 行号 | 代码 | 说明 |
|------|------|------|
| 105~106 | 函数签名 | `server_url`（MCP Server 基础 URL）、`timeout=10.0`（默认 10 秒超时） |
| 112 | `payload = {...}` | JSON-RPC 方法 `"tools/list"`，无参数 |
| 113 | `headers = {...}` | 与 `call_mcp_tool` 相同的请求头 |
| 115~117 | HTTP 请求 | 与 `call_mcp_tool` 相同的请求模式 |
| 119 | `return ...` | 从 `result.tools` 提取工具列表 |

**`tools/list` 方法**：JSON-RPC 内省方法，返回 Server 注册的所有工具信息。

**返回值示例**：

```python
[
    {
        "name": "search_knowledge_base",
        "description": "Hybrid semantic + keyword search over the EduAgent Milvus knowledge base.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "tenant_id": {"type": "string"},
                "course_id": {"type": "string", "nullable": True},
                "top_k": {"type": "integer", "default": 3}
            },
            "required": ["query", "tenant_id"]
        }
    }
]
```

---

## 五、完整数据流

```
用户提问："商品双塔召回怎么实现？"
          │
          ▼
QA Agent classify_query_node
          │
          ├─ 意图分类 → "specialized"
          │
          ▼
QA Agent retrieve_node
          │
          ├─ 调用 call_mcp_tool()
          │    server_url = "http://localhost:8001"
          │    tool_name = "search_knowledge_base"
          │    arguments = {"query": "商品双塔召回", "tenant_id": "default"}
          │
          ▼
Knowledge Base MCP Server (port 8001)
          │
          ├─ run_in_executor → retrieve()
          │    ├─ BGE-M3 编码
          │    ├─ Milvus Hybrid 检索
          │    └─ BGE-Reranker 精排
          │
          ├─ 返回 list[RankedDocument]
          │
          ▼
call_mcp_tool() 解析 content
          │
          └─ 返回 list[dict] ← 每个文档含 content / score / source_name
          │
          ▼
QA Agent generate_node
          │
          ├─ 置信度 ≥ 0.75 → 基于知识库生成
          └─ 置信度 < 0.75 → 调用 web_search MCP 工具
               │
               ▼
               Web Search MCP Server (port 8002)
                    │
                    ├─ 有 TAVILY_API_KEY → Tavily 搜索
                    └─ 无或失败 → DuckDuckGo 搜索
```

---

## 六、★ Insight ─── 设计亮点总结

### 6.1 双 MCP Server 架构

知识库和网页搜索拆成两个独立的 MCP Server，独立部署、独立扩缩容。知识库服务依赖 Milvus，网页搜索服务依赖外部 API，拆开可以各自管理资源。

### 6.2 `stateless_http=True` 无状态模式

每次请求完全自包含，无需先发 `initialize` 握手。Agent 不需要维护与 MCP Server 的连接状态，简化调用逻辑。

### 6.3 `run_in_executor` 避免阻塞事件循环

```python
loop = asyncio.get_running_loop()
ranked_docs, confidence = await loop.run_in_executor(None, lambda: retrieve(...))
```

同步的 CPU 密集操作（BGE-M3 编码、CrossEncoder 推理）通过线程池执行，不阻塞事件循环。

### 6.4 Tavily + DuckDuckGo 双后端降级

```
Tavily（首选）→ 失败 → DuckDuckGo（降级）→ 失败 → 空列表
```

有 API key 时用 Tavily 获得高质量结果，没有或失败时自动降级到 DuckDuckGo，保证服务可用性。

### 6.5 Content 解析兼容两种序列化

FastMCP 的序列化行为在不同版本中不一致，`call_mcp_tool` 兼容两种方式：每个 dict 单独一个 TextContent，或整个列表序列化成一个 TextContent。

### 6.6 `trust_env=False` 防止代理污染

对 localhost 的内部调用永远不需要代理，禁止 httpx 读取代理环境变量，避免代理配置污染导致连接失败。

### 6.7 `json_response=True` 服务端预计算

`is_high_confidence` 布尔值由服务端计算，客户端不需要实现阈值判断逻辑。业务逻辑集中在服务端，客户端只管消费。

### 6.8 延迟导入

```python
from backend.core.reranker import retrieve
```

模型导入放在函数内部，MCP Server 启动时先加载 FastMCP 框架，等第一次调用时再加载模型。

### 6.9 结构化的搜索结果

| 字段 | 知识库 MCP | 网页搜索 MCP |
|------|-----------|-------------|
| `content` | chunk 文本 | 内容摘要 |
| `source_name` | 文档来源 | 标题 |
| `score` | Reranker 评分 | — |
| `confidence` | Top-1 置信度 | — |
| `is_high_confidence` | 阈值判断 | — |
| `url` | — | 链接 |
| `snippet` | — | 截断摘要（500 字符） |