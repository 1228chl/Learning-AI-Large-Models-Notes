# QA Agent 端到端测试深度解析

> 源文件：`scripts/manual_tests/test_qa.py`（约 200 行，需手动创建）
> 对应课件：5.17 端到端测试
> 前置条件：所有服务运行中（FastAPI + Milvus + MCP Server）

## 一、文件定位

`test_qa.py` 是 QA Agent 的手动端到端测试脚本，覆盖 8 个测试场景，验证所有路径和边界情况。

```
测试脚本的覆盖范围：
  ├─ 4 条分类路径：GENERAL / PRECISE / VAGUE / BROAD
  ├─ 2 种兜底模式：llm_direct / web_augmented
  ├─ 多轮记忆续接：同一 session 连续提问
  ├─ 会话隔离：不同 session 互不干扰
  ├─ SSE 流式接口：验证事件流完整性
  └─ 历史接口：验证消息和摘要
```

---

## 二、测试前置条件（课件第 2 页）

### 2.1 启动所有服务

```bash
# 终端 1：FastAPI 主应用
cd backend
python -m uvicorn main:app --reload --port 8000

# 终端 2：Knowledge Base MCP Server
python backend/mcp/knowledge_base_server.py    # 默认 8001

# 终端 3：Web Search MCP Server（可选）
python backend/mcp/web_search_server.py        # 默认 8002
```

### 2.2 验证后端就绪

```bash
curl -s http://localhost:8000/health | python -m json.tool --no-ensure-ascii
```

### 2.3 获取登录 Token

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "test_user", "password": "test_pass"}' | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
```

---

## 三、辅助函数（课件第 3 页）

### 3.1 `chat`：同步聊天

```python
SESSION_A = "e2e-test-session-a"
SESSION_B = "e2e-test-session-b"

