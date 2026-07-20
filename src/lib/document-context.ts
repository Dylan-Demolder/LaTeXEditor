import type { FileEntry, LaTeXError } from "../types";

/**
 * Facts about the surrounding project that make AI output usable.
 *
 * Without these the model guesses: it emits `\toprule` into a document that
 * never loaded booktabs, invents `\cite{smith2020}` keys that aren't in the
 * .bib, and asks you to paste an error log the app already has.
 *
 * Each extractor is a pure string function so it can be checked without a
 * running editor — see document-context.check.ts.
 */
export type ContextKind = "errors" | "preamble" | "labels" | "bib" | "tree";

/** Strip comments so commented-out packages/labels don't count as real. */
function stripComments(tex: string): string {
  return tex
    .split("\n")
    .map((line) => line.replace(/(^|[^\\])%.*$/, "$1"))
    .join("\n");
}

/**
 * The `\documentclass` line plus every `\usepackage` — what actually determines
 * which commands are available.
 */
export function extractPreamble(content: string, maxLines = 40): string[] {
  const body = stripComments(content);
  const end = body.indexOf("\\begin{document}");
  const preamble = end === -1 ? body : body.slice(0, end);

  const lines = preamble
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^\\(documentclass|usepackage|RequirePackage)\b/.test(l));

  return lines.slice(0, maxLines);
}

/** Every `\label{...}` so the model references real targets instead of inventing them. */
export function extractLabels(content: string, max = 60): string[] {
  const out = new Set<string>();
  const re = /\\label\{([^}]+)\}/g;
  let match;
  while ((match = re.exec(stripComments(content))) !== null) {
    out.add(match[1]);
    if (out.size >= max) break;
  }
  return [...out];
}

/** BibTeX keys from a .bib file — `@article{key,` → `key`. */
export function extractCiteKeys(bib: string, max = 100): string[] {
  const out = new Set<string>();
  const re = /@[A-Za-z]+\s*\{\s*([^,\s}]+)\s*,/g;
  let match;
  while ((match = re.exec(bib)) !== null) {
    out.add(match[1]);
    if (out.size >= max) break;
  }
  return [...out];
}

/** Flatten the file tree to relative paths, directories first, capped. */
export function formatProjectTree(files: FileEntry[], root: string, max = 60): string[] {
  const out: string[] = [];
  const walk = (entries: FileEntry[]) => {
    for (const entry of entries) {
      if (out.length >= max) return;
      const rel = entry.path.startsWith(root) ? entry.path.slice(root.length + 1) : entry.path;
      out.push(entry.is_dir ? `${rel}/` : rel);
      if (entry.children) walk(entry.children);
    }
  };
  walk(files);
  return out;
}

/** Compile issues, most severe first, in a form worth spending tokens on. */
export function formatErrors(errors: LaTeXError[], max = 20): string[] {
  return errors
    .slice(0, max)
    .map((e) => {
      const where = e.file ? `${e.file.split("/").pop()}:${e.line}` : `line ${e.line}`;
      return `${where} — ${e.message}${e.context ? ` (${e.context.trim()})` : ""}`;
    });
}

export interface ContextSection {
  kind: ContextKind;
  title: string;
  lines: string[];
}

/**
 * Render sections into a delimited block appended to the system prompt.
 * Returns "" when there is nothing to say, so no empty headers are sent.
 */
export function renderContext(sections: ContextSection[]): string {
  const present = sections.filter((s) => s.lines.length > 0);
  if (present.length === 0) return "";

  const body = present
    .map((s) => `## ${s.title}\n${s.lines.join("\n")}`)
    .join("\n\n");

  return (
    "\n\n---\nContext from the user's project. Use it to stay consistent — " +
    "reference only labels and citation keys listed here, and only use commands " +
    "provided by the packages listed here.\n\n" +
    body +
    "\n---"
  );
}

/** Short human summary for the UI, e.g. "preamble, 3 errors, 12 labels". */
export function summarizeContext(sections: ContextSection[]): string {
  const parts = sections
    .filter((s) => s.lines.length > 0)
    .map((s) => (s.kind === "preamble" ? "preamble" : `${s.lines.length} ${s.title.toLowerCase()}`));
  return parts.join(", ");
}
