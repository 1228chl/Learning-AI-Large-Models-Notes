---
author: "XunZong"
created: "2026-07-09"
tags: ["工程实践", "Docker", "部署"]
aliases: ["Docker Compose", "容器编排", "多服务部署"]
---

# Docker Compose 多服务编排

## 定义

Docker Compose 是一个用于**定义和运行多容器 Docker 应用**的工具。通过一个 YAML 文件（`docker-compose.yml`）集中配置所有服务的镜像、端口映射、环境变量、依赖关系、存储卷和网络通信，实现**一条命令启动整个系统**。

## 编排设计原理

### depends_on + healthcheck 的设计哲学

`depends_on` 仅保证容器的启动顺序，不保证容器内部服务已就绪。例如 MySQL 容器已启动但 InnoDB 仍在初始化，此时 App 连接必定失败。`healthcheck` 弥补了这一缺口：通过定期执行探测命令确认服务真正可用后才标记为 healthy。

**正确用法**：`depends_on` 配合 `condition: service_healthy`，确保基础服务完全就绪后才启动依赖服务。

### Docker 网络模型

Compose 自动为项目创建 bridge 网络，容器间通过服务名（DNS 解析）互相访问。同一网络内的容器所有端口互通，无需通过 `ports` 暴露。不同网络间的容器默认隔离——这是多租户部署的安全基础。

### Compose vs Kubernetes 的架构分界线

| 维度 | Docker Compose | Kubernetes |
|:----|:--------------|:-----------|
| **节点数** | 单机 | 多节点集群 |
| **自动伸缩** | 无 | HPA 按 CPU/内存/自定义指标扩缩容 |
| **自愈** | 仅容器崩溃重启 | 节点宕机后 Pod 自动迁移 |
| **滚动更新** | 简单替换 | 灰度发布、蓝绿部署、金丝雀发布 |
| **服务发现** | DNS 服务名 | Service + Ingress + 负载均衡 |
| **学习成本** | 低（1 天） | 高（数周） |

**迁移时机**：单机部署够用时先保持 Compose；当需要多节点集群、自动扩缩容、灰度发布时再迁移到 K8s。

```bash
# 验证安装
docker compose version
```

## 核心概念

| 概念 | 说明 | 类比 |
|:----|:----|:----|
| **docker-compose.yml** | 服务编排定义文件，声明所有服务和资源配置 | 乐谱 |
| **services** | 定义所有服务容器（每个 service 对应一个容器） | 乐队成员 |
| **volumes** | 数据持久化，容器重启后数据不丢失 | 硬盘 |
| **networks** | 容器间网络通信与隔离 | 网线 |
| **depends_on** | 声明服务启动依赖顺序 | 先后顺序 |
| **healthcheck** | 健康检查，判断服务是否就绪 | 体检报告 |

## Dockerfile 定义应用镜像

```dockerfile
# 以 Python 3.10 为基础镜像
FROM python:3.10-slim

# 设置工作目录
WORKDIR /app

# 复制依赖文件并安装
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制项目代码
COPY . .

# 暴露端口
EXPOSE 8000

# 设置启动脚本
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

## docker-compose.yml 完整示例

以下是一个 RAG 生产环境的典型编排文件：

```yaml
version: "3.8"

services:
  # ===== 主应用服务 =====
  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    env_file:
      - .env
    environment:
      - MYSQL_HOST=mysql
      - REDIS_HOST=redis
      - MILVUS_HOST=milvus
      - API_KEY=${API_KEY}
    volumes:
      - ./logs:/app/logs
    depends_on:
      mysql:
        condition: service_healthy
      redis:
        condition: service_healthy
      milvus:
        condition: service_healthy
    networks:
      - rag-network
    restart: unless-stopped

  # ===== MySQL 数据库 =====
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
      MYSQL_DATABASE: rag_db
    volumes:
      - mysql-data:/var/lib/mysql
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - rag-network
    restart: unless-stopped

  # ===== Redis 缓存 =====
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5
    networks:
      - rag-network
    restart: unless-stopped

  # ===== Milvus 向量数据库 =====
  milvus:
    image: milvusdb/milvus:v2.3.0
    ports:
      - "19530:19530"
    environment:
      ETCD_ENDPOINTS: etcd:2379
      MINIO_ADDRESS: minio:9000
    volumes:
      - milvus-data:/var/lib/milvus
    depends_on:
      etcd:
        condition: service_healthy
      minio:
        condition: service_healthy
    networks:
      - rag-network
    restart: unless-stopped

  # ===== Milvus 依赖: etcd =====
  etcd:
    image: quay.io/coreos/etcd:v3.5.5
    environment:
      ETCD_AUTO_COMPACTION_MODE: revision
      ETCD_AUTO_COMPACTION_RETENTION: "1000"
      ETCD_QUOTA_BACKEND_BYTES: "4294967296"
      ETCD_DATA_DIR: /etcd
    volumes:
      - etcd-data:/etcd
    healthcheck:
      test: ["CMD", "etcdctl", "endpoint", "health"]
      interval: 30s
      timeout: 10s
      retries: 3
    networks:
      - rag-network

  # ===== Milvus 依赖: MinIO =====
  minio:
    image: minio/minio:RELEASE.2023-03-20T20-16-18Z
    environment:
      MINIO_ACCESS_KEY: minioadmin
      MINIO_SECRET_KEY: minioadmin
    command: server /minio-data --console-address ":9001"
    volumes:
      - minio-data:/minio-data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 30s
      timeout: 10s
      retries: 3
    networks:
      - rag-network

