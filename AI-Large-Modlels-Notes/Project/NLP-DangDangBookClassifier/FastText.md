**标签：** #Project #NLP

---

# 基于FastText 的当当图书分类

好的，没问题。我们先把 **FastText 的完整文字版流程** 梳理清楚，不急着给代码。您可以先确认整体思路，然后我会根据您的反馈逐步提供脚本。

---

## 一、 FastText 文本分类完整流程（文字版）

### 1.1 前置条件（您已完成）

- 原始数据已清洗、合并小众类别，并按照 8:1:1 拆分为 `train.csv`、`dev.csv`、`test.csv`。
- 数据已完成分词（`jieba`），并以 **制表符（`\t`）** 分隔，包含两列：`words`（分词后的文本，以空格连接）和 `label`（数字类别，0~43）。
- 您有 `category_index.txt` 文件，按顺序存放 44 个类别名称（第 0 行对应标签 0，以此类推）。

---

### 1.2 第一步：数据格式转换（CSV → FastText 输入格式）

FastText 要求输入文件每行格式为：

```python
__label__类别名 词1 词2 词3 ...
```

由于您的 `label` 是数字（0~43），**必须**将数字转换回原始类别名称（如“童书”、“小说”等）。  
例如：

- 原始行：`words="儿童 绘本 故事"  label=0`  
- 转换后：`__label__童书 儿童 绘本 故事`

**操作步骤：**

1. 读取 `category_index.txt`，构建 `数字 → 类别名` 的字典（`idx_to_label`）。
2. 分别读取 `train.csv`、`dev.csv`、`test.csv`。
3. 逐行生成新的 `.txt` 文件，每行格式为 `__label__{类别名} {words}`。
4. 输出三个文件：`fasttext_train.txt`、`fasttext_dev.txt`、`fasttext_test.txt`。

> 注意：这一步可以用 `pandas` 完成，很简单，但要注意文本列名是 `words`，不是原始 `text`。

---

### 1.3 第二步：训练基础 FastText 模型

使用 `fasttext.train_supervised` 方法，在训练集（`fasttext_train.txt`）上训练一个基础分类器。

**关键参数解释（您后续需要调优）：**

| 参数 | 作用 | 推荐起始值 |
|------|------|-----------|
| `lr` | 学习率（learning rate） | 0.1 |
| `epoch` | 遍历训练集的次数（迭代轮数） | 25（数据量大可适当减少） |
| `wordNgrams` | 使用几元词组（1=unigram，2=bigram） | 2（中文短语很有用） |
| `dim` | 词向量维度 | 100 |
| `loss` | 损失函数（`softmax` 或 `hs`） | `softmax`（44 类，比较适中） |
| `minCount` | 忽略出现次数低于此值的词 | 2（过滤低频噪声） |
| `bucket` | 哈希桶大小（存放未登录词） | 200000 |
| `thread` | 使用的 CPU 线程数 | 根据您的 CPU 核心数（如 16） |

训练完成后，会生成一个 `.bin` 模型文件（如 `fasttext_model.bin`）。

---

### 1.4 第三步：在验证集上评估（验证集调参）

训练完基础模型后，需要用它预测验证集（`fasttext_dev.txt`）的标签，并与真实标签对比。

**具体做法：**

1. 读取验证集的真实数字标签（从原始的 `dev.csv` 中读取 `label` 列）。
2. 使用 FastText 的 `model.predict()` 方法，逐条预测验证集文本，得到预测的类别名。
3. 将预测的类别名转换为数字标签（需要构建反向字典 `类别名 → 数字`）。
4. 计算评估指标：
   - **准确率（Accuracy）**
   - **宏平均精确率（Macro Precision）**
   - **宏平均召回率（Macro Recall）**
   - **宏平均 F1 值（Macro F1）**
   - 输出详细分类报告（每个类别的 Precision/Recall/F1），找出薄弱类别。

**调参思路：**

- 观察验证集准确率和 F1。如果不满意，调整超参数（如 `lr`、`epoch`、`wordNgrams`、`dim`），重新训练并再次评估。
- 也可以启用 FastText 的自动调参功能（`autotuneValidationFile`），指定验证集文件和时间，让它自动搜索最佳参数。

---

### 1.5 第四步：在测试集上最终评估

选定最佳超参数后，用训练集重新训练最终模型（或加载之前保存的最佳模型）。

1. 在测试集（`fasttext_test.txt`）上进行预测。
2. 与真实的测试标签对比。
3. 输出测试集上的准确率、精确率、召回率、F1 和分类报告。
4. **这是最终的、客观的泛化能力评估**，只做一次，不用于调参。

---

### 1.6 第五步：保存和加载模型

- 使用 `model.save_model("fasttext_model.bin")` 保存训练好的模型。
- 后续预测时，只需 `fasttext.load_model("fasttext_model.bin")` 即可加载，无需重新训练。

---

### 1.7 与随机森林的对比预期

| 对比项 | 随机森林（您之前做的） | FastText（新方案） |
|--------|------------------------|---------------------|
| 训练时间 | ~100~200 秒 | 预计 5~15 分钟（但效果往往更好） |
| 特征处理 | 需要 TF-IDF 向量化，内存占用大 | 自带词嵌入，不需要额外向量化 |
| 文本捕捉能力 | 基于词袋，忽略词序 | 基于词向量 + N-gram，能捕捉短语和上下文 |
| 类别不平衡 | 需手动设置 `class_weight` | 可通过 `label_weights` 或负采样调整 |
| 预估准确率 | 约 47%~50% | 有望达到 **55%~65%** |

