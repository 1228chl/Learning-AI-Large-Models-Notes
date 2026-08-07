# 试卷批改 Agent：Word 文件解析深度解析

> 源文件：`backend/agents/exam/nodes.py` 第 1~184 行
> 对应课件：6.3 Word 文件解析（parse_word_node）
> 前置依赖：`python-docx`、`asyncio`、`ExamState`

## 一、文件定位

`nodes.py` 是试卷批改 Agent 的所有节点函数集合。6.3 节只写了前两个函数：`_sync_parse_word`（同步解析）和 `parse_word_node`（异步节点包装）。

```
nodes.py 的职责：
  工具函数    → _get_message_content, _chinese_to_int
  节点 1     → _sync_parse_word + parse_word_node（Word 解析）
  节点 2~N   → 后续各节继续追加（元数据加载、三轨批改、汇总...）
```

---

## 二、import 分析（第 1~30 行）

```python
import asyncio
import json
import uuid
from typing import Any

import httpx
from sqlalchemy import text
from langchain_core.messages import HumanMessage, SystemMessage

from langgraph.types import interrupt

from backend.agents.exam.state import (
    ExamState,
    SubjectiveReviewResult,
    WeakPointsReport,
)
from backend.agents.exam.prompts import (
    SYSTEM_PROMPT,
    SUBJECTIVE_REVIEW_PROMPT,
    SUBJECTIVE_THINK_PROMPT,
    CODE_QUALITY_REVIEW_PROMPT,
    WEAK_POINTS_ANALYSIS_PROMPT,
)
from backend.core.llm_factory import get_llm, get_structured_llm
from backend.core.logger import get_logger
from backend.dependencies import AsyncSessionLocal
```

| import | 用途（本节） | 用途（后续节点） |
|:-------|:------------|:----------------|
| `asyncio` | `get_running_loop()` + `run_in_executor()` | 同上 |
| `json` | — | LLM 结构化输出解析 |
| `uuid` | — | 生成待入队问题 ID |
| `httpx` | — | 异步 HTTP 请求 |
| `text` | — | SQL 查询 |
| `HumanMessage/SystemMessage` | — | LLM 消息构建 |
| `interrupt` | — | HitL 中断 |
| `ExamState` | 函数签名 | 所有节点 |
| `SubjectiveReviewResult` | — | 简答题结构化输出 |
| `WeakPointsReport` | — | 薄弱点分析 |
| 5 个 Prompt | — | 后续节点使用 |
| `get_llm` / `get_structured_llm` | — | LLM 调用 |
| `AsyncSessionLocal` | — | DB 操作 |

**"超前导入"**：当前 6.3 节只用到 `asyncio`、`ExamState`、`logger`，但所有 import 都写在文件顶部。因为 `nodes.py` 是随着各节**逐步追加**的，import 提前写好，避免后续每节都加新 import 行。

---

## 三、工具函数（第 37~53 行）

### 3.1 `_get_message_content`（第 37~43 行）

```python
def _get_message_content(msg) -> str:
    """统一获取消息文本内容（兼容 text 属性和 content 属性）"""
    if hasattr(msg, "text") and not callable(getattr(msg, "text", None)):
        return msg.text
    if isinstance(msg.content, str):
        return msg.content
    return str(msg.content)
```

**为什么需要这个？** LangChain 的消息类型在不同版本中字段名不统一——有的版本用 `.text`，有的用 `.content`，有的 `.content` 是 `list[dict]`（多模态消息）。这个函数用 `hasattr` 判断 `text` 属性是否存在且不是方法（`not callable`），再 fallback 到 `content`，最后兜底 `str()`。

### 3.2 `_chinese_to_int`（第 46~53 行）

```python
def _chinese_to_int(s: str) -> int:
    """中文数字转整数，转换失败时直接 int()，仍失败时返回1"""
    cn_map = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5,
              "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}
    try:
        return int(s)
    except ValueError:
        return cn_map.get(s, 1)
```

**三层解析策略**：

| 层 | 输入示例 | 行为 |
|:--|:---------|:-----|
| `int(s)` | `"1"`、`"12"` | 直接转数字 |
| `cn_map.get(s, 1)` | `"一"`、`"三"` | 中文数字映射 |
| 兜底 `1` | `"X"`、`"?"` | 无法解析时默认 1 |

**默认值 1 的设计意图**：如果题号完全无法解析，返回 1 比抛异常好。后续节点的 `load_questions_meta_node` 会从 DB 读取真正的题号覆盖它，所以这里只是临时占位，不要求精确。

