/**
 * Dev-C++ 5.11 "New Look" Theme for CodeMirror 6
 * Ported from devcpp.ini [Editor.Syntax] section
 *
 * Original Dev-C++ color mappings:
 *   Comment       = clHighlight (#4169E1), italic
 *   Reserved Word = clBlack (#000000), bold
 *   String        = clBlue (#0000FF), bold
 *   Number        = clPurple (#800080)
 *   Preprocessor  = clGreen (#008000)
 *   Symbol        = clRed (#FF0000), bold
 *   Identifier    = clBlack (#000000)
 *   Assembler     = clBlue (#0000FF)
 */

import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

const newLookHighlight = HighlightStyle.define([
  // Comment: #4169E1, italic
  { tag: tags.comment, color: "#4169E1", fontStyle: "italic" },
  { tag: tags.lineComment, color: "#4169E1", fontStyle: "italic" },
  { tag: tags.blockComment, color: "#4169E1", fontStyle: "italic" },
  { tag: tags.docComment, color: "#4169E1", fontStyle: "italic" },

  // Keyword / Reserved Word: #000000, bold
  { tag: tags.keyword, color: "#000000", fontWeight: "bold" },
  { tag: tags.controlKeyword, color: "#000000", fontWeight: "bold" },
  { tag: tags.operatorKeyword, color: "#000000", fontWeight: "bold" },
  { tag: tags.definitionKeyword, color: "#000000", fontWeight: "bold" },
  { tag: tags.moduleKeyword, color: "#000000", fontWeight: "bold" },

  // String: #0000FF, bold
  { tag: tags.string, color: "#0000FF", fontWeight: "bold" },
  { tag: tags.special(tags.string), color: "#0000FF", fontWeight: "bold" },

  // Number / Float / Hex / Octal: #800080
  { tag: tags.number, color: "#800080" },
  { tag: tags.integer, color: "#800080" },
  { tag: tags.float, color: "#800080" },
  { tag: tags.bool, color: "#800080" },

  // Preprocessor / Meta: #008000
  { tag: tags.meta, color: "#008000" },
  { tag: tags.processingInstruction, color: "#008000" },

  // Operator / Symbol: #FF0000, bold
  { tag: tags.operator, color: "#FF0000", fontWeight: "bold" },
  { tag: tags.punctuation, color: "#FF0000", fontWeight: "bold" },
  { tag: tags.bracket, color: "#FF0000", fontWeight: "bold" },
  { tag: tags.separator, color: "#FF0000", fontWeight: "bold" },
  { tag: tags.derefOperator, color: "#FF0000", fontWeight: "bold" },
  { tag: tags.arithmeticOperator, color: "#FF0000", fontWeight: "bold" },
  { tag: tags.logicOperator, color: "#FF0000", fontWeight: "bold" },
  { tag: tags.bitwiseOperator, color: "#FF0000", fontWeight: "bold" },
  { tag: tags.compareOperator, color: "#FF0000", fontWeight: "bold" },
  { tag: tags.updateOperator, color: "#FF0000", fontWeight: "bold" },
  { tag: tags.definitionOperator, color: "#FF0000", fontWeight: "bold" },

  // Identifier / Variable: #000000
  { tag: tags.name, color: "#000000" },
  { tag: tags.variableName, color: "#000000" },
  { tag: tags.definition(tags.variableName), color: "#000000" },
  { tag: tags.function(tags.variableName), color: "#000000" },
  { tag: tags.propertyName, color: "#000000" },
  { tag: tags.definition(tags.propertyName), color: "#000000" },
  { tag: tags.function(tags.propertyName), color: "#000000" },
  { tag: tags.className, color: "#000000" },
  { tag: tags.definition(tags.className), color: "#000000" },
  { tag: tags.typeName, color: "#000000" },
  { tag: tags.namespace, color: "#000000" },

  // Assembler / Atom / Constant: #0000FF
  { tag: tags.atom, color: "#0000FF" },
  { tag: tags.constant(tags.name), color: "#0000FF" },
  { tag: tags.standard(tags.name), color: "#0000FF" },

  // Label
  { tag: tags.labelName, color: "#000000" },

  // Tag (XML/HTML)
  { tag: tags.tagName, color: "#000000", fontWeight: "bold" },
  { tag: tags.attributeName, color: "#000000" },
  { tag: tags.attributeValue, color: "#0000FF", fontWeight: "bold" },

  // Escape sequences
  { tag: tags.escape, color: "#800080" },

  // Heading
  { tag: tags.heading, color: "#000080", fontWeight: "bold" },
  { tag: tags.heading1, color: "#000080", fontWeight: "bold" },
  { tag: tags.heading2, color: "#000080", fontWeight: "bold" },
  { tag: tags.heading3, color: "#000080", fontWeight: "bold" },
  { tag: tags.heading4, color: "#000080", fontWeight: "bold" },

  // Strong / Emphasis
  { tag: tags.strong, fontWeight: "bold" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },

  // Link
  { tag: tags.link, color: "#0000FF", textDecoration: "underline" },
  { tag: tags.url, color: "#0000FF", textDecoration: "underline" },

  // Deleted / Inserted
  { tag: tags.deleted, color: "#FF0000", backgroundColor: "#ffeef0" },
  { tag: tags.inserted, color: "#008000" },

  // Quote
  { tag: tags.quote, color: "#008000", fontStyle: "italic" },

  // Regex
  { tag: tags.regexp, color: "#800080" },

  // Color / Bool
  { tag: tags.color, color: "#800080" },
  { tag: tags.bool, color: "#800080" },

  // Invalid / Error
  { tag: tags.invalid, color: "#FF0000" },
]);

