#!/usr/bin/env python3
"""Restructure Atomic-Cards into subdirectories and fix all links."""
import os, shutil, re, sys
sys.stdout.reconfigure(encoding='utf-8')

BASE = "G:/AI-Learning/Atomic-Cards"
os.chdir(BASE)

move_map = {
    "线性代数/01-向量基础.md": "线性代数/向量/01-向量基础.md",
    "线性代数/02-向量空间与线性空间.md": "线性代数/向量/02-向量空间与线性空间.md",
    "线性代数/12-向量范数.md": "线性代数/向量/12-向量范数.md",
    "线性代数/13-点积与余弦相似度.md": "线性代数/向量/13-点积与余弦相似度.md",
    "线性代数/14-距离度量.md": "线性代数/向量/14-距离度量.md",
    "线性代数/15-正交与投影.md": "线性代数/向量/15-正交与投影.md",
    "线性代数/03-矩阵基础.md": "线性代数/矩阵/03-矩阵基础.md",
    "线性代数/04-矩阵乘法.md": "线性代数/矩阵/04-矩阵乘法.md",
    "线性代数/05-特殊矩阵.md": "线性代数/矩阵/05-特殊矩阵.md",
    "线性代数/06-线性变换.md": "线性代数/矩阵/06-线性变换.md",
    "线性代数/07-行列式.md": "线性代数/矩阵/07-行列式.md",
    "线性代数/08-逆矩阵.md": "线性代数/矩阵/08-逆矩阵.md",
    "线性代数/09-特征值与特征向量.md": "线性代数/特征分解/09-特征值与特征向量.md",
    "线性代数/10-特征值分解.md": "线性代数/特征分解/10-特征值分解.md",
    "线性代数/11-奇异值分解.md": "线性代数/特征分解/11-奇异值分解.md",
    "线性代数/16-正定矩阵与二次型.md": "线性代数/特征分解/16-正定矩阵与二次型.md",
    "线性代数/17-线性方程组与矩阵分解.md": "线性代数/特征分解/17-线性方程组与矩阵分解.md",
    "线性代数/18-线性代数与神经网络的连接.md": "线性代数/应用/18-线性代数与神经网络的连接.md",
    "Python/01-类与对象.md": "Python/OOP/01-类与对象.md",
    "Python/02-继承与多态.md": "Python/OOP/02-继承与多态.md",
    "Python/11-封装(Encapsulation).md": "Python/OOP/11-封装(Encapsulation).md",
    "Python/12-继承与MRO.md": "Python/OOP/12-继承与MRO.md",
    "Python/13-多态与鸭子类型.md": "Python/OOP/13-多态与鸭子类型.md",
    "Python/06-进程与线程.md": "Python/并发/06-进程与线程.md",
    "Python/10-协程与asyncio.md": "Python/并发/10-协程与asyncio.md",
    "Python/14-进程与多进程.md": "Python/并发/14-进程与多进程.md",
    "Python/15-线程与GIL.md": "Python/并发/15-线程与GIL.md",
    "Python/03-装饰器.md": "Python/工具/03-装饰器.md",
    "Python/04-迭代器与生成器.md": "Python/工具/04-迭代器与生成器.md",
    "Python/05-上下文管理器.md": "Python/工具/05-上下文管理器.md",
    "Python/07-正则表达式.md": "Python/工具/07-正则表达式.md",
    "Python/08-深浅拷贝.md": "Python/工具/08-深浅拷贝.md",
    "Python/09-Socket网络编程.md": "Python/工具/09-Socket网络编程.md",
    "数据库/01-SQL基础与数据库设计.md": "数据库/SQL/01-SQL基础与数据库设计.md",
    "数据库/02-MySQL核心操作.md": "数据库/SQL/02-MySQL核心操作.md",
    "数据库/03-MySQL高级特性.md": "数据库/SQL/03-MySQL高级特性.md",
    "数据库/04-PyMySQL模块.md": "数据库/SQL/04-PyMySQL模块.md",
    "数据库/05-Redis核心数据结构.md": "数据库/Redis/05-Redis核心数据结构.md",
    "数据库/06-Redis高级应用.md": "数据库/Redis/06-Redis高级应用.md",
    "数据库/07-向量数据库概述.md": "数据库/Milvus/07-向量数据库概述.md",
    "数据库/08-Milvus核心概念.md": "数据库/Milvus/08-Milvus核心概念.md",
    "数据库/09-Milvus Python操作指南.md": "数据库/Milvus/09-Milvus Python操作指南.md",
    "数据库/12-RAG向量库Collection设计.md": "数据库/Milvus/12-RAG向量库Collection设计.md",
    "数据库/17-Milvus集合创建与字段设计.md": "数据库/Milvus/17-Milvus集合创建与字段设计.md",
    "数据库/18-分块文档存储到Milvus.md": "数据库/Milvus/18-分块文档存储到Milvus.md",
    "数据库/10-嵌入与向量化.md": "数据库/检索/10-嵌入与向量化.md",
    "数据库/11-混合检索与重排序.md": "数据库/检索/11-混合检索与重排序.md",
    "数据库/13-TF-IDF算法.md": "数据库/检索/13-TF-IDF算法.md",
    "数据库/14-RRF排序器与加权排序.md": "数据库/检索/14-RRF排序器与加权排序.md",
    "数据库/15-BGE-M3与BGE-Reranker模型.md": "数据库/检索/15-BGE-M3与BGE-Reranker模型.md",
    "数据库/16-稠密向量与稀疏向量.md": "数据库/检索/16-稠密向量与稀疏向量.md",
    "数据结构与算法/01-算法复杂度分析.md": "数据结构与算法/基础结构/01-算法复杂度分析.md",
    "数据结构与算法/02-数组与动态数组.md": "数据结构与算法/基础结构/02-数组与动态数组.md",
    "数据结构与算法/03-链表.md": "数据结构与算法/基础结构/03-链表.md",
    "数据结构与算法/04-栈.md": "数据结构与算法/基础结构/04-栈.md",
    "数据结构与算法/05-队列.md": "数据结构与算法/基础结构/05-队列.md",
    "数据结构与算法/06-哈希表.md": "数据结构与算法/基础结构/06-哈希表.md",
    "数据结构与算法/07-树与二叉树.md": "数据结构与算法/树堆图/07-树与二叉树.md",
    "数据结构与算法/08-堆.md": "数据结构与算法/树堆图/08-堆.md",
    "数据结构与算法/09-图.md": "数据结构与算法/树堆图/09-图.md",
    "数据结构与算法/10-排序算法.md": "数据结构与算法/算法/10-排序算法.md",
    "数据结构与算法/11-搜索算法.md": "数据结构与算法/算法/11-搜索算法.md",
    "数据结构与算法/12-递归与分治.md": "数据结构与算法/算法/12-递归与分治.md",
    "数据结构与算法/13-动态规划.md": "数据结构与算法/算法/13-动态规划.md",
    "数据结构与算法/14-回溯算法.md": "数据结构与算法/算法/14-回溯算法.md",
    "数据结构与算法/15-贪心算法.md": "数据结构与算法/算法/15-贪心算法.md",
    "机器学习/01-机器学习概述.md": "机器学习/基础/01-机器学习概述.md",
    "机器学习/02-监督学习与非监督学习.md": "机器学习/基础/02-监督学习与非监督学习.md",
    "机器学习/03-数据集划分与交叉验证.md": "机器学习/基础/03-数据集划分与交叉验证.md",
    "机器学习/04-评估指标.md": "机器学习/基础/04-评估指标.md",
    "机器学习/05-过拟合与欠拟合.md": "机器学习/基础/05-过拟合与欠拟合.md",
    "机器学习/06-线性回归.md": "机器学习/监督学习/06-线性回归.md",
    "机器学习/07-逻辑回归.md": "机器学习/监督学习/07-逻辑回归.md",
    "机器学习/08-KNN算法.md": "机器学习/监督学习/08-KNN算法.md",
    "机器学习/09-朴素贝叶斯.md": "机器学习/监督学习/09-朴素贝叶斯.md",
    "机器学习/10-支持向量机.md": "机器学习/监督学习/10-支持向量机.md",
    "机器学习/11-决策树.md": "机器学习/监督学习/11-决策树.md",
    "机器学习/12-集成学习.md": "机器学习/集成学习/12-集成学习.md",
    "机器学习/13-随机森林.md": "机器学习/集成学习/13-随机森林.md",
    "机器学习/14-梯度提升机.md": "机器学习/集成学习/14-梯度提升机.md",
    "机器学习/26-Bagging.md": "机器学习/集成学习/26-Bagging.md",
    "机器学习/27-Boosting.md": "机器学习/集成学习/27-Boosting.md",
    "机器学习/28-Stacking.md": "机器学习/集成学习/28-Stacking.md",
    "机器学习/15-K-means聚类.md": "机器学习/聚类/15-K-means聚类.md",
    "机器学习/16-层次聚类与DBSCAN.md": "机器学习/聚类/16-层次聚类与DBSCAN.md",
    "机器学习/24-DBSCAN密度聚类.md": "机器学习/聚类/24-DBSCAN密度聚类.md",
    "机器学习/25-层次聚类.md": "机器学习/聚类/25-层次聚类.md",
    "机器学习/17-PCA与降维.md": "机器学习/降维/17-PCA与降维.md",
    "机器学习/29-PCA主成分分析.md": "机器学习/降维/29-PCA主成分分析.md",
    "机器学习/30-t-SNE与UMAP非线性降维.md": "机器学习/降维/30-t-SNE与UMAP非线性降维.md",
    "机器学习/18-特征工程.md": "机器学习/特征工程/18-特征工程.md",
    "机器学习/19-模型选择与超参数调优.md": "机器学习/特征工程/19-模型选择与超参数调优.md",
    "机器学习/20-正则化.md": "机器学习/正则化/20-正则化.md",
    "机器学习/21-L2正则化(Ridge).md": "机器学习/正则化/21-L2正则化(Ridge).md",
    "机器学习/22-L1正则化(Lasso).md": "机器学习/正则化/22-L1正则化(Lasso).md",
    "机器学习/23-ElasticNet正则化.md": "机器学习/正则化/23-ElasticNet正则化.md",
    "机器学习/31-LLM评估指标.md": "机器学习/LLM评估/31-LLM评估指标.md",
    "深度学习/01-感知机与多层神经网络.md": "深度学习/基础/01-感知机与多层神经网络.md",
    "深度学习/02-激活函数.md": "深度学习/基础/02-激活函数.md",
    "深度学习/03-损失函数.md": "深度学习/基础/03-损失函数.md",
    "深度学习/04-反向传播算法.md": "深度学习/基础/04-反向传播算法.md",
    "深度学习/05-权重初始化策略.md": "深度学习/基础/05-权重初始化策略.md",
    "深度学习/06-梯度消失与梯度爆炸.md": "深度学习/基础/06-梯度消失与梯度爆炸.md",
    "深度学习/07-PyTorch张量与运算.md": "深度学习/PyTorch/07-PyTorch张量与运算.md",
    "深度学习/08-自动微分机制.md": "深度学习/PyTorch/08-自动微分机制.md",
    "深度学习/09-卷积运算.md": "深度学习/CNN-RNN/09-卷积运算.md",
    "深度学习/10-池化层.md": "深度学习/CNN-RNN/10-池化层.md",
    "深度学习/11-RNN与序列建模.md": "深度学习/CNN-RNN/11-RNN与序列建模.md",
    "深度学习/12-LSTM与门控机制.md": "深度学习/CNN-RNN/12-LSTM与门控机制.md",
    "深度学习/13-GRU.md": "深度学习/CNN-RNN/13-GRU.md",
    "深度学习/14-知识蒸馏详解.md": "深度学习/模型压缩/14-知识蒸馏详解.md",
    "深度学习/15-模型压缩量化剪枝蒸馏.md": "深度学习/模型压缩/15-模型压缩量化剪枝蒸馏.md",
    "深度学习/16-光滑损失函数.md": "深度学习/模型压缩/16-光滑损失函数.md",
    "深度学习/19-模型量化(Quantization).md": "深度学习/模型压缩/19-模型量化(Quantization).md",
    "深度学习/20-模型剪枝(Pruning).md": "深度学习/模型压缩/20-模型剪枝(Pruning).md",
    "深度学习/21-知识蒸馏(Distillation).md": "深度学习/模型压缩/21-知识蒸馏(Distillation).md",
    "深度学习/17-迁移学习与微调.md": "深度学习/迁移学习/17-迁移学习与微调.md",
    "深度学习/18-迁移学习与微调(TransferLearning).md": "深度学习/迁移学习/18-迁移学习与微调(TransferLearning).md",
    "深度学习/22-语言模型发展史.md": "深度学习/LLM/22-语言模型发展史.md",
    "深度学习/23-Scaling Law与涌现能力.md": "深度学习/LLM/23-Scaling Law与涌现能力.md",
    "NLP/01-分词算法.md": "NLP/基础/01-分词算法.md",
    "NLP/02-词嵌入与分布式表示.md": "NLP/基础/02-词嵌入与分布式表示.md",
    "NLP/03-FastText与子词信息.md": "NLP/基础/03-FastText与子词信息.md",
    "NLP/15-N-gram统计语言模型.md": "NLP/基础/15-N-gram统计语言模型.md",
    "NLP/04-Seq2Seq与Encoder-Decoder.md": "NLP/架构/04-Seq2Seq与Encoder-Decoder.md",
    "NLP/05-注意力机制.md": "NLP/架构/05-注意力机制.md",
    "NLP/06-自注意力与Transformer.md": "NLP/架构/06-自注意力与Transformer.md",
    "NLP/07-多头注意力.md": "NLP/架构/07-多头注意力.md",
    "NLP/08-位置编码.md": "NLP/架构/08-位置编码.md",
    "NLP/10-BERT与MLM预训练.md": "NLP/预训练/10-BERT与MLM预训练.md",
    "NLP/11-GPT与自回归生成.md": "NLP/预训练/11-GPT与自回归生成.md",
    "NLP/12-HuggingFace Transformers库.md": "NLP/预训练/12-HuggingFace Transformers库.md",
    "NLP/09-残差连接与LayerNorm.md": "NLP/组件/09-残差连接与LayerNorm.md",
    "NLP/13-残差连接(ResidualConnection).md": "NLP/组件/13-残差连接(ResidualConnection).md",
    "NLP/14-Layer Normalization.md": "NLP/组件/14-Layer Normalization.md",
    "NLP/16-文本语义匹配.md": "NLP/任务/16-文本语义匹配.md",
    "NLP/17-序列标注与NER.md": "NLP/任务/17-序列标注与NER.md",
    "AI-Agent/01-Agent定义与核心公式.md": "AI-Agent/基础/01-Agent定义与核心公式.md",
    "AI-Agent/06-提示词工程核心原则.md": "AI-Agent/基础/06-提示词工程核心原则.md",
    "AI-Agent/10-RAG系统双架构.md": "AI-Agent/基础/10-RAG系统双架构.md",
    "AI-Agent/29-LLM推理解码参数.md": "AI-Agent/基础/29-LLM推理解码参数.md",
    "AI-Agent/30-思维链(CoT).md": "AI-Agent/基础/30-思维链(CoT).md",
    "AI-Agent/02-RAG三阶段流程.md": "AI-Agent/RAG流程/02-RAG三阶段流程.md",
    "AI-Agent/03-文档切分策略.md": "AI-Agent/RAG流程/03-文档切分策略.md",
    "AI-Agent/28-多格式文档加载与OCR解析.md": "AI-Agent/RAG流程/28-多格式文档加载与OCR解析.md",
    "AI-Agent/31-父文档与子文档分块策略.md": "AI-Agent/RAG流程/31-父文档与子文档分块策略.md",
    "AI-Agent/34-中文递归文本分割器.md": "AI-Agent/RAG流程/34-中文递归文本分割器.md",
    "AI-Agent/05-BM25算法.md": "AI-Agent/检索/05-BM25算法.md",
    "AI-Agent/24-BM25完整实现.md": "AI-Agent/检索/24-BM25完整实现.md",
    "AI-Agent/26-FAQ与RAG混合检索架构.md": "AI-Agent/检索/26-FAQ与RAG混合检索架构.md",
    "AI-Agent/04-LangChain六大组件.md": "AI-Agent/LangChain/04-LangChain六大组件.md",
    "AI-Agent/22-LangChain组件操作指南.md": "AI-Agent/LangChain/22-LangChain组件操作指南.md",
    "AI-Agent/07-Coze平台.md": "AI-Agent/平台/07-Coze平台.md",
    "AI-Agent/08-Dify平台.md": "AI-Agent/平台/08-Dify平台.md",
    "AI-Agent/09-工作流编排(Workflow).md": "AI-Agent/平台/09-工作流编排(Workflow).md",
    "AI-Agent/11-多Agent协作(Multi-Agent).md": "AI-Agent/协作/11-多Agent协作(Multi-Agent).md",
    "AI-Agent/12-文本分类全流程.md": "AI-Agent/协作/12-文本分类全流程.md",
    "AI-Agent/23-RAG系统完整实现.md": "AI-Agent/系统/23-RAG系统完整实现.md",
    "AI-Agent/25-RAG系统评估(RAGAS).md": "AI-Agent/系统/25-RAG系统评估(RAGAS).md",
    "AI-Agent/27-RAG查询改写与意图识别.md": "AI-Agent/系统/27-RAG查询改写与意图识别.md",
    "AI-Agent/32-策略选择与多路径RAG检索.md": "AI-Agent/系统/32-策略选择与多路径RAG检索.md",
    "AI-Agent/33-意图识别(BERT微调分类模型).md": "AI-Agent/系统/33-意图识别(BERT微调分类模型).md",
    "工程实践/01-Docker基础与容器化.md": "工程实践/Docker/01-Docker基础与容器化.md",
    "工程实践/11-Docker Compose编排.md": "工程实践/Docker/11-Docker Compose编排.md",
    "工程实践/03-Git版本控制.md": "工程实践/部署/03-Git版本控制.md",
    "工程实践/04-Flask与FastAPI模型部署.md": "工程实践/部署/04-Flask与FastAPI模型部署.md",
    "工程实践/05-模型保存格式.md": "工程实践/部署/05-模型保存格式.md",
    "工程实践/06-Ollama与本地LLM部署.md": "工程实践/部署/06-Ollama与本地LLM部署.md",
    "工程实践/07-LLM API调用与ChatBot.md": "工程实践/部署/07-LLM API调用与ChatBot.md",
    "工程实践/08-HTTP基础与API设计.md": "工程实践/网络/08-HTTP基础与API设计.md",
    "工程实践/10-WebSocket与SSE流式输出.md": "工程实践/网络/10-WebSocket与SSE流式输出.md",
    "工程实践/02-GPU并行与混合精度.md": "工程实践/硬件/02-GPU并行与混合精度.md",
    "工程实践/09-Claude使用指南.md": "工程实践/硬件/09-Claude使用指南.md",
}

