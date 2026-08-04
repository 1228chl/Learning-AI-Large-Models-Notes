---
author: "XunZong"
created: "2026-07-10"
tags: ["工程实践", "MLOps", "实验跟踪"]
aliases: ["MLOps", "实验跟踪", "WandB", "MLflow", "模型管理"]
---

# MLOps 与实验跟踪

## 定义

MLOps（Machine Learning Operations）是将 DevOps 理念应用到机器学习项目的工程实践，涵盖**实验跟踪、模型版本管理、CI/CD 流水线、模型监控和持续部署**的全生命周期管理。

## 为什么需要 MLOps

| 阶段 | 传统 ML 的问题 | MLOps 的解决 |
|:-----|:---------------|:-------------|
| **实验** | 本地脚本无记录，换台机器跑不了 | 实验参数/指标/代码自动记录 |
| **复现** | "上次跑出好结果的配置找不到了" | 每个实验有完整的环境 + 参数快照 |
| **部署** | 模型和环境捆绑，迁移困难 | 标准化的模型打包和部署流水线 |
| **监控** | 上线后模型漂移了才发现 | 自动监控特征/预测/标签分布变化 |
| **协作** | 同事的代码和参数改了什么不知道 | 团队共享实验历史，可复现每个结果 |

## 核心组件

### 实验跟踪

记录每次训练的完整上下文，确保可复现性：

```python
# Weights & Biases（WandB）实验跟踪
import wandb
import torch
import torch.nn as nn

# 初始化实验：记录超参数
wandb.init(
    project="bert-finetuning",              # 项目名称
    name="run_lr_1e-4_v2",                   # 本次实验的名称
    config={                                  # 超参数配置
        "learning_rate": 1e-4,
        "batch_size": 32,
        "epochs": 10,
        "model": "bert-base-chinese",
        "optimizer": "AdamW",
        "weight_decay": 0.01
    }
)

model = nn.Linear(100, 10)
optimizer = torch.optim.Adam(model.parameters(), lr=wandb.config.learning_rate)

for epoch in range(wandb.config.epochs):
    loss = model(torch.randn(32, 100)).sum()
    optimizer.zero_grad()
    loss.backward()
    optimizer.step()

    # 自动记录指标到云端
    wandb.log({
        "epoch": epoch,
        "loss": loss.item(),
        "learning_rate": optimizer.param_groups[0]['lr']
    })

    # 记录模型结构
    wandb.watch(model, log_freq=100)

wandb.finish()                               # 实验结束，关闭连接
```

### 模型版本管理

| 工具 | 模型存储 | 数据集管理 | 实验跟踪 | 部署 |
|:-----|:--------:|:---------:|:--------:|:---:|
| **MLflow** | ✅ | ✅ | ✅ | ✅ |
| **WandB** | ✅ | ✅ | ✅ | ❌（需第三方） |
| **DVC** | ✅（云存储）+ | ✅ | ❌ | ❌ |
| **DagsHub** | ✅ | ✅ | ✅ | ✅ |

### 模型监控

监控生产环境中模型的性能衰退（Model Drift）：

| 漂移类型 | 定义 | 检测方法 |
|:---------|:-----|:----------|
| **数据漂移** | 输入特征分布发生变化 | PSI（群体稳定性指标）、KS 检验 |
| **概念漂移** | 特征与标签的关系发生变化 | 监控预测置信度、上线后真实标签 vs 预测值 |
| **上游漂移** | 数据管线中上游数据变化 | 监控每个数据处理的中间输出分布 |

```python
# 使用 scipy 检测数据漂移
from scipy.stats import ks_2samp
import numpy as np

def detect_drift(training_data, production_data, threshold=0.05):
    """用 KS 检验检测特征分布是否发生漂移"""
    drift_features = []
    for i, col in enumerate(training_data.columns):
        stat, p_value = ks_2samp(training_data[col], production_data[col])
        if p_value < threshold:                 # p < 0.05 拒绝原假设——分布不同
            drift_features.append({
                'feature': col,
                'ks_statistic': stat,
                'p_value': p_value,
                'drift_detected': True
            })
    return drift_features
```

## 标准 MLOps 流水线

```
数据采集 → 数据处理 → 特征工程 → 模型训练 → 模型评估 → 模型部署 → 模型监控
   │           │           │          │          │          │          │
   └───────────┴───────────┴──────────┴──────────┴──────────┴──────────┴──→ 持续回馈
```

