use std::process::Command;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
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

static CURRENT_RUN_PID: OnceLock<Mutex<Option<u32>>> = OnceLock::new();
static RUN_CANCELLED: AtomicBool = AtomicBool::new(false);

fn run_pid_slot() -> &'static Mutex<Option<u32>> {
    CURRENT_RUN_PID.get_or_init(|| Mutex::new(None))
}

fn set_current_run_pid(pid: Option<u32>) {
    if let Ok(mut slot) = run_pid_slot().lock() {
        *slot = pid;
    }
}

pub fn cancel_current_run() -> bool {
    RUN_CANCELLED.store(true, Ordering::SeqCst);
    let pid = run_pid_slot().lock().ok().and_then(|slot| *slot);
    let Some(pid) = pid else {
        return false;
    };

    #[cfg(windows)]
    {
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .creation_flags(0x00000008)
            .output();
        true
    }

    #[cfg(not(windows))]
    {
        let _ = Command::new("kill").args(["-TERM", &pid.to_string()]).output();
        true
    }
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

    RUN_CANCELLED.store(false, Ordering::SeqCst);

    let result = cmd.spawn().and_then(|mut child| {
        set_current_run_pid(Some(child.id()));

        if let Some(mut stdin) = child.stdin.take() {
            use std::io::Write;
            let _ = stdin.write_all(input.as_bytes());
        }

        let start = Instant::now();
        let timeout = Duration::from_millis(settings.time_limit_ms.max(1));
        let mut timed_out = false;

        loop {
            if child.try_wait()?.is_some() {
                break;
            }

            if RUN_CANCELLED.load(Ordering::SeqCst) {
                let _ = child.kill();
                break;
            }

            if start.elapsed() >= timeout {
                timed_out = true;
                let _ = child.kill();
                break;
            }

            std::thread::sleep(Duration::from_millis(10));
        }

        let output = child.wait_with_output();
        set_current_run_pid(None);
        output.map(|o| (o, start.elapsed().as_millis(), timed_out))
    });

    match result {
        Ok((output, elapsed, timed_out)) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let code = output.status.code();
            let status = if RUN_CANCELLED.swap(false, Ordering::SeqCst) {
                "cancelled"
            } else if timed_out {
                "timeout"
            } else if code == Some(0) {
                "ok"
            } else {
                "runtime_error"
            };
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
