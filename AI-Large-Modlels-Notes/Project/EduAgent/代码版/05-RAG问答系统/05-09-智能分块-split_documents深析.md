# 智能分块：`split_documents` / `split_pdf_documents` / `split_markdown_documents` 深度解析

> 源文件：`scripts/build_knowledge_base.py`
> 对应课件：5.3 智能分块

---

## 全文行号速查表

| 行号范围 | 标识符 | 类型 | 一句话说明 |
|----------|--------|------|-----------|
| 45~53 | `_MD_HEADER_SPLITTER` | 模块级单例 | Markdown 标题分块器（按 H1~H4 切分） |
| 54~63 | `_CHAR_SPLITTER` | 模块级单例 | 递归字符分块器（chunk_size=512, overlap=100） |
| 133~148 | `split_pdf_documents()` | 函数 | PDF 分块：过滤空页 + 字符级切分 |
| 151~184 | `split_markdown_documents()` | 函数 | MD 分块：两阶段（标题切分 + 字符切分） |
| 187~196 | `split_documents()` | 函数 | 统一分块入口，按扩展名路由 |

---

## 一、函数签名速览

```python
# build_knowledge_base.py 第 133~148 行
def split_pdf_documents(pages: list[Document]) -> list[Document]:

# build_knowledge_base.py 第 151~184 行
def split_markdown_documents(
    docs: list[Document],
    chunk_size: int = 1200,
    chunk_overlap: int = 100,
) -> list[Document]:

# build_knowledge_base.py 第 187~196 行
def split_documents(docs: list[Document], file_path: str) -> list[Document]:
```

---

## 二、设计动机

**为什么分块策略需要差异化？** PDF 和 Markdown 的文档结构完全不同：

| 维度 | PDF | Markdown |
|------|-----|---------|
| 结构信息 | 仅有页码，无标题层次 | 有明确的 H1~H4 标题层级 |
| 内容类型 | 纯文本段落（无代码/表格） | 可能包含代码块、列表、表格 |
| 分块策略 | 单阶段字符切分 | 两阶段：先按标题切分语义块，再按字符切分 |
| chunk_size | 512（纯文本密度高，够用） | 1200（结构化内容需要更多空间） |

**核心目标**：chunk 既要足够小（便于检索和嵌入），又要保留完整的语义边界（不把一个段落切到两个 chunk 里）。

---

## 三、模块级分块器单例（第 45~63 行）

```python
# build_knowledge_base.py 第 45~53 行
_MD_HEADER_SPLITTER = MarkdownHeaderTextSplitter(
    headers_to_split_on=[
        ("#",   "H1"),
        ("##",  "H2"),
        ("###", "H3"),
        ("####", "H4"),
    ],
    strip_headers=False,
)
```

```python
# build_knowledge_base.py 第 54~63 行
_CHAR_SPLITTER = RecursiveCharacterTextSplitter(
    chunk_size=512,
    chunk_overlap=100,
    separators=["\n\n", "\n", "。", "，", " ", ""],
)
```

两个分块器在模块加载时创建一次，后续所有分块调用复用同一个实例。

### 逐行精读

#### `_MD_HEADER_SPLITTER`（第 45~53 行）

| 行号 | 代码 | 说明 |
|------|------|------|
| 45 | `_MD_HEADER_SPLITTER = MarkdownHeaderTextSplitter(` | 导入时初始化，模块级单例 |
| 46~51 | `headers_to_split_on=[...]` | 按 `#` `##` `###` `####` 四个级别切分，metadata 分别存为 `H1` `H2` `H3` `H4` |
| 52 | `strip_headers=False` | 保留标题文本在 chunk 内容中，不剥离。检索时 chunk 内容包含标题，上下文更完整 |

**示例**——输入 Markdown：

```markdown
# Spring 框架
## IoC 容器
核心作用是控制反转，将对象的创建交给容器管理。
## AOP
面向切面编程，用于横切关注点的分离。
```

输出三个 chunk，metadata 自动包含标题层级：

```
chunk 1: metadata={H1: "Spring 框架", H2: "IoC 容器"},
         content="核心作用是控制反转，将对象的创建交给容器管理。"

chunk 2: metadata={H1: "Spring 框架", H2: "AOP"},
         content="面向切面编程，用于横切关注点的分离。"
```

