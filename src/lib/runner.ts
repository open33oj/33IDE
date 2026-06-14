import { diffChars } from 'diff';
import { listen } from '@tauri-apps/api/event';
import { getCursorOffset, getEditorValue, getModel, monaco, setCursorOffset } from '../editor-setup';
import { api, RunResult } from './api';
import { clearDiagnostics, setDiagnostics, parseGccErrors, formatCompilerDiagnostics } from './diagnostics';
import { t } from './i18n';
import { getActiveTab, getView } from './tabs';
import { appendOutput, setStatus, showOutput, switchToOutput } from './ui';

let runActive = false;
let stopRequested = false;
let runListenersReady: Promise<void> | null = null;
let outputWaitingForFirstChunk = false;

interface RunPhaseEvent {
  phase: 'compiling' | 'running';
}

interface RunOutputEvent {
  stream: 'stdout' | 'stderr';
  text: string;
}

interface RunFinishedEvent {
  status: string;
  stderr: string;
  raw_stderr: string;
  exit_code: number | null;
  time_ms: number;
}

function setRunButtonState(running: boolean) {
  const btn = document.getElementById('btn-run') as HTMLButtonElement | null;
  if (!btn) return;

  btn.disabled = false;
  btn.classList.toggle('primary', !running);
  btn.classList.toggle('danger', running);
  btn.textContent = running ? t('toolbar.stop') : t('toolbar.run');
}

export async function formatCurrentCode() {
  const view = getView();
  const code = getEditorValue(view);
  const cursorPos = getCursorOffset(view);

  try {
    const formatted = await api.formatCode(code, 4);
    if (formatted !== code) {
      const newPos = calcCursorPosition(code, formatted, cursorPos);
      applyFormattedCode(view, code, formatted, newPos);

      const tab = getActiveTab();
      if (tab) tab.dirty = true;
      setStatus(t('status.formatSuccess'), 'success');
    } else {
      setStatus(t('status.formatNoChange'), 'info');
    }
  } catch (e: any) {
    setStatus(t('status.formatFailed', { error: String(e) }), 'error');
  }
}

function applyFormattedCode(view: ReturnType<typeof getView>, oldCode: string, newCode: string, cursorOffset: number) {
  const model = getModel(view);
  const changes = diffChars(oldCode, newCode);
  const edits: monaco.editor.IIdentifiedSingleEditOperation[] = [];
  let oldIndex = 0;

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    const len = change.count || change.value.length;

    if (!change.added && !change.removed) {
      oldIndex += len;
      continue;
    }

    if (change.removed) {
      const next = changes[i + 1];
      const insert = next?.added ? next.value : '';
      const from = model.getPositionAt(oldIndex);
      const to = model.getPositionAt(oldIndex + len);
      edits.push({
        range: new monaco.Range(from.lineNumber, from.column, to.lineNumber, to.column),
        text: insert,
        forceMoveMarkers: true,
      });
      oldIndex += len;
      if (next?.added) i += 1;
      continue;
    }

    if (change.added) {
      const position = model.getPositionAt(oldIndex);
      edits.push({
        range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
        text: change.value,
        forceMoveMarkers: true,
      });
    }
  }

  if (edits.length) {
    view.executeEdits('clang-format', edits);
  }
  setCursorOffset(view, cursorOffset);
}

function calcCursorPosition(oldCode: string, newCode: string, oldPos: number): number {
  const changes = diffChars(oldCode, newCode);
  let newPos = 0;
  let oldIdx = 0;

  for (const change of changes) {
    if (!change.added && !change.removed) {
      const len = change.count || change.value.length;
      if (oldIdx + len > oldPos) {
        return newPos + (oldPos - oldIdx);
      }
      newPos += len;
      oldIdx += len;
      continue;
    }

    if (change.removed) {
      const len = change.count || change.value.length;
      if (oldIdx + len > oldPos) {
        return newPos;
      }
      oldIdx += len;
      continue;
    }

    if (change.added) {
      newPos += change.count || change.value.length;
    }
  }

  return newPos;
}

export async function runCode() {
  if (runActive) {
    await stopRunningCode();
    return;
  }

  const view = getView();
  const code = getEditorValue(view);
  const input = (document.getElementById('input-area') as HTMLTextAreaElement).value;

  runActive = true;
  stopRequested = false;
  setRunButtonState(true);

  try {
    await ensureRunListeners();
    clearDiagnostics(view);
    switchToOutput();
    outputWaitingForFirstChunk = false;
    showOutput(`<span class="info">${t('output.compiling')}</span>`);
    await api.startCompileAndRun(code, input || undefined);
  } catch (e: any) {
    showOutput('');
    appendOutput(t('status.error', { error: String(e) }), 'error');
    runActive = false;
    stopRequested = false;
    setRunButtonState(false);
  }
}

export async function stopRunningCode() {
  if (!runActive || stopRequested) return;
  stopRequested = true;
  try {
    const stopped = await api.cancelRun();
    if (!stopped) stopRequested = false;
    setStatus(stopped ? t('status.runCancelled') : t('status.noActiveRun'), stopped ? 'info' : 'error');
  } catch (e: any) {
    stopRequested = false;
    setStatus(t('status.error', { error: String(e) }), 'error');
  }
}

