use crate::compiler::detect_clangd;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::time::Duration;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LspCompletionItem {
    pub label: String,
    pub detail: Option<String>,
    pub insert_text: Option<String>,
    pub kind: Option<u64>,
    pub sort_text: Option<String>,
    pub text_edit: Option<LspTextEdit>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LspTextEdit {
    pub new_text: String,
    pub start_line: u32,
    pub start_character: u32,
    pub end_line: u32,
    pub end_character: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LspSignature {
    pub label: String,
    pub documentation: Option<String>,
}

#[derive(Default)]
pub struct ClangdClient {
    process: Option<Child>,
    stdin: Option<Arc<Mutex<ChildStdin>>>,
    pending: Arc<Mutex<HashMap<i64, Sender<Value>>>>,
    next_id: i64,
    initialized_path: String,
    docs: HashMap<String, i32>,
}

impl ClangdClient {
    pub fn complete(
        &mut self,
        code: String,
        file_path: Option<String>,
        line: u32,
        character: u32,
        trigger_character: Option<String>,
    ) -> Result<Vec<LspCompletionItem>, String> {
        let uri = self.sync_document(code, file_path)?;
        // LSP triggerKind: 1 = Invoked, 2 = TriggerCharacter.
        // clangd relies on the trigger context (especially for struct member
        // access via . -> ::) to resolve the surrounding scope, so forwarding
        // it is important; otherwise member completion can come back empty.
        let context = match &trigger_character {
            Some(ch) if !ch.is_empty() => json!({
                "triggerKind": 2,
                "triggerCharacter": ch
            }),
            _ => json!({ "triggerKind": 1 }),
        };
        let result = self.request("textDocument/completion", json!({
            "textDocument": { "uri": uri },
            "position": { "line": line, "character": character },
            "context": context
        }))?;

        Ok(parse_completion_items(result))
    }

    pub fn hover(
        &mut self,
        code: String,
        file_path: Option<String>,
        line: u32,
        character: u32,
    ) -> Result<Option<String>, String> {
        let uri = self.sync_document(code, file_path)?;
        let result = self.request("textDocument/hover", json!({
            "textDocument": { "uri": uri },
            "position": { "line": line, "character": character }
        }))?;

        Ok(parse_markup(result.get("contents")))
    }

    pub fn signature_help(
        &mut self,
        code: String,
        file_path: Option<String>,
        line: u32,
        character: u32,
    ) -> Result<Option<LspSignature>, String> {
        let uri = self.sync_document(code, file_path)?;
        let result = self.request("textDocument/signatureHelp", json!({
            "textDocument": { "uri": uri },
            "position": { "line": line, "character": character },
            "context": { "triggerKind": 1 }
        }))?;

        let signatures = result.get("signatures").and_then(Value::as_array);
        let Some(signatures) = signatures else {
            return Ok(None);
        };
        let active = result.get("activeSignature").and_then(Value::as_u64).unwrap_or(0) as usize;
        let Some(signature) = signatures.get(active).or_else(|| signatures.first()) else {
            return Ok(None);
        };

        Ok(signature.get("label").and_then(Value::as_str).map(|label| LspSignature {
            label: label.to_string(),
            documentation: parse_markup(signature.get("documentation")),
        }))
    }

    fn sync_document(&mut self, code: String, file_path: Option<String>) -> Result<String, String> {
        self.ensure_started()?;
        let uri = file_uri(file_path)?;
        let current_version = *self.docs.get(&uri).unwrap_or(&0);

        if current_version == 0 {
            let version = 1;
            self.docs.insert(uri.clone(), version);
            self.notify("textDocument/didOpen", json!({
                "textDocument": {
                    "uri": uri,
                    "languageId": "cpp",
                    "version": version,
                    "text": code
                }
            }))?;
        } else {
            let version = current_version + 1;
            self.docs.insert(uri.clone(), version);
            self.notify("textDocument/didChange", json!({
                "textDocument": {
                    "uri": uri,
                    "version": version
                },
                "contentChanges": [{ "text": code }]
            }))?;
        }

        Ok(uri)
    }

    fn ensure_started(&mut self) -> Result<(), String> {
        let clangd_bin = detect_clangd();
        if self.process.is_some() && self.initialized_path == clangd_bin {
            return Ok(());
        }

        self.shutdown();

        let mut command = Command::new(&clangd_bin);
        command
            .args([
                "--background-index=false",
                "--clang-tidy=false",
                "--header-insertion=never",
                "--completion-style=detailed",
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());

        #[cfg(windows)]
        command.creation_flags(0x00000008);

        let mut child = command
            .spawn()
            .map_err(|e| format!("failed to start clangd at {}: {}", clangd_bin, e))?;
        let stdin = child.stdin.take().ok_or_else(|| "clangd stdin unavailable".to_string())?;
        let stdout = child.stdout.take().ok_or_else(|| "clangd stdout unavailable".to_string())?;

        self.stdin = Some(Arc::new(Mutex::new(stdin)));
        self.process = Some(child);
        self.initialized_path = clangd_bin;
        self.docs.clear();
        self.pending.lock().map_err(|e| e.to_string())?.clear();
        self.next_id = 0;

        spawn_reader(stdout, self.pending.clone());
        self.initialize()
    }

    fn initialize(&mut self) -> Result<(), String> {
        let root = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        let result = self.request("initialize", json!({
            "processId": std::process::id(),
            "rootUri": path_to_uri(&root),
            "capabilities": {
                "textDocument": {
                    "completion": {
                        "completionItem": {
                            "snippetSupport": false,
                            "documentationFormat": ["markdown", "plaintext"]
                        }
                    },
                    "hover": {
                        "contentFormat": ["markdown", "plaintext"]
                    },
                    "signatureHelp": {
                        "signatureInformation": {
                            "documentationFormat": ["markdown", "plaintext"]
                        }
                    }
                }
            }
        }))?;

        if result.is_null() {
            return Err("clangd initialize returned null".to_string());
        }

        self.notify("initialized", json!({}))
    }

    fn request(&mut self, method: &str, params: Value) -> Result<Value, String> {
        self.next_id += 1;
        let id = self.next_id;
        let (tx, rx): (Sender<Value>, Receiver<Value>) = mpsc::channel();
        self.pending.lock().map_err(|e| e.to_string())?.insert(id, tx);

        self.write(json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params
        }))?;

        match rx.recv_timeout(Duration::from_secs(4)) {
            Ok(message) => {
                if let Some(error) = message.get("error") {
                    Err(format!("clangd {} error: {}", method, error))
                } else {
                    Ok(message.get("result").cloned().unwrap_or(Value::Null))
                }
            }
            Err(_) => {
                self.pending.lock().map_err(|e| e.to_string())?.remove(&id);
                Err(format!("clangd {} timed out", method))
            }
        }
    }

    fn notify(&mut self, method: &str, params: Value) -> Result<(), String> {
        self.write(json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params
        }))
    }

    fn write(&self, message: Value) -> Result<(), String> {
        let stdin = self.stdin.as_ref().ok_or_else(|| "clangd is not running".to_string())?;
        let body = serde_json::to_vec(&message).map_err(|e| e.to_string())?;
        let mut guard = stdin.lock().map_err(|e| e.to_string())?;
        write!(guard, "Content-Length: {}\r\n\r\n", body.len()).map_err(|e| e.to_string())?;
        guard.write_all(&body).map_err(|e| e.to_string())?;
        guard.flush().map_err(|e| e.to_string())
    }

    fn shutdown(&mut self) {
        if let Some(mut child) = self.process.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        self.stdin = None;
        self.docs.clear();
        if let Ok(mut pending) = self.pending.lock() {
            pending.clear();
        }
    }
}

