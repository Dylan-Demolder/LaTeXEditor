import { invoke, Channel } from "@tauri-apps/api/core";
import { useAppStore } from "../stores/useAppStore";
import type {
  CompileCommandResult,
  OpenProjectResult,
} from "../types";

export async function openProject(projectPath: string): Promise<OpenProjectResult> {
  return invoke<OpenProjectResult>("open_project", { projectPath });
}

/**
 * Re-scan the open project and refresh the file tree. Call after any command
 * that changes what is on disk — the backend has no watcher, so a tree that is
 * not refreshed keeps showing files that were renamed or deleted.
 */
export async function refreshFiles(): Promise<void> {
  const { projectPath, setFiles } = useAppStore.getState();
  if (!projectPath) return;
  const result = await openProject(projectPath);
  setFiles(result.files);
}

export async function readFile(filePath: string): Promise<string> {
  return invoke<string>("read_file", { filePath });
}

export async function writeFile(
  filePath: string,
  content: string
): Promise<void> {
  return invoke<void>("write_file", { filePath, content });
}

export async function deleteFile(filePath: string): Promise<void> {
  return invoke<void>("delete_file", { filePath });
}

export async function createDirectory(dirPath: string): Promise<void> {
  return invoke<void>("create_directory", { dirPath });
}

export async function renameFile(
  oldPath: string,
  newPath: string
): Promise<void> {
  return invoke<void>("rename_file", { oldPath, newPath });
}

export async function compileLatex(
  texFile: string,
  outputDir: string,
  compilerOverride?: string
): Promise<CompileCommandResult> {
  return invoke<CompileCommandResult>("compile_latex", {
    texFile,
    outputDir,
    compilerOverride: compilerOverride || null,
  });
}

export async function checkCompilers(): Promise<string[]> {
  return invoke<string[]>("check_compilers");
}

export async function readPdf(filePath: string): Promise<number[]> {
  return invoke<number[]>("read_pdf", { filePath });
}

export async function setMcpProject(
  projectPath: string | null,
  activeFilePath: string | null
): Promise<void> {
  return invoke<void>("set_mcp_project", {
    projectPath,
    activeFile: activeFilePath,
  });
}

export interface McpStatus {
  port: number;
  running: boolean;
  endpoint: string;
  sse_endpoint: string;
}

export async function getMcpStatus(): Promise<McpStatus> {
  return invoke("get_mcp_status");
}

export async function listPlugins(): Promise<any[]> {
  return invoke<any[]>("list_plugins");
}

export async function readPluginFile(pluginPath: string, fileName: string): Promise<string> {
  return invoke<string>("read_plugin_file", { pluginPath, fileName });
}

