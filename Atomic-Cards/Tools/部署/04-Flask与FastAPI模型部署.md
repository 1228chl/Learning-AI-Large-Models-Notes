---
author: "XunZong"
created: "2026-07-06"
tags: ["工程", "API", "部署"]
aliases: ["Flask", "FastAPI", "模型部署", "API部署"]
---

# Flask 与 FastAPI 模型部署

## 定义

将训练好的 ML 模型包装为 **Web API**，使其他应用可以通过 HTTP 请求调用模型推理。Flask 和 FastAPI 是最常用的两个 Python Web 框架。

## 部署架构原理

### ASGI vs WSGI——并发的本质差异

| 协议 | 代表框架 | 请求处理模型 | 并发能力 | I/O 等待时 |
|:----|:--------|:------------|:--------:|:----------:|
| **WSGI**（同步） | Flask、Django | 每请求一个线程 | 受线程池大小限制 | 线程阻塞 |
| **ASGI**（异步） | FastAPI、Starlette | 单进程事件循环 | 可处理数千并发 | 切换其他任务 |

**核心区别**：模型推理通常是 I/O 密集型（等待 GPU 计算、数据库查询），ASGI 在等待 I/O 时可切去处理其他请求，而 WSGI 的线程只能干等。这也意味着 FastAPI 在高并发推理场景下吞吐量显著优于 Flask。

### 模型部署的关注点三角

```
推理延迟 ← → 吞吐量
     ↓
   资源消耗（GPU 显存 / CPU 内存）
```

三个目标相互制约：增大 batch size 提升吞吐量但增加延迟和显存；使用量化降低资源消耗但可能降低精度。生产部署需根据业务 SLA 在这三者间取得平衡。

## Flask vs FastAPI

```python
# 核心流程：训练好的模型 → 加载 → 包装为 API → 启动服务
# 将离线训练完成的模型封装为 Web 服务，使前端或其他微服务可通过 HTTP 请求调用推理
# 这是 ML 工程中最基础的模型上线方式，核心关注点：模型加载时机、请求验证、错误处理
```

## Flask vs FastAPI

| 对比 | Flask | FastAPI |
|:----:|:------|:--------|
| **发布时间** | 2010 | 2018 |
| **异步支持** | ❌ 需额外插件 | ✅ **原生 async/await** |
| **自动文档** | ❌ 需手动配置 | ✅ **自动生成 Swagger UI** |
| **请求验证** | ❌ 手动验证 | ✅ **Pydantic 自动验证** |
| **性能** | 一般 | **快（对标 Node/Go）** |
| **生态** | 成熟，插件多 | 快速增长 |
| **ML 部署推荐** | ⚠️ 小项目 | ✅ 新项目首选 |

## FastAPI 部署示例

```python
# pip install fastapi uvicorn torch transformers

from fastapi import FastAPI
from pydantic import BaseModel
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification

# 创建 FastAPI 应用实例，title 会在自动生成的 Swagger 文档中显示
app = FastAPI(title="文本分类 API")

# 定义请求与响应的数据模型（继承 Pydantic BaseModel）
# FastAPI 自动根据类型注解验证请求字段，非法请求直接返回 422，无需手写验证逻辑
class PredictInput(BaseModel):
    text: str

class PredictOutput(BaseModel):
    label: str
    confidence: float

# 在模块加载阶段预加载模型和分词器，避免首次请求时因加载耗时导致超时
# 生产部署时应加入模型预热逻辑，确保服务就绪后才对外提供服务
model_name = "bert-base-chinese"

tokenizer = AutoTokenizer.from_pretrained(model_name)

model = AutoModelForSequenceClassification.from_pretrained(model_name)
model.eval()  # 切换为推理模式：禁用 Dropout 和 BatchNorm 的训练行为，保证输出确定性


@app.post("/predict", response_model=PredictOutput)
async def predict(input: PredictInput):
    # 将输入文本转为模型所需的张量格式，返回 PyTorch 张量，过长文本截断
    inputs = tokenizer(input.text, return_tensors="pt", truncation=True)
    with torch.no_grad():  # 禁用梯度计算，大幅减少内存占用并加速推理

        outputs = model(**inputs)
    # 对 logits 做 softmax 得到类别概率分布，dim=1 沿类别维度归一化
    probs = torch.softmax(outputs.logits, dim=1)
    # 二分类：取正类概率与 0.5 阈值比较，实际生产应使用校准后的阈值
    label = "positive" if probs[0][1] > 0.5 else "negative"

    return PredictOutput(label=label, confidence=float(probs[0][1]))

# 启动命令：uvicorn main:app --host 0.0.0.0 --port 8000
# --host 0.0.0.0 监听所有网络接口，--port 8000 默认端口，生产应加 --workers 多进程
```

## Flask 部署示例

```python
# pip install flask torch transformers

from flask import Flask, request, jsonify
import torch


app = Flask(__name__)
# 加载训练好的模型（需自行实现 load_model 函数）
# 注意：Flask 默认同步执行，高并发场景下每个请求会阻塞一个线程
model = load_model()


@app.route('/predict', methods=['POST'])
def predict():
    # Flask 手动解析 JSON 请求体（无自动验证，需自行处理解析失败）
    data = request.get_json()

    text = data['text']

    result = model.predict(text)
    # 手动将结果序列化为 JSON 返回，需自行处理数据类型转换（如 numpy/torch 转 list）
    return jsonify({'prediction': result.tolist()})


if __name__ == '__main__':
    # Flask 开发服务器，生产环境应换用 Gunicorn 或 uWSGI
    app.run(host='0.0.0.0', port=5000)
```

