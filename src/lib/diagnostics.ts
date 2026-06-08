import { EditorView, getModel, monaco } from '../editor-setup';

export interface Diagnostic {
  from: number;
  to: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  line?: number;
  col?: number;
}

let diagnostics: Diagnostic[] = [];

const gccErrorRegex = /^(.+?):(\d+)(?::(\d+))?:\s*(error|warning|note):\s*(.+)$/;
const MARKER_OWNER = '33ide-gcc';

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

export function setDiagnostics(view: EditorView, diags: Diagnostic[]) {
  const model = getModel(view);
  diagnostics = diags;
  monaco.editor.setModelMarkers(model, MARKER_OWNER, diags.map((diag) => {
    const lineNumber = Math.max(1, Math.min(diag.line ?? 1, model.getLineCount()));
    const maxColumn = model.getLineMaxColumn(lineNumber);
    const startColumn = Math.max(1, Math.min(diag.col ?? 1, maxColumn));
    return {
      severity: toMarkerSeverity(diag.severity),
      message: diag.message,
      startLineNumber: lineNumber,
      startColumn,
      endLineNumber: lineNumber,
      endColumn: Math.min(startColumn + 1, maxColumn),
    };
  }));
}

export function clearDiagnostics(view: EditorView) {
  if (diagnostics.length === 0) return;
  diagnostics = [];
  monaco.editor.setModelMarkers(getModel(view), MARKER_OWNER, []);
}

function toMarkerSeverity(severity: Diagnostic['severity']) {
  switch (severity) {
    case 'error':
      return monaco.MarkerSeverity.Error;
    case 'warning':
      return monaco.MarkerSeverity.Warning;
    default:
      return monaco.MarkerSeverity.Info;
  }
}
