export interface UiState {
  statusText: string;
  statusType: string;
  activePathText: string;
  outputHtml: string | null;
  themeMode: 'dark' | 'light';
  runButton: {
    running: boolean;
    disabled: boolean;
    label: string;
  };
}

let state: UiState = {
  statusText: 'Ready',
  statusType: '',
  activePathText: '',
  outputHtml: null,
  themeMode: 'dark',
  runButton: {
    running: false,
    disabled: false,
    label: 'Run (F5)',
  },
};

const listeners = new Set<() => void>();

export function subscribeUiState(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getUiStateSnapshot() {
  return state;
}

export function getRunButtonSnapshot() {
  return state.runButton;
}

export function getOutputSnapshot() {
  return state.outputHtml;
}

export function getStatusTextSnapshot() {
  return state.statusText;
}

export function getStatusTypeSnapshot() {
  return state.statusType;
}

export function getActivePathSnapshot() {
  return state.activePathText;
}

export function getThemeModeSnapshot() {
  return state.themeMode;
}

function emit() {
  listeners.forEach((listener) => listener());
}

function update(next: Partial<UiState>) {
  state = { ...state, ...next };
  emit();
}

export function setStatusState(text: string, type = '') {
  update({ statusText: text, statusType: type });
}

export function setActivePathState(activePathText: string) {
  update({ activePathText });
}

export function setThemeModeState(themeMode: 'dark' | 'light') {
  update({ themeMode });
}

export function setOutputHtml(html: string) {
  update({ outputHtml: html });
}

export function appendOutputHtml(text: string, className?: string) {
  const escaped = escapeHtml(text);
  const nextChunk = className ? `<span class="${className}">${escaped}</span>` : escaped;
  update({ outputHtml: `${state.outputHtml ?? ''}${nextChunk}` });
}

export function setRunButtonStateSnapshot(running: boolean, label: string, disabled = false) {
  update({
    runButton: {
      running,
      disabled,
      label,
    },
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