impl Drop for ClangdClient {
    fn drop(&mut self) {
        self.shutdown();
    }
}

fn spawn_reader(stdout: impl Read + Send + 'static, pending: Arc<Mutex<HashMap<i64, Sender<Value>>>>) {
    std::thread::spawn(move || {
        let mut reader = BufReader::new(stdout);

        loop {
            let mut content_length = 0usize;
            loop {
                let mut line = String::new();
                match reader.read_line(&mut line) {
                    Ok(0) | Err(_) => return,
                    Ok(_) => {}
                }

                let trimmed = line.trim();
                if trimmed.is_empty() {
                    break;
                }

                if let Some(value) = trimmed.strip_prefix("Content-Length:") {
                    content_length = value.trim().parse::<usize>().unwrap_or(0);
                }
            }

            if content_length == 0 {
                continue;
            }

            let mut body = vec![0u8; content_length];
            if reader.read_exact(&mut body).is_err() {
                return;
            }

            let Ok(message) = serde_json::from_slice::<Value>(&body) else {
                continue;
            };

            let Some(id) = message.get("id").and_then(Value::as_i64) else {
                continue;
            };

            if let Ok(mut pending) = pending.lock() {
                if let Some(tx) = pending.remove(&id) {
                    let _ = tx.send(message);
                }
            }
        }
    });
}

