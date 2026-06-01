import { getView, getActiveTab, getTabs, switchTo, closeTab } from './tabs';
import { api } from './api';
import { showContextMenu, MenuItem } from './context-menu';
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';
import { switchTheme, applyFont, themes, fixCodeMirrorStyles } from '../editor-setup';
import { getTheme } from './themes';

export function initThemeMenu(config: { editor_theme: string; editor_font_size: number; editor_font_family?: string; editor_zoom?: number }, onChange: () => void) {
  const menu = document.getElementById('theme-menu')!;
  const currentTheme = getTheme(config.editor_theme);
  const currentSize = config.editor_font_size || 16;
  const currentZoom = config.editor_zoom || 100;

  let html = '<div style="padding:6px 12px;color:#808080;font-size:11px">编辑器主题</div>';
  for (const t of themes) {
    html += `<div class="theme-option${t.id === config.editor_theme ? ' active' : ''}" data-theme="${t.id}">${t.name}</div>`;
  }
  html += '<div class="sep"></div>';
  html += '<div style="padding:6px 12px;color:#808080;font-size:11px">字号</div>';
  html += `<div class="font-size-row"><button class="font-btn" data-delta="-1">-</button><span class="font-label">${currentSize}px</span><button class="font-btn" data-delta="1">+</button></div>`;
  html += '<div class="sep"></div>';
  html += '<div style="padding:6px 12px;color:#808080;font-size:11px">缩放</div>';
  html += `<div class="font-size-row"><button class="font-btn" data-zoom="-10">-</button><span class="zoom-label">${currentZoom}%</span><button class="font-btn" data-zoom="10">+</button></div>`;
  menu.innerHTML = html;

  menu.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.dataset.theme) {
      config.editor_theme = target.dataset.theme;
      switchTheme(getView(), config.editor_theme);
      menu.querySelectorAll('.theme-option').forEach(el => el.classList.remove('active'));
      target.classList.add('active');
      onChange();
    }
    if (target.dataset.delta) {
      const delta = parseInt(target.dataset.delta);
      config.editor_font_size = Math.max(10, Math.min(32, config.editor_font_size + delta));
      applyFont(getView(), config.editor_font_size, config.editor_font_family);
      const label = menu.querySelector('.font-label');
      if (label) label.textContent = config.editor_font_size + 'px';
      onChange();
    }
    if (target.dataset.zoom) {
      const delta = parseInt(target.dataset.zoom);
      config.editor_zoom = Math.max(50, Math.min(200, (config.editor_zoom || 100) + delta));
      applyZoom(config.editor_zoom);
      const label = menu.querySelector('.zoom-label');
      if (label) label.textContent = config.editor_zoom + '%';
      onChange();
    }
  });

  applyZoom(config.editor_zoom || 100);
}

export function applyZoom(percent: number) {
  document.body.style.zoom = (percent / 100).toString();
}

function getFontFamily(config: { editor_font_family?: string; editor_font_size?: number }): string {
  const family = config.editor_font_family || "'Consolas', 'Courier New', 'Microsoft YaHei', 'SimHei', 'NSimSun', monospace";
  return family;
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
  document.querySelectorAll('.side-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.side-content').forEach(c => c.classList.add('hidden'));
  document.querySelector('.side-tab[data-panel="output"]')!.classList.add('active');
  document.getElementById('side-content-output')!.classList.remove('hidden');
}

export function initSidebar() {
  document.querySelectorAll('.side-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.side-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.side-content').forEach(c => c.classList.add('hidden'));
      tab.classList.add('active');
      document.getElementById(`side-content-${(tab as HTMLElement).dataset.panel}`)!.classList.remove('hidden');
    });
  });
}

export function initResizer() {
  const resizer = document.getElementById('resizer')!;
  const editorPanel = document.getElementById('editor-panel')!;
  let on = false;
  resizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    on = true;
    document.body.classList.add('resizing');
  });
  document.addEventListener('mousemove', e => {
    if (!on) return;
    const zoom = parseFloat(document.body.style.zoom || '1');
    const w = e.clientX / zoom;
    if (w >= 200 && w <= window.innerWidth / zoom - 250) {
      editorPanel.style.flex = 'none';
      editorPanel.style.width = w + 'px';
    }
  });
  document.addEventListener('mouseup', () => {
    if (!on) return;
    on = false;
    document.body.classList.remove('resizing');
  });
}

export function initEditorContextMenu() {
  document.getElementById('editor')!.addEventListener('contextmenu', e => {
    e.preventDefault();
    e.stopPropagation();
    const view = getView();
    const tab = getActiveTab();
    const filePath = tab?.path || '';
    const sel = view.state.selection.main;
    const hasSel = !sel.empty;
    const items: MenuItem[] = [
      { label: '全选', shortcut: 'Ctrl+A', action: () => {
        view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
        view.focus();
      }},
      { label: '---', action: () => {} },
      { label: '剪切', shortcut: 'Ctrl+X', action: () => {
        if (hasSel) {
          writeText(view.state.sliceDoc(sel.from, sel.to));
          view.dispatch({ changes: { from: sel.from, to: sel.to, insert: '' } });
        }
      }},
      { label: '复制', shortcut: 'Ctrl+C', action: () => {
        writeText(hasSel ? view.state.sliceDoc(sel.from, sel.to) : view.state.doc.toString());
      }},
      { label: '粘贴', shortcut: 'Ctrl+V', action: async () => {
        try {
          const text = await readText();
          if (text) view.dispatch({ changes: { from: sel.from, to: sel.to, insert: text } });
        } catch {}
      }},
      { label: '---', action: () => {} },
      { label: '打开所在文件夹', action: () => api.revealInExplorer(filePath) },
    ];
    showContextMenu(items, e.clientX, e.clientY);
  });
}

export function initTabContextMenu() {
  document.getElementById('editor-tabs')!.addEventListener('contextmenu', e => {
    e.preventDefault();
    e.stopPropagation();
    const tabEl = (e.target as HTMLElement).closest('.editor-tab') as HTMLElement;
    if (!tabEl) return;
    const tabId = tabEl.getAttribute('data-tab-id');
    const tabs = getTabs();
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;
    showContextMenu([
      { label: '保存', shortcut: 'Ctrl+S', action: () => { if (getActiveTab() !== tab) switchTo(tab); } },
      { label: '另存为...', action: () => { if (getActiveTab() !== tab) switchTo(tab); } },
      { label: '---', action: () => {} },
      { label: '关闭', action: () => closeTab(tab.id) },
      { label: '关闭其他', action: () => { tabs.filter(t => t.id !== tab.id).forEach(t => closeTab(t.id)); } },
    ], e.clientX, e.clientY);
  });
}
