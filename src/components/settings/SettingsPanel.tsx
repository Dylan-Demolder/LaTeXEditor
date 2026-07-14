import { useState, useEffect, useCallback } from "react";
import { PROVIDERS, DEFAULT_SETTINGS, type AppSettings } from "../../data/providers";
import {
  loadSettings,
  saveSettings,
  callAi,
} from "../../hooks/useTauriCommands";
import { aiSkills } from "../../data/ai-skills";

interface Props {
  onClose: () => void;
}

export default function SettingsPanel({ onClose }: Props) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    loadSettings().then((s) => {
      setSettings(s as AppSettings);
      setLoading(false);
    });
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      await saveSettings(settings);
      setSaveMsg("Settings saved");
      setTimeout(() => setSaveMsg(null), 2000);
    } catch (e) {
      setSaveMsg(`Save failed: ${e}`);
    } finally {
      setSaving(false);
    }
  }, [settings]);

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await callAi({
        provider: settings.activeProvider,
        model: settings.activeModel,
        systemPrompt: "You are a helpful assistant. Reply with exactly: OK",
        userPrompt: "Say OK",
        temperature: 0,
        maxTokens: 10,
      });
      setTestResult(`Connected! Model: ${result.model}`);
    } catch (e) {
      setTestResult(`Connection failed: ${e}`);
    } finally {
      setTesting(false);
    }
  }, [settings.activeProvider, settings.activeModel]);

  const activeProvider = PROVIDERS.find((p) => p.id === settings.activeProvider);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <div className="bg-gray-850 p-6 rounded-lg text-gray-300 text-sm">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-850 border border-gray-600 rounded-lg w-[650px] max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h2 className="text-sm font-medium text-gray-200">Settings</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Provider Selection */}
          <div>
            <h3 className="text-xs font-medium text-gray-400 mb-2">AI Provider</h3>
            <select
              value={settings.activeProvider}
              onChange={(e) => {
                const newProvider = e.target.value;
                const provider = PROVIDERS.find((p) => p.id === newProvider);
                setSettings((s) => ({
                  ...s,
                  activeProvider: newProvider,
                  activeModel: provider?.models[0]?.id || "",
                }));
              }}
              className="w-full bg-gray-700 text-gray-200 text-xs px-2 py-1.5 rounded border border-gray-600"
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Model Selection */}
          <div>
            <h3 className="text-xs font-medium text-gray-400 mb-2">Model</h3>
            <select
              value={settings.activeModel}
              onChange={(e) => setSettings((s) => ({ ...s, activeModel: e.target.value }))}
              className="w-full bg-gray-700 text-gray-200 text-xs px-2 py-1.5 rounded border border-gray-600"
            >
              {activeProvider?.models.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          {/* API Keys */}
          <div>
            <h3 className="text-xs font-medium text-gray-400 mb-2">API Keys</h3>
            <div className="space-y-2">
              {PROVIDERS.filter((p) => p.requiresApiKey).map((p) => (
                <div key={p.id} className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-24">{p.name.replace(/\(.*\)/, "").trim()}</span>
                  <div className="flex-1 flex gap-1">
                    <input
                      type={showKeys[p.id] ? "text" : "password"}
                      value={settings.apiKeys[p.id] || ""}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          apiKeys: { ...s.apiKeys, [p.id]: e.target.value },
                        }))
                      }
                      placeholder={p.id === "openai" ? "sk-..." : p.id === "anthropic" ? "sk-ant-..." : "Enter key"}
                      className="flex-1 bg-gray-700 text-gray-200 text-xs px-2 py-1 rounded border border-gray-600 font-mono"
                    />
                    <button
                      onClick={() => setShowKeys((s) => ({ ...s, [p.id]: !s[p.id] }))}
                      className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-400 rounded"
                    >
                      {showKeys[p.id] ? "🙈" : "👁"}
                    </button>
                  </div>
                  <a
                    href={p.apiDocs}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-400 hover:text-blue-300 min-w-[50px] text-right"
                  >
                    Get key →
                  </a>
                </div>
              ))}
            </div>
          </div>

          {/* Parameters */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <h3 className="text-xs font-medium text-gray-400 mb-1">Temperature ({settings.temperature})</h3>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={settings.temperature}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, temperature: parseFloat(e.target.value) }))
                }
                className="w-full"
              />
            </div>
            <div>
              <h3 className="text-xs font-medium text-gray-400 mb-1">Max Tokens</h3>
              <select
                value={settings.maxTokens}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, maxTokens: parseInt(e.target.value) }))
                }
                className="w-full bg-gray-700 text-gray-200 text-xs px-2 py-1.5 rounded border border-gray-600"
              >
                <option value={1024}>1,024</option>
                <option value={2048}>2,048</option>
                <option value={4096}>4,096</option>
                <option value={8192}>8,192</option>
                <option value={16384}>16,384</option>
              </select>
            </div>
          </div>

          {/* Test Connection */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleTest}
              disabled={testing}
              className={`px-3 py-1.5 text-xs rounded transition-colors ${
                testing
                  ? "bg-gray-700 text-gray-500"
                  : "bg-gray-700 hover:bg-gray-600 text-gray-200"
              }`}
            >
              {testing ? "Testing..." : "Test Connection"}
            </button>
            {testResult && (
              <span className={`text-xs ${testResult.startsWith("Connected") ? "text-green-400" : "text-red-400"}`}>
                {testResult}
              </span>
            )}
          </div>

          {/* Available Skills Summary */}
          <div>
            <h3 className="text-xs font-medium text-gray-400 mb-2">AI Skills Available</h3>
            <div className="grid grid-cols-2 gap-1">
              {aiSkills.map((s) => (
                <div key={s.id} className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span>{s.icon}</span>
                  <span className="truncate">{s.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-700 bg-gray-800/50 rounded-b-lg">
          <span className="text-xs text-gray-500">
            Settings stored in ~/.latex-editor/settings.json
          </span>
          <div className="flex items-center gap-2">
            {saveMsg && <span className="text-xs text-green-400">{saveMsg}</span>}
            <button
              onClick={onClose}
              className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded"
            >
              Close
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
