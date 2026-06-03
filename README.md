# 33IDE Lite

面向 OI 选手的轻量级算法竞赛 IDE，基于 Tauri 2 + CodeMirror 6，内置 g++ 编译器，开箱即用。

## 为什么选择 33IDE Lite

|                | 33IDE Lite | Dev-C++          | VS Code                  |
| -------------- | ---------- | ---------------- | ------------------------ |
| **安装包大小** | **~75MB**  | 48.1MB           | 159.6MB+                 |
| **内置编译器** | ✅ g++ 9.3.0 | ✅ g++ 4.9.2      | ❌ 需额外安装配置         |
| **编辑器体验** | CodeMirror 6 | 老旧 Scintilla   | Monaco                   |
| **断网可用**   | ✅ 开箱即用  | ✅ 需配置编译选项 | ❌ 需联网安装编译器与插件 |

> 根据 NOI 官网的[技术规则](https://www.noi.cn/gynoi/jsgz/2021-07-16/732450.shtml)，当前 NOI 系列赛事使用的 G++ 版本为 9.3.0。

## 功能

- **CodeMirror 6 编辑器** — C++ 语法高亮、智能自动补全、代码格式化
- **多主题支持** — One Dark、Quiet Light、Dracula、Monokai、GitHub、BBEdit 等
- **内置编译器** — g++ 9.3.0 (MinGW64)，动态适配任意 GCC 版本
- **一键编译运行** — F5 编译运行，结果在底部面板显示
- **编译错误高亮** — 编译错误在编辑器中以红色波浪线标记，鼠标悬停查看错误信息
- **代码格式化** — 集成 clang-format，一键格式化代码
- **标签页管理** — 多文件编辑，支持新建、关闭、切换
- **可调整布局** — 拖拽分隔条调整编辑器与输出面板比例
- **状态栏信息** — 实时显示编译器版本、保存状态、光标位置
- **字体缩放** — Ctrl + +/- 调整字号，Ctrl + 0 重置
- **模板系统** — 支持自定义默认代码模板
- **断网可用** — 所有资源本地化，无需联网

## 更新日志

### v0.2.0
- 编译器信息缓存，大幅加快启动速度
- 编译错误在编辑器中高亮显示（行内红色波浪线 + 悬浮提示）
- 优化了编译错误的中文翻译（正则捕获变量、语序重排）
- 修复运行耗时统计不准确的问题（排除进程创建开销）
- NSIS 安装程序界面中文化

### v0.1.0
- 首次发布

## 安装

下载对应版本的安装包，双击安装即可。自带编译器，无需额外配置。

## 配置

配置文件位于 `%APPDATA%\33IDE\config.json`，首次启动自动生成。

| 字段 | 说明 | 默认值 |
|------|------|--------|
| `compiler_path` | 编译器路径，留空自动检测 | `""` |
| `compile_flags` | 编译选项 | `["-std=c++14", "-O2", "-static"]` |
| `stack_size` | Windows 栈大小 | `"1073741824"` (1GB) |
| `editor_font_size` | 编辑器字号 | `14` |
| `editor_theme` | 主题 | `"oneDark"` |

## 开发环境

- Node.js 18+
- Rust (via rustup)
- Windows: Visual Studio Build Tools (C++ 桌面开发)

## 开发

```bash
npm install
npm run tauri:dev
```

## 打包

```bash
# 基础版
npm run build:basic

# 高级版
npm run build:advanced

# 旗舰版
npm run build:ultimate
```

输出：`src-tauri/target/release/bundle/nsis/`

## 技术栈

- **前端**: Vite + TypeScript + CodeMirror 6
- **后端**: Rust (Tauri 2)
- **编译器**: g++ (MinGW64, winlibs)
- **打包**: NSIS

## 项目结构

```
├── src/                        # 前端源码
│   ├── main.ts                 # 入口
│   ├── editor-setup.ts         # 编辑器配置
│   ├── style.css               # 样式
│   ├── lib/                    # 核心模块
│   │   ├── files.ts            # 文件操作
│   │   ├── tabs.ts             # 标签页管理
│   │   ├── ui.ts               # UI 组件
│   │   ├── themes.ts           # 主题管理
│   │   ├── runner.ts           # 编译运行
│   │   ├── api.ts              # Tauri API 封装
│   │   ├── context-menu.ts     # 右键菜单
│   │   └── cpp-completion.ts   # C++ 补全
│   └── features/               # 可选功能模块
│       ├── cph/                # 竞赛题单
│       ├── browser/            # 内置浏览器
│       ├── ai-translate/       # AI 翻译
│       └── ai-suggest/         # AI 代码建议
├── src-tauri/                  # Rust 后端
│   ├── src/
│   │   ├── main.rs             # 入口 + IPC
│   │   ├── compiler.rs         # 编译器检测 + 编译
│   │   ├── runner.rs           # 程序运行
│   │   ├── settings.rs         # 配置管理
│   │   ├── edition.rs          # 版本能力
│   │   └── features/           # 功能模块
│   └── tauri.conf.json
├── index.html
├── package.json
└── README.md
```

## 许可证

MIT License
