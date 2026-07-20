import { useState, useEffect, useMemo } from "react";
import { runEditorAction } from "../editor/editor-bridge";

interface Action {
  id: string;
  label: string;
  shortcut: string;
  category: string;
  action: () => void;
}

/** App-level commands the palette cannot perform on its own. */
export interface PaletteHandlers {
  compile: () => void;
  save: () => void;
  openProject: () => void;
  newFromTemplate: () => void;
  toggleFilesPanel: () => void;
  togglePreview: () => void;
  toggleIssuesPanel: () => void;
  showOutline: () => void;
  showComponents: () => void;
  showSettings: () => void;
  showPlugins: () => void;
}

interface Props {
  onClose: () => void;
  handlers: PaletteHandlers;
}

export default function CommandPalette({ onClose, handlers }: Props) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(0);

  const actions: Action[] = useMemo(() => {
    const edit = (id: string) => () => runEditorAction(id);
    return [
      { id: "compile", label: "Compile Document", shortcut: "⌘↵", category: "Build", action: handlers.compile },
      { id: "save", label: "Save File", shortcut: "⌘S", category: "File", action: handlers.save },
      { id: "open-project", label: "Open Project Folder", shortcut: "", category: "File", action: handlers.openProject },
      { id: "new-template", label: "New from Template", shortcut: "", category: "File", action: handlers.newFromTemplate },
      { id: "settings", label: "Open Settings", shortcut: "", category: "File", action: handlers.showSettings },
      { id: "plugins", label: "Open Plugin Manager", shortcut: "", category: "File", action: handlers.showPlugins },
      { id: "toggle-files", label: "Toggle Sidebar", shortcut: "", category: "View", action: handlers.toggleFilesPanel },
      { id: "toggle-preview", label: "Toggle PDF Preview", shortcut: "", category: "View", action: handlers.togglePreview },
      { id: "toggle-issues", label: "Toggle Issues Panel", shortcut: "", category: "View", action: handlers.toggleIssuesPanel },
      { id: "toggle-outline", label: "Show Document Outline", shortcut: "", category: "View", action: handlers.showOutline },
      { id: "zoom-in", label: "Zoom In", shortcut: "⌘+", category: "View", action: edit("editor.action.fontZoomIn") },
      { id: "zoom-out", label: "Zoom Out", shortcut: "⌘-", category: "View", action: edit("editor.action.fontZoomOut") },
      { id: "zoom-reset", label: "Reset Zoom", shortcut: "", category: "View", action: edit("editor.action.fontZoomReset") },
      { id: "go-to-line", label: "Go to Line...", shortcut: "⌘G", category: "Navigate", action: edit("editor.action.gotoLine") },
      { id: "find", label: "Find in File", shortcut: "⌘F", category: "Navigate", action: edit("actions.find") },
      { id: "find-replace", label: "Find and Replace", shortcut: "⌥⌘F", category: "Navigate", action: edit("editor.action.startFindReplaceAction") },
      { id: "toggle-comment", label: "Toggle Comment", shortcut: "⌘/", category: "Edit", action: edit("editor.action.commentLine") },
      { id: "format", label: "Format Document", shortcut: "⇧⌥F", category: "Edit", action: edit("editor.action.formatDocument") },
      { id: "indent", label: "Indent Line", shortcut: "⇥", category: "Edit", action: edit("editor.action.indentLines") },
      { id: "outdent", label: "Outdent Line", shortcut: "⇧⇥", category: "Edit", action: edit("editor.action.outdentLines") },
      { id: "duplicate-line", label: "Duplicate Line", shortcut: "⇧⌥↓", category: "Edit", action: edit("editor.action.copyLinesDownAction") },
      { id: "move-line-up", label: "Move Line Up", shortcut: "⌥↑", category: "Edit", action: edit("editor.action.moveLinesUpAction") },
      { id: "move-line-down", label: "Move Line Down", shortcut: "⌥↓", category: "Edit", action: edit("editor.action.moveLinesDownAction") },
      { id: "snippets", label: "Insert Snippet...", shortcut: "", category: "Insert", action: edit("editor.action.triggerSuggest") },
      { id: "component", label: "Insert Component...", shortcut: "", category: "Insert", action: handlers.showComponents },
    ];
  }, [handlers]);

  const filtered = actions.filter((a) => {
    if (!search) return true;
    const t = search.toLowerCase();
    return a.label.toLowerCase().includes(t) || a.category.toLowerCase().includes(t);
  });

  useEffect(() => {
    setSelected(0);
  }, [search]);

  const execute = (a: Action) => {
    // Close first: commands that focus the editor (find, go-to-line) would
    // otherwise fight the palette input for focus.
    onClose();
    a.action();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center pt-[15vh] z-50" onClick={onClose}>
      <div className="bg-base border border-edge-strong rounded-xl w-[550px] shadow-[var(--shadow-overlay)]" onClick={(e) => e.stopPropagation()}>
        <div className="p-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Type a command..."
            className="w-full bg-raised text-ink text-body px-3 py-2 rounded-xl border border-edge-strong outline-none focus:border-accent"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelected((s) => Math.min(s + 1, filtered.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelected((s) => Math.max(s - 1, 0));
              }
              if (e.key === "Enter" && filtered[selected]) execute(filtered[selected]);
            }}
          />
        </div>
        <div className="max-h-[300px] overflow-y-auto px-2 pb-2">
          {filtered.map((a, i) => (
            <div
              key={a.id}
              onClick={() => execute(a)}
              onMouseEnter={() => setSelected(i)}
              className={`flex items-center gap-3 px-3 py-1.5 rounded cursor-pointer text-body ${
                i === selected ? "bg-accent-subtle text-accent" : "text-ink hover:bg-hover"
              }`}
            >
              <span className="text-ink-2 w-24 text-tiny">{a.category}</span>
              <span className="flex-1">{a.label}</span>
              {a.shortcut && (
                <span className="text-tiny text-ink-3 font-mono bg-hover px-1.5 py-0.5 rounded">
                  {a.shortcut}
                </span>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-4 text-ink-3 text-body text-center">No commands found</div>
          )}
        </div>
      </div>
    </div>
  );
}
