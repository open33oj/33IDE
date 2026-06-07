import { EditorView } from '@codemirror/view';
import { diffChars } from 'diff';
import { api, RunResult } from './api';
import { clearDiagnostics, setDiagnostics, parseGccErrors } from './diagnostics';
import { t } from './i18n';
import { getActiveTab, getView } from './tabs';
import { appendOutput, setStatus, showOutput, switchToOutput } from './ui';

export async function formatCurrentCode() {
  const view = getView();
  const code = view.state.doc.toString();
  const cursorPos = view.state.selection.main.head;

  try {
    const formatted = await api.formatCode(code, 4);
    if (formatted !== code) {
      const newPos = calcCursorPosition(code, formatted, cursorPos);
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: formatted },
        selection: { anchor: newPos },
        effects: EditorView.scrollIntoView(newPos, { y: 'center' }),
      });

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
  const view = getView();
  const code = view.state.doc.toString();
  const input = (document.getElementById('input-area') as HTMLTextAreaElement).value;
  const btn = document.getElementById('btn-run') as HTMLButtonElement;

  btn.disabled = true;
  btn.textContent = t('toolbar.running');
  clearDiagnostics(view);
  switchToOutput();
  showOutput(`<span class="info">${t('output.compiling')}</span>`);

  try {
    const result = await api.compileAndRun(code, input || undefined);
    renderRunResult(result);
  } catch (e: any) {
    showOutput('');
    appendOutput(t('status.error', { error: String(e) }), 'error');
  }

  btn.disabled = false;
  btn.textContent = t('toolbar.run');
}

export async function runInTerminal() {
  const code = getView().state.doc.toString();
  try {
    const result = await api.runInTerminal(code);
    if (!result.ok) {
      switchToOutput();
      showOutput('');
      appendOutput(t('output.compileError') + (result.error || ''), 'error');
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
    output.appendChild(document.createTextNode(result.stderr || ''));
    setStatus(t('status.compileError'), 'error');

    const view = getView();
    const diags = parseGccErrors(result.raw_stderr || result.stderr || '');
    if (diags.length > 0) {
      setDiagnostics(view, diags);
    }
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
