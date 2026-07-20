import { useState, useEffect, useCallback } from "react";
import { PROVIDERS, DEFAULT_SETTINGS, type AppSettings } from "../../data/providers";
import {
  loadSettings,
  saveSettings,
  callAi,
} from "../../hooks/useTauriCommands";
import { aiSkills } from "../../data/ai-skills";
import { applyTheme } from "../../lib/theme";
import { Icon } from "../icons";

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
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-base p-6 rounded-xl text-ink text-body">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-base border border-edge-strong rounded-xl w-[650px] max-h-[85vh] flex flex-col shadow-[var(--shadow-overlay)]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-edge">
          <h2 className="text-body font-medium text-ink">Settings</h2>
          <button onClick={onClose} className="grid place-items-center w-7 h-7 rounded-md text-ink-2 hover:text-ink hover:bg-hover transition-colors"><Icon name="close" size={15} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Provider Selection */}
          <div>
            <h3 className="text-tiny font-medium text-ink-2 mb-2">AI Provider</h3>
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
              className="w-full bg-hover text-ink text-tiny px-2 py-1.5 rounded border border-edge-strong"
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Model Selection */}
          <div>
            <h3 className="text-tiny font-medium text-ink-2 mb-2">Model</h3>
            <select
              value={settings.activeModel}
              onChange={(e) => setSettings((s) => ({ ...s, activeModel: e.target.value }))}
              className="w-full bg-hover text-ink text-tiny px-2 py-1.5 rounded border border-edge-strong"
            >
              {activeProvider?.models.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          {/* API Keys */}
          <div>
            <h3 className="text-tiny font-medium text-ink-2 mb-2">API Keys</h3>
            <div className="space-y-2">
              {PROVIDERS.filter((p) => p.requiresApiKey).map((p) => (
                <div key={p.id} className="flex items-center gap-2">
                  <span className="text-tiny text-ink-2 w-24">{p.name.replace(/\(.*\)/, "").trim()}</span>
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
                      className="flex-1 bg-hover text-ink text-tiny px-2 py-1 rounded border border-edge-strong font-mono"
                    />
                    <button
                      onClick={() => setShowKeys((s) => ({ ...s, [p.id]: !s[p.id] }))}
                      className="grid place-items-center w-8 rounded-md bg-hover hover:bg-edge-strong text-ink-2 transition-colors"
                    >
                      <Icon name={showKeys[p.id] ? "eye-off" : "eye"} size={14} />
                    </button>
                  </div>
                  <a
                    href={p.apiDocs}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-tiny text-accent hover:text-accent-hover min-w-[50px] text-right"
                  >
                    Get key →
                  </a>
                </div>
              ))}
            </div>
          </div>

          {/* Appearance */}
          <div>
            <h3 className="panel-label mb-2">Appearance</h3>
            <div className="flex gap-2">
              {(["dark", "light"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setSettings((s) => ({ ...s, theme: t }));
                    // Apply immediately so the choice is visible before saving.
                    applyTheme(t);
                  }}
                  className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border text-tiny capitalize transition-colors ${
                    settings.theme === t
                      ? "border-accent bg-accent-subtle text-accent"
                      : "border-edge text-ink-2 hover:border-edge-strong hover:text-ink"
                  }`}
                >
                  <span
                    className="w-4 h-4 rounded border border-edge-strong shrink-0"
                    style={{ background: t === "dark" ? "#16130f" : "#f4f0e6" }}
                  />
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Parameters */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <h3 className="text-tiny font-medium text-ink-2 mb-1">Temperature ({settings.temperature})</h3>
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
              <h3 className="text-tiny font-medium text-ink-2 mb-1">Max Tokens</h3>
              <select
                value={settings.maxTokens}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, maxTokens: parseInt(e.target.value) }))
                }
                className="w-full bg-hover text-ink text-tiny px-2 py-1.5 rounded border border-edge-strong"
              >
                <option value={1024}>1,024</option>
                <option value={2048}>2,048</option>
                <option value={4096}>4,096</option>
                <option value={8192}>8,192</option>
                <option value={16384}>16,384</option>
                <option value={32768}>32,768</option>
                <option value={65536}>65,536</option>
              </select>
            </div>
          </div>

          {/* Reasoning */}
          <div>
            <h3 className="panel-label mb-2">Speed</h3>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.reduceReasoning !== false}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, reduceReasoning: e.target.checked }))
                }
                className="mt-0.5 accent-[var(--accent)]"
              />
              <span className="text-tiny text-ink-2">
                <span className="text-ink">Answer directly, without deliberating</span>
                <br />
                Skills work on short passages, where a model that thinks first costs
                several times the wait for the same edit. Measured on OpenCode Go: 1.3s
                instead of 7.0s. Turn this off if you want the model to reason at length.
              </span>
            </label>
          </div>

          {/* Test Connection */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleTest}
              disabled={testing}
              className={`px-3 py-1.5 text-tiny rounded transition-colors ${
                testing
                  ? "bg-hover text-ink-3"
                  : "bg-hover hover:bg-edge-strong text-ink"
              }`}
            >
              {testing ? "Testing..." : "Test Connection"}
            </button>
            {testResult && (
              <span className={`text-tiny ${testResult.startsWith("Connected") ? "text-success" : "text-danger"}`}>
                {testResult}
              </span>
            )}
          </div>

          {/* Available Skills Summary */}
          <div>
            <h3 className="text-tiny font-medium text-ink-2 mb-2">AI Skills Available</h3>
            <div className="grid grid-cols-2 gap-1">
              {aiSkills.map((s) => (
                <div key={s.id} className="flex items-center gap-1.5 text-tiny text-ink-3">
                  <span>{s.icon}</span>
                  <span className="truncate">{s.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-edge bg-hover/50 rounded-b-lg">
          <span className="text-tiny text-ink-3">
            Settings stored in ~/.latex-editor/settings.json
          </span>
          <div className="flex items-center gap-2">
            {saveMsg && <span className="text-tiny text-success">{saveMsg}</span>}
            <button
              onClick={onClose}
              className="px-3 py-1 text-tiny bg-hover hover:bg-edge-strong text-ink rounded"
            >
              Close
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1 text-tiny bg-accent hover:bg-accent-hover text-accent-fg rounded disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