---

## 二、数据格式转换

好的，我们按您的要求**先进行数据格式转换**，把已有的分词数据（`process_train.txt`、`process_dev.txt`、`process_test.txt`）转换为 FastText 所需的格式。

---

### 2.1 转换说明

- **输入文件**：您已经分词后的 `.txt` 文件（制表符分隔，包含 `words` 和 `label` 两列）。
- **输出文件**：FastText 格式的 `.txt` 文件，每行格式为 `__label__类别名 词1 词2 ...`。
- **类别映射**：利用 `category_index.txt` 按行顺序对应数字标签（0~43）到类别名称。
- **输出路径**：使用 Config 中已定义的 `process_train_path_words`、`process_dev_path_words`、`process_test_path_words`。

---

### 2.2 完整转换脚本（可直接运行）

以下是一个独立的脚本 `00-转换为fasttext格式.py`，只做数据转换，不涉及训练。

```python
import pandas as pd
import os
from config.config import Config  # 假设您的 Config 类在 config/config.py

def convert_to_fasttext_format():
    config = Config()

    # 确保输出目录存在
    output_dir = os.path.dirname(config.process_train_path_words)
    os.makedirs(output_dir, exist_ok=True)

    # 读取类别映射（数字→类别名）
    id2class = config.id2class  # 已在 Config 中构建好

    # 定义转换函数
    def convert_file(input_path, output_path):
        """读取分词文件，生成 FastText 格式"""
        # 读取制表符分隔文件，包含 words 和 label 两列
        df = pd.read_csv(input_path, sep='\t')
        # 检查列是否存在
        if 'words' not in df.columns or 'label' not in df.columns:
            raise ValueError(f"输入文件 {input_path} 缺少 'words' 或 'label' 列，现有列：{df.columns.tolist()}")

        with open(output_path, 'w', encoding='utf-8') as f_out:
            for _, row in df.iterrows():
                label_name = id2class[row['label']]   # 数字转类别名
                # 注意：words 列已经是空格分词后的字符串
                line = f"__label__{label_name} {row['words']}\n"
                f_out.write(line)
        print(f"✅ 已生成 {output_path}")

    # 转换训练集
    convert_file(config.process_train_path, config.process_train_path_words)
    # 转换验证集
    convert_file(config.process_dev_path, config.process_dev_path_words)
    # 转换测试集
    convert_file(config.process_test_path, config.process_test_path_words)

    print("🎯 所有数据格式转换完成！")

if __name__ == '__main__':
    convert_to_fasttext_format()
```

---

### 2.3 文件对应关系

| 原文件（分词后） | 目标文件（FastText 格式） |
|------------------|---------------------------|
| `process_train.txt` | `process_train_path_words` |
| `process_dev.txt`   | `process_dev_path_words`   |
| `process_test.txt`  | `process_test_path_words`  |

---

### 2.4 使用前检查

1. **确保路径正确**：您的 Config 中已定义了：
   - `process_train_path` → 分词后的训练集
   - `process_dev_path` → 分词后的验证集
   - `process_test_path` → 分词后的测试集
   - `process_train_path_words` → 输出的 FastText 训练文件
   - 同理 dev 和 test

2. **文件内容确认**：您的分词文件（如 `process_train.txt`）应包含两列：
   - `words`：空格连接的分词结果
   - `label`：数字标签（0~43）

   如果没有，请先运行分词脚本生成它们。

3. **运行脚本**：在终端执行 `python 00-转换为fasttext格式.py`。

---

### 2.5 补充说明

- 如果您的分词文件是其他列名（比如 `text` 或 `word_seg`），请修改代码中的列名。
- 如果原始文件中还包含其他列（如 `title`），不影响，我们只取 `words` 和 `label`。
- 输出的 FastText 文件不包含标题行，每行直接是 `__label__类别名 词序列`。

---

## 三、训练基础 Fasttext 模型（第一次）

### 3.1 默认参数训练

```python
model = fasttext.train_supervised(  
    input=train_file,  
    epoch=5,          # 默认值  
    lr=0.1,           # 默认值  
    wordNgrams=1,     # 默认值（1-gram）  
    dim=100,          # 默认值  
    loss='softmax',   # 默认值  
    minCount=1,       # 默认值  
    bucket=2000000,   # 默认值  
    verbose=2  
)
```

