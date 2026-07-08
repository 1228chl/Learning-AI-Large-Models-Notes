---
author: XunZong
created: 2026-07-08
tags:
  - Milvus
  - SQL
aliases:
  - 向量数据库
---

# Milvus向量数据库

## 一、Milvus 概述【知道】

Milvus 是一款开源向量数据库（2019 年），专门用于【**存储、索引和管理**】大规模嵌入向量。支持亿万级别向量索引，底层设计用于处理从非结构化数据转换而来的嵌入向量。

### 非结构化数据处理流程

```
非结构化数据（图片/文本/音频，约占全球数据80%）
→ 通过AI/ML模型做Embedding → 转为浮点数向量数组
→ 存入Milvus → 通过向量相似度搜索找到相关数据
```

向量相似度搜索：两个嵌入向量越相似，意味着【补充：原始数据源也越相似】。

### 传统数据库 vs 向量数据库

| | 传统数据库（MySQL） | 向量数据库（Milvus） |
|------|------|------|
| 数据形态 | 【结构化数据】 | 【非结构化数据的嵌入向量】 |
| 查询方式 | 主要精确匹配（= `value`） | 【近似相似度搜索】 |
| 对应关系 | Table ↔ Field | 【Collection ↔ Field】 |

---

## 二、核心概念

### 2.1 Collection 与 Field【知道】

| 概念 | 含义 | 限制 |
|------|------|------|
| Database | 数据库，最多【补充：64】个 | - |
| Collection | 集合，类比 SQL 中的【补充：Table】 | - |
| Field | 字段，类比 SQL 中的【补充：Column】 | 一个 Collection 最多【4 个向量 Field】 |
| Entity | 实体，类比 SQL 中的【补充：Row】 | - |

### 2.2 Field Schema 关键属性【知道】

| 属性 | 说明 |
|------|------|
| `name` | 字段名 |
| `dtype` | 数据类型 |
| `is_primary` | 是主键则【补充：true】，且仅支持一个主键 |
| `auto_id` | 【补充：True】时自动生成 ID |
| `dim` | 向量维度，范围【补充：[1, 32768]】 |

### 2.3 索引类型【理解】

| 索引 | 原理 | 适用场景 |
|------|------|----------|
| 【补充：FLAT】 | 暴力搜索，100% 精确 | 小规模数据集（百万级） |
| 【补充：IVF_FLAT】 | K-means 聚类 + 倒排索引 | 平衡精度与速度 |
| 【补充：IVF_SQ8】 | IVF + 标量量化压缩 | 节省内存 |
| 【补充：IVF_PQ】 | IVF + 乘积量化 | 大规模高维数据 |
| 【补充：HNSW】 | 基于图的索引 | 高搜索效率要求 |

**IFV_FLAT 核心参数 `nprobe` **：控制搜索的簇数量，增大提高精度但降低速度，减小则相反。

### 2.4 相似度度量【知道】

常用的距离，假设两个点 $x, y$ 如下：
$$
x = [x_1, x_2, \cdots, x_n] \\
y = [y_1, y_2, \cdots, y_n]
$$



#### 欧式距离

$$
L_2(x, y) = \sqrt{\sum_{i=1}^n (x_i - y_i)^2}
$$

取值范围： $[0, +\infty]$

#### 内积

$$
IP(x, y) = \sum_{i=1}^n x_i y_i
$$

取值范围： $[-\infty, +\infty]$ , 通常情况下会采用正则化，[-1, 1]

#### 余弦相似度

$$
\cos<x, y> = \frac{IP(x, y)}{||x||\cdot ||y||}
$$

取值范围: [-1, 1]

| 度量方式 | 说明 |
|----------|------|
| 【补充：L2（欧氏距离）】 | 空间直线距离，越小越相似 |
| 【补充：IP（内积）】 | 向量点积，越大越相似 |
| 【补充：COSINE（余弦相似度）】 | 方向一致性，值越大越相似 |

---## 三、Milvus 数据库的操作【知道】

### 创建数据库与建表

