**上一级：** [[无]]

**下一级：** [[]]

**标签：** #

---

修改 NotePix 关于 GitHub 上传后本地文件和云端不同导致在笔记中删除图片，云端没有删除，可以通过 Assets/Image 和 Assets/Image-Backup 中的图片来筛选已被删除的图片，然后通过 git 同步 GitHub 的云端图片

找到 mian.js 中的

```js
new import_obsidian.Notice(`${newFileName} uploaded successfully!`);
```

在其下面添加

```js
// ========== 备份：复制一份到 Assets/Image-Copy，并重命名为云端文件名 ==========
const backupFolder = 'Assets/Image-Backup';
await this.ensureFolderExists(backupFolder);  // 确保文件夹存在（见下方辅助函数）
const backupPath = `${backupFolder}/${newFileName}`;
const backupExists = await this.app.vault.adapter.exists(backupPath);
if (!backupExists) {
    try {
        const fileData = await this.app.vault.readBinary(file);
        await this.app.vault.createBinary(backupPath, fileData);
        new import_obsidian.Notice(`已备份到 ${backupPath}`);
    } catch (e) {
        console.error('备份失败', e);
        new import_obsidian.Notice(`备份失败：${e.message}`);
    }
} else {
    new import_obsidian.Notice(`备份文件已存在，跳过：${backupPath}`);
}
```

这个笔记是防止更新后，代码被清理，到时候可以恢复。
![](https://raw.githubusercontent.com/1228chl/Learning-AI-Large-Models-Notes/master/Assets/Image/20260515T130941441Z.png)

