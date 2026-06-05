import { Extension } from '@codemirror/state';
import { oneDark, oneDarkHighlightStyle } from '@codemirror/theme-one-dark';
import { syntaxHighlighting } from '@codemirror/language';
import { dracula } from '@uiw/codemirror-theme-dracula';
import { monokai } from '@uiw/codemirror-theme-monokai';
import { githubLight } from '@uiw/codemirror-theme-github';
import { bbedit } from '@uiw/codemirror-theme-bbedit';
import { devcppNewLook } from './themes/devcpp-newlook';

export interface ThemeInfo {
  id: string;
  name: string;
  mode: 'dark' | 'light';
  extension: Extension;
}

export const themes: ThemeInfo[] = [
  { id: 'oneDark', name: 'One Dark', mode: 'dark', extension: [oneDark, syntaxHighlighting(oneDarkHighlightStyle)] },
  { id: 'dracula', name: 'Dracula', mode: 'dark', extension: dracula },
  { id: 'monokai', name: 'Monokai', mode: 'dark', extension: monokai },
  { id: 'devcppNewLook', name: 'DevCpp NewLook', mode: 'light', extension: devcppNewLook },
  { id: 'githubLight', name: 'GitHub Light', mode: 'light', extension: githubLight },
  { id: 'bbedit', name: 'BBEdit', mode: 'light', extension: bbedit },
];

const themeMap = new Map(themes.map(t => [t.id, t]));

export function getTheme(id: string): ThemeInfo {
  return themeMap.get(id) || themes[0];
}
