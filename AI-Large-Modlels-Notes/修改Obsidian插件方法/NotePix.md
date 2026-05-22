修改 NotePix 关于 GitHub 上传后本地文件和云端不同导致在笔记中删除图片，云端没有删除。

⚠️ **开始前请务必**：将原始的 `main.js` 备份一份。

# 总体步骤概览

1. 在 `DEFAULT_SETTINGS` 中添加两个新配置项。
2. 在 `MyPlugin` 类中添加三个核心方法。
3. 在 `MyPlugin` 类的 `constructor` 中添加 `fileContentCache`。
4. 在 `onload` 方法中初始化缓存并注册两个事件（自动删除 + 右键菜单）。
5. 在设置面板类中添加两个开关。
6. 保存并测试。

---

# 添加手动删除

## 第一步：添加配置项

**搜索**：`DEFAULT_SETTINGS = {`

在 `lastPromptedRepo: ''` 行的**后面**（注意加上逗号）添加：

```javascript
    autoDeleteEnabled: false,
    confirmBeforeDelete: true,
```

修改后的示例：

```javascript
    lastPromptedRepo: '',
    autoDeleteEnabled: false,
    confirmBeforeDelete: true,
};
```

---

## 第二步：在 `MyPlugin` 类中添加三个核心方法

**搜索**：`MyPlugin = class extends import_obsidian.Plugin {`

在这个类内部，任意位置（建议放在 `getDecryptedToken` 方法之后）添加以下三个方法：

### 2.1 提取图片链接的方法

```javascript
    extractNotepixImageLinks(content) {
        const links = [];
        if (!content) return links;
        // 匹配私有协议：obsidian://notepix/v2/owner/repo/branch/path
        const privateRegex = /!\[[^\]]*\]\(obsidian:\/\/notepix\/v2\/[^\/]+\/[^\/]+\/[^\/]+\/([^)]+)\)/g;
        let match;
        while ((match = privateRegex.exec(content)) !== null) {
            links.push({ fullMatch: match[0], remotePath: match[1] });
        }
        // 匹配公共 raw 链接
        const publicRegex = /!\[[^\]]*\]\(https?:\/\/raw\.githubusercontent\.com\/[^\/]+\/[^\/]+\/[^\/]+\/([^)]+)\)/g;
        while ((match = publicRegex.exec(content)) !== null) {
            links.push({ fullMatch: match[0], remotePath: match[1] });
        }
        return links;
    }
```

### 2.2 找出被删除链接的方法

```javascript
    findDeletedImageLinks(oldContent, newContent) {
        const oldLinks = this.extractNotepixImageLinks(oldContent);
        const newLinks = this.extractNotepixImageLinks(newContent);
        return oldLinks.filter(oldLink => 
            !newLinks.some(newLink => newLink.remotePath === oldLink.remotePath)
        );
    }
```

### 2.3 从 GitHub 删除文件的方法

```javascript
    async deleteFileFromGitHub(remotePath) {
        const token = await this.getToken();
        if (!token) {
            new import_obsidian.Notice("No GitHub token available");
            return false;
        }
        const owner = this.settings.githubUser;
        const repo = this.settings.repoName;
        const branch = this.settings.branchName;
        const fullPath = remotePath; // 注意：remotePath 已经包含文件夹前缀

        try {
            // 1. 获取文件 SHA
            const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${fullPath}?ref=${branch}`;
            const getResp = await fetch(getUrl, {
                headers: { "Authorization": `token ${token}` }
            });
            if (!getResp.ok) {
                if (getResp.status === 404) {
                    new import_obsidian.Notice(`File not found: ${fullPath}`);
                } else {
                    new import_obsidian.Notice(`Failed to get file info: ${getResp.statusText}`);
                }
                return false;
            }
            const fileInfo = await getResp.json();
            const sha = fileInfo.sha;

            // 2. 删除文件
            const deleteUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${fullPath}`;
            const deleteResp = await fetch(deleteUrl, {
                method: "DELETE",
                headers: {
                    "Authorization": `token ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    message: `Delete image via NotePix auto-cleanup`,
                    sha: sha,
                    branch: branch
                })
            });
            if (deleteResp.ok) {
                new import_obsidian.Notice(`Deleted from GitHub: ${fullPath}`);
                return true;
            } else {
                const error = await deleteResp.json();
                new import_obsidian.Notice(`Delete failed: ${error.message}`);
                return false;
            }
        } catch (err) {
            console.error("GitHub delete error:", err);
            new import_obsidian.Notice(`Delete failed: ${err.message}`);
            return false;
        }
    }