```text
G:\Software\anaconda3\envs\pytorch\python.exe G:\code\python\NLP_DangDangBookClassifier\scripts\baselines\fasttext\02-默认参数方式训练模型-词-字符.py 
正在初始化配置文件...
  √ 从缓存加载类别映射，共 44 类

==================================================
开始训练 词级 FastText 模型
训练文件: G:/code/python/NLP_DangDangBookClassifier/data/processed/train_process_words.txt
模型保存至: G:/code/python/NLP_DangDangBookClassifier/model/baselines/fasttext/ft_word_default.bin
Read 88M words
Number of words:  777334
Number of labels: 44
Progress: 100.0% words/sec/thread: 1031727 lr:  0.000000 avg.loss:  1.238976 ETA:   0h 0m 0s
训练完成，耗时 41.32 秒
模型已保存至 G:/code/python/NLP_DangDangBookClassifier/model/baselines/fasttext/ft_word_default.bin

【验证集 评估结果】
准确率 (Accuracy): 75.60%
宏平均精确率 (Macro Precision): 74.38%
宏平均召回率 (Macro Recall): 70.27%
宏平均 F1 (Macro F1): 71.73%

【测试集 评估结果】
准确率 (Accuracy): 75.33%
宏平均精确率 (Macro Precision): 74.10%
宏平均召回率 (Macro Recall): 70.05%
宏平均 F1 (Macro F1): 71.50%

==================================================
开始训练 字符级 FastText 模型
训练文件: G:/code/python/NLP_DangDangBookClassifier/data/processed/train_process_chars.txt
模型保存至: G:/code/python/NLP_DangDangBookClassifier/model/baselines/fasttext/ft_char_default.bin
Read 155M words
Number of words:  10144
Number of labels: 44
Progress: 100.0% words/sec/thread: 1348913 lr:  0.000000 avg.loss:  1.475590 ETA:   0h 0m 0s
训练完成，耗时 47.59 秒
模型已保存至 G:/code/python/NLP_DangDangBookClassifier/model/baselines/fasttext/ft_char_default.bin

【验证集 评估结果】
准确率 (Accuracy): 69.21%
宏平均精确率 (Macro Precision): 68.22%
宏平均召回率 (Macro Recall): 63.78%
宏平均 F1 (Macro F1): 65.30%

【测试集 评估结果】
准确率 (Accuracy): 68.81%
宏平均精确率 (Macro Precision): 68.05%
宏平均召回率 (Macro Recall): 63.67%
宏平均 F1 (Macro F1): 65.14%

所有训练和评估完成！

进程已结束，退出代码为 0

```

---

### 3.2 训练结果总结

#### 3.2.1 词级 FastText（默认参数）

| 指标 | 验证集 | 测试集 |
|------|--------|--------|
| 准确率 | **75.60%** | **75.33%** |
| 宏平均精确率 | 74.38% | 74.10% |
| 宏平均召回率 | 70.27% | 70.05% |
| 宏平均 F1 | 71.73% | 71.50% |

#### 3.2.2 字符级 FastText（默认参数）

| 指标 | 验证集 | 测试集 |
|------|--------|--------|
| 准确率 | 69.21% | 68.81% |
| 宏平均精确率 | 68.22% | 68.05% |
| 宏平均召回率 | 63.78% | 63.67% |
| 宏平均 F1 | 65.30% | 65.14% |

---

### 3.3 关键发现

1. **词级模型明显优于字符级模型（+6.5%）**
   - 词级准确率 **75.6%** vs 字符级 **69.2%**
   - 说明中文分词对语义捕捉更有效

2. **训练速度极快**
   - 词级：41.32 秒（81 万样本）
   - 字符级：47.59 秒
   - 比随机森林快 **2~3 倍**

3. **验证集和测试集高度一致**
   - 差异 < 0.3%，没有过拟合

4. **字符级训练词表更小**
   - 词级：777,334 个唯一词
   - 字符级：仅 10,144 个唯一字符
   - 这意味着字符级模型更轻量，对未登录词更鲁棒

---

### 3.4 下一步优化建议（按优先级排序）

#### 3.4.1 调优词级模型（推荐先做）

词级模型已经 75%+，通过调参可以进一步提升：

```python
# 尝试增加 epoch 和 wordNgrams
model = fasttext.train_supervised(
    input=train_file,
    epoch=25,              # 从 5 提升到 25
    lr=0.1,
    wordNgrams=2,          # 从 1 提升到 2（捕捉短语）
    dim=200,               # 从 100 提升到 200
    loss='softmax',
    minCount=2,            # 过滤低频词
    bucket=2000000,
    verbose=2
)
```

**预期**：准确率可达 **77%~79%**

#### 3.4.2 使用自动调参（省心省力）

```python
model = fasttext.train_supervised(
    input=train_file,
    autotuneValidationFile=dev_file,  # 自动调参
    autotuneDuration=60*10,           # 最多 10 分钟
    verbose=2
)
```

**预期**：自动搜索最优参数，可能达到 **78%~80%**

#### 3.4.3 尝试字符级 + 词级融合

- 字符级对噪声、错别字更鲁棒
- 词级语义更准确
- 可以加权投票，取长补短

#### 3.4.4 数据增强（锦上添花）

- 对少数类进行过采样（复制样本）
- 使用回译（中文→英文→中文）生成新样本

---

### 3.5 对比随机森林

| 模型 | 准确率 | F1 (Macro) |
|------|--------|------------|
| 随机森林（最佳） | 49.6% | 46.6% |
| **FastText 词级** | **75.6%** | **71.7%** |
| FastText 字符级 | 69.2% | 65.3% |

**FastText 将准确率提升了 26 个百分点！** 说明您的选择非常正确。

---

## 四、训练基础 Fasttext 模型（第二次）

```python
model = fasttext.train_supervised(  
    input=train_file,  
    epoch=25,         # 从 5 提升到 25    lr=0.1,           # 默认值  
    wordNgrams=2,     # 从 1 提升到 2（捕捉短语）  
    dim=200,          # 从 100 提升到 200    loss='softmax',   # 默认值  
    minCount=2,       # 过滤低频词  
    bucket=2000000,   # 默认值  
    verbose=2  
)
```

