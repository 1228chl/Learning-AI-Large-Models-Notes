<%*

let parent = await tp.system.prompt("上一级", "无");

let child = await tp.system.prompt("下一级", "");

let tag = await tp.system.prompt("标签", "");

let ref = await tp.system.prompt("引用", "");

%>

**上一级：** [[<% parent %>]]

**下一级：** [[<% child %>]]

**标签：** #<% tag %>

**引用：** <% ref %>

---

<% tp.file.cursor() %>

