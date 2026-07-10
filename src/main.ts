import 'monaco-editor/min/vs/editor/editor.main.css';
import 'monaco-editor/esm/vs/editor/editor.all';
import '@mantine/core/styles.css';
import './style.css';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { message } from '@tauri-apps/plugin-dialog';
import { App } from './App';
import { api, AppConfig } from './lib/api';
import { initContextMenuDismiss } from './lib/context-menu';
import { applyFont, applyTabSize, fixEditorStyles, forceLayout, lockGutterWidths, setDefaultTabSize, switchTheme } from './editor-setup';
import { initClangdFeatures } from './lib/clangd';
import { initAutoSave, initExternalFileMonitor, newFile, openFile, promptReloadIfNeeded, revealActiveFileFolder, saveFile, saveFileAs, saveTab, saveTabAs } from './lib/files';
import { applyI18n, t } from './lib/i18n';
import { runCode, runInTerminal, formatCurrentCode } from './lib/runner';
import { closeTab, createTab, getActiveTab, getTabs, getView, initView, shouldPromptSave, switchTo } from './lib/tabs';
import { applyEditorTextFont, applyZoom, initEditorContextMenu, initResizer, initSettingsDialog, initSidebar, initTabContextMenu, initThemeMenu, initZoomLayout, setStatus } from './lib/ui';

const DEFAULT_CONFIG: AppConfig = {
  compiler_path: '',
  compile_flags: ['-std=c++14', '-O2', '-static'],
  stack_size: '1073741824',
  time_limit_ms: 2000,
  default_template: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(0);\n\n    return 0;\n}\n',
  default_language: 'cpp',
  ui_language: 'zh-CN',
  editor_font_size: 16,
  editor_theme: 'oneDark',
  editor_font_family: "'Consolas', 'Courier New', 'Microsoft YaHei', 'SimHei', 'NSimSun', monospace",
  editor_zoom: 100,
  editor_tab_size: 4,
  clang_format_brace_on_new_line: false,
  auto_save_existing_files: false,
};

function mountReactApp() {
  const rootEl = document.getElementById('root');
  if (!rootEl) throw new Error('React root element was not found.');

  const root = createRoot(rootEl);
  flushSync(() => {
    root.render(createElement(App));
  });
}

function setProgress(percent: number, text: string) {
  const fill = document.getElementById('progress-fill');
  const label = document.getElementById('loading-text');
  if (fill) fill.style.width = `${percent}%`;
  if (label) label.textContent = text;
}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function paint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