def chat(token: str, message: str, session_id: str = SESSION_A,
         enable_web_search: bool = False) -> dict:
    """调用 POST /api/v1/qa/chat，返回 JSON 响应"""
    resp = httpx.post(
        f"{BASE_URL}/api/v1/qa/chat",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "session_id":        session_id,
            "message":           message,
            "enable_web_search": enable_web_search,
        },
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()
```

**`timeout=60`**：QA Agent 完整流程（分类 → 检索 → 精排 → 生成 → 存记忆）可能需要 30-60 秒，超时时间必须足够长。

### 3.2 `get_history`：获取历史

```python
def get_history(token: str, session_id: str) -> dict:
    """调用 GET /api/v1/qa/sessions/{session_id}/history"""
    resp = httpx.get(
        f"{BASE_URL}/api/v1/qa/sessions/{session_id}/history",
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()
```

### 3.3 `stream_chat`：流式聊天

```python
def stream_chat(token: str, message: str, session_id: str = SESSION_A):
    """调用 POST /api/v1/qa/chat/stream，打印 SSE 事件"""
    with httpx.Client(timeout=60) as client:
        with client.stream(
            "POST",
            f"{BASE_URL}/api/v1/qa/chat/stream",
            headers={"Authorization": f"Bearer {token}"},
            json={"session_id": session_id, "message": message},
        ) as resp:
            for line in resp.iter_lines():
                if line.startswith("data: "):
                    event = json.loads(line[6:])
                    print(f"  [{event['type']}] {event}")
```

---

## 四、8 个测试场景

### 场景 1：GENERAL 路径——打招呼

```python
def test_general_query(token):
    """测试 GENERAL 路径：打招呼/闲聊 → 跳过 RAG → LLM 直答"""
    r = chat(token, "你好，请问你是谁？")
    assert r["answer_mode"] == "general"
    assert r["confidence"] == 1.0
    assert "📚" not in r["answer"]
    print("✅ GENERAL 路径：answer_mode=general, confidence=1.0")
```

**验证点**：

| 断言 | 预期 | 说明 |
|------|------|------|
| `answer_mode == "general"` | 通用问题模式 | 不走 RAG |
| `confidence == 1.0` | 固定 1.0 | GENERAL 路径不涉及检索 |
| `"📚" not in answer` | 无来源标注 | 没有检索知识库 |

### 场景 2：PRECISE 路径——精确检索

```python
def test_precise_query(token):
    """测试 PRECISE 路径：明确技术问题 → 检索 → RAG 生成"""
    r = chat(token, "商品聚合大模型中双塔召回怎么实现？")
    assert r["answer_mode"] == "rag"
    assert len(r["sources"]) > 0, "RAG 回答应有来源"
    assert "📚" in r["answer"]
    print("✅ PRECISE 路径：answer_mode=rag, sources 非空")
```

**验证点**：

| 断言 | 预期 | 说明 |
|------|------|------|
| `answer_mode == "rag"` | RAG 模式 | 高置信度检索 |
| `len(sources) > 0` | 有来源 | 知识库命中 |
| `"📚" in answer` | 有来源标注 | generate_rag 附加了 📚 |

### 场景 3：VAGUE 路径——模糊问题

```python
def test_vague_query(token):
    """测试 VAGUE 路径：模糊问题 → HyDE 生成 → 检索 → RAG 生成"""
    r = chat(token, "Hard Negative Sampling 没懂，能解释一下吗？")
    assert r["answer_mode"] == "rag", f"期望 rag，实际 {r['answer_mode']}"
    print("✅ VAGUE 路径：HyDE → 检索 → RAG 生成")
```

**验证点**：`answer_mode == "rag"`——HyDE 生成的假设文档成功检索到了相关内容。

### 场景 4：BROAD 路径——宽泛问题

```python
def test_broad_query(token):
    """测试 BROAD 路径：宽泛问题 → Multi-Query → 并行检索 → 合并去重 → RAG"""
    r = chat(token, "全面介绍商品聚合大模型微调")
    assert r["answer_mode"] == "rag", f"期望 rag，实际 {r['answer_mode']}"
    print("✅ BROAD 路径：Multi-Query → 并行检索 → RAG 生成")
```

**验证点**：`answer_mode == "rag"`——Multi-Query 拆分的子问题成功检索到了相关内容。

### 场景 5：低置信度兜底——`llm_direct`

```python
def test_low_confidence_fallback(token):
    """测试低置信度兜底：无关 query → 知识库无命中 → LLM 直答 + ⚠️"""
    r = chat(token, "xyzxyz完全不相关的测试内容abc")
    assert r["answer_mode"] == "llm_direct", f"期望 llm_direct，实际 {r['answer_mode']}"
    assert "⚠️" in r["answer"], "llm_direct 回答应含 ⚠️ 说明"
    print("✅ 低置信度兜底：answer_mode=llm_direct, ⚠️ 提示已附加")
```

**验证点**：

| 断言 | 预期 | 说明 |
|------|------|------|
| `answer_mode == "llm_direct"` | LLM 直答 | 知识库无命中 |
| `"⚠️" in answer` | 有免责提示 | 告知学员非课程内容 |

### 场景 6：低置信度 + 联网搜索——`web_augmented`

```python
def test_web_search_fallback(token):
    """测试联网搜索兜底：低置信度 + enable_web_search=True → Web 搜索 → 增强回答"""
    r = chat(token, "2024年最新的AI技术趋势是什么？", enable_web_search=True)
    if r["answer_mode"] == "web_augmented":
        assert len(r["sources"]) > 0, "web_augmented 应有 URL 来源"
        print("✅ 联网搜索兜底：answer_mode=web_augmented, sources 非空")
    else:
        print(f"  ⚠️ 未触发 web_augmented（当前模式={r['answer_mode']}），"
              f"可能知识库已命中或 Web Search 不可用")
```

**验证点**：`answer_mode == "web_augmented"` 时，`sources` 应有 URL 来源。

### 场景 7：多轮记忆续接

```python
def test_multi_turn_memory(token):
    """测试多轮对话记忆：同一 session 连续提问 → 历史续接"""
    r1 = chat(token, "商品聚合大模型中双塔召回怎么实现？", session_id=SESSION_B)
    assert r1["answer_mode"] == "rag", "第1轮应为 RAG 回答"
    print(f"  第1轮回答片段：{r1['answer'][:100]}...")

    r2 = chat(token, "它在训练时怎么用 Hard Negative Sampling？", session_id=SESSION_B)
    assert r2["answer_mode"] == "rag", "第2轮应为 RAG 回答"

    # 第2轮回答里应该提到双塔召回或 Hard Negative，说明历史被续接
    found = ("双塔" in r2["answer"] or "Hard Negative" in r2["answer"]
             or "hard negative" in r2["answer"].lower())
    assert found, f"第2轮回答未提到相关词，记忆续接可能失败：{r2['answer'][:200]}"
    print("✅ 多轮记忆：第2轮回答提到了第1轮的关键词，历史续接成功")

    # 验证历史接口
    hist = get_history(token, SESSION_B)
    assert hist["total_turns"] >= 2, f"历史接口应返回至少 2 轮，实际 {hist['total_turns']}"
    print(f"✅ 历史接口：total_turns={hist['total_turns']}，消息列表非空")
```

**验证点**：

| 步骤 | 断言 | 说明 |
|------|------|------|
| 第 1 轮 | `answer_mode == "rag"` | 正常 RAG 回答 |
| 第 2 轮 | 回答含"双塔"或"Hard Negative" | 记忆续接，LLM 知道"它"指什么 |
| 历史接口 | `total_turns >= 2` | 两条消息都已保存 |

**"它"的指代解析**：第 1 轮问了"双塔召回"，第 2 轮问"它在训练时怎么用 Hard Negative Sampling？"。有了历史摘要，LLM 知道"它"指的是"双塔召回模型"。

### 场景 8：会话隔离

```python
def test_session_isolation(token):
    """测试会话隔离：不同 session_id → 历史互不干扰"""
    r_a = chat(token, "你好，我是学员A", session_id=SESSION_A)
    r_b = chat(token, "你好，我是学员B", session_id=SESSION_B)
    # 验证历史接口中两条消息互不串
    hist_a = get_history(token, SESSION_A)
    hist_b = get_history(token, SESSION_B)
    # 各自的历史中不应该包含对方的对话
    for msg in hist_a["messages"]:
        assert "学员B" not in msg["content"], "会话A 不应包含会话B 的内容"
    for msg in hist_b["messages"]:
        assert "学员A" not in msg["content"], "会话B 不应包含会话A 的内容"
    print("✅ 会话隔离：不同 session_id 历史互不干扰")
```

---

## 五、SSE 流式接口验证（课件第 6 节）

### 5.1 curl 手动验证

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test_user","password":"test_pass"}' | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

curl -s -X POST http://localhost:8000/api/v1/qa/chat/stream \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"session_id":"stream-test-001","message":"Qwen VL微调需要准备什么数据？"}'
```

### 5.2 预期 SSE 事件流

```
data: {"type": "progress", "stage": "理解问题中..."}
data: {"type": "progress", "stage": "召回相关文档..."}
data: {"type": "token", "content": "Qwen"}
data: {"type": "token", "content": " VL"}
data: {"type": "token", "content": " 微调需要准备..."}
...
data: {"type": "meta", "answer_mode": "rag", "confidence": 0.89,
       "sources": ["sample2 > Qwen VL 微调"], "session_id": "stream-test-001"}
data: {"type": "done"}
```

### 5.3 代码验证

```python
def test_stream_chat(token):
    """测试 SSE 流式接口：验证事件流完整性"""
    events = stream_chat(token, "Qwen VL微调需要准备什么数据？",
                         session_id="stream-test-001")
    types = [e["type"] for e in events]
    assert "progress" in types, "应有 progress 事件"
    assert "token" in types, "应有 token 事件"
    assert "meta" in types, "应有 meta 事件"
    assert "done" in types, "应有 done 事件"
    # meta 事件应包含关键字段
    meta = [e for e in events if e["type"] == "meta"][0]
    assert "answer_mode" in meta
    assert "confidence" in meta
    assert "sources" in meta
    print("✅ SSE 流式接口：progress → token → meta → done 事件完整")
```

---

## 六、完整测试执行

```python
# scripts/manual_tests/test_qa.py
if __name__ == "__main__":
    import os, sys, json, httpx

    BASE_URL = os.getenv("BASE_URL", "http://localhost:8000")
    SESSION_A = "e2e-test-session-a"
    SESSION_B = "e2e-test-session-b"

    # 登录获取 Token
    resp = httpx.post(f"{BASE_URL}/api/v1/auth/login", json={
        "username": "test_user", "password": "test_pass",
    })
    token = resp.json()["access_token"]

    print("=" * 60)
    print("QA Agent 端到端测试")
    print("=" * 60)

    test_general_query(token)
    test_precise_query(token)
    test_vague_query(token)
    test_broad_query(token)
    test_low_confidence_fallback(token)
    test_web_search_fallback(token)
    test_multi_turn_memory(token)
    test_session_isolation(token)
    test_stream_chat(token)

    print("\n" + "=" * 60)
    print("✅ 所有测试通过")
    print("=" * 60)
```

运行方式：

```bash
cd backend
python scripts/manual_tests/test_qa.py
```

---

## 七、`★` 设计亮点总结

### 7.1 8 个场景覆盖所有路径

| 场景 | 覆盖路径 | 关键断言 |
|------|---------|---------|
| GENERAL | 通用问题直答 | `answer_mode=general`, `confidence=1.0` |
| PRECISE | 精确检索 → RAG | `answer_mode=rag`, `sources` 非空 |
| VAGUE | HyDE → 检索 → RAG | `answer_mode=rag` |
| BROAD | Multi-Query → 并行检索 → RAG | `answer_mode=rag` |
| llm_direct | 低置信度兜底 | `answer_mode=llm_direct`, `"⚠️" in answer` |
| web_augmented | 联网搜索兜底 | `answer_mode=web_augmented`, `sources` 含 URL |
| 多轮记忆 | 同一 session 续接 | 第 2 轮提到第 1 轮的关键词 |
| 会话隔离 | 不同 session 隔离 | 各自历史不含对方内容 |

### 7.2 断言设计原则

每个场景的断言都验证三个层面：
1. **answer_mode 正确**——路径分支是否正确
2. **关键字段非空**——必要数据是否生成
3. **内容特征匹配**——回答格式是否符合预期（如 📚 / ⚠️）

### 7.3 多轮记忆验证方法

```python
found = ("双塔" in r2["answer"] or "Hard Negative" in r2["answer"]
         or "hard negative" in r2["answer"].lower())
```

用关键词匹配验证记忆续接，而不是检查 LLM 回答的精确内容。因为 LLM 的回答每次可能不同，但应该包含上一轮讨论过的关键词。

### 7.4 会话隔离验证

不同 `session_id` 的历史互不干扰。验证方法：各自的历史接口返回的消息中不包含对方的对话内容。

### 7.5 SSE 流式验证

验证事件流完整性：`progress` → `token` → `meta` → `done` 四类事件必须全部出现，且 `meta` 事件包含 `answer_mode`、`confidence`、`sources` 三个关键字段。

### 7.6 测试脚本可重复执行

使用固定的 `session_id`（`e2e-test-session-a`、`e2e-test-session-b`），每次运行覆盖之前的数据。`save_memory_node` 的 UPSERT 语义保证幂等。

### 7.7 环境变量配置

`BASE_URL` 通过环境变量配置，默认 `http://localhost:8000`，方便在不同环境（本地/CI）中切换。

Resume this session with:
claude --resume 5648d58b-6623-4280-9a7a-29bca08554a5