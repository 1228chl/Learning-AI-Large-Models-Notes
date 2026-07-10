"""
全面格式检查 v2：根据最新提示词规则扫描所有卡片
"""
import glob, os, re

CARDS = 'G:/AI-Learning/Atomic-Cards'
EXCLUDE = ['卡片总览.md', '原子化生成提示词.md', '卡片诊断报告.md', '卡片质量报告.md']

issues_found = 0

for f in sorted(glob.glob(os.path.join(CARDS, '**/*.md'), recursive=True)):
    name = os.path.basename(f)
    if name in EXCLUDE:
        continue
    rel = os.path.relpath(f, CARDS)
    with open(f, encoding='utf-8') as fh:
        text = fh.read()

    total = len(text)
    lines = text.split('\n')
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
    fence = '```'
    open_blocks = len(re.findall(r'^' + fence, text, re.MULTILINE))
    if open_blocks % 2 != 0:
        card_issues.append('代码块未闭合')

    # 4. 代码比例
    code_matches = re.findall(fence + r'\w*\n.*?\n' + fence, text, re.DOTALL)
    code_chars = sum(len(m) for m in code_matches)
    code_pct = code_chars * 100 // total if total else 0
    if code_pct > 25:
        card_issues.append(f'代码占比过高({code_pct}%>25%)')

    # 5. 字符数
    if total < 2000:
        card_issues.append(f'字符数不足({total}<2000)')
    if total > 7000:
        card_issues.append(f'字符数过多({total}>7000，建议拆分)')

    # 6. 参考引用
    has_ref = '## 参考引用' in text
    if not has_ref:
        card_issues.append('缺参考引用')
    else:
        ref_section = text.split('## 参考引用')[1]
        # 只取到下一个 ## 或文件结束
        ref_main = ref_section.split('\n## ')[0]
        ref_items = [l.strip() for l in ref_main.split('\n') if l.strip().startswith('-')]
        if len(ref_items) < 3:
            card_issues.append(f'参考引用不足3条(仅{len(ref_items)})')

        # 检查引用去重
        ref_texts = []
        for item in ref_items:
            m = re.search(r'\[([^\]]+)\]\(', item)
            if m:
                ref_texts.append(m.group(1))
        if len(ref_texts) != len(set(ref_texts)):
            card_issues.append(f'引用有重复({len(ref_texts)}条但去重后{len(set(ref_texts))}条)')

        # 检查引用显示名含编号
        bad_refs = re.findall(r'\[(\d+-[^\]]+)\]\(', ref_main)
        if bad_refs:
            card_issues.append(f'引用显示名含编号: {bad_refs[:2]}')

    # 7. 结构倒挂：主体 > Q&A
    has_qa = '## 面试追问' in text
    if has_qa:
        body_part = text.split('## 面试追问')[0]
        qa_part = '## 面试追问' + text.split('## 面试追问')[1]
        # 去掉 frontmatter
        body_clean = re.sub(r'^---.*?---\s*', '', body_part, flags=re.DOTALL)
        qa_clean = re.sub(r'^---.*?---\s*', '', qa_part, flags=re.DOTALL)
        # 去掉参考引用
        if '## 参考引用' in qa_clean:
            qa_clean = qa_clean.split('## 参考引用')[0]
        body_len = len(body_clean.strip())
        qa_len = len(qa_clean.strip())
        if qa_len > body_len:
            card_issues.append(f'主体({body_len}字) < Q&A({qa_len}字)')

    # 8. LaTeX 检查：含数学概念的卡片应有 $$
    math_keywords = ['线性代数', '微积分', '概率统计', '深度学习', '机器学习', '优化']
    tags_section = ''
    if has_fm:
        fm = re.match(r'^---\n(.*?)\n---\n', text, re.DOTALL)
        if fm:
            tags_section = fm.group(1)
    is_math = any(k in tags_section for k in math_keywords)
    has_latex = bool(re.search(r'\$\$', text))
    if is_math and not has_latex:
        card_issues.append('数学分类但无块级LaTeX公式')

    # 9. GitHub 兼容：$$ 前无空行
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped == '$$' and not text[:sum(len(l)+1 for l in lines[:i])].rstrip('\n').endswith('\n\n'):
            if i > 0 and lines[i-1].strip() and lines[i-1].strip() != '$$' and not lines[i-1].strip().startswith('|'):
                # 检查这是否是 opening $$
                # 看下一个非空行
                next_formula = False
                for j in range(i+1, min(i+3, len(lines))):
                    if lines[j].strip() and lines[j].strip() != '$$':
                        next_formula = True
                        break
                if next_formula:
                    card_issues.append(f'第{i+1}行：opening $$ 前无空行')
                    break

    # 10. 标题用语规范：禁止 A = B 标题
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith('### ') and '=' in stripped:
            # 排除公式中的 = (如 $$ 块内)
            if '### 为什么' in stripped:
                continue  # 合法提问格式
            card_issues.append(f'第{i+1}行：标题含"=": {stripped[:50]}')
            break

    if card_issues:
        issues_found += 1
        print(f'--- {rel} --- ({total}字)')
        for ci in card_issues:
            print(f'  ISSUE: {ci}')

if issues_found == 0:
    print('全部卡片格式检查通过！')
else:
    print(f'\n总计 {issues_found} 张卡片存在格式问题')