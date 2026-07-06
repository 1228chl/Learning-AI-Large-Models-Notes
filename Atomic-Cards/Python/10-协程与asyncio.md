---
author: "XunZong"
created: "2026-07-06"
tags: ["Python", "协程", "asyncio"]
aliases: ["协程", "asyncio", "async/await", "Coroutine"]
---

# 协程与 asyncio

## 定义

协程（Coroutine）是一种**用户态协作式并发**的编程方式。与线程不同，协程由程序自身控制切换点，没有线程切换的开销，也没有锁竞争问题。Python 通过 `async/await` 语法和 `asyncio` 库实现。

**关键区别**：

| 对比 | 线程 | 协程 |
|:----:|:----|:----|
| **调度方式** | 操作系统抢占式 | 程序自身协作式 |
| **切换开销** | 微秒级（内核态） | 纳秒级（用户态） |
| **内存占用** | 约 8MB/线程 | 约 1KB/协程 |
| **锁问题** | 需加锁 | 单线程无需锁 |
| **适用** | CPU 密集型 | **I/O 密集型** |

## 基本用法

```python
import asyncio

# 定义协程函数
async def hello():
    print("Hello")
    await asyncio.sleep(1)    # 模拟 I/O 等待（不阻塞线程）
    print("World")

# 运行
asyncio.run(hello())          # Python 3.7+ 入口

# 并发执行多个协程
async def main():
    await asyncio.gather(
        hello(),
        hello(),
        hello()
    )

asyncio.run(main())
```

## 核心概念

| 概念 | 说明 | 代码 |
|:----|:----|:----|
| **协程函数** | 用 `async def` 定义的函数 | `async def func():` |
| **协程对象** | 调用协程函数返回的对象 | `coro = func()` |
| **await** | 挂起当前协程，等待另一个协程完成 | `await asyncio.sleep(1)` |
| **事件循环** | 调度所有协程的运行引擎 | `asyncio.run()` 内部维护 |
| **Task** | 将协程包装为可独立调度的任务 | `asyncio.create_task(coro)` |
| **Future** | 一个可能在未来完成的异步结果 | 底层接口 |

## 并发控制

```python
import asyncio
import aiohttp  # 异步 HTTP 库

# 异步爬虫示例
async def fetch_url(session, url):
    async with session.get(url) as response:
        return await response.text()

async def main():
    urls = ["https://..."] * 10
    
    # 控制并发数（信号量）
    sem = asyncio.Semaphore(5)  # 最多 5 个并发
    
    async def bounded_fetch(url):
        async with sem:
            return await fetch_url(session, url)
    
    async with aiohttp.ClientSession() as session:
        tasks = [bounded_fetch(url) for url in urls]
        results = await asyncio.gather(*tasks)

# 超时控制
async def with_timeout():
    try:
        result = await asyncio.wait_for(
            slow_operation(), timeout=5.0
        )
    except asyncio.TimeoutError:
        print("操作超时！")
```

## 同步 vs 异步对比

```python
# 同步版本（串行，总耗时 = sum）
def sync_fetch():
    for url in urls:
        data = requests.get(url).text   # 每个请求等待上一个完成

# 异步版本（并发，总耗时 ≈ max）
async def async_fetch():
    async with aiohttp.ClientSession() as session:
        tasks = [fetch_url(session, url) for url in urls]
        results = await asyncio.gather(*tasks)  # 并发执行
```

| 场景 | 同步 | 异步 | 加速比 |
|:----|:----|:----:|:------:|
| 10 个网络请求（每个 1s） | 10s | ~1s | **10x** |
| 100 个数据库查询（每个 0.1s） | 10s | ~0.1s | **100x** |
| CPU 密集计算 | 1s | 1s（无提升） | 1x |

## ML 中的协程

| 应用场景 | 使用方式 | 说明 |
|:--------:|:--------|:----|
| **LLM 流式调用** | `async for chunk in stream:` | 逐 token 接收 LLM 输出 |
| **FastAPI 推理接口** | `async def predict():` | 异步处理请求，释放线程 |
| **批量数据加载** | `asyncio.gather` 并发下载 | 加速数据集下载 |
| **WebSocket 通信** | `websocket.send()` / `recv()` | 实时对话的异步收发 |

```python
# FastAPI + 异步 LLM 调用
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI

app = FastAPI()
client = AsyncOpenAI()

@app.post("/chat")
async def chat(message: str):
    stream = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": message}],
        stream=True
    )
    async def generate():
        async for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    return StreamingResponse(generate(), media_type="text/plain")
```

## 面试追问

**Q1（基础）**：协程和线程在调度方式、切换开销和内存占用方面有什么本质区别？
回答要点：协程由程序自身协作式调度，线程由操作系统抢占式调度；协程切换在用户态（纳秒级），线程切换需内核态（微秒级）；协程内存约 1KB/个，线程约 8MB/个；协程单线程无需加锁，线程需处理锁竞争和同步问题。

**Q2（深挖）**：`await` 关键字的作用是什么？它和 Python 的生成器 `yield` 在机制上有哪些异同？
回答要点：`await` 挂起当前协程，将控制权交还给事件循环，等待另一个 awaitable 对象完成后恢复；底层机制上，`async/await` 基于生成器实现（PEP 492），`await` 类似 `yield from`，但语义不同：`yield` 用于生成值，`await` 用于等待另一协程完成。

**Q3（实战）**：在 FastAPI 中，异步接口处理 I/O 请求时为什么能提升吞吐量？所有视图函数都应该声明为 `async` 吗？
回答要点：异步接口在处理 I/O 等待时释放线程给其他请求，避免线程池耗尽；不所有函数都应 `async`，如果函数内只有 CPU 计算没有 I/O 等待，`async` 反而增加开销；推荐在调用异步库（数据库、HTTP、文件 I/O）时用 `async`，纯计算用同步。

**Q4（边界）**：`asyncio.gather` 并发执行多个协程时，如果其中一个抛出异常会怎样？如何控制并发数量防止资源耗尽？
回答要点：默认情况下，`gather()` 中任一协程抛出异常会立即传播到调用方，其他协程仍会执行但结果不会被收集；可使用 `return_exceptions=True` 将异常作为结果返回；控制并发数需使用 `asyncio.Semaphore` 限制同时运行的任务量，防止大量并发请求压垮下游服务或触发连接池耗尽。

> 参见 [[06-进程与线程]]、[[04-迭代器与生成器]]
