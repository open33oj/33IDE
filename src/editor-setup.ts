import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker&inline';
import { conf as cppConf, language as cppLanguage } from 'monaco-editor/esm/vs/basic-languages/cpp/cpp';
import { SuggestWidget } from 'monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestWidget';
import { defineMonacoThemes, getTheme, themes } from './lib/themes';

(self as any).MonacoEnvironment = {
  getWorker() {
    return new EditorWorker();
  },
};

export type EditorView = monaco.editor.IStandaloneCodeEditor;
export type EditorModel = monaco.editor.ITextModel;
export type EditorSelection = monaco.Selection;
export type EditorViewState = monaco.editor.ICodeEditorViewState;

const DEFAULT_FONT = "'Consolas', 'Courier New', 'Microsoft YaHei', 'SimHei', 'NSimSun', monospace";
const SUGGEST_LINE_HEIGHT_RATIO = 1.45;
const SUGGEST_VISIBLE_ITEMS = 3;

let currentThemeId = 'oneDark';
let currentTabSize = 4;
let currentFontSize = 16;
let currentFontFamily = DEFAULT_FONT;
let monacoBootstrapped = false;
let cppLanguageRegistered = false;
let suggestWidgetPatched = false;
const layoutObservers = new WeakMap<EditorView, ResizeObserver>();
const TOKEN_STYLE_ID = '33ide-monaco-token-colors';

export interface EditorTabState {
  model: EditorModel;
  viewState: EditorViewState | null;
}

export function bootstrapMonaco() {
  if (monacoBootstrapped) return;
  monacoBootstrapped = true;
  patchSuggestWidgetLayout();
  registerCppLanguage();
  defineMonacoThemes(monaco);
  warmCppTokenizer();
}

export function createEditor(parent: HTMLElement, _initialDoc: string, _onDirty: () => void): EditorView {
  bootstrapMonaco();
  const theme = getTheme(currentThemeId);
  document.body.classList.remove('theme-dark', 'theme-light');
  document.body.classList.add('theme-' + theme.mode);

  const editor = monaco.editor.create(parent, {
    model: null,
    language: 'cpp',
    theme: theme.monacoTheme,
    automaticLayout: true,
    fontFamily: currentFontFamily,
    fontSize: currentFontSize,
    lineHeight: Math.round(currentFontSize * 1.4),
    tabSize: currentTabSize,
    insertSpaces: true,
    detectIndentation: false,
    minimap: { enabled: false },
    stickyScroll: { enabled: false },
    folding: true,
    glyphMargin: true,
    lineNumbers: 'on',
    roundedSelection: false,
    selectionHighlight: false,
    occurrencesHighlight: 'off',
    renderWhitespace: 'none',
    renderControlCharacters: false,
    unicodeHighlight: {
      ambiguousCharacters: false,
      invisibleCharacters: false,
      nonBasicASCII: false,
    },
    scrollBeyondLastLine: false,
    wordWrap: 'off',
    dragAndDrop: true,
    dropIntoEditor: { enabled: false },
    autoIndent: 'advanced',
    bracketPairColorization: { enabled: true },
    autoClosingBrackets: 'always',
    autoClosingQuotes: 'always',
    formatOnPaste: false,
    formatOnType: false,
    contextmenu: false,
    quickSuggestions: {
      other: true,
      comments: false,
      strings: false,
    },
    suggestOnTriggerCharacters: true,
    acceptSuggestionOnCommitCharacter: false,
    suggestLineHeight: getSuggestLineHeight(),
    fixedOverflowWidgets: false,
    allowOverflow: false,
    hideCursorInOverviewRuler: true,
    overviewRulerLanes: 0,
    overviewRulerBorder: false,
    renderLineHighlight: 'line',
    // Keep WebView2 hardware acceleration enabled, but avoid Monaco's
    // experimental GPU text atlas: it throws OffscreenCanvas drawImage errors
    // in WebView2 and can leave the editor half-rendered.
    experimentalGpuAcceleration: 'off',
    scrollbar: {
      vertical: 'auto',
      horizontal: 'auto',
      useShadows: false,
      alwaysConsumeMouseWheel: false,
      verticalScrollbarSize: 10,
      horizontalScrollbarSize: 10,
    },
  });
  installEditorLayoutStabilizer(editor, parent);
  scheduleScopedTokenColors();
  return editor;
}

export function createEditorModel(content: string, onDirty: () => void): EditorModel {
  bootstrapMonaco();
  const model = monaco.editor.createModel(content, 'cpp');
  monaco.editor.setModelLanguage(model, 'cpp');
  warmCppTokenizer();
  model.onDidChangeContent(() => onDirty());
  return model;
}

export function getEditorValue(view: EditorView): string {
  return view.getModel()?.getValue() || '';
}

