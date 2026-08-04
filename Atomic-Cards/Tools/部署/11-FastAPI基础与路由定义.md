---
author: "XunZong"
created: "2026-08-04"
tags: ["工程实践", "FastAPI", "路由", "Pydantic", "API设计"]
aliases: ["FastAPI基础", "路由定义", "Pydantic模型", "API文档", "FastAPI速成"]
---

# FastAPI 基础与路由定义

## 定义

FastAPI 是一个现代 Python Web 框架，在 EduAgent 中担任**API 层**角色——系统对外的"大门"。前端发来的每一个请求（登录、提问、上传简历）都先经过 FastAPI。它负责接收并校验请求、调用业务逻辑、返回响应。

FastAPI 的两大招牌优势：
- **自动 API 文档**：基于 OpenAPI 标准，自动生成可交互的 `/docs` 页面
- **Pydantic 集成**：用 Python 类型注解定义请求体和响应模型，自动校验

## 路由定义

```python
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="EduAgent API", version="1.0.0")

# 路径参数：从 URL 路径中获取参数
@app.get("/users/{user_id}")
async def get_user(user_id: int):
    return {"user_id": user_id}

# 查询参数：从 URL 问号后获取参数
@app.get("/search")
async def search(q: str, limit: int = 10):
    return {"query": q, "results": limit}
```

## Pydantic 请求/响应模型

```python
class QuestionRequest(BaseModel):
    question: str
    session_id: str | None = None

class AnswerResponse(BaseModel):
    answer: str
    sources: list[str] = []

@app.post("/qa/ask", response_model=AnswerResponse)
async def ask_question(req: QuestionRequest):
    # FastAPI 自动校验 req 的字段类型
    # 自动生成 OpenAPI 文档
    return AnswerResponse(answer="...", sources=[])
```

## 自动 API 文档

启动应用后访问 `http://localhost:8000/docs`，FastAPI 自动生成**可交互的 API 文档页面**，可直接在网页上点按钮测试每个接口。基于 OpenAPI 标准，所有路由、请求模型、响应模型自动生成文档。

## ML/DL 应用场景

| 应用场景 | FastAPI 功能 | 说明 |
|:--------:|:------------|:------|
| **模型推理 API** | POST 路由 + Pydantic 模型 | 接收输入数据，调用模型推理，返回结构化结果 |
| **Agent 服务** | 路径参数路由 | 按 Agent 类型路由到不同处理逻辑（如 `/resume/upload`、`/exam/grade`） |
| **流式问答** | SSE 流式响应 | 结合 `StreamingResponse` 实现 LLM 逐字输出 |
| **文件处理** | UploadFile 文件上传 | 接收 PDF/Word 等文件，进行文档解析和索引 |

## 面试追问

**Q1（基础）**：FastAPI 在 EduAgent 项目中扮演什么角色？它的两大招牌优势是什么？
**回答要点**：
1. FastAPI 是 API 层，系统对外的"大门"，所有前端请求都先经过它
2. 自动 API 文档：基于 OpenAPI 标准，自动生成可交互的 `/docs` 页面
3. Pydantic 集成：用 Python 类型注解定义模型，自动校验请求和响应格式

**Q2（深挖）**：FastAPI 的路径参数和查询参数有什么区别？分别在什么场景使用？
**回答要点**：
1. 路径参数：从 URL 路径中获取，如 `/users/{user_id}`，用于标识资源
2. 查询参数：从 URL 问号后获取，如 `/search?q=hello`，用于筛选和分页
3. 路径参数适合唯一标识资源（如用户 ID），查询参数适合可选条件（如搜索关键词、页码）

**Q3（实战）**：Pydantic 模型在 FastAPI 中如何实现请求校验？如果前端传了非法字段会怎样？
**回答要点**：
1. 在路由函数的参数中声明 Pydantic 模型类型，FastAPI 自动解析和校验请求体
2. 字段类型不匹配时（如 int 字段传了字符串），FastAPI 自动返回 422 状态码和错误详情
3. Pydantic 支持可选字段（`Optional`）、默认值、字段校验（`Field(ge=0)`）等高级功能

**Q4（边界）**：FastAPI 的自动文档有什么限制？生产环境中如何保护 API 文档不泄露？
**回答要点**：
1. `/docs` 默认公开，生产环境应有访问控制（如添加认证中间件）
2. 可通过 `docs_url=None` 禁用自动文档，或使用 `swagger_ui_parameters` 限制访问
3. 生产环境建议使用独立的 API 网关（如 Nginx）对外暴露，FastAPI 只监听内网端口

## 参考引用

- 需要理解 FastAPI 依赖注入的详细用法，参见 [FastAPI依赖注入](07-FastAPI依赖注入.md)
- 需要理解 FastAPI 文件上传与后台任务的处理模式，参见 [FastAPI文件上传与202后台任务模式](09-FastAPI文件上传与202后台任务模式.md)
- 需要理解 SSE 流式响应的实现方式，参见 [FastAPI SSE流式响应](10-FastAPI%20SSE流式响应.md)
- 需要理解 Pydantic 数据建模与结构化输出的用法，参见 [Pydantic数据建模与结构化输出](../../Python/Pydantic/01-Pydantic数据建模与结构化输出.md)