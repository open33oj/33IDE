import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, rectangularSelection, dropCursor, Decoration, WidgetType } from '@codemirror/view';
import { EditorState, Extension, Compartment, Prec, StateEffect, StateField } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentMore, indentLess } from '@codemirror/commands';
import { cpp } from '@codemirror/lang-cpp';
import { indentOnInput, bracketMatching, foldGutter, foldKeymap, indentUnit } from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { lintKeymap } from '@codemirror/lint';
import { getTheme, themes } from './lib/themes';
import { cppCompletion } from './lib/cpp-completion';
import { createLinterExtension } from './lib/diagnostics';

const themeCompartment = new Compartment();
const tabBehaviorCompartment = new Compartment();
let currentThemeId = 'oneDark';
let currentTabSize = 4;

const DEFAULT_FONT = "'Consolas', 'Courier New', 'Microsoft YaHei', 'SimHei', 'NSimSun', monospace";
const DRAG_SELECTION_THRESHOLD = 5;

type SelectionDragState = {
  view: EditorView;
  from: number;
  to: number;
  text: string;
  startX: number;
  startY: number;
  started: boolean;
};

let selectionDragState: SelectionDragState | null = null;
let selectionDragListenersBound = false;
let codeMirrorStyleObserver: MutationObserver | null = null;
let codeMirrorStyleSyncFrame: number | null = null;

class ManualDropCursorWidget extends WidgetType {
  toDOM() {
    const element = document.createElement('span');
    element.className = 'cm-dropCursor cm-manualDropCursor';
    return element;
  }
}

const setManualDropCursorPos = StateEffect.define<number | null>();

const manualDropCursorField = StateField.define<Decoration>({
  create() {
    return Decoration.none;
  },
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (!effect.is(setManualDropCursorPos)) continue;
      if (effect.value == null) return Decoration.none;
      return Decoration.set([
        Decoration.widget({
          widget: new ManualDropCursorWidget(),
          side: -1,
        }).range(effect.value),
      ]);
    }
    return transaction.docChanged ? value.map(transaction.changes) : value;
  },
  provide: (field) => EditorView.decorations.from(field),
});

function makeTabKeymap(spaces: number) {
  const indent = ' '.repeat(spaces);
  return keymap.of([
    {
      key: 'Tab',
      run: ({ state, dispatch }) => {
        if (state.selection.main.empty) {
          dispatch(state.replaceSelection(indent));
          return true;
        }
        indentMore({ state, dispatch });
        return true;
      },
    },
    {
      key: 'Shift-Tab',
      run: ({ state, dispatch }) => {
        indentLess({ state, dispatch });
        return true;
      },
    },
  ]);
}

function makePairedBracketDeleteKeymap() {
  const pairs: Record<string, string> = {
    '(': ')',
    '[': ']',
    '{': '}',
  };

  return keymap.of([
    {
      key: 'Backspace',
      run: ({ state, dispatch }) => {
        const sel = state.selection.main;
        if (!sel.empty || sel.from === 0 || sel.from >= state.doc.length) return false;

        const left = state.sliceDoc(sel.from - 1, sel.from);
        const right = state.sliceDoc(sel.from, sel.from + 1);
        if (pairs[left] !== right) return false;

        dispatch({
          changes: { from: sel.from - 1, to: sel.from + 1, insert: '' },
          selection: { anchor: sel.from - 1 },
        });
        return true;
      },
    },
  ]);
}

function getTabBehaviorExtension(tabSize: number): Extension {
  const normalized = Math.max(1, Math.min(8, tabSize || 4));
  return [
    EditorState.tabSize.of(normalized),
    indentUnit.of(' '.repeat(normalized)),
    makeTabKeymap(normalized),
  ];
}

const includeAngleBracketHandler = EditorView.inputHandler.of((view, from, to, text) => {
  if (text !== '<') return false;

  const line = view.state.doc.lineAt(from);
  const before = line.text.slice(0, from - line.from);
  if (!/^\s*#\s*include\s*$/.test(before)) return false;

  const after = line.text.slice(to - line.from);
  const insert = after.startsWith('>') ? '<' : '<>';

  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + 1 },
  });
  return true;
});

function selectionDragShouldMove(event: MouseEvent | PointerEvent) {
  return navigator.platform.includes('Mac') ? !event.altKey : !event.ctrlKey;
}

function clearManualDropCursor(view?: EditorView) {
  view?.dispatch({ effects: setManualDropCursorPos.of(null) });
}

function isInsideRange(pos: number, from: number, to: number) {
  return pos >= from && pos <= to;
}

