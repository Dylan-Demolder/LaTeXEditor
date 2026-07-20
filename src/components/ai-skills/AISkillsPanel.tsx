import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { aiSkills, SKILL_CATEGORIES } from "../../data/ai-skills";
import type { AISkill } from "../../types";
import { useAppStore } from "../../stores/useAppStore";
import { cancelAi, getMcpStatus, type McpStatus } from "../../hooks/useTauriCommands";
import { renderContext } from "../../lib/document-context";
import {
  runSkill,
  buildContextSections,
  fillTemplate,
  missingKeyReason,
  type RunEnvironment,
} from "../../lib/ai-runner";
import { replaceRange, replaceAll, insertAtCursor } from "../editor/editor-bridge";
import { lineDiff, collapseUnchanged, isUnchanged, type DiffLine } from "../../lib/line-diff";
import { annotate, type WordPart } from "../../lib/word-diff";
import { stripCodeFence } from "../../lib/ai-output";
import { Icon } from "../icons";
import type * as Monaco from "monaco-editor";

type SkillCategory = AISkill["category"];

/**
 * What the skill was run against, captured at Run time. The user keeps editing
 * while the model works, so Apply must target this snapshot — not the live
 * selection, and not a different file.
 */
interface PendingRun {
  sourceText: string;
  range: Monaco.IRange | null; // null = whole file
  filePath: string | null;
}

/**
 * One side of a word-diffed line pair. Unchanged text is dimmed so the eye
 * lands on the edit rather than re-reading the sentence; the changed run keeps
 * the line's colour and gains a tint behind it.
 */
function WordRun({ parts, op }: { parts: WordPart[]; op: "+" | "-" }) {
  return (
    <>
      {parts.map((part, i) =>
        part.op === " " ? (
          // whitespace-pre: the diff carries the original spacing, and a
          // collapsing span would silently reformat what it claims to show.
          <span key={i} className="text-ink-3 whitespace-pre">
            {part.text}
          </span>
        ) : (
          <span
            key={i}
            className={`whitespace-pre rounded-sm ${
              op === "+" ? "bg-success/20" : "bg-danger/20"
            }`}
          >
            {part.text}
          </span>
        )
      )}
    </>
  );
}

