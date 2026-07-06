# Docker部署与项目实践 - 详细学习笔记

## 一、Docker基础

### 1.1 什么是Docker？

Docker是一个开源的应用容器引擎，让开发者可以打包应用及其依赖包到一个可移植的容器中，然后发布到任何流行的Linux或Windows操作系统的机器上。

**核心概念**：
| 概念 | 说明 | 类比 |
|------|------|------|
| **镜像（Image）** | 只读模板，包含运行应用所需的所有内容 | 安装光盘 |
| **容器（Container）** | 镜像的运行实例 | 运行中的程序 |
| **仓库（Registry）** | 存储和分发镜像的服务 | 应用商店 |
| **Dockerfile** | 构建镜像的脚本文件 | 安装脚本 |

### 1.2 Docker优势

| 优势 | 说明 |
|------|------|
| **环境一致性** | 开发、测试、生产环境完全一致 |
| **快速部署** | 秒级启动，无需复杂配置 |
| **资源隔离** | 每个容器独立运行，互不影响 |
| **易于扩展** | 支持水平扩展和负载均衡 |
| **版本控制** | 镜像版本管理，支持回滚 |

### 1.3 Docker安装

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install docker.io
sudo systemctl start docker
sudo systemctl enable docker

# CentOS/RHEL
sudo yum install docker
sudo systemctl start docker
sudo systemctl enable docker

# 验证安装
docker --version
docker run hello-world
```

---

## 二、EduRAG项目Docker配置

### 2.1 Dockerfile详解

```dockerfile
# 基础镜像：Python 3.10精简版
FROM python:3.10-slim

# 设置工作目录
WORKDIR /app

# 设置环境变量
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# 安装系统依赖
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# 复制依赖文件
COPY requirements.txt .

# 安装Python依赖
RUN pip install --no-cache-dir -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

# 复制项目代码
COPY . .

# 暴露端口
EXPOSE 8003

# 启动命令
CMD ["python", "app.py"]
```

**关键指令说明**：
| 指令 | 作用 |
|------|------|
| `FROM` | 指定基础镜像 |
| `WORKDIR` | 设置工作目录 |
| `COPY` | 复制文件到镜像 |
| `RUN` | 执行命令 |
| `EXPOSE` | 暴露端口 |
| `CMD` | 容器启动时执行的命令 |

### 2.2 docker-compose.yml详解

```yaml
version: '3.8'

services:
  # 应用服务
  app:
    build: .
    ports:
      - "8003:8003"
    depends_on:
      - mysql
      - milvus
      - redis
    environment:
      - MYSQL_HOST=mysql
      - MYSQL_PORT=3306
      - MYSQL_USER=root
      - MYSQL_PASSWORD=password
      - MYSQL_DATABASE=edu_rag
      - MILVUS_HOST=milvus
      - MILVUS_PORT=19530
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - API_KEY=your_api_key
      - BASE_URL=https://api.example.com
    volumes:
      - ./logs:/app/logs
      - ./data:/app/data
    restart: unless-stopped
    networks:
      - edu-rag-network

  # MySQL数据库
  mysql:
    image: mysql:8.0
    ports:
      - "3306:3306"
    environment:
      - MYSQL_ROOT_PASSWORD=password
      - MYSQL_DATABASE=edu_rag
      - MYSQL_CHARSET=utf8mb4
    volumes:
      - mysql_data:/var/lib/mysql
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    restart: unless-stopped
    networks:
      - edu-rag-network

  # Milvus向量数据库
  milvus:
    image: milvusdb/milvus:v2.3.0
    ports:
      - "19530:19530"
    environment:
      - ETCD_USE_EMBED=true
      - COMMON_STORAGETYPE=local
    volumes:
      - milvus_data:/var/lib/milvus
      - milvus_etcd:/etcd
    restart: unless-stopped
    networks:
      - edu-rag-network

  # Redis缓存
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes
    restart: unless-stopped
    networks:
      - edu-rag-network

# 数据卷
volumes:
  mysql_data:
  milvus_data:
  milvus_etcd:
  redis_data:

# 网络
networks:
  edu-rag-network:
    driver: bridge
```

**关键配置说明**：
| 配置 | 作用 |
|------|------|
| `depends_on` | 定义服务依赖关系 |
| `environment` | 设置环境变量 |
| `volumes` | 数据持久化 |
| `restart` | 重启策略 |
| `networks` | 网络配置 |

---

## 三、部署步骤

### 3.1 环境准备

```bash
# 1. 安装Docker
# 参考1.3节

# 2. 安装Docker Compose
sudo apt-get install docker-compose

# 3. 验证安装
docker --version
docker-compose --version
```

### 3.2 项目部署

```bash
# 1. 克隆项目
git clone <repository_url>
cd Itcast_qa_system

# 2. 配置环境变量
cp .env.example .env
# 编辑.env文件，填入必要的配置

# 3. 构建并启动服务
docker-compose up -d --build

# 4. 查看服务状态
docker-compose ps

# 5. 查看日志
docker-compose logs -f app

