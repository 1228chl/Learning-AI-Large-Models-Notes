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

> **面试追问**
>
> Q1（基础）：Docker 中镜像（Image）和容器（Container）有什么区别？类比说明。
> 回答要点：镜像是只读模板（类比类），容器是镜像的运行实例（类比对象）；一个镜像可启动多个容器；镜像分层构建，容器层可写。
>
> Q2（深挖）：Docker 容器和传统虚拟机（VM）在架构上有何本质区别？各自的优缺点是什么？
> 回答要点：容器共享宿主机内核（轻量、秒级启动），VM 包含完整 Guest OS（隔离性强、资源占用大）；容器隔离依赖 cgroups/namespace，安全性弱于 VM；容器适合微服务和 CI/CD，VM 适合强隔离需求。
>
> Q3（实战）：在 ML 项目中使用 Docker 进行模型部署时，如何处理 GPU 支持和多服务编排？
> 回答要点：使用 `nvidia/cuda` 基础镜像并安装 `nvidia-container-toolkit`；通过 `docker compose` 编排 API 服务、向量数据库、缓存等多容器；注意 CUDA 版本与 PyTorch/TensorFlow 版本的匹配。
>
> Q4（边界）：Docker 在 ML 场景中有哪些局限性？何时应选择其他方案？
> 回答要点：Windows 下 GPU 支持不完善（需 WSL2）；分布式训练的多节点通信配置复杂；大模型镜像体积过大（可用多阶段构建优化）；高性能计算场景考虑 Singularity/Apptainer。
