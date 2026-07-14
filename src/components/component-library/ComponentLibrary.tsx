import { useState, useCallback } from "react";
import {
  components,
  CATEGORY_NAMES,
  type LaTeXComponent,
  type ComponentCategory,
} from "../../data/components";

export default function ComponentLibrary() {
  const [selectedCategory, setSelectedCategory] = useState<ComponentCategory | "all">("all");
  const [selectedComponent, setSelectedComponent] = useState<LaTeXComponent | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState("");

  const filtered = components.filter((c) => {
    if (selectedCategory !== "all" && c.category !== selectedCategory) return false;
    if (searchTerm && !c.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const handleSelect = useCallback((comp: LaTeXComponent) => {
    setSelectedComponent(comp);
    const defaults: Record<string, string> = {};
    comp.fields.forEach((f) => {
      defaults[f.key] = f.default;
    });
    setFieldValues(defaults);
  }, []);

  const handleInsert = useCallback(() => {
    if (!selectedComponent) return;
    const latex = selectedComponent.generate(fieldValues);
    const editor = (window as any).monaco?.editor?.getEditors?.()?.[0];
    if (editor) {
      const position = editor.getPosition();
      editor.executeEdits("component", [
        {
          range: {
            startLineNumber: position.lineNumber,
            startColumn: position.column,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          },
          text: "\n" + latex,
        },
      ]);
      editor.focus();
    }
  }, [selectedComponent, fieldValues]);

  const categories = ["all", ...Object.keys(CATEGORY_NAMES)] as (ComponentCategory | "all")[];

  return (
    <div className="h-full w-full flex flex-col bg-gray-850">
      <div className="px-3 py-1.5 bg-gray-800 border-b border-gray-700 text-gray-300 text-xs font-medium">
        Components
      </div>

      {selectedComponent ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700">
            <button
              onClick={() => setSelectedComponent(null)}
              className="text-gray-400 hover:text-white text-xs"
            >
              Back
            </button>
            <span className="text-xs text-gray-300 font-medium truncate">
              {selectedComponent.icon} {selectedComponent.name}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            <p className="text-xs text-gray-500">{selectedComponent.description}</p>
            {selectedComponent.fields.map((field) => (
              <div key={field.key} className="space-y-1">
                <label className="text-xs text-gray-400">{field.label}</label>
                {field.type === "select" ? (
                  <select
                    value={fieldValues[field.key] || field.default}
                    onChange={(e) =>
                      setFieldValues((prev) => ({
                        ...prev,
                        [field.key]: e.target.value,
                      }))
                    }
                    className="w-full bg-gray-700 text-gray-200 text-xs px-2 py-1.5 rounded border border-gray-600"
                  >
                    {field.options?.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : field.type === "textarea" ? (
                  <textarea
                    value={fieldValues[field.key] || field.default}
                    onChange={(e) =>
                      setFieldValues((prev) => ({
                        ...prev,
                        [field.key]: e.target.value,
                      }))
                    }
                    rows={4}
                    placeholder={field.placeholder}
                    className="w-full bg-gray-700 text-gray-200 text-xs px-2 py-1.5 rounded border border-gray-600 font-mono resize-y"
                  />
                ) : (
                  <input
                    type="text"
                    value={fieldValues[field.key] || field.default}
                    onChange={(e) =>
                      setFieldValues((prev) => ({
                        ...prev,
                        [field.key]: e.target.value,
                      }))
                    }
                    placeholder={field.placeholder}
                    className="w-full bg-gray-700 text-gray-200 text-xs px-2 py-1.5 rounded border border-gray-600"
                  />
                )}
              </div>
            ))}
            <button
              onClick={handleInsert}
              className="w-full px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
            >
              Insert Component
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="px-3 py-2 border-b border-gray-700">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search components..."
              className="w-full bg-gray-700 text-gray-200 text-xs px-2 py-1 rounded border border-gray-600 outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex gap-1 px-2 py-1.5 border-b border-gray-700 overflow-x-auto">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-2 py-0.5 text-xs rounded whitespace-nowrap transition-colors ${
                  selectedCategory === cat
                    ? "bg-blue-600 text-white"
                    : "text-gray-400 hover:text-gray-200 hover:bg-gray-700"
                }`}
              >
                {cat === "all" ? "All" : CATEGORY_NAMES[cat as ComponentCategory]}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-4 py-4 text-gray-500 text-xs">No components found</div>
            ) : (
              filtered.map((comp) => (
                <div
                  key={comp.id}
                  onClick={() => handleSelect(comp)}
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-700/50 border-b border-gray-700/30"
                >
                  <span className="text-sm">{comp.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-300">{comp.name}</div>
                    <div className="text-xs text-gray-500 truncate">{comp.description}</div>
                  </div>
                  <span className="text-xs text-gray-600">
                    {CATEGORY_NAMES[comp.category]}
                  </span>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
