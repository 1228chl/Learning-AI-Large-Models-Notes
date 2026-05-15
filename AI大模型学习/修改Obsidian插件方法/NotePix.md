**上一级：** [[无]]

**下一级：** [[]]

**标签：** #

---

修改 NotePix 关于 GitHub 上传后本地文件和云端不同导致在笔记中删除图片，云端没有删除，可以通过 Assets/Image 和 Assets/NotePix-Upload 中的图片来筛选已被删除的图片，然后通过 git 同步 GitHub 的云端图片

找到 mian.js 中的

```js
new import_obsidian.Notice(`${newFileName} uploaded successfully!`);
```

在其上面添加

```js
// 上传成功后，将本地暂存文件重命名为与云端一致的时间戳文件名

            if (!this.settings.deleteLocal) {

                // 确保文件仍然存在且未被删除

                const fileExists = await this.app.vault.adapter.exists(file.path);

                if (fileExists) {

                    // 获取文件所在文件夹路径

                    const parentPath = file.parent ? file.parent.path : '';

                    const newLocalPath = parentPath ? `${parentPath}/${newFileName}` : newFileName;

                    // 检查新路径是否已存在

                    const alreadyExists = await this.app.vault.adapter.exists(newLocalPath);

                    if (!alreadyExists) {

                        await this.app.vault.rename(file, newLocalPath);

                        new import_obsidian.Notice(`本地暂存文件已重命名为 ${newFileName}`);

                    } else {

                        new import_obsidian.Notice(`重命名失败：${newLocalPath} 已存在`);

                    }

                }

            }
```

这个笔记是防止更新后，代码被清理，到时候可以恢复。