# ===== 持久化卷 =====
volumes:
  mysql-data:
  redis-data:
  milvus-data:
  etcd-data:
  minio-data:

# ===== 外部网络 =====
networks:
  rag-network:
    driver: bridge
```

## 常用命令

```bash
# 启动所有服务（后台运行）
docker compose up -d

# 查看所有服务状态
docker compose ps

# 查看指定服务日志
docker compose logs -f app

# 重新构建镜像后启动
docker compose up -d --build

# 停止并移除所有容器
docker compose down

# 停止并移除容器、网络、卷
docker compose down -v

# 仅重启某个服务
docker compose restart app
```

## ML/DL 应用场景

| 应用场景 | 涉及服务 | 说明 |
|:--------:|:---------|:----|
| **RAG 问答系统** | App + Milvus + Redis + MySQL | 向量检索 + 缓存 + 对话持久化 |
| **模型推理平台** | App + Redis + Prometheus + Grafana | 推理 API + 缓存 + 监控面板 |
| **LLM 微调流水线** | App + MySQL + Redis + MinIO | 数据集管理 + 实验追踪 + 模型存储 |
| **批量推理任务** | App + Redis + Celery Worker | 异步任务队列 + 分布式 Worker |
| **A/B 测试平台** | App-v1 + App-v2 + Redis + MySQL | 多版本服务并行 + 流量分发 |

## 面试追问

**Q1（基础）**：Docker Compose 中 `depends_on` 和 `healthcheck` 有什么区别？为什么仅靠 `depends_on` 不够？

**回答要点**：

1. `depends_on` 仅控制容器启动的先后顺序，不保证服务内部已就绪
2. 例如 MySQL 容器已启动，但 MySQL 服务仍在初始化，此时 App 连接会失败
3. `healthcheck` 通过定期执行探测命令（如 `mysqladmin ping`）确认服务真正可用
4. 最佳实践：`depends_on` 配合 `condition: service_healthy` 使用

**Q2（深挖）**：Docker Compose 中如何管理敏感信息（如 API_KEY、数据库密码）？有哪些方案？

**回答要点**：

1. `.env` 文件：在 Compose 同目录下存放环境变量，不纳入版本控制（写入 `.gitignore`）
2. `env_file` 指令：在 service 中引用 `.env` 文件，Compose 自动加载
3. Docker Secrets（Swarm 模式）：将敏感信息以加密文件形式挂载到容器内
4. 外部密钥管理服务：如 HashiCorp Vault、AWS Secrets Manager
5. 避免硬编码：禁止在 docker-compose.yml 或 Dockerfile 中直接写入明文密码

**Q3（实战）**：在 RAG 系统部署中，如何设计服务启动顺序和健康检查策略？

**回答要点**：

1. 启动顺序：etcd / MinIO -> Milvus -> Redis / MySQL -> App
2. 健康检查：每个基础服务配置 `healthcheck`，App 通过 `depends_on` + `condition: service_healthy` 等待依赖就绪
3. 容错策略：`restart: unless-stopped` 确保服务崩溃后自动重启
4. 网络隔离：所有服务放入同一自定义网络，通过服务名（DNS）相互访问，无需暴露非必要端口

**Q4（边界）**：Docker Compose 在生产环境中存在哪些局限性？何时应该考虑 Kubernetes？

**回答要点**：

1. 单机部署：Compose 默认在单台宿主机上运行，无法跨节点扩展
2. 无自动伸缩：不能根据负载自动增减容器副本数
3. 无自愈能力：节点宕机后容器不会自动迁移到其他节点
4. 滚动更新有限：Compose 的更新策略简单，无法实现灰度发布、蓝绿部署
5. 迁移到 K8s 的时机：当需要多节点集群、自动扩缩容、服务发现、配置中心时

## 参考引用

- 需要理解 Docker 基础概念，参见 [Docker基础与容器化](01-Docker基础与容器化.md)
- 需要理解向量数据库部署，参见 [Milvus核心概念](../../数据库/Milvus/08-Milvus核心概念.md)
- 需要理解缓存服务原理，参见 [Redis核心数据结构](../../数据库/Redis/05-Redis核心数据结构.md)
- 需要理解应用服务框架，参见 [Flask与FastAPI模型部署](../部署/04-Flask与FastAPI模型部署.md)