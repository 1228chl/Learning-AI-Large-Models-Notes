# 试卷批改 Agent：端到端测试深度解析

> 源文件：`scripts/manual_tests/test_exam.py`（约 150 行）
> 对应课件：6.13 端到端测试
> 前置条件：所有服务运行中（FastAPI + PostgreSQL）

## 全文行号速查表（test_exam.py 预期结构）

| 行号范围 | 函数/代码段 | 说明 |
|---------|-------------|------|
| 1~15 | import + 常量 | httpx, BASE_URL, SUBMISSION_ID |
| 17~30 | `prepare_test_docx` | 生成测试用 Word 文件 |
| 32~45 | `submit_exam` | 上传试卷提交 |
| 47~65 | `wait_for_pending_review` | 轮询等待批改完成（for-else 超时） |
| 67~85 | `approve_review` | 教师确认发布 |
| 87~100 | `verify_published` | 验证发布结果 |
| 102~120 | `modify_review` | 教师修改分数后发布 |
| 122~140 | `main` | 主入口：8 步全链路 |
| 142~150 | `if __name__ == "__main__"` | 直接运行 |

---

## 一、测试场景总览

测试脚本覆盖完整的学员→教师→发布链路：

### 1.1 为什么需要端到端测试？

第六章前面的文档分析了每个节点、每条路径的行为，但**节点之间的协作**（一条完整的批改链路）需要端到端测试验证。例如：

- `parse_word` 解析的 Word 文件，能否被 `load_questions_meta` 正确合并 DB 元数据？
- `run_three_tracks` 三轨批改后，`aggregate_results` 能否正确汇总？
- `teacher_review` 的 `interrupt()` 暂停后，`POST /confirm` 能否正确恢复并发布？

这些都是跨节点行为，只有真实 HTTP 请求才能验证。测试脚本启动完整服务（FastAPI + PostgreSQL + LLM），用真实请求走完学员→教师→发布链路。

### 1.2 测试覆盖的链路

```
学员登录 → 提交 Word 试卷 → 等待 AI 批改（pending_review）
    → 教师查看待确认列表 → 确认发布（approve）
    → 学员查询已发布结果
    → 教师修改分数后发布（modify 路径）
```

```
① 学员登录 → ② 提交试卷 → ③ 轮询批改状态 → ④ 教师登录
→ ⑤ 查看待确认列表 → ⑥ 查看预批改详情 → ⑦ 教师 approve 发布
→ ⑧ 学员查询最终结果
```

**8 步覆盖 6 个 API 端点**，验证 approve 和 modify 两条教师决策路径。

---

## 二、测试前置条件（课件 6.13.1）

```bash
# ① 基础服务运行中
docker-compose --env-file .env.local ps
# 确认 postgres / milvus 状态为 Up

# ② 初始化测试数据（只需做一次）
conda activate edu_agent
python scripts/seed_data.py

# ③ 启动后端
uvicorn backend.main:app --reload --port 8000
```

**`seed_data.py`** 写入两份测试试卷：
- `3e76aeed-5e01-4aa7-be8d-2055d12b9ea7` — Java 基础测试卷
- `aaaaaaaa-0000-0000-0000-000000000001` — Java 后端开发第 1 章阶段测试

---

## 三、准备测试用 Word 文件（课件 6.13.2）

`scripts/manual_tests/create_test_exam_docx.py` 生成包含 4 道题的测试文件：

| 题号 | 题型 | 学员答案 | 正确答案 |
|:-----|:-----|:---------|:---------|
| 1 | 单选（`single_choice`） | `A` | `A` |
| 2 | 多选（`multi_choice`） | `ACD` | `ACD` |
| 3 | 简答（`short_answer`） | Spring IOC 概念解释 | 按得分点判定 |
| 4 | 判断（`judge`） | `正确` | `正确` |

---

## 四、测试脚本逐段精读（`test_exam.py`）

### 4.1 辅助函数

```python
def login(username: str, password: str) -> str:
    resp = httpx.post(
        f"{BASE_URL}/auth/login",
        json={"username": username, "password": password},
        trust_env=False,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def print_section(title: str):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print("="*60)
```

| 行号 | 代码 | 说明 |
|:-----|:-----|:-----|
| 95 | `def login(username: str, password: str) -> str:` | 登录辅助函数，返回 JWT Token |
| 96~101 | `resp = httpx.post(...)` | POST 登录请求 |
| 99 | `trust_env=False` | 忽略系统代理，避免本地开发被拦截 |
| 100 | `resp.raise_for_status()` | 非 2xx 响应直接抛异常 |
| 101 | `return resp.json()["access_token"]` | 提取 JWT Token |
| 103~109 | `def print_section(title: str)` | 打印分隔线，美化测试输出 |

