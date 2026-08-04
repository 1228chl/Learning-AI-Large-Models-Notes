---
author: "XunZong"
created: "2026-08-04"
tags: ["AI-Agent", "RAG", "文档加载", "LangChain"]
aliases: ["文档加载", "Document Loader", "load_document", "LangChain Document"]
---

# 文档加载与 LangChain 集成

## 定义

文档加载是 RAG 建库流水线的第一步。在 LangChain 体系里，所有文档内容都用一个统一的数据结构 `Document` 表示：

$$ \text{Document} = \text{page\_content} + \text{metadata} $$

- **page_content**：文档的原始文本内容
- **metadata**：来源、路径、时间戳等附加信息，为后续检索提供上下文

加载 PDF 时，每页返回一个独立的 `Document` 对象；加载 Markdown 时，保留标题层级结构；加载纯文本时，整个文件为一个 `Document`。统一的数据结构使下游的切分、嵌入、检索环节无需关心原始文件格式。

### 加载器字典模式

使用字典将文件扩展名映射到对应的加载器类，实现**可扩展的工厂模式**：

```python
document_loaders = {
    ".txt": TextLoader,              # 文本文件，UTF-8编码
    ".pdf": PyPDFLoader,             # PDF 文件，文字版直接提取
    ".md": UnstructuredMarkdownLoader,  # Markdown，保留标题结构
}
```

新增文件类型只需添加一行字典映射，完全符合开闭原则。

## 统一加载入口

封装统一的 `load_document()` 函数，屏蔽格式差异：

```python
def load_document(file_path: str) -> Document:
    """统一文档加载入口：根据文件扩展名自动选择加载器"""
    ext = os.path.splitext(file_path)[1].lower()
    loader_class = document_loaders.get(ext)
    if not loader_class:
        raise ValueError(f"不支持的文件类型: {ext}")

    loader = loader_class(file_path, encoding="utf-8") \
        if ext == ".txt" else loader_class(file_path)

    docs = loader.load()
    for doc in docs:
        doc.metadata["source"] = os.path.basename(file_path)
        doc.metadata["file_path"] = file_path
    return docs
```

## 批量文档加载

```python
def load_documents_from_directory(directory_path: str):
    """从指定文件夹递归加载所有支持类型的文档"""
    documents = []
    for root, _, files in os.walk(directory_path):
        for file in files:
            file_path = os.path.join(root, file)
            try:
                documents.extend(load_document(file_path))
            except Exception as e:
                logger.error(f"加载失败: {file_path} - {str(e)}")
    return documents
```

## ML/DL 应用场景

| 应用场景 | 加载策略 | 说明 |
|:--------:|:---------|:------|
| **RAG 知识库构建** | 统一 load_document 入口 | 教材、课件、FAQ 等多格式文档统一加载为 Document 对象，是建库的第一步 |
| **企业文档管理** | 加载器字典 + 批量加载 | 企业内部 Word/PDF/Markdown 混合，统一加载器实现标准化接入 |
| **教育平台** | 格式识别 + 元数据增强 | 教师上传课件格式各异，自动识别并添加学科类别元数据 |

## 面试追问

**Q1（基础）**：LangChain 中 Document 对象的两个核心字段是什么？为什么需要统一的数据结构？
**回答要点**：
1. page_content（文本内容）和 metadata（元数据），分别承载文档内容和上下文信息
2. 统一的数据结构使下游切分、嵌入、检索环节无需关心原始文件格式
3. metadata 记录来源路径和加载时间，便于检索定位和问题追溯

**Q2（深挖）**：加载器字典模式（Loader Dictionary）相比 if-else 分支有什么优势？
**回答要点**：
1. 新增文件类型只需添加一行字典映射，无需修改加载逻辑，符合开闭原则
2. 字典本身可作为支持的格式清单，方便前端展示或配置文件校验
3. 加载器实例化逻辑统一，避免重复代码

**Q3（实战）**：加载 PDF 时，每页返回一个独立的 Document 对象，为什么这么设计？
**回答要点**：
1. 每页内容独立，便于后续按页检索和引用（如"见第 3 页"）
2. 避免整篇 PDF 作为一个 Document 超出 LLM 上下文窗口
3. 页级别的 metadata 可以记录页码信息，检索时精确定位

**Q4（边界）**：批量加载成千上万份文档时，如何保证稳定性和可追溯性？
**回答要点**：
1. 逐文件 try-except 捕获异常，单个文件失败不中断整体流程
2. 分级日志：info 记录成功，warning 记录不支持格式，error 记录实际异常
3. 为每个 Document 添加 source 和 timestamp 元数据，保证加载结果可追溯

## 参考引用

- 需要理解文档切分策略的相关知识，参见 [文档切分策略](02-文档切分策略.md)
- 需要理解RAG三阶段流程的相关知识，参见 [RAG三阶段流程](01-RAG三阶段流程.md)
- 需要理解LangChain六大组件的相关知识，参见 [LangChain六大组件](../LangChain/01-LangChain六大组件.md)
- 需要理解OCR解析处理扫描件的相关知识，参见 [OCR解析与多模态文档处理](04-OCR解析与多模态文档处理.md)