```

---

## 第三步：在构造函数中添加 `fileContentCache`

### **搜索**：`constructor() {`

在构造函数中找到所有 `this.xxx = ...` 的末尾，添加：

```javascript
        this.fileContentCache = new Map();
```

例如，放在 `this.legacyUnresolvedUntil = new Map();` 的下一行。

---

## 第四步：修改 `onload` 方法

### **搜索**：`async onload() {`

### 4.1 在 `await this.loadSettings();` 之后添加缓存初始化

```javascript
        // 初始化文件内容缓存
        const allFiles = this.app.vault.getMarkdownFiles();
        for (const f of allFiles) {
            const content = await this.app.vault.read(f);
            this.fileContentCache.set(f.path, content);
        }
```

### 4.2 在 `onload` 方法末尾（最后一个 `this.registerEvent` 之后，`}` 之前）添加两个事件监听

### **自动删除监听（监听文件保存）**：

```javascript
        // 自动删除：监听文件修改（保存时触发）
        this.registerEvent(
            this.app.vault.on("modify", async (file) => {
                if (!this.settings.autoDeleteEnabled) return;
                if (!(file instanceof import_obsidian.TFile) || file.extension !== "md") return;

                const currentContent = await this.app.vault.read(file);
                const oldContent = this.fileContentCache.get(file.path);
                if (!oldContent) {
                    this.fileContentCache.set(file.path, currentContent);
                    return;
                }
                if (currentContent === oldContent) return;

                const deleted = this.findDeletedImageLinks(oldContent, currentContent);
                if (deleted.length === 0) {
                    this.fileContentCache.set(file.path, currentContent);
                    return;
                }

                for (const img of deleted) {
                    if (this.settings.confirmBeforeDelete) {
                        const confirmModal = new ConfirmationModal(
                            this.app,
                            "Confirm Delete",
                            `Delete ${img.remotePath} from GitHub?`
                        );
                        const confirmed = await confirmModal.open();
                        if (!confirmed) continue;
                    }
                    await this.deleteFileFromGitHub(img.remotePath);
                }
                this.fileContentCache.set(file.path, currentContent);
            })
        );
```

### **右键菜单手动删除监听**：

```javascript
        // 右键菜单手动删除
        this.registerEvent(
            this.app.workspace.on("editor-menu", (menu, editor, view) => {
                const cursor = editor.getCursor();
                const line = editor.getLine(cursor.line);
                const links = this.extractNotepixImageLinks(line);
                if (links.length === 0) return;

                menu.addItem((item) => {
                    item
                        .setTitle("🗑️ Delete image from GitHub")
                        .setIcon("trash")
                        .onClick(async () => {
                            const target = links[0];
                            if (this.settings.confirmBeforeDelete) {
                                const confirmModal = new ConfirmationModal(
                                    this.app,
                                    "Confirm Delete",
                                    `Delete ${target.remotePath} from GitHub?`
                                );
                                const confirmed = await confirmModal.open();
                                if (!confirmed) return;
                            }
                            const ok = await this.deleteFileFromGitHub(target.remotePath);
                            if (ok) {
                                const newLine = line.replace(target.fullMatch, "").trim();
                                editor.setLine(cursor.line, newLine);
                                new import_obsidian.Notice("Image link removed from note.");
                            } else {
                                new import_obsidian.Notice("Failed to delete from GitHub, link kept.");
                            }
                        });
                });
            })
        );
```

---

## 第五步：在设置面板中添加两个开关

**搜索**：`GitHubUploaderSettingTab = class extends import_obsidian.PluginSettingTab {`

找到 `display()` 方法，在方法的**末尾**（`}` 之前）添加：

```javascript
        // 自动删除开关
        new import_obsidian.Setting(containerEl)
            .setName("Auto-delete images from GitHub")
            .setDesc("When an image link is removed from a note, automatically delete the corresponding file from GitHub.")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoDeleteEnabled)
                .onChange(async (value) => {
                    this.plugin.settings.autoDeleteEnabled = value;
                    await this.plugin.saveSettings();
                }));
        
        // 删除前确认开关
        new import_obsidian.Setting(containerEl)
            .setName("Confirm before deletion")
            .setDesc("Show a confirmation dialog before deleting any image from GitHub.")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.confirmBeforeDelete)
                .onChange(async (value) => {
                    this.plugin.settings.confirmBeforeDelete = value;
                    await this.plugin.saveSettings();
                }));
