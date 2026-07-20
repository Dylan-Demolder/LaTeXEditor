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

import type { ContextKind } from "../lib/document-context";
import type { IconName } from "../components/icons";

export type { ContextKind };

/** Where a skill's `content` argument comes from. */
export type SkillSource =
  /** Text from the document — the selection, or the whole file. */
  | "document"
  /** Something the user types, e.g. a table description or a paper topic. */
  | "input";

/** What can be done with a skill's result. */
export type SkillOutput =
  /** Corrected LaTeX that replaces the source text — diffable and applyable. */
  | "replace"
  /** New LaTeX to drop in at the cursor — applyable, but nothing to diff against. */
  | "insert"
  /** Prose for the reader (an explanation, a summary) — copy only, never applied. */
  | "text";

export interface AISkill {
  id: string;
  name: string;
  icon: IconName;
  description: string;
  category: "edit" | "analyze" | "generate" | "fix";
  source: SkillSource;
  output: SkillOutput;
  /**
   * Project facts to attach to the system prompt. Opt-in per skill — sending
   * everything every time is wasted tokens, and "Explain Equation" needs none.
   */
  context?: ContextKind[];
  systemPrompt: string;
  userPromptTemplate: string;
  args: { key: string; label: string; placeholder: string }[];
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
