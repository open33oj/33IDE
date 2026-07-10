#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

mod settings;
mod compiler;
mod runner;
mod clangd;

use settings::Settings;
use compiler::{cancel_current_compile, compile};
use runner::{cancel_current_run, resolve_working_dir, run, run_streaming};
use std::sync::Mutex;

static RUN_TASK_ACTIVE: AtomicBool = AtomicBool::new(false);
static TEMP_RUN_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Serialize, Deserialize)]
pub struct RunResult {
    pub status: String,
    pub stdout: String,
    pub stderr: String,
    pub raw_stderr: String,
    pub exit_code: Option<i32>,
    pub time_ms: u128,
}

fn temp_runs_root() -> PathBuf {
    std::env::temp_dir().join("33ide").join("runs")
}

fn cleanup_stale_run_dirs(root: &Path) {
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };
    let now = std::time::SystemTime::now();
    let max_age = std::time::Duration::from_secs(24 * 60 * 60);

    for entry in entries.filter_map(Result::ok) {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        let Ok(modified) = metadata.modified() else {
            continue;
        };
        let Ok(age) = now.duration_since(modified) else {
            continue;
        };
        if age >= max_age {
            let _ = fs::remove_dir_all(path);
        }
    }
}

fn create_run_dir(prefix: &str) -> Result<PathBuf, String> {
    let root = temp_runs_root();
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    cleanup_stale_run_dirs(&root);

    let counter = TEMP_RUN_COUNTER.fetch_add(1, Ordering::SeqCst);
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();
    let dir = root.join(format!("{}-{}-{}-{}", prefix, std::process::id(), now, counter));
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn remove_run_dir(dir: &Path) {
    let _ = fs::remove_dir_all(dir);
}

fn requires_real_console(code: &str) -> bool {
    #[cfg(windows)]
    {
        let lower = code.to_ascii_lowercase();
        let markers = [
            "getasynckeystate(",
            "getkeystate(",
            "getstdhandle(std_output_handle)",
            "getstdhandle(std_input_handle)",
            "setconsolecursorposition(",
            "setconsoletextattribute(",
            "setconsolewindowinfo(",
            "setconsolescreenbuffersize(",
            "setconsolecursorinfo(",
            "readconsoleinput(",
            "writeconsoleoutput(",
            "writeconsoleoutputcharacter(",
            "fillconsoleoutputcharacter(",
            "fillconsoleoutputattribute(",
            "setconsolectrlhandler(",
            "getconsolewindow(",
            "peekconsoleinput(",
            "flushconsoleinputbuffer(",
            "setwindowlongptra(getconsolewindow()",
            "setwindowlongptrw(getconsolewindow()",
            "system(\"pause\")",
            "system(\"cls\")",
        ];
        let has_windows_console_header = lower.contains("#include <windows.h>");
        let has_console_api = markers.iter().any(|marker| lower.contains(marker));
        let has_vk_key_usage = lower.contains("vk_left")
            || lower.contains("vk_right")
            || lower.contains("vk_up")
            || lower.contains("vk_down")
            || lower.contains("vk_space")
            || lower.contains("vk_tab");

        (has_windows_console_header && has_console_api) || has_vk_key_usage
    }

    #[cfg(not(windows))]
    {
        let _ = code;
        false
    }
}

fn console_required_message() -> String {
    "This program uses Windows console APIs and cannot run reliably in the embedded output panel. Use \"Run In Terminal\" instead.".to_string()
}

#[tauri::command]
fn get_compiler_info() -> Result<String, String> {
    let settings = Settings::load();
    compiler::get_compiler_info(&settings)
}

#[tauri::command]
fn get_default_compiler_path() -> Result<String, String> {
    let mut settings = Settings::load();
    settings.compiler_path.clear();
    Ok(compiler::detect_compiler(&settings))
}

#[derive(Debug, Serialize, Clone)]
pub struct RunPhasePayload {
    pub phase: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct RunOutputPayload {
    pub stream: String,
    pub text: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct RunFinishedPayload {
    pub status: String,
    pub stderr: String,
    pub raw_stderr: String,
    pub exit_code: Option<i32>,
    pub time_ms: u128,
}

#[tauri::command]
fn compile_and_run(code: String, input: Option<String>, file_path: Option<String>) -> Result<RunResult, String> {
    let settings = Settings::load();
    let run_dir = create_run_dir("inline")?;
    let src = run_dir.join("main.cpp");
    let bin = run_dir.join(if cfg!(windows) { "main.exe" } else { "main" });
    fs::write(&src, &code).map_err(|e| e.to_string())?;
    let cr = compile(&src, &bin, &settings);
    if !cr.success {
        remove_run_dir(&run_dir);
        return Ok(RunResult {
            status: cr.status.unwrap_or_else(|| "compile_error".to_string()),
            stdout: String::new(),
            stderr: cr.error.unwrap_or_default(),
            raw_stderr: cr.raw_error.unwrap_or_default(),
            exit_code: None,
            time_ms: 0,
        });
    }
    if requires_real_console(&code) {
        remove_run_dir(&run_dir);
        return Ok(RunResult {
            status: "interactive_console_required".to_string(),
            stdout: String::new(),
            stderr: console_required_message(),
            raw_stderr: String::new(),
            exit_code: None,
            time_ms: 0,
        });
    }
    let working_dir = resolve_working_dir(&run_dir, file_path.as_deref());
    let result = run(&bin, &input.unwrap_or_default(), &settings, &working_dir);
    remove_run_dir(&run_dir);
    Ok(RunResult {
        status: result.status,
        stdout: result.stdout,
        stderr: result.stderr.clone(),
        raw_stderr: result.stderr,
        exit_code: result.exit_code,
        time_ms: result.time_ms,
    })
}

#[tauri::command]
fn start_compile_and_run(app: AppHandle, code: String, input: Option<String>, file_path: Option<String>) -> Result<(), String> {
    if RUN_TASK_ACTIVE.swap(true, Ordering::SeqCst) {
        return Err("A run task is already active".to_string());
    }

    std::thread::spawn(move || {
        let result = compile_and_run_streaming(app.clone(), code, input, file_path);
        if let Err(error) = result {
            let _ = app.emit(
                "run-finished",
                RunFinishedPayload {
                    status: "error".to_string(),
                    stderr: error.clone(),
                    raw_stderr: error,
                    exit_code: None,
                    time_ms: 0,
                },
            );
        }
        RUN_TASK_ACTIVE.store(false, Ordering::SeqCst);
    });

    Ok(())
}

fn compile_and_run_streaming(app: AppHandle, code: String, input: Option<String>, file_path: Option<String>) -> Result<(), String> {
    let _ = app.emit(
        "run-phase",
        RunPhasePayload {
            phase: "compiling".to_string(),
        },
    );

    let settings = Settings::load();
    let run_dir = create_run_dir("stream")?;
    let src = run_dir.join("main.cpp");
    let bin = run_dir.join(if cfg!(windows) { "main.exe" } else { "main" });
    fs::write(&src, &code).map_err(|e| e.to_string())?;

    let cr = compile(&src, &bin, &settings);
    if !cr.success {
        remove_run_dir(&run_dir);
        let status = cr.status.unwrap_or_else(|| "compile_error".to_string());
        let _ = app.emit(
            "run-finished",
            RunFinishedPayload {
                status,
                stderr: cr.error.unwrap_or_default(),
                raw_stderr: cr.raw_error.unwrap_or_default(),
                exit_code: None,
                time_ms: 0,
            },
        );
        return Ok(());
    }

    if requires_real_console(&code) {
        remove_run_dir(&run_dir);
        let _ = app.emit(
            "run-finished",
            RunFinishedPayload {
                status: "interactive_console_required".to_string(),
                stderr: console_required_message(),
                raw_stderr: String::new(),
                exit_code: None,
                time_ms: 0,
            },
        );
        return Ok(());
    }

    let _ = app.emit(
        "run-phase",
        RunPhasePayload {
            phase: "running".to_string(),
        },
    );

    let working_dir = resolve_working_dir(&run_dir, file_path.as_deref());
    let result = run_streaming(&bin, &input.unwrap_or_default(), &settings, &working_dir, |stream, text| {
        let _ = app.emit(
            "run-output",
            RunOutputPayload {
                stream: stream.to_string(),
                text: text.to_string(),
            },
        );
    });

    remove_run_dir(&run_dir);

    let _ = app.emit(
        "run-finished",
        RunFinishedPayload {
            status: result.status,
            stderr: result.stderr.clone(),
            raw_stderr: result.stderr,
            exit_code: result.exit_code,
            time_ms: result.time_ms,
        },
    );

    Ok(())
}

#[tauri::command]
fn cancel_run() -> Result<bool, String> {
    Ok(cancel_current_compile() || cancel_current_run())
}

#[tauri::command]
fn run_in_terminal(code: String, file_path: Option<String>) -> Result<serde_json::Value, String> {
    let settings = Settings::load();
    let run_dir = create_run_dir("terminal")?;
    let src = run_dir.join("main.cpp");
    let bin = run_dir.join(if cfg!(windows) { "main.exe" } else { "main" });
    fs::write(&src, &code).map_err(|e| e.to_string())?;
    let cr = compile(&src, &bin, &settings);
    if !cr.success {
        remove_run_dir(&run_dir);
        return Ok(serde_json::json!({
            "ok": false,
            "error": cr.error.unwrap_or_default(),
            "raw_error": cr.raw_error.unwrap_or_default(),
        }));
    }
    if cfg!(windows) {
        let bat = run_dir.join("run.bat");
        let working_dir = resolve_working_dir(&run_dir, file_path.as_deref());
        let path_line = compiler::compiler_bin_dir(&settings)
            .map(|dir| format!("set \"PATH={};%PATH%\"\r\n", dir.display()))
            .unwrap_or_default();
        fs::write(&bat, format!(
            "@echo off\r\nchcp 65001 >nul\r\nset LANG=zh_CN.UTF-8\r\nset LC_ALL=zh_CN.UTF-8\r\n{}cd /d \"{}\"\r\n\"{}\"\r\necho.\r\npause\r\n",
            path_line,
            working_dir.display(),
            bin.display()
        )).map_err(|e| e.to_string())?;
        let mut command = Command::new("cmd.exe");
        command.args(["/c", "start", "", "cmd.exe", "/d", "/k", &bat.to_string_lossy()]);
        if let Some(path) = compiler::path_with_compiler_bin(&settings) {
            command.env("PATH", path);
        }
        command.spawn().map_err(|e| e.to_string())?;
    } else {
        Command::new("open")
            .args(&["-a", "Terminal", &bin.to_string_lossy()])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, &content).map_err(|e| e.to_string())
}

#[tauri::command]
fn reveal_in_explorer(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .args(&["/select,", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(&["-R", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        let dir = std::path::Path::new(&path)
            .parent()
            .unwrap_or(std::path::Path::new("/"));
        Command::new("xdg-open")
            .arg(dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn open_run_cache_dir() -> Result<(), String> {
    let dir = temp_runs_root();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(&dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn get_settings() -> Result<Settings, String> {
    Ok(Settings::load())
}

#[tauri::command]
fn save_settings(new_settings: Settings) -> Result<(), String> {
    new_settings.save()
}

#[tauri::command]
fn read_template() -> String {
    Settings::load().default_template
}

#[tauri::command]
fn format_code(code: String, _tab_size: u32) -> Result<String, String> {
    let settings = Settings::load();
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| std::path::PathBuf::from("."));

    let cf_candidates = vec![
        exe_dir.join("tools").join("clang-format.exe"),
        exe_dir.join("_up_").join("tools").join("clang-format.exe"),
        exe_dir.join("resources").join("tools").join("clang-format.exe"),
        exe_dir.join("..").join("..").join("..").join("tools").join("clang-format.exe"),
        std::path::PathBuf::from("tools/clang-format.exe"),
    ];

    let cf_path = match cf_candidates.iter().find(|p| p.exists()) {
        Some(p) => p.clone(),
        None => return Err("clang-format not found. Please make sure tools/clang-format.exe is packaged correctly.".to_string()),
    };

    let tab_size = settings.editor_tab_size.max(1);
    let break_before_braces = if settings.clang_format_brace_on_new_line {
        "Allman"
    } else {
        "Attach"
    };
    let style = format!(
        "{{BasedOnStyle: LLVM, IndentWidth: {0}, TabWidth: {0}, UseTab: Never, ColumnLimit: 0, BreakBeforeBraces: {1}}}",
        tab_size,
        break_before_braces
    );

    let output = Command::new(&cf_path)
        .arg(format!("--style={style}"))
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .creation_flags(0x00000008)
        .spawn()
        .and_then(|mut child| {
            if let Some(mut stdin) = child.stdin.take() {
                use std::io::Write;
                let _ = stdin.write_all(code.as_bytes());
            }
            child.wait_with_output()
        });

    match output {
        Ok(o) if o.status.success() => Ok(String::from_utf8_lossy(&o.stdout).to_string()),
        Ok(o) => {
            let stderr = String::from_utf8_lossy(&o.stderr).trim().to_string();
            Err(if stderr.is_empty() {
                format!("clang-format exited with status {}", o.status)
            } else {
                stderr
            })
        }
        Err(e) => Err(format!("failed to run clang-format at {}: {}", cf_path.display(), e)),
    }
}

#[tauri::command]
fn clangd_complete(
    state: tauri::State<'_, Mutex<clangd::ClangdClient>>,
    code: String,
    file_path: Option<String>,
    line: u32,
    character: u32,
    trigger_character: Option<String>,
) -> Result<Vec<clangd::LspCompletionItem>, String> {
    state
        .lock()
        .map_err(|e| e.to_string())?
        .complete(code, file_path, line, character, trigger_character)
}

#[tauri::command]
fn clangd_hover(
    state: tauri::State<'_, Mutex<clangd::ClangdClient>>,
    code: String,
    file_path: Option<String>,
    line: u32,
    character: u32,
) -> Result<Option<String>, String> {
    state
        .lock()
        .map_err(|e| e.to_string())?
        .hover(code, file_path, line, character)
}

#[tauri::command]
fn clangd_signature_help(
    state: tauri::State<'_, Mutex<clangd::ClangdClient>>,
    code: String,
    file_path: Option<String>,
    line: u32,
    character: u32,
) -> Result<Option<clangd::LspSignature>, String> {
    state
        .lock()
        .map_err(|e| e.to_string())?
        .signature_help(code, file_path, line, character)
}

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

fn main() {
    eprintln!("[33IDE] Starting application...");
    eprintln!("[33IDE] Current exe: {:?}", std::env::current_exe());
    eprintln!("[33IDE] CWD: {:?}", std::env::current_dir());

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(Mutex::new(clangd::ClangdClient::default()))
        .invoke_handler(tauri::generate_handler![
            get_default_compiler_path,
            get_compiler_info,
            compile_and_run,
            start_compile_and_run,
            cancel_run,
            run_in_terminal,
            open_run_cache_dir,
            read_file,
            write_file,
            reveal_in_explorer,
            get_settings,
            save_settings,
            read_template,
            format_code,
            clangd_complete,
            clangd_hover,
            clangd_signature_help,
            exit_app,
        ]);

    builder
        .setup(|app| {
            let version = app.package_info().version.to_string();
            let title = format!("33IDE Lite v{}", version);
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title(&title);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
