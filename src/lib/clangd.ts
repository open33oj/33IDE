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
    async provideCompletionItems(model, position, context) {
      try {
        // Forward the real trigger context so clangd knows we are completing
        // after a member-access operator (./->/::). Without this it can fail
        // to resolve struct members.
        const triggerCharacter =
          context.triggerKind === monaco.languages.CompletionTriggerKind.TriggerCharacter
            ? context.triggerCharacter ?? null
            : null;
        const items = await api.clangdComplete(
          model.getValue(),
          getActiveFilePath(),
          position.lineNumber - 1,
          position.column - 1,
          triggerCharacter,
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
  const completionRange = item.text_edit
    ? new monaco.Range(
        item.text_edit.start_line + 1,
        item.text_edit.start_character + 1,
        item.text_edit.end_line + 1,
        item.text_edit.end_character + 1,
      )
    : range;

  const insertText = sanitizeInsertText(item.text_edit?.new_text || item.insert_text || item.label);

  return {
    label: item.label,
    kind: toCompletionKind(item.kind),
    detail: item.detail,
    insertText,
    // Filter/score against the real insertion token (the identifier the user
    // is actually typing) instead of the verbose label clangd emits with the
    // `--completion-style=detailed` flag. This keeps prefix matches ranked
    // above substring/fuzzy matches.
    filterText: insertText,
    // Preserve clangd's relevance order as the post-score tiebreaker so the
    // built-in Monaco fuzzy score alone can't reshuffle struct members.
    sortText: item.sort_text,
    range: completionRange,
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
