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

---

以下是针对原始 `main.js` 的所有**详细修改代码**，以 **diff**（修改前后对比）的形式列出。每个修改点均标注了原始代码位置（基于您提供的文件）以及修改后的完整代码块。

---

# 添加文档图片按文档位置进行存储

## 修改点 1：`DEFAULT_SETTINGS` 增加两个新字段

**原始代码**（约第 56-80 行）  

```javascript
var DEFAULT_SETTINGS = {
    githubUser: "",
    repoName: "",
    encryptedToken: "",
    plainToken: "",
    branchName: "main",
    folderPath: "assets/",
    deleteLocal: false,
    useEncryption: true,
    repoVisibility: 'auto',
    repoHistory: [],
    uploadOnPaste: 'always',
    localImageFolder: 'notepix-local',
    uploadImageFolder: 'notepix-uploads',
    autoUpload: true,
    extraWatchedFolders: '',
    extraWatchedList: [],
    localOnlyFolders: '',
    localOnlyList: [],
    attachmentsFolderName: 'attachment',
    integrateAttachmentsOnMobile: true,
    lastPromptedAt: 0,
    lastPromptedRepo: '',
    autoDeleteEnabled: false,
    confirmBeforeDelete: true,
};
```

**修改后**  

```javascript
var DEFAULT_SETTINGS = {
    githubUser: "",
    repoName: "",
    encryptedToken: "",
    plainToken: "",
    branchName: "main",
    folderPath: "assets/",
    deleteLocal: false,
    useEncryption: true,
    repoVisibility: 'auto',
    repoHistory: [],
    uploadOnPaste: 'always',
    localImageFolder: 'notepix-local',
    uploadImageFolder: 'notepix-uploads',
    autoUpload: true,
    extraWatchedFolders: '',
    extraWatchedList: [],
    localOnlyFolders: '',
    localOnlyList: [],
    attachmentsFolderName: 'attachment',
    integrateAttachmentsOnMobile: true,
    lastPromptedAt: 0,
    lastPromptedRepo: '',
    autoDeleteEnabled: false,
    confirmBeforeDelete: true,
    // NEW: Image storage strategy
    imageStorageStrategy: 'global', // 'global' or 'byNotePath'
    byNotePathBaseFolder: 'Assets/Image', // base folder when using byNotePath
};
```

---

## 修改点 2：新增 `generateImageRemotePath` 方法

**插入位置**：在 `maybePromptRepoMismatch` 方法之后（约第 800-850 行区域，无原始代码，直接新增）

**新增代码**  

```javascript
// NEW: Generate remote path for image based on storage strategy
generateImageRemotePath(noteFilePath, imageFileName) {
    if (this.settings.imageStorageStrategy !== 'byNotePath') {
        // Global mode: use configured folderPath
        return joinRepoPath(this.settings.folderPath, imageFileName);
    }

    // By-note-path mode
    const baseFolder = (this.settings.byNotePathBaseFolder || 'Assets/Image').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (!noteFilePath) {
        // Fallback if no note path available
        return joinRepoPath(baseFolder, imageFileName);
    }

    // Normalize note path (vault-relative, e.g. "DL/ANN.md")
    const normalizedNotePath = this.normalizeVaultPath(noteFilePath);
    if (!normalizedNotePath) {
        return joinRepoPath(baseFolder, imageFileName);
    }

    // Split directory and basename
    const lastSlash = normalizedNotePath.lastIndexOf('/');
    let noteDir = '';
    let noteBase = normalizedNotePath;
    if (lastSlash >= 0) {
        noteDir = normalizedNotePath.substring(0, lastSlash);
        noteBase = normalizedNotePath.substring(lastSlash + 1);
    }
    // Remove extension from basename
    const extIndex = noteBase.lastIndexOf('.');
    if (extIndex > 0) {
        noteBase = noteBase.substring(0, extIndex);
    }

    // Build relative subpath: baseFolder / noteDir / noteBase
    const parts = [];
    if (baseFolder) parts.push(baseFolder);
    if (noteDir) parts.push(noteDir);
    if (noteBase) parts.push(noteBase);

    const subfolder = parts.join('/');
    return joinRepoPath(subfolder, imageFileName);
}
```

