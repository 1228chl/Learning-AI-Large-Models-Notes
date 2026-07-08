---
author: "XunZong"
created: "2026-07-07"
tags: ["Python", "线程", "GIL"]
aliases: ["线程", "GIL", "threading", "全局解释器锁", "Global Interpreter Lock"]
---

# 线程与 GIL

## 定义

线程（Thread）是 **CPU 调度的最小单位**，属于同一个进程的多个线程共享进程的地址空间和资源。在 CPython 中，由于**全局解释器锁（GIL, Global Interpreter Lock）** 的存在，同一时刻只有一个线程能执行 Python 字节码。

线程的四种状态模型：

$$
\text{新建（new）} \rightarrow \text{就绪（runnable）} \rightarrow \text{运行（running）} \rightarrow \text{阻塞（blocked）} \rightarrow \text{终止（dead）}
$$

GIL 的切换机制基于字节码指令计数和 I/O 等待：

$$
\text{GIL 释放条件} =
\begin{cases}
\text{每执行 100 条字节码指令（}sys.setswitchinterval\text{ 可调）} \\
\text{I/O 操作前自动释放，操作完成后重新获取} \\
\text{C 扩展调用（如 NumPy）主动释放 GIL}
\end{cases}
$$

## GIL 详解

| 维度 | 说明 |
|:----|:-----|
| **为什么存在** | CPython 的内存管理（引用计数）非线程安全，GIL 简化了内存一致性保障 |
| **核心影响** | 多线程无法利用多核并行加速 CPU 密集型任务 |
| **不影响** | I/O 密集型任务（GIL 在 I/O 等待时释放）、C 扩展计算（主动释放 GIL） |
| **绕过方式** | 使用 `multiprocessing`、将计算下沉到 C 扩展（NumPy/Cython）、使用 JIT（PyPy 实验性无 GIL 分支） |
| **Python 3.x 演进** | 细粒度 GIL 切换（`sys.setswitchinterval`）、PEP 703（no-GIL 模式，Python 3.13+ 实验性） |

## 直观理解

如果把 Python 解释器看作一个只有一名收银员的超市，GIL 就是这个收银员——无论有多少顾客（线程）同时到达，同一时刻只有一人能在收银台结账。如果顾客只是站着不动看商品（I/O 等待），收银员可以去服务其他人；但如果每位顾客都有大量商品要扫描（CPU 计算），排队就无法提速。

## threading 核心用法

```python
import threading

# 1. 创建线程
def worker(name):
    print(f"Thread {name} running")

t = threading.Thread(target=worker, args=("A",))
t.start()
t.join()     # 等待完成

# 2. 继承 Thread 类
class MyThread(threading.Thread):
    def run(self):
        pass  # 线程入口

# 3. 线程局部数据
local_data = threading.local()
local_data.value = 42    # 每个线程拥有独立副本

# 4. 守护线程
t = threading.Thread(target=worker, daemon=True)
# 主进程退出时守护线程自动终止
```

## 线程同步机制

| 同步原语 | 作用 | 适用场景 |
|:--------|:----|:---------|
| ** `Lock` ** | 互斥锁，同一时刻只允许一个线程获取 | 保护共享变量的简单写操作 |
| ** `RLock` ** | 可重入锁，同一线程可多次 `acquire()` | 递归函数中加锁 |
| ** `Semaphore` ** | 信号量，允许 N 个线程同时访问 | 控制连接池/任务并发数 |
| ** `Event` ** | 事件标志，`wait()` / `set()` / `clear()` | 线程间通知（一等另一完成） |
| ** `Condition` ** | 条件变量，`wait()` / `notify()` / `notify_all()` | 生产者-消费者复杂协调 |
| ** `Barrier` ** | 屏障，等待所有线程到达后才继续 | 并行阶段同步 |

