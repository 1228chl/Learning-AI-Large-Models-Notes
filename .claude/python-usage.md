# Python 使用规范

## 解释器路径

```
G:\Software\Python\python.exe
```

禁止使用 `python3`、`py`、`py.exe` —— Windows Store 重定向导致 exit code 49。

## 执行方式

### ✅ 正确：写文件后执行

```bash
G:\Software\Python\python.exe /tmp/script.py
```

### ✅ 正确：单引号 -c

```bash
G:\Software\Python\python.exe -c 'print("hello")'
```

### ❌ 错误：双引号 -c

```bash
# 以下会触发 bash 转义，\\ 先被 bash 吃一层
G:\Software\Python\python.exe -c "lines[0] = '... \\alpha ...'"
# 结果：\\alpha → \alpha → Python 的 \a 被解释为 bell 字符
```

### ✅ 正确：heredoc

```bash
G:\Software\Python\python.exe << 'EOF'
print("hello")
EOF
```

## 工具选择原则

| 场景 | 工具 | 理由 |
|:-----|:-----|:-----|
| 修改 1 个文件 | `Edit` 精确替换 | 零工具链开销 |
| 批量 >10 文件 | Python 脚本 `glob` 遍历 | 0 Token，一次性 |
| 2-10 文件 | 机械替换用脚本，否则逐个 Edit | 视内容是否完全相同决定 |