---

## 四、`_sync_parse_word`：真正的 Word 解析逻辑（第 60~153 行）

### 4.1 函数签名

```python
def _sync_parse_word(word_path: str) -> list:
    """
    同步解析 Word 文件（在线程池中运行，避免阻塞事件循环）。

    返回 list[dict]，每个 dict 包含：
        question_no:    题号（int）
        header_text:    原始题目行文本
        student_answer: 学员作答文本（代码题为代码字符串）
        is_code:        True 表示代码题（仅代码题有此字段）
    """
```

**为什么是同步函数？** `python-docx` 的 `Document()` 内部有文件 I/O（打开 `.docx` zip）和 XML 解析（ElementTree），两者都是同步阻塞操作，不能直接在 async 函数里调用。

**返回值**：`list[dict]`，不是 `list[SomePydanticModel]`。因为解析结果的字段是动态的——`is_code` 只在代码题出现，用 Pydantic 强类型会过度约束。

### 4.2 Word 试卷模板约定

课件第 1960~1988 行定义了模板格式，解析器需要处理：

```
第1题 什么是 Spring IOC 容器？          ← 题头：第X题
作答区：                                ← 跳过
（学员在此作答）                         ← 普通答案

第2题 请比较 ArrayList 和 LinkedList。  ← 题头
答：                                     ← 答：前缀处理
学员写的答案内容                         ← 普通答案

第3题 编写一个 Java 方法...              ← 题头
```java                                  ← 代码块开始
public class Fib {                       ← 代码内容
    public int fib(int n) { ... }
}                                        ← 代码块结束
```                                      ← 代码块结束

Q.4 下列关于 Java 的说法，正确的是（ ）   ← 题头：Q.X 格式
答：A                                    ← 答：前缀提取
```

### 4.3 状态机设计

`_sync_parse_word` 本质上是一个**状态机**，逐行遍历 Word 段落，维护 4 个状态变量：

```python
current_question      = None       # 当前正在处理的题目 dict
current_answer_lines  = []         # 普通答案行累积
in_code_block         = False      # 是否在代码块内
code_buffer           = []         # 代码行累积
```

#### 状态转换图

```
         ┌──────────────────────────────────────┐
         │             遇到题头行                  │
         │  ────────────────────────────────     │
         │  ① 保存上一题（如果有）                 │
         │  ② 创建新 current_question             │
         │  ③ 清空所有缓冲区                      │
         │  ④ in_code_block = False              │
         └──────────────────────────────────────┘

         ┌──────────────────────────────────────┐
         │             遇到 ```                     │
         │  ────────────────────────────────     │
         │  ① 翻转 in_code_block                  │
         │  ② 闭合时：code_buffer → student_answer│
         │     并标记 is_code = True              │
         └──────────────────────────────────────┘

         ┌──────────────────────────────────────┐
         │          代码块内（in_code_block）       │
         │  ────────────────────────────────     │
         │  保留原始缩进，追加到 code_buffer         │
         └──────────────────────────────────────┘

         ┌──────────────────────────────────────┐
         │          普通行（非题头/代码/空行）        │
         │  ────────────────────────────────     │
         │  ① 跳过模板提示行（作答区/请在此处）       │
         │  ② 提取 "答：X" 冒号后的内容             │
         │  ③ 否则直接追加到 current_answer_lines   │
         └──────────────────────────────────────┘
```

### 4.4 逐行精读

#### 第 80~97 行：空行处理

```python
for para in doc.paragraphs:
    para_text = para.text.strip()

    if not para_text:
        if in_code_block:
            code_buffer.append("")
        continue
```

**空行在代码块内要保留**（缩进/空行是代码的一部分），在代码块外直接忽略。

#### 第 89~94 行：题头识别

```python
is_question_header = re.match(
    r"^(第?\s*[一二三四五六七八九十\d]+\s*[题、。.]|Q\.?\s*\d+|题目\s*\d+)",
    para_text,
    re.IGNORECASE,
)
```

正则表达式拆解：

| 分支 | 匹配示例 | 说明 |
|:-----|:---------|:-----|
| `第?\s*[一二三四五六七八九十\d]+\s*[题、。.]` | `第1题`、`第一题`、`1.` | 中文/数字题号 |
| `Q\.?\s*\d+` | `Q.4`、`Q4` | 英文题号格式 |
| `题目\s*\d+` | `题目1`、`题目 2` | 另一种中文格式 |

**`re.IGNORECASE`**：`Q.4` 和 `q.4` 都匹配。

`★ Insight ─────────────────────────────────────`
**正则比 if-else 链更合适**：题头格式有 3 种变体，如果用 `str.startswith()` 组合判断，需要写 3 组 `if` + 3 组 `elif`，且每种格式还要考虑空格和标点的变体。正则把 3 种格式压缩到 1 行，且扩展新格式只需要在 `|` 后加一个新分支。
`─────────────────────────────────────────────────`

#### 第 96~103 行：遇题头时保存上一题

```python
if is_question_header:
    if current_question is not None:
        if not current_question.get("is_code"):
            answer_text = "\n".join(code_buffer) if in_code_block \
                else "\n".join(current_answer_lines)
            current_question["student_answer"] = answer_text.strip()
        parsed_questions.append(current_question)
