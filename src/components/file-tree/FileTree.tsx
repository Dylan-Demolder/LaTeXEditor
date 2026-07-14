import { useState } from "react";
import { useAppStore } from "../../stores/useAppStore";
import { readFile, renameFile } from "../../hooks/useTauriCommands";
import type { FileEntry } from "../../types";

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

function getFileIcon(entry: FileEntry): string {
  if (entry.is_dir) return "📁";
  if (!entry.extension) return "📄";
  if (TEX_EXTENSIONS.has(`.${entry.extension}`)) return "📝";
  if (entry.extension === "pdf") return "📕";
  if (IMAGE_EXTENSIONS.has(`.${entry.extension}`)) return "🖼️";
  if (entry.extension === "log") return "📋";
  return "📄";
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
    if (newName && newName !== entry.name) {
      const parent = entry.path.substring(0, entry.path.lastIndexOf("/"));
      const newPath = `${parent}/${newName}`;
      try {
        await renameFile(entry.path, newPath);
      } catch (e) {
        console.error("Rename failed:", e);
      }
    }
    setRenaming(false);
  };

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-2 py-0.5 cursor-pointer hover:bg-gray-700/50 text-sm ${
          isActive ? "bg-blue-800/50 text-blue-200" : "text-gray-300"
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
      >
        {entry.is_dir && (
          <span className="text-xs w-3 text-gray-500">
            {isExpanded ? "▾" : "▸"}
          </span>
        )}
        {!entry.is_dir && <span className="w-3" />}
        <span className="text-xs">{getFileIcon(entry)}</span>
        {renaming ? (
          <input
            className="flex-1 bg-gray-700 text-gray-200 text-xs px-1 py-0 rounded outline-none"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRename();
              if (e.key === "Escape") setRenaming(false);
            }}
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="truncate text-xs">{entry.name}</span>
        )}
      </div>
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
  const { files, setActiveFile, setActiveFileContent } = useAppStore();

  const handleSelect = async (path: string) => {
    try {
      const content = await readFile(path);
      setActiveFile(path);
      setActiveFileContent(content);
    } catch (e) {
      console.error("Failed to read file:", e);
    }
  };

  return (
    <div className="h-full w-full flex flex-col bg-gray-850">
      <div className="px-3 py-1.5 bg-gray-800 border-b border-gray-700 text-gray-300 text-xs font-medium">
        Files
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {files.length === 0 ? (
          <div className="px-4 py-4 text-gray-500 text-xs">
            Open a project folder to browse files
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
