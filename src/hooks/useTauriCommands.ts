import { invoke } from "@tauri-apps/api/core";
import type {
  CompileCommandResult,
  OpenProjectResult,
} from "../types";

export async function openProject(projectPath: string): Promise<OpenProjectResult> {
  return invoke<OpenProjectResult>("open_project", { projectPath });
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

export async function getMcpStatus(): Promise<{
  port: number;
  running: boolean;
  endpoint: string;
  sse_endpoint: string;
}> {
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
      max_tokens: req.maxTokens || 4096,
    },
  });
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
}

export async function loadSettings(): Promise<AppSettings> {
  return invoke<AppSettings>("load_settings");
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  return invoke<void>("save_settings", { settings });
}
