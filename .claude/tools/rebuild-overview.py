#!/usr/bin/env python3
"""Rebuild 卡片总览.md with correct paths including subdirectories."""
import os, re, sys
sys.stdout.reconfigure(encoding='utf-8')
from collections import defaultdict

BASE = "G:/AI-Learning/Atomic-Cards"
os.chdir(BASE)

# Scan all card files to build the structure
categories = defaultdict(list)  # category_name -> [(subdir, num, name, rel_path)]

for root, _, files in os.walk("."):
    for f in files:
        if not f.endswith(".md") or f in ("卡片总览.md", "原子化生成提示词.md"):
            continue
        fp = os.path.normpath(os.path.join(root, f))
        parts = fp.split(os.sep)
        # parts example: ['线性代数', '向量', '01-向量基础.md']
        category = parts[0] if len(parts) >= 2 else ""
        subdir = parts[1] if len(parts) >= 3 else ""

        # Extract number and name
        m = re.match(r"(\d+)-(.+)\.md$", f)
        if m:
            num = int(m.group(1))
            name = m.group(2)
            # Build relative path for the overview (from Atomic-Cards/)
            rel_path = fp.replace("\\", "/")
            categories[category].append((subdir, num, name, rel_path))

# Sort categories in display order
display_order = [
    "线性代数", "微积分与优化", "概率统计", "Python", "Linux", "包管理",
    "数据库", "数据结构与算法", "机器学习", "深度学习", "NLP", "数据分析",
    "AI-Agent", "工程实践", "知识体系"
]

# Subdirectory display names (for subdir name -> display name)
subdir_names = {
    "向量": "向量", "矩阵": "矩阵", "特征分解": "特征分解", "应用": "应用",
    "OOP": "OOP", "并发": "并发", "工具": "工具",
    "SQL": "SQL", "Redis": "Redis", "Milvus": "Milvus", "检索": "检索",
    "基础结构": "基础", "树堆图": "树与图", "算法": "算法",
    "基础": "基础", "监督学习": "监督学习", "集成学习": "集成学习",
    "聚类": "聚类", "降维": "降维", "特征工程": "特征工程",
    "正则化": "正则化", "LLM评估": "LLM评估",
    "PyTorch": "PyTorch", "CNN-RNN": "CNN/RNN", "模型压缩": "模型压缩",
    "迁移学习": "迁移学习",
    "架构": "架构", "预训练": "预训练", "组件": "组件", "任务": "任务",
    "RAG流程": "RAG流程", "LangChain": "LangChain", "平台": "平台",
    "协作": "协作", "系统": "系统",
    "Docker": "Docker", "部署": "部署", "网络": "网络", "硬件": "硬件"
}

lines = []
lines.append("---")
lines.append('author: "XunZong"')
lines.append('created: "2026-07-07"')
lines.append('tags: ["知识体系", "总览", "目录"]')
lines.append('aliases: ["卡片总览", "知识目录", "Atomic Cards Index"]')
lines.append("---")
lines.append("")
lines.append("# AI-Learning 原子卡片总览")
total = sum(len(v) for v in categories.values())
lines.append("")
lines.append(f"> 共计 **{total} 张** 原子卡片，覆盖 **15 个分类**，系统化构建 AI 知识体系。")
lines.append("")
lines.append("---")
lines.append("")

for cat in display_order:
    cards = sorted(categories.get(cat, []), key=lambda x: x[1])  # sort by number

    # Group by subdirectory
    subdir_groups = defaultdict(list)
    flat_cards = []
    for subdir, num, name, rel_path in cards:
        if subdir:
            subdir_groups[subdir].append((num, name, rel_path))
        else:
            flat_cards.append((num, name, rel_path))

    cat_display = f"{cat}（{len(cards)} 张）"
    lines.append(f"## {cat_display}")
    lines.append("")

    if flat_cards:
        # Cards without subdirectory (flat categories)
        lines.append("| 编号 | 卡片 |")
        lines.append("|:----:|:-----|")
        for num, name, rel_path in flat_cards:
            display_name = name
            lines.append(f"| {num:02d} | [{display_name}]({rel_path}) |")

    # For categories with subdirectories
    if subdir_groups:
        # Group cards by subdirectory, display with sub-headers
        for subdir in sorted(subdir_groups.keys()):
            group_cards = sorted(subdir_groups[subdir], key=lambda x: x[0])
            sub_label = subdir_names.get(subdir, subdir)
            line_cards = []
            for num, name, rel_path in group_cards:
                display_name = name
                line_cards.append((num, display_name, rel_path))

            # Check if we can do 2-column table
            if len(line_cards) <= 2:
                # Simple single column
                lines.append(f"**{sub_label}**")
                lines.append("")
                lines.append("| 编号 | 卡片 |")
                lines.append("|:----:|:-----|")
                for num, display_name, rel_path in line_cards:
                    lines.append(f"| {num:02d} | [{display_name}]({rel_path}) |")
            else:
                # Two-column table
                lines.append(f"**{sub_label}**")
                lines.append("")
                lines.append("| 编号 | 卡片 | 编号 | 卡片 |")
                lines.append("|:----:|:-----|:----:|:-----|")
                half = (len(line_cards) + 1) // 2
                for i in range(half):
                    n1, d1, r1 = line_cards[i]
                    left = f"| {n1:02d} | [{d1}]({r1})"
                    if i + half < len(line_cards):
                        n2, d2, r2 = line_cards[i + half]
                        right = f" | {n2:02d} | [{d2}]({r2}) |"
                    else:
                        right = " | - | - |"
                    lines.append(left + right)

    lines.append("")
    lines.append("---")
    lines.append("")

# Add core dependency chain
lines.append("## 核心依赖链")
lines.append("")
lines.append("```")
lines.append("线性代数 ─┐")
lines.append("微积分  ──┤")
lines.append("概率统计 ─┘")
lines.append("     │")
lines.append("     ├──→ 数据结构与算法")
lines.append("     │")
lines.append("     └──→ 机器学习 ──→ 深度学习 ──→ NLP")
lines.append("                 │               │")
lines.append("                 │               └──→ AI-Agent")
lines.append("                 │")
lines.append("                 └──→ 工程实践（Python / Linux / 数据库 / Docker / GPU）")
lines.append("```")
lines.append("")
lines.append("---")
lines.append("")
lines.append("> 生成工具：[原子化生成提示词](原子化生成提示词.md)")

content = "\n".join(lines)
with open("卡片总览.md", "w", encoding="utf-8") as f:
    f.write(content)
print(f"Written 卡片总览.md with {total} cards")