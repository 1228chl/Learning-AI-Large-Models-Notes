#!/usr/bin/env python3
"""Fix all Markdown links in Atomic-Cards using target-filename lookup."""
import os, re, sys
sys.stdout.reconfigure(encoding='utf-8')

BASE = "G:/AI-Learning/Atomic-Cards"
os.chdir(BASE)

# Build file-location lookup: basename -> full_path
file_lookup = {}
for root, _, files in os.walk("."):
    for f in files:
        if f.endswith(".md") and f not in ("卡片总览.md", "原子化生成提示词.md"):
            file_lookup[f] = os.path.normpath(os.path.join(root, f))

print(f"Total card files: {len(file_lookup)}")

# Also handle %20 variants: "09-Milvus Python操作指南.md" and "09-Milvus%20Python操作指南.md"
# Build a case-insensitive normalized lookup
norm_lookup = {}
for fname, fpath in file_lookup.items():
    # Normalize spaces and %20
    key = fname.replace("%20", " ").replace("\\", "/").lower()
    norm_lookup[key] = fpath

# Update links in all card files
updated_files = 0
fixed_links = 0

for root, _, files in os.walk("."):
    for f in files:
        if not f.endswith(".md") or f in ("卡片总览.md", "原子化生成提示词.md"):
            continue
        fp = os.path.normpath(os.path.join(root, f))
        current_dir = os.path.dirname(fp)

        with open(fp, "r", encoding="utf-8") as fh:
            content = fh.read()
        orig = content

        # Find all Markdown links
        for m in re.finditer(r"\[([^\]]+)\]\(([^)]+)\)", content):
            link = m.group(2)
            old_full = m.group(0)

            if link.startswith("http") or link.startswith("#"):
                continue

            # Extract the target filename from the link
            target_name = os.path.basename(link)

            # Look up the target file by name
            target_path = None
            if target_name in file_lookup:
                target_path = file_lookup[target_name]
            else:
                # Try normalized version
                norm_key = target_name.replace("%20", " ").replace("\\", "/").lower()
                if norm_key in norm_lookup:
                    target_path = norm_lookup[norm_key]

            if target_path is None:
                continue

            # Compute correct relative path from current file to target
            new_rel = os.path.relpath(target_path, current_dir).replace("\\", "/")

            if new_rel != link:
                # Replace the old link with the corrected one
                content = content.replace(old_full, old_full.replace(f"({link})", f"({new_rel})"), 1)
                fixed_links += 1

        if content != orig:
            with open(fp, "w", encoding="utf-8") as fh:
                fh.write(content)
            updated_files += 1

print(f"Updated {updated_files} files")
print(f"Fixed {fixed_links} links")

# Verify: check for broken references
broken = 0
broken_list = []
for root, _, files in os.walk("."):
    for f in files:
        if not f.endswith(".md") or f == "卡片总览.md":
            continue
        fp = os.path.normpath(os.path.join(root, f))
        with open(fp, "r", encoding="utf-8") as fh:
            text = fh.read()
        for m in re.finditer(r"\[([^\]]+)\]\(([^)]+)\)", text):
            link = m.group(2)
            if link.startswith("http"):
                continue
            target = os.path.normpath(os.path.join(os.path.dirname(fp), link))
            td = target.replace("%20", " ")
            if not os.path.exists(target) and not os.path.exists(td):
                broken += 1
                if broken <= 10:
                    broken_list.append(f"  {fp} -> {link}")

print(f"\nBroken references remaining: {broken}")
for b in broken_list:
    print(b)

print("\nDone!")