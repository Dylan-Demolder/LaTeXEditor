import type { AISkill, FileEntry, LaTeXError } from "../types";
import { callAiStream, loadSettings, readFile, setMcpProject } from "../hooks/useTauriCommands";
import {
  extractPreamble,
  extractLabels,
  extractCiteKeys,
  formatProjectTree,
  formatErrors,
  renderContext,
  summarizeContext,
  type ContextSection,
} from "./document-context";

/**
 * One place where a skill turns into a request.
 *
 * Both the AI panel and the inline Cmd+K surface run skills, and they must send
 * byte-identical prompts — if they drift, the same skill quietly behaves
 * differently depending on which surface you invoked it from, which is the kind
 * of bug nobody reports and everybody feels.
 */

/** Everything a run needs from the store, passed in rather than read globally. */
export interface RunEnvironment {
  activeFileContent: string;
  activeFilePath: string | null;
  projectPath: string | null;
  files: FileEntry[];
  compileErrors: LaTeXError[];
}

export async function buildContextSections(
  skill: AISkill,
  env: RunEnvironment
): Promise<ContextSection[]> {
  const kinds = skill.context ?? [];
  if (kinds.length === 0) return [];

  const sections: ContextSection[] = [];

  if (kinds.includes("errors")) {
    sections.push({ kind: "errors", title: "Errors", lines: formatErrors(env.compileErrors) });
  }
  if (kinds.includes("preamble")) {
    sections.push({
      kind: "preamble",
      title: "Preamble",
      lines: extractPreamble(env.activeFileContent),
    });
  }
  if (kinds.includes("labels")) {
    // ponytail: labels come from the open file only. Cross-file \ref targets
    // would mean reading every .tex on each run; revisit if it bites.
    sections.push({ kind: "labels", title: "Labels", lines: extractLabels(env.activeFileContent) });
  }
  if (kinds.includes("bib")) {
    const bibPaths: string[] = [];
    const walk = (entries: FileEntry[]) => {
      for (const entry of entries) {
        if (entry.is_dir) walk(entry.children ?? []);
        else if (entry.extension === "bib") bibPaths.push(entry.path);
      }
    };
    walk(env.files);

    const keys: string[] = [];
    for (const path of bibPaths.slice(0, 5)) {
      try {
        keys.push(...extractCiteKeys(await readFile(path)));
      } catch {
        // An unreadable .bib shouldn't sink the whole request.
      }
    }
    sections.push({ kind: "bib", title: "Citation keys", lines: [...new Set(keys)] });
  }
  if (kinds.includes("tree") && env.projectPath) {
    sections.push({
      kind: "tree",
      title: "Project files",
      lines: formatProjectTree(env.files, env.projectPath),
    });
  }

  return sections;
}

/** Fill $$placeholders$$ from typed args plus the captured source text. */
export function fillTemplate(
  template: string,
  skill: AISkill,
  sourceText: string,
  argValues: Record<string, string>
): string {
  return skill.args.reduce((acc, arg) => {
    const value =
      arg.key === "content" && skill.source === "document" ? sourceText : argValues[arg.key] || "";
    return acc.split(`$$${arg.key}$$`).join(value);
  }, template);
}

export interface BuiltPrompt {
  systemPrompt: string;
  userPrompt: string;
  contextSummary: string;
}

export async function buildPrompt(
  skill: AISkill,
  sourceText: string,
  argValues: Record<string, string>,
  env: RunEnvironment,
  /**
   * Free-form instruction from the Cmd+K bar, or a refinement of a previous
   * answer. Appended after the skill's own prompt so it steers rather than
   * replaces — the skill still contributes its LaTeX-safety rules.
   */
  extraInstruction?: string
): Promise<BuiltPrompt> {
  const sections = await buildContextSections(skill, env);
  const userPrompt = fillTemplate(skill.userPromptTemplate, skill, sourceText, argValues);

  return {
    systemPrompt: skill.systemPrompt + renderContext(sections),
    userPrompt: extraInstruction
      ? `${userPrompt}\n\nAdditional instruction, which takes priority:\n${extraInstruction}`
      : userPrompt,
    contextSummary: summarizeContext(sections),
  };
}

export interface RunHandlers {
  onChunk: (text: string) => void;
  onReasoning?: (text: string) => void;
  onContext?: (summary: string) => void;
}

export interface RunResult {
  content: string;
  cancelled: boolean;
}

/**
 * Build the prompt, stream the answer, and return it. Throws on failure — the
 * caller decides how to surface that, but an error must never be rendered into
 * the same place as a result the user might apply.
 */
export async function runSkill(
  skill: AISkill,
  sourceText: string,
  argValues: Record<string, string>,
  env: RunEnvironment,
  handlers: RunHandlers,
  extraInstruction?: string
): Promise<RunResult> {
  await setMcpProject(env.projectPath, env.activeFilePath);
  const settings = await loadSettings();

  const { systemPrompt, userPrompt, contextSummary } = await buildPrompt(
    skill,
    sourceText,
    argValues,
    env,
    extraInstruction
  );
  handlers.onContext?.(contextSummary);

  return callAiStream(
    {
      provider: settings.activeProvider,
      model: settings.activeModel,
      systemPrompt,
      userPrompt,
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
    },
    handlers.onChunk,
    handlers.onReasoning ?? (() => {})
  );
}

/**
 * Whether a provider is configured well enough to run anything.
 *
 * Checked before the first request rather than after: without it the only
 * feedback a new user gets is a raw provider error at the bottom of the panel,
 * after they have already chosen a skill and pressed Run.
 */
export async function missingKeyReason(): Promise<string | null> {
  try {
    const settings = await loadSettings();
    if (!settings.activeProvider) return "No AI provider selected yet.";
    // Ollama runs locally and needs no key; everything else does.
    if (settings.activeProvider === "ollama") return null;
    const key = settings.apiKeys?.[settings.activeProvider];
    if (!key || key.trim() === "") {
      return `No API key set for ${settings.activeProvider}.`;
    }
    return null;
  } catch {
    return null; // Never block a run on a settings read failing.
  }
}