function bindSelectionDragListeners() {
  if (selectionDragListenersBound) return;
  selectionDragListenersBound = true;

  document.addEventListener('mousemove', (event) => {
    if (!selectionDragState) return;

    const { view } = selectionDragState;
    const dx = event.clientX - selectionDragState.startX;
    const dy = event.clientY - selectionDragState.startY;
    if (!selectionDragState.started && Math.hypot(dx, dy) < DRAG_SELECTION_THRESHOLD) return;

    selectionDragState.started = true;
    document.body.classList.add('selection-dragging');
    event.preventDefault();

    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos == null) {
      clearManualDropCursor(view);
      return;
    }

    view.dispatch({ effects: setManualDropCursorPos.of(pos) });
  });

  document.addEventListener('mouseup', (event) => {
    if (!selectionDragState) return;

    const drag = selectionDragState;
    selectionDragState = null;
    document.body.classList.remove('selection-dragging');
    clearManualDropCursor(drag.view);

    if (!drag.started) {
      const pos = drag.view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos != null) {
        drag.view.dispatch({ selection: { anchor: pos } });
      }
      drag.view.focus();
      return;
    }

    event.preventDefault();
    const dropPos = drag.view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (dropPos == null || isInsideRange(dropPos, drag.from, drag.to)) {
      drag.view.focus();
      return;
    }

    if (selectionDragShouldMove(event)) {
      const changes = drag.view.state.changes([
        { from: drag.from, to: drag.to, insert: '' },
        { from: dropPos, insert: drag.text },
      ]);
      const selectionFrom = changes.mapPos(dropPos, -1);
      const selectionTo = changes.mapPos(dropPos, 1);
      drag.view.dispatch({
        changes,
        selection: { anchor: selectionFrom, head: selectionTo },
        effects: EditorView.scrollIntoView(selectionTo, { y: 'center' }),
      });
    } else {
      drag.view.dispatch({
        changes: { from: dropPos, insert: drag.text },
        selection: { anchor: dropPos, head: dropPos + drag.text.length },
        effects: EditorView.scrollIntoView(dropPos + drag.text.length, { y: 'center' }),
      });
    }

    drag.view.focus();
  });
}

const selectionDragHandlers = Prec.highest(EditorView.domEventHandlers({
  mousedown(event, view) {
    const selection = view.state.selection.main;
    if (event.button !== 0 || selection.empty) return false;

    const target = event.target;
    const targetElement = target instanceof HTMLElement
      ? target
      : target instanceof Node
        ? target.parentElement
        : null;
    if (!targetElement?.closest('.cm-content')) return false;

    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos == null || !isInsideRange(pos, selection.from, selection.to)) return false;

    selectionDragState = {
      view,
      from: selection.from,
      to: selection.to,
      text: view.state.sliceDoc(selection.from, selection.to),
      startX: event.clientX,
      startY: event.clientY,
      started: false,
    };

    event.preventDefault();
    view.focus();
    return true;
  },
  dragstart(event) {
    if (!selectionDragState) return false;
    event.preventDefault();
    return true;
  },
}));

const baseExtensions: Extension[] = [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightActiveLine(),
  drawSelection(),
  dropCursor(),
  rectangularSelection(),
  indentOnInput(),
  bracketMatching(),
  closeBrackets(),
  autocompletion(),
  highlightSelectionMatches(),
  history(),
  includeAngleBracketHandler,
  foldGutter({
    openText: '-',
    closedText: '+',
  }),
  makePairedBracketDeleteKeymap(),
  manualDropCursorField,
  selectionDragHandlers,
  cpp(),
  cppCompletion(),
  createLinterExtension(),
  keymap.of([
    ...defaultKeymap,
    ...searchKeymap,
    ...historyKeymap,
    ...foldKeymap,
    ...completionKeymap,
    ...closeBracketsKeymap,
    ...lintKeymap,
  ]),
  EditorView.dragMovesSelection.of(selectionDragShouldMove),
  EditorView.lineWrapping,
];

bindSelectionDragListeners();

function isCodeMirrorStyleModule(text: string) {
  return text.includes('\u037c');
}

function isLikelyCodeMirrorStyle(text: string) {
  const hasLayoutSelectors = text.includes('.cm-editor')
    && text.includes('.cm-scroller')
    && text.includes('.cm-content');
  if (!hasLayoutSelectors) return false;

  const extraSelectorMatches = [
    '.cm-line',
    '.cm-gutters',
    '.cm-selectionBackground',
    '.cm-activeLine',
    '.cm-focused',
    '.cm-cursor',
  ].filter((selector) => text.includes(selector)).length;

  return extraSelectorMatches >= 3;
}

function getCodeMirrorStyleHost() {
  let cmStylesEl = document.getElementById('cm-styles') as HTMLStyleElement | null;
  if (!cmStylesEl && document.head) {
    cmStylesEl = document.createElement('style');
    cmStylesEl.id = 'cm-styles';
    document.head.insertBefore(cmStylesEl, document.head.firstChild);
  }
  return cmStylesEl;
}

