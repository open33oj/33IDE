import { EditorView, getModel, monaco } from '../editor-setup';

export interface Diagnostic {
  from: number;
  to: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  rawMessage?: string;
  translatedMessage?: string;
  line?: number;
  col?: number;
  endCol?: number;
}

let diagnostics: Diagnostic[] = [];
let lineDecorations: monaco.editor.IEditorDecorationsCollection | null = null;

const gccErrorRegex = /^(.+?):(\d+)(?::(\d+))?:\s*(fatal error|error|warning|note):\s*(.+)$/;
const MARKER_OWNER = '33ide-gcc';

export function parseGccErrors(stderr: string): Diagnostic[] {
  const result: Diagnostic[] = [];
  const lines = stderr.replace(/\r\n/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(gccErrorRegex);
    if (!m) continue;
    const lineNum = parseInt(m[2], 10);
    const col = m[3] ? parseInt(m[3], 10) : 1;
    const severity = m[4];
    const rawMessage = m[5].trim();
    const translatedMessage = translateCompilerMessage(rawMessage);
    if (lineNum <= 0) continue;
    result.push({
      from: 0,
      to: 0,
      severity: severity.includes('error') ? 'error' : severity === 'warning' ? 'warning' : 'info',
      message: buildMarkerMessage(severity, translatedMessage, rawMessage),
      rawMessage,
      translatedMessage,
      line: lineNum,
      col,
      endCol: inferEndColumn(lines, i, col),
    });
  }
  return result;
}

export function formatCompilerDiagnostics(stderr: string) {
  const clean = stderr.trim();
  if (!clean) return '';

  const diags = parseGccErrors(clean);
  if (diags.length === 0) {
    return translateCompilerMessage(clean) || clean;
  }

  return diags.map((diag) => {
    const parts = [
      `第 ${diag.line ?? '-'} 行，第 ${diag.col ?? 1} 列`,
      `${severityLabel(diag.severity)}：${diag.translatedMessage || diag.rawMessage || diag.message}`,
    ];
    const raw = diag.rawMessage || '';
    if (raw && raw !== diag.translatedMessage) {
      parts.push(`原始信息：${raw}`);
    }
    return parts.join('\n');
  }).join('\n\n');
}

export function setDiagnostics(view: EditorView, diags: Diagnostic[]) {
  const model = getModel(view);
  diagnostics = diags;
  const normalized = diags.map((diag) => {
    const lineNumber = Math.max(1, Math.min(diag.line ?? 1, model.getLineCount()));
    const maxColumn = model.getLineMaxColumn(lineNumber);
    const startColumn = Math.max(1, Math.min(diag.col ?? 1, maxColumn));
    const endColumn = normalizeEndColumn(model, lineNumber, startColumn, diag.endCol);
    return {
      lineNumber,
      startColumn,
      endColumn,
      severity: toMarkerSeverity(diag.severity),
      message: diag.message,
      kind: diag.severity,
    };
  });

  monaco.editor.setModelMarkers(model, MARKER_OWNER, normalized.map((diag) => {
    return {
      severity: diag.severity,
      message: diag.message,
      startLineNumber: diag.lineNumber,
      startColumn: diag.startColumn,
      endLineNumber: diag.lineNumber,
      endColumn: diag.endColumn,
    };
  }));

  lineDecorations?.clear();
  lineDecorations = view.createDecorationsCollection(normalized.map((diag) => ({
    range: new monaco.Range(diag.lineNumber, 1, diag.lineNumber, 1),
    options: {
      isWholeLine: true,
      className: diag.kind === 'error' ? 'compiler-line-error' : 'compiler-line-warning',
      glyphMarginClassName: diag.kind === 'error' ? 'compiler-glyph-error' : 'compiler-glyph-warning',
      glyphMarginHoverMessage: { value: diag.message },
      overviewRuler: {
        color: diag.kind === 'error' ? '#f44747' : '#cca700',
        position: monaco.editor.OverviewRulerLane.Right,
      },
    },
  })));
}

