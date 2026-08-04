# -*- coding: utf-8 -*-
import re, os, glob

cards_dir = "G:/AI-Learning/Atomic-Cards"
all_files = []
for root, dirs, files in os.walk(cards_dir):
    for f in files:
        if f.endswith(".md") and f not in ("卡片总览.md", "原子化生成提示词.md", "卡片诊断报告.md", "README.md", ".check_cards.py"):
            full = os.path.join(root, f)
            rel = os.path.relpath(full, cards_dir)
            all_files.append(rel)

total = len(all_files)
results = []

for path in all_files:
    full_path = os.path.join(cards_dir, path)
    with open(full_path, 'r', encoding='utf-8') as f:
        content = f.read()

    issues = []

    # 1. Frontmatter
    fm_match = re.match(r'^---\n(.*?)\n---', content, re.DOTALL)
    if not fm_match:
        issues.append('无frontmatter')
    else:
        fm = fm_match.group(1)
        if 'author:' not in fm: issues.append('缺author')
        if 'created:' not in fm: issues.append('缺created')
        if 'tags:' not in fm: issues.append('缺tags')
        if 'aliases:' not in fm: issues.append('缺aliases')

    body = re.sub(r'^---.*?---\s*', '', content, flags=re.DOTALL)
    total_chars = len(body)

    # 2. Character count
    if total_chars < 2000: issues.append('字符不足2000')
    elif total_chars > 7000: issues.append('字符超7000')

    # 3. Code proportion
    code_blocks = re.findall(r'\x60{3}[\w]*\n(.*?)\n\x60{3}', body, re.DOTALL)
    code_chars = sum(len(b) for b in code_blocks)
    code_pct = 0
    if code_chars > 0 and total_chars > 0:
        code_pct = code_chars / total_chars * 100
        if code_pct > 25:
            issues.append('代码占比超25%%')

    # 4. ML/DL场景表
    has_ml_table = 'ML/DL' in body and '应用场景' in body
    has_math_support = '数学基础支撑' in body
    if not has_ml_table and not has_math_support:
        issues.append('缺ML/DL场景表')

    # 5. Q&A
    has_qa = '## 面试追问' in body
    if not has_qa:
        issues.append('缺面试问答')
    else:
        qa_match = re.search(r'## 面试追问\n(.*?)(?:## |\Z)', body, re.DOTALL)
        qa_chars = len(qa_match.group(1)) if qa_match else 0
        main_chars = total_chars - qa_chars
        if qa_chars > main_chars:
            issues.append('Q&A倒挂')
        q_count = len(re.findall(r'\*\*Q[1-4]', body))
        if q_count < 4:
            issues.append('Q&A不完整(仅%d题)' % q_count)

    # 6. References
    refs = re.findall(r'^- 需要.*参见 \[.*\]\(.*\)', body, re.MULTILINE)
    ref_count = len(refs)
    if ref_count < 3:
        issues.append('引用不足(仅%d个)' % ref_count)
    elif ref_count > 10:
        issues.append('引用超10个(%d)' % ref_count)

    # 7. Ref display name without number
    ref_names = re.findall(r'^- 需要.*参见 \[(.*?)\]\(.*\)', body, re.MULTILINE)
    numbered = [r for r in ref_names if re.match(r'\d+[- ]', r)]
    if numbered:
        issues.append('引用名含编号')

    # 8. Emoji
    emoji = re.findall(r'[\U0001F300-\U0001F9FF\u2600-\u26FF\u2700-\u27BF]', body)
    if emoji:
        issues.append('含Emoji(%d个)' % len(emoji))

    # 9. Code block balance
    code_delimiters = len(re.findall(r'\x60{3}', body))
    if code_delimiters % 2 != 0:
        issues.append('代码块未闭合')

    # 10. == highlight (in non-code text)
    eq_highlight = len(re.findall(r'(?<!\x60)==(.*?)==(?!\x60)', body))
    if eq_highlight:
        issues.append('==高亮未转义(%d处)' % eq_highlight)

    if issues:
        fname = path.split('/')[-1] if '/' in path else path
        results.append((path, fname, total_chars, code_pct, ref_count, issues))

print(u'共检查 %d 张卡片' % total)
print(u'有问题的卡片: %d 张\n' % len(results))

# Group by top-level directory
by_dir = {}
for path, fname, chars, code_pct, refs, issues in results:
    parts = path.replace('\\', '/').split('/')
    top_dir = parts[0] if len(parts) > 1 else 'root'
    sub = parts[1] if len(parts) > 2 else ''
    key = top_dir + ('/' + sub if sub else '')
    if key not in by_dir:
        by_dir[key] = []
    by_dir[key].append((fname, chars, code_pct, refs, issues))

for key in sorted(by_dir.keys()):
    cards = by_dir[key]
    print(u'=== %s (%d张) ===' % (key, len(cards)))
    for fname, chars, code_pct, refs, issues in cards:
        print(u'  %s [%d字, %.0f%%代码, %d引]:' % (fname[:35], chars, code_pct, refs))
        for iss in issues:
            print(u'    - %s' % iss)
    print()