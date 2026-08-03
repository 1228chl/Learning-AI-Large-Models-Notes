---
author: "XunZong"
created: "2026-07-30"
tags: ["Python", "异步", "上下文管理器", "asynccontextmanager", "lifespan", "FastAPI"]
aliases: ["异步上下文管理器", "asynccontextmanager", "FastAPI lifespan", "yield依赖注入"]
---

# 异步上下文管理器与 FastAPI lifespan 模式

## 定义

`@asynccontextmanager` 是 Python 标准库 `contextlib` 提供的装饰器，用于创建异步上下文管理器。它将一个 `async def` 生成器函数包装为 `async with` 语句可用的对象：** `yield` 之上的代码在进入 `async with` 块时执行，`yield` 之下的代码在退出时执行**。

在 FastAPI 中，这一机制被用于 `lifespan` 函数（替代已弃用的 `startup` / `shutdown` 事件），管理应用的启动初始化与优雅关闭。核心价值在于将"资源获取"与"资源释放"强制配对在同一位置，避免遗漏清理逻辑。

## 核心模式

| 模式 | 语法 | 用途 | EduAgent 应用 |
|------|------|------|-------------|
| 异步上下文管理器 | `@asynccontextmanager` + `async def` + `yield` | 资源获取与释放配对 | FastAPI lifespan、DB 会话管理 |
| lifespan 函数 | `async def lifespan(app)` + `yield` | 应用级启动/关闭钩子 | 数据库迁移、本地模型并行预热、缓存清理 |
| yield 依赖注入 | `async def get_db()` + `yield session` | 请求级资源管理 | `Depends(get_db)` 注入 DB 会话，自动 commit/rollback |
| 并行初始化 | `asyncio.gather` 在 yield 前 | 多资源并发启动 | 同时预热 BGE-Reranker、MiniLM、BGE-M3 |

## 直观理解

> `@asynccontextmanager` 像一个"使用前后自动开关的大门"：进门时（yield 前）帮你开灯、开空调，出门时（yield 后）帮你关灯、关空调——你只需在中间用房子，不用操心开关。FastAPI 的 lifespan 就是应用级的大门：启动时建好一切，关闭时清理一切。

## 基础用法

```python
from contextlib import asynccontextmanager
import asyncio

@asynccontextmanager
async def lifespan():
    print("【启动】加载模型 / 建立数据库连接")  # yield 前 = 启动逻辑
    yield                                        # 控制权交给 async with 块内代码
    print("【关闭】释放资源 / 清理缓存")          # yield 后 = 关闭逻辑

async def main():
    async with lifespan():
        print("应用运行中，处理请求……")

asyncio.run(main())
# 输出：启动 → 运行 → 关闭
```

## FastAPI lifespan 实战

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI

@asynccontextmanager
async def lifespan(app: FastAPI):
    # yield 前：启动时执行
    run_migrations()                              # 自动执行数据库迁移
    await asyncio.gather(                          # 并行预热三个本地模型
        reranker.warm_up(),                        # BGE-Reranker 交叉编码器
        classifier.warm_up(),                      # MiniLM 意图分类器
        embedder.warm_up()                         # BGE-M3 嵌入模型
    )
    await mcp_drive()                              # 启动 MCP 子应用
    print("应用启动完成")
    yield                                          # ← 分界线
    # yield 后：关闭时执行
    llm_factory.clear_cache()                      # 清理 LLM 实例缓存

app = FastAPI(lifespan=lifespan)
```

## yield 依赖注入：get_db 模式

```python
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

async def get_db():
    """为每个请求创建独立的数据库会话，请求结束自动 commit 或 rollback"""
    async with async_sessionmaker() as session:
        try:
            yield session          # 控制权交给路由函数
            await session.commit() # 正常返回 → commit
        except Exception:
            await session.rollback() # 异常 → rollback
            raise
        # 不需要 finally close，async with 自动处理