#### `_CHAR_SPLITTER`（第 54~63 行）

| 行号 | 代码 | 说明 |
|------|------|------|
| 59~63 | `_CHAR_SPLITTER = RecursiveCharacterTextSplitter(` | 递归字符分块器，从最自然的切分点开始尝试 |
| 60 | `chunk_size=512` | 每个 chunk 约 512 字符，BGE-M3 的 8192 token 上限绰绰有余 |
| 61 | `chunk_overlap=100` | 相邻 chunk 重叠 100 字符，避免切在句子中间导致语义断裂 |
| 62 | `separators=["\n\n", "\n", "。", "，", " ", ""]` | 切分优先级：段落 > 行 > 句号 > 逗号 > 空格 > 字符 |

**RecursiveCharacterTextSplitter 的"递归"含义**：从 `separators` 列表的第一个元素开始尝试切分，如果切出来的 chunk 仍然超过 `chunk_size`，就降级到下一个 separator 继续切。

```
切分过程示例——一段 800 字符的文本：
第 1 轮：用 \n\n（段落）切 → 如果段落 > 512 字符，进入第 2 轮
第 2 轮：用 \n（行）切     → 如果某行 > 512 字符，进入第 3 轮
第 3 轮：用 。（句号）切   → 如果某句 > 512 字符，进入第 4 轮
...
第 6 轮：用 ""（字符）切   → 强制按字符数切
```

**chunk_overlap 的作用**：

```
chunk 1: "Spring 框架的核心是 IoC 容器，它实现了控制反转..."
chunk 2:                      "它实现了控制反转，将对象的创建交给容器管理..."
         ↑ 重叠 100 字符 ↑
```

---

## 四、`split_documents()`：统一分块入口（第 187~196 行）

```python
# build_knowledge_base.py 第 187~196 行
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

### 逐行精读

| 行号 | 代码 | 说明 |
|------|------|------|
| 187 | `def split_documents(docs, file_path):` | 输入 Step 1 加载的 `list[Document]`，输出粒度更小的 `list[Document]` |
| 189 | `ext = Path(file_path).suffix.lower()` | 提取扩展名，统一转小写 |
| 190~191 | `if ext == ".pdf": return split_pdf_documents(docs)` | PDF 路由到字符级分块 |
| 192~193 | `elif ext in (".md", ".markdown"): return split_markdown_documents(docs)` | MD 路由到两阶段分块 |
| 194~195 | `else: raise ValueError(...)` | 不支持的类型直接抛异常 |

和 `load_document` 同样的**简单工厂**模式——根据扩展名路由到不同的分块策略。

---

## 五、`split_pdf_documents()`：PDF 分块（第 133~148 行）

```python
# build_knowledge_base.py 第 133~148 行
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

### 逐行精读

| 行号 | 代码 | 说明 |
|------|------|------|
| 133 | `def split_pdf_documents(pages):` | 输入是按页加载的 `list[Document]` |
| 135 | `non_empty_pages = [p for p in pages if len(p.page_content.strip()) > 20]` | **过滤空页**：`> 20` 而非 `> 0`，容忍少量噪声字符（扫描件页偶尔能提取到几个乱码字符） |
| 136~138 | `skipped = len(pages) - len(non_empty_pages)` | 统计被过滤的页数，打印提示信息 |
| 140 | `chunks = _CHAR_SPLITTER.split_documents(non_empty_pages)` | 用模块级 `_CHAR_SPLITTER` 做字符级切分。**跨页切分**：不关心页边界，非空页文本连在一起按字符自然切分 |
| 142~145 | 来源标注 | 提取文件名和页码，`page` 从 0 开始（PyPDFLoader 页码从 0 计数），`+ 1` 后显示为人类可读的"第 3 页" |
| 147 | 打印完成信息 | 格式：`几页 → 几个 chunk` |

---

## 六、`split_markdown_documents()`：Markdown 分块（第 151~184 行）

