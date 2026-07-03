const { Plugin, PluginSettingTab, Setting, Notice, TFolder, TFile, Menu } = require('obsidian');

// ========== 默认设置 ==========
const DEFAULT_SETTINGS = {
    baseFolder: 'Assets/Image',
    maxHeadingDepth: 6,
    uploadOnPaste: 'always',
    linkFormat: 'wiki', // 'wiki' 或 'markdown'
};

// ========== 主插件类 ==========
class LocalImageManager extends Plugin {
    async onload() {
        await this.loadSettings();
        this.addSettingTab(new SettingTab(this.app, this));

        this.registerEvent(this.app.workspace.on('editor-paste', this.handlePaste.bind(this)));
        this.registerEvent(this.app.workspace.on('editor-drop', this.handleDrop.bind(this)));

        this.addCommand({
            id: 'reorder-images',
            name: '重新整理当前笔记的图片序号',
            callback: () => this.reorderCurrentNoteImages(),
        });
        this.addCommand({
            id: 'convert-link-format',
            name: '将当前笔记图片链接转换为默认格式',
            callback: () => this.convertNoteLinksFormat(),
        });

        // 编辑器文本链接右键菜单（保留）
        this.registerEvent(this.app.workspace.on('editor-menu', this.handleEditorMenu.bind(this)));

        // 实时预览图片右键菜单（仅包含插件功能）
        this.registerDomEvent(document, 'contextmenu', this.handleDocumentContextMenu.bind(this));
    }

    onunload() { }

