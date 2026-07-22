import Editor, { loader } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { useCallback, useRef, useEffect, useState } from "react";
import { useAppStore } from "../../stores/useAppStore";
import { writeFile } from "../../hooks/useTauriCommands";
import {
  monaco,
  getSelection,
  getSelectionOrParagraph,
  type EditorSelection,
} from "./editor-bridge";
import InlineAssist, { type InlineTarget } from "./InlineAssist";
import EditorTabs from "./EditorTabs";
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
  const {
    activeFilePath,
    activeFileContent,
    setActiveFileContent,
    setIsDirty,
    autoCompile,
    editorPrefs,
    markTabSaved,
    closeTab,
  } = useAppStore();
  const flushRef = useRef<() => void>(() => {});
  const closeTabRef = useRef<(path: string) => void>(() => {});
  const cycleTabRef = useRef<(delta: number) => void>(() => {});
  /**
   * Debounced saves in flight, keyed by path.
   *
   * A single shared timer was correct only while one file could be open. With
   * tabs, edits to two files can be pending at once and each must be written
   * to the file it came from.
   */
  const pendingSaves = useRef(
    new Map<string, { timer: ReturnType<typeof setTimeout>; content: string }>()
  );
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

  /**
   * Where the card should sit, in pixels from the top of the editor container.
   *
   * Both edges are reported: `below` is the usual anchor, and `above` lets the
   * card flip up when it would otherwise overflow the bottom of the pane.
   */
  const anchorFor = useCallback((selection: EditorSelection) => {
    const editor = editorRef.current;
    if (!editor) return null;
    const end = editor.getScrolledVisiblePosition({
      lineNumber: selection.range.endLineNumber,
      column: 1,
    });
    const start = editor.getScrolledVisiblePosition({
      lineNumber: selection.range.startLineNumber,
      column: 1,
    });
    if (!end || !start) return null;
    return { below: end.top + end.height + 4, above: start.top - 4 };
  }, []);

  const openAssist = useCallback(() => {
    const selection = getSelectionOrParagraph();
    if (!selection) return;
    const anchor = anchorFor(selection);
    if (!anchor) return;
    setAssist({ selection, ...anchor });
  }, [anchorFor]);

  /**
   * Keep the card attached to its text while the document scrolls. Positioned
   * once at open, it stayed put while the paragraph slid away underneath —
   * pointing at whatever line happened to scroll into its place.
   */
  useEffect(() => {
    const editor = editorRef.current;
    if (!assist || !editor) return;
    const sub = editor.onDidScrollChange(() => {
      const anchor = anchorFor(assist.selection);
      if (!anchor) return;
      setAssist((prev) => (prev ? { ...prev, ...anchor } : prev));
    });
    return () => sub.dispose();
  }, [assist, anchorFor]);

  useEffect(() => {
    openAssistRef.current = openAssist;
  }, [openAssist]);

  /**
   * Write one file and mark its tab clean.
   *
   * Takes the path explicitly rather than reading the active one. A debounced
   * save fires up to a second after the keystroke that scheduled it, by which
   * time the user may have switched tabs — reading `activeFilePath` at that
   * point would write one file's text into another.
   */
  const doSave = useCallback(
    async (path: string, content: string) => {
      try {
        await writeFile(path, content);
        markTabSaved(path, content);
        if (autoCompile && onCompile) onCompile();
      } catch (e) {
        // Leave the tab dirty: it genuinely is, and the dot is the only signal
        // the user has that the write did not happen.
        console.error("Failed to save:", e);
      }
    },
    [markTabSaved, autoCompile, onCompile]
  );

  /** Cancel a pending save for one path and return what it would have written. */
  const takePending = useCallback((path: string) => {
    const pending = pendingSaves.current.get(path);
    if (!pending) return null;
    clearTimeout(pending.timer);
    pendingSaves.current.delete(path);
    return pending.content;
  }, []);

  const saveNow = useCallback(() => {
    const path = activeFilePath;
    const editor = editorRef.current;
    if (!path || !editor) return;
    takePending(path);
    doSave(path, editor.getValue());
  }, [activeFilePath, doSave, takePending]);

  /** Flush every outstanding save. Used before closing a tab or the window. */
  const flushAll = useCallback(() => {
    for (const [path, pending] of [...pendingSaves.current.entries()]) {
      clearTimeout(pending.timer);
      pendingSaves.current.delete(path);
      doSave(path, pending.content);
    }
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

  // Switching tabs no longer needs a flush: each pending save carries its own
  // path, so it writes to the right file whenever it fires. What still needs
  // one is teardown — an edit made in the last second before the editor goes
  // away would otherwise be lost.
  useEffect(() => {
    const pending = pendingSaves.current;
    return () => {
      for (const [path, entry] of pending.entries()) {
        clearTimeout(entry.timer);
        writeFile(path, entry.content);
      }
      pending.clear();
    };
  }, []);

  // Expose the flush so the tab bar can persist a file before closing it.
  useEffect(() => {
    flushRef.current = flushAll;
  }, [flushAll]);

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

    // Tab shortcuts must be editor commands for the same reason Cmd+Enter is:
    // Monaco consumes the keystroke before any window listener sees it.
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyW, () => {
      const path = useAppStore.getState().activeFilePath;
      if (path) closeTabRef.current(path);
    });
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.BracketRight,
      () => cycleTabRef.current(1)
    );
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.BracketLeft,
      () => cycleTabRef.current(-1)
    );

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

  /**
   * Close a tab, writing it first if it has unsaved edits.
   *
   * No confirmation prompt: autosave already writes a second after you stop
   * typing, so a dirty tab is almost always a sub-second window. Prompting
   * would be asking about work the app was about to save anyway — and losing
   * it silently would be worse than either.
   */
  const handleCloseTab = useCallback(
    async (path: string) => {
      const pending = takePending(path);
      const tab = useAppStore.getState().tabs.find((t) => t.path === path);
      const content = pending ?? (tab && tab.content !== tab.savedContent ? tab.content : null);
      if (content !== null) await doSave(path, content);

      // Dispose the Monaco model, or every file ever opened stays in memory
      // with its undo stack for the life of the session.
      monaco.editor.getModel(monaco.Uri.file(path))?.dispose();
      closeTab(path);
    },
    [takePending, doSave, closeTab]
  );

  useEffect(() => {
    closeTabRef.current = handleCloseTab;
  }, [handleCloseTab]);

  // Cycle through tabs, wrapping at either end.
  useEffect(() => {
    cycleTabRef.current = (delta: number) => {
      const { tabs, activeFilePath: current, setActiveFile: select } =
        useAppStore.getState();
      if (tabs.length < 2) return;
      const index = tabs.findIndex((t) => t.path === current);
      if (index === -1) return;
      select(tabs[(index + delta + tabs.length) % tabs.length].path);
    };
  }, []);

  const handleChange = useCallback(
    (value: string | undefined) => {
      const content = value || "";
      setActiveFileContent(content);
      setIsDirty(true);

      const path = activeFilePath;
      if (!path) return;

      // Replace any pending save for this file, leaving other files' alone.
      const existing = pendingSaves.current.get(path);
      if (existing) clearTimeout(existing.timer);

      // 0 means the user has turned autosave off and will press Cmd+S.
      if (editorPrefs.autosaveDelayMs > 0) {
        const timer = setTimeout(() => {
          pendingSaves.current.delete(path);
          doSave(path, content);
        }, editorPrefs.autosaveDelayMs);
        pendingSaves.current.set(path, { timer, content });
      }
    },
    [setActiveFileContent, setIsDirty, doSave, editorPrefs.autosaveDelayMs, activeFilePath]
  );

  return (
    <div className="h-full w-full flex flex-col">
      <EditorTabs onCloseTab={handleCloseTab} />
      {!activeFilePath && (
        <div className="flex items-center px-3 h-8 shrink-0 border-b border-edge bg-base">
          <span className="text-tiny text-ink-3">No file open</span>
        </div>
      )}
      <div className="flex-1 relative">
        {assist && (
          <InlineAssist
            key={assist.selection.range.startLineNumber}
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
            minimap: { enabled: editorPrefs.minimap },
            fontSize: editorPrefs.fontSize,
            lineHeight: editorPrefs.lineHeight,
            padding: { top: 12, bottom: 12 },
            renderLineHighlight: "line",
            smoothScrolling: true,
            cursorBlinking: "smooth",
            lineNumbers: editorPrefs.lineNumbers ? "on" : "off",
            wordWrap: editorPrefs.wordWrap ? "on" : "off",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: editorPrefs.tabSize,
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
