import os, re

candidates = []
for root, dirs, files in os.walk('.'):
    cat = os.path.basename(root)
    for fname in sorted(files):
        if not fname.endswith('.md') or fname == '原子化生成提示词.md' or fname == '_scan_candidates.py':
            continue
        path = os.path.join(root, fname)
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()

        lines = content.split('\n')
        # 统计二级标题 ## 数量
        h2s = [l.strip() for l in lines if l.strip().startswith('## ') and not l.strip().startswith('###')]

        # 统计代码块数量
        code_blocks = len(re.findall(r'\`\`\`', content)) // 2

        # 统计总行数
        total_lines = len(lines)

        # 统计面试问答之后的内容
        qa_idx = next((i for i, l in enumerate(lines) if l.strip() == '## 面试追问'), None)
        ref_idx = next((i for i in range(len(lines)-1, -1, -1) if lines[i].strip().startswith('> 参见')), None)

        extra_after_qa = 0
        if qa_idx and ref_idx and ref_idx > qa_idx:
            extra_after_qa = ref_idx - qa_idx

        # 标记候选：多主题 或 代码多 或 QA后有大内容
        score = 0
        reasons = []
        if len(h2s) >= 5:
            score += 1
            reasons.append(f'{len(h2s)}个二级标题')
        if code_blocks >= 3:
            score += 1
            reasons.append(f'{code_blocks}个代码块')
        if extra_after_qa > 40:
            score += 1
            reasons.append(f'QA后还有{extra_after_qa}行')
        if total_lines > 100:
            score += 1
            reasons.append(f'{total_lines}行')

        if score >= 2:
            h2_names = [h.strip('## ') for h in h2s[:8]]
            candidates.append((path, total_lines, len(h2s), code_blocks, score, '; '.join(reasons), h2_names))

print(f'共找到 {len(candidates)} 个候选卡片（得分>=2）：')
print()
for path, lines, h2, cb, score, reasons, h2s in sorted(candidates, key=lambda x: -x[4]):
    short = path[2:].replace('\\', '/')
    print(f'[{score}分] {short} ({lines}行, {h2}个标题, {cb}个代码块)')
    print(f'  原因: {reasons}')
    print(f'  标题: {h2s[:6]}')
    print()
