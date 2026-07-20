import { Icon } from "../icons";

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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-base border border-edge-strong rounded-xl w-[550px] max-h-[80vh] flex flex-col shadow-[var(--shadow-overlay)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-edge">
          <h2 className="text-body font-medium text-ink">Keyboard Shortcuts</h2>
          <button onClick={onClose} className="grid place-items-center w-7 h-7 rounded-md text-ink-2 hover:text-ink hover:bg-hover transition-colors"><Icon name="close" size={15} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {SHORTCUTS.map((group) => (
            <div key={group.category}>
              <h3 className="text-tiny font-medium text-accent mb-2 uppercase tracking-wide">{group.category}</h3>
              <div className="space-y-1">
                {group.shortcuts.map((s, i) => (
                  <div key={i} className="flex items-center justify-between py-1 px-2 rounded hover:bg-hover/50">
                    <span className="text-tiny text-ink">{s.action}</span>
                    <span className="text-tiny font-mono text-ink-3 bg-hover px-1.5 py-0.5 rounded">
                      {s.keys}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="text-tiny text-ink-3 pt-2 border-t border-edge">
            Press <kbd className="px-1 py-0.5 bg-hover rounded text-ink-2">⌘</kbd> + <kbd className="px-1 py-0.5 bg-hover rounded text-ink-2">⇧</kbd> + <kbd className="px-1 py-0.5 bg-hover rounded text-ink-2">P</kbd> to open the command palette at any time.
          </div>
        </div>
      </div>
    </div>
  );
}