# 6. 查看资源使用
docker stats
```

### 3.3 服务验证

```bash
# 1. 健康检查
curl http://localhost:8003/health
# 预期输出：{"status": "healthy"}

# 2. 创建会话
curl -X POST http://localhost:8003/api/create_session
# 预期输出：{"session_id": "550e8400-e29b-41d4-a716-446655440000"}

# 3. 测试非流式查询
curl -X POST http://localhost:8003/api/query \
  -H "Content-Type: application/json" \
  -d '{"query": "什么是Python？", "source_filter": "python"}'

# 4. 获取学科类别
curl http://localhost:8003/api/sources
# 预期输出：{"sources": ["java", "ai", "python", "frontend", "bigdata"]}
```

---

## 四、生产环境配置

### 4.1 环境变量配置

```bash
# .env文件
# 数据库配置
MYSQL_HOST=mysql
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=edu_rag

# Milvus配置
MILVUS_HOST=milvus
MILVUS_PORT=19530

# Redis配置
REDIS_HOST=redis
REDIS_PORT=6379

# LLM配置
API_KEY=your_api_key
BASE_URL=https://api.example.com

# 应用配置
APP_HOST=0.0.0.0
APP_PORT=8003
LOG_LEVEL=INFO
```

### 4.2 日志配置

```python
# logging_config.py
import logging
from logging.handlers import RotatingFileHandler
import os

def setup_logging():
    """配置日志"""
    log_dir = "logs"
    os.makedirs(log_dir, exist_ok=True)
    
    # 配置日志格式
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # 文件处理器（滚动日志）
    file_handler = RotatingFileHandler(
        f'{log_dir}/app.log',
        maxBytes=10*1024*1024,  # 10MB
        backupCount=5
    )
    file_handler.setFormatter(formatter)
    
    # 控制台处理器
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    
    # 配置根日志器
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    root_logger.addHandler(file_handler)
    root_logger.addHandler(console_handler)
    
    return root_logger

# 使用
logger = setup_logging()
logger.info("应用启动")
```

### 4.3 监控配置

```python
# monitoring.py
from fastapi import FastAPI, Request
import time
from datetime import datetime

app = FastAPI()

# 健康检查端点
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "version": "1.0.0"
    }

# 性能监控中间件
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = str(process_time)
    
    # 记录慢请求
    if process_time > 1.0:
        logger.warning(f"慢请求: {request.url.path} 耗时 {process_time:.2f}秒")
    
    return response
```

---

## 五、运维实践

### 5.1 备份策略

```bash
#!/bin/bash
# backup.sh

# MySQL备份
echo "备份MySQL..."
docker exec mysql mysqldump -u root -ppassword edu_rag > backup/mysql_$(date +%Y%m%d_%H%M%S).sql

# Redis备份
echo "备份Redis..."
docker exec redis redis-cli BGSAVE
cp /data/dump.rdb backup/redis_$(date +%Y%m%d_%H%M%S).rdb

# Milvus备份
echo "备份Milvus..."
docker exec milvus milvus-backup create --backup_name backup_$(date +%Y%m%d)

# 清理旧备份（保留7天）
find backup/ -name "*.sql" -mtime +7 -delete
find backup/ -name "*.rdb" -mtime +7 -delete

echo "备份完成！"
```

### 5.2 扩展策略

```yaml
# docker-compose scaling.yml
version: '3.8'

services:
  app:
    deploy:
      replicas: 3  # 3个实例
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
```

**扩展命令**：
```bash
# 扩展应用服务
docker-compose up -d --scale app=3

# 查看扩展状态
docker-compose ps
```

### 5.3 安全配置

```yaml
# docker-compose.secure.yml
version: '3.8'

services:
  app:
    build: .
    user: "1000:1000"  # 非root用户运行
    read_only: true     # 只读文件系统
    tmpfs:
      - /tmp
    security_opt:
      - no-new-privileges:true
    environment:
      - SECRET_KEY=${SECRET_KEY}
    secrets:
      - db_password

secrets:
  db_password:
    file: ./secrets/db_password.txt
```

---

## 六、常见问题解决

### 6.1 服务启动失败

```bash
# 查看详细日志
docker-compose logs app

# 检查端口占用
netstat -tulpn | grep 8003
# 或
lsof -i :8003

# 重启服务
docker-compose restart app

# 重新构建
docker-compose down
docker-compose up -d --build
```

### 6.2 数据库连接问题

```bash
# 检查MySQL状态
docker exec mysql mysqladmin -u root -ppassword status

# 测试连接
docker exec app python -c "
import pymysql
conn = pymysql.connect(
    host='mysql',
    user='root',
    password='password',
    database='edu_rag'
)
print('MySQL连接成功')
conn.close()
"

# 查看MySQL日志
docker-compose logs mysql
```

### 6.3 内存不足

```bash
# 查看资源使用
docker stats

# 调整内存限制
# 在docker-compose.yml中设置
deploy:
  resources:
    limits:
      memory: 1G
    reservations:
      memory: 512M

# 清理未使用的资源
docker system prune -a
```

### 6.4 网络问题

```bash
# 检查网络
docker network ls
docker network inspect itcast_qa_system_edu-rag-network