创建数据库

```python
[代码]
```

创建表

```python
[代码]
```



### 增删改

#### 新增实体

```python
[代码]
```

#### 删除实体

```python
[代码]
```

#### 修改实体

```python
[代码]
```

### 简单查询

#### 单向量搜索

```python
[代码]
```

#### 批量向量搜索

```python
[代码]
```

#### 分区搜索

```python
[代码]
```

#### 指定输出字段

```python
[代码]
```

#### 过滤搜索

* 前缀中缀后缀等模糊匹配

```python
[代码]
```

#### 范围搜索

![](../../../../Assets/Image/AI-Large-Modlels-Notes/Project/EduRAG/Milvus向量数据库/1.2.7.6-1.png)

```python
[代码]
```

### 复杂查询【掌握】

![](../../../../Assets/Image/AI-Large-Modlels-Notes/Project/EduRAG/Milvus向量数据库/1.2.8-1.png)

对多组 ANN 搜索结果合并重排序：

| 策略 | 用法 |
|------|------|
| 【WeightedRanker】 | 给不同向量字段分配权重，强调特定字段 |
| 【RRFRanker】 | 倒数排序融合，平衡各字段重要性 |

#### WeightedRanker
![](../../../../Assets/Image/AI-Large-Modlels-Notes/Project/EduRAG/Milvus向量数据库/1.2.8.1-1.png)
![](../../../../Assets/Image/AI-Large-Modlels-Notes/Project/EduRAG/Milvus向量数据库/1.2.8.1-2.png)

#### RRFRanker

$$  
score(d) = \sum_{i=1}^N \frac{1}{k+rank_i(d)+1}  
$$

  

- d：表示文档。  
- N：表示不同检索路径的数量。  
- ranki(d)：表示文档 *d* 在第 *i* 个检索器中的排名位置，从 0 开始计数。  
- k：是一个平滑参数，用于控制随着排名增加分数的降低速度。默认值通常设置为 60。

![](../../../../Assets/Image/AI-Large-Modlels-Notes/Project/EduRAG/Milvus向量数据库/1.2.8.2-1.png)

![](../../../../Assets/Image/AI-Large-Modlels-Notes/Project/EduRAG/Milvus向量数据库/1.2.8.2-2.png)

#### 混合检索的关键步骤

![400](../../../../Assets/Image/AI-Large-Modlels-Notes/Project/EduRAG/Milvus向量数据库/1.2.8.3-1.png)

## 四、核心要点

1. Milvus 用于存储和检索【嵌入向量（Embedding）】
    
2. 一个 Collection 最多支持【补充：4】个向量字段
    
3. 索引类型从简单到复杂：FLAT → IVF_FLAT → IVF_SQ8/PQ → HNSW
    
4. `nprobe` 参数平衡【补充：查询精度】和【补充：查询速度】
    
5. 掌握混合的检索的步骤
    

---

## 面试题

---

**Q1: FLAT 和 IVF_FLAT 的区别？**

FLAT 是【补充：暴力搜索】，遍历所有向量计算距离，100% 精确但极慢。IVF_FLAT 先用 K-means 将向量空间划分为多个簇，查询时只搜索最近几个簇，通过 `nprobe` 参数控制搜索簇数，以【补充：少量精度损失换取大幅速度提升】。

---

**Q2: 什么是 Embedding？为什么非结构化数据需要它？**

Embedding（嵌入向量）是通过深度学习模型将文本/图片/音频等非结构化数据映射为【补充：固定长度的浮点数向量】。语义相近的内容在向量空间中距离相近，使计算机能够通过数学计算理解内容的【补充：语义相似度】。这是 RAG 系统检索的基础。

---

**Q3: 余弦相似度和欧氏距离的区别？哪个更好？**

欧氏距离衡量【补充：空间绝对距离】，受向量长度影响。余弦相似度衡量【补充：方向夹角】，不受向量长度影响。在 NLP 场景中通常推荐余弦相似度，因为文本 Embedding 的方向比长度包含更多语义信息。
