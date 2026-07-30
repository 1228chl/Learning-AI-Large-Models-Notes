---
author: "XunZong"
created: "2026-07-30"
tags: ["AI-Agent", "工程实践", "认证", "JWT", "bcrypt", "安全"]
aliases: ["JWT认证", "bcrypt密码", "依赖注入", "get_current_user", "密码安全"]
---

# JWT 认证与 bcrypt 密码安全

## 定义

**JWT（JSON Web Token）认证** 是 EduAgent 系统的安全防线，通过签发带签名的 Token 实现无状态身份验证。**bcrypt** 是密码哈希算法，提供单向不可逆、自带盐值的密码存储，密码校验在异步接口中通过 `run_in_executor` 丢到线程池执行，避免阻塞事件循环。

### JWT 认证完整流程

```
用户登录 → 查用户 + bcrypt 校验 → 签发 JWT Token → 后续请求携带 Token → 中间件鉴权
```

```python
# ① 用户登录端点到：查用户 + bcrypt 校验密码
@app.post("/login")
async def login(req: LoginRequest, db=Depends(get_db)):
    user = await db.fetchrow(
        text("SELECT * FROM users WHERE username = :name"),
        {"name": req.username}
    )
    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="用户名或密码错误")

    # ③ 签发 JWT Token
    token = jwt.encode(
        {"user_id": user["id"], "role": user["role"]},
        SECRET_KEY,
        algorithm="HS256"
    )
    return {"access_token": token, "role": user["role"]}

# ④ 后续请求自动鉴权
@app.get("/me")
async def me(current_user=Depends(get_current_user)):
    return current_user
```

### bcrypt 密码校验

```python
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    """密码哈希：bcrypt 自动加盐"""
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    """密码校验：CPU 密集型（~100ms），需 run_in_executor"""
    return pwd_context.verify(plain, hashed)
```

**密码安全三原则**：

1. **单向不可逆**：从哈希值无法反推出原始密码
2. **自带盐值**：bcrypt 自动为每个密码生成随机盐值，相同的密码产生不同的哈希值
3. **CPU 密集型**：设计上故意慢（~100ms），增加暴力破解成本

### `run_in_executor` 保护事件循环

```python
async def login(req: LoginRequest, db) -> dict:
    # ... 查询用户 ...

    # ✅ 密码校验丢到线程池，不阻塞事件循环
    loop = asyncio.get_running_loop()
    is_valid = await loop.run_in_executor(
        None, verify_password, req.password, user["password_hash"]
    )
    # run_in_executor(None, func, args) → None = 默认线程池
```

### `dependencies.py` 两个核心依赖

**依赖一：`get_db`——数据库会话**

```python
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()      # 正常结束 → 提交
        except Exception:
            await session.rollback()    # 异常 → 回滚
            raise
```

**依赖二：`get_current_user`——JWT 鉴权**

```python
async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    user = verify_jwt(credentials.credentials)
    if not user:
        raise HTTPException(status_code=401, detail="无效的认证凭证")
    return {"user_id": user["id"], "role": user["role"]}
```

### 直观理解

> JWT 好比游乐园的"手环"——你买票（登录）时戴上，每个项目（接口）只看手环不查票。手环上有你的身份和权限信息，而且有防伪标识（签名），伪造不了。bcrypt 好比把密码扔进碎纸机——碎纸机是单向的，撕了就拼不回来，而且每张纸（密码）撕出来的碎片（哈希值）长得都不一样。

## 应用场景

| 场景 | 实现方式 | 说明 |
|------|---------|------|
| 学员登录 | JWT 签发 + bcrypt 校验 | 密码校验用 `run_in_executor` 避免阻塞 |
| 接口鉴权 | `Depends(get_current_user)` | 每个需要登录的接口自动鉴权 |
| 数据隔离 | JWT 中的 `user_id` 和 `role` | 学员只能看自己的数据，教师可以看班级数据 |
| 角色权限 | JWT 中的 `role` 字段 | `student` / `teacher` / `admin` 三级权限控制 |

## 面试追问

**Q1（基础）**：JWT 认证的完整流程是什么？为什么不需要在服务端存 session？
**回答要点**：

1. 用户登录 → 服务端验证用户名密码 → 签发 JWT Token（含用户身份和权限信息）
2. 客户端后续请求在 HTTP Header 携带 Token
3. 服务端中间件验证 Token 签名和有效期，从中提取用户信息
4. JWT 是无状态的：Token 本身包含所有身份信息，服务端不需要查数据库或缓存来验证 session

**Q2（深挖）**：为什么密码校验（bcrypt）要用 `run_in_executor` 丢到线程池？直接调会怎样？
**回答要点**：

1. bcrypt 设计上故意慢（~100ms）以防止暴力破解，这是 CPU 密集型操作
2. 在异步协程中直接调 `verify_password` 会阻塞当前协程，但更重要的是阻塞事件循环，导致其他协程无法执行
3. 事件循环被阻塞期间，其他请求的数据库查询、LLM 调用等所有异步操作都卡住
4. `run_in_executor` 将同步阻塞操作丢到线程池执行，`await` 等待结果但不阻塞事件循环

**Q3（实战）**：在你的项目中，FastAPI 的 `Depends(get_current_user)` 如何实现自动鉴权？
**回答要点**：

1. 定义 `get_current_user` 依赖函数，从 HTTP Header 提取 Bearer Token，解码 JWT 验证签名和有效期
2. 在需要鉴权的接口路由参数中声明 `current_user = Depends(get_current_user)`
3. FastAPI 自动在请求处理前调用该依赖，鉴权失败直接返回 401，不进入业务逻辑
4. 依赖注入是"声明式"的：接口只需声明"我需要当前用户"，框架自动处理"谁"和"怎么获取"

**Q4（边界）**：JWT 认证有哪些局限性？如何应对？
**回答要点**：

1. Token 无法主动失效：签发后直到过期前都有效，无法"踢人下线"→ 解决方案：维护黑名单（Redis 缓存失效 Token），或使用短有效期（15 分钟）+ refresh token
2. Token 被盗用后风险高：无状态意味着服务端无法感知 Token 被盗 → 解决方案：绑定客户端指纹（IP + User-Agent），异常登录通知
3. Token 体积大：携带的用户信息越多，每次请求 Header 越大 → 解决方案：JWT 只存 `user_id` 和 `role`，其他信息在需要时查数据库
4. 密钥泄露风险：JWT 签名密钥一旦泄露，任何人都可以签发有效 Token → 解决方案：定期轮换密钥，使用环境变量管理，不提交到代码仓库

## 参考引用

- 需要理解 FastAPI 依赖注入机制的相关知识，参见 [Python 异步编程](../Python/并发/06-异步编程基础.md)
- 需要了解配置中心如何管理 JWT_SECRET_KEY 的相关知识，参见 [配置中心与异常体系设计](./03-配置中心与异常体系设计.md)
- 需要了解 `run_in_executor` 在异步编程中的应用的相关知识，参见 [Python 异步编程](../Python/并发/06-异步编程基础.md)
- 需要了解数据库会话管理如何配合 `get_db` 的相关知识，参见 [SQLAlchemy异步操作三件套](../数据库/SQL/07-SQLAlchemy异步操作三件套.md)
- 需要了解三层兜底异常处理中认证异常的处理方式的相关知识，参见 [三层兜底重试机制](./02-三层兜底重试机制.md)