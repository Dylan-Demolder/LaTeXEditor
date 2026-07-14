export type PluginType =
  | "theme"
  | "snippets"
  | "component"
  | "compile-hook"
  | "preview"
  | "tool"
  | "linter";

export interface PluginManifest {
  name: string;
  version: string;
  type: PluginType;
  icon: string;
  description: string;
  author: string;
  main: string;
  activation?: "always" | "manual" | "on-demand";
  dependencies?: Record<string, string>;
  config?: PluginConfigField[];
}

export interface PluginConfigField {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "select";
  default: string | number | boolean;
  options?: { label: string; value: string }[];
}

export interface InstalledPlugin {
  manifest: PluginManifest;
  path: string;
  enabled: boolean;
  id: string;
}

export interface PluginAPI {
  editor: {
    getContent: () => string;
    setContent: (content: string) => void;
    getSelection: () => string;
    insertText: (text: string) => void;
    getCursorPosition: () => { line: number; column: number };
    goToLine: (line: number) => void;
  };
  project: {
    getRoot: () => string;
    getActiveFile: () => string;
    readFile: (path: string) => Promise<string>;
    writeFile: (path: string, content: string) => Promise<void>;
  };
  compile: {
    compile: () => Promise<{ success: boolean; errors: string[] }>;
    getErrors: () => Promise<{ errors: any[]; warnings: any[] }>;
  };
  ui: {
    showNotification: (message: string, type: "info" | "warning" | "error") => void;
    openPanel: (panel: string) => void;
  };
  events: {
    on: (event: string, handler: (...args: any[]) => void) => void;
    off: (event: string, handler: (...args: any[]) => void) => void;
    emit: (event: string, ...args: any[]) => void;
  };
}

export interface PluginMessage {
  id: string;
  method: string;
  params: any[];
}

export interface PluginResponse {
  id: string;
  result?: any;
  error?: string;
}
