# 33IDE Lite

面向 OI / ACM 训练场景的轻量级本地 IDE，基于 `Tauri 2 + Monaco Editor`，重点是开箱即用、离线可用和比赛风格体验。

## 当前版本

- `v0.10.1`

## 内置工具版本

| 工具 | 版本 | 默认位置 |
| --- | --- | --- |
| Monaco Editor | `0.55.1` | `node_modules/monaco-editor` |
| clangd | `22.1.0` | `tools/clangd.exe` |
| clang-format | `15.0.0` | `tools/clang-format.exe` |
| MinGW g++ | `9.3.0` | `tools/mingw64/bin/g++.exe` |

## 更新日志

### v0.10.1

- 恢复安装版的标准 Vite 拆分资源结构，安装包通过 Tauri 协议加载 `assets` 目录。
- 修复 Tauri 生产环境 CSP 导致 Monaco 运行时主题样式不生效的问题。
- 恢复 Monaco C++ 标准自动缩进，并修复在花括号后换行不会进入缩进层级的问题。
- 移除手写的本地 C++ 静态补全列表，代码补全统一交给 clangd。
- 普通运行和终端运行都会临时把编译器 `bin` 目录加入 `PATH`，支持去掉 `-static` 后运行依赖 MinGW DLL 的动态链接程序。
- 普通运行改为事件流架构，编译结束后立即切换为“运行中”，stdout / stderr 实时输出，停止按钮不会被长时间运行的程序卡住。

### v0.10.0

- 编辑器内核从 CodeMirror 6 切换到 Monaco Editor。
- 通过内置 clangd 提供 C++ 代码补全、悬浮说明和函数签名提示。
- clangd 与 clang-format 默认放在 `tools` 目录下，clangd 固定使用内置自动检测路径，不作为用户设置项暴露。
- 保留并优化 clangd 代码补全、编译错误标记、主题、字号、缩放、Tab 宽度和格式化体验。
- 格式化结果通过 Monaco 最小文本编辑应用，尽量保留光标和滚动位置。
- 运行中主按钮会切换为“停止”，点击后可强制结束当前程序，结束后恢复为“运行”。
- 缩放改为 WebView 原生缩放，设置页跟随缩放，同时避免 Monaco 被 CSS `zoom` 影响布局。
- 安装包只包含必要工具资源，不再打包 `tools/mingw64.7z`。

### v0.9.3

- 修复输出框 Ctrl+A 会选中编辑器以外内容的问题。
- 修复 NewLook 主题框选代码后点击外部区域选中文本颜色丢失的问题。

### v0.9.2

- 花括号输入行为与 Dev-C++ 保持一致：输入 `{` 不再自动增加缩进。
- 在 `{}` 中间按回车自动展开为三行并缩进光标。
- 移除 `indentOnInput`，避免输入花括号时缩进错乱。

### v0.9.1

- 修复所有文件已保存时窗口无法关闭的问题。

### v0.9.0

- 标题栏显示版本号 `v0.9.0`。
- 项目版本统一更新到 `0.9.0`，构建产物标题跟随 `package.json` 版本。
- 新增设置页，支持编译器路径、编译参数、时间限制、栈大小、默认模板、主题、字号、缩放、Tab 宽度等配置。
- 支持重置设置为默认值。
- 支持界面语言切换（简体中文 / English）。
- 编译器路径为空时自动检测并预填默认编译器。
- 新建文件默认模板改为来自设置配置，移除单独的“打开模板”入口。
- 新增 clang-format 配置项，支持设置缩进宽度和花括号换行风格。
- 代码格式化后光标根据文本差异智能跟随。
- 支持 `#include <...>` 场景下自动补全尖括号，未保存标签同样生效。
- 修复删除自动补全括号时只删一侧的问题。
- 标签页支持拖动重排。
- 标签页右键菜单支持关闭当前标签、关闭其他标签，并显示常用快捷键。
- 新增 `Ctrl+W` 关闭当前标签。
- 新增 `Ctrl+B` 打开当前文件所在文件夹；未保存标签会给出中文状态提示。
- 格式化入口移入编辑器右键菜单，并显示 `Shift+Alt+F`。
- 编辑器右键菜单显示全选、剪切、复制、粘贴、格式化、打开所在文件夹等快捷键。
- 支持框选代码后拖动到其他位置；拖动时显示目标插入光标，按 `Ctrl` 拖动为复制。
- 外部修改当前文件时提示重新加载，未保存修改会二次确认。
- 修复右侧运行面板在缩放后的可见性问题。
- 修复设置弹窗在缩放后的显示比例。
- 修复缩放后右键菜单与鼠标位置错位的问题。
- 优化 DevCpp NewLook 主题的当前行、选区和 gutter 对比度。
- 移除未使用的 minimap 设置。
- 移除未使用依赖和废弃配置，减小前端依赖体积。
- README 补充本地开发环境与首次启动说明。
- 新增已有文件自动保存（autosave）。
- 修复打包后编辑器样式不稳定的问题。
- 安装包排除工具链压缩包，减小产物体积。

