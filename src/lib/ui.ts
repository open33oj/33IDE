import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';
import {
  applyFont,
  forceLayout,
  getEditorValue,
  getSelectionOffsets,
  replaceSelection,
  selectAll,
  switchTheme,
  themes,
} from '../editor-setup';
import { api, AppConfig } from './api';
import { showContextMenu, MenuItem } from './context-menu';
import { t } from './i18n';
import { closeTab, getActiveTab, getTabs, getView, switchTo, type Tab } from './tabs';

const MIN_EDITOR_PANEL_WIDTH = 200;
const MIN_SIDE_PANEL_WIDTH = 280;
const MIN_IO_SECTION_HEIGHT = 140;
const IO_RESIZER_HEIGHT = 6;
const ZOOM_ROOT_ID = 'zoom-root';
let ioPanelVisible = true;
let ioSplitRatio = 0.5;

function getUiScale() {
  const scale = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--app-zoom'),
  );
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

function toContentPixels(visualPixels: number) {
  return visualPixels / getUiScale();
}

function ensureZoomRoot() {
  let root = document.getElementById(ZOOM_ROOT_ID) as HTMLElement | null;
  if (root) return root;

  root = document.createElement('div');
  root.id = ZOOM_ROOT_ID;

  const body = document.body;
  const children = Array.from(body.childNodes).filter((node) => {
    return !(node instanceof HTMLScriptElement) && node !== root;
  });

  const firstScript = Array.from(body.children).find((element) => element.tagName === 'SCRIPT');
  if (firstScript) {
    body.insertBefore(root, firstScript);
  } else {
    body.appendChild(root);
  }

  for (const child of children) {
    root.appendChild(child);
  }

  return root;
}

export function initZoomLayout(percent: number) {
  ensureZoomRoot();
  const scale = Math.max(0.5, Math.min(2, (percent || 100) / 100));
  document.documentElement.style.setProperty('--app-zoom', scale.toString());
}

function clampEditorPanelWidth(requestedWidth?: number) {
  const editorPanel = document.getElementById('editor-panel') as HTMLElement | null;
  if (!editorPanel) return;

  const scale = getUiScale();
  const minEditorWidth = MIN_EDITOR_PANEL_WIDTH / scale;
  const minSidePanelWidth = MIN_SIDE_PANEL_WIDTH / scale;
  const maxWidth = Math.max(
    minEditorWidth,
    window.innerWidth / scale - minSidePanelWidth,
  );
  const currentWidth = requestedWidth ?? toContentPixels(editorPanel.getBoundingClientRect().width);
  const clampedWidth = Math.max(minEditorWidth, Math.min(currentWidth, maxWidth));

  editorPanel.style.flex = 'none';
  editorPanel.style.width = `${clampedWidth}px`;
}

