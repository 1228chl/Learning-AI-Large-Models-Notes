# 智能分块：`split_documents` / `split_pdf_documents` / `split_markdown_documents` 深度解析

> 源文件：`scripts/build_knowledge_base.py` 第 42~63 行（分块器定义）、第 131~195 行（分块函数）
> 对应课件：5.3 智能分块

## 一、函数定位

```
split_documents()  ← 统一入口：根据扩展名路由
    │
    ├─ .pdf  →  split_pdf_documents()      ← 字符级切分
    │
    └─ .md   →  split_markdown_documents() ← 标题级切分 + 字符级切分
```

Step 2 的输入是 Step 1 加载出来的 `list[Document]`，输出是粒度更小的 `list[Document]`，每个 chunk 约 512~1200 字符。

---

## 二、模块级分块器单例（第 42~63 行）

两个分块器在模块加载时创建一次，后续所有分块调用复用同一个实例。

### 2.1 `_MD_HEADER_SPLITTER`：Markdown 标题分块器

```python
_MD_HEADER_SPLITTER = MarkdownHeaderTextSplitter(
    headers_to_split_on=[
        ("#",   "H1"),     # # 一级标题
        ("##",  "H2"),     # ## 二级标题
        ("###", "H3"),     # ### 三级标题
        ("####", "H4"),    # #### 四级标题
    ],
    strip_headers=False,   # 保留标题文本，检索时上下文更完整
)
```

**作用**：按 Markdown 标题层级切分文档，同时把标题信息存入 metadata。

**`strip_headers=False` 的含义**：保留标题文本在 chunk 的内容中，不剥离。这样检索时 chunk 内容包含标题，上下文更完整。

**示例**——输入：

```markdown
# Spring 框架
## IoC 容器
核心作用是控制反转，将对象的创建交给容器管理。
## AOP
面向切面编程，用于横切关注点的分离。
```

输出三个 chunk，metadata 自动包含标题层级：

```python
# chunk 1
{"H1": "Spring 框架", "H2": "IoC 容器",
 "content": "核心作用是控制反转，将对象的创建交给容器管理。"}

# chunk 2
{"H1": "Spring 框架", "H2": "AOP",
 "content": "面向切面编程，用于横切关注点的分离。"}
```

### 2.2 `_CHAR_SPLITTER`：递归字符分块器

```python
_CHAR_SPLITTER = RecursiveCharacterTextSplitter(
    chunk_size=512,
    chunk_overlap=100,
    separators=["\n\n", "\n", "。", "，", " ", ""],
)
```

**`RecursiveCharacterTextSplitter` 的"递归"含义**：从 `separators` 列表的第一个元素开始尝试切分，如果切出来的 chunk 仍然超过 `chunk_size`，就降级到下一个 separator 继续切。

```
分隔符优先级（从高到低）：
  段落（\n\n）→ 行（\n）→ 句号（。）→ 逗号（，）→ 空格 → 字符
```

**切分过程示例**——一段 800 字符的文本：

```
第 1 轮：用 \n\n（段落）切 → 如果段落 > 512 字符，进入第 2 轮
第 2 轮：用 \n（行）切     → 如果某行 > 512 字符，进入第 3 轮
第 3 轮：用 。（句号）切   → 如果某句 > 512 字符，进入第 4 轮
...
第 6 轮：用 ""（字符）切   → 强制按字符数切
```

**`chunk_overlap=100`**：相邻 chunk 有 100 字符的重叠，避免切在句子中间导致语义断裂。比如：

```
chunk 1: "Spring 框架的核心是 IoC 容器，它实现了控制反转..."
chunk 2:                      "它实现了控制反转，将对象的创建交给容器管理..."
         ↑ 重叠 100 字符 ↑
```

**`chunk_size=512`**：每个 chunk 约 512 字符。BGE-M3 的上下文窗口是 8192 token，512 字符绰绰有余，同时保留足够语义密度。

---

## 三、`split_documents`：统一分块入口（第 187~195 行）

```python
def split_documents(docs: list[Document], file_path: str) -> list[Document]:
    """统一分块入口，根据文件类型自动选择分块策略"""
    ext = Path(file_path).suffix.lower()
    if ext == ".pdf":
        return split_pdf_documents(docs)
    elif ext in (".md", ".markdown"):
        return split_markdown_documents(docs)
    else:
        raise ValueError(f"不支持的文件类型：{ext}")
```

和 `load_document` 同样的**简单工厂**模式——根据扩展名路由到不同的分块策略。PDF 和 Markdown 采用完全不同的分块策略，因为它们的文档结构完全不同。

---

## 四、`split_pdf_documents`：PDF 分块（第 133~148 行）

