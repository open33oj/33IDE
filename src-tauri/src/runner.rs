use std::process::Command;
use std::path::PathBuf;
use crate::settings::Settings;
use crate::compiler::detect_compiler;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

pub struct RunResult {
    pub status: String,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub time_ms: u128,
}

pub fn run(bin: &PathBuf, input: &str, settings: &Settings) -> RunResult {
    let compiler = detect_compiler(settings);
    let compiler_bin = PathBuf::from(&compiler)
        .parent()
        .unwrap_or(&PathBuf::from("."))
        .to_path_buf();

    let mut cmd = Command::new(bin);
    cmd.env("PATH", format!("{};{}", compiler_bin.display(), std::env::var("PATH").unwrap_or_default()))
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    #[cfg(windows)]
    cmd.creation_flags(0x00000008); // CREATE_NO_WINDOW

    let result = cmd.spawn()
        .and_then(|mut child| {
            if let Some(mut stdin) = child.stdin.take() {
                use std::io::Write;
                let _ = stdin.write_all(input.as_bytes());
            }
            let start = std::time::Instant::now();
            let output = child.wait_with_output();
            output.map(|o| (o, start.elapsed().as_millis()))
        });

    match result {
        Ok((output, elapsed)) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let code = output.status.code();
            let status = if code == Some(0) { "ok" } else { "runtime_error" };
            RunResult {
                status: status.to_string(),
                stdout,
                stderr,
                exit_code: code,
                time_ms: elapsed,
            }
        }
        Err(e) => RunResult {
            status: "error".to_string(),
            stdout: String::new(),
            stderr: e.to_string(),
            exit_code: None,
            time_ms: 0,
        },
    }
}
