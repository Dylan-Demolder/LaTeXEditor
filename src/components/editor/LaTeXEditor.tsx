import Editor, { loader } from "@monaco-editor/react";
import { useCallback, useRef, useEffect } from "react";
import { useAppStore } from "../../stores/useAppStore";
import { writeFile } from "../../hooks/useTauriCommands";

loader.config({
  paths: {
    vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs",
  },
});

export default function LaTeXEditor() {
  const { activeFilePath, activeFileContent, setActiveFileContent, setIsDirty } =
    useAppStore();
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef(activeFileContent);

  useEffect(() => {
    contentRef.current = activeFileContent;
  }, [activeFileContent]);

  const handleChange = useCallback(
    (value: string | undefined) => {
      const content = value || "";
      setActiveFileContent(content);
      setIsDirty(true);

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      if (activeFilePath) {
        saveTimeoutRef.current = setTimeout(async () => {
          try {
            await writeFile(activeFilePath, content);
            setIsDirty(false);
          } catch (e) {
            console.error("Failed to save:", e);
          }
        }, 1000);
      }
    },
    [activeFilePath, setActiveFileContent, setIsDirty]
  );

  const handleSave = useCallback(() => {
    if (activeFilePath && saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      writeFile(activeFilePath, activeFileContent)
        .then(() => setIsDirty(false))
        .catch((e) => console.error("Failed to save:", e));
    }
  }, [activeFilePath, activeFileContent, setIsDirty]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave]);

  return (
    <div className="h-full w-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800 border-b border-gray-700 text-gray-300 text-xs">
        <span className="truncate">
          {activeFilePath
            ? activeFilePath.split("/").pop() || "Untitled"
            : "No file open"}
        </span>
        <span className="text-gray-500">LaTeX</span>
      </div>
      <div className="flex-1">
        <Editor
          height="100%"
          language="latex"
          theme="vs-dark"
          value={activeFileContent}
          onChange={handleChange}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: "on",
            wordWrap: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            bracketPairColorization: { enabled: true },
            matchBrackets: "always",
            autoClosingBrackets: "always",
            suggest: {
              showWords: true,
              showSnippets: true,
            },
          }}
        />
      </div>
    </div>
  );
}
