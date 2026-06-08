use std::process::Command;
use std::path::PathBuf;
use std::fs;
use serde::{Deserialize, Serialize};
use crate::settings::Settings;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

pub struct CompileResult {
    pub success: bool,
    pub error: Option<String>,
    pub raw_error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CompilerInfo {
    pub path: String,
    pub version: String,
}

fn cache_path() -> PathBuf {
    let dir = dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("33IDE");
    fs::create_dir_all(&dir).ok();
    dir.join("compiler_cache.json")
}

fn load_cached_compiler_info() -> Option<CompilerInfo> {
    let path = cache_path();
    let data = fs::read_to_string(&path).ok()?;
    let info: CompilerInfo = serde_json::from_str(&data).ok()?;
    if PathBuf::from(&info.path).exists() {
        Some(info)
    } else {
        None
    }
}

fn save_compiler_info_cache(info: &CompilerInfo) {
    let path = cache_path();
    if let Ok(json) = serde_json::to_string(info) {
        let _ = fs::write(&path, json);
    }
}

pub fn get_compiler_info(settings: &Settings) -> Result<String, String> {
    if let Some(cached) = load_cached_compiler_info() {
        if settings.compiler_path.is_empty() || settings.compiler_path == cached.path {
            return Ok(cached.version);
        }
    }

    let compiler = detect_compiler(settings);
    let output = Command::new(&compiler)
        .arg("--version")
        .output()
        .map_err(|e| format!("{}: {}", compiler, e))?;
    let version = String::from_utf8_lossy(&output.stdout).to_string();
    let first_line = version.lines().next().unwrap_or("unknown").to_string();

    save_compiler_info_cache(&CompilerInfo {
        path: compiler,
        version: first_line.clone(),
    });

    Ok(first_line)
}

fn translate_gcc_error(msg: &str) -> String {
    use regex::Regex;

    let mut result = msg.to_string();

    // --- 第一步：正则重排（捕获变量，按中文语序重组）---
    let reorder_patterns: Vec<(Regex, &str)> = vec![
        // expected 'X' before 'Y' → 在 'Y' 之前期望 'X'
        (Regex::new(r"expected\s+('[^']*')\s+before\s+('[^']*')").unwrap(), "在 $2 之前期望 $1"),
        // expected 'X' before Y → 在 Y 之前期望 'X'
        (Regex::new(r"expected\s+('[^']*')\s+before\s+(\S+)").unwrap(), "在 $2 之前期望 $1"),
        // expected X before 'Y' → 在 'Y' 之前期望 X
        (Regex::new(r"expected\s+(\S+)\s+before\s+('[^']*')").unwrap(), "在 $2 之前期望 $1"),
        // expected X before Y → 在 Y 之前期望 X
        (Regex::new(r"expected\s+(.+?)\s+before\s+(.+)").unwrap(), "在 $2 之前期望 $1"),
        // was expected before 'X' → 在 'X' 之前被期望
        (Regex::new(r"was expected before\s+('[^']*')").unwrap(), "在 $1 之前被期望"),
        // was expected before X → 在 X 之前被期望
        (Regex::new(r"was expected before\s+(.+)").unwrap(), "在 $1 之前被期望"),
        // no matching function for call to 'X' → 没有匹配的函数调用：'X'
        (Regex::new(r"no matching function for call to\s+(.+)").unwrap(), "没有匹配的函数调用：$1"),
        // too few arguments to function 'X' → 函数参数太少：'X'
        (Regex::new(r"too few arguments to function\s+(.+)").unwrap(), "函数参数太少：$1"),
        // too many arguments to function 'X' → 函数参数太多：'X'
        (Regex::new(r"too many arguments to function\s+(.+)").unwrap(), "函数参数太多：$1"),
        // use of undeclared identifier 'X' → 使用了未声明的标识符 'X'
        (Regex::new(r"use of undeclared identifier\s+(.+)").unwrap(), "使用了未声明的标识符 $1"),
        // not declared in this scope → 未在此作用域中声明
        (Regex::new(r"'(\w+)' not declared in this scope").unwrap(), "'$1' 未在此作用域中声明"),
        // invalid conversion from 'X' to 'Y' → 从 'X' 到 'Y' 的无效转换
        (Regex::new(r"invalid conversion from\s+(.+)\s+to\s+(.+)").unwrap(), "从 $1 到 $2 的无效转换"),
        // no viable conversion from 'X' to 'Y' → 无法将 'X' 转换为 'Y'
        (Regex::new(r"no viable conversion from\s+(.+)\s+to\s+(.+)").unwrap(), "无法将 $1 转换为 $2"),
        // cannot initialize object of type 'X' with 'Y' → 无法用 'Y' 初始化 'X' 类型的对象
        (Regex::new(r"cannot initialize object of type\s+(.+)\s+with\s+(.+)").unwrap(), "无法用 $2 初始化 $1 类型的对象"),
        // assignment of read-only variable 'X' → 赋值给只读变量 'X'
        (Regex::new(r"assignment of read-only (?:variable )?'?(.+?)'?$").unwrap(), "赋值给只读变量 '$1'"),
        // does not name a type → 不是一个类型名
        (Regex::new(r"'(\w+)' does not name a type").unwrap(), "'$1' 不是一个类型名"),
        // is not a member of 'X' → 不是 'X' 的成员
        (Regex::new(r"'(\w+)' is not a member of\s+(.+)").unwrap(), "'$1' 不是 $2 的成员"),
        // lvalue required as left operand of assignment → 赋值左侧需要左值
        (Regex::new(r"lvalue required as (.+)").unwrap(), "$1 需要左值"),
        // note: declared here → 注意：在此声明
        (Regex::new(r"(?i)^note:\s*(.+)$").unwrap(), "注意：$1"),
        // redefinition of 'X' → 重复定义 'X'
        (Regex::new(r"redefinition of\s+'(.+)'").unwrap(), "重复定义 '$1'"),
        // redeclaration of 'X' → 重复声明 'X'
        (Regex::new(r"redeclaration of\s+'(.+)'").unwrap(), "重复声明 '$1'"),
        // first defined here → 首次定义在此
        (Regex::new(r"first defined here").unwrap(), "首次定义在此"),
        // in instantiation of 'X' → 在实例化 'X' 中
        (Regex::new(r"in instantiation of\s+'(.+)'").unwrap(), "在实例化 '$1' 中"),
        // required from here → 从此处要求
        (Regex::new(r"required from (?:here|'(.*)')").unwrap(), "从此处要求"),
        // comparison between signed and unsigned → 有符号数和无符号数之间的比较
        (Regex::new(r"comparison between (?:signed|unsigned) .+ and (?:signed|unsigned) .+").unwrap(), "有符号数和无符号数之间的比较"),
    ];

    for (re, replacement) in &reorder_patterns {
        result = re.replace_all(&result, *replacement).to_string();
    }

    // --- 第二步：简单替换（无需重排的术语）---
    let simple_translations = vec![
        ("error: ", "错误："),
        ("warning: ", "警告："),
        ("fatal error: ", "致命错误："),
        ("In function", "在函数中"),
        ("At global scope", "在全局作用域"),
        ("undefined reference to", "未定义的引用："),
        ("multiple definition", "重复定义"),
        ("undeclared", "未声明的"),
        ("segmentation fault", "段错误（访问了非法内存）"),
        ("core dumped", "核心已转储"),
        ("no such file or directory", "没有这个文件或目录"),
        ("permission denied", "权限被拒绝"),
        ("cannot find", "找不到"),
        ("linked from", "链接自"),
        ("ld returned", "链接器返回"),
        ("collect2", "链接器"),
        ("undefined symbol", "未定义的符号"),
        ("is private", "是私有的"),
        ("is protected", "是受保护的"),
        ("stack overflow", "栈溢出"),
        ("heap overflow", "堆溢出"),
        ("memory leak", "内存泄漏"),
        ("use after free", "释放后使用"),
        ("double free", "重复释放"),
        ("integer overflow", "整数溢出"),
        ("division by zero", "除以零"),
        ("array subscript out of bounds", "数组下标越界"),
        ("nullptr", "空指针"),
        ("null pointer", "空指针"),
        ("template argument", "模板参数"),
        ("no match for", "没有匹配的"),
        ("candidates are", "候选函数是"),
        ("incompatible", "不兼容"),
        ("ambiguous", "歧义"),
        ("overflow", "溢出"),
        ("underflow", "下溢"),
        ("out of memory", "内存不足"),
        ("stray '\\", "多余的字符 '\\"),
        ("unused variable", "未使用的变量"),
        ("set but not used", "已设置但未使用"),
        ("control reaches end of non-void function", "控制流到达了非 void 函数的末尾（缺少 return）"),
        ("no return statement in function returning non-void", "返回非 void 的函数中没有 return 语句"),
        ("timed out", "已超时"),
        ("timeout", "超时"),
        ("primary-expression", "基本表达式"),
        ("in program", "在程序中"),
        ("candidate expects", "候选函数期望"),
        ("cannot initialize", "无法初始化"),
        ("invalid use of", "无效使用："),
        ("no type", "无类型"),
        ("expected specifier-qualifier-list", "期望类型说明符"),
        ("expected expression", "期望表达式"),
        ("expected identifier", "期望标识符"),
        ("expected declaration", "期望声明"),
        (" token", ""),
        (" in ", " 在 "),
    ];

    for (en, zh) in &simple_translations {
        result = result.replace(en, zh);
    }

    result
}

/// Detect compiler path with the following priority:
/// 1. User-configured path (from config.json)
/// 2. Next to exe: tools/mingw64/bin/g++.exe
/// 3. NSIS update dir: _up_/tools/mingw64/bin/g++.exe
/// 4. Resources dir: resources/tools/mingw64/bin/g++.exe
/// 5. Dev mode: go up from src-tauri/target/debug to project root
/// 6. Fallback to system PATH "g++"
pub fn detect_compiler(settings: &Settings) -> String {
    if !settings.compiler_path.is_empty() {
        return settings.compiler_path.clone();
    }

    let exe_dir = std::env::current_exe()
        .unwrap_or_else(|_| PathBuf::from("."))
        .parent()
        .unwrap_or(&PathBuf::from("."))
        .to_path_buf();

    let candidates: Vec<PathBuf> = if cfg!(target_os = "windows") {
        vec![
            exe_dir.join("tools").join("mingw64").join("bin").join("g++.exe"),
            exe_dir.join("_up_").join("tools").join("mingw64").join("bin").join("g++.exe"),
            exe_dir.join("resources").join("tools").join("mingw64").join("bin").join("g++.exe"),
            exe_dir.join("..").join("..").join("..").join("tools").join("mingw64").join("bin").join("g++.exe"),
            PathBuf::from("tools/mingw64/bin/g++.exe"),
        ]
    } else {
        vec![
            exe_dir.join("..").join("Resources").join("tools").join("mac-gcc").join("bin").join("g++"),
            exe_dir.join("tools").join("mac-gcc").join("bin").join("g++"),
            PathBuf::from("tools/mac-gcc/bin/g++"),
        ]
    };

    for candidate in &candidates {
        if candidate.exists() {
            return candidate.to_string_lossy().to_string();
        }
    }

    "g++".to_string()
}

pub fn detect_clangd() -> String {
    let exe_dir = std::env::current_exe()
        .unwrap_or_else(|_| PathBuf::from("."))
        .parent()
        .unwrap_or(&PathBuf::from("."))
        .to_path_buf();

    let candidates: Vec<PathBuf> = if cfg!(target_os = "windows") {
        vec![
            exe_dir.join("tools").join("clangd.exe"),
            exe_dir.join("_up_").join("tools").join("clangd.exe"),
            exe_dir.join("resources").join("tools").join("clangd.exe"),
            exe_dir.join("..").join("..").join("..").join("tools").join("clangd.exe"),
            PathBuf::from("tools/clangd.exe"),
        ]
    } else {
        vec![
            exe_dir.join("..").join("Resources").join("tools").join("clangd"),
            exe_dir.join("tools").join("clangd"),
            PathBuf::from("tools/clangd"),
        ]
    };

    for candidate in &candidates {
        if candidate.exists() {
            return candidate.to_string_lossy().to_string();
        }
    }

    "clangd".to_string()
}

pub fn compiler_bin_dir(settings: &Settings) -> Option<PathBuf> {
    let compiler = detect_compiler(settings);
    let compiler_path = PathBuf::from(compiler);
    let parent = compiler_path.parent()?;
    if parent.as_os_str().is_empty() {
        None
    } else {
        Some(parent.to_path_buf())
    }
}

pub fn path_with_compiler_bin(settings: &Settings) -> Option<String> {
    let bin_dir = compiler_bin_dir(settings)?;
    let current_path = std::env::var("PATH").unwrap_or_default();
    let separator = if cfg!(windows) { ";" } else { ":" };

    if current_path.is_empty() {
        Some(bin_dir.to_string_lossy().to_string())
    } else {
        Some(format!("{}{}{}", bin_dir.display(), separator, current_path))
    }
}

/// Dynamically find the GCC libexec directory containing cc1plus.
/// Scans the libexec/gcc/<target>/ directory for version subfolders
/// instead of hardcoding a specific version.
fn find_libexec_dir(compiler_dir: &std::path::Path) -> Option<PathBuf> {
    let libexec_base = compiler_dir.join("..").join("libexec").join("gcc");

    let target_dir = if cfg!(target_os = "windows") {
        libexec_base.join("x86_64-w64-mingw32")
    } else {
        // For macOS/Linux, try common targets
        let candidates = vec![
            libexec_base.join("x86_64-linux-gnu"),
            libexec_base.join("aarch64-linux-gnu"),
            libexec_base.join("x86_64-apple-darwin"),
        ];
        candidates.into_iter().find(|p| p.exists())?
    };

    if !target_dir.exists() {
        return None;
    }

    // Scan for version directories (e.g., 9.3.0, 12.2.0, 13.1.0)
    // Pick the first (and usually only) one
    if let Ok(entries) = fs::read_dir(&target_dir) {
        let mut versions: Vec<PathBuf> = entries
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.is_dir())
            .collect();
        // Sort so we pick the highest version if multiple exist
        versions.sort();
        return versions.into_iter().next();
    }

