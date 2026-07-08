---
author: XunZong
created: 2026-07-08
tags: []
aliases: []
---
# MySQL 相关知识（RAG）
## MySQL 问答流程

- 1. 高频问答数据来源？
	- 系统上线以后，积累了大量的用户会话数据。每周统计一次高频问答数据，次数超过 50 次，作为候选 FAQ 业务人员确认以后，更新到高频问答对的表中。
- 2. 统计方法
	- 问题向量化，kmeans 算法聚类，人工确认数据
- 3. 高频问答数据规模
	- 几十到几百
- 4. MySQL 中存了哪些数据
	- 高频问答对
	- 用户的会话，（用户的问答）
	- 用户的个人信息
- 5. redis 中包含哪些数据
	- 用户问过的高频问答对
	- 高频问答的问题
	- 高频问答对，问题分词数据
- 初始化的过程
	- 先从 redis 中获取高频问答的问题和问题的分词数据
	- 如果过没有就从 MySQL 中获取原始问题
	- 对原始问题进行分词，把原始问题和问题的分词数据分别写入 redis 中
- BM25 计算的结果
	- 计算 query 与所有的高频问答对的问题，相关性得分
	- 使用 softmax 对所有的得分进行归一化
	- 筛选出最高分

## MySQL 使用注意事项
- 1. 不要手动格式化 SQL 语句，会有 SQL 注入的风险
- 2. 插入数据的时候，一定要考虑 Rollback 回滚，可能存在重复写入的情况
- 3. 写入数据的时候，针对数据量比较大，例如超过 1000 条，考虑批量写入。

## MySQL 问答流程（代码版）
- 1. 从 redis 中获取缓存问答对
```python
cached_answer = self.redis_client.get_answer(query)
if cached_answer:
	# 返回缓存答案
	return cached_answer, False
```

- 2. 计算 BM25 结果
```python
# 分词查询
query_tokens = preprocess_text(query)
# 计算BM25分数
socres = self.bm25.get_scores(query_tokens)
```

- 3. 从 MySQL 中获取答案
```python
# 获取原始问题
original_question = slef.original_questions[best_idx]
# 获取答案
answer = self.mysql_client.fetch_answer(original_question)
```

- 4. 将获取的答案回写 redis，方便下一次查询
```python
# 缓存答案
self.redis_client.set_data(f"answer:{query}",answer)
```

## MySQL 问答系统问题处理
- 1. 环境问题，安装包版本问题
	- 手动调整版本，不行的话。根据依赖文件重新安装
	- 建议使用 uv
- 2. 使用高频问答对的问题作为 query，相似度的分数为 0.5，0.333，0.25 等
	- 原因：MySQL 中数据重复写入了
	- 解决：
		- MySQL 删表，重写一次。保证 MySQL 没有重复数据
		- 清空 redis
- 3. 过了几分钟，无法回答
	- 重新创建的 MySQL 服务，存在数据库断连