```

**关键逻辑**：`if not current_question.get("is_code")`——如果当前题是代码题（`is_code=True`），**跳过统一赋值**。因为代码题的答案已经在遇到闭合 ```` ` 时立刻写入了，不需要再覆盖。

**`if in_code_block` 的特殊情况**：如果文件末尾的代码块没有闭合（缺少 ```` `），`in_code_block` 仍然为 `True`，此时用 `code_buffer` 的内容作为答案。这是对不完整格式的宽容。

#### 第 105~112 行：提取题号

```python
match = re.search(r"[一二三四五六七八九十\d]+", para_text)
q_no = _chinese_to_int(match.group()) if match else len(parsed_questions) + 1
```

**`re.search` 而非 `re.match`**：`re.match` 从字符串开头匹配，`re.search` 在整个字符串中搜索。因为题头可能包含"第1题"、"1."、"Q.4"等多种格式，题号数字不一定在开头（如 `Q.4` 的 `4` 在第二位）。

**兜底 `len(parsed_questions) + 1`**：如果正则没找到任何数字，用当前已解析题数 + 1 作为题号。

#### 第 114~119 行：代码块处理

```python
elif para_text.startswith("```"):
    in_code_block = not in_code_block
    if not in_code_block and current_question:
        current_question["student_answer"] = "\n".join(code_buffer).strip()
        current_question["is_code"] = True
```

**`in_code_block = not in_code_block`**：翻转开关。第一个 ```` ` 打开，第二个 ```` ` 闭合。

**闭合时立刻写入**：遇到闭合 ```` ` 时，立即把 `code_buffer` 的内容写入 `student_answer` 并标记 `is_code=True`。这避免了最后统一赋值时可能被覆盖的问题。

#### 第 121~123 行：代码块内保留原始缩进

```python
elif in_code_block:
    code_buffer.append(para.text)   # 注意：不是 para_text（即没有 strip）
```

**`para.text` 而非 `para.text.strip()`**：代码缩进是有意义的，不能 strip。这是与普通答案行处理最大的区别。

#### 第 125~143 行：普通答案行处理

```python
elif current_question is not None:
    skip_prefixes = ["作答区", "请在此处"]
    if any(para_text.startswith(p) for p in skip_prefixes):
        pass
    else:
        answer_prefixes = ["答：", "答:", "Answer:"]
        extracted = None
        for prefix in answer_prefixes:
            if para_text.startswith(prefix):
                rest = para_text[len(prefix):].strip()
                if rest:
                    extracted = rest
                break   # 无论是否有内容都不再把整行加入
        if extracted is not None:
            current_answer_lines.append(extracted)
        elif not any(para_text.startswith(p) for p in answer_prefixes):
            current_answer_lines.append(para_text)
```

**两层过滤**：

| 层 | 过滤内容 | 处理方式 |
|:--|:---------|:---------|
| 第一层 | 纯模板提示行（`作答区`、`请在此处`） | 直接跳过（`pass`） |
| 第二层 | `答：` 前缀 | 提取冒号后内容，不加入整行 |

**`break` 的位置是关键**：匹配到前缀后立即 `break`，无论冒号后是否有内容。避免这种情况：`答：` 后面什么都没有，但整行 `"答："` 被当作普通答案加入 `current_answer_lines`。

#### 第 145~153 行：文件末尾处理

```python
# 保存最后一题
if current_question is not None:
    if not current_question.get("is_code"):
        answer_text = "\n".join(code_buffer) if in_code_block \
            else "\n".join(current_answer_lines)
        current_question["student_answer"] = answer_text.strip()
    parsed_questions.append(current_question)
```