os.chdir(BASE)
print(f"Files to move: {len(move_map)}")

# STEP 2: Create dirs + move files
dirs = set(os.path.dirname(p) for p in move_map.values())
for d in sorted(dirs):
    os.makedirs(d, exist_ok=True)
    print(f"  dir: {d}")

for old, new in sorted(move_map.items()):
    if os.path.exists(new):
        print(f"  SKIP: {new} (exists)")
        continue
    shutil.move(old, new)
    print(f"  move: {old} -> {new}")

# STEP 3: Build old->new path lookup
old2new = {os.path.normpath(k): os.path.normpath(v) for k, v in move_map.items()}

# STEP 4: Update links in all card files
updated = 0
fixed_links = 0
for root, _, files in os.walk("."):
    for f in files:
        if not f.endswith(".md") or f in ("卡片总览.md", "原子化生成提示词.md"):
            continue
        fp = os.path.normpath(os.path.join(root, f))
        with open(fp, "r", encoding="utf-8") as fh:
            content = fh.read()
        orig = content
        for m in re.finditer(r"\[([^\]]+)\]\(([^)]+)\)", content):
            link = m.group(2)
            if link.startswith("http") or link.startswith("#"):
                continue
            resolved = os.path.normpath(os.path.join(os.path.dirname(fp), link))
            if resolved in old2new:
                new_target = old2new[resolved]
                new_rel = os.path.relpath(new_target, os.path.dirname(fp)).replace("\\", "/")
                content = content.replace(f"({link})", f"({new_rel})", 1)
                fixed_links += 1
        if content != orig:
            with open(fp, "w", encoding="utf-8") as fh:
                fh.write(content)
            updated += 1

print(f"\nLink updates: {fixed_links} changes across {updated} files")

# STEP 5: Verify references
broken = 0
for root, _, files in os.walk("."):
    for f in files:
        if not f.endswith(".md") or f == "卡片总览.md":
            continue
        fp = os.path.normpath(os.path.join(root, f))
        with open(fp, "r", encoding="utf-8") as fh:
            text = fh.read()
        for m in re.finditer(r"\[([^\]]+)\]\(([^)]+)\)", text):
            link = m.group(2)
            if link.startswith("http"):
                continue
            target = os.path.normpath(os.path.join(os.path.dirname(fp), link))
            td = target.replace("%20", " ")
            if not os.path.exists(target) and not os.path.exists(td):
                print(f"  BROKEN: {fp} -> {link}")
                broken += 1

print(f"\nBroken references: {broken}")
print("DONE")