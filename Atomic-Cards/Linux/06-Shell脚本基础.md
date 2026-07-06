---
author: "XunZong"
created: "2026-07-06"
tags: ["Linux", "Shell", "脚本"]
aliases: ["Shell脚本", "bash", "Shell编程"]
---

# Shell 脚本基础

## 定义

Shell 脚本是将一系列 Linux 命令写入文件，实现**自动化任务**的编程方式。常见的 Shell 有 `bash`（默认）、`zsh`、`sh`。

## 脚本结构

```bash
#!/bin/bash
# 第一行 shebang 指定解释器

# 注释以 # 开头
echo "Hello, AI World!"
```

## 变量

```bash
# 定义变量（等号两边不能有空格）
name="GPT"
echo $name          # 使用变量加 $
echo ${name}4o      # 花括号界定变量名边界

# 系统变量
echo $HOME           # /home/user
echo $SHELL          # /bin/bash
echo $PATH           # 可执行文件搜索路径
echo $CUDA_VISIBLE_DEVICES  # GPU 编号设置
```

## 特殊变量

| 变量 | 含义 | 示例 |
|------|------|------|
| `$0` | 脚本文件名 | `./train.sh` |
| `$1`, `$2`, ... | 第 1/2/... 个参数 | |
| `$#` | 参数个数 | |
| `$@` | 所有参数列表 | |
| `$?` | 上一条命令的退出码（0=成功） | |
| `$$` | 当前进程 PID | |

## 条件与循环

```bash
# if 条件
if [ -f "$file" ]; then
    echo "File exists"
elif [ -d "$dir" ]; then
    echo "Directory exists"
else
    echo "Not found"
fi

# for 循环
for lr in 0.01 0.001 0.0001; do
    python train.py --lr $lr
done

# while 循环（自动重试）
while [ $? -ne 0 ]; do
    python train.py
done
```

## 常用判断条件

| 条件 | 含义 | 条件 | 含义 |
|------|------|------|------|
| `-f "$file"` | 是否为文件 | `-d "$dir"` | 是否为目录 |
| `-e "$path"` | 是否存在 | `-z "$var"` | 变量是否为空 |
| `$a -eq $b` | 数值相等 | `$a -lt $b` | 数值小于 |
| `"$a" = "$b"` | 字符串相等 | `"$a" != "$b"` | 字符串不等 |

## ML 自动化脚本示例

```bash
#!/bin/bash
# 自动训练脚本：遍历多种配置
EXPERIMENT_DIR="./experiments/$(date +%Y%m%d_%H%M)"
mkdir -p $EXPERIMENT_DIR

for lr in 1e-3 5e-4 1e-4; do
    echo "=== Training with lr=$lr ==="
    python train.py \
        --lr $lr \
        --batch_size 32 \
        --epochs 50 \
        --log_dir $EXPERIMENT_DIR/lr_$lr \
        > $EXPERIMENT_DIR/lr_$lr/log.txt 2>&1

    if [ $? -ne 0 ]; then
        echo "Training failed at lr=$lr" | tee -a $EXPERIMENT_DIR/errors.log
    fi
done

echo "All experiments completed!"
```

> 参见 [[02-文件与目录操作]]、[[05-进程管理]]、[[03-文本处理三剑客]]
