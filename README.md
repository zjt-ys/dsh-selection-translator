# DSH Selection Translator

DeepSeek Harness (DSH) Web GUI 插件：选中文本一键翻译为中文。

## 使用方式

1. 在聊天区域用鼠标选中一段文本
2. 点击输入框工具栏右侧的翻译按钮
3. 浮窗显示翻译结果

## 功能

- 🌐 **多通道自动降级**：Bilibili Index-Translate → 有道翻译 → MyMemory，任一失效自动切换
- ✂️ **长文本自动分段**：按段落 / 句末 / 空白优先级切分，遵守各通道字数上限
- 📋 翻译结果支持一键复制
- 📖 可展开查看原文
- ⌨ 按 Esc 关闭浮窗
- 🎨 自适应 DSH 主题色

## 翻译通道

| 通道 | 单段上限 | 说明 |
|------|----------|------|
| Bilibili Index-Translate | 900 字符 | LLM 翻译，质量最佳，优先使用 |
| 有道翻译 | 900 字符 | 免费接口，含限流保护 |
| MyMemory | 480 字符 | 最后兜底 |

单次最多 **20000 字符**；超出时按上述上限自动拆成多段，每段独立翻译后按原文段落合并。
Bilibili 在部分数据中心 IP 下可能失效，此时会自动切换到有道，无需手动干预。

## 安装

使用 CLI 从 GitHub 安装（`--profile` 必填）：

```bash
dsh plugin --profile web add github:zjt-ys/dsh-selection-translator
```

或安装本地目录（本地路径必须是绝对路径）：

```bash
dsh plugin --profile web add "file:E:/工作区/dsh-selection-translator"
```

也可在 DSH 图形界面安装：`插件管理 → 安装本地包 → 选择本目录`。

安装后在插件管理中启用，聊天输入框右侧会出现翻译按钮。

## 技术细节

- **Host 端** (`index.js`)：三通道降级 + 智能分段，通过 `host.call` RPC 暴露给 Client，同时绕过浏览器 CORS 限制
- **Client 端** (`client.js`)：翻译按钮 + 浮窗 UI，注册在 `conversation.input.right` 插槽
- **分段策略**：段落分隔 → 句末标点 → 单换行 → 空格 → 硬切，保证不丢字符
- **降级策略**：逐通道尝试，失败自动切下一个；全部失败时回报每通道的具体原因
