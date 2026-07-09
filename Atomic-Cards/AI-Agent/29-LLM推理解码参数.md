---
author: "XunZong"
created: "2026-07-09"
tags: ["AI-Agent", "LLM", "推理参数"]
aliases: ["LLM推理参数", "Temperature", "Top P", "Beam Search", "解码参数"]
---

# LLM 推理解码参数

## 定义

大语言模型推理时，通过**解码参数控制输出质量**。模型每一步输出一个概率分布 $p(x_t | x_{<t}) \in \mathbb{R}^{|V|}$（其中 $|V|$ 为词表大小，$x_t$ 为当前步生成的 token，$x_{<t}$ 为已生成的所有前缀 token），解码参数决定了如何从该分布中采样下一个 token，从而影响输出的多样性、确定性和质量。

## 核心参数详解

### 1. Temperature（温度）

Temperature 通过缩放 softmax 前的 logits 来调整输出概率分布的平滑程度。

$$
p_i = \frac{\exp(z_i / T)}{\sum_{j=1}^{|V|} \exp(z_j / T)}
$$

其中 $z_i$ 为第 $i$ 个 token 的 logit 值（模型最后一层输出的未归一化分数），$T$ 为温度系数，$p_i$ 为经过 softmax 后的概率。

| T 取值 | 分布形态 | 输出风格 | 适用场景 |
|:------:|:--------|:---------|:---------|
| **T = 0** | 退化为 argmax | 贪心解码（greedy），每次都选概率最高的 token | 数学推理、代码生成、事实问答 |
| **0 < T < 1** | 分布变陡峭 | 保守严谨，高概率 token 概率增高 | 翻译、知识问答、医疗诊断 |
| **T = 1** | 保持原分布 | 默认输出 | 通用场景 |
| **T > 1** | 分布变平缓 | 天马行空，低概率 token 概率提升 | 创意写作、故事生成、头脑风暴 |

> T=0 时等价于贪心解码（greedy decoding）：$x_t = \arg\max_{i} p_i$

### 2. Top P（核采样 / Nucleus Sampling）

按概率降序排列 token，在累积概率达到阈值 $p$ 的最小 token 集合中重新归一化后采样。

$$
S_p = \arg\min_{k} \sum_{i=1}^{k} p_{(i)} \geq p
\quad\text{其中 } p_{(1)} \geq p_{(2)} \geq \cdots \geq p_{(|V|)}
$$

其中 $p_{(i)}$ 为按概率降序排列后的第 $i$ 个 token 的概率，$S_p$ 为入选的 token 集合（即累积概率首次超过阈值 $p$ 时的最小前缀集合），$p \in [0, 1]$ 为 Top P 阈值。

| P 取值 | 效果 | 适用场景 |
|:------:|:----|:---------|
| **P = 0.1** | 只从最高概率的少量 token 中采样 | 事实性问答、严格格式输出 |
| **P = 0.5** | 中等方式 | 通用对话、摘要生成 |
| **P = 0.9** | 从概率覆盖较广的 token 集合采样 | 创意写作、多轮对话 |

### 3. Max Tokens（最大输出长度）

限制模型最多生成的 token 数量。需满足约束：

$$
\text{input\_tokens} + \text{output\_tokens} \leq \text{model\_context\_limit}
$$

其中 $\text{input\_tokens}$ 为输入 prompt 的 token 数，$\text{output\_tokens}$ 为模型生成的 token 数，$\text{model\_context\_limit}$ 为模型的最大上下文窗口长度。

常见模型上下文限制：

| 模型 | 上下文窗口 |
|:----|:----------|
| GPT-4o | 128K tokens |
| GPT-3.5-turbo | 16K tokens |
| Claude 3.5 Sonnet | 200K tokens |
| DeepSeek-V2 | 128K tokens |

### 4. Frequency Penalty（词频惩罚）

根据 token 在已生成文本中的出现次数施加线性惩罚，减少重复内容。

$$
z_i' = z_i - \beta \cdot c_i
$$

