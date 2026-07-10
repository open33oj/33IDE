use std::io::{Read, Write};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{mpsc, Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

#[cfg(windows)]
use std::os::windows::io::AsRawHandle;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
#[cfg(windows)]
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
    SetInformationJobObject, TerminateJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
};

pub type ProcessSlot = OnceLock<Mutex<Option<ManagedProcess>>>;

const OUTPUT_FLUSH_BYTES: usize = 16 * 1024;
const OUTPUT_FLUSH_INTERVAL_MS: u64 = 33;

#[derive(Clone, Copy)]
pub struct ManagedProcess {
    pid: u32,
    #[cfg(windows)]
    job: Option<isize>,
}

pub struct ManagedCommandOptions<'a> {
    pub input: Option<&'a str>,
    pub timeout: Duration,
    pub output_limit: Option<usize>,
    pub kill_wait_timeout: Duration,
}

pub struct ManagedCommandOutput {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub status: Option<ExitStatus>,
    pub time_ms: u128,
    pub timed_out: bool,
    pub cancelled: bool,
    pub output_limited: bool,
}

fn process_slot(slot: &'static ProcessSlot) -> &'static Mutex<Option<ManagedProcess>> {
    slot.get_or_init(|| Mutex::new(None))
}

fn set_current_process(slot: &'static ProcessSlot, process: Option<ManagedProcess>) {
    if let Ok(mut current) = process_slot(slot).lock() {
        *current = process;
    }
}

fn current_process(slot: &'static ProcessSlot) -> Option<ManagedProcess> {
    process_slot(slot).lock().ok().and_then(|current| *current)
}

fn clear_current_process(slot: &'static ProcessSlot) {
    let process = process_slot(slot).lock().ok().and_then(|mut current| current.take());
    if let Some(process) = process {
        close_process_container(process);
    }
}

pub fn cancel_current_process(slot: &'static ProcessSlot, cancelled: &AtomicBool) -> bool {
    cancelled.store(true, Ordering::SeqCst);
    let Some(process) = current_process(slot) else {
        return false;
    };
    request_terminate_process_container(process);
    true
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
        Command::new("kill").args(["-TERM", &pid.to_string()]).output().is_ok()
    }
}

#[cfg(windows)]
fn create_kill_on_close_job() -> Option<isize> {
    unsafe {
        let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if job.is_null() {
            return None;
        }

        let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

        let ok = SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &info as *const _ as *const core::ffi::c_void,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        ) != 0;

        if !ok {
            let _ = CloseHandle(job);
            return None;
        }

        Some(job as isize)
    }
}

#[cfg(windows)]
fn assign_child_to_job(child: &Child, job: isize) -> bool {
    unsafe { AssignProcessToJobObject(job as HANDLE, child.as_raw_handle() as HANDLE) != 0 }
}

#[cfg(windows)]
fn terminate_job(job: isize) -> bool {
    unsafe { TerminateJobObject(job as HANDLE, 1) != 0 }
}

fn register_process(slot: &'static ProcessSlot, child: &Child) {
    #[cfg(windows)]
    {
        let job = create_kill_on_close_job().and_then(|job| {
            if assign_child_to_job(child, job) {
                Some(job)
            } else {
                unsafe {
                    let _ = CloseHandle(job as HANDLE);
                }
                None
            }
        });
        set_current_process(slot, Some(ManagedProcess { pid: child.id(), job }));
        return;
    }

    #[cfg(not(windows))]
    {
        set_current_process(slot, Some(ManagedProcess { pid: child.id() }));
    }
}

fn close_process_container(process: ManagedProcess) {
    #[cfg(windows)]
    if let Some(job) = process.job {
        unsafe {
            let _ = CloseHandle(job as HANDLE);
        }
    }

    #[cfg(not(windows))]
    let _ = process;
}

fn terminate_process_container(process: ManagedProcess) -> bool {
    #[cfg(windows)]
    if let Some(job) = process.job {
        return terminate_job(job);
    }

    kill_process_tree(process.pid)
}

fn request_kill_process_tree(pid: u32) {
    std::thread::spawn(move || {
        let _ = kill_process_tree(pid);
    });
}

fn request_terminate_process_container(process: ManagedProcess) {
    #[cfg(windows)]
    if let Some(job) = process.job {
        let _ = terminate_job(job);
        return;
    }

    std::thread::spawn(move || {
        let _ = terminate_process_container(process);
    });
}

fn terminate_child(slot: &'static ProcessSlot, child: &mut Child, wait_timeout: Duration) -> (Option<i32>, bool) {
    let process = current_process(slot).filter(|process| process.pid == child.id());

    if let Some(process) = process {
        let _ = terminate_process_container(process);
    }

    let _ = child.kill();
    request_kill_process_tree(child.id());

    let start = Instant::now();
    while start.elapsed() < wait_timeout {
        match child.try_wait() {
            Ok(Some(status)) => return (status.code(), true),
            Ok(None) => std::thread::sleep(Duration::from_millis(10)),
            Err(_) => return (None, false),
        }
    }

    (None, false)
}

fn flush_pending_output<F>(stdout: &mut String, stderr: &mut String, on_output: &mut F)
where
    F: FnMut(&str, &str),
{
    if !stdout.is_empty() {
        on_output("stdout", stdout);
        stdout.clear();
    }

    if !stderr.is_empty() {
        on_output("stderr", stderr);
        stderr.clear();
    }
}

