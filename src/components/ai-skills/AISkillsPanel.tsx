import { useState, useCallback } from "react";
import { aiSkills, SKILL_CATEGORIES } from "../../data/ai-skills";
import type { AISkill } from "../../types";
import { useAppStore } from "../../stores/useAppStore";
import { setMcpProject } from "../../hooks/useTauriCommands";

type SkillCategory = AISkill["category"];

export default function AISkillsPanel() {
  const { activeFileContent, projectPath, activeFilePath } = useAppStore();
  const [selectedSkill, setSelectedSkill] = useState<AISkill | null>(null);
  const [argValues, setArgValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [activeCategory, setActiveCategory] = useState<SkillCategory | "all">("all");
  const [search, setSearch] = useState("");

  const filtered = aiSkills.filter((s) => {
    if (activeCategory !== "all" && s.category !== activeCategory) return false;
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleSelect = useCallback((skill: AISkill) => {
    setSelectedSkill(skill);
    setResult(null);
    const vals: Record<string, string> = {};
    skill.args.forEach((arg) => {
      if (arg.key === "content") {
        vals[arg.key] = activeFileContent || "";
      } else if (arg.key === "errors") {
        vals[arg.key] = "";
      } else {
        vals[arg.key] = "";
      }
    });
    setArgValues(vals);
  }, [activeFileContent]);

  const handleCopyPrompt = useCallback(async () => {
    if (!selectedSkill) return;
    let prompt = selectedSkill.systemPrompt + "\n\n" + selectedSkill.userPromptTemplate;
    selectedSkill.args.forEach((arg) => {
      prompt = prompt.replace(`$$${arg.key}$$`, argValues[arg.key] || "");
    });
    await navigator.clipboard.writeText(prompt);
    setResult("Prompt copied to clipboard. Paste it to your AI agent.");
  }, [selectedSkill, argValues]);

  const handleRunViaMcp = useCallback(async () => {
    if (!selectedSkill || !projectPath || !activeFilePath) return;
    setIsRunning(true);
    setResult(null);
    try {
      await setMcpProject(projectPath, activeFilePath);

      let prompt = selectedSkill.systemPrompt + "\n\n" + selectedSkill.userPromptTemplate;
      selectedSkill.args.forEach((arg) => {
        prompt = prompt.replace(`$$${arg.key}$$`, argValues[arg.key] || "");
      });

      const response = await fetch("http://127.0.0.1:9876/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "read_file",
            arguments: { path: activeFilePath },
          },
        }),
      });

      const data = await response.json();
      setResult(JSON.stringify(data, null, 2));
    } catch (e) {
      setResult(`MCP Error: ${e}`);
    } finally {
      setIsRunning(false);
    }
  }, [selectedSkill, argValues, projectPath, activeFilePath]);

  const categories = ["all", ...Object.keys(SKILL_CATEGORIES)] as (SkillCategory | "all")[];

  return (
    <div className="h-full w-full flex flex-col bg-gray-850">
      <div className="px-3 py-1.5 bg-gray-800 border-b border-gray-700 text-gray-300 text-xs font-medium">
        AI Skills
      </div>

      {selectedSkill ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700">
            <button onClick={() => setSelectedSkill(null)} className="text-gray-400 hover:text-white text-xs">
              Back
            </button>
            <span className="text-xs text-gray-300 font-medium truncate">
              {selectedSkill.icon} {selectedSkill.name}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            <p className="text-xs text-gray-500">{selectedSkill.description}</p>

            {selectedSkill.args.map((arg) => (
              <div key={arg.key} className="space-y-1">
                <label className="text-xs text-gray-400">{arg.label}</label>
                <textarea
                  value={argValues[arg.key] || ""}
                  onChange={(e) => setArgValues((prev) => ({ ...prev, [arg.key]: e.target.value }))}
                  placeholder={arg.placeholder}
                  rows={arg.key === "content" || arg.key === "errors" ? 6 : 3}
                  className="w-full bg-gray-700 text-gray-200 text-xs px-2 py-1.5 rounded border border-gray-600 resize-y font-mono"
                />
              </div>
            ))}

            <div className="flex gap-2">
              <button
                onClick={handleCopyPrompt}
                className="flex-1 px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors"
              >
                Copy Prompt
              </button>
              <button
                onClick={handleRunViaMcp}
                disabled={isRunning || !projectPath}
                className={`flex-1 px-3 py-1.5 text-xs rounded transition-colors ${
                  !projectPath || isRunning
                    ? "bg-gray-700 text-gray-500"
                    : "bg-blue-600 hover:bg-blue-500 text-white"
                }`}
              >
                {isRunning ? "Running..." : "Run via MCP"}
              </button>
            </div>

            {result && (
              <div className="mt-2">
                <div className="text-xs text-gray-500 mb-1">Result:</div>
                <pre className="p-2 bg-gray-800 rounded text-xs text-gray-300 overflow-x-auto max-h-40">
                  {result}
                </pre>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="px-3 py-2 border-b border-gray-700">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search skills..."
              className="w-full bg-gray-700 text-gray-200 text-xs px-2 py-1 rounded border border-gray-600 outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex gap-1 px-2 py-1.5 border-b border-gray-700 overflow-x-auto">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-2 py-0.5 text-xs rounded whitespace-nowrap transition-colors ${
                  activeCategory === cat
                    ? "bg-blue-600 text-white"
                    : "text-gray-400 hover:text-gray-200 hover:bg-gray-700"
                }`}
              >
                {cat === "all" ? "All" : SKILL_CATEGORIES[cat as SkillCategory]}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="px-3 py-2 border-b border-gray-700/50">
              <div className="flex items-center gap-2 text-xs">
                <span className="w-2 h-2 bg-green-500 rounded-full" />
                <span className="text-gray-400">MCP Server:</span>
                <span className="text-green-400">http://127.0.0.1:9876</span>
              </div>
            </div>
            {filtered.length === 0 ? (
              <div className="px-4 py-4 text-gray-500 text-xs">No skills match</div>
            ) : (
              filtered.map((skill) => (
                <div
                  key={skill.id}
                  onClick={() => handleSelect(skill)}
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-700/50 border-b border-gray-700/30"
                >
                  <span className="text-sm">{skill.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-300">{skill.name}</div>
                    <div className="text-xs text-gray-500 truncate">{skill.description}</div>
                  </div>
                  <span className="text-xs text-gray-600">{SKILL_CATEGORIES[skill.category]}</span>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
