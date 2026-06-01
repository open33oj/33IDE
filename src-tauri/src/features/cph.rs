use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct TestCase {
    pub input: String,
    pub expected_output: String,
    pub actual_output: String,
    pub passed: bool,
    pub time_ms: u128,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProblemInfo {
    pub name: String,
    pub time_limit_ms: u64,
    pub memory_limit_mb: u64,
    pub testcases: Vec<TestCase>,
}

#[tauri::command]
pub fn parse_problem(json: String) -> Result<ProblemInfo, String> {
    serde_json::from_str(&json).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn run_testcases(code: String, testcases: Vec<(String, String)>) -> Result<Vec<TestCase>, String> {
    let settings = crate::settings::Settings::load();
    let tmp_dir = std::env::temp_dir().join("33ide");
    std::fs::create_dir_all(&tmp_dir).map_err(|e| e.to_string())?;
    let src = tmp_dir.join("cph_sol.cpp");
    let bin = tmp_dir.join(if cfg!(windows) { "cph_sol.exe" } else { "cph_sol" });
    std::fs::write(&src, &code).map_err(|e| e.to_string())?;

    let cr = crate::compiler::compile(&src, &bin, &settings);
    if !cr.success {
        let _ = std::fs::remove_file(&src);
        return Err(cr.error.unwrap_or_else(|| "Compile error".to_string()));
    }

    let mut results = Vec::new();
    for (input, expected) in &testcases {
        let result = crate::runner::run(&bin, input, &settings);
        let passed = result.stdout.trim() == expected.trim();
        results.push(TestCase {
            input: input.clone(),
            expected_output: expected.clone(),
            actual_output: result.stdout,
            passed,
            time_ms: result.time_ms,
        });
    }

    let _ = std::fs::remove_file(&src);
    let _ = std::fs::remove_file(&bin);
    Ok(results)
}
