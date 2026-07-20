import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from "react";
import { useAppStore } from "../../stores/useAppStore";
import { cancelAi } from "../../hooks/useTauriCommands";
import { runSkill, missingKeyReason, type RunEnvironment } from "../../lib/ai-runner";
import { inlineEditSkill, aiSkills } from "../../data/ai-skills";
import { replaceRange, highlightRange, type EditorSelection } from "./editor-bridge";
import { lineDiff, collapseUnchanged, isUnchanged } from "../../lib/line-diff";
import { annotate, type WordPart } from "../../lib/word-diff";
import { stripCodeFence } from "../../lib/ai-output";
import { Icon } from "../icons";

/**
 * The inline Cmd+K surface.
 *
 * The AI panel works, but every edit costs a trip to the far side of the
 * window: open the panel, find the skill, click Run, read a diff in a narrow
 * column, click Apply, click Back. This is the same loop with the travel
 * removed — it opens where the cursor already is, and accept/reject are keys
 * rather than buttons.
 */

/** Rewrite presets worth one click; the rest stay in the panel. */
const QUICK_SKILL_IDS = ["proofread-section", "tighten-to-length", "fix-errors"] as const;

export interface InlineTarget {
  selection: EditorSelection;
  /** Pixels from the container top to just below the selection's last line. */
  below: number;
  /** Pixels from the container top to the selection's first line. */
  above: number;
}

interface Props {
  target: InlineTarget;
  onClose: () => void;
}

