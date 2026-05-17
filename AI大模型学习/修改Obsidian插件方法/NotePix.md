

---

修改 NotePix 关于 GitHub 上传后本地文件和云端不同导致在笔记中删除图片，云端没有删除。

⚠️ **开始前请务必**：将原始的 `main.js` 备份一份。

---

# 总体步骤概览

1. 在 `DEFAULT_SETTINGS` 中添加两个新配置项。
2. 在 `MyPlugin` 类中添加三个核心方法。
3. 在 `MyPlugin` 类的 `constructor` 中添加 `fileContentCache`。
4. 在 `onload` 方法中初始化缓存并注册两个事件（自动删除 + 右键菜单）。
5. 在设置面板类中添加两个开关。
6. 保存并测试。

---

# 第一步：添加配置项

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

# 第二步：在 `MyPlugin` 类中添加三个核心方法

**搜索**：`MyPlugin = class extends import_obsidian.Plugin {`

在这个类内部，任意位置（建议放在 `getDecryptedToken` 方法之后）添加以下三个方法：

## 2.1 提取图片链接的方法

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

## 2.2 找出被删除链接的方法

```javascript
    findDeletedImageLinks(oldContent, newContent) {
        const oldLinks = this.extractNotepixImageLinks(oldContent);
        const newLinks = this.extractNotepixImageLinks(newContent);
        return oldLinks.filter(oldLink => 
            !newLinks.some(newLink => newLink.remotePath === oldLink.remotePath)
        );
    }
```

## 2.3 从 GitHub 删除文件的方法

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

# 第三步：在构造函数中添加 `fileContentCache`

**搜索**：`constructor() {`

在构造函数中找到所有 `this.xxx = ...` 的末尾，添加：

```javascript
        this.fileContentCache = new Map();
```

例如，放在 `this.legacyUnresolvedUntil = new Map();` 的下一行。

---

# 第四步：修改 `onload` 方法

**搜索**：`async onload() {`

## 4.1 在 `await this.loadSettings();` 之后添加缓存初始化

```javascript
        // 初始化文件内容缓存
        const allFiles = this.app.vault.getMarkdownFiles();
        for (const f of allFiles) {
            const content = await this.app.vault.read(f);
            this.fileContentCache.set(f.path, content);
        }
```

## 4.2 在 `onload` 方法末尾（最后一个 `this.registerEvent` 之后，`}` 之前）添加两个事件监听

**自动删除监听（监听文件保存）**：

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

**右键菜单手动删除监听**：

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

# 第五步：在设置面板中添加两个开关

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

# 第六步：保存并测试

1. 将修改后的 `main.js` 保存到 Obsidian 插件目录（例如 `.obsidian/plugins/NotePix/`）。
2. 重启 Obsidian（或重新加载插件：`Ctrl+P` → “Reload app without saving”）。
3. 打开 NotePix 设置，开启 **Auto-delete images from GitHub**。
4. 测试：
   - **自动删除**：打开一个含有 Notepix 图片链接的笔记，删除链接文字，保存文件（`Ctrl+S`）。等待片刻，应弹出确认框，确认后 GitHub 上的文件被删除，笔记链接消失。
   - **手动删除**：右键点击图片链接所在行，选择 “🗑️ Delete image from GitHub”，同样可删除。

---

# 常见问题排查

- **自动删除不触发**：确保设置开关已打开，并且你**保存了文件**（`modify` 事件在保存时触发）。如果只是删除链接但不保存，不会触发。
- **GitHub 404**：说明文件路径不正确或文件不存在。检查 `remotePath` 输出（可以在 `deleteFileFromGitHub` 中加 `console.log` 查看）。
- **Token 未解锁（加密模式）**：首次使用时需要先解锁 token（例如手动上传一张图片触发密码输入）。也可以在设置中临时切换到明文模式测试。

如果仍有问题，请提供控制台错误信息，我会帮你进一步排查。



