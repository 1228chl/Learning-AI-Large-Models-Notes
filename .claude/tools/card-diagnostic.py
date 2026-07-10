"""
原子卡片诊断报告
扫描所有卡片，输出代码占比、问答数量、原理深度、字数等指标
"""

import os
import re
import json
import glob

CARDS_DIR = "G:/AI-Learning/Atomic-Cards"
OUTPUT = "G:/AI-Learning/Atomic-Cards/卡片诊断报告.md"

# 原理深度的关键词（出现越多说明原理越丰富）
PRINCIPLE_KEYWORDS = [
    "原理", "本质", "机制", "为什么", "对比", "区别", "权衡",
    "trade-off", "适用范围", "边界", "局限", "适用场景", "决策",
    "本质区别", "核心思想", "直觉", "几何意义", "motivation"
]

def analyze_card(path):
    with open(path, encoding="utf-8", errors="ignore") as f:
        text = f.read()

    total_chars = len(text)

    # 代码块字符数
    code_blocks = re.findall(r'```\w*\n(.*?)```', text, re.DOTALL)
    code_chars = sum(len(cb) for cb in code_blocks)
    code_pct = round(code_chars * 100 / total_chars) if total_chars else 0

    # 面试追问 Q 的数量
    q_count = len(re.findall(r'\*\*Q\d', text))

    # 原理关键词数量
    principle_count = sum(
        len(re.findall(re.escape(kw), text, re.IGNORECASE))
        for kw in PRINCIPLE_KEYWORDS
    )

    # 含 LaTeX 公式
    has_latex = bool(re.search(r'\$.*?\$', text))

    # 代码块行数
    code_lines = sum(len(cb.split("\n")) for cb in code_blocks)

    # 是否有"直观理解"或"几何意义"或"核心思想"段落
    has_intuition = bool(re.search(r'##\s*(直观理解|几何意义|核心思想)', text))

    # 相对路径名
    rel_path = os.path.relpath(path, CARDS_DIR)

    return {
        "path": rel_path,
        "total_chars": total_chars,
        "code_pct": code_pct,
        "code_chars": code_chars,
        "code_lines": code_lines,
        "q_count": q_count,
        "principle_score": principle_count,
        "has_latex": has_latex,
        "has_intuition": has_intuition,
    }


def main():
    all_cards = []
    for f in sorted(glob.glob(os.path.join(CARDS_DIR, "**/*.md"), recursive=True)):
        if "卡片总览" in f or "原子化生成提示词" in f:
            continue
        all_cards.append(analyze_card(f))

    # 生成报告
    lines = []
    lines.append("# 原子卡片诊断报告\n")
    lines.append(f"扫描范围：`Atomic-Cards/`（共 {len(all_cards)} 张卡片，排除总览和提示词）\n")
    lines.append(f"生成时间：{__import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M')}\n")
    lines.append("---\n")

    # ===== 1. 代码占比 Top 15 =====
    lines.append("## 1. 代码占比最高（Top 15）\n")
    lines.append("| 排名 | 卡片 | 总字符 | 代码字符 | 代码占比 | 代码行数 | Q数 | 原理分 |")
    lines.append("|:----:|:----|:------:|:--------:|:--------:|:--------:|:---:|:------:|")
    by_code = sorted(all_cards, key=lambda c: -c["code_pct"])
    for i, c in enumerate(by_code[:15], 1):
        lines.append(
            f"| {i} | {c['path']} | {c['total_chars']} | {c['code_chars']} | **{c['code_pct']}%** | {c['code_lines']} | {c['q_count']} | {c['principle_score']} |"
        )
    lines.append("")

    # ===== 2. 原理深度不足（低原理分 + 高代码占比） =====
    lines.append("## 2. 原理薄弱的卡片（推荐优先增补）\n")
    lines.append("筛选条件：代码占比 ≥ 40% 且 原理分 ≤ 5，按代码占比降序\n")
    lines.append("| 卡片 | 代码占比 | 原理分 | Q数 | 含LaTeX | 含直观理解 |")
    lines.append("|:----|:--------:|:------:|:---:|:-------:|:----------:|")
    weak = [c for c in all_cards if c["code_pct"] >= 40 and c["principle_score"] <= 5]
    weak.sort(key=lambda c: -c["code_pct"])
    for c in weak:
        latex_flag = "是" if c["has_latex"] else "否"
        intuition_flag = "是" if c["has_intuition"] else "否"
        lines.append(
            f"| {c['path']} | {c['code_pct']}% | {c['principle_score']} | {c['q_count']} | {latex_flag} | {intuition_flag} |"
        )
    if not weak:
        lines.append("| （无） | | | | | |")
    lines.append("")

    # ===== 3. 按分类汇总 =====
    lines.append("## 3. 分类汇总\n")
    lines.append("| 分类 | 卡片数 | 平均代码占比 | 平均原理分 | 平均Q数 |")
    lines.append("|:----|:------:|:----------:|:---------:|:-------:|")
    categories = {}
    for c in all_cards:
        cat = c["path"].split(os.sep)[0]
        if cat not in categories:
            categories[cat] = []
        categories[cat].append(c)
    for cat in sorted(categories.keys()):
        cards = categories[cat]
        avg_code = sum(c["code_pct"] for c in cards) / len(cards)
        avg_principle = sum(c["principle_score"] for c in cards) / len(cards)
        avg_q = sum(c["q_count"] for c in cards) / len(cards)
        lines.append(
            f"| {cat} | {len(cards)} | {avg_code:.0f}% | {avg_principle:.0f} | {avg_q:.1f} |"
        )
    lines.append("")

    # ===== 4. 代码占比分布 =====
    lines.append("## 4. 代码占比分布\n")
    buckets = {"0-20%": 0, "21-30%": 0, "31-40%": 0, "41-50%": 0, "51-60%": 0, "61%+": 0}
    for c in all_cards:
        if c["code_pct"] <= 20:
            buckets["0-20%"] += 1
        elif c["code_pct"] <= 30:
            buckets["21-30%"] += 1
        elif c["code_pct"] <= 40:
            buckets["31-40%"] += 1
        elif c["code_pct"] <= 50:
            buckets["41-50%"] += 1
        elif c["code_pct"] <= 60:
            buckets["51-60%"] += 1
        else:
            buckets["61%+"] += 1
    for k, v in buckets.items():
        bar = "█" * v if v <= 40 else "█" * 40
        lines.append(f"| {k} | {v:3d} 张 | {bar}")
    lines.append("")

    # ===== 5. 完整清单 =====
    lines.append("## 5. 完整清单（按代码占比降序）\n")
    lines.append("| 卡片 | 总字符 | 代码占比 | 代码行数 | Q数 | 原理分 | 含LaTeX |")
    lines.append("|:----|:------:|:--------:|:--------:|:---:|:------:|:-------:|")
    for c in by_code:
        latex_flag = "是" if c["has_latex"] else "否"
        lines.append(
            f"| {c['path']} | {c['total_chars']} | {c['code_pct']}% | {c['code_lines']} | {c['q_count']} | {c['principle_score']} | {latex_flag} |"
        )

    result = "\n".join(lines)
    with open(OUTPUT, "w", encoding="utf-8") as f:
        f.write(result)
    print(f"报告已生成：{OUTPUT}")
    print(f"共扫描 {len(all_cards)} 张卡片")
    print(f"原理薄弱卡片（需优先增补）：{len(weak)} 张")

if __name__ == "__main__":
    main()