use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct PageInfo {
    pub url: String,
    pub title: String,
}

#[tauri::command]
pub fn open_embedded_browser(_url: String) -> Result<PageInfo, String> {
    // TODO: open URL in Tauri webview window
    Err("Embedded browser not yet implemented.".to_string())
}