其中 $z_i$ 为原始 logit，$c_i$ 为 token $i$ 在已生成文本中的出现次数（基于当前已生成序列的统计），$\beta \in [0, 2]$ 为词频惩罚系数（常见默认值 0.1~1.0），$z_i'$ 为惩罚后的新 logit。

### 5. Presence Penalty（出现惩罚）

token 一旦出现过就施加固定值惩罚，与出现次数无关，鼓励引入新主题。

$$
z_i' = z_i - \gamma \cdot t_i
$$

其中 $t_i \in \{0, 1\}$ 表示 token $i$ 是否在已生成文本中出现过（0 为未出现，1 为已出现），$\gamma \in [0, 2]$ 为出现惩罚系数，$z_i'$ 为惩罚后的新 logit。

### 6. Beam Search（集束搜索）

每次保留概率最大的 $k$ 条路径（beam），最终从 $k$ 条完整路径中选最优解。

$$
\text{total paths} = |V|^L \quad\rightarrow\quad \text{maintained paths} = k \times L
$$

其中 $|V|$ 为词表大小，$L$ 为生成序列长度，$k$ 为 beam width（集束宽度）。朴素搜索的总路径数为 $|V|^L$（指数级，不可行），beam search 将其简化为 $k \times L$ 条路径（线性级，可计算），通过动态规划思想在每个解码步只保留 top-k 候选路径。

| Beam Width | 效果 | 适用场景 |
|:----------:|:----|:---------|
| **k = 1** | 等价于贪心解码 | 简单分类、翻译 |
| **k = 3~5** | 权衡质量与效率 | 机器翻译、文本摘要 |
| **k = 10+** | 质量高但计算成本大 | 学术论文生成、高精度翻译 |

## 参数组合使用建议

| 应用场景 | Temperature | Top P | Frequency Penalty | Presence Penalty | Beam Width |
|:--------|:-----------:|:-----:|:-----------------:|:----------------:|:----------:|
| **代码生成** | 0~0.3 | 0.1~0.3 | 0 | 0 | 1 |
| **事实问答** | 0~0.3 | 0.1~0.5 | 0 | 0 | 1 |
| **翻译** | 0.3~0.7 | 0.5~0.7 | 0 | 0 | 3~5 |
| **通用对话** | 0.7~1.0 | 0.7~0.9 | 0.3~0.5 | 0.3~0.5 | 1 |
| **创意写作** | 0.8~1.2 | 0.9 | 0.5~0.8 | 0.5~0.8 | 1 |
| **故事生成** | 1.0~1.5 | 0.9 | 0.5~1.0 | 0.5~1.0 | 1 |

## Python 代码示例

以下示例展示通过 OpenAI SDK 调用时各解码参数的配置方式：

```python
import openai  # openai >= 1.0

client = openai.OpenAI(api_key="your-api-key")

# 代码生成：低 Temperature，低 Top P，无惩罚
response_code = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "system", "content": "你是一个资深 Python 工程师"},
        {"role": "user", "content": "写一个快速排序函数"}
    ],
    temperature=0.1,       # T<1，输出保守严谨
    top_p=0.1,              # 只从高概率 token 采样
    max_tokens=1024,        # 限制输出长度
    frequency_penalty=0.0,  # 无词频惩罚
    presence_penalty=0.0    # 无出现惩罚
)

# 创意写作：高 Temperature，高 Top P，高惩罚
response_story = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "user", "content": "写一个关于 AI 觉醒的短故事"}
    ],
    temperature=1.2,        # T>1，输出多样化
    top_p=0.9,              # 核采样覆盖范围广
    max_tokens=2048,        # 允许较长输出
    frequency_penalty=0.7,  # 减少词汇重复
    presence_penalty=0.7    # 鼓励引入新概念
)

# 翻译任务：中等 Temperature，使用 Beam Search（需 Vision API 或自定义实现）
# 注意：OpenAI Chat API 原生不支持 beam search，需通过 n 参数 + 后处理模拟
response_translation = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "system", "content": "你是一个专业翻译，将英文翻译为中文"},
        {"role": "user", "content": "Translate: Attention is all you need."}
    ],
    temperature=0.3,        # T<1，严谨翻译
    top_p=0.5,              # 中等核采样
    max_tokens=256,
    frequency_penalty=0.0,
    presence_penalty=0.0,
    n=3                     # 生成 3 个候选，模拟 beam search 的多路径选择
)
```

