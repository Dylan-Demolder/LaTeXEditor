import { useState, useCallback, useEffect } from "react";
import { useAppStore } from "../../stores/useAppStore";

interface Section {
  level: number; // 1=section, 2=subsection, 3=subsubsection
  title: string;
  line: number;
}

export default function OutlinePanel() {
  const { activeFileContent } = useAppStore();
  const [sections, setSections] = useState<Section[]>([]);

  useEffect(() => {
    const re = /\\(section|subsection|subsubsection|chapter|paragraph)\{([^}]*)\}/g;
    const results: Section[] = [];
    let match;
    const lines = activeFileContent.split("\n");
    lines.forEach((line, idx) => {
      while ((match = re.exec(line)) !== null) {
        const levelMap: Record<string, number> = {
          chapter: 0,
          section: 1,
          subsection: 2,
          subsubsection: 3,
          paragraph: 4,
        };
        results.push({
          level: levelMap[match[1]] || 1,
          title: match[2],
          line: idx + 1,
        });
      }
    });
    setSections(results);
  }, [activeFileContent]);

  const handleJump = useCallback((line: number) => {
    const editor = (window as any).monaco?.editor?.getEditors?.()?.[0];
    if (editor) {
      editor.revealLineInCenter(line);
      editor.setPosition({ lineNumber: line, column: 1 });
      editor.focus();
    }
  }, []);

  const levelIndent = (l: number) => ({ paddingLeft: `${l * 12 + 8}px` });
  const levelIcon = (l: number) => ["█", "§", "▸", "·", "—"][l] || "·";

  return (
    <div className="h-full flex flex-col bg-gray-850 overflow-hidden">
      <div className="px-3 py-1.5 bg-gray-800 border-b border-gray-700 text-gray-300 text-xs font-medium">
        Outline
      </div>
      <div className="flex-1 overflow-y-auto">
        {sections.length === 0 ? (
          <div className="px-4 py-4 text-gray-500 text-xs">
            No sections found. Use \\section, \\subsection, etc.
          </div>
        ) : (
          sections.map((s, i) => (
            <div
              key={i}
              onClick={() => handleJump(s.line)}
              className="flex items-center gap-1 px-2 py-0.5 cursor-pointer hover:bg-gray-700/50 text-xs text-gray-400 border-b border-gray-700/20"
              style={levelIndent(s.level)}
            >
              <span className="text-gray-600 w-3 text-center">{levelIcon(s.level)}</span>
              <span className="truncate">{s.title}</span>
              <span className="text-gray-600 ml-auto tabular-nums">:{s.line}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
