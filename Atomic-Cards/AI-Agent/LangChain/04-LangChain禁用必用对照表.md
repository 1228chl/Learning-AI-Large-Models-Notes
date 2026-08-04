---
author: "XunZong"
created: "2026-07-30"
tags: ["AI-Agent", "LangChain", "API规范", "最佳实践"]
aliases: ["LangChain规范", "禁用API", "必用API", "init_chat_model", "with_structured_output", "LangGraph替代"]
---

# LangChain 禁用/必用对照表

## 定义

在 EduAgent 项目中，LangChain 1.2.10 版本有明确的**禁用/必用 API 对照表**——这是项目级强制规范，旨在统一团队代码风格、避免使用已废弃或不兼容的 API。所有 Agent 代码必须遵守此规范，不得使用"旧写法"。

### 核心对照表

| 用途 | 禁用（旧写法） | 必用（新写法） | 原因 |
|------|---------------|---------------|------|
| 创建模型 | `ChatOpenAI(...)` | `init_chat_model(...)` | 1.x 统一入口，换模型不改代码 |
| 串联调用 | `LLMChain` / `AgentExecutor` | LangGraph 状态图 | Chain 已废弃，图模型更灵活可控 |
| 多轮记忆 | `ConversationBufferMemory` | Checkpointer（MemorySaver） | Memory 类已废弃，State 持久化更可靠 |
| 取文本 | `message.text()`（当方法） | `message.text`（当属性） | 1.x 属性非方法，加括号抛异常 |
| 结构化输出 | 自己解析 JSON | `with_structured_output(模型, method="function_calling")` | 自动校验类型，避免手动解析 |
| 提示词模板 | `ChatPromptTemplate` | 直接 f-string 拼接 | 项目风格：一目了然好调试 |

### 创建模型的正确写法

```python
# ✅ 必用：init_chat_model
llm = init_chat_model(
    model="deepseek-chat",           # ❌ 不能写成 "deepseek/deepseek-chat"
    model_provider="openai",         # 走 OpenAI 兼容协议
    api_key="sk-xxx",
    base_url="https://api.deepseek.com/v1",
    temperature=0,                   # 0=最稳定，批改用；对话可调 0.3~0.7
)
```

**关键参数规范**：

- `model`：直接写模型名 `"deepseek-chat"`，**禁止**加 provider 前缀（如 `"deepseek/deepseek-chat"`）
- `model_provider`：走 OpenAI 兼容协议时填 `"openai"`
- `temperature`：批改/评分/结构化提取场景固定 `0`，对话场景 `0.3~0.7`
- `max_retries`：设为 `0`，重试统一由 `retry.py` 管理

### 结构化输出的规范写法

```python
# ✅ 必用：with_structured_output + method="function_calling"
structured_llm = llm.with_structured_output(PersonInfo, method="function_calling")
result: PersonInfo = await structured_llm.ainvoke(messages)
print(result.name)  # 直接访问，不需要解析 JSON
```

> ⭐ **强制规范**：`method="function_calling"` **必须写**——DeepSeek 不支持 `json_schema` 模式，不写此参数会报错。

### 用 LangGraph 替代串联链

```python
# ❌ 禁用：LLMChain 串联
chain = LLMChain(llm=llm, prompt=prompt)
result = chain.run(input)

# ✅ 必用：LangGraph 状态图
builder = StateGraph(MyState)
builder.add_node("step1", step1_node)
builder.add_node("step2", step2_node)
builder.add_edge(START, "step1")
builder.add_edge("step1", "step2")
builder.add_edge("step2", END)
graph = builder.compile()
result = graph.invoke({"input": "..."})
```

### 直观理解

> 对照表就像项目的"代码规范白皮书"——不是"这样做也行，那样做也行"，而是"统一这样做"来保证整个团队产出的代码风格一致、可维护、不踩坑。

## 应用场景

