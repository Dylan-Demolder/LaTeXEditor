import { useState, useEffect } from "react";
import { useAppStore } from "../../stores/useAppStore";
import { goToLine } from "../editor/editor-bridge";
import { SECTION_LEVELS } from "../editor/latex-language";

interface Section {
  level: number; // 1=section, 2=subsection, 3=subsubsection
  title: string;
  line: number;
}

export default function OutlinePanel() {
  const { activeFileContent } = useAppStore();
  const [sections, setSections] = useState<Section[]>([]);

  useEffect(() => {
    // Starred forms (\section*) count too; text after an unescaped % does not.
    const re =
      /\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\s*\{([^}]*)\}/g;
    const results: Section[] = [];

    activeFileContent.split("\n").forEach((rawLine, idx) => {
      const line = rawLine.replace(/(^|[^\\])%.*$/, "$1");
      re.lastIndex = 0;
      let match;
      while ((match = re.exec(line)) !== null) {
        results.push({
          level: SECTION_LEVELS[match[1]] ?? 1,
          title: match[2],
          line: idx + 1,
        });
      }
    });

    setSections(results);
  }, [activeFileContent]);

  const levelIndent = (l: number) => ({ paddingLeft: `${l * 12 + 8}px` });
  const levelIcon = (l: number) => ["█", "§", "▸", "·", "—"][l] || "·";

  return (
    <div className="h-full flex flex-col bg-base overflow-hidden">
      <div className="flex items-center pl-3 pr-1.5 h-8 shrink-0 border-b border-edge">
        <span className="panel-label">Outline</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {sections.length === 0 ? (
          <div className="px-4 py-4 text-ink-3 text-tiny">
            No sections found. Use \\section, \\subsection, etc.
          </div>
        ) : (
          sections.map((s, i) => (
            <div
              key={i}
              onClick={() => goToLine(s.line)}
              className="flex items-center gap-1 px-2 py-0.5 cursor-pointer hover:bg-hover text-tiny text-ink-2 border-b border-edge"
              style={levelIndent(s.level)}
            >
              <span className="text-ink-3 w-3 text-center">{levelIcon(s.level)}</span>
              <span className="truncate">{s.title}</span>
              <span className="text-ink-3 ml-auto tabular-nums">:{s.line}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
