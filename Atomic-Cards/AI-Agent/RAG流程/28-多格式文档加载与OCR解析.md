---
author: "XunZong"
created: "2026-07-09"
tags: ["AI-Agent", "RAG", "文档处理"]
aliases: ["文档加载器", "OCR解析", "Document Loader", "多格式解析"]
---

# 多格式文档加载与OCR解析

## 定义

多格式文档加载与OCR解析是 RAG 系统的**数据入口层**，负责将不同格式（txt、pdf、docx、ppt、图片等）的原始文档统一加载为可处理的文本内容，并自动添加元数据（来源、路径、时间戳），为后续的文档切分和向量化提供标准化输入。

OCR 场景推荐使用多模态模型（如 **PaddleOCR-VL**），可同时提取图片中的文字、表格、公式和图表，比传统 OCR 仅提取文字的效果更全面。部署方式：通过 vLLM 加载 PaddleOCR-VL 模型提供 OpenAI 兼容 API，支持 OCR / 表格识别 / 公式识别 / 图表识别等任务类型。

```
原始文件（多种格式）
    │
    ├─→ 格式识别（文件扩展名）
    │
    ├─→ 加载器分发（Loader Dictionary 模式）
    │       │
    │       ├─→ 文本文件 → TextLoader（UTF-8编码）
    │       ├─→ PDF 文件 → OCRPDFLoader（扫描件OCR）
    │       ├─→ Word 文件 → OCRDOCLoader（含页眉页脚清洗）
    │       ├─→ PPT 文件 → OCRPPTLoader（幻灯片提取）
    │       ├─→ 图片文件 → OCRIMGLoader（图像文字识别）
    │       └─→ Markdown → UnstructuredMarkdownLoader（保留结构）
    │
    ├─→ 元数据增强（学科、路径、时间戳）
    │
    └─→ 输出 LangChain Document 对象列表
```

## 加载器字典模式

使用字典将文件扩展名映射到对应的加载器类，实现**可扩展的工厂模式**：

```python
# 定义支持的文件类型及其对应的加载器字典
# 键为文件扩展名（小写），值为加载器类，新增文件类型只需添加一条映射
document_loaders = {
    ".txt": TextLoader,              # 文本文件，使用 UTF-8 编码读取
    ".pdf": OCRPDFLoader,            # PDF 文件，支持扫描件 OCR 识别
    ".docx": OCRDOCLoader,           # Word 文档，自动清除页眉页脚
    ".ppt": OCRPPTLoader,            # PPT 幻灯片，提取每页文字
    ".pptx": OCRPPTLoader,           # PPTX 格式，兼容新旧版 PowerPoint
    ".jpg": OCRIMGLoader,            # JPEG 图片，光学字符识别
    ".png": OCRIMGLoader,            # PNG 图片，光学字符识别
    ".md": UnstructuredMarkdownLoader,  # Markdown 文件，保留标题层级结构
}
```

**代码功能**：定义一个统一的加载器字典，将所有支持的文档格式映射到对应的加载器类，使新增文件类型只需添加一行字典条目，无需修改循环逻辑。

## 文档加载流程

```python
import os
from datetime import datetime

def load_documents_from_directory(directory_path):
    # 从指定文件夹加载多种类型文件并添加元数据
    # 通过 os.walk 递归遍历目录，自动处理子目录

    documents = []                     # 存储所有加载的文档
    source = os.path.basename(directory_path).replace("_data", "")
    # 从目录名提取学科类别，如 "ai_data" → "ai"

    for root, _, files in os.walk(directory_path):
        # 递归遍历目录树，root 为当前目录路径，files 为文件名列表
        for file in files:
            # 获取文件扩展名并转换为小写（.PDF → .pdf）
            file_extension = os.path.splitext(file)[1].lower()
            if file_extension in document_loaders:
                try:
                    loader_class = document_loaders[file_extension]
                    # 实例化加载器，TXT 文件指定 UTF-8 编码防止乱码
                    loader = loader_class(file_path, encoding="utf-8") \
                        if file_extension == ".txt" else loader_class(file_path)
                    loaded_docs = loader.load()

                    for doc in loaded_docs:
                        # 为每个文档添加元数据，便于后续检索定位和权限管理
                        doc.metadata["source"] = source          # 学科类别
                        doc.metadata["file_path"] = file_path     # 原始文件路径
                        doc.metadata["timestamp"] = datetime.now().isoformat()  # 加载时间
                    documents.extend(loaded_docs)
                except Exception as e:
                    logger.error(f"加载文件 {file_path} 失败: {str(e)}")
            else:
                logger.warning(f"不支持的文件类型: {file_path}")
    return documents
```

## 文档预处理

