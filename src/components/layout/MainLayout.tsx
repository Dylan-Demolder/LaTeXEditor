import { useState, useCallback, useRef, useEffect } from "react";
import FileTree from "../file-tree/FileTree";
import LaTeXEditor from "../editor/LaTeXEditor";
import PDFPreview from "../preview/PDFPreview";
import ErrorPanel from "../errors/ErrorPanel";
import Toolbar from "../toolbar/Toolbar";
import ComponentLibrary from "../component-library/ComponentLibrary";
import TemplateGallery from "../templates/TemplateGallery";
import AISkillsPanel from "../ai-skills/AISkillsPanel";
import PluginManager from "../plugin-manager/PluginManager";

type Panel = "files" | "components" | "skills" | "errors";

export default function MainLayout() {
  const [leftPanel, setLeftPanel] = useState<Panel>("files");
  const [rightWidth, setRightWidth] = useState(500);
  const [bottomHeight, setBottomHeight] = useState(200);
  const [leftWidth, setLeftWidth] = useState(260);
  const isDraggingRight = useRef(false);
  const isDraggingBottom = useRef(false);
  const isDraggingLeft = useRef(false);
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showBottomPanel] = useState(true);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showPlugins, setShowPlugins] = useState(false);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (isDraggingRight.current) {
        setRightWidth(Math.max(300, Math.min(window.innerWidth - 400, e.clientX)));
      }
      if (isDraggingBottom.current) {
        const parent = document.querySelector(".editor-preview-container");
        if (parent) {
          const rect = parent.getBoundingClientRect();
          setBottomHeight(
            Math.max(100, Math.min(rect.height - 200, rect.bottom - e.clientY))
          );
        }
      }
      if (isDraggingLeft.current) {
        setLeftWidth(Math.max(180, Math.min(500, e.clientX)));
      }
    },
    []
  );

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

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-900 text-white overflow-hidden">
      <Toolbar onNewFromTemplate={() => setShowTemplates(true)} onOpenPlugins={() => setShowPlugins(true)} />

      <div className="flex-1 flex overflow-hidden">
        {showLeftPanel && (
          <>
            <div className="h-full flex flex-col" style={{ width: leftWidth }}>
              <div className="flex border-b border-gray-700">
                {(["files", "components", "skills", "errors"] as Panel[]).map((panel) => (
                  <button
                    key={panel}
                    onClick={() => setLeftPanel(panel)}
                    className={`flex-1 px-2 py-1.5 text-xs ${
                      leftPanel === panel
                        ? "bg-gray-800 text-gray-200 border-b border-blue-500"
                        : "text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    {panel === "files" ? "Files" : panel === "components" ? "Components" : panel === "skills" ? "Skills" : "Issues"}
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-hidden">
                {leftPanel === "files" && <FileTree />}
                {leftPanel === "components" && <ComponentLibrary />}
                {leftPanel === "skills" && <AISkillsPanel />}
                {leftPanel === "errors" && <ErrorPanel />}
              </div>
            </div>

            <div
              className="w-1 bg-gray-700 hover:bg-blue-500 cursor-col-resize flex-shrink-0 transition-colors"
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
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-4 h-16 bg-gray-700 hover:bg-gray-600 text-gray-400 text-xs flex items-center justify-center rounded-r"
          style={{ left: showLeftPanel ? leftWidth : 0 }}
        >
          {showLeftPanel ? "◀" : "▶"}
        </button>

        <div className="flex-1 flex editor-preview-container overflow-hidden">
          <div className="flex-1 h-full min-w-0">
            <LaTeXEditor />
          </div>

          <div
            className="w-1 bg-gray-700 hover:bg-blue-500 cursor-col-resize flex-shrink-0 transition-colors"
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
        </div>
      </div>

      {showBottomPanel && (
        <>
          <div
            className="h-1 bg-gray-700 hover:bg-blue-500 cursor-row-resize flex-shrink-0 transition-colors"
            onMouseDown={(e) => {
              isDraggingBottom.current = true;
              document.body.style.cursor = "row-resize";
              document.body.style.userSelect = "none";
              e.preventDefault();
            }}
          />
          <div style={{ height: bottomHeight }} className="min-h-0">
            <ErrorPanel />
          </div>
        </>
      )}

      {showTemplates && (
        <TemplateGallery onClose={() => setShowTemplates(false)} />
      )}
      {showPlugins && (
        <PluginManager onClose={() => setShowPlugins(false)} />
      )}
    </div>
  );
}