### CI/CD 差异

| 方面 | 传统 DevOps | MLOps |
|:-----|:------------|:-------|
| 变更内容 | 代码变更 | 代码 + 数据 + 模型 + 超参数 |
| 测试方式 | 单元测试 + 集成测试 | 数据验证 + 模型评估 + 公平性测试 |
| 部署对象 | 应用代码 | 模型服务 + 推理管线 |
| 回滚 | 代码回滚 | 模型版本回滚 + 数据管线回滚 |
| 监控 | 系统指标（CPU/内存） | 系统指标 + 数据分布 + 预测质量 |

## ML/DL 应用场景

| 应用场景 | MLOps 工具 | 说明 |
|:---------|:-----------|:------|
| 模型实验管理 | WandB | 记录每次实验的超参数、指标、代码版本、模型权重 |
| 模型注册中心 | MLflow Model Registry | 集中管理模型版本，标注"Staging → Production"状态 |
| 数据版本控制 | DVC | 对数据集做版本管理，确保训练数据可追溯 |
| 特征存储 | Feast | 统一管理在线/离线的特征计算和获取 |
| 流水线编排 | Airflow / Kubeflow | 定时触发数据更新→训练→评估→部署的自动流程 |

## 面试追问

**Q1（基础）**：MLOps 的核心目标是什么？一个成熟的 MLOps 系统应该包含哪些组件？
**回答要点**：

1. 核心目标：让 ML 模型的开发、部署、维护过程可复现、可自动化、可监控，解决"实验不可复现、模型上线困难、线上漂移不知道"的三大痛点。
2. 五大组件：实验跟踪（记录参数/指标/代码版本）、模型注册中心（版本管理+状态流转）、数据版本控制（数据集快照）、模型部署服务（REST/gRPC API）、生产监控（数据漂移+质量告警）。

**Q2（深挖）**：数据漂移和概念漂移有什么区别？如何监控和处理概念漂移？
**回答要点**：

1. 数据漂移（Data Drift）是输入特征 $P(X)$ 分布变化，概念漂移（Concept Drift）是特征与标签的关系 $P(Y|X)$ 变化。
2. 监控概念漂移更难：线上没有真实标签，需要延迟收集（如用户是否点击、是否退货）或人工标注抽样。
3. 处理方法：定期用新标注数据重新训练模型；使用自适应学习率在新数据上增量微调；如果漂移严重，触发完整的重新训练流水线。

**Q3（实战）**：你负责维护一个线上推荐模型，发现本周的 CTR 比上周下降了 15%，你会如何排查？
**回答要点**：

1. 第一步区分是系统问题还是模型问题：检查数据管线是否正常（特征是否都有值、数据量是否正常）、基础设施是否正常（响应延迟、内存/CPU）。
2. 第二步排查数据漂移：比较本周和上周的特征分布，用 KS 检验或 PSI 指标检测哪些特征发生了变化（如用户分布、商品上架策略变化）。
3. 第三步排查概念漂移：抽样线上预测结果做人工评估，检查"同样的特征组合是否得到了不同的预测"。
4. 第四步排查外部因素：节假日、活动促销、竞品策略变化等业务层面原因。

**Q4（边界）**：多个团队共享 ML 基础设施时，MLOps 的设计需要注意什么？
**回答要点**：

1. 资源隔离：每个团队的项目应有独立的实验空间和模型仓库，避免超参数搜索互相抢占 GPU。
2. 特征复用：建立统一的特征存储（Feature Store），避免不同团队重复开发相同特征，同时保证在线/离线的特征计算一致性。
3. 模型治理：设定模型准入标准（精确率/召回率/延迟底线），只有通过评估的模型才能进入 Staging → Production 流水线。
4. 成本控制：自动清理失败的实验、定期归档历史模型版本、限制非工作时间的 GPU 使用。

## 参考引用

- 需要理解模型部署的基础流程参见 [Flask与FastAPI模型部署](../部署/02-Flask与FastAPI模型部署.md)
- 需要理解 Docker 在 MLOps 流水线中的容器化作用参见 [Docker基础与容器化](../Docker/01-Docker基础与容器化.md)
- 需要理解模型版本管理的保存格式参见 [模型保存格式](../部署/03-模型保存格式.md)
- 需要理解数据版本控制与特征工程的关系参见 [特征工程](../../机器学习/特征工程/01-特征工程.md)