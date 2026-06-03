import './style.css';
import { api, AppConfig } from './lib/api';
import { initView, createTab } from './lib/tabs';
import { newFile, openFile, saveFile, saveFileAs, openTemplate } from './lib/files';
import { runCode, runInTerminal, formatCurrentCode } from './lib/runner';
import { setStatus, initSidebar, initResizer, initEditorContextMenu, initTabContextMenu, initThemeMenu, applyZoom } from './lib/ui';
import { initContextMenuDismiss } from './lib/context-menu';
import { HAS_CPH, HAS_BROWSER, HAS_AI_TRANSLATE, HAS_AI_SUGGEST } from './edition';
import { switchTheme, applyFont, fixCodeMirrorStyles, forceLayout, lockGutterWidths } from './editor-setup';
import { getView } from './lib/tabs';

const DEFAULT_CONFIG: AppConfig = {
  compiler_path: '', compile_flags: ['-std=c++14', '-O2', '-static'],
  stack_size: '1073741824', time_limit_ms: 2000,
  default_template: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    return 0;\n}\n',
  default_language: 'cpp', editor_font_size: 16, editor_theme: 'oneDark', editor_minimap: false,
  editor_font_family: "'Consolas', 'Courier New', 'Microsoft YaHei', 'SimHei', 'NSimSun', monospace",
};

function setProgress(percent: number, text: string) {
  const fill = document.getElementById('progress-fill');
  const label = document.getElementById('loading-text');
  if (fill) fill.style.width = percent + '%';
  if (label) label.textContent = text;
}

function yieldToMain(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function paint(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(resolve));
}

async function init() {
  // Step 1: Load config
  setProgress(5, '加载配置...');
  await paint();
  const configPromise = api.getSettings().catch(() => DEFAULT_CONFIG);
  const templatePromise = api.readTemplate().catch(() => '');
  const [config, tpl] = await Promise.all([configPromise, templatePromise]);
  const defaultTemplate = tpl || config.default_template;

  // Step 2: Wait for DOM ready
  setProgress(15, '等待页面就绪...');
  await paint();
  if (document.readyState !== 'complete') {
    await new Promise<void>(resolve => window.addEventListener('load', () => resolve(), { once: true }));
  }
  await yieldToMain();

  // Step 3: Create editor view (HEAVY)
  setProgress(30, '创建编辑器...');
  await paint();
  await yieldToMain();
  const editorEl = document.getElementById('editor')!;
  initView(editorEl, defaultTemplate, () => {});
  await paint(); // 等待浏览器完成首次布局
  await yieldToMain();

  // Step 4: Create first tab (HEAVY)
  setProgress(50, '加载文档...');
  await paint();
  await yieldToMain();
  createTab('main.cpp', defaultTemplate);
  await yieldToMain();

  // Step 5: Fix WebView2 style injection
  setProgress(60, '修复样式...');
  await paint();
  fixCodeMirrorStyles();
  await yieldToMain();

  // Step 6: Apply theme
  setProgress(70, '应用主题...');
  await paint();
  switchTheme(getView(), config.editor_theme || 'oneDark');
  await yieldToMain();

  // Step 7: Apply font
  setProgress(80, '设置字体...');
  await paint();
  if (config.editor_font_size !== 16 || config.editor_font_family) {
    applyFont(getView(), config.editor_font_size, config.editor_font_family);
  }
  lockGutterWidths(getView());
  forceLayout(getView());
  await yieldToMain();

  // Step 8: Bind events
  setProgress(90, '绑定事件...');
  await paint();
  initThemeMenu(config, () => { api.saveSettings(config).catch(() => {}); });
  document.addEventListener('keydown', e => {
    if (e.key === 'F5') { e.preventDefault(); runCode(); }
    if (e.ctrlKey && e.key === 's') { e.preventDefault(); saveFile(); }
    if (e.ctrlKey && e.key === 'o') { e.preventDefault(); openFile(); }
    if (e.ctrlKey && e.key === 'n') { e.preventDefault(); newFile(defaultTemplate); }
    if (e.shiftKey && e.altKey && e.key === 'F') { e.preventDefault(); formatCurrentCode(); }
    if (e.ctrlKey && (e.key === '=' || e.key === '+')) {
      e.preventDefault(); config.editor_zoom = Math.min(200, (config.editor_zoom || 100) + 10);
      applyZoom(config.editor_zoom); api.saveSettings(config).catch(() => {});
    }
    if (e.ctrlKey && e.key === '-') {
      e.preventDefault(); config.editor_zoom = Math.max(50, (config.editor_zoom || 100) - 10);
      applyZoom(config.editor_zoom); api.saveSettings(config).catch(() => {});
    }
    if (e.ctrlKey && e.key === '0') {
      e.preventDefault(); config.editor_zoom = 100;
      applyZoom(100); api.saveSettings(config).catch(() => {});
    }
  });
  document.getElementById('m-new')!.addEventListener('click', () => newFile(defaultTemplate));
  document.getElementById('m-open')!.addEventListener('click', openFile);
  document.getElementById('m-save')!.addEventListener('click', saveFile);
  document.getElementById('m-saveas')!.addEventListener('click', saveFileAs);
  document.getElementById('m-template')!.addEventListener('click', openTemplate);
  document.getElementById('btn-run')!.addEventListener('click', runCode);
  document.getElementById('btn-terminal')!.addEventListener('click', runInTerminal);
  document.getElementById('btn-format')!.addEventListener('click', () => formatCurrentCode());
  initSidebar();
  initResizer();
  initContextMenuDismiss();
  initEditorContextMenu();
  initTabContextMenu();
  await yieldToMain();

  // Step 9: Detect compiler
  setProgress(95, '检测编译器...');
  await paint();
  try {
    const info = await api.getCompilerInfo();
    document.getElementById('compiler-info')!.textContent = info;
  } catch {}
  await yieldToMain();

  // Step 10: Final paint
  setProgress(100, '就绪');
  await paint();
  await yieldToMain();
  await paint();

  // Remove overlay — everything is ready
  document.getElementById('loading-overlay')?.remove();
  setStatus('就绪');

  // Background tasks (non-blocking, after overlay removed)
  if (HAS_CPH) import('./features/cph').then(m => m.initCPH());
  if (HAS_BROWSER) import('./features/browser').then(m => m.initBrowser());
  if (HAS_AI_TRANSLATE) import('./features/ai-translate').then(m => m.initAITranslate());
  if (HAS_AI_SUGGEST) import('./features/ai-suggest').then(m => m.initAISuggest());
}

document.addEventListener('DOMContentLoaded', init);