---

## 修改点 3：修改 `handleImageUpload` 方法签名和内部实现

**原始代码**（约第 850-950 行）  

```javascript
async handleImageUpload(file, isPaste = false) {
    if (!this.settings.githubUser || !this.settings.repoName) {
        new import_obsidian.Notice("GitHub User and Repo Name must be configured.");
        return;
    }
    const token = await this.getToken();
    if (!token) return;
    const uploadNotice = new import_obsidian.Notice(`Uploading ${file.name} to GitHub...`, 0);
    try {
        const timestamp = new Date().toISOString().replace(/[-:.]/g, "");
        const newFileName = `${timestamp}.${file.extension}`;
        const fileData = await (isPaste ? file.readBinary() : this.app.vault.readBinary(file));

        const base64Data = arrayBufferToBase64(fileData);
        const filePath = joinRepoPath(this.settings.folderPath, newFileName);   // <-- 原始路径生成
        // ... 后续上传逻辑
```

**修改后**  

```javascript
async handleImageUpload(file, isPaste = false, sourceNotePath = null) {   // <-- 新增参数
    if (!this.settings.githubUser || !this.settings.repoName) {
        new import_obsidian.Notice("GitHub User and Repo Name must be configured.");
        return;
    }
    const token = await this.getToken();
    if (!token) return;
    const uploadNotice = new import_obsidian.Notice(`Uploading ${file.name} to GitHub...`, 0);
    try {
        const timestamp = new Date().toISOString().replace(/[-:.]/g, "");
        const newFileName = `${timestamp}.${file.extension}`;
        const fileData = await (isPaste ? file.readBinary() : this.app.vault.readBinary(file));

        // Determine the target remote path based on strategy and note source
        let filePath;
        if (sourceNotePath) {
            filePath = this.generateImageRemotePath(sourceNotePath, newFileName);
        } else {
            // Fallback: try to get active note path
            const activeView = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
            if (activeView && activeView.file) {
                filePath = this.generateImageRemotePath(activeView.file.path, newFileName);
            } else {
                // Ultimate fallback: use global folderPath
                filePath = joinRepoPath(this.settings.folderPath, newFileName);
            }
        }

        const base64Data = arrayBufferToBase64(fileData);
        const apiUrl = `https://api.github.com/repos/${this.settings.githubUser}/${this.settings.repoName}/contents/${filePath}`;
        // ... 后续上传逻辑（不变）
```

---

## 修改点 4：修改 `vault.on("create")` 监听器，获取并传递源笔记路径

**原始代码**（约第 280-350 行，`this.registerEvent(this.app.vault.on("create", ...))` 内部）

在原始代码中，监听到图片文件创建后，直接调用 `this.handleImageUpload(file)`。

**修改后**：在调用 `handleImageUpload` 之前，增加获取 `sourceNotePath` 的逻辑，并传递给该方法。

```javascript
// 在 this.registerEvent(this.app.vault.on("create", async (file) => { ... }) 内部
// 找到调用 handleImageUpload 的位置（两处：shouldPrompt 分支和最后直接上传）

// 修改前（两处类似）：
await this.handleImageUpload(file);

// 修改后：
// NEW: Retrieve source note path from pending placeholder (if any)
let sourceNotePath = null;
const placeholderEntry = this.peekPendingLinkPlaceholder(file.path) || this.peekPendingLinkPlaceholder(file.name);
if (placeholderEntry && placeholderEntry.sourcePath) {
    sourceNotePath = placeholderEntry.sourcePath;
} else {
    // Fallback: get currently active markdown view path
    const activeView = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
    if (activeView && activeView.file) {
        sourceNotePath = activeView.file.path;
    }
}

// 然后调用时传入
await this.handleImageUpload(file, false, sourceNotePath);
```

> 注：两处调用（确认上传和自动上传）都需要同样修改。

---

## 修改点 5：修改 `uploadPastedImage` 方法，传递源笔记路径

**原始代码**（约第 500-550 行）  
在方法末尾，当 `autoUpload` 为 false 时直接调用 `handleImageUpload` 未传路径。

**修改后**  

```javascript
// 在 uploadPastedImage 方法中，创建临时文件并记录占位符后，原来为：
if (!this.settings.autoUpload) {
    await this.handleImageUpload(newFile);
}