```text
正在初始化配置文件...
  √ 从缓存加载类别映射，共 44 类

==================================================
开始训练 词级 FastText 模型
训练文件: G:/code/python/NLP_DangDangBookClassifier/data/processed/train_process_words.txt
模型保存至: G:/code/python/NLP_DangDangBookClassifier/model/baselines/fasttext/ft_word_default.bin
Read 88M words
Number of words:  445272
Number of labels: 44
Progress: 100.0% words/sec/thread:  314468 lr:  0.000000 avg.loss:  0.324189 ETA:   0h 0m 0s
训练完成，耗时 482.62 秒
模型已保存至 G:/code/python/NLP_DangDangBookClassifier/model/baselines/fasttext/ft_word_default.bin

【验证集 评估结果】
准确率 (Accuracy): 82.50%
宏平均精确率 (Macro Precision): 80.07%
宏平均召回率 (Macro Recall): 78.75%
宏平均 F1 (Macro F1): 79.33%

【测试集 评估结果】
准确率 (Accuracy): 82.37%
宏平均精确率 (Macro Precision): 80.05%
宏平均召回率 (Macro Recall): 78.86%
宏平均 F1 (Macro F1): 79.39%

==================================================
开始训练 字符级 FastText 模型
训练文件: G:/code/python/NLP_DangDangBookClassifier/data/processed/train_process_chars.txt
模型保存至: G:/code/python/NLP_DangDangBookClassifier/model/baselines/fasttext/ft_char_default.bin
Read 155M words
Number of words:  9235
Number of labels: 44
Progress: 100.0% words/sec/thread:  360262 lr:  0.000000 avg.loss:  0.566359 ETA:   0h 0m 0s
训练完成，耗时 726.97 秒
模型已保存至 G:/code/python/NLP_DangDangBookClassifier/model/baselines/fasttext/ft_char_default.bin

【验证集 评估结果】
准确率 (Accuracy): 81.12%
宏平均精确率 (Macro Precision): 78.91%
宏平均召回率 (Macro Recall): 77.14%
宏平均 F1 (Macro F1): 77.85%

【测试集 评估结果】
准确率 (Accuracy): 80.95%
宏平均精确率 (Macro Precision): 78.83%
宏平均召回率 (Macro Recall): 77.21%
宏平均 F1 (Macro F1): 77.91%

所有训练和评估完成！

进程已结束，退出代码为 0

```

🎉 **这次结果有了质的飞跃！** 非常出色！

---

### 4.1 两次训练对比（词级）

| 指标 | 第一次（默认参数） | 第二次（调参后） | 提升 |
|------|-------------------|------------------|------|
| 训练耗时 | 41 秒 | **482 秒** | 慢 11 倍（说明训练更充分） |
| 词表大小 | 777,334 | **445,272** | 减少 42%（过滤了低频词） |
| 最终损失 | 1.238 | **0.324** | 损失大幅下降（拟合更好） |
| 验证准确率 | 75.60% | **82.50%** | ✅ +6.9% |
| 测试准确率 | 75.33% | **82.37%** | ✅ +7.0% |
| 宏平均 F1 | 71.73% | **79.33%** | ✅ +7.6% |

---

### 4.2两次训练对比（字符级）

| 指标 | 第一次（默认参数） | 第二次（调参后） | 提升 |
|------|-------------------|------------------|------|
| 训练耗时 | 47 秒 | **727 秒** | 慢 15 倍 |
| 词表大小 | 10,144 | **9,235** | 略微减少 |
| 最终损失 | 1.475 | **0.566** | 大幅下降 |
| 验证准确率 | 69.21% | **81.12%** | ✅ +11.9% |
| 测试准确率 | 68.81% | **80.95%** | ✅ +12.1% |
| 宏平均 F1 | 65.30% | **77.85%** | ✅ +12.6% |

---

### 4.3 关键发现

#### 4.3.1 词级模型仍略优于字符级
- 词级准确率 **82.50%** vs 字符级 **81.12%**
- 差距从 6.4% 缩小到 **1.4%**，字符级进步更大！

#### 4.3.2 字符级模型在调参后表现惊艳
- 字符级从 69% → 81%，**提升了 12 个百分点**
- 说明字符级模型在充分训练后潜力巨大，且词表极小（仅 9235 个字符）

#### 4.3.3 训练时间合理
- 词级：8 分钟（82 万样本，88M 单词）
- 字符级：12 分钟（155M 字符）
- 相比深度学习（几小时），FastText 非常高效

#### 4.3.4 验证集和测试集高度一致
- 差距 < 0.2%，**无过拟合**，泛化优秀

---

### 4.4 为什么会提升这么多？

您第二次运行使用的参数一定与第一次不同：

**可能的变化：**
- 增加了 `epoch`（从 5 → 25 或 50）
- 增加了 `wordNgrams`（从 1 → 2）
- 增加了 `dim`（从 100 → 200）
- 设置了 `minCount=2` 或更高（过滤了更多低频词，所以词表从 77 万降到 44 万）

---

### 4.5 接下来可以做什么？

#### 查看详细分类报告（了解哪些类别需要改进）
```python
print(classification_report(y_true, y_pred, target_names=list(class2id.keys()), digits=4))
```

#### 选项 2：尝试自动调参（可能再提升 1~2%）
```python
model = fasttext.train_supervised(
    input=train_file,
    autotuneValidationFile=dev_file,
    autotuneDuration=60*15,  # 15 分钟自动搜索
    verbose=2
)
```

#### 选项 3：模型融合（词级 + 字符级）**
- 两个模型的特征互补，加权投票可能再提升 0.5~1%

