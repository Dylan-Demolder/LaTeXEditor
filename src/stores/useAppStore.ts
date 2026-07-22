import { create } from "zustand";
import type { EditorSelection } from "../components/editor/editor-bridge";
import type { FileEntry, LaTeXError } from "../types";

export interface EditorPrefs {
  fontSize: number;
  lineHeight: number;
  tabSize: number;
  wordWrap: boolean;
  lineNumbers: boolean;
  minimap: boolean;
  /** Autosave debounce in ms; 0 disables autosave. */
  autosaveDelayMs: number;
}

export const DEFAULT_EDITOR_PREFS: EditorPrefs = {
  fontSize: 14,
  lineHeight: 22,
  tabSize: 2,
  wordWrap: true,
  lineNumbers: true,
  minimap: false,
  autosaveDelayMs: 1000,
};

/** One open file. The tab list is the source of truth for what is open. */
export interface EditorTab {
  path: string;
  /** Live buffer, which may differ from disk while edits are pending. */
  content: string;
  /** What is currently on disk, so dirtiness is derived rather than guessed. */
  savedContent: string;
}

/**
 * A tab is dirty when its buffer differs from what was last written.
 *
 * Comparing to `savedContent` rather than keeping a boolean means typing a
 * character and deleting it again leaves the tab clean, and a save that fails
 * cannot leave a tab falsely marked as saved.
 */
export function isTabDirty(tab: EditorTab): boolean {
  return tab.content !== tab.savedContent;
}

interface AppStore {
  // Mirrors the Monaco selection so panels can act on what the user highlighted
  // instead of falling back to the whole file.
  selection: EditorSelection | null;
  setSelection: (selection: EditorSelection | null) => void;

  projectPath: string | null;
  files: FileEntry[];
  /** Every open file, in tab order. */
  tabs: EditorTab[];
  /**
   * The three fields below are derived mirrors of the active tab, kept so the
   * nine panels that only ever want "the current file" need no changes. Treat
   * them as read-only: write through openFile / updateTabContent instead.
   */
  activeFilePath: string | null;
  activeFileContent: string;
  isDirty: boolean;
  pdfPath: string | null;
  // Recompiling writes the same path, so the preview needs a change signal it
  // can depend on to know the bytes on disk are new.
  pdfVersion: number;
  pdfData: Uint8Array | null;
  compileErrors: LaTeXError[];
  compileWarnings: LaTeXError[];
  compileBadboxes: LaTeXError[];
  compileMessage: string;
  isCompiling: boolean;
  compilers: string[];
  compilersChecked: boolean;
  selectedCompiler: string;
  expandedDirs: Set<string>;
  autoCompile: boolean;
  /**
   * Editor preferences, mirrored from settings so the editor can react without
   * every component re-reading the settings file.
   */
  editorPrefs: EditorPrefs;

  setProjectPath: (path: string | null) => void;
  setFiles: (files: FileEntry[]) => void;
  setActiveFile: (path: string | null) => void;
  setActiveFileContent: (content: string) => void;
  setIsDirty: (dirty: boolean) => void;
  /** Open a file in a tab (or focus it if already open) and make it active. */
  openFile: (path: string, content: string) => void;
  closeTab: (path: string) => void;
  closeOtherTabs: (path: string) => void;
  /** Record that a tab's contents were written to disk. */
  markTabSaved: (path: string, content: string) => void;
  setPdfPath: (path: string | null) => void;
  setPdfData: (data: Uint8Array | null) => void;
  setCompileErrors: (errors: LaTeXError[]) => void;
  setCompileWarnings: (warnings: LaTeXError[]) => void;
  setCompileBadboxes: (badboxes: LaTeXError[]) => void;
  setCompileMessage: (message: string) => void;
  setIsCompiling: (compiling: boolean) => void;
  setCompilers: (compilers: string[]) => void;
  setSelectedCompiler: (compiler: string) => void;
  setEditorPrefs: (prefs: Partial<EditorPrefs>) => void;
  toggleDir: (path: string) => void;
  setAutoCompile: (auto: boolean) => void;
}

/**
 * Recompute the derived mirrors from the tab list.
 *
 * Every action that changes tabs or focus returns this, so `activeFilePath`,
 * `activeFileContent` and `isDirty` are updated in exactly one place and
 * cannot drift from the tabs they describe.
 */
function mirror(tabs: EditorTab[], activePath: string | null) {
  const active = tabs.find((t) => t.path === activePath) ?? null;
  return {
    activeFilePath: active ? active.path : activePath,
    activeFileContent: active ? active.content : "",
    isDirty: active ? isTabDirty(active) : false,
  };
}

