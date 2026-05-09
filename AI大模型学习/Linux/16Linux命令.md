**上一级：** [[16-1Linux命令（课堂版）]]

**标签：** #Linux #命令 

---

# 一、Linux 基础与常用命令

## 学习目标

- 目标
  - 了解 Linux 的起源、发行版和基本哲学
  - 掌握 Linux 终端的基本操作（命令格式、通配符、帮助文档）
  - 学会常用的文件目录操作命令（ls、cd、pwd、mkdir、rm、cp、mv、touch）
  - 掌握文件查看命令（cat、less、head、tail）
  - 理解文件权限与链接的基本概念

---

## 1 Linux 简介

**Linux** 是一个免费、开源、类 Unix 的操作系统内核，由 Linus Torvalds 于 1991 年发布。基于 Linux 内核加上 GNU 工具集和各类应用软件，形成了各种 **Linux 发行版**（如 Ubuntu、CentOS、Debian、Red Hat、Fedora 等）。

- **特点**：多用户、多任务、稳定、安全、可定制、免费。
- **应用场景**：服务器、嵌入式设备、云计算、数据分析、开发环境、超级计算机等。

**Linux 哲学**：

- 一切皆文件（包括硬件、进程、目录等）
- 每个程序功能单一且做到极致
- 使用纯文本配置文件
- 尽量不产生交互界面（命令行为主）

---

## 2 终端与 Shell

- **终端（Terminal）**：用户与操作系统交互的界面。
- **Shell**：命令解释器，负责解析用户输入的命令并调用相应程序。常见 Shell：`bash`、`zsh`、`sh`。

```bash
# 查看当前 Shell
echo $SHELL

# 查看所有 Shell 类型
cat /etc/shells
```

---

## 3 命令基本格式

```bash
command [选项] [参数]
```

- 选项：以 `-`（短选项，如 `-l`）或 `--`（长选项，如 `--help`）开头
- 多个短选项可以合并：`ls -la` 等价于 `ls -l -a`

```bash
# 查看命令帮助
command --help
man command           # 查看手册（按 q 退出）
```

---

## 4 文件与目录操作命令

### 4.1 查看目录内容：`ls`

```bash
ls                # 列出当前目录内容
ls -l             # 详细列表（权限、大小、时间）
ls -a             # 显示所有文件（包括隐藏文件，以.开头）
ls -h             # 人类可读的文件大小（如 1K, 2M）
ls -R             # 递归列出子目录
ls -lt            # 按修改时间排序（最新在上）
ls -ltr           # 按时间逆序
ls -l /home       # 列出指定目录
```

---

### 4.2 切换目录：`cd`

```bash
cd /home/user     # 绝对路径
cd Documents      # 相对路径（当前目录下的 Documents）
cd ..             # 上级目录
cd ~              # 用户家目录
cd -              # 上次所在目录
```

---

### 4.3 显示当前目录：`pwd`

```bash
pwd               # 打印当前工作目录的绝对路径
```

---

### 4.4 创建目录：`mkdir`

```bash
mkdir dirname                 # 创建单级目录
mkdir -p parent/child/grand   # 递归创建多级目录
mkdir dir1 dir2 dir3          # 同时创建多个目录
```

---

### 4.5 删除文件或目录：`rm`

```bash
rm file.txt                   # 删除文件
rm -i file.txt                # 交互式确认
rm -r dirname                 # 递归删除目录及其内容
rm -f file.txt                # 强制删除（不提示）
rm -rf dirname                # 递归强制删除（危险操作！）
```

---

### 4.6 复制文件或目录：`cp`

```bash
cp source.txt dest.txt        # 复制文件
cp -i source.txt dest.txt     # 覆盖前提示
cp -r sourcedir destdir       # 递归复制目录
cp -a source dest             # 保持原属性（权限、时间等）复制
```

---

### 4.7 移动或重命名：`mv`

```bash
mv old.txt new.txt            # 重命名
mv file.txt /home/user/       # 移动文件到目录
mv dir1 dir2                  # 如果 dir2 不存在则重命名，存在则移动 dir1 到 dir2 内
```

---

### 4.8 创建空文件或更新时间戳：`touch`

```bash
touch newfile.txt             # 若文件不存在则创建空文件，若存在则更新修改时间
touch file1 file2             # 同时创建多个
```

---

## 5 文件内容查看命令