fn parse_completion_items(result: Value) -> Vec<LspCompletionItem> {
    let items = if let Some(items) = result.get("items").and_then(Value::as_array) {
        items.clone()
    } else if let Some(items) = result.as_array() {
        items.clone()
    } else {
        Vec::new()
    };

    items
        .into_iter()
        .filter_map(|item| {
            let label = item.get("label")?.as_str()?.to_string();
            let text_edit = parse_text_edit(item.get("textEdit"));
            let insert_text = text_edit
                .as_ref()
                .map(|edit| edit.new_text.clone())
                .or_else(|| item.get("insertText").and_then(Value::as_str).map(|s| s.to_string()));
Some(LspCompletionItem {
                label,
                detail: item.get("detail").and_then(Value::as_str).map(|s| s.to_string()),
                insert_text,
                kind: item.get("kind").and_then(Value::as_u64),
                sort_text: item.get("sortText").and_then(Value::as_str).map(|s| s.to_string()),
                text_edit,
            })
        })
        .collect()
}

fn parse_text_edit(value: Option<&Value>) -> Option<LspTextEdit> {
    let value = value?;
    let new_text = value.get("newText")?.as_str()?.to_string();

    // Support plain textEdit and insert/replace edit shapes.
    let range = value
        .get("range")
        .or_else(|| value.get("insert"))?;

    let start = range.get("start")?;
    let end = range.get("end")?;

    Some(LspTextEdit {
        new_text,
        start_line: start.get("line")?.as_u64()? as u32,
        start_character: start.get("character")?.as_u64()? as u32,
        end_line: end.get("line")?.as_u64()? as u32,
        end_character: end.get("character")?.as_u64()? as u32,
    })
}

fn parse_markup(value: Option<&Value>) -> Option<String> {
    let value = value?;
    if let Some(text) = value.as_str() {
        return Some(text.to_string());
    }
    if let Some(text) = value.get("value").and_then(Value::as_str) {
        return Some(text.to_string());
    }
    if let Some(items) = value.as_array() {
        let text = items
            .iter()
            .filter_map(|item| parse_markup(Some(item)))
            .collect::<Vec<_>>()
            .join("\n\n");
        if text.is_empty() {
            None
        } else {
            Some(text)
        }
    } else {
        None
    }
}

fn file_uri(file_path: Option<String>) -> Result<String, String> {
    if let Some(path) = file_path.filter(|path| !path.trim().is_empty()) {
        return Ok(path_to_uri(Path::new(&path)));
    }

    let path = std::env::temp_dir().join("33ide").join("clangd").join("untitled.cpp");
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    Ok(path_to_uri(&path))
}

fn path_to_uri(path: &Path) -> String {
    let display = path
        .to_string_lossy()
        .replace('\\', "/")
        .replace(' ', "%20");

    if display.starts_with('/') {
        format!("file://{}", display)
    } else {
        format!("file:///{}", display)
    }
}
