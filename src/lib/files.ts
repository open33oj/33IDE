import { open, save } from '@tauri-apps/plugin-dialog';
import { api, AppConfig } from './api';
import {
  createTab,
  findTabByPath,
  getActiveTab,
  getNextTabId,
  getTabContent,
  getTabs,
  getView,
  onTabDirty,
  renderTabs,
  replaceTabContent,
  switchTo,
  Tab,
} from './tabs';
import { setStatus } from './ui';
import { t } from './i18n';

const EXTERNAL_CHECK_INTERVAL_MS = 3000;
const AUTO_SAVE_DELAY_MS = 1000;

let monitorStarted = false;
let checkInFlight = false;
let autoSaveConfig: Pick<AppConfig, 'auto_save_existing_files'> | null = null;
let autoSaveStarted = false;
const autoSaveTimers = new Map<string, number>();

export async function newFile(defaultTemplate: string) {
  const id = getNextTabId();
  createTab(`untitled_${id}.cpp`, defaultTemplate);
}

export async function openFile() {
  try {
    const filePath = await open({
      filters: [
        { name: t('fileDialog.cpp'), extensions: ['cpp', 'cc', 'cxx', 'c', 'h', 'hpp'] },
        { name: t('fileDialog.all'), extensions: ['*'] },
      ],
    });
    if (!filePath) return;

    const normalizedPath = filePath as string;
    const existingTab = findTabByPath(normalizedPath);
    if (existingTab) {
      switchTo(existingTab);
      await promptReloadIfNeeded(existingTab);
      return;
    }

    const content = await api.readFile(normalizedPath);
    createTab(normalizedPath.split(/[/\\]/).pop()!, content, normalizedPath);
  } catch (e: any) {
    setStatus(t('status.openFailed', { error: String(e) }), 'error');
  }
}

export async function saveFile() {
  const tab = getActiveTab();
  if (!tab) return;

  await saveTab(tab);
}

export async function saveTab(tab: Tab): Promise<boolean> {
  if (!tab.path) return saveTabAs(tab);

  try {
    const content = getTabContent(tab);
    await api.writeFile(tab.path, content);
    tab.dirty = false;
    tab.diskContent = content;
    tab.externalModified = false;
    tab.pendingExternalContent = null;
    tab.lastPromptedExternalContent = null;
    renderTabs();
    setStatus(t('status.saved', { name: tab.name }), 'success');
    return true;
  } catch (e: any) {
    setStatus(t('status.saveFailed', { error: String(e) }), 'error');
    return false;
  }
}

export async function saveFileAs() {
  const tab = getActiveTab();
  if (!tab) return;

  await saveTabAs(tab);
}

export async function saveTabAs(tab: Tab): Promise<boolean> {
  switchTo(tab);

  try {
    const filePath = await save({
      defaultPath: tab.path || tab.name,
      filters: [
        { name: t('fileDialog.cpp'), extensions: ['cpp'] },
        { name: t('fileDialog.all'), extensions: ['*'] },
      ],
    });
    if (!filePath) return false;

    const normalizedPath = filePath as string;
    const content = getTabContent(tab);
    await api.writeFile(normalizedPath, content);
    tab.path = normalizedPath;
    tab.name = normalizedPath.split(/[/\\]/).pop()!;
    tab.dirty = false;
    tab.diskContent = content;
    tab.externalModified = false;
    tab.pendingExternalContent = null;
    tab.lastPromptedExternalContent = null;
    renderTabs();
    setStatus(t('status.saved', { name: tab.name }), 'success');
    return true;
  } catch (e: any) {
    setStatus(t('status.saveFailed', { error: String(e) }), 'error');
    return false;
  }
}

export function initAutoSave(config: Pick<AppConfig, 'auto_save_existing_files'>) {
  autoSaveConfig = config;
  if (autoSaveStarted) return;
  autoSaveStarted = true;
  onTabDirty((tab) => {
    scheduleAutoSave(tab);
  });
}

