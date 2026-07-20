import { create } from "zustand";
import type { EditorSelection } from "../components/editor/editor-bridge";
import type { FileEntry, LaTeXError } from "../types";

interface AppStore {
  // Mirrors the Monaco selection so panels can act on what the user highlighted
  // instead of falling back to the whole file.
  selection: EditorSelection | null;
  setSelection: (selection: EditorSelection | null) => void;

  projectPath: string | null;
  files: FileEntry[];
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

  setProjectPath: (path: string | null) => void;
  setFiles: (files: FileEntry[]) => void;
  setActiveFile: (path: string | null) => void;
  setActiveFileContent: (content: string) => void;
  setIsDirty: (dirty: boolean) => void;
  setPdfPath: (path: string | null) => void;
  setPdfData: (data: Uint8Array | null) => void;
  setCompileErrors: (errors: LaTeXError[]) => void;
  setCompileWarnings: (warnings: LaTeXError[]) => void;
  setCompileBadboxes: (badboxes: LaTeXError[]) => void;
  setCompileMessage: (message: string) => void;
  setIsCompiling: (compiling: boolean) => void;
  setCompilers: (compilers: string[]) => void;
  setSelectedCompiler: (compiler: string) => void;
  toggleDir: (path: string) => void;
  setAutoCompile: (auto: boolean) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  selection: null,
  setSelection: (selection) => set({ selection }),
  projectPath: null,
  files: [],
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

  setProjectPath: (path) => set({ projectPath: path }),
  setFiles: (files) => set({ files }),
  // Dropping the selection here matters: a range captured in one file must
  // never be applied into another.
  setActiveFile: (path) =>
    set({ activeFilePath: path, isDirty: false, selection: null }),
  setActiveFileContent: (content) => set({ activeFileContent: content }),
  setIsDirty: (dirty) => set({ isDirty: dirty }),
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