pub fn run_managed_command<F>(
    command: &mut Command,
    options: ManagedCommandOptions<'_>,
    cancelled: &AtomicBool,
    slot: &'static ProcessSlot,
    mut on_output: F,
) -> std::io::Result<ManagedCommandOutput>
where
    F: FnMut(&str, &str),
{
    command.stdout(Stdio::piped()).stderr(Stdio::piped());
    if options.input.is_some() {
        command.stdin(Stdio::piped());
    } else {
        command.stdin(Stdio::null());
    }

    let mut child = command.spawn()?;
    register_process(slot, &child);

    if let (Some(input), Some(mut stdin)) = (options.input, child.stdin.take()) {
        let _ = stdin.write_all(input.as_bytes());
    }

    let (tx, rx) = mpsc::channel::<(&'static str, String)>();
    let output_bytes = Arc::new(AtomicUsize::new(0));
    let output_limited = Arc::new(AtomicBool::new(false));
    let stdout_handle = child.stdout.take().map(|stdout| {
        let tx = tx.clone();
        let output_bytes = output_bytes.clone();
        let output_limited = output_limited.clone();
        let limit = options.output_limit;
        std::thread::spawn(move || read_stream("stdout", stdout, tx, output_bytes, output_limited, limit))
    });
    let stderr_handle = child.stderr.take().map(|stderr| {
        let tx = tx.clone();
        let output_bytes = output_bytes.clone();
        let output_limited = output_limited.clone();
        let limit = options.output_limit;
        std::thread::spawn(move || read_stream("stderr", stderr, tx, output_bytes, output_limited, limit))
    });
    drop(tx);

    let start = Instant::now();
    let mut timed_out = false;
    let mut output_limit_hit = false;
    let mut termination_confirmed = true;
    let mut status: Option<ExitStatus> = None;
    let exit_code: Option<i32>;
    let mut stdout_text = String::new();
    let mut stderr_text = String::new();
    let mut pending_stdout = String::new();
    let mut pending_stderr = String::new();
    let mut last_output_flush = Instant::now();
    let mut reported_elapsed: Option<u128> = None;

    loop {
        while let Ok((stream, text)) = rx.try_recv() {
            if stream == "stderr" {
                stderr_text.push_str(&text);
                pending_stderr.push_str(&text);
            } else {
                stdout_text.push_str(&text);
                pending_stdout.push_str(&text);
            }
        }

        if pending_stdout.len() + pending_stderr.len() >= OUTPUT_FLUSH_BYTES
            || last_output_flush.elapsed() >= Duration::from_millis(OUTPUT_FLUSH_INTERVAL_MS)
        {
            flush_pending_output(&mut pending_stdout, &mut pending_stderr, &mut on_output);
            last_output_flush = Instant::now();
        }

        if output_limited.load(Ordering::SeqCst) {
            output_limit_hit = true;
            reported_elapsed = Some(start.elapsed().as_millis());
            let terminated = terminate_child(slot, &mut child, options.kill_wait_timeout);
            exit_code = terminated.0;
            termination_confirmed = terminated.1;
            break;
        }

        match child.try_wait() {
            Ok(Some(child_status)) => {
                exit_code = child_status.code();
                status = Some(child_status);
                break;
            }
            Ok(None) => {}
            Err(e) => {
                clear_current_process(slot);
                return Err(e);
            }
        }

        if cancelled.load(Ordering::SeqCst) {
            reported_elapsed = Some(start.elapsed().as_millis());
            let terminated = terminate_child(slot, &mut child, options.kill_wait_timeout);
            exit_code = terminated.0;
            termination_confirmed = terminated.1;
            break;
        }

        if start.elapsed() >= options.timeout {
            timed_out = true;
            reported_elapsed = Some(start.elapsed().as_millis());
            let terminated = terminate_child(slot, &mut child, options.kill_wait_timeout);
            exit_code = terminated.0;
            termination_confirmed = terminated.1;
            break;
        }

        std::thread::sleep(Duration::from_millis(10));
    }

    clear_current_process(slot);

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
            pending_stderr.push_str(&text);
        } else {
            stdout_text.push_str(&text);
            pending_stdout.push_str(&text);
        }
    }
    flush_pending_output(&mut pending_stdout, &mut pending_stderr, &mut on_output);

    Ok(ManagedCommandOutput {
        stdout: stdout_text,
        stderr: stderr_text,
        exit_code,
        status,
        time_ms: reported_elapsed.unwrap_or_else(|| start.elapsed().as_millis()),
        timed_out,
        cancelled: cancelled.swap(false, Ordering::SeqCst),
        output_limited: output_limit_hit,
    })
}

fn read_stream<R: Read + Send + 'static>(
    stream: &'static str,
    mut reader: R,
    tx: mpsc::Sender<(&'static str, String)>,
    output_bytes: Arc<AtomicUsize>,
    output_limited: Arc<AtomicBool>,
    output_limit: Option<usize>,
) {
    let mut buffer = [0u8; 1024];
    let mut pending = String::new();
    loop {
        match reader.read(&mut buffer) {
            Ok(0) => break,
            Ok(n) => {
                let allowed = if let Some(limit) = output_limit {
                    let previous = output_bytes.fetch_add(n, Ordering::SeqCst);
                    if previous >= limit {
                        output_limited.store(true, Ordering::SeqCst);
                        break;
                    }
                    let allowed = (limit - previous).min(n);
                    if allowed < n {
                        output_limited.store(true, Ordering::SeqCst);
                    }
                    allowed
                } else {
                    n
                };

                let text = String::from_utf8_lossy(&buffer[..allowed]).to_string();
                pending.push_str(&text);
                if pending.len() >= OUTPUT_FLUSH_BYTES {
                    if tx.send((stream, std::mem::take(&mut pending))).is_err() {
                        break;
                    }
                }
                if allowed < n {
                    break;
                }
            }
            Err(_) => break,
        }
    }

    if !pending.is_empty() {
        let _ = tx.send((stream, pending));
    }
}
