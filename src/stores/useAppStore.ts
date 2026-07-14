import { create } from "zustand";
import type { FileEntry, LaTeXError } from "../types";

interface AppStore {
  projectPath: string | null;
  files: FileEntry[];
  activeFilePath: string | null;
  activeFileContent: string;
  isDirty: boolean;
  pdfPath: string | null;
  pdfData: Uint8Array | null;
  compileErrors: LaTeXError[];
  compileWarnings: LaTeXError[];
  compileBadboxes: LaTeXError[];
  compileMessage: string;
  isCompiling: boolean;
  compilers: string[];
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
  projectPath: null,
  files: [],
  activeFilePath: null,
  activeFileContent: "",
  isDirty: false,
  pdfPath: null,
  pdfData: null,
  compileErrors: [],
  compileWarnings: [],
  compileBadboxes: [],
  compileMessage: "",
  isCompiling: false,
  compilers: [],
  selectedCompiler: "",
  expandedDirs: new Set<string>(),
  autoCompile: false,

  setProjectPath: (path) => set({ projectPath: path }),
  setFiles: (files) => set({ files }),
  setActiveFile: (path) => set({ activeFilePath: path, isDirty: false }),
  setActiveFileContent: (content) => set({ activeFileContent: content }),
  setIsDirty: (dirty) => set({ isDirty: dirty }),
  setPdfPath: (path) => set({ pdfPath: path }),
  setPdfData: (data) => set({ pdfData: data }),
  setCompileErrors: (errors) => set({ compileErrors: errors }),
  setCompileWarnings: (warnings) => set({ compileWarnings: warnings }),
  setCompileBadboxes: (badboxes) => set({ compileBadboxes: badboxes }),
  setCompileMessage: (message) => set({ compileMessage: message }),
  setIsCompiling: (compiling) => set({ isCompiling: compiling }),
  setCompilers: (compilers) => set({ compilers }),
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
