import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import FileTree from "../file-tree/FileTree";
import LaTeXEditor from "../editor/LaTeXEditor";
import PDFPreview from "../preview/PDFPreview";
import ErrorPanel from "../errors/ErrorPanel";
import Toolbar from "../toolbar/Toolbar";
import NoCompilerNotice from "../toolbar/NoCompilerNotice";
import ComponentLibrary from "../component-library/ComponentLibrary";
import TemplateGallery from "../templates/TemplateGallery";
import AISkillsPanel from "../ai-skills/AISkillsPanel";
import PluginManager from "../plugin-manager/PluginManager";
import SettingsPanel from "../settings/SettingsPanel";
import { openTutorial, openGuide } from "../../hooks/useTauriCommands";
import { openProjectAt } from "../../lib/open-project";
import GitPanel from "../git/GitPanel";
import OutlinePanel from "../outline/OutlinePanel";
import CommandPalette, { type PaletteHandlers } from "../palette/CommandPalette";
import ShortcutsHelp from "../shortcuts/ShortcutsHelp";
import { useAppStore } from "../../stores/useAppStore";
import { Icon, type IconName } from "../icons";

// "errors" is not a tab here — issues live in the bottom panel, which is always
// visible when there is something to report.
type Panel = "files" | "components" | "skills" | "git" | "outline";

const EDITOR_MIN_WIDTH = 320;
const PREVIEW_MIN_WIDTH = 240;

const PANELS: Record<Panel, { label: string; icon: IconName }> = {
  files: { label: "Files", icon: "folder" },
  components: { label: "Components", icon: "grid" },
  skills: { label: "AI", icon: "sparkle" },
  git: { label: "Git", icon: "git-branch" },
  outline: { label: "Outline", icon: "list" },
};

