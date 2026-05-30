// ============================================================
// NotePix - Obsidian GitHub 图片上传插件
// 功能：自动上传图片到 GitHub，支持私有/公开仓库、CDN加速、标题层级命名、计数器、整理序号等
// 作者：Ayush Parkara (原版) / 1228chl (修改维护)
// 版本：1.4.6
// 许可证：MIT
// ============================================================

var import_obsidian = require("obsidian");

// ---------- 辅助函数 ----------

/**
 * 拼接 GitHub 仓库中的路径（移动端安全）
 * @param {string} folderPath 文件夹路径（可为空）
 * @param {string} fileName 文件名
 * @returns {string} 标准化后的路径
 */
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

/**
 * 将 ArrayBuffer 转为 Base64 字符串（避免大量字符串拼接）
 * @param {ArrayBuffer} buffer 二进制数据
 * @returns {string} Base64 字符串
 */
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

/**
 * 转义正则表达式中的特殊字符
 * @param {string} value 原始字符串
 * @returns {string} 转义后的字符串
 */
function escapeRegex(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 检测当前是否为移动端（iOS/Android）
 */
const isMobile = !!(import_obsidian.Platform && import_obsidian.Platform.isMobile);

// ---------- 加密模块（AES-GCM） ----------
const PBKDF2_ITERATIONS = 1e5;      // 迭代次数，安全且性能可接受
const ALGORITHM = "AES-GCM";        // 加密算法

/**
 * 根据密码和盐派生密钥（PBKDF2 + SHA-256）
 * @param {string} password 主密码
 * @param {Uint8Array} salt 随机盐
 * @returns {Promise<CryptoKey>} 用于加密/解密的密钥
 */
async function getKey(password, salt) {
    const passwordBuffer = new TextEncoder().encode(password);
    const baseKey = await crypto.subtle.importKey("raw", passwordBuffer, { name: "PBKDF2" }, false, ["deriveKey"]);
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

/**
 * 加密明文（使用随机盐和随机IV，输出格式：盐Base64:IVBase64:密文Base64）
 * @param {string} plaintext 明文（如GitHub Token）
 * @param {string} password 主密码
 * @returns {Promise<string>} 加密后的字符串
 */
async function encrypt(plaintext, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await getKey(password, salt);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encodedPlaintext = new TextEncoder().encode(plaintext);
    const encryptedContent = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, encodedPlaintext);
    const saltB64 = btoa(String.fromCharCode(...new Uint8Array(salt)));
    const ivB64 = btoa(String.fromCharCode(...new Uint8Array(iv)));
    const encryptedB64 = btoa(String.fromCharCode(...new Uint8Array(encryptedContent)));
    return `${saltB64}:${ivB64}:${encryptedB64}`;
}

/**
 * 解密密文
 * @param {string} encryptedString 加密字符串（格式：盐:IV:密文）
 * @param {string} password 主密码
 * @returns {Promise<string>} 解密后的明文
 */
async function decrypt(encryptedString, password) {
    const [saltB64, ivB64, encryptedB64] = encryptedString.split(":");
    if (!saltB64 || !ivB64 || !encryptedB64) throw new Error("无效的加密数据格式。");
    const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
    const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
    const encryptedContent = Uint8Array.from(atob(encryptedB64), c => c.charCodeAt(0));
    const key = await getKey(password, salt);
    const decryptedContent = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, encryptedContent);
    return new TextDecoder().decode(decryptedContent);
}

// ---------- 默认设置 ----------
const DEFAULT_SETTINGS = {
    // GitHub 账户信息
    githubUser: "",                 // GitHub 用户名
    repoName: "",                   // 仓库名
    encryptedToken: "",             // 加密后的 GitHub Token
    plainToken: "",                 // 明文 Token（未加密时使用）
    branchName: "main",             // 分支名

    // 存储策略
    imageStorageStrategy: 'global', // 'global' 全局文件夹, 'byNotePath' 按笔记路径
    folderPath: "assets/",          // 全局模式下的仓库内文件夹
    byNotePathBaseFolder: "Assets/Image", // 按笔记路径模式的基础目录

    // 上传行为
    deleteLocal: false,             // 上传后是否删除本地原图
    useEncryption: true,            // 是否加密存储 Token
    repoVisibility: 'auto',         // 'auto', 'public', 'private' 仓库可见性模式
    repoHistory: [],                // 使用过的仓库名历史记录
    uploadOnPaste: 'always',        // 'always' 总是上传, 'ask' 每次询问
    autoUpload: true,               // 是否自动上传监控文件夹内的图片

    // 本地文件夹管理
    localImageFolder: 'notepix-local',      // 不上传时的本地保存文件夹
    uploadImageFolder: 'notepix-uploads',   // 上传临时文件夹
    extraWatchedFolders: '',                // 额外监控文件夹（逗号分隔，旧格式）
    extraWatchedList: [],                   // 额外监控文件夹列表（结构化）
    localOnlyFolders: '',                   // 仅本地文件夹（逗号分隔，旧格式）
    localOnlyList: [],                      // 仅本地文件夹列表（结构化）

    // 移动端集成
    attachmentsFolderName: 'attachment',    // 移动端附件文件夹名
    integrateAttachmentsOnMobile: true,     // 是否在移动端集成附件文件夹

    // 提示抑制
    lastPromptedAt: 0,              // 上次提示仓库不匹配的时间
    lastPromptedRepo: '',           // 上次提示的仓库名
    autoDeleteEnabled: false,       // 自动删除（暂未使用）
    confirmBeforeDelete: true,      // 删除前确认

    // 图片计数器持久化
    imageCounters: {},              // { "笔记路径|标题层级路径": 当前序号 }
    imageUrlType: 'raw',            // 'raw' 或 'jsdelivr'，公开仓库链接格式
    maxHeadingDepth: 6,             // 文件名中最大标题深度（1-6）
};

