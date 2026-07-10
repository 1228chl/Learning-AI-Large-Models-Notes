---
author: "XunZong"
created: "2026-07-10"
tags: ["Python", "日志", "调试"]
aliases: ["logging", "日志模块", "Python日志", "Logger"]
---

# Python logging 日志模块

## 定义

Python `logging` 模块是标准库内置的日志记录工具，提供分级日志输出、灵活的输出格式和多种输出目标（控制台、文件、网络等）。相比 `print`，`logging` 支持日志级别控制、生产/调试环境切换、持久化存储和结构化日志。

## 设计原理

### 为什么是 5 级日志

`DEBUG < INFO < WARNING < ERROR < CRITICAL` 的分级设计对应故障响应的不同阶段：

| 级别 | 含义 | 对应动作 | 典型信息 |
|:----|:-----|:---------|:---------|
| **DEBUG** | 调试细节 | 仅开发时查看 | 变量值、函数入口/出口 |
| **INFO** | 正常运行 | 确认系统状态 | 服务启动、请求处理 |
| **WARNING** | 潜在问题 | 记录+关注 | 磁盘 80%、配置缺失用默认值 |
| **ERROR** | 功能失败 | 立即处理 | 数据库连接失败、API 超时 |
| **CRITICAL** | 系统级崩溃 | 告警+恢复 | 主进程退出、关键服务不可用 |

生产环境通常设为 INFO 或 WARNING，DEBUG 日志在每轮训练中可能产生数万条输出——如果直接在训练循环中调用 `logging.debug` 会影响性能，建议在关键节点使用 INFO 级别。

### Logger 的层级树

Logger 名称按点号 `.` 分隔形成树状结构：`app.module.submodule`。子 Logger 的日志默认**传播**给父 Logger。传播机制的好处是可以在顶层统一配置 Handler，子层只需设级别——但若父和子都添加了 Handler，同一日志会被输出两次，需设置 `propagate = False` 阻断。

### 四大核心组件

$$
\text{Logging System} = (\text{Logger}, \text{Handler}, \text{Formatter}, \text{Filter})
$$

- **Logger**：日志记录器，应用程序直接调用的接口，负责产生日志消息
- **Handler**：日志处理器，决定日志输出到哪里（控制台、文件、网络等）
- **Formatter**：日志格式化器，定义日志输出的格式（时间、级别、消息等）
- **Filter**：日志过滤器，按条件过滤日志消息（可选）

### 日志级别

$$
\text{DEBUG} < \text{INFO} < \text{WARNING} < \text{ERROR} < \text{CRITICAL}
$$

| 级别 | 数值 | 用途 | 生产环境 |
|:-----|:----:|:-----|:--------:|
| `DEBUG` | 10 | 调试信息，详细运行状态 | 关闭 |
| `INFO` | 20 | 正常操作信息，记录关键步骤 | 开启 |
| `WARNING` | 30 | 警告，不影响运行但需关注 | 开启 |
| `ERROR` | 40 | 错误，功能无法正常执行 | 开启 |
| `CRITICAL` | 50 | 严重错误，程序可能崩溃 | 开启 |

## 完整使用示例

```python
import logging

# ========== 1. 基本配置（最简单的方式） ==========
logging.basicConfig(
    level=logging.INFO,                    # 只记录 INFO 及以上级别
    format="%(asctime)s - %(levelname)s - %(message)s",  # 日志格式
    datefmt="%Y-%m-%d %H:%M:%S"            # 时间格式
)

logging.debug("这是调试信息，不会输出")      # 级别低于 INFO，不输出
logging.info("系统启动成功")                 # 正常信息
logging.warning("磁盘空间不足 80%%")         # 警告
logging.error("数据库连接失败")              # 错误
logging.critical("系统崩溃")                 # 严重错误

# ========== 2. 完整配置（Logger + Handler + Formatter） ==========
def setup_logger(name: str, log_file: str = None) -> logging.Logger:
    """
    配置一个功能完整的日志记录器。

    Args:
        name: 日志记录器名称，通常用 __name__
        log_file: 日志文件路径，为 None 时只输出到控制台

    Returns:
        配置好的 Logger 实例
    """
    logger = logging.getLogger(name)
    logger.setLevel(logging.DEBUG)          # Logger 级别设为最低

    # 日志格式：时间 | 级别 | 模块名:行号 | 消息
    formatter = logging.Formatter(
        fmt="%(asctime)s | %(levelname)-8s | %(name)s:%(lineno)d | %(message)s",
        datefmt="%H:%M:%S"
    )

    # ---- 控制台 Handler（Handler 1） ----
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)   # 控制台只显示 INFO 及以上
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    # ---- 文件 Handler（Handler 2） ----
    if log_file:
        file_handler = logging.FileHandler(
            log_file, encoding="utf-8"
        )
        file_handler.setLevel(logging.DEBUG)  # 文件记录全部级别
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)

    # 避免重复添加 Handler
    logger.propagate = False

    return logger

# 使用示例
log = setup_logger("my_app", "app.log")
log.info("应用启动，配置加载完成")
log.warning("配置文件缺失，使用默认配置")
log.error("无法连接到数据库，重试中...")

# ========== 3. 配置文件方式（推荐生产环境） ==========
# logging.conf 文件内容：
# [loggers]
# keys=root
# [handlers]
# keys=consoleHandler,fileHandler
# [formatters]
# keys=simpleFormatter
# [logger_root]
# level=INFO
# handlers=consoleHandler,fileHandler
# [handler_consoleHandler]
# class=StreamHandler
# level=INFO
# formatter=simpleFormatter
# args=(sys.stdout,)
# [handler_fileHandler]
# class=FileHandler
# level=DEBUG
# formatter=simpleFormatter
# args=("app.log", "a", "utf-8")
# [formatter_simpleFormatter]
# format=%(asctime)s - %(name)s - %(levelname)s - %(message)s

# 加载配置文件
import logging.config
logging.config.fileConfig("logging.conf")
```