export default function MainLayout() {
  const [leftPanel, setLeftPanel] = useState<Panel>("files");
  const [rightWidth, setRightWidth] = useState(500);
  const [bottomHeight, setBottomHeight] = useState(200);
  const [leftWidth, setLeftWidth] = useState(260);
  const isDraggingRight = useRef(false);
  const isDraggingBottom = useRef(false);
  const isDraggingLeft = useRef(false);
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showBottomPanel, setShowBottomPanel] = useState(true);
  const [showPreview, setShowPreview] = useState(true);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showPlugins, setShowPlugins] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const compileRef = useRef<() => void>(() => {});
  const saveRef = useRef<() => void>(() => {});
  const openProjectRef = useRef<() => void>(() => {});

  const totalIssues = useAppStore(
    (s) => s.compileErrors.length + s.compileWarnings.length + s.compileBadboxes.length
  );

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDraggingRight.current) {
      // The splitter sits to the left of the preview, so the preview's width is
      // the distance from the pointer to the right edge — not e.clientX.
      const maxPreview = window.innerWidth - EDITOR_MIN_WIDTH;
      setRightWidth(
        Math.max(PREVIEW_MIN_WIDTH, Math.min(maxPreview, window.innerWidth - e.clientX))
      );
    }
    if (isDraggingBottom.current) {
      const parent = document.querySelector(".editor-preview-container");
      if (parent) {
        const rect = parent.getBoundingClientRect();
        setBottomHeight(Math.max(100, Math.min(rect.height - 200, rect.bottom - e.clientY)));
      }
    }
    if (isDraggingLeft.current)
      setLeftWidth(Math.max(180, Math.min(500, e.clientX)));
  }, []);

  const handleMouseUp = useCallback(() => {
    isDraggingRight.current = false;
    isDraggingBottom.current = false;
    isDraggingLeft.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  useEffect(() => {
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // Panels keep fixed pixel widths, so a narrow window can squeeze the editor
  // down to nothing. Give it a floor and shrink the preview instead.
  useEffect(() => {
    const clamp = () => {
      const sidebar = showLeftPanel ? leftWidth : 0;
      const maxPreview = window.innerWidth - sidebar - EDITOR_MIN_WIDTH;
      setRightWidth((w) => Math.max(PREVIEW_MIN_WIDTH, Math.min(w, maxPreview)));
    };
    clamp();
    window.addEventListener("resize", clamp);
    return () => window.removeEventListener("resize", clamp);
  }, [showLeftPanel, leftWidth]);

  useEffect(() => {
    // ⌘K is a chord prefix: the next key completes it. Track it with a flag
    // that expires, rather than a listener that swallows whatever comes next.
    let chordPending = false;
    let chordTimer: ReturnType<typeof setTimeout> | null = null;

    const kbd = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      if (chordPending) {
        chordPending = false;
        if (chordTimer) clearTimeout(chordTimer);
        if (e.key.toLowerCase() === "s") {
          e.preventDefault();
          setShowShortcuts((s) => !s);
          return;
        }
      }

      if (mod && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setShowPalette((s) => !s);
        return;
      }

      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        chordPending = true;
        chordTimer = setTimeout(() => { chordPending = false; }, 2000);
        return;
      }

      if (e.key === "Escape") {
        setShowPalette(false);
        setShowShortcuts(false);
      }
    };

    window.addEventListener("keydown", kbd);
    return () => {
      window.removeEventListener("keydown", kbd);
      if (chordTimer) clearTimeout(chordTimer);
    };
  }, []);

  const paletteHandlers: PaletteHandlers = useMemo(
    () => ({
      compile: () => compileRef.current?.(),
      save: () => saveRef.current?.(),
      openProject: () => openProjectRef.current?.(),
      newFromTemplate: () => setShowTemplates(true),
      toggleFilesPanel: () => setShowLeftPanel((s) => !s),
      togglePreview: () => setShowPreview((s) => !s),
      toggleIssuesPanel: () => setShowBottomPanel((s) => !s),
      showOutline: () => { setShowLeftPanel(true); setLeftPanel("outline"); },
      showComponents: () => { setShowLeftPanel(true); setLeftPanel("components"); },
      showSettings: () => setShowSettings(true),
      showPlugins: () => setShowPlugins(true),
      openTutorial: () => {
        openTutorial(false).then((dir) => openProjectAt(dir, "main.tex"));
      },
      restartTutorial: () => {
        openTutorial(true).then((dir) => openProjectAt(dir, "main.tex"));
      },
      openGuide: () => {
        openGuide().then((dir) => openProjectAt(dir, "main.tex"));
      },
    }),
    []
  );

  return (
    <div className="h-screen w-screen flex flex-col bg-base text-ink overflow-hidden">
      <Toolbar
        onNewFromTemplate={() => setShowTemplates(true)}
        onOpenPlugins={() => setShowPlugins(true)}
        onOpenSettings={() => setShowSettings(true)}
        compileRef={compileRef}
        openProjectRef={openProjectRef}
      />

      <NoCompilerNotice />

      <div className="flex-1 flex overflow-hidden">
        {showLeftPanel && (
          <>
            <div className="h-full flex flex-col" style={{ width: leftWidth }}>
              {/* Icon rail: labels wouldn't fit five tabs at 260px without
                  truncating ("Comp"), so the icon carries it and the tooltip
                  and active label do the naming. */}
              <div className="flex items-center gap-0.5 px-1.5 h-9 shrink-0 border-b border-edge bg-raised">
                {(Object.keys(PANELS) as Panel[]).map((panel) => {
                  const active = leftPanel === panel;
                  return (
                    <button
                      key={panel}
                      onClick={() => setLeftPanel(panel)}
                      title={PANELS[panel].label}
                      aria-label={PANELS[panel].label}
                      aria-pressed={active}
                      className={`flex items-center gap-1.5 h-7 rounded-md transition-colors ${
                        active
                          ? "bg-accent-subtle text-accent px-2"
                          : "text-ink-3 hover:text-ink-2 hover:bg-hover px-1.5"
                      }`}
                    >
                      <Icon name={PANELS[panel].icon} size={15} />
                      {active && (
                        <span className="text-micro font-semibold tracking-wide">
                          {PANELS[panel].label}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="flex-1 overflow-hidden">
                {leftPanel === "files" && <FileTree />}
                {leftPanel === "components" && <ComponentLibrary />}
                {leftPanel === "skills" && <AISkillsPanel />}
                {leftPanel === "git" && <GitPanel />}
                {leftPanel === "outline" && <OutlinePanel />}
              </div>
            </div>
            <div
              className="w-px bg-edge-strong hover:bg-accent cursor-col-resize shrink-0 transition-colors relative after:absolute after:inset-y-0 after:-left-1.5 after:-right-1.5 after:content-[''] z-10"
              onMouseDown={(e) => {
                isDraggingLeft.current = true;
                document.body.style.cursor = "col-resize";
                document.body.style.userSelect = "none";
                e.preventDefault();
              }}
            />
          </>
        )}

        <button
          onClick={() => setShowLeftPanel(!showLeftPanel)}
          title={showLeftPanel ? "Hide sidebar" : "Show sidebar"}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-3.5 h-14 bg-raised hover:bg-hover border border-l-0 border-edge text-ink-3 hover:text-ink-2 grid place-items-center rounded-r-md transition-colors"
          style={{ left: showLeftPanel ? leftWidth : 0 }}
        >
          <Icon name={showLeftPanel ? "chevron-down" : "chevron-right"} size={12} className={showLeftPanel ? "rotate-90" : ""} />
        </button>

        <div className="flex-1 flex flex-col editor-preview-container overflow-hidden">
          <div className="flex-1 flex overflow-hidden min-h-0">
            <div className="flex-1 h-full min-w-0">
              <LaTeXEditor onCompile={() => compileRef.current?.()} saveRef={saveRef} />
            </div>
            {showPreview && (
              <>
                <div
                  className="w-px bg-edge-strong hover:bg-accent cursor-col-resize shrink-0 transition-colors relative after:absolute after:inset-y-0 after:-left-1.5 after:-right-1.5 after:content-[''] z-10"
                  onMouseDown={(e) => {
                    isDraggingRight.current = true;
                    document.body.style.cursor = "col-resize";
                    document.body.style.userSelect = "none";
                    e.preventDefault();
                  }}
                />
                <div className="h-full min-w-0" style={{ width: rightWidth }}>
                  <PDFPreview />
                </div>
              </>
            )}
          </div>

          {showBottomPanel ? (
            <>
              <div
                className="h-px bg-edge-strong hover:bg-accent cursor-row-resize shrink-0 transition-colors relative after:absolute after:inset-x-0 after:-top-1.5 after:-bottom-1.5 after:content-[''] z-10"
                onMouseDown={(e) => {
                  isDraggingBottom.current = true;
                  document.body.style.cursor = "row-resize";
                  document.body.style.userSelect = "none";
                  e.preventDefault();
                }}
              />
              <div style={{ height: bottomHeight }} className="min-h-0 flex-shrink-0">
                <ErrorPanel onHide={() => setShowBottomPanel(false)} />
              </div>
            </>
          ) : (
            <button
              onClick={() => setShowBottomPanel(true)}
              className="flex items-center gap-2 px-3 h-8 shrink-0 bg-raised border-t border-edge text-tiny text-ink-2 hover:text-ink transition-colors"
            >
              <span>Issues</span>
              {totalIssues > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-danger-subtle text-danger text-micro font-semibold tabular-nums">{totalIssues}</span>
              )}
            </button>
          )}
        </div>
      </div>

      {showTemplates && <TemplateGallery onClose={() => setShowTemplates(false)} />}
      {showPlugins && <PluginManager onClose={() => setShowPlugins(false)} />}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      {showPalette && (
        <CommandPalette onClose={() => setShowPalette(false)} handlers={paletteHandlers} />
      )}
      {showShortcuts && <ShortcutsHelp onClose={() => setShowShortcuts(false)} />}
    </div>
  );
}
