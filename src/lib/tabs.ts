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
let suppressNextClickTabId: string | null = null;
const dirtyListeners = new Set<(tab: Tab) => void>();

type TabDragState = {
  tabId: string;
  startX: number;
  startY: number;
  started: boolean;
};

let tabDragState: TabDragState | null = null;
let tabDragListenersBound = false;
const TAB_DRAG_THRESHOLD = 6;

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
  const tab: Tab = {
    id,
    name,
    path: filePath,
    state: createState(''),
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

  const emptyModel = tab.state.model;
  tab.state = createState(content, () => {
    tab.dirty = true;
    renderTabs();
    notifyDirty(tab);
  });
  emptyModel.dispose();
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

function clearTabDropIndicators() {
  document
    .querySelectorAll('.editor-tab.drag-over-before, .editor-tab.drag-over-after')
    .forEach((element) => element.classList.remove('drag-over-before', 'drag-over-after'));
}

function syncDraggedTabVisuals() {
  document
    .querySelectorAll('.editor-tab.dragging')
    .forEach((element) => element.classList.remove('dragging'));

  if (!tabDragState?.started) {
    document.body.classList.remove('tab-dragging');
    return;
  }

  document.body.classList.add('tab-dragging');
  document
    .querySelector<HTMLElement>(`.editor-tab[data-tab-id="${tabDragState.tabId}"]`)
    ?.classList.add('dragging');
}

function finishTabDrag() {
  const draggedTabId = tabDragState?.started ? tabDragState.tabId : null;
  tabDragState = null;
  clearTabDropIndicators();
  syncDraggedTabVisuals();
  suppressNextClickTabId = draggedTabId;
}

function bindTabDragListeners() {
  if (tabDragListenersBound) return;
  tabDragListenersBound = true;

  document.addEventListener('pointermove', (event) => {
    if (!tabDragState) return;

    const dx = event.clientX - tabDragState.startX;
    const dy = event.clientY - tabDragState.startY;
    if (!tabDragState.started && Math.hypot(dx, dy) < TAB_DRAG_THRESHOLD) return;

    tabDragState.started = true;
    syncDraggedTabVisuals();

    const targetEl = document.elementFromPoint(event.clientX, event.clientY)?.closest('.editor-tab') as HTMLElement | null;
    if (!targetEl) {
      clearTabDropIndicators();
      return;
    }

    const targetId = targetEl.dataset.tabId;
    if (!targetId || targetId === tabDragState.tabId) {
      clearTabDropIndicators();
      syncDraggedTabVisuals();
      return;
    }

    clearTabDropIndicators();
    const rect = targetEl.getBoundingClientRect();
    const place = event.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
    moveTab(tabDragState.tabId, targetId, place);

    document
      .querySelector<HTMLElement>(`.editor-tab[data-tab-id="${targetId}"]`)
      ?.classList.add(place === 'before' ? 'drag-over-before' : 'drag-over-after');
    syncDraggedTabVisuals();
  });

  const endDrag = () => {
    if (!tabDragState) return;
    finishTabDrag();
  };

  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);
}

function moveTab(tabId: string, targetId: string, place: 'before' | 'after') {
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
  const container = document.getElementById('editor-tabs')!;
  container.innerHTML = '';
  bindTabDragListeners();

  tabs.forEach((tab) => {
    const el = document.createElement('div');
    el.className = 'editor-tab' + (tab.id === activeTab?.id ? ' active' : '');
    el.setAttribute('data-tab-id', tab.id);

    const label = document.createElement('span');
    label.className = 'tab-label';
    label.textContent = `${tab.name}${tab.dirty ? ' *' : ''}${tab.externalModified ? ' !' : ''}`;

    const close = document.createElement('span');
    close.className = 'tab-close';
    close.textContent = '\u00d7';

    el.append(label, close);

    el.addEventListener('click', () => {
      if (suppressNextClickTabId === tab.id) {
        suppressNextClickTabId = null;
        return;
      }
      switchTo(tab);
    });
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      closeTab(tab.id);
    });

    el.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      if ((event.target as HTMLElement).closest('.tab-close')) return;
      suppressNextClickTabId = null;
      tabDragState = {
        tabId: tab.id,
        startX: event.clientX,
        startY: event.clientY,
        started: false,
      };
    });

    container.appendChild(el);
  });

  syncDraggedTabVisuals();
}

export function findTabByPath(path: string): Tab | undefined {
  return tabs.find((tab) => tab.path === path);
}

function updateStatusbar() {
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
