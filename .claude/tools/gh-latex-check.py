import os, re

issues = []
for root, dirs, files in os.walk('Atomic-Cards'):
    for f in sorted(files):
        if not f.endswith('.md'):
            continue
        path = os.path.join(root, f)
        with open(path, 'r', encoding='utf-8') as fh:
            try:
                content = fh.read()
            except:
                continue
        lines = content.split('\n')
        for i, line in enumerate(lines):
            stripped = line.strip()
            if stripped == '$$':
                if i > 0:
                    prev = lines[i-1].strip()
                else:
                    prev = '__START__'
                if prev and not prev.startswith('$$') and not prev.startswith('|'):
                    rel = os.path.relpath(path, 'Atomic-Cards')
                    issues.append(f'{rel}:{i+1}  $$前无空行: {prev[:50]}')

        # Chinese char adjacent to $
        cjk = '[一-鿿]'
        for i, line in enumerate(lines):
            # Chinese followed by $ without space
            for m in re.finditer(cjk + r'\$', line):
                pos = m.start()
                rel = os.path.relpath(path, 'Atomic-Cards')
                issues.append(f'{rel}:{i+1} col{pos} 中文后紧邻$无空格: {line.strip()[:60]}')
            # $ followed by Chinese without space
            for m in re.finditer(r'\$' + cjk, line):
                pos = m.start()
                rel = os.path.relpath(path, 'Atomic-Cards')
                issues.append(f'{rel}:{i+1} col{pos} $后紧邻中文无空格: {line.strip()[:60]}')

print(f'Found {len(issues)} issues:')
for iss in issues:
    print(iss)