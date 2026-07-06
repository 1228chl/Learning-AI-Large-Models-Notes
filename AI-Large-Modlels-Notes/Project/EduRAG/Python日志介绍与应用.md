
**标签：** #RAG

---
# Python 日志介绍与应用
好的，我根据您提供的 HTML 文档内容，为您整理了一份结构清晰、重点突出的学习笔记。这份笔记提取了核心概念、关键代码和实用技巧，方便您快速回顾和复习。

---

# Python 日志（logging）模块学习笔记

## 1. 为什么需要日志？
- **调试**：定位代码问题，比 `print` 更灵活、更可控。
- **监控**：实时追踪程序运行状态，记录关键事件。
- **审计**：记录用户操作或系统行为，便于事后分析。
- **持久化**：将运行信息保存到文件，便于离线查看。

Python 内置的 `logging` 模块是标准库，无需额外安装，功能强大且可扩展。

---

## 2. 核心概念
| 概念 | 说明 |
|------|------|
| **日志级别（Level）** | 表示事件严重程度，从低到高：`DEBUG` < `INFO` < `WARNING` < `ERROR` < `CRITICAL`。只有高于设定级别的日志才会被记录。 |
| **记录器（Logger）** | 程序中的日志入口，通过 `getLogger(name)` 获取，可设置级别。 |
| **处理器（Handler）** | 决定日志输出目的地，如控制台（`StreamHandler`）、文件（`FileHandler`）、网络等。 |
| **格式化器（Formatter）** | 定义日志的输出格式，如时间、级别、消息等。 |

---

## 3. 快速上手：基础配置
```python
import logging

logging.basicConfig(level=logging.INFO)   # 设置最低记录级别
logger = logging.getLogger("my_app")      # 获取记录器

logger.debug("调试信息")     # 不会输出，因为级别为 INFO
logger.info("程序启动")      # 输出
logger.warning("内存不足")   # 输出
```
**输出效果**（默认控制台）：
```
2025-04-01 10:00:00,123 INFO my_app: 程序启动
2025-04-01 10:00:00,124 WARNING my_app: 内存不足
```

---

## 4. 自定义日志格式
```python
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
```
**常用格式字段**：
- `%(asctime)s`：时间
- `%(levelname)s`：级别名称
- `%(name)s`：记录器名称
- `%(message)s`：日志内容
- `%(filename)s`：文件名
- `%(lineno)d`：行号

---

## 5. 将日志写入文件
```python
logging.basicConfig(
    filename='app.log',      # 文件路径
    filemode='a',            # 'a' 追加，'w' 覆盖
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
```
此时控制台无输出，所有日志写入 `app.log`。

---

## 6. 同时输出到控制台和文件（高级用法）
通过创建多个 Handler 实现不同输出目标，并可为每个 Handler 设置不同级别：

```python
logger = logging.getLogger("my_app")
logger.setLevel(logging.DEBUG)

# 控制台处理器（只输出 INFO 及以上）
console = logging.StreamHandler()
console.setLevel(logging.INFO)

# 文件处理器（输出 DEBUG 及以上）
file_handler = logging.FileHandler('app.log', mode='a', encoding='utf-)
file_handler.setLevel(logging.DEBUG)

# 统一格式
formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
console.setFormatter(formatter)
file_handler.setFormatter(formatter)

# 添加到记录器
logger.addHandler(console)
logger.addHandler(file_handler)
```

**效果**：
- 控制台：显示 INFO、WARNING、ERROR、CRITICAL
- 文件：显示 DEBUG 及以上所有级别

---

## 7. 工程化封装：可复用的日志模块
推荐将日志配置封装为独立模块，便于项目各模块复用。

**目录结构**：
```
project/
├── utils/
│   └── logger.py       # 日志配置函数
├── main.py
└── logs/
    └── app.log
```

**`utils/logger.py` 示例**：
```python
import logging
import os

def setup_logger(name, log_file='logs/app.log'):
    os.makedirs(os.path.dirname(log_file), exist_ok=True)
    logger = logging.getLogger(name)
    logger.setLevel(logging.DEBUG)

    console = logging.StreamHandler()
    console.setLevel(logging.INFO)

    file_handler = logging.FileHandler(log_file, mode='a')
    file_handler.setLevel(logging.DEBUG)

    formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(name)s - %(message)s')
    console.setFormatter(formatter)
    file_handler.setFormatter(formatter)

    if not logger.handlers:   # 避免重复添加
        logger.addHandler(console)
        logger.addHandler(file_handler)

    return logger
```

**主程序使用**：
```python
from utils.logger import setup_logger

logger = setup_logger("MainApp")
logger.info("程序启动")
logger.debug("调试数据")
```

---

## 8. 最佳实践与注意事项
- **级别设置**：开发阶段用 `DEBUG`，生产环境建议 `INFO` 或 `WARNING`，避免日志过多。
- **异常记录**：捕获异常时使用 `logger.exception("错误描述")`，会自动记录堆栈信息。
- **避免重复添加 Handler**：如示例所示，检查 `logger.handlers` 列表。
- **日志轮转**：对于长期运行的服务，可使用 `RotatingFileHandler` 或 `TimedRotatingFileHandler` 防止文件过大。
- **性能**：避免在日志消息中进行复杂计算，可使用惰性求值（如 `logger.debug("结果: %s", expensive_func())` 仅在启用时计算）。

---

## 9. 应用场景（结合 RAG 项目）
- 记录数据库连接状态、查询耗时。
- 追踪向量检索结果数量和相似度分数。
- 记录 LLM 调用请求和响应（注意脱敏）。
- 捕获并记录异常，便于快速定位问题。

---

## 10. 小结
- `logging` 模块是 Python 官方提供的强大日志工具，比 `print` 更专业。
- 核心三要素：**Logger**（入口）、**Handler**（输出）、**Formatter**（格式）。
- 通过合理配置，可实现灵活、多层次的日志记录，满足开发、测试、生产各阶段需求。
