use std::process::Command;
use std::path::PathBuf;
use std::fs;
use crate::settings::Settings;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

pub struct CompileResult {
    pub success: bool,
    pub error: Option<String>,
}

fn translate_gcc_error(msg: &str) -> String {
    let mut result = msg.to_string();
    let translations = vec![
        ("error: ", "错误："),
        ("warning: ", "警告："),
        ("fatal error: ", "致命错误："),
        ("undefined reference to", "未定义的引用："),
        ("expected", "期望"),
        ("was expected", "被期望"),
        ("no matching function for call to", "没有匹配的函数调用："),
        ("too few arguments to function", "函数参数太少："),
        ("too many arguments to function", "函数参数太多："),
        ("redefinition of", "重复定义："),
        ("redeclaration of", "重复声明："),
        ("undeclared", "未声明的"),
        ("not declared in this scope", "未在此作用域中声明"),
        ("use of undeclared identifier", "使用了未声明的标识符"),
        ("no viable conversion", "无法转换"),
        ("cannot initialize", "无法初始化"),
        ("invalid conversion from", "无效的转换："),
        ("invalid use of", "无效的使用："),
        ("lvalue required as", "需要左值作为"),
        ("rvalue", "右值"),
        ("assignment of read-only", "赋值给只读变量"),
        ("segmentation fault", "段错误（访问了非法内存）"),
        ("core dumped", "核心已转储"),
        ("no such file or directory", "没有这个文件或目录"),
        ("permission denied", "权限被拒绝"),
        ("cannot find", "找不到"),
        ("linked from", "链接自"),
        ("ld returned", "链接器返回"),
        ("collect2", "链接器"),
        ("undefined symbol", "未定义的符号"),
        ("multiple definition", "重复定义"),
        ("first defined here", "首次定义在此"),
        ("in instantiation of", "在实例化："),
        ("required from", "要求从"),
        ("note:", "注意："),
        ("In function", "在函数中"),
        ("At global scope", "在全局作用域"),
        ("expected ';' before", "在...之前期望 ';'"),
        ("expected '}' before", "在...之前期望 '}'"),
        ("expected ')' before", "在...之前期望 ')'"),
        ("expected ']' before", "在...之前期望 ']'"),
        ("stray '\\", "多余的字符 '\\"),
        ("unused variable", "未使用的变量"),
        ("set but not used", "已设置但未使用"),
        ("control reaches end of non-void function", "控制流到达了非 void 函数的末尾（缺少 return）"),
        ("no return statement in function returning non-void", "返回非 void 的函数中没有 return 语句"),
        ("comparison between signed and unsigned", "有符号数和无符号数之间的比较"),
        ("integer overflow", "整数溢出"),
        ("division by zero", "除以零"),
        ("array subscript out of bounds", "数组下标越界"),
        ("stack overflow", "栈溢出"),
        ("heap overflow", "堆溢出"),
        ("memory leak", "内存泄漏"),
        ("use after free", "释放后使用"),
        ("double free", "重复释放"),
        ("nullptr", "空指针"),
        ("null pointer", "空指针"),
        ("does not name a type", "不是一个类型名"),
        ("is not a member of", "不是...的成员"),
        ("is private", "是私有的"),
        ("is protected", "是受保护的"),
        ("template argument", "模板参数"),
        ("no match for", "没有匹配的"),
        ("candidates are", "候选函数是"),
        ("candidate expects", "候选函数期望"),
        ("incompatible", "不兼容"),
        ("ambiguous", "歧义"),
        ("overflow", "溢出"),
        ("underflow", "下溢"),
        ("out of memory", "内存不足"),
        ("timeout", "超时"),
        ("timed out", "已超时"),
    ];

    for (en, zh) in &translations {
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
        let bin_dir = compiler_dir.to_string_lossy().to_string();
        let current_path = std::env::var("PATH").unwrap_or_default();
        Command::new(&compiler)
            .args(&args)
            .env("PATH", format!("{};{}", bin_dir, current_path))
            .creation_flags(0x00000008) // CREATE_NO_WINDOW
            .output()
    } else {
        Command::new(&compiler).args(&args).output()
    };

    match output {
        Ok(o) => {
            if o.status.success() {
                CompileResult { success: true, error: None }
            } else {
                let raw = String::from_utf8_lossy(&o.stderr).to_string();
                CompileResult { success: false, error: Some(translate_gcc_error(&raw)) }
            }
        }
        Err(e) => CompileResult { success: false, error: Some(e.to_string()) },
    }
}