```python
# build_knowledge_base.py 第 151~184 行
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

### 逐行精读

| 行号 | 代码 | 说明 |
|------|------|------|
| 151~155 | 函数签名 | `chunk_size=1200` 默认，代码类内容偏大，纯文字可调低到 600~800 |
| 157 | `splitter = MarkdownTextSplitter(chunk_size, chunk_overlap)` | 第二阶段分块器，用于按字符长度二次切分 |
| 159~165 | **第一阶段：按标题层级切分** | 遍历每个文档，用 `_MD_HEADER_SPLITTER` 按 H1~H4 切分，同时保留 `source` metadata |
| 167 | `final_chunks = splitter.split_documents(header_chunks)` | **第二阶段：按字符长度二次切分**——如果某个标题下的内容太长（超过 1200 字符），再按字符切分 |
| 169~181 | 来源标注：标题树 | 遍历 H1→H2→H3→H4，过滤空值，用 `>` 串联，结果类似文件路径 |
| 183 | 打印完成信息 | 格式：`几个文件 → 几个 chunk` |

### 两阶段分块详解

**核心设计**：Markdown 分块策略的精髓，和 PDF 的"一步到位"完全不同。

#### 第一阶段：按标题层级切分（第 159~165 行）

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

如果某个标题下的内容太长（超过 1200 字符），再按字符切分，同时保留 metadata 中的标题层级：

```
  ┌─ chunk 1: metadata={H1: "Spring 框架", H2: "IoC 容器"},
  │            content="核心作用是控制反转...(前半段)"
  │
  └─ chunk 1.1: metadata={H1: "Spring 框架", H2: "IoC 容器"},
                 content="...(后半段)"
```

注意两个 chunk 的 metadata 相同——因为它们来自同一个标题下的内容，只是被字符长度切开了。

### 来源标注：标题树（第 169~181 行）

| 标题层级 | `source_name` |
|---------|---------------|
| 只有 H1 | `"Spring框架 > IoC容器"` |
| H1 + H2 + H3 | `"Spring框架 > IoC容器 > 核心作用"` |
| 无标题（纯文本文件） | `"文件名"` |

结果类似文件路径，可读性极强，检索时用户一眼就能定位 chunk 在文档中的位置。

---

## 七、依赖关系

```
split_documents(docs, file_path)
  │
  ├─ .pdf  →  split_pdf_documents(pages)
  │              ├─ _CHAR_SPLITTER.split_documents()     ← 模块级单例
  │              └─ Path().stem / metadata["page"]       ← 来源标注
  │
  └─ .md   →  split_markdown_documents(docs)
                 ├─ _MD_HEADER_SPLITTER.split_text()     ← 模块级单例（第一阶段）
                 └─ MarkdownTextSplitter.split_documents() ← 第二阶段
```

**外部依赖**：
- `langchain_text_splitters.MarkdownHeaderTextSplitter` — 按 Markdown 标题层级切分
- `langchain_text_splitters.RecursiveCharacterTextSplitter` — 递归字符分块
- `langchain_text_splitters.MarkdownTextSplitter` — Markdown 专用字符分块

---

## 八、`★ Insight ───` 设计亮点

### 8.1 两阶段分块

Markdown 分块的核心设计：先按标题层级切出"语义块"，再对过长的块按字符切分。切出来的 chunk 既有完整的语义边界，又不会太长。

### 8.2 递归降级切分

`RecursiveCharacterTextSplitter` 的 `separators` 优先级机制：从最自然的切分点（段落）开始，逐步降级到字符级。保证切分质量的同时覆盖所有边界情况。

### 8.3 差异化的分块策略

PDF 和 Markdown 采用完全不同的策略，因为它们的文档结构不同：

```
PDF:     逐页 → 字符切分 → 标注页码
Markdown: 全文 → 标题切分 → 字符切分 → 标注标题树
```

### 8.4 模块级分块器单例

两个分块器在模块加载时创建一次，后续所有分块调用复用同一个实例。避免反复创建分块器实例的开销，同时保证分块参数一致。

### 8.5 来源标注：两种格式各有侧重

| 格式 | 适用场景 | 示例 |
|------|---------|------|
| `"文件名 第X页"` | PDF | `"Spring入门 第3页"` |
| `"文件名 > H1 > H2"` | Markdown | `"Spring入门 > IoC容器 > 核心作用"` |

检索时用户一眼就能定位 chunk 在文档中的位置。