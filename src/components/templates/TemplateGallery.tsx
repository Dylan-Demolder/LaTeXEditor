import { useState, useCallback } from "react";
import { Icon } from "../icons";
import { templates, type LaTeXTemplate } from "../../data/templates";
import { useAppStore } from "../../stores/useAppStore";
import { createDirectory, writeFile, openProject } from "../../hooks/useTauriCommands";

interface Props {
  onClose: () => void;
}

export default function TemplateGallery({ onClose }: Props) {
  const { projectPath, setFiles, setActiveFile, setActiveFileContent } =
    useAppStore();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<LaTeXTemplate | null>(
    null
  );
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = templates.filter((t) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      t.name.toLowerCase().includes(term) ||
      t.description.toLowerCase().includes(term) ||
      t.tags.some((tag) => tag.toLowerCase().includes(term))
    );
  });

  const handleCreate = useCallback(async () => {
    if (!selectedTemplate || !projectPath) return;

    setIsCreating(true);
    setError(null);

    try {
      const basePath = `${projectPath}/${selectedTemplate.name
        .toLowerCase()
        .replace(/\s+/g, "-")}`;

      for (const file of selectedTemplate.files) {
        const filePath = `${basePath}/${file.path}`;
        const dir = filePath.substring(0, filePath.lastIndexOf("/"));
        if (dir) {
          await createDirectory(dir);
        }
        await writeFile(filePath, file.content);
      }

      const mainFilePath = `${basePath}/${selectedTemplate.mainFile}`;
      setActiveFile(mainFilePath);
      setActiveFileContent(
        selectedTemplate.files.find((f) => f.path === selectedTemplate.mainFile)
          ?.content || ""
      );

      const result = await openProject(projectPath);
      setFiles(result.files);

      onClose();
    } catch (e) {
      setError(`Failed to create template: ${e}`);
    } finally {
      setIsCreating(false);
    }
  }, [selectedTemplate, projectPath, onClose, setFiles, setActiveFile, setActiveFileContent]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-base border border-edge-strong rounded-xl w-[750px] max-h-[80vh] flex flex-col shadow-[var(--shadow-overlay)]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-edge">
          <h2 className="text-body font-medium text-ink">Template Gallery</h2>
          <button
            onClick={onClose}
            className="grid place-items-center w-7 h-7 rounded-md text-ink-2 hover:text-ink hover:bg-hover transition-colors"
          >
            <Icon name="close" size={15} />
          </button>
        </div>

        {selectedTemplate ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-2 border-b border-edge">
              <button
                onClick={() => setSelectedTemplate(null)}
                className="text-ink-2 hover:text-ink text-tiny"
              >
                Back to gallery
              </button>
              <span className="text-tiny text-ink-3">
                {selectedTemplate.icon} {selectedTemplate.name}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <p className="text-body text-ink-2">{selectedTemplate.description}</p>

              <div className="flex flex-wrap gap-1">
                {selectedTemplate.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 text-tiny bg-hover text-ink-2 rounded"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <div>
                <h3 className="text-tiny font-medium text-ink-2 mb-2">
                  Files ({selectedTemplate.files.length})
                </h3>
                <div className="space-y-1">
                  {selectedTemplate.files.map((file) => (
                    <div
                      key={file.path}
                      className="flex items-center gap-2 px-2 py-1 bg-raised rounded text-tiny"
                    >
                      <span className="text-ink-3">
                        <Icon name={file.path.endsWith(".tex") ? "file-tex" : "file"} size={14} className="text-ink-3" />
                      </span>
                      <span className="text-ink">{file.path}</span>
                    </div>
                  ))}
                </div>
              </div>

              {error && (
                <div className="px-3 py-2 bg-danger-subtle border border-danger/40 rounded text-tiny text-danger">
                  {error}
                </div>
              )}

              <button
                onClick={handleCreate}
                disabled={isCreating || !projectPath}
                className={`w-full px-4 py-2 text-body font-medium rounded transition-colors ${
                  !projectPath
                    ? "bg-hover text-ink-3 cursor-not-allowed"
                    : isCreating
                      ? "bg-accent-subtle text-accent"
                      : "bg-accent hover:bg-accent-hover text-accent-fg"
                }`}
              >
                {!projectPath
                  ? "Open a project first"
                  : isCreating
                    ? "Creating..."
                    : "Create Project from Template"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="px-4 py-2 border-b border-edge">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filter templates..."
                className="w-full bg-hover text-ink text-tiny px-2 py-1.5 rounded border border-edge-strong outline-none focus:border-accent"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-2 gap-3">
                {filtered.map((tmpl) => (
                  <div
                    key={tmpl.id}
                    onClick={() => setSelectedTemplate(tmpl)}
                    className="p-3 bg-raised hover:bg-raised border border-edge rounded-xl cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">{tmpl.icon}</span>
                      <span className="text-body font-medium text-ink">
                        {tmpl.name}
                      </span>
                    </div>
                    <p className="text-tiny text-ink-3 mb-2 leading-relaxed">
                      {tmpl.description}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {tmpl.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="px-1.5 py-0.5 text-tiny bg-hover text-ink-3 rounded"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {filtered.length === 0 && (
                <div className="text-center py-8 text-ink-3 text-body">
                  No templates match your search
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
