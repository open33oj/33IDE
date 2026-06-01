export function initBrowser() {
  console.log('[Browser] Embedded browser module loaded');
}

export async function openEmbeddedBrowser(url: string) {
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke('open_embedded_browser', { url });
}
