export function initAITranslate() {
  console.log('[AI Translate] Translation module loaded');
}

export async function translateText(text: string, sourceLang: string, targetLang: string) {
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke('translate_text', { text, source_lang: sourceLang, target_lang: targetLang });
}
