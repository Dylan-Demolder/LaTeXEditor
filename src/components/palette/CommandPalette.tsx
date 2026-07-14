import { useState, useEffect } from "react";

interface Action {
  id: string;
  label: string;
  shortcut: string;
  category: string;
  action: () => void;
}

interface Props {
  onClose: () => void;
}

export default function CommandPalette({ onClose }: Props) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(0);

  const actions: Action[] = [
    { id: "compile", label: "Compile Document", shortcut: "⌘↵", category: "Build", action: () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true }));
    }},
    { id: "save", label: "Save File", shortcut: "⌘S", category: "File", action: () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "s", metaKey: true }));
    }},
    { id: "open-project", label: "Open Project Folder", shortcut: "", category: "File", action: () => {} },
    { id: "new-template", label: "New from Template", shortcut: "", category: "File", action: () => {} },
    { id: "toggle-files", label: "Toggle Files Panel", shortcut: "", category: "View", action: () => {} },
    { id: "toggle-preview", label: "Toggle PDF Preview", shortcut: "", category: "View", action: () => {} },
    { id: "toggle-outline", label: "Show Document Outline", shortcut: "", category: "View", action: () => {} },
    { id: "go-to-line", label: "Go to Line...", shortcut: "⌘G", category: "Navigate", action: () => {
      const editor = (window as any).monaco?.editor?.getEditors?.()?.[0];
      if (editor) editor.getAction("editor.action.gotoLine")?.run();
    }},
    { id: "find", label: "Find in File", shortcut: "⌘F", category: "Navigate", action: () => {
      const editor = (window as any).monaco?.editor?.getEditors?.()?.[0];
      if (editor) editor.getAction("actions.find")?.run();
    }},
    { id: "find-replace", label: "Find and Replace", shortcut: "⌥⌘F", category: "Navigate", action: () => {
      const editor = (window as any).monaco?.editor?.getEditors?.()?.[0];
      if (editor) editor.getAction("editor.action.startFindReplaceAction")?.run();
    }},
    { id: "toggle-comment", label: "Toggle Comment", shortcut: "⌘/", category: "Edit", action: () => {
      const editor = (window as any).monaco?.editor?.getEditors?.()?.[0];
      if (editor) editor.getAction("editor.action.commentLine")?.run();
    }},
    { id: "format", label: "Format Document", shortcut: "⇧⌥F", category: "Edit", action: () => {
      const editor = (window as any).monaco?.editor?.getEditors?.()?.[0];
      if (editor) editor.getAction("editor.action.formatDocument")?.run();
    }},
    { id: "indent", label: "Indent Line", shortcut: "⇥", category: "Edit", action: () => {} },
    { id: "outdent", label: "Outdent Line", shortcut: "⇧⇥", category: "Edit", action: () => {} },
    { id: "duplicate-line", label: "Duplicate Line", shortcut: "⇧⌥↓", category: "Edit", action: () => {
      const editor = (window as any).monaco?.editor?.getEditors?.()?.[0];
      if (editor) editor.getAction("editor.action.copyLinesDownAction")?.run();
    }},
    { id: "move-line-up", label: "Move Line Up", shortcut: "⌥↑", category: "Edit", action: () => {} },
    { id: "move-line-down", label: "Move Line Down", shortcut: "⌥↓", category: "Edit", action: () => {} },
    { id: "snippets", label: "Insert Snippet...", shortcut: "", category: "Insert", action: () => {} },
    { id: "component", label: "Insert Component...", shortcut: "", category: "Insert", action: () => {} },
    { id: "zoom-in", label: "Zoom In", shortcut: "⌘+", category: "View", action: () => {} },
    { id: "zoom-out", label: "Zoom Out", shortcut: "⌘-", category: "View", action: () => {} },
  ];

  const filtered = actions.filter((a) => {
    if (!search) return true;
    const t = search.toLowerCase();
    return a.label.toLowerCase().includes(t) || a.category.toLowerCase().includes(t);
  });

  useEffect(() => {
    setSelected(0);
  }, [search]);

  const execute = (a: Action) => {
    a.action();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-start justify-center pt-[15vh] z-50" onClick={onClose}>
      <div className="bg-gray-850 border border-gray-600 rounded-lg w-[550px] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Type a command..."
            className="w-full bg-gray-800 text-gray-200 text-sm px-3 py-2 rounded-lg border border-gray-600 outline-none focus:border-blue-500"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") setSelected((s) => Math.min(s + 1, filtered.length - 1));
              if (e.key === "ArrowUp") setSelected((s) => Math.max(s - 1, 0));
              if (e.key === "Enter" && filtered[selected]) execute(filtered[selected]);
            }}
          />
        </div>
        <div className="max-h-[300px] overflow-y-auto px-2 pb-2">
          {filtered.map((a, i) => (
            <div
              key={a.id}
              onClick={() => execute(a)}
              className={`flex items-center gap-3 px-3 py-1.5 rounded cursor-pointer text-sm ${
                i === selected ? "bg-blue-600/30 text-white" : "text-gray-300 hover:bg-gray-700/50"
              }`}
            >
              <span className="text-gray-400 w-24 text-xs">{a.category}</span>
              <span className="flex-1">{a.label}</span>
              {a.shortcut && (
                <span className="text-xs text-gray-500 font-mono bg-gray-700 px-1.5 py-0.5 rounded">
                  {a.shortcut}
                </span>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-4 text-gray-500 text-sm text-center">No commands found</div>
          )}
        </div>
      </div>
    </div>
  );
}
