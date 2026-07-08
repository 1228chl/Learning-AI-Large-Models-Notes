---
author: "XunZong"
created: "2026-07-06"
tags: ["工程", "API", "部署"]
aliases: ["Flask", "FastAPI", "模型部署", "API部署"]
---

# Flask 与 FastAPI 模型部署

## 定义

将训练好的 ML 模型包装为 **Web API**，使其他应用可以通过 HTTP 请求调用模型推理。Flask 和 FastAPI 是最常用的两个 Python Web 框架。

```python
# 核心流程：训练好的模型 → 加载 → 包装为 API → 启动服务
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

app = FastAPI(title="文本分类 API")

# 请求体模型（Pydantic 自动验证）
class PredictInput(BaseModel):
    text: str

class PredictOutput(BaseModel):
    label: str
    confidence: float

# 启动时加载模型
model_name = "bert-base-chinese"
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForSequenceClassification.from_pretrained(model_name)
model.eval()

@app.post("/predict", response_model=PredictOutput)
async def predict(input: PredictInput):
    inputs = tokenizer(input.text, return_tensors="pt", truncation=True)
    with torch.no_grad():
        outputs = model(**inputs)
    probs = torch.softmax(outputs.logits, dim=1)
    label = "positive" if probs[0][1] > 0.5 else "negative"
    return PredictOutput(label=label, confidence=float(probs[0][1]))

# 启动: uvicorn main:app --host 0.0.0.0 --port 8000
```

## Flask 部署示例

```python
# pip install flask torch transformers

from flask import Flask, request, jsonify
import torch

app = Flask(__name__)
model = load_model()     # 加载训练好的模型

@app.route('/predict', methods=['POST'])
def predict():
    data = request.get_json()
    text = data['text']
    result = model.predict(text)
    return jsonify({'prediction': result.tolist()})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
```

## 模型加载最佳实践

```python
# 模型保存格式与加载
import joblib
import torch

# sklearn 模型 → joblib
joblib.dump(model, 'model.joblib', compress=3)
model = joblib.load('model.joblib')

# PyTorch 模型 → .pt
torch.save(model.state_dict(), 'model.pt')
model.load_state_dict(torch.load('model.pt', map_location='cpu'))
model.eval()
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

**回答要点**：原生异步支持（async/await），高并发下性能更好；Pydantic 自动请求验证减少样板代码；自动生成 Swagger/ReDoc 文档方便调试；Starlette 底层性能对标 Node.js 和 Go。

**Q2（深挖）**：FastAPI 的异步机制是如何工作的？为什么能比 Flask 处理更多并发请求？

**回答要点**：FastAPI 基于 Starlette + ASGI（异步服务器网关接口），单进程事件循环处理 I/O 操作；Flask 基于 WSGI，每个请求阻塞线程；异步下等待 I/O 时可切换处理其他请求，提高吞吐量。

**Q3（实战）**：生产环境中部署模型推理 API 需要考虑哪些问题？如何保证高可用？

**回答要点**：模型预加载避免首次请求冷启动；设置超时和重试机制防止请求卡死；Docker + 多副本负载均衡；健康检查端点 `/health` 和预热（warm-up）请求；使用 Nginx/ Traefik 反向代理限流。

**Q4（边界）**：FastAPI 在什么场景下不适合作为模型部署方案？是否有更好的替代？

**回答要点**：实时流式视频/音频处理推荐 gRPC（协议效率更高）；需要 GPU 批处理时可用 Triton Inference Server 或 TorchServe；Python GIL 限制 CPU 密集推理（多进程/多副本解决）；边缘端部署推荐 ONNX Runtime 或 TensorRT。

> 理解前置知识可参见 [Docker基础与容器化](./01-Docker基础与容器化.md)；理解模型压缩量化剪枝蒸馏的深度学习原理可参见 [模型压缩量化剪枝蒸馏](../深度学习/15-模型压缩量化剪枝蒸馏.md)；理解前置知识可参见 [HTTP基础与API设计](./08-HTTP基础与API设计.md)；理解前置知识可参见 [LLM API调用与ChatBot](./07-LLM API调用与ChatBot.md)