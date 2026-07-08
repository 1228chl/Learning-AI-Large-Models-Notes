

---

# RandomForest 模型训练

## 一、Config 配置文件

在项目中创建一个名为 `config.py` 的配置文件，用于给随机森林模型来调用

- 主要包含各种数据集地址
	- `train_path`：训练集
	- `test_path`：测试集
	- `dev_path`：验证集
	- `class_path`：类别标签文件
	- `stop_words_path`：停用词表
	- `process_train_path`：训练集预处理后路径
	- `process_test_path`：测试集预处理后路径
	- `process_dev_path`：验证集预处理后路径
	- `rf_save_model_path`：随机森林模型保存路径
	- `tfidf_save_path`：TF-IDF 特征保存路径

**实际代码**：

```python
class Config:
    def __init__(self):
        self.root_path = r''
        self.train_path = self.root_path + r''
        self.test_path = self.root_path + r''
        self.dev_path = self.root_path + r''
        self.class_path = self.root_path + r''
        self.stop_words_path = self.root_path + r''
        
        self.process_train_path = self.root_path + r''
        self.process_test_path = self.root_path + r''
        self.process_dev_path = self.root_path + r''
        
        self.rf_save_model_path = self.root_path + r''
        self.tfidf_save_path = self.root_path + r''
```

## 二、数据分词并存储

在项目中创建一个 `process_data.py` 的文件进行数据的预处理

- 导入相应模块
- 定义`process_data`函数
- 进行预处理

**实际代码**：

```python
import pandas as pd
import jieba
from config import Config

config = Config()

def process_data(base_path, process_path):
    df_data = pd.read_csv(base_path, sep='\t', names=['text', 'label'])
    df_data['words'] = df_data['text'].apply(lambda x: " ".join(jieba.lcut(x)))
    df_data.to_csv(process_path, sep='\t', index=False, header=True)

if __name__ == '__main__':
    process_data(config.train_path,config.process_train_path)
    process_data(config.test_path,config.process_test_path)
    process_data(config.dev_path,config.process_dev_path)
```

## 随机森林模型训练
