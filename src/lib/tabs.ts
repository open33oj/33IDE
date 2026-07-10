import {
  createEditor,
  createEditorModel,
  EditorTabState,
  EditorView,
  forceLayout,
  getEditorValue,
  installEditorKeybindings,
  lockGutterWidths,
} from '../editor-setup';
import { clearDiagnostics } from './diagnostics';
import { t } from './i18n';
import { setActivePathState, setStatusState } from './ui-store';

export interface Tab {
  id: string;
  name: string;
  path: string;
  state: EditorTabState;
  dirty: boolean;
  diskContent: string;
  externalModified: boolean;
  pendingExternalContent: string | null;
  lastPromptedExternalContent: string | null;
}

let view: EditorView;
const tabs: Tab[] = [];
let activeTab: Tab | null = null;
let tabCounter = 0;
const dirtyListeners = new Set<(tab: Tab) => void>();
const tabRenderListeners = new Set<() => void>();
let tabsVersion = 0;
let tabsSnapshot = {
  version: tabsVersion,
  tabs: [] as Tab[],
  activeTabId: null as string | null,
};

function createState(doc: string, onDirty?: () => void): EditorTabState {
  return {
    model: createEditorModel(doc, () => {
      onDirty?.();
      if (view) clearDiagnostics(view);
    }),
    viewState: null,
  };
}

export function initView(parent: HTMLElement, initialDoc: string, onDirty: () => void): EditorView {
  view = createEditor(parent, initialDoc, onDirty);
  installEditorKeybindings(view);
  return view;
}

export function getView(): EditorView { return view; }
export function getTabs(): Tab[] { return tabs; }
export function getActiveTab(): Tab | null { return activeTab; }
export function getNextTabId(): string { return 'tab_' + (++tabCounter); }
export function getTabDisplayPath(tab: Tab): string {
  return tab.path || `${t('status.unsavedPrefix')}/${tab.name}`;
}
export function subscribeTabs(listener: () => void) {
  tabRenderListeners.add(listener);
  return () => tabRenderListeners.delete(listener);
}

export function getTabsSnapshot() {
  return tabsSnapshot;
}

export function getTabContent(tab: Tab): string {
  return activeTab?.id === tab.id ? getEditorValue(view) : tab.state.model.getValue();
}

export function shouldPromptSave(tab: Tab): boolean {
  return tab.dirty || (!tab.path && getTabContent(tab).trim().length > 0);
}

export function onTabDirty(listener: (tab: Tab) => void) {
  dirtyListeners.add(listener);
}

function notifyDirty(tab: Tab) {
  dirtyListeners.forEach((listener) => listener(tab));
}

export function createTab(name: string, content: string, filePath: string = ''): Tab {
  const id = 'tab_' + Date.now();
  const initialState = createState('');
  const tab: Tab = {
    id,
    name,
    path: filePath,
    state: initialState,
    dirty: false,
    diskContent: filePath ? content : '',
    externalModified: false,
    pendingExternalContent: null,
    lastPromptedExternalContent: null,
  };

  tab.state = createState(content, () => {
    tab.dirty = true;
    renderTabs();
    notifyDirty(tab);
  });
  initialState.model.dispose();

  tabs.push(tab);
  switchTo(tab);
  return tab;
}

export function switchTo(tab: Tab) {
  if (activeTab) activeTab.state.viewState = view.saveViewState();
  activeTab = tab;
  view.setModel(tab.state.model);
  if (tab.state.viewState) view.restoreViewState(tab.state.viewState);
  lockGutterWidths(view);
  forceLayout(view);
  view.focus();
  renderTabs();
  updateStatusbar();
}

export function closeTab(
  id: string,
  options: { skipPrompt?: boolean; createReplacement?: boolean } = {},
): boolean {
  const idx = tabs.findIndex((tab) => tab.id === id);
  if (idx < 0) return false;

  const tab = tabs[idx];
  if (!options.skipPrompt && shouldPromptSave(tab) && !confirm(t('dialog.closeUnsaved', { name: tab.name }))) {
    return false;
  }

  tabs.splice(idx, 1);
  if (activeTab?.id === id) {
    if (tabs.length > 0) switchTo(tabs[Math.min(idx, tabs.length - 1)]);
    else if (options.createReplacement !== false) createTab('untitled.cpp', '');
    else {
      activeTab = null;
      view.setModel(null);
    }
  }
  tab.state.model.dispose();

  renderTabs();
  return true;
}

export function replaceTabContent(
  tab: Tab,
  content: string,
  options: {
    dirty?: boolean;
    diskContent?: string;
    externalModified?: boolean;
    pendingExternalContent?: string | null;
    lastPromptedExternalContent?: string | null;
  } = {},
) {
  const isActive = activeTab?.id === tab.id;
  const currentViewState = isActive ? view.saveViewState() : tab.state.viewState;
  const oldModel = tab.state.model;

  tab.state = createState(content, () => {
    tab.dirty = true;
    renderTabs();
    notifyDirty(tab);
  });
  tab.state.viewState = currentViewState;
  oldModel.dispose();

  if (typeof options.dirty === 'boolean') tab.dirty = options.dirty;
  if (typeof options.diskContent === 'string') tab.diskContent = options.diskContent;
  if (typeof options.externalModified === 'boolean') tab.externalModified = options.externalModified;
  if (options.pendingExternalContent !== undefined) tab.pendingExternalContent = options.pendingExternalContent;
  if (options.lastPromptedExternalContent !== undefined) tab.lastPromptedExternalContent = options.lastPromptedExternalContent;

  if (isActive) {
    activeTab = tab;
    view.setModel(tab.state.model);
    if (tab.state.viewState) view.restoreViewState(tab.state.viewState);
    lockGutterWidths(view);
    forceLayout(view);
    view.focus();
  }

  renderTabs();
  updateStatusbar();
}

export function moveTab(tabId: string, targetId: string, place: 'before' | 'after') {
  const fromIndex = tabs.findIndex((tab) => tab.id === tabId);
  const targetIndex = tabs.findIndex((tab) => tab.id === targetId);
  if (fromIndex < 0 || targetIndex < 0 || fromIndex === targetIndex) return;

  const [tab] = tabs.splice(fromIndex, 1);
  let insertIndex = targetIndex;
  if (fromIndex < targetIndex) insertIndex -= 1;
  if (place === 'after') insertIndex += 1;
  tabs.splice(Math.max(0, Math.min(insertIndex, tabs.length)), 0, tab);
  renderTabs();
}

export function renderTabs() {
  tabsVersion += 1;
  tabsSnapshot = {
    version: tabsVersion,
    tabs: [...tabs],
    activeTabId: activeTab?.id ?? null,
  };
  setActivePathState(activeTab ? getTabDisplayPath(activeTab) : '');
  tabRenderListeners.forEach((listener) => listener());
}

export function findTabByPath(path: string): Tab | undefined {
  return tabs.find((tab) => tab.path === path);
}

function updateStatusbar() {
  setActivePathState(activeTab ? getTabDisplayPath(activeTab) : '');
  setStatusState(activeTab ? activeTab.name : t('status.ready'));
  const statusText = document.getElementById('status-text');
  if (!statusText) return;

  if (activeTab) {
    statusText.textContent = activeTab.name;
  } else {
    statusText.textContent = t('status.ready');
  }
}

export function markDirty() {
  if (activeTab) {
    activeTab.dirty = true;
    renderTabs();
    notifyDirty(activeTab);
  }
}
