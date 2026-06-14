# 33IDE Lite

面向 OI / ACM 训练场景的轻量级本地 IDE，基于 `Tauri 2 + Monaco Editor`，主打开箱即用、离线可用和接近比赛环境的使用体验。

## 当前版本

- `v1.0.0`

## 内置工具版本

| 工具 | 版本 | 默认位置 |
| --- | --- | --- |
| Monaco Editor | `0.55.1` | `node_modules/monaco-editor` |
| clangd | `22.1.0` | `tools/clangd.exe` |
| clang-format | `22.1.6` | `tools/clang-format.exe` |
| MinGW g++ | `9.3.0` | `tools/mingw64/bin/g++.exe` |

## 更新日志

### v1.0.0

- 发布 `v1.0.0` 稳定版，目标平台聚焦 Windows 10 / Windows 11。
- 内置 `clang-format` 更新为静态 Windows 构建，避免依赖 MSVC 运行库。
- 修复标签页右键菜单“保存 / 另存为”不会实际保存的问题。
- 编译与运行改为使用独立临时目录，避免多次运行、终端运行和普通运行互相覆盖产物。
- 临时运行目录统一位于 `%TEMP%\33ide\runs`，用于保存编译产物、运行脚本和终端运行的临时文件。
- 编译器信息缓存增加文件大小与修改时间校验，降低缓存命中错误结果的概率。
- Windows 下新增真实控制台程序检测；使用 `windows.h` 控制台 API、方向键轮询、`system("pause")` / `system("cls")` 等场景时，会提示改用“终端运行”。
- “终端运行”改为运行结束后保留终端窗口，不再一闪而过。
- 右侧输入/输出区改为上下布局，默认各占一半，并支持拖拽调整比例且保留最小高度。
- 新增“输入/输出”按钮，可切换右侧面板显示与隐藏。
- 设置面板新增“打开运行缓存目录”按钮，放在“恢复默认设置”旁边，可直接打开 `%TEMP%\33ide\runs`。
- 输出区在收到首段 stdout / stderr 后，会自动移除“运行中...”占位文案，避免和真实输出内容粘连。
- 需要真实控制台时，输出提示已补中文翻译，并且会直接替换“编译中 / 运行中”占位提示。
- 自动补全接受逻辑已修复，`continue;` 一类补全不再因为回车确认而丢失分号。
- 自动补全候选框限制在编辑器坐标系内，并针对缩放场景增加重排修正，降低候选框越界和错位问题。
- 界面缩放实现从 WebView 窗口级缩放调整为应用内部统一缩放层，以减少 `Ctrl+` 后 Monaco 补全框与编辑区坐标错位。
- 编译与运行阶段的停止逻辑进一步增强；Windows 下统一清理进程树，编译取消改为并发读取输出与轮询退出，停止响应更快。
- 编译阶段新增超时保护；`clang-format` 缺失或执行失败时会明确提示错误。

### v0.10.2

- Monaco 行号侧新增错误 / 警告图标显示。
- 编译错误改为前端结构化解析，输出区保留中文诊断与原始信息，编辑器内按行列显示波浪线和整行高亮。

### v0.10.1

- 恢复安装版的标准 Vite 资源结构，确保生产环境正常加载 `assets`。
- 修复 Tauri 生产环境 CSP 导致 Monaco 主题样式不生效的问题。
- 恢复 Monaco C++ 标准自动缩进，并修复花括号换行后的缩进问题。
- 移除手写本地 C++ 静态补全列表，代码补全统一交给 clangd。
- 普通运行和终端运行都会临时把编译器 `bin` 目录加入 `PATH`，支持依赖 MinGW DLL 的动态链接程序。
- 普通运行改为事件流架构，stdout / stderr 实时输出，停止按钮不会被长时间运行的程序卡住。

### v0.10.0

- 编辑器内核从 CodeMirror 6 切换到 Monaco Editor。
- 通过内置 clangd 提供 C++ 代码补全、悬浮说明和函数签名提示。
- 保留并优化主题、字号、字体、缩放、Tab 宽度和格式化体验。
- 格式化结果通过最小文本编辑应用，尽量保留光标和滚动位置。

## 功能概览

- 内置 `g++`、`clangd`、`clang-format`
- Monaco 编辑器与多主题
- 多标签页、多文件编辑、拖拽重排
- 模板代码、普通运行、终端运行
- 编译错误高亮、悬浮提示、格式化支持
- 输入 / 输出面板、自动保存、外部文件改动提醒

## 编辑器行为

- 基于 Monaco Editor，支持本地保存主题、字号、字体、缩放和 Tab 宽度。
- 通过内置 clangd 提供 C++ 代码补全、悬浮说明和函数签名提示。
- 输入 `#include <` 时自动补齐右尖括号。
- 在 `{}` 中间按回车会自动展开为三行，并按当前 Tab 宽度缩进。
- 格式化仍使用内置 clang-format，前端通过最小文本编辑结果应用，尽量保留光标与滚动位置。
- 运行中可以点击“停止”强制结束当前程序；超时也会自动停止并返回超时状态。

## 本地开发环境

建议环境：

- Windows 10 / 11
- Node.js 18 及以上
- Rust stable
- Visual Studio Build Tools（勾选 C++ 桌面开发）
- 7-Zip（首次解压内置工具链时使用）

如果 `cargo` 不在 `PATH`，可以临时执行：

```powershell
$env:Path="$env:USERPROFILE\.cargo\bin;$env:Path"
```

## 第一次跑起来

### 1. 安装前端依赖

```powershell
npm install
```

### 2. 解压内置编译器

项目自带压缩包 `tools/mingw64.7z`，首次开发前先解压：

```powershell
cd tools
7z x mingw64.7z -omingw64 -y
cd ..
```

解压完成后，下面文件应存在：

```text
tools/mingw64/bin/g++.exe
tools/clangd.exe
tools/clang-format.exe
```

### 3. 从项目根目录启动开发模式

```powershell
cd C:\Users\daiji\Documents\work\33IDE
npm run tauri:dev
```

看到桌面窗口弹出，且标题显示 `33IDE Lite v1.0.0`，说明本地开发环境已经正常启动。

## 常用开发命令

启动桌面开发模式：

```powershell
npm run tauri:dev
```

只做前端构建检查：

```powershell
npm run build
```

打包安装程序：

```powershell
npm run tauri:build
```

默认输出目录：

```text
src-tauri/target/release/bundle/nsis/
```

## 配置文件

首次启动后会自动生成：

```text
%APPDATA%\33IDE\config.json
```

常见配置项：

| 字段 | 说明 |
| --- | --- |
| `compiler_path` | 编译器路径，留空时自动检测 |
| `compile_flags` | 编译参数 |
| `stack_size` | 运行栈大小 |
| `time_limit_ms` | 运行时间限制 |
| `default_template` | 新建文件默认模板 |
| `default_language` | 默认语言 |
| `ui_language` | 界面语言 |
| `editor_theme` | 编辑器主题 |
| `editor_font_size` | 编辑器字号 |
| `editor_font_family` | 编辑器字体 |
| `editor_zoom` | 界面缩放 |
| `editor_tab_size` | Tab 宽度 |
| `clang_format_brace_on_new_line` | 格式化时花括号是否单独换行 |

## 项目结构

```text
src/                前端代码
src/lib/            文件、标签、运行、UI 等核心逻辑
src-tauri/          Tauri / Rust 后端
tools/              内置 clangd、clang-format 与 MinGW 工具链
README.md           项目说明
```

## 许可证

MIT
