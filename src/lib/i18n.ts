export type UiLocale = 'zh-CN' | 'en-US';

const APP_VERSION = import.meta.env.VITE_APP_VERSION || '0.10.2';
const APP_TITLE = `33IDE Lite v${APP_VERSION}`;

const messages = {
  'zh-CN': {
    'app.title': APP_TITLE,
    'loading.initializing': '正在初始化...',
    'loading.config': '加载配置...',
    'loading.ready': '等待页面就绪...',
    'loading.editor': '创建编辑器...',
    'loading.document': '加载文档...',
    'loading.styles': '修复样式...',
    'loading.theme': '应用主题...',
    'loading.font': '设置字体...',
    'loading.events': '绑定事件...',
    'loading.compiler': '检测编译器...',
    'loading.done': '就绪',
    'menu.file': '文件',
    'menu.file.new': '新建',
    'menu.file.open': '打开...',
    'menu.file.save': '保存',
    'menu.file.saveAs': '另存为...',
    'menu.theme': '主题',
    'menu.format': '格式化',
    'menu.formatTitle': '格式化代码 (Shift+Alt+F)',
    'menu.settings': '设置',
    'settings.open': '打开设置',
    'toolbar.terminal': '终端运行',
    'toolbar.run': '运行 (F5)',
    'toolbar.running': '运行中...',
    'toolbar.stop': '停止',
    'sidebar.input': '输入',
    'sidebar.output': '输出',
    'placeholder.stdin': '在此输入程序的 stdin 数据...',
    'output.idle': '点击“运行”或按 F5 编译运行代码',
    'output.compiling': '编译中...',
    'output.running': '运行中...',
    'output.compileError': '编译错误:\n',
    'output.cancelled': '运行已停止',
    'output.timeout': '\n[运行超时: {time}ms]',
    'output.exitInfo': '\n[退出代码: {code}, 耗时: {time}ms]',
    'status.ready': '就绪',
    'status.settingsSaved': '设置已保存',
    'status.formatSuccess': '已格式化',
    'status.formatNoChange': '代码已经是格式化状态',
    'status.formatFailed': '格式化失败: {error}',
    'status.runSuccess': '运行成功',
    'status.runFailed': '运行失败',
    'status.runCancelled': '运行已停止',
    'status.runTimeout': '运行超时',
    'status.noActiveRun': '没有正在运行的任务',
    'status.compileError': '编译错误',
    'status.error': '错误: {error}',
    'status.noSavedFile': '当前标签还没有保存到文件',
    'status.openFailed': '打开失败: {error}',
    'status.saved': '已保存: {name}',
    'status.saveFailed': '保存失败: {error}',
    'status.autoSaved': '已自动保存: {name}',
    'status.autoSaveFailed': '自动保存失败: {error}',
    'status.reloaded': '已重新加载: {name}',
    'themeMenu.editorTheme': '编辑器主题',
    'themeMenu.fontSize': '字号',
    'themeMenu.zoom': '缩放',
    'settings.title': '设置',
    'settings.section.build': '编译与运行',
    'settings.section.editor': '编辑器',
    'settings.section.format': '格式化',
    'settings.section.template': '模板',
    'settings.compilerPath': '编译器路径',
    'settings.compileFlags': '编译参数（每行一个）',
    'settings.timeLimit': '时间限制（毫秒）',
    'settings.stackSize': '栈大小',
    'settings.theme': '主题',
    'settings.defaultLanguage': '默认语言',
    'settings.uiLanguage': '界面语言',
    'settings.fontSize': '字号',
    'settings.zoom': '缩放 (%)',
    'settings.tabSize': 'Tab 宽度',
    'settings.autoSaveExisting': '自动保存已有文件',
    'settings.fontFamily': '字体',
    'settings.bracesAllman': '花括号单独换行（Allman）',
    'settings.defaultTemplate': '默认模板',
    'settings.cancel': '取消',
    'settings.reset': '恢复默认设置',
    'settings.save': '保存',
    'context.selectAll': '全选',
    'context.cut': '剪切',
    'context.copy': '复制',
    'context.paste': '粘贴',
    'context.reveal': '打开所在文件夹',
    'context.save': '保存',
    'context.saveAs': '另存为...',
    'context.close': '关闭',
    'context.closeOthers': '关闭其他',
    'dialog.unsavedTitle': '未保存的更改',
    'dialog.save': '保存',
    'dialog.dontSave': '不保存',
    'dialog.saveBeforeClose': '{name} 尚未保存。是否在关闭前保存？',
    'dialog.closeUnsaved': '{name} 尚未保存，确定关闭吗？',
    'dialog.fileChanged': '{name} 已被外部修改，是否重新加载？',
    'dialog.fileChangedDirty': '{name} 已被外部修改，当前标签也有未保存内容。重新加载会丢失当前修改，是否继续？',
    'fileDialog.cpp': 'C++',
    'fileDialog.all': '全部文件',
  },
  'en-US': {
    'app.title': APP_TITLE,
    'loading.initializing': 'Initializing...',
    'loading.config': 'Loading configuration...',
    'loading.ready': 'Waiting for the page to be ready...',
    'loading.editor': 'Creating editor...',
    'loading.document': 'Loading document...',
    'loading.styles': 'Fixing styles...',
    'loading.theme': 'Applying theme...',
    'loading.font': 'Applying font...',
    'loading.events': 'Binding events...',
    'loading.compiler': 'Detecting compiler...',
    'loading.done': 'Ready',
    'menu.file': 'File',
    'menu.file.new': 'New',
    'menu.file.open': 'Open...',
    'menu.file.save': 'Save',
    'menu.file.saveAs': 'Save As...',
    'menu.theme': 'Theme',
    'menu.format': 'Format',
    'menu.formatTitle': 'Format Code (Shift+Alt+F)',
    'menu.settings': 'Settings',
    'settings.open': 'Open Settings',
    'toolbar.terminal': 'Run In Terminal',
    'toolbar.run': 'Run (F5)',
    'toolbar.running': 'Running...',
    'toolbar.stop': 'Stop',
    'sidebar.input': 'Input',
    'sidebar.output': 'Output',
    'placeholder.stdin': 'Enter stdin data here...',
    'output.idle': 'Click "Run" or press F5 to compile and run the code',
    'output.compiling': 'Compiling...',
    'output.running': 'Running...',
    'output.compileError': 'Compile Error:\n',
    'output.cancelled': 'Run stopped',
    'output.timeout': '\n[Timeout: {time}ms]',
    'output.exitInfo': '\n[Exit Code: {code}, Time: {time}ms]',
    'status.ready': 'Ready',
    'status.settingsSaved': 'Settings saved',
    'status.formatSuccess': 'Formatted',
    'status.formatNoChange': 'Code is already formatted',
    'status.formatFailed': 'Format failed: {error}',
    'status.runSuccess': 'Run succeeded',
    'status.runFailed': 'Run failed',
    'status.runCancelled': 'Run stopped',
    'status.runTimeout': 'Run timed out',
    'status.noActiveRun': 'No active run',
    'status.compileError': 'Compile error',
    'status.error': 'Error: {error}',
    'status.noSavedFile': 'Current tab has no saved file',
    'status.openFailed': 'Open failed: {error}',
    'status.saved': 'Saved: {name}',
    'status.saveFailed': 'Save failed: {error}',
    'status.autoSaved': 'Auto-saved: {name}',
    'status.autoSaveFailed': 'Auto-save failed: {error}',
    'status.reloaded': 'Reloaded: {name}',
    'themeMenu.editorTheme': 'Editor Theme',
    'themeMenu.fontSize': 'Font Size',
    'themeMenu.zoom': 'Zoom',
    'settings.title': 'Settings',
    'settings.section.build': 'Build And Run',
    'settings.section.editor': 'Editor',
    'settings.section.format': 'Format',
    'settings.section.template': 'Template',
    'settings.compilerPath': 'Compiler Path',
    'settings.compileFlags': 'Compile Flags (one per line)',
    'settings.timeLimit': 'Time Limit (ms)',
    'settings.stackSize': 'Stack Size',
    'settings.theme': 'Theme',
    'settings.defaultLanguage': 'Default Language',
    'settings.uiLanguage': 'UI Language',
    'settings.fontSize': 'Font Size',
    'settings.zoom': 'Zoom (%)',
    'settings.tabSize': 'Tab Size',
    'settings.autoSaveExisting': 'Auto-save existing files',
    'settings.fontFamily': 'Font Family',
    'settings.bracesAllman': 'Put Braces On New Line (Allman)',
    'settings.defaultTemplate': 'Default Template',
    'settings.cancel': 'Cancel',
    'settings.reset': 'Reset To Defaults',
    'settings.save': 'Save',
    'context.selectAll': 'Select All',
    'context.cut': 'Cut',
    'context.copy': 'Copy',
    'context.paste': 'Paste',
    'context.reveal': 'Reveal In Explorer',
    'context.save': 'Save',
    'context.saveAs': 'Save As...',
    'context.close': 'Close',
    'context.closeOthers': 'Close Others',
    'dialog.unsavedTitle': 'Unsaved Changes',
    'dialog.save': 'Save',
    'dialog.dontSave': "Don't Save",
    'dialog.saveBeforeClose': '{name} has unsaved changes. Save it before closing?',
    'dialog.closeUnsaved': '{name} has unsaved changes. Close it anyway?',
    'dialog.fileChanged': '{name} was modified outside the editor. Reload it now?',
    'dialog.fileChangedDirty': '{name} was modified outside the editor, and this tab also has unsaved changes. Reloading will discard your current edits. Continue?',
    'fileDialog.cpp': 'C++',
    'fileDialog.all': 'All Files',
  },
} as const;