**与第 96~103 行的逻辑完全对称**：文件末尾没有新的题头触发保存，所以需要显式处理最后一题。

---

## 五、`parse_word_node`：异步节点包装（第 156~184 行）

### 5.1 函数签名

```python
async def parse_word_node(state: ExamState) -> dict:
    """
    解析学员提交的 Word 试卷文件，提取各题作答内容。

    python-docx 内部有文件 I/O（打开 .docx zip）和 XML 解析（ElementTree），
    两者都是同步阻塞操作，不能直接在 async 函数里调用。
    用 run_in_executor(None, ...) 放入默认线程池，asyncio 事件循环继续处理
    其他协程，线程完成后 await 恢复。
    """
```

### 5.2 `run_in_executor` 的必要性

```python
loop = asyncio.get_running_loop()
parsed_questions = await loop.run_in_executor(None, _sync_parse_word, word_path)
```

**`get_running_loop()`**：获取当前正在运行的事件循环。

**`run_in_executor(None, func, *args)`**：
- 第一个参数 `None` → 使用默认线程池（`ThreadPoolExecutor`）
- 第二个参数 `_sync_parse_word` → 要执行的同步函数
- 第三个参数 `word_path` → 传给同步函数的参数

**为什么必须用？** `python-docx` 的 `Document(word_path)` 内部做两件事：

| 操作 | 耗时 | 阻塞类型 |
|:-----|:----|:---------|
| 解压 `.docx`（zip 格式） | 几毫秒~几十毫秒 | 文件 I/O |
| 解析 XML（ElementTree） | 取决于文件大小 | CPU 密集 |

如果直接在 `async def` 里调用 `Document(word_path)`，事件循环在这几十毫秒~几百毫秒内被阻塞，无法处理其他协程。

`★ Insight ─────────────────────────────────────`
**`run_in_executor` 是"同步转异步"的标准模式**：
- 直接调用同步函数 → 阻塞事件循环，所有协程卡住
- `run_in_executor` → 同步函数在**线程池**里跑，事件循环继续处理其他协程
- `await` 挂起当前协程，线程完成时自动恢复
- `None` 参数表示使用默认线程池，Python 3.9+ 默认是 `(os.cpu_count() or 4) * 5` 个线程
`─────────────────────────────────────────────────`

### 5.3 优雅降级

```python
except Exception as e:
    logger.error("parse_word.failed", error=str(e), file=word_path)
    # 优雅降级：文件损坏或格式不符时，返回空列表。
    # 后续 load_questions_meta_node 从 DB 补全题目信息，
    # student_answer 全部为空字符串，教师人工补批。
    return {"parsed_questions": []}
```

**`return {"parsed_questions": []}`** 而不是重抛异常或返回错误码。因为：

1. 图不能因为文件解析失败就中断——学员的其他环节（如 DB 已有数据）还需要继续
2. 返回空列表后，后续的 `load_questions_meta_node` 从 DB 加载题目元数据时，`parsed_questions` 为空，它只会加载元数据，`student_answer` 全部为空字符串
3. 最终结果是"教师人工补批"——虽然不完美，但比系统崩溃好

---

## 六、`★` 设计亮点总结

### 6.1 状态机逐行解析

4 个状态变量驱动整个解析逻辑，对每行只有 5 种判断：

| 行类型 | 处理 |
|:-------|:-----|
| 空行 | 代码块内保留，其他跳过 |
| 题头行 | 保存上一题，创建新题 |
| ```` ` | 翻转代码块开关 |
| 代码块内 | 保留原始缩进 |
| 普通行 | 跳过模板提示，提取 `答：`，否则原文 |

### 6.2 代码题特殊处理

代码题的答案在闭合 ```` ` 时**立即写入**，而不是在最后统一写入。`is_code` 标记防止最后统一赋值时覆盖已写入的代码内容。

### 6.3 `答：` 前缀剥离

解析器自动提取 `答：` / `答:` / `Answer:` 后的内容，避免 `"答：A"` 这种"前缀+答案"污染 `student_answer`。

### 6.4 `run_in_executor` 桥接同步 ↔ 异步

`python-docx` 是同步库，不能直接在 async 节点中调用。`run_in_executor` 把同步函数放到线程池，`await` 等待结果，是 LangGraph 中处理同步阻塞操作的**标准模式**。

### 6.5 优雅降级

解析失败时返回空列表而非崩溃，后续节点从 DB 补全题目信息，最终教师人工补批。这种"逐级降级"设计保证系统在部分故障时仍能运行。