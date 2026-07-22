import { useState } from "react";
import { useAppStore } from "../../stores/useAppStore";
import {
  readFile,
  renameFile,
  deleteFile,
  createDirectory,
  writeFile,
  refreshFiles,
} from "../../hooks/useTauriCommands";
import type { FileEntry } from "../../types";
import { Icon } from "../icons";
import { fileIcon } from "../../lib/file-icons";

const TEX_EXTENSIONS = new Set([".tex", ".sty", ".cls", ".bib", ".bst"]);
const IMAGE_EXTENSIONS = new Set([".pdf", ".png", ".jpg", ".jpeg", ".eps", ".svg"]);
const SUPPORTED_EXTENSIONS = new Set([
  ...TEX_EXTENSIONS,
  ...IMAGE_EXTENSIONS,
  ".log",
  ".aux",
  ".toc",
  ".bbl",
  ".blg",
  ".out",
  ".synctex.gz",
  ".txt",
  ".md",
  ".json",
  ".cfg",
]);

function parentOf(path: string): string {
  return path.substring(0, path.lastIndexOf("/"));
}

function FileTreeItem({
  entry,
  depth,
  onSelect,
}: {
  entry: FileEntry;
  depth: number;
  onSelect: (path: string) => void;
}) {
  const { expandedDirs, toggleDir, activeFilePath } = useAppStore();
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(entry.name);
  const [error, setError] = useState<string | null>(null);

  const isExpanded = expandedDirs.has(entry.path);
  const isActive = activeFilePath === entry.path;

  const handleClick = () => {
    if (entry.is_dir) {
      toggleDir(entry.path);
    } else if (SUPPORTED_EXTENSIONS.has(`.${entry.extension}`) || !entry.extension) {
      onSelect(entry.path);
    }
  };

  const handleRename = async () => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === entry.name) {
      setNewName(entry.name);
      setRenaming(false);
      return;
    }
    const newPath = `${parentOf(entry.path)}/${trimmed}`;
    try {
      await renameFile(entry.path, newPath);
      // A renamed file keeps its tab, at the new path. Reopening under the new
      // name and closing the old one also disposes the stale Monaco model,
      // which is keyed by path.
      const store = useAppStore.getState();
      const open = store.tabs.find((t) => t.path === entry.path);
      if (open) {
        store.openFile(newPath, open.content);
        store.closeTab(entry.path);
      }
      await refreshFiles();
    } catch (e) {
      setNewName(entry.name);
      setError(String(e));
    }
    setRenaming(false);
  };

  const handleDelete = async () => {
    const what = entry.is_dir ? `folder "${entry.name}" and everything in it` : `"${entry.name}"`;
    if (!window.confirm(`Delete ${what}? This cannot be undone.`)) return;
    try {
      await deleteFile(entry.path);
      // A deleted file must not leave a tab that writes it back on close.
      useAppStore.getState().closeTab(entry.path);
      await refreshFiles();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div>
      <div
        className={`group flex items-center gap-1.5 pr-2 h-7 cursor-pointer rounded-md text-bodyall transition-colors ${
          isActive
            ? "bg-accent-subtle text-accent"
            : "text-ink-2 hover:bg-hover hover:text-ink"
        }`}
        style={{ paddingLeft: `${depth * 14 + 6}px` }}
        onClick={handleClick}
      >
        {entry.is_dir && (
          <Icon
            name="chevron-right"
            size={12}
            className={`text-ink-3 transition-transform ${isExpanded ? "rotate-90" : ""}`}
          />
        )}
        {!entry.is_dir && <span className="w-3 shrink-0" />}
        <Icon
          name={fileIcon(entry.extension, entry.is_dir, isExpanded)}
          size={15}
          className={entry.is_dir ? "text-ink-3" : "text-ink-3"}
        />
        {renaming ? (
          <input
            className="flex-1 min-w-0 bg-overlay text-ink text-bodyall px-1.5 py-0.5 rounded border border-accent outline-none"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRename();
              if (e.key === "Escape") {
                setNewName(entry.name);
                setRenaming(false);
              }
            }}
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <>
            <span className="truncate flex-1">{entry.name}</span>
            <span className="hidden group-hover:flex items-center gap-0.5">
              <button
                title="Rename"
                onClick={(e) => {
                  e.stopPropagation();
                  setNewName(entry.name);
                  setRenaming(true);
                }}
                className="grid place-items-center w-5 h-5 rounded text-ink-3 hover:text-ink hover:bg-hover"
              >
                <Icon name="pencil" size={12} />
              </button>
              <button
                title="Delete"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete();
                }}
                className="grid place-items-center w-5 h-5 rounded text-ink-3 hover:text-danger hover:bg-hover"
              >
                <Icon name="trash" size={12} />
              </button>
            </span>
          </>
        )}
      </div>
      {error && (
        <div
          className="text-tiny text-danger px-2 py-0.5 truncate cursor-pointer"
          style={{ paddingLeft: `${depth * 16 + 24}px` }}
          onClick={() => setError(null)}
        >
          {error}
        </div>
      )}
      {entry.is_dir && isExpanded && entry.children && (
        <div>
          {entry.children.map((child) => (
            <FileTreeItem
              key={child.path}
              entry={child}
              depth={depth + 1}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FileTree() {
  const { files, projectPath, activeFilePath, openFile } = useAppStore();
  const [error, setError] = useState<string | null>(null);

  const handleSelect = async (path: string) => {
    try {
      openFile(path, await readFile(path));
    } catch (e) {
      setError(`Failed to read file: ${e}`);
    }
  };

  // New items land next to the open file, or at the project root if none.
  const targetDir = activeFilePath ? parentOf(activeFilePath) : projectPath;

  const handleNewFile = async () => {
    if (!targetDir) return;
    const name = window.prompt("New file name", "untitled.tex");
    if (!name?.trim()) return;
    const path = `${targetDir}/${name.trim()}`;
    try {
      await writeFile(path, "");
      await refreshFiles();
      openFile(path, "");
    } catch (e) {
      setError(`Failed to create file: ${e}`);
    }
  };

  const handleNewFolder = async () => {
    if (!targetDir) return;
    const name = window.prompt("New folder name", "section");
    if (!name?.trim()) return;
    try {
      await createDirectory(`${targetDir}/${name.trim()}`);
      await refreshFiles();
    } catch (e) {
      setError(`Failed to create folder: ${e}`);
    }
  };

  return (
    <div className="h-full w-full flex flex-col bg-base">
      <div className="flex items-center justify-between pl-3 pr-1.5 h-8 shrink-0 border-b border-edge">
        <span className="panel-label">Files</span>
        {projectPath && (
          <div className="flex items-center gap-0.5">
            <button onClick={handleNewFile} title="New file" className="grid place-items-center w-6 h-6 rounded text-ink-3 hover:text-ink hover:bg-hover transition-colors">
              <Icon name="plus" size={15} />
            </button>
            <button onClick={handleNewFolder} title="New folder" className="grid place-items-center w-6 h-6 rounded text-ink-3 hover:text-ink hover:bg-hover transition-colors">
              <Icon name="folder-plus" size={15} />
            </button>
            <button
              onClick={() => refreshFiles().catch((e) => setError(String(e)))}
              title="Refresh"
              className="grid place-items-center w-6 h-6 rounded text-ink-3 hover:text-ink hover:bg-hover transition-colors"
            >
              <Icon name="refresh" size={15} />
            </button>
          </div>
        )}
      </div>
      {error && (
        <div
          className="px-3 py-1.5 text-tiny text-danger bg-danger-subtle cursor-pointer"
          onClick={() => setError(null)}
          title="Click to dismiss"
        >
          {error}
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-1.5">
        {files.length === 0 ? (
          // An open-but-empty project is a real state — you have just made a
          // folder, or an agent is about to write into it. Telling someone to
          // open a project they already have open is confusing and, worse,
          // suggests the open failed.
          <div className="px-4 py-6 text-ink-3 text-tiny text-center">
            {projectPath ? (
              <>
                This project has no files yet.
                <br />
                Use <span className="text-ink-2">+</span> above to create one.
              </>
            ) : (
              "Open a project folder to browse files"
            )}
          </div>
        ) : (
          files.map((entry) => (
            <FileTreeItem
              key={entry.path}
              entry={entry}
              depth={0}
              onSelect={handleSelect}
            />
          ))
        )}
      </div>
    </div>
  );
}