#### 选项 4：保存当前最佳模型（如果这是最终结果）
- 目前 **82.5% 准确率** 已经是一个非常强的基线！
- 可以直接用于后续对比（深度学习 BERT 等）

---

### 4.6 当前最佳结论

| 模型 | 最佳准确率 | F1 (Macro) |
|------|-----------|------------|
| 随机森林 | 49.6% | 46.6% |
| **FastText 词级** | **82.5%** ✅ | **79.3%** ✅ |
| **FastText 字符级** | **81.1%** | **77.9%** |

**FastText 在您的数据集上表现远超随机森林（+33% 准确率）！** 非常漂亮的成果。🎉


---
## 五、自动参数训练
```python
model = fasttext.train_supervised(  
    input=train_file,  
    autotuneValidationFile=dev_file,   # 使用验证集调参  
    autotuneDuration=duration,          # 调参时间（秒）600秒  
    # autotuneModelSize='1G',             # 限制模型大小（可选）  
    verbose=2                           # 显示详细日志  
)
```

```text
G:\Software\anaconda3\envs\pytorch\python.exe G:\code\python\NLP_DangDangBookClassifier\scripts\baselines\fasttext\03-自动参数方式训练模型-词-字符.py 
正在初始化配置文件...
  √ 从缓存加载类别映射，共 44 类

============================================================
开始 词级 FastText 自动调参训练
训练文件: G:/code/python/NLP_DangDangBookClassifier/data/processed/train_process_words.txt
验证文件: G:/code/python/NLP_DangDangBookClassifier/data/processed/dev_process_words.txt
调参时长: 600 秒
模型保存至: G:/code/python/NLP_DangDangBookClassifier/model/baselines/fasttext/ft_word_auto.bin
Progress: 100.0% Trials:    5 Best score:  0.761657 ETA:   0h 0m 0s
Training again with best arguments
Read 88M words
Number of words:  777334
Number of labels: 44
Progress: 100.0% words/sec/thread:  158548 lr:  0.000000 avg.loss:  1.396466 ETA:   0h 0m 0s
自动调参完成，总耗时 726.39 秒

✅ 自动调参选用的最佳参数:
   epoch: 3
   lr: 0.21604105365003676
   dim: 168
   wordNgrams: 4
   loss: loss_name.softmax
   minCount: 1
   bucket: 2620593
模型已保存至 G:/code/python/NLP_DangDangBookClassifier/model/baselines/fasttext/ft_word_auto.bin

【验证集 自动调参结果】
准确率 (Accuracy): 76.07%
宏平均精确率 (Macro Precision): 75.26%
宏平均召回率 (Macro Recall): 68.08%
宏平均 F1 (Macro F1): 70.02%

【测试集 自动调参结果】
准确率 (Accuracy): 76.00%
宏平均精确率 (Macro Precision): 74.98%
宏平均召回率 (Macro Recall): 68.24%
宏平均 F1 (Macro F1): 70.17%

============================================================
开始 字符级 FastText 自动调参训练
训练文件: G:/code/python/NLP_DangDangBookClassifier/data/processed/train_process_chars.txt
验证文件: G:/code/python/NLP_DangDangBookClassifier/data/processed/dev_process_chars.txt
调参时长: 600 秒
模型保存至: G:/code/python/NLP_DangDangBookClassifier/model/baselines/fasttext/ft_char_auto.bin
Progress: 100.0% Trials:    5 Best score:  0.744148 ETA:   0h 0m 0s
Training again with best arguments
Read 155M words
Number of words:  10144
Number of labels: 44
Progress: 100.0% words/sec/thread:  163433 lr:  0.000000 avg.loss:  1.393097 ETA:   0h 0m 0s
自动调参完成，总耗时 800.20 秒

✅ 自动调参选用的最佳参数:
   epoch: 3
   lr: 0.21604105365003676
   dim: 168
   wordNgrams: 4
   loss: loss_name.softmax
   minCount: 1
   bucket: 2620593
模型已保存至 G:/code/python/NLP_DangDangBookClassifier/model/baselines/fasttext/ft_char_auto.bin

【验证集 自动调参结果】
准确率 (Accuracy): 74.39%
宏平均精确率 (Macro Precision): 73.17%
宏平均召回率 (Macro Recall): 67.32%
宏平均 F1 (Macro F1): 69.15%

【测试集 自动调参结果】
准确率 (Accuracy): 74.22%
宏平均精确率 (Macro Precision): 73.28%
宏平均召回率 (Macro Recall): 67.22%
宏平均 F1 (Macro F1): 68.92%

🎯 所有自动调参训练和评估完成！

进程已结束，退出代码为 0

```

看到自动调参的结果了。**效果不如手动调参**，这是值得分析的。

---

### 5.1 自动调参 vs 手动调参（词级）

| 指标 | 手动调参（第二次） | 自动调参（本次） | 差距 |
|------|-------------------|-----------------|------|
| 验证准确率 | **82.50%** | 76.07% | **-6.43%** |
| 测试准确率 | **82.37%** | 76.00% | **-6.37%** |
| 宏平均 F1 | **79.33%** | 70.02% | **-9.31%** |

**自动调参反而更差了！** 😱

---

### 5.2 原因分析

从自动调参选出的参数来看：