# 测试容器间通信
docker exec app ping mysql
docker exec app ping milvus
docker exec app ping redis
```

---

## 七、完整部署脚本

```bash
#!/bin/bash
# deploy.sh

set -e

echo "=== EduRAG项目部署脚本 ==="

# 1. 检查Docker
echo "1. 检查Docker..."
if ! command -v docker &> /dev/null; then
    echo "Docker未安装，请先安装Docker"
    exit 1
fi

# 2. 检查Docker Compose
echo "2. 检查Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
    echo "Docker Compose未安装，请先安装"
    exit 1
fi

# 3. 配置环境变量
echo "3. 配置环境变量..."
if [ ! -f .env ]; then
    cp .env.example .env
    echo "请编辑.env文件，填入必要的配置"
    exit 1
fi

# 4. 构建镜像
echo "4. 构建镜像..."
docker-compose build

# 5. 启动服务
echo "5. 启动服务..."
docker-compose up -d

# 6. 等待服务就绪
echo "6. 等待服务就绪..."
sleep 10

# 7. 健康检查
echo "7. 健康检查..."
curl -f http://localhost:8003/health || {
    echo "健康检查失败"
    docker-compose logs app
    exit 1
}

echo "=== 部署完成！==="
echo "服务地址: http://localhost:8003"
echo "查看日志: docker-compose logs -f app"
echo "停止服务: docker-compose down"
```

---

## 八、安全隐患与最佳实践

### 8.1 常见安全隐患

```yaml
# ❌ 错误示例：API密钥硬编码在配置文件中
environment:
  - API_KEY=sk-1c419112af98425885f4d440b79d192e  # 危险！
```

**风险**：
- 代码泄露会导致API密钥暴露
- Git历史中会保留密钥
- 任何有代码访问权限的人都能看到

### 8.2 安全配置方式

```yaml
# ✅ 正确方式：使用环境变量文件
services:
  app:
    env_file:
      - .env  # 从.env文件读取环境变量

# .env文件（不要提交到Git）
API_KEY=sk-xxx
MYSQL_PASSWORD=xxx
```

```bash
# .gitignore中添加
.env
*.env
```

### 8.3 Docker安全最佳实践

| 实践 | 说明 |
|------|------|
| 非root用户运行 | `USER 1000:1000` |
| 只读文件系统 | `read_only: true` |
| 资源限制 | `memory: 1G, cpus: 0.5` |
| 安全更新 | 定期更新基础镜像 |
| 最小权限 | 只暴露必要端口 |

---

## 九、性能测试（Locust）

### 9.1 什么是Locust？

Locust是一个Python负载测试工具，用于测试系统的并发处理能力。

### 9.2 关键性能指标

| 指标 | 英文 | 说明 |
|------|------|------|
| **TTFT** | Time To First Token | 首个Token响应时间 |
| **TPS** | Tokens Per Second | 每秒Token数 |
| **延迟** | Latency | 请求响应时间 |
| **吞吐量** | Throughput | 每秒请求数 |

### 9.3 Locust测试代码示例

```python
from locust import HttpUser, task, between
import json
import uuid

class QAUser(HttpUser):
    wait_time = between(1, 5)  # 用户等待时间1-5秒
    
    def on_start(self):
        """用户启动时创建会话"""
        self.session_id = str(uuid.uuid4())
    
    @task(1)  # 权重1
    def http_query(self):
        """HTTP非流式查询测试"""
        self.client.post("/api/query", json={
            "query": "Python是什么？",
            "session_id": self.session_id
        })
    
    @task(2)  # 权重2
    def websocket_query(self):
        """WebSocket流式查询测试"""
        with self.client.ws_connect("/api/stream") as ws:
            ws.send(json.dumps({
                "query": "详细介绍Python",
                "session_id": self.session_id
            }))
            
            ttft = None  # 首Token响应时间
            start_time = time.time()
            
            for message in ws:
                data = json.loads(message)
                if data["type"] == "token" and ttft is None:
                    ttft = time.time() - start_time
                    print(f"TTFT: {ttft:.2f}秒")
                elif data["type"] == "end":
                    break
```

### 9.4 测试结果分析

```
测试结果示例：
├── HTTP查询
│   ├── 平均响应时间: 0.5秒
│   ├── P95响应时间: 1.2秒
│   └── 成功率: 99.5%
└── WebSocket查询
    ├── TTFT: 0.8秒
    ├── 总响应时间: 3.2秒
    └── 成功率: 98.0%
```

---

## 十、学习要点总结

1. **Docker核心概念**：镜像、容器、仓库、Dockerfile
2. **docker-compose**：多容器应用编排，定义服务、网络、卷
3. **部署流程**：构建镜像 → 启动容器 → 健康检查
4. **生产配置**：环境变量、日志、监控、安全
5. **安全隐患**：API密钥不要硬编码，使用.env文件
6. **性能测试**：Locust负载测试，关注TTFT指标
7. **最佳实践**：非root用户、只读文件系统、资源限制