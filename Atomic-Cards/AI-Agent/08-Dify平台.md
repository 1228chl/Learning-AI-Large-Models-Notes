---
author: "XunZong"
created: "2026-07-06"
tags: ["AI-Agent", "Dify", "低代码"]
aliases: ["Dify", "Dify平台", "开源Agent平台"]
---

# Dify 平台

## 定义

Dify 是一个**开源**的 LLM 应用开发平台，提供可视化编排、RAG 管道、Agent 能力和模型管理等功能。与 Coze 不同，Dify 可以**自部署**，适合对数据隐私有要求的场景。

## 安装部署

```bash
# Docker Compose 一键部署
git clone https://github.com/langgenius/dify.git
cd dify/docker
cp .env.example .env
docker compose up -d

# 访问 http://localhost:3000 开始使用
```

**系统要求**：内存 8GB+，硬盘 50GB+，建议 4 核 CPU。

## Dify 的核心模块

| 模块 | 功能 | 说明 |
|:----|:----|:----|
| **AI 应用** | 构建对话或文本生成应用 | 选择模型、设定 Prompt |
| **知识库** | 上传文档建立 RAG 知识库 | 支持多种文件格式（PDF/Word/MD） |
| **工具** | 集成外部 API 和自定义工具 | 搜索、计算、数据库查询 |
| **工作流** | 可视化编排复杂流程 | 拖拽式节点编排 |
| **监控** | 日志、成本、性能追踪 | 查看每条调用记录 |

## 构建 RAG 应用

```yaml
1. 创建知识库: 上传文档 → 自动切分 → 向量化
2. 创建应用: 选择"对话型"或"文本生成型"
3. 关联知识库: 选择上一步创建的知识库
4. 设定 Prompt: 设计系统提示词
5. 发布应用: 生成 API 或嵌入到网页
```

```python
# Dify 提供的 API（发布后自动生成）
import requests

response = requests.post(
    "http://localhost:3000/api/chat-messages",
    json={
        "query": "什么是注意力机制？",
        "user": "user_123",
        "response_mode": "streaming"
    },
    headers={"Authorization": "Bearer app-xxxx"}
)
```

## Dify vs Coze

| 对比维度 | Dify | Coze |
|:--------:|:----|:----|
| **开源** | ✅ 完全开源 MIT | ❌ 仅 SaaS |
| **自部署** | ✅ Docker 一键部署 | ❌ |
| **本地模型** | ✅ 支持（Ollama/Xinference） | ❌ |
| **数据隐私** | ✅ 完全可控 | ⚠️ 依赖云端 |
| **技术门槛** | 需基本技术知识 | 零门槛 |
| **成本** | 自付服务器 | 按量付费 |

## ML 中的 Dify

| 应用场景 | 使用方式 |
|:--------:|:--------|
| **企业内部知识库** | 自部署 Dify，上传内部文档作为 RAG 知识库 |
| **私有数据问答** | 连接公司数据库，通过 Agent 执行 SQL 查询 |
| **模型评估** | 搭建多个 LLM 的对比测试环境 |
| **工作流自动化** | 编排多步骤处理流程（提取→分类→生成） |

> 参见 [[07-Coze平台]]、[[01-Agent定义与核心公式]]、[[04-LangChain六大组件]]