function WordRun({ parts, op }: { parts: WordPart[]; op: "+" | "-" }) {
  return (
    <>
      {parts.map((part, i) =>
        part.op === " " ? (
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

export default function InlineAssist({ target, onClose }: Props) {
  const { activeFileContent, activeFilePath, projectPath, files, compileErrors } = useAppStore();
  const [instruction, setInstruction] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const startedAt = useRef(0);
  const cardRef = useRef<HTMLDivElement>(null);
  /**
   * Flip above the target when the card would otherwise run off the bottom.
   *
   * Anchoring below the selection is right most of the time, but a paragraph
   * near the foot of the viewport pushed the whole diff — and the Accept
   * button — past the bottom edge, where it could not be read or reached.
   */
  const [flipped, setFlipped] = useState(false);

  // The range is captured once, when the card opens. Everything below writes to
  // this snapshot — never to wherever the cursor has since wandered.
  const range = target.selection.range;
  const sourceText = target.selection.text;
  const capturedPath = useRef(activeFilePath);

  const env = useMemo<RunEnvironment>(
    () => ({ activeFileContent, activeFilePath, projectPath, files, compileErrors }),
    [activeFileContent, activeFilePath, projectPath, files, compileErrors]
  );

  useEffect(() => inputRef.current?.focus(), []);

  /**
   * Escape has to work from anywhere, not just from inside the card.
   *
   * Bound only to the card's own onKeyDown, one click into the editor left the
   * card open with no way to dismiss it — the keystroke went to Monaco and the
   * card just sat there. A window-level listener in the capture phase gets it
   * first wherever focus happens to be.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      if (isRunning) cancelAi();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [isRunning, onClose]);

  // Outline what is in scope, so the card never acts on more than you expect.
  useEffect(() => highlightRange(range), [range]);

  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(
      () => setElapsed(Math.round((Date.now() - startedAt.current) / 100) / 10),
      100
    );
    return () => clearInterval(id);
  }, [isRunning]);

  // Re-measured whenever the card grows — a diff arriving can turn a card that
  // fitted below into one that does not.
  useLayoutEffect(() => {
    const card = cardRef.current;
    const container = card?.offsetParent as HTMLElement | null;
    if (!card || !container) return;
    const height = card.offsetHeight;
    const fitsBelow = target.below + height <= container.clientHeight;
    const fitsAbove = target.above - height >= 0;
    setFlipped(!fitsBelow && fitsAbove);
  }, [target.below, target.above, result, error, isRunning]);

  const cleanResult = useMemo(() => (result ? stripCodeFence(result) : null), [result]);

  const diff = useMemo(() => {
    if (isRunning || !cleanResult) return null;
    return lineDiff(sourceText, cleanResult);
  }, [isRunning, cleanResult, sourceText]);

  const run = useCallback(
    async (skillId: string | null, text: string) => {
      const skill = skillId ? aiSkills.find((s) => s.id === skillId) ?? inlineEditSkill : inlineEditSkill;
      if (skill === inlineEditSkill && !text.trim()) return;

      const missing = await missingKeyReason();
      if (missing) {
        setError(`${missing} Open Settings to add a key.`);
        return;
      }

      setError(null);
      setResult(null);
      setIsRunning(true);
      setElapsed(0);
      startedAt.current = Date.now();

      try {
        const { content } = await runSkill(
          skill,
          sourceText,
          {},
          env,
          { onChunk: (chunk) => setResult((prev) => (prev ?? "") + chunk) },
          skill === inlineEditSkill ? text : text.trim() || undefined
        );
        setResult(content);
      } catch (e) {
        setError(String(e));
        setResult(null);
      } finally {
        setIsRunning(false);
      }
    },
    [sourceText, env]
  );

  const accept = useCallback(() => {
    if (!cleanResult) return;
    // Switching files mid-run would make this write into the wrong document.
    if (capturedPath.current !== activeFilePath) {
      setError("You switched files — this edit was not applied.");
      return;
    }
    replaceRange(range, cleanResult);
    onClose();
  }, [cleanResult, range, activeFilePath, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (isRunning) cancelAi();
        onClose();
        return;
      }
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (cleanResult) accept();
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        // After a result, Enter means "refine": run again with the new
        // instruction against the *original* text, so refinements do not
        // compound edits on top of edits.
        run(null, instruction);
      }
    },
    [isRunning, cleanResult, accept, onClose, run, instruction]
  );

  const unchanged = diff !== null && isUnchanged(diff);

  return (
    <div
      className="absolute left-12 right-6 z-20"
      style={
        flipped
          ? { top: target.above, transform: "translateY(-100%)" }
          : { top: target.below }
      }
      onKeyDown={handleKeyDown}
    >
      <div
        ref={cardRef}
        className="rounded-lg border border-edge-strong bg-raised shadow-xl overflow-hidden"
      >
        <div className="flex items-center gap-2 px-2.5 py-2">
          <Icon name="sparkle" size={14} className="text-accent shrink-0" />
          <input
            ref={inputRef}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder={
              cleanResult
                ? "Refine — e.g. shorter, less formal…"
                : "Tell the AI what to change…"
            }
            className="flex-1 bg-transparent text-tiny text-ink outline-none placeholder:text-ink-3"
          />
          <span className="text-tiny text-ink-3 shrink-0">
            {target.selection.lineCount} {target.selection.lineCount === 1 ? "line" : "lines"}
          </span>
          {isRunning ? (
            <button
              onClick={() => cancelAi()}
              className="text-tiny px-2 py-0.5 rounded bg-danger text-white shrink-0"
            >
              Stop {elapsed.toFixed(1)}s
            </button>
          ) : (
            <button
              onClick={() => run(null, instruction)}
              disabled={!instruction.trim() && !cleanResult}
              className="text-tiny px-2 py-0.5 rounded bg-accent text-accent-fg disabled:opacity-40 shrink-0"
            >
              {cleanResult ? "Refine" : "Go"}
            </button>
          )}
          {/* A visible way out. Esc does the same, but a card with no close
              control reads as something you are stuck in. */}
          <button
            onClick={onClose}
            title="Close (Esc)"
            className="grid place-items-center w-5 h-5 rounded text-ink-3 hover:text-ink hover:bg-hover shrink-0 transition-colors"
          >
            <Icon name="close" size={12} />
          </button>
        </div>

        {/* One-click presets, so the common edits need no typing at all. */}
        {!cleanResult && !isRunning && (
          <div className="flex items-center gap-1 px-2.5 pb-2 flex-wrap">
            {QUICK_SKILL_IDS.map((id) => {
              const skill = aiSkills.find((s) => s.id === id);
              if (!skill) return null;
              return (
                <button
                  key={id}
                  onClick={() => run(id, instruction)}
                  className="text-tiny px-2 py-0.5 rounded bg-hover hover:bg-edge-strong text-ink-2"
                >
                  {skill.name}
                </button>
              );
            })}
            <span className="flex-1" />
            <span className="text-tiny text-ink-3">Esc to close</span>
          </div>
        )}

        {error && (
          <div className="text-tiny text-danger bg-danger-subtle border-t border-danger/40 px-2.5 py-1.5 whitespace-pre-wrap">
            {error}
          </div>
        )}

        {isRunning && result && (
          <pre className="text-tiny text-ink-2 font-mono px-2.5 py-2 border-t border-edge max-h-40 overflow-auto whitespace-pre-wrap">
            {result}
          </pre>
        )}

        {!isRunning && cleanResult && (
          <>
            {unchanged ? (
              <div className="text-tiny text-ink-3 px-2.5 py-2 border-t border-edge">
                No changes suggested.
              </div>
            ) : (
              <div className="font-mono text-tiny px-2.5 py-2 border-t border-edge max-h-52 overflow-auto">
                {diff &&
                  annotate(collapseUnchanged(diff)).map((line, i) =>
                    "kind" in line ? (
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
                        ⋯ {line.count} unchanged {line.count === 1 ? "line" : "lines"}
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
            )}

            <div className="flex items-center gap-2 px-2.5 py-1.5 border-t border-edge bg-sunken">
              <button
                onClick={accept}
                disabled={unchanged}
                className="text-tiny px-2 py-0.5 rounded bg-success text-accent-fg disabled:opacity-40"
              >
                Accept
              </button>
              <span className="text-tiny text-ink-3">⌘↵</span>
              <button
                onClick={onClose}
                className="text-tiny px-2 py-0.5 rounded bg-hover text-ink-2"
              >
                Discard
              </button>
              <span className="text-tiny text-ink-3">Esc</span>
              <span className="flex-1" />
              <span className="text-tiny text-ink-3">Enter to refine</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
