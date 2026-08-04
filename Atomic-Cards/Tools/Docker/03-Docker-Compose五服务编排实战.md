---
author: "XunZong"
created: "2026-07-30"
tags: ["工程实践", "Docker", "Compose", "编排", "多服务", "Milvus", "PostgreSQL"]
aliases: ["Docker Compose", "五服务编排", "端口隔离", "Milvus部署"]
---

# Docker Compose 五服务编排实战

## 定义

Docker Compose 多服务编排是将多个相互依赖的容器化服务定义在同一份 `docker-compose.yml` 中，用一条命令统一管理它们的生命周期（启动、停止、重建）。在 EduAgent 项目中，5 个服务共同构成后端基础设施层：一个业务数据库（PostgreSQL）、一个向量数据库（Milvus）及其两个内部依赖（etcd + MinIO）、一个可视化管理界面（Attu）。

编排的核心设计原则包括：端口隔离（避免与本地已有服务冲突）、健康检查（确保依赖就绪后再启动下游服务）、命名卷持久化（容器删除后数据不丢失）、环境变量注入（敏感信息从 `.env.local` 读取，不硬编码）。

## 五服务架构

| 服务 | 镜像 | 容器内端口 | 对外端口 | 应用是否直接连 | 依赖 |
|------|------|-----------|---------|--------------|------|
| postgres | `postgres:15-alpine` | 5432 | **5433** | 是 | 无 |
| etcd | `quay.io/coreos/etcd:v3.5.14` | 2379 | 不对外 | 否（Milvus 内部用） | 无 |
| minio | `minio/minio:latest` | 9000 | 不对外 | 否（Milvus 内部用） | 无 |
| milvus | `milvusdb/milvus:v2.4.0` | 19530 | **19531** | 是 | etcd + minio |
| attu | `zilliz/attu:v2.4.12` | 3000 | 30000 | 否（管理界面） | milvus |

etcd 存储 Milvus 的元数据（Collection Schema、索引配置），MinIO 存储实际的向量数据文件，两者都是 Milvus 的运行时依赖——应用代码完全不直接访问它们。

## 直观理解

> Docker Compose 编排五个服务就像组建一支乐队：PostgreSQL 是贝斯手（底层数据支撑），Milvus 是键盘手（向量计算），etcd 和 MinIO 是键盘手的乐谱架和音响（内部依赖），Attu 是调音台（可视化管理）。你只需喊一声 `docker-compose up`，整个乐队同时就位。

## 关键设计决策

### 端口隔离

所有对外端口均偏移标准端口，避免与开发者本机已运行的服务冲突：

```yaml
# docker-compose.yml 端口映射片段
services:
  postgres:
    ports:
      - "5433:5432"    # 对外 5433（标准是 5432），避免冲突
  milvus:
    ports:
      - "19531:19530"  # 对外 19531（标准是 19530）
    depends_on:
      etcd:
        condition: service_healthy   # 等 etcd 健康检查通过
      minio:
        condition: service_healthy   # 等 minio 健康检查通过
```

### 健康检查

确保依赖就绪后才启动下游服务，避免"启动了但连不上"的竞态问题：

```yaml
# PostgreSQL 健康检查：用 pg_isready 确认数据库可接受连接
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-postgres}"]
  interval: 5s
  timeout: 5s
  retries: 5

# Milvus 健康检查：用 curl 探测 Milvus 健康端点
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:9091/healthz"]
  interval: 10s
  timeout: 10s
  retries: 10
```

## 启动与验证

```bash
# 一键启动所有服务（-d 后台运行，--env-file 注入环境变量）
docker-compose --env-file .env.local up -d

# 验证各服务状态
docker-compose ps
# 预期：5 个服务全部 Up 且 healthy

# 验证 PostgreSQL 连通性
psql -h localhost -p 5433 -U postgres -d edu_agent -c "SELECT 1"

# 验证 Milvus 连通性（Python）
from pymilvus import connections
connections.connect(host="localhost", port="19531")
print(connections.list_connections())  # 成功则输出连接信息
```

## 环境变量安全红线

`.env.local` 文件包含三个必填敏感项，必须遵循两条铁律：

1. **绝不硬编码密钥在代码中**——所有配置从 `.env.local` 读
2. ** `.env.local` 必须加入 `.gitignore`**——代码可公开，密钥只在本地