```
epoch: 3              ← 太小了！（手动调参可能是 25~50）
lr: 0.216             ← 偏大，可能学习不稳定
dim: 168              ← 适中
wordNgrams: 4         ← 可能太大了，引入过多噪声
minCount: 1           ← 保留了所有低频词（手动可能设为 2 或更高）
bucket: 2620593       ← 偏大
```

**问题根源**：
1. **调参时间太短（600 秒/10 分钟）**：FastText 只尝试了 5 组参数（Trials: 5），搜索不充分。
2. ** `epoch=3` 训练不充分**：模型欠拟合。
3. ** `wordNgrams=4` 可能过拟合**：四元词组在中文中容易引入噪声。
4. ** `minCount=1` 保留了太多低频噪声词**。

---

### 5.3 解决方案

#### 方案一：增加调参时间（推荐）

将调参时长从 600 秒增加到 **1800~3600 秒**（30~60 分钟），让搜索更充分：

```python
TUNE_DURATION = 1800  # 30 分钟
```

#### 方案二：手动限制搜索范围

在自动调参时，手动指定搜索范围，避免不合理的参数组合：

```python
model = fasttext.train_supervised(
    input=train_file,
    autotuneValidationFile=dev_file,
    autotuneDuration=duration,
    autotuneParameters={
        'epoch': [10, 25, 50],
        'wordNgrams': [1, 2, 3],
        'dim': [100, 150, 200],
        'lr': [0.05, 0.1, 0.2],
        'minCount': [1, 2, 3]
    },
    verbose=2
)
```

> ⚠️ `autotuneParameters` 在最新版 FastText 中可能不支持，取决于您的版本。

#### 方案三：直接用手动调参的最优参数（最稳妥）

既然您手动调参已经达到 **82.5%**，说明您的参数组合已经很好。可以把这些参数固定下来，作为最终模型：

```python
model = fasttext.train_supervised(
    input=train_file,
    epoch=25,              # 或您实际使用的值
    lr=0.1,
    wordNgrams=2,
    dim=200,
    loss='softmax',
    minCount=2,
    bucket=2000000,
    verbose=2
)
```

---

### 5.4 我的建议

1. **优先采用手动调参的最佳参数**：已经达到 82.5%，足够作为强基线。
2. **如果还想尝试自动调参**：
   - 把时间增加到 **1800~3600 秒**（30~60 分钟），让搜索更充分。
   - 如果 `autotuneParameters` 可用，手动限制搜索范围。
3. **对比结果**：当前自动调参（76%）不如手动调参（82.5%），说明您的**手动调参能力**已经很强了！👍

---

## 六、遇到的错误

### fasttext 与 numpy2.0 的兼容问题

明白了！您发现将 `text` 参数用列表 `[text]` 包装起来可以避免 NumPy 2.0 的兼容性错误，且预测结果会多一层嵌套，需要相应解索引。下面我为您提供修改后的 ** `evaluate` 函数**，您只需替换原函数中的预测部分即可。

---

#### 修改后的 `evaluate` 函数（仅改动预测部分）

```python
def evaluate(data_file, dataset_name=""):
    with open(data_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    y_true = []
    y_pred = []
    for line in lines:
        parts = line.strip().split(' ', 1)
        if len(parts) != 2:
            continue
        label_part = parts[0]          # "__label__童书"
        text = parts[1]                # 文本内容
        true_label_name = label_part.replace('__label__', '')
        true_label_id = class2id[true_label_name]
        y_true.append(true_label_id)

        # ********** 关键修改 **********
        # 用 [text] 包装文本进行预测，以避免 NumPy 2.0 的 copy 错误
        pred_result = model.predict([text], k=1)
        # pred_result 返回 (labels, probs)，其中 labels 是二维列表：
        # labels = [['__label__类别名']]，因此需要取 [0][0]
        pred_label_name = pred_result[0][0][0].replace('__label__', '')
        pred_label_id = class2id[pred_label_name]
        y_pred.append(pred_label_id)

    # 计算指标
    acc = accuracy_score(y_true, y_pred)
    prec = precision_score(y_true, y_pred, average='macro', zero_division=0)
    rec = recall_score(y_true, y_pred, average='macro', zero_division=0)
    f1 = f1_score(y_true, y_pred, average='macro', zero_division=0)

    print(f"\n【{dataset_name} 评估结果】")
    print(f"准确率 (Accuracy): {acc*100:.2f}%")
    print(f"宏平均精确率 (Macro Precision): {prec*100:.2f}%")
    print(f"宏平均召回率 (Macro Recall): {rec*100:.2f}%")
    print(f"宏平均 F1 (Macro F1): {f1*100:.2f}%")

    return acc, prec, rec, f1
```

---

#### 改动说明

| 原代码 | 新代码 |
|--------|--------|
| `model.predict(text, k=1)` | `model.predict([text], k=1)` |
| `pred_label_name = pred_result[0][0].replace(...)` | `pred_label_name = pred_result[0][0][0].replace(...)` |

- **为什么加 `[]` **：将单个文本放入列表，使 FastText 以**批量预测**模式处理，内部会使用不同的返回格式，从而绕开 NumPy 2.0 的 `copy=False` 限制。
- **为什么多一层索引**：批量预测返回的 `labels` 是 `[['__label__类别名']]`，所以需要 `[0][0]` 才能获取标签字符串，再用 `[0]` 取出元素。

---

#### 备选建议

虽然加 `[]` 能解决，但如果您想彻底避免这类兼容性问题，我依然推荐安装 `fasttext-numpy2`（一劳永逸，代码无需改动）。不过既然您已经找到了本地解决方案，就用您的方法，完全可行。