export function initThemeMenu(
  config: Pick<AppConfig, 'editor_theme' | 'editor_font_size' | 'editor_font_family' | 'editor_zoom'>,
  onChange: () => void,
) {
  const menu = document.getElementById('theme-menu')!;

  const render = () => {
    const currentSize = config.editor_font_size || 16;
    const currentZoom = config.editor_zoom || 100;

    let html = `<div style="padding:6px 12px;color:#808080;font-size:11px">${t('themeMenu.editorTheme')}</div>`;
    for (const theme of themes) {
      html += `<div class="theme-option${theme.id === config.editor_theme ? ' active' : ''}" data-theme="${theme.id}">${theme.name}</div>`;
    }
    html += '<div class="sep"></div>';
    html += `<div style="padding:6px 12px;color:#808080;font-size:11px">${t('themeMenu.fontSize')}</div>`;
    html += `<div class="font-size-row"><button class="font-btn" data-delta="-1">-</button><span class="font-label">${currentSize}px</span><button class="font-btn" data-delta="1">+</button></div>`;
    html += '<div class="sep"></div>';
    html += `<div style="padding:6px 12px;color:#808080;font-size:11px">${t('themeMenu.zoom')}</div>`;
    html += `<div class="font-size-row"><button class="font-btn" data-zoom="-10">-</button><span class="zoom-label">${currentZoom}%</span><button class="font-btn" data-zoom="10">+</button></div>`;
    menu.innerHTML = html;
  };

  if (!menu.dataset.bound) {
    menu.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      if (target.dataset.theme) {
        config.editor_theme = target.dataset.theme;
        switchTheme(getView(), config.editor_theme);
        render();
        onChange();
        return;
      }

      if (target.dataset.delta) {
        const delta = parseInt(target.dataset.delta, 10);
        config.editor_font_size = Math.max(10, Math.min(32, config.editor_font_size + delta));
        applyFont(getView(), config.editor_font_size, config.editor_font_family);
        render();
        onChange();
        return;
      }

      if (target.dataset.zoom) {
        const delta = parseInt(target.dataset.zoom, 10);
        config.editor_zoom = Math.max(50, Math.min(200, (config.editor_zoom || 100) + delta));
        applyZoom(config.editor_zoom);
        render();
        onChange();
      }
    });
    menu.dataset.bound = 'true';
  }

  render();
  applyZoom(config.editor_zoom || 100);
}

