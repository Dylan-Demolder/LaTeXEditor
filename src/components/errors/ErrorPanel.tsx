import { useAppStore } from "../../stores/useAppStore";
import { readFile } from "../../hooks/useTauriCommands";
import { goToLine } from "../editor/editor-bridge";
import { Icon, type IconName } from "../icons";
import type { LaTeXError } from "../../types";

interface Props {
  onHide?: () => void;
}

export default function ErrorPanel({ onHide }: Props) {
  const {
    compileErrors,
    compileWarnings,
    compileBadboxes,
    compileMessage,
    projectPath,
    activeFilePath,
    setActiveFile,
    setActiveFileContent,
  } = useAppStore();

  const handleJumpToError = async (err: LaTeXError) => {
    if (!err.file || err.line === 0) return;

    // The log parser reports a bare filename ("paper.tex"), which readFile
    // cannot open — it resolved against the app's working directory, threw,
    // and the catch below swallowed it, so clicking a row silently did
    // nothing. Resolve against the project root, and fall back to the file
    // already open when there is no project.
    const path = err.file.startsWith("/")
      ? err.file
      : projectPath
        ? `${projectPath}/${err.file}`
        : activeFilePath ?? err.file;

    try {
      const content = await readFile(path);
      setActiveFile(path);
      setActiveFileContent(content);

      // Let the editor swap models to the newly-opened file before seeking.
      setTimeout(() => goToLine(err.line), 100);
    } catch (e) {
      console.error("Failed to open file for error:", e);
    }
  };

  const severityStyles = (severity: string) =>
    severity === "error"
      ? { row: "hover:bg-danger-subtle", icon: "text-danger", text: "text-ink" }
      : severity === "warning"
        ? { row: "hover:bg-warning-subtle", icon: "text-warning", text: "text-ink" }
        : { row: "hover:bg-hover", icon: "text-info", text: "text-ink-2" };

  const totalIssues = compileErrors.length + compileWarnings.length + compileBadboxes.length;

  return (
    <div className="h-full w-full flex flex-col bg-base">
      <div className="flex items-center justify-between pl-3 pr-1.5 h-8 shrink-0 border-b border-edge">
        <div className="flex items-center gap-2">
          <span className="panel-label">Issues</span>
          {totalIssues > 0 && (
            <span className="text-micro text-ink-3 tabular-nums">{totalIssues}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {compileMessage && (
            <span
              className={`text-tiny ${
                compileErrors.length > 0 ? "text-danger" : "text-success"
              }`}
            >
              {compileMessage}
            </span>
          )}
          {onHide && (
            <button
              onClick={onHide}
              title="Hide issues panel"
              className="grid place-items-center w-6 h-6 rounded text-ink-3 hover:text-ink hover:bg-hover transition-colors"
            >
              <Icon name="close" size={14} />
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {totalIssues === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 py-8 text-ink-3">
            <Icon name="check" size={20} className="text-success" />
            <span className="text-tiny">
              {compileMessage || "No issues. Typeset to check your document."}
            </span>
          </div>
        ) : (
          <>
            {[
              ...compileErrors.map((e) => ({ e, severity: "error" as const, clickable: true })),
              ...compileWarnings.map((e) => ({ e, severity: "warning" as const, clickable: true })),
              ...compileBadboxes.map((e) => ({ e, severity: "info" as const, clickable: false })),
            ].map(({ e, severity, clickable }, i) => {
              const style = severityStyles(severity);
              const icon: IconName =
                severity === "error"
                  ? "alert-circle"
                  : severity === "warning"
                    ? "alert-triangle"
                    : "box";
              return (
                <div
                  key={`${severity}-${i}`}
                  onClick={clickable ? () => handleJumpToError(e) : undefined}
                  className={`flex items-start gap-2.5 px-3 py-2 border-b border-edge/60 transition-colors ${style.row} ${
                    clickable ? "cursor-pointer" : ""
                  }`}
                >
                  <Icon name={icon} size={14} className={`${style.icon} mt-0.5`} />
                  <div className="flex-1 min-w-0">
                    <div className={`text-tiny ${style.text}`}>{e.message}</div>
                    {e.context && (
                      <div className="text-tiny text-ink-3 font-mono mt-1 truncate">
                        {e.context}
                      </div>
                    )}
                    <div className="text-micro text-ink-3 mt-1 tabular-nums">
                      {e.file ? `${e.file.split("/").pop()}:${e.line}` : `line ${e.line}`}
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
