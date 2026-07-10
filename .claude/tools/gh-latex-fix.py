"""
批量修复 GitHub LaTeX 渲染兼容问题：
1. 块级公式 $$ 前添加空行（与上文段落隔离）
2. 行内公式 $...$ 与中文字符间添加空格
"""
import os, re

CJK = '一-鿿㐀-䶿豈-﫿'  # CJK Unified Ideographs range

def fix_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content
    lines = content.split('\n')
    result = []
    in_code_block = False
    in_math_block = False

    for i, line in enumerate(lines):
        stripped = line

        # Track code blocks
        if stripped.strip().startswith('```'):
            in_code_block = not in_code_block
            result.append(line)
            continue

        if in_code_block:
            result.append(line)
            continue

        # Fix opening $$ without blank line before
        if stripped.strip() == '$$' and not in_math_block:
            in_math_block = True
            if i > 0:
                prev = lines[i-1].strip()
                if prev and prev != '$$' and not prev.startswith('|') and not prev.startswith('>') and prev != '':
                    result.append('')
            result.append(line)
            continue

        # Track closing $$
        if stripped.strip() == '$$' and in_math_block:
            in_math_block = False
            result.append(line)
            continue

        # Fix Chinese adjacent to $ (outside math blocks)
        if not in_math_block:
            # Chinese char + $ → Chinese char + space + $
            line = re.sub(f'([{CJK}])(?=\\$)', r'\1 ', line)
            # $ + Chinese char → $ + space + Chinese char
            line = re.sub(f'(?<=\\$)([{CJK}])', r' \1', line)

            # Fix Chinese + $$ (shouldn't happen normally but just in case)
            line = re.sub(f'([{CJK}])\\$\\$', r'\1 $$', line)

        result.append(line)

    new_content = '\n'.join(result)

    if new_content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        return True
    return False

def main():
    count = 0
    changed = []
    for root, dirs, files in os.walk('Atomic-Cards'):
        for f in sorted(files):
            if not f.endswith('.md'):
                continue
            path = os.path.join(root, f)
            try:
                if fix_file(path):
                    rel = os.path.relpath(path, 'Atomic-Cards')
                    changed.append(rel)
                    count += 1
            except Exception as e:
                print(f'ERROR {path}: {e}')

    print(f'\nFixed {count} files:')
    for c in changed:
        print(f'  {c}')

if __name__ == '__main__':
    main()