// ========== 主插件类 ==========
var MyPlugin = class extends import_obsidian.Plugin {
    constructor() {
        super(...arguments);
        // 解密后的 Token（内存缓存）
        this.decryptedToken = null;
        // 是否正在弹出密码输入框（防止重复弹窗）
        this.isPromptingForPassword = false;
        // 移动端附件文件夹路径
        this.mobileAttachmentFolder = '';
        // 用户已批准的上传（避免重复弹窗） Map<路径, timeoutId>
        this.userApprovedUploads = new Map();
        // 待替换的占位符链接 Map<路径, {placeholderText, sourcePath, timeoutId}>
        this.pendingLinkReplacements = new Map();
        // 最近输入过的占位符（用于移动端追踪） Map<文件名, {placeholder, ts}>
        this.recentPlaceholdersByName = new Map();
        // 仓库隐私检测缓存
        this.repoPrivacyCache = null;
        // 文件打开时的防抖计时器
        this._fileOpenDebounceTimer = null;
        // 是否已显示过不匹配提示（避免重复）
        this._mismatchNoticeShown = false;
        // 最近一次渲染 Token 不可用提示的时间
        this._lastRenderTokenNoticeAt = 0;
        // 图片获取失败记录 Map<cacheKey, timestamp>
        this.failedImageFetches = new Map();
        // 遗留链接迁移队列 Map<笔记路径, Map<oldUrl, newUrl>>
        this.pendingLegacyMigrations = new Map();
        // 遗留链接迁移计时器 Map<笔记路径, timer>
        this.pendingLegacyMigrationTimers = new Map();
        // 用户仓库列表缓存
        this.repoListCache = null;
        // 遗留链接解析出的仓库名缓存 Map<legacyKey, resolvedRepo>
        this.legacyResolvedRepoByKey = new Map();
        // 遗留链接未解析状态的冷却时间 Map<legacyKey, untilTimestamp>
        this.legacyUnresolvedUntil = new Map();
        // 图片计数器（内存 Map）
        this.imageCounterMap = new Map();
        // 是否正在处理图片操作
        this.isHandlingAction = false;
        // 私有图片 Blob URL 缓存 Map<cacheKey, blobUrl>
        this.imageCache = new Map();
    }

    // ========== 工具方法 ==========

    /**
     * 获取仓库中所有文件夹路径（用于设置中的文件夹选择）
     * @returns {string[]} 文件夹路径列表
     */
    getVaultFolderPaths() {
        const res = [];
        const walk = (folder) => {
            const p = (folder.path || "").replace(/^\/+|\/+$/g, "");
            res.push(p);
            for (const child of folder.children) {
                if (child instanceof import_obsidian.TFolder) walk(child);
            }
        };
        walk(this.app.vault.getRoot());
        return res;
    }

    /**
     * 规范化 vault 内路径（统一正斜杠，去除首尾斜杠）
     * @param {string} path 原始路径
     * @returns {string}
     */
    normalizeVaultPath(path) {
        return (path || '').replace(/\\\\/g, "/").replace(/^\/+|\/+$/g, "");
    }

    /**
     * 获取旧格式链接的候选仓库名（用于兼容旧版 NotePix）
     * @param {string} primaryRepo 主仓库名
     * @returns {string[]}
     */
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

    /**
     * 清空仓库列表缓存
     */
    clearRepoListCache() {
        this.repoListCache = null;
        this.legacyResolvedRepoByKey?.clear();
        this.legacyUnresolvedUntil?.clear();
    }

    /**
     * 获取当前配置的 GitHub 用户下的所有仓库名（用于旧链接修复）
     * @param {string} token GitHub Token
     * @returns {Promise<string[]>}
     */
    async getConfiguredUserRepoList(token) {
        const configuredUser = (this.settings.githubUser || '').trim();
        if (!configuredUser || !token) return [];
        if (this.repoListCache && this.repoListCache.user === configuredUser && (Date.now() - this.repoListCache.timestamp) < 10 * 60 * 1000) {
            return this.repoListCache.repos || [];
        }
        try {
            const collected = [];
            const userLower = configuredUser.toLowerCase();
            for (let page = 1; page <= 10; page++) {
                const response = await fetch(`https://api.github.com/user/repos?per_page=100&page=${page}&sort=updated&direction=desc&type=all&affiliation=owner,collaborator,organization_member`, {
                    headers: { "Authorization": `token ${token}`, "Accept": "application/vnd.github.v3+json" }
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

    // ========== 遗留链接迁移（队列） ==========

    /**
     * 将旧格式图片链接加入迁移队列（用于自动升级到 v2 格式）
     * @param {string} sourcePath 笔记路径
     * @param {string} oldUrl 旧 URL
     * @param {string} newUrl 新 URL
     */
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

    /**
     * 执行遗留链接迁移（批量替换）
     * @param {string} sourcePath 笔记路径
     */
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
                    // 文件已被修改，重新入队
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

    // ========== 用户批准上传（避免重复弹窗） ==========

    /**
     * 标记文件已由用户确认（用于避免文件创建事件重复处理）
     * @param {string} path 文件路径
     */
    markFileAsUserApproved(path) {
        const norm = this.normalizeVaultPath(path);
        if (!norm) return;
        const existing = this.userApprovedUploads.get(norm);
        if (existing) clearTimeout(existing);
        const timeoutId = setTimeout(() => this.userApprovedUploads.delete(norm), 6e4); // 60秒后自动清除
        this.userApprovedUploads.set(norm, timeoutId);
    }

    /**
     * 消费标记（如果文件已被批准，返回 true 并清除标记）
     * @param {string} path 文件路径
     * @returns {boolean}
     */
    consumeUserApprovedUpload(path) {
        const norm = this.normalizeVaultPath(path);
        if (!norm) return false;
        const timeoutId = this.userApprovedUploads.get(norm);
        if (!timeoutId) return false;
        clearTimeout(timeoutId);
        this.userApprovedUploads.delete(norm);
        return true;
    }

    /**
     * 获取主本地文件夹路径（第一个本地专用文件夹或默认）
     * @returns {string}
     */
    getPrimaryLocalFolderPath() {
        const fromList = (Array.isArray(this.settings.localOnlyList) && this.settings.localOnlyList.length > 0)
            ? (this.settings.localOnlyList[0]?.path || this.settings.localOnlyList[0] || '')
            : (this.settings.localImageFolder || 'notepix-local');
        const cleaned = this.normalizeVaultPath(fromList || 'notepix-local');
        return cleaned || 'notepix-local';
    }

    /**
     * 确保文件夹存在，若不存在则创建
     * @param {string} folderPath 文件夹路径
     */
    async ensureFolderExists(folderPath) {
        if (!folderPath) return;
        try {
            await this.app.vault.createFolder(folderPath);
        } catch (_) { }
    }

    /**
     * 将文件移至本地专用文件夹（拒绝上传时调用）
     * @param {TFile} file 文件对象
     * @returns {Promise<{newPath: string, originalPath: string, originalName: string} | null>}
     */
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

    // ========== Token 获取与解密 ==========

    /**
     * 解密 Token（弹出密码框）
     * @returns {Promise<string|null>}
     */
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
                if (msg !== "未提供密码") {
                    new import_obsidian.Notice("解密失败。密码错误。", 5e3);
                }
                return null;
            } finally {
                this.isPromptingForPassword = false;
            }
        }
        return null;
    }

    /**
     * 获取当前可用的 GitHub Token（优先使用解密后的，否则根据加密设置尝试获取）
     * @returns {Promise<string|null>}
     */
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

        // ---------- 移动端占位符追踪 ----------
    /**
     * 在移动端追踪编辑器中输入的图片占位符（[[xxx.png]] 或 ![](xxx)），用于后续替换
     */
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

    // ---------- 记录/消费占位符 ----------
    /**
     * 记录待替换的占位符（用于上传后替换链接）
     * @param {string} path 文件路径或文件名
     * @param {string} placeholderText 占位符文本（如 ![[xxx.png]]）
     * @param {string} sourcePath 来源笔记路径
     */
    recordPendingLinkPlaceholder(path, placeholderText, sourcePath = "") {
        const norm = this.normalizeVaultPath(path);
        if (!norm || !placeholderText) return;
        const sourcePathNorm = this.normalizeVaultPath(sourcePath || "");
        const entry = this.pendingLinkReplacements.get(norm);
        if (entry?.timeoutId) clearTimeout(entry.timeoutId);
        const timeoutId = setTimeout(() => this.pendingLinkReplacements.delete(norm), 5 * 60 * 1e3);
        this.pendingLinkReplacements.set(norm, { placeholderText, sourcePath: sourcePathNorm, timeoutId });
    }

    /**
     * 查看待替换的占位符（不消费）
     * @param {string} pathOrKey 路径或文件名
     * @returns {object|null}
     */
    peekPendingLinkPlaceholder(pathOrKey) {
        const norm = this.normalizeVaultPath(pathOrKey);
        const key = norm || pathOrKey;
        if (!key) return null;
        const entry = this.pendingLinkReplacements.get(key);
        if (!entry) return null;
        return { key, placeholderText: entry.placeholderText || null, sourcePath: entry.sourcePath || "" };
    }

    /**
     * 消费待替换的占位符（取出后删除）
     * @param {string} pathOrKey 路径或文件名
     * @returns {object|null}
     */
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

    /**
     * 弹窗询问是否上传图片
     * @param {import('obsidian').TFile} file
     * @returns {Promise<boolean>}
     */
    async promptUploadConfirmation(file) {
        const modal = new ConfirmationModal(this.app, "上传图片？", `是否将 ${file.name} 上传到 GitHub？`);
        return await modal.open();
    }

    // ---------- 核心：生成远程路径（按笔记路径或全局） ----------
    /**
     * 生成图片在 GitHub 仓库中的存储路径（不含分支）
     * @param {string} noteFilePath 笔记路径（可选，用于按笔记路径模式）
     * @param {string} imageFileName 图片文件名
     * @returns {string}
     */
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

    // ---------- 计数器 ----------
    /**
     * 获取下一个图片序号（基于笔记路径和标题层级路径），并自动保存
     * @param {string} notePath 笔记路径
     * @param {string} headingPath 标题层级路径（如 "1.1.3"）
     * @returns {Promise<number>}
     */
    async getNextImageCounter(notePath, headingPath) {
        const key = `${notePath}|${headingPath}`;
        let current = this.imageCounterMap.get(key) || 0;
        if (this.settings.imageCounters && this.settings.imageCounters[key] !== undefined) {
            current = this.settings.imageCounters[key];
        }
        const next = current + 1;
        this.imageCounterMap.set(key, next);
        if (!this.settings.imageCounters) this.settings.imageCounters = {};
        this.settings.imageCounters[key] = next;
        await this.saveSettings();
        return next;
    }

    // ---------- 核心：基于标题层级生成文件名 ----------
    /**
     * 根据光标所在位置，生成基于标题树状编号的文件名，如 "1.1.3-1.png"
     * @param {import('obsidian').Editor} editor
     * @param {string} noteBasename 笔记名称（不含扩展名）
     * @param {string} extension 图片扩展名
     * @returns {Promise<string>}
     */
    async generateFileNameFromHeading(editor, noteBasename, extension) {
        if (!editor) {
            const timestamp = new Date().toISOString().replace(/[-:.]/g, "");
            return `${timestamp}.${extension}`;
        }

        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            const timestamp = new Date().toISOString().replace(/[-:.]/g, "");
            return `${timestamp}.${extension}`;
        }

        const cache = this.app.metadataCache.getFileCache(activeFile);
        const headings = cache?.headings;
        if (!headings || headings.length === 0) {
            const timestamp = new Date().toISOString().replace(/[-:.]/g, "");
            return `${timestamp}.${extension}`;
        }

        const cursor = editor.getCursor();
        const cursorLine = cursor.line;

        // 1. 找到光标所在的标题（最后一个行号 ≤ 光标行号的标题）
        let currentHeading = null;
        for (let i = headings.length - 1; i >= 0; i--) {
            const heading = headings[i];
            if (heading.position.start.line <= cursorLine) {
                currentHeading = heading;
                break;
            }
        }

        if (!currentHeading) {
            const notePath = activeFile.path;
            const counter = await this.getNextImageCounter(notePath, "root");
            return `root-${counter}.${extension}`;
        }

        // 2. 为每个标题计算绝对编号（Word 风格多级列表）
        const counters = [];          // 存储每层的当前计数（从1开始）
        const headingToPath = new Map();

        for (const h of headings) {
            const level = h.level;
            // 确保 counters 长度至少为 level（不足补0）
            while (counters.length < level) {
                counters.push(0);
            }
            // 如果当前标题级别小于已有深度，则丢弃更深层级的计数（重置）
            if (counters.length > level) {
                counters.length = level;
            }
            // 当前层级计数加1
            counters[level - 1]++;
            // 生成绝对路径（只保留到当前层级）
            const path = counters.slice(0, level).join('.');
            headingToPath.set(h, path);
        }

        let targetPath = headingToPath.get(currentHeading);
        if (!targetPath) {
            const timestamp = new Date().toISOString().replace(/[-:.]/g, "");
            return `${timestamp}.${extension}`;
        }

        // 3. 可选：限制最大深度（用户设置）
        const maxDepth = this.settings.maxHeadingDepth || 6;
        const parts = targetPath.split('.');
        if (parts.length > maxDepth) {
            targetPath = parts.slice(0, maxDepth).join('.');
        }

        // 4. 获取该路径下的图片计数器（异步保存）
        const notePath = activeFile.path;
        const counter = await this.getNextImageCounter(notePath, targetPath);

        // 5. 生成最终文件名（格式：层级路径-计数器.扩展名）
        const safePath = targetPath.replace(/[^0-9.]/g, '');
        return `${safePath}-${counter}.${extension}`;
    }

    // ---------- 上传图片到 GitHub ----------
    /**
     * 处理图片上传（核心）
     * @param {import('obsidian').TFile|File} file 文件对象（可以是 TFile 或剪贴板 File）
     * @param {boolean} isPaste 是否为粘贴操作
     * @param {string|null} sourceNotePath 来源笔记路径（可选）
     */
    async handleImageUpload(file, isPaste = false, sourceNotePath = null) {
        if (!this.settings.githubUser || !this.settings.repoName) {
            new import_obsidian.Notice("请先配置 GitHub 用户名和仓库名。");
            return;
        }
        const token = await this.getToken();
        if (!token) return;
        const uploadNotice = new import_obsidian.Notice(`正在上传 ${file.name} 到 GitHub...`, 0);
        try {
            // 获取扩展名：兼容 TFile 和剪贴板 File
            let extension;
            if (file.extension) {
                extension = file.extension;
            } else if (file.name) {
                extension = file.name.split('.').pop() || 'png';
            } else {
                extension = 'png';
            }

            let newFileName;
            const activeView = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
            if (activeView && activeView.editor && (sourceNotePath || activeView.file?.path)) {
                const notePath = sourceNotePath || activeView.file.path;
                const noteFile = this.app.vault.getAbstractFileByPath(notePath);
                const noteBasename = noteFile ? noteFile.basename : 'image';
                try {
                    newFileName = await this.generateFileNameFromHeading(activeView.editor, noteBasename, extension);
                } catch (err) {
                    console.error("基于标题生成文件名失败，回退时间戳", err);
                    const timestamp = new Date().toISOString().replace(/[-:.]/g, "");
                    newFileName = `${timestamp}.${extension}`;
                }
            } else {
                const timestamp = new Date().toISOString().replace(/[-:.]/g, "");
                newFileName = `${timestamp}.${extension}`;
            }

            // 读取二进制数据：粘贴时 file 为 File 对象，使用 arrayBuffer；否则为 TFile，使用 vault.readBinary
            const fileData = isPaste ? await file.arrayBuffer() : await this.app.vault.readBinary(file);
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

            // 根据仓库可见性和用户选择生成最终 URL
            let finalUrl;
            const getPublicUrl = (path) => {
                if (this.settings.imageUrlType === 'jsdelivr') {
                    return `https://cdn.jsdelivr.net/gh/${this.settings.githubUser}/${this.settings.repoName}@${this.settings.branchName}/${path}`;
                } else {
                    return `https://raw.githubusercontent.com/${this.settings.githubUser}/${this.settings.repoName}/${this.settings.branchName}/${path}`;
                }
            };

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
                    finalUrl = getPublicUrl(filePath);
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
                    finalUrl = getPublicUrl(filePath);
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

        // ---------- 替换编辑器中的链接 ----------
    /**
     * 替换编辑器中的占位符链接为远程链接
     * @param {string} fileName 原文件名
     * @param {string} replacementTarget 目标链接（URL 或本地路径）
     * @param {string} originalPath 原始文件路径（可选）
     * @param {object} options 选项 { replacementType?: 'wiki'|'remote'|'raw', sourcePath?: string }
     * @returns {Promise<boolean>}
     */
    async replaceLinkInEditor(fileName, replacementTarget, originalPath = "", options = {}) {
        const replacementType = options?.replacementType || 'remote';
        const replacementText = replacementType === 'wiki'
            ? `![[${replacementTarget}]]`
            : (replacementType === 'raw' ? `${replacementTarget}` : `![](${replacementTarget})`);
        const activeView = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
        if (!activeView) return false;
        const editor = activeView.editor;
        const content = editor.getValue();
        // 匹配多种可能的占位符格式（包括 [[file]] 和 ![](file)）
        const escapedFileName = fileName.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
        const regex = new RegExp(`!\\[\\[.*?${escapedFileName}.*?\\]\\]|!\\[[^\\]]*\\]\\([^\\)]*${escapedFileName}[^\\)]*\\)`, 'i');
        const match = content.match(regex);
        if (!match) return false;
        const newContent = content.replace(match[0], replacementText);
        const cursor = editor.getCursor();
        editor.setValue(newContent);
        editor.setCursor(cursor);
        return true;
    }

    // ---------- 粘贴处理 ----------
    /**
     * 处理粘贴事件（从剪贴板获取图片）
     * @param {ClipboardEvent} evt
     */
    async handlePaste(evt) {
        const files = evt.clipboardData?.files;
        if (!files || files.length === 0) return;
        const imageFile = Array.from(files).find(file => file.type.startsWith("image/"));
        if (!imageFile) return;
        if (this.settings.uploadOnPaste === 'always') {
            evt.preventDefault();
            await this.handleImageUpload(imageFile, true);
            return;
        }
        if (this.settings.uploadOnPaste === 'ask') {
            evt.preventDefault();
            const modal = new ConfirmationModal(this.app, "上传图片？", "是否将此图片上传到 GitHub？");
            const confirmed = await modal.open();
            if (confirmed) await this.handleImageUpload(imageFile, true);
            else await this.saveImageLocally(imageFile);
        }
    }

    /**
     * 将剪贴板图片保存到本地专用文件夹（不上传）
     * @param {File} imageFile
     */
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

    /**
     * 上传粘贴的图片（已废弃，整合到 handleImageUpload，保留空方法避免报错）
     * @deprecated
     */
    async uploadPastedImage(imageFile) {
        // 已整合，直接调用 handleImageUpload
        await this.handleImageUpload(imageFile, true);
    }

    /**
     * 处理用户拒绝上传后的操作（将文件移至本地专用文件夹）
     * @param {import('obsidian').TFile} file
     */
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

    // ---------- 链接格式转换（批量/单张） ----------
    /**
     * 批量转换笔记中所有图片链接格式
     * @param {string} content 笔记内容
     * @param {string} targetType 'raw' 或 'jsdelivr'
     * @returns {string}
     */
    convertImageLinks(content, targetType) {
        const user = this.settings.githubUser;
        const repo = this.settings.repoName;
        const branch = this.settings.branchName;
        if (!user || !repo || !branch) {
            new import_obsidian.Notice("请先配置 GitHub 用户名、仓库名和分支名。");
            return content;
        }
        const cdnRegex = new RegExp(`https?://cdn\\.jsdelivr\\.net/gh/${escapeRegex(user)}/${escapeRegex(repo)}@${escapeRegex(branch)}/([^)\\s]+)`, 'g');
        const rawRegex = new RegExp(`https?://raw\\.githubusercontent\\.com/${escapeRegex(user)}/${escapeRegex(repo)}/${escapeRegex(branch)}/([^)\\s]+)`, 'g');
        if (targetType === 'raw') {
            return content.replace(cdnRegex, (match, path) => `https://raw.githubusercontent.com/${user}/${repo}/${branch}/${path}`);
        } else if (targetType === 'jsdelivr') {
            return content.replace(rawRegex, (match, path) => `https://cdn.jsdelivr.net/gh/${user}/${repo}@${branch}/${path}`);
        }
        return content;
    }

    /**
     * 转换当前打开笔记中的所有图片链接（基于设置中的 imageUrlType）
     */
    async convertCurrentNoteLinks() {
        const activeView = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
        if (!activeView) {
            new import_obsidian.Notice("没有打开的笔记。");
            return;
        }
        const file = activeView.file;
        if (!file) return;
        const targetType = this.settings.imageUrlType;
        const currentContent = await this.app.vault.read(file);
        const newContent = this.convertImageLinks(currentContent, targetType);
        if (newContent === currentContent) {
            new import_obsidian.Notice(`没有找到需要转换的链接（目标格式：${targetType === 'raw' ? 'GitHub Raw' : 'jsDelivr'}）。`);
            return;
        }
        const confirmModal = new ConfirmationModal(this.app, "转换链接格式", `将把当前笔记中的所有图片链接转换为 ${targetType === 'raw' ? 'GitHub Raw' : 'jsDelivr CDN'} 格式。确定吗？`);
        const confirmed = await confirmModal.open();
        if (!confirmed) return;
        await this.app.vault.modify(file, newContent);
        new import_obsidian.Notice(`已转换当前笔记中的图片链接为 ${targetType === 'raw' ? 'GitHub Raw' : 'jsDelivr CDN'} 格式。`);
    }

    /**
     * 从图片的完整 URL（或私有协议链接）中提取远程路径（相对于仓库根目录）
     * 支持三种格式：
     * 1. 私有链接：obsidian://notepix/v2/owner/repo/branch/path/to/image.png
     * 2. GitHub Raw 公开链接：https://raw.githubusercontent.com/owner/repo/branch/path/to/image.png
     * 3. jsDelivr CDN 公开链接：https://cdn.jsdelivr.net/gh/owner/repo@branch/path/to/image.png
     *
     * @param {string} src - 图片的 src 属性值（URL 或 obsidian 协议）
     * @returns {string|null} 提取出的远程路径（例如 "assets/image-1.png"），若无法解析则返回 null
     *
     * @example
     * getRemotePathFromImageSrc("obsidian://notepix/v2/me/myrepo/main/assets/1.png")
     * // 返回 "assets/1.png"
     *
     * @example
     * getRemotePathFromImageSrc("https://raw.githubusercontent.com/me/myrepo/main/assets/1.png")
     * // 返回 "assets/1.png"
     *
     * @example
     * getRemotePathFromImageSrc("https://cdn.jsdelivr.net/gh/me/myrepo@main/assets/1.png")
     * // 返回 "assets/1.png"
     */
    getRemotePathFromImageSrc(src) {
        if (!src) return null;
        // 私有链接格式：obsidian://notepix/v2/用户/仓库/分支/路径
        const privateMatch = src.match(/obsidian:\/\/notepix\/v2\/[^\/]+\/[^\/]+\/[^\/]+\/(.+)$/);
        if (privateMatch) return decodeURIComponent(privateMatch[1]);
        // GitHub Raw 公开链接格式：https://raw.githubusercontent.com/用户/仓库/分支/路径
        const publicMatch = src.match(/https?:\/\/raw\.githubusercontent\.com\/[^\/]+\/[^\/]+\/[^\/]+\/(.+)$/);
        if (publicMatch) return decodeURIComponent(publicMatch[1]);
        // jsDelivr CDN 链接格式：https://cdn.jsdelivr.net/gh/用户/仓库@分支/路径
        const cdnMatch = src.match(/https?:\/\/cdn\.jsdelivr\.net\/gh\/[^\/]+\/[^@]+@[^\/]+\/(.+)$/);
        if (cdnMatch) return decodeURIComponent(cdnMatch[1]);
        return null;
    }

        // ---------- URL 解析与构建 ----------
    /**
     * 解析图片URL，提取类型、用户、仓库、分支、路径
     * @param {string} url
     * @returns {object|null}
     */
    parseImageUrl(url) {
        if (!url) return null;
        if (url.startsWith('obsidian://notepix/')) return null;
        // jsDelivr 链接: https://cdn.jsdelivr.net/gh/用户/仓库@分支/路径
        const cdnMatch = url.match(/https?:\/\/cdn\.jsdelivr\.net\/gh\/([^\/]+)\/([^@]+)@([^\/]+)\/(.+)$/);
        if (cdnMatch) {
            return {
                type: 'jsdelivr',
                owner: decodeURIComponent(cdnMatch[1]),
                repo: decodeURIComponent(cdnMatch[2]),
                branch: decodeURIComponent(cdnMatch[3]),
                path: decodeURIComponent(cdnMatch[4])
            };
        }
        // GitHub Raw 链接: https://raw.githubusercontent.com/用户/仓库/分支/路径
        const rawMatch = url.match(/https?:\/\/raw\.githubusercontent\.com\/([^\/]+)\/([^\/]+)\/([^\/]+)\/(.+)$/);
        if (rawMatch) {
            return {
                type: 'raw',
                owner: decodeURIComponent(rawMatch[1]),
                repo: decodeURIComponent(rawMatch[2]),
                branch: decodeURIComponent(rawMatch[3]),
                path: decodeURIComponent(rawMatch[4])
            };
        }
        return null;
    }

    /**
     * 根据解析结果生成目标格式的URL
     * @param {object} parsed parseImageUrl 返回值
     * @param {string} targetType 'raw' 或 'jsdelivr'
     * @returns {string}
     */
    buildImageUrl(parsed, targetType) {
        const { owner, repo, branch, path } = parsed;
        if (targetType === 'raw') {
            return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
        } else {
            return `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/${path}`;
        }
    }

    /**
     * 从完整图片语法中提取URL
     * @param {string} fullMatch 如 "![](https://...)"
     * @returns {string|null}
     */
    extractUrlFromFullMatch(fullMatch) {
        const match = fullMatch.match(/!\[[^\]]*\]\(([^)]+)\)/);
        return match ? match[1] : null;
    }

    // ---------- GitHub 文件操作辅助 ----------
    /**
     * 检查远程文件是否存在
     * @param {string} remotePath 远程路径
     * @param {string} token GitHub Token
     * @returns {Promise<boolean>}
     */
    async fileExistsOnGitHub(remotePath, token) {
        const owner = this.settings.githubUser;
        const repo = this.settings.repoName;
        const branch = this.settings.branchName;
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${remotePath}?ref=${branch}`;
        const response = await fetch(url, {
            headers: { "Authorization": `token ${token}`, "Accept": "application/vnd.github.v3+json" }
        });
        return response.ok;
    }

    /**
     * 从 GitHub 下载图片内容
     * @param {object} parsed parseImageUrl 返回值
     * @param {string} token GitHub Token
     * @returns {Promise<ArrayBuffer|null>}
     */
    async downloadImageFromGitHub(parsed, token) {
        const { owner, repo, branch, path } = parsed;
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;
        const response = await fetch(url, {
            headers: { "Authorization": `token ${token}`, "Accept": "application/vnd.github.v3.raw" }
        });
        if (!response.ok) return null;
        return await response.arrayBuffer();
    }

    /**
     * 上传图片数据到 GitHub（不修改笔记）
     * @param {ArrayBuffer} data 图片数据
     * @param {string} remotePath 远程路径
     * @param {string} token GitHub Token
     * @returns {Promise<boolean>}
     */
    async uploadImageData(data, remotePath, token) {
        const owner = this.settings.githubUser;
        const repo = this.settings.repoName;
        const branch = this.settings.branchName;
        const base64 = arrayBufferToBase64(data);
        const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${remotePath}`;
        const response = await fetch(apiUrl, {
            method: "PUT",
            headers: { "Authorization": `token ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ message: `Reorder image to ${remotePath}`, content: base64, branch: branch })
        });
        return response.ok;
    }

    // ---------- 重新整理当前笔记图片序号（核心功能） ----------
    /**
     * 重新整理当前笔记中所有图片的序号，使每个标题层级下的图片序号从1开始连续。
     * 安全策略：先上传新文件，成功后记录待删除旧文件，最后更新笔记并询问是否删除旧文件。
     */
    async reorderCurrentNoteImages() {
        const activeView = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
        if (!activeView) {
            new import_obsidian.Notice("没有打开的笔记。");
            return;
        }
        const file = activeView.file;
        if (!file) return;
        const content = await this.app.vault.read(file);
        const links = this.extractNotepixImageLinks(content);
        if (links.length === 0) {
            new import_obsidian.Notice("当前笔记中没有 NotePix 图片。");
            return;
        }

        // 解析每个链接，获取层级路径和当前序号
        const imageInfos = [];
        for (const link of links) {
            const url = this.extractUrlFromFullMatch(link.fullMatch);
            if (!url) continue;
            const parsed = this.parseImageUrl(url);
            if (!parsed) continue;
            const filename = parsed.path.split('/').pop();
            const match = filename.match(/^([\d\.]+)-(\d+)\.(\w+)$/);
            if (!match) {
                console.warn("无法解析文件名，跳过:", filename);
                continue;
            }
            imageInfos.push({
                fullMatch: link.fullMatch,
                url: url,
                parsed: parsed,
                hierarchy: match[1],
                oldNumber: parseInt(match[2], 10),
                ext: match[3],
                remotePath: link.remotePath
            });
        }
        if (imageInfos.length === 0) {
            new import_obsidian.Notice("未找到符合命名规范的图片。");
            return;
        }

        // 按层级路径分组
        const groups = new Map();
        for (const info of imageInfos) {
            if (!groups.has(info.hierarchy)) groups.set(info.hierarchy, []);
            groups.get(info.hierarchy).push(info);
        }

        // 确认操作
        const confirmModal = new ConfirmationModal(this.app, "重新整理图片序号",
            `将重新整理当前笔记中所有图片的序号，使每个标题层级下的图片序号从1开始连续。\n这会导致图片被重新上传，笔记链接将被更新。确定继续吗？`);
        const confirmed = await confirmModal.open();
        if (!confirmed) return;

        const token = await this.getToken();
        if (!token) {
            new import_obsidian.Notice("无法获取 GitHub Token。");
            return;
        }

        let totalSuccess = 0;
        let totalSkipped = 0;
        const notice = new import_obsidian.Notice("正在整理图片序号...", 0);
        const replacements = new Map();      // oldFullMatch -> newFullMatch
        const newMaxMap = new Map();         // hierarchy -> newMaxNumber
        const deletions = [];                // 待删除的旧文件远程路径

        for (const [hierarchy, infos] of groups.entries()) {
            infos.sort((a, b) => a.oldNumber - b.oldNumber);
            for (let i = 0; i < infos.length; i++) {
                const info = infos[i];
                const newNumber = i + 1;
                if (newNumber === info.oldNumber) {
                    // 序号不变，但更新最大序号记录
                    const curMax = newMaxMap.get(hierarchy) || 0;
                    if (newNumber > curMax) newMaxMap.set(hierarchy, newNumber);
                    continue;
                }
                notice.setMessage(`处理: ${hierarchy}-${info.oldNumber}.${info.ext} -> ${newNumber}`);
                // 1. 下载原图
                const imageData = await this.downloadImageFromGitHub(info.parsed, token);
                if (!imageData) {
                    console.error("下载失败:", info.url);
                    totalSkipped++;
                    continue;
                }
                // 2. 新文件名和远程路径
                const newFilename = `${hierarchy}-${newNumber}.${info.ext}`;
                const remoteDir = info.parsed.path.substring(0, info.parsed.path.lastIndexOf('/') + 1);
                const newRemotePath = remoteDir + newFilename;
                // 3. 检查是否已存在（避免覆盖）
                if (await this.fileExistsOnGitHub(newRemotePath, token)) {
                    console.warn("目标文件已存在，跳过:", newRemotePath);
                    totalSkipped++;
                    continue;
                }
                // 4. 上传新文件
                const uploadOk = await this.uploadImageData(imageData, newRemotePath, token);
                if (!uploadOk) {
                    console.error("上传失败:", newRemotePath);
                    totalSkipped++;
                    continue;
                }
                // 5. 记录待删除的旧文件
                deletions.push(info.remotePath);
                // 6. 生成新链接
                let newUrl;
                if (info.parsed.type === 'raw') {
                    newUrl = `https://raw.githubusercontent.com/${info.parsed.owner}/${info.parsed.repo}/${info.parsed.branch}/${newRemotePath}`;
                } else {
                    newUrl = `https://cdn.jsdelivr.net/gh/${info.parsed.owner}/${info.parsed.repo}@${info.parsed.branch}/${newRemotePath}`;
                }
                const newFullMatch = info.fullMatch.replace(info.url, newUrl);
                replacements.set(info.fullMatch, newFullMatch);
                totalSuccess++;
                // 更新该层级的最大序号
                const curMax = newMaxMap.get(hierarchy) || 0;
                if (newNumber > curMax) newMaxMap.set(hierarchy, newNumber);
            }
        }

        // 更新笔记内容
        if (replacements.size > 0) {
            let newContent = content;
            for (const [oldMatch, newMatch] of replacements.entries()) {
                newContent = newContent.replace(oldMatch, newMatch);
            }
            await this.app.vault.modify(file, newContent);
        }

        // 删除旧文件（可选，询问用户）
        if (deletions.length > 0) {
            const confirmDelete = await new ConfirmationModal(this.app, "删除旧图片",
                `新图片已上传并更新链接。是否删除 GitHub 上的 ${deletions.length} 个旧文件？`).open();
            if (confirmDelete) {
                let deleted = 0;
                for (const oldPath of deletions) {
                    const ok = await this.deleteFileFromGitHub(oldPath);
                    if (ok) deleted++;
                }
                new import_obsidian.Notice(`已删除 ${deleted} 个旧文件。`);
            } else {
                new import_obsidian.Notice(`旧文件未删除，您可以稍后手动清理。`);
            }
        }

        // 更新计数器中的最大序号
        if (newMaxMap.size > 0) {
            const notePath = file.path;
            let countersUpdated = 0;
            for (const [hierarchy, maxNum] of newMaxMap.entries()) {
                const key = `${notePath}|${hierarchy}`;
                if (!this.settings.imageCounters) this.settings.imageCounters = {};
                if (maxNum > (this.settings.imageCounters[key] || 0)) {
                    this.settings.imageCounters[key] = maxNum;
                    this.imageCounterMap.set(key, maxNum);
                    countersUpdated++;
                }
            }
            if (countersUpdated > 0) await this.saveSettings();
            new import_obsidian.Notice(`已更新 ${countersUpdated} 个层级的图片计数器。`);
        }

        notice.hide();
        new import_obsidian.Notice(`序号整理完成！成功处理 ${totalSuccess} 个文件，跳过 ${totalSkipped} 个。`);
    }

    // ---------- 提取笔记中的 NotePix 图片链接 ----------
    /**
     * 从笔记内容中提取所有 NotePix 图片链接（私有、公开raw、CDN）
     * @param {string} content
     * @returns {Array<{fullMatch:string, remotePath:string}>}
     */
    extractNotepixImageLinks(content) {
        const links = [];
        if (!content) return links;
        // 私有链接
        const privateRegex = /!\[[^\]]*\]\(obsidian:\/\/notepix\/v2\/[^\/]+\/[^\/]+\/[^\/]+\/([^)]+)\)/g;
        let match;
        while ((match = privateRegex.exec(content)) !== null) {
            links.push({ fullMatch: match[0], remotePath: match[1] });
        }
        // 公开 Raw 链接
        const publicRawRegex = /!\[[^\]]*\]\(https?:\/\/raw\.githubusercontent\.com\/[^\/]+\/[^\/]+\/[^\/]+\/([^)]+)\)/g;
        while ((match = publicRawRegex.exec(content)) !== null) {
            links.push({ fullMatch: match[0], remotePath: match[1] });
        }
        // CDN 链接
        const cdnRegex = /!\[[^\]]*\]\(https?:\/\/cdn\.jsdelivr\.net\/gh\/[^\/]+\/[^@]+@[^\/]+\/([^)]+)\)/g;
        while ((match = cdnRegex.exec(content)) !== null) {
            links.push({ fullMatch: match[0], remotePath: match[1] });
        }
        return links;
    }

    // ---------- 删除 GitHub 上的图片 ----------
    /**
     * 从 GitHub 删除指定路径的图片（需要先获取文件SHA）
     * @param {string} remotePath 远程路径（相对于仓库根目录）
     * @returns {Promise<boolean>}
     */
    async deleteFileFromGitHub(remotePath) {
        const token = await this.getToken();
        if (!token) {
            new import_obsidian.Notice("没有可用的 GitHub Token");
            return false;
        }
        const owner = this.settings.githubUser;
        const repo = this.settings.repoName;
        const branch = this.settings.branchName;
        const fullPath = remotePath;
        try {
            // 1. 获取文件信息（需要 SHA）
            const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${fullPath}?ref=${branch}`;
            const getResp = await fetch(getUrl, {
                headers: {
                    "Authorization": `token ${token}`,
                    "Accept": "application/vnd.github.v3+json"
                }
            });
            if (!getResp.ok) {
                if (getResp.status === 404) {
                    new import_obsidian.Notice(`文件未找到: ${fullPath}`);
                } else {
                    new import_obsidian.Notice(`获取文件信息失败: ${getResp.statusText}`);
                }
                return false;
            }
            // 确保响应是 JSON（防止返回图片二进制数据）
            const contentType = getResp.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                console.error("GitHub API 返回了非 JSON 数据", contentType);
                new import_obsidian.Notice("获取文件信息失败：响应格式错误");
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
                    "Content-Type": "application/json",
                    "Accept": "application/vnd.github.v3+json"
                },
                body: JSON.stringify({
                    message: `通过 NotePix 删除图片`,
                    sha: sha,
                    branch: branch
                })
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

        // ---------- 仓库隐私检测 ----------
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

    // ---------- 图片后处理器（渲染私有图片） ----------
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

    // ---------- 从当前笔记中移除图片链接 ----------
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

    // ---------- 生命周期 ----------
    async onload() {
        await this.loadSettings();
        // 确保计数器对象存在
        if (!this.settings.imageCounters) {
            this.settings.imageCounters = {};
            await this.saveSettings();
        }
        this.imageCounterMap = new Map(Object.entries(this.settings.imageCounters));

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

            // 检查是否已手动批准（粘贴/拖拽已处理）
            const alreadyConfirmed = this.consumeUserApprovedUpload(file.path);
            if (alreadyConfirmed) return;

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

            // 获取来源笔记路径
            let sourceNotePath = null;
            const placeholderEntry = this.peekPendingLinkPlaceholder(file.path) || this.peekPendingLinkPlaceholder(file.name);
            if (placeholderEntry && placeholderEntry.sourcePath) sourceNotePath = placeholderEntry.sourcePath;
            else {
                const activeView = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
                if (activeView && activeView.file) sourceNotePath = activeView.file.path;
            }

            await this.handleImageUpload(file, false, sourceNotePath);
        }));

        // 文件打开时修复畸形链接并检查仓库不匹配
        this.registerEvent(this.app.workspace.on("file-open", async (file) => {
            if (!file) return;
            await this.sanitizeFileOnOpen(file);
            this.checkRepoMismatchOnFileOpen(file);
        }));

        // 编辑器右键菜单（删除 + 转换）
        this.registerEvent(this.app.workspace.on("editor-menu", (menu, editor, view) => {
            const cursor = editor.getCursor();
            const line = editor.getLine(cursor.line);
            const links = this.extractNotepixImageLinks(line);
            if (links.length === 0) return;
            const target = links[0];
            const fullMatch = target.fullMatch;
            const urlMatch = fullMatch.match(/!\[[^\]]*\]\(([^)]+)\)/);
            if (!urlMatch) return;
            const oldUrl = urlMatch[1];
            const parsed = this.parseImageUrl(oldUrl);
            const canConvert = parsed && (parsed.type === 'raw' || parsed.type === 'jsdelivr');

            // 删除选项
            menu.addItem((item) => {
                item.setTitle("删除此图片（从 GitHub 和本地备份）").setIcon("trash").onClick(async () => {
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
            // 转换选项
            if (canConvert) {
                menu.addItem((item) => {
                    const targetType = parsed.type === 'raw' ? 'jsdelivr' : 'raw';
                    const targetName = targetType === 'raw' ? 'GitHub Raw' : 'jsDelivr CDN';
                    item.setTitle(`转换图片链接为 ${targetName}`).setIcon("switch").onClick(async () => {
                        const newUrl = this.buildImageUrl(parsed, targetType);
                        const newFullMatch = fullMatch.replace(oldUrl, newUrl);
                        if (newFullMatch === fullMatch) {
                            new import_obsidian.Notice("链接格式相同，无需转换。");
                            return;
                        }
                        const newLine = line.replace(fullMatch, newFullMatch);
                        editor.setLine(cursor.line, newLine);
                        new import_obsidian.Notice(`已转换图片链接为 ${targetName}`);
                    });
                });
            }
        }));

        // 全局图片右键菜单（阅读视图）
        const globalContextMenuHandler = async (event) => {
            const target = event.target;
            if (!(target instanceof HTMLImageElement)) return;
            let src = target.getAttribute('src');
            if (!src) return;
            try { src = decodeURIComponent(src); } catch(e) {}
            const remotePath = this.getRemotePathFromImageSrc(src);
            if (!remotePath) return;
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            const parsed = this.parseImageUrl(src);
            const canConvert = parsed && (parsed.type === 'raw' || parsed.type === 'jsdelivr');
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
                if (canConvert) {
                    menu.addItem((item) => {
                        const targetType = parsed.type === 'raw' ? 'jsdelivr' : 'raw';
                        const targetName = targetType === 'raw' ? 'GitHub Raw' : 'jsDelivr CDN';
                        item.setTitle(`转换图片链接为 ${targetName}`).setIcon("switch").onClick(async () => {
                            const newUrl = this.buildImageUrl(parsed, targetType);
                            const activeView = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
                            if (!activeView) {
                                new import_obsidian.Notice("没有打开的编辑器。");
                                return;
                            }
                            const editor = activeView.editor;
                            const content = editor.getValue();
                            const escapedSrc = src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                            const imgRegex = new RegExp(`!\\[[^\\]]*\\]\\(${escapedSrc}\\)`);
                            const match = content.match(imgRegex);
                            if (!match) {
                                new import_obsidian.Notice("未找到该图片的链接语法。");
                                return;
                            }
                            const fullMatch = match[0];
                            const newFullMatch = fullMatch.replace(src, newUrl);
                            if (newFullMatch === fullMatch) {
                                new import_obsidian.Notice("链接格式相同，无需转换。");
                                return;
                            }
                            const newContent = content.replace(fullMatch, newFullMatch);
                            editor.setValue(newContent);
                            new import_obsidian.Notice(`已转换图片链接为 ${targetName}`);
                        });
                    });
                }
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

        // 注册命令
        this.addCommand({
            id: "reorder-image-numbers",
            name: "重新整理当前笔记的图片序号",
            callback: () => this.reorderCurrentNoteImages()
        });
        this.addCommand({
            id: "convert-note-links-format",
            name: "转换当前笔记中的图片链接格式",
            callback: () => this.convertCurrentNoteLinks()
        });
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

/**
 * 密码输入弹窗（用于解密 Token）
 */
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
        new import_obsidian.Setting(contentEl)
            .setName("密码")
            .addText((text) => {
                text.inputEl.type = "password";
                text.onChange((value) => { this.password = value; });
                text.inputEl.addEventListener("keydown", (event) => {
                    if (event.key === "Enter") {
                        event.preventDefault();
                        this.submit();
                    }
                });
            });
        new import_obsidian.Setting(contentEl).addButton(btn =>
            btn.setButtonText("提交").setCta().onClick(() => this.submit())
        );
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

/**
 * 简单文件夹选择弹窗（按钮列表）
 */
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
            btn.onclick = () => {
                this.onPick?.(val);
                this.close();
            };
        };
        makeButton('/', '');
        (this.folderPaths || [])
            .filter(p => p.length > 0)
            .sort((a, b) => a.localeCompare(b))
            .forEach(p => makeButton(`/${p}`, p));
    }

    onClose() {
        this.contentEl.empty();
    }
}

/**
 * 模糊搜索文件夹选择弹窗（推荐）
 */
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

    getItemText(item) {
        return item === '' ? '/' : `/${item}`;
    }

    onChooseItem(item, evt) {
        this.onPick?.(item);
    }
}

/**
 * 确认弹窗（是/否）
 */
class ConfirmationModal extends import_obsidian.Modal {
    constructor(app, title, message) {
        super(app);
        this.title = title;
        this.message = message;
        this.confirmed = false;
    }

    open() {
        return new Promise((resolve) => {
            this.resolve = resolve;
            super.open();
        });
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h2", { text: this.title });
        contentEl.createEl("p", { text: this.message });
        new import_obsidian.Setting(contentEl)
            .addButton(btn => btn.setButtonText("是").setCta().onClick(() => {
                this.confirmed = true;
                this.close();
            }))
            .addButton(btn => btn.setButtonText("否").onClick(() => {
                this.confirmed = false;
                this.close();
            }));
    }

    onClose() {
        this.resolve(this.confirmed);
    }
}

/**
 * 仓库隐私不匹配提示弹窗（三个选项）
 */
class RepoMismatchModal extends import_obsidian.Modal {
    constructor(app, repoKey) {
        super(app);
        this.repoKey = repoKey;
        this.choice = null;
    }

    openAndWait() {
        return new Promise((resolve) => {
            this.resolve = resolve;
            super.open();
        });
    }

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
            btn.onclick = () => {
                this.choice = choice;
                this.close();
            };
        };

        makeBtn("使用自动模式", "自动检测仓库类型并适配。推荐。", "auto", true);
        makeBtn("切换到私有模式", "所有后续上传将使用私有图片格式。", "private", false);
        makeBtn("保持公开模式", "不更改。私有仓库的原始 URL 可能无法加载。", "public", false);
    }

    onClose() {
        if (this.resolve) this.resolve(this.choice);
    }
}

// ========== 设置选项卡（全中文，已添加 maxHeadingDepth 滑块） ==========
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

        // ----- GitHub 账户配置 -----
        new import_obsidian.Setting(containerEl)
            .setName("GitHub 用户名")
            .addText(text => text
                .setPlaceholder("your-name")
                .setValue(this.plugin.settings.githubUser)
                .onChange(async (value) => {
                    this.plugin.settings.githubUser = value;
                    this.plugin.clearRepoPrivacyCache();
                    this.plugin.clearRepoListCache();
                    await this.plugin.saveSettings();
                }));

        new import_obsidian.Setting(containerEl)
            .setName("仓库名")
            .addText(text => text
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

        new import_obsidian.Setting(containerEl)
            .setName("仓库可见性")
            .setDesc("自动：检测仓库类型并适配。公开/私有：强制使用选定模式。")
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

        new import_obsidian.Setting(containerEl)
            .setName("分支名")
            .addText(text => text
                .setPlaceholder("main")
                .setValue(this.plugin.settings.branchName)
                .onChange(async (value) => {
                    this.plugin.settings.branchName = value;
                    await this.plugin.saveSettings();
                }));

        // ----- 图片存储策略 -----
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
            new import_obsidian.Setting(containerEl)
                .setName("仓库内文件夹路径")
                .addText(text => text
                    .setPlaceholder("assets/")
                    .setValue(this.plugin.settings.folderPath)
                    .onChange(async (value) => {
                        this.plugin.settings.folderPath = value.length > 0 && !value.endsWith("/") ? value + "/" : value;
                        await this.plugin.saveSettings();
                    }));
        }

        // ----- 公开图片链接格式（新增 CDN 选项）-----
        new import_obsidian.Setting(containerEl)
            .setName("公开图片链接格式")
            .setDesc("仅当仓库为公开时生效。jsDelivr CDN 在国内访问更快，但有24小时缓存；GitHub Raw 无缓存但速度较慢。")
            .addDropdown(dropdown => dropdown
                .addOption('raw', 'GitHub Raw (原始链接)')
                .addOption('jsdelivr', 'jsDelivr CDN (加速推荐)')
                .setValue(this.plugin.settings.imageUrlType || 'raw')
                .onChange(async (value) => {
                    this.plugin.settings.imageUrlType = value;
                    await this.plugin.saveSettings();
                }));

        // ----- 批量转换按钮 -----
        new import_obsidian.Setting(containerEl)
            .setName("转换当前笔记链接")
            .setDesc("将当前打开笔记中的图片链接批量转换为上面选择的格式（jsDelivr ↔ GitHub Raw）。")
            .addButton(btn => btn
                .setButtonText("立即转换")
                .setCta()
                .onClick(async () => {
                    await this.plugin.convertCurrentNoteLinks();
                }));

        // ----- 标题层级最大深度（新增）-----
        new import_obsidian.Setting(containerEl)
            .setName("标题层级最大深度")
            .setDesc("生成文件名时最多使用几级标题序号（1-6）。超出部分将被截断，可避免文件名过长。")
            .addSlider(slider => slider
                .setLimits(1, 6, 1)
                .setValue(this.plugin.settings.maxHeadingDepth || 6)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.maxHeadingDepth = value;
                    await this.plugin.saveSettings();
                }));

        // ----- 自动上传监控图片开关 -----
        new import_obsidian.Setting(containerEl)
            .setName("自动上传监控图片")
            .setDesc("当图片被放入监控文件夹（上传临时文件夹/额外监控文件夹/移动端附件文件夹）时，自动上传到 GitHub。关闭后图片将仅保存在本地。")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoUpload)
                .onChange(async (value) => {
                    this.plugin.settings.autoUpload = value;
                    await this.plugin.saveSettings();
                }));

        // ----- 上传后删除本地文件 -----
        new import_obsidian.Setting(containerEl)
            .setName("上传后删除本地文件")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.deleteLocal)
                .onChange(async (value) => {
                    this.plugin.settings.deleteLocal = value;
                    await this.plugin.saveSettings();
                }));

        // ----- 粘贴图片上传行为 -----
        new import_obsidian.Setting(containerEl)
            .setName("粘贴图片上传行为")
            .setDesc("选择粘贴图片时是总是上传还是每次询问。")
            .addDropdown(dropdown => dropdown
                .addOption('always', '总是上传')
                .addOption('ask', '每次询问')
                .setValue(this.plugin.settings.uploadOnPaste || 'always')
                .onChange(async (value) => {
                    this.plugin.settings.uploadOnPaste = value;
                    await this.plugin.saveSettings();
                }));

        // ----- 本地图片文件夹（主）-----
        const localPrimarySetting = new import_obsidian.Setting(containerEl)
            .setName("本地图片文件夹")
            .setDesc("当您选择不上传时，图片将保存到此主文件夹。")
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

        // ----- 其他本地专用文件夹（动态列表）-----
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

        // ----- 上传图片的临时文件夹 -----
        const uploadSetting = new import_obsidian.Setting(containerEl)
            .setName("上传图片的临时文件夹")
            .setDesc("图片会先保存在此文件夹，然后自动上传。");
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

        // ----- 移动端附件集成（仅移动端显示）-----
        if (isMobile) {
            new import_obsidian.Setting(containerEl)
                .setName("移动端附件集成")
                .setDesc("在移动端，通过附件按钮添加的文件会自动保存到 'attachment' 文件夹并上传。")
                .addText(t => { t.setValue(this.plugin.settings.attachmentsFolderName || 'attachment'); t.setDisabled(true); });
        }

        // ----- 额外监控文件夹（动态列表）-----
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

        // ----- 加密设置 -----
        new import_obsidian.Setting(containerEl).setName("加密").setHeading();
        new import_obsidian.Setting(containerEl)
            .setName("启用加密")
            .setDesc("启用后，您的 GitHub Token 将被加密存储，并在首次使用时提示输入主密码。")
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
            new import_obsidian.Setting(containerEl)
                .setName("主密码")
                .setDesc("设置一个密码用于加密您的 Token。此密码不会被保存。")
                .addText(text => {
                    text.inputEl.type = "password";
                    text.setPlaceholder("输入密码以设置/更改 Token");
                    text.onChange(value => { this.masterPassword = value; });
                });
            new import_obsidian.Setting(containerEl)
                .setName("GitHub 个人访问令牌")
                .setDesc("在此输入您的 PAT，保存时将加密。")
                .addText(text => {
                    text.inputEl.type = "password";
                    text.setPlaceholder("ghp_... (粘贴新 Token)");
                    text.onChange(value => { this.githubToken = value; });
                });
            new import_obsidian.Setting(containerEl)
                .addButton(btn => btn.setButtonText("保存加密 Token").setCta().onClick(async () => {
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
            new import_obsidian.Setting(containerEl)
                .setName("GitHub 个人访问令牌（明文）")
                .setDesc("明文存储，无密码提示。")
                .addText(text => {
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

        // ----- 删除前确认 -----
        new import_obsidian.Setting(containerEl)
            .setName("删除前确认")
            .setDesc("删除 GitHub 上的图片前显示确认对话框。")
            .addToggle(toggle => toggle.setValue(this.plugin.settings.confirmBeforeDelete).onChange(async (value) => {
                this.plugin.settings.confirmBeforeDelete = value;
                await this.plugin.saveSettings();
            }));
    }
}

// ---------- 导出插件 ----------
module.exports = MyPlugin;