export function getModel(view: EditorView): EditorModel {
  const model = view.getModel();
  if (!model) throw new Error('Editor model is not initialized');
  return model;
}

export function getCursorOffset(view: EditorView): number {
  const model = getModel(view);
  const position = view.getPosition() || model.getPositionAt(0);
  return model.getOffsetAt(position);
}

export function setCursorOffset(view: EditorView, offset: number) {
  const model = getModel(view);
  const position = model.getPositionAt(Math.max(0, Math.min(offset, model.getValueLength())));
  view.setPosition(position);
  view.revealPositionInCenter(position);
}

export function selectAll(view: EditorView) {
  const model = getModel(view);
  view.setSelection(model.getFullModelRange());
  view.focus();
}

export function getSelectionOffsets(view: EditorView) {
  const model = getModel(view);
  const selection = view.getSelection() || new monaco.Selection(1, 1, 1, 1);
  const from = model.getOffsetAt(selection.getStartPosition());
  const to = model.getOffsetAt(selection.getEndPosition());
  return {
    from,
    to,
    empty: from === to,
    text: model.getValueInRange(selection),
    selection,
  };
}

export function replaceSelection(view: EditorView, text: string) {
  const selection = view.getSelection();
  if (!selection) return;
  view.executeEdits('33ide', [{ range: selection, text, forceMoveMarkers: true }]);
  view.focus();
}

export function replaceEditorValue(view: EditorView, text: string, cursorOffset?: number) {
  const model = getModel(view);
  view.executeEdits('33ide', [{
    range: model.getFullModelRange(),
    text,
    forceMoveMarkers: true,
  }]);
  if (typeof cursorOffset === 'number') {
    setCursorOffset(view, cursorOffset);
  }
}

export function switchTheme(_view: EditorView, themeId: string) {
  bootstrapMonaco();
  const theme = getTheme(themeId);
  currentThemeId = theme.id;
  monaco.editor.setTheme(theme.monacoTheme);
  document.body.classList.remove('theme-dark', 'theme-light');
  document.body.classList.add('theme-' + theme.mode);
  scheduleScopedTokenColors();
  fixEditorStyles();
}

export function setDefaultTabSize(tabSize: number) {
  currentTabSize = normalizeTabSize(tabSize);
}

export function applyTabSize(view: EditorView, tabSize: number) {
  setDefaultTabSize(tabSize);
  view.updateOptions({
    tabSize: currentTabSize,
    insertSpaces: true,
    detectIndentation: false,
  });
}

export function applyFont(view: EditorView, fontSize: number, fontFamily?: string) {
  currentFontSize = Math.max(10, Math.min(32, fontSize || 16));
  currentFontFamily = fontFamily || DEFAULT_FONT;
  view.updateOptions({
    fontSize: currentFontSize,
    fontFamily: currentFontFamily,
    lineHeight: Math.round(currentFontSize * 1.4),
    suggestLineHeight: getSuggestLineHeight(),
  });
  forceLayout(view);
}

export function forceLayout(view: EditorView) {
  scheduleEditorLayout(view, 3);
}

function scheduleEditorLayout(view: EditorView, rounds = 2) {
  let remaining = rounds;
  const run = () => {
    monaco.editor.remeasureFonts();
    view.layout();
    remaining -= 1;
    if (remaining > 0) {
      requestAnimationFrame(run);
    }
  };
  requestAnimationFrame(run);
}

function installEditorLayoutStabilizer(view: EditorView, parent: HTMLElement) {
  if (layoutObservers.has(view)) return;

  const observer = new ResizeObserver(() => scheduleEditorLayout(view));
  observer.observe(parent);
  if (parent.parentElement) observer.observe(parent.parentElement);
  layoutObservers.set(view, observer);

  const onWindowResize = () => scheduleEditorLayout(view);
  const onVisibilityChange = () => {
    if (!document.hidden) scheduleEditorLayout(view, 4);
  };
  window.addEventListener('resize', onWindowResize);
  document.addEventListener('visibilitychange', onVisibilityChange);

  void document.fonts?.ready.then(() => scheduleEditorLayout(view, 4));
  [0, 50, 250, 1000].forEach((delay) => {
    window.setTimeout(() => scheduleEditorLayout(view, 3), delay);
  });

  view.onDidDispose(() => {
    observer.disconnect();
    window.removeEventListener('resize', onWindowResize);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    layoutObservers.delete(view);
  });
}

export function lockGutterWidths(_view: EditorView) {
  // Monaco owns the gutter layout internally; keep this as a compatibility hook.
}

export function installEditorKeybindings(view: EditorView) {
  view.onKeyDown((event) => {
    if (event.keyCode === monaco.KeyCode.Enter) {
      if (handleSmartEnter(view)) {
        event.preventDefault();
      }
    }
  });

  view.onDidType((text) => {
    if (text === '<') completeIncludeAngleBracket(view);
    if (text.includes(';')) hideSuggestWidget(view);
  });
}