    None
}

pub fn compile(src: &PathBuf, out: &PathBuf, settings: &Settings) -> CompileResult {
    let compiler = detect_compiler(settings);
    let compiler_path = PathBuf::from(&compiler);
    let default_path = PathBuf::from(".");
    let compiler_dir = compiler_path.parent().unwrap_or(&default_path);

    let mut args = settings.compile_flags.clone();

    if cfg!(target_os = "windows") {
        // Stack size from config
        args.push(format!("-Wl,--stack={}", settings.stack_size));

        // Dynamically find cc1plus location
        if let Some(libexec) = find_libexec_dir(compiler_dir) {
            args.push(format!("-B{}", libexec.display()));
        }
    }

    args.push("-o".to_string());
    args.push(out.to_string_lossy().to_string());
    args.push(src.to_string_lossy().to_string());

    let output = if cfg!(target_os = "windows") {
        let mut command = Command::new(&compiler);
        command.args(&args);
        if let Some(path) = path_with_compiler_bin(settings) {
            command.env("PATH", path);
        }
        command
            .creation_flags(0x00000008) // CREATE_NO_WINDOW
            .output()
    } else {
        let mut command = Command::new(&compiler);
        command.args(&args);
        if let Some(path) = path_with_compiler_bin(settings) {
            command.env("PATH", path);
        }
        command.output()
    };

    match output {
        Ok(o) => {
            if o.status.success() {
                CompileResult { success: true, error: None, raw_error: None }
            } else {
                let raw = String::from_utf8_lossy(&o.stderr).to_string();
                CompileResult { success: false, error: Some(translate_gcc_error(&raw)), raw_error: Some(raw) }
            }
        }
        Err(e) => CompileResult { success: false, error: Some(e.to_string()), raw_error: None },
    }
}
