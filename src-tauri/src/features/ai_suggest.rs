use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct CompletionResult {
    pub suggestion: String,
    pub range_start: u32,
    pub range_end: u32,
}

#[tauri::command]
pub fn get_completion(code: String, cursor_position: u32, context: String) -> Result<CompletionResult, String> {
    // TODO: integrate AI completion API (OpenAI / local model)
    Err("AI Suggest not yet implemented. Configure API key in settings.".to_string())
}
