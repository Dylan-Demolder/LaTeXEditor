import { useAppStore } from "../../stores/useAppStore";
import { readFile } from "../../hooks/useTauriCommands";
import type { LaTeXError } from "../../types";

export default function ErrorPanel() {
  const {
    compileErrors,
    compileWarnings,
    compileBadboxes,
    compileMessage,
    setActiveFile,
    setActiveFileContent,
  } = useAppStore();

  const handleJumpToError = async (err: LaTeXError) => {
    if (!err.file || err.line === 0) return;
    try {
      const content = await readFile(err.file);
      setActiveFile(err.file);
      setActiveFileContent(content);

      // Navigate to the error line in the editor
      setTimeout(() => {
        const editors = (window as any).monaco?.editor?.getEditors?.();
        if (editors?.length > 0) {
          editors[0].revealLineInCenter(err.line);
          editors[0].setPosition({ lineNumber: err.line, column: 1 });
          editors[0].focus();
        }
      }, 100);
    } catch (e) {
      console.error("Failed to open file for error:", e);
    }
  };

  const severityBg = (severity: string) => {
    switch (severity) {
      case "error":
        return "bg-red-900/30 border-red-700";
      case "warning":
        return "bg-yellow-900/20 border-yellow-700";
      default:
        return "bg-blue-900/20 border-blue-700";
    }
  };

  const severityIcon = (severity: string) => {
    switch (severity) {
      case "error":
        return "✗";
      case "warning":
        return "⚠";
      default:
        return "ℹ";
    }
  };

  const severityColor = (severity: string) => {
    switch (severity) {
      case "error":
        return "text-red-400";
      case "warning":
        return "text-yellow-400";
      default:
        return "text-blue-400";
    }
  };

  const totalIssues = compileErrors.length + compileWarnings.length + compileBadboxes.length;

  return (
    <div className="h-full w-full flex flex-col bg-gray-850">
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800 border-b border-gray-700 text-gray-300 text-xs">
        <span>
          Issues{" "}
          {totalIssues > 0 && (
            <span className="text-gray-500">({totalIssues})</span>
          )}
        </span>
        {compileMessage && (
          <span
            className={`text-xs ${
              compileErrors.length > 0 ? "text-red-400" : "text-green-400"
            }`}
          >
            {compileMessage}
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {totalIssues === 0 ? (
          <div className="px-4 py-4 text-gray-500 text-xs">
            {compileMessage || "No issues found. Compile to check for errors."}
          </div>
        ) : (
          <>
            {compileErrors.map((err, i) => (
              <div
                key={`err-${i}`}
                className={`border-b border-gray-700/50 px-3 py-2 cursor-pointer hover:opacity-80 ${severityBg(
                  "error"
                )}`}
                onClick={() => handleJumpToError(err)}
              >
                <div className="flex items-start gap-2">
                  <span className={severityColor("error") + " text-xs mt-0.5"}>
                    {severityIcon("error")}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-red-300 text-xs">{err.message}</div>
                    {err.context && (
                      <div className="text-gray-500 text-xs mt-0.5 line-clamp-2">
                        {err.context}
                      </div>
                    )}
                    <div className="text-gray-600 text-xs mt-0.5">
                      Line {err.line}
                      {err.file && ` • ${err.file.split("/").pop()}`}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {compileWarnings.map((warn, i) => (
              <div
                key={`warn-${i}`}
                className={`border-b border-gray-700/50 px-3 py-2 cursor-pointer hover:opacity-80 ${severityBg(
                  "warning"
                )}`}
                onClick={() => handleJumpToError(warn)}
              >
                <div className="flex items-start gap-2">
                  <span className={severityColor("warning") + " text-xs mt-0.5"}>
                    {severityIcon("warning")}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-yellow-300 text-xs">{warn.message}</div>
                    <div className="text-gray-600 text-xs mt-0.5">
                      Line {warn.line}
                      {warn.file && ` • ${warn.file.split("/").pop()}`}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {compileBadboxes.map((bb, i) => (
              <div
                key={`bb-${i}`}
                className={`border-b border-gray-700/50 px-3 py-2 ${severityBg(
                  "warning"
                )}`}
              >
                <div className="flex items-start gap-2">
                  <span className={severityColor("warning") + " text-xs mt-0.5"}>
                    ▢
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-yellow-300/70 text-xs">{bb.message}</div>
                    <div className="text-gray-600 text-xs mt-0.5">
                      Line {bb.line}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