export interface AiCallRequest {
  provider: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AiCallResponse {
  content: string;
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export async function callAi(req: AiCallRequest): Promise<AiCallResponse> {
  return invoke<AiCallResponse>("call_ai", {
    request: {
      provider: req.provider,
      model: req.model,
      system_prompt: req.systemPrompt,
      user_prompt: req.userPrompt,
      temperature: req.temperature || 0.7,
      max_tokens: req.maxTokens || 16384,
    },
  });
}

type StreamEvent =
  | { type: "chunk"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "done"; cancelled: boolean }
  | { type: "error"; message: string };

/**
 * Streaming counterpart to `callAi`. Chunks arrive via `onChunk` as they are
 * generated; resolves with the assembled text and whether the user cancelled.
 */
export async function callAiStream(
  req: AiCallRequest,
  onChunk: (text: string) => void,
  /** Reasoning-model thinking tokens — progress only, never the answer. */
  onReasoning?: (text: string) => void
): Promise<{ content: string; cancelled: boolean }> {
  const channel = new Channel<StreamEvent>();
  let content = "";
  let cancelled = false;

  channel.onmessage = (event) => {
    if (event.type === "chunk") {
      content += event.text;
      onChunk(event.text);
    } else if (event.type === "reasoning") {
      onReasoning?.(event.text);
    } else if (event.type === "done") {
      cancelled = event.cancelled;
    }
  };

  await invoke<void>("call_ai_stream", {
    request: {
      provider: req.provider,
      model: req.model,
      system_prompt: req.systemPrompt,
      user_prompt: req.userPrompt,
      temperature: req.temperature ?? 0.7,
      max_tokens: req.maxTokens ?? 16384,
    },
    onEvent: channel,
  });

  return { content, cancelled };
}

/**
 * Materialise the bundled guide into a writable folder and return its path.
 * Leaves an existing copy untouched, so edits survive.
 */
export async function ensureSampleProject(): Promise<string> {
  return invoke<string>("ensure_sample_project");
}

/** Ask the in-flight streaming call to stop. */
export async function cancelAi(): Promise<void> {
  return invoke<void>("cancel_ai");
}

export interface AppSettings {
  activeProvider: string;
  activeModel: string;
  apiKeys: Record<string, string>;
  temperature: number;
  maxTokens: number;
  theme: "dark" | "light";
  autoCompile: boolean;
  mcpPort: number;
  firstRunCompleted?: boolean;
  reduceReasoning?: boolean;
  editorFontSize: number;
  editorLineHeight: number;
  editorTabSize: number;
  editorWordWrap: boolean;
  editorLineNumbers: boolean;
  editorMinimap: boolean;
  /** Autosave debounce in ms. 0 disables autosave. */
  autosaveDelayMs: number;
  /** Empty means "first compiler found". */
  defaultCompiler: string;
  /** "fit-width" | "fit-page" | a percentage, e.g. "120". */
  defaultPreviewZoom: string;
  offerTutorialOnLaunch: boolean;
}

export async function loadSettings(): Promise<AppSettings> {
  return invoke<AppSettings>("load_settings");
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  return invoke<void>("save_settings", { settings });
}

// Git commands
export async function gitStatus(projectPath: string): Promise<{
  is_repo: boolean;
  status: any;
  commits: any[];
  branches: string[];
}> {
  return invoke("git_status", { projectPath });
}

export async function gitInit(projectPath: string): Promise<string> {
  return invoke("git_init", { projectPath });
}

export async function gitAdd(projectPath: string, files: string[]): Promise<string> {
  return invoke("git_add", { projectPath, files });
}

export async function gitCommit(projectPath: string, message: string): Promise<string> {
  return invoke("git_commit", { projectPath, message });
}

export async function gitPush(projectPath: string): Promise<string> {
  return invoke("git_push", { projectPath });
}

export async function gitPull(projectPath: string): Promise<string> {
  return invoke("git_pull", { projectPath });
}

export async function gitDiff(projectPath: string, filePath: string): Promise<any> {
  return invoke("git_diff", { projectPath, filePath });
}

export async function gitCheckout(projectPath: string, branch: string): Promise<string> {
  return invoke("git_checkout", { projectPath, branch });
}

// SyncTeX
export async function synctexForward(
  texPath: string,
  outputDir: string,
  line: number,
  col: number
): Promise<{ successful: boolean; page?: number }> {
  return invoke("synctex_forward", { texPath, outputDir, line, col });
}

export async function synctexInverse(
  texPath: string,
  outputDir: string,
  page: number,
  x: number,
  y: number
): Promise<{ successful: boolean; file?: string; line?: number }> {
  return invoke("synctex_inverse", { texPath, outputDir, page, x, y });
}

// Multi-file
export async function findRootFile(projectPath: string): Promise<string> {
  return invoke("find_root_file", { projectPath });
}

export async function getDependencies(texPath: string): Promise<any[]> {
  return invoke("get_dependencies", { texPath });
}

/**
 * Re-open the bundled tutorial. `fresh` sets the current copy aside and
 * restores the pristine one — someone returning to the tutorial has usually
 * half-finished it, and continuing on top of that is not a tutorial.
 */
export async function openTutorial(fresh: boolean): Promise<string> {
  return invoke<string>("open_tutorial", { fresh });
}

/** Path to the reference guide, materialising it if it has been deleted. */
export async function openGuide(): Promise<string> {
  return invoke<string>("open_guide");
}