function getCodeMirrorStyleText() {
  const styles = Array.from(document.querySelectorAll('style'))
    .filter((element) => element.id !== 'cm-styles');

  const styleModuleTexts = styles
    .map((element) => element.textContent || '')
    .filter(isCodeMirrorStyleModule);

  if (styleModuleTexts.length) return styleModuleTexts.join('\n');

  return styles
    .map((element) => element.textContent || '')
    .filter(isLikelyCodeMirrorStyle)
    .join('\n');
}

function syncCodeMirrorStyles() {
  const cmStylesEl = getCodeMirrorStyleHost();
  if (!cmStylesEl) return false;

  const text = getCodeMirrorStyleText();
  if (!text) return false;

  if (cmStylesEl.textContent !== text) {
    cmStylesEl.textContent = text;
  }
  return true;
}

function scheduleCodeMirrorStyleSync() {
  if (codeMirrorStyleSyncFrame != null) return;
  codeMirrorStyleSyncFrame = requestAnimationFrame(() => {
    codeMirrorStyleSyncFrame = null;
    syncCodeMirrorStyles();
  });
}

function installCodeMirrorStyleSync() {
  if (codeMirrorStyleObserver) return;

  const target = document.head || document.documentElement;
  if (!target) return;

  codeMirrorStyleObserver = new MutationObserver(() => {
    scheduleCodeMirrorStyleSync();
  });
  codeMirrorStyleObserver.observe(target, {
    childList: true,
    characterData: true,
    subtree: true,
  });
}

function fixCodeMirrorStyles(retries = 12) {
  installCodeMirrorStyleSync();
  if (syncCodeMirrorStyles()) return;

  if (retries > 0) {
    requestAnimationFrame(() => fixCodeMirrorStyles(retries - 1));
  }
}

export function switchTheme(view: EditorView, themeId: string) {
  const theme = getTheme(themeId);
  currentThemeId = themeId;
  view.dispatch({
    effects: themeCompartment.reconfigure(theme.extension),
  });
  document.body.classList.remove('theme-dark', 'theme-light');
  document.body.classList.add('theme-' + theme.mode);
  requestAnimationFrame(() => fixCodeMirrorStyles());
}

export function getCurrentThemeExtension() {
  return getTheme(currentThemeId).extension;
}

export function setDefaultTabSize(tabSize: number) {
  currentTabSize = Math.max(1, Math.min(8, tabSize || 4));
}

export function getCurrentTabBehaviorExtension() {
  return getTabBehaviorExtension(currentTabSize);
}

export function applyTabSize(view: EditorView, tabSize: number) {
  setDefaultTabSize(tabSize);
  view.dispatch({
    effects: tabBehaviorCompartment.reconfigure(getCurrentTabBehaviorExtension()),
  });
}

export function applyFont(view: EditorView, fontSize: number, fontFamily?: string) {
  const scroller = view.dom.querySelector('.cm-scroller') as HTMLElement | null;
  if (scroller) {
    scroller.style.fontSize = `${fontSize}px`;
    scroller.style.fontFamily = fontFamily || DEFAULT_FONT;
  }
  const gutters = view.dom.querySelectorAll('.cm-gutterElement') as NodeListOf<HTMLElement>;
  gutters.forEach((gutter) => {
    gutter.style.fontSize = `${Math.max(10, fontSize - 2)}px`;
  });
  forceLayout(view);
}

export function forceLayout(view: EditorView) {
  requestAnimationFrame(() => {
    view.requestMeasure();
    view.setState(view.state);
    requestAnimationFrame(() => view.requestMeasure());
  });
}

export function lockGutterWidths(view: EditorView) {
  const width = '24px';
  const lock = () => {
    const gutters = view.dom.querySelector('.cm-gutters') as HTMLElement | null;
    if (!gutters) return;
    for (const child of Array.from(gutters.children) as HTMLElement[]) {
      if (!child.classList.contains('cm-foldGutter')) continue;
      child.style.setProperty('width', width, 'important');
      child.style.setProperty('min-width', width, 'important');
      child.style.setProperty('max-width', width, 'important');
      child.style.setProperty('flex-shrink', '0', 'important');
      child.style.setProperty('overflow', 'hidden', 'important');
      for (const el of Array.from(child.children) as HTMLElement[]) {
        el.style.setProperty('width', width, 'important');
        el.style.setProperty('min-width', width, 'important');
        el.style.setProperty('max-width', width, 'important');
        el.style.setProperty('text-align', 'center', 'important');
      }
    }
  };
  lock();
  const tick = () => {
    lock();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export { baseExtensions, EditorView, EditorState, themes, themeCompartment, tabBehaviorCompartment, fixCodeMirrorStyles };
