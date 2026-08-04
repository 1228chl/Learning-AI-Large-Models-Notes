---
author: "XunZong"
created: "2026-07-30"
tags: ["Tools", "FastAPI", "Depends", "依赖注入"]
aliases: ["FastAPI依赖注入", "Depends", "yield依赖", "依赖注入"]
---

# FastAPI 依赖注入（Depends）

## 定义

**依赖注入** 把通用的前置逻辑（如获取数据库连接、校验登录）写成一个函数，在接口参数里用 `Depends(依赖函数)` 声明，FastAPI 在执行接口前**自动先跑依赖、把结果喂给接口**。

## 项目两个最重要的依赖

### 依赖一：get_db —— 获取数据库会话

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

### 依赖二：get_current_user —— 校验登录

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

### 在接口里组合使用

```python
@app.get("/my-reviews")
async def my_reviews(
    db = Depends(get_db),                             # 自动注入数据库会话
    current_user: dict = Depends(get_current_user),   # 自动注入当前用户（顺便完成鉴权）
):
    return {"user": current_user["user_id"], "data": "..."}
```

## 面试追问

**Q1（基础）**：依赖注入 Depends 的作用是什么？get_db 和 get_current_user 分别解决了什么问题？
**回答要点**：
1. Depends 用于复用通用逻辑，把通用的前置逻辑写成一个函数，在接口参数里声明
2. get_db：自动提供数据库会话，自动提交/回滚事务
3. get_current_user：自动校验 JWT 登录，未登录自动返回 401

**Q2（深挖）**：get_db 中 yield 型依赖的执行顺序是什么？
**回答要点**：
1. yield 之前：创建数据库连接（准备阶段）
2. yield 把 session 交给接口使用
3. 接口正常结束后执行 commit() 提交事务
4. 异常时执行 rollback() 回滚后抛出异常

**Q3（实战）**：如果多个接口都需要 get_db 和 get_current_user，有没有更优雅的方式？
**回答要点**：
1. 可以封装成子依赖：`def get_authenticated_db(current_user=Depends(...), db=Depends(...))`，接口只声明一个 Depends
2. 也可以使用 `app.dependency_overrides` 在测试时替换依赖
3. 依赖注入的优势正在于此——"声明什么依赖，就自动获得什么能力"

**Q4（边界）**：Depends 的缓存机制是什么？同一请求中两次 Depends(get_db) 会创建两个数据库连接吗？
**回答要点**：
1. FastAPI 在同一请求中缓存依赖结果——同一个依赖函数在同一请求中只会执行一次
2. 两次 Depends(get_db) 返回的是同一个 session 对象
3. 不同请求之间不共享缓存，每个请求独立执行依赖

## 参考引用
- 需要理解 FastAPI 基础部署的相关知识，参见 [Flask与FastAPI模型部署](04-Flask与FastAPI模型部署.md)
- 需要理解 SSE 流式响应的相关知识，参见 [FastAPI SSE流式响应](12-FastAPI SSE流式响应.md)
- 需要理解后台任务 GC 保护模式的相关知识，参见 [后台任务GC保护模式](../../Python/并发/18-后台任务GC保护模式.md)