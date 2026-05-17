--- 

# 1. 修复在行公式输入不会自动左右滑动的 bug

**在 Obsidian MathLive 插件的模态窗口（modal）中：**

- 编辑**行内公式**时，MathLive 编辑器内的光标移到右侧超出可视区域时，编辑器不会自动水平滚动，导致光标被“挤出”看不见。

- 编辑**块公式**时，同样的模态窗口，编辑器却能正常水平滚动跟随光标。

## 问题定位

从代码看，两种公式共用同一个 `MathLiveModal` 类，区别仅在于创建实例时传入的 `inline` 参数（`true` 为行内，`false` 为块）。在 `initMathlive` 方法中，创建 `math-field` 时没有对宽度、溢出等做任何样式区分。因此，问题很可能不在模态窗口本身，而在于 **MathLive 编辑器内部对 `inline-math` 和 `math` 两种默认模式的处理差异**。

具体来说：

- 块公式创建时使用 `defaultMode: "math"`（因为 `!this.inline`）。

- 行内公式使用 `defaultMode: "inline-math"`。

MathLive 在 `inline-math` 模式下，可能会采用不同的布局策略，例如将编辑器视为行内元素，不限制宽度，从而**不会自动产生滚动条**，光标超出时也不会自动滚动。而在 `math` 模式下，编辑器表现为块级元素，宽度受限，触发了滚动机制。

## 解决方案

您可以尝试**强制行内公式模态窗口中的 MathLive 编辑器使用 `math` 模式**，同时保留最终输出仍为 `$...$`。这样编辑体验将与块公式一致，而输出包裹仍由插件的 `onClose` 逻辑根据 `inline` 标志决定。

### 修改代码（仅一处）

在 `MathLiveModal` 类的 `initMathlive` 方法中，创建 `mfe` 时，**无论 `this.inline` 为何，都将 `defaultMode` 设置为 `"math"` **，而不是根据 `inline` 动态设置。

**原代码（约第 1175 行附近）：**

```javascript
this.mfe = createMathfield({
    initialValue: initialLatex,
    inline: this.inline,   // 这个 inline 参数会影响 MathLive 内部行为
    id: "mathlive-modal-field",
    onInput: (value) => {
        this.renderedResult = resultRenderTemplate(value);
    },
});
```

**修改为：**

```javascript
this.mfe = createMathfield({
    initialValue: initialLatex,
    inline: false,         // 强制使用块模式布局，以获得滚动能力
    id: "mathlive-modal-field",
    onInput: (value) => {
        this.renderedResult = resultRenderTemplate(value);
    },
});
```

同时确保 `createMathfield` 函数中（在 `mathlive-shared.ts`）的 `inline` 参数被正确传递到 `mfe.defaultMode`。但您只需要修改这一处即可。

### 为什么要这样改？

- `createMathfield` 中会根据 `config.inline` 设置 `mfe.defaultMode = config.inline ? "inline-math" : "math"`。
- 强制设为 `false` 后，编辑器将使用 `math` 模式，从而获得与块公式相同的滚动行为。
- 模态窗口关闭时，`onClose` 方法仍然使用 `this.inline` 来决定用 `$` 还是 `$$` 包裹，因此输出不受影响。

### 验证步骤

1. 修改 `main.js` 中对应位置（搜索 `createMathfield` 调用，找到模态窗口中的那处）。
2. 保存文件，重启 Obsidian。
3. 打开一个很长的行内公式（通过命令或双击 `$...$`），现在编辑器的滚动行为应该和块公式完全一致。

## 副作用

- 编辑行内公式时，编辑器会暂时表现为块级元素（可能独占一行），但模态窗口本身是弹窗，不影响笔记原文排版。
- 由于编辑模式变更为 `math`，某些行内特有的排版（如紧凑间距）可能会有细微变化，但应该不影响公式内容。

如果这个修改解决了问题，就说明根本原因是 MathLive 在 `inline-math` 模式下对滚动的支持不足。如果仍然无效，可能需要进一步调试 CSS 滚动容器。请尝试后告知结果。

# 2. 修复在外面使用编辑器后光标一直在$的前面

打开这个插件的 main.js 文件（位置自己找）

先搜索 onClose() 方法

在 this.editor.replaceRange(this.renderedResult, this.replaceFrom, this.replaceTo);

后面添加下面的代码，然后保存就可以了，不过还是会有小问题，比如在表格里插入公式后还是会在$的前面，不过在正常使用是没问题的，无论块级公式还是行内公式

```js
// 将光标移动到插入内容的末尾  
const fromOffset = this.editor.posToOffset(this.replaceFrom);  
const newOffset = fromOffset + this.renderedResult.length;  
const newPos = this.editor.offsetToPos(newOffset);  
this.editor.setCursor(newPos);
```
