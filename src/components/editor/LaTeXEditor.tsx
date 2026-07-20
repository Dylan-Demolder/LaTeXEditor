import Editor, { loader } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { useCallback, useRef, useEffect, useState } from "react";
import { useAppStore } from "../../stores/useAppStore";
import { writeFile } from "../../hooks/useTauriCommands";
import { monaco, getSelection, getSelectionOrParagraph } from "./editor-bridge";
import InlineAssist, { type InlineTarget } from "./InlineAssist";
import { MONACO_THEME_NAME } from "../../lib/theme";
import { registerLatexLanguage, LATEX_LANGUAGE_ID } from "./latex-language";

// Bundle Monaco rather than fetching it from a CDN: this is a desktop app and
// must work offline, and the CDN build was pinned to a different version than
// the one in package.json.
self.MonacoEnvironment = { getWorker: () => new editorWorker() };
loader.config({ monaco });
registerLatexLanguage(monaco);

interface Props {
  onCompile?: () => void;
  saveRef?: React.MutableRefObject<() => void>;
}

export default function LaTeXEditor({ onCompile, saveRef }: Props) {
  const { activeFilePath, activeFileContent, setActiveFileContent, setIsDirty, autoCompile } =
    useAppStore();
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const selectionSubRef = useRef<Monaco.IDisposable | null>(null);
  // Monaco commands are registered once at mount; route them through refs so
  // they always invoke the current handler rather than a stale closure.
  const compileRef = useRef(onCompile);
  const saveHandlerRef = useRef<() => void>(() => {});
  const openAssistRef = useRef<() => void>(() => {});
  const closeAssistRef = useRef<() => void>(() => {});
  /**
   * Mirrors "the inline assistant is open" into Monaco's context system.
   *
   * Escape has to close the card even when the cursor is back in the document,
   * but Monaco consumes the keystroke before a window listener ever sees it.
   * Binding Escape as an editor command fixes that; gating it on this key means
   * we only take Escape while the card is actually open, leaving Monaco's own
   * uses for it (dismissing the suggest and find widgets) alone.
   */
  const assistOpenRef = useRef<Monaco.editor.IContextKey<boolean> | null>(null);
  const [assist, setAssist] = useState<InlineTarget | null>(null);

  useEffect(() => {
    assistOpenRef.current?.set(assist !== null);
  }, [assist]);

  const closeAssist = useCallback(() => {
    setAssist(null);
    editorRef.current?.focus();
  }, []);

  useEffect(() => {
    closeAssistRef.current = closeAssist;
  }, [closeAssist]);

  const openAssist = useCallback(() => {
    const editor = editorRef.current;
    const selection = getSelectionOrParagraph();
    if (!editor || !selection) return;

    // Anchor below the last line of the target so the card never covers the
    // text it is about to change.
    const visible = editor.getScrolledVisiblePosition({
      lineNumber: selection.range.endLineNumber,
      column: 1,
    });
    setAssist({ selection, top: (visible?.top ?? 0) + (visible?.height ?? 22) + 4 });
  }, []);

  useEffect(() => {
    openAssistRef.current = openAssist;
  }, [openAssist]);

  const doSave = useCallback(async (content: string) => {
    if (!activeFilePath) return;
    try {
      await writeFile(activeFilePath, content);
      setIsDirty(false);
      if (autoCompile && onCompile) {
        onCompile();
      }
    } catch (e) {
      console.error("Failed to save:", e);
    }
  }, [activeFilePath, setIsDirty, autoCompile, onCompile]);

  const saveNow = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    const editor = editorRef.current;
    if (editor) doSave(editor.getValue());
  }, [doSave]);

  useEffect(() => {
    if (saveRef) saveRef.current = saveNow;
    saveHandlerRef.current = saveNow;
  }, [saveNow, saveRef]);

  useEffect(() => {
    compileRef.current = onCompile;
  }, [onCompile]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        saveNow();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [saveNow]);

  // Flush a pending debounced save when switching files, so edits made in the
  // last second before a switch are not silently dropped.
  useEffect(() => {
    const path = activeFilePath;
    return () => {
      if (!saveTimeoutRef.current) return;
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
      const editor = editorRef.current;
      if (editor && path) writeFile(path, editor.getValue());
    };
  }, [activeFilePath]);

  const handleMount = useCallback((editor: Monaco.editor.IStandaloneCodeEditor) => {
    editorRef.current = editor;

    // Monaco binds Cmd+Enter to "insert line below" and consumes the event, so
    // a window-level listener never fires while the editor has focus — which is
    // almost always. Registering the shortcut as an editor command instead
    // makes Typeset actually work from where you type.
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () =>
      compileRef.current?.()
    );
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () =>
      saveHandlerRef.current()
    );

    // Cmd+K opens the inline assistant on the selection, or on the paragraph
    // the cursor is in. This takes over Monaco's Cmd+K chord prefix; the
    // shortcut list is still reachable from the command palette.
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, () => openAssistRef.current());

    // See assistOpenRef: Escape only reaches us through Monaco while the editor
    // has focus, and only while the card is open.
    assistOpenRef.current = editor.createContextKey<boolean>("aiAssistOpen", false);
    editor.addCommand(
      monaco.KeyCode.Escape,
      () => closeAssistRef.current(),
      "aiAssistOpen"
    );

    // Mirror the selection into the store so panels can act on what the user
    // highlighted rather than defaulting to the entire document.
    const sub = editor.onDidChangeCursorSelection(() => {
      useAppStore.getState().setSelection(getSelection());
    });
    selectionSubRef.current = sub;
  }, []);

  useEffect(() => () => selectionSubRef.current?.dispose(), []);

  const handleChange = useCallback(
    (value: string | undefined) => {
      const content = value || "";
      setActiveFileContent(content);
      setIsDirty(true);

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => doSave(content), 1000);
    },
    [setActiveFileContent, setIsDirty, doSave]
  );

  return (
    <div className="h-full w-full flex flex-col">
      <div className="flex items-center px-3 h-8 shrink-0 border-b border-edge bg-base">
        <span className="text-tiny text-ink-2 font-mono truncate">
          {activeFilePath ? activeFilePath.split("/").pop() || "Untitled" : "No file open"}
        </span>
      </div>
      <div className="flex-1 relative">
        {assist && (
          <InlineAssist
            key={`${assist.selection.range.startLineNumber}-${assist.top}`}
            target={assist}
            onClose={closeAssist}
          />
        )}
        <Editor
          height="100%"
          path={activeFilePath || "untitled.tex"}
          language={LATEX_LANGUAGE_ID}
          theme={MONACO_THEME_NAME}
          value={activeFileContent}
          onChange={handleChange}
          onMount={handleMount}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            lineHeight: 22,
            padding: { top: 12, bottom: 12 },
            renderLineHighlight: "line",
            smoothScrolling: true,
            cursorBlinking: "smooth",
            lineNumbers: "on",
            wordWrap: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            bracketPairColorization: { enabled: true },
            matchBrackets: "always",
            autoClosingBrackets: "always",
            suggest: { showWords: true, showSnippets: true },
          }}
        />
      </div>
    </div>
  );
}
