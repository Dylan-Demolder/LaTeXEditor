// edcore.main is the editor plus its contributions (find, folding, comment,
// format) without the ~50 bundled grammars we never use — we register our own.
import * as monacoRuntime from "monaco-editor/esm/vs/editor/edcore.main";
import type * as Monaco from "monaco-editor";

// Bundling Monaco means it is no longer on `window`, so panels that need to
// drive the editor (jump to an error, jump to a section, run a command) go
// through here instead of reaching for a global that no longer exists.
export const monaco = monacoRuntime as unknown as typeof Monaco;

export function getActiveEditor(): Monaco.editor.ICodeEditor | null {
  return monaco.editor.getEditors()[0] ?? null;
}

/** Move the cursor to a line and focus the editor. Lines are 1-based. */
export function goToLine(line: number): void {
  const editor = getActiveEditor();
  if (!editor || line < 1) return;
  editor.revealLineInCenter(line);
  editor.setPosition({ lineNumber: line, column: 1 });
  editor.focus();
}

/** Run a built-in editor command, e.g. "actions.find". */
export function runEditorAction(actionId: string): void {
  const editor = getActiveEditor();
  if (!editor) return;
  editor.focus();
  editor.getAction(actionId)?.run();
}

/** Insert text at the cursor, replacing any selection. */
export function insertAtCursor(text: string): void {
  const editor = getActiveEditor();
  const selection = editor?.getSelection();
  if (!editor || !selection) return;
  editor.executeEdits("insert", [{ range: selection, text, forceMoveMarkers: true }]);
  editor.focus();
}

/** A snapshot of the editor selection, safe to hold across async work. */
export interface EditorSelection {
  text: string;
  range: Monaco.IRange;
  lineCount: number;
}

/** The current selection, or null when the cursor is collapsed. */
export function getSelection(): EditorSelection | null {
  const editor = getActiveEditor();
  const selection = editor?.getSelection();
  const model = editor?.getModel();
  if (!editor || !selection || !model || selection.isEmpty()) return null;

  return {
    text: model.getValueInRange(selection),
    range: selection.toJSON() as Monaco.IRange,
    lineCount: selection.endLineNumber - selection.startLineNumber + 1,
  };
}

/**
 * The selection if there is one, otherwise the paragraph around the cursor.
 *
 * Cmd+K with nothing selected should still do something useful. Requiring a
 * precise selection first is exactly the friction this surface exists to
 * remove, and "the paragraph I am standing in" is almost always what was meant.
 *
 * Paragraph boundaries are blank lines. \begin/\end lines also bound a block,
 * so invoking this inside a table body rewrites the row you are on rather than
 * swallowing the surrounding environment.
 */
export function getSelectionOrParagraph(): EditorSelection | null {
  const explicit = getSelection();
  if (explicit) return explicit;

  const editor = getActiveEditor();
  const model = editor?.getModel();
  const position = editor?.getPosition();
  if (!editor || !model || !position) return null;

  const total = model.getLineCount();
  const isBoundary = (line: number) => {
    const text = model.getLineContent(line).trim();
    return text === "" || /^\\(begin|end)\b/.test(text);
  };

  if (isBoundary(position.lineNumber)) return null;

  let start = position.lineNumber;
  while (start > 1 && !isBoundary(start - 1)) start--;
  let end = position.lineNumber;
  while (end < total && !isBoundary(end + 1)) end++;

  const range: Monaco.IRange = {
    startLineNumber: start,
    startColumn: 1,
    endLineNumber: end,
    endColumn: model.getLineMaxColumn(end),
  };

  return {
    text: model.getValueInRange(range),
    range,
    lineCount: end - start + 1,
  };
}

/**
 * Outline the range an inline edit is about to replace, so it is obvious what
 * is in scope before anything is sent. Returns a disposer.
 */
export function highlightRange(range: Monaco.IRange): () => void {
  const editor = getActiveEditor();
  if (!editor) return () => {};
  const collection = editor.createDecorationsCollection([
    { range, options: { className: "ai-target-range", isWholeLine: false } },
  ]);
  return () => collection.clear();
}

/**
 * Replace an explicit range. Apply-after-AI must target the range captured when
 * the request started, not the live cursor — the user moves around while the
 * model streams, and insertAtCursor would write wherever they happen to be.
 */
export function replaceRange(range: Monaco.IRange, text: string): void {
  const editor = getActiveEditor();
  if (!editor) return;
  editor.executeEdits("ai-apply", [{ range, text, forceMoveMarkers: true }]);
  editor.focus();
}

/** Replace the whole document — the fallback when nothing was selected. */
export function replaceAll(text: string): void {
  const editor = getActiveEditor();
  const model = editor?.getModel();
  if (!editor || !model) return;
  editor.executeEdits("ai-apply", [
    { range: model.getFullModelRange(), text, forceMoveMarkers: true },
  ]);
  editor.focus();
}
