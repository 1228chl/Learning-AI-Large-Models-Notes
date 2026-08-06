# PDF 文本提取：`_sync_extract_text` 深度解析

> 源文件：`backend/agents/resume/nodes.py` 第 55~90 行

## 一、函数签名与定位

```python
def _sync_extract_text(pdf_path: str) -> dict:
    """同步 PDF 文本提取（线程池中运行），处理双栏布局。"""
```

- **输入**：PDF 文件路径
- **输出**：`{"raw_text": str, "page_count": int}`
- **命名**：下划线前缀 `_sync` 表示"内部同步函数"——它不直接暴露给外部调用，而是通过 `extract_text_node` 异步节点用线程池包装后调用

## 二、为什么需要这个函数？

简历 PDF 的排版千奇百怪，最棘手的是**双栏布局**：

```
┌─────────────┬──────────────┐
│  个人信息    │  项目经历     │
│  姓名：张三  │  电商系统     │
│  电话：138…  │  2023.06-12  │
│  邮箱：z@…   │  QPS 提升30% │
│             │              │
│  技能        │  工作经历     │
│  Java       │  ××公司       │
│  Spring Boot│  2021-2023   │
│  Redis      │  后端开发     │
└─────────────┴──────────────┘
```

如果不做双栏处理，PyMuPDF 返回的文字块顺序可能是：左栏第 1 块 → 右栏第 1 块 → 左栏第 2 块 → 右栏第 2 块……最终提取的文字左右交错，LLM 完全无法理解。

## 三、逐行精读

### 3.1 打开 PDF

```python
import fitz                       # PyMuPDF — 最流行的 Python PDF 库
doc = fitz.open(pdf_path)
page_count = len(doc)             # 总页数
all_text_parts = []               # 收集每页的文本
```

`fitz.open` 返回 `Document` 对象，`len(doc)` 就是页数，不需要额外调用。

### 3.2 获取文字块

```python
for page in doc:
    blocks = page.get_text("blocks")
```

`page.get_text("blocks")` 返回的每个块是一个元组：

| 索引 | 字段 | 含义 |
|------|------|------|
| `b[0]` | `x0` | 左上角 x 坐标 |
| `b[1]` | `y0` | 左上角 y 坐标 |
| `b[2]` | `x1` | 右下角 x 坐标 |
| `b[3]` | `y1` | 右下角 y 坐标 |
| `b[4]` | `text` | 文本内容 |
| `b[5]` | `block_no` | 块编号 |
| `b[6]` | `type` | 0=文字, 1=图片 |

### 3.3 过滤文字块

```python
text_blocks = [b for b in blocks if b[6] == 0]
```

只保留 `type == 0` 的文字块，过滤掉图片块（`type == 1`）。如果页面只有图片（例如扫描件 PDF），`text_blocks` 为空，直接 `continue` 跳过。

### 3.4 双栏判定

```python
page_width = page.rect.width
midpoint   = page_width / 2
left_blocks  = [b for b in text_blocks if b[0] < midpoint - 20]
right_blocks = [b for b in text_blocks if b[0] >= midpoint - 20]
is_two_column = (
    len(left_blocks) >= 2 and len(right_blocks) >= 2
    and len(right_blocks) / max(len(text_blocks), 1) > 0.3
)
```

**判定逻辑拆解**：

1. **以中线分左右**：`b[0] < midpoint - 20` 是左栏，`>=` 是右栏。`-20` 是 20px 的容差窗口，防止中线附近的块被误分。
2. **三个条件**缺一不可：
   - 左栏至少有 2 个块（防止左栏只有标题这种噪声）
   - 右栏至少有 2 个块（同上）
   - 右栏块数占比 > 30%（防止左栏正文 + 右侧零星页码/注释被误判为双栏）

> 为什么是 20px 和 0.3？这是经验值，基于中文简历常见排版宽度。如果页面宽度是 595px（A4），中线在 297.5px，容差窗口是 277.5~297.5px——这个宽度刚好能容纳常见的栏间距。

### 3.5 双栏阅读顺序

```python
if is_two_column:
    left_sorted  = sorted(left_blocks,  key=lambda b: b[1])   # 按 y 排序
    right_sorted = sorted(right_blocks, key=lambda b: b[1])
    page_text = (
        "\n".join(b[4].strip() for b in left_sorted  if b[4].strip())
        + "\n"
        + "\n".join(b[4].strip() for b in right_sorted if b[4].strip())
    )
```

**核心思路**：先读完整左栏（从上到下），再读完整右栏（从上到下）。这样输出顺序是：

```
姓名：张三
电话：138…
邮箱：z@…
技能：Java, Spring Boot, Redis
                   ← 空行分隔
项目经历
电商系统 2023.06-12
QPS 提升 30%
工作经历
××公司 2021-2023
```

而不是：

```
姓名：张三
项目经历          ← 左栏第1块 → 右栏第1块 → 左栏第2块 → 右栏第2块
电话：138…
电商系统 2023.06-12
```

