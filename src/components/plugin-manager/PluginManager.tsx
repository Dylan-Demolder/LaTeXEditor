import { useState, useEffect, useCallback } from "react";
import { Icon } from "../icons";
import { listPlugins, readPluginFile } from "../../hooks/useTauriCommands";
import type { InstalledPlugin } from "../../plugins/types";

interface Props {
  onClose: () => void;
}

export default function PluginManager({ onClose }: Props) {
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
  const [selected, setSelected] = useState<InstalledPlugin | null>(null);
  const [pluginSrc, setPluginSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listPlugins().then((p) => {
      setPlugins(p);
      setLoading(false);
    });
  }, []);

  const handleSelect = useCallback(async (p: InstalledPlugin) => {
    setSelected(p);
    try {
      const src = await readPluginFile(p.path, p.manifest.main);
      setPluginSrc(src);
    } catch {
      setPluginSrc("// Could not load plugin source");
    }
  }, []);

  const typeLabels: Record<string, string> = {
    theme: "Theme",
    snippets: "Snippets",
    component: "Component",
    "compile-hook": "Compile Hook",
    preview: "Preview",
    tool: "Tool",
    linter: "Linter",
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-base border border-edge-strong rounded-xl w-[700px] max-h-[80vh] flex flex-col shadow-[var(--shadow-overlay)]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-edge">
          <h2 className="text-body font-medium text-ink">Plugin Manager</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid place-items-center w-7 h-7 rounded-md text-ink-2 hover:text-ink hover:bg-hover transition-colors"
          >
            <Icon name="close" size={15} />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="w-[260px] border-r border-edge overflow-y-auto">
            {loading ? (
              <div className="px-4 py-4 text-ink-3 text-tiny">Loading...</div>
            ) : plugins.length === 0 ? (
              <div className="px-4 py-4 text-ink-3 text-tiny">
                No plugins installed. Place plugins in <code className="text-accent">~/.latex-editor/plugins/</code>
              </div>
            ) : (
              plugins.map((p) => (
                <div
                  key={p.id}
                  onClick={() => handleSelect(p)}
                  className={`px-3 py-2 cursor-pointer border-b border-edge ${
                    selected?.id === p.id ? "bg-accent-subtle" : "hover:bg-hover"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-body">{p.manifest.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-tiny text-ink">{p.manifest.name}</div>
                      <div className="text-tiny text-ink-3">v{p.manifest.version}</div>
                    </div>
                    <span
                      className={`w-2 h-2 rounded-full ${p.enabled ? "bg-success" : "bg-edge-strong"}`}
                    />
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {selected ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{selected.manifest.icon}</span>
                  <div>
                    <h3 className="text-body font-medium text-ink">{selected.manifest.name}</h3>
                    <span className="text-tiny text-ink-3">
                      v{selected.manifest.version} by {selected.manifest.author}
                    </span>
                  </div>
                </div>

                <p className="text-tiny text-ink-2">{selected.manifest.description}</p>

                <div className="grid grid-cols-3 gap-2 text-tiny">
                  <div className="px-2 py-1 bg-raised rounded">
                    <span className="text-ink-3">Type: </span>
                    <span className="text-ink">{typeLabels[selected.manifest.type] || selected.manifest.type}</span>
                  </div>
                  <div className="px-2 py-1 bg-raised rounded">
                    <span className="text-ink-3">Status: </span>
                    <span className={selected.enabled ? "text-success" : "text-ink-3"}>
                      {selected.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                  <div className="px-2 py-1 bg-raised rounded">
                    <span className="text-ink-3">Activation: </span>
                    <span className="text-ink">{selected.manifest.activation || "always"}</span>
                  </div>
                </div>

                {pluginSrc && (
                  <div>
                    <div className="text-tiny text-ink-3 mb-1">Plugin Source ({selected.manifest.main}):</div>
                    <pre className="p-3 bg-raised rounded text-tiny text-ink overflow-x-auto max-h-[30vh] font-mono">
                      {pluginSrc}
                    </pre>
                  </div>
                )}

                <div className="text-tiny text-ink-3">
                  Plugin path: <code className="text-ink-3">{selected.path}</code>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-ink-3 text-tiny gap-2">
                <Icon name="plug" size={22} className="text-ink-3" />
                <span>Select a plugin to view details</span>
                <span className="text-ink-3">
                  Place plugins in <code className="text-accent">~/.latex-editor/plugins/</code>
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
