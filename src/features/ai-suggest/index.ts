import { invoke } from '@tauri-apps/api/core';
import { getView } from '../../lib/tabs';

export function initAISuggest() {
  console.log('[AI Suggest] Completion module loaded (CodeMirror)');
}

export async function getCompletion(code: string, cursorPosition: number, context: string) {
  return invoke<{ suggestion: string }>('get_completion', {
    code,
    cursor_position: cursorPosition,
    context,
  });
}
