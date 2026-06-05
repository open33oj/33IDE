use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::fs;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Settings {
    pub compiler_path: String,
    pub compile_flags: Vec<String>,
    pub stack_size: String,
    pub time_limit_ms: u64,
    pub default_template: String,
    pub default_language: String,
    pub editor_font_size: u32,
    pub editor_theme: String,
    pub editor_minimap: bool,
    #[serde(default = "default_font_family")]
    pub editor_font_family: String,
    #[serde(default = "default_zoom")]
    pub editor_zoom: u32,
    #[serde(default = "default_tab_size")]
    pub editor_tab_size: u32,
}

fn default_font_family() -> String {
    "'Consolas', 'Courier New', 'Microsoft YaHei', 'SimHei', 'NSimSun', monospace".to_string()
}

fn default_zoom() -> u32 {
    100
}

fn default_tab_size() -> u32 {
    4
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            compiler_path: String::new(),
            compile_flags: vec![
                "-std=c++14".to_string(),
                "-O2".to_string(),
                "-static".to_string(),
            ],
            stack_size: "1073741824".to_string(),
            time_limit_ms: 2000,
            default_template: "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(0);\n\n\n\n    return 0;\n}\n".to_string(),
            default_language: "cpp".to_string(),
            editor_font_size: 16,
            editor_theme: "oneDark".to_string(),
            editor_minimap: false,
            editor_font_family: default_font_family(),
            editor_zoom: 100,
            editor_tab_size: 4,
        }
    }
}

fn config_dir() -> PathBuf {
    let dir = dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("33IDE");
    fs::create_dir_all(&dir).ok();
    dir
}

fn config_path() -> PathBuf {
    config_dir().join("config.json")
}

impl Settings {
    pub fn load() -> Self {
        let path = config_path();
        if path.exists() {
            match fs::read_to_string(&path) {
                Ok(data) => match serde_json::from_str::<Settings>(&data) {
                    Ok(s) => return s,
                    Err(e) => {
                        eprintln!("config.json parse error: {}, using defaults", e);
                    }
                },
                Err(e) => {
                    eprintln!("config.json read error: {}, using defaults", e);
                }
            }
        }
        Settings::default()
    }

    pub fn save(&self) -> Result<(), String> {
        let path = config_path();
        let json = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        fs::write(&path, json).map_err(|e| e.to_string())
    }
}
