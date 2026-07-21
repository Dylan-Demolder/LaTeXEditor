import { useEffect, useState, useCallback } from "react";
import MainLayout from "./components/layout/MainLayout";
import WelcomeDialog from "./components/onboarding/WelcomeDialog";
import {
  loadSettings,
  saveSettings,
  ensureSampleProject,
  openTutorial,
  listPlugins,
} from "./hooks/useTauriCommands";
import { setPluginSnippets } from "./components/editor/latex-language";
import type { PluginSnippet } from "./plugins/types";
import { openProjectAt } from "./lib/open-project";
import { useAppStore } from "./stores/useAppStore";
import { applyTheme } from "./lib/theme";
import { DEFAULT_EDITOR_PREFS } from "./stores/useAppStore";

/**
 * Push saved preferences into the store on launch.
 *
 * The editor reads these from the store rather than from the settings file, so
 * a change in Settings takes effect immediately instead of at next launch.
 */
function applyPreferences(settings: Awaited<ReturnType<typeof loadSettings>>): void {
  applyTheme(settings.theme === "light" ? "light" : "dark");

  const store = useAppStore.getState();
  store.setEditorPrefs({
    fontSize: settings.editorFontSize ?? DEFAULT_EDITOR_PREFS.fontSize,
    lineHeight: settings.editorLineHeight ?? DEFAULT_EDITOR_PREFS.lineHeight,
    tabSize: settings.editorTabSize ?? DEFAULT_EDITOR_PREFS.tabSize,
    wordWrap: settings.editorWordWrap ?? DEFAULT_EDITOR_PREFS.wordWrap,
    lineNumbers: settings.editorLineNumbers ?? DEFAULT_EDITOR_PREFS.lineNumbers,
    minimap: settings.editorMinimap ?? DEFAULT_EDITOR_PREFS.minimap,
    autosaveDelayMs: settings.autosaveDelayMs ?? DEFAULT_EDITOR_PREFS.autosaveDelayMs,
  });
  if (settings.defaultCompiler) store.setSelectedCompiler(settings.defaultCompiler);
  store.setAutoCompile(settings.autoCompile ?? false);
}

function App() {
  const [showWelcome, setShowWelcome] = useState(false);
  const [openingTutorial, setOpeningTutorial] = useState(false);

  useEffect(() => {
    // Outside Tauri (browser dev) every command rejects; fall back to a themed
    // but otherwise empty editor rather than leaving the app unstyled.
    // Installed plugins contribute snippets to the completion list. Failing to
    // read them must never stop the editor loading — a broken plugin folder
    // costs you its snippets, not your app.
    listPlugins()
      .then((plugins) =>
        setPluginSnippets(
          plugins
            .filter((p) => p.enabled)
            .flatMap((p) =>
              (p.manifest.snippets ?? []).map((s: PluginSnippet) => ({ ...s, source: p.manifest.name }))
            )
        )
      )
      .catch(() => {});

    (async () => {
      const settings = await loadSettings();
      applyPreferences(settings);

      if (settings.firstRunCompleted) return;

      // Write the sample projects out regardless, so Settings can offer them
      // even if the welcome dialog is dismissed.
      await ensureSampleProject().catch(() => {});

      if (settings.offerTutorialOnLaunch ?? true) setShowWelcome(true);
    })().catch(() => applyTheme("dark"));
  }, []);

  /** Record that first run is done, whichever button was pressed. */
  const completeFirstRun = useCallback(async () => {
    const settings = await loadSettings();
    await saveSettings({ ...settings, firstRunCompleted: true });
  }, []);

  const handleStartTutorial = useCallback(async () => {
    setOpeningTutorial(true);
    try {
      // Not `fresh`: on first launch there is nothing to reset, and a stray
      // reset would move aside a folder the user may already have opened.
      const dir = await openTutorial(false);
      await openProjectAt(dir, "main.tex");
      await completeFirstRun();
      setShowWelcome(false);
    } catch {
      setOpeningTutorial(false);
    }
  }, [completeFirstRun]);

  const handleSkip = useCallback(async () => {
    await completeFirstRun().catch(() => {});
    setShowWelcome(false);
  }, [completeFirstRun]);

  return (
    <>
      <MainLayout />
      {showWelcome && (
        <WelcomeDialog
          onStartTutorial={handleStartTutorial}
          onSkip={handleSkip}
          busy={openingTutorial}
        />
      )}
    </>
  );
}

export default App;
