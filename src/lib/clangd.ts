import { api, ClangdCompletionItem } from './api';
import { monaco } from '../editor-setup';

let installed = false;
let getActiveFilePath: () => string | undefined = () => undefined;

export function initClangdFeatures(filePathProvider: () => string | undefined) {
  getActiveFilePath = filePathProvider;
  if (installed) return;
  installed = true;

  monaco.languages.registerCompletionItemProvider('cpp', {
    triggerCharacters: ['.', '>', ':', '_'],
    async provideCompletionItems(model, position) {
      try {
        const items = await api.clangdComplete(
          model.getValue(),
          getActiveFilePath(),
          position.lineNumber - 1,
          position.column - 1,
        );
        const word = model.getWordUntilPosition(position);
        const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
        return {
          suggestions: items.map((item) => toCompletionItem(item, range)),
        };
      } catch {
        return { suggestions: [] };
      }
    },
  });

  monaco.languages.registerHoverProvider('cpp', {
    async provideHover(model, position) {
      try {
        const value = await api.clangdHover(
          model.getValue(),
          getActiveFilePath(),
          position.lineNumber - 1,
          position.column - 1,
        );
        if (!value) return null;
        return {
          contents: [{ value }],
        };
      } catch {
        return null;
      }
    },
  });

  monaco.languages.registerSignatureHelpProvider('cpp', {
    signatureHelpTriggerCharacters: ['(', ','],
    signatureHelpRetriggerCharacters: [','],
    async provideSignatureHelp(model, position) {
      try {
        const signature = await api.clangdSignatureHelp(
          model.getValue(),
          getActiveFilePath(),
          position.lineNumber - 1,
          position.column - 1,
        );
        if (!signature) return null;
        return {
          value: {
            activeParameter: 0,
            activeSignature: 0,
            signatures: [{
              label: signature.label,
              documentation: signature.documentation,
              parameters: [],
            }],
          },
          dispose: () => {},
        };
      } catch {
        return null;
      }
    },
  });
}

function toCompletionItem(item: ClangdCompletionItem, range: monaco.IRange): monaco.languages.CompletionItem {
  return {
    label: item.label,
    kind: toCompletionKind(item.kind),
    detail: item.detail,
    insertText: sanitizeInsertText(item.insert_text || item.label),
    range,
  };
}

function sanitizeInsertText(text: string) {
  return text.replace(/\$\d+|\${\d+:[^}]*}/g, '');
}

function toCompletionKind(kind?: number) {
  switch (kind) {
    case 2:
      return monaco.languages.CompletionItemKind.Method;
    case 3:
      return monaco.languages.CompletionItemKind.Function;
    case 6:
      return monaco.languages.CompletionItemKind.Variable;
    case 7:
      return monaco.languages.CompletionItemKind.Class;
    case 12:
      return monaco.languages.CompletionItemKind.Value;
    case 14:
      return monaco.languages.CompletionItemKind.Keyword;
    case 15:
      return monaco.languages.CompletionItemKind.Snippet;
    case 16:
      return monaco.languages.CompletionItemKind.Color;
    case 21:
      return monaco.languages.CompletionItemKind.File;
    default:
      return monaco.languages.CompletionItemKind.Text;
  }
}