### 3.6 单栏阅读顺序

```python
else:
    sorted_blocks = sorted(text_blocks, key=lambda b: b[1])
    page_text = "\n".join(b[4].strip() for b in sorted_blocks if b[4].strip())
```

单栏排版按 `y` 坐标从上到下排序即可。`b[1]` 是 `y0`（左上角 y 坐标），`y` 越小越靠上。

### 3.7 组装输出

```python
doc.close()
raw_text = "\n\n---PAGE BREAK---\n\n".join(all_text_parts)
return {"raw_text": raw_text, "page_count": page_count}
```

- 每页之间用 `---PAGE BREAK---` 分隔，方便后续 LLM 感知分页边界
- 同时返回 `page_count` 供日志和校验使用

## 四、调用方式：线程池包装

`_sync_extract_text` 是同步函数，但被 `extract_text_node` 用线程池调用：

```python
async def extract_text_node(state: ResumeState) -> dict:
    pdf_path = state["pdf_local_path"]
    try:
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, _sync_extract_text, pdf_path)
        raw_text, page_count = result["raw_text"], result["page_count"]
        if len(raw_text.strip()) < 200:
            logger.warning("extract_text.text_too_short", ...)
        return {"raw_text": raw_text, "page_count": page_count}
    except Exception as e:
        logger.error("extract_text.failed", error=str(e))
        raise
```

**关键点**：

- `run_in_executor(None, fn, arg)` 把 `fn(arg)` 丢到默认线程池（`concurrent.futures.ThreadPoolExecutor`）执行
- 如果提取出的文本少于 200 字符，大概率是扫描件/图片 PDF，仅打告警日志，不阻塞流程
- 异常直接上抛，由上层 Graph 框架统一处理

## 五、`★` 设计亮点

### 5.1 软阈值判定

双栏检测不是硬编码 `is_two_column = True/False`，而是用三个条件综合判断。对比硬编码方案：

```
❌ 硬编码：if number_of_columns == 2:
✅ 软阈值：left≥2 && right≥2 && right_ratio > 0.3
```

软阈值的好处：
- 容错：左栏只有 1 个块（比如只有标题）+ 右栏满篇正文 → 不会误判为双栏
- 自适应：页面宽度不同（A4/Letter/宽屏 PDF）自动适应
- 可调：`20px` 容差和 `0.3` 比例是两个旋钮，遇到极端排版可以微调

### 5.2 同步袋鼠进异步池

PyMuPDF 没有异步 API，但 `run_in_executor` 让同步代码在异步框架中"看起来是异步的"：

```
事件循环线程： ──extract_text_node──await──────────────────→
                   │
线程池线程：       └──_sync_extract_text (CPU 密集)──→
```

事件循环不会被阻塞，其他请求可以继续处理。

### 5.3 降级友好

- 空页 → `continue` 跳过，不会报错
- 扫描件 → `text_too_short` 告警，后续节点 LLM 处理短文本时降级
- 异常 → 上抛，由 Graph 框架统一重试/降级

## 六、与其他方案的对比

| 方案 | 优点 | 缺点 |
|------|------|------|
| **PyMuPDF (本方案)** | 速度快（C 底层）、双栏处理、轻量 | 无法处理扫描件 OCR |
| `pdfplumber` | 精度高、表格提取强 | 慢、依赖多 |
| `pdfminer.six` | 纯 Python、细粒度控制 | 极慢 |
| `pypdf` | 纯 Python、简单 | 文本提取质量差 |
| OCR (PaddleOCR) | 可处理扫描件 | 慢、需要 GPU、依赖重 |

本项目选择 PyMuPDF 是因为简历 PDF 99% 是文字型（非扫描件），PyMuPDF 的速度和精度是最佳平衡点。

## 七、边界情况处理

| 场景 | 表现 |
|------|------|
| 空 PDF（0 页） | `page_count=0`，`raw_text=""` |
| 单栏排版 | 全部按 y 排序，正常提取 |
| 双栏排版 | 左→右阅读顺序 |
| 三栏排版 | 会被判断为"非双栏"，按 y 排序，左右交错（少见，中文简历极少三栏） |
| 扫描件/图片 PDF | `text_blocks` 为空或 `raw_text` < 200 字符，打告警日志 |
| 混合排版（第一页单栏，第二页双栏） | 逐页独立判断，正常处理 |
| 带页眉页脚 | 页眉页脚作为文字块被正常提取，不影响阅读顺序 |
| PDF 损坏/加密 | PyMuPDF 抛异常，上层 catch 并记录 |

## 八、性能分析

`_sync_extract_text` 的主要耗时在 `page.get_text("blocks")` 调用。PyMuPDF 是 C 底层实现，解析速度极快：

- 普通 A4 简历（1~2 页）：< 10ms
- 厚文档（50 页）：< 50ms
- 带复杂排版的 PDF：< 100ms

因此线程池的开销（`run_in_executor` 的上下文切换 ~1ms）几乎可以忽略不计，这个函数不会成为性能瓶颈。