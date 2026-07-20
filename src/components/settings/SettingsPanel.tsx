import { useState, useEffect, useCallback } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { PROVIDERS, DEFAULT_SETTINGS, type AppSettings } from "../../data/providers";
import {
  loadSettings,
  saveSettings,
  callAi,
  checkCompilers,
  getMcpStatus,
  openTutorial,
  openGuide,
  type McpStatus,
} from "../../hooks/useTauriCommands";
import { openProjectAt } from "../../lib/open-project";
import { aiSkills } from "../../data/ai-skills";
import { applyTheme } from "../../lib/theme";
import { useAppStore } from "../../stores/useAppStore";
import { Icon, type IconName } from "../icons";

interface Props {
  onClose: () => void;
}

const SECTIONS = [
  { id: "ai", label: "AI", icon: "sparkle" },
  { id: "editor", label: "Editor", icon: "file-tex" },
  { id: "compile", label: "Compilation", icon: "play" },
  { id: "appearance", label: "Appearance", icon: "eye" },
  { id: "help", label: "Help", icon: "info" },
  { id: "about", label: "About", icon: "box" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

/* ---------- small building blocks, so every row looks the same ---------- */

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-edge last:border-0">
      <div className="min-w-0">
        <div className="text-tiny text-ink">{label}</div>
        {hint && <div className="text-tiny text-ink-3 mt-0.5">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-9 h-5 rounded-full transition-colors ${
        checked ? "bg-accent" : "bg-edge-strong"
      }`}
    >
      {/* left-0 is load-bearing: a button centres its content, so an absolutely
          positioned knob with `auto` left starts from the middle and the
          translate pushes it clean out of the pill. */}
      <span
        className={`absolute left-0 top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-[1.125rem]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
}) {
  /**
   * Held as text while focused, and only clamped on blur.
   *
   * Clamping on every keystroke makes the field unusable: typing "20" into a
   * field with a minimum of 9 sees the intermediate "2", snaps it to 9, and you
   * end up with 9 or 90. The user has to be allowed to pass through an invalid
   * prefix on the way to a valid number.
   */
  const [draft, setDraft] = useState<string | null>(null);

  const commit = (raw: string) => {
    setDraft(null);
    const n = Number(raw);
    if (raw.trim() === "" || Number.isNaN(n)) return; // keep the previous value
    onChange(Math.max(min, Math.min(max, n)));
  };

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        value={draft ?? value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="w-16 bg-hover text-ink text-tiny px-2 py-1 rounded border border-edge-strong outline-none focus:border-accent tabular-nums"
      />
      {suffix && <span className="text-tiny text-ink-3">{suffix}</span>}
    </div>
  );
}

const selectClass =
  "bg-hover text-ink text-tiny px-2 py-1 rounded border border-edge-strong outline-none focus:border-accent";

export default function SettingsPanel({ onClose }: Props) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [section, setSection] = useState<SectionId>("ai");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  // About-panel facts, all read from the running app rather than assumed.
  const [version, setVersion] = useState("");
  const [compilers, setCompilers] = useState<string[]>([]);
  const [mcp, setMcp] = useState<McpStatus | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  useEffect(() => {
    loadSettings().then((s) => {
      setSettings(s as AppSettings);
      setLoading(false);
    });
    getVersion().then(setVersion).catch(() => {});
    checkCompilers().then(setCompilers).catch(() => {});
    getMcpStatus().then(setMcp).catch(() => {});
  }, []);

  const set = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((s) => ({ ...s, [key]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      await saveSettings(settings);

      // Push straight into the store so the editor changes under you rather
      // than at next launch — a font size you cannot see is not a setting.
      const store = useAppStore.getState();
      store.setEditorPrefs({
        fontSize: settings.editorFontSize,
        lineHeight: settings.editorLineHeight,
        tabSize: settings.editorTabSize,
        wordWrap: settings.editorWordWrap,
        lineNumbers: settings.editorLineNumbers,
        minimap: settings.editorMinimap,
        autosaveDelayMs: settings.autosaveDelayMs,
      });
      store.setAutoCompile(settings.autoCompile);
      if (settings.defaultCompiler) store.setSelectedCompiler(settings.defaultCompiler);

      setSaveMsg("Saved");
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
      setTestResult(`Connected — ${result.model}`);
    } catch (e) {
      setTestResult(`Failed: ${e}`);
    } finally {
      setTesting(false);
    }
  }, [settings.activeProvider, settings.activeModel]);

  /** Open one of the bundled projects and get out of the way. */
  const openBundled = useCallback(
    async (which: "tutorial-fresh" | "tutorial" | "guide") => {
      setBusyAction(which);
      try {
        const dir =
          which === "guide"
            ? await openGuide()
            : await openTutorial(which === "tutorial-fresh");
        await openProjectAt(dir, "main.tex");
        onClose();
      } catch (e) {
        setSaveMsg(`Could not open: ${e}`);
      } finally {
        setBusyAction(null);
      }
    },
    [onClose]
  );

  const activeProvider = PROVIDERS.find((p) => p.id === settings.activeProvider);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 grid place-items-center z-50">
        <div className="bg-base p-6 rounded-xl text-ink text-body">Loading settings…</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 grid place-items-center z-50">
      <div className="bg-base border border-edge-strong rounded-xl w-[720px] h-[560px] flex flex-col shadow-[var(--shadow-overlay)] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-edge">
          <h2 className="text-body font-medium text-ink">Settings</h2>
          <button
            onClick={onClose}
            className="grid place-items-center w-7 h-7 rounded-md text-ink-2 hover:text-ink hover:bg-hover transition-colors"
          >
            <Icon name="close" size={15} />
          </button>
        </div>

        <div className="flex-1 flex min-h-0">
          {/* Left nav — a single scrolling list of everything was already too
              long to scan, and this is about to grow further. */}
          <nav className="w-40 shrink-0 border-r border-edge py-2 bg-sunken">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-tiny transition-colors ${
                  section === s.id
                    ? "bg-accent-subtle text-accent"
                    : "text-ink-2 hover:text-ink hover:bg-hover"
                }`}
              >
                <Icon name={s.icon as IconName} size={14} />
                {s.label}
              </button>
            ))}
          </nav>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            {section === "ai" && (
              <>
                <Row label="Provider">
                  <select
                    value={settings.activeProvider}
                    onChange={(e) => {
                      const p = PROVIDERS.find((x) => x.id === e.target.value);
                      setSettings((s) => ({
                        ...s,
                        activeProvider: e.target.value,
                        activeModel: p?.models[0]?.id ?? s.activeModel,
                      }));
                    }}
                    className={selectClass}
                  >
                    {PROVIDERS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Row>

                <Row label="Model" hint={activeProvider?.name}>
                  <select
                    value={settings.activeModel}
                    onChange={(e) => set("activeModel", e.target.value)}
                    className={selectClass}
                  >
                    {activeProvider?.models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </Row>

                <Row
                  label="Answer directly, without deliberating"
                  hint="Skills work on short passages, where a model that thinks first costs several times the wait for the same edit. Measured on OpenCode Go: 1.3s instead of 7.0s."
                >
                  <Toggle
                    checked={settings.reduceReasoning !== false}
                    onChange={(v) => set("reduceReasoning", v)}
                  />
                </Row>

                <Row label="Temperature" hint="0 is deterministic, 2 is wild.">
                  <NumberInput
                    value={settings.temperature}
                    onChange={(v) => set("temperature", v)}
                    min={0}
                    max={2}
                    step={0.1}
                  />
                </Row>

                <Row
                  label="Max tokens"
                  hint="Deliberation is charged against the same budget as the answer, so a low cap can produce nothing at all."
                >
                  <select
                    value={settings.maxTokens}
                    onChange={(e) => set("maxTokens", parseInt(e.target.value))}
                    className={selectClass}
                  >
                    {[1024, 2048, 4096, 8192, 16384, 32768, 65536].map((n) => (
                      <option key={n} value={n}>
                        {n.toLocaleString()}
                      </option>
                    ))}
                  </select>
                </Row>

                <div className="pt-4">
                  <div className="panel-label mb-2">API keys</div>
                  <div className="space-y-2">
                    {PROVIDERS.filter((p) => p.requiresApiKey !== false).map((p) => (
                      <div key={p.id} className="flex items-center gap-2">
                        <span className="text-tiny text-ink-2 w-28 shrink-0 truncate">
                          {p.name}
                        </span>
                        <input
                          type={showKeys[p.id] ? "text" : "password"}
                          value={settings.apiKeys[p.id] || ""}
                          onChange={(e) =>
                            setSettings((s) => ({
                              ...s,
                              apiKeys: { ...s.apiKeys, [p.id]: e.target.value },
                            }))
                          }
                          placeholder="not set"
                          className="flex-1 bg-hover text-ink text-tiny px-2 py-1 rounded border border-edge-strong outline-none focus:border-accent font-mono"
                        />
                        <button
                          onClick={() =>
                            setShowKeys((k) => ({ ...k, [p.id]: !k[p.id] }))
                          }
                          className="grid place-items-center w-6 h-6 rounded text-ink-3 hover:text-ink hover:bg-hover"
                          title={showKeys[p.id] ? "Hide" : "Show"}
                        >
                          <Icon name={showKeys[p.id] ? "eye-off" : "eye"} size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className="text-tiny text-ink-3 mt-2">
                    Stored in ~/.latex-editor/settings.json, in plain text. Ollama
                    runs locally and needs no key.
                  </p>

                  <div className="flex items-center gap-3 mt-3">
                    <button
                      onClick={handleTest}
                      disabled={testing}
                      className="px-3 py-1.5 text-tiny rounded bg-hover hover:bg-edge-strong text-ink disabled:opacity-50"
                    >
                      {testing ? "Testing…" : "Test connection"}
                    </button>
                    {testResult && (
                      <span
                        className={`text-tiny ${
                          testResult.startsWith("Connected")
                            ? "text-success"
                            : "text-danger"
                        }`}
                      >
                        {testResult}
                      </span>
                    )}
                  </div>
                </div>
              </>
            )}

            {section === "editor" && (
              <>
                <Row label="Font size">
                  <NumberInput
                    value={settings.editorFontSize}
                    onChange={(v) => set("editorFontSize", v)}
                    min={9}
                    max={32}
                    suffix="px"
                  />
                </Row>
                <Row label="Line height">
                  <NumberInput
                    value={settings.editorLineHeight}
                    onChange={(v) => set("editorLineHeight", v)}
                    min={12}
                    max={48}
                    suffix="px"
                  />
                </Row>
                <Row label="Tab size">
                  <NumberInput
                    value={settings.editorTabSize}
                    onChange={(v) => set("editorTabSize", v)}
                    min={1}
                    max={8}
                    suffix="spaces"
                  />
                </Row>
                <Row
                  label="Word wrap"
                  hint="Off means long paragraphs scroll sideways."
                >
                  <Toggle
                    checked={settings.editorWordWrap}
                    onChange={(v) => set("editorWordWrap", v)}
                  />
                </Row>
                <Row label="Line numbers">
                  <Toggle
                    checked={settings.editorLineNumbers}
                    onChange={(v) => set("editorLineNumbers", v)}
                  />
                </Row>
                <Row label="Minimap" hint="The document overview down the right edge.">
                  <Toggle
                    checked={settings.editorMinimap}
                    onChange={(v) => set("editorMinimap", v)}
                  />
                </Row>
                <Row
                  label="Autosave delay"
                  hint="How long after you stop typing the file is written. 0 turns autosave off — then Cmd+S saves."
                >
                  <NumberInput
                    value={settings.autosaveDelayMs}
                    onChange={(v) => set("autosaveDelayMs", v)}
                    min={0}
                    max={10000}
                    step={250}
                    suffix="ms"
                  />
                </Row>
              </>
            )}

            {section === "compile" && (
              <>
                <Row
                  label="Compiler"
                  hint={
                    compilers.length
                      ? `Found: ${compilers.join(", ")}`
                      : "No LaTeX compiler found on this machine."
                  }
                >
                  <select
                    value={settings.defaultCompiler}
                    onChange={(e) => set("defaultCompiler", e.target.value)}
                    className={selectClass}
                  >
                    <option value="">First one found</option>
                    {compilers.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </Row>

                <Row
                  label="Typeset after every save"
                  hint="Convenient on a small document; on a long one it will compile more often than you want."
                >
                  <Toggle
                    checked={settings.autoCompile}
                    onChange={(v) => set("autoCompile", v)}
                  />
                </Row>

                <Row
                  label="Default preview zoom"
                  hint="Fit modes re-fit when you resize the pane."
                >
                  <select
                    value={settings.defaultPreviewZoom}
                    onChange={(e) => set("defaultPreviewZoom", e.target.value)}
                    className={selectClass}
                  >
                    <option value="fit-width">Fit width</option>
                    <option value="fit-page">Fit page</option>
                    <option value="100">100%</option>
                    <option value="120">120%</option>
                    <option value="150">150%</option>
                  </select>
                </Row>

                <p className="text-tiny text-ink-3 pt-3">
                  Output goes to a <span className="font-mono">build/</span> folder
                  beside your project. The editor runs one compiler pass per press,
                  so a fresh document needs two: cross-references are resolved from
                  the <span className="font-mono">.aux</span> file the first pass
                  writes.
                </p>
              </>
            )}

            {section === "appearance" && (
              <>
                <div className="panel-label mb-2">Theme</div>
                <div className="flex gap-2 mb-4">
                  {(["dark", "light"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => {
                        set("theme", t);
                        // Apply immediately: a theme you have to save to see is
                        // a theme you cannot choose between.
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
                <p className="text-tiny text-ink-3">
                  The editor is themed from the same tokens as the rest of the
                  window, so switching restyles the code too rather than leaving a
                  dark rectangle in a light app.
                </p>
              </>
            )}

            {section === "help" && (
              <>
                <div className="panel-label mb-2">Tutorial</div>
                <p className="text-tiny text-ink-3 mb-3">
                  Nine steps, about fifteen minutes, ending in a finished one-page
                  report. It covers typesetting, the inline assistant, and fixing a
                  compile error.
                </p>
                <div className="flex flex-wrap gap-2 mb-2">
                  <button
                    onClick={() => openBundled("tutorial")}
                    disabled={busyAction !== null}
                    className="px-3 py-1.5 text-tiny rounded bg-accent hover:bg-accent-hover text-accent-fg disabled:opacity-50"
                  >
                    {busyAction === "tutorial" ? "Opening…" : "Open tutorial"}
                  </button>
                  <button
                    onClick={() => openBundled("tutorial-fresh")}
                    disabled={busyAction !== null}
                    className="px-3 py-1.5 text-tiny rounded bg-hover hover:bg-edge-strong text-ink disabled:opacity-50"
                  >
                    {busyAction === "tutorial-fresh" ? "Resetting…" : "Start over"}
                  </button>
                </div>
                <p className="text-tiny text-ink-3 mb-5">
                  "Start over" restores the pristine copy. Your current one is not
                  deleted — it is renamed to{" "}
                  <span className="font-mono">LaTeXEditor Tutorial (previous 1)</span>{" "}
                  in Documents, in case you wrote something of your own into it.
                </p>

                <div className="panel-label mb-2">Reference guide</div>
                <p className="text-tiny text-ink-3 mb-3">
                  The full documentation, itself written as a LaTeXEditor project —
                  sixteen pages covering everything the tutorial only showed you.
                </p>
                <button
                  onClick={() => openBundled("guide")}
                  disabled={busyAction !== null}
                  className="px-3 py-1.5 text-tiny rounded bg-hover hover:bg-edge-strong text-ink disabled:opacity-50 mb-5"
                >
                  {busyAction === "guide" ? "Opening…" : "Open guide"}
                </button>

                <Row
                  label="Offer the tutorial on first launch"
                  hint="Only affects a fresh install, or a machine where first run has been reset."
                >
                  <Toggle
                    checked={settings.offerTutorialOnLaunch !== false}
                    onChange={(v) => set("offerTutorialOnLaunch", v)}
                  />
                </Row>
                <Row
                  label="Show the welcome screen again"
                  hint="Clears the first-run flag, so the next launch offers the tutorial."
                >
                  <Toggle
                    checked={settings.firstRunCompleted === false}
                    onChange={(v) => set("firstRunCompleted", !v)}
                  />
                </Row>
              </>
            )}

            {section === "about" && (
              <>
                <Row label="Version">
                  <span className="text-tiny text-ink-2 font-mono">
                    {version || "—"}
                  </span>
                </Row>
                <Row label="LaTeX compilers found">
                  <span className="text-tiny text-ink-2 font-mono">
                    {compilers.length ? compilers.join(", ") : "none"}
                  </span>
                </Row>
                <Row
                  label="MCP server"
                  hint="Lets an external agent read and write the open project."
                >
                  <span
                    className={`text-tiny font-mono ${
                      mcp?.running ? "text-success" : "text-ink-3"
                    }`}
                  >
                    {mcp?.running ? mcp.endpoint : "not running"}
                  </span>
                </Row>
                <Row label="Settings file">
                  <span className="text-tiny text-ink-2 font-mono">
                    ~/.latex-editor/settings.json
                  </span>
                </Row>
                <Row label="AI skills installed">
                  <span className="text-tiny text-ink-2 tabular-nums">
                    {aiSkills.length}
                  </span>
                </Row>

                <div className="pt-4">
                  <div className="panel-label mb-2">Skills</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    {aiSkills.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center gap-1.5 text-tiny text-ink-3"
                      >
                        <Icon name={s.icon} size={12} />
                        <span className="truncate">{s.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-edge bg-sunken">
          <span className="text-tiny text-ink-3">
            Changes apply when you save.
          </span>
          <div className="flex items-center gap-2">
            {saveMsg && (
              <span
                className={`text-tiny ${
                  saveMsg.startsWith("Saved") ? "text-success" : "text-danger"
                }`}
              >
                {saveMsg}
              </span>
            )}
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
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