## ML/DL 应用场景

| 应用场景 | 推荐参数配置 | 说明 |
|:--------|:------------|:----|
| **数学推理** | T=0, Top P=0.1, beam=1 | 确定性输出，不允许随机性 |
| **机器翻译** | T=0.3~0.7, beam=3~5 | 中等确定性，多路径择优 |
| **实体抽取** | T=0, Top P=0.1, FP=0 | 严格格式，不允许词汇重复惩罚干扰 |
| **多轮对话** | T=0.7, Top P=0.9, FP=0.5 | 适度多样性与重复避免 |
| **摘要生成** | T=0.3~0.5, beam=3 | 兼顾准确性与语言流畅度 |
| **创意广告文案** | T=1.0~1.2, Top P=0.95, PP=0.8 | 高多样性，强制避免重复 |

## 面试追问

**Q1（基础）**：Temperature=0 和 Temperature=1 在推理时的区别是什么？各适用于哪些场景？
**回答要点**：

1. Temperature=0 退化为贪心解码，每一步选概率最高的 token，输出完全确定，适合数学推理和代码生成等需要精确性的任务
2. Temperature=1 保持原始概率分布采样，每次推理输出可能不同，适合对话和创意任务
3. 实际应用中，知识类任务通常设 T<0.3，创意类任务设 T>0.8

**Q2（深挖）**：Top P（核采样）相比单纯 Temperature 调整有什么优势？两者同时使用时如何协同？
**回答要点**：

1. Top P 动态选择 token 集合大小，能自适应不同概率分布形态，而 Temperature 均匀缩放所有 logits，低概率 token 可能被抬到不合理的高度
2. Top P 能自动过滤长尾低概率 token，避免模型生成无关或错误的单词
3. 两者同时使用时，先应用 Temperature 缩放 logits，再执行 Top P 截断采样，Temperature 控制分布整体形状，Top P 控制采样集合大小

**Q3（实战）**：在构建 RAG 问答系统时，如何设置解码参数来平衡答案的准确性和多样性？
**回答要点**：

1. 事实性问答：设 Temperature=0（或极低值如 0.1）、Top P=0.1、关闭所有惩罚项，保证每次回答稳定正确
2. 多轮对话 RAG：设 Temperature=0.5~0.7、Top P=0.7~0.9、适度惩罚（FP=0.3, PP=0.3），兼顾上下文一致性和表达多样性
3. 摘要类 RAG：设 Temperature=0.3~0.5、beam=3，保证信息准确性的同时提升语言流畅度

**Q4（边界）**：Beam Search 的局限性是什么？什么场景下不适合使用 Beam Search？
**回答要点**：

1. Beam Search 倾向于生成高概率的"安全"输出，导致重复度高、多样性不足，不适合创意写作和故事生成
2. Beam Search 的计算成本与 beam width 线性增长，实时对话场景延迟不可接受
3. 自回归模型中，Beam Search 的全局最优性无法保证，且存在"长度偏差"问题（倾向于短句），通常需要配合长度归一化使用

## 参考引用

- 需要理解 GPT 与自回归生成的相关知识，参见 [GPT与自回归生成](../NLP/11-GPT与自回归生成.md)
- 需要理解提示词工程核心原则的相关知识，参见 [提示词工程核心原则](./06-提示词工程核心原则.md)
- 需要理解 Agent 定义与核心公式的相关知识，参见 [Agent定义与核心公式](./01-Agent定义与核心公式.md)
- 需要理解 Transformer 中 Softmax 归一化的数学根基，参见 [逻辑回归与Softmax](../机器学习/07-逻辑回归.md)
- 需要理解 ChatGPT/GPT 系列模型的工程实践，参见 [GPT与自回归生成](../NLP/11-GPT与自回归生成.md)