---
author: "XunZong"
created: "2026-07-30"
tags: ["工程", "FastAPI", "Depends", "SSE", "依赖注入"]
aliases: ["FastAPI依赖注入", "Depends", "SSE流式", "EventSourceResponse", "yield依赖"]
---

# FastAPI 高级特性：依赖注入与SSE流式响应

## 定义

FastAPI 在 EduAgent 中扮演 **API 层**（系统对外的"大门"），负责接收请求、校验数据、调用业务逻辑、返回结果。两个最核心的高级特性是**依赖注入（Depends）** 和 **SSE 流式响应**。

## 依赖注入（Depends）

### 定义

**依赖注入** 把通用的前置逻辑（如获取数据库连接、校验登录）写成一个函数，在接口参数里用 `Depends(依赖函数)` 声明，FastAPI 在执行接口前**自动先跑依赖、把结果喂给接口**。

### 项目两个最重要的依赖

**依赖一：get_db —— 获取数据库会话**

```python
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session            # yield 之前=准备连接；把 session 交给接口用
            await session.commit()   # 接口正常结束后：提交事务
        except Exception:
            await session.rollback() # 出错则回滚
            raise
```

**yield 型依赖的执行顺序**：
- `yield` 之前：创建数据库连接（准备阶段）
- `yield` 之后：接口正常执行 → `commit()` 提交事务；异常 → `rollback()` 回滚

**依赖二：get_current_user —— 校验登录**

```python
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

bearer_scheme = HTTPBearer()

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    token = credentials.credentials
    user = verify_jwt(token)              # 解析并校验 JWT
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的认证凭证",
        )
    return {"user_id": user["id"], "role": user["role"]}
```

**在接口里使用两个依赖**：

```python
@app.get("/my-reviews")
async def my_reviews(
    db = Depends(get_db),                             # 自动注入数据库会话
    current_user: dict = Depends(get_current_user),   # 自动注入当前用户（顺便完成鉴权）
):
    # 走到这里，说明用户已登录，且 db 已就绪
    return {"user": current_user["user_id"], "data": "..."}
```

这个接口什么校验代码都没写，但因为声明了 `Depends(get_current_user)`，**未登录的请求会被自动挡在 401**。

## SSE 流式响应

### 定义

**SSE（Server-Sent Events，服务器推送事件）** 让服务器和浏览器保持连接，持续不断地往外推送一小段一小段内容，实现"打字机"效果。

### 实现方式

FastAPI 用 `sse-starlette` 库的 `EventSourceResponse` 实现：

```python
import asyncio
import json
from fastapi import FastAPI
from sse_starlette.sse import EventSourceResponse

app = FastAPI()

@app.post("/chat/stream")
async def chat_stream():
    async def event_generator():
        answer = "装饰器是一种包装函数的语法。"
        for char in answer:                       # 模拟逐字生成
            await asyncio.sleep(0.1)
            yield {"data": json.dumps({"type": "token", "content": char})}
        yield {"data": json.dumps({"type": "done"})}   # 结束标志

    return EventSourceResponse(event_generator())
```

### 与大模型串联

真实场景中，`for char in answer` 换成大模型的流式输出：

```python
@app.post("/qa/stream")
async def qa_stream(question: str):
    async def event_generator():
        messages = [HumanMessage(content=question)]
        async for chunk in llm.astream(messages):
            if chunk.text:
                yield {"data": json.dumps({"type": "token", "content": chunk.text})}
        yield {"data": json.dumps({"type": "done"})}

    return EventSourceResponse(event_generator())
```

## 文件上传与后台任务

```python
from fastapi import FastAPI, File, UploadFile

app = FastAPI()

@app.post("/upload", status_code=202)
async def upload(file: UploadFile = File(...)):
    content = await file.read()                  # 异步读取文件内容
    # 后台任务处理（需 GC 保护）
    task = asyncio.create_task(process_file(content))
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
    return {"filename": file.filename, "size": len(content), "status": "processing"}
```

## 面试追问

**Q1（基础）**：依赖注入 Depends 的作用是什么？get_db 和 get_current_user 分别解决了什么问题？
**回答要点**：
1. Depends 用于复用通用逻辑，把通用的前置逻辑写成一个函数，在接口参数里声明
2. get_db：自动提供数据库会话，自动提交/回滚事务，接口不用操心连接管理
3. get_current_user：自动校验 JWT 登录，未登录自动返回 401，接口不用写鉴权代码

**Q2（深挖）**：get_db 中 yield 型依赖的执行顺序是什么？yield 前后的代码分别在什么时候执行？
**回答要点**：
1. yield 之前：创建数据库连接（准备阶段）
2. yield 把 session 交给接口使用
3. 接口正常结束后执行 commit() 提交事务
4. 异常时执行 rollback() 回滚后抛出异常

**Q3（实战）**：SSE 流式响应是如何实现的？EventSourceResponse 接收什么类型的参数？
**回答要点**：
1. EventSourceResponse 接收一个异步生成器，生成器每 yield 一次就向前端推送一个事件
2. 每个事件是 `{"data": "..."}` 字典，data 里放 JSON 字符串
3. 真实场景中结合 `llm.astream()` 实时转发模型输出的每个 token

**Q4（边界）**：文件上传接口返回 202 而不是 200 有什么含义？为什么这样设计？
**回答要点**：
1. 202 表示"已接受，正在后台处理"，适合需要先收下文件、后台慢慢处理的场景
2. 200 表示"请求已成功处理并返回了结果"，适合同步处理场景
3. 202 + 后台任务模式让用户无需在前端等待，体现了"异步处理"的设计模式

## 参考引用
- 需要理解 FastAPI 基础部署的相关知识，参见 [Flask与FastAPI模型部署](04-Flask与FastAPI模型部署.md)
- 需要理解 SSE 协议基础概念的相关知识，参见 [WebSocket与SSE流式输出](../../网络/10-WebSocket与SSE流式输出.md)
- 需要理解后台任务 GC 保护模式的相关知识，参见 [后台任务GC保护模式](../../Python/并发/18-后台任务GC保护模式.md)