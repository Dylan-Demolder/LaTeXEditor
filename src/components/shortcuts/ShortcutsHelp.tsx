interface Props {
  onClose: () => void;
}

const SHORTCUTS = [
  { category: "Editor", shortcuts: [
    { keys: "⌘S", action: "Save file" },
    { keys: "⌘↵", action: "Compile document" },
    { keys: "⌘/", action: "Toggle comment" },
    { keys: "⌘F", action: "Find in file" },
    { keys: "⌥⌘F", action: "Find and replace" },
    { keys: "⌘G", action: "Go to line" },
    { keys: "⇧⇥", action: "Outdent line" },
    { keys: "⇧⌥↓", action: "Duplicate line" },
    { keys: "⌥↑ / ⌥↓", action: "Move line up/down" },
  ]},
  { category: "App", shortcuts: [
    { keys: "⌘⇧P", action: "Command palette" },
    { keys: "⌘K ⌘S", action: "Keyboard shortcuts (this)" },
    { keys: "⌘+ / ⌘-", action: "Zoom in/out" },
  ]},
  { category: "Snippets (type in editor)", shortcuts: [
    { keys: "begin", action: "Insert environment" },
    { keys: "frac", action: "Insert fraction" },
    { keys: "sqrt", action: "Insert square root" },
    { keys: "sum / int / lim / prod", action: "Math operators" },
    { keys: "section / subsection", action: "Section heading" },
    { keys: "figure / table", action: "Float environment" },
    { keys: "align / matrix / cases", action: "Math environments" },
    { keys: "itemize / enumerate", action: "List environments" },
    { keys: "textbf / textit / texttt", action: "Text formatting" },
  ]},
];

export default function ShortcutsHelp({ onClose }: Props) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-850 border border-gray-600 rounded-lg w-[550px] max-h-[80vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h2 className="text-sm font-medium text-gray-200">Keyboard Shortcuts</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {SHORTCUTS.map((group) => (
            <div key={group.category}>
              <h3 className="text-xs font-medium text-blue-400 mb-2 uppercase tracking-wide">{group.category}</h3>
              <div className="space-y-1">
                {group.shortcuts.map((s, i) => (
                  <div key={i} className="flex items-center justify-between py-1 px-2 rounded hover:bg-gray-800/50">
                    <span className="text-xs text-gray-300">{s.action}</span>
                    <span className="text-xs font-mono text-gray-500 bg-gray-700 px-1.5 py-0.5 rounded">
                      {s.keys}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="text-xs text-gray-600 pt-2 border-t border-gray-700">
            Press <kbd className="px-1 py-0.5 bg-gray-700 rounded text-gray-400">⌘</kbd> + <kbd className="px-1 py-0.5 bg-gray-700 rounded text-gray-400">⇧</kbd> + <kbd className="px-1 py-0.5 bg-gray-700 rounded text-gray-400">P</kbd> to open the command palette at any time.
          </div>
        </div>
      </div>
    </div>
  );
}
