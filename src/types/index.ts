export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  children?: FileEntry[];
  extension?: string;
}

export interface OpenProjectResult {
  root: string;
  files: FileEntry[];
}

export interface LaTeXError {
  file: string;
  line: number;
  column: number;
  message: string;
  severity: "error" | "warning" | "info";
  context?: string;
}

export interface CompileCommandResult {
  success: boolean;
  pdf_path?: string;
  log_path?: string;
  stdout: string;
  stderr: string;
  elapsed_ms: number;
  errors: LaTeXError[];
  warnings: LaTeXError[];
  badboxes: LaTeXError[];
  message: string;
}

export interface AppState {
  projectPath: string | null;
  files: FileEntry[];
  activeFilePath: string | null;
  activeFileContent: string;
  isDirty: boolean;
  pdfPath: string | null;
  pdfLoaded: boolean;
  compileErrors: LaTeXError[];
  compileWarnings: LaTeXError[];
  compileBadboxes: LaTeXError[];
  compileMessage: string;
  isCompiling: boolean;
  compilers: string[];
  selectedCompiler: string;
  expandedDirs: Set<string>;
  autoCompile: boolean;
}