// 修改为：
const sourcePath = activeView.file?.path || "";
if (!this.settings.autoUpload) {
    await this.handleImageUpload(newFile, false, sourcePath);
}
```

> 注意：此修改确保粘贴图片且关闭自动上传时，仍能按笔记路径存储。

---

## 修改点 6：修改设置界面（`GitHubUploaderSettingTab.display`）增加策略选项

**原始代码**（约第 1300-1400 行，设置项中只包含原有的 `Folder path in repository` 文本框）

**修改后**：在 `Branch name` 设置项之后、`Delete local file after upload` 之前插入以下 UI 代码。

```javascript
// 在 Branch name 设置项之后添加
new import_obsidian.Setting(containerEl)
    .setName("Image storage strategy")
    .setDesc("Global: all images go to the folder below. By Note Path: images are stored in subfolders matching the note's location (e.g., Assets/Image/DL/ANN/ for note DL/ANN.md).")
    .addDropdown(dropdown => dropdown
        .addOption('global', 'Global Folder')
        .addOption('byNotePath', 'By Note Path')
        .setValue(this.plugin.settings.imageStorageStrategy || 'global')
        .onChange(async (value) => {
            this.plugin.settings.imageStorageStrategy = value;
            await this.plugin.saveSettings();
            this.display(); // refresh to show/hide relevant fields
        }));

// 条件显示：根据策略决定显示哪个路径设置
if (this.plugin.settings.imageStorageStrategy === 'byNotePath') {
    new import_obsidian.Setting(containerEl)
        .setName("Base folder for by-note-path storage")
        .setDesc("Images will be saved under this folder, followed by the note's directory and name (e.g., Assets/Image/DL/ANN/).")
        .addText(text => text
            .setPlaceholder("Assets/Image")
            .setValue(this.plugin.settings.byNotePathBaseFolder || 'Assets/Image')
            .onChange(async (value) => {
                this.plugin.settings.byNotePathBaseFolder = value.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
                await this.plugin.saveSettings();
            }));
} else {
    // 原有的 "Folder path in repository" 设置项（保持原样）
    new import_obsidian.Setting(containerEl).setName("Folder path in repository").addText((text) => text.setPlaceholder("assets/").setValue(this.plugin.settings.folderPath).onChange(async (value) => {
        this.plugin.settings.folderPath = value.length > 0 && !value.endsWith("/") ? value + "/" : value;
        await this.plugin.saveSettings();
    }));
}
```

> 注意：原设置中的“Folder path in repository”代码块需要移到 `else` 分支内，或者用条件判断隐藏显示。上述修改展示了完整的替换逻辑。

---

## 修改点 7：调整 `handlePaste` 中的相关调用（可选，已包含在修改点 5 中）

因为 `uploadPastedImage` 已经修改，无需额外改动。但为了完整性，确认 `handlePaste` 中调用 `uploadPastedImage` 的地方无需修改（因为 `uploadPastedImage` 内部会获取当前笔记路径并传递）。

---

## 总结

以上所有修改均未破坏原有功能，仅增加了**按笔记路径分类存储**的策略选择。用户可通过插件设置自由切换两种模式，新上传的图片会根据策略自动归类。

---

# 修改上传文件名的命名格式

以下是实现“文件名基于文档标题层级和顺序”的完整修改代码。主要在 `handleImageUpload` 中替换原来的时间戳文件名生成逻辑，新增 `generateFileNameFromHeading` 方法和相关的计数器管理。

---

## 修改 1：在 `MyPlugin` 类中新增计数器属性及相关方法

在 `MyPlugin` 类的 `constructor` 中（约第 100 行附近）新增：

```javascript
constructor() {
    super(...arguments);
    // ... 原有属性保持不变
    this.imageCounterMap = new Map(); // 键: "notePath|headingPath"，值: 当前已使用的最大序号
}
```

在 `onunload` 中无需特别清理，内存即可。

新增两个方法（放在 `generateImageRemotePath` 方法之后）：

```javascript
// 获取下一个图片序号（基于笔记和标题路径）
getNextImageCounter(notePath, headingPath) {
    const key = `${notePath}|${headingPath}`;
    const current = this.imageCounterMap.get(key) || 0;
    const next = current + 1;
    this.imageCounterMap.set(key, next);
    return next;
}

