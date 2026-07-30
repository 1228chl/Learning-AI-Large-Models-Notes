---
author: "XunZong"
created: "2026-07-30"
tags: ["工程实践", "Vue3", "SSE", "JWT", "前端集成", "Element Plus", "Pinia"]
aliases: ["Vue3前端集成", "SSE前端处理", "JWT鉴权流程", "Element Plus", "Pinia状态管理"]
---

# Vue3 前端 SSE 与 JWT 全栈集成

## 定义

EduAgent 前端基于 Vue 3 + Vite 5 + Element Plus 构建，通过**双通道通信**（Axios 代理 + SSE 直连）与 FastAPI 后端交互，实现 JWT 鉴权、SSE 流式事件处理和角色驱动的 UI 权限控制。前端不是后端的附属品，而是独立的应用层——负责管理登录态、处理 SSE 事件流、渲染 AI 回复的 Markdown 代码块和引导卡片。

## 前端技术栈

| 层次 | 技术 | 作用 |
|------|------|------|
| 框架 | Vue 3 + Composition API | 响应式 UI，`<script setup>` 语法 |
| UI 组件库 | Element Plus | 表单、弹窗、侧边栏、表格、消息提示 |
| HTTP 客户端 | Axios | 封装非流式 API（请求/响应拦截器注入 JWT） |
| 状态管理 | Pinia | 全局存储 token、user、role |
| 路由 | Vue Router 4 | SPA 页面切换 + beforeEach 鉴权守卫 |
| 构建工具 | Vite 5 | 开发服务器(:3000) + 反向代理 `/api` → `:8000` |
| 内容渲染 | markdown-it + highlight.js | AI 回复中代码块的语法高亮渲染 |

## 双通道通信架构

```python
用户浏览器 (:3000)
    │
    ├── 普通请求 ── Vite Proxy ──→ FastAPI (:8000)
    │   （登录、上传、查询、轮询）    Axios baseURL=/api/v1 → proxy → :8000/api/v1
    │
    └── SSE 流式请求 ── 直连 :8000（绕过 Proxy）
        （QA 流式回答、面试对话）    fetch(VITE_API_BASE_URL + /api/v1/...) 
```

SSE 不经过 Vite Proxy 的关键原因：Vite Proxy 基于 Node.js HTTP 代理，默认缓冲整个响应体再转发，导致 `data:` 事件帧被批量堆积，前端无法实时看到 token 逐字输出。

## JWT 鉴权全流程

```javascript
// src/api/client.ts — Axios 实例配置
const apiClient = axios.create({
  baseURL: '/api/v1',                         // 全部走 Vite Proxy
  timeout: 30000,
})

// 请求拦截器：自动注入 JWT token
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 响应拦截器：401 自动登出
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      authStore.logout()                       // 清 store + localStorage
      router.push('/login')                    // 跳转登录页
    }
    return Promise.reject(error)
  }
)
```

## SSE 事件处理前端实现

```javascript
// 前端监听 8 种 SSE 事件类型，每种有独立的 UI 行为
const eventSource = new EventSource(`${apiBaseUrl}/api/v1/qa/chat/stream?session_id=${sid}`)

eventSource.addEventListener('token', (e) => {
  // typewriter：逐字追加到当前气泡
  currentBubble.value += JSON.parse(e.data).content
})

eventSource.addEventListener('meta', (e) => {
  // 显示引用来源卡片
  const { pattern, sources } = JSON.parse(e.data)
  showSourcesCard(sources)
})

eventSource.addEventListener('guidance', (e) => {
  // 导航卡片：引导用户跳转到对应功能页
  const { target, message } = JSON.parse(e.data)
  showNavigationCard(target, message)
})

eventSource.addEventListener('done', () => {
  loading.value = false                        // 结束加载状态
  eventSource.close()                          // 关闭 SSE 连接
})

eventSource.addEventListener('error', (e) => {
  showErrorBubble('服务异常，请稍后重试')
  eventSource.close()
})
```

## 角色驱动 UI 权限

| 角色 | 可见功能 | 侧边栏入口 |
|------|---------|-----------|
| student | QA、试卷批改、简历审查、模拟面试 | 学员端全部功能 |
| teacher | 以上全部 + 试卷批改确认 + 知识库管理 | 额外显示 "教师端" 分组 |
| admin | 全部功能 | 全量入口 |

