import { EditorView } from '@codemirror/view';
import { linter, Diagnostic } from '@codemirror/lint';
import { Compartment } from '@codemirror/state';

export const linterCompartment = new Compartment();

let diagnostics: Diagnostic[] = [];

const gccErrorRegex = /^(.+?):(\d+)(?::(\d+))?:\s*(error|warning|note):\s*(.+)$/;

export function parseGccErrors(stderr: string): Diagnostic[] {
  const result: Diagnostic[] = [];
  const lines = stderr.split('\n');
  for (const line of lines) {
    const m = line.match(gccErrorRegex);
    if (!m) continue;
    const lineNum = parseInt(m[2], 10);
    const col = m[3] ? parseInt(m[3], 10) : 1;
    const severity = m[4];
    const message = m[5];
    if (lineNum <= 0) continue;
    result.push({
      from: 0,
      to: 0,
      severity: severity === 'error' ? 'error' : severity === 'warning' ? 'warning' : 'info',
      message,
      line: lineNum,
      col,
    });
  }
  return result;
}

function resolvePositions(view: EditorView, diags: Diagnostic[]): Diagnostic[] {
  const doc = view.state.doc;
  return diags.map(d => {
    const line = Math.min(d.line ?? 1, doc.lines);
    const lineObj = doc.line(line);
    const col = Math.max(1, d.col ?? 1);
    const from = Math.min(lineObj.from + col - 1, lineObj.to);
    return { ...d, from, to: Math.min(from + 1, lineObj.to) };
  });
}

export function setDiagnostics(view: EditorView, diags: Diagnostic[]) {
  diagnostics = resolvePositions(view, diags);
  view.dispatch({
    effects: linterCompartment.reconfigure(linter(() => diagnostics)),
  });
}

export function clearDiagnostics(view: EditorView) {
  if (diagnostics.length === 0) return;
  diagnostics = [];
  view.dispatch({
    effects: linterCompartment.reconfigure(linter(() => diagnostics)),
  });
}

export function createLinterExtension() {
  return linterCompartment.of(linter(() => diagnostics));
}
