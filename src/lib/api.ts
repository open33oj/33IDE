import { invoke } from '@tauri-apps/api/core';

export interface AppConfig {
  compiler_path: string;
  compile_flags: string[];
  stack_size: string;
  time_limit_ms: number;
  default_template: string;
  default_language: string;
  ui_language?: string;
  editor_font_size: number;
  editor_theme: string;
  editor_font_family?: string;
  editor_zoom?: number;
  editor_tab_size?: number;
  clang_format_brace_on_new_line?: boolean;
  auto_save_existing_files?: boolean;
}

export interface RunResult {
  status: string;
  stdout: string;
  stderr: string;
  raw_stderr: string;
  exit_code: number | null;
  time_ms: number;
}

export interface ClangdCompletionItem {
  label: string;
  detail?: string;
  insert_text?: string;
  kind?: number;
  text_edit?: {
    new_text: string;
    start_line: number;
    start_character: number;
    end_line: number;
    end_character: number;
  };
}

export interface ClangdSignature {
  label: string;
  documentation?: string;
}

export const api = {
  getSettings: () => invoke<AppConfig>('get_settings'),
  saveSettings: (s: AppConfig) => invoke<void>('save_settings', { newSettings: s }),
  readTemplate: () => invoke<string>('read_template'),
  getDefaultCompilerPath: () => invoke<string>('get_default_compiler_path'),
  getCompilerInfo: () => invoke<string>('get_compiler_info'),
  compileAndRun: (code: string, input?: string, filePath?: string) =>
    invoke<RunResult>('compile_and_run', { code, input, filePath }),
  startCompileAndRun: (code: string, input?: string, filePath?: string) =>
    invoke<void>('start_compile_and_run', { code, input, filePath }),
  cancelRun: () => invoke<boolean>('cancel_run'),
  runInTerminal: (code: string, filePath?: string) =>
    invoke<{ ok: boolean; error?: string; raw_error?: string }>('run_in_terminal', { code, filePath }),
  openRunCacheDir: () => invoke<void>('open_run_cache_dir'),
  readFile: (path: string) => invoke<string>('read_file', { path }),
  writeFile: (path: string, content: string) => invoke<void>('write_file', { path, content }),
  revealInExplorer: (path: string) => invoke<void>('reveal_in_explorer', { path }),
  formatCode: (code: string, tabSize: number) => invoke<string>('format_code', { code, tabSize }),
  clangdComplete: (code: string, filePath: string | undefined, line: number, character: number) =>
    invoke<ClangdCompletionItem[]>('clangd_complete', { code, filePath, line, character }),
  clangdHover: (code: string, filePath: string | undefined, line: number, character: number) =>
    invoke<string | null>('clangd_hover', { code, filePath, line, character }),
  clangdSignatureHelp: (code: string, filePath: string | undefined, line: number, character: number) =>
    invoke<ClangdSignature | null>('clangd_signature_help', { code, filePath, line, character }),
  exitApp: () => invoke<void>('exit_app'),
};
