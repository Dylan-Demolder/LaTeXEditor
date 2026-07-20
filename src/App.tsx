import { useEffect } from "react";
import MainLayout from "./components/layout/MainLayout";
import {
  loadSettings,
  saveSettings,
  ensureSampleProject,
  openProject,
  readFile,
} from "./hooks/useTauriCommands";
import { useAppStore } from "./stores/useAppStore";
import { applyTheme } from "./lib/theme";

/**
 * On the very first launch, drop the user into the bundled guide rather than an
 * empty window — it doubles as the documentation and as a real project to try
 * the editor on. Marked done in settings afterwards, so it happens once.
 */
async function openGuideOnFirstRun(): Promise<void> {
  const settings = await loadSettings();
  applyTheme(settings.theme === "light" ? "light" : "dark");

  if (settings.firstRunCompleted) return;

  // Record the attempt before opening. If something below throws, the user
  // still gets a normal empty editor next launch instead of a failure loop.
  await saveSettings({ ...settings, firstRunCompleted: true });

  const dir = await ensureSampleProject();
  const project = await openProject(dir);

  const store = useAppStore.getState();
  store.setProjectPath(project.root);
  store.setFiles(project.files);

  const mainPath = `${dir}/main.tex`;
  store.setActiveFile(mainPath);
  store.setActiveFileContent(await readFile(mainPath));
}

function App() {
  useEffect(() => {
    // Outside Tauri (browser dev) every command rejects; fall back to a themed
    // but otherwise empty editor rather than leaving the app unstyled.
    openGuideOnFirstRun().catch(() => applyTheme("dark"));
  }, []);

  return <MainLayout />;
}

export default App;