export const useAppStore = create<AppStore>((set) => ({
  selection: null,
  setSelection: (selection) => set({ selection }),
  projectPath: null,
  files: [],
  tabs: [],
  activeFilePath: null,
  activeFileContent: "",
  isDirty: false,
  pdfPath: null,
  pdfVersion: 0,
  pdfData: null,
  compileErrors: [],
  compileWarnings: [],
  compileBadboxes: [],
  compileMessage: "",
  isCompiling: false,
  compilers: [],
  compilersChecked: false,
  selectedCompiler: "",
  expandedDirs: new Set<string>(),
  autoCompile: false,
  editorPrefs: DEFAULT_EDITOR_PREFS,

  setProjectPath: (path) => set({ projectPath: path }),
  setFiles: (files) => set({ files }),
  // Dropping the selection here matters: a range captured in one file must
  // never be applied into another.
  setActiveFile: (path) =>
    set((state) => {
      if (path === null) return { ...mirror(state.tabs, null), selection: null };
      // Switching to a file that is not open yet leaves the tab list alone;
      // openFile is what adds it. This keeps setActiveFile usable by callers
      // that already hold the content.
      return { ...mirror(state.tabs, path), selection: null };
    }),

  // Kept for the callers that set content directly after reading a file. It
  // writes through to the tab so the buffer and the mirror cannot disagree.
  setActiveFileContent: (content) =>
    set((state) => {
      if (!state.activeFilePath) return { activeFileContent: content };
      const tabs = state.tabs.map((t) =>
        t.path === state.activeFilePath ? { ...t, content } : t
      );
      return { tabs, ...mirror(tabs, state.activeFilePath) };
    }),

  // Dirtiness is derived from savedContent, so this only exists for the two
  // callers that flip it directly; it marks the tab saved rather than lying.
  setIsDirty: (dirty) =>
    set((state) => {
      if (dirty || !state.activeFilePath) return { isDirty: dirty };
      const tabs = state.tabs.map((t) =>
        t.path === state.activeFilePath ? { ...t, savedContent: t.content } : t
      );
      return { tabs, ...mirror(tabs, state.activeFilePath) };
    }),

  openFile: (path, content) =>
    set((state) => {
      const existing = state.tabs.find((t) => t.path === path);
      // Re-opening a file that is already open must not discard unsaved edits,
      // so an existing tab is focused rather than replaced.
      const tabs = existing
        ? state.tabs
        : [...state.tabs, { path, content, savedContent: content }];
      return { tabs, ...mirror(tabs, path), selection: null };
    }),

  closeTab: (path) =>
    set((state) => {
      const index = state.tabs.findIndex((t) => t.path === path);
      if (index === -1) return {};
      const tabs = state.tabs.filter((t) => t.path !== path);

      // Closing the active tab moves to its right-hand neighbour, or its
      // left-hand one if it was last — the behaviour every editor has, and the
      // one that keeps you near where you were.
      let nextPath = state.activeFilePath;
      if (state.activeFilePath === path) {
        nextPath = tabs[index]?.path ?? tabs[index - 1]?.path ?? null;
      }
      return { tabs, ...mirror(tabs, nextPath), selection: null };
    }),

  closeOtherTabs: (path) =>
    set((state) => {
      const tabs = state.tabs.filter((t) => t.path === path);
      return { tabs, ...mirror(tabs, tabs.length ? path : null), selection: null };
    }),

  markTabSaved: (path, content) =>
    set((state) => {
      const tabs = state.tabs.map((t) =>
        t.path === path ? { ...t, savedContent: content } : t
      );
      return { tabs, ...mirror(tabs, state.activeFilePath) };
    }),
  setPdfPath: (path) =>
    set((state) => ({ pdfPath: path, pdfVersion: state.pdfVersion + 1 })),
  setPdfData: (data) => set({ pdfData: data }),
  setCompileErrors: (errors) => set({ compileErrors: errors }),
  setCompileWarnings: (warnings) => set({ compileWarnings: warnings }),
  setCompileBadboxes: (badboxes) => set({ compileBadboxes: badboxes }),
  setCompileMessage: (message) => set({ compileMessage: message }),
  setIsCompiling: (compiling) => set({ isCompiling: compiling }),
  setCompilers: (compilers) => set({ compilers, compilersChecked: true }),
  setSelectedCompiler: (compiler) => set({ selectedCompiler: compiler }),
  setEditorPrefs: (prefs) =>
    set((state) => ({ editorPrefs: { ...state.editorPrefs, ...prefs } })),
  toggleDir: (path) =>
    set((state) => {
      const next = new Set(state.expandedDirs);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return { expandedDirs: next };
    }),
  setAutoCompile: (auto) => set({ autoCompile: auto }),
}));