export function initSettingsDialog(
  config: AppConfig,
  defaultConfig: AppConfig,
  onSave: () => Promise<void> | void,
) {
  const overlay = document.getElementById('settings-overlay')!;
  const themeSelect = document.getElementById('settings-theme') as HTMLSelectElement;
  ensureOpenRunCacheButton();
  if (!themeSelect.dataset.bound) {
    themeSelect.innerHTML = themes.map((theme) => `<option value="${theme.id}">${theme.name}</option>`).join('');
    themeSelect.dataset.bound = 'true';
  }

  const field = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const compilerPath = field<HTMLInputElement>('settings-compiler-path');
  const compileFlags = field<HTMLTextAreaElement>('settings-compile-flags');
  const timeLimit = field<HTMLInputElement>('settings-time-limit');
  const stackSize = field<HTMLInputElement>('settings-stack-size');
  const language = field<HTMLSelectElement>('settings-language');
  const uiLanguage = field<HTMLSelectElement>('settings-ui-language');
  const fontSize = field<HTMLInputElement>('settings-font-size');
  const zoom = field<HTMLInputElement>('settings-zoom');
  const tabSize = field<HTMLInputElement>('settings-tab-size');
  const autoSaveExisting = field<HTMLInputElement>('settings-auto-save-existing');
  const fontFamily = field<HTMLInputElement>('settings-font-family');
  const braceStyle = field<HTMLInputElement>('settings-clang-braces');
  const template = field<HTMLTextAreaElement>('settings-template');

  const syncForm = (source: AppConfig = config) => {
    compilerPath.value = source.compiler_path || '';
    compileFlags.value = (source.compile_flags || []).join('\n');
    timeLimit.value = String(source.time_limit_ms || 2000);
    stackSize.value = source.stack_size || '';
    themeSelect.value = source.editor_theme || 'oneDark';
    language.value = source.default_language || 'cpp';
    uiLanguage.value = source.ui_language || 'zh-CN';
    fontSize.value = String(source.editor_font_size || 16);
    zoom.value = String(source.editor_zoom || 100);
    tabSize.value = String(source.editor_tab_size || 4);
    autoSaveExisting.checked = !!source.auto_save_existing_files;
    fontFamily.value = source.editor_font_family || '';
    braceStyle.checked = !!source.clang_format_brace_on_new_line;
    template.value = source.default_template || '';
  };

  const close = () => overlay.classList.add('hidden');
  const open = () => {
    syncForm();
    overlay.classList.remove('hidden');
  };

  if (!overlay.dataset.bound) {
    document.getElementById('m-settings')!.addEventListener('click', (e) => {
      e.stopPropagation();
      open();
    });
    document.getElementById('settings-close')!.addEventListener('click', close);
    document.getElementById('settings-cancel')!.addEventListener('click', close);
    document.getElementById('settings-reset')!.addEventListener('click', () => {
      syncForm(defaultConfig);
    });
    document.getElementById('settings-open-run-cache')!.addEventListener('click', async () => {
      try {
        await api.openRunCacheDir();
      } catch (e) {
        setStatus(t('status.error', { error: String(e) }), 'error');
      }
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    document.getElementById('settings-save')!.addEventListener('click', async () => {
      config.compiler_path = compilerPath.value.trim();
      config.compile_flags = compileFlags.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      config.time_limit_ms = Math.max(1, parseInt(timeLimit.value || '2000', 10) || 2000);
      config.stack_size = stackSize.value.trim();
      config.default_language = language.value || 'cpp';
      config.ui_language = uiLanguage.value || 'zh-CN';
      config.editor_theme = themeSelect.value || 'oneDark';
      config.editor_font_size = Math.max(10, Math.min(32, parseInt(fontSize.value || '16', 10) || 16));
      config.editor_zoom = Math.max(50, Math.min(200, parseInt(zoom.value || '100', 10) || 100));
      config.editor_tab_size = Math.max(1, Math.min(8, parseInt(tabSize.value || '4', 10) || 4));
      config.auto_save_existing_files = autoSaveExisting.checked;
      config.editor_font_family = fontFamily.value.trim() || config.editor_font_family;
      config.clang_format_brace_on_new_line = braceStyle.checked;
      config.default_template = template.value;
      await onSave();
      close();
    });
    overlay.dataset.bound = 'true';
  }
}

function ensureOpenRunCacheButton() {
  if (document.getElementById('settings-open-run-cache')) return;

  const resetButton = document.getElementById('settings-reset');
  if (!resetButton) return;

  const leftActions =
    resetButton.parentElement?.classList.contains('settings-footer-actions')
      ? resetButton.parentElement
      : (() => {
          const wrapper = document.createElement('div');
          wrapper.className = 'settings-footer-actions';
          resetButton.parentElement?.insertBefore(wrapper, resetButton);
          wrapper.appendChild(resetButton);
          return wrapper;
        })();

  const button = document.createElement('button');
  button.id = 'settings-open-run-cache';
  button.type = 'button';
  button.dataset.i18n = 'settings.openRunCache';
  button.textContent = t('settings.openRunCache');
  leftActions?.appendChild(button);
}

export function applyZoom(percent: number) {
  initZoomLayout(percent);
  const relayout = () => {
    try {
      getView().trigger('33ide', 'hideSuggestWidget', undefined);
    } catch {}
    clampEditorPanelWidth();
    applyIoSplit();
    forceLayout(getView());
  };
  requestAnimationFrame(() => {
    relayout();
    window.setTimeout(relayout, 0);
    window.setTimeout(relayout, 80);
  });
}

export function setStatus(text: string, type?: string) {
  document.getElementById('status-text')!.textContent = text;
  document.getElementById('statusbar')!.className = type || '';
}

export function showOutput(html: string) {
  document.getElementById('output-content')!.innerHTML = html;
}

export function appendOutput(text: string, className?: string) {
  const output = document.getElementById('output-content')!;
  const span = document.createElement('span');
  if (className) span.className = className;
  span.textContent = text;
  output.appendChild(span);
}

export function switchToOutput() {
  const output = document.getElementById('output-content');
  if (!output) return;
  if (!ioPanelVisible) {
    toggleIoPanel(true);
  }
  output.scrollTop = output.scrollHeight;
}

export function initSidebar() {
  const toggleButton = document.getElementById('btn-toggle-io') as HTMLButtonElement | null;
  if (toggleButton) {
    toggleButton.textContent = t('toolbar.io');
  }
  if (toggleButton && !toggleButton.dataset.bound) {
    toggleButton.addEventListener('click', () => {
      toggleIoPanel(!ioPanelVisible);
    });
    toggleButton.dataset.bound = 'true';
  }
  bindIoResizer();
  syncIoToggleButton();

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'a') {
      const el = e.target as HTMLElement;
      if (el.tagName !== 'TEXTAREA' && el.tagName !== 'INPUT' && !el.closest('.monaco-editor')) {
        e.preventDefault();
      }
    }
  });
}

