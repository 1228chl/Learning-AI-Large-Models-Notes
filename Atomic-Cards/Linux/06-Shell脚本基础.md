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

## 面试追问

**Q1（基础）**：Shell 脚本中 `$0`、`$1`、`$#`、`$@`、`$?` 分别代表什么？写一个简单的参数处理示例。

**回答要点**：1）`$0` 是脚本文件名，`$1` 是第一个参数，`$#` 是参数个数，`$@` 是所有参数的列表，`$?` 是上条命令的退出码（0 成功，非 0 失败）；2）示例：`if [ $# -lt 1 ]; then echo "Usage: $0 <config>"; exit 1; fi; echo "Using config: $1"`；3）最佳实践：用变量存储参数（`config=$1`）提高可读性，参数较多时建议用 getopts 处理。

**Q2（深挖）**：Shell 中 `[ ]`、`[[ ]]`、`(( ))` 三种条件判断有什么区别？

**回答要点**：1）`[ ]` 是 test 命令的简写，POSIX 标准兼容，变量需加双引号防止分词（`[ "$var" = "abc" ]`）；2）`[[ ]]` 是 bash 扩展关键字，支持模式匹配（`[[ $var == a* ]]`）、正则匹配（`[[ $var =~ ^[0-9]+$ ]]`）、安全处理空变量（无需引号）；3）`(( ))` 专用于整数算术运算（`(( a > 10 && b < 5 ))`），返回退出码，内部变量无需 $ 前缀；4）推荐：脚本追求可移植用 `[ ]`，bash 环境用 `[[ ]]` 更安全和易读。

**Q3（实战）**：写一个 ML 实验中自动遍历超参数的 Shell 脚本框架，需要包含哪些关键要素？

**回答要点**：1）shebang（#!/bin/bash）和 set -eux 选项提高安全性；2）循环枚举参数组合：`for lr in 0.01 0.001 0.0001; do for bs in 32 64; do ... done; done`；3）每次实验创建独立目录（`mkdir -p exp/lr_$lr/bs_$bs`）；4）记录 PID 和日志：`nohup python train.py --lr $lr --bs $bs > $logdir/train.log 2>&1 & echo $! > $logdir/pid.txt`；5）检测退出码处理失败：`if [ $? -ne 0 ]; then echo "Failed: lr=$lr, bs=$bs" >> errors.log; fi`。

**Q4（边界）**：Shell 脚本在生产环境中的主要缺陷是什么？如何弥补？

**回答要点**：1）缺陷：默认不会检测未定义变量（需 set -u）；管道中非最后一个命令的失败会被忽略（需 set -o pipefail）；不支持浮点运算（需依赖 bc/awk）；调试困难（无类型检查、异常堆栈不清晰）；2）弥补措施：脚本开头加 `set -euo pipefail`；使用 shellcheck 静态检查；复杂逻辑改由 Python/Go 实现；关键操作加错误处理和日志；使用 bats 编写单元测试。

> 理解前置知识可参见 [进程管理](./05-进程管理.md)；理解前置知识可参见 [文件与目录操作](./02-文件与目录操作.md)；理解前置知识可参见 [文本处理三剑客](./03-文本处理三剑客.md)；理解前置知识可参见 [Linux基础与哲学](./01-Linux基础与哲学.md)