---
## 七、第三次训练
```python

```

```text
G:\Software\anaconda3\envs\pytorch\python.exe G:\code\python\NLP_DangDangBookClassifier\scripts\baselines\fasttext\02-默认参数方式训练模型-词-字符.py 
正在初始化配置文件...
  √ 从缓存加载类别映射，共 44 类

==================================================
开始训练 词级 FastText 模型
训练文件: G:/code/python/NLP_DangDangBookClassifier/data/processed/train_process_words.txt
模型保存至: G:/code/python/NLP_DangDangBookClassifier/model/baselines/fasttext/ft_word_default.bin
Read 88M words
Number of words:  445272
Number of labels: 44
Progress: 100.0% words/sec/thread:  316158 lr:  0.000000 avg.loss:  0.290729 ETA:   0h 0m 0s
训练完成，耗时 480.64 秒
模型已保存至 G:/code/python/NLP_DangDangBookClassifier/model/baselines/fasttext/ft_word_default.bin

【验证集 评估结果】
准确率 (Accuracy): 82.48%
宏平均精确率 (Macro Precision): 80.01%
宏平均召回率 (Macro Recall): 78.77%
宏平均 F1 (Macro F1): 79.33%
              precision    recall  f1-score   support

          童书     0.9078    0.9268    0.9172      6012
          小说     0.8004    0.8233    0.8117      4806
          传记     0.8349    0.8468    0.8408      4419
      计算机/网络     0.8357    0.8735    0.8542      3558
          法律     0.9138    0.8967    0.9052      3535
          外语     0.8806    0.8657    0.8731      3500
         心理学     0.8639    0.8776    0.8707      3138
          管理     0.7691    0.7987    0.7836      2782
       中小学用书     0.8307    0.8102    0.8203      2750
        工业技术     0.7678    0.7848    0.7762      2444
       体育/运动     0.9456    0.9545    0.9500      2420
          图书     0.8569    0.8644    0.8606      2411
          历史     0.7217    0.7053    0.7134      2375
          艺术     0.7722    0.7833    0.7777      2354
          医学     0.8126    0.7918    0.8021      2229
          文学     0.6587    0.6330    0.6456      2210
          经济     0.7331    0.7479    0.7404      2134
       亲子/家教     0.8662    0.8791    0.8726      2026
       动漫/幽默     0.8856    0.8914    0.8885      1971
       保健/养生     0.8157    0.8179    0.8168      1818
        投资理财     0.9152    0.9279    0.9215      1803
       烹饪/美食     0.8960    0.8980    0.8970      1784
       旅游/地图     0.8457    0.8447    0.8452      1784
          建筑     0.7549    0.7363    0.7455      1619
       时尚/美妆     0.9069    0.9093    0.9081      1478
       休闲/爱好     0.9058    0.8994    0.9026      1401
      手工/DIY     0.9296    0.9261    0.9278      1312
        社会科学     0.6190    0.5767    0.5971      1245
          文化     0.6906    0.6924    0.6915      1193
        科普读物     0.7108    0.7224    0.7165      1160
        自然科学     0.6745    0.6667    0.6705      1125
          古籍     0.7335    0.7114    0.7222      1029
       孕产/胎教     0.9508    0.9383    0.9445       907
          教材     0.5427    0.4641    0.5004       739
        两性关系     0.8551    0.8829    0.8688       555
       哲学/宗教     0.7000    0.6633    0.6812       496
       育儿/早教     0.7978    0.7372    0.7663       487
          考试     0.6452    0.5529    0.5955       454
       政治/军事     0.6369    0.5846    0.6096       390
         工具书     0.7620    0.6606    0.7077       383
       日文原版书     0.9846    0.9816    0.9831       326
       农业/林业     0.8632    0.8775    0.8703       302
       家庭/家居     0.8739    0.8375    0.8553       240
       其他小众书     0.5366    0.3964    0.4560       111

    accuracy                         0.8248     81215
   macro avg     0.8001    0.7877    0.7933     81215
weighted avg     0.8236    0.8248    0.8240     81215


【测试集 评估结果】
准确率 (Accuracy): 82.37%
宏平均精确率 (Macro Precision): 80.00%
宏平均召回率 (Macro Recall): 78.90%
宏平均 F1 (Macro F1): 79.39%
              precision    recall  f1-score   support

          童书     0.9008    0.9152    0.9079      6013
          小说     0.7904    0.8269    0.8082      4806
          传记     0.8304    0.8466    0.8384      4419
      计算机/网络     0.8340    0.8668    0.8501      3558
          法律     0.9040    0.9004    0.9022      3535
          外语     0.8737    0.8637    0.8687      3500
         心理学     0.8710    0.8783    0.8746      3138
          管理     0.7772    0.8037    0.7902      2782
       中小学用书     0.8279    0.8171    0.8225      2750
        工业技术     0.7800    0.7902    0.7850      2445
       体育/运动     0.9442    0.9508    0.9475      2421
          图书     0.8616    0.8644    0.8630      2412
          历史     0.7193    0.7036    0.7114      2375
          艺术     0.7701    0.7698    0.7699      2354
          医学     0.8105    0.7963    0.8033      2229
          文学     0.6734    0.6377    0.6551      2211
          经济     0.7403    0.7427    0.7415      2134
       亲子/家教     0.8685    0.8796    0.8740      2027
       动漫/幽默     0.8858    0.8732    0.8795      1972
       保健/养生     0.8178    0.8142    0.8160      1819
        投资理财     0.9194    0.9229    0.9212      1804
       烹饪/美食     0.9002    0.8941    0.8971      1785
       旅游/地图     0.8346    0.8543    0.8443      1784
          建筑     0.7494    0.7198    0.7343      1620
       时尚/美妆     0.9012    0.8945    0.8978      1478
       休闲/爱好     0.9042    0.9158    0.9100      1402
      手工/DIY     0.9399    0.9298    0.9348      1311
        社会科学     0.6084    0.5732    0.5902      1244
          文化     0.6769    0.6678    0.6723      1192
        科普读物     0.7159    0.7023    0.7091      1159
        自然科学     0.6848    0.6818    0.6833      1125
          古籍     0.7209    0.7461    0.7333      1028
       孕产/胎教     0.9415    0.9405    0.9410       907
          教材     0.5616    0.5068    0.5328       738
        两性关系     0.8413    0.8610    0.8510       554
       哲学/宗教     0.6849    0.6573    0.6708       496
       育儿/早教     0.8108    0.7392    0.7734       487
          考试     0.7034    0.5916    0.6427       453
       政治/军事     0.6546    0.6041    0.6283       389
         工具书     0.7270    0.5770    0.6434       383
       日文原版书     1.0000    0.9969    0.9985       326
       农业/林业     0.8173    0.8444    0.8306       302
       家庭/家居     0.8719    0.8828    0.8773       239
       其他小众书     0.5474    0.4727    0.5073       110

    accuracy                         0.8237     81216
   macro avg     0.8000    0.7890    0.7939     81216
weighted avg     0.8226    0.8237    0.8229     81216


==================================================
开始训练 字符级 FastText 模型
训练文件: G:/code/python/NLP_DangDangBookClassifier/data/processed/train_process_chars.txt
模型保存至: G:/code/python/NLP_DangDangBookClassifier/model/baselines/fasttext/ft_char_default.bin
Read 155M words
Number of words:  9235
Number of labels: 44
Progress: 100.0% words/sec/thread:  369061 lr:  0.000000 avg.loss:  0.518373 ETA:   0h 0m 0s
训练完成，耗时 711.33 秒
模型已保存至 G:/code/python/NLP_DangDangBookClassifier/model/baselines/fasttext/ft_char_default.bin

【验证集 评估结果】
准确率 (Accuracy): 81.12%
宏平均精确率 (Macro Precision): 78.87%
宏平均召回率 (Macro Recall): 77.06%
宏平均 F1 (Macro F1): 77.79%
              precision    recall  f1-score   support

          童书     0.8934    0.9227    0.9078      6012
          小说     0.7892    0.8111    0.8000      4806
          传记     0.8161    0.8323    0.8241      4419
      计算机/网络     0.8217    0.8640    0.8423      3558
          法律     0.9013    0.8832    0.8921      3535
          外语     0.8640    0.8566    0.8603      3500
         心理学     0.8517    0.8636    0.8576      3138
          管理     0.7653    0.7937    0.7792      2782
       中小学用书     0.8059    0.7927    0.7993      2750
        工业技术     0.7548    0.7745    0.7645      2444
       体育/运动     0.9407    0.9500    0.9453      2420
          图书     0.8534    0.8569    0.8551      2411
          历史     0.6848    0.6888    0.6868      2375
          艺术     0.7514    0.7676    0.7594      2354
          医学     0.8069    0.7838    0.7952      2229
          文学     0.6360    0.6167    0.6262      2210
          经济     0.7197    0.7329    0.7263      2134
       亲子/家教     0.8562    0.8638    0.8600      2026
       动漫/幽默     0.8783    0.8752    0.8767      1971
       保健/养生     0.8030    0.8047    0.8038      1818
        投资理财     0.9032    0.9268    0.9149      1803
       烹饪/美食     0.8872    0.8907    0.8890      1784
       旅游/地图     0.8400    0.8330    0.8365      1784
          建筑     0.7292    0.7054    0.7171      1619
       时尚/美妆     0.9051    0.9039    0.9045      1478
       休闲/爱好     0.8975    0.8872    0.8923      1401
      手工/DIY     0.9315    0.9223    0.9268      1312
        社会科学     0.5822    0.5518    0.5666      1245
          文化     0.6781    0.6446    0.6609      1193
        科普读物     0.6997    0.7009    0.7003      1160
        自然科学     0.6621    0.6027    0.6310      1125
          古籍     0.7077    0.6706    0.6886      1029
       孕产/胎教     0.9476    0.9372    0.9424       907
          教材     0.5145    0.4574    0.4842       739
        两性关系     0.8299    0.8613    0.8453       555
       哲学/宗教     0.6494    0.6310    0.6401       496
       育儿/早教     0.7731    0.7207    0.7460       487
          考试     0.6809    0.5264    0.5938       454
       政治/军事     0.6278    0.5667    0.5957       390
         工具书     0.7018    0.6084    0.6517       383
       日文原版书     0.9969    0.9877    0.9923       326
       农业/林业     0.8243    0.8543    0.8390       302
       家庭/家居     0.8739    0.8375    0.8553       240
       其他小众书     0.6667    0.3423    0.4524       111

    accuracy                         0.8112     81215
   macro avg     0.7887    0.7706    0.7779     81215
weighted avg     0.8098    0.8112    0.8102     81215


```