### 5.1 完整显示文件：`cat`

```bash
cat file.txt                  # 显示全部内容
cat file1 file2 > combined.txt # 合并文件
```

---

### 5.2 分页查看：`less` / `more`

```bash
less longfile.txt             # 分页查看（按空格下一页，b上一页，q退出）
more longfile.txt             # 类似但功能较少
```

---

### 5.3 查看头部/尾部：`head` / `tail`

```bash
head -n 20 file.txt           # 显示前20行，默认10行
tail -n 10 file.txt           # 显示后10行
tail -f logfile.log           # 实时跟踪文件新增内容（常用于日志）
```

---

## 6 通配符（Wildcards）

| 符号     | 含义                       |
| -------- | -------------------------- |
| `*`      | 匹配任意多个字符（含0个）  |
| `?`      | 匹配任意单个字符           |
| `[abc]`  | 匹配方括号中的任意一个字符 |
| `[a-z]`  | 匹配范围内的一个字符       |
| `[!abc]` | 不匹配括号内的任意字符     |

```bash
ls *.txt                      # 列出所有 .txt 文件
ls file?.log                  # 匹配 file1.log, fileA.log 等
ls [a-d]*.py                  # 以 a/b/c/d 开头的 .py 文件
```

---

## 7 文件权限与链接

### 7.1 查看权限

使用 `ls -l` 输出示例：

```
-rwxr-xr-- 1 user group 1234 Apr 28 10:00 script.sh
```

- 第一个字符：`-` 普通文件，`d` 目录，`l` 符号链接
- 后面9个字符：每3个一组，分别对应**所有者(u)**、**所属组(g)**、**其他用户(o)** 的权限
  - `r` 读（4），`w` 写（2），`x` 执行（1），`-` 无权限

---

### 7.2 修改权限：`chmod`

```bash
# 符号法
chmod u+x script.sh           # 给所有者添加执行权限
chmod g-w file.txt            # 移除所属组的写权限
chmod o=r file.txt            # 其他用户权限设为只读
chmod a+x script.sh           # 所有用户添加执行权限

# 数字法（权限相加）
chmod 755 script.sh           # 所有者 rwx(7)，组 r-x(5)，其他 r-x(5)
chmod 644 file.txt            # 所有者 rw-，组 r--，其他 r--
```

常用数字：`7=rwx`, `6=rw-`, `5=r-x`, `4=r--`, `0=---`

---

### 7.3 修改所有者：`chown` / `chgrp`

```bash
sudo chown user file.txt      # 修改文件所有者为 user
sudo chown user:group file.txt # 同时修改所有者和组
sudo chgrp group file.txt     # 仅修改所属组
```

---

### 7.4 硬链接与软链接

- **硬链接**：指向同一个 inode，删除原文件不影响链接，不能跨文件系统。
- **软链接（符号链接）**：指向原文件路径，类似 Windows 快捷方式，可跨文件系统。

```bash
ln source.txt hardlink.txt    # 创建硬链接
ln -s source.txt softlink.txt # 创建软链接
```

---

## 8 常用快捷键（bash）

| 快捷键     | 作用                   |
| ---------- | ---------------------- |
| `Ctrl + C` | 终止当前命令           |
| `Ctrl + D` | 退出当前终端（EOF）    |
| `Ctrl + L` | 清屏（相当于 `clear`） |
| `Ctrl + A` | 光标移动到行首         |
| `Ctrl + E` | 光标移动到行尾         |
| `Ctrl + U` | 删除光标前所有内容     |
| `Ctrl + K` | 删除光标后所有内容     |
| `Tab`      | 自动补全命令或路径     |
| `↑ / ↓`    | 浏览历史命令           |
| `Ctrl + R` | 反向搜索历史命令       |

---

## 9 小结

- Linux 是一个多用户、多任务的操作系统，核心思想是“一切皆文件”。
- 终端 + Shell（如 bash）是主要交互方式。
- 基本文件操作命令：`ls`、`cd`、`pwd`、`mkdir`、`rm`、`cp`、`mv`、`touch`
- 文件查看：`cat`、`less`、`head`、`tail`
- 通配符（`*`、`?`、`[]`）方便批量操作。
- 文件权限通过 `chmod`、`chown` 管理，权限分为读(r)、写(w)、执行(x)。
- 链接：硬链接（共享 inode）、软链接（快捷方式）。

