import { useState, useEffect, useCallback } from "react";
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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-850 border border-gray-600 rounded-lg w-[700px] max-h-[80vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h2 className="text-sm font-medium text-gray-200">Plugin Manager</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">
            ×
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="w-[260px] border-r border-gray-700 overflow-y-auto">
            {loading ? (
              <div className="px-4 py-4 text-gray-500 text-xs">Loading...</div>
            ) : plugins.length === 0 ? (
              <div className="px-4 py-4 text-gray-500 text-xs">
                No plugins installed. Place plugins in <code className="text-blue-400">~/.latex-editor/plugins/</code>
              </div>
            ) : (
              plugins.map((p) => (
                <div
                  key={p.id}
                  onClick={() => handleSelect(p)}
                  className={`px-3 py-2 cursor-pointer border-b border-gray-700/30 ${
                    selected?.id === p.id ? "bg-blue-800/30" : "hover:bg-gray-700/50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{p.manifest.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-gray-300">{p.manifest.name}</div>
                      <div className="text-xs text-gray-600">v{p.manifest.version}</div>
                    </div>
                    <span
                      className={`w-2 h-2 rounded-full ${p.enabled ? "bg-green-500" : "bg-gray-600"}`}
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
                    <h3 className="text-sm font-medium text-gray-200">{selected.manifest.name}</h3>
                    <span className="text-xs text-gray-500">
                      v{selected.manifest.version} by {selected.manifest.author}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-gray-400">{selected.manifest.description}</p>

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="px-2 py-1 bg-gray-800 rounded">
                    <span className="text-gray-500">Type: </span>
                    <span className="text-gray-300">{typeLabels[selected.manifest.type] || selected.manifest.type}</span>
                  </div>
                  <div className="px-2 py-1 bg-gray-800 rounded">
                    <span className="text-gray-500">Status: </span>
                    <span className={selected.enabled ? "text-green-400" : "text-gray-500"}>
                      {selected.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                  <div className="px-2 py-1 bg-gray-800 rounded">
                    <span className="text-gray-500">Activation: </span>
                    <span className="text-gray-300">{selected.manifest.activation || "always"}</span>
                  </div>
                </div>

                {pluginSrc && (
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Plugin Source ({selected.manifest.main}):</div>
                    <pre className="p-3 bg-gray-800 rounded text-xs text-gray-300 overflow-x-auto max-h-[30vh] font-mono">
                      {pluginSrc}
                    </pre>
                  </div>
                )}

                <div className="text-xs text-gray-600">
                  Plugin path: <code className="text-gray-500">{selected.path}</code>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-500 text-xs gap-2">
                <span className="text-2xl">🔌</span>
                <span>Select a plugin to view details</span>
                <span className="text-gray-600">
                  Place plugins in <code className="text-blue-400">~/.latex-editor/plugins/</code>
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
