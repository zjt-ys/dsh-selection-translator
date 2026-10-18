# DSH Selection Translator

DeepSeek Harness (DSH) Web GUI 插件：选中文本一键翻译为中文。

## 使用方式

1. 在聊天区域用鼠标选中一段文本
2. 点击输入框工具栏右侧的翻译按钮
3. 浮窗显示翻译结果

## 功能

- 🌐 调用 Bilibili Index-Translate API（免费、无需认证）
- 📋 翻译结果支持一键复制
- 📖 可展开查看原文
- ⌨ 按 Esc 关闭浮窗
- 🎨 自适应 DSH 主题色

## 安装

使用 CLI 安装到 web profile：

```bash
# 克隆仓库
git clone https://github.com/zjt-ys/dsh-selection-translator.git

# 安装到 DSH web profile
dsh plugin --profile web add ./dsh-selection-translator

# 或指定绝对路径
dsh plugin --profile web add file:E:\工作区\dsh-selection-translator
```

也可在 DSH 图形界面安装：`插件管理 → 安装本地包 → 选择本目录`。

## 技术细节

- **Host 端** (`index.js`)：通过 `host.call` RPC 代理调用翻译 API，绕过浏览器 CORS 限制
- **Client 端** (`client.js`)：翻译按钮 + 浮窗 UI，注册在 `conversation.input.right` 插槽
- **API 模型**：`Index-Translate-35B-A3B`
