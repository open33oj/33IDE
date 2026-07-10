use std::process::Command;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use std::time::Duration;
use crate::settings::Settings;
use crate::compiler::path_with_compiler_bin;
use crate::process_runner::{self, ManagedCommandOptions, ProcessSlot};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

pub struct RunResult {
    pub status: String,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub time_ms: u128,
}

static CURRENT_RUN_PROCESS: ProcessSlot = OnceLock::new();
static RUN_CANCELLED: AtomicBool = AtomicBool::new(false);
const MAX_OUTPUT_BYTES: usize = 1024 * 1024;
const KILL_WAIT_TIMEOUT_MS: u64 = 1500;

pub fn cancel_current_run() -> bool {
    process_runner::cancel_current_process(&CURRENT_RUN_PROCESS, &RUN_CANCELLED)
}

pub fn resolve_working_dir(run_dir: &Path, file_path: Option<&str>) -> PathBuf {
    file_path
        .and_then(|path| Path::new(path).parent().map(Path::to_path_buf))
        .filter(|path| path.exists())
        .unwrap_or_else(|| run_dir.to_path_buf())
}

pub fn run(bin: &PathBuf, input: &str, settings: &Settings, working_dir: &Path) -> RunResult {
    let mut cmd = Command::new(bin);
    if let Some(path) = path_with_compiler_bin(settings) {
        cmd.env("PATH", path);
    }
    cmd.current_dir(working_dir);

    #[cfg(windows)]
    cmd.creation_flags(0x00000008); // CREATE_NO_WINDOW

    RUN_CANCELLED.store(false, Ordering::SeqCst);

    let options = ManagedCommandOptions {
        input: Some(input),
        timeout: Duration::from_millis(settings.time_limit_ms.max(1)),
        output_limit: Some(MAX_OUTPUT_BYTES),
        kill_wait_timeout: Duration::from_millis(KILL_WAIT_TIMEOUT_MS),
    };

    match process_runner::run_managed_command(&mut cmd, options, &RUN_CANCELLED, &CURRENT_RUN_PROCESS, |_, _| {}) {
        Ok(output) => {
            let status = if output.cancelled {
                "cancelled"
            } else if output.timed_out {
                "timeout"
            } else if output.output_limited {
                "output_limit"
            } else if output.exit_code == Some(0) {
                "ok"
            } else {
                "runtime_error"
            };
            RunResult {
                status: status.to_string(),
                stdout: output.stdout,
                stderr: output.stderr,
                exit_code: output.exit_code,
                time_ms: output.time_ms,
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

pub fn run_streaming<F>(bin: &PathBuf, input: &str, settings: &Settings, working_dir: &Path, mut on_output: F) -> RunResult
where
    F: FnMut(&str, &str),
{
    let mut cmd = Command::new(bin);
    if let Some(path) = path_with_compiler_bin(settings) {
        cmd.env("PATH", path);
    }
    cmd.current_dir(working_dir);

    #[cfg(windows)]
    cmd.creation_flags(0x00000008); // CREATE_NO_WINDOW

    RUN_CANCELLED.store(false, Ordering::SeqCst);

    let options = ManagedCommandOptions {
        input: Some(input),
        timeout: Duration::from_millis(settings.time_limit_ms.max(1)),
        output_limit: Some(MAX_OUTPUT_BYTES),
        kill_wait_timeout: Duration::from_millis(KILL_WAIT_TIMEOUT_MS),
    };

    match process_runner::run_managed_command(&mut cmd, options, &RUN_CANCELLED, &CURRENT_RUN_PROCESS, |stream, text| {
        on_output(stream, text);
    }) {
        Ok(output) => {
            let status = if output.cancelled {
                "cancelled"
            } else if output.timed_out {
                "timeout"
            } else if output.output_limited {
                "output_limit"
            } else if output.exit_code == Some(0) {
                "ok"
            } else {
                "runtime_error"
            };
            RunResult {
                status: status.to_string(),
                stdout: output.stdout,
                stderr: output.stderr,
                exit_code: output.exit_code,
                time_ms: output.time_ms,
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
