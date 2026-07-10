use std::io::Read;
use std::process::{Child, Command};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{mpsc, Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use crate::settings::Settings;
use crate::compiler::path_with_compiler_bin;

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
const MAX_OUTPUT_BYTES: usize = 1024 * 1024;
const KILL_WAIT_TIMEOUT_MS: u64 = 1500;

fn run_pid_slot() -> &'static Mutex<Option<u32>> {
    CURRENT_RUN_PID.get_or_init(|| Mutex::new(None))
}

fn set_current_run_pid(pid: Option<u32>) {
    if let Ok(mut slot) = run_pid_slot().lock() {
        *slot = pid;
    }
}

fn kill_process_tree(pid: u32) -> bool {
    #[cfg(windows)]
    {
        Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .creation_flags(0x00000008)
            .output()
            .is_ok()
    }

    #[cfg(not(windows))]
    {
        Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .output()
            .is_ok()
    }
}

fn request_kill_process_tree(pid: u32) {
    std::thread::spawn(move || {
        let _ = kill_process_tree(pid);
    });
}

fn terminate_child(child: &mut Child) -> (Option<i32>, bool) {
    let _ = child.kill();
    request_kill_process_tree(child.id());

    let start = Instant::now();
    while start.elapsed() < Duration::from_millis(KILL_WAIT_TIMEOUT_MS) {
        match child.try_wait() {
            Ok(Some(status)) => return (status.code(), true),
            Ok(None) => std::thread::sleep(Duration::from_millis(10)),
            Err(_) => return (None, false),
        }
    }

    (None, false)
}

