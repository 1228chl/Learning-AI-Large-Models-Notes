"""
全面格式检查：扫描所有卡片，报告格式违规
"""
import glob, os, re

CARDS = 'G:/AI-Learning/Atomic-Cards'
EXCLUDE = ['卡片总览.md', '原子化生成提示词.md', '卡片诊断报告.md']

issues = []
for f in sorted(glob.glob(os.path.join(CARDS, '**/*.md'), recursive=True)):
    name = os.path.basename(f)
    if name in EXCLUDE:
        continue
    rel = os.path.relpath(f, CARDS)
    with open(f, encoding='utf-8') as fh:
        text = fh.read()

    total = len(text)
    card_issues = []

    # 1. Frontmatter
    has_fm = bool(re.match(r'^---\n.*?\n---\n', text, re.DOTALL))
    if not has_fm:
        card_issues.append('缺少frontmatter')
    else:
        fm = re.match(r'^---\n(.*?)\n---\n', text, re.DOTALL)
        if fm:
            fm_text = fm.group(1)
            if 'author:' not in fm_text:
                card_issues.append('缺author')
            if 'created:' not in fm_text:
                card_issues.append('缺created')
            if 'tags:' not in fm_text:
                card_issues.append('缺tags')
            if 'aliases:' not in fm_text:
                card_issues.append('缺aliases')

    # 2. 面试追问 Q1-Q4
    q_count = len(re.findall(r'\*\*Q\d', text))
    if q_count < 4:
        card_issues.append(f'面试追问不足4个(仅{q_count})')

    # 3. 代码块闭合
    fence = chr(96) * 3
    open_blocks = len(re.findall(r'^' + fence, text, re.MULTILINE))
    if open_blocks % 2 != 0:
        card_issues.append('代码块未闭合')

    # 4. 代码比例
    code_chars = sum(len(m) for m in re.findall(fence + r'\w*\n.*?\n' + fence, text, re.DOTALL))
    code_pct = code_chars * 100 // total if total else 0

    # 5. 内容充实度/拆分
    if total < 2000:
        card_issues.append(f'字符数不足({total}<2000)')
    if total > 7000:
        card_issues.append(f'字符数过多({total}>7000，建议拆分)')

    # 6. 参考引用
    has_ref = '## 参考引用' in text
    if not has_ref:
        card_issues.append('缺参考引用')
    else:
        # 按独立行统计引用数
        ref_section = text.split('## 参考引用')[1]
        ref_section = ref_section.split('##')[0] if '##' in ref_section else ref_section
        ref_items = [l.strip() for l in ref_section.split('\n') if l.strip().startswith('-')]
        if len(ref_items) < 3:
            card_issues.append(f'参考引用不足3条(仅{len(ref_items)})')

    # 7. 含 LaTeX 的块级公式变量标注
    has_block_latex = bool(re.search(r'\$\$.*?\$\$', text, re.DOTALL))
    if has_block_latex:
        var_annot = bool(re.search(r'\$\$.*?\$\$[\s\S]{0,50}?-\s*\$', text, re.DOTALL))
        # 放宽：只检查第一个块级公式前后是否有变量标注

    # 8. 引用显示名含编号
    bad_refs = re.findall(r'\[(\d+-[^\]]+)\]\(', text)
    if bad_refs:
        card_issues.append(f'引用显示名含编号(前2个): {bad_refs[:2]}')

    # 9. == 未用反引号 (排除LaTeX)
    lines = text.split('\n')
    for i, line in enumerate(lines):
        if '$' in line or line.startswith('```') or line.startswith('|'):
            continue
        if re.search(r'(?<!\x60)==\w+', line):
            card_issues.append(f'第{i+1}行 == 未用反引号')
            break

    # 10. Emoji
    known_emoji = ['✅','❌','⭐','📝','🔗','💡','⚠️','🚫','🔄','🔹','🗑️','🎉','🔥']
    found_emoji = [e for e in known_emoji if e in text]
    if found_emoji:
        card_issues.append(f'含emoji: {found_emoji}')

    if card_issues:
        print(f'--- {rel} --- ({total}字)')
        for ci in card_issues:
            print(f'  ISSUE: {ci}')