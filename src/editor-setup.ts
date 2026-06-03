import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, rectangularSelection } from '@codemirror/view';
import { EditorState, Extension, Compartment } from '@codemirror/state';
import { defaultKeymap, indentWithTab, history, historyKeymap, indentMore, indentLess } from '@codemirror/commands';
import { cpp } from '@codemirror/lang-cpp';
import { indentOnInput, bracketMatching, foldGutter, foldKeymap, indentUnit } from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { lintKeymap } from '@codemirror/lint';
import { getTheme, themes } from './lib/themes';
import { cppCompletion } from './lib/cpp-completion';
import { createLinterExtension } from './lib/diagnostics';

const themeCompartment = new Compartment();
let currentThemeId = 'oneDark';

const DEFAULT_FONT = "'Consolas', 'Courier New', 'Microsoft YaHei', 'SimHei', 'NSimSun', monospace";

function makeTabKeymap(spaces: number) {
  const indent = ' '.repeat(spaces);
  return keymap.of([
    { key: 'Tab', run: ({ state, dispatch }) => {
      if (state.selection.main.empty) {
        dispatch(state.replaceSelection(indent));
        return true;
      }
      indentMore({ state, dispatch });
      return true;
    }},
    { key: 'Shift-Tab', run: ({ state, dispatch }) => {
      indentLess({ state, dispatch });
      return true;
    }},
  ]);
}

const baseExtensions: Extension[] = [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightActiveLine(),
  drawSelection(),
  rectangularSelection(),
  indentOnInput(),
  bracketMatching(),
  closeBrackets(),
  autocompletion(),
  highlightSelectionMatches(),
  history(),
  foldGutter({
    openText: '−',
    closedText: '+',
  }),
  EditorState.tabSize.of(4),
  indentUnit.of('    '),
  makeTabKeymap(4),
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
  EditorView.lineWrapping,
];

function fixCodeMirrorStyles() {
  const cmStylesEl = document.getElementById('cm-styles') as HTMLStyleElement | null;
  if (!cmStylesEl) return;
  for (const el of Array.from(document.querySelectorAll('style'))) {
    const text = el.textContent || '';
    if (text.includes('ͼ') && el.id !== 'cm-styles') {
      cmStylesEl.textContent = text;
      el.remove();
      break;
    }
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

export function applyFont(view: EditorView, fontSize: number, fontFamily?: string) {
  const scroller = view.dom.querySelector('.cm-scroller') as HTMLElement | null;
  if (scroller) {
    scroller.style.fontSize = fontSize + 'px';
    scroller.style.fontFamily = fontFamily || DEFAULT_FONT;
  }
  const gutters = view.dom.querySelectorAll('.cm-gutterElement') as NodeListOf<HTMLElement>;
  gutters.forEach(g => { g.style.fontSize = Math.max(10, fontSize - 2) + 'px'; });
  forceLayout(view);
}

export function forceLayout(view: EditorView) {
  requestAnimationFrame(() => {
    view.setState(view.state);
  });
}

export function lockGutterWidths(view: EditorView) {
  const W = '24px';
  const lock = () => {
    const gutters = view.dom.querySelector('.cm-gutters') as HTMLElement | null;
    if (!gutters) return;
    for (const child of Array.from(gutters.children) as HTMLElement[]) {
      if (child.classList.contains('cm-foldGutter')) {
        child.style.setProperty('width', W, 'important');
        child.style.setProperty('min-width', W, 'important');
        child.style.setProperty('max-width', W, 'important');
        child.style.setProperty('flex-shrink', '0', 'important');
        child.style.setProperty('overflow', 'hidden', 'important');
        for (const el of Array.from(child.children) as HTMLElement[]) {
          el.style.setProperty('width', W, 'important');
          el.style.setProperty('min-width', W, 'important');
          el.style.setProperty('max-width', W, 'important');
          el.style.setProperty('text-align', 'center', 'important');
        }
      }
    }
  };
  lock();
  const tick = () => { lock(); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}

export { baseExtensions, EditorView, EditorState, themes, themeCompartment, fixCodeMirrorStyles };