```bash
# .env.local 三个必填项
DB_PASSWORD=your_secure_password       # 数据库密码
DEEPSEEK_API_KEY=sk-xxxxxxxx           # DeepSeek API Key
JWT_SECRET_KEY=$(openssl rand -hex 32) # JWT 签名密钥
```

## AI/ML 工程应用场景

| 应用场景 | 编排技术要点 | 说明 |
|---------|------------|------|
| RAG 知识库基础设施 | PostgreSQL + Milvus 双数据库架构 | 关系型数据存业务记录，向量数据存文档嵌入，通过 docker-compose 统一管理 |
| 本地模型开发环境 | depends_on + healthcheck 串行启动 | 确保 Milvus 在 BGE-M3 写入向量前已就绪，避免初始化脚本竞态失败 |
| 多校区多租户部署 | 命名卷 + 环境变量注入 | 每个校区一套独立的 `docker-compose` 实例，通过 `.env.local` 注入不同配置 |
| CI/CD 集成测试 | 单条命令启动全部依赖 | `docker-compose up -d` 后直接运行 pytest，测试结束 `docker-compose down -v` 清理 |

## 面试追问

**Q1（基础）**：EduAgent 的 docker-compose.yml 编排了哪 5 个服务？各自的作用是什么？

**回答要点**：

1. PostgreSQL（端口 5433）：关系型数据库，存储用户、试卷、批改记录、会话等业务数据
2. etcd + MinIO：Milvus 的运行时依赖——etcd 存元数据（Collection 定义），MinIO 存向量数据文件
3. Milvus（端口 19531）：向量数据库，存储知识库文档的嵌入向量，支撑 RAG 检索
4. Attu（端口 30000）：Milvus 的 Web 管理界面，可视化查看 Collection、执行查询

**Q2（深挖）**：为什么 PostgreSQL 对外暴露 5433 而不是 5432？端口隔离策略解决了什么实际问题？

**回答要点**：

1. 5432 是 PostgreSQL 的默认端口，开发者本机很可能已有其他项目的 PostgreSQL 实例占用该端口
2. 端口隔离让 EduAgent 的 PostgreSQL 与开发者本机的其他 PostgreSQL 实例共存，互不冲突
3. 同样的策略：Milvus 对外 19531 而非默认 19530
4. 所有端口值从 `.env.local` 读取，代码里绝不写死，方便不同环境灵活调整

**Q3（实战）**：healthcheck 在 docker-compose 中起什么作用？如果去掉 Milvus 对 etcd 的健康检查依赖会怎样？

**回答要点**：

1. healthcheck 确保依赖服务"真正可用"（而非仅仅"容器启动了"）后，下游服务才开始初始化
2. Milvus 启动后需要立即连接 etcd 读取元数据，如果 etcd 尚未就绪，Milvus 会启动失败或进入错误状态
3. 去掉健康检查依赖：docker-compose 只保证容器启动顺序（先启动 etcd 容器，再启动 Milvus 容器），但不保证 etcd 内部服务已就绪，存在竞态条件
4. depends_on 配合 condition: service_healthy 是解决这个竞态的标准模式

**Q4（边界）**：如果需要在生产环境替换 Milvus 为 Milvus 集群版（分布式），docker-compose.yml 需要哪些改动？

**回答要点**：

1. 拆分 Milvus 单机镜像为读写分离节点：proxy + rootcoord + datacoord + indexcoord + datanode + indexnode + querynode
2. etcd 和 MinIO 改为外部独立集群（生产环境不建议 docker-compose 管理存储层）
3. 健康检查路径需要根据拆分后的各组件端点分别配置
4. 连接地址从单机 `localhost:19531` 改为 Milvus proxy 的负载均衡地址

## 参考引用

- 需要理解 Docker 基础概念（镜像、容器、卷、网络）：[Docker 基础与容器化](01-Docker基础与容器化.md)
- 需要理解 Compose 的基本语法（services、volumes、networks、depends_on）：[Docker Compose 编排](./02-Docker Compose编排.md)
- 需要理解 PostgreSQL 的 JSONB、UUID 和触发器特性：[PostgreSQL 高级特性](../../数据库/SQL/05-PostgreSQL高级特性.md)
- 需要理解 Milvus 的 Collection Schema 设计和向量索引：[Milvus 集合 Schema 设计与索引选择](../../AI-Agent/RAG流程/12-Milvus集合Schema设计与索引选择.md)
- 需要理解 LLM Factory 如何使用 BaseSettings 从 .env.local 读配置：[LLM Factory 设计模式](../../AI-Agent/工程实践/01-LLM Factory设计模式.md)
