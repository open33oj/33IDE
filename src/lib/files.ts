import { open, save } from '@tauri-apps/plugin-dialog';
import { api } from './api';
import { createTab, switchTo, findTabByPath, getActiveTab, getView, markDirty, getNextTabId, renderTabs } from './tabs';
import { setStatus } from './ui';

export async function newFile(defaultTemplate: string) {
  const id = getNextTabId();
  let tpl = defaultTemplate;
  try { tpl = await api.readTemplate(); } catch {}
  createTab(`untitled_${id}.cpp`, tpl);
}

export async function openFile() {
  try {
    const filePath = await open({
      filters: [{ name: 'C++', extensions: ['cpp', 'cc', 'cxx', 'c', 'h', 'hpp'] }, { name: 'All', extensions: ['*'] }]
    });
    if (!filePath) return;
    const content = await api.readFile(filePath as string);
    createTab((filePath as string).split(/[/\\]/).pop()!, content, filePath as string);
  } catch (e: any) { setStatus('打开失败: ' + e, 'error'); }
}

export async function saveFile() {
  const tab = getActiveTab();
  if (!tab) return;
  if (!tab.path) { await saveFileAs(); return; }
  try {
    await api.writeFile(tab.path, getView().state.doc.toString());
    tab.dirty = false;
    renderTabs();
    setStatus('已保存: ' + tab.name, 'success');
  } catch (e: any) { setStatus('保存失败: ' + e, 'error'); }
}

export async function saveFileAs() {
  const tab = getActiveTab();
  if (!tab) return;
  try {
    const filePath = await save({
      defaultPath: tab.path || '',
      filters: [{ name: 'C++', extensions: ['cpp'] }, { name: 'All', extensions: ['*'] }]
    });
    if (!filePath) return;
    await api.writeFile(filePath as string, getView().state.doc.toString());
    tab.path = filePath as string;
    tab.name = (filePath as string).split(/[/\\]/).pop()!;
    tab.dirty = false;
    renderTabs();
    setStatus('已保存: ' + tab.name, 'success');
  } catch (e: any) { setStatus('保存失败: ' + e, 'error'); }
}

export async function openTemplate() {
  try {
    const [path, content] = await api.openTemplate();
    const name = path.split(/[/\\]/).pop()!;
    const existing = findTabByPath(path);
    if (existing) switchTo(existing);
    else createTab(name, content, path);
    setStatus('已打开模板: ' + name);
  } catch (e: any) { setStatus('打开模板失败: ' + e, 'error'); }
}