# 路由中使用
@app.get("/users/me")
async def get_profile(db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("SELECT * FROM users WHERE id = :id"), {"id": user_id})
    return result.fetchone()
```

## AI/ML 工程应用场景

| 应用场景 | 使用的机制 | 说明 |
|---------|-----------|------|
| 本地模型预热 | lifespan + asyncio.gather | 应用启动时并行加载 BGE-Reranker/MiniLM/BGE-M3，避免首次请求等待 |
| 数据库会话管理 | yield 依赖注入 + Depends | 每个请求独立 AsyncSession，自动 commit/rollback，无需手动 close |
| MCP 子应用生命周期 | lifespan 内嵌 MCP drive | 确保知识库检索服务和联网搜索服务随主应用一起启停 |
| LLM 实例缓存清理 | lifespan yield 后 | 关闭时清空 LLMFactory 的模型实例缓存，释放显存 |
| 后台任务 GC 保护 | create_task + 模块级 set + done_callback | 耗时操作（批改、审查）丢后台，防止 GC 提前回收 |

## 面试追问

**Q1（基础）**：`@asynccontextmanager` 中 yield 前后的代码分别在什么时候执行？

**回答要点**：

1. yield 前的代码在执行 `async with` 进入时运行，用于资源获取和初始化
2. yield 后的代码在 `async with` 块退出时运行（正常退出或异常退出均执行），用于资源释放和清理
3. 正是这个"强制配对"的设计，确保不会忘记释放资源

**Q2（深挖）**：FastAPI 的 lifespan 为什么替代了旧的 startup/shutdown 事件？有什么优势？

**回答要点**：

1. lifespan 将启动和关闭逻辑写在同一个函数内，代码内聚性更好——不需要在两个独立的事件处理器间跳转
2. 通过 yield 天然保证启动和关闭的配对，旧的 on_event("startup") 和 on_event("shutdown") 容易遗漏配对
3. 支持 async，可以在启动阶段执行异步操作（如并行预热模型、数据库迁移）
4. 兼容 ASGI lifespan 协议，是官方推荐的现代写法

**Q3（实战）**：yield 依赖注入（get_db）中，为什么需要在 yield 后分别处理 commit 和 rollback？

**回答要点**：

1. 正常路径：路由执行无异常 → yield 后代码继续 → commit 提交事务
2. 异常路径：路由抛出异常 → yield 恢复时异常传播 → except 捕获 → rollback 回滚 → raise 继续传播异常
3. 不处理会导致：正常提交丢失（数据不持久化）或异常时未回滚（脏数据残留）
4. 如果路由内部已手动 commit，外层再 commit 会触发"事务已关闭"错误——此时需检查事务状态

**Q4（边界）**：如果 lifespan 的 yield 前抛出异常，yield 后的代码还会执行吗？如何保证清理逻辑一定执行？

**回答要点**：

1. 如果 yield 前的代码抛出异常，yield 永远不会被到达，yield 后的清理代码不会执行
2. 这是因为生成器在 yield 前就终止了，`async with` 块内的代码也永远不会运行
3. 解决方案：将可能失败的初始化放在 `async with` 块内部，lifespan 只做轻量级的路由注册和日志初始化
4. 或者用 try/finally 包裹 yield：`try: yield; finally: cleanup()` —— finally 确保即使 yield 后的代码抛出异常也会执行清理

## 参考引用

- 需要理解协程和 asyncio 的基础知识：[协程与 asyncio](./10-协程与asyncio.md)
- 需要理解 asyncio.gather 的并行执行机制及其在异步上下文中的应用：[异步并发实战](./17-异步并发实战.md)
- 需要理解后台任务 GC 保护模式中 create_task 与 done_callback 的配合：[后台任务 GC 保护模式](./18-后台任务GC保护模式.md)
- 需要理解 FastAPI 的 Depends 注入机制和 yield 依赖注入：[FastAPI 高级特性](../../Tools/部署/09-FastAPI高级特性.md)
