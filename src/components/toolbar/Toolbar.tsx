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
import { Icon, type IconName } from "../icons";

interface Props {
  onNewFromTemplate: () => void;
  onOpenPlugins: () => void;
  onOpenSettings: () => void;
  compileRef: React.MutableRefObject<() => void>;
  openProjectRef: React.MutableRefObject<() => void>;
}

export default function Toolbar({ onNewFromTemplate, onOpenPlugins, onOpenSettings, compileRef, openProjectRef }: Props) {
  const {
    projectPath,
    activeFilePath,
    isDirty,
    isCompiling,
    compilers,
    compilersChecked,
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
    setSelectedCompiler,
    setAutoCompile,
  } = useAppStore();

  useEffect(() => {
    // Store setters are stable, so reading them off the store keeps this a
    // genuine run-once effect without lying to the deps linter.
    checkCompilers().then((found) => {
      const state = useAppStore.getState();
      state.setCompilers(found);
      if (found.length > 0 && !state.selectedCompiler) {
        state.setSelectedCompiler(found[0]);
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
  useEffect(() => { openProjectRef.current = handleOpenProject; }, [handleOpenProject, openProjectRef]);

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

  const fileName = activeFilePath?.split("/").pop();
  // Detection has run and turned up nothing — typesetting is impossible.
  const noCompiler = compilersChecked && compilers.length === 0;

  return (
    <header className="flex items-center gap-2 px-3 h-12 shrink-0 bg-raised border-b border-edge">
      {/* Identity: the document is the subject, so it gets the serif treatment. */}
      <div className="flex items-baseline gap-2 min-w-0 shrink pr-2">
        {projectPath ? (
          <>
            <span className="font-serif text-title text-ink truncate max-w-[220px]">
              {projectPath.split("/").pop()}
            </span>
            {fileName && (
              <>
                <span className="text-ink-3 select-none">›</span>
                <span className="text-tiny text-ink-2 font-mono truncate max-w-[200px]">
                  {fileName}
                </span>
              </>
            )}
            {isDirty && activeFilePath && (
              <span
                title="Unsaved changes"
                className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 self-center"
              />
            )}
          </>
        ) : (
          <span className="font-serif text-title text-ink-3">No project open</span>
        )}
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-1 shrink-0">
        <ToolbarButton onClick={handleOpenProject} icon="folder-open" label="Open project" />
        {projectPath && (
          <ToolbarButton onClick={onNewFromTemplate} icon="template" label="New from template" />
        )}
        <ToolbarButton onClick={onOpenPlugins} icon="plug" label="Plugins" />
        <ToolbarButton onClick={onOpenSettings} icon="settings" label="Settings" />
      </div>

      <div className="w-px h-5 bg-edge mx-1.5 shrink-0" />

      {compilers.length > 0 && (
        <select
          value={selectedCompiler}
          onChange={(e) => setSelectedCompiler(e.target.value)}
          title="LaTeX compiler"
          className="bg-base text-ink-2 text-tiny font-mono px-2 h-7 rounded-md border border-edge hover:border-edge-strong cursor-pointer transition-colors shrink-0"
        >
          {compilers.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      )}

      <label
        title="Recompile automatically after each save"
        className={`flex items-center gap-1.5 text-tiny h-7 px-2 rounded-md border cursor-pointer transition-colors shrink-0 ${
          autoCompile
            ? "text-accent border-accent/40 bg-accent-subtle"
            : "text-ink-3 border-edge hover:text-ink-2 hover:border-edge-strong"
        }`}
      >
        <input
          type="checkbox"
          checked={autoCompile}
          onChange={(e) => setAutoCompile(e.target.checked)}
          className="sr-only"
        />
        <Icon name={autoCompile ? "check" : "refresh"} size={13} />
        Auto
      </label>

      <button
        onClick={handleCompile}
        disabled={!activeFilePath || isCompiling || noCompiler}
        title={
          noCompiler
            ? "No LaTeX distribution found — install TeX Live, MacTeX or MiKTeX"
            : "Typeset (Cmd+Enter)"
        }
        className={`flex items-center gap-1.5 h-7 px-3 text-tiny font-medium rounded-md transition-colors shrink-0 ${
          !activeFilePath || isCompiling || noCompiler
            ? "bg-hover text-ink-3 cursor-not-allowed"
            : "bg-accent hover:bg-accent-hover text-accent-fg"
        }`}
      >
        {isCompiling ? (
          <>
            <span className="animate-spin inline-block w-3 h-3 border-[1.5px] border-current/30 border-t-current rounded-full" />
            Typesetting
          </>
        ) : (
          <>
            <Icon name="play" size={12} />
            Typeset
          </>
        )}
      </button>
    </header>
  );
}

function ToolbarButton({
  onClick,
  icon,
  label,
}: {
  onClick: () => void;
  icon: IconName;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="grid place-items-center w-7 h-7 rounded-md text-ink-2 hover:text-ink hover:bg-hover transition-colors"
    >
      <Icon name={icon} size={16} />
    </button>
  );
}