```

---

## 第六步：保存并测试

1. 将修改后的 `main.js` 保存到 Obsidian 插件目录（例如 `.obsidian/plugins/NotePix/`）。
2. 重启 Obsidian（或重新加载插件：`Ctrl+P` → “Reload app without saving”）。
3. 打开 NotePix 设置，开启 **Auto-delete images from GitHub**。
4. 测试：
   - **自动删除**：打开一个含有 Notepix 图片链接的笔记，删除链接文字，保存文件（`Ctrl+S`）。等待片刻，应弹出确认框，确认后 GitHub 上的文件被删除，笔记链接消失。
   - **手动删除**：右键点击图片链接所在行，选择 “🗑️ Delete image from GitHub”，同样可删除。

---

## 常见问题排查

- **自动删除不触发**：确保设置开关已打开，并且你**保存了文件**（`modify` 事件在保存时触发）。如果只是删除链接但不保存，不会触发。
- **GitHub 404**：说明文件路径不正确或文件不存在。检查 `remotePath` 输出（可以在 `deleteFileFromGitHub` 中加 `console.log` 查看）。
- **Token 未解锁（加密模式）**：首次使用时需要先解锁 token（例如手动上传一张图片触发密码输入）。也可以在设置中临时切换到明文模式测试。

如果仍有问题，请提供控制台错误信息，我会帮你进一步排查。

---

# 添加右键图片也有删除选项

好的，你已经在 `main.js` 中实现了**编辑器内的右键删除**（针对文本链接），现在需要增加**全局右键菜单**，让用户在**阅读视图或实时预览中直接右键点击图片**时，也能删除图片及其链接。

下面给出具体的修改步骤，你只需要在现有 `onload` 方法末尾添加一段全局监听代码，并补充两个辅助方法即可。

---

## 📌 步骤一：添加 `getRemotePathFromImageSrc` 方法

在 `MyPlugin` 类中（例如放在 `extractNotepixImageLinks` 方法附近），添加一个从图片 `src` 提取 `remotePath` 的方法：

```javascript
    // 从图片的 src 中提取 remotePath（相对于 GitHub 仓库的路径）
    getRemotePathFromImageSrc(src) {
        if (!src) return null;
        // 匹配私有协议：obsidian://notepix/v2/owner/repo/branch/...
        const privateMatch = src.match(/obsidian:\/\/notepix\/v2\/[^\/]+\/[^\/]+\/[^\/]+\/(.+)$/);
        if (privateMatch) {
            return decodeURIComponent(privateMatch[1]);
        }
        // 匹配公共 raw 链接：https://raw.githubusercontent.com/.../...
        const publicMatch = src.match(/https?:\/\/raw\.githubusercontent\.com\/[^\/]+\/[^\/]+\/[^\/]+\/(.+)$/);
        if (publicMatch) {
            return decodeURIComponent(publicMatch[1]);
        }
        return null;
    }