export default function AISkillsPanel() {
  const { activeFileContent, activeFilePath, projectPath, selection, files, compileErrors } =
    useAppStore();
  const [selectedSkill, setSelectedSkill] = useState<AISkill | null>(null);
  const [argValues, setArgValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [contextSummary, setContextSummary] = useState("");
  const [reasoning, setReasoning] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [activeCategory, setActiveCategory] = useState<SkillCategory | "all">("all");
  const [search, setSearch] = useState("");
  const startedAt = useRef(0);
  const [mcp, setMcp] = useState<McpStatus | null>(null);

  // Reported from the server's actual bind result, not assumed.
  useEffect(() => {
    getMcpStatus().then(setMcp).catch(() => setMcp(null));
  }, []);

  // A visible timer is what distinguishes "thinking" from "hung".
  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(
      () => setElapsed(Math.round((Date.now() - startedAt.current) / 100) / 10),
      100
    );
    return () => clearInterval(id);
  }, [isRunning]);

  const filtered = aiSkills.filter((s) => {
    if (activeCategory !== "all" && s.category !== activeCategory) return false;
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // For document skills, the selection wins over the whole file — sending an
  // entire thesis to proofread one paragraph is slow and expensive.
  const documentSource = useMemo<PendingRun | null>(() => {
    if (!activeFilePath) return null;
    if (selection) {
      return { sourceText: selection.text, range: selection.range, filePath: activeFilePath };
    }
    return { sourceText: activeFileContent, range: null, filePath: activeFilePath };
  }, [selection, activeFileContent, activeFilePath]);

  const sourceLabel = useMemo(() => {
    if (!documentSource) return "No file open";
    const lines = documentSource.sourceText ? documentSource.sourceText.split("\n").length : 0;
    return selection
      ? `selection (${selection.lineCount} ${selection.lineCount === 1 ? "line" : "lines"})`
      : `whole file (${lines} ${lines === 1 ? "line" : "lines"})`;
  }, [documentSource, selection]);

  const reset = () => {
    setResult(null);
    setPending(null);
    setError(null);
    setNotice(null);
    setContextSummary("");
    setReasoning("");
  };

  const handleSelect = useCallback((skill: AISkill) => {
    setSelectedSkill(skill);
    reset();
    // Only `input` skills need typed args; `document` skills read the editor.
    const vals: Record<string, string> = {};
    skill.args.forEach((arg) => {
      if (arg.key === "content" && skill.source === "document") return;
      vals[arg.key] = "";
    });
    setArgValues(vals);
  }, []);

  // Passed to the shared runner so the panel and Cmd+K build identical prompts.
  const env = useMemo<RunEnvironment>(
    () => ({ activeFileContent, activeFilePath, projectPath, files, compileErrors }),
    [activeFileContent, activeFilePath, projectPath, files, compileErrors]
  );

  const handleCopyPrompt = useCallback(async () => {
    if (!selectedSkill) return;
    const sourceText =
      selectedSkill.source === "document"
        ? documentSource?.sourceText ?? ""
        : argValues.content || "";
    // Same prompt Run sends, context included — otherwise pasting this into
    // another agent silently gives different results.
    const sections = await buildContextSections(selectedSkill, env);
    const prompt =
      selectedSkill.systemPrompt +
      renderContext(sections) +
      "\n\n" +
      fillTemplate(selectedSkill.userPromptTemplate, selectedSkill, sourceText, argValues);
    await navigator.clipboard.writeText(prompt);
    setNotice("Prompt copied to clipboard.");
  }, [selectedSkill, documentSource, argValues, env]);

  const handleRunAi = useCallback(async () => {
    if (!selectedSkill) return;

    const run: PendingRun =
      selectedSkill.source === "document"
        ? documentSource ?? { sourceText: "", range: null, filePath: null }
        : { sourceText: argValues.content || "", range: null, filePath: activeFilePath };

    if (!run.sourceText.trim()) {
      setError(
        selectedSkill.source === "document"
          ? "Nothing to work on — open a file, or select the text you want changed."
          : "Fill in the input above first."
      );
      return;
    }

    // Catch an unconfigured provider here rather than letting the user pick a
    // skill, press Run, wait, and then read a raw HTTP error.
    const missing = await missingKeyReason();
    if (missing) {
      setError(`${missing} Open Settings to add one.`);
      return;
    }

    reset();
    setPending(run);
    setIsRunning(true);
    setElapsed(0);
    startedAt.current = Date.now();

    try {
      const { content, cancelled } = await runSkill(
        selectedSkill,
        run.sourceText,
        argValues,
        env,
        {
          // Render tokens as they arrive rather than waiting for the whole response.
          onChunk: (chunk) => setResult((prev) => (prev ?? "") + chunk),
          // Reasoning models emit their chain of thought first; show it as
          // progress so the panel isn't silent, but never treat it as the answer.
          onReasoning: (chunk) => setReasoning((prev) => prev + chunk),
          onContext: setContextSummary,
        }
      );

      setResult(content);
      if (cancelled) setNotice("Stopped. Partial result kept below.");
    } catch (e) {
      setError(String(e));
    } finally {
      setIsRunning(false);
    }
  }, [selectedSkill, documentSource, argValues, activeFilePath, env]);

  const cleanResult = useMemo(() => (result ? stripCodeFence(result) : null), [result]);

  const diff = useMemo<DiffLine[] | null>(() => {
    // Only after the stream finishes — diffing is O(n*m) and would rerun on
    // every token. Mid-stream the raw text is shown instead.
    if (isRunning || !cleanResult || !pending || selectedSkill?.output !== "replace") return null;
    return lineDiff(pending.sourceText, cleanResult);
  }, [isRunning, cleanResult, pending, selectedSkill]);

  // Applying into a file other than the one the text came from would corrupt it.
  const staleTarget = pending !== null && pending.filePath !== activeFilePath;

  const handleApply = useCallback(() => {
    if (!cleanResult || !selectedSkill || !pending || staleTarget) return;

    if (selectedSkill.output === "insert") {
      insertAtCursor(cleanResult);
    } else if (pending.range) {
      replaceRange(pending.range, cleanResult);
    } else {
      replaceAll(cleanResult);
    }
    // Naming the escape hatch is what makes people willing to press Apply on a
    // diff they only half-read.
    setNotice("Applied to document — ⌘Z in the editor to undo.");
  }, [cleanResult, selectedSkill, pending, staleTarget]);

  const categories = ["all", ...Object.keys(SKILL_CATEGORIES)] as (SkillCategory | "all")[];

  return (
    <div className="h-full w-full flex flex-col bg-base">
      <div className="flex items-center pl-3 pr-1.5 h-8 shrink-0 border-b border-edge">
        <span className="panel-label">AI Skills</span>
      </div>

      {selectedSkill ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-edge">
            <button
              onClick={() => { setSelectedSkill(null); reset(); }}
              className="flex items-center gap-1 text-ink-2 hover:text-ink text-tiny"
            >
              <Icon name="arrow-left" size={13} />
              Back
            </button>
            <Icon name={selectedSkill.icon} size={15} className="text-accent" />
            <span className="text-tiny text-ink font-medium truncate">
              {selectedSkill.name}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            <p className="text-tiny text-ink-3">{selectedSkill.description}</p>

            {selectedSkill.source === "document" && (
              <div className="text-tiny px-2 py-1.5 rounded bg-raised border border-edge">
                <span className="text-ink-3">Using: </span>
                <span className={documentSource ? "text-accent" : "text-warning"}>
                  {sourceLabel}
                </span>
                {documentSource && !selection && (
                  <div className="text-ink-3 mt-0.5">
                    Select text in the editor to work on just that part.
                  </div>
                )}
              </div>
            )}

            {(selectedSkill.context?.length ?? 0) > 0 && (
              <div className="text-tiny text-ink-3">
                Also sends:{" "}
                <span className="text-ink-3">
                  {contextSummary || selectedSkill.context!.join(", ")}
                </span>
              </div>
            )}

            {selectedSkill.args
              .filter((arg) => !(arg.key === "content" && selectedSkill.source === "document"))
              .map((arg) => (
                <div key={arg.key} className="space-y-1">
                  <label className="text-tiny text-ink-2">{arg.label}</label>
                  <textarea
                    value={argValues[arg.key] || ""}
                    onChange={(e) =>
                      setArgValues((prev) => ({ ...prev, [arg.key]: e.target.value }))
                    }
                    placeholder={arg.placeholder}
                    rows={arg.key === "content" ? 6 : 3}
                    className="w-full bg-hover text-ink text-tiny px-2 py-1.5 rounded border border-edge-strong resize-y font-mono"
                  />
                </div>
              ))}

            <div className="flex gap-2">
              <button
                onClick={handleCopyPrompt}
                className="flex-1 px-3 py-1.5 text-tiny bg-hover hover:bg-edge-strong text-ink rounded transition-colors"
              >
                Copy Prompt
              </button>
              {isRunning ? (
                <button
                  onClick={() => cancelAi()}
                  className="flex-1 px-3 py-1.5 text-tiny bg-danger hover:bg-danger/85 text-white rounded-md transition-colors"
                >
                  Cancel ({elapsed.toFixed(1)}s)
                </button>
              ) : (
                <button
                  onClick={handleRunAi}
                  className="flex-1 px-3 py-1.5 text-tiny bg-accent hover:bg-accent-hover text-accent-fg rounded transition-colors"
                >
                  Run
                </button>
              )}
            </div>

            {isRunning && reasoning && !result && (
              <div className="text-tiny text-ink-3 bg-raised border border-edge rounded-md px-2 py-1.5 max-h-24 overflow-y-auto">
                <span className="panel-label">Thinking</span>
                <div className="mt-1 whitespace-pre-wrap opacity-80">
                  {reasoning.slice(-400)}
                </div>
              </div>
            )}

            {error && (
              <div className="text-tiny text-danger bg-danger-subtle border border-danger/40 rounded px-2 py-1.5 whitespace-pre-wrap">
                {error}
              </div>
            )}
            {notice && <div className="text-tiny text-success">{notice}</div>}

            {cleanResult && (
              <div className="space-y-2">
                {diff ? (
                  isUnchanged(diff) ? (
                    <div className="text-tiny text-ink-3">
                      No changes suggested — the text already looks right to the model.
                    </div>
                  ) : (
                    <>
                      <div className="text-tiny text-ink-3">Proposed changes:</div>
                      <div className="bg-sunken rounded p-2 font-mono text-tiny max-h-60 overflow-auto">
                        {annotate(collapseUnchanged(diff)).map((line, i) =>
                          "kind" in line ? (
                            // A one-for-one rewrite: show both lines, but tint
                            // only the words that actually differ.
                            <div key={i}>
                              <div className="text-danger">
                                - <WordRun parts={line.before} op="-" />
                              </div>
                              <div className="text-success">
                                + <WordRun parts={line.after} op="+" />
                              </div>
                            </div>
                          ) : line.op === "gap" ? (
                            <div key={i} className="text-ink-3 select-none">
                              ⋯ {line.count} unchanged{" "}
                              {line.count === 1 ? "line" : "lines"}
                            </div>
                          ) : (
                            <div
                              key={i}
                              className={
                                line.op === "+"
                                  ? "text-success"
                                  : line.op === "-"
                                    ? "text-danger"
                                    : "text-ink-3"
                              }
                            >
                              {line.op} {line.text}
                            </div>
                          )
                        )}
                      </div>
                    </>
                  )
                ) : (
                  <>
                    <div className="text-tiny text-ink-3">
                      {selectedSkill.output === "text" ? "Result:" : "Generated LaTeX:"}
                    </div>
                    <pre className="p-2 bg-raised rounded text-tiny text-ink overflow-auto max-h-60 whitespace-pre-wrap">
                      {cleanResult}
                    </pre>
                  </>
                )}

                {staleTarget && (
                  <div className="text-tiny text-warning">
                    You switched files since running this. Apply is disabled so it can't
                    write into the wrong document.
                  </div>
                )}

                <div className="flex gap-2">
                  {selectedSkill.output !== "text" && (
                    <button
                      onClick={handleApply}
                      disabled={staleTarget || (diff !== null && isUnchanged(diff))}
                      className={`flex-1 px-3 py-1.5 text-tiny rounded transition-colors ${
                        staleTarget || (diff !== null && isUnchanged(diff))
                          ? "bg-hover text-ink-3 cursor-not-allowed"
                          : "bg-success hover:bg-success/80 text-accent-fg"
                      }`}
                    >
                      {selectedSkill.output === "insert" ? "Insert at cursor" : "Apply"}
                    </button>
                  )}
                  <button
                    onClick={() => navigator.clipboard.writeText(cleanResult)}
                    className="flex-1 px-3 py-1.5 text-tiny bg-hover hover:bg-edge-strong text-ink rounded transition-colors"
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="px-3 py-2 border-b border-edge">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search skills..."
              className="w-full bg-hover text-ink text-tiny px-2 py-1 rounded border border-edge-strong outline-none focus:border-accent"
            />
          </div>
          <div className="flex gap-1 px-2 py-1.5 border-b border-edge overflow-x-auto">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-2 py-0.5 text-tiny rounded whitespace-nowrap transition-colors ${
                  activeCategory === cat
                    ? "bg-accent text-accent-fg"
                    : "text-ink-2 hover:text-ink hover:bg-hover"
                }`}
              >
                {cat === "all" ? "All" : SKILL_CATEGORIES[cat as SkillCategory]}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="px-3 py-2 border-b border-edge">
              <div className="flex items-center gap-2 text-tiny">
                <span
                  className={`w-2 h-2 rounded-full ${
                    mcp?.running ? "bg-success" : "bg-edge-strong"
                  }`}
                />
                <span className="text-ink-2">MCP server:</span>
                {mcp?.running ? (
                  <span className="text-success font-mono">{mcp.endpoint}</span>
                ) : (
                  <span className="text-ink-3">not running</span>
                )}
              </div>
            </div>
            {filtered.length === 0 ? (
              <div className="px-4 py-4 text-ink-3 text-tiny">No skills match</div>
            ) : (
              filtered.map((skill) => (
                <div
                  key={skill.id}
                  onClick={() => handleSelect(skill)}
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-hover border-b border-edge"
                >
                  <Icon name={skill.icon} size={16} className="text-ink-3" />
                  <div className="flex-1 min-w-0">
                    <div className="text-tiny text-ink">{skill.name}</div>
                    <div className="text-tiny text-ink-3 truncate">{skill.description}</div>
                  </div>
                  <span className="text-tiny text-ink-3">{SKILL_CATEGORIES[skill.category]}</span>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
