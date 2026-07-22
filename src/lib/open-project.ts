import { openProject, readFile } from "../hooks/useTauriCommands";
import { useAppStore } from "../stores/useAppStore";

/**
 * Open a folder as the project and optionally load one of its files.
 *
 * Extracted because three places now need it — first-run onboarding, "open the
 * tutorial again", and "open the guide" — and each had been about to grow its
 * own slightly different copy of the store updates.
 */
export async function openProjectAt(dir: string, fileToOpen?: string): Promise<void> {
  const project = await openProject(dir);

  const store = useAppStore.getState();
  store.setProjectPath(project.root);
  store.setFiles(project.files);

  if (!fileToOpen) return;

  const path = `${dir}/${fileToOpen}`;
  try {
    const content = await readFile(path);
    store.openFile(path, content);
  } catch {
    // A missing entry point should still leave the project open and browsable
    // rather than failing the whole operation.
  }
}
