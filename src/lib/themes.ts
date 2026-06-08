import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';

export interface ThemeInfo {
  id: string;
  name: string;
  mode: 'dark' | 'light';
  monacoTheme: string;
}

export const themes: ThemeInfo[] = [
  { id: 'oneDark', name: 'One Dark', mode: 'dark', monacoTheme: '33ide-one-dark' },
  { id: 'dracula', name: 'Dracula', mode: 'dark', monacoTheme: '33ide-dracula' },
  { id: 'monokai', name: 'Monokai', mode: 'dark', monacoTheme: '33ide-monokai' },
  { id: 'devcppNewLook', name: 'DevCpp NewLook', mode: 'light', monacoTheme: '33ide-devcpp-newlook' },
  { id: 'githubLight', name: 'GitHub Light', mode: 'light', monacoTheme: '33ide-github-light' },
  { id: 'bbedit', name: 'BBEdit', mode: 'light', monacoTheme: '33ide-bbedit' },
];

const themeMap = new Map(themes.map((theme) => [theme.id, theme]));
let themesDefined = false;

export function getTheme(id: string): ThemeInfo {
  return themeMap.get(id) || themes[0];
}

export function defineMonacoThemes(monaco: typeof Monaco) {
  if (themesDefined) return;
  themesDefined = true;

  monaco.editor.defineTheme('33ide-one-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: 'c678dd' },
      { token: 'type', foreground: 'e5c07b' },
      { token: 'string', foreground: '98c379' },
      { token: 'number', foreground: 'd19a66' },
      { token: 'comment', foreground: '5c6370', fontStyle: 'italic' },
      { token: 'delimiter', foreground: 'abb2bf' },
    ],
    colors: darkColors('#282c34', '#21252b', '#3c4049', '#61afef'),
  });

  monaco.editor.defineTheme('33ide-dracula', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: 'ff79c6' },
      { token: 'type', foreground: '8be9fd' },
      { token: 'string', foreground: 'f1fa8c' },
      { token: 'number', foreground: 'bd93f9' },
      { token: 'comment', foreground: '6272a4', fontStyle: 'italic' },
    ],
    colors: darkColors('#282a36', '#21222c', '#44475a', '#bd93f9'),
  });

  monaco.editor.defineTheme('33ide-monokai', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: 'f92672' },
      { token: 'type', foreground: 'a6e22e' },
      { token: 'string', foreground: 'e6db74' },
      { token: 'number', foreground: 'ae81ff' },
      { token: 'comment', foreground: '75715e', fontStyle: 'italic' },
    ],
    colors: darkColors('#272822', '#20211c', '#3e3d32', '#66d9ef'),
  });

  monaco.editor.defineTheme('33ide-devcpp-newlook', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '0000ff' },
      { token: 'type', foreground: '2b91af' },
      { token: 'string', foreground: '008000' },
      { token: 'number', foreground: '800000' },
      { token: 'comment', foreground: '808080', fontStyle: 'italic' },
    ],
    colors: lightColors('#ffffff', '#f3f5f9', '#eaf3ff', '#0078d4'),
  });

  monaco.editor.defineTheme('33ide-github-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: 'cf222e' },
      { token: 'type', foreground: '8250df' },
      { token: 'string', foreground: '0a3069' },
      { token: 'number', foreground: '0550ae' },
      { token: 'comment', foreground: '6e7781', fontStyle: 'italic' },
    ],
    colors: lightColors('#ffffff', '#f6f8fa', '#ddf4ff', '#0969da'),
  });

  monaco.editor.defineTheme('33ide-bbedit', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '0000ff' },
      { token: 'type', foreground: '6f42c1' },
      { token: 'string', foreground: 'c41a16' },
      { token: 'number', foreground: '1c00cf' },
      { token: 'comment', foreground: '008000', fontStyle: 'italic' },
    ],
    colors: lightColors('#ffffff', '#f7f7f7', '#edf5ff', '#006cb8'),
  });
}

function darkColors(background: string, gutter: string, line: string, accent: string) {
  return {
    'editor.background': background,
    'editor.foreground': '#cccccc',
    'editorLineNumber.foreground': '#858585',
    'editorLineNumber.activeForeground': '#c6c6c6',
    'editorGutter.background': gutter,
    'editor.lineHighlightBackground': line,
    'editorCursor.foreground': '#ffffff',
    'editor.selectionBackground': '#264f78',
    'editor.inactiveSelectionBackground': '#3a3d41',
    'editor.selectionHighlightBackground': '#00000000',
    'editor.selectionHighlightBorder': '#00000000',
    'editorOverviewRuler.selectionHighlightForeground': '#00000000',
    'editorOverviewRuler.wordHighlightForeground': '#00000000',
    'editorOverviewRuler.wordHighlightStrongForeground': '#00000000',
    'editorOverviewRuler.wordHighlightTextForeground': '#00000000',
    'scrollbar.shadow': '#00000000',
    'scrollbarSlider.background': '#5f687633',
    'scrollbarSlider.hoverBackground': '#7a849555',
    'scrollbarSlider.activeBackground': '#94a1b777',
    'editorIndentGuide.background1': '#404040',
    'editorIndentGuide.activeBackground1': '#707070',
    'editorError.foreground': '#f44747',
    'editorWarning.foreground': '#ffcc00',
    'editorInfo.foreground': accent,
  };
}

function lightColors(background: string, gutter: string, line: string, accent: string) {
  return {
    'editor.background': background,
    'editor.foreground': '#222222',
    'editorLineNumber.foreground': '#6e7781',
    'editorLineNumber.activeForeground': '#24292f',
    'editorGutter.background': gutter,
    'editor.lineHighlightBackground': line,
    'editorCursor.foreground': '#000000',
    'editor.selectionBackground': '#add6ff',
    'editor.inactiveSelectionBackground': '#e5ebf1',
    'editor.selectionHighlightBackground': '#00000000',
    'editor.selectionHighlightBorder': '#00000000',
    'editorOverviewRuler.selectionHighlightForeground': '#00000000',
    'editorOverviewRuler.wordHighlightForeground': '#00000000',
    'editorOverviewRuler.wordHighlightStrongForeground': '#00000000',
    'editorOverviewRuler.wordHighlightTextForeground': '#00000000',
    'scrollbar.shadow': '#00000000',
    'scrollbarSlider.background': '#8c959f33',
    'scrollbarSlider.hoverBackground': '#6e778155',
    'scrollbarSlider.activeBackground': '#57606a77',
    'editorIndentGuide.background1': '#d0d7de',
    'editorIndentGuide.activeBackground1': '#8c959f',
    'editorError.foreground': '#d1242f',
    'editorWarning.foreground': '#9a6700',
    'editorInfo.foreground': accent,
  };
}