```python
def split_pdf_documents(pages: list[Document]) -> list[Document]:
    """PDF 文档分块：过滤空页 + RecursiveCharacterTextSplitter"""
    non_empty_pages = [p for p in pages if len(p.page_content.strip()) > 20]
    skipped = len(pages) - len(non_empty_pages)
    if skipped > 0:
        print(f"  过滤空页：{skipped} 页（图片/扫描件页）")

    chunks = _CHAR_SPLITTER.split_documents(non_empty_pages)

    for chunk in chunks:
        filename = Path(chunk.metadata.get("source", "未知文件")).stem
        page_num = chunk.metadata.get("page", 0) + 1
        chunk.metadata["source_name"] = f"{filename} 第{page_num}页"

    print(f"  [PDF] 分块完成：{len(non_empty_pages)} 页 → {len(chunks)} 个 chunk")
    return chunks
```

### 4.1 过滤空页（第 135~138 行）

```python
non_empty_pages = [p for p in pages if len(p.page_content.strip()) > 20]
```

**为什么是 `> 20` 而不是 `> 0`？** 容忍少量噪声字符。扫描件页偶尔能提取到几个乱码字符，`> 20` 确保只过滤真正空白的页。

### 4.2 字符级切分（第 140 行）

```python
chunks = _CHAR_SPLITTER.split_documents(non_empty_pages)
```

**跨页切分**：`RecursiveCharacterTextSplitter` 不关心页边界，它把非空页的文本连在一起，按字符自然切分。一页内容超过 512 字符会被切成多个 chunk；一页内容不足 512 字符，会与相邻页的内容合并。

### 4.3 来源标注（第 142~145 行）

```python
page_num = chunk.metadata.get("page", 0) + 1
chunk.metadata["source_name"] = f"{filename} 第{page_num}页"
```

`page` 从 0 开始（PyPDFLoader 的页码从 0 计数），`+ 1` 后显示为人类可读的"第 3 页"。

---

## 五、`split_markdown_documents`：Markdown 分块（第 151~184 行）

```python
def split_markdown_documents(
    docs: list[Document],
    chunk_size: int = 1200,
    chunk_overlap: int = 100,
) -> list[Document]:
    """Markdown 文档分块：MarkdownHeaderTextSplitter + MarkdownTextSplitter 两阶段"""
    splitter = MarkdownTextSplitter(chunk_size=chunk_size, chunk_overlap=chunk_overlap)

    header_chunks: list[Document] = []
    for doc in docs:
        sections = _MD_HEADER_SPLITTER.split_text(doc.page_content)
        source_path = doc.metadata.get("source", "")
        for section in sections:
            section.metadata["source"] = source_path
        header_chunks.extend(sections)

    final_chunks = splitter.split_documents(header_chunks)

    for chunk in final_chunks:
        source_path = chunk.metadata.get("source", "")
        filename    = Path(source_path).stem if source_path else "未知文件"
        parts = [
            chunk.metadata.get("H1", ""),
            chunk.metadata.get("H2", ""),
            chunk.metadata.get("H3", ""),
            chunk.metadata.get("H4", ""),
        ]
        parts = [p for p in parts if p]
        chunk.metadata["source_name"] = (
            f"{filename} > {' > '.join(parts)}" if parts else filename
        )

    print(f"  [MD]  分块完成：{len(docs)} 个文件 → {len(final_chunks)} 个 chunk")
    return final_chunks
```

### 5.1 `★` 两阶段分块——核心设计

这是 Markdown 分块策略的精髓，和 PDF 的"一步到位"完全不同。

#### 第一阶段：按标题层级切分（第 159~165 行）

```python
for doc in docs:
    sections = _MD_HEADER_SPLITTER.split_text(doc.page_content)
```

```
原始文档：
  # Spring 框架
  ## IoC 容器
  核心作用是控制反转...
  ## AOP
  面向切面编程，用于横切关注点的分离...

第一阶段输出（header_chunks）：
  ┌─ chunk 1: metadata={H1: "Spring 框架", H2: "IoC 容器"},
  │            content="核心作用是控制反转..."
  │
  └─ chunk 2: metadata={H1: "Spring 框架", H2: "AOP"},
               content="面向切面编程，用于横切关注点的分离..."
```

每个 chunk 的 metadata 自动带上标题层级，后续检索时可以知道"这段内容来自哪一章哪一节"。

#### 第二阶段：按字符长度二次切分（第 167 行）

```python
final_chunks = splitter.split_documents(header_chunks)
```

如果某个标题下的内容太长（超过 1200 字符），再按字符切分，同时保留 metadata 中的标题层级：

```
  ┌─ chunk 1: metadata={H1: "Spring 框架", H2: "IoC 容器"},
  │            content="核心作用是控制反转...(前半段)"
  │
  └─ chunk 1.1: metadata={H1: "Spring 框架", H2: "IoC 容器"},
                 content="...(后半段)"
```

