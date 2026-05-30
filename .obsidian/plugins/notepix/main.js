var import_obsidian = require("obsidian");

//中文注释全部都有了
// ========== 辅助函数 ==========
// 拼接仓库路径（移动端安全）
function joinRepoPath(folderPath, fileName) {
    const raw = (folderPath || "").replace(/\\/g, "/").trim();
    const folder = raw.replace(/^\/+|\/+$/g, "");
    const combined = folder ? `${folder}/${fileName}` : fileName;
    try {
        return import_obsidian.normalizePath ? import_obsidian.normalizePath(combined) : combined.replace(/\/+/g, "/");
    } catch (_) {
        return combined.replace(/\/+/g, "/");
    }
}

// 将二进制数据转为 Base64（避免二次方级字符串拼接）
function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 32768;
    const chunks = [];
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        chunks.push(String.fromCharCode.apply(null, chunk));
    }
    return btoa(chunks.join(""));
}

// 转义正则表达式特殊字符
function escapeRegex(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 平台检测（移动端）
const isMobile = !!(import_obsidian.Platform && import_obsidian.Platform.isMobile);

// ========== 加密模块（AES-GCM） ==========
const PBKDF2_ITERATIONS = 1e5;
const ALGORITHM = "AES-GCM";

async function getKey(password, salt) {
    const passwordBuffer = new TextEncoder().encode(password);
    const baseKey = await crypto.subtle.importKey(
        "raw",
        passwordBuffer,
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt,
            iterations: PBKDF2_ITERATIONS,
            hash: "SHA-256"
        },
        baseKey,
        { name: ALGORITHM, length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
}

async function encrypt(plaintext, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await getKey(password, salt);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encodedPlaintext = new TextEncoder().encode(plaintext);
    const encryptedContent = await crypto.subtle.encrypt(
        { name: ALGORITHM, iv },
        key,
        encodedPlaintext
    );
    const saltB64 = btoa(String.fromCharCode(...new Uint8Array(salt)));
    const ivB64 = btoa(String.fromCharCode(...new Uint8Array(iv)));
    const encryptedB64 = btoa(String.fromCharCode(...new Uint8Array(encryptedContent)));
    return `${saltB64}:${ivB64}:${encryptedB64}`;
}

async function decrypt(encryptedString, password) {
    const [saltB64, ivB64, encryptedB64] = encryptedString.split(":");
    if (!saltB64 || !ivB64 || !encryptedB64) {
        throw new Error("无效的加密数据格式。");
    }
    const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
    const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
    const encryptedContent = Uint8Array.from(atob(encryptedB64), c => c.charCodeAt(0));
    const key = await getKey(password, salt);
    const decryptedContent = await crypto.subtle.decrypt(
        { name: ALGORITHM, iv },
        key,
        encryptedContent
    );
    return new TextDecoder().decode(decryptedContent);
}

// ========== 默认设置 ==========
const DEFAULT_SETTINGS = {
    // GitHub 账户
    githubUser: "",
    repoName: "",
    encryptedToken: "",
    plainToken: "",
    branchName: "main",
    // 存储策略
    imageStorageStrategy: 'global',      // 'global' 全局文件夹, 'byNotePath' 按笔记路径
    folderPath: "assets/",               // 全局模式下的仓库内路径
    byNotePathBaseFolder: "Assets/Image", // 按笔记路径模式的基础目录
    // 上传行为
    deleteLocal: false,
    useEncryption: true,
    repoVisibility: 'auto',               // 'auto', 'public', 'private'
    repoHistory: [],
    uploadOnPaste: 'always',              // 'always', 'ask'
    autoUpload: true,
    // 本地文件夹管理
    localImageFolder: 'notepix-local',
    uploadImageFolder: 'notepix-uploads',
    extraWatchedFolders: '',
    extraWatchedList: [],
    localOnlyFolders: '',
    localOnlyList: [],
    // 移动端集成
    attachmentsFolderName: 'attachment',
    integrateAttachmentsOnMobile: true,
    // 提示抑制
    lastPromptedAt: 0,
    lastPromptedRepo: '',
    autoDeleteEnabled: false,
    confirmBeforeDelete: true,
    // 图片计数器持久化
    imageCounters: {}    // { "笔记路径|标题层级路径": 当前序号 }
};

// ========== 主插件类 ==========
var MyPlugin = class extends import_obsidian.Plugin {
    constructor() {
        super(...arguments);
        // 解密后的 Token（内存缓存）
        this.decryptedToken = null;
        this.isPromptingForPassword = false;
        // 移动端附件文件夹
        this.mobileAttachmentFolder = '';
        // 用户已批准的上传（避免重复弹窗）
        this.userApprovedUploads = new Map();
        // 待替换的占位符链接
        this.pendingLinkReplacements = new Map();
        this.recentPlaceholdersByName = new Map();
        // 仓库隐私检测缓存
        this.repoPrivacyCache = null;
        this._fileOpenDebounceTimer = null;
        this._mismatchNoticeShown = false;
        this._lastRenderTokenNoticeAt = 0;
        // 图片获取失败记录
        this.failedImageFetches = new Map();
        // 遗留链接迁移
        this.pendingLegacyMigrations = new Map();
        this.pendingLegacyMigrationTimers = new Map();
        this.repoListCache = null;
        this.legacyResolvedRepoByKey = new Map();
        this.legacyUnresolvedUntil = new Map();
        // 文件内容缓存（自动删除功能暂未启用，保留）
        this.fileContentCache = new Map();
        // 图片计数器（跨会话）
        this.imageCounterMap = new Map();
        // 私有图片 Blob URL 缓存
        this.imageCache = new Map();
    }

    // ========== 工具方法 ==========
    getVaultFolderPaths() {
        const res = [];
        const root = this.app.vault.getRoot();
        const walk = (folder) => {
            const p = (folder.path || "").replace(/^\/+|\/+$/g, "");
            res.push(p);
            const children = folder.children || [];
            for (const child of children) {
                if (child instanceof import_obsidian.TFolder) {
                    walk(child);
                }
            }
        };
        walk(root);
        return res;
    }

    normalizeVaultPath(path) {
        return (path || '').replace(/\\\\/g, "/").replace(/^\/+|\/+$/g, "");
    }

    getLegacyRepoCandidates(primaryRepo) {
        const normalizedPrimary = (primaryRepo || '').trim();
        const history = Array.isArray(this.settings.repoHistory) ? this.settings.repoHistory : [];
        const set = new Set();
        if (normalizedPrimary) set.add(normalizedPrimary);
        for (const entry of history) {
            const repo = String(entry || '').trim();
            if (repo) set.add(repo);
        }
        if (normalizedPrimary) {
            if (normalizedPrimary.endsWith('s') && normalizedPrimary.length > 1) {
                set.add(normalizedPrimary.slice(0, -1));
            } else {
                set.add(`${normalizedPrimary}s`);
            }
        }
        return Array.from(set.values());
    }

    clearRepoListCache() {
        this.repoListCache = null;
        if (this.legacyResolvedRepoByKey) this.legacyResolvedRepoByKey.clear();
        if (this.legacyUnresolvedUntil) this.legacyUnresolvedUntil.clear();
    }

    async getConfiguredUserRepoList(token) {
        const configuredUser = (this.settings.githubUser || '').trim();
        if (!configuredUser || !token) return [];
        if (this.repoListCache &&
            this.repoListCache.user === configuredUser &&
            (Date.now() - this.repoListCache.timestamp) < 10 * 60 * 1000) {
            return this.repoListCache.repos || [];
        }
        try {
            const collected = [];
            const userLower = configuredUser.toLowerCase();
            for (let page = 1; page <= 10; page++) {
                const url = `https://api.github.com/user/repos?per_page=100&page=${page}&sort=updated&direction=desc&type=all&affiliation=owner,collaborator,organization_member`;
                const response = await fetch(url, {
                    headers: {
                        "Authorization": `token ${token}`,
                        "Accept": "application/vnd.github.v3+json"
                    }
                });
                if (!response.ok) break;
                const arr = await response.json();
                if (!Array.isArray(arr) || arr.length === 0) break;
                for (const repo of arr) {
                    const ownerLogin = String(repo?.owner?.login || '').toLowerCase();
                    const name = String(repo?.name || '').trim();
                    if (name && ownerLogin === userLower) collected.push(name);
                }
                if (arr.length < 100) break;
            }
            const unique = Array.from(new Set(collected));
            this.repoListCache = { user: configuredUser, repos: unique, timestamp: Date.now() };
            return unique;
        } catch (e) {
            console.error('NotePix: 获取用户仓库列表失败', e);
            return [];
        }
    }

    // 遗留链接迁移（队列）
    queueLegacyLinkMigration(sourcePath, oldUrl, newUrl) {
        const path = (sourcePath || '').trim();
        if (!path || !oldUrl || !newUrl || oldUrl === newUrl) return;
        let map = this.pendingLegacyMigrations.get(path);
        if (!map) {
            map = new Map();
            this.pendingLegacyMigrations.set(path, map);
        }
        map.set(oldUrl, newUrl);
        const existing = this.pendingLegacyMigrationTimers.get(path);
        if (existing) clearTimeout(existing);
        const timer = setTimeout(() => this.applyLegacyLinkMigrations(path), 800);
        this.pendingLegacyMigrationTimers.set(path, timer);
    }

    async applyLegacyLinkMigrations(sourcePath) {
        const path = (sourcePath || '').trim();
        if (!path) return;
        const timer = this.pendingLegacyMigrationTimers.get(path);
        if (timer) {
            clearTimeout(timer);
            this.pendingLegacyMigrationTimers.delete(path);
        }
        const migrations = this.pendingLegacyMigrations.get(path);
        if (!migrations || migrations.size === 0) return;
        this.pendingLegacyMigrations.delete(path);
        try {
            const abs = this.app.vault.getAbstractFileByPath(path);
            if (!(abs instanceof import_obsidian.TFile) || !abs.path.endsWith('.md')) return;
            const startMtime = abs.stat?.mtime || 0;
            const content = await this.app.vault.read(abs);
            let updated = content;
            let replacedCount = 0;
            for (const [oldUrl, newUrl] of migrations.entries()) {
                if (!oldUrl || !newUrl || oldUrl === newUrl) continue;
                if (!updated.includes(oldUrl)) continue;
                updated = updated.split(oldUrl).join(newUrl);
                replacedCount++;
            }
            if (updated !== content) {
                const latest = this.app.vault.getAbstractFileByPath(path);
                const latestMtime = (latest instanceof import_obsidian.TFile) ? (latest.stat?.mtime || 0) : 0;
                if (startMtime && latestMtime && latestMtime !== startMtime) {
                    // 文件已更改，重新排队
                    let map = this.pendingLegacyMigrations.get(path);
                    if (!map) {
                        map = new Map();
                        this.pendingLegacyMigrations.set(path, map);
                    }
                    for (const [oldUrl, newUrl] of migrations.entries()) map.set(oldUrl, newUrl);
                    if (!this.pendingLegacyMigrationTimers.get(path)) {
                        const retryTimer = setTimeout(() => this.applyLegacyLinkMigrations(path), 1200);
                        this.pendingLegacyMigrationTimers.set(path, retryTimer);
                    }
                    return;
                }
                await this.app.vault.modify(abs, updated);
                new import_obsidian.Notice(`NotePix: 已将 ${replacedCount} 个旧格式图片链接迁移至 v2 格式。`, 3500);
            }
        } catch (e) {
            console.error('NotePix: 迁移旧链接失败', e);
        }
    }

    // 用户批准上传（避免重复弹窗）
    markFileAsUserApproved(path) {
        const norm = this.normalizeVaultPath(path);
        if (!norm) return;
        const existing = this.userApprovedUploads.get(norm);
        if (existing) clearTimeout(existing);
        const timeoutId = setTimeout(() => this.userApprovedUploads.delete(norm), 6e4);
        this.userApprovedUploads.set(norm, timeoutId);
    }

    consumeUserApprovedUpload(path) {
        const norm = this.normalizeVaultPath(path);
        if (!norm) return false;
        const timeoutId = this.userApprovedUploads.get(norm);
        if (!timeoutId) return false;
        clearTimeout(timeoutId);
        this.userApprovedUploads.delete(norm);
        return true;
    }

    // 获取主本地文件夹路径
    getPrimaryLocalFolderPath() {
        const fromList = (Array.isArray(this.settings.localOnlyList) && this.settings.localOnlyList.length > 0)
            ? (this.settings.localOnlyList[0]?.path || this.settings.localOnlyList[0] || '')
            : (this.settings.localImageFolder || 'notepix-local');
        const cleaned = this.normalizeVaultPath(fromList || 'notepix-local');
        return cleaned || 'notepix-local';
    }

    async ensureFolderExists(folderPath) {
        if (!folderPath) return;
        try {
            await this.app.vault.createFolder(folderPath);
        } catch (_) { }
    }

    // 将文件移至本地专用文件夹（拒绝上传时）
    async moveFileToLocalOnly(file) {
        if (!file) return null;
        const originalPath = file.path;
        const originalName = file.name;
        const folderPath = this.getPrimaryLocalFolderPath();
        if (!folderPath) return null;
        await this.ensureFolderExists(folderPath);
        const hasExtension = !!(file.extension || (originalName && originalName.includes('.')));
        const extension = hasExtension ? (file.extension || originalName.split('.').pop()) : '';
        const baseName = hasExtension && originalName ? originalName.slice(0, -(extension.length + 1)) : originalName;
        let counter = 1;
        let targetPath = `${folderPath}/${originalName}`;
        const adapter = this.app.vault.adapter;
        while (await adapter.exists(targetPath)) {
            const suffix = baseName ? `${baseName}-${counter}` : `image-${counter}`;
            targetPath = hasExtension ? `${folderPath}/${suffix}.${extension}` : `${folderPath}/${suffix}`;
            counter++;
        }
        await this.app.vault.rename(file, targetPath);
        return { newPath: targetPath, originalPath, originalName };
    }

    // ========== 移动端占位符追踪 ==========
    registerMobileEditorPlaceholderTracking() {
        if (!isMobile) return;
        const attachHandler = (leaf) => {
            const view = leaf?.view;
            if (!view || !(view instanceof import_obsidian.MarkdownView)) return;
            const editor = view.editor;
            if (!editor) return;
            const cm = editor.cm || editor;
            if (!cm || typeof cm.on !== 'function') return;
            const handler = (instance, changeObj) => {
                try {
                    const text = changeObj?.text;
                    if (!text || !Array.isArray(text)) return;
                    const joined = text.join('\n');
                    if (!joined) return;
                    const wikiRegex = /!\[\[([^\]]+)\]\]/g;
                    const mdImgRegex = /!\[[^\]]*\]\(([^)]+)\)/g;
                    let m;
                    const now = Date.now();
                    while ((m = wikiRegex.exec(joined)) !== null) {
                        const inner = m[1] || '';
                        const fileName = inner.split('|')[0].split('/').pop();
                        if (fileName) this.recentPlaceholdersByName.set(fileName, { placeholder: m[0], ts: now });
                    }
                    while ((m = mdImgRegex.exec(joined)) !== null) {
                        const pathPart = m[1] || '';
                        const fileName = decodeURIComponent(pathPart.split('/').pop() || '');
                        if (fileName) this.recentPlaceholdersByName.set(fileName, { placeholder: m[0], ts: now });
                    }
                    for (const [name, rec] of this.recentPlaceholdersByName.entries()) {
                        if (rec && typeof rec.ts === 'number' && now - rec.ts > 60 * 1000)
                            this.recentPlaceholdersByName.delete(name);
                    }
                } catch (e) {
                    console.error('NotePix: 追踪移动端占位符出错', e);
                }
            };
            cm.on('change', handler);
            this.register(() => { try { cm.off('change', handler); } catch (_) { } });
        };
        this.registerEvent(this.app.workspace.on('active-leaf-change', attachHandler));
        const activeLeaf = this.app.workspace.activeLeaf;
        if (activeLeaf) attachHandler(activeLeaf);
    }

    // 记录待替换的占位符
    recordPendingLinkPlaceholder(path, placeholderText, sourcePath = "") {
        const norm = this.normalizeVaultPath(path);
        if (!norm || !placeholderText) return;
        const sourcePathNorm = this.normalizeVaultPath(sourcePath || "");
        const entry = this.pendingLinkReplacements.get(norm);
        if (entry?.timeoutId) clearTimeout(entry.timeoutId);
        const timeoutId = setTimeout(() => this.pendingLinkReplacements.delete(norm), 5 * 60 * 1e3);
        this.pendingLinkReplacements.set(norm, { placeholderText, sourcePath: sourcePathNorm, timeoutId });
    }

    peekPendingLinkPlaceholder(pathOrKey) {
        const norm = this.normalizeVaultPath(pathOrKey);
        const key = norm || pathOrKey;
        if (!key) return null;
        const entry = this.pendingLinkReplacements.get(key);
        if (!entry) return null;
        return { key, placeholderText: entry.placeholderText || null, sourcePath: entry.sourcePath || "" };
    }

    consumePendingLinkPlaceholder(pathOrKey) {
        const norm = this.normalizeVaultPath(pathOrKey);
        const key = norm || pathOrKey;
        if (!key) return null;
        const entry = this.pendingLinkReplacements.get(key);
        if (!entry) return null;
        if (entry.timeoutId) clearTimeout(entry.timeoutId);
        this.pendingLinkReplacements.delete(key);
        return { key, placeholderText: entry.placeholderText || null, sourcePath: entry.sourcePath || "" };
    }

    async promptUploadConfirmation(file) {
        const modal = new ConfirmationModal(this.app, "上传图片？", `是否将 ${file.name} 上传到 GitHub？`);
        return await modal.open();
    }

    // ========== 核心：生成远程路径（按笔记路径或全局） ==========
    generateImageRemotePath(noteFilePath, imageFileName) {
        if (this.settings.imageStorageStrategy !== 'byNotePath') {
            // 全局模式
            return joinRepoPath(this.settings.folderPath, imageFileName);
        }
        // 按笔记路径模式
        const baseFolder = (this.settings.byNotePathBaseFolder || 'Assets/Image').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
        if (!noteFilePath) {
            return joinRepoPath(baseFolder, imageFileName);
        }
        const normalizedNotePath = this.normalizeVaultPath(noteFilePath);
        if (!normalizedNotePath) {
            return joinRepoPath(baseFolder, imageFileName);
        }
        const lastSlash = normalizedNotePath.lastIndexOf('/');
        let noteDir = '';
        let noteBase = normalizedNotePath;
        if (lastSlash >= 0) {
            noteDir = normalizedNotePath.substring(0, lastSlash);
            noteBase = normalizedNotePath.substring(lastSlash + 1);
        }
        const extIndex = noteBase.lastIndexOf('.');
        if (extIndex > 0) noteBase = noteBase.substring(0, extIndex);
        const parts = [];
        if (baseFolder) parts.push(baseFolder);
        if (noteDir) parts.push(noteDir);
        if (noteBase) parts.push(noteBase);
        const subfolder = parts.join('/');
        return joinRepoPath(subfolder, imageFileName);
    }

    // ========== 核心：基于标题层级生成文件名 ==========
    getNextImageCounter(notePath, headingPath) {
        const key = `${notePath}|${headingPath}`;
        let current = this.imageCounterMap.get(key) || 0;
        // 优先从持久化设置中读取
        if (this.settings.imageCounters && this.settings.imageCounters[key] !== undefined) {
            current = this.settings.imageCounters[key];
        }
        const next = current + 1;
        this.imageCounterMap.set(key, next);
        if (this.settings) {
            if (!this.settings.imageCounters) this.settings.imageCounters = {};
            this.settings.imageCounters[key] = next;
            this.saveSettings(); // 异步保存，不等待
        }
        return next;
    }

    async generateFileNameFromHeading(editor, noteBasename, extension) {
        if (!editor) {
            const timestamp = new Date().toISOString().replace(/[-:.]/g, "");
            return `${timestamp}.${extension}`;
        }
        const cursor = editor.getCursor();
        const currentLineNum = cursor.line;
        const lines = editor.getValue().split('\n');
        const headings = [];
        const levelCounters = {};
        for (let i = currentLineNum; i >= 0; i--) {
            const line = lines[i];
            const match = line.match(/^(#{1,6})\s+(.*)$/);
            if (match) {
                const level = match[1].length;
                const title = match[2].trim();
                if (!levelCounters[level]) levelCounters[level] = 0;
                levelCounters[level]++;
                headings.unshift({ level, title, index: levelCounters[level] });
            }
        }
        const hierarchyPath = headings.map(h => h.index).join('.');
        if (!hierarchyPath) {
            const fallbackPath = "root";
            const notePath = this.app.workspace.getActiveFile()?.path || 'unknown';
            const counter = this.getNextImageCounter(notePath, fallbackPath);
            const safeBasename = noteBasename.replace(/[\\/:*?"<>|]/g, '-');
            return `${safeBasename}-${fallbackPath}-${counter}.${extension}`;
        }
        const notePath = this.app.workspace.getActiveFile()?.path || 'unknown';
        const counter = this.getNextImageCounter(notePath, hierarchyPath);
        const safeBasename = noteBasename.replace(/[\\/:*?"<>|]/g, '-');
        const safeHierarchy = hierarchyPath.replace(/[^0-9.]/g, '');
        return `${safeBasename}-${safeHierarchy}-${counter}.${extension}`;
    }

    // ========== 上传图片到 GitHub ==========
    async handleImageUpload(file, isPaste = false, sourceNotePath = null) {
        if (!this.settings.githubUser || !this.settings.repoName) {
            new import_obsidian.Notice("请先配置 GitHub 用户名和仓库名。");
            return;
        }
        const token = await this.getToken();
        if (!token) return;
        const uploadNotice = new import_obsidian.Notice(`正在上传 ${file.name} 到 GitHub...`, 0);
        try {
            // 生成文件名（基于标题层级或时间戳）
            let newFileName;
            const activeView = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
            if (activeView && activeView.editor && (sourceNotePath || activeView.file?.path)) {
                const notePath = sourceNotePath || activeView.file.path;
                const noteFile = this.app.vault.getAbstractFileByPath(notePath);
                const noteBasename = noteFile ? noteFile.basename : 'image';
                try {
                    newFileName = await this.generateFileNameFromHeading(activeView.editor, noteBasename, file.extension);
                } catch (err) {
                    console.error("基于标题生成文件名失败，回退时间戳", err);
                    const timestamp = new Date().toISOString().replace(/[-:.]/g, "");
                    newFileName = `${timestamp}.${file.extension}`;
                }
            } else {
                const timestamp = new Date().toISOString().replace(/[-:.]/g, "");
                newFileName = `${timestamp}.${file.extension}`;
            }

            const fileData = await (isPaste ? file.readBinary() : this.app.vault.readBinary(file));
            let filePath;
            if (sourceNotePath) {
                filePath = this.generateImageRemotePath(sourceNotePath, newFileName);
            } else {
                const activeView = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
                if (activeView && activeView.file) {
                    filePath = this.generateImageRemotePath(activeView.file.path, newFileName);
                } else {
                    filePath = joinRepoPath(this.settings.folderPath, newFileName);
                }
            }

            const base64Data = arrayBufferToBase64(fileData);
            const apiUrl = `https://api.github.com/repos/${this.settings.githubUser}/${this.settings.repoName}/contents/${filePath}`;
            const requestBody = {
                message: `添加图片 '${newFileName}' 来自 Obsidian`,
                content: base64Data,
                branch: this.settings.branchName
            };
            const response = await fetch(apiUrl, {
                method: "PUT",
                headers: { "Authorization": `token ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify(requestBody)
            });
            uploadNotice.hide();
            if (!response.ok) throw new Error(`GitHub API 错误: ${(await response.json()).message}`);

            let finalUrl;
            if (this.settings.repoVisibility === 'private') {
                const encOwner = encodeURIComponent(this.settings.githubUser);
                const encRepo = encodeURIComponent(this.settings.repoName);
                const encBranch = encodeURIComponent(this.settings.branchName);
                const encPath = filePath.split('/').map(encodeURIComponent).join('/');
                finalUrl = `obsidian://notepix/v2/${encOwner}/${encRepo}/${encBranch}/${encPath}`;
                new import_obsidian.Notice("私有图片链接已创建。");
            } else if (this.settings.repoVisibility === 'auto') {
                const detectedPrivacy = await this.getRepoPrivacy();
                if (detectedPrivacy === 'private') {
                    const encOwner = encodeURIComponent(this.settings.githubUser);
                    const encRepo = encodeURIComponent(this.settings.repoName);
                    const encBranch = encodeURIComponent(this.settings.branchName);
                    const encPath = filePath.split('/').map(encodeURIComponent).join('/');
                    finalUrl = `obsidian://notepix/v2/${encOwner}/${encRepo}/${encBranch}/${encPath}`;
                    new import_obsidian.Notice("检测到私有仓库，已创建私有图片链接。");
                } else {
                    finalUrl = `https://raw.githubusercontent.com/${this.settings.githubUser}/${this.settings.repoName}/${this.settings.branchName}/${filePath}`;
                    if (detectedPrivacy === 'unknown') new import_obsidian.Notice("无法检测仓库隐私，使用公共 URL 作为后备。");
                }
            } else {
                const detectedPrivacy = await this.getRepoPrivacy();
                if (detectedPrivacy === 'private') {
                    const repoKey = `${(this.settings.githubUser || '').trim()}/${(this.settings.repoName || '').trim()}`;
                    await this.maybePromptRepoMismatch(repoKey);
                }
                if (this.settings.repoVisibility !== 'public' && detectedPrivacy === 'private') {
                    const encOwner = encodeURIComponent(this.settings.githubUser);
                    const encRepo = encodeURIComponent(this.settings.repoName);
                    const encBranch = encodeURIComponent(this.settings.branchName);
                    const encPath = filePath.split('/').map(encodeURIComponent).join('/');
                    finalUrl = `obsidian://notepix/v2/${encOwner}/${encRepo}/${encBranch}/${encPath}`;
                } else {
                    finalUrl = `https://raw.githubusercontent.com/${this.settings.githubUser}/${this.settings.repoName}/${this.settings.branchName}/${filePath}`;
                }
            }

            let replacedLink = true;
            if (isPaste) {
                const activeView = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
                activeView?.editor.replaceSelection(`![](${finalUrl})`);
            } else {
                replacedLink = await this.replaceLinkInEditor(file.name, finalUrl, file.path);
                if (!replacedLink) {
                    new import_obsidian.Notice(`未找到 ${file.name} 的占位符链接，本地引用未被替换。`);
                }
            }

            new import_obsidian.Notice(`${newFileName} 上传成功！`);

            // 已移除本地备份代码

            if (this.settings.deleteLocal && !isPaste && replacedLink) {
                await this.app.vault.delete(file);
                new import_obsidian.Notice(`本地文件 ${file.name} 已删除。`);
            }
        } catch (error) {
            uploadNotice.hide();
            new import_obsidian.Notice(`上传失败: ${error.message}`);
            console.error("GitHub 上传器错误:", error);
        }
    }

    // ========== 替换编辑器中的链接 ==========
    async replaceLinkInEditor(fileName, replacementTarget, originalPath = "", options = {}) {
        const replacementType = options?.replacementType || 'remote';
        const replacementText = replacementType === 'wiki'
            ? `![[${replacementTarget}]]`
            : (replacementType === 'raw' ? `${replacementTarget}` : `![](${replacementTarget})`);

        return new Promise((resolve) => {
            setTimeout(async () => {
                const normalizedPath = this.normalizeVaultPath(originalPath);
                const pendingByPath = this.peekPendingLinkPlaceholder(normalizedPath || fileName);
                const pendingByName = this.peekPendingLinkPlaceholder(fileName);
                const pendingEntry = pendingByPath || pendingByName;
                const sourcePathHint = this.normalizeVaultPath(options?.sourcePath || pendingEntry?.sourcePath || "");

                const buildReplacedContent = (content) => {
                    if (!content) return { replaced: false, newContent: content };
                    // 修复畸形的嵌套链接
                    const malformedNestedLink = /!\[([^\]]*)\]\(\[obsidian:\/\/notepix\/[^\]]*\]\((obsidian:\/\/notepix\/v2\/[^)]+)\)\/([^)]+)\)/g;
                    let normalizedContent = content.replace(malformedNestedLink, (_m, alt, base, tail) => {
                        const cleanedBase = String(base || '').replace(/\/+$/, '');
                        const cleanedTail = String(tail || '').replace(/^\/+/, '');
                        return `![${alt || ''}](${cleanedBase}/${cleanedTail})`;
                    });
                    const escapedFileName = fileName.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
                    const escapedPath = normalizedPath ? normalizedPath.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&") : null;

                    const replaceLastRegexMatch = (source, regex, replacement) => {
                        const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
                        const globalRegex = new RegExp(regex.source, flags);
                        let match, lastMatch = null;
                        while ((match = globalRegex.exec(source)) !== null) {
                            lastMatch = { index: match.index, text: match[0] };
                            if (match[0].length === 0) globalRegex.lastIndex += 1;
                        }
                        if (!lastMatch) return { replaced: false, value: source };
                        const before = source.slice(0, lastMatch.index);
                        const after = source.slice(lastMatch.index + lastMatch.text.length);
                        return { replaced: true, value: `${before}${replacement}${after}` };
                    };

                    const patterns = [];
                    patterns.push(new RegExp(`!\\[\\[(?:[^\\]|]*?/)*${escapedFileName}(?:\\|[^\\]]*)?\\]\\]`));
                    if (escapedPath) patterns.push(new RegExp(`!\\[\\[(?:[^\\]|]*?/)*${escapedPath}(?:\\|[^\\]]*)?\\]\\]`));
                    patterns.push(new RegExp(`!\\[[^\\]]*\\]\\([^\\)]*${escapedFileName}[^\\)]*\\)`));
                    patterns.push(new RegExp(`!\\[[^\\]]*\\]\\([^\\)]*${encodeURIComponent(fileName)}[^\\)]*\\)`));
                    if (escapedPath) {
                        patterns.push(new RegExp(`!\\[[^\\]]*\\]\\([^\\)]*${escapedPath}[^\\)]*\\)`));
                        patterns.push(new RegExp(`!\\[[^\\]]*\\]\\([^\\)]*${encodeURIComponent(normalizedPath)}[^\\)]*\\)`));
                    }

                    let replaced = false;
                    let newContent = normalizedContent;
                    const fallbackPlaceholder = pendingEntry?.placeholderText || null;
                    if (fallbackPlaceholder && newContent.includes(fallbackPlaceholder)) {
                        const idx = newContent.lastIndexOf(fallbackPlaceholder);
                        if (idx >= 0) {
                            replaced = true;
                            newContent = `${newContent.slice(0, idx)}${replacementText}${newContent.slice(idx + fallbackPlaceholder.length)}`;
                        }
                    }
                    for (const regex of patterns) {
                        if (replaced) break;
                        const result = replaceLastRegexMatch(newContent, regex, replacementText);
                        replaced = result.replaced;
                        newContent = result.value;
                    }
                    if (!replaced && newContent !== content) replaced = true;
                    return { replaced, newContent };
                };

                const activeView = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
                const activeFilePath = this.normalizeVaultPath(activeView?.file?.path || "");
                const canUseActiveEditor = !!(activeView && activeView.editor && (!sourcePathHint || sourcePathHint === activeFilePath));

                if (canUseActiveEditor) {
                    const editor = activeView.editor;
                    const doc = (typeof editor.getDoc === 'function') ? editor.getDoc() : null;
                    let content = '';
                    if (doc?.getValue) try { content = doc.getValue(); } catch (_) { content = ''; }
                    if (!content && typeof editor.getValue === 'function') try { content = editor.getValue(); } catch (_) { content = ''; }
                    const result = buildReplacedContent(content);
                    if (result.replaced) {
                        const cursor = (typeof editor.getCursor === 'function') ? editor.getCursor() : null;
                        let wrote = false;
                        if (doc?.setValue) try { doc.setValue(result.newContent); wrote = true; } catch (_) { wrote = false; }
                        if (!wrote && typeof editor.setValue === 'function') try { editor.setValue(result.newContent); wrote = true; } catch (_) { wrote = false; }
                        if (cursor && typeof editor.setCursor === 'function') try { editor.setCursor(cursor); } catch (_) { }
                        if (wrote) {
                            if (pendingByPath) this.consumePendingLinkPlaceholder(pendingByPath.key);
                            if (pendingByName) this.consumePendingLinkPlaceholder(pendingByName.key);
                            return resolve(true);
                        }
                    }
                }

                if (sourcePathHint) {
                    try {
                        const target = this.app.vault.getAbstractFileByPath(sourcePathHint);
                        if (target instanceof import_obsidian.TFile && target.path.endsWith('.md')) {
                            const startMtime = target.stat?.mtime || 0;
                            const content = await this.app.vault.read(target);
                            const result = buildReplacedContent(content);
                            if (!result.replaced) return resolve(false);
                            const latest = this.app.vault.getAbstractFileByPath(sourcePathHint);
                            const latestMtime = (latest instanceof import_obsidian.TFile) ? (latest.stat?.mtime || 0) : 0;
                            if (startMtime && latestMtime && latestMtime !== startMtime) return resolve(false);
                            await this.app.vault.modify(target, result.newContent);
                            if (pendingByPath) this.consumePendingLinkPlaceholder(pendingByPath.key);
                            if (pendingByName) this.consumePendingLinkPlaceholder(pendingByName.key);
                            return resolve(true);
                        }
                    } catch (_) { }
                }
                console.warn(`NotePix: 未找到 "${fileName}" 的链接，替换失败。`);
                resolve(false);
            }, 100);
        });
    }

    // 捕获文件占位符
    captureFilePlaceholder(file) {
        if (!file) return;
        const normalizedPath = this.normalizeVaultPath(file.path);
        if (!normalizedPath) return;
        setTimeout(() => {
            const activeView = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
            if (!activeView) return;
            const editor = activeView.editor;
            if (!editor) return;
            let content = "";
            if (typeof editor.getDoc === 'function') {
                try { const doc = editor.getDoc(); content = doc?.getValue?.() || ""; } catch (_) { content = ""; }
            }
            if (!content && typeof editor.getValue === 'function') try { content = editor.getValue(); } catch (_) { content = ""; }
            if (!content) return;
            const escapedPath = normalizedPath.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
            const regex = new RegExp(`!\\[\\[[^\\]]*${escapedPath}[^\\]]*\\]\\]`);
            const match = content.match(regex);
            const sourcePath = activeView.file?.path || "";
            if (match && match[0]) {
                this.recordPendingLinkPlaceholder(file.path, match[0], sourcePath);
                return;
            }
            if (this.recentPlaceholdersByName && this.recentPlaceholdersByName.size > 0) {
                const rec = this.recentPlaceholdersByName.get(file.name);
                if (rec && rec.placeholder) {
                    this.recordPendingLinkPlaceholder(file.path, rec.placeholder, sourcePath);
                    this.recordPendingLinkPlaceholder(file.name, rec.placeholder, sourcePath);
                    this.recentPlaceholdersByName.delete(file.name);
                }
            }
        }, 200);
    }

    async handleDeclinedUpload(file) {
        if (!file) {
            new import_obsidian.Notice("附件已保留在本地。");
            return;
        }
        try {
            const relocation = await this.moveFileToLocalOnly(file);
            if (!relocation) {
                new import_obsidian.Notice(`${file.name} 已保留在本地附件中。`);
                return;
            }
            const replaced = await this.replaceLinkInEditor(relocation.originalName, relocation.newPath, relocation.originalPath, { replacementType: 'wiki' });
            if (replaced) {
                new import_obsidian.Notice(`${relocation.originalName} 已移至本地文件夹。`);
            } else {
                new import_obsidian.Notice(`${relocation.originalName} 已移至本地文件夹，请手动更新链接。`);
            }
        } catch (e) {
            console.error('NotePix: 移动拒绝上传的附件失败', e);
            new import_obsidian.Notice(`无法将 ${file.name} 移至本地文件夹。`);
        }
    }

    // ========== 粘贴处理 ==========
    async handlePaste(evt) {
        const files = evt.clipboardData?.files;
        if (!files || files.length === 0) return;
        const imageFile = Array.from(files).find(file => file.type.startsWith("image/"));
        if (!imageFile) return;
        if (this.settings.uploadOnPaste === 'always') {
            evt.preventDefault();
            await this.uploadPastedImage(imageFile);
            return;
        }
        if (this.settings.uploadOnPaste === 'ask') {
            evt.preventDefault();
            const modal = new ConfirmationModal(this.app, "上传图片？", "是否将此图片上传到 GitHub？");
            const confirmed = await modal.open();
            if (confirmed) await this.uploadPastedImage(imageFile);
            else await this.saveImageLocally(imageFile);
        }
    }

    async uploadPastedImage(imageFile) {
        const arrayBuffer = await imageFile.arrayBuffer();
        const activeView = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
        if (!activeView) {
            new import_obsidian.Notice("无法处理图片：没有活动的编辑器。");
            return;
        }
        const uploadFolder = (this.settings.uploadImageFolder || 'notepix-uploads').replace(/\\\\/g, "/").replace(/^\/+|\/+$/g, "");
        try { if (uploadFolder) await this.app.vault.createFolder(uploadFolder); } catch { }
        const noteName = activeView.file ? activeView.file.basename : 'Untitled';
        const extension = imageFile.name.split('.').pop() || 'png';
        let i = 1, newFilePath;
        do {
            newFilePath = uploadFolder ? `${uploadFolder}/${noteName}-${i}.${extension}` : `${noteName}-${i}.${extension}`;
            i++;
        } while (await this.app.vault.adapter.exists(newFilePath));
        this.markFileAsUserApproved(newFilePath);
        let newFile;
        try {
            newFile = await this.app.vault.createBinary(newFilePath, arrayBuffer);
        } catch (e) {
            this.consumeUserApprovedUpload(newFilePath);
            throw e;
        }
        if (newFile.path !== newFilePath) this.markFileAsUserApproved(newFile.path);
        const placeholderText = `![[${newFile.name}]]`;
        const sourcePath = activeView.file?.path || "";
        this.recordPendingLinkPlaceholder(newFile.path, placeholderText, sourcePath);
        this.recordPendingLinkPlaceholder(newFile.name, placeholderText, sourcePath);
        activeView.editor.replaceSelection(placeholderText);
        if (!this.settings.autoUpload) await this.handleImageUpload(newFile, false, sourcePath);
    }

    async saveImageLocally(imageFile) {
        const arrayBuffer = await imageFile.arrayBuffer();
        const activeView = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
        if (!activeView) {
            new import_obsidian.Notice("无法保存图片：没有活动的编辑器。");
            return;
        }
        const localOnlyFirst = (Array.isArray(this.settings.localOnlyList) && this.settings.localOnlyList.length > 0)
            ? (this.settings.localOnlyList[0]?.path || this.settings.localOnlyList[0] || '')
            : (this.settings.localImageFolder || 'notepix-local');
        const folderPath = (localOnlyFirst || 'notepix-local').replace(/\\\\/g, "/").replace(/^\/+|\/+$/g, "");
        try { await this.app.vault.createFolder(folderPath); } catch (_) { }
        const noteName = activeView.file ? activeView.file.basename : 'Untitled';
        const extension = imageFile.name.split('.').pop() || 'png';
        let i = 1, newFilePath;
        do { newFilePath = `${folderPath}/${noteName}-${i}.${extension}`; i++; } while (await this.app.vault.adapter.exists(newFilePath));
        const newFile = await this.app.vault.createBinary(newFilePath, arrayBuffer);
        activeView.editor.replaceSelection(`![[${newFile.path}]]`);
    }

    // ========== Token 获取与解密 ==========
    async getDecryptedToken() {
        if (this.decryptedToken) return this.decryptedToken;
        if (this.isPromptingForPassword) return null;
        if (this.settings.useEncryption && this.settings.encryptedToken) {
            this.isPromptingForPassword = true;
            try {
                const password = await new PasswordPrompt(this.app).open();
                const token = await decrypt(this.settings.encryptedToken, password);
                this.decryptedToken = token;
                return token;
            } catch (e) {
                const msg = String(e?.message || "");
                if (msg === "未提供密码") {
                    // 用户取消，不提示
                } else if (e?.name === 'OperationError' || /decryption|operation/i.test(msg)) {
                    new import_obsidian.Notice("解密失败。密码错误。", 5e3);
                } else {
                    new import_obsidian.Notice(`解密错误: ${msg || '未知错误'}`, 5e3);
                }
                return null;
            } finally {
                this.isPromptingForPassword = false;
            }
        }
        return null;
    }

    async getToken() {
        if (this.decryptedToken) return this.decryptedToken;
        if (this.settings.useEncryption) {
            if (!this.settings.encryptedToken) {
                new import_obsidian.Notice("未找到加密的 Token，请在设置中保存加密 Token。");
                return null;
            }
            return await this.getDecryptedToken();
        }
        if (this.settings.plainToken && this.settings.plainToken.trim().length > 0) return this.settings.plainToken.trim();
        new import_obsidian.Notice("未找到 Token，请在 NotePix 设置中提供 GitHub Token。");
        return null;
    }

    // ========== 仓库隐私检测 ==========
    async getRepoPrivacy() {
        const user = (this.settings.githubUser || '').trim();
        const repo = (this.settings.repoName || '').trim();
        if (!user || !repo) return "unknown";
        if (this.repoPrivacyCache &&
            this.repoPrivacyCache.user === user &&
            this.repoPrivacyCache.repo === repo &&
            (Date.now() - this.repoPrivacyCache.timestamp) < 10 * 60 * 1000) {
            return this.repoPrivacyCache.value;
        }
        let token;
        if (this.decryptedToken) token = this.decryptedToken;
        else if (!this.settings.useEncryption && this.settings.plainToken) token = this.settings.plainToken.trim();
        if (!token) return "unknown";
        try {
            const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(user)}/${encodeURIComponent(repo)}`, {
                headers: { "Authorization": `token ${token}`, "Accept": "application/vnd.github.v3+json" }
            });
            if (!response.ok) return "unknown";
            const json = await response.json();
            const value = json.private ? "private" : "public";
            this.repoPrivacyCache = { value, timestamp: Date.now(), user, repo };
            return value;
        } catch (e) {
            console.error("NotePix: 检测仓库隐私失败", e);
            return "unknown";
        }
    }

    clearRepoPrivacyCache() { this.repoPrivacyCache = null; }

    containsConfiguredRepoRawImages(content) {
        if (!content) return false;
        const user = (this.settings.githubUser || '').trim();
        if (!user) return false;
        const ownerRe = escapeRegex(user);
        const rawConfiguredUserRegex = new RegExp(
            `raw\\.githubusercontent\\.com\\/${ownerRe}\\/[^\\s/]+\\/[^\\s)]+\\.(?:png|jpe?g|gif|bmp|svg|webp|avif)(?:\\?[^\\s)]*)?`,
            'i'
        );
        return rawConfiguredUserRegex.test(content);
    }

    sanitizeMalformedNotepixLinks(content) {
        if (!content || typeof content !== 'string') return content;
        const malformedNestedLink = /!\[([^\]]*)\]\(\[obsidian:\/\/notepix\/[^\]]*\]\((obsidian:\/\/notepix\/v2\/[^)]+)\)\/([^)]+)\)/g;
        return content.replace(malformedNestedLink, (_m, alt, base, tail) => {
            const safeAlt = String(alt || '');
            const cleanedBase = String(base || '').replace(/\/+$/, '');
            const cleanedTail = String(tail || '').replace(/^\/+/, '');
            return `![${safeAlt}](${cleanedBase}/${cleanedTail})`;
        });
    }

    async sanitizeFileOnOpen(file) {
        try {
            if (!file || !file.path || !file.path.endsWith('.md')) return;
            const content = await this.app.vault.read(file);
            const normalized = this.sanitizeMalformedNotepixLinks(content);
            if (normalized !== content) {
                await this.app.vault.modify(file, normalized);
                new import_obsidian.Notice("NotePix: 已修复当前笔记中的畸形图片链接格式。", 4000);
            }
        } catch (e) {
            console.error("NotePix: sanitizeFileOnOpen 错误", e);
        }
    }

    checkRepoMismatchOnFileOpen(file) {
        if (this._fileOpenDebounceTimer) clearTimeout(this._fileOpenDebounceTimer);
        this._fileOpenDebounceTimer = setTimeout(async () => {
            try {
                if (!file || !file.path || !file.path.endsWith('.md')) return;
                if (this.settings.repoVisibility !== 'public') return;
                const content = await this.app.vault.read(file);
                if (!this.containsConfiguredRepoRawImages(content)) return;
                const privacy = await this.getRepoPrivacy();
                if (privacy !== 'private') return;
                const user = (this.settings.githubUser || '').trim();
                const repo = (this.settings.repoName || '').trim();
                const repoKey = `${user}/${repo}`;
                const lastAt = this.settings.lastPromptedAt || 0;
                const lastRepo = this.settings.lastPromptedRepo || '';
                const twentyFourHours = 24 * 60 * 60 * 1000;
                if (lastRepo === repoKey && (Date.now() - lastAt) < twentyFourHours) return;
                const modal = new RepoMismatchModal(this.app, repoKey);
                const choice = await modal.openAndWait();
                this.settings.lastPromptedAt = Date.now();
                this.settings.lastPromptedRepo = repoKey;
                if (choice === 'auto') {
                    this.settings.repoVisibility = 'auto';
                    new import_obsidian.Notice("NotePix: 已切换到自动模式。私有仓库图片将通过 API 加载。");
                } else if (choice === 'private') {
                    this.settings.repoVisibility = 'private';
                    new import_obsidian.Notice("NotePix: 已切换到私有模式。后续上传将使用私有图片格式。");
                } else if (choice === 'public') {
                    this.settings.repoVisibility = 'public';
                    new import_obsidian.Notice("NotePix: 保持公开模式。私有仓库的原始 URL 可能无法加载。");
                }
                await this.saveSettings();
            } catch (e) {
                console.error("NotePix: 不匹配检查错误", e);
            }
        }, 500);
    }

    async maybePromptRepoMismatch(repoKey) {
        const lastAt = this.settings.lastPromptedAt || 0;
        const lastRepo = this.settings.lastPromptedRepo || '';
        const twentyFourHours = 24 * 60 * 60 * 1000;
        if (lastRepo === repoKey && (Date.now() - lastAt) < twentyFourHours) return null;
        const modal = new RepoMismatchModal(this.app, repoKey);
        const choice = await modal.openAndWait();
        this.settings.lastPromptedAt = Date.now();
        this.settings.lastPromptedRepo = repoKey;
        if (choice === 'auto') {
            this.settings.repoVisibility = 'auto';
            new import_obsidian.Notice("NotePix: 已切换到自动模式。");
        } else if (choice === 'private') {
            this.settings.repoVisibility = 'private';
            new import_obsidian.Notice("NotePix: 已切换到私有模式。");
        } else if (choice === 'public') {
            this.settings.repoVisibility = 'public';
            new import_obsidian.Notice("NotePix: 保持公开模式。");
        }
        await this.saveSettings();
        return choice;
    }

    // ========== 图片后处理器（渲染） ==========
    async postProcessImages(element, context) {
        this.isHandlingAction = true;
        try {
            const images = Array.from(element.querySelectorAll("img"));
            if (images.length === 0) return;

            const decodePathSafely = (value) => {
                if (!value || typeof value !== 'string') return value;
                try { return decodeURIComponent(value); } catch (_) { return value; }
            };
            const decodeSegmentSafely = (value) => {
                if (typeof value !== 'string') return '';
                try { return decodeURIComponent(value); } catch (_) { return value; }
            };
            const recoverMalformedNotepixSrc = (src) => {
                if (!src) return null;
                let candidate = src;
                if (candidate.startsWith("app://")) {
                    const idx = candidate.indexOf("%5Bobsidian://notepix/");
                    if (idx >= 0) {
                        try { candidate = decodeURIComponent(candidate.substring(idx)); } catch (_) { }
                    }
                }
                const malformed = candidate.match(/\[obsidian:\/\/notepix\/[^\]]*\]\((obsidian:\/\/notepix\/v2\/[^)]+)\)\/(.+)$/);
                if (!malformed) return null;
                const base = (malformed[1] || "").replace(/\/+$/, "");
                const tail = (malformed[2] || "").replace(/^\/+/, "");
                if (!base || !tail) return null;
                return `${base}/${tail}`;
            };

            const cfgUser = (this.settings.githubUser || '').trim();
            const cfgRepo = (this.settings.repoName || '').trim();
            const rawSameUserRegex = cfgUser ? new RegExp(`^https:\\/\\/raw\\.githubusercontent\\.com\\/${escapeRegex(cfgUser)}\\/([^\\/]+)\\/(.+)$`, 'i') : null;

            const toProcess = [];
            const rawCandidates = [];
            for (const img of images) {
                let src = img.getAttribute("src");
                if (!src) continue;
                const recovered = recoverMalformedNotepixSrc(src);
                if (recovered) { src = recovered; img.setAttribute("src", recovered); }
                if (src.startsWith("obsidian://notepix/")) {
                    const afterPrefix = src.substring("obsidian://notepix/".length);
                    if (afterPrefix.startsWith("v2/")) {
                        const parts = afterPrefix.substring(3).split('/');
                        if (parts.length >= 4) {
                            toProcess.push({
                                img, owner: decodeSegmentSafely(parts[0]), repo: decodeSegmentSafely(parts[1]),
                                branch: decodeSegmentSafely(parts[2]), path: parts.slice(3).map(decodeSegmentSafely).join('/'),
                                type: 'notepix-v2'
                            });
                        }
                    } else {
                        toProcess.push({
                            img, owner: cfgUser, repo: cfgRepo, fallbackRepos: this.getLegacyRepoCandidates(cfgRepo),
                            branch: this.settings.branchName || 'main', legacySrc: src,
                            path: decodePathSafely(afterPrefix), type: 'notepix-legacy'
                        });
                    }
                } else if (rawSameUserRegex) {
                    const rawMatch = src.match(rawSameUserRegex);
                    if (rawMatch) {
                        const parsedRepo = decodeSegmentSafely(rawMatch[1] || '');
                        const repoRest = rawMatch[2] || '';
                        const slashIdx = repoRest.indexOf('/');
                        if (parsedRepo && slashIdx > 0) {
                            const configuredBranch = (this.settings.branchName || '').trim();
                            let branch = repoRest.substring(0, slashIdx);
                            let rawPath = repoRest.substring(slashIdx + 1);
                            if (configuredBranch && repoRest.startsWith(`${configuredBranch}/`)) {
                                branch = configuredBranch;
                                rawPath = repoRest.substring(configuredBranch.length + 1);
                            }
                            rawCandidates.push({
                                img, owner: cfgUser, repo: parsedRepo, branch, path: decodePathSafely(rawPath), type: 'raw-fallback'
                            });
                        }
                    }
                }
            }
            if (rawCandidates.length) toProcess.push(...rawCandidates);
            if (toProcess.length === 0) return;

            const hoverPopover = (this.app && this.app.renderContext) ? this.app.renderContext.hoverPopover : null;
            const isPopoverByAPI = !!hoverPopover;
            const activeLeaf = this.app.workspace.activeLeaf;
            const contextEl = context?.containerEl;
            const leafEl = activeLeaf?.containerEl;
            const isInActiveLeaf = !!(leafEl && contextEl && leafEl.contains(contextEl));
            const isHover = isPopoverByAPI || (contextEl ? !isInActiveLeaf : false);

            let token;
            if (isHover) {
                if (this.settings.useEncryption) token = this.decryptedToken;
                else token = (this.settings.plainToken || '').trim() || null;
                if (!token) return;
            } else {
                if (this.settings.useEncryption) {
                    if (this.decryptedToken) token = this.decryptedToken;
                    else if (this.settings.encryptedToken) token = await this.getToken();
                    else token = null;
                } else {
                    token = (this.settings.plainToken || '').trim() || null;
                }
                if (!token) {
                    const now = Date.now();
                    if (!this._lastRenderTokenNoticeAt || (now - this._lastRenderTokenNoticeAt) > 30000) {
                        this._lastRenderTokenNoticeAt = now;
                        new import_obsidian.Notice("Token 未解锁/不可用。私有图片将在 Token 可用后渲染。", 5000);
                    }
                    return;
                }
            }

            let configuredUserRepos = [];
            const hasLegacyLinks = toProcess.some(item => item?.type === 'notepix-legacy');
            if (hasLegacyLinks && cfgUser && token) configuredUserRepos = await this.getConfiguredUserRepoList(token);

            const encSeg = (p) => p.split('/').map(encodeURIComponent).join('/');
            const errorSvg = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLWJhbiI+PGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMTAiLz48bGluZSB4MT0iNC45MyIgeTE9IjQuOTMiIHgyPSIxOS4wNyIgeTI9IjE5LjA3Ii8+PC9zdmc+";
            let showedRawNotice = false;

            const fetchAndSet = async (item) => {
                const { img, owner, repo, branch, path, type } = item;
                let repoCandidates = [repo];
                if (type === 'notepix-legacy') {
                    const staticCandidates = Array.isArray(item.fallbackRepos) ? item.fallbackRepos : [];
                    const dynamicCandidates = Array.isArray(configuredUserRepos) ? configuredUserRepos : [];
                    const legacyKey = `${owner}|${branch}|${path}`;
                    const unresolvedUntil = this.legacyUnresolvedUntil.get(legacyKey) || 0;
                    if (Date.now() < unresolvedUntil) { img.src = errorSvg; return; }
                    const resolvedRepo = this.legacyResolvedRepoByKey.get(legacyKey);
                    const ordered = [];
                    if (resolvedRepo) ordered.push(resolvedRepo);
                    ordered.push(...staticCandidates, ...dynamicCandidates);
                    repoCandidates = Array.from(new Set(ordered.filter(Boolean)));
                    if (repoCandidates.length === 0 && repo) repoCandidates = [repo];
                    if (repoCandidates.length > 25) repoCandidates = repoCandidates.slice(0, 25);
                }
                const ref = encodeURIComponent(branch);
                const norm = path.replace(/\\\\/g, "/");
                const tryRepo = async (repoCandidate) => {
                    const cacheKey = `${owner}/${repoCandidate}/${branch}/${path}`.replace(/\\\\/g, "/");
                    const now = Date.now();
                    const failTs = this.failedImageFetches.get(cacheKey) || 0;
                    if (failTs && (now - failTs) < 30 * 1000) return null;
                    if (this.imageCache.has(cacheKey)) { img.src = this.imageCache.get(cacheKey); return repoCandidate; }
                    const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoCandidate)}/contents/${encSeg(norm)}?ref=${ref}`;
                    try {
                        let response = await fetch(apiUrl, { method: "GET", headers: { "Authorization": `token ${token}`, "Accept": "application/vnd.github.v3.raw" } });
                        let imageBlob;
                        if (response.ok) {
                            imageBlob = await response.blob();
                        } else {
                            response = await fetch(apiUrl, { method: "GET", headers: { "Authorization": `token ${token}`, "Accept": "application/vnd.github.v3+json" } });
                            if (!response.ok) { this.failedImageFetches.set(cacheKey, Date.now()); return null; }
                            const meta = await response.json();
                            if (!meta || !meta.content) { this.failedImageFetches.set(cacheKey, Date.now()); return null; }
                            const raw = atob(meta.content.replace(/\n/g, ''));
                            const bytes = new Uint8Array(raw.length);
                            for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
                            imageBlob = new Blob([bytes.buffer]);
                        }
                        const blobUrl = URL.createObjectURL(imageBlob);
                        this.imageCache.set(cacheKey, blobUrl);
                        this.failedImageFetches.delete(cacheKey);
                        img.src = blobUrl;
                        return repoCandidate;
                    } catch (_) { this.failedImageFetches.set(cacheKey, Date.now()); return null; }
                };
                let resolvedRepo = null;
                for (const repoCandidate of repoCandidates) {
                    if (!repoCandidate) continue;
                    resolvedRepo = await tryRepo(repoCandidate);
                    if (resolvedRepo) break;
                }
                if (!resolvedRepo) {
                    if (type === 'notepix-legacy') {
                        const legacyKey = `${owner}|${branch}|${path}`;
                        this.legacyUnresolvedUntil.set(legacyKey, Date.now() + 5 * 60 * 1000);
                    }
                    img.src = errorSvg;
                    console.error(`NotePix: 无法从候选仓库获取图片 ${owner}/${repo}/${branch}/${path}`);
                    return;
                }
                if (type === 'notepix-legacy') {
                    const legacyKey = `${owner}|${branch}|${path}`;
                    this.legacyResolvedRepoByKey.set(legacyKey, resolvedRepo);
                    this.legacyUnresolvedUntil.delete(legacyKey);
                }
                if (type === 'notepix-legacy' && item.legacySrc && context?.sourcePath) {
                    const encOwner = encodeURIComponent(owner || '');
                    const encRepo = encodeURIComponent(resolvedRepo || '');
                    const encBranch = encodeURIComponent(branch || 'main');
                    const encPath = String(path || '').split('/').map(encodeURIComponent).join('/');
                    if (encOwner && encRepo && encBranch && encPath) {
                        const v2Url = `obsidian://notepix/v2/${encOwner}/${encRepo}/${encBranch}/${encPath}`;
                        this.queueLegacyLinkMigration(context.sourcePath, item.legacySrc, v2Url);
                    }
                }
                if (type === 'raw-fallback' && !showedRawNotice && !this._mismatchNoticeShown) {
                    this._mismatchNoticeShown = true;
                    showedRawNotice = true;
                    new import_obsidian.Notice("仓库是私有的。旧公共图片已通过 API 加载预览。", 5000);
                }
            };

            await Promise.allSettled(toProcess.map(item => fetchAndSet(item)));

            const observer = new MutationObserver((mutations) => {
                for (const m of mutations) {
                    for (const node of Array.from(m.addedNodes)) {
                        if (node.nodeType !== 1) continue;
                        const el = node;
                        const imgs = (el.matches && el.matches('img') ? [el] : Array.from(el.querySelectorAll ? el.querySelectorAll('img') : []));
                        for (const addedImg of imgs) {
                            let src = addedImg.getAttribute('src');
                            if (!src) continue;
                            const recovered = recoverMalformedNotepixSrc(src);
                            if (recovered) { src = recovered; addedImg.setAttribute('src', recovered); }
                            if (!src.startsWith('obsidian://notepix/')) continue;
                            const afterPrefix = src.substring("obsidian://notepix/".length);
                            if (afterPrefix.startsWith("v2/")) {
                                const parts = afterPrefix.substring(3).split('/');
                                if (parts.length >= 4) {
                                    fetchAndSet({
                                        img: addedImg, owner: decodeSegmentSafely(parts[0]), repo: decodeSegmentSafely(parts[1]),
                                        branch: decodeSegmentSafely(parts[2]), path: parts.slice(3).map(decodeSegmentSafely).join('/'),
                                        type: 'notepix-v2'
                                    });
                                }
                            } else {
                                fetchAndSet({
                                    img: addedImg, owner: cfgUser, repo: cfgRepo, branch: this.settings.branchName || 'main',
                                    path: decodePathSafely(afterPrefix), type: 'notepix-legacy'
                                });
                            }
                        }
                    }
                }
            });
            observer.observe(element, { childList: true, subtree: true });
            setTimeout(() => observer.disconnect(), 1500);
        } finally {
            this.isHandlingAction = false;
        }
    }

    // ========== 删除图片（GitHub + 本地链接） ==========
    async removeImageLinkFromCurrentNote(remotePath) {
        const activeView = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
        if (!activeView) return false;
        const editor = activeView.editor;
        const content = editor.getValue();
        const escapedPath = remotePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`!\\[[^\\]]*\\]\\([^)]*${escapedPath}[^)]*\\)`, 'g');
        const newContent = content.replace(regex, '');
        if (newContent !== content) {
            const cursor = editor.getCursor();
            editor.setValue(newContent);
            editor.setCursor(cursor);
            return true;
        }
        return false;
    }

    getRemotePathFromImageSrc(src) {
        if (!src) return null;
        const privateMatch = src.match(/obsidian:\/\/notepix\/v2\/[^\/]+\/[^\/]+\/[^\/]+\/(.+)$/);
        if (privateMatch) return decodeURIComponent(privateMatch[1]);
        const publicMatch = src.match(/https?:\/\/raw\.githubusercontent\.com\/[^\/]+\/[^\/]+\/[^\/]+\/(.+)$/);
        if (publicMatch) return decodeURIComponent(publicMatch[1]);
        return null;
    }

    extractNotepixImageLinks(content) {
        const links = [];
        if (!content) return links;
        const privateRegex = /!\[[^\]]*\]\(obsidian:\/\/notepix\/v2\/[^\/]+\/[^\/]+\/[^\/]+\/([^)]+)\)/g;
        let match;
        while ((match = privateRegex.exec(content)) !== null) links.push({ fullMatch: match[0], remotePath: match[1] });
        const publicRegex = /!\[[^\]]*\]\(https?:\/\/raw\.githubusercontent\.com\/[^\/]+\/[^\/]+\/[^\/]+\/([^)]+)\)/g;
        while ((match = publicRegex.exec(content)) !== null) links.push({ fullMatch: match[0], remotePath: match[1] });
        return links;
    }

    findDeletedImageLinks(oldContent, newContent) {
        const oldLinks = this.extractNotepixImageLinks(oldContent);
        const newLinks = this.extractNotepixImageLinks(newContent);
        return oldLinks.filter(oldLink => !newLinks.some(newLink => newLink.remotePath === oldLink.remotePath));
    }

    async deleteFileFromGitHub(remotePath) {
        const token = await this.getToken();
        if (!token) { new import_obsidian.Notice("没有可用的 GitHub Token"); return false; }
        const owner = this.settings.githubUser;
        const repo = this.settings.repoName;
        const branch = this.settings.branchName;
        const fullPath = remotePath;
        try {
            const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${fullPath}?ref=${branch}`;
            const getResp = await fetch(getUrl, { headers: { "Authorization": `token ${token}` } });
            if (!getResp.ok) {
                if (getResp.status === 404) new import_obsidian.Notice(`文件未找到: ${fullPath}`);
                else new import_obsidian.Notice(`获取文件信息失败: ${getResp.statusText}`);
                return false;
            }
            const fileInfo = await getResp.json();
            const sha = fileInfo.sha;
            const deleteUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${fullPath}`;
            const deleteResp = await fetch(deleteUrl, {
                method: "DELETE",
                headers: { "Authorization": `token ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ message: `通过 NotePix 删除图片`, sha: sha, branch: branch })
            });
            if (deleteResp.ok) {
                new import_obsidian.Notice(`已从 GitHub 删除: ${fullPath}`);
                return true;
            } else {
                const error = await deleteResp.json();
                new import_obsidian.Notice(`删除失败: ${error.message}`);
                return false;
            }
        } catch (err) {
            console.error("GitHub 删除错误:", err);
            new import_obsidian.Notice(`删除失败: ${err.message}`);
            return false;
        }
    }

    // ========== 生命周期 ==========
    async onload() {
        await this.loadSettings();
        // 初始化计数器映射
        if (this.settings.imageCounters) {
            this.imageCounterMap = new Map(Object.entries(this.settings.imageCounters));
        }
        // 初始化文件内容缓存（自动删除功能暂未启用，保留）
        const allFiles = this.app.vault.getMarkdownFiles();
        for (const f of allFiles) {
            const content = await this.app.vault.read(f);
            this.fileContentCache.set(f.path, content);
        }

        this.addSettingTab(new GitHubUploaderSettingTab(this.app, this));
        this.imageCache = new Map();
        this.registerMobileEditorPlaceholderTracking();

        // 移动端附件集成
        if (isMobile && (this.settings.integrateAttachmentsOnMobile !== false)) {
            try {
                const attachFolder = (this.settings.attachmentsFolderName || 'attachment').replace(/\\\\/g, "/").replace(/^\/+|\/+$/g, "");
                if (attachFolder) {
                    try { await this.app.vault.createFolder(attachFolder); } catch (_) { }
                    try { this.app.vault.setConfig('attachmentFolderPath', attachFolder); } catch (_) { }
                    this.mobileAttachmentFolder = attachFolder;
                }
            } catch (_) { }
        }

        this.registerMarkdownPostProcessor(this.postProcessImages.bind(this));
        this.registerEvent(this.app.workspace.on("editor-paste", this.handlePaste.bind(this)));

        // 文件创建监听（自动上传）
        this.registerEvent(this.app.vault.on("create", async (file) => {
            if (!(file instanceof import_obsidian.TFile)) return;
            const imageExtensions = ["png", "jpg", "jpeg", "gif", "bmp", "svg"];
            if (!imageExtensions.includes(file.extension.toLowerCase())) return;

            const filePathNorm = file.path.replace(/\\\\/g, "/");
            const localOnly = (Array.isArray(this.settings.localOnlyList) && this.settings.localOnlyList.length > 0
                ? this.settings.localOnlyList
                : (this.settings.localOnlyFolders || this.settings.localImageFolder || 'notepix-local').split(','))
                .map(s => (typeof s === 'string' ? s : s.path || ''))
                .map(s => (s || '').trim()).filter(Boolean)
                .map(s => s.replace(/\\\\/g, "/").replace(/^\/+|\/+$/g, ""));
            if (localOnly.some(ign => filePathNorm === ign || filePathNorm.startsWith(ign + "/"))) return;
            if (!this.settings.autoUpload) return;

            const uploadNorm = (this.settings.uploadImageFolder || 'notepix-uploads').replace(/\\\\/g, "/").replace(/^\/+|\/+$/g, "");
            const extra = (Array.isArray(this.settings.extraWatchedList) && this.settings.extraWatchedList.length > 0
                ? this.settings.extraWatchedList.map(e => e?.path || '')
                : (this.settings.extraWatchedFolders || '').split(','))
                .map(s => (s || '').trim()).filter(Boolean)
                .map(s => s.replace(/\\\\/g, "/").replace(/^\/+|\/+$/g, ""));
            const attachNorm = (this.mobileAttachmentFolder || '').replace(/\\\\/g, "/").replace(/^\/+|\/+$/g, "");
            const inUpload = uploadNorm && (filePathNorm === uploadNorm || filePathNorm.startsWith(uploadNorm + "/"));
            const inExtra = extra.some(f => filePathNorm === f || filePathNorm.startsWith(f + "/"));
            const inAttach = attachNorm && (filePathNorm === attachNorm || filePathNorm.startsWith(attachNorm + "/"));
            if (!(inUpload || inExtra || inAttach)) return;

            this.captureFilePlaceholder(file);
            const alreadyConfirmed = this.consumeUserApprovedUpload(file.path);
            const shouldPrompt = (this.settings.uploadOnPaste === 'ask') && !alreadyConfirmed;

            let sourceNotePath = null;
            const placeholderEntry = this.peekPendingLinkPlaceholder(file.path) || this.peekPendingLinkPlaceholder(file.name);
            if (placeholderEntry && placeholderEntry.sourcePath) sourceNotePath = placeholderEntry.sourcePath;
            else {
                const activeView = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
                if (activeView && activeView.file) sourceNotePath = activeView.file.path;
            }

            if (shouldPrompt) {
                const confirmed = await this.promptUploadConfirmation(file);
                if (confirmed) await this.handleImageUpload(file, false, sourceNotePath);
                else await this.handleDeclinedUpload(file);
                return;
            }
            await this.handleImageUpload(file, false, sourceNotePath);
        }));

        // 文件打开时修复畸形链接并检查仓库不匹配
        this.registerEvent(this.app.workspace.on("file-open", async (file) => {
            if (!file) return;
            await this.sanitizeFileOnOpen(file);
            this.checkRepoMismatchOnFileOpen(file);
        }));

        // 编辑器右键菜单（手动删除图片链接）
        this.registerEvent(this.app.workspace.on("editor-menu", (menu, editor, view) => {
            const cursor = editor.getCursor();
            const line = editor.getLine(cursor.line);
            const links = this.extractNotepixImageLinks(line);
            if (links.length === 0) return;
            menu.addItem((item) => {
                item.setTitle("删除此图片（从 GitHub 和本地备份）").setIcon("trash").onClick(async () => {
                    const target = links[0];
                    if (this.settings.confirmBeforeDelete) {
                        const confirmModal = new ConfirmationModal(this.app, "确认删除", `确定要从 GitHub 删除 ${target.remotePath} 吗？`);
                        const confirmed = await confirmModal.open();
                        if (!confirmed) return;
                    }
                    const ok = await this.deleteFileFromGitHub(target.remotePath);
                    if (ok) {
                        const newLine = line.replace(target.fullMatch, "").trim();
                        editor.setLine(cursor.line, newLine);
                        new import_obsidian.Notice("图片链接已从笔记中移除");
                    } else {
                        new import_obsidian.Notice("无法从 GitHub 删除，链接已保留。");
                    }
                });
            });
        }));

        // 全局图片右键菜单（删除图片）
        const globalContextMenuHandler = async (event) => {
            const target = event.target;
            if (!(target instanceof HTMLImageElement)) return;
            const src = target.getAttribute('src');
            if (!src) return;
            const remotePath = this.getRemotePathFromImageSrc(src);
            if (!remotePath) return;
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            setTimeout(() => {
                const menu = new import_obsidian.Menu();
                menu.addItem((item) => {
                    item.setTitle("删除此图片（从 GitHub 和本地备份）").setIcon("trash").onClick(async () => {
                        if (this.settings.confirmBeforeDelete) {
                            const confirmModal = new ConfirmationModal(this.app, "确认删除", `确定要删除 ${remotePath} 吗？\n此操作不可撤销。`);
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
                    item.setTitle("复制图片地址").setIcon("copy").onClick(() => {
                        navigator.clipboard.writeText(src);
                        new import_obsidian.Notice("图片地址已复制");
                    });
                });
                menu.showAtMouseEvent(event);
            }, 10);
        };
        window.addEventListener('contextmenu', globalContextMenuHandler, true);
        this.register(() => window.removeEventListener('contextmenu', globalContextMenuHandler, true));
    }

    onunload() {
        this.decryptedToken = null;
        this.repoPrivacyCache = null;
        if (this._fileOpenDebounceTimer) clearTimeout(this._fileOpenDebounceTimer);
        if (this.imageCache) {
            this.imageCache.forEach(url => URL.revokeObjectURL(url));
            this.imageCache.clear();
        }
        if (this.userApprovedUploads) {
            this.userApprovedUploads.forEach(timeoutId => clearTimeout(timeoutId));
            this.userApprovedUploads.clear();
        }
        if (this.pendingLinkReplacements) {
            this.pendingLinkReplacements.forEach(entry => { if (entry?.timeoutId) clearTimeout(entry.timeoutId); });
            this.pendingLinkReplacements.clear();
        }
        if (this.failedImageFetches) this.failedImageFetches.clear();
        if (this.pendingLegacyMigrationTimers) {
            this.pendingLegacyMigrationTimers.forEach(timer => clearTimeout(timer));
            this.pendingLegacyMigrationTimers.clear();
        }
        if (this.pendingLegacyMigrations) this.pendingLegacyMigrations.clear();
        this.repoListCache = null;
        if (this.legacyResolvedRepoByKey) this.legacyResolvedRepoByKey.clear();
        if (this.legacyUnresolvedUntil) this.legacyUnresolvedUntil.clear();
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }
    async saveSettings() {
        await this.saveData(this.settings);
    }
};

// ========== 辅助弹窗类 ==========
class PasswordPrompt extends import_obsidian.Modal {
    constructor(app) {
        super(app);
        this.password = "";
        this.submitted = false;
    }
    open() {
        return new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
            super.open();
        });
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h2", { text: "输入主密码" });
        new import_obsidian.Setting(contentEl).setName("密码").addText((text) => {
            text.inputEl.type = "password";
            text.onChange((value) => { this.password = value; });
            text.inputEl.addEventListener("keydown", (event) => {
                if (event.key === "Enter") { event.preventDefault(); this.submit(); }
            });
        });
        new import_obsidian.Setting(contentEl).addButton(btn => btn.setButtonText("提交").setCta().onClick(() => this.submit()));
    }
    submit() {
        this.submitted = true;
        this.resolve(this.password);
        this.close();
    }
    onClose() {
        if (!this.submitted) this.reject(new Error("未提供密码"));
    }
}

class SimpleFolderPickerModal extends import_obsidian.Modal {
    constructor(app, folderPaths, onPick) {
        super(app);
        this.folderPaths = folderPaths;
        this.onPick = onPick;
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h3', { text: '选择文件夹' });
        const list = contentEl.createDiv({ cls: 'notepix-folder-picker' });
        const makeButton = (label, val) => {
            const btn = list.createEl('button', { text: label, cls: 'mod-cta' });
            btn.style.display = 'block';
            btn.style.marginBottom = '6px';
            btn.onclick = () => { this.onPick?.(val); this.close(); };
        };
        makeButton('/', '');
        (this.folderPaths || []).filter(p => p.length > 0).sort((a, b) => a.localeCompare(b)).forEach(p => makeButton(`/${p}`, p));
    }
    onClose() { this.contentEl.empty(); }
}

class VaultFolderSuggestModal extends import_obsidian.FuzzySuggestModal {
    constructor(app, folderPaths, onPick) {
        super(app);
        this.folderPaths = (folderPaths || []).map(p => (p || '').replace(/\\\\/g, "/").replace(/^\/+|\/+$/g, ""));
        this.onPick = onPick;
    }
    getItems() {
        const uniq = new Set(['', ...this.folderPaths]);
        return Array.from(uniq.values());
    }
    getItemText(item) { return item === '' ? '/' : `/${item}`; }
    onChooseItem(item, evt) { this.onPick?.(item); }
}

class ConfirmationModal extends import_obsidian.Modal {
    constructor(app, title, message) {
        super(app);
        this.title = title;
        this.message = message;
        this.confirmed = false;
    }
    open() { return new Promise((resolve) => { this.resolve = resolve; super.open(); }); }
    onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h2", { text: this.title });
        contentEl.createEl("p", { text: this.message });
        new import_obsidian.Setting(contentEl)
            .addButton(btn => btn.setButtonText("是").setCta().onClick(() => { this.confirmed = true; this.close(); }))
            .addButton(btn => btn.setButtonText("否").onClick(() => { this.confirmed = false; this.close(); }));
    }
    onClose() { this.resolve(this.confirmed); }
}

class RepoMismatchModal extends import_obsidian.Modal {
    constructor(app, repoKey) {
        super(app);
        this.repoKey = repoKey;
        this.choice = null;
    }
    openAndWait() { return new Promise((resolve) => { this.resolve = resolve; super.open(); }); }
    onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h2", { text: "检测到仓库隐私不匹配" });
        contentEl.createEl("p", { text: `您的仓库 "${this.repoKey}" 似乎是私有的，但当前笔记中的部分图片使用了公共原始 URL，可能无法正常加载。` });
        contentEl.createEl("p", { text: "您希望 NotePix 如何处理后续的图片 URL？" });
        const buttonContainer = contentEl.createDiv({ cls: 'notepix-mismatch-buttons' });
        buttonContainer.style.display = 'flex';
        buttonContainer.style.flexDirection = 'column';
        buttonContainer.style.gap = '8px';
        buttonContainer.style.marginTop = '12px';
        const makeBtn = (text, desc, choice, cta) => {
            const wrapper = buttonContainer.createDiv();
            const btn = wrapper.createEl('button', { text, cls: cta ? 'mod-cta' : '' });
            btn.style.width = '100%';
            btn.style.textAlign = 'left';
            btn.style.padding = '8px 12px';
            if (desc) {
                const descEl = wrapper.createEl('small', { text: desc });
                descEl.style.display = 'block';
                descEl.style.opacity = '0.7';
                descEl.style.marginTop = '2px';
                descEl.style.marginLeft = '12px';
            }
            btn.onclick = () => { this.choice = choice; this.close(); };
        };
        makeBtn("使用自动模式", "自动检测仓库类型并适配。推荐。", "auto", true);
        makeBtn("切换到私有模式", "所有后续上传将使用私有图片格式。", "private", false);
        makeBtn("保持公开模式", "不更改。私有仓库的原始 URL 可能无法加载。", "public", false);
    }
    onClose() { if (this.resolve) this.resolve(this.choice); }
}

// ========== 设置选项卡（全中文） ==========
class GitHubUploaderSettingTab extends import_obsidian.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
        this.masterPassword = "";
        this.githubToken = "";
        this.showExtraFolders = (this.plugin.settings.extraWatchedFolders || "").trim().length > 0;
        this.lastValidUploadFolder = this.plugin.settings.uploadImageFolder || 'notepix-uploads';
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        // GitHub 账户配置
        new import_obsidian.Setting(containerEl).setName("GitHub 用户名").addText(text => text
            .setPlaceholder("your-name")
            .setValue(this.plugin.settings.githubUser)
            .onChange(async (value) => {
                this.plugin.settings.githubUser = value;
                this.plugin.clearRepoPrivacyCache();
                this.plugin.clearRepoListCache();
                await this.plugin.saveSettings();
            }));

        new import_obsidian.Setting(containerEl).setName("仓库名").addText(text => text
            .setPlaceholder("obsidian-assets")
            .setValue(this.plugin.settings.repoName)
            .onChange(async (value) => {
                const previousRepo = (this.plugin.settings.repoName || '').trim();
                const nextRepo = (value || '').trim();
                if (previousRepo && nextRepo && previousRepo !== nextRepo) {
                    const history = Array.isArray(this.plugin.settings.repoHistory) ? [...this.plugin.settings.repoHistory] : [];
                    const filtered = history.filter(r => String(r || '').trim() && String(r || '').trim() !== previousRepo && String(r || '').trim() !== nextRepo);
                    this.plugin.settings.repoHistory = [previousRepo, ...filtered].slice(0, 10);
                }
                this.plugin.settings.repoName = value;
                this.plugin.clearRepoPrivacyCache();
                this.plugin.clearRepoListCache();
                await this.plugin.saveSettings();
            }));

        new import_obsidian.Setting(containerEl).setName("仓库可见性").setDesc("自动：检测仓库类型并适配。公开/私有：强制使用选定模式。")
            .addDropdown(dropdown => dropdown
                .addOption('auto', '自动（推荐）')
                .addOption('public', '公开')
                .addOption('private', '私有')
                .setValue(this.plugin.settings.repoVisibility || 'auto')
                .onChange(async (value) => {
                    this.plugin.settings.repoVisibility = value;
                    this.plugin.clearRepoPrivacyCache();
                    this.plugin.clearRepoListCache();
                    await this.plugin.saveSettings();
                }));

        new import_obsidian.Setting(containerEl).setName("分支名").addText(text => text
            .setPlaceholder("main")
            .setValue(this.plugin.settings.branchName)
            .onChange(async (value) => {
                this.plugin.settings.branchName = value;
                await this.plugin.saveSettings();
            }));

        // 图片存储策略（新增）
        new import_obsidian.Setting(containerEl)
            .setName("图片存储策略")
            .setDesc("全局：所有图片上传到下方文件夹。按笔记路径：图片将存储在匹配笔记位置的子文件夹中（例如 Assets/Image/DL/ANN/ 对应笔记 DL/ANN.md）。")
            .addDropdown(dropdown => dropdown
                .addOption('global', '全局文件夹')
                .addOption('byNotePath', '按笔记路径')
                .setValue(this.plugin.settings.imageStorageStrategy || 'global')
                .onChange(async (value) => {
                    this.plugin.settings.imageStorageStrategy = value;
                    await this.plugin.saveSettings();
                    this.display(); // 刷新界面
                }));

        if (this.plugin.settings.imageStorageStrategy === 'byNotePath') {
            new import_obsidian.Setting(containerEl)
                .setName("按笔记路径存储的基础文件夹")
                .setDesc("图片将保存在此文件夹下，后接笔记的目录和文件名（例如 Assets/Image/DL/ANN/）。")
                .addText(text => text
                    .setPlaceholder("Assets/Image")
                    .setValue(this.plugin.settings.byNotePathBaseFolder || 'Assets/Image')
                    .onChange(async (value) => {
                        this.plugin.settings.byNotePathBaseFolder = value.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
                        await this.plugin.saveSettings();
                    }));
        } else {
            new import_obsidian.Setting(containerEl).setName("仓库内文件夹路径").addText(text => text
                .setPlaceholder("assets/")
                .setValue(this.plugin.settings.folderPath)
                .onChange(async (value) => {
                    this.plugin.settings.folderPath = value.length > 0 && !value.endsWith("/") ? value + "/" : value;
                    await this.plugin.saveSettings();
                }));
        }

        new import_obsidian.Setting(containerEl).setName("上传后删除本地文件").addToggle(toggle => toggle
            .setValue(this.plugin.settings.deleteLocal)
            .onChange(async (value) => {
                this.plugin.settings.deleteLocal = value;
                await this.plugin.saveSettings();
            }));

        new import_obsidian.Setting(containerEl).setName("粘贴图片上传行为").setDesc("选择粘贴图片时是总是上传还是每次询问。")
            .addDropdown(dropdown => dropdown
                .addOption('always', '总是上传')
                .addOption('ask', '每次询问')
                .setValue(this.plugin.settings.uploadOnPaste || 'always')
                .onChange(async (value) => {
                    this.plugin.settings.uploadOnPaste = value;
                    await this.plugin.saveSettings();
                }));

        const localPrimarySetting = new import_obsidian.Setting(containerEl).setName("本地图片文件夹").setDesc("当您选择不上传时，图片将保存到此主文件夹。")
            .addText(text => text
                .setPlaceholder("notepix-local")
                .setValue(this.plugin.settings.localImageFolder)
                .onChange(async (value) => {
                    this.plugin.settings.localImageFolder = value;
                    await this.plugin.saveSettings();
                }));
        localPrimarySetting.addExtraButton(btn => {
            btn.setIcon?.("folder-open");
            if (!btn.setIcon) btn.setButtonText("浏览");
            btn.setTooltip?.("从库中选择文件夹");
            btn.onClick(() => {
                const folders = this.plugin.getVaultFolderPaths();
                const modal = new VaultFolderSuggestModal(this.app, folders, async (picked) => {
                    this.plugin.settings.localImageFolder = picked || '';
                    await this.plugin.saveSettings();
                    this.display();
                });
                modal.open();
            });
        });
        localPrimarySetting.addExtraButton(btn => {
            btn.setIcon?.("plus");
            if (!btn.setIcon) btn.setButtonText("+");
            btn.setTooltip?.("添加更多本地专用文件夹");
            btn.onClick(() => {
                const section = containerEl.querySelector('.notepix-localonly-folders');
                if (!section) renderLocalOnlyRows();
            });
        });

        const localOnlyAnchor = containerEl.createDiv({ cls: 'notepix-localonly-anchor' });
        const renderLocalOnlyRows = () => {
            const existing = localOnlyAnchor.querySelector('.notepix-localonly-folders');
            if (existing) existing.remove();
            const section = localOnlyAnchor.createDiv({ cls: 'notepix-localonly-folders' });
            section.createEl('h4', { text: '其他本地专用文件夹' });
            const fromCSV = (v) => (v || '').split(',').map(s => s.trim()).filter(Boolean).map(p => ({ path: p, label: '' }));
            let locals = Array.isArray(this.plugin.settings.localOnlyList) && this.plugin.settings.localOnlyList.length > 0
                ? this.plugin.settings.localOnlyList.map(e => ({ path: e.path || '', label: e.label || '' }))
                : fromCSV(this.plugin.settings.localOnlyFolders);
            const allFolders = this.plugin.getVaultFolderPaths();
            const isValidPath = (p) => allFolders.includes(p) || p === '';
            const save = async () => {
                const uploadNorm = (this.plugin.settings.uploadImageFolder || 'notepix-uploads').replace(/\\\\/g, "/").replace(/^\/+|\/+$/g, "");
                const extra = (Array.isArray(this.plugin.settings.extraWatchedList) && this.plugin.settings.extraWatchedList.length > 0
                    ? this.plugin.settings.extraWatchedList.map(e => e?.path || '')
                    : (this.plugin.settings.extraWatchedFolders || '').split(','))
                    .map(s => (s || '').trim()).filter(Boolean)
                    .map(s => s.replace(/\\\\/g, "/").replace(/^\/+|\/+$/g, ""));
                locals = locals.filter(f => {
                    const raw = f.path || '';
                    if (!raw.trim()) return true;
                    const p = raw.replace(/\\\\/g, "/").replace(/^\/+|\/+$/g, "");
                    return p !== uploadNorm && !extra.includes(p);
                });
                this.plugin.settings.localOnlyList = locals;
                this.plugin.settings.localOnlyFolders = locals.map(f => f.path).filter(Boolean).join(', ');
                await this.plugin.saveSettings();
            };
            locals.forEach((item, idx) => {
                const row = new import_obsidian.Setting(section).setName(`本地专用 ${idx + 1}`);
                row.addText(t => {
                    t.setPlaceholder('路径/到/文件夹').setValue(item.path).onChange(async (val) => {
                        item.path = val.trim();
                        await save();
                        const valid = isValidPath(item.path);
                        t.inputEl.style.borderColor = valid || item.path.length === 0 ? '' : 'var(--color-red)';
                    });
                });
                row.addExtraButton(btn => {
                    btn.setIcon?.('folder-open');
                    if (!btn.setIcon) btn.setButtonText('浏览');
                    btn.setTooltip?.('从库中选择文件夹');
                    btn.onClick(() => {
                        const modal = new VaultFolderSuggestModal(this.app, allFolders, async (picked) => {
                            item.path = picked || '';
                            await save();
                            renderLocalOnlyRows();
                        });
                        modal.open();
                    });
                });
                row.addText(t => t.setPlaceholder('可选标签').setValue(item.label || '').onChange(async (val) => { item.label = val; await save(); }));
                row.addExtraButton(btn => {
                    btn.setIcon?.('arrow-up');
                    if (!btn.setIcon) btn.setButtonText('上移');
                    btn.setTooltip?.('上移');
                    btn.onClick(async () => {
                        if (idx > 0) { const tmp = locals[idx - 1]; locals[idx - 1] = locals[idx]; locals[idx] = tmp; await save(); renderLocalOnlyRows(); }
                    });
                });
                row.addExtraButton(btn => {
                    btn.setIcon?.('arrow-down');
                    if (!btn.setIcon) btn.setButtonText('下移');
                    btn.setTooltip?.('下移');
                    btn.onClick(async () => {
                        if (idx < locals.length - 1) { const tmp = locals[idx + 1]; locals[idx + 1] = locals[idx]; locals[idx] = tmp; await save(); renderLocalOnlyRows(); }
                    });
                });
                row.addExtraButton(btn => {
                    btn.setIcon?.('trash');
                    if (!btn.setIcon) btn.setButtonText('删除');
                    btn.setTooltip?.('删除此文件夹');
                    btn.onClick(async () => { locals.splice(idx, 1); await save(); renderLocalOnlyRows(); });
                });
            });
            const addRow = new import_obsidian.Setting(section).setName('添加本地专用文件夹');
            addRow.addButton(b => b.setButtonText('+ 添加').setCta().onClick(async () => { locals.push({ path: '', label: '' }); await save(); renderLocalOnlyRows(); }));
        };
        if ((this.plugin.settings.localOnlyFolders || '').trim().length > 0 || (this.plugin.settings.localOnlyList || []).length > 0) renderLocalOnlyRows();

        const uploadSetting = new import_obsidian.Setting(containerEl).setName("上传图片的临时文件夹").setDesc("图片会先保存在此文件夹，然后自动上传。");
        uploadSetting.addText(text => {
            text.setPlaceholder("notepix-uploads").setValue(this.plugin.settings.uploadImageFolder || 'notepix-uploads').onChange(async (value) => {
                const val = (value || '').replace(/\\\\/g, "/").replace(/^\/+|\/+$/g, "").trim();
                const localOnly = (Array.isArray(this.plugin.settings.localOnlyList) && this.plugin.settings.localOnlyList.length > 0
                    ? this.plugin.settings.localOnlyList.map(e => e?.path || '')
                    : (this.plugin.settings.localOnlyFolders || this.plugin.settings.localImageFolder || 'notepix-local').split(','))
                    .map(s => (s || '').trim()).filter(Boolean)
                    .map(s => s.replace(/\\\\/g, "/").replace(/^\/+|\/+$/g, ""));
                if (val.length > 0 && localOnly.includes(val)) {
                    text.inputEl.style.borderColor = 'var(--color-red)';
                    new import_obsidian.Notice("上传文件夹不能与本地专用文件夹相同。");
                    setTimeout(() => { text.setValue(this.lastValidUploadFolder || 'notepix-uploads'); text.inputEl.style.borderColor = ''; }, 0);
                    return;
                }
                text.inputEl.style.borderColor = '';
                this.plugin.settings.uploadImageFolder = val;
                this.lastValidUploadFolder = val;
                await this.plugin.saveSettings();
            });
        });
        uploadSetting.addExtraButton(btn => {
            btn.setIcon?.("folder-open");
            if (!btn.setIcon) btn.setButtonText("浏览");
            btn.setTooltip?.("从库中选择文件夹");
            btn.onClick(() => {
                const folders = this.plugin.getVaultFolderPaths();
                const modal = new VaultFolderSuggestModal(this.app, folders, (picked) => {
                    const val = (picked || '').replace(/\\\\/g, "/").replace(/^\/+|\/+$/g, "");
                    const localOnly = (Array.isArray(this.plugin.settings.localOnlyList) && this.plugin.settings.localOnlyList.length > 0
                        ? this.plugin.settings.localOnlyList.map(e => e?.path || '')
                        : (this.plugin.settings.localOnlyFolders || this.plugin.settings.localImageFolder || 'notepix-local').split(','))
                        .map(s => (s || '').trim()).filter(Boolean)
                        .map(s => s.replace(/\\\\/g, "/").replace(/^\/+|\/+$/g, ""));
                    if (val && localOnly.includes(val)) { new import_obsidian.Notice("上传文件夹不能与本地专用文件夹相同。"); return; }
                    this.plugin.settings.uploadImageFolder = val;
                    this.lastValidUploadFolder = val;
                    this.plugin.saveSettings();
                    this.display();
                });
                modal.open();
            });
        });

        if (isMobile) {
            new import_obsidian.Setting(containerEl).setName("移动端附件集成").setDesc("在移动端，通过附件按钮添加的文件会自动保存到 'attachment' 文件夹并上传。")
                .addText(t => { t.setValue(this.plugin.settings.attachmentsFolderName || 'attachment'); t.setDisabled(true); });
        }

        const extraAnchor = containerEl.createDiv({ cls: 'notepix-extra-anchor' });
        uploadSetting.addExtraButton(btn => {
            btn.setIcon?.("plus");
            btn.setTooltip?.("添加更多监控文件夹");
            if (!btn.setIcon) btn.setButtonText("+");
            btn.onClick(() => { this.showExtraFolders = true; this.display(); });
        });

        if (this.showExtraFolders || (this.plugin.settings.extraWatchedFolders || "").trim().length > 0 || (this.plugin.settings.extraWatchedList || []).length > 0) {
            extraAnchor.createEl('h4', { text: '其他监控文件夹' });
            const fromCSV = (v) => (v || '').split(',').map(s => s.trim()).filter(Boolean).map(p => ({ path: p, label: '' }));
            let folders = Array.isArray(this.plugin.settings.extraWatchedList) && this.plugin.settings.extraWatchedList.length > 0
                ? this.plugin.settings.extraWatchedList.map(e => ({ path: e.path || '', label: e.label || '' }))
                : fromCSV(this.plugin.settings.extraWatchedFolders);
            const allFolders = this.plugin.getVaultFolderPaths();
            const isValidPath = (p) => allFolders.includes(p) || p === '';
            const save = async () => {
                const seen = new Set();
                const deduped = [];
                for (const f of folders) {
                    const p = (f.path || '').replace(/\\\\/g, "/").replace(/^\/+|\/+$/g, "");
                    if (!p) continue;
                    if (seen.has(p)) continue;
                    seen.add(p);
                    deduped.push({ path: p, label: f.label || '' });
                }
                this.plugin.settings.extraWatchedList = deduped;
                this.plugin.settings.extraWatchedFolders = deduped.map(f => f.path).join(', ');
                await this.plugin.saveSettings();
            };
            const renderRows = () => {
                const existing = extraAnchor.querySelector('.notepix-extra-folders');
                if (existing) existing.remove();
                const section = extraAnchor.createDiv({ cls: 'notepix-extra-folders' });
                folders.forEach((item, idx) => {
                    const row = new import_obsidian.Setting(section).setName(`监控文件夹 ${idx + 1}`);
                    row.addText(t => {
                        t.setPlaceholder('路径/到/文件夹').setValue(item.path).onChange(async (val) => {
                            item.path = val.trim();
                            const uploadNorm = (this.plugin.settings.uploadImageFolder || 'notepix-uploads').replace(/\\\\/g, "/").replace(/^\/+|\/+$/g, "");
                            const localOnly = (Array.isArray(this.plugin.settings.localOnlyList) && this.plugin.settings.localOnlyList.length > 0
                                ? this.plugin.settings.localOnlyList.map(e => e?.path || '')
                                : (this.plugin.settings.localOnlyFolders || this.plugin.settings.localImageFolder || 'notepix-local').split(','))
                                .map(s => (s || '').trim()).filter(Boolean)
                                .map(s => s.replace(/\\\\/g, "/").replace(/^\/+|\/+$/g, ""));
                            const valNorm = (item.path || '').replace(/\\\\/g, "/").replace(/^\/+|\/+$/g, "");
                            const duplicate = folders.some((f, j) => j !== idx && (f.path || '').replace(/\\\\/g, "/").replace(/^\/+|\/+$/g, "") === valNorm);
                            const conflicts = valNorm && (valNorm === uploadNorm || localOnly.includes(valNorm) || duplicate);
                            await save();
                            const valid = isValidPath(item.path) && !conflicts;
                            t.inputEl.style.borderColor = valid || item.path.length === 0 ? '' : 'var(--color-red)';
                            if (!valid && item.path.length > 0) new import_obsidian.Notice(duplicate ? '此文件夹已存在。' : '文件夹与上传或本地文件夹冲突。');
                        });
                    });
                    row.addExtraButton(btn => {
                        btn.setIcon?.('folder-open');
                        if (!btn.setIcon) btn.setButtonText('浏览');
                        btn.setTooltip?.('从库中选择文件夹');
                        btn.onClick(() => {
                            const modal = new VaultFolderSuggestModal(this.app, allFolders, async (picked) => {
                                const uploadNorm = (this.plugin.settings.uploadImageFolder || 'notepix-uploads').replace(/\\\\/g, "/").replace(/^\/+|\/+$/g, "");
                                const localOnly = (Array.isArray(this.plugin.settings.localOnlyList) && this.plugin.settings.localOnlyList.length > 0
                                    ? this.plugin.settings.localOnlyList.map(e => e?.path || '')
                                    : (this.plugin.settings.localOnlyFolders || this.plugin.settings.localImageFolder || 'notepix-local').split(','))
                                    .map(s => (s || '').trim()).filter(Boolean)
                                    .map(s => s.replace(/\\\\/g, "/").replace(/^\/+|\/+$/g, ""));
                                const pickedNorm = (picked || '').replace(/\\\\/g, "/").replace(/^\/+|\/+$/g, "");
                                const duplicate = folders.some((f, j) => j !== idx && (f.path || '').replace(/\\\\/g, "/").replace(/^\/+|\/+$/g, "") === pickedNorm);
                                if (pickedNorm && (pickedNorm === uploadNorm || localOnly.includes(pickedNorm))) { new import_obsidian.Notice('无法监控此文件夹：与上传/本地文件夹冲突。'); return; }
                                if (duplicate) { new import_obsidian.Notice('此文件夹已存在。'); return; }
                                item.path = pickedNorm;
                                await save();
                                renderRows();
                            });
                            modal.open();
                        });
                    });
                    row.addText(t => t.setPlaceholder('可选标签').setValue(item.label || '').onChange(async (val) => { item.label = val; await save(); }));
                    row.addExtraButton(btn => {
                        btn.setIcon?.('arrow-up');
                        if (!btn.setIcon) btn.setButtonText('上移');
                        btn.setTooltip?.('上移');
                        btn.onClick(async () => { if (idx > 0) { const tmp = folders[idx - 1]; folders[idx - 1] = folders[idx]; folders[idx] = tmp; await save(); renderRows(); } });
                    });
                    row.addExtraButton(btn => {
                        btn.setIcon?.('arrow-down');
                        if (!btn.setIcon) btn.setButtonText('下移');
                        btn.setTooltip?.('下移');
                        btn.onClick(async () => { if (idx < folders.length - 1) { const tmp = folders[idx + 1]; folders[idx + 1] = folders[idx]; folders[idx] = tmp; await save(); renderRows(); } });
                    });
                    row.addExtraButton(btn => {
                        btn.setIcon?.('trash');
                        if (!btn.setIcon) btn.setButtonText('删除');
                        btn.setTooltip?.('删除此文件夹');
                        btn.onClick(async () => { folders.splice(idx, 1); await save(); renderRows(); });
                    });
                });
                const addRow = new import_obsidian.Setting(section).setName('添加监控文件夹');
                addRow.addButton(b => b.setButtonText('+ 添加').setCta().onClick(async () => { folders.push({ path: '', label: '' }); await save(); renderRows(); }));
            };
            renderRows();
        }

        new import_obsidian.Setting(containerEl).setName("加密").setHeading();
        new import_obsidian.Setting(containerEl).setName("启用加密").setDesc("启用后，您的 GitHub Token 将被加密存储，并在首次使用时提示输入主密码。")
            .addToggle(toggle => toggle.setValue(this.plugin.settings.useEncryption).onChange(async (value) => {
                if (this.plugin.settings.useEncryption && !value) {
                    const ok = await new ConfirmationModal(this.app, "禁用加密？", "您的 Token 将明文存储在本地。确定吗？").open();
                    if (!ok) {
                        this.plugin.settings.useEncryption = true;
                        await this.plugin.saveSettings();
                        this.display();
                        return;
                    }
                }
                this.plugin.settings.useEncryption = value;
                await this.plugin.saveSettings();
                this.display();
            }));
        if (this.plugin.settings.useEncryption) {
            new import_obsidian.Setting(containerEl).setName("主密码").setDesc("设置一个密码用于加密您的 Token。此密码不会被保存。").addText(text => {
                text.inputEl.type = "password";
                text.setPlaceholder("输入密码以设置/更改 Token");
                text.onChange(value => { this.masterPassword = value; });
            });
            new import_obsidian.Setting(containerEl).setName("GitHub 个人访问令牌").setDesc("在此输入您的 PAT，保存时将加密。").addText(text => {
                text.inputEl.type = "password";
                text.setPlaceholder("ghp_... (粘贴新 Token)");
                text.onChange(value => { this.githubToken = value; });
            });
            new import_obsidian.Setting(containerEl).addButton(btn => btn.setButtonText("保存加密 Token").setCta().onClick(async () => {
                if (!this.masterPassword || !this.githubToken) { new import_obsidian.Notice("请同时提供主密码和 Token。"); return; }
                try {
                    const encrypted = await encrypt(this.githubToken, this.masterPassword);
                    this.plugin.settings.encryptedToken = encrypted;
                    this.plugin.settings.plainToken = "";
                    this.plugin.clearRepoPrivacyCache();
                    this.plugin.clearRepoListCache();
                    await this.plugin.saveSettings();
                    new import_obsidian.Notice("Token 已加密保存！");
                } catch (e) { new import_obsidian.Notice(`加密失败: ${e.message}`); }
            }));
        } else {
            new import_obsidian.Setting(containerEl).setName("GitHub 个人访问令牌（明文）").setDesc("明文存储，无密码提示。").addText(text => {
                text.inputEl.type = "password";
                text.setPlaceholder("ghp_... (粘贴 Token)");
                text.setValue(this.plugin.settings.plainToken || "");
                text.onChange(async (value) => {
                    this.plugin.settings.plainToken = value;
                    this.plugin.clearRepoPrivacyCache();
                    this.plugin.clearRepoListCache();
                    await this.plugin.saveSettings();
                });
            });
        }

        new import_obsidian.Setting(containerEl).setName("删除前确认").setDesc("删除 GitHub 上的图片前显示确认对话框。")
            .addToggle(toggle => toggle.setValue(this.plugin.settings.confirmBeforeDelete).onChange(async (value) => {
                this.plugin.settings.confirmBeforeDelete = value;
                await this.plugin.saveSettings();
            }));
    }
}

module.exports = MyPlugin;