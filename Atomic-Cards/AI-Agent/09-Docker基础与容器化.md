---
author: "XunZong"
created: "2026-07-06"
tags: ["AI-Agent", "Docker", "部署"]
aliases: ["Docker", "容器化", "容器部署"]
---

# Docker 基础与容器化

## 定义

Docker 是一种**容器化**技术，将应用及其所有依赖打包到一个独立的容器中，确保"**在任何地方运行一致**"——开发者电脑、测试服务器、生产环境。

```bash
# 验证安装
docker --version             # 检查 Docker 版本
docker compose version       # 检查 Docker Compose
```

## 核心概念

| 概念 | 说明 | 类比 |
|:----|:----|:----|
| **镜像（Image）** | 应用的只读模板，包含代码、依赖、配置 | 类（Class） |
| **容器（Container）** | 镜像的运行实例 | 对象（Instance） |
| **Dockerfile** | 定义如何构建镜像的脚本 | 图纸 |
| **Docker Compose** | 编排多个容器（多服务） | 乐队指挥 |
| **Volume** | 持久化数据存储 | U 盘 |
| **Port Mapping** | 容器端口映射到宿主机 | 门牌号 |

## Dockerfile

```dockerfile
# 以 PyTorch 官方镜像为基础
FROM pytorch/pytorch:2.0.1-cuda11.7-cudnn8-runtime

# 设置工作目录
WORKDIR /app

# 复制依赖文件并安装
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制代码
COPY . .

# 暴露端口
EXPOSE 8000

# 运行命令
CMD ["python", "train.py"]
```

## Docker Compose

```yaml
# docker-compose.yml — 编排多个服务
version: '3.8'
services:
  app:
    build: .
    ports:
      - "8000:8000"
    volumes:
      - ./data:/app/data
    environment:
      - CUDA_VISIBLE_DEVICES=0

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  milvus:
    image: milvusdb/milvus:v2.3.0
    environment:
      - ETCD_ENDPOINTS=etcd:2379
```

```bash
# 启动所有服务
docker compose up -d

# 查看日志
docker compose logs -f app

# 停止
docker compose down
```

## ML 中的 Docker

| 应用场景 | Docker 使用 | 说明 |
|:--------:|:-----------|:----|
| **训练环境** | `pytorch/pytorch:2.0.1-cuda11.7` | 固定 CUDA + PyTorch 版本 |
| **模型推理 API** | FastAPI + Docker | 一行命令部署推理服务 |
| **MLflow** | `docker compose up mlflow` | 实验追踪平台 |
| **RAG 系统** | 编排多个服务 | Milvus + Redis + API + LLM |
| **Jupyter Lab** | `jupyter/datascience-notebook` | 可复现的分析环境 |

```bash
# 典型 RAG 系统 Docker 架构
# docker compose up 启动所有服务
services:
  - app:       FastAPI 应用 (自定义 Dockerfile)
  - milvus:   向量数据库
  - redis:    缓存 + 消息队列
  - etcd:     Milvus 元数据管理
```

> 参见 [[05-进程管理]]、[[08-Dify平台]]