---

## 第二部分：用户与权限管理、进程管理、软件包管理、网络配置

### 学习目标

- 目标
  - 掌握 Linux 用户和用户组的管理（增删改查）
  - 理解进程的概念，学会查看、管理进程
  - 掌握常用软件包管理工具（apt、yum、dnf、源码编译）
  - 学会基本的网络配置和网络诊断命令

---

## 1 用户与权限管理

### 1.1 用户管理

#### 1.1.1 查看用户信息

```bash
# 当前登录用户
whoami

# 查看所有用户（存储在 /etc/passwd）
cat /etc/passwd

# 查看用户详细信息
id username                 # 显示 UID、GID 及所属组

# 查看最近登录
last                        # 登录历史
lastlog                     # 每个用户最近登录
```

---

#### 1.1.2 添加/删除/修改用户

```bash
# 添加用户（需要 root 权限）
sudo useradd username       # 创建用户（不创建家目录，不设置密码）
sudo useradd -m username    # 创建家目录（-m）
sudo adduser username       # 交互式创建（Debian/Ubuntu 推荐）

# 设置/修改密码
sudo passwd username        # 然后输入两次新密码

# 删除用户
sudo userdel username       # 删除用户（保留家目录）
sudo userdel -r username    # 删除用户及其家目录和邮件

# 修改用户属性
sudo usermod -l newname oldname   # 修改用户名
sudo usermod -d /home/newhome -m username  # 修改家目录并移动内容
sudo usermod -s /bin/zsh username        # 修改登录 Shell
```

---

#### 1.1.3 用户组管理

```bash
# 查看组信息
cat /etc/group

# 添加组
sudo groupadd groupname

# 删除组
sudo groupdel groupname

# 将用户加入/移出组
sudo usermod -aG groupname username     # 追加到附加组（-a 必须）
sudo gpasswd -d username groupname      # 从组中移除用户

# 查看用户所属组
groups username
```

---

### 1.2 特殊权限与文件属性

#### 1.2.1 SUID、SGID、Sticky Bit

| 权限   | 作用                                                       |
| ------ | ---------------------------------------------------------- |
| SUID   | 执行该文件时，进程拥有文件所有者的权限（如 `passwd` 命令） |
| SGID   | 文件：执行时拥有所属组的权限；目录：新建文件继承目录的组   |
| Sticky | 目录下文件只能由所有者或 root 删除（常见于 `/tmp`）        |

```bash
# 设置 SUID（所有者执行位变为 s）
chmod u+s file

# 设置 SGID（组执行位变为 s）
chmod g+s dir

# 设置 Sticky（其他用户执行位变为 t）
chmod o+t dir

# 数字法（SUID=4, SGID=2, Sticky=1）
chmod 4755 file    # SUID+755
```

---

#### 1.2.2 查看文件扩展属性

```bash
lsattr file          # 查看扩展属性
chattr +i file       # 设置不可变（即使 root 也不能修改）
chattr -i file       # 移除不可变
```

---

### 1.3 sudo 权限配置

`sudo` 允许普通用户以 root（或其他用户）身份执行命令。

```bash
# 配置文件：/etc/sudoers（必须使用 visudo 编辑）
sudo visudo

# 示例行
username ALL=(ALL) ALL                     # 用户可执行任何命令
%groupname ALL=(ALL) ALL                   # 组成员可执行任何命令
username ALL=(ALL) NOPASSWD: /bin/systemctl restart nginx   # 免密执行特定命令
```

---

## 2 进程管理

### 2.1 查看进程

```bash
# 查看当前终端进程
ps

# 查看系统所有进程
ps aux                    # 显示详细信息（用户、CPU、内存、进程名等）
ps -ef                    # 标准格式

# 实时动态查看（交互式）
top                       # 按 q 退出
htop                      # 更美观（需安装）

# 查看特定进程（通过名称）
pgrep process_name        # 返回 PID
ps aux | grep process_name

# 查看进程树
pstree -p                 # 显示 PID
```

---

### 2.2 终止进程

```bash
kill PID                  # 发送 TERM 信号（正常终止）
kill -9 PID               # 强制终止（SIGKILL）
kill -15 PID              # 等同于 kill PID

# 按名称终止
pkill process_name        # 杀死所有匹配的进程
killall process_name      # 同上

# 交互式终止（选择进程）
top -p PID                # 在 top 中按 k，输入 PID
```