| 场景 | 禁用写法 | 必用写法 | 说明 |
|------|---------|---------|------|
| 简历审查 Agent 调 LLM 评分 | `ChatOpenAI(...)` | `init_chat_model(...)` | 统一模型入口 |
| 试卷批改串联评分步骤 | `LLMChain(...)` | LangGraph `add_node(...)` | 图模型更灵活 |
| 模拟面试多轮对话记忆 | `ConversationBufferMemory` | `MemorySaver` + `thread_id` | 持久化更可靠 |
| 简历结构化提取 | 手动 `json.loads(response)` | `with_structured_output(ResumeStructured, method="function_calling")` | 自动校验类型 |
| 提问 Agent 提示词 | `ChatPromptTemplate.from_template(...)` | f-string 直接拼接 | 调试友好 |

## 面试追问

**Q1（基础）**：EduAgent 项目中为什么禁用 `ChatOpenAI(...)` 而改用 `init_chat_model(...)`？
**回答要点**：

1. `init_chat_model` 是 LangChain 1.x 的统一模型入口，支持多种 provider 通过参数切换
2. 换模型时只需改 `model` 和 `model_provider` 参数，不需要改构造类名
3. 团队统一使用，避免出现 `ChatOpenAI`、`ChatDeepSeek`、`ChatAnthropic` 混用的情况

**Q2（深挖）**：为什么 `method="function_calling"` 必须写？不写会怎样？
**回答要点**：

1. LangChain 的 `with_structured_output` 支持 `function_calling` 和 `json_schema` 两种模式
2. DeepSeek 的 API 只实现了 function calling 协议，不支持 `json_schema` 模式
3. 不写此参数时 LangChain 默认可能使用 `json_schema` 模式，导致 API 调用报 400 错误
4. 如果换用支持 `json_schema` 的模型（如 GPT-4），可以省略此参数

**Q3（实战）**：你的项目中正在使用 `ChatOpenAI` 旧写法，如何迁移到 `init_chat_model`？
**回答要点**：

1. 替换构造方式：`ChatOpenAI(model="gpt-4")` → `init_chat_model(model="gpt-4", model_provider="openai")`
2. 参数迁移：`temperature`、`max_retries`、`http_client` 等参数名大部分兼容
3. 流式调用：`llm.astream(messages)` 接口一致，无需修改业务代码
4. 结构化输出：`llm.with_structured_output(Schema, method="function_calling")` 接口一致

**Q4（边界）**：完全禁用 `LLMChain` 用 LangGraph 替代的代价是什么？
**回答要点**：

1. 学习成本：团队需要学习 LangGraph 的 State/Node/Edge 概念，比 `LLMChain` 的链式调用更复杂
2. 代码量：简单的两步串联（如"翻译→总结"）用 LangGraph 需要 15+ 行样板代码，`LLMChain` 只需 3 行
3. 调试复杂度：LangGraph 图的状态流转比 Chain 的 pipe 更难调试，需要结合 Checkpointer 查看中间状态
4. 权衡：简单流程依然可用 `pipe` 操作符（`chain = prompt | llm | parser`），LangGraph 仅用于需要条件分支和状态管理的复杂场景

## 参考引用

- 需要理解 LangChain 六大组件的整体架构的相关知识，参见 [LangChain六大组件](./01-LangChain六大组件.md)
- 需要掌握 Pydantic 结构化输出的具体用法的相关知识，参见 [Pydantic结构化输出](./03-Pydantic结构化输出.md)
- 需要了解 LangGraph 状态图如何替代 Chain 的相关知识，参见 [LangGraph 图模型四要素](../LangGraph/01-LangGraph图模型四要素.md)
- 需要了解 LangGraph 组件操作指南的相关知识，参见 [LangChain组件操作指南](./02-LangChain组件操作指南.md)
- 需要了解 LLM Factory 统一管理模型入口的相关知识，参见 [LLM Factory设计模式](../工程实践/01-LLM%20Factory设计模式.md)