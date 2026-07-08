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

# 向Dify的对话型应用发送聊天请求，获取AI回复
response = requests.post(
    "http://localhost:3000/api/chat-messages",
    json={
        "query": "什么是注意力机制？",  # 用户提问的内容
        "user": "user_123",  # 用户标识，用于区分不同对话
        "response_mode": "streaming"  # 流式响应模式，实现逐词输出的效果
    },
    headers={"Authorization": "Bearer app-xxxx"}  # API密钥认证，app-xxxx需替换为实际密钥
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

## 面试追问

**Q1（基础）**：Dify 相比 Coze 最核心的差异化优势是什么？分别适合什么样的用户群体？

**回答要点**：Dify 开源 MIT 协议可自部署，Coze 纯 SaaS 不可私有化；Dify 支持通过 Ollama/Xinference 接入本地模型，Coze 仅可用平台提供的云模型；Dify 数据完全由用户控制，适合对数据隐私敏感的企业；Dify 适合有技术能力的开发者，Coze 适合非技术业务人员。

**Q2（深挖）**：Dify 如何通过统一的 Provider 接口支持多种模型（远程和本地）？集成本地 Ollama 模型的具体方式是什么？

**回答要点**：Dify 定义模型 Provider 抽象层，每种模型实现标准的 invoke/embed 接口；Ollama 通过 HTTP REST API 暴露模型，Dify 在管理后台中配置 Ollama 的 base_url 和模型名称即可接入；模型切换时只需修改配置，无需改动应用代码。

**Q3（实战）**：如何用 Dify 为企业搭建一个流式输出的内部文档知识库问答系统？需要考虑哪些部署因素？

**回答要点**：Docker Compose 一键自部署 Dify；创建知识库上传企业内部文档（PDF/Word/MD），Dify 自动切分和向量化；创建对话应用关联知识库并设计系统 Prompt；发布后通过 Streaming API（response_mode=streaming）集成到内部系统；需关注硬件资源（8GB+ 内存）、向量库索引优化、并发容量规划。

**Q4（边界）**：自部署 Dify 在生产运行中会遇到哪些运维挑战？如何应对？

**回答要点**：向量数据库随着文档增长检索变慢——需配置索引参数或进行分库分表；Dify 版本升级可能导致数据库迁移问题——需建立版本回退预案和测试环境先行验证；高并发下单节点性能瓶颈——需配置反向代理负载均衡和多节点部署；系统监控缺失——需额外接入日志聚合和性能指标系统。

## 参考引用
- 需要理解Coze平台的相关知识，参见 [Coze平台](./07-Coze平台.md)
- 需要理解Agent定义与核心公式的相关知识，参见 [Agent定义与核心公式](./01-Agent定义与核心公式.md)
- 需要理解LangChain六大组件的相关知识，参见 [LangChain六大组件](./04-LangChain六大组件.md)