### v0.3.0

- 新增 DevCpp NewLook 主题（移植自 Dev-C++ 5.11 配色）。
- 代码格式化后光标智能跟随（基于 jsdiff 算法）。
- 修复缩放后右键菜单与鼠标位置错位的问题。
- 应用图标更新为正方形白底样式。
- 移除未实现的功能模块（AI 翻译、AI 代码建议、内置浏览器、竞赛题单）。
- 移除未使用的依赖包，减小安装包体积。
- 清理废弃代码，优化项目结构。

### v0.2.0

- 编译器信息缓存，大幅加快启动速度。
- 编译错误在编辑器中高亮显示（行内红色波浪线 + 悬浮提示）。
- 优化编译错误的中文翻译（正则捕获变量、语序重排）。
- 修复运行耗时统计不准确的问题（排除进程创建开销）。
- NSIS 安装程序界面中文化。

### v0.1.0

- 首次发布。

## 功能概览

- 内置 `g++`、`clangd` 与 `clang-format`。
- 多主题 Monaco 编辑器。
- 设置页与本地配置文件。
- 模板代码、快捷运行、终端运行。
- 标签页、多文件编辑、拖动重排、关闭快捷键。
- 编辑器选区拖动移动 / 复制。
- 格式化后光标跟随，支持 clang-format 风格配置。
- 右键菜单与常用快捷键提示。
- 外部文件变更提醒重新加载。

## 编辑器定制行为

- 基于 Monaco Editor，保留多主题、字号、字体、缩放、Tab 宽度等本地设置。
- 通过内置 clangd 提供 C++ 代码补全、悬浮说明和函数签名提示。
- 编译错误会解析为编辑器内标记，保留输出面板中的原始编译信息。
- 输入 `#include <` 时自动补齐右尖括号，方便头文件输入。
- 在 `{}` 中间按回车会自动展开为三行，并按当前 Tab 宽度缩进光标行。
- Tab 缩进、成对括号删除、选区拖拽等基础编辑行为交给 Monaco 原生实现。
- 格式化仍使用内置 clang-format，前端通过最小文本编辑应用结果，尽量保留光标和滚动位置。
- 运行中可以点击“停止”强制结束当前程序；超过时间限制也会自动停止并返回超时状态。

## 本地开发环境

建议环境：

- Windows 10/11
- Node.js 18 及以上
- Rust stable（通过 `rustup` 安装）
- Visual Studio Build Tools（勾选 C++ 桌面开发）
- 7-Zip，用于解压内置工具链

如果 `cargo` 不在 PATH，需要把下面目录加入环境变量，或者在当前终端临时执行一次：

```powershell
$env:Path="$env:USERPROFILE\.cargo\bin;$env:Path"
```

## 第一次跑起来

### 1. 安装前端依赖

```powershell
npm install
```

### 2. 解压内置编译器

项目自带压缩包 `tools/mingw64.7z`，第一次开发前先解压：

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

请确认当前目录是项目根目录 `33IDE`，不要在 `tools` 子目录里运行。

```powershell
cd C:\Users\daiji\Documents\work\33IDE
npm run tauri:dev
```

看到桌面窗口弹出，并且标题显示 `33IDE Lite v0.10.1`，就说明第一个本地版本已经跑起来了。

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