## 生产部署架构

```python
# 生产级模型API部署架构（非单文件，需配合 Docker + Nginx + 多副本）
#                      ┌──────────────┐
#                      │   Nginx/Traefik  │  ← 反向代理 + 限流 + TLS 终止
#                      └──────┬───────┘
#                     ┌───────┼───────┐
#                     ▼               ▼
#              ┌──────────┐   ┌──────────┐
#              │ FastAPI   │   │ FastAPI   │  ← 多副本水平扩展
#              │ (副本 1)  │   │ (副本 2)  │
#              └──────────┘   └──────────┘
#                     │               │
#                     └───────┬───────┘
#                             ▼
#                      ┌──────────┐
#                      │  Redis    │  ← 缓存推理结果 + 请求排队
#                      └──────────┘
```

**关键实践**：
1. **模型预加载**：应用启动时加载模型到内存，避免首次请求冷启动超时
2. **健康检查**：暴露 `/health` 端点供负载均衡器探测服务状态
3. **预热请求**：服务就绪后发送 dummy 请求触发模型推理，完成 CUDA 上下文初始化
4. **超时与重试**：设置 `request_timeout`，配合指数退避重试策略

## 模型加载最佳实践

```python
# 模型保存格式与加载：不同框架有各自推荐的序列化方式，选错可能导致兼容或安全问题
import joblib
import torch

# sklearn 模型使用 joblib：比标准 pickle 对大数组/NumPy 对象更高效
# compress=3 在文件大小与序列化速度间取得平衡（0-9 可选，9 压缩比最高但最慢）
joblib.dump(model, 'model.joblib', compress=3)

model = joblib.load('model.joblib')

# PyTorch 模型推荐仅保存 state_dict（参数）而非完整模型对象
# 仅存参数字典体积小、跨版本兼容性好、不包含可执行代码更安全
torch.save(model.state_dict(), 'model.pt')
# 加载时 map_location='cpu' 确保即使在无 GPU 环境也能加载模型（自动映射设备）
model.load_state_dict(torch.load('model.pt', map_location='cpu'))
model.eval()  # 切换推理模式：禁用 Dropout，固定 BatchNorm 的 running stats
```

## API 文档与测试

```bash
# FastAPI 自动生成交互式文档：
# Swagger UI:  http://localhost:8000/docs
# ReDoc:       http://localhost:8000/redoc

# 测试
curl -X POST http://localhost:8000/predict \
  -H "Content-Type: application/json" \
  -d '{"text": "这部电影太精彩了！"}'
```

## ML 中的 API 部署

| 应用场景 | 框架 | 说明 |
|:--------:|:----|:----|
| **快速原型** | Flask | 简单快速，小流量 |
| **生产级推理** | FastAPI | 高性能，自动文档 |
| **流式输出** | FastAPI + StreamingResponse | LLM 逐 token 输出 |
| **批量推理** | FastAPI + Batch 端点 | 多请求合并处理 |
| **Docker 部署** | FastAPI + Docker | 容器化一键部署 |

## 面试追问

**Q1（基础）**：FastAPI 相比 Flask 在模型部署场景中的核心优势是什么？
**回答要点**：

1. 原生异步支持（async/await），高并发下性能更好
2. Pydantic 自动请求验证减少样板代码
3. 自动生成 Swagger/ReDoc 文档方便调试
4. Starlette 底层性能对标 Node.js 和 Go

**Q2（深挖）**：FastAPI 的异步机制是如何工作的？为什么能比 Flask 处理更多并发请求？
**回答要点**：

1. FastAPI 基于 Starlette + ASGI（异步服务器网关接口），单进程事件循环处理 I/O 操作
2. Flask 基于 WSGI，每个请求阻塞线程
3. 异步下等待 I/O 时可切换处理其他请求，提高吞吐量

**Q3（实战）**：生产环境中部署模型推理 API 需要考虑哪些问题？如何保证高可用？
**回答要点**：

1. 模型预加载避免首次请求冷启动
2. 设置超时和重试机制防止请求卡死
3. Docker + 多副本负载均衡
4. 健康检查端点 `/health` 和预热（warm-up）请求
5. 使用 Nginx/Traefik 反向代理限流

**Q4（边界）**：FastAPI 在什么场景下不适合作为模型部署方案？是否有更好的替代？
**回答要点**：

1. 实时流式视频/音频处理推荐 gRPC（协议效率更高）
2. 需要 GPU 批处理时可用 Triton Inference Server 或 TorchServe
3. Python GIL 限制 CPU 密集推理（多进程/多副本解决）
4. 边缘端部署推荐 ONNX Runtime 或 TensorRT

## 参考引用
- 需要理解 Docker 基础与容器化的相关知识，参见 [Docker基础与容器化](../Docker/01-Docker基础与容器化.md)
- 需要理解 HTTP 基础与 API 设计的相关知识，参见 [HTTP基础与API设计](../网络/08-HTTP基础与API设计.md)
- 需要理解 LLM API 调用与 ChatBot 的相关知识，参见 [LLM API调用与ChatBot](07-LLM API调用与ChatBot.md)
