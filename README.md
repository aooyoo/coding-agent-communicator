# 🎯 Coding Agent Communicator

一个像 VisBug 一样的 Chrome 开发者工具插件，用于在页面上添加可视化注释，并将反馈信息发送给 Coding Agent。

## ✨ 功能特性

- 🔍 **元素高亮** - 鼠标悬停时高亮显示页面元素
- 📝 **添加注释** - 点击任意元素即可添加注释
- 📋 **智能导出** - 自动格式化并复制到剪贴板
- 🎨 **精美界面** - 现代化的 UI 设计，操作流畅
- 📍 **元素信息捕获** - 自动捕获选择器、位置、尺寸等信息

## 📦 安装方法

### 1. 生成图标（首次安装需要）

在浏览器中打开 `icons/generate.html`，点击"下载所有图标"按钮，将下载的 PNG 文件保存到 `icons/` 目录：
- `icon16.png`
- `icon32.png`
- `icon48.png`
- `icon128.png`

### 2. 加载插件到 Chrome

1. 打开 Chrome 浏览器
2. 访问 `chrome://extensions/`
3. 开启右上角的"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择 `coding-agent-communicator` 文件夹
6. 插件安装完成！

## 🚀 使用方法

1. **启动工具**
   - 点击浏览器工具栏中的插件图标
   - 在弹出窗口中点击"🚀 启动工具"

2. **添加注释**
   - 鼠标悬停在页面元素上会显示红色高亮边框
   - 点击任意元素会弹出注释输入框
   - 输入你的注释（例如："颜色太深"、"对齐有问题"等）
   - 点击"保存"或按 `Ctrl/Cmd + Enter` 保存

3. **完成并复制**
   - 点击右侧面板的"✓ 完成并复制"按钮
   - 格式化的反馈会自动复制到剪贴板
   - 粘贴发送给 Coding Agent

## 📤 输出格式示例

```markdown
## Page Feedback: https://example.com/products
**Viewport:** 1920×1080

---

### 1. 导航栏 Logo
**Element:** nav > .logo > img
**Position:** x: 20, y: 15 | Size: 120×40
**Comment:** Logo 图片模糊，需要更换高清版本

### 2. 主标题
**Element:** .hero-section > h1
**Text:** "欢迎使用我们的产品"
**Position:** x: 200, y: 150 | Size: 800×60
**Comment:** 标题字体太小，建议增大到 48px

### 3. 购买按钮
**Element:** .product-card > .actions > .btn-buy
**Position:** x: 450, y: 680 | Size: 140×45
**Comment:** 按钮颜色不够醒目，建议改用更鲜艳的蓝色
```

## 🎨 捕获的信息

对于每个注释元素，工具会自动捕获：

- **元素名称** - 标签类型和识别信息（class、id、文本内容）
- **CSS 选择器** - 精确的元素路径
- **元素坐标** - 相对视口的位置（x, y）和尺寸（width, height）
- **页面视口** - 当前浏览器窗口大小
- **控制台报错** - 控制台报错信息

## ⌨️ 快捷键

- `Ctrl/Cmd + Enter` - 在注释输入框中快速保存
- `Esc` - 取消当前注释

## 🛠️ 技术栈

- Vanilla JavaScript（无框架依赖）
- Chrome Extension Manifest V3
- CSS3（渐变、动画、flexbox）

## 📁 项目结构

```
coding-agent-communicator/
├── manifest.json           # 插件配置文件
├── content.js              # 内容脚本（核心功能）
├── content.css             # 内容样式
├── popup.html              # 弹出窗口界面
├── popup.js                # 弹出窗口脚本
├── icons/                  # 图标文件
│   ├── icon.svg            # SVG 源文件
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── package.json
└── README.md
```

## 🔧 开发

### 重新加载插件

修改代码后，在 `chrome://extensions/` 页面点击插件的"刷新"按钮即可。

### 调试

1. **Content Script 调试** - 在页面上右键选择"检查"，打开 DevTools
2. **Popup 调试** - 在插件图标上右键选择"检查弹出内容"

## 📝 注意事项

- 插件在所有网页上都可以使用
- 某些网站可能会限制 content script 的注入
- 注释数据仅保存在当前页面会话中，刷新页面会清空

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可

MIT License

## 🎯 致谢

灵感来源于 [VisBug](https://visbug.tech/) - 一个强大的网页可视化调试工具。