**`trust_env=False`**：防止 httpx 读取系统代理环境变量（如 `HTTP_PROXY`），避免本地开发时请求被代理拦截。

### 4.2 步骤 ①~②：学员登录 + 提交试卷

```python
student_token = login(STUDENT_UN, STUDENT_PW)

with open(DOCX_PATH, "rb") as f:
    resp = httpx.post(
        f"{BASE_URL}/exam/submit",
        headers={"Authorization": f"Bearer {student_token}"},
        data={"exam_id": EXAM_ID},
        files={"file": ("test_exam_answer.docx", f, "application/octet-stream")},
        timeout=30.0,
        trust_env=False,
    )
submit_result = resp.json()
submission_id = submit_result["submission_id"]
```

**`data={"exam_id": ...}` + `files={"file": ...}`**：FastAPI 的 `Form` + `UploadFile` 参数对应。`exam_id` 通过表单字段上传，Word 文件通过文件上传字段上传。

**`timeout=30.0`**：文件上传的超时时间。大文件可能需要更长时间。

### 4.3 步骤 ③：轮询批改状态

```python
for attempt in range(20):
    time.sleep(5)
```

| 行号 | 代码 | 说明 |
|:-----|:-----|:-----|
| 138 | `for attempt in range(20):` | 最多轮询 20 次（约 100 秒超时） |
| 139 | `time.sleep(5)` | 每次间隔 5 秒 |
    resp = httpx.get(
        f"{BASE_URL}/exam/my-submissions/{submission_id}",
        headers={"Authorization": f"Bearer {student_token}"},
        trust_env=False,
    )
    poll = resp.json()
    print(f"  第{attempt+1}次轮询，状态：{poll['status']}")
    if poll["status"] == "pending_review":
        print("  AI 批改完成，等待教师确认")
        break
    if poll["status"] == "published":
        print("  已发布（可能已被其他测试发布）")
        break
else:
    print("  ⚠️ 超时，请检查后端日志")
    sys.exit(1)
```

**`for else` 模式**：`for` 循环正常结束（没有 `break`）时执行 `else` 块。20 次轮询（每次 5 秒，共 100 秒）后仍未完成，打印超时提示并退出。

**轮询间隔 5 秒**：AI 批改通常需要 30~60 秒（三轨并行中最慢的 LLM 调用），5 秒轮询足够频繁但不至于对后端造成压力。

**`pending_review` 状态**：AI 批改完成，图在 `teacher_review_node` 处 `interrupt`，等待教师确认。

### 4.4 步骤 ④~⑥：教师查看

```python
teacher_token = login(TEACHER_UN, TEACHER_PW)

# ⑤ 查看待确认列表
resp = httpx.get(
    f"{BASE_URL}/exam/pending-reviews",
    headers={"Authorization": f"Bearer {teacher_token}"},
)
pending = resp.json()
print(f"待确认数量：{pending['total']}")

# ⑥ 查看预批改详情
resp = httpx.get(
    f"{BASE_URL}/exam/submissions/{submission_id}/review",
    headers={"Authorization": f"Bearer {teacher_token}"},
)
review = resp.json()
summary = review["pre_review_summary"]
print(f"AI 总分：{summary['total_score']}/{summary['full_score']} "
      f"（{summary['score_rate']*100:.1f}%）")
print(f"需复核题数：{summary.get('needs_review_count', 0)}")
print(f"薄弱点数量：{len(review['weak_points'])}")
for wp in review["weak_points"][:3]:
    print(f"  - {wp['tag']}：{wp['wrong_count']} 道错题")
```

**`pending['items'][:3]`**：只显示前 3 条待确认，防止列表过长。

**`summary['score_rate']*100:.1f`**：得分率格式化为百分比，保留 1 位小数。

### 4.5 步骤 ⑦：教师 approve 发布

```python
resp = httpx.post(
    f"{BASE_URL}/exam/submissions/{submission_id}/confirm",
    headers={"Authorization": f"Bearer {teacher_token}"},
    json={"action": "approve", "modifications": []},
    timeout=30.0,
    trust_env=False,
)
confirm = resp.json()
print(f"发布成功，最终得分：{confirm['final_score']}/{confirm['full_score']}")
print(f"得分率：{confirm['score_rate']*100:.1f}%")
assert confirm["status"] == "published"
print("✅ approve 流程通过")
```

**`json={"action": "approve", "modifications": []}`**：`approve` 模式，教师全部通过，无修改。

**`assert confirm["status"] == "published"`**：验证发布成功。

### 4.6 步骤 ⑧：学员查询最终结果

```python
resp = httpx.get(
    f"{BASE_URL}/exam/my-submissions/{submission_id}",
    headers={"Authorization": f"Bearer {student_token}"},
)
final = resp.json()
assert final["status"] == "published"
by_q = final["pre_review_summary"]["by_question"]
print(f"题目数量：{len(by_q)}")
for q in by_q:
    print(f"  题{q['question_no']} [{q['question_type']}] "
          f"{q['final_score']}/{q['full_score']} - {q['ai_feedback'][:40]}")