pub fn cancel_current_run() -> bool {
    RUN_CANCELLED.store(true, Ordering::SeqCst);
    let pid = run_pid_slot().lock().ok().and_then(|slot| *slot);
    let Some(pid) = pid else {
        return false;
    };
    request_kill_process_tree(pid);
    true
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
    cmd.stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .current_dir(working_dir);

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
        let mut termination_confirmed = true;

        loop {
            if child.try_wait()?.is_some() {
                break;
            }

            if RUN_CANCELLED.load(Ordering::SeqCst) {
                termination_confirmed = terminate_child(&mut child).1;
                break;
            }

            if start.elapsed() >= timeout {
                timed_out = true;
                termination_confirmed = terminate_child(&mut child).1;
                break;
            }

            std::thread::sleep(Duration::from_millis(10));
        }

        if !termination_confirmed {
            set_current_run_pid(None);
            return Err(std::io::Error::new(
                std::io::ErrorKind::TimedOut,
                "process did not exit after kill request",
            ));
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

pub fn run_streaming<F>(bin: &PathBuf, input: &str, settings: &Settings, working_dir: &Path, mut on_output: F) -> RunResult
where
    F: FnMut(&str, &str),
{
    let mut cmd = Command::new(bin);
    if let Some(path) = path_with_compiler_bin(settings) {
        cmd.env("PATH", path);
    }
    cmd.stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .current_dir(working_dir);

    #[cfg(windows)]
    cmd.creation_flags(0x00000008); // CREATE_NO_WINDOW

    RUN_CANCELLED.store(false, Ordering::SeqCst);

    let spawn_result = cmd.spawn();
    let mut child = match spawn_result {
        Ok(child) => child,
        Err(e) => {
            return RunResult {
                status: "error".to_string(),
                stdout: String::new(),
                stderr: e.to_string(),
                exit_code: None,
                time_ms: 0,
            };
        }
    };

    set_current_run_pid(Some(child.id()));

    if let Some(mut stdin) = child.stdin.take() {
        use std::io::Write;
        let _ = stdin.write_all(input.as_bytes());
    }

    let (tx, rx) = mpsc::channel::<(&'static str, String)>();
    let output_bytes = Arc::new(AtomicUsize::new(0));
    let output_limited = Arc::new(AtomicBool::new(false));
    let stdout_handle = child.stdout.take().map(|stdout| {
        let tx = tx.clone();
        let output_bytes = output_bytes.clone();
        let output_limited = output_limited.clone();
        std::thread::spawn(move || read_stream("stdout", stdout, tx, output_bytes, output_limited))
    });
    let stderr_handle = child.stderr.take().map(|stderr| {
        let tx = tx.clone();
        let output_bytes = output_bytes.clone();
        let output_limited = output_limited.clone();
        std::thread::spawn(move || read_stream("stderr", stderr, tx, output_bytes, output_limited))
    });
    drop(tx);

    let start = Instant::now();
    let timeout = Duration::from_millis(settings.time_limit_ms.max(1));
    let mut timed_out = false;
    let mut output_limit_hit = false;
    let mut termination_confirmed = true;
    let exit_code: Option<i32>;
    let mut stdout_text = String::new();
    let mut stderr_text = String::new();

    loop {
        while let Ok((stream, text)) = rx.try_recv() {
            if stream == "stderr" {
                stderr_text.push_str(&text);
            } else {
                stdout_text.push_str(&text);
            }
            on_output(stream, &text);
        }

        if output_limited.load(Ordering::SeqCst) {
            output_limit_hit = true;
            let terminated = terminate_child(&mut child);
            exit_code = terminated.0;
            termination_confirmed = terminated.1;
            break;
        }

        match child.try_wait() {
            Ok(Some(status)) => {
                exit_code = status.code();
                break;
            }
            Ok(None) => {}
            Err(e) => {
                set_current_run_pid(None);
                return RunResult {
                    status: "error".to_string(),
                    stdout: stdout_text,
                    stderr: e.to_string(),
                    exit_code: None,
                    time_ms: start.elapsed().as_millis(),
                };
            }
        }

        if RUN_CANCELLED.load(Ordering::SeqCst) {
            let terminated = terminate_child(&mut child);
            exit_code = terminated.0;
            termination_confirmed = terminated.1;
            break;
        }

        if start.elapsed() >= timeout {
            timed_out = true;
            let terminated = terminate_child(&mut child);
            exit_code = terminated.0;
            termination_confirmed = terminated.1;
            break;
        }

        std::thread::sleep(Duration::from_millis(10));
    }

    if termination_confirmed {
        if let Some(handle) = stdout_handle {
            let _ = handle.join();
        }
        if let Some(handle) = stderr_handle {
            let _ = handle.join();
        }
    }

    while let Ok((stream, text)) = rx.try_recv() {
        if stream == "stderr" {
            stderr_text.push_str(&text);
        } else {
            stdout_text.push_str(&text);
        }
        on_output(stream, &text);
    }

    set_current_run_pid(None);

    let status = if RUN_CANCELLED.swap(false, Ordering::SeqCst) {
        "cancelled"
    } else if timed_out {
        "timeout"
    } else if output_limit_hit {
        "output_limit"
    } else if exit_code == Some(0) {
        "ok"
    } else {
        "runtime_error"
    };

    RunResult {
        status: status.to_string(),
        stdout: stdout_text,
        stderr: stderr_text,
        exit_code,
        time_ms: start.elapsed().as_millis(),
    }
}

fn read_stream<R: Read + Send + 'static>(
    stream: &'static str,
    mut reader: R,
    tx: mpsc::Sender<(&'static str, String)>,
    output_bytes: Arc<AtomicUsize>,
    output_limited: Arc<AtomicBool>,
) {
    let mut buffer = [0u8; 1024];
    loop {
        match reader.read(&mut buffer) {
            Ok(0) => break,
            Ok(n) => {
                let previous = output_bytes.fetch_add(n, Ordering::SeqCst);
                if previous >= MAX_OUTPUT_BYTES {
                    output_limited.store(true, Ordering::SeqCst);
                    break;
                }

                let allowed = (MAX_OUTPUT_BYTES - previous).min(n);
                let text = String::from_utf8_lossy(&buffer[..allowed]).to_string();
                if tx.send((stream, text)).is_err() {
                    break;
                }
                if allowed < n {
                    output_limited.store(true, Ordering::SeqCst);
                    break;
                }
            }
            Err(_) => break,
        }
    }
}
