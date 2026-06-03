import { api, RunResult } from './api';
import { getView, getActiveTab } from './tabs';
import { setStatus, showOutput, appendOutput, switchToOutput } from './ui';
import { clearDiagnostics, setDiagnostics, parseGccErrors } from './diagnostics';

export async function formatCurrentCode() {
  const view = getView();
  const code = view.state.doc.toString();
  try {
    const formatted = await api.formatCode(code, 4);
    if (formatted !== code) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: formatted },
      });
      const tab = getActiveTab();
      if (tab) tab.dirty = true;
      setStatus('已格式化', 'success');
    } else {
      setStatus('代码已是格式化状态', 'info');
    }
  } catch (e: any) {
    setStatus('格式化失败: ' + e, 'error');
  }
}

export async function runCode() {
  const view = getView();
  const code = view.state.doc.toString();
  const input = (document.getElementById('input-area') as HTMLTextAreaElement).value;
  const btn = document.getElementById('btn-run') as HTMLButtonElement;
  btn.disabled = true; btn.textContent = '运行中...';
  clearDiagnostics(view);
  switchToOutput();
  showOutput('<span class="info">编译中...</span>');
  try {
    const result = await api.compileAndRun(code, input || undefined);
    renderRunResult(result);
  } catch (e: any) {
    showOutput('');
    appendOutput('错误: ' + String(e), 'error');
  }
  btn.disabled = false; btn.textContent = '▶ 运行 (F5)';
}

export async function runInTerminal() {
  const code = getView().state.doc.toString();
  try {
    const result = await api.runInTerminal(code);
    if (!result.ok) {
      switchToOutput();
      showOutput('');
      appendOutput('编译错误:\n' + (result.error || ''), 'error');
    }
  } catch (e: any) { setStatus('错误: ' + e, 'error'); }
}

function renderRunResult(result: RunResult) {
  const output = document.getElementById('output-content')!;
  if (result.status === 'compile_error') {
    output.textContent = '';
    const errLabel = document.createElement('span');
    errLabel.className = 'error';
    errLabel.textContent = '编译错误:\n';
    output.appendChild(errLabel);
    output.appendChild(document.createTextNode(result.stderr || ''));
    setStatus('编译错误', 'error');
    const view = getView();
    const diags = parseGccErrors(result.raw_stderr || result.stderr || '');
    if (diags.length > 0) {
      setDiagnostics(view, diags);
    }
  } else {
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
    info.textContent = `\n[退出代码: ${result.exit_code}, 耗时: ${result.time_ms}ms]`;
    output.appendChild(info);
    setStatus(result.exit_code === 0 ? '运行成功' : '运行失败', result.exit_code === 0 ? 'success' : 'error');
  }
}
