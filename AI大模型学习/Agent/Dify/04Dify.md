**上一级：** [03Coze细节（课堂版）](../Coze开发/03Coze细节（课堂版）.md)

**下一级：** [[]]

**标签：** #Dify #Agent #基础

---

# Dify 与 RAGFlow 学习笔记

---

## 第一部分：安装与环境配置

### 1.1 两种安装方式

- **WSL 安装**：流程较长，但节省系统资源。  
- **虚拟机安装**：资源占用较高，要求 **硬盘 50 GB、内存 8 GB、2~4 核 CPU**。

**虚拟机安装步骤**

1. **解压虚拟机文件**  
   - 注意：解压路径中 **不要出现空格和中文**。  
![](https://raw.githubusercontent.com/1228chl/Learning-AI-Large-Models-Notes/master/Assets/Image/20260518T015853968Z.png)

2. **打开虚拟机**  
  ![](https://raw.githubusercontent.com/1228chl/Learning-AI-Large-Models-Notes/master/Assets/Image/20260518T015933012Z.png)

3. **设置内存为 8 GB**，开启虚拟机，并选择 **“我已复制该虚拟机”**  
![](https://raw.githubusercontent.com/1228chl/Learning-AI-Large-Models-Notes/master/Assets/Image/20260518T020126017Z.png)


4. **登录账号**  
   - 账号：`itheima`，密码：`123456`  
   - 或使用 root 账号：`root` / `123456`  
   ![](https://raw.githubusercontent.com/1228chl/Learning-AI-Large-Models-Notes/master/Assets/Image/20260518T020102042Z.png)

1. **使用快照 `dify 1.13` **  
   ![](https://raw.githubusercontent.com/1228chl/Learning-AI-Large-Models-Notes/master/Assets/Image/20260518T020141433Z.png)

2. **切换 root 用户**（如果登录的是普通用户）  

   ```bash
   su root
   # 输入密码
   123456
   ```

   ![](https://raw.githubusercontent.com/1228chl/Learning-AI-Large-Models-Notes/master/Assets/Image/20260518T020215401Z.png)

### 1.2 启动 Dify 与 RAGFlow

**启动 Dify**  

```bash
cd /home/itheima/dify/docker
sudo systemctl start docker
docker compose up -d
```

**启动 RAGFlow**  

```bash
cd /home/itheima/ragflow/docker
docker compose up -d
```

启动成功后，终端会显示所有容器运行状态（绿色 `Started`）。  
![](https://raw.githubusercontent.com/1228chl/Learning-AI-Large-Models-Notes/master/Assets/Image/20260518T020241036Z.png)

### 1.3 登录与注册

- **Dify**：访问 `http://192.168.88.100/install`  
  - 使用真实邮箱（如 `xxx@163.com`）  
  - 用户名：`itheima`  
  - 密码：`Aa123456`  
  - 教师示例账号：`13716877441@163.com` / `Aa123456`

- **RAGFlow**：访问 `http://192.168.88.100:8880/login`  
  - 账号：`13716877441@163.com`  
  - 密码：`123456` 或 `Aa123456`

### 1.4 连接其他同学的方法（略，根据网络环境配置）

---

## 第二部分：工作流构建

### 2.1 配置模型

进入 Dify 后台，首先配置模型提供商。  
![](https://raw.githubusercontent.com/1228chl/Learning-AI-Large-Models-Notes/master/Assets/Image/20260518T020343806Z.png)
若未显示待配置列表，请**刷新页面**。

![](https://raw.githubusercontent.com/1228chl/Learning-AI-Large-Models-Notes/master/Assets/Image/20260518T020352618Z.png)
可以配置**默认模型**：  

- 系统推理模型：`qwen3.6-flash-2026-04-16 (Qwen3.6) CHAT`  
- Embedding 模型：`multimodal-embedding-v1`  
- Rerank 模型：`qwen3-rerank`  
- 语音转文本：`paraformer-realtime-v2`  
- 文本转语音：`qwen3-tts-flash`  

![](https://raw.githubusercontent.com/1228chl/Learning-AI-Large-Models-Notes/master/Assets/Image/20260518T020401902Z.png)

### 2.2 创建空白应用

![](https://raw.githubusercontent.com/1228chl/Learning-AI-Large-Models-Notes/master/Assets/Image/20260518T020413383Z.png)
![](https://raw.githubusercontent.com/1228chl/Learning-AI-Large-Models-Notes/master/Assets/Image/20260518T020420068Z.png)
![](https://raw.githubusercontent.com/1228chl/Learning-AI-Large-Models-Notes/master/Assets/Image/20260518T020427242Z.png)

---

## 第三部分：Coze 与 Dify 的区别

| 维度 | Coze | Dify |
|------|------|------|
| 相同点 | 低代码平台，拖拽式构建 Agent / 应用 | 相同 |
| 适用场景 | 求快、求简单、个人/轻量级项目 | 保密数据、企业级、强定制化、二次开发 |
| 数据安全 | 云端 SaaS | 支持私有化部署（本地/虚拟机） |
| 扩展性 | 有限 | 更强，开源可自研 |

> **简单总结**：**快、简单 → Coze；强、复杂、保密 → Dify**

---

## 第四部分：微调入门

### 4.1 什么是微调

微调前后，**相同的用户输入**，模型输出词的概率分布会发生变化。  
![](https://raw.githubusercontent.com/1228chl/Learning-AI-Large-Models-Notes/master/Assets/Image/20260518T020444285Z.png)
![](https://raw.githubusercontent.com/1228chl/Learning-AI-Large-Models-Notes/master/Assets/Image/20260518T020556874Z.png)

### 4.2 微调语料的基本形式

语料由三个角色组成：**系统**、**用户**、**助手**。  
数据量通常在 **2000~20000 条**之间，从几千条开始尝试，效果不好再增加数据或清洗质量。

示例格式：

```json
{
  "messages": [
    {"role": "system", "content": "你是当代大儒"},
    {"role": "user", "content": "应该怎么学习？"},
    {"role": "assistant", "content": "贤贤易色；事父母，能竭其力；事君，能致其身；与朋友交，言而有信。虽曰未学，吾必谓之学矣。"}
  ]
}
```

### 4.3 工作流的构成（节点、边、变量传递）

---

## 第五部分：RAG 与知识库（核心技术详解）

### 5.1 全文检索（关键词检索）

全文检索的核心是 **倒排索引** 和 **BM 25 排序**。  
`[此处插入图片：image16，全文检索示意图]`
![](https://raw.githubusercontent.com/1228chl/Learning-AI-Large-Models-Notes/master/Assets/Image/20260518T020618157Z.png)
#### 5.1.1 中文分词（jieba）

```python
import jieba

# 普通分词（更粗粒度）
print(list(jieba.cut("我爱北京天安门")))
# 输出：['我', '爱', '北京', '天安门']

# 搜索优化分词（更细粒度，提高召回）
print(list(jieba.cut_for_search("我爱北京天安门")))
# 输出：['我', '爱', '北京', '天安', '天安门']
```

- `cut` / `lcut`：生成器/列表，普通分词  
- `cut_for_search` / `lcut_for_search`：生成器/列表，搜索优化（分词更细）

#### 5.1.2 倒排索引构建示例

```python
from collections import defaultdict

def build_inverted_index(documents):
    inverted_index = defaultdict(lambda: {
        "doc_ids": set(),
        "tf": defaultdict(int),
        "positions": defaultdict(list)
    })
    for doc_id, text in documents.items():
        tokens = list(jieba.cut_for_search(text))
        for pos, token in enumerate(tokens):
            inverted_index[token]["doc_ids"].add(doc_id)
            inverted_index[token]["tf"][doc_id] += 1
            inverted_index[token]["positions"][doc_id].append(pos)
    return inverted_index
```

`[此处插入图片：image17，倒排索引构建示意图]`

#### 5.1.3 TF‑IDF 详解

- **TF（词频）**：`TF(词,文档) = (词在文档中出现的次数) / (文档总词数)`
- **IDF（逆文档频率）**：`IDF(词) = log( 总文档数 / (包含该词的文档数 + 1) )`
- **TF‑IDF** = TF × IDF

> 特点：词在文档中频次越高越重要；在所有文档中出现越少越独特。

#### 5.1.4 BM 25 算法（重点）

TF‑IDF 没有上限且对长文档不友好，BM 25 对其做了 **词频抑制** 和 **文档长度抑制**。

**BM 25 评分公式**：

$$
score(D, Q) = Σ_{i=1}^{n} idf(t_i) × \frac{f(t_i, D) × (k1+1)}{f(t_i, D) + k1×(1 - b + b×|D|/avgdl)}
$$

- `f(t_i, D)`：词 t_i 在文档 D 中的词频  
- `|D|`：文档 D 的长度（词数）  
- `avgdl`：所有文档的平均长度  
- `k1`（默认 1.2）：词频饱和因子  
- `b`（默认 0.75）：长度归一化因子  
- $idf(t_i) = \log(1 + (N - n(t_i) + 0.5)/(n(t_i) + 0.5))$ 

**BM 25 的优势**：通过分母中的抑制项，避免高频词和长文档得分过高，排序更合理。

`[此处插入图片：image18，BM25 公式图示]`  
`[此处插入图片：image19，BM25 与 TF‑IDF 对比]`

---

### 5.2 语义检索（向量检索）

将文本转换成**稠密向量**（Embedding），通过**余弦相似度**计算语义相似性。

- **相似度阈值参考**：
  - < 0.3：弱相似
  - 0.3 ~ 0.6：比较相似
  - 0.6 ~ 0.8：非常相似

  - > 0.8：语义几乎相同

`[此处插入图片：image20，向量空间示意]`  
`[此处插入图片：image21，二维向量示例（喜欢/睡觉维度）]`

> 语义检索能捕捉同义词、隐含意图，但无法精确匹配关键词。

---

### 5.3 混合检索

将 **全文检索（关键词）** 和 **语义检索（向量）** 的结果合并：

1. 分别用两种方式召回多个分段
2. 去重
3. 可配置权重（如 0.5×全文分 + 0.5×向量分）或使用 **Rerank 模型** 重新排序
4. 取 Top‑N 分段作为上下文输入大模型

`[此处插入图片：image22，混合检索流程图]`

**优点**：结合精确匹配与意图理解，兼顾召回率与准确率。

---

### 5.4 RAG 整体架构

- **离线部分**：文档 → 分段 → 向量化 → 存入向量库（如 Milvus）
- **在线部分**：用户问题 → 向量化 → 检索相似分段 → 增强提示 → LLM 生成答案

**知识库** = RAG 中的离线向量库。

`[此处插入图片：image23，RAG 离线/在线架构]`

---

## 第六部分：Dify 知识库构建

### 6.1 分段设置（Chunking）

1. **通用设置**：固定长度切分，可设置重叠率（10%~25%），与 Coze 类似。
2. **QA 分块**：适合 FAQ 场景，问答对独立存储。
3. **父子块**：
   - **父块**：提供给模型的长上下文（如 100 字）
   - **子块**：父块再切分，用于检索（向量化或关键词匹配）
   - 流程：问题匹配子块 → 关联父块 → 合并去重

`[此处插入图片：image24，父子块切分示意图]`
![](https://raw.githubusercontent.com/1228chl/Learning-AI-Large-Models-Notes/master/Assets/Image/20260518T021257107Z.png)
### 6.2 索引方式

- **高质量索引**：使用 Embedding 模型对每个块生成向量
- **经济索引**：每段只提取 10 个关键词作为索引

### 6.3 检索方式

Dify 内置三种检索类型：

1. 全文检索（关键词 / BM 25）
2. 向量检索（语义 / 余弦相似度）
3. 混合检索（全文 + 向量，可调权或 Rerank）

### 6.4 RAG 评估工具（了解）

- **RAGAS**：用于评估 RAG 系统的指标（ faithfulness, context_relevancy, answer_relevancy 等），仅需了解概念。

---

## 第七部分：RAGFlow 知识库（增强型）

### 7.1 RAGFlow 比 Dify 知识库强大的地方

- **深度文档理解（DeepDoc）**：
  - 视觉处理：OCR、布局识别、表格结构识别
  - 解析器：处理图像、PDF、复杂表格
- 能从复杂格式的非结构化数据中提取信息
- 文本切片过程**可视化**，支持手动调整
- 可为不同类型文档选择对应的解析器

`[此处插入图片：image25，DeepDoc 处理示例]`
![](https://raw.githubusercontent.com/1228chl/Learning-AI-Large-Models-Notes/master/Assets/Image/20260518T021317118Z.png)
### 7.2 构建知识库的参数设置

1. 设置 PDF 文档解析器及切分方法  
   `[此处插入图片：image26，解析器设置界面]`
![](https://raw.githubusercontent.com/1228chl/Learning-AI-Large-Models-Notes/master/Assets/Image/20260518T021339784Z.png)
2. 召回增强：**RAPTOR 策略**（了解）  
   `[此处插入图片：image27，RAPTOR 设置]`
![](https://raw.githubusercontent.com/1228chl/Learning-AI-Large-Models-Notes/master/Assets/Image/20260518T021356416Z.png)
3. 知识图谱（了解）：
   - 实体类型、实体归一化、社区报告生成  
   `[此处插入图片：image28，知识图谱提取界面]`  
![](https://raw.githubusercontent.com/1228chl/Learning-AI-Large-Models-Notes/master/Assets/Image/20260518T021410438Z.png)
   `[此处插入图片：image29，实体归一化与社区报告]`
   ![](https://raw.githubusercontent.com/1228chl/Learning-AI-Large-Models-Notes/master/Assets/Image/20260518T021423381Z.png)

---

## 第八部分：Dify 连接 RAGFlow 外部知识库

步骤：

1. **获取 RAGFlow 的 API Key 和服务器地址**  
   `[此处插入图片：image30，API Key 获取]`
![](https://raw.githubusercontent.com/1228chl/Learning-AI-Large-Models-Notes/master/Assets/Image/20260518T021436554Z.png)
2. **获取 RAGFlow 中知识库的 ID**  
   `[此处插入图片：image31，知识库 ID 位置]`
![](https://raw.githubusercontent.com/1228chl/Learning-AI-Large-Models-Notes/master/Assets/Image/20260518T021446748Z.png)
3. **在 Dify 中新建外部知识库**：
   - 虚拟机版 RAGFlow：地址 `http://192.168.88.100:8880/api/v1/dify`
   - WSL 版 RAGFlow：地址 `http://{本机 ip}:8880/api/v1/dify`（ip 用 `ipconfig` 查询）
   ![](https://raw.githubusercontent.com/1228chl/Learning-AI-Large-Models-Notes/master/Assets/Image/20260518T021530727Z.png)
1. **填入知识库 ID，连接**  
   `[此处插入图片：image33，连接成功界面]`
![](https://raw.githubusercontent.com/1228chl/Learning-AI-Large-Models-Notes/master/Assets/Image/20260518T021552171Z.png)

连接后，外部知识库的使用方式与 Dify 内置知识库完全相同。

---

## 第九部分：知识库总结（对比）

| 维度 | Dify 内置知识库 | RAGFlow 知识库（外部） |
|------|----------------|------------------------|
| 部署方式 | 集成在 Dify 中 | 独立服务，需单独部署 |
| 文档解析 | 基础解析 | DeepDoc（OCR、布局、表格） |
| 切片可视化 | 不支持 | 支持，可手动调整 |
| 知识图谱 | 不支持 | 支持实体提取、归一化、社区报告 |
| 适用场景 | 常规文本、简单 PDF | 扫描件、复杂表格、多栏文档 |

---

## 第十部分：实战项目要求

项目设计需满足以下要点：

1. **企业级高度**：包含  
   - 业务痛点  
   - 需提升的指标  
   - 目标受众  
   - 预期收益  
   - 理论上可推广  
   - 技术选型理由  

2. **交付物**：  
   - 项目文档 + 技术文档（可合一，但必须涵盖第 1 点）  

1. **评判标准**：严格按照第 1 条打分。  

2. **禁止使用大模型直接生成**：若发现解释不通立即打回。  

3. **业务方向**：自由选择。  

4. **团队要求**：组员、组名、口号。  

5. **最终提交**：  
   - 技术文档  
   - PPT（不超过 10 页）  

8. **评分**：  
   - 老师评分：50%  
   - 同学互评：50%  

`[此处插入图片：实战案例参考布局]`

---

*笔记结束。所有 `[此处插入图片：...]` 标记处请根据课程提供的具体截图进行插入。*