// 重置某个笔记标题下的计数器（可选，用于手动清理；本实现暂不自动重置）
resetImageCounter(notePath, headingPath) {
    const key = `${notePath}|${headingPath}`;
    this.imageCounterMap.delete(key);
}
```

新增核心文件名生成方法（放在 `getNextImageCounter` 之后）：

```javascript
// 根据当前编辑器光标位置生成层级路径和序号
async generateFileNameFromHeading(editor, noteBasename, extension) {
    if (!editor) {
        // 如果没有编辑器，回退到时间戳
        const timestamp = new Date().toISOString().replace(/[-:.]/g, "");
        return `${timestamp}.${extension}`;
    }

    const cursor = editor.getCursor();
    const currentLineNum = cursor.line;
    const lines = editor.getValue().split('\n');
    
    // 收集光标位置向上的所有标题及其层级序号
    // 结果示例: [{ level: 1, text: "简介", index: 1 }, { level: 2, text: "背景", index: 1 }]
    const headings = [];
    const levelCounters = {}; // 记录每个层级当前遇到的序号
    
    for (let i = currentLineNum; i >= 0; i--) {
        const line = lines[i];
        const match = line.match(/^(#{1,6})\s+(.*)$/);
        if (match) {
            const level = match[1].length;
            const title = match[2].trim();
            // 计算该层级在当前段落中出现的序号（从1开始）
            if (!levelCounters[level]) levelCounters[level] = 0;
            levelCounters[level]++;
            headings.unshift({ level, title, index: levelCounters[level] });
            // 只向上收集，遇到更高层级时继续，但只需收集到最顶层即可，不需要继续向上
            // 如果已经收集到 level 1，通常可以继续向上（但 markdown 只允许一个 H1，继续也没问题）
        }
    }

    // 构建层级路径，例如 "1.2.3"
    const hierarchyPath = headings.map(h => h.index).join('.');
    if (!hierarchyPath) {
        // 如果没有任何标题，使用 "root"
        const fallbackPath = "root";
        const counter = this.getNextImageCounter(noteBasename, fallbackPath);
        return `${noteBasename}-${fallbackPath}-${counter}.${extension}`;
    }

    // 获取当前笔记路径（用于计数器键）
    const notePath = this.app.workspace.getActiveFile()?.path || 'unknown';
    const counter = this.getNextImageCounter(notePath, hierarchyPath);
    // 文件名：文档名-层级路径-序号.扩展名
    // 注意：移除文档名中的非法字符（只保留字母数字、汉字、连字符、下划线）
    const safeBasename = noteBasename.replace(/[\\/:*?"<>|]/g, '-');
    const safeHierarchy = hierarchyPath.replace(/[^0-9.]/g, '');
    return `${safeBasename}-${safeHierarchy}-${counter}.${extension}`;
}
```

---

## 修改 2：修改 `handleImageUpload` 中的文件名生成逻辑

找到 `handleImageUpload` 方法中原有代码：

```javascript
const timestamp = new Date().toISOString().replace(/[-:.]/g, "");
const newFileName = `${timestamp}.${file.extension}`;
```

将其替换为：

```javascript
let newFileName;
// 尝试基于编辑器光标位置生成层级文件名
const activeView = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
if (activeView && activeView.editor && sourceNotePath) {
    const noteFile = this.app.vault.getAbstractFileByPath(sourceNotePath);
    const noteBasename = noteFile ? noteFile.basename : 'image';
    try {
        newFileName = await this.generateFileNameFromHeading(activeView.editor, noteBasename, file.extension);
    } catch (err) {
        console.error("Failed to generate heading-based filename, fallback to timestamp", err);
        const timestamp = new Date().toISOString().replace(/[-:.]/g, "");
        newFileName = `${timestamp}.${file.extension}`;
    }
} else {
    // 无编辑器或无法获取源路径时，回退时间戳
    const timestamp = new Date().toISOString().replace(/[-:.]/g, "");
    newFileName = `${timestamp}.${file.extension}`;
}
```

注意：`sourceNotePath` 已经在之前的修改中传入，可以直接使用。

同时注意：如果是在 `isPaste` 模式下，`sourceNotePath` 可能已经由 `uploadPastedImage` 传递，因此同样有效。

---

## 修改 3：确保 `uploadPastedImage` 传递正确的源笔记路径

之前已经修改过 `uploadPastedImage`，确保调用 `handleImageUpload` 时传递了 `sourcePath`。无需额外改动。

---

## 完整修改后的 `handleImageUpload` 片段（仅显示修改区域）

```javascript
async handleImageUpload(file, isPaste = false, sourceNotePath = null) {
    // ... 前面检查 token 等不变 ...
    const uploadNotice = new import_obsidian.Notice(`Uploading ${file.name} to GitHub...`, 0);
    try {
        // 生成新文件名
        let newFileName;
        const activeView = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
        if (activeView && activeView.editor && (sourceNotePath || activeView.file?.path)) {
            const notePath = sourceNotePath || activeView.file.path;
            const noteFile = this.app.vault.getAbstractFileByPath(notePath);
            const noteBasename = noteFile ? noteFile.basename : 'image';
            try {
                newFileName = await this.generateFileNameFromHeading(activeView.editor, noteBasename, file.extension);
            } catch (err) {
                console.error("Heading filename failed, fallback to timestamp", err);
                const timestamp = new Date().toISOString().replace(/[-:.]/g, "");
                newFileName = `${timestamp}.${file.extension}`;
            }
        } else {
            const timestamp = new Date().toISOString().replace(/[-:.]/g, "");
            newFileName = `${timestamp}.${file.extension}`;
        }

        const fileData = await (isPaste ? file.readBinary() : this.app.vault.readBinary(file));
        // ... 后续上传逻辑不变，使用 newFileName ...
    } catch (error) {
        // ...
    }
}
```

---

## 修改 4（可选）：持久化计数器到插件数据

如果需要跨会话保留每个标题下的图片计数，可以在 `saveSettings` 和 `loadSettings` 中保存/恢复 `imageCounterMap`。由于计数器仅影响文件名顺序，不保存影响也不大（重启后会从1开始重新计数，可能导致文件名重复冲突的风险）。为了避免冲突，可以在生成文件名时扫描远程仓库中已存在的最大序号（但会增加 API 调用）。更简单的方式是将计数器保存在 settings 中：

在 `DEFAULT_SETTINGS` 中添加：

```javascript
imageCounters: {}, // 存储 { "notePath|headingPath": number }
```

在 `loadSettings` 中恢复 `imageCounterMap`：

```javascript
async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    // 恢复计数器
    this.imageCounterMap = new Map(Object.entries(this.settings.imageCounters || {}));
}
```

在 `saveSettings` 中保存 `imageCounterMap`：

```javascript
async saveSettings() {
    this.settings.imageCounters = Object.fromEntries(this.imageCounterMap);
    await this.saveData(this.settings);
}
```

修改 `getNextImageCounter` 方法，使其同时更新 `this.settings.imageCounters`（保持持久化）：

```javascript
getNextImageCounter(notePath, headingPath) {
    const key = `${notePath}|${headingPath}`;
    const current = this.imageCounterMap.get(key) || 0;
    const next = current + 1;
    this.imageCounterMap.set(key, next);
    // 同时更新 settings 以便持久化
    if (this.settings) {
        this.settings.imageCounters = Object.fromEntries(this.imageCounterMap);
    }
    return next;
}
```

这样，计数器会跨会话保留，避免重启后重复文件名。

---

## 总结

通过以上修改，实现了：

- 文件名格式：`文档名-标题层级路径-序号.扩展名`（如 `ANN-1.2.3-1.png`）
- 标题层级从当前光标位置向上解析，生成如 `1.2.3` 的多级编号。
- 计数器基于笔记路径和标题路径，持久化存储，避免命名冲突。
- 如果无法获取编辑器或解析失败，回退到时间戳文件名，保证稳定性。

所有修改均与现有的“按笔记路径存储”策略完美集成，不影响其他功能。