```

---

## 📌 步骤二：添加 `removeImageLinkFromCurrentNote` 方法

该方法负责从当前活动笔记的编辑器中删除指定的图片链接（如果存在）。放在 `getRemotePathFromImageSrc` 方法附近：

```javascript
    // 从当前打开的笔记中删除指定 remotePath 的图片链接（Markdown 格式）
    async removeImageLinkFromCurrentNote(remotePath) {
        const activeView = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
        if (!activeView) return false;
        const editor = activeView.editor;
        const content = editor.getValue();
        // 转义 remotePath 中的正则特殊字符
        const escapedPath = remotePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // 匹配 Markdown 图片链接（私有或公共）
        const regex = new RegExp(`!\\[[^\\]]*\\]\\([^)]*${escapedPath}[^)]*\\)`, 'g');
        const newContent = content.replace(regex, '');
        if (newContent !== content) {
            const cursor = editor.getCursor();
            editor.setValue(newContent);
            editor.setCursor(cursor); // 尽量保持光标位置
            return true;
        }
        return false;
    }
```

---

## 📌 步骤三：在 `onload` 末尾添加全局右键菜单监听

找到 `onload` 方法中已有的 `this.registerEvent(this.app.workspace.on("editor-menu", ...))` 下方（或整个 `onload` 方法的末尾），添加以下代码：

```javascript
        // 全局右键菜单：在图片上右键时增加“删除图片”选项
        this.registerDomEvent(document, 'contextmenu', async (event) => {
            const target = event.target;
            if (!(target instanceof HTMLImageElement)) return;

            const src = target.getAttribute('src');
            if (!src) return;

            const remotePath = this.getRemotePathFromImageSrc(src);
            if (!remotePath) return;

            // 阻止浏览器默认菜单，显示自定义菜单
            event.preventDefault();
            const menu = new import_obsidian.Menu();
            menu.addItem((item) => {
                item.setTitle("🗑️ 删除此图片（从GitHub和本地备份）")
                    .setIcon("trash")
                    .onClick(async () => {
                        // 确认弹窗（如果设置中开启）
                        if (this.settings.confirmBeforeDelete) {
                            const confirmModal = new ConfirmationModal(
                                this.app,
                                "确认删除",
                                `确定要删除 ${remotePath} 吗？\n此操作不可撤销。`
                            );
                            const confirmed = await confirmModal.open();
                            if (!confirmed) return;
                        }
                        // 删除 GitHub 文件和本地备份
                        const success = await this.deleteFileFromGitHub(remotePath);
                        if (success) {
                            // 从当前笔记中移除图片链接
                            await this.removeImageLinkFromCurrentNote(remotePath);
                            new import_obsidian.Notice("图片已删除");
                        }
                    });
            });
            menu.addSeparator();
            menu.addItem((item) => {
                item.setTitle("复制图片地址")
                    .setIcon("copy")
                    .onClick(() => {
                        navigator.clipboard.writeText(src);
                        new import_obsidian.Notice("图片地址已复制");
                    });
            });
            menu.showAtMouseEvent(event);
        });