## Logger 继承与传播

```python
# Logger 按名称的点号分隔形成层级结构
# "parent.child" 是 "parent" 的子 Logger

parent = logging.getLogger("app")          # 父 Logger
child = logging.getLogger("app.module")    # 子 Logger

# 默认子 Logger 的日志会传播给父 Logger
# 可通过设置 propagate=False 关闭传播
```

## ML/DL 应用场景

| 应用场景 | 日志配置 | 说明 |
|:--------|:---------|:-----|
| **模型训练监控** | 文件 Handler（DEBUG）+ 控制台 Handler（INFO） | 文件记录每步 loss，控制台显示 epoch 汇总 |
| **API 服务日志** | 按天轮转的 `TimedRotatingFileHandler` | 每日生成一个日志文件，自动清理旧日志 |
| **RAG 系统调试** | 各模块独立 Logger（`rag.retriever`、`rag.generator`） | 通过 Logger 名称定位问题模块 |
| **批量数据处理** | 配置文件 + 按大小轮转的 `RotatingFileHandler` | 防止日志文件过大，自动备份和压缩 |

## 面试追问

**Q1（基础）**：`logging` 相比 `print` 有什么核心优势？什么场景下应该用 logging？
**回答要点**：

1. 日志级别控制：开发环境用 DEBUG 详细输出，生产环境只输出 WARNING 及以上，无需修改代码
2. 多输出目标：同时输出到控制台、文件、网络，且格式可独立配置
3. 模块化设计：不同模块可用独立 Logger，通过名称层级控制日志粒度
4. 持久化：日志自动写入文件，程序崩溃后仍可追溯

**Q2（深挖）**：Logger 的层级继承机制是什么？如何避免日志重复输出？
**回答要点**：

1. Logger 按名称的点号分隔形成树状层级，`app.module` 是 `app` 的子 Logger
2. 默认子 Logger 的日志会传播给父 Logger，导致同一日志被多个 Handler 重复输出
3. 解决方法：显式调用 `logger.propagate = False`，或确保只有顶层 Logger 添加 Handler

**Q3（实战）**：在 RAG 系统中如何设计日志系统来帮助排查检索失败的问题？
**回答要点**：

1. 为每个模块创建独立 Logger：`rag.retriever`（检索器）、`rag.reranker`（重排序）、`rag.generator`（生成器）
2. 检索器记录：查询原文、检索到的 top-k 文档 ID 和相似度分数
3. 生成器记录：输入上下文长度、生成结果、是否触发了幻觉检测
4. 日志级别：正常流程用 INFO，异常情况用 WARNING 并在最后汇总 ERROR 级异常

**Q4（边界）**：`RotatingFileHandler` 和 `TimedRotatingFileHandler` 有什么区别？分别适合什么场景？
**回答要点**：

1. `RotatingFileHandler` 按文件大小轮转（如 10MB），适合日志量可预测的场景
2. `TimedRotatingFileHandler` 按时间轮转（如每天、每小时），适合需要按时间归档的场景
3. 生产环境推荐两者结合：按天轮转 + 限制保留天数（如保留 30 天），兼顾查询历史和控制存储
4. 注意：多进程写入同一日志文件时，需使用 `QueueHandler`  + `QueueListener` 避免日志错乱

## 参考引用

- 需要理解 Python 异常处理和错误追踪，参见 [进程与线程](../并发/06-进程与线程.md)
- 需要理解装饰器在日志横切关注点中的应用，参见 [装饰器](../工具/03-装饰器.md)
- 需要理解上下文管理器在文件操作中的应用，参见 [上下文管理器](../工具/05-上下文管理器.md)
- 需要理解 Docker 部署中日志挂载的配置，参见 [Docker基础与容器化](../../工程实践/Docker/01-Docker基础与容器化.md)