export function clearDiagnostics(view: EditorView) {
  diagnostics = [];
  monaco.editor.setModelMarkers(getModel(view), MARKER_OWNER, []);
  lineDecorations?.clear();
  lineDecorations = null;
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

function buildMarkerMessage(severity: string, translated: string, raw: string) {
  const label = severity.includes('error') ? '错误' : severity === 'warning' ? '警告' : '提示';
  if (!raw || raw === translated) return `${label}：${translated}`;
  return `${label}：${translated}\n原始信息：${raw}`;
}

function inferEndColumn(lines: string[], diagnosticLineIndex: number, startColumn: number) {
  for (let i = diagnosticLineIndex + 1; i < Math.min(lines.length, diagnosticLineIndex + 5); i++) {
    const line = lines[i];
    const bar = line.indexOf('|');
    if (bar < 0 || !line.includes('^')) continue;

    const marker = line.slice(bar + 1);
    const caret = marker.indexOf('^');
    if (caret < 0) continue;

    const tail = marker.slice(caret).match(/^\^~*/)?.[0] || '^';
    return startColumn + Math.max(1, tail.length);
  }
  return undefined;
}

function normalizeEndColumn(
  model: monaco.editor.ITextModel,
  lineNumber: number,
  startColumn: number,
  requestedEndColumn?: number,
) {
  const maxColumn = model.getLineMaxColumn(lineNumber);
  if (requestedEndColumn && requestedEndColumn > startColumn) {
    return Math.min(requestedEndColumn, maxColumn);
  }

  const word = model.getWordAtPosition({ lineNumber, column: startColumn });
  if (word && word.startColumn <= startColumn && word.endColumn > startColumn) {
    return Math.min(word.endColumn, maxColumn);
  }

  return Math.min(startColumn + 1, maxColumn);
}

function severityLabel(severity: Diagnostic['severity']) {
  switch (severity) {
    case 'error':
      return '错误';
    case 'warning':
      return '警告';
    default:
      return '提示';
  }
}

function translateCompilerMessage(message: string) {
  let result = message.trim();
  const replacements: Array<[RegExp, string]> = [
    [/^expected\s+(.+?)\s+before\s+(.+)$/i, '在 $2 之前缺少或需要 $1'],
    [/^expected\s+(.+)$/i, '缺少或需要 $1'],
    [/^(.+?)\s+was not declared in this scope$/i, '$1 未在当前作用域中声明'],
    [/^'(.+?)'\s+was not declared in this scope$/i, "'$1' 未在当前作用域中声明"],
    [/^use of undeclared identifier\s+(.+)$/i, '使用了未声明的标识符 $1'],
    [/^no matching function for call to\s+(.+)$/i, '找不到匹配的函数调用：$1'],
    [/^too few arguments to function\s+(.+)$/i, '函数参数太少：$1'],
    [/^too many arguments to function\s+(.+)$/i, '函数参数太多：$1'],
    [/^invalid conversion from\s+(.+?)\s+to\s+(.+)$/i, '无法从 $1 转换为 $2'],
    [/^cannot convert\s+(.+?)\s+to\s+(.+)$/i, '无法把 $1 转换为 $2'],
    [/^cannot initialize\s+(.+?)\s+with\s+(.+)$/i, '无法用 $2 初始化 $1'],
    [/^assignment of read-only (?:variable )?'?(.+?)'?$/i, "不能给只读变量 '$1' 赋值"],
    [/^'(.+?)'\s+does not name a type$/i, "'$1' 不是一个类型名"],
    [/^'(.+?)'\s+is not a member of\s+(.+)$/i, "'$1' 不是 $2 的成员"],
    [/^redefinition of\s+(.+)$/i, '重复定义 $1'],
    [/^redeclaration of\s+(.+)$/i, '重复声明 $1'],
    [/^first defined here$/i, '首次定义在这里'],
    [/^undefined reference to\s+(.+)$/i, '未定义的引用：$1'],
    [/^multiple definition of\s+(.+)$/i, '重复定义：$1'],
    [/^lvalue required as\s+(.+)$/i, '$1 需要左值'],
    [/^comparison between signed and unsigned/i, '有符号数和无符号数之间的比较'],
    [/^no return statement in function returning non-void/i, '返回非 void 的函数中缺少 return 语句'],
    [/^control reaches end of non-void function/i, '控制流到达了非 void 函数末尾，可能缺少 return'],
    [/^no such file or directory$/i, '没有这个文件或目录'],
    [/^stray\s+(.+?)\s+in program$/i, '程序中有多余或非法字符 $1'],
  ];

  for (const [pattern, replacement] of replacements) {
    if (pattern.test(result)) {
      result = result.replace(pattern, replacement);
      break;
    }
  }

  return result
    .replace(/\berror:\s*/gi, '错误：')
    .replace(/\bwarning:\s*/gi, '警告：')
    .replace(/\bfatal error:\s*/gi, '致命错误：')
    .replace(/\bIn function\b/g, '在函数中')
    .replace(/\bAt global scope\b/g, '在全局作用域')
    .replace(/\bsegmentation fault\b/gi, '段错误')
    .replace(/\bpermission denied\b/gi, '权限被拒绝')
    .replace(/\bunused variable\b/gi, '未使用的变量')
    .replace(/\bambiguous\b/gi, '有歧义')
    .replace(/\bnullptr\b/g, '空指针');
}