常用信号编号：

| 编号 | 名称    | 含义         |
| ---- | ------- | ------------ |
| 1    | SIGHUP  | 重新加载配置 |
| 2    | SIGINT  | Ctrl+C 中断  |
| 9    | SIGKILL | 强制终止     |
| 15   | SIGTERM | 正常终止     |

---

### 2.3 后台运行与作业控制

```bash
# 在命令后加 &，放入后台运行
long_command &

# 查看当前终端的后台作业
jobs

# 将后台作业调回前台
fg %job_id

# 将前台作业放入后台并暂停
Ctrl + Z
# 然后执行 bg 使其继续后台运行
bg %job_id

# nohup：忽略挂断信号（退出终端后继续运行）
nohup command &
# 输出默认写入 nohup.out
```

---

### 2.4 系统负载与资源监控

```bash
# 查看系统整体负载（1分钟、5分钟、15分钟平均）
uptime

# 查看内存使用
free -h                   # 人类可读

# 查看磁盘 I/O
iostat                    # 需安装 sysstat
dstat                     # 综合统计

# 查看打开文件
lsof                      # 列出打开的文件
lsof -i :80               # 查看使用 80 端口的进程
```

---

## 3 软件包管理

不同 Linux 发行版使用不同的包管理器：

| 发行版             | 包管理器   | 在线仓库命令 | 本地包安装  |
| ------------------ | ---------- | ------------ | ----------- |
| Debian / Ubuntu    | dpkg/apt   | `apt`        | `dpkg -i`   |
| Red Hat / CentOS 7 | rpm/yum    | `yum`        | `rpm -ivh`  |
| Fedora / CentOS 8+ | rpm/dnf    | `dnf`        | `rpm -ivh`  |
| Arch Linux         | pacman     | `pacman -S`  | `pacman -U` |
| openSUSE           | rpm/zypper | `zypper`     | `rpm -ivh`  |

---

### 3.1 Debian/Ubuntu (apt)

```bash
# 更新软件源列表
sudo apt update

# 升级所有已安装软件包
sudo apt upgrade

# 完整升级（包括内核）
sudo apt dist-upgrade

# 搜索软件包
apt search keyword
apt-cache search keyword

# 安装软件
sudo apt install package_name

# 卸载软件
sudo apt remove package_name          # 保留配置文件
sudo apt purge package_name           # 彻底删除（含配置）

# 自动删除无用的依赖
sudo apt autoremove

# 查看已安装包
apt list --installed

# 下载软件包源码（需开启源码源）
apt source package_name
```

---

### 3.2 Red Hat 系 (yum / dnf)

```bash
# 更新源
sudo yum check-update        # yum
sudo dnf check-update        # dnf

# 安装软件
sudo yum install package_name
sudo dnf install package_name

# 卸载
sudo yum remove package_name

# 搜索
yum search keyword

# 查询哪个包提供了某个文件
yum provides /path/to/file

# 清理缓存
sudo yum clean all
```

---

### 3.3 源码编译安装

```bash
# 1. 下载源码（如 tar.gz）
wget https://example.com/software.tar.gz
tar -xzf software.tar.gz
cd software

# 2. 配置（指定安装路径等）
./configure --prefix=/usr/local/software

# 3. 编译
make

# 4. 安装（需要 root）
sudo make install

# 5. 卸载（在源码目录）
sudo make uninstall
```

**常见依赖**：编译环境需要 `build-essential`（Debian）或 `Development Tools`（Red Hat）。

---

### 3.4 使用 snap / flatpak

```bash
# snap（跨发行版）
sudo snap install package_name
sudo snap remove package_name
snap list

# flatpak
flatpak install flathub org.example.App
flatpak run org.example.App
```

---

## 4 网络配置与诊断

### 4.1 查看网络配置

```bash
# 查看 IP 地址（传统）
ifconfig                     # 需安装 net-tools
# 新命令（推荐）
ip addr show                 # 或 ip a

# 查看路由表
route -n
ip route

# 查看网络连接状态
netstat -tulpn               # 显示监听端口
ss -tulpn                    # 更快的 netstat 替代
```

---

### 4.2 测试网络连通性

