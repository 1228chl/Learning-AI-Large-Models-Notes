var import_obsidian = require("obsidian");
// NOTE: Do not use Node's 'path' on mobile; provide a small POSIX join using Obsidian's normalizePath
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

// Convert binary data to base64 without quadratic string concatenation costs.
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

function escapeRegex(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Platform detection
const isMobile = !!(import_obsidian.Platform && import_obsidian.Platform.isMobile);

// crypto.ts
var PBKDF2_ITERATIONS = 1e5;
var ALGORITHM = "AES-GCM";
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
        throw new Error("Invalid encrypted data format.");
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

// main.ts
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
    // Mobile integration defaults (safe no-ops on desktop)
    attachmentsFolderName: 'attachment',
    integrateAttachmentsOnMobile: true,
    // Repo mismatch prompt suppression
    lastPromptedAt: 0,
    lastPromptedRepo: ''
};
var MyPlugin = class extends import_obsidian.Plugin {
    constructor() {
        super(...arguments);
        // This will hold the decrypted token in memory for the session
        this.decryptedToken = null;
        this.isPromptingForPassword = false;
        this.mobileAttachmentFolder = '';
        this.userApprovedUploads = new Map();
        // From enhanced mobile version: track pending link replacements and recent placeholders
        this.pendingLinkReplacements = new Map();
        this.recentPlaceholdersByName = new Map();
        // Repo privacy detection cache: { value, timestamp, user, repo }
        this.repoPrivacyCache = null;
        this._fileOpenDebounceTimer = null;
        this._mismatchNoticeShown = false;
        this._lastRenderTokenNoticeAt = 0;
        this.failedImageFetches = new Map();
        this.pendingLegacyMigrations = new Map();
        this.pendingLegacyMigrationTimers = new Map();
        this.repoListCache = null;
        this.legacyResolvedRepoByKey = new Map();
        this.legacyUnresolvedUntil = new Map();
    }
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

        // Heuristic fallback for common rename pattern: singular <-> plural.
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
        if (this.legacyResolvedRepoByKey) {
            this.legacyResolvedRepoByKey.clear();
        }
        if (this.legacyUnresolvedUntil) {
            this.legacyUnresolvedUntil.clear();
        }
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
                    if (name && ownerLogin === userLower) {
                        collected.push(name);
                    }
                }
                if (arr.length < 100) break;
            }

            const unique = Array.from(new Set(collected));
            this.repoListCache = {
                user: configuredUser,
                repos: unique,
                timestamp: Date.now()
            };
            return unique;
        } catch (e) {
            console.error('NotePix: Failed to fetch repo list for configured user', e);
            return [];
        }
    }
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
        if (existing) {
            clearTimeout(existing);
        }

        const timer = setTimeout(() => {
            this.applyLegacyLinkMigrations(path);
        }, 800);
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
                    // File changed while migration was preparing; requeue to avoid clobbering newer edits.
                    let map = this.pendingLegacyMigrations.get(path);
                    if (!map) {
                        map = new Map();
                        this.pendingLegacyMigrations.set(path, map);
                    }
                    for (const [oldUrl, newUrl] of migrations.entries()) {
                        map.set(oldUrl, newUrl);
                    }
                    if (!this.pendingLegacyMigrationTimers.get(path)) {
                        const retryTimer = setTimeout(() => {
                            this.applyLegacyLinkMigrations(path);
                        }, 1200);
                        this.pendingLegacyMigrationTimers.set(path, retryTimer);
                    }
                    return;
                }
                await this.app.vault.modify(abs, updated);
                new import_obsidian.Notice(`NotePix: Migrated ${replacedCount} legacy image link(s) to v2 format.`, 3500);
            }
        } catch (e) {
            console.error('NotePix: Failed to migrate legacy links', e);
        }
    }
    markFileAsUserApproved(path) {
        const norm = this.normalizeVaultPath(path);
        if (!norm) return;
        const existing = this.userApprovedUploads.get(norm);
        if (existing) {
            clearTimeout(existing);
        }
        const timeoutId = setTimeout(() => {
            this.userApprovedUploads.delete(norm);
        }, 6e4);
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
    // From enhanced mobile version: primary local folder + helpers
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
        } catch (_) {
            // already exists
        }
    }
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
    // Mobile-only: track wikilinks inserted into the editor by filename
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
                        if (!fileName) continue;
                        this.recentPlaceholdersByName.set(fileName, {
                            placeholder: m[0],
                            ts: now
                        });
                    }
                    while ((m = mdImgRegex.exec(joined)) !== null) {
                        const pathPart = m[1] || '';
                        const fileName = decodeURIComponent(pathPart.split('/').pop() || '');
                        if (!fileName) continue;
                        this.recentPlaceholdersByName.set(fileName, {
                            placeholder: m[0],
                            ts: now
                        });
                    }
                    // Drop entries older than 60s
                    for (const [name, rec] of this.recentPlaceholdersByName.entries()) {
                        if (!rec || typeof rec.ts !== 'number') continue;
                        if (now - rec.ts > 60 * 1000) {
                            this.recentPlaceholdersByName.delete(name);
                        }
                    }
                } catch (e) {
                    console.error('NotePix: error tracking mobile placeholders', e);
                }
            };
            cm.on('change', handler);
            this.register(() => {
                try {
                    cm.off('change', handler);
                } catch (_) { }
            });
        };
        this.registerEvent(this.app.workspace.on('active-leaf-change', attachHandler));
        const activeLeaf = this.app.workspace.activeLeaf;
        if (activeLeaf) attachHandler(activeLeaf);
    }
    recordPendingLinkPlaceholder(path, placeholderText, sourcePath = "") {
        const norm = this.normalizeVaultPath(path);
        if (!norm || !placeholderText) return;
        const sourcePathNorm = this.normalizeVaultPath(sourcePath || "");
        const entry = this.pendingLinkReplacements.get(norm);
        if (entry?.timeoutId) {
            clearTimeout(entry.timeoutId);
        }
        const timeoutId = setTimeout(() => {
            this.pendingLinkReplacements.delete(norm);
        }, 5 * 60 * 1e3);
        this.pendingLinkReplacements.set(norm, { placeholderText, sourcePath: sourcePathNorm, timeoutId });
    }
    peekPendingLinkPlaceholder(pathOrKey) {
        const norm = this.normalizeVaultPath(pathOrKey);
        const key = norm || pathOrKey;
        if (!key) return null;
        const entry = this.pendingLinkReplacements.get(key);
        if (!entry) return null;
        return {
            key,
            placeholderText: entry.placeholderText || null,
            sourcePath: entry.sourcePath || ""
        };
    }
    consumePendingLinkPlaceholder(pathOrKey) {
        const norm = this.normalizeVaultPath(pathOrKey);
        const key = norm || pathOrKey;
        if (!key) return null;
        const entry = this.pendingLinkReplacements.get(key);
        if (!entry) return null;
        if (entry.timeoutId) {
            clearTimeout(entry.timeoutId);
        }
        this.pendingLinkReplacements.delete(key);
        return {
            key,
            placeholderText: entry.placeholderText || null,
            sourcePath: entry.sourcePath || ""
        };
    }
    async promptUploadConfirmation(file) {
        const modal = new ConfirmationModal(this.app, "Upload Image?", `Do you want to upload ${file.name} to GitHub?`);
        return await modal.open();
    }
    async onload() {
        await this.loadSettings();
        this.addSettingTab(new GitHubUploaderSettingTab(this.app, this));

        // Initialize an in-memory cache for private images
        this.imageCache = new Map();

        // Mobile-only: track recently inserted image placeholders in the editor
        this.registerMobileEditorPlaceholderTracking();

        // MOBILE-ONLY: Integrate Obsidian attachments with NotePix (baseline behavior)
        if (isMobile && (this.settings.integrateAttachmentsOnMobile !== false)) {
            try {
                const attachFolder = (this.settings.attachmentsFolderName || 'attachment')
                    .replace(/\\\\/g, "/")
                    .replace(/^\/+|\/+$/g, "");
                if (attachFolder) {
                    try { await this.app.vault.createFolder(attachFolder); } catch (_) { /* exists */ }
                    try { this.app.vault.setConfig('attachmentFolderPath', attachFolder); } catch (_) { /* ignore */ }
                    this.mobileAttachmentFolder = attachFolder;
                }
            } catch (_) { /* ignore mobile integration errors */ }
        }

        // Register the processor that will handle our custom image URLs
        this.registerMarkdownPostProcessor(this.postProcessImages.bind(this));

        // Paste handler (baseline behavior)
        this.registerEvent(
            this.app.workspace.on("editor-paste", this.handlePaste.bind(this))
        );

        // Vault create watcher (baseline + captureFilePlaceholder + handleDeclinedUpload)
        this.registerEvent(
            this.app.vault.on("create", async (file) => {
                if (!(file instanceof import_obsidian.TFile)) return;
                const imageExtensions = ["png", "jpg", "jpeg", "gif", "bmp", "svg"];
                if (!imageExtensions.includes(file.extension.toLowerCase())) return;

                const filePathNorm = file.path.replace(/\\\\/g, "/");
                const localOnly = (Array.isArray(this.settings.localOnlyList) && this.settings.localOnlyList.length > 0
                    ? this.settings.localOnlyList
                    : (this.settings.localOnlyFolders || this.settings.localImageFolder || 'notepix-local').split(','))
                    .map(s => (typeof s === 'string' ? s : s.path || ''))
                    .map(s => (s || '').trim())
                    .filter(Boolean)
                    .map(s => s.replace(/\\\\/g, "/").replace(/^\/+|\/+$/g, ""));
                // Always ignore any local-only folders (explicitly not for upload)
                if (localOnly.some(ign => filePathNorm === ign || filePathNorm.startsWith(ign + "/"))) return;

                // Only auto-upload if enabled and inside a watched folder
                if (!this.settings.autoUpload) return;

                const uploadNorm = (this.settings.uploadImageFolder || 'notepix-uploads')
                    .replace(/\\\\/g, "/")
                    .replace(/^\/+|\/+$/g, "");
                const extra = (Array.isArray(this.settings.extraWatchedList) && this.settings.extraWatchedList.length > 0
                    ? this.settings.extraWatchedList.map(e => e?.path || '')
                    : (this.settings.extraWatchedFolders || '').split(','))
                    .map(s => (s || '').trim())
                    .filter(Boolean)
                    .map(s => s.replace(/\\\\/g, "/").replace(/^\/+|\/+$/g, ""));

                const attachNorm = (this.mobileAttachmentFolder || '')
                    .replace(/\\\\/g, "/")
                    .replace(/^\/+|\/+$/g, "");

                const inUpload = uploadNorm && (filePathNorm === uploadNorm || filePathNorm.startsWith(uploadNorm + "/"));
                const inExtra = extra.some(f => filePathNorm === f || filePathNorm.startsWith(f + "/"));
                const inAttach = attachNorm && (filePathNorm === attachNorm || filePathNorm.startsWith(attachNorm + "/"));
                if (!(inUpload || inExtra || inAttach)) return;

                // Try to capture placeholder for later replacement (Android attachments)
                this.captureFilePlaceholder(file);

                const alreadyConfirmed = this.consumeUserApprovedUpload(file.path);
                const shouldPrompt = (this.settings.uploadOnPaste === 'ask') && !alreadyConfirmed;

                if (shouldPrompt) {
                    const confirmed = await this.promptUploadConfirmation(file);
                    if (confirmed) {
                        await this.handleImageUpload(file);
                    } else {
                        await this.handleDeclinedUpload(file);
                    }
                    return;
                }

                await this.handleImageUpload(file);
            })
        );

        // File-open maintenance: sanitize malformed links, then run mismatch check
        this.registerEvent(
            this.app.workspace.on("file-open", async (file) => {
                if (!file) return;
                await this.sanitizeFileOnOpen(file);
                this.checkRepoMismatchOnFileOpen(file);
            })
        );
    }

    onunload() {
        // Clear the decrypted token from memory
        this.decryptedToken = null;
        // Clear repo privacy cache and debounce timer
        this.repoPrivacyCache = null;
        if (this._fileOpenDebounceTimer) {
            clearTimeout(this._fileOpenDebounceTimer);
            this._fileOpenDebounceTimer = null;
        }

        // IMPORTANT: Revoke all created blob URLs to prevent memory leaks
        if (this.imageCache) {
            this.imageCache.forEach(url => URL.revokeObjectURL(url));
            this.imageCache.clear();
        }
        if (this.userApprovedUploads) {
            this.userApprovedUploads.forEach((timeoutId) => clearTimeout(timeoutId));
            this.userApprovedUploads.clear();
        }
        if (this.pendingLinkReplacements) {
            this.pendingLinkReplacements.forEach(entry => {
                if (entry?.timeoutId) clearTimeout(entry.timeoutId);
            });
            this.pendingLinkReplacements.clear();
        }
        if (this.failedImageFetches) {
            this.failedImageFetches.clear();
        }
        if (this.pendingLegacyMigrationTimers) {
            this.pendingLegacyMigrationTimers.forEach((timer) => clearTimeout(timer));
            this.pendingLegacyMigrationTimers.clear();
        }
        if (this.pendingLegacyMigrations) {
            this.pendingLegacyMigrations.clear();
        }
        this.repoListCache = null;
        if (this.legacyResolvedRepoByKey) {
            this.legacyResolvedRepoByKey.clear();
        }
        if (this.legacyUnresolvedUntil) {
            this.legacyUnresolvedUntil.clear();
        }
    }
    async handlePaste(evt) {
        const files = evt.clipboardData?.files;
        if (!files || files.length === 0) {
            return;
        }
        const imageFile = Array.from(files).find(file => file.type.startsWith("image/"));
        if (!imageFile) {
            return;
        }

        // If uploadOnPaste is 'always', just upload and finish.
        if (this.settings.uploadOnPaste === 'always') {
            evt.preventDefault();
            await this.uploadPastedImage(imageFile);
            return;
        }

        // If uploadOnPaste is 'ask', we begin the full logic.
        if (this.settings.uploadOnPaste === 'ask') {
            evt.preventDefault(); // Take control of the paste event.

            const modal = new ConfirmationModal(this.app, "Upload Image?", "Do you want to upload this image to GitHub?");
            const confirmed = await modal.open();

            if (confirmed) {
                // If confirmed, proceed with the upload.
                await this.uploadPastedImage(imageFile);
            } else {
                // If not confirmed, save the image locally.
                await this.saveImageLocally(imageFile);
            }
        }
        // If uploadOnPaste is set to something else, do nothing and let Obsidian handle it.
    }

    async uploadPastedImage(imageFile) {
        // Save the image into the configured upload folder, so watcher logic is consistent
        const arrayBuffer = await imageFile.arrayBuffer();
        const activeView = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
        if (!activeView) {
            new import_obsidian.Notice("Cannot process image: No active editor view.");
            return;
        }

        const uploadFolder = (this.settings.uploadImageFolder || 'notepix-uploads')
            .replace(/\\\\/g, "/")
            .replace(/^\/+|\/+$/g, "");
        try {
            if (uploadFolder) {
                await this.app.vault.createFolder(uploadFolder);
            }
        } catch { }

        const noteName = activeView.file ? activeView.file.basename : 'Untitled';
        const extension = imageFile.name.split('.').pop() || 'png';
        let i = 1;
        let newFilePath;
        do {
            newFilePath = uploadFolder
                ? `${uploadFolder}/${noteName}-${i}.${extension}`
                : `${noteName}-${i}.${extension}`;
            i++;
        } while (await this.app.vault.adapter.exists(newFilePath));

        // Pre-approve the path BEFORE createBinary so the vault 'create' watcher
        // sees the approval even if the event fires synchronously.
        this.markFileAsUserApproved(newFilePath);

        let newFile;
        try {
            newFile = await this.app.vault.createBinary(newFilePath, arrayBuffer);
        } catch (e) {
            // If create failed, remove pre-approval immediately to avoid stale approvals.
            this.consumeUserApprovedUpload(newFilePath);
            throw e;
        }

        // Also approve the actual path in case vault normalized it differently
        if (newFile.path !== newFilePath) {
            this.markFileAsUserApproved(newFile.path);
        }

        // Record a simple placeholder keyed by file path and file name
        const placeholderText = `![[${newFile.name}]]`;
        const sourcePath = activeView.file?.path || "";
        this.recordPendingLinkPlaceholder(newFile.path, placeholderText, sourcePath);
        this.recordPendingLinkPlaceholder(newFile.name, placeholderText, sourcePath);

        // Insert a temporary wikilink to the local file so the eventual upload can replace it with the final URL
        activeView.editor.replaceSelection(placeholderText);

        // If autoUpload is disabled, upload directly; else watcher will trigger and replace the link
        if (!this.settings.autoUpload) {
            await this.handleImageUpload(newFile);
        }
    }

    async saveImageLocally(imageFile) {
        const arrayBuffer = await imageFile.arrayBuffer();
        const activeView = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
        if (!activeView) {
            new import_obsidian.Notice("Cannot save image: No active editor view.");
            return;
        }

        // Determine destination local-only folder (first of list or legacy field)
        const localOnlyFirst = (Array.isArray(this.settings.localOnlyList) && this.settings.localOnlyList.length > 0)
            ? (this.settings.localOnlyList[0]?.path || this.settings.localOnlyList[0] || '')
            : (this.settings.localImageFolder || 'notepix-local');
        // Normalize to a clean, vault-relative POSIX path
        const folderPath = (localOnlyFirst || 'notepix-local')
            .replace(/\\\\/g, "/")
            .replace(/^\/+|\/+$/g, "");
        // Ensure the folder exists
        try {
            await this.app.vault.createFolder(folderPath);
        } catch (e) {
            // Folder already exists, which is fine
        }

        const noteName = activeView.file ? activeView.file.basename : 'Untitled';
        const extension = imageFile.name.split('.').pop() || 'png';

        let i = 1;
        let newFilePath;
        do {
            newFilePath = `${folderPath}/${noteName}-${i}.${extension}`;
            i++;
        } while (await this.app.vault.adapter.exists(newFilePath));


        // Create the file in the vault at the determined path.
        const newFile = await this.app.vault.createBinary(newFilePath, arrayBuffer);

        // Insert the link to the newly created file.
        activeView.editor.replaceSelection(`![[${newFile.path}]]`);
    }  // New method to get the token, prompting for password if needed (encrypted mode).
    async getDecryptedToken() {
        if (this.decryptedToken) {
            return this.decryptedToken;
        }
        if (this.isPromptingForPassword) {
            return null;
        }
        if (this.settings.useEncryption && this.settings.encryptedToken) {
            this.isPromptingForPassword = true;
            try {
                const password = await new PasswordPrompt(this.app).open();
                const token = await decrypt(this.settings.encryptedToken, password);
                this.decryptedToken = token;
                return token;
            } catch (e) {
                const msg = String(e?.message || "");
                if (msg === "Password not provided") {
                    // User closed modal without entering password — no notice needed
                } else if (e?.name === 'OperationError' || /decryption|operation/i.test(msg)) {
                    new import_obsidian.Notice("Decryption failed. Incorrect password.", 5e3);
                } else {
                    new import_obsidian.Notice(`Decryption error: ${msg || 'Unknown error'}`, 5e3);
                }
                return null;
            } finally {
                this.isPromptingForPassword = false;
            }
        }
        return null;
    }

    // Unified token getter: returns a usable GitHub token based on settings/state.
    // - If a decrypted token is already cached in memory, returns it.
    // - If useEncryption is true, prompts (once) to decrypt encryptedToken when first needed.
    // - If useEncryption is false, returns the plainToken from settings (no prompts).
    async getToken() {
        // In-memory cache takes precedence
        if (this.decryptedToken) return this.decryptedToken;

        // Encrypted mode
        if (this.settings.useEncryption) {
            if (!this.settings.encryptedToken) {
                new import_obsidian.Notice("No encrypted token found. Please save an encrypted token in NotePix settings.");
                return null;
            }
            const token = await this.getDecryptedToken();
            return token;
        }

        // Plain mode
        if (this.settings.plainToken && this.settings.plainToken.trim().length > 0) {
            return this.settings.plainToken.trim();
        }
        new import_obsidian.Notice("No token found. Please provide a GitHub token in NotePix settings.");
        return null;
    }

    // --- Repo Privacy Detection (cached, 10-min TTL) ---
    async getRepoPrivacy() {
        const user = (this.settings.githubUser || '').trim();
        const repo = (this.settings.repoName || '').trim();
        if (!user || !repo) return "unknown";

        // Return cached value if still valid (10 min TTL, same user+repo)
        if (this.repoPrivacyCache &&
            this.repoPrivacyCache.user === user &&
            this.repoPrivacyCache.repo === repo &&
            (Date.now() - this.repoPrivacyCache.timestamp) < 10 * 60 * 1000) {
            return this.repoPrivacyCache.value;
        }

        // Need a token — don't trigger password prompt, only use what's available
        let token;
        if (this.decryptedToken) {
            token = this.decryptedToken;
        } else if (!this.settings.useEncryption && this.settings.plainToken) {
            token = this.settings.plainToken.trim();
        }
        if (!token) return "unknown";

        try {
            const response = await fetch(
                `https://api.github.com/repos/${encodeURIComponent(user)}/${encodeURIComponent(repo)}`,
                { headers: { "Authorization": `token ${token}`, "Accept": "application/vnd.github.v3+json" } }
            );
            if (!response.ok) return "unknown";
            const json = await response.json();
            const value = json.private ? "private" : "public";
            this.repoPrivacyCache = { value, timestamp: Date.now(), user, repo };
            return value;
        } catch (e) {
            console.error("NotePix: Failed to detect repo privacy:", e);
            return "unknown";
        }
    }

    clearRepoPrivacyCache() {
        this.repoPrivacyCache = null;
    }

    // Check whether a note contains raw GitHub image URLs owned by the configured user.
    // This intentionally allows any repo under that user while still restricting to
    // image-like paths to avoid unrelated raw GitHub links.
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

    // Repair malformed nested NotePix markdown URLs that can appear after partial replacements.
    // Example:
    // ![198]([obsidian://notepix/assets](obsidian://notepix/v2/<owner>/<repo>/<branch>/assets)/file.png)
    // -> ![198](obsidian://notepix/v2/<owner>/<repo>/<branch>/assets/file.png)
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
                new import_obsidian.Notice("NotePix: Repaired malformed image link format in this note.", 4000);
            }
        } catch (e) {
            console.error("NotePix: sanitizeFileOnOpen error:", e);
        }
    }

    // Debounced mismatch check triggered on file-open (public mode only)
    checkRepoMismatchOnFileOpen(file) {
        if (this._fileOpenDebounceTimer) {
            clearTimeout(this._fileOpenDebounceTimer);
        }
        this._fileOpenDebounceTimer = setTimeout(async () => {
            try {
                if (!file || !file.path || !file.path.endsWith('.md')) return;
                // Mismatch prompting is only meaningful in forced public mode.
                if (this.settings.repoVisibility !== 'public') return;

                const content = await this.app.vault.read(file);
                if (!this.containsConfiguredRepoRawImages(content)) return;

                const privacy = await this.getRepoPrivacy();
                if (privacy !== 'private') return;

                // Prompt suppression: skip if same repo prompted within 24 hours
                const user = (this.settings.githubUser || '').trim();
                const repo = (this.settings.repoName || '').trim();
                const repoKey = `${user}/${repo}`;
                const lastAt = this.settings.lastPromptedAt || 0;
                const lastRepo = this.settings.lastPromptedRepo || '';
                const twentyFourHours = 24 * 60 * 60 * 1000;

                if (lastRepo === repoKey && (Date.now() - lastAt) < twentyFourHours) return;

                // Show 3-button mismatch modal
                const modal = new RepoMismatchModal(this.app, repoKey);
                const choice = await modal.openAndWait();

                // Persist prompt timestamp regardless of choice
                this.settings.lastPromptedAt = Date.now();
                this.settings.lastPromptedRepo = repoKey;

                if (choice === 'auto') {
                    this.settings.repoVisibility = 'auto';
                    new import_obsidian.Notice("NotePix: Auto mode enabled. Images will load via API for private repos.");
                } else if (choice === 'private') {
                    this.settings.repoVisibility = 'private';
                    new import_obsidian.Notice("NotePix: Switched to Private mode. Future uploads use private format.");
                } else if (choice === 'public') {
                    this.settings.repoVisibility = 'public';
                    new import_obsidian.Notice("NotePix: Keeping Public mode. Raw URLs may not load for private repos.");
                }
                // If choice is null (modal closed without picking), suppress for 24h anyway
                await this.saveSettings();
            } catch (e) {
                console.error("NotePix: Mismatch check error:", e);
            }
        }, 500);
    }

    async maybePromptRepoMismatch(repoKey) {
        const lastAt = this.settings.lastPromptedAt || 0;
        const lastRepo = this.settings.lastPromptedRepo || '';
        const twentyFourHours = 24 * 60 * 60 * 1000;
        if (lastRepo === repoKey && (Date.now() - lastAt) < twentyFourHours) {
            return null;
        }

        const modal = new RepoMismatchModal(this.app, repoKey);
        const choice = await modal.openAndWait();

        this.settings.lastPromptedAt = Date.now();
        this.settings.lastPromptedRepo = repoKey;

        if (choice === 'auto') {
            this.settings.repoVisibility = 'auto';
            new import_obsidian.Notice("NotePix: Auto mode enabled. Images will load via API for private repos.");
        } else if (choice === 'private') {
            this.settings.repoVisibility = 'private';
            new import_obsidian.Notice("NotePix: Switched to Private mode. Future uploads use private format.");
        } else if (choice === 'public') {
            this.settings.repoVisibility = 'public';
            new import_obsidian.Notice("NotePix: Keeping Public mode. Raw URLs may not load for private repos.");
        }
        await this.saveSettings();
        return choice;
    }

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
            const filePath = joinRepoPath(this.settings.folderPath, newFileName);
            const apiUrl = `https://api.github.com/repos/${this.settings.githubUser}/${this.settings.repoName}/contents/${filePath}`;
            const requestBody = {
                message: `feat: Add image '${newFileName}' from Obsidian`,
                content: base64Data,
                branch: this.settings.branchName
            };
            const response = await fetch(apiUrl, {
                method: "PUT",
                headers: {
                    "Authorization": `token ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(requestBody)
            });
            uploadNotice.hide();
            if (!response.ok) {
                throw new Error(`GitHub API Error: ${(await response.json()).message}`);
            }

            let finalUrl;
            // Determine URL format based on repo visibility mode
            if (this.settings.repoVisibility === 'private') {
                // Private mode: self-describing format with owner/repo/branch embedded
                const encOwner = encodeURIComponent(this.settings.githubUser);
                const encRepo = encodeURIComponent(this.settings.repoName);
                const encBranch = encodeURIComponent(this.settings.branchName);
                const encPath = filePath.split('/').map(encodeURIComponent).join('/');
                finalUrl = `obsidian://notepix/v2/${encOwner}/${encRepo}/${encBranch}/${encPath}`;
                new import_obsidian.Notice("Private image link created.");
            } else if (this.settings.repoVisibility === 'auto') {
                // Auto mode: detect repo privacy and decide
                const detectedPrivacy = await this.getRepoPrivacy();
                if (detectedPrivacy === 'private') {
                    const encOwner = encodeURIComponent(this.settings.githubUser);
                    const encRepo = encodeURIComponent(this.settings.repoName);
                    const encBranch = encodeURIComponent(this.settings.branchName);
                    const encPath = filePath.split('/').map(encodeURIComponent).join('/');
                    finalUrl = `obsidian://notepix/v2/${encOwner}/${encRepo}/${encBranch}/${encPath}`;
                    new import_obsidian.Notice("Private repo detected. Private image link created.");
                } else {
                    // Public or unknown — use raw URL (safe fallback)
                    finalUrl = `https://raw.githubusercontent.com/${this.settings.githubUser}/${this.settings.repoName}/${this.settings.branchName}/${filePath}`;
                    if (detectedPrivacy === 'unknown') {
                        new import_obsidian.Notice("Could not detect repo privacy. Using public URL as fallback.");
                    }
                }
            } else {
                // Public mode: standard raw GitHub URL, but if repo is actually private,
                // prompt user with the same 3-button mismatch modal.
                const detectedPrivacy = await this.getRepoPrivacy();
                if (detectedPrivacy === 'private') {
                    const repoKey = `${(this.settings.githubUser || '').trim()}/${(this.settings.repoName || '').trim()}`;
                    await this.maybePromptRepoMismatch(repoKey);
                }
                // Re-check: user may have switched visibility in the mismatch prompt
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
                    new import_obsidian.Notice(`Could not find the placeholder link for ${file.name}. Local reference left untouched.`);
                }
            }

            new import_obsidian.Notice(`${newFileName} uploaded successfully!`);
            if (this.settings.deleteLocal && !isPaste && replacedLink) {
                await this.app.vault.delete(file);
                new import_obsidian.Notice(`Local file ${file.name} deleted.`);
            }
        } catch (error) {
            uploadNotice.hide();
            new import_obsidian.Notice(`Upload failed: ${error.message}`);
            console.error("GitHub Uploader Error:", error);
        }
    }

    async postProcessImages(element, context) {
        this.isHandlingAction = true;
        try {
            const images = Array.from(element.querySelectorAll("img"));
            if (images.length === 0) return;

            const decodePathSafely = (value) => {
                if (!value || typeof value !== 'string') return value;
                try {
                    return decodeURIComponent(value);
                } catch (_) {
                    return value;
                }
            };
            const decodeSegmentSafely = (value) => {
                if (typeof value !== 'string') return '';
                try {
                    return decodeURIComponent(value);
                } catch (_) {
                    return value;
                }
            };

            // Recover malformed links like:
            // ![198]([obsidian://notepix/assets](obsidian://notepix/v2/.../assets)/file.png)
            // which can appear in DOM as an encoded app:// URL.
            const recoverMalformedNotepixSrc = (src) => {
                if (!src) return null;
                let candidate = src;
                if (candidate.startsWith("app://")) {
                    const idx = candidate.indexOf("%5Bobsidian://notepix/");
                    if (idx >= 0) {
                        try {
                            candidate = decodeURIComponent(candidate.substring(idx));
                        } catch (_) {
                            // Keep original candidate if decoding fails.
                        }
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

            // Match raw links from any repository owned by the configured user.
            // Example: https://raw.githubusercontent.com/<user>/<repo>/<branch>/<path>
            const rawSameUserRegex = cfgUser
                ? new RegExp(`^https:\\/\\/raw\\.githubusercontent\\.com\\/${escapeRegex(cfgUser)}\\/([^\\/]+)\\/(.+)$`, 'i')
                : null;

            // Categorize images into processable items
            const toProcess = [];
            const rawCandidates = [];
            for (const img of images) {
                let src = img.getAttribute("src");
                if (!src) continue;

                const recovered = recoverMalformedNotepixSrc(src);
                if (recovered) {
                    src = recovered;
                    img.setAttribute("src", recovered);
                }

                if (src.startsWith("obsidian://notepix/")) {
                    const afterPrefix = src.substring("obsidian://notepix/".length);
                    if (afterPrefix.startsWith("v2/")) {
                        // New self-describing format: v2/{owner}/{repo}/{branch}/{path}
                        const parts = afterPrefix.substring(3).split('/');
                        if (parts.length >= 4) {
                            toProcess.push({
                                img,
                                owner: decodeSegmentSafely(parts[0]),
                                repo: decodeSegmentSafely(parts[1]),
                                branch: decodeSegmentSafely(parts[2]),
                                path: parts.slice(3).map(decodeSegmentSafely).join('/'),
                                type: 'notepix-v2'
                            });
                        }
                    } else {
                        // Legacy format: use current settings
                        toProcess.push({
                            img,
                            owner: cfgUser,
                            repo: cfgRepo,
                            fallbackRepos: this.getLegacyRepoCandidates(cfgRepo),
                            branch: this.settings.branchName || 'main',
                            legacySrc: src,
                            // Legacy links can carry encoded segments (e.g. %20); decode once
                            // so API path encoding below does not double-encode.
                            path: decodePathSafely(afterPrefix),
                            type: 'notepix-legacy'
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
                            // Branch names can contain slashes; prefer configured branch when it matches.
                            if (configuredBranch && repoRest.startsWith(`${configuredBranch}/`)) {
                                branch = configuredBranch;
                                rawPath = repoRest.substring(configuredBranch.length + 1);
                            }
                            rawCandidates.push({
                                img,
                                owner: cfgUser,
                                repo: parsedRepo,
                                branch,
                                // Raw URLs can include percent-encoded characters.
                                path: decodePathSafely(rawPath),
                                type: 'raw-fallback'
                            });
                        }
                    }
                }
            }

            // Raw fallback should apply to same-user raw links regardless of repo name.
            // This preserves rendering of older links from sibling repos while uploads still
            // target the currently configured repository.
            if (rawCandidates.length > 0) {
                toProcess.push(...rawCandidates);
            }

            if (toProcess.length === 0) return;

            // Token handling: avoid password prompt in hover popovers
            const hoverPopover = (this.app && this.app.renderContext)
                ? this.app.renderContext.hoverPopover : null;
            const isPopoverByAPI = !!hoverPopover;
            const activeLeaf = this.app.workspace.activeLeaf;
            const contextEl = context?.containerEl;
            const leafEl = activeLeaf?.containerEl;
            const isInActiveLeaf = !!(leafEl && contextEl && leafEl.contains(contextEl));
            // If we can't determine containment (missing DOM refs), assume active leaf
            // to avoid silently skipping image rendering in the main preview.
            const isHover = isPopoverByAPI || (contextEl ? !isInActiveLeaf : false);

            let token;
            if (isHover) {
                if (this.settings.useEncryption) {
                    token = this.decryptedToken;
                } else {
                    token = (this.settings.plainToken || '').trim() || null;
                }
                if (!token) return;
            } else {
                // In active preview (non-hover), allow one password prompt when encrypted token exists.
                // This restores expected behavior after app restart while still avoiding spam.
                if (this.settings.useEncryption) {
                    if (this.decryptedToken) {
                        token = this.decryptedToken;
                    } else if (this.settings.encryptedToken) {
                        token = await this.getToken();
                    } else {
                        token = null;
                    }
                } else {
                    token = (this.settings.plainToken || '').trim() || null;
                }
                if (!token) {
                    const now = Date.now();
                    if (!this._lastRenderTokenNoticeAt || (now - this._lastRenderTokenNoticeAt) > 30000) {
                        this._lastRenderTokenNoticeAt = now;
                        new import_obsidian.Notice("Token not unlocked/available. Private images render in preview after token is available.", 5000);
                    }
                    return;
                }
            }

            let configuredUserRepos = [];
            const hasLegacyLinks = toProcess.some(item => item?.type === 'notepix-legacy');
            if (hasLegacyLinks && cfgUser && token) {
                configuredUserRepos = await this.getConfiguredUserRepoList(token);
            }

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
                    if (Date.now() < unresolvedUntil) {
                        img.src = errorSvg;
                        return;
                    }
                    const resolvedRepo = this.legacyResolvedRepoByKey.get(legacyKey);
                    const ordered = [];
                    if (resolvedRepo) ordered.push(resolvedRepo);
                    ordered.push(...staticCandidates, ...dynamicCandidates);
                    repoCandidates = Array.from(new Set(ordered.filter(Boolean)));
                    if (repoCandidates.length === 0 && repo) repoCandidates = [repo];
                    // Hard cap to avoid excessive candidate scanning on very large accounts.
                    if (repoCandidates.length > 25) {
                        repoCandidates = repoCandidates.slice(0, 25);
                    }
                }

                const ref = encodeURIComponent(branch);
                const norm = path.replace(/\\\\/g, "/");

                const tryRepo = async (repoCandidate) => {
                    const cacheKey = `${owner}/${repoCandidate}/${branch}/${path}`.replace(/\\\\/g, "/");
                    const now = Date.now();
                    const failTs = this.failedImageFetches.get(cacheKey) || 0;
                    if (failTs && (now - failTs) < 30 * 1000) {
                        return null;
                    }

                    if (this.imageCache.has(cacheKey)) {
                        img.src = this.imageCache.get(cacheKey);
                        return repoCandidate;
                    }

                    const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoCandidate)}/contents/${encSeg(norm)}?ref=${ref}`;

                    try {
                        let response = await fetch(apiUrl, {
                            method: "GET",
                            headers: { "Authorization": `token ${token}`, "Accept": "application/vnd.github.v3.raw" }
                        });

                        let imageBlob;
                        if (response.ok) {
                            imageBlob = await response.blob();
                        } else {
                            // Fallback to JSON content API
                            response = await fetch(apiUrl, {
                                method: "GET",
                                headers: { "Authorization": `token ${token}`, "Accept": "application/vnd.github.v3+json" }
                            });
                            if (!response.ok) {
                                this.failedImageFetches.set(cacheKey, Date.now());
                                return null;
                            }
                            const meta = await response.json();
                            if (!meta || !meta.content) {
                                this.failedImageFetches.set(cacheKey, Date.now());
                                return null;
                            }
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
                    } catch (_) {
                        this.failedImageFetches.set(cacheKey, Date.now());
                        return null;
                    }
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
                    console.error(`NotePix: Failed to fetch image ${owner}/${repo}/${branch}/${path} from candidate repos.`);
                    return;
                }

                if (type === 'notepix-legacy') {
                    const legacyKey = `${owner}|${branch}|${path}`;
                    this.legacyResolvedRepoByKey.set(legacyKey, resolvedRepo);
                    this.legacyUnresolvedUntil.delete(legacyKey);
                }

                // Migrate legacy links only after a successful, concrete resolution.
                // No guessing: we only rewrite when an exact source path resolves from a known repo.
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

                // Subtle notice for raw-fallback images (once per session)
                if (type === 'raw-fallback' && !showedRawNotice && !this._mismatchNoticeShown) {
                    this._mismatchNoticeShown = true;
                    showedRawNotice = true;
                    new import_obsidian.Notice("Repository is private. Old public images loaded via API in preview.", 5000);
                }
            };

            // Process all categorized images in parallel
            await Promise.allSettled(toProcess.map(item => fetchAndSet(item)));

            // Observe DOM for late-added notepix images
            const observer = new MutationObserver((mutations) => {
                for (const m of mutations) {
                    for (const node of Array.from(m.addedNodes)) {
                        if (node.nodeType !== 1) continue;
                        const el = node;
                        const imgs = (el.matches && el.matches('img') ? [el]
                            : Array.from(el.querySelectorAll ? el.querySelectorAll('img') : []));
                        for (const addedImg of imgs) {
                            let src = addedImg.getAttribute('src');
                            if (!src) continue;
                            const recovered = recoverMalformedNotepixSrc(src);
                            if (recovered) {
                                src = recovered;
                                addedImg.setAttribute('src', recovered);
                            }
                            if (!src.startsWith('obsidian://notepix/')) continue;
                            const afterPrefix = src.substring("obsidian://notepix/".length);
                            if (afterPrefix.startsWith("v2/")) {
                                const parts = afterPrefix.substring(3).split('/');
                                if (parts.length >= 4) {
                                    fetchAndSet({
                                        img: addedImg,
                                        owner: decodeSegmentSafely(parts[0]),
                                        repo: decodeSegmentSafely(parts[1]),
                                        branch: decodeSegmentSafely(parts[2]),
                                        path: parts.slice(3).map(decodeSegmentSafely).join('/'),
                                        type: 'notepix-v2'
                                    });
                                }
                            } else {
                                fetchAndSet({
                                    img: addedImg,
                                    owner: cfgUser,
                                    repo: cfgRepo,
                                    branch: this.settings.branchName || 'main',
                                    path: decodePathSafely(afterPrefix),
                                    type: 'notepix-legacy'
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

    // NEW: clean, filename-friendly replacement that also uses pending placeholders
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

                    // Normalize malformed content that can appear from partial replacements:
                    // ![198]([obsidian://notepix/assets](obsidian://notepix/v2/.../assets)/file.png)
                    // -> ![198](obsidian://notepix/v2/.../assets/file.png)
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
                        let match;
                        let lastMatch = null;
                        while ((match = globalRegex.exec(source)) !== null) {
                            lastMatch = { index: match.index, text: match[0] };
                            if (match[0].length === 0) {
                                globalRegex.lastIndex += 1;
                            }
                        }
                        if (!lastMatch) {
                            return { replaced: false, value: source };
                        }
                        const before = source.slice(0, lastMatch.index);
                        const after = source.slice(lastMatch.index + lastMatch.text.length);
                        return { replaced: true, value: `${before}${replacement}${after}` };
                    };

                    const patterns = [];
                    // Wikilink by filename (Android attachments: ![[Screenshot_....jpg]])
                    patterns.push(new RegExp(`!\\[\\[(?:[^\\]|]*?/)*${escapedFileName}(?:\\|[^\\]]*)?\\]\\]`));
                    // Wikilink by normalized path if available
                    if (escapedPath) {
                        patterns.push(new RegExp(`!\\[\\[(?:[^\\]|]*?/)*${escapedPath}(?:\\|[^\\]]*)?\\]\\]`));
                    }
                    // Markdown image links by filename
                    patterns.push(new RegExp(`!\\[[^\\]]*\\]\\([^\\)]*${escapedFileName}[^\\)]*\\)`));
                    patterns.push(new RegExp(`!\\[[^\\]]*\\]\\([^\\)]*${encodeURIComponent(fileName)}[^\\)]*\\)`));
                    if (escapedPath) {
                        patterns.push(new RegExp(`!\\[[^\\]]*\\]\\([^\\)]*${escapedPath}[^\\)]*\\)`));
                        patterns.push(new RegExp(`!\\[[^\\]]*\\]\\([^\\)]*${encodeURIComponent(normalizedPath)}[^\\)]*\\)`));
                    }

                    let replaced = false;
                    let newContent = normalizedContent;

                    // First preference: replace the exact pending placeholder captured for this file.
                    // This is the most deterministic option when filenames repeat in the same note.
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
                        if (!regex) continue;
                        const result = replaceLastRegexMatch(newContent, regex, replacementText);
                        replaced = result.replaced;
                        newContent = result.value;
                    }

                    // If normalization changed content, persist it even when no direct replacement was needed.
                    if (!replaced && newContent !== content) {
                        replaced = true;
                    }

                    return { replaced, newContent };
                };

                const activeView = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
                const activeFilePath = this.normalizeVaultPath(activeView?.file?.path || "");
                const canUseActiveEditor = !!(activeView && activeView.editor && (!sourcePathHint || sourcePathHint === activeFilePath));

                if (canUseActiveEditor) {
                    const editor = activeView.editor;
                    const doc = (typeof editor.getDoc === 'function') ? editor.getDoc() : null;
                    let content = '';
                    if (doc?.getValue) {
                        try { content = doc.getValue(); } catch (_) { content = ''; }
                    }
                    if (!content && typeof editor.getValue === 'function') {
                        try { content = editor.getValue(); } catch (_) { content = ''; }
                    }

                    const result = buildReplacedContent(content);
                    if (result.replaced) {
                        const cursor = (typeof editor.getCursor === 'function') ? editor.getCursor() : null;
                        let wrote = false;
                        if (doc?.setValue) {
                            try { doc.setValue(result.newContent); wrote = true; } catch (_) { wrote = false; }
                        }
                        if (!wrote && typeof editor.setValue === 'function') {
                            try { editor.setValue(result.newContent); wrote = true; } catch (_) { wrote = false; }
                        }
                        if (cursor && typeof editor.setCursor === 'function') {
                            try { editor.setCursor(cursor); } catch (_) { }
                        }
                        if (wrote) {
                            if (pendingByPath) this.consumePendingLinkPlaceholder(pendingByPath.key);
                            if (pendingByName) this.consumePendingLinkPlaceholder(pendingByName.key);
                            return resolve(true);
                        }
                    }
                }

                // Fallback: apply replacement directly to the source note file if known.
                if (sourcePathHint) {
                    try {
                        const target = this.app.vault.getAbstractFileByPath(sourcePathHint);
                        if (target instanceof import_obsidian.TFile && target.path.endsWith('.md')) {
                            const startMtime = target.stat?.mtime || 0;
                            const content = await this.app.vault.read(target);
                            const result = buildReplacedContent(content);
                            if (!result.replaced) {
                                return resolve(false);
                            }
                            const latest = this.app.vault.getAbstractFileByPath(sourcePathHint);
                            const latestMtime = (latest instanceof import_obsidian.TFile) ? (latest.stat?.mtime || 0) : 0;
                            if (startMtime && latestMtime && latestMtime !== startMtime) {
                                return resolve(false);
                            }
                            await this.app.vault.modify(target, result.newContent);
                            if (pendingByPath) this.consumePendingLinkPlaceholder(pendingByPath.key);
                            if (pendingByName) this.consumePendingLinkPlaceholder(pendingByName.key);
                            return resolve(true);
                        }
                    } catch (_) {
                        // Fall through to false.
                    }
                }

                console.warn(`NotePix: Could not find link for "${fileName}" to replace.`);
                resolve(false);
            }, 100);
        });
    }

    // Capture placeholder in current note content matching this file
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
                try {
                    const doc = editor.getDoc();
                    content = doc?.getValue?.() || "";
                } catch (_) {
                    content = "";
                }
            }
            if (!content && typeof editor.getValue === 'function') {
                try {
                    content = editor.getValue();
                } catch (_) {
                    content = "";
                }
            }
            if (!content) return;

            const escapedPath = normalizedPath.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
            const regex = new RegExp(`!\\[\\[[^\\]]*${escapedPath}[^\\]]*\\]\\]`);
            const match = content.match(regex);
            const sourcePath = activeView.file?.path || "";
            if (match && match[0]) {
                this.recordPendingLinkPlaceholder(file.path, match[0], sourcePath);
                return;
            }
            // Mobile-oriented fallback by filename
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
            new import_obsidian.Notice("Attachment kept locally.");
            return;
        }
        try {
            const relocation = await this.moveFileToLocalOnly(file);
            if (!relocation) {
                new import_obsidian.Notice(`${file.name} kept locally in attachments.`);
                return;
            }
            const replaced = await this.replaceLinkInEditor(relocation.originalName, relocation.newPath, relocation.originalPath, { replacementType: 'wiki' });
            if (replaced) {
                new import_obsidian.Notice(`${relocation.originalName} moved to local-only folder.`);
            } else {
                new import_obsidian.Notice(`${relocation.originalName} moved to local-only folder. Please update the link manually.`);
            }
        } catch (e) {
            console.error('NotePix: Failed to move declined attachment', e);
            new import_obsidian.Notice(`Could not move ${file.name} to local folder.`);
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }
    async saveSettings() {
        await this.saveData(this.settings);
    }
};

// PasswordPrompt from clean baseline
var PasswordPrompt = class extends import_obsidian.Modal {
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
        contentEl.createEl("h2", { text: "Enter master password" });
        new import_obsidian.Setting(contentEl).setName("Password").addText((text) => {
            text.inputEl.type = "password";
            text.onChange((value) => {
                this.password = value;
            });
            text.inputEl.addEventListener("keydown", (event) => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    this.submit();
                }
            });
        });
        new import_obsidian.Setting(contentEl).addButton(
            (btn) => btn.setButtonText("Submit").setCta().onClick(() => this.submit())
        );
    }
    submit() {
        this.submitted = true;
        this.resolve(this.password);
        this.close();
    }
    onClose() {
        if (!this.submitted) {
            this.reject(new Error("Password not provided"));
        }
    }
};

// Simple modal to pick a folder from the vault (baseline)
var SimpleFolderPickerModal = class extends import_obsidian.Modal {
    constructor(app, folderPaths, onPick) {
        super(app);
        this.folderPaths = folderPaths;
        this.onPick = onPick;
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h3', { text: 'Choose a folder' });
        const list = contentEl.createEl('div', { cls: 'notepix-folder-picker' });
        const makeButton = (label, val) => {
            const btn = list.createEl('button', { text: label, cls: 'mod-cta' });
            btn.style.display = 'block';
            btn.style.marginBottom = '6px';
            btn.onclick = () => {
                this.onPick?.(val);
                this.close();
            };
        };
        // Root folder entry
        makeButton('/', '');
        // Other folders
        (this.folderPaths || [])
            .filter(p => p.length > 0)
            .sort((a, b) => a.localeCompare(b))
            .forEach(p => makeButton(`/${p}`, p));
    }
    onClose() {
        this.contentEl.empty();
    }
};

// Searchable vault folder picker using FuzzySuggestModal (baseline)
var VaultFolderSuggestModal = class extends import_obsidian.FuzzySuggestModal {
    constructor(app, folderPaths, onPick) {
        super(app);
        this.folderPaths = (folderPaths || []).map(p => (p || '').replace(/\\\\/g, "/").replace(/^\/+|\/+$/g, ""));
        this.onPick = onPick;
    }
    getItems() {
        // Include root as empty string to show '/'
        const uniq = new Set(['', ...this.folderPaths]);
        return Array.from(uniq.values());
    }
    getItemText(item) {
        return item === '' ? '/' : `/${item}`;
    }
    onChooseItem(item, evt) {
        this.onPick?.(item);
    }
};

// Settings tab copied from baseline
var GitHubUploaderSettingTab = class extends import_obsidian.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.masterPassword = "";
        this.githubToken = "";
        this.plugin = plugin;
        // UI state: reveal extra folders input only when requested or already set
        this.showExtraFolders = (this.plugin.settings.extraWatchedFolders || "").trim().length > 0;
        // Track last valid upload folder for inline validation
        this.lastValidUploadFolder = this.plugin.settings.uploadImageFolder || 'notepix-uploads';
    }
    display() {
        const { containerEl } = this;
        containerEl.empty();
        new import_obsidian.Setting(containerEl).setName("GitHub username").addText((text) => text.setPlaceholder("your-name").setValue(this.plugin.settings.githubUser).onChange(async (value) => {
            this.plugin.settings.githubUser = value;
            this.plugin.clearRepoPrivacyCache();
            this.plugin.clearRepoListCache();
            await this.plugin.saveSettings();
        }));
        new import_obsidian.Setting(containerEl).setName("Repository name").addText((text) => text.setPlaceholder("obsidian-assets").setValue(this.plugin.settings.repoName).onChange(async (value) => {
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
            .setName("Repository visibility")
            .setDesc("Auto: detects repo type and adapts. Public/Private: forces the chosen mode.")
            .addDropdown(dropdown => dropdown
                .addOption('auto', 'Auto (Recommended)')
                .addOption('public', 'Public')
                .addOption('private', 'Private')
                .setValue(this.plugin.settings.repoVisibility || 'auto')
                .onChange(async (value) => {
                    this.plugin.settings.repoVisibility = value;
                    this.plugin.clearRepoPrivacyCache();
                    this.plugin.clearRepoListCache();
                    await this.plugin.saveSettings();
                }));
        new import_obsidian.Setting(containerEl).setName("Branch name").addText((text) => text.setPlaceholder("main").setValue(this.plugin.settings.branchName).onChange(async (value) => {
            this.plugin.settings.branchName = value;
            await this.plugin.saveSettings();
        }));
        new import_obsidian.Setting(containerEl).setName("Folder path in repository").addText((text) => text.setPlaceholder("assets/").setValue(this.plugin.settings.folderPath).onChange(async (value) => {
            this.plugin.settings.folderPath = value.length > 0 && !value.endsWith("/") ? value + "/" : value;
            await this.plugin.saveSettings();
        }));
        new import_obsidian.Setting(containerEl).setName("Delete local file after upload").addToggle((toggle) => toggle.setValue(this.plugin.settings.deleteLocal).onChange(async (value) => {
            this.plugin.settings.deleteLocal = value;
            await this.plugin.saveSettings();
        }));

        new import_obsidian.Setting(containerEl)
            .setName("Pasted image upload behavior")
            .setDesc("Choose whether to upload pasted images automatically or to be asked each time.")
            .addDropdown(dropdown => dropdown
                .addOption('always', 'Always Upload')
                .addOption('ask', 'Ask Before Uploading')
                .setValue(this.plugin.settings.uploadOnPaste || 'always')
                .onChange(async (value) => {
                    this.plugin.settings.uploadOnPaste = value;
                    await this.plugin.saveSettings();
                }));

        const localPrimarySetting = new import_obsidian.Setting(containerEl)
            .setName("Local image folder")
            .setDesc("The primary folder where images will be saved when you choose not to upload them.")
            .addText(text => text
                .setPlaceholder("notepix-local")
                .setValue(this.plugin.settings.localImageFolder)
                .onChange(async (value) => {
                    this.plugin.settings.localImageFolder = value;
                    await this.plugin.saveSettings();
                }));
        localPrimarySetting.addExtraButton((btn) => {
            btn.setIcon?.("folder-open");
            if (!btn.setIcon) btn.setButtonText("Browse");
            btn.setTooltip?.("Choose folder from vault");
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
        // Plus button to reveal local-only rows, matching the Upload section UX
        localPrimarySetting.addExtraButton((btn) => {
            btn.setIcon?.("plus");
            if (!btn.setIcon) btn.setButtonText("+");
            btn.setTooltip?.("Add more local-only folders");
            btn.onClick(() => {
                const section = containerEl.querySelector('.notepix-localonly-folders');
                if (!section) renderLocalOnlyRows();
            });
        });

        // Anchor where local-only section will render on demand (hidden until plus is clicked)
        const localOnlyAnchor = containerEl.createDiv({ cls: 'notepix-localonly-anchor' });

        const renderLocalOnlyRows = () => {
            const existing = localOnlyAnchor.querySelector('.notepix-localonly-folders');
            if (existing) existing.remove();
            const section = localOnlyAnchor.createDiv({ cls: 'notepix-localonly-folders' });
            section.createEl('h4', { text: 'Additional local-only folders' });

            // Seed model from structured or CSV fallback
            const fromCSV = (v) => (v || '').split(',').map(s => s.trim()).filter(Boolean).map(p => ({ path: p, label: '' }));
            let locals = Array.isArray(this.plugin.settings.localOnlyList) && this.plugin.settings.localOnlyList.length > 0
                ? this.plugin.settings.localOnlyList.map(e => ({ path: e.path || '', label: e.label || '' }))
                : fromCSV(this.plugin.settings.localOnlyFolders);

            const allFolders = this.plugin.getVaultFolderPaths();
            const isValidPath = (p) => allFolders.includes(p) || p === '';

            const save = async () => {
                // Enforce mutual exclusivity for non-empty paths only; keep empty rows so +Add works
                const uploadNorm = (this.plugin.settings.uploadImageFolder || 'notepix-uploads').replace(/\\\\/g, "/").replace(/^\/+|\/+$/g, "");
                const extra = (Array.isArray(this.plugin.settings.extraWatchedList) && this.plugin.settings.extraWatchedList.length > 0
                    ? this.plugin.settings.extraWatchedList.map(e => e?.path || '')
                    : (this.plugin.settings.extraWatchedFolders || '').split(','))
                    .map(s => (s || '').trim()).filter(Boolean)
                    .map(s => s.replace(/\\\\/g, "/").replace(/^\/+|\/+$/g, ""));
                locals = locals.filter(f => {
                    const raw = f.path || '';
                    if (!raw.trim()) return true; // keep empty rows
                    const p = raw.replace(/\\\\/g, "/").replace(/^\/+|\/+$/g, "");
                    return p !== uploadNorm && !extra.includes(p);
                });
                // Persist structured and CSV fallbacks
                this.plugin.settings.localOnlyList = locals;
                this.plugin.settings.localOnlyFolders = locals.map(f => f.path).filter(Boolean).join(', ');
                await this.plugin.saveSettings();
            };

            locals.forEach((item, idx) => {
                const row = new import_obsidian.Setting(section).setName(`Local-only ${idx + 1}`);
                // Path input with validation
                row.addText(t => {
                    t.setPlaceholder('path/to/folder')
                        .setValue(item.path)
                        .onChange(async (val) => {
                            item.path = val.trim();
                            await save();
                            const valid = isValidPath(item.path);
                            t.inputEl.style.borderColor = valid || item.path.length === 0 ? '' : 'var(--color-red)';
                        });
                });
                // Browse
                row.addExtraButton(btn => {
                    btn.setIcon?.('folder-open');
                    if (!btn.setIcon) btn.setButtonText('Browse');
                    btn.setTooltip?.('Choose folder from vault');
                    btn.onClick(() => {
                        const modal = new VaultFolderSuggestModal(this.app, allFolders, async (picked) => {
                            item.path = picked || '';
                            await save();
                            renderLocalOnlyRows();
                        });
                        modal.open();
                    });
                });
                // Label
                row.addText(t => {
                    t.setPlaceholder('Optional label (e.g., Local screenshots)')
                        .setValue(item.label || '')
                        .onChange(async (val) => {
                            item.label = val;
                            await save();
                        });
                });
                // Reorder up/down
                row.addExtraButton(btn => {
                    btn.setIcon?.('arrow-up');
                    if (!btn.setIcon) btn.setButtonText('Up');
                    btn.setTooltip?.('Move up');
                    btn.onClick(async () => {
                        if (idx > 0) {
                            const tmp = locals[idx - 1];
                            locals[idx - 1] = locals[idx];
                            locals[idx] = tmp;
                            await save();
                            renderLocalOnlyRows();
                        }
                    });
                });
                row.addExtraButton(btn => {
                    btn.setIcon?.('arrow-down');
                    if (!btn.setIcon) btn.setButtonText('Down');
                    btn.setTooltip?.('Move down');
                    btn.onClick(async () => {
                        if (idx < locals.length - 1) {
                            const tmp = locals[idx + 1];
                            locals[idx + 1] = locals[idx];
                            locals[idx] = tmp;
                            await save();
                            renderLocalOnlyRows();
                        }
                    });
                });
                // Remove
                row.addExtraButton(btn => {
                    btn.setIcon?.('trash');
                    if (!btn.setIcon) btn.setButtonText('Remove');
                    btn.setTooltip?.('Remove this folder');
                    btn.onClick(async () => {
                        locals.splice(idx, 1);
                        await save();
                        renderLocalOnlyRows();
                    });
                });
            });

            // Add row button
            const addRow = new import_obsidian.Setting(section).setName('Add local-only folder');
            addRow.addButton(b => b.setButtonText('+ Add').setCta().onClick(async () => {
                locals.push({ path: '', label: '' });
                await save();
                renderLocalOnlyRows();
            }));
        };

        // Auto-render local-only rows if settings already contain values
        if ((this.plugin.settings.localOnlyFolders || '').trim().length > 0 || (this.plugin.settings.localOnlyList || []).length > 0) {
            renderLocalOnlyRows();
        }

        const uploadSetting = new import_obsidian.Setting(containerEl)
            .setName("Upload image folder")
            .setDesc("Default folder where NotePix saves images that will be uploaded.");
        uploadSetting.addText(text => {
            text
                .setPlaceholder("notepix-uploads")
                .setValue(this.plugin.settings.uploadImageFolder || 'notepix-uploads')
                .onChange(async (value) => {
                    const val = (value || '').replace(/\\\\/g, "/").replace(/^\/+|\/+$/g, "").trim();
                    // Build local-only list (structured or CSV or legacy)
                    const localOnly = (Array.isArray(this.plugin.settings.localOnlyList) && this.plugin.settings.localOnlyList.length > 0
                        ? this.plugin.settings.localOnlyList.map(e => e?.path || '')
                        : (this.plugin.settings.localOnlyFolders || this.plugin.settings.localImageFolder || 'notepix-local').split(','))
                        .map(s => (s || '').trim())
                        .filter(Boolean)
                        .map(s => s.replace(/\\\\/g, "/").replace(/^\/+|\/+$/g, ""));

                    const conflicts = val.length > 0 && localOnly.includes(val);
                    if (conflicts) {
                        // Visual warning and revert to last valid value
                        text.inputEl.style.borderColor = 'var(--color-red)';
                        new import_obsidian.Notice("Upload folder cannot be one of the local-only folders.");
                        setTimeout(() => {
                            text.setValue(this.lastValidUploadFolder || 'notepix-uploads');
                            text.inputEl.style.borderColor = '';
                        }, 0);
                        return;
                    }

                    text.inputEl.style.borderColor = '';
                    this.plugin.settings.uploadImageFolder = val;
                    this.lastValidUploadFolder = val;
                    await this.plugin.saveSettings();
                });
        });
        uploadSetting.addExtraButton((btn) => {
            btn.setIcon?.("folder-open");
            if (!btn.setIcon) btn.setButtonText("Browse");
            btn.setTooltip?.("Choose folder from vault");
            btn.onClick(() => {
                const folders = this.plugin.getVaultFolderPaths();
                const modal = new VaultFolderSuggestModal(this.app, folders, (picked) => {
                    const val = (picked || '').replace(/\\\\/g, "/").replace(/^\/+|\/+$/g, "");
                    // Conflict check against local-only
                    const localOnly = (Array.isArray(this.plugin.settings.localOnlyList) && this.plugin.settings.localOnlyList.length > 0
                        ? this.plugin.settings.localOnlyList.map(e => e?.path || '')
                        : (this.plugin.settings.localOnlyFolders || this.plugin.settings.localImageFolder || 'notepix-local').split(','))
                        .map(s => (s || '').trim())
                        .filter(Boolean)
                        .map(s => s.replace(/\\\\/g, "/").replace(/^\/+|\/+$/g, ""));
                    if (val && localOnly.includes(val)) {
                        new import_obsidian.Notice("Upload folder cannot be one of the local-only folders.");
                        return;
                    }
                    this.plugin.settings.uploadImageFolder = val;
                    this.lastValidUploadFolder = val;
                    this.plugin.saveSettings();
                    this.display();
                });
                modal.open();
            });
        });

        // MOBILE INFO: show that attachments folder is auto-watched on mobile
        if (isMobile) {
            new import_obsidian.Setting(containerEl)
                .setName("Mobile attachments integration")
                .setDesc("On mobile, files added via the attachment button are saved to and uploaded from the 'attachment' folder.")
                .addText(t => {
                    t.setValue(this.plugin.settings.attachmentsFolderName || 'attachment');
                    t.setDisabled(true);
                });
        }

        // Create anchor right below the upload section so extra folders render under the plus button
        const extraAnchor = containerEl.createDiv({ cls: 'notepix-extra-anchor' });
        uploadSetting.addExtraButton((btn) => {
            btn.setIcon?.("plus");
            btn.setTooltip?.("Add more folders to watch");
            // Fallback text if setIcon is not available
            if (!btn.setIcon) btn.setButtonText("+");
            btn.onClick(() => {
                this.showExtraFolders = true;
                this.display();
            });
        });

        if (this.showExtraFolders || (this.plugin.settings.extraWatchedFolders || "").trim().length > 0 || (this.plugin.settings.extraWatchedList || []).length > 0) {
            extraAnchor.createEl('h4', { text: 'Additional watched folders' });

            // Seed folders model from structured list or CSV fallback
            const fromCSV = (v) => (v || '').split(',').map(s => s.trim()).filter(Boolean).map(p => ({ path: p, label: '' }));
            let folders = Array.isArray(this.plugin.settings.extraWatchedList) && this.plugin.settings.extraWatchedList.length > 0
                ? this.plugin.settings.extraWatchedList.map(e => ({ path: e.path || '', label: e.label || '' }))
                : fromCSV(this.plugin.settings.extraWatchedFolders);

            const allFolders = this.plugin.getVaultFolderPaths();
            const isValidPath = (p) => allFolders.includes(p) || p === '';

            const save = async () => {
                // Filter out exact duplicates (keep first occurrences) and persist
                const seen = new Set();
                const deduped = [];
                for (const f of folders) {
                    const p = (f.path || '').replace(/\\\\/g, "/").replace(/^\/+|\/+$/g, "");
                    if (!p) continue; // keep empty rows out of persisted list
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
                    const row = new import_obsidian.Setting(section).setName(`Folder ${idx + 1}`);

                    // Path input with validation
                    row.addText(t => {
                        t.setPlaceholder('path/to/folder')
                            .setValue(item.path)
                            .onChange(async (val) => {
                                item.path = val.trim();
                                // Build conflict sets
                                const uploadNorm = (this.plugin.settings.uploadImageFolder || 'notepix-uploads').replace(/\\\\/g, "/").replace(/^\/+|\/+$/g, "");
                                const localOnly = (Array.isArray(this.plugin.settings.localOnlyList) && this.plugin.settings.localOnlyList.length > 0
                                    ? this.plugin.settings.localOnlyList.map(e => e?.path || '')
                                    : (this.plugin.settings.localOnlyFolders || this.plugin.settings.localImageFolder || 'notepix-local').split(','))
                                    .map(s => (s || '').trim())
                                    .filter(Boolean)
                                    .map(s => s.replace(/\\\\/g, "/").replace(/^\/+|\/+$/g, ""));
                                const valNorm = (item.path || '').replace(/\\\\/g, "/").replace(/^\/+|\/+$/g, "");
                                const duplicate = folders.some((f, j) => j !== idx && (f.path || '').replace(/\\\\/g, "/").replace(/^\/+|\/+$/g, "") === valNorm);
                                const conflicts = valNorm && (valNorm === uploadNorm || localOnly.includes(valNorm) || duplicate);
                                await save();
                                // visual validation: red if invalid path or conflicts
                                const valid = isValidPath(item.path) && !conflicts;
                                t.inputEl.style.borderColor = valid || item.path.length === 0 ? '' : 'var(--color-red)';
                                if (!valid && item.path.length > 0) {
                                    new import_obsidian.Notice(duplicate ? 'This folder is already listed.' : 'Folder conflicts with upload or local-only folders.');
                                }
                            });
                    });

                    // Browse button
                    row.addExtraButton(btn => {
                        btn.setIcon?.('folder-open');
                        if (!btn.setIcon) btn.setButtonText('Browse');
                        btn.setTooltip?.('Choose folder from vault');
                        btn.onClick(() => {
                            const modal = new VaultFolderSuggestModal(this.app, allFolders, async (picked) => {
                                const uploadNorm = (this.plugin.settings.uploadImageFolder || 'notepix-uploads').replace(/\\\\/g, "/").replace(/^\/+|\/+$/g, "");
                                const localOnly = (Array.isArray(this.plugin.settings.localOnlyList) && this.plugin.settings.localOnlyList.length > 0
                                    ? this.plugin.settings.localOnlyList.map(e => e?.path || '')
                                    : (this.plugin.settings.localOnlyFolders || this.plugin.settings.localImageFolder || 'notepix-local').split(','))
                                    .map(s => (s || '').trim())
                                    .filter(Boolean)
                                    .map(s => s.replace(/\\\\/g, "/").replace(/^\/+|\/+$/g, ""));
                                const pickedNorm = (picked || '').replace(/\\\\/g, "/").replace(/^\/+|\/+$/g, "");
                                const duplicate = folders.some((f, j) => j !== idx && (f.path || '').replace(/\\\\/g, "/").replace(/^\/+|\/+$/g, "") === pickedNorm);
                                if (pickedNorm && (pickedNorm === uploadNorm || localOnly.includes(pickedNorm))) {
                                    new import_obsidian.Notice('Cannot watch this folder: conflicts with upload/local-only.');
                                    return;
                                }
                                if (duplicate) {
                                    new import_obsidian.Notice('This folder is already listed.');
                                    return;
                                }
                                item.path = pickedNorm;
                                await save();
                                renderRows();
                            });
                            modal.open();
                        });
                    });

                    // Label input
                    row.addText(t => {
                        t.setPlaceholder('Optional label (e.g., Screenshots)')
                            .setValue(item.label || '')
                            .onChange(async (val) => {
                                item.label = val;
                                await save();
                            });
                    });

                    // Reorder up/down
                    row.addExtraButton(btn => {
                        btn.setIcon?.('arrow-up');
                        if (!btn.setIcon) btn.setButtonText('Up');
                        btn.setTooltip?.('Move up');
                        btn.onClick(async () => {
                            if (idx > 0) {
                                const tmp = folders[idx - 1];
                                folders[idx - 1] = folders[idx];
                                folders[idx] = tmp;
                                await save();
                                renderRows();
                            }
                        });
                    });
                    row.addExtraButton(btn => {
                        btn.setIcon?.('arrow-down');
                        if (!btn.setIcon) btn.setButtonText('Down');
                        btn.setTooltip?.('Move down');
                        btn.onClick(async () => {
                            if (idx < folders.length - 1) {
                                const tmp = folders[idx + 1];
                                folders[idx + 1] = folders[idx];
                                folders[idx] = tmp;
                                await save();
                                renderRows();
                            }
                        });
                    });

                    // Remove row
                    row.addExtraButton(btn => {
                        btn.setIcon?.('trash');
                        if (!btn.setIcon) btn.setButtonText('Remove');
                        btn.setTooltip?.('Remove this folder');
                        btn.onClick(async () => {
                            folders.splice(idx, 1);
                            await save();
                            renderRows();
                        });
                    });
                });

                // Add row button
                const addRow = new import_obsidian.Setting(section).setName('Add folder');
                addRow.addButton(b => b.setButtonText('+ Add').setCta().onClick(async () => {
                    folders.push({ path: '', label: '' });
                    await save();
                    renderRows();
                }));
            };

            renderRows();
        }

        new import_obsidian.Setting(containerEl).setName("Encryption").setHeading();
        new import_obsidian.Setting(containerEl)
            .setName("Enable encryption")
            .setDesc("When enabled, your PAT is encrypted and you'll be prompted once per session when it's first needed.")
            .addToggle((toggle) => toggle
                .setValue(this.plugin.settings.useEncryption)
                .onChange(async (value) => {
                    if (this.plugin.settings.useEncryption && !value) {
                        const ok = await new ConfirmationModal(this.app, "Disable encryption?", "Your PAT will be stored in plain text locally. Are you sure?").open();
                        if (!ok) {
                            // Revert UI state
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
            // Encrypted mode UI: master password field + token field + save encrypted token button
            new import_obsidian.Setting(containerEl).setName("Master password").setDesc("Set a password to encrypt your token. This is NOT saved.").addText((text) => {
                text.inputEl.type = "password";
                text.setPlaceholder("Enter password to set/change token");
                text.onChange((value) => {
                    this.masterPassword = value;
                });
            });
            new import_obsidian.Setting(containerEl).setName("GitHub personal access token").setDesc("Enter your PAT here. It will be encrypted on save.").addText((text) => {
                text.inputEl.type = "password";
                text.setPlaceholder("ghp_... (paste new token here)");
                text.onChange((value) => {
                    this.githubToken = value;
                });
            });
            new import_obsidian.Setting(containerEl).addButton((button) => button.setButtonText("Save encrypted token").setCta().onClick(async () => {
                if (!this.masterPassword || !this.githubToken) {
                    new import_obsidian.Notice("Please provide both a Master Password and a Token.");
                    return;
                }
                try {
                    const encrypted = await encrypt(this.githubToken, this.masterPassword);
                    this.plugin.settings.encryptedToken = encrypted;
                    // Clear plain token for security when switching to encrypted mode
                    this.plugin.settings.plainToken = "";
                    this.plugin.clearRepoPrivacyCache();
                    this.plugin.clearRepoListCache();
                    await this.plugin.saveSettings();
                    new import_obsidian.Notice("Token has been encrypted and saved!");
                } catch (e) {
                    new import_obsidian.Notice(`Encryption failed: ${e.message}`);
                }
            }));
        } else {
            // Plain mode UI: simple plain PAT field, no password prompts
            new import_obsidian.Setting(containerEl)
                .setName("GitHub personal access token (plain)")
                .setDesc("Stored in plain text. No password prompts in this mode.")
                .addText((text) => {
                    text.inputEl.type = "password";
                    text.setPlaceholder("ghp_... (paste token)");
                    text.setValue(this.plugin.settings.plainToken || "");
                    text.onChange(async (value) => {
                        this.plugin.settings.plainToken = value;
                        this.plugin.clearRepoPrivacyCache();
                        this.plugin.clearRepoListCache();
                        await this.plugin.saveSettings();
                    });
                });
        }
    }
};

var ConfirmationModal = class extends import_obsidian.Modal {
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
            .addButton(btn => btn
                .setButtonText("Yes")
                .setCta()
                .onClick(() => {
                    this.confirmed = true;
                    this.close();
                }))
            .addButton(btn => btn
                .setButtonText("No")
                .onClick(() => {
                    this.confirmed = false;
                    this.close();
                }));
    }

    onClose() {
        this.resolve(this.confirmed);
    }
}

var RepoMismatchModal = class extends import_obsidian.Modal {
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
        contentEl.createEl("h2", { text: "Repository Privacy Mismatch Detected" });
        contentEl.createEl("p", {
            text: `Your repository "${this.repoKey}" appears to be private, but some images in this note use public raw URLs that may not load correctly.`
        });
        contentEl.createEl("p", { text: "How would you like NotePix to handle image URLs going forward?" });

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

        makeBtn("Use Auto Mode", "Detects repo type and adapts automatically. Recommended.", "auto", true);
        makeBtn("Switch to Private", "All future uploads will use the private image format.", "private", false);
        makeBtn("Keep Public", "No change. Raw URLs may not load for private repos.", "public", false);
    }

    onClose() {
        if (this.resolve) this.resolve(this.choice);
    }
}

module.exports = MyPlugin;


/* nosourcemap */