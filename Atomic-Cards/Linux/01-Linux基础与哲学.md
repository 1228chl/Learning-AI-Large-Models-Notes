---
author: "XunZong"
created: "2026-07-06"
tags: ["Linux", "操作系统", "基础"]
aliases: ["Linux", "Linux基础", "Linux哲学"]
---

# Linux 基础与哲学

## 定义

Linux 是一个免费、开源、类 Unix 的操作系统内核，由 Linus Torvalds 于 1991 年发布。基于 Linux 内核加上 GNU 工具集，形成了各种 **Linux 发行版**（如 Ubuntu、CentOS、Debian 等）。

**特点**：多用户、多任务、稳定、安全、可定制、免费。

**应用场景**：服务器（90%+ 互联网服务器）、嵌入式设备、云计算、AI 训练集群、超级计算机（TOP500 中 99% 运行 Linux）。

## Linux 哲学

| 原则 | 含义 | 体现 |
|------|------|------|
| **一切皆文件** | 硬件、进程、套接字等都以文件形式提供接口 | `/dev/sda`（磁盘）、`/proc/cpuinfo`（CPU信息） |
| **单一职责** | 每个程序只做一件事，且做到极致 | `ls` 只列目录，`grep` 只搜索文本 |
| **纯文本配置** | 系统配置使用纯文本文件 | `/etc/ssh/sshd_config`、`/etc/nginx/nginx.conf` |
| **命令行优先** | CLI 比 GUI 更高效、更适合脚本化 | Shell 脚本、cron 定时任务、CI/CD 流水线 |

## ML 工程师必备的 Linux 能力

| 场景 | 涉及命令 | 说明 |
|------|----------|------|
| **服务器运维** | `ssh`、`scp`、`screen` / `tmux` | 远程连接、传输文件、保持会话 |
| **环境配置** | `apt` / `yum`、`pip`、`conda`、`docker` | 安装 CUDA、Python、PyTorch 等 |
| **数据管理** | `wget`、`tar`、`gzip`、`rsync` | 下载数据集、解压、同步 |
| **GPU 监控** | `nvidia-smi`、`nvtop`、`nvitop` | 查看 GPU 利用率、显存占用 |
| **日志分析** | `tail -f`、`grep`、`awk`、`less` | 查看训练日志、过滤错误 |
| **进程管理** | `ps`、`kill`、`nohup`、`systemctl` | 管理训练进程、后台运行 |
| **资源监控** | `top` / `htop`、`df -h`、`free -h` | CPU/内存/磁盘监控 |

> 参见 [[02-文件与目录操作]]、[[03-文本处理三剑客]]、[[04-权限管理]]
