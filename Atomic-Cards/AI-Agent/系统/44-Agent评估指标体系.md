---
author: "XunZong"
created: "2026-07-30"
tags: ["AI-Agent", "评估", "指标体系", "Recall@K", "Answer Correctness", "MAE", "Cohen's kappa"]
aliases: ["Agent Evaluation Metrics", "评估指标", "检索评估", "生成评估", "一致性评估"]
---

# Agent 评估指标体系

## 定义

Agent 评估指标体系是衡量 AI Agent 输出质量的**多维量化框架**，覆盖检索质量（Recall@K）、生成质量（Answer Correctness）、评分精度（MAE）和一致性（Cohen's kappa）四个维度。每个指标有明确的企业级阈值：< 70% 不可上线、70-80% 可用、80-90% 良好、> 90% 企业级。

评估不是一次性的——它是一个"度量→诊断→优化→再度量"的持续迭代循环。指标的选择取决于 Agent 的输出类型：检索类用 Recall@K，生成类用 Answer Correctness，评分类用 MAE + Cohen's kappa。

$$ \text{Agent 质量} = f(\underbrace{\text{Recall@K}}_{\text{检索质量}}, \underbrace{\text{Answer Correctness}}_{\text{生成质量}}, \underbrace{\text{MAE}}_{\text{评分偏差}}, \underbrace{\text{Cohen's } \kappa}_{\text{分类一致性}}) $$

## 四维指标体系

| 指标 | 公式 | 衡量什么 | 优选方向 | Agent 适用 |
|------|------|---------|---------|-----------|
| Recall@K | $\frac{\vert \text{Retrieved} \cap \text{Gold} \vert}{\vert \text{Gold} \vert}$ | Top-K 检索覆盖了多少标准答案文档 | 越高越好（> 80%） | QA Agent（RAG） |
| Answer Correctness | LLM 评判（语义匹配）或人工判定 | 生成答案是否包含正确要点 | 越高越好（> 80%） | QA Agent（RAG） |
| MAE（平均绝对误差） | $\frac{1}{n}\sum_{i=1}^{n}\vert \text{AI}_i - \text{Expert}_i \vert$ | AI 评分与专家评分的平均偏差 | 越低越好（< 5） | 试卷批改、简历评分 |
| Cohen's kappa | $\kappa = \frac{P_o - P_e}{1 - P_e}$ | 两评分者分类一致性（扣除随机一致） | 越高越好（> 0.6） | 分档评价任务 |

## 直观理解

> 评估一个 Agent 就像做体检——不会只看一项指标就下结论。Recall@K 是"该查的查到了吗"（视力检查），Answer Correctness 是"答对了吗"（问诊判断），MAE 是"评分偏差多少"（血压偏离标准值），Cohen's kappa 是"和专家的判断一致性"（两位医生的诊断是否一致）。四个指标合在一起，才能说这个 Agent "身体好不好"。

## Recall@K 详解

```python
def recall_at_k(retrieved_chunks, gold_chunks, k=3):
    """Recall@K：Top-K 检索结果中命中标准答案的比例"""
    top_k = set(retrieved_chunks[:k])
    gold  = set(gold_chunks)
    hits  = len(top_k & gold)                         # 命中的标准文档数
    return hits / len(gold) if gold else 0.0

# 全局指标：N 个测试问题中，至少命中一个标准文档的比例
def global_recall_at_k(all_results, k=3):
    hits = sum(1 for r in all_results
               if set(r.retrieved[:k]) & set(r.gold_chunks))  # Top-K 至少一个命中
    return hits / len(all_results)

# 企业阈值
# < 70%：不可上线 | 70-80%：可用 | 80-90%：良好 | > 90%：企业级
```

## Cohen's kappa 计算

```python
from sklearn.metrics import cohen_kappa_score

# AI 和教师在 100 份试卷上分别评定为 A/B/C/D 四档
ai_grades      = ["A", "B", "A", "C", "B", ...]   # 100 个 AI 评级
teacher_grades = ["A", "B", "B", "C", "B", ...]   # 100 个教师评级

kappa = cohen_kappa_score(ai_grades, teacher_grades)
# kappa = (Po - Pe) / (1 - Pe)
# Po = 观察到的一致率（AI 和教师评相同的比例）
# Pe = 随机期望一致率（考虑类别分布不均）

# 解读：
# κ > 0.8  → 高度一致（几乎完美）
# κ 0.6-0.8 → 中等一致（可接受）
# κ < 0.6  → 低一致（需要改进评分标准）
```

## 三种评估方法矩阵

$$ \text{评估方法选择} = \begin{cases} \text{自动化指标} & \text{有精确标准答案，需大规模重复评估} \\ \text{LLM-as-Judge} & \text{无标准答案但可定义评估维度，需千-万级评估} \\ \text{人工基线} & \text{高度主观、法律/安全敏感，需百-千级权威评估} \end{cases} $$

| 评估方法 | 核心指标 | Agent 适用示例 |
|---------|---------|-------------|
| 自动化指标 | Recall@K, MAE | QA Agent 检索评估、Exam Agent 评分偏差 |
| LLM-as-Judge | Answer Correctness | QA 回答正确性、Interview 报告质量 |
| 人工基线 | Cohen's kappa, HitL 确认率 | Exam 教师基线对比、Resume Issue Recall |

## AI/ML 工程应用场景

| 应用场景 | 核心指标组合 | 目标值 |
|---------|------------|--------|
| RAG 知识库问答上线评估 | Recall@3 + Answer Correctness | Recall@3 > 90%, Correctness > 85% |
| AI 试卷批改系统验收 | MAE + Cohen's kappa + HitL 干预率 | MAE < 1.5, kappa > 0.7, 干预率 < 20% |
| 简历审查系统评估 | Issue Recall + Score MAE | Issue Recall > 80%, MAE < 5 |
| 模拟面试报告质量评估 | 报告完整性 + 具体性 + 可操作性 | 各维度 LLM 评判 ≥ 3/5 |

## 面试追问

**Q1（基础）**：Agent 评估需要哪些核心指标？每个指标衡量什么？

**回答要点**：

1. Recall@K：衡量检索质量——Top-K 结果覆盖了多少标准答案文档
2. Answer Correctness：衡量生成答案的事实正确性——LLM 评判或人工判定
3. MAE（平均绝对误差）：AI 评分与专家评分的平均偏差——越低越好
4. Cohen's kappa：AI 和专家分类的一致性——扣除随机一致后的真实一致度
5. 没有一个指标能单独衡量 Agent 质量——检索好但生成差、评分准但分类乱，都要分别度量

**Q2（深挖）**：Recall@K 和 Answer Correctness 分别衡量什么？为什么两个都要看？

**回答要点**：

1. Recall@K：衡量"该搜到的搜到了吗"——检索阶段的召回质量
2. Answer Correctness：衡量"生成答案对了吗"——生成阶段的输出质量
3. 关系：检索是生成的前提——Recall@K 低时 Answer Correctness 不可能高（巧妇难为无米之炊）
4. 诊断价值：Recall 低 → 优化 chunking/embedding/hybrid search；Correctness 低但 Recall 高 → 优化 Prompt/Rerank/context 构建
5. 两者独立度量才能精准定位问题在检索环节还是生成环节

**Q3（实战）**：Cohen's kappa 为 0.6 和准确率 85%，哪个更能反映评分一致性？

**回答要点**：

1. 准确率 85% 包含"碰巧一致"的成分——如果 AI 和教师都把 90% 的学生评为"优秀"，即使随机匹配准确率也高达 81%
2. Cohen's kappa 扣除了随机一致期望 $P_e$——考虑类别分布不均的影响
3. 当类别严重不均衡时，高准确率可能是假的（"把所有人都评优秀"准确率高但 kappa 为零）
4. kappa 的局限性：要求两个评分者使用相同的类别标签——不适合连续分数（此时用 MAE 或 Pearson 相关）

**Q4（边界）**：如果 Agent 的 Issue Recall 是 84.7%，Score MAE 是 3.8，这个 Agent 能上线吗？

**回答要点**：

1. Issue Recall 84.7%：处于"良好"档位（80-90%）——大部分关键问题能发现，但仍有 15% 遗漏
2. Score MAE 3.8：处于"优秀"档位（3-5）——AI 评分与专家平均偏差不到 4 分（满分 100）
3. 综合判定：**可以在有监督的条件下上线**——教师需抽查 10-20% 的审查结果
4. 优化方向：Issue Recall 优先提升到 90%+（减少遗漏风险）→ 增加更多的简历 ground truth 数据 → 微调 issue diagnosis prompt

## 参考引用

- 需要理解 RAGAS 框架中 Faithfullness、Context Relevancy 等自动化评估指标：[RAG 系统评估 RAGAS](../系统/25-RAG系统评估(RAGAS).md)
- 需要理解 LLM-as-Judge 的语义评判设计和人工交叉验证：[LLM-as-Judge 评估模式](../基础/32-LLM-as-Judge评估模式.md)
- 需要理解评估指标（准确率、精确率、召回率、F1）的基础概念：[评估指标](../../机器学习/基础/04-评估指标.md)
- 需要理解 Cohen's kappa 的数学推导和 $P_o$/$P_e$ 的计算：[协方差与相关系数](../../数学基础/概率统计/05-协方差与相关系数.md)
- 需要理解评分 Rubric 设计中锚点如何提高评分一致性（直接影响 kappa）：[评分 Rubric 设计](../设计模式/04-评分Rubric设计.md)