print("✅ 学员查询结果通过")
```

---

## 五、`modify` 路径验证（课件 6.13.4）

课件还提供了 `modify` 路径的测试代码：

```python
# 修改第1题分数为 1 分，增加评语
resp = httpx.post(
    f"{BASE_URL}/exam/submissions/{submission_id}/confirm",
    headers={"Authorization": f"Bearer {teacher_token}"},
    json={
        "action": "modify",
        "modifications": [
            {
                "question_id": "<第1题的 question_id>",
                "new_score": 1,
                "comment": "学员对 final 概念理解基本正确，表达不够完整，扣1分。"
            }
        ],
    },
    timeout=30.0,
)
```

---

## 六、后端日志关键字（课件 6.13.5）

| 事件 | 日志关键字 | 说明 |
|:-----|:---------|:------|
| 试卷提交 | `exam.submitted` | 学员提交成功 |
| 三轨启动 | `three_tracks.start` | 开始三轨并行批改 |
| 三轨完成 | `three_tracks.done` | 三轨批改完成 |
| 汇总完成 | `aggregate_results.done` | 统计总分和需复核数 |
| 薄弱点分析 | `analyze_weak_points.done` | 薄弱点分析完成 |
| 通知教师 | `notify_teacher.done` | 状态更新为 `pending_review` |
| 教师确认 | `exam.published` | 教师确认发布 |
| 发布完成 | `publish_results.done` | 最终结果写入数据库 |

---

## 七、调用方式与依赖

### 7.1 运行方式

```bash
# 确保所有服务已启动
cd backend
python -m uvicorn main:app --reload --port 8000

# 运行端到端测试
python scripts/manual_tests/test_exam.py
```

### 7.2 依赖的外部服务

| 服务 | 必须 | 说明 |
|------|------|------|
| FastAPI | ✅ | 主应用，所有 API 端点 |
| PostgreSQL | ✅ | 试卷、题目、提交记录、批改结果 |
| LLM API | ✅ | 模型推理（DeepSeek / OpenAI） |

### 7.3 测试脚本的幂等性

脚本使用固定 `submission_id`，每次运行覆盖之前的数据。`publish_results_node` 的先删后插保证幂等，重复运行不会产生重复记录。

---

## 八、边界情况与异常处理

| 场景 | 表现 | 处理 |
|------|------|------|
| FastAPI 未启动 | 连接被拒绝 | 检查 `uvicorn` 是否运行 |
| 数据库未初始化 | 试卷/题目不存在 | 先运行 `python scripts/seed_data.py` 导入测试数据 |
| AI 批改超时（>100 秒） | `for-else` 轮询超时 | 打印超时提示，建议检查 LLM 服务状态 |
| 教师确认时 submit 不存在 | 404 错误 | 脚本先提交再确认，顺序保证 |
| `modify` 路径的修改列表为空 | 按 approve 处理 | 无修改项时直接发布 |
| 网络代理干扰 | httpx 被代理拦截 | `trust_env=False` 忽略系统代理 |

---

## 九、`★` 设计亮点总结

### 7.1 8 步覆盖全链路

从学员登录到最终结果查询，覆盖 6 个 API 端点、2 种角色（学员/教师）、2 种决策路径（approve/modify）。

### 7.2 `for else` 轮询模式

`for` 循环正常结束时执行 `else` 块，超时自动退出并提示。20 次 × 5 秒 = 100 秒超时，与 AI 批改耗时匹配。

### 7.3 断言验证关键点

| 断言 | 验证内容 |
|:-----|:---------|
| `confirm["status"] == "published"` | 发布成功 |
| `final["status"] == "published"` | 学员能查到已发布结果 |
| `by_q` 逐题验证 | 每道题的分数和反馈正常 |

### 7.4 `trust_env=False` 防代理干扰

httpx 默认读取系统代理，本地开发时可能被代理拦截。`trust_env=False` 忽略系统代理，直接请求本地服务。