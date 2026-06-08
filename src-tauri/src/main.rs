#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::process::Command;
use serde::{Deserialize, Serialize};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

mod settings;
mod compiler;
mod runner;
mod clangd;

use settings::Settings;
use compiler::compile;
use runner::{cancel_current_run, run};
use std::sync::Mutex;

#[derive(Debug, Serialize, Deserialize)]
pub struct RunResult {
    pub status: String,
    pub stdout: String,
    pub stderr: String,
    pub raw_stderr: String,
    pub exit_code: Option<i32>,
    pub time_ms: u128,
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

#[tauri::command]
fn compile_and_run(code: String, input: Option<String>) -> Result<RunResult, String> {
    let settings = Settings::load();
    let tmp_dir = std::env::temp_dir().join("33ide");
    fs::create_dir_all(&tmp_dir).map_err(|e| e.to_string())?;
    let src = tmp_dir.join("sol.cpp");
    let bin = tmp_dir.join(if cfg!(windows) { "sol.exe" } else { "sol" });
    fs::write(&src, &code).map_err(|e| e.to_string())?;
    let cr = compile(&src, &bin, &settings);
    if !cr.success {
        let _ = fs::remove_file(&src);
        return Ok(RunResult {
            status: "compile_error".to_string(),
            stdout: String::new(),
            stderr: cr.error.unwrap_or_default(),
            raw_stderr: cr.raw_error.unwrap_or_default(),
            exit_code: None,
            time_ms: 0,
        });
    }
    let result = run(&bin, &input.unwrap_or_default(), &settings);
    let _ = fs::remove_file(&src);
    let _ = fs::remove_file(&bin);
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
fn cancel_run() -> Result<bool, String> {
    Ok(cancel_current_run())
}

#[tauri::command]
fn run_in_terminal(code: String) -> Result<serde_json::Value, String> {
    let settings = Settings::load();
    let tmp_dir = std::env::temp_dir().join("33ide");
    fs::create_dir_all(&tmp_dir).map_err(|e| e.to_string())?;
    let src = tmp_dir.join("term.cpp");
    let bin = tmp_dir.join(if cfg!(windows) { "term.exe" } else { "term" });
    fs::write(&src, &code).map_err(|e| e.to_string())?;
    let cr = compile(&src, &bin, &settings);
    let _ = fs::remove_file(&src);
    if !cr.success {
        return Ok(serde_json::json!({ "ok": false, "error": cr.error.unwrap_or_default() }));
    }
    if cfg!(windows) {
        let bat = tmp_dir.join("run.bat");
        fs::write(&bat, format!(
            "@echo off\r\ncd /d \"{}\"\r\n\"{}\"\r\necho.\r\npause\r\n",
            bin.parent().unwrap_or(&tmp_dir).display(),
            bin.display()
        )).map_err(|e| e.to_string())?;
        Command::new("cmd.exe")
            .args(&["/c", "start", "cmd.exe", "/c", &bat.to_string_lossy()])
            .spawn()
            .map_err(|e| e.to_string())?;
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
        None => return Ok(code),
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
        _ => Ok(code),
    }
}

#[tauri::command]
fn clangd_complete(
    state: tauri::State<'_, Mutex<clangd::ClangdClient>>,
    code: String,
    file_path: Option<String>,
    line: u32,
    character: u32,
) -> Result<Vec<clangd::LspCompletionItem>, String> {
    state
        .lock()
        .map_err(|e| e.to_string())?
        .complete(code, file_path, line, character)
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
            cancel_run,
            run_in_terminal,
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
