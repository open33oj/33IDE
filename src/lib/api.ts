import { invoke } from '@tauri-apps/api/core';

export interface AppConfig {
  compiler_path: string;
  compile_flags: string[];
  stack_size: string;
  time_limit_ms: number;
  default_template: string;
  default_language: string;
  editor_font_size: number;
  editor_theme: string;
  editor_minimap: boolean;
  editor_font_family?: string;
  editor_zoom?: number;
  editor_tab_size?: number;
}

export interface RunResult {
  status: string;
  stdout: string;
  stderr: string;
  raw_stderr: string;
  exit_code: number | null;
  time_ms: number;
}

export const api = {
  getSettings: () => invoke<AppConfig>('get_settings'),
  saveSettings: (s: AppConfig) => invoke<void>('save_settings', { newSettings: s }),
  readTemplate: () => invoke<string>('read_template'),
  openTemplate: () => invoke<[string, string]>('open_template'),
  getCompilerInfo: () => invoke<string>('get_compiler_info'),
  compileAndRun: (code: string, input?: string) => invoke<RunResult>('compile_and_run', { code, input }),
  runInTerminal: (code: string) => invoke<{ ok: boolean; error?: string }>('run_in_terminal', { code }),
  readFile: (path: string) => invoke<string>('read_file', { path }),
  writeFile: (path: string, content: string) => invoke<void>('write_file', { path, content }),
  revealInExplorer: (path: string) => invoke<void>('reveal_in_explorer', { path }),
  formatCode: (code: string, tabSize: number) => invoke<string>('format_code', { code, tabSize }),
};