function normalizeTabSize(tabSize: number) {
  return Math.max(1, Math.min(8, tabSize || 4));
}

function handleSmartEnter(view: EditorView): boolean {
  const model = view.getModel();
  const position = view.getPosition();
  const selection = view.getSelection();
  if (!model || !position || !selection?.isEmpty()) return false;

  const offset = model.getOffsetAt(position);
  const code = model.getValue();
  const line = model.getLineContent(position.lineNumber);
  const indent = line.match(/^(\s*)/)?.[1] || '';
  const extra = ' '.repeat(currentTabSize);

  if (code[offset - 1] !== '{') return false;

  if (code[offset] !== '}') {
    const text = '\n' + indent + extra;
    view.executeEdits('33ide', [{ range: selection, text, forceMoveMarkers: true }]);
    setCursorOffset(view, offset + text.length);
    return true;
  }

  const text = '\n' + indent + extra + '\n' + indent;
  view.executeEdits('33ide', [{ range: selection, text, forceMoveMarkers: true }]);
  setCursorOffset(view, offset + 1 + indent.length + extra.length);
  return true;
}

function completeIncludeAngleBracket(view: EditorView) {
  const model = view.getModel();
  const position = view.getPosition();
  if (!model || !position) return;

  const line = model.getLineContent(position.lineNumber);
  const before = line.slice(0, position.column - 2);
  const after = line.slice(position.column - 1);
  if (!/^\s*#\s*include\s*$/.test(before) || after.startsWith('>')) return;

  view.executeEdits('33ide', [{
    range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
    text: '>',
    forceMoveMarkers: true,
  }]);
  view.setPosition(position);
}

function hideSuggestWidget(view: EditorView) {
  view.trigger('33ide', 'hideSuggestWidget', undefined);
}

export function fixEditorStyles() {
  warmCppTokenizer();
  scheduleScopedTokenColors();
  monaco.editor.remeasureFonts();
  for (const editor of monaco.editor.getEditors()) {
    scheduleEditorLayout(editor, 4);
  }
}

function registerCppLanguage() {
  if (cppLanguageRegistered) return;
  cppLanguageRegistered = true;

  if (!monaco.languages.getLanguages().some((language) => language.id === 'cpp')) {
    monaco.languages.register({
      id: 'cpp',
      extensions: ['.cpp', '.cc', '.cxx', '.hpp', '.hh', '.hxx'],
      aliases: ['C++', 'Cpp', 'cpp'],
    });
  }
  monaco.languages.setMonarchTokensProvider('cpp', cppLanguage);
  monaco.languages.setLanguageConfiguration('cpp', cppConf);
}

function warmCppTokenizer() {
  monaco.editor.tokenize('int main() { return 0; }', 'cpp');
  for (const model of monaco.editor.getModels()) {
    if (model.getLanguageId() !== 'cpp') continue;
    model.tokenization.forceTokenization(Math.min(model.getLineCount(), 50));
  }
}

function scheduleScopedTokenColors(rounds = 4) {
  let remaining = rounds;
  const run = () => {
    syncScopedTokenColors();
    remaining -= 1;
    if (remaining > 0) requestAnimationFrame(run);
  };
  requestAnimationFrame(run);
}

function syncScopedTokenColors() {
  const source = document.querySelector<HTMLStyleElement>('style.monaco-colors')?.textContent || '';
  const tokenRules = source.match(/\.mtk[a-zA-Z0-9_-]+(?:\s*,\s*\.mtk[a-zA-Z0-9_-]+)*\s*\{[^}]+\}/g) || [];
  if (tokenRules.length === 0) return;

  const scopedRules = tokenRules
    .map((rule) => rule.replace(/(^|,\s*)(\.mtk)/g, '$1#editor .monaco-editor $2'))
    .join('\n');

  let style = document.getElementById(TOKEN_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = TOKEN_STYLE_ID;
    document.head.appendChild(style);
  }
  if (style.textContent !== scopedRules) {
    style.textContent = scopedRules;
  }
}

function getSuggestLineHeight() {
  return Math.round(currentFontSize * SUGGEST_LINE_HEIGHT_RATIO);
}

function patchSuggestWidgetLayout() {
  if (suggestWidgetPatched) return;
  suggestWidgetPatched = true;

  const original = SuggestWidget.prototype.getLayoutInfo;
  SuggestWidget.prototype.getLayoutInfo = function patchedGetLayoutInfo() {
    const info = original.call(this);
    info.defaultSize = info.defaultSize.with(undefined, info.statusBarHeight + SUGGEST_VISIBLE_ITEMS * info.itemHeight + info.borderHeight);
    return info;
  };
}

export { monaco, themes };