```javascript
// Vue Router 导航守卫
router.beforeEach((to, from, next) => {
  const auth = useAuthStore()
  if (!auth.token && to.path !== '/login') {
    next('/login')                              // 未登录 → 跳登录
  } else if (to.meta.role && to.meta.role !== auth.user?.role) {
    next('/dashboard')                          // 无权限 → 回首页
  } else {
    next()
  }
})
```

## AI/ML 工程应用场景

| 应用场景 | 前端技术要点 | 说明 |
|---------|------------|------|
| AI 对话流式 UI | SSE EventSource + token 逐字渲染 | 所有需要 LLM 流式输出的场景 |
| 文件上传 + 轮询状态 | UploadFile + 202 轮询 | 简历/试卷上传后异步处理的进度展示 |
| 多角色 SaaS 平台 | Pinia 角色字段 + 路由守卫 | 学生/教师/管理员分权 UI |
| Markdown 科学文档渲染 | markdown-it + highlight.js + LaTeX | AI 回复中的公式和代码块 |

## 面试追问

**Q1（基础）**：EduAgent 前端使用哪些核心技术？各自负责什么？

**回答要点**：

1. Vue 3 Composition API——响应式 UI 框架，组件化构建页面
2. Element Plus——UI 组件库，提供表单/表格/弹窗/导航等开箱即用组件
3. Axios——HTTP 客户端，封装所有非流式 API 请求，拦截器处理 JWT 和 401
4. Pinia——全局状态管理（token、user、role），跨组件共享登录态
5. Vue Router——SPA 路由 + beforeEach 鉴权守卫

**Q2（深挖）**：为什么 SSE 流式请求要绕过 Vite Proxy 直连后端？绕过后端需要配置什么？

**回答要点**：

1. Vite Proxy 基于 Node.js 默认缓冲完整响应再转发，SSE 的 `data:` 帧被批量堆积，前端无法逐字渲染
2. 解决方案：前端 `fetch` 直连 `http://localhost:8000`，不经过 Vite Proxy
3. 配置：`.env.local` 中设置 `VITE_API_BASE_URL=http://localhost:8000`
4. 直连需要后端配置 CORS（FastAPI 的 `CORSMiddleware` allow_origins 包含 localhost:3000）

**Q3（实战）**：JWT token 存 localStorage 有什么安全风险？生产环境中如何改进？

**回答要点**：

1. localStorage 可被 XSS 攻击读取（若前端有注入漏洞，攻击者可窃取 token）
2. 改进方案：httpOnly cookie——token 由服务端 Set-Cookie 下发，JS 不可读，自动随请求发送
3. 结合 CSRF token：服务端下发 CSRF token，前端在请求头中携带，防止跨站请求伪造
4. 短期方案：token 有效期设短（15 分钟），用 refresh_token 续期，refresh_token 存 httpOnly cookie

**Q4（边界）**：前端如何处理 SSE 连接中断（网络断开、后端重启）？用户在一个长面试对话中突然断网会怎样？

**回答要点**：

1. EventSource API 内置自动重连机制——连接断开后浏览器自动尝试重连
2. 重连间隔由后端通过 `retry:` 字段控制（默认约 3 秒）
3. 面试场景：断网期间用户输入暂存本地，重连后通过同一 thread_id 恢复 State
4. 长时间断连（>5 分钟）：前端监听 `error` 事件中 `eventSource.readyState === CLOSED`，显示 "连接已断开" 提示并提供手动重试按钮

## 参考引用

- 需要理解 SSE 流式输出技术的服务端实现和协议细节：[SSE 流式输出](../网络/10-WebSocket与SSE流式输出.md)
- 需要理解 FastAPI 的后端 API 设计和 CORS 配置：[FastAPI 高级特性](../部署/09-FastAPI高级特性.md)
- 需要理解 JWT 认证的服务端实现（签发、校验、过期处理）：[JWT 认证与 bcrypt 密码安全](../../AI-Agent/工程实践/04-JWT认证与bcrypt密码安全.md)
- 需要理解统一入口的 SSE 事件分发和 unified_chat 路由：[多 Agent 系统集成统一入口](../../AI-Agent/系统/42-多Agent系统集成统一入口与SSE路由.md)
- 需要理解 HTTP 基础协议中的状态码（202 Accepted、401 Unauthorized）：[HTTP 基础](../网络/08-HTTP基础与RESTful.md)