export function initResizer() {
  const resizer = document.getElementById('resizer')!;
  let on = false;

  resizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    on = true;
    document.body.classList.add('resizing');
  });

  document.addEventListener('mousemove', (e) => {
    if (!on || !ioPanelVisible) return;
    clampEditorPanelWidth(toContentPixels(e.clientX));
  });

  document.addEventListener('mouseup', () => {
    if (!on) return;
    on = false;
    document.body.classList.remove('resizing');
  });

  window.addEventListener('resize', () => clampEditorPanelWidth());
  requestAnimationFrame(() => clampEditorPanelWidth());
}

export function toggleIoPanel(visible?: boolean) {
  const sidePanel = document.getElementById('side-panel');
  const resizer = document.getElementById('resizer');
  const editorPanel = document.getElementById('editor-panel');
  if (!sidePanel || !resizer || !editorPanel) return;

  ioPanelVisible = visible ?? !ioPanelVisible;
  sidePanel.classList.toggle('hidden', !ioPanelVisible);
  resizer.classList.toggle('hidden', !ioPanelVisible);

  if (ioPanelVisible) {
    editorPanel.style.flex = 'none';
    clampEditorPanelWidth();
  } else {
    editorPanel.style.width = '';
    editorPanel.style.flex = '1 1 auto';
  }

  syncIoToggleButton();
  requestAnimationFrame(() => {
    if (ioPanelVisible) {
      applyIoSplit();
    }
    forceLayout(getView());
  });
}

function syncIoToggleButton() {
  const toggleButton = document.getElementById('btn-toggle-io') as HTMLButtonElement | null;
  if (!toggleButton) return;
  toggleButton.textContent = t('toolbar.io');
  toggleButton.classList.toggle('active', ioPanelVisible);
  toggleButton.title = ioPanelVisible ? '隐藏输入输出面板' : '显示输入输出面板';
}

function bindIoResizer() {
  const stack = document.getElementById('io-stack') as HTMLElement | null;
  const resizer = document.getElementById('io-resizer') as HTMLElement | null;
  const sidePanel = document.getElementById('side-panel') as HTMLElement | null;
  if (!stack || !resizer || !sidePanel || resizer.dataset.bound) return;

  let dragging = false;

  const stopDragging = () => {
    if (!dragging) return;
    dragging = false;
    sidePanel.classList.remove('io-resizing');
  };

  const onMouseMove = (event: MouseEvent) => {
    if (!dragging || !ioPanelVisible) return;
    const rect = stack.getBoundingClientRect();
    const scale = getUiScale();
    const availableHeight = Math.max(0, stack.clientHeight - IO_RESIZER_HEIGHT);
    if (availableHeight <= 0) return;

    const minimum = getEffectiveIoMinHeight(availableHeight);
    const topHeight = Math.max(
      minimum,
      Math.min((event.clientY - rect.top) / scale, availableHeight - minimum),
    );

    ioSplitRatio = topHeight / availableHeight;
    applyIoSplit();
  };

  resizer.addEventListener('mousedown', (event) => {
    if (!ioPanelVisible) return;
    event.preventDefault();
    dragging = true;
    sidePanel.classList.add('io-resizing');
  });

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', stopDragging);
  window.addEventListener('resize', () => {
    if (ioPanelVisible) {
      applyIoSplit();
    }
  });

  resizer.dataset.bound = 'true';
  requestAnimationFrame(() => applyIoSplit());
}

