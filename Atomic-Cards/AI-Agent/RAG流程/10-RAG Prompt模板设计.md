---
author: "XunZong"
created: "2026-07-19"
tags: ["AI-Agent", "RAG", "Prompt设计"]
aliases: ["RAG Prompt", "提示词模板", "RAGPrompts", "答案生成提示词"]
---

# RAG Prompt 模板设计

## 定义

RAG Prompt 模板是 RAG 系统中集中管理所有 LLM 调用提示词的设计模式，通过 `RAGPrompts` 类将答案生成、HyDE、子查询、回溯四种 Prompt 模板统一维护。每个模板针对特定任务设计输入输出格式，通过 `PromptTemplate` 实现变量注入。

$$
\text{RAG Prompts} = \{\text{Answer Generation}, \text{HyDE}, \text{SubQuery}, \text{StepBack}\}
$$

### 核心代码

```python
from langchain_core.prompts import PromptTemplate

class RAGPrompts:
    # 1. 答案生成模板（最终回答）
    @staticmethod
    def rag_prompt():
        return PromptTemplate(
            template="""
        你是一个智能助手，负责帮助用户回答问题。请按照以下步骤处理：

        1. **分析问题和上下文**：
           - 基于提供的上下文（如果有）和你的知识回答问题。
           - 如果答案来源于检索到的文档，请在回答中明确说明。

        2. **评估对话历史**：
           - 检查对话历史是否与当前问题相关。
           - 如果相关，结合历史信息生成更准确的回答。

        3. **生成回答**：
           - 如果上下文和历史消息均不足以回答问题，请回复：
             "信息不足，无法回答，请联系人工客服，电话：{phone}。"

        **上下文**: {context}
        **对话历史**: {history}
        **问题**: {question}
        **回答**: """,
            input_variables=["context", "history", "question", "phone"])

    # 2. HyDE 假设答案生成模板
    @staticmethod
    def hyde_prompt():
        return PromptTemplate(
            template="""  
            假设你是用户，想了解以下问题，请生成一个简短的假设答案：  
            问题: {query}  
            假设答案:  
            """, input_variables=["query"])

    # 3. 子查询分解模板
    @staticmethod
    def subquery_prompt():
        return PromptTemplate(
            template="""  
            将以下复杂查询分解为多个简单子查询，每行一个子查询：  
            查询: {query}  
            子查询:  
            """, input_variables=["query"])

    # 4. 回溯问题生成模板
    @staticmethod
    def backtracking_prompt():
        return PromptTemplate(
            template="""  
            将以下复杂查询简化为一个更简单的问题：  
            查询: {query}  
            简化问题:  
            """, input_variables=["query"])
```

## 四种 Prompt 模板对比

| 模板 | 输入变量 | 输出格式 | 调用目的 | LLM 角色 |
|:-----|:---------|:---------|:---------|:---------|
| 答案生成 | `context`, `history`, `question`, `phone` | 完整答案 | 基于检索上下文生成最终回答 | 回答者 |
| HyDE | `query` | 一段假设答案文本 | 生成假设答案代替 query 检索 | 假设用户 |
| 子查询 | `query` | 每行一个子查询 | 将复杂查询分解为多个子问题 | 分析者 |
| 回溯 | `query` | 一行简化问题 | 将复杂查询简化为更基础的问题 | 简化者 |

## 直观理解

RAG Prompt 模板就像"一个工具箱里的四种螺丝刀"——答案生成是"拧紧螺丝"（最终输出），HyDE 是"先画草图再施工"（先生成假设再检索），子查询是"分解零件"（拆解问题），回溯是"退一步看全局"（简化问题）。每种工具针对不同的任务阶段。

## RAG 工程应用场景

| 模板 | 使用阶段 | 说明 |
|:-----|:---------|:-----|
| 答案生成 | RAG 流程最后一步 | 拼接检索上下文 + 用户问题，生成最终答案 |
| HyDE | 检索前增强 | 当查询语义稀疏时，先生成假设答案再检索 |
| 子查询 | 检索前增强 | 当查询涉及多主题时，拆分为子查询分别检索 |
| 回溯 | 检索前增强 | 当查询复杂需前置知识时，简化后再检索 |

## 面试追问

**Q1（基础）**：RAGPrompts 类为什么要用 `@staticmethod` 而不是实例方法？
**回答要点**：

1. Prompt 模板是纯函数——输入变量、输出模板固定，不需要实例状态
2. 静态方法无需实例化，调用方便：`RAGPrompts.rag_prompt()`
3. 所有模板共享同一个类的命名空间，便于集中管理和维护
4. 如需动态模板（如根据配置切换不同版本），可改为类方法

**Q2（深挖）**：答案生成模板中的"对话历史"（history）字段有什么作用？什么情况下应该忽略历史？
**回答要点**：

1. 对话历史用于多轮对话场景，让 LLM 理解上下文，消解指代（如"它的原理是什么"中的"它"）
2. 检查历史是否与当前问题相关（相同话题/实体），不相关则忽略
3. 忽略历史的情况：仅包含问候、不相关的话题切换、历史过长截断
4. 实现上，Prompt 中明确要求 LLM 先评估历史相关性再决定是否使用

**Q3（实战）**：如何设计一个 Prompt 模板让 LLM 输出结构化的子查询，而不是自由文本？
**回答要点**：

1. 在模板中明确指定输出格式："每行一个子查询"
2. 后处理时用 `split("\n")` 拆分，过滤空行和空白
3. 更严格的方案：指定 JSON 输出格式，用 `json.loads` 解析
4. 生产环境建议：使用 Output Parser（如 `PydanticOutputParser`）确保输出符合预期格式

**Q4（边界）**：如果答案生成模板中的 context 超过 LLM 上下文窗口限制，应该怎么处理？
**回答要点**：

1. 截断策略：从检索结果中优先保留最相关的文档，丢弃排序靠后的
2. 压缩策略：对每个文档做摘要，减少 token 占用
3. 分块策略：将长上下文拆分为多段，分别生成答案后合并
4. 项目中的做法：`max_prompt_length = 4096`，通过限制检索数量（`CANDIDATE_M = 2`）控制上下文长度

## 参考引用

- 需要了解 RAG 系统整体流程参见 [RAG三阶段流程](../RAG流程/01-RAG三阶段流程.md)
- 需要掌握 HyDE 的 Prompt 模板使用参见 [HyDE假设文档检索实现](./08-HyDE假设文档检索实现.md)
- 需要了解子查询的 Prompt 模板使用参见 [子查询检索策略](./09-子查询检索策略.md)
- 需要理解策略选择器中的 Prompt 模板参见 [策略选择与多路径RAG检索](../系统/05-策略选择与多路径RAG检索.md)
- 需要了解提示词工程核心原则参见 [提示词工程核心原则](../基础/03-提示词工程核心原则.md)