# 目录结构说明

## 开发模式 (`npm run tauri:dev`)

```
D:\33IDE\33ide\
├── src/                        # 前端源码 (TypeScript)
│   ├── main.ts                 # 应用入口
│   ├── editor-setup.ts         # CodeMirror 编辑器配置
│   ├── style.css               # 全局样式
│   ├── lib/                    # 核心模块
│   │   ├── files.ts            # 文件读写操作
│   │   ├── tabs.ts             # 标签页管理
│   │   ├── ui.ts               # UI 组件（菜单栏、状态栏、面板）
│   │   ├── themes.ts           # 主题切换与管理
│   │   ├── runner.ts           # 编译/运行逻辑
│   │   ├── api.ts              # Tauri API 封装
│   │   ├── context-menu.ts     # 编辑器右键菜单
│   │   └── cpp-completion.ts   # C++ 代码补全
│   └── features/               # 可选功能模块（按版本启用）
│       ├── cph/                # CPH 竞赛题单
│       ├── browser/            # 内置浏览器面板
│       ├── ai-translate/       # AI 翻译
│       └── ai-suggest/         # AI 代码建议
├── src-tauri/                  # Rust 后端
│   ├── src/
│   │   ├── main.rs             # 入口 + IPC 命令注册
│   │   ├── compiler.rs         # 编译器检测 + 编译命令
│   │   ├── runner.rs           # 程序运行（含终端运行）
│   │   ├── settings.rs         # 配置加载/保存
│   │   ├── edition.rs          # 版本能力声明
│   │   └── features/           # 功能模块后端
│   │       ├── cph.rs
│   │       ├── browser.rs
│   │       ├── ai_translate.rs
│   │       └── ai_suggest.rs
│   ├── icons/                  # 应用图标
│   └── tauri.conf.json         # Tauri 配置
├── dist/                       # Vite 构建输出（.gitignore）
└── node_modules/               # 依赖（.gitignore）
```

## 安装版本 (NSIS)

```
C:\Users\{用户}\AppData\Local\33IDE\
├── 33ide.exe                   # 可执行文件
├── uninstall.exe
└── _up_/                       # NSIS 更新目录（包含所有资源）
    └── tools/
        └── mingw64/
            └── bin/g++.exe     # 内置编译器
```

**从 exe 到编译器的路径：**
```
exe_dir = C:\Users\{用户}\AppData\Local\33IDE\
编译器 = exe_dir/tools/mingw64/bin/g++.exe
编译器 = exe_dir/_up_/tools/mingw64/bin/g++.exe (NSIS 更新目录)
```

## 编译器路径检测优先级

1. 用户配置的路径 (`config.json` 中的 `compiler_path`)
2. exe 同级目录 `tools/mingw64/bin/g++.exe`
3. NSIS 更新目录 `_up_/tools/mingw64/bin/g++.exe`
4. Resources 目录 `resources/tools/mingw64/bin/g++.exe`
5. 开发模式：从 exe 向上查找项目根目录
6. 系统 PATH

## 配置文件

配置保存在 `%APPDATA%/33IDE/config.json`（Windows）。

首次启动时自动从内置默认值创建。可通过前端设置界面或直接编辑 JSON 文件修改。

### 配置项

| 字段 | 类型 | 说明 |
|------|------|------|
| `compiler_path` | string | 编译器路径，留空则自动检测 |
| `compile_flags` | string[] | 编译选项 |
| `stack_size` | string | Windows 栈大小（字节） |
| `time_limit_ms` | number | 运行超时（毫秒） |
| `default_template` | string | 新建文件的默认代码模板 |
| `default_language` | string | 默认语言 |
| `editor_font_size` | number | 编辑器字号 |
| `editor_theme` | string | 编辑器主题 |
| `editor_minimap` | boolean | 是否显示缩略图 |

### GCC 版本检测

编译器模块会动态扫描 `libexec/gcc/<target>/` 目录下的版本文件夹，自动适配任意 GCC 版本，不再硬编码版本号。
