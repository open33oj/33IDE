import { EditorView, EditorState, baseExtensions, getCurrentThemeExtension, themeCompartment, lockGutterWidths, forceLayout } from '../editor-setup';
import { clearDiagnostics } from './diagnostics';

export interface Tab {
  id: string;
  name: string;
  path: string;
  state: EditorState;
  dirty: boolean;
}

let view: EditorView;
const tabs: Tab[] = [];
let activeTab: Tab | null = null;
let tabCounter = 0;

function createState(doc: string, onDirty?: () => void): EditorState {
  const changeExt = EditorView.updateListener.of(update => {
    if (update.docChanged) {
      if (onDirty) onDirty();
      clearDiagnostics(update.view);
    }
  });
  return EditorState.create({ doc, extensions: [...baseExtensions, themeCompartment.of(getCurrentThemeExtension()), changeExt] });
}

export function initView(parent: HTMLElement, initialDoc: string, onDirty: () => void): EditorView {
  view = new EditorView({
    state: createState('', onDirty),
    parent,
  });
  return view;
}

export function getView(): EditorView { return view; }
export function getTabs(): Tab[] { return tabs; }
export function getActiveTab(): Tab | null { return activeTab; }
export function getNextTabId(): string { return 'tab_' + (++tabCounter); }

export function createTab(name: string, content: string, filePath: string = ''): Tab {
  const id = 'tab_' + Date.now();
  const state = createState(content, () => {
    if (activeTab) { activeTab.dirty = true; renderTabs(); }
  });
  const tab: Tab = { id, name, path: filePath, state, dirty: false };
  tabs.push(tab);
  switchTo(tab);
  return tab;
}

export function switchTo(tab: Tab) {
  if (activeTab) activeTab.state = view.state;
  activeTab = tab;
  view.setState(tab.state);
  lockGutterWidths(view);
  forceLayout(view);
  view.focus();
  renderTabs();
  updateStatusbar();
}

export function closeTab(id: string) {
  const idx = tabs.findIndex(t => t.id === id);
  if (idx < 0) return;
  const tab = tabs[idx];
  if (tab.dirty && !confirm(`${tab.name} 未保存，确定关闭？`)) return;
  tabs.splice(idx, 1);
  if (activeTab?.id === id) {
    if (tabs.length > 0) switchTo(tabs[Math.min(idx, tabs.length - 1)]);
    else createTab('untitled.cpp', '');
  }
  renderTabs();
}

export function renderTabs() {
  const container = document.getElementById('editor-tabs')!;
  container.innerHTML = '';
  tabs.forEach(tab => {
    const el = document.createElement('div');
    el.className = 'editor-tab' + (tab.id === activeTab?.id ? ' active' : '');
    el.setAttribute('data-tab-id', tab.id);
    el.innerHTML = `<span>${tab.name}${tab.dirty ? ' ●' : ''}</span><span class="tab-close">&times;</span>`;
    el.addEventListener('click', () => switchTo(tab));
    el.querySelector('.tab-close')!.addEventListener('click', e => { e.stopPropagation(); closeTab(tab.id); });
    container.appendChild(el);
  });
}

export function findTabByPath(path: string): Tab | undefined {
  return tabs.find(t => t.path === path);
}

function updateStatusbar() {
  if (activeTab) {
    document.getElementById('status-text')!.textContent = activeTab.name;
  }
}

export function markDirty() {
  if (activeTab) { activeTab.dirty = true; renderTabs(); }
}