```

---

## 📌 验证与测试

1. 将以上三段代码按顺序插入到 `main.js` 的合适位置（建议统一放在 `extractNotepixImageLinks` 方法附近）。
2. 保存文件，重新加载 Obsidian 插件（`Ctrl+P` → `Reload`）。
3. 打开一篇包含 Notepix 图片的笔记，切换到**阅读视图**或**实时预览**。
4. 右键点击图片，应该出现自定义菜单，包含“删除此图片”和“复制图片地址”。
5. 点击删除，确认后图片应该从 GitHub、本地备份和笔记中一并消失。

---

## ⚠️ 注意事项

- 全局监听 `document` 的 `contextmenu` 会影响所有页面，但只对 `img` 元素且 `src` 为 Notepix 链接时才会添加菜单，不影响其他右键行为。
- 如果当前笔记不是编辑模式（例如阅读视图），`removeImageLinkFromCurrentNote` 方法会因为无法获取 `MarkdownView` 而失败，但用户仍可手动删除链接。你可以改进为即使没有编辑器也弹出提示（例如“请切换到编辑模式手动删除链接”），但这不是必须的。
- 已有的编辑器内右键删除功能（针对链接文本）仍然保留，两者互不干扰。

如果你在插入代码后遇到任何报错（比如 `ConfirmationModal` 未定义），请确认你的 `main.js` 中已经存在 `ConfirmationModal` 类（你的文件中已有）。如果仍有问题，请提供控制台错误信息，我会帮你调整。

---

你的右键菜单被原本的浏览器或 Obsidian 默认菜单遮盖，是因为默认菜单在你自定义菜单之后显示（或者同时显示）。我们可以通过**提前拦截事件并阻止传播**来解决，同时调整菜单位置。

以下是修改后的全局右键监听代码（替换步骤三中的代码），它能确保自定义菜单独占显示：

```javascript
// 全局右键菜单：在图片上右键时增加“删除图片”选项（使用捕获阶段，确保优先处理）
const globalContextMenuHandler = async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLImageElement)) return;

    const src = target.getAttribute('src');
    if (!src) return;

    const remotePath = this.getRemotePathFromImageSrc(src);
    if (!remotePath) return;

    // 阻止所有后续的右键事件（包括浏览器默认菜单和 Obsidian 的其他监听器）
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    // 延迟一小段时间再显示自定义菜单，确保默认行为被完全抑制
    setTimeout(() => {
        const menu = new import_obsidian.Menu();
        menu.addItem((item) => {
            item.setTitle("🗑️ 删除此图片（从GitHub和本地备份）")
                .setIcon("trash")
                .onClick(async () => {
                    if (this.settings.confirmBeforeDelete) {
                        const confirmModal = new ConfirmationModal(
                            this.app,
                            "确认删除",
                            `确定要删除 ${remotePath} 吗？\n此操作不可撤销。`
                        );
                        const confirmed = await confirmModal.open();
                        if (!confirmed) return;
                    }
                    const success = await this.deleteFileFromGitHub(remotePath);
                    if (success) {
                        await this.removeImageLinkFromCurrentNote(remotePath);
                        new import_obsidian.Notice("图片已删除");
                    }
                });
        });
        menu.addSeparator();
        menu.addItem((item) => {
            item.setTitle("复制图片地址")
                .setIcon("copy")
                .onClick(() => {
                    navigator.clipboard.writeText(src);
                    new import_obsidian.Notice("图片地址已复制");
                });
        });
        menu.showAtMouseEvent(event);
    }, 10);
};

// 在捕获阶段注册（第三个参数为 true），确保最先执行
window.addEventListener('contextmenu', globalContextMenuHandler, true);
this.register(() => {
    window.removeEventListener('contextmenu', globalContextMenuHandler, true);
});
```

**关键改动说明：**

1. 使用 `window.addEventListener` 直接注册，并设置捕获阶段 `true`，确保我们的监听器在 Obsidian 默认监听器之前执行。
2. 添加 `event.stopImmediatePropagation()` 阻止同一元素上的其他监听器。
3. 延迟 `10ms` 显示菜单，避免与默认菜单的渲染冲突。
4. 在插件卸载时自动移除监听器（通过 `this.register`）。

这样自定义菜单将独占显示，不会被遮盖。如果你仍然遇到问题，请检查是否有浏览器扩展干扰。

---

### 添加删除备份有提示

```js
// 删除本地备份目录中的对应文件

    async deleteLocalBackupImage(remotePath) {

        if (!remotePath) return false;

        // 从 remotePath 中提取文件名（例如 assets/20260515T130941441Z.png -> 20260515T130941441Z.png）

        const parts = remotePath.split('/');

        const fileName = parts[parts.length - 1];

        if (!fileName) return false;

  

        const backupFolder = "Assets/Image-Backup";

        const backupPath = `${backupFolder}/${fileName}`;

  

        try {

            const file = this.app.vault.getAbstractFileByPath(backupPath);

            if (file && file instanceof import_obsidian.TFile) {

                await this.app.vault.delete(file);

                console.log(`Deleted local backup: ${backupPath}`);

                new import_obsidian.Notice(`已删除本地备份: ${fileName}`);

                return true;

            } else {

                // 备份文件不存在，静默跳过

                console.log(`Local backup not found: ${backupPath}`);

                return false;

            }

        } catch (err) {

            console.error(`Failed to delete local backup ${backupPath}:`, err);

            return false;

        }

    }
```