    // ========== 加载/保存设置 ==========
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
        if (!this.settings.imageCounters) {
            this.settings.imageCounters = {};
            await this.saveSettings();
        }
    }
    async saveSettings() {
        await this.saveData(this.settings);
    }

    // ========================================================================
    // 右键菜单：编辑器文本链接（保留）
    // ========================================================================
    handleEditorMenu(menu, editor, view) {
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);
        if (!line) return;

        const linkRegex = /(?:!\[\[([^\]]+)\]\]|!\[[^\]]*\]\(([^)]+)\))/;
        const match = line.match(linkRegex);
        if (!match) return;

        const linkPath = match[1] || match[2];
        if (!linkPath) return;

        const noteFile = view.file;
        if (!noteFile) return;
        const file = this.app.metadataCache.getFirstLinkpathDest(linkPath, noteFile.path);
        if (!file) return;

        const nameRegex = /^\d+(?:\.\d+)*-\d+\.\w+$/;
        if (!nameRegex.test(file.name)) return;

        menu.addItem((item) => {
            item.setTitle('重新整理本笔记图片序号')
                .setIcon('sort-desc')
                .onClick(() => this.reorderCurrentNoteImages());
        });

        menu.addItem((item) => {
            item.setTitle('删除此图片（文件与链接）')
                .setIcon('trash')
                .onClick(async () => {
                    const confirmModal = new ConfirmationModal(
                        this.app,
                        '确认删除',
                        `确定要删除图片 "${file.name}" 并从笔记中移除所有链接吗？\n此操作会将文件移至回收站。`
                    );
                    const confirmed = await new Promise(resolve => {
                        confirmModal.open();
                        confirmModal.onClose = () => resolve(confirmModal.confirmed);
                    });
                    if (!confirmed) return;
                    await this.removeAllLinksToFileAndDelete(view, file);
                });
        });
    }

    // ========================================================================
    // 右键菜单：实时预览图片（仅包含插件特有功能）
    // ========================================================================
    handleDocumentContextMenu(evt) {
        const target = evt.target;
        if (!(target instanceof Element)) return;

        const view = this.app.workspace.getActiveViewOfType(require('obsidian').MarkdownView);
        if (!view) return;

        const container = view.contentEl;
        if (!container.contains(target)) return;

        const img = target.closest('img');
        if (!img) return;

        let linkPath = img.getAttribute('data-href') || img.getAttribute('src');
        if (!linkPath) return;

        const noteFile = view.file;
        if (!noteFile) return;

        // 解析文件
        let file = this.app.metadataCache.getFirstLinkpathDest(linkPath, noteFile.path);
        if (!file) {
            const fileName = linkPath.split('/').pop().split('?')[0];
            if (fileName) {
                const allFiles = this.app.vault.getFiles();
                for (const f of allFiles) {
                    if (f.name === fileName && /^\d+(?:\.\d+)*-\d+\.\w+$/.test(f.name)) {
                        file = f;
                        break;
                    }
                }
            }
        }
        if (!file) return;

        const nameRegex = /^\d+(?:\.\d+)*-\d+\.\w+$/;
        if (!nameRegex.test(file.name)) return;

        // 阻止默认菜单，显示自定义菜单
        evt.preventDefault();
        evt.stopPropagation();

        const menu = new Menu();

        // 只添加插件特有的功能
        menu.addItem((item) => {
            item.setTitle('重新整理本笔记图片序号')
                .setIcon('sort-desc')
                .onClick(() => this.reorderCurrentNoteImages());
        });

        menu.addItem((item) => {
            item.setTitle('删除此图片（文件与链接）')
                .setIcon('trash')
                .onClick(async () => {
                    const confirmModal = new ConfirmationModal(
                        this.app,
                        '确认删除',
                        `确定要删除图片 "${file.name}" 并从笔记中移除所有链接吗？\n此操作会将文件移至回收站。`
                    );
                    const confirmed = await new Promise(resolve => {
                        confirmModal.open();
                        confirmModal.onClose = () => resolve(confirmModal.confirmed);
                    });
                    if (!confirmed) return;
                    await this.removeAllLinksToFileAndDelete(view, file);
                });
        });

        menu.showAtMouseEvent(evt);
    }

    // ========================================================================
    // 删除图片文件并移除当前笔记中所有指向该文件的链接
    // ========================================================================
    async removeAllLinksToFileAndDelete(view, file) {
        const noteFile = view.file;
        if (!noteFile) return;

        let content = await this.app.vault.read(noteFile);
        const relativePath = this.getSafeRelativePath(noteFile, file.path);
        const escaped = relativePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(?:!\\[\\[${escaped}\\]\\]|!\\[[^\\]]*\\]\\(${escaped}\\))`, 'g');
        const newContent = content.replace(regex, '');

        if (newContent !== content) {
            await this.app.vault.modify(noteFile, newContent);
            new Notice(`已从笔记中移除 ${file.name} 的所有链接。`);
        } else {
            new Notice(`未找到 ${file.name} 的链接。`);
        }

        try {
            if (this.app.vault.trash) {
                await this.app.vault.trash(file, true);
                new Notice(`已删除文件: ${file.name}（已移至回收站）`);
            } else {
                await this.app.vault.delete(file);
                new Notice(`已删除文件: ${file.name}（直接删除）`);
            }
        } catch (err) {
            console.error('删除文件失败:', err);
            new Notice(`删除文件失败: ${err.message}`);
        }
    }

    // ========================================================================
    // 安全生成相对路径（纯手动构建）
    // ========================================================================
    getSafeRelativePath(noteFile, targetPath) {
        const noteParts = noteFile.path.split('/').filter(p => p);
        const targetParts = targetPath.split('/').filter(p => p);
        let commonIndex = 0;
        while (commonIndex < noteParts.length && commonIndex < targetParts.length && noteParts[commonIndex] === targetParts[commonIndex]) {
            commonIndex++;
        }
        const upCount = noteParts.length - commonIndex;
        const downParts = targetParts.slice(commonIndex);
        const relativeParts = [];
        for (let i = 0; i < upCount; i++) relativeParts.push('..');
        relativeParts.push(...downParts);
        return relativeParts.join('/');
    }

    // ========================================================================
    // 以下为原有功能（粘贴、拖拽、保存、生成文件名、计数器、整理、转换等）
    // ========================================================================

    // ========== 处理粘贴 ==========
    async handlePaste(evt) {
        const files = evt.clipboardData?.files;
        if (!files || files.length === 0) return;
        const imageFile = Array.from(files).find(file => file.type.startsWith('image/'));
        if (!imageFile) return;
        if (this.settings.uploadOnPaste === 'ask') {
            const confirmed = await new Promise(resolve => {
                const modal = new ConfirmationModal(this.app, '保存图片到本地？', '是否将图片保存到本地并插入链接？');
                modal.open();
                modal.onClose = () => resolve(modal.confirmed);
            });
            if (!confirmed) return;
        }
        evt.preventDefault();
        await this.saveImageLocally(imageFile);
    }

    // ========== 处理拖拽 ==========
    async handleDrop(evt) {
        const files = evt.dataTransfer?.files;
        if (!files || files.length === 0) return;
        const imageFile = Array.from(files).find(file => file.type.startsWith('image/'));
        if (!imageFile) return;
        if (this.settings.uploadOnPaste === 'ask') {
            const confirmed = await new Promise(resolve => {
                const modal = new ConfirmationModal(this.app, '保存图片到本地？', '是否将图片保存到本地并插入链接？');
                modal.open();
                modal.onClose = () => resolve(modal.confirmed);
            });
            if (!confirmed) return;
        }
        evt.preventDefault();
        await this.saveImageLocally(imageFile);
    }

    // ========== 保存图片到本地 ==========
    async saveImageLocally(imageFile) {
        const activeView = this.app.workspace.getActiveViewOfType(require('obsidian').MarkdownView);
        if (!activeView) {
            new Notice('没有打开的编辑器。');
            return;
        }
        const editor = activeView.editor;
        const noteFile = activeView.file;
        if (!noteFile) return;

        const extension = imageFile.name.split('.').pop() || 'png';
        const noteBasename = noteFile.basename;
        let newFileName, usedFallback;
        try {
            const result = await this.generateFileNameFromHeading(editor, noteBasename, extension);
            newFileName = result.fileName;
            usedFallback = result.usedFallback;
        } catch (err) {
            console.error('生成文件名失败，使用时间戳', err);
            const fallback = this.fallbackFileName(extension, noteBasename);
            newFileName = fallback;
            usedFallback = true;
        }

        if (!newFileName) {
            newFileName = this.fallbackFileName(extension, noteBasename);
            usedFallback = true;
        }
        if (!newFileName.includes('.')) {
            newFileName += '.png';
        }

        if (usedFallback) {
            new Notice('当前光标位置无有效标题，建议在标题层级下粘贴图片以获得有序命名。', 5000);
        }

        const notePath = noteFile.path;
        const baseFolder = this.settings.baseFolder.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
        const noteName = noteFile.basename;
        const noteDir = notePath.substring(0, notePath.lastIndexOf('/') + 1);
        let targetFolder = baseFolder;
        if (noteDir) targetFolder = `${targetFolder}/${noteDir}`.replace(/\/$/, '');
        if (noteName) targetFolder = `${targetFolder}/${noteName}`;
        targetFolder = targetFolder.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

        await this.ensureFolderExists(targetFolder);

        const arrayBuffer = await imageFile.arrayBuffer();
        let targetPath = `${targetFolder}/${newFileName}`;
        let finalPath = targetPath;
        let counter = 1;
        const adapter = this.app.vault.adapter;
        while (await adapter.exists(finalPath)) {
            const ext = newFileName.split('.').pop() || 'png';
            const base = newFileName.slice(0, -(ext.length + 1));
            let newName = `${base}-${counter}.${ext}`;
            if (!newName.includes('.')) newName += '.png';
            finalPath = `${targetFolder}/${newName}`;
            counter++;
        }

        console.log(`[DEBUG] 保存图片到: ${finalPath}`);
        await this.app.vault.createBinary(finalPath, arrayBuffer);

        const createdFile = this.app.vault.getAbstractFileByPath(finalPath);
        if (!createdFile || !(createdFile instanceof TFile)) {
            console.error(`文件创建失败: ${finalPath}`);
            new Notice('保存图片失败：文件创建异常。');
            return;
        }

        const relativePath = this.getSafeRelativePath(noteFile, finalPath);
        console.log(`[DEBUG] 相对路径: ${relativePath}`);
        let linkText;
        if (this.settings.linkFormat === 'markdown') {
            linkText = `![](${relativePath})`;
        } else {
            linkText = `![[${relativePath}]]`;
        }
        editor.replaceSelection(linkText);
        new Notice(`图片已保存到: ${finalPath}`);
    }

    // ========== 生成基于标题层级的文件名 ==========
    async generateFileNameFromHeading(editor, noteBasename, extension) {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            return { fileName: this.fallbackFileName(extension, noteBasename), usedFallback: true };
        }

        const cache = this.app.metadataCache.getFileCache(activeFile, true);
        const headings = cache?.headings;
        if (!headings || headings.length === 0) {
            return { fileName: this.fallbackFileName(extension, noteBasename), usedFallback: true };
        }

        const cursor = editor.getCursor();
        const cursorLine = cursor.line;

        let currentHeading = null;
        for (let i = headings.length - 1; i >= 0; i--) {
            const heading = headings[i];
            if (heading.position.start.line <= cursorLine) {
                currentHeading = heading;
                break;
            }
        }

        if (!currentHeading) {
            return { fileName: this.fallbackFileName(extension, noteBasename), usedFallback: true };
        }

        const counters = [];
        const headingToPath = new Map();
        for (const h of headings) {
            const level = h.level;
            while (counters.length < level) counters.push(0);
            if (counters.length > level) counters.length = level;
            counters[level - 1]++;
            const path = counters.slice(0, level).join('.');
            headingToPath.set(h, path);
        }

        let targetPath = headingToPath.get(currentHeading);
        if (!targetPath) {
            return { fileName: this.fallbackFileName(extension, noteBasename), usedFallback: true };
        }

        const maxDepth = this.settings.maxHeadingDepth || 6;
        const parts = targetPath.split('.');
        if (parts.length > maxDepth) {
            targetPath = parts.slice(0, maxDepth).join('.');
        }

        const notePath = activeFile.path;
        const counter = await this.getNextImageCounter(notePath, targetPath);

        const safePath = targetPath.replace(/[^0-9.]/g, '');
        const fileName = `${safePath}-${counter}.${extension}`;
        return { fileName, usedFallback: false };
    }

    // ========== 后备文件名 ==========
    fallbackFileName(extension, noteName = 'image') {
        const dateStr = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15);
        return `${noteName}-${dateStr}.${extension}`;
    }

    // ========== 图片计数器 ==========
    async getNextImageCounter(notePath, headingPath) {
        const key = `${notePath}|${headingPath}`;
        let current = this.settings.imageCounters?.[key] || 0;
        const next = current + 1;
        if (!this.settings.imageCounters) this.settings.imageCounters = {};
        this.settings.imageCounters[key] = next;
        await this.saveSettings();
        return next;
    }

    // ========== 确保文件夹存在 ==========
    async ensureFolderExists(folderPath) {
        if (!folderPath) return;
        try {
            await this.app.vault.createFolder(folderPath);
        } catch (_) { }
    }

    // ========================================================================
    // 转换当前笔记中的图片链接格式
    // ========================================================================
    async convertNoteLinksFormat() {
        const activeView = this.app.workspace.getActiveViewOfType(require('obsidian').MarkdownView);
        if (!activeView) {
            new Notice('没有打开的笔记。');
            return;
        }
        const noteFile = activeView.file;
        if (!noteFile) return;

        let content = await this.app.vault.read(noteFile);
        const notePath = noteFile.path;

        const linkRegex = /(?:!\[\[([^\]]+)\]\]|!\[[^\]]*\]\(([^)]+)\))/g;
        let match;
        const replacements = [];

        while ((match = linkRegex.exec(content)) !== null) {
            const linkPath = match[1] || match[2];
            if (!linkPath) continue;
            const file = this.app.metadataCache.getFirstLinkpathDest(linkPath, notePath);
            if (!file) continue;

            const nameRegex = /^\d+(?:\.\d+)*-\d+\.\w+$/;
            if (!nameRegex.test(file.name)) continue;

            const fullMatch = match[0];
            const newRelativePath = this.getSafeRelativePath(noteFile, file.path);
            let newFullMatch;
            if (this.settings.linkFormat === 'markdown') {
                newFullMatch = `![](${newRelativePath})`;
            } else {
                newFullMatch = `![[${newRelativePath}]]`;
            }

            if (fullMatch !== newFullMatch) {
                replacements.push({ old: fullMatch, new: newFullMatch });
            }
        }

        if (replacements.length === 0) {
            new Notice('没有需要转换的链接（已全部为目标格式）。');
            return;
        }

        const confirmModal = new ConfirmationModal(
            this.app,
            '转换链接格式',
            `将转换 ${replacements.length} 个图片链接为 ${this.settings.linkFormat === 'markdown' ? 'Markdown' : 'Wiki'} 格式。\n确定继续吗？`
        );
        const confirmed = await new Promise(resolve => {
            confirmModal.open();
            confirmModal.onClose = () => resolve(confirmModal.confirmed);
        });
        if (!confirmed) return;

        let updatedContent = content;
        for (const rep of replacements) {
            updatedContent = updatedContent.split(rep.old).join(rep.new);
        }
        await this.app.vault.modify(noteFile, updatedContent);
        new Notice(`已转换 ${replacements.length} 个图片链接。`);
    }

    // ========================================================================
    // 重新整理当前笔记的图片序号
    // ========================================================================
    async reorderCurrentNoteImages() {
        const activeView = this.app.workspace.getActiveViewOfType(require('obsidian').MarkdownView);
        if (!activeView) {
            new Notice('没有打开的笔记。');
            return;
        }
        const noteFile = activeView.file;
        if (!noteFile) {
            new Notice('没有找到文件。');
            return;
        }

        let content = await this.app.vault.read(noteFile);
        const notePath = noteFile.path;

        const cache = this.app.metadataCache.getFileCache(noteFile, true);
        const headings = cache?.headings;
        if (!headings || headings.length === 0) {
            new Notice('当前笔记没有标题，无法重新整理。');
            return;
        }

        const getHeadingPathAtLine = (lineNumber) => {
            let currentHeading = null;
            for (let i = headings.length - 1; i >= 0; i--) {
                const h = headings[i];
                if (h.position.start.line <= lineNumber) {
                    currentHeading = h;
                    break;
                }
            }
            if (!currentHeading) return "root";

            const counters = [];
            const headingToPath = new Map();
            for (const h of headings) {
                const level = h.level;
                while (counters.length < level) counters.push(0);
                if (counters.length > level) counters.length = level;
                counters[level - 1]++;
                const path = counters.slice(0, level).join('.');
                headingToPath.set(h, path);
            }
            const fullPath = headingToPath.get(currentHeading);
            if (!fullPath) return "root";
            const maxDepth = this.settings.maxHeadingDepth || 6;
            const parts = fullPath.split('.');
            return parts.slice(0, maxDepth).join('.');
        };

        const linkRegex = /(?:!\[\[([^\]]+)\]\]|!\[[^\]]*\]\(([^)]+)\))/g;
        const matches = [];
        let match;
        while ((match = linkRegex.exec(content)) !== null) {
            const linkPath = match[1] || match[2];
            if (!linkPath) continue;
            const file = this.app.metadataCache.getFirstLinkpathDest(linkPath, notePath);
            if (!file) continue;

            const nameRegex = /^(\d+(?:\.\d+)*|root)-(\d+)\.(\w+)$/;
            const nameMatch = file.name.match(nameRegex);
            if (!nameMatch) continue;

            const oldHeadingPath = nameMatch[1];
            const currentNumber = parseInt(nameMatch[2], 10);
            const ext = nameMatch[3];
            const fullMatch = match[0];
            const index = match.index;
            const lineNumber = content.substring(0, index).split('\n').length - 1;
            const newHeadingPath = getHeadingPathAtLine(lineNumber);

            matches.push({
                fullMatch,
                linkPath,
                file,
                oldHeadingPath,
                newHeadingPath,
                currentNumber,
                ext,
                fileName: file.name,
                index,
                lineNumber,
            });
        }

        if (matches.length === 0) {
            new Notice('当前笔记中没有找到由本插件管理的图片。');
            return;
        }

        const groups = new Map();
        for (const info of matches) {
            const key = info.newHeadingPath;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(info);
        }

        const layersToProcess = [];
        for (const [headingPath, infos] of groups.entries()) {
            infos.sort((a, b) => a.index - b.index);

            let isContinuous = true;
            for (let i = 0; i < infos.length; i++) {
                if (infos[i].currentNumber !== i + 1) {
                    isContinuous = false;
                    break;
                }
            }

            let allMatch = true;
            for (const info of infos) {
                if (info.oldHeadingPath !== headingPath) {
                    allMatch = false;
                    break;
                }
            }

            if (!isContinuous || !allMatch) {
                layersToProcess.push({ headingPath, infos });
            } else {
                console.log(`层级 ${headingPath} 序号连续且层级匹配，跳过。`);
            }
        }

        if (layersToProcess.length === 0) {
            new Notice('所有图片的序号和层级均已正确，无需整理。');
            return;
        }

        const totalImages = layersToProcess.reduce((sum, layer) => sum + layer.infos.length, 0);
        const groupCount = layersToProcess.length;
        const confirmModal = new ConfirmationModal(
            this.app,
            '重新整理图片序号',
            `将重新整理 ${totalImages} 张图片（共 ${groupCount} 个层级），使每个层级的编号从 1 开始连续，并修正层级前缀。\n确定继续吗？`
        );
        const confirmed = await new Promise(resolve => {
            confirmModal.open();
            confirmModal.onClose = () => resolve(confirmModal.confirmed);
        });
        if (!confirmed) return;

        const renameOperations = [];
        const replacements = [];

        for (const { headingPath, infos } of layersToProcess) {
            let newNumber = 1;
            for (const info of infos) {
                const newBase = `${headingPath}-${newNumber}`;
                const newFileName = `${newBase}.${info.ext}`;
                const dirPath = info.file.path.substring(0, info.file.path.lastIndexOf('/') + 1);
                const newPath = `${dirPath}${newFileName}`;

                if (info.file.path !== newPath) {
                    renameOperations.push({ oldFile: info.file, newPath });
                }

                const newRelativePath = this.getSafeRelativePath(noteFile, newPath);
                console.log(`[DEBUG] ${info.file.name} -> ${newPath}, 相对路径: ${newRelativePath}`);
                let newFullMatch;
                if (this.settings.linkFormat === 'markdown') {
                    newFullMatch = `![](${newRelativePath})`;
                } else {
                    newFullMatch = `![[${newRelativePath}]]`;
                }
                replacements.push({
                    oldFullMatch: info.fullMatch,
                    newFullMatch,
                });

                newNumber++;
            }
        }

        renameOperations.sort((a, b) => {
            const numA = parseInt(a.newPath.match(/-(\d+)\./)[1], 10);
            const numB = parseInt(b.newPath.match(/-(\d+)\./)[1], 10);
            return numB - numA;
        });

        let renamedCount = 0;
        if (renameOperations.length > 0) {
            const progressNotice = new Notice(`正在重命名文件... (0/${renameOperations.length})`, 0);
            for (let i = 0; i < renameOperations.length; i++) {
                const op = renameOperations[i];
                try {
                    await this.app.vault.rename(op.oldFile, op.newPath);
                    renamedCount++;
                } catch (err) {
                    console.error(`重命名失败: ${op.oldFile.path} -> ${op.newPath}`, err);
                    new Notice(`重命名 ${op.oldFile.name} 失败，跳过该文件。`);
                    const idx = replacements.findIndex(r => r.oldFullMatch === `![[${op.oldFile.path}]]`);
                    if (idx !== -1) replacements.splice(idx, 1);
                }
                if (i % 5 === 0 || i === renameOperations.length - 1) {
                    progressNotice.setMessage(`正在重命名文件... (${i + 1}/${renameOperations.length})`);
                }
            }
            progressNotice.hide();
            new Notice(`已重命名 ${renamedCount} 个文件。`);
        } else {
            new Notice('无需重命名文件（所有路径均已正确）。');
        }

        if (replacements.length > 0) {
            let updatedContent = content;
            for (const rep of replacements) {
                updatedContent = updatedContent.split(rep.oldFullMatch).join(rep.newFullMatch);
            }
            if (updatedContent !== content) {
                await this.app.vault.modify(noteFile, updatedContent);
                new Notice(`已更新 ${replacements.length} 个图片链接并统一格式。`);
            } else {
                new Notice('没有链接需要更新。');
            }
        }

        let countersUpdated = 0;
        for (const [headingPath, infos] of groups.entries()) {
            const key = `${noteFile.path}|${headingPath}`;
            const newCount = infos.length;
            if (this.settings.imageCounters[key] !== newCount) {
                this.settings.imageCounters[key] = newCount;
                countersUpdated++;
            }
        }
        if (countersUpdated > 0) {
            await this.saveSettings();
            new Notice(`已更新 ${countersUpdated} 个层级的计数器。`);
        }

        new Notice('重新整理完成！');
    }
}

// ========== 确认弹窗 ==========
class ConfirmationModal extends require('obsidian').Modal {
    constructor(app, title, message) {
        super(app);
        this.title = title;
        this.message = message;
        this.confirmed = false;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: this.title });
        contentEl.createEl('p', { text: this.message });
        new Setting(contentEl)
            .addButton(btn => btn.setButtonText('是').setCta().onClick(() => {
                this.confirmed = true;
                this.close();
            }))
            .addButton(btn => btn.setButtonText('否').onClick(() => {
                this.confirmed = false;
                this.close();
            }));
    }
}

// ========== 设置选项卡 ==========
class SettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('基础存储文件夹')
            .setDesc('图片将保存在此文件夹下，后接笔记的目录和文件名（例如 Assets/Image/DL/ANN/）。')
            .addText(text => text
                .setPlaceholder('Assets/Image')
                .setValue(this.plugin.settings.baseFolder)
                .onChange(async (value) => {
                    this.plugin.settings.baseFolder = value.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('标题层级最大深度')
            .setDesc('生成文件名时最多使用几级标题序号（1-6）。超出部分将被截断。')
            .addSlider(slider => slider
                .setLimits(1, 6, 1)
                .setValue(this.plugin.settings.maxHeadingDepth)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.maxHeadingDepth = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('粘贴图片行为')
            .setDesc('总是保存：粘贴时自动保存。每次询问：弹出确认窗口。')
            .addDropdown(dropdown => dropdown
                .addOption('always', '总是保存')
                .addOption('ask', '每次询问')
                .setValue(this.plugin.settings.uploadOnPaste)
                .onChange(async (value) => {
                    this.plugin.settings.uploadOnPaste = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('默认链接格式')
            .setDesc('选择插入图片时使用的链接格式。执行“重新整理”或“转换格式”命令时，也会统一为这个格式。')
            .addDropdown(dropdown => dropdown
                .addOption('wiki', 'Wiki 链接 (![[]])')
                .addOption('markdown', 'Markdown 链接 (![]())')
                .setValue(this.plugin.settings.linkFormat)
                .onChange(async (value) => {
                    this.plugin.settings.linkFormat = value;
                    await this.plugin.saveSettings();
                }));
    }
}

module.exports = LocalImageManager;