```bash
# 连通性测试
ping -c 4 google.com         # 发送 4 个包

# 跟踪路由
traceroute google.com        # 需安装 traceroute
tracepath google.com         # 更简单，无需 root

# 测试端口连通
telnet host port             # 连接指定端口（Ctrl+] 退出）
nc -zv host port             # netcat 扫描端口
```

---

### 4.3 DNS 解析

```bash
# 查询域名解析
nslookup google.com
dig google.com               # 更详细信息

# 查看 DNS 配置
cat /etc/resolv.conf
```

---

### 4.4 网络服务管理（systemd）

```bash
# 查看服务状态
systemctl status network.service   # 或 NetworkManager
systemctl status sshd

# 启动/停止/重启服务
sudo systemctl start service_name
sudo systemctl stop service_name
sudo systemctl restart service_name

# 设置开机自启
sudo systemctl enable service_name
sudo systemctl disable service_name
```

---

### 4.5 防火墙管理

```bash
# iptables（传统）
sudo iptables -L -n          # 查看规则

# firewalld（CentOS 7+）
sudo firewall-cmd --state
sudo firewall-cmd --list-all
sudo firewall-cmd --add-port=8080/tcp --permanent
sudo firewall-cmd --reload

# ufw（Ubuntu 简易防火墙）
sudo ufw status
sudo ufw allow 22/tcp
sudo ufw enable
```

---

### 4.6 常用网络诊断组合

```bash
# 排查连接问题
ping ip                     # 检查连通性
traceroute ip               # 检查路由
telnet ip port              # 检查端口
nslookup domain             # 检查 DNS

# 抓包分析
sudo tcpdump -i eth0 -nn -c 100   # 抓取 100 个包
sudo tcpdump -i eth0 port 80 -w capture.pcap   # 保存文件，用 Wireshark 分析
```

---

## 5 小结

- **用户与权限**：
  - 用户信息存储在 `/etc/passwd`，密码在 `/etc/shadow`
  - 命令：`useradd`、`usermod`、`userdel`、`passwd`、`groupadd`、`chmod`、`chown`
  - 特殊权限：SUID(4)、SGID(2)、Sticky(1)
- **进程管理**：
  - `ps aux`、`top`、`htop` 查看进程
  - `kill`、`pkill` 终止进程
  - 后台运行：`&`、`jobs`、`fg`、`bg`、`nohup`
- **软件包管理**：
  - Debian 系：`apt`、`dpkg`
  - Red Hat 系：`yum` / `dnf`、`rpm`
  - 源码编译：`./configure` → `make` → `make install`
- **网络配置**：
  - `ip addr`、`ip route` 查看配置
  - `ping`、`traceroute`、`netstat`/`ss` 诊断
  - systemd 服务管理：`systemctl`
  - 防火墙：`iptables`、`firewalld`、`ufw`

---

## 第三部分：Shell 脚本编程、文本处理工具、计划任务与系统日志

### 学习目标

- 目标
  - 掌握 Shell 脚本的基本语法（变量、条件判断、循环、函数）
  - 学会使用正则表达式进行文本匹配
  - 精通文本处理三剑客：grep、sed、awk
  - 了解计划任务（cron）的配置与使用
  - 理解系统日志的查看与管理

---

## 1 Shell 脚本编程

Shell 脚本是一个包含多条命令的文本文件，通过解释器（如 bash）执行，可自动化重复任务。

### 1.1 脚本基本结构

```bash
#!/bin/bash
# 这是注释
echo "Hello, World!"
```

- `#!/bin/bash`：Shebang，指定解释器路径。
- 赋予执行权限：`chmod +x script.sh`
- 执行：`./script.sh` 或 `bash script.sh`

---

### 1.2 变量

```bash
# 定义变量（等号两边不能有空格）
name="John"
age=25

# 使用变量（$ 符号）
echo $name
echo ${name}   # 花括号用于明确边界，推荐

# 只读变量
readonly pi=3.14

# 删除变量
unset age
```

**特殊变量**：

| 变量    | 含义                          |
| ------- | ----------------------------- |
| `$0`    | 脚本名称                      |
| `$1-$9` | 位置参数（第1~9个参数）       |
| `$#`    | 参数个数                      |
| `$@`    | 所有参数（作为独立字符串）    |
| `$*`    | 所有参数（作为单个字符串）    |
| `$?`    | 上一条命令的退出状态（0成功） |
| `$$`    | 当前 Shell 进程 ID            |

---

