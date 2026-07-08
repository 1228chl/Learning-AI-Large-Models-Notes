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

# async def 定义协程函数：调用时不会立即执行，而是返回一个协程对象
async def hello():
    print("Hello")
    # await 挂起当前协程，将控制权交还给事件循环，等待 1 秒后继续
    # asyncio.sleep 不会阻塞线程，期间事件循环可以调度其他协程
    await asyncio.sleep(1)    # 模拟 I/O 等待（不阻塞线程）
    print("World")

# asyncio.run() 是 Python 3.7+ 的入口函数：创建事件循环，运行协程，结束后关闭
asyncio.run(hello())          # Python 3.7+ 入口

# 并发执行多个协程：使用 asyncio.gather 同时运行多个协程
async def main():
    # gather 会并发执行所有传入的协程，总耗时约等于最慢的那个
    # 如果逐一 await（像同步一样），总耗时会是三者之和
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

# 异步爬虫示例：async/await 让 I/O 等待期间释放事件循环，提高吞吐量
async def fetch_url(session, url):
    # async with 是异步版本的上下文管理器，等待资源获取完成
    async with session.get(url) as response:
        # await 挂起协程等待网络响应，不阻塞线程
        return await response.text()

async def main():
    urls = ["https://..."] * 10
    
    # 控制并发数：Semaphore(5) 限制同时最多 5 个协程运行
    # 防止并发过多压垮目标服务器或耗尽本地连接池
    sem = asyncio.Semaphore(5)  # 最多 5 个并发
    
    # 内层协程函数：使用信号量包装实际的请求，实现并发限制
    async def bounded_fetch(url):
        # async with sem 会在进入时获取信号量（可能等待），离开时释放
        async with sem:
            return await fetch_url(session, url)
    
    # 创建异步 HTTP 会话：async with 确保会话正确关闭
    async with aiohttp.ClientSession() as session:
        # 创建 10 个抓取任务，但只有 5 个能同时运行
        tasks = [bounded_fetch(url) for url in urls]
        # gather 并发执行所有任务，直到全部完成
        results = await asyncio.gather(*tasks)

# 超时控制：避免某个协程挂起太久导致整个程序阻塞
async def with_timeout():
    try:
        # wait_for 包装协程并设置超时时间，超时则抛出 TimeoutError
        result = await asyncio.wait_for(
            slow_operation(), timeout=5.0
        )
    except asyncio.TimeoutError:
        print("操作超时！")
```

## 同步 vs 异步对比

```python
# 同步版本（串行）：每个请求必须等待上一个完成才能开始，总耗时 = 所有请求的和
# requests.get 是阻塞调用，在 I/O 等待期间线程什么也不做
def sync_fetch():
    for url in urls:
        data = requests.get(url).text   # 每个请求等待上一个完成

# 异步版本（并发）：发起所有请求后同时等待，总耗时 ≈ 最慢的那个请求
# await asyncio.gather 让事件循环在等待 I/O 期间调度其他任务
async def async_fetch():
    async with aiohttp.ClientSession() as session:
        # 创建所有任务但尚未执行，gather 才真正并发启动它们
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
# FastAPI + 异步 LLM 调用：利用 async/await 提高 API 服务器吞吐量
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI

app = FastAPI()
# AsyncOpenAI 是 OpenAI 客户端的异步版本，其网络请求不阻塞工作线程
client = AsyncOpenAI()

# 异步 POST 路由：async def 让 FastAPI 在等待 LLM 响应时处理其他请求
@app.post("/chat")
async def chat(message: str):
    # await 异步调用 LLM API，等待期间事件循环可以处理其他请求
    stream = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": message}],
        stream=True          # 启用流式输出，逐 token 返回结果
    )
    # 嵌套的异步生成器函数：使用 async for 逐 token 读取流
    async def generate():
        # async for 是异步迭代器，每次迭代等待新的 token 到来
        async for chunk in stream:
            if chunk.choices[0].delta.content:
                # yield 逐 token 产出内容，StreamingResponse 将其实时推送给客户端
                yield chunk.choices[0].delta.content

    # StreamingResponse 包装异步生成器，实现 SSE 风格的流式响应
    return StreamingResponse(generate(), media_type="text/plain")
```

## 面试追问

**Q1（基础）**：协程和线程在调度方式、切换开销和内存占用方面有什么本质区别？

**回答要点**：协程由程序自身协作式调度，线程由操作系统抢占式调度；协程切换在用户态（纳秒级），线程切换需内核态（微秒级）；协程内存约 1KB/个，线程约 8MB/个；协程单线程无需加锁，线程需处理锁竞争和同步问题。

**Q2（深挖）**：`await` 关键字的作用是什么？它和 Python 的生成器 `yield` 在机制上有哪些异同？

**回答要点**：`await` 挂起当前协程，将控制权交还给事件循环，等待另一个 awaitable 对象完成后恢复；底层机制上，`async/await` 基于生成器实现（PEP 492），`await` 类似 `yield from`，但语义不同：`yield` 用于生成值，`await` 用于等待另一协程完成。

**Q3（实战）**：在 FastAPI 中，异步接口处理 I/O 请求时为什么能提升吞吐量？所有视图函数都应该声明为 `async` 吗？

**回答要点**：异步接口在处理 I/O 等待时释放线程给其他请求，避免线程池耗尽；不所有函数都应 `async`，如果函数内只有 CPU 计算没有 I/O 等待，`async` 反而增加开销；推荐在调用异步库（数据库、HTTP、文件 I/O）时用 `async`，纯计算用同步。

**Q4（边界）**：`asyncio.gather` 并发执行多个协程时，如果其中一个抛出异常会怎样？如何控制并发数量防止资源耗尽？

**回答要点**：默认情况下，`gather()` 中任一协程抛出异常会立即传播到调用方，其他协程仍会执行但结果不会被收集；可使用 `return_exceptions=True` 将异常作为结果返回；控制并发数需使用 `asyncio.Semaphore` 限制同时运行的任务量，防止大量并发请求压垮下游服务或触发连接池耗尽。

## 参考引用
- 需要理解进程与线程的相关知识，参见 [进程与线程](./06-进程与线程.md)
- 需要理解迭代器与生成器的相关知识，参见 [迭代器与生成器](./04-迭代器与生成器.md)
- 需要理解Socket网络编程的相关知识，参见 [Socket网络编程](./09-Socket网络编程.md)
- 需要理解进程与多进程的相关知识，参见 [进程与多进程](./14-进程与多进程.md)