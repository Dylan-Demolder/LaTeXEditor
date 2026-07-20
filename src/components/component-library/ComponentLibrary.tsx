import { useState, useCallback } from "react";
import {
  components,
  CATEGORY_NAMES,
  type LaTeXComponent,
  type ComponentCategory,
} from "../../data/components";
import { insertAtCursor } from "../editor/editor-bridge";
import { Icon, type IconName } from "../icons";

// The data file carries typographic glyphs ("§", "1.", "𝑓") that render
// inconsistently across platforms; category icons are steadier.
const CATEGORY_ICONS: Record<ComponentCategory, IconName> = {
  math: "function",
  tables: "grid",
  figures: "file-image",
  lists: "list",
  structure: "box",
  code: "template",
  bibliography: "file-bib",
};

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
    insertAtCursor("\n" + selectedComponent.generate(fieldValues));
  }, [selectedComponent, fieldValues]);

  const categories = ["all", ...Object.keys(CATEGORY_NAMES)] as (ComponentCategory | "all")[];

  return (
    <div className="h-full w-full flex flex-col bg-base">
      <div className="flex items-center pl-3 pr-1.5 h-8 shrink-0 border-b border-edge">
        <span className="panel-label">Components</span>
      </div>

      {selectedComponent ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-edge">
            <button
              onClick={() => setSelectedComponent(null)}
              className="flex items-center gap-1 text-ink-2 hover:text-ink text-tiny"
            >
              <Icon name="arrow-left" size={13} />
              Back
            </button>
            <Icon name={CATEGORY_ICONS[selectedComponent.category]} size={15} className="text-accent" />
            <span className="text-tiny text-ink font-medium truncate">
              {selectedComponent.name}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            <p className="text-tiny text-ink-3">{selectedComponent.description}</p>
            {selectedComponent.fields.map((field) => (
              <div key={field.key} className="space-y-1">
                <label className="text-tiny text-ink-2">{field.label}</label>
                {field.type === "select" ? (
                  <select
                    value={fieldValues[field.key] || field.default}
                    onChange={(e) =>
                      setFieldValues((prev) => ({
                        ...prev,
                        [field.key]: e.target.value,
                      }))
                    }
                    className="w-full bg-hover text-ink text-tiny px-2 py-1.5 rounded border border-edge-strong"
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
                    className="w-full bg-hover text-ink text-tiny px-2 py-1.5 rounded border border-edge-strong font-mono resize-y"
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
                    className="w-full bg-hover text-ink text-tiny px-2 py-1.5 rounded border border-edge-strong"
                  />
                )}
              </div>
            ))}
            <button
              onClick={handleInsert}
              className="w-full px-3 py-1.5 text-tiny bg-accent hover:bg-accent-hover text-accent-fg rounded transition-colors"
            >
              Insert Component
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="px-3 py-2 border-b border-edge">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search components..."
              className="w-full bg-hover text-ink text-tiny px-2 py-1 rounded border border-edge-strong outline-none focus:border-accent"
            />
          </div>
          <div className="flex gap-1 px-2 py-1.5 border-b border-edge overflow-x-auto">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-2 py-0.5 text-tiny rounded whitespace-nowrap transition-colors ${
                  selectedCategory === cat
                    ? "bg-accent text-accent-fg"
                    : "text-ink-2 hover:text-ink hover:bg-hover"
                }`}
              >
                {cat === "all" ? "All" : CATEGORY_NAMES[cat as ComponentCategory]}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-4 py-4 text-ink-3 text-tiny">No components found</div>
            ) : (
              filtered.map((comp) => (
                <div
                  key={comp.id}
                  onClick={() => handleSelect(comp)}
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-hover border-b border-edge"
                >
                  <Icon name={CATEGORY_ICONS[comp.category]} size={16} className="text-ink-3" />
                  <div className="flex-1 min-w-0">
                    <div className="text-tiny text-ink">{comp.name}</div>
                    <div className="text-tiny text-ink-3 truncate">{comp.description}</div>
                  </div>
                  <span className="text-tiny text-ink-3">
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
