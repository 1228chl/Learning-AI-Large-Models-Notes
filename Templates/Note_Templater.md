<%*
// 1. 询问标题并重命名文件
let title = await tp.system.prompt("输入笔记标题");
await tp.file.rename(title);

// 2. 询问标签（可选，英文逗号分隔）
let tagInput = await tp.system.prompt("输入标签（多个用英文逗号分隔）", "");
let tags = tagInput ? tagInput.split(',').map(s => s.trim()).filter(Boolean) : [];

// 3. 询问别名（可选，英文逗号分隔）
let aliasInput = await tp.system.prompt("输入别名（多个用英文逗号分隔）", "");
let aliases = aliasInput ? aliasInput.split(',').map(s => s.trim()).filter(Boolean) : [];

// 4. 自动获取创建时间
let created = moment(tp.file.creation_date()).format("YYYY-MM-DD HH:mm:ss");

// 5. 固定作者
let author = "XunZong";

// 6. 构建 Frontmatter（始终包含 tags 和 aliases，无论有无值）
let frontmatter = '---\n';
frontmatter += `author: "${author}"\n`;
frontmatter += `created: "${created}"\n`;
frontmatter += `tags: [${tags.map(t => `"${t}"`).join(', ')}]\n`;
frontmatter += `aliases: [${aliases.map(a => `"${a}"`).join(', ')}]\n`;
frontmatter += '---\n\n';

// 7. 正文添加一级标题（方便直接书写）
let body = `# ${title}\n\n`;

// 8. 输出
tR = frontmatter + body;
%>