| 处理类型 | 操作 | 目的 |
|:---------|:-----|:-----|
| **空格压缩** | 连续空格替换为单个空格 | 减少冗余 token，提高嵌入质量 |
| **换行压缩** | 连续 `\n` 替换为单个 `\n` | 统一段落格式，避免切分器误判语义边界 |
| **页眉页脚清洗** | 识别并移除 Word 文档的页眉页脚 | 防止干扰信息混入正文，影响检索相关性 |
| **OCR 增强** | 对扫描件/图片进行光学字符识别 | 图片中的文字无法直接提取，需 OCR 转为文本 |

## 加载器类型对比

| 加载器 | 适用格式 | 核心技术 | 适用场景 |
|:-------|:---------|:---------|:---------|
| **TextLoader** | .txt | 纯文本读取（UTF-8） | 简单文本文件 |
| **OCRPDFLoader** | .pdf | OCR 解析扫描件 + 文字版 PDF 直接提取 | 教材、论文、扫描文档 |
| **OCRDOCLoader** | .docx | 解析 Word XML + 页眉页脚过滤 | 讲义、报告、Word 文档 |
| **OCRPPTLoader** | .ppt/.pptx | 幻灯片页面提取 + OCR 图片 | 课件、演示文稿 |
| **OCRIMGLoader** | .jpg/.png | 端到端 OCR 识别 | 截图、扫描图片、公式图片 |
| **UnstructuredMarkdownLoader** | .md | 保留 Markdown 标题与结构 | 技术文档、README |

## 异常处理策略

- **跳过并继续**：单个文件加载失败不影响其他文件，确保批量处理的高可用性
- **分级日志**：成功加载用 `logger.info`，文件类型不支持用 `logger.warning`，加载失败用 `logger.error`，便于问题定位
- **元数据完整性**：即使加载成功，若元数据缺失也应记录警告，避免检索阶段出现来源不明的孤立文档

## ML/DL 应用场景

| 应用场景 | 说明 |
|:---------|:-----|
| **RAG 知识库构建** | 将教材、课件、FAQ 等多格式文档统一加载为索引数据，是 RAG 系统数据预处理的第一步 |
| **企业文档管理** | 企业内部文档格式多样（Word 报告、PPT 演示、PDF 合同），统一加载器实现标准化接入 |
| **教育平台** | 教师上传的课件格式各异，自动识别并加载，降低人工转换成本 |
| **多模态知识库** | 图片中的文字信息通过 OCR 提取后纳入知识库，扩展检索覆盖范围 |

## 面试追问

**Q1（基础）**：RAG 系统中为什么需要专门的文档加载器模块？直接用 Python 的文件读取不行吗？
**回答要点**：

1. 不同格式解析方式不同：txt 是纯文本，PDF 需要解析布局，Word 需要处理 XML，图片需要 OCR，无法用统一 API 读取
2. 文档加载器提供统一的 Document 输出格式（page_content + metadata），便于下游切分和向量化
3. 合理的异常处理机制确保批量加载时单个文件失败不影响整体流程

**Q2（深挖）**：加载器字典模式（Loader Dictionary）的设计优势是什么？
**回答要点**：

1. 新增文件类型只需添加一行字典映射，完全符合开闭原则（对扩展开放、对修改封闭）
2. 加载器实例化逻辑统一，避免针对每种格式写 if-else 分支，减少代码重复
3. 字典本身可作为支持的格式清单，方便前端展示或配置文件校验

**Q3（实战）**：在批量加载成千上万份文档时，如何保证系统的稳定性和可追溯性？
**回答要点**：

1. 逐文件 try-except 捕获异常，加载失败的文件记录日志后继续处理下一个，不中断整体流程
2. 分级日志体系：info 记录成功，warning 记录不支持格式，error 记录实际异常，便于事后排查
3. 为每个文档添加 file_path 和 timestamp 元数据，保证加载结果可追溯
4. 可额外增加文件大小校验和格式预检，避免超大文件或损坏文件导致内存溢出

**Q4（边界）**：OCR 在文档加载中有哪些局限性？如何处理这些局限性？
**回答要点**：

1. OCR 对手写体、艺术字体、低分辨率图片的识别率低，可能导致文字错乱或缺失
2. 双栏排版、表格、数学公式的 OCR 结果难以保持原始阅读顺序，影响后续切分质量
3. 处理方案：对重要文档优先使用原始电子版而非扫描件；对公式密集的文档使用专门的公式识别引擎（如 Mathpix）；对双栏文档进行版面分析后再 OCR

## 参考引用

- 需要理解文档切分策略的相关知识，参见 [文档切分策略](03-文档切分策略.md)
- 需要理解RAG三阶段流程的相关知识，参见 [RAG三阶段流程](02-RAG三阶段流程.md)
- 需要理解嵌入与向量化的相关知识，参见 [嵌入与向量化](../../数据库/检索/10-嵌入与向量化.md)
- 需要理解Milvus Python操作的相关知识，参见 [Milvus Python操作指南](../../数据库/Milvus/09-Milvus Python操作指南.md)
- 需要理解Python类与对象以理解加载器字典模式，参见 [类与对象](../../Python/OOP/01-类与对象.md)