const newLookBaseTheme = EditorView.theme({
  "&": {
    backgroundColor: "#ffffff",
    color: "#000000",
    fontFamily: 'Consolas, "Courier New", monospace',
  },
  ".cm-content": {
    caretColor: "#000000",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "#000000",
  },
  "&.cm-focused .cm-selectionBackground, & .cm-line::selection, & .cm-selectionLayer .cm-selectionBackground, .cm-content ::selection": {
    background: "#000080 !important",
    color: "white !important",
  },
  ".cm-activeLine": {
    backgroundColor: "transparent",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
  },
  ".cm-gutters": {
    backgroundColor: "#f0f0f0",
    color: "#888888",
    borderRight: "1px solid #dddddd",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    color: "#888888",
  },
  ".cm-matchingBracket": {
    backgroundColor: "#FFFFAA",
    color: "#FF0000",
    fontWeight: "bold",
  },
  ".cm-foldPlaceholder": {
    backgroundColor: "#f0f0f0",
    color: "#888888",
    border: "1px solid #dddddd",
  },
  "& .cm-selectionMatch": {
    backgroundColor: "#00008033",
  },
  ".cm-searchMatch": {
    backgroundColor: "#FFFF00",
    outline: "1px solid #FFD700",
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "#FFA500",
  },
  ".cm-tooltip": {
    backgroundColor: "#ffffff",
    border: "1px solid #cccccc",
    color: "#000000",
    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
  },
  ".cm-tooltip-autocomplete": {
    backgroundColor: "#ffffff",
    border: "1px solid #cccccc",
    color: "#000000",
  },
  "& .cm-tooltip-autocomplete ul li[aria-selected]": {
    backgroundColor: "#000080",
    color: "#ffffff",
  },
  ".cm-panels": {
    backgroundColor: "#f5f5f5",
    color: "#000000",
  },
  ".cm-panels.cm-panels-top": {
    borderBottom: "1px solid #dddddd",
  },
  ".cm-panels.cm-panels-bottom": {
    borderTop: "1px solid #dddddd",
  },
  ".cm-tab": {
    borderBottom: "1px dotted #cccccc",
  },
}, { dark: false });

export const devcppNewLook = [
  newLookBaseTheme,
  syntaxHighlighting(newLookHighlight),
];