```python
import threading

# Lock 示例
lock = threading.Lock()
shared_counter = 0

def increment():
    global shared_counter
    for _ in range(1000):
        with lock:      # 自动 acquire/release
            shared_counter += 1

# RLock 示例（可重入）
rlock = threading.RLock()
def recursive_lock(n):
    with rlock:
        if n > 0:
            recursive_lock(n - 1)   # 同一线程可重复获取

# Condition 示例（生产者-消费者）
cv = threading.Condition()
buffer = []

def producer():
    with cv:
        buffer.append(item)
        cv.notify()     # 唤醒消费者

def consumer():
    with cv:
        while not buffer:
            cv.wait()   # 等待生产者 notify
        item = buffer.pop()
```

## ML/DL 应用场景

| 应用场景 | 实现方式 | 说明 |
|:--------:|:--------|:-----|
| **模型推理服务（HTTP）** | 多线程处理请求 | GIL 在 I/O 处释放，PyTorch 前向计算释放 GIL，吞吐提升 |
| **数据处理管道** | 多线程并行 I/O | 多个线程同时读取不同文件或分片 |
| **训练日志与监控** | 后台守护线程收集指标 | 不影响主训练循环，定期写入 |
| **WebSocket 实时通信** | 每连接一线程 | 管理并发 WebSocket 连接，阻塞读时 GIL 释放 |
| **模型预热** | 线程池并行加载 | 服务启动时加速模型加载与初始化 |

**注意**：如果推理中大量使用 PyTorch 等 C 扩展操作，这些操作会主动释放 GIL，因此单 GPU 上多线程推理可有效提升吞吐量；但若预处理/后处理包含大量 Python 自定义逻辑，GIL 仍会成为瓶颈。

## 面试追问

**Q1（基础）**：什么是 GIL？为什么 CPython 中会存在 GIL？

**回答要点**：GIL 是 CPython 的全局解释器锁，保证同一时刻只有一个线程执行 Python 字节码；存在的原因是 CPython 的引用计数内存管理不是线程安全的，GIL 以牺牲多核并行能力为代价简化了内部实现并保证了 C 扩展库的二进制兼容性。

**Q2（深挖）**：GIL 对多线程性能的影响在 CPU 密集型和 I/O 密集型任务中有什么本质区别？如何验证？

**回答要点**：CPU 密集型中 GIL 导致多线程退化为串行（甚至比单线程差，因有锁切换开销），可通过 `time.time()` 对比单线程与多线程计算耗时验证；I/O 密集型中 GIL 在每次 I/O 操作前释放、完成后再获取，多线程并发有效可加速网络请求/文件读写；可分别创建纯循环计算 vs 大量 `time.sleep()` 或网络请求的多线程程序实测对比。

**Q3（实战）**：在深度学习模型推理服务中，使用多线程处理请求有什么优缺点？何时应改用多进程？

**回答要点**：优点是每个请求一个线程编程简单，共享模型参数无需额外内存复制，PyTorch 前向计算（C++ 实现）释放 GIL 实际可并行；缺点是大量 Python 逻辑（复杂预处理/后处理）仍受 GIL 制约，线程数过多时上下文切换开销增大；当推理流程以 Python 自定义逻辑为主且占比较高时，应改用多进程避免 GIL 串行化。

**Q4（边界）**：`threading.Lock` 和 `threading.RLock` 有什么区别？什么情况下 Lock 会导致死锁而 RLock 可以解决？

**回答要点**：`Lock` 是互斥锁，同一线程不能重复 `acquire()`（再次请求已持有的锁会导致死锁）；`RLock` 可重入，同一线程可多次 `acquire()`，需对应次数 `release()` 才真正释放；递归函数中若需要保护共享资源，使用 `Lock` 会自我死锁（函数递归调用自身时再次请求锁），`RLock` 可以正确工作；但 `RLock` 不能解决多线程间锁顺序不一致导致的死锁，仍需固定加锁顺序或使用超时机制。

## 参考引用
- 需要理解进程与线程的相关知识，参见 [进程与线程](./06-进程与线程.md)
- 需要理解进程与多进程的相关知识，参见 [进程与多进程](./14-进程与多进程.md)
- 需要理解协程与asyncio的相关知识，参见 [协程与asyncio](./10-协程与asyncio.md)