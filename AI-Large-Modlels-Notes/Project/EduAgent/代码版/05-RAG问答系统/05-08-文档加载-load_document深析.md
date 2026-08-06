# 文档加载：`load_document` / `load_pdf` / `load_markdown` 深度解析

> 源文件：`scripts/build_knowledge_base.py` 第 67~128 行
> 对应课件：5.2 文档加载

## 一、函数定位与三层架构

```
            load_document()  ← 统一入口：根据扩展名路由
              │                  │
              ▼                  ▼
        load_pdf()         load_markdown()
        PyPDFLoader        TextLoader
```

这三个函数是知识库构建流水线的 **Step 1**，负责把磁盘上的原始文件加载到内存中的 `Document` 对象。输出直接喂给 Step 2（智能分块）。

在 `build_pipeline()` 中的调用：

```python
docs = load_document(file_path)       # ← 这里
chunks = split_documents(docs, file_path)  # ← 下一步
```

---

## 二、`load_pdf`：PDF 文档加载

```python
def load_pdf(file_path: str) -> list[Document]:
    """
    加载 PDF 文档，每页返回一个 Document。

    只提取文字层内容；图片/扫描件页面 page_content 为空字符串，
    不报错（在 5.3 分块时会过滤掉空页）。

    Args:
        file_path: PDF 文件的本地路径

    Returns:
        list[Document]，每个 Document 对应一页
        metadata 包含 source（文件路径）和 page（页码，从 0 开始）
    """
    loader = PyPDFLoader(file_path)
    pages = loader.load()
    print(f"  [PDF] 加载完成：{len(pages)} 页 ← {Path(file_path).name}")
    return pages
```

### 2.1 核心逻辑

`PyPDFLoader` 是 LangChain 社区提供的 PDF 加载器，内部使用 **PyMuPDF（fitz）** 做 PDF 解析——和简历审查 Agent 中 `extract_text_node` 用的同一个库。

每一页被包装成一个 `Document` 对象：

| Document 字段 | 内容 | 示例 |
|--------------|------|------|
| `page_content` | 该页的文本内容 | `"Spring IOC 容器是..."` |
| `metadata.source` | 文件路径 | `"./samples/spring.pdf"` |
| `metadata.page` | 页码（从 0 开始） | `2` |

### 2.2 为什么返回 `list[Document]` 而不是 `Document`？

PDF 天然有"页"的概念，每页一个 Document 有三个好处：

- **分块时可以知道 chunk 来自哪一页**：后续 `split_pdf_documents` 会在 metadata 中标注 `source_name = "文件名 第3页"`
- **过滤空页很方便**：图片页/扫描件页的 `page_content` 是空字符串，分块时 `len(p.strip()) > 20` 直接过滤掉
- **保留页码信息**：用户在检索结果中看到"来自第 X 页"可以快速定位原文

### 2.3 局限

这个加载器**只提取文字层**，不处理图片中的文字。如果 PDF 是扫描件（图片型 PDF），每页的 `page_content` 会是空字符串——但不会报错，后续分块时会被过滤掉。

---

## 三、`load_markdown`：Markdown 文档加载

```python
def load_markdown(file_path: str) -> list[Document]:
    """
    加载 Markdown 文档，整个文件作为一个 Document 返回。

    不在这里做标题切分——那是 5.3 分块步骤的工作。
    这里只负责把文件内容读进内存。

    Args:
        file_path: Markdown 文件的本地路径（.md 或 .markdown）

    Returns:
        list[Document]，只有一个元素，page_content 为文件全文
        metadata 包含 source（文件路径）
    """
    loader = TextLoader(file_path, encoding="utf-8")
    docs = loader.load()
    char_count = len(docs[0].page_content)
    print(f"  [MD]  加载完成：{char_count} 字符 ← {Path(file_path).name}")
    return docs
```

### 3.1 和 PDF 加载的关键区别

| 维度 | `load_pdf` | `load_markdown` |
|------|-----------|----------------|
| 分页 | 每页一个 Document | 整个文件一个 Document |
| 切分时机 | 在分块步骤按字符切 | 在分块步骤按标题层级切 |
| 文本提取 | PyMuPDF 解析 PDF 结构 | 纯文本读取 |
| 编码 | 自动处理 | 显式 `utf-8` |

### 3.2 为什么 Markdown 不预分页？

Markdown 没有"页"的概念，但有**标题层级**（`# → ## → ###`）。在后续的 `split_markdown_documents` 中，会先用 `MarkdownHeaderTextSplitter` 按标题切分，保留文档的层级结构：

```
# Spring 框架
  ├── ## 第一章 IoC 容器    ← 一个 header_chunk
  │     ├── 1.1 核心概念   ← 进一步按字符切分
  │     └── 1.2 使用方式
  └── ## 第二章 AOP
        └── ...
```

所以这里只负责把文件读进内存，**切分是 Step 2 的职责**。

### 3.3 `encoding="utf-8"` 的必要性

显式指定 UTF-8 编码，避免中文字符在 Windows 等平台使用默认编码（如 `gbk`）导致乱码。如果不指定：

