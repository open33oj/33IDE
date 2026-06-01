use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct TranslateResult {
    pub original: String,
    pub translated: String,
    pub source_lang: String,
    pub target_lang: String,
}

#[tauri::command]
pub fn translate_text(_text: String, _source_lang: String, _target_lang: String) -> Result<TranslateResult, String> {
    // TODO: integrate actual AI translation API
    Err("AI Translate not yet implemented. Configure API key in settings.".to_string())
}
