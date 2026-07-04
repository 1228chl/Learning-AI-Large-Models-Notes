# RAG实现

**标签：** #RAG #LangChain

---

## 1. 文档加载

```python
from langchain_community.document_loaders import (
    TextLoader,
    CSVLoader,
    PyPDFLoader,
    DirectoryLoader
)

# 加载文本文件
loader = TextLoader("document.txt")
documents = loader.load()

# 加载PDF
loader = PyPDFLoader("document.pdf")
documents = loader.load()
```

---

## 2. 文本分块

```python
from langchain.text_splitter import RecursiveCharacterTextSplitter

text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000,
    chunk_overlap=200,
    separators=["\n\n", "\n", "。", "！", "？", "，", " "]
)

chunks = text_splitter.split_documents(documents)
```

---

## 3. 向量数据库

```python
from langchain_community.vectorstores import FAISS
from langchain_openai import OpenAIEmbeddings

embeddings = OpenAIEmbeddings()
vectorstore = FAISS.from_documents(chunks, embeddings)

# 保存到本地
vectorstore.save_local("faiss_index")
```

---

## 4. 完整RAG链

```python
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough

# 定义提示词
template = """基于以下上下文回答问题。

上下文：
{context}

问题：{question}

回答："""

prompt = ChatPromptTemplate.from_template(template)

# 定义函数
def format_docs(docs):
    return "\n\n".join(doc.page_content for doc in docs)

# 创建RAG链
rag_chain = (
    {"context": retriever | format_docs, "question": RunnablePassthrough()}
    | prompt
    | llm
    | parser
)

# 调用
answer = rag_chain.invoke("什么是机器学习？")
print(answer)
```
