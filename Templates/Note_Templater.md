<%*

// 弹出一个输入框，并把用户输入的内容保存在 title 变量里

let title = await tp.system.prompt("为这个笔记输入一个名字");

// 调用 rename 命令，把文件名改为用户输入的内容

await tp.file.rename(title);

let tag = await tp.system.prompt("标签", "");

%>

**上一级：** [[]]

**下一级：** [[]]

**标签：** #<% tag %>

---
