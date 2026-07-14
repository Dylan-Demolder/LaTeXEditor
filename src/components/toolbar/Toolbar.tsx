import { useEffect, useCallback } from "react";
import { useAppStore } from "../../stores/useAppStore";
import {
  openProject,
  compileLatex,
  checkCompilers,
  setMcpProject,
  findRootFile,
} from "../../hooks/useTauriCommands";
import { open } from "@tauri-apps/plugin-dialog";

interface Props {
  onNewFromTemplate: () => void;
  onOpenPlugins: () => void;
  onOpenSettings: () => void;
  compileRef: React.MutableRefObject<() => void>;
}

export default function Toolbar({ onNewFromTemplate, onOpenPlugins, onOpenSettings, compileRef }: Props) {
  const {
    projectPath,
    activeFilePath,
    isDirty,
    isCompiling,
    compilers,
    selectedCompiler,
    autoCompile,
    setProjectPath,
    setPdfPath,
    setFiles,
    setCompileErrors,
    setCompileWarnings,
    setCompileBadboxes,
    setCompileMessage,
    setIsCompiling,
    setCompilers,
    setSelectedCompiler,
    setAutoCompile,
  } = useAppStore();

  useEffect(() => {
    checkCompilers().then((found) => {
      setCompilers(found);
      const state = useAppStore.getState();
      if (found.length > 0 && !state.selectedCompiler) {
        setSelectedCompiler(found[0]);
      }
    });
  }, []);

  useEffect(() => {
    if (projectPath) {
      setMcpProject(projectPath, activeFilePath);
    }
  }, [projectPath, activeFilePath]);

  const handleOpenProject = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Open LaTeX Project",
      });
      if (selected && typeof selected === "string") {
        const result = await openProject(selected);
        setProjectPath(result.root);
        setFiles(result.files);
        setMcpProject(result.root, null);
      }
    } catch (e) {
      console.error("Failed to open project:", e);
    }
  }, [setProjectPath, setFiles]);

  const handleCompile = useCallback(async () => {
    if (!activeFilePath) return;

    let texFile = activeFilePath;

    // Smart compile: find root .tex file (the one with \documentclass)
    if (projectPath) {
      try {
        const root = await findRootFile(projectPath);
        if (root) texFile = root;
      } catch {}
    }

    const outDir = projectPath
      ? `${projectPath}/build`
      : texFile.substring(0, texFile.lastIndexOf("/")) + "/build";

    setIsCompiling(true);
    setCompileMessage("Compiling...");

    try {
      const result = await compileLatex(
        texFile,
        outDir,
        selectedCompiler || undefined
      );

      setCompileErrors(result.errors);
      setCompileWarnings(result.warnings);
      setCompileBadboxes(result.badboxes);
      setCompileMessage(result.message);

      if (result.success && result.pdf_path) {
        setPdfPath(result.pdf_path);
      } else {
        setPdfPath(null);
      }
    } catch (e) {
      setCompileMessage(`Compilation error: ${e}`);
      setCompileErrors([]);
      setCompileWarnings([]);
    } finally {
      setIsCompiling(false);
    }
  }, [
    activeFilePath,
    projectPath,
    selectedCompiler,
    setIsCompiling,
    setCompileMessage,
    setCompileErrors,
    setCompileWarnings,
    setCompileBadboxes,
    setPdfPath,
  ]);

  useEffect(() => { compileRef.current = handleCompile; }, [handleCompile, compileRef]);

  const handleKeyboardCompile = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleCompile();
      }
    },
    [handleCompile]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyboardCompile);
    return () => window.removeEventListener("keydown", handleKeyboardCompile);
  }, [handleKeyboardCompile]);

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-gray-800 border-b border-gray-700">
      <button
        onClick={handleOpenProject}
        className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors"
      >
        Open Project
      </button>

      {projectPath && (
        <>
          <span className="text-xs text-gray-500 truncate max-w-[200px]">
            {projectPath.split("/").pop()}
          </span>
          <button
            onClick={onNewFromTemplate}
            className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors"
          >
            New from Template
          </button>
        </>
      )}

      <div className="flex-1" />

      <button
        onClick={onOpenPlugins}
        className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors"
      >
        Plugins
      </button>

      <button
        onClick={onOpenSettings}
        className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors"
      >
        Settings
      </button>

      {compilers.length > 0 && (
        <select
          value={selectedCompiler}
          onChange={(e) => setSelectedCompiler(e.target.value)}
          className="bg-gray-700 text-gray-300 text-xs px-2 py-1 rounded"
        >
          {compilers.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      )}

      <label className="flex items-center gap-1.5 text-xs text-gray-400">
        <input
          type="checkbox"
          checked={autoCompile}
          onChange={(e) => setAutoCompile(e.target.checked)}
          className="w-3 h-3"
        />
        Auto
      </label>

      <button
        onClick={handleCompile}
        disabled={!activeFilePath || isCompiling}
        className={`px-4 py-1 text-xs font-medium rounded transition-colors ${
          !activeFilePath || isCompiling
            ? "bg-gray-700 text-gray-500 cursor-not-allowed"
            : "bg-blue-600 hover:bg-blue-500 text-white"
        }`}
      >
        {isCompiling ? (
          <span className="flex items-center gap-1">
            <span className="animate-spin inline-block w-3 h-3 border border-white/30 border-t-white rounded-full" />
            Compiling
          </span>
        ) : (
          "Compile"
        )}
      </button>

      {isDirty && activeFilePath && (
        <span className="text-xs text-yellow-500">Unsaved</span>
      )}
    </div>
  );
}