function ensureRunListeners() {
  if (runListenersReady) return runListenersReady;

  runListenersReady = Promise.all([
    listen<RunPhaseEvent>('run-phase', (event) => {
      if (!runActive) return;
      if (event.payload.phase === 'running') {
        outputWaitingForFirstChunk = true;
        showOutput(`<span class="info">${t('output.running')}</span>\n`);
        setStatus(t('toolbar.running'), 'info');
      } else {
        outputWaitingForFirstChunk = false;
        showOutput(`<span class="info">${t('output.compiling')}</span>`);
      }
    }),
    listen<RunOutputEvent>('run-output', (event) => {
      if (!runActive || !event.payload.text) return;
      if (outputWaitingForFirstChunk) {
        showOutput('');
        outputWaitingForFirstChunk = false;
      }
      appendOutput(event.payload.text, event.payload.stream === 'stderr' ? 'error' : undefined);
    }),
    listen<RunFinishedEvent>('run-finished', (event) => {
      if (!runActive) return;
      outputWaitingForFirstChunk = false;
      renderStreamingRunResult(event.payload);
      runActive = false;
      stopRequested = false;
      setRunButtonState(false);
    }),
  ]).then(() => undefined);

  return runListenersReady;
}

function renderStreamingRunResult(result: RunFinishedEvent) {
  const output = document.getElementById('output-content')!;

  if (result.status === 'compile_error') {
    output.textContent = '';
    const errLabel = document.createElement('span');
    errLabel.className = 'error';
    errLabel.textContent = t('output.compileError');
    output.appendChild(errLabel);
    output.appendChild(document.createTextNode(formatCompilerDiagnostics(result.raw_stderr || result.stderr || '')));
    setStatus(t('status.compileError'), 'error');

    const view = getView();
    const diags = parseGccErrors(result.raw_stderr || result.stderr || '');
    if (diags.length > 0) {
      setDiagnostics(view, diags);
    }
    return;
  }

  if (result.status === 'cancelled') {
    appendOutput(`\n${t('output.cancelled')}`, 'info');
    setStatus(t('status.runCancelled'), 'info');
    return;
  }

  if (result.status === 'timeout') {
    appendOutput(t('output.timeout', { time: result.time_ms }), 'error');
    setStatus(t('status.runTimeout'), 'error');
    return;
  }

  if (result.status === 'interactive_console_required') {
    output.textContent = '';
    appendOutput(t('output.interactiveConsoleRequired'), 'error');
    setStatus(t('status.interactiveConsoleRequired'), 'error');
    return;
  }

  if (result.status === 'error') {
    appendOutput(result.stderr || '', 'error');
    setStatus(t('status.error', { error: result.stderr || result.status }), 'error');
    return;
  }

  const cls = result.exit_code === 0 ? 'success' : 'error';
  appendOutput(t('output.exitInfo', {
    code: result.exit_code ?? '-',
    time: result.time_ms,
  }), cls);

  setStatus(
    result.exit_code === 0 ? t('status.runSuccess') : t('status.runFailed'),
    result.exit_code === 0 ? 'success' : 'error',
  );
}

export async function runInTerminal() {
  const view = getView();
  const code = getEditorValue(view);
  clearDiagnostics(view);
  try {
    const result = await api.runInTerminal(code);
    if (!result.ok) {
      const rawError = result.raw_error || result.error || '';
      switchToOutput();
      showOutput('');
      appendOutput(t('output.compileError') + formatCompilerDiagnostics(rawError), 'error');
      const diags = parseGccErrors(rawError);
      if (diags.length > 0) {
        setDiagnostics(view, diags);
      }
    }
  } catch (e: any) {
    setStatus(t('status.error', { error: String(e) }), 'error');
  }
}

function renderRunResult(result: RunResult) {
  const output = document.getElementById('output-content')!;

  if (result.status === 'compile_error') {
    output.textContent = '';
    const errLabel = document.createElement('span');
    errLabel.className = 'error';
    errLabel.textContent = t('output.compileError');
    output.appendChild(errLabel);
    output.appendChild(document.createTextNode(formatCompilerDiagnostics(result.raw_stderr || result.stderr || '')));
    setStatus(t('status.compileError'), 'error');

    const view = getView();
    const diags = parseGccErrors(result.raw_stderr || result.stderr || '');
    if (diags.length > 0) {
      setDiagnostics(view, diags);
    }
    return;
  }

  if (result.status === 'cancelled') {
    output.textContent = '';
    appendOutput(t('output.cancelled'), 'info');
    setStatus(t('status.runCancelled'), 'info');
    return;
  }

  if (result.status === 'timeout') {
    output.textContent = '';
    appendOutput(result.stdout || '', 'success');
    if (result.stderr) appendOutput(result.stderr, 'error');
    appendOutput(t('output.timeout', { time: result.time_ms }), 'error');
    setStatus(t('status.runTimeout'), 'error');
    return;
  }

  output.textContent = '';
  output.appendChild(document.createTextNode(result.stdout || ''));
  if (result.stderr) {
    const errSpan = document.createElement('span');
    errSpan.className = 'error';
    errSpan.textContent = result.stderr;
    output.appendChild(errSpan);
  }

  const cls = result.exit_code === 0 ? 'success' : 'error';
  const info = document.createElement('span');
  info.className = cls;
  info.textContent = t('output.exitInfo', {
    code: result.exit_code ?? '-',
    time: result.time_ms,
  });
  output.appendChild(info);

  setStatus(
    result.exit_code === 0 ? t('status.runSuccess') : t('status.runFailed'),
    result.exit_code === 0 ? 'success' : 'error',
  );
}