async function init() {
  setProgress(5, t('loading.config'));
  await paint();

  const configPromise = api.getSettings().catch(() => DEFAULT_CONFIG);
  const templatePromise = api.readTemplate().catch(() => '');
  const compilerPathPromise = api.getDefaultCompilerPath().catch(() => DEFAULT_CONFIG.compiler_path);
  const [config, tpl, defaultCompilerPath] = await Promise.all([
    configPromise,
    templatePromise,
    compilerPathPromise,
  ]);
  if (defaultCompilerPath) {
    DEFAULT_CONFIG.compiler_path = defaultCompilerPath;
    if (!config.compiler_path) {
      config.compiler_path = defaultCompilerPath;
    }
  }
  applyI18n(config.ui_language);
  initClangdFeatures(() => getActiveTab()?.path || undefined);
  applyEditorTextFont(config.editor_font_size || 16);
  initZoomLayout(config.editor_zoom || 100);

  const defaultTemplate = config.default_template || tpl || DEFAULT_CONFIG.default_template;
  setDefaultTabSize(config.editor_tab_size || 4);

  setProgress(15, t('loading.ready'));
  await paint();
  if (document.readyState !== 'complete') {
    await new Promise<void>((resolve) => window.addEventListener('load', () => resolve(), { once: true }));
  }
  await yieldToMain();

  setProgress(30, t('loading.editor'));
  await paint();
  await yieldToMain();
  const editorEl = document.getElementById('editor')!;
  initView(editorEl, defaultTemplate, () => {});
  await paint();
  await yieldToMain();

  setProgress(50, t('loading.document'));
  await paint();
  await yieldToMain();
  createTab('main.cpp', defaultTemplate);
  await yieldToMain();

  setProgress(60, t('loading.styles'));
  await paint();
  fixEditorStyles();
  await yieldToMain();

  setProgress(70, t('loading.theme'));
  await paint();
  switchTheme(getView(), config.editor_theme || 'oneDark');
  await yieldToMain();

  setProgress(80, t('loading.font'));
  await paint();
  if (config.editor_font_size !== 16 || config.editor_font_family) {
    applyFont(getView(), config.editor_font_size, config.editor_font_family);
  }
  lockGutterWidths(getView());
  forceLayout(getView());
  await yieldToMain();

  setProgress(90, t('loading.events'));
  await paint();
  initThemeMenu(config, () => { api.saveSettings(config).catch(() => {}); });
  initSettingsDialog(config, DEFAULT_CONFIG, async () => {
    applyI18n(config.ui_language);
    initThemeMenu(config, () => { api.saveSettings(config).catch(() => {}); });
    switchTheme(getView(), config.editor_theme || 'oneDark');
    applyEditorTextFont(config.editor_font_size || 16);
    applyFont(getView(), config.editor_font_size || 16, config.editor_font_family);
    applyZoom(config.editor_zoom || 100);
    applyTabSize(getView(), config.editor_tab_size || 4);
    lockGutterWidths(getView());
    forceLayout(getView());
    await api.saveSettings(config);
    setStatus(t('status.settingsSaved'), 'success');
  });

  document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();

    if (e.key === 'F5') {
      e.preventDefault();
      runCode();
    }
    if (e.ctrlKey && key === 's') {
      e.preventDefault();
      saveFile();
    }
    if (e.ctrlKey && key === 'o') {
      e.preventDefault();
      openFile();
    }
    if (e.ctrlKey && key === 'n') {
      e.preventDefault();
      newFile(config.default_template);
    }
    if (e.ctrlKey && key === 'w') {
      e.preventDefault();
      const tab = getActiveTab();
      if (tab) closeTab(tab.id);
    }
    if (e.ctrlKey && key === 'b') {
      e.preventDefault();
      revealActiveFileFolder();
    }
    if (e.shiftKey && e.altKey && e.key === 'F') {
      e.preventDefault();
      formatCurrentCode();
    }
    if (e.ctrlKey && (e.key === '=' || e.key === '+')) {
      e.preventDefault();
      config.editor_zoom = Math.min(200, (config.editor_zoom || 100) + 10);
      applyZoom(config.editor_zoom);
      api.saveSettings(config).catch(() => {});
    }
    if (e.ctrlKey && e.key === '-') {
      e.preventDefault();
      config.editor_zoom = Math.max(50, (config.editor_zoom || 100) - 10);
      applyZoom(config.editor_zoom);
      api.saveSettings(config).catch(() => {});
    }
    if (e.ctrlKey && e.key === '0') {
      e.preventDefault();
      config.editor_zoom = 100;
      applyZoom(100);
      api.saveSettings(config).catch(() => {});
    }
  });

  document.getElementById('m-new')!.addEventListener('click', () => newFile(config.default_template));
  document.getElementById('m-open')!.addEventListener('click', openFile);
  document.getElementById('m-save')!.addEventListener('click', saveFile);
  document.getElementById('m-saveas')!.addEventListener('click', saveFileAs);
  document.getElementById('m-reveal')!.addEventListener('click', revealActiveFileFolder);
  document.getElementById('m-close-tab')!.addEventListener('click', () => {
    const tab = getActiveTab();
    if (tab) closeTab(tab.id);
  });
  document.getElementById('btn-run')!.addEventListener('click', runCode);
  document.getElementById('btn-terminal')!.addEventListener('click', runInTerminal);

  initSidebar();
  initResizer();
  initExternalFileMonitor();
  initAutoSave(config);
  initContextMenuDismiss();
  initEditorContextMenu(formatCurrentCode);
  initTabContextMenu(saveTab, saveTabAs);
  initCloseGuard();
  document.getElementById('editor-tabs')!.addEventListener('click', () => {
    void promptReloadIfNeeded(getActiveTab());
  });
  await yieldToMain();

  setProgress(95, t('loading.compiler'));
  await paint();
  try {
    const info = await api.getCompilerInfo();
    document.getElementById('compiler-info')!.textContent = info;
  } catch {}
  await yieldToMain();

  setProgress(100, t('loading.done'));
  await paint();
  await yieldToMain();
  await paint();

  document.getElementById('loading-overlay')?.classList.add('hidden');
  setStatus(t('status.ready'));
}

mountReactApp();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  void init();
}

function initCloseGuard() {
  const appWindow = getCurrentWindow();
  let closeAllowed = false;
  let closePromptActive = false;

  void appWindow.onCloseRequested((event) => {
    if (closeAllowed) return;

    if (!getTabs().some(shouldPromptSave)) {
      closeAllowed = true;
      void api.exitApp();
      return;
    }

    event.preventDefault();
    if (closePromptActive) return;

    closePromptActive = true;
    void confirmCloseAllTabs().then((shouldClose) => {
      closePromptActive = false;
      if (!shouldClose) return;

      closeAllowed = true;
      void api.exitApp().catch((error) => {
        closeAllowed = false;
        setStatus(t('status.error', { error: String(error) }), 'error');
      });
    });
  });
}

async function confirmCloseAllTabs() {
  for (const tab of [...getTabs()]) {
    if (!getTabs().some((item) => item.id === tab.id) || !shouldPromptSave(tab)) continue;

    switchTo(tab);
    await paint();

    const saveLabel = t('dialog.save');
    const dontSaveLabel = t('dialog.dontSave');
    const cancelLabel = t('settings.cancel');
    const result = await message(t('dialog.saveBeforeClose', { name: tab.name }), {
      title: t('dialog.unsavedTitle'),
      kind: 'warning',
      buttons: {
        yes: saveLabel,
        no: dontSaveLabel,
        cancel: cancelLabel,
      },
    });

    if (result === cancelLabel || result === 'Cancel') return false;

    if (result === saveLabel || result === 'Yes') {
      const saved = await saveTab(tab);
      if (!saved) return false;
    }

    closeTab(tab.id, { skipPrompt: true, createReplacement: false });
  }

  return true;
}
