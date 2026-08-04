---
author: XunZong
created: 2026-08-04
tags:
  - AI-Agent
  - 工程实践
  - MCP
aliases:
  - MCP
  - Model Context Protocol
  - MCP Server
  - MCP Client
  - MCP工具
---

# MCP 模型通信协议

## 定义

MCP（Model Context Protocol）是 Anthropic 制定的开放标准协议，定义 Agent 发现和调用外部工具的统一方式。核心思想是"把工具调用标准化"——Agent 不需要知道工具是谁写的、部署在哪里，只需通过标准接口发现和调用工具。

在没有 MCP 之前，每个工具都要写一套定制代码：搜索引擎有搜索引擎的调用方式，数据库有数据库的调用方式，换一个 Agent 框架，这套代码还要重写一遍。MCP 通过标准化的 JSON-RPC 通信解决了这个问题：

$$ \text{Agent} \xrightarrow{\text{tools/list}} \text{MCP Server} \xrightarrow{\text{返回工具列表}} \text{Agent} \xrightarrow{\text{tools/call}} \text{MCP Server} \xrightarrow{\text{返回结果}} \text{Agent} $$

MCP 协议的核心是两条消息：
- **tools/list**：Agent 发现 MCP Server 提供了哪些工具
- **tools/call**：Agent 调用某个具体工具，传入参数，获取结果

## 架构

### 知识库 MCP Server

封装混合检索（稠密向量 + 稀疏向量 + 重排序）为 MCP 工具，供 LLM 调用：

```python
import asyncio
from fastmcp import FastMCP

# 创建 MCP Server，命名为 knowledge 以便在 Agent 中路由
mcp = FastMCP("knowledge")

@mcp.tool()
async def hybrid_search(query: str, top_k: int = 5):
    """混合检索知识库，返回最相关的文档片段"""
    # 1. 稠密检索（Dense Retrieval）：query → embedding → 向量相似度
    dense_hits = await dense_search(query, top_k)

    # 2. 稀疏检索（Sparse Retrieval）：query → BM25 → 关键词匹配
    sparse_hits = await sparse_search(query, top_k)

    # 3. 混合融合（Hybrid Fusion）：按权重合并两组结果
    merged = reciprocal_rank_fusion(dense_hits, sparse_hits, k=60)

    # 4. 重排序（Rerank）：用交叉编码器对 Top-60 精排
    reranked = await reranker.rerank(merged, query)

    return reranked[:top_k]
```

### Web 搜索 MCP Server

为低置信度分支提供互联网搜索能力，支持两个后端：

```python
web_mcp = FastMCP("web_search")

@web_mcp.tool()
async def search_web(query: str, backend: str = "tavily"):
    """搜索互联网获取最新信息"""
    if backend == "tavily":
        return await tavily_search(query)
    else:
        return await duckduckgo_search(query)
```

### MCP Client

Agent 节点通过 MCP Client 调用 MCP Server，无需关心 JSON-RPC 细节：

```python
async def call_mcp_tool(server_url: str, tool_name: str, args: dict):
    """通过 MCP 协议调用工具"""
    async with Client(server_url) as session:
        result = await session.call_tool(tool_name, args)
        return result
```

## 部署方式

MCP Server 有两种运行方式：

| 方式 | 说明 | 端点 URL |
|:----|:-----|:---------|
| **独立运行** | MCP 作为独立进程启动 | `http://localhost:8000` |
| **挂载到 FastAPI** | 通过 `app.mount()` 挂载到主进程 | `http://localhost:8000/{agent_name}/mcp` |

两种方式的端点 URL 不同，这是理解测试流程的关键。

## ML/DL 应用场景

| 应用场景 | 使用的 MCP 工具 | 说明 |
|:--------:|:---------------|:------|
| **RAG 问答** | 知识库 MCP Server（hybrid_search） | LLM 在回答问题时调用知识库检索，获取相关文档片段作为上下文 |
| **实时信息查询** | Web 搜索 MCP Server（search_web） | 当知识库中无匹配结果时，切换到互联网搜索，确保回答的时效性 |
| **多工具编排** | 两种 MCP Server 配合 | Orchestrator 根据问题类型选择合适的 MCP 工具，低置信度走 Web 搜索 |
| **跨框架复用** | 标准 MCP 协议 | 同一个 MCP Server 可在 LangChain、AutoGen、CrewAI 等框架中直接使用 |

## 面试追问

**Q1（基础）**：MCP 协议解决了什么问题？它的两条核心消息是什么？
**回答要点**：

1. 解决了工具调用标准化问题——每个工具写一套定制代码，换框架还要重写
2. tools/list：Agent 发现 MCP Server 提供了哪些工具
3. tools/call：Agent 调用具体工具，传入参数并获取结果
4. MCP 通过 JSON-RPC 标准通信，跨框架可复用

**Q2（深挖）**：知识库 MCP Server 中的 hybrid_search 函数为什么需要先做混合检索再做重排序？为什么不在 MCP 内部做而要让 Agent 调用？
**回答要点**：

1. MCP 工具屏蔽了检索的复杂性——Agent 只需要传入 query 和 top_k，不需要关心内部是稠密还是稀疏
2. 混合检索（稠密+稀疏）保证召回率，重排序（Reranker）保证精度，两者互补
3. MCP 封装的是"完整的结果"，Agent 层不需要分步调用，简化了 Agent 的编排逻辑

**Q3（实战）**：独立运行和挂载到 FastAPI 两种部署方式各有什么优缺点？测试时需要注意什么？
**回答要点**：

1. 独立运行：便于单独调试 MCP Server，但需要额外管理进程生命周期
2. 挂载到 FastAPI：集成到主进程统一管理，但端点 URL 会变化（追加 /{agent_name}/mcp 路径）
3. 测试流程：先独立测试每个 MCP Server，确认工具调用正常，再挂载到 FastAPI 做集成测试
4. 两种方式的端点 URL 不同，不能在集成测试中继续使用独立运行的端点地址

**Q4（边界）**：MCP Server 在高并发场景下可能遇到什么性能瓶颈？如何优化？
**回答要点**：

1. 知识库 MCP Server 中的混合检索涉及向量搜索 + BM25 + Reranker，单次调用延迟较高
2. 高并发时，多个 Agent 同时调用知识库 MCP Server 可能导致请求排队
3. 优化方案：为 MCP Server 配置连接池、使用异步处理、对 Reranker 做批处理
4. 更进一步的优化：对高频查询做缓存，避免重复检索

## 参考引用

- 需要理解 MCP 插件集成与工具池组装的相关知识，参见 [MCP 插件集成](../基础设施/05-Multi-Agent-Platform/03-MCP插件集成.md)
- 需要理解 Orchestrator 如何编排 MCP 工具调用，参见 [Orchestrator编排器设计](../系统/07-Orchestrator编排器设计.md)
- 需要理解混合检索与重排序的实现细节，参见 [混合检索与重排序](../../数据库/检索/02-混合检索与重排序.md)
- 需要理解批量 MCP 工具调用如何提升效率，参见 [Office 批量工具调用模式](../../AI-Agent/基础设施/01-Tools-Execution/02-工具分发系统.md)