注意两个 chunk 的 metadata 相同——因为它们来自同一个标题下的内容，只是被字符长度切开了。

### 5.2 来源标注：标题树（第 169~181 行）

```python
parts = [
    chunk.metadata.get("H1", ""),
    chunk.metadata.get("H2", ""),
    chunk.metadata.get("H3", ""),
    chunk.metadata.get("H4", ""),
]
parts = [p for p in parts if p]
chunk.metadata["source_name"] = (
    f"{filename} > {' > '.join(parts)}" if parts else filename
)
```

遍历 H1 → H2 → H3 → H4，过滤掉空值，用 `>` 串联：

| 标题层级 | source_name |
|---------|------------|
| 只有 H1 | `"Spring框架 > IoC容器"` |
| H1 + H2 + H3 | `"Spring框架 > IoC容器 > 核心作用"` |
| 无标题（纯文本文件） | `"文件名"` |

结果类似文件路径，可读性极强。

### 5.3 为什么 PDF 用 `chunk_size=512`，Markdown 用 `1200`？

| 维度 | PDF | Markdown |
|------|-----|---------|
| 内容特点 | 纯文本段落 | 可能包含代码块、列表、表格 |
| chunk_size | 512 | 1200 |
| 原因 | 纯文本密度高，512 够用 | 结构化内容需要更多空间，避免在代码中间切分 |

---

## 六、对比：PDF 分块 vs Markdown 分块

| 维度 | `split_pdf_documents` | `split_markdown_documents` |
|------|----------------------|--------------------------|
| 分块阶段 | 单阶段 | 两阶段（标题切分 → 字符切分） |
| 分块器 | `RecursiveCharacterTextSplitter` | `MarkdownHeaderTextSplitter` + `MarkdownTextSplitter` |
| chunk_size | 512 | 1200 |
| 预过滤 | 过滤空页（图片/扫描件） | 无 |
| 来源标注 | `"文件名 第X页"` | `"文件名 > H1 > H2 > H3"` |
| 核心思路 | 按自然段落切分 | 按文档结构切分，保留层级 |
| 输出 metadata | `source` / `page` / `source_name` | `source` / `H1~H4` / `source_name` |

---

## 七、数据流全景

```
Step 1: 加载                    Step 2: 分块
┌──────────┐                  ┌─────────────────┐
│ sample.pdf│  pages[0..N]   │                  │
│  PyPDF    │ ─────────────→ │ ① 过滤空页        │
│  Loader   │                │     len(text) > 20 │
└──────────┘                 │ ② 字符级切分       │
                              │     chunk_size=512 │
                              │     chunk_overlap=100
                              │ ③ 标注来源          │
                              │     "文件名 第X页"  │
                              └─────────────────┘
                                      │
                                      ▼
                              ┌─────────────────┐
                              │  N 个 chunk      │
                              │  page_content 纯文本 │
                              │  source_name 带页码 │
                              └─────────────────┘

┌──────────┐                  ┌─────────────────────┐
│ sample.md│  docs[0]        │                     │
│  Text    │ ─────────────→ │ ① 按标题层级切分      │
│  Loader  │                 │     MarkdownHeaderTextSplitter
└──────────┘                 │     metadata 自动带 H1~H4
                              │ ② 字符级二次切分      │
                              │     MarkdownTextSplitter
                              │     chunk_size=1200
                              │ ③ 标注来源            │
                              │     "文件名 > H1 > H2"
                              └─────────────────────┘
                                      │
                                      ▼
                              ┌─────────────────┐
                              │  N 个 chunk      │
                              │  page_content 可含代码 │
                              │  source_name 带标题树  │
                              └─────────────────┘
                                      │
                                      ▼
                              Step 3: BGE-M3 嵌入
```

---

## 八、`★` 设计亮点总结

### 8.1 两阶段分块

Markdown 分块的核心设计：先按标题层级切出"语义块"，再对过长的块按字符切分。这样切出来的 chunk 既有完整的语义边界，又不会太长。

### 8.2 递归降级切分

`RecursiveCharacterTextSplitter` 的 `separators` 优先级机制：从最自然的切分点（段落）开始，逐步降级到字符级。保证切分质量的同时覆盖所有边界情况。

### 8.3 差异化的分块策略

PDF 和 Markdown 采用完全不同的策略，因为它们的文档结构不同：

```
PDF:     逐页 → 字符切分 → 标注页码
Markdown: 全文 → 标题切分 → 字符切分 → 标注标题树
```

### 8.4 来源标注

两种来源标注方式各有侧重：

| 格式 | 适用场景 | 示例 |
|------|---------|------|
| `"文件名 第X页"` | PDF | `"Spring入门 第3页"` |
| `"文件名 > H1 > H2"` | Markdown | `"Spring入门 > IoC容器 > 核心作用"` |

检索时用户一眼就能定位 chunk 在文档中的位置。