function applyIoSplit() {
  const stack = document.getElementById('io-stack') as HTMLElement | null;
  if (!stack || !ioPanelVisible) return;

  const availableHeight = Math.max(0, stack.clientHeight - IO_RESIZER_HEIGHT);
  if (availableHeight <= 0) return;

  const minimum = getEffectiveIoMinHeight(availableHeight);
  const minRatio = minimum / availableHeight;
  ioSplitRatio = Math.max(minRatio, Math.min(ioSplitRatio, 1 - minRatio));

  const topHeight = Math.round(availableHeight * ioSplitRatio);
  const bottomHeight = Math.max(minimum, availableHeight - topHeight);
  const finalTopHeight = Math.max(minimum, availableHeight - bottomHeight);
  stack.style.gridTemplateRows = `${finalTopHeight}px ${IO_RESIZER_HEIGHT}px ${bottomHeight}px`;
}

function getEffectiveIoMinHeight(availableHeight: number) {
  if (availableHeight <= 0) return 0;
  return Math.min(MIN_IO_SECTION_HEIGHT, Math.max(48, Math.floor(availableHeight / 2)));
}

export function initEditorContextMenu(onFormat: () => void) {
  document.getElementById('editor')!.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();

    const view = getView();
    const tab = getActiveTab();
    const filePath = tab?.path || '';
    const sel = getSelectionOffsets(view);
    const hasSel = !sel.empty;

    const items: MenuItem[] = [
      {
        label: t('context.selectAll'),
        shortcut: 'Ctrl+A',
        action: () => {
          selectAll(view);
        },
      },
      {
        label: t('menu.format'),
        shortcut: 'Shift+Alt+F',
        action: onFormat,
      },
      { label: '---', action: () => {} },
      {
        label: t('context.cut'),
        shortcut: 'Ctrl+X',
        action: () => {
          if (!hasSel) return;
          writeText(sel.text);
          replaceSelection(view, '');
        },
      },
      {
        label: t('context.copy'),
        shortcut: 'Ctrl+C',
        action: () => {
          writeText(hasSel ? sel.text : getEditorValue(view));
        },
      },
      {
        label: t('context.paste'),
        shortcut: 'Ctrl+V',
        action: async () => {
          try {
            const text = await readText();
            if (text) {
              replaceSelection(view, text);
            }
          } catch {}
        },
      },
      { label: '---', action: () => {} },
      {
        label: t('context.reveal'),
        shortcut: 'Ctrl+B',
        action: () => {
          if (!filePath) {
            setStatus(t('status.noSavedFile'), 'error');
            return;
          }
          api.revealInExplorer(filePath).catch((e) => {
            setStatus(t('status.error', { error: String(e) }), 'error');
          });
        },
      },
    ];

    showContextMenu(items, e.clientX, e.clientY);
  });
}

export function initTabContextMenu(
  onSaveTab: (tab: Tab) => Promise<boolean> | boolean,
  onSaveTabAs: (tab: Tab) => Promise<boolean> | boolean,
) {
  document.getElementById('editor-tabs')!.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();

    const tabEl = (e.target as HTMLElement).closest('.editor-tab') as HTMLElement | null;
    if (!tabEl) return;

    const tabId = tabEl.getAttribute('data-tab-id');
    const tabs = getTabs();
    const tab = tabs.find((item) => item.id === tabId);
    if (!tab) return;

    showContextMenu([
      {
        label: t('context.save'),
        shortcut: 'Ctrl+S',
        action: () => {
          if (getActiveTab() !== tab) switchTo(tab);
          void onSaveTab(tab);
        },
      },
      {
        label: t('context.saveAs'),
        action: () => {
          if (getActiveTab() !== tab) switchTo(tab);
          void onSaveTabAs(tab);
        },
      },
      { label: '---', action: () => {} },
      { label: t('context.close'), shortcut: 'Ctrl+W', action: () => closeTab(tab.id) },
      { label: t('context.closeOthers'), action: () => { [...tabs].filter((item) => item.id !== tab.id).forEach((item) => closeTab(item.id)); } },
    ], e.clientX, e.clientY);
  });
}