function scheduleAutoSave(tab: Tab) {
  if (!autoSaveConfig?.auto_save_existing_files || !tab.path || tab.externalModified) return;

  const existingTimer = autoSaveTimers.get(tab.id);
  if (existingTimer != null) window.clearTimeout(existingTimer);

  const timer = window.setTimeout(() => {
    autoSaveTimers.delete(tab.id);
    void autoSaveTab(tab);
  }, AUTO_SAVE_DELAY_MS);
  autoSaveTimers.set(tab.id, timer);
}

async function autoSaveTab(tab: Tab) {
  if (!autoSaveConfig?.auto_save_existing_files || !tab.path || !tab.dirty || tab.externalModified) return;

  const content = getTabContent(tab);
  try {
    await api.writeFile(tab.path, content);
    tab.diskContent = content;
    tab.externalModified = false;
    tab.pendingExternalContent = null;
    tab.lastPromptedExternalContent = null;
    tab.dirty = getTabContent(tab) !== content;
    renderTabs();
    if (!tab.dirty) {
      setStatus(t('status.autoSaved', { name: tab.name }), 'success');
    }
  } catch (e: any) {
    setStatus(t('status.autoSaveFailed', { error: String(e) }), 'error');
  }
}

export async function revealActiveFileFolder() {
  const tab = getActiveTab();
  if (!tab?.path) {
    setStatus(t('status.noSavedFile'), 'error');
    return;
  }

  try {
    await api.revealInExplorer(tab.path);
  } catch (e: any) {
    setStatus(t('status.error', { error: String(e) }), 'error');
  }
}

export function initExternalFileMonitor() {
  if (monitorStarted) return;
  monitorStarted = true;

  const scheduleCheck = () => {
    void checkForExternalChanges();
  };

  window.setInterval(scheduleCheck, EXTERNAL_CHECK_INTERVAL_MS);
  window.addEventListener('focus', scheduleCheck);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleCheck();
  });
}

async function checkForExternalChanges() {
  if (checkInFlight || document.hidden) return;
  checkInFlight = true;

  try {
    const fileTabs = getTabs().filter((tab) => tab.path);

    for (const tab of fileTabs) {
      try {
        const diskContent = await api.readFile(tab.path);
        if (diskContent === tab.diskContent) {
          if (tab.externalModified) {
            tab.externalModified = false;
            tab.pendingExternalContent = null;
            tab.lastPromptedExternalContent = null;
            renderTabs();
          }
          continue;
        }

        if (diskContent !== tab.pendingExternalContent) {
          tab.externalModified = true;
          tab.pendingExternalContent = diskContent;
          tab.lastPromptedExternalContent = null;
          renderTabs();
        }
      } catch {}
    }

    await promptReloadIfNeeded(getActiveTab());
  } finally {
    checkInFlight = false;
  }
}

export async function promptReloadIfNeeded(tab: Tab | null | undefined) {
  if (!tab?.path || !tab.externalModified || tab.pendingExternalContent == null) return;
  if (tab.lastPromptedExternalContent === tab.pendingExternalContent) return;

  tab.lastPromptedExternalContent = tab.pendingExternalContent;
  const confirmed = confirm(
    t(tab.dirty ? 'dialog.fileChangedDirty' : 'dialog.fileChanged', { name: tab.name }),
  );
  if (!confirmed) return;

  await reloadTabFromDisk(tab, tab.pendingExternalContent);
}

async function reloadTabFromDisk(tab: Tab, content?: string) {
  const nextContent = content ?? await api.readFile(tab.path);
  replaceTabContent(tab, nextContent, {
    dirty: false,
    diskContent: nextContent,
    externalModified: false,
    pendingExternalContent: null,
    lastPromptedExternalContent: null,
  });
  setStatus(t('status.reloaded', { name: tab.name }), 'success');
}