```python
# 在 Windows 上，不指定 encoding 可能：
TextLoader(file_path)                    # 默认用系统编码（gbk）
# → UnicodeDecodeError: 'gbk' codec can't decode byte 0x...
```

---

## 四、`load_document`：统一入口

```python
def load_document(file_path: str) -> list[Document]:
    """统一文档加载入口，根据扩展名选择 Loader"""
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"文件不存在：{file_path}")

    ext = path.suffix.lower()

    if ext == ".pdf":
        loader = PyPDFLoader(file_path)
        pages = loader.load()
        print(f"  [PDF] 加载完成：{len(pages)} 页 ← {path.name}")
        return pages

    elif ext in (".md", ".markdown"):
        loader = TextLoader(file_path, encoding="utf-8")
        docs = loader.load()
        print(f"  [MD]  加载完成：{len(docs[0].page_content)} 字符 ← {path.name}")
        return docs

    else:
        raise ValueError(
            f"不支持的文件类型：{ext}\n"
            f"当前支持：.pdf / .md / .markdown\n"
            f"提示：可用 markitdown 将 Word/PPT 转换为 .md 后再导入"
        )
```

### 4.1 三步逻辑

```
① 路径存在性校验          path.exists() → FileNotFoundError
② 扩展名路由              .pdf → PyPDFLoader | .md → TextLoader
③ 未知类型抛异常          raise ValueError + 解决方案提示
```

### 4.2 设计模式：简单工厂

`load_document` 本质上是一个**简单工厂**（Simple Factory）——根据文件扩展名决定实例化哪个 Loader：

```
输入：file_path
         │
         ├─ ".pdf"      →  return PyPDFLoader(...).load()
         ├─ ".md/.md"   →  return TextLoader(...).load()
         └─ 其他        →  raise ValueError
```

如果将来要加 Word 支持，只需要：
1. 加一个 `load_docx` 函数
2. 在 `load_document` 的 `if/elif` 链中加一个分支

已有代码不需要改动，符合**开闭原则**。

### 4.3 `★` 给解决方案而不是只给错误

```python
raise ValueError(
    f"不支持的文件类型：{ext}\n"
    f"当前支持：.pdf / .md / .markdown\n"
    f"提示：可用 markitdown 将 Word/PPT 转换为 .md 后再导入"
)
```

对比两种写法：

| 写法 | 用户体验 |
|------|---------|
| ❌ `"不支持的文件类型：.docx"` | 用户：那我怎么办？ |
| ✅ `"不支持的文件类型：.docx\n提示：可用 markitdown 转换"` | 用户：哦，先转格式 |

给解决方案而不是只给错误——这是好的 API 设计。

---

## 五、为什么拆成三个函数而不是一个？

```python
# ❌ 不推荐：一个函数干所有事
def load_document(file_path):
    ext = Path(file_path).suffix.lower()
    if ext == ".pdf":
        ...  # 加载 PDF 的 30 行代码
    elif ext in (".md", ".markdown"):
        ...  # 加载 Markdown 的 20 行代码
```

```python
# ✅ 实际做法：拆成三个函数，各司其职
def load_document(file_path): ...   # 只做路由
def load_pdf(file_path): ...        # 只做 PDF 加载
def load_markdown(file_path): ...   # 只做 Markdown 加载
```

好处：

| 原则 | 体现 |
|------|------|
| **单一职责** | 每个函数只做一件事 |
| **开闭原则** | 加新类型只需加新函数+分支 |
| **可测试性** | 可以单独测试 `load_pdf` 而不需要 mock 路由逻辑 |
| **可读性** | 函数名直接说明意图 |

---

## 六、数据流全景

```
磁盘文件                           内存
  │                                │
  │  PyPDFLoader                   │
  ├─ sample.pdf ──────────────→    │  [Document(page=0, content="..."),
  │                                │   Document(page=1, content="..."),
  │                                │   ...]
  │  TextLoader                    │
  └─ sample.md  ──────────────→    │  [Document(page_content="全文...")]
                                   │
                                   ↓
                            Step 2: 智能分块
                            split_documents(docs, file_path)
```

在完整的 `build_pipeline` 中：

```python
# Step 1：读取
docs = load_document(file_path)           # ← 67~128 行，我们刚读的

# Step 2：分块
chunks = split_documents(docs, file_path) # ← 131~195 行

# Step 3：嵌入
doc_chunks = embed_chunks(chunks, ...)    # ← 198~261 行

# Step 4：写入
write_to_milvus(doc_chunks)               # ← 347~365 行
```

---

## 七、`★` 设计亮点总结

### 7.1 三种加载策略

| 文件类型 | Loader | 分页策略 | 输出 |
|---------|--------|---------|------|
| PDF | `PyPDFLoader` | 按页拆分 | 多个 Document |
| Markdown | `TextLoader` | 整个文件 | 一个 Document |
| 其他 | 抛异常 + 提示 | — | 指导用户转换格式 |

### 7.2 分层路由

`load_document` 做路由决策，`load_pdf`/`load_markdown` 做具体加载。职责分离，方便扩展。

### 7.3 容错设计

PDF 图片页/扫描件不会报错，`page_content` 为空字符串，后续分块时自然过滤。单步失败不影响整个流水线。