type MessageKey = keyof typeof messages['zh-CN'];

let currentLocale: UiLocale = normalizeLocale(
  typeof navigator === 'undefined' ? 'zh-CN' : navigator.language,
);

export function normalizeLocale(locale?: string): UiLocale {
  const normalized = (locale || '').toLowerCase();
  if (normalized.startsWith('en')) return 'en-US';
  return 'zh-CN';
}

export function getCurrentLocale(): UiLocale {
  return currentLocale;
}

export function setLocale(locale?: string) {
  currentLocale = normalizeLocale(locale);
}

export function t(key: MessageKey, vars?: Record<string, string | number>) {
  const template = messages[currentLocale][key] || messages['zh-CN'][key] || key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? `{${name}}`));
}

export function applyI18n(locale?: string) {
  setLocale(locale);
  document.documentElement.lang = currentLocale;
  document.title = t('app.title');

  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((element) => {
    const key = element.dataset.i18n as MessageKey | undefined;
    if (!key) return;
    element.textContent = t(key);
  });

  document.querySelectorAll<HTMLElement>('[data-i18n-placeholder]').forEach((element) => {
    const key = element.dataset.i18nPlaceholder as MessageKey | undefined;
    if (!key) return;
    if ('placeholder' in element) {
      (element as HTMLInputElement | HTMLTextAreaElement).placeholder = t(key);
    }
  });

  document.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((element) => {
    const key = element.dataset.i18nTitle as MessageKey | undefined;
    if (!key) return;
    element.title = t(key);
  });
}