### 1.3 输入与输出

```bash
# 输出
echo "text"
printf "格式化输出: %s %d\n" "score" 100

# 输入
read -p "请输入姓名: " username
echo "你好, $username"
```

---

### 1.4 条件判断

```bash
# if 语句
if [ condition ]; then
    commands
elif [ condition2 ]; then
    commands
else
    commands
fi

# 数值比较
[ $a -eq $b ]  # 等于
[ $a -ne $b ]  # 不等于
[ $a -gt $b ]  # 大于
[ $a -lt $b ]  # 小于
[ $a -ge $b ]  # 大于等于
[ $a -le $b ]  # 小于等于

# 字符串比较
[ "$str1" = "$str2" ]   # 相等（等号两边有空格）
[ -z "$str" ]           # 字符串为空
[ -n "$str" ]           # 字符串非空

# 文件测试
[ -f file ]    # 是否为普通文件
[ -d dir ]     # 是否为目录
[ -x file ]    # 是否可执行
[ -r file ]    # 是否可读
[ -w file ]    # 是否可写
[ -e file ]    # 是否存在

# 逻辑运算
[ condition1 ] && [ condition2 ]   # 与
[ condition1 ] || [ condition2 ]   # 或
! [ condition ]                    # 非
```

---

### 1.5 循环结构

```bash
# for 循环
for i in 1 2 3 4 5; do
    echo "Number: $i"
done

for i in {1..10}; do           # 花括号扩展
    echo $i
done

for file in *.txt; do
    echo "处理文件: $file"
done

# C 风格 for
for ((i=0; i<10; i++)); do
    echo $i
done

# while 循环
count=1
while [ $count -le 5 ]; do
    echo $count
    ((count++))
done

# until 循环（条件为假时执行）
until [ $count -gt 5 ]; do
    echo $count
    ((count++))
done
```

---

### 1.6 case 多分支

```bash
case $1 in
    start)
        echo "Starting..."
        ;;
    stop)
        echo "Stopping..."
        ;;
    restart)
        echo "Restarting..."
        ;;
    *)
        echo "Usage: $0 {start|stop|restart}"
        exit 1
        ;;
esac
```

---

### 1.7 函数

```bash
# 定义函数
function say_hello() {
    echo "Hello, $1"   # $1 是函数第一个参数
    return 0           # 返回码（0-255）
}

# 调用
say_hello "Alice"

# 获取返回值
result=$(say_hello "Bob")
echo $result
```

---

### 1.8 常用技巧

```bash
# 命令替换
current_date=$(date +%Y-%m-%d)
files_count=$(ls | wc -l)

# 算术运算
sum=$((10 + 20))
((sum++))

# 调试模式
set -x    # 开启调试（打印每条命令）
set +x    # 关闭调试
# 或在脚本首行添加 #!/bin/bash -x

# 防止变量未定义
set -u

# 脚本出错立即退出
set -e
```

---

## 2 正则表达式（Regular Expression）

正则表达式是用于匹配文本模式的字符串，常与 grep、sed、awk 等工具结合使用。

---

### 2.1 基本正则表达式（BRE）元字符

| 元字符 | 含义                       |
| ------ | -------------------------- |
| `.`    | 匹配任意单个字符（除换行） |
| `*`    | 匹配前一个字符 0 次或多次  |
| `^`    | 匹配行首                   |
| `$`    | 匹配行尾                   |
| `[]`   | 匹配方括号中的任意一个字符 |
| `[^]`  | 匹配不在括号中的字符       |
| `\`    | 转义字符                   |
| `\<`   | 词首（某些工具支持）       |
| `\>`   | 词尾                       |

---

### 2.2 扩展正则表达式（ERE）

增加以下元字符（`grep -E` 或 `egrep`）：

| 元字符  | 含义                       |
| ------- | -------------------------- |
| `+`     | 匹配前一个字符 1 次或多次  |
| `?`     | 匹配前一个字符 0 次或 1 次 |
| `{n}`   | 匹配 n 次                  |
| `{n,}`  | 至少 n 次                  |
| `{n,m}` | n 到 m 次                  |
| `\|`    | 或（逻辑 OR）              |
| `()`    | 分组                       |

---

### 2.3 常用正则示例

| 正则表达式                   | 匹配内容                |
| ---------------------------- | ----------------------- |
| `^[0-9]+$`                   | 纯数字行                |
| `^[a-zA-Z]`                  | 以字母开头的行          |
| `\.txt$`                     | 以 .txt 结尾的行        |
| `^$`                         | 空行                    |
| `[0-9]{4}-[0-9]{2}-[0-9]{2}` | 日期格式 YYYY-MM-DD     |
| `^[^#]`                      | 非注释行（不以 # 开头） |
| `\<the\>`                    | 单词 the（非包含）      |

---

## 3 文本处理三剑客：grep、sed、awk

### 3.1 grep – 文本搜索

```bash
# 基本用法
grep pattern file.txt

# 常用选项
grep -i "error" log.txt      # 忽略大小写
grep -v "debug" log.txt      # 反向匹配（不包含）
grep -r "TODO" ./src/        # 递归搜索目录
grep -n "func" main.py       # 显示行号
grep -c "success" *.log      # 只输出匹配行数
grep -l "error" *.log        # 只输出包含匹配的文件名
grep -E "error|fatal" log.txt # 扩展正则（等价于 egrep）
grep -o "[0-9]\{3\}" file    # 只输出匹配部分

# 从管道读取
ps aux | grep "python"
```

---

### 3.2 sed – 流编辑器（非交互式）

sed 用于文本替换、删除、插入、打印等。

**常用命令**：

```bash
# 替换（s 命令）
sed 's/old/new/' file.txt          # 替换每行第一个匹配
sed 's/old/new/g' file.txt         # 全局替换
sed 's/old/new/2' file.txt         # 替换每行第二个匹配
sed 's/old/new/gi' file.txt        # 忽略大小写

# 原地修改文件（-i 选项）
sed -i 's/foo/bar/g' file.txt      # 直接修改文件
sed -i.bak 's/foo/bar/g' file.txt  # 备份后修改

# 删除行（d 命令）
sed '3d' file.txt                  # 删除第3行
sed '/pattern/d' file.txt          # 删除匹配的行
sed '2,5d' file.txt                # 删除2~5行

# 打印行（p 命令，常与 -n 配合）
sed -n '10p' file.txt              # 打印第10行
sed -n '/error/p' log.txt          # 打印匹配行

# 插入/追加（i 和 a）
sed '2i\New line' file.txt         # 在第2行前插入
sed '2a\New line' file.txt         # 在第2行后追加

# 多个编辑（-e）
sed -e 's/foo/bar/' -e 's/baz/qux/' file.txt
```

---

### 3.3 awk – 文本处理编程语言

awk 擅长对列进行操作和格式化输出。

```bash
# 基本结构：awk 'pattern { action }' file

# 打印整行
awk '{print}' file.txt

# 打印某列（$1 第一列，$2 第二列，$NF 最后一列）
awk '{print $1, $3}' file.txt

# 指定分隔符（默认空白，-F 选项）
awk -F: '{print $1}' /etc/passwd
awk -F',' '{print $2}' data.csv

# 条件过滤
awk '$3 > 50' scores.txt           # 第3列大于50的行
awk '/error/ {print $0}' log.txt   # 匹配 error 的行

# 内置变量
NR    # 当前行号
NF    # 当前行的字段数
FS    # 输入字段分隔符
OFS   # 输出字段分隔符

# 示例：打印行号和内容
awk '{print NR ": " $0}' file.txt

# 支持 BEGIN / END 块
awk 'BEGIN {print "Start"} {print $0} END {print "End"}' file.txt

# 计算总和
awk '{sum += $1} END {print "Total:", sum}' nums.txt

# 模式匹配
awk '$1 ~ /^a/ {print}' file.txt   # 第一列以 a 开头
```

---

## 4 计划任务（Cron）

### 4.1 用户级 cron

```bash
# 编辑当前用户的 crontab
crontab -e

# 查看当前用户的 crontab
crontab -l

# 删除当前用户的 crontab
crontab -r
```

---

### 4.2 Crontab 时间格式

```
* * * * * command_to_execute
┬ ┬ ┬ ┬ ┬
│ │ │ │ └── 星期几（0-7，0和7都代表周日）
│ │ │ └──── 月份（1-12）
│ │ └────── 日期（1-31）
│ └──────── 小时（0-23）
└────────── 分钟（0-59）
```

**特殊符号**：

- `*` ：任意值
- `,` ：列举多个值，如 `1,3,5`
- `-` ：范围，如 `1-5`
- `/` ：步长，如 `*/10` 每10分钟

---

### 4.3 常用示例

```bash
# 每天凌晨 2:30 执行脚本
30 2 * * * /home/user/backup.sh

# 每周一上午 9:00
0 9 * * 1 /usr/bin/command

# 每 15 分钟
*/15 * * * * command

# 每月 1 日凌晨执行
0 0 1 * * command

# 每小时的第 5 分钟
5 * * * * command

# 重启后执行一次
@reboot /path/to/script
```

---

### 4.4 系统级 cron

- `/etc/crontab`：系统 crontab 文件（需指定用户）
- `/etc/cron.d/`：存放额外 crontab 配置文件
- `/etc/cron.hourly/`、`/etc/cron.daily/`、`/etc/cron.weekly/`、`/etc/cron.monthly/`：放置脚本，由 `run-parts` 调用

---

### 4.5 日志与调试

```bash
# cron 日志位置（不同发行版可能不同）
tail -f /var/log/syslog | grep CRON      # Ubuntu/Debian
tail -f /var/log/cron                    # CentOS/RHEL

# 检查 cron 服务状态
systemctl status cron        # Debian/Ubuntu
systemctl status crond       # CentOS
```

---

## 5 系统日志管理

### 5.1 日志存放位置（常见）

| 日志文件            | 作用                       |
| ------------------- | -------------------------- |
| `/var/log/syslog`   | 系统综合日志（Ubuntu）     |
| `/var/log/messages` | 系统综合日志（CentOS）     |
| `/var/log/auth.log` | 认证授权日志（登录、sudo） |
| `/var/log/secure`   | 安全相关日志（CentOS）     |
| `/var/log/kern.log` | 内核日志                   |
| `/var/log/dmesg`    | 开机自检信息               |
| `/var/log/boot.log` | 系统启动日志               |
| `/var/log/cron`     | cron 任务日志              |
| `/var/log/nginx/`   | Web 服务器日志             |

---

### 5.2 查看日志

```bash
# 实时查看
tail -f /var/log/syslog

# 分页查看
less /var/log/syslog

# 搜索
grep "error" /var/log/syslog

# 查看启动日志
dmesg | less
journalctl -xe              # systemd 日志（推荐）
```

---

### 5.3 日志轮转（logrotate）

- 配置文件：`/etc/logrotate.conf` 和 `/etc/logrotate.d/` 下的文件
- 作用：自动压缩、删除、轮转旧日志，防止磁盘占满

```bash
# 查看 logrotate 状态
cat /var/lib/logrotate/status

# 手动执行
logrotate -f /etc/logrotate.conf
```

**示例配置文件** `/etc/logrotate.d/nginx`：

```
/var/log/nginx/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    create 640 nginx adm
    sharedscripts
    postrotate
        [ -f /var/run/nginx.pid ] && kill -USR1 `cat /var/run/nginx.pid`
    endscript
}
```

---

### 5.4 systemd 日志（journalctl）

```bash
# 查看所有日志
journalctl

# 查看本次启动以来的日志
journalctl -b

# 查看特定服务的日志
journalctl -u ssh.service

# 实时跟踪
journalctl -f

# 按时间筛选
journalctl --since "2025-04-01 00:00:00" --until "2025-04-02"

# 显示最后 n 行
journalctl -n 50
```

---

## 6 小结

- **Shell 脚本**：
  - Shebang、变量、条件（`if`、`case`）、循环（`for`、`while`）、函数
  - 特殊变量（`$?`、`$#`、`$@` 等）、运算、命令替换
- **正则表达式**：
  - BRE：`.`, `*`, `^`, `$`, `[]`, `[^]`
  - ERE：`+`, `?`, `{}`, `|`, `()`
- **文本处理三剑客**：
  - `grep`：搜索匹配行（`-i`, `-v`, `-r`, `-n`）
  - `sed`：替换、删除、插入（`s///`, `d`, `p`, `i`, `a`）
  - `awk`：列操作、格式化输出、内置变量（`$1`, `NF`, `NR`）
- **计划任务**：
  - `crontab -e` 编辑用户任务
  - 时间格式：分 时 日 月 周
- **系统日志**：
  - 日志文件位置（`/var/log/`）
  - `tail -f`、`grep`、`journalctl` 查看
  - logrotate 实现日志轮转
