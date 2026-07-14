import { useState, useCallback } from "react";
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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-850 border border-gray-600 rounded-lg w-[750px] max-h-[80vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h2 className="text-sm font-medium text-gray-200">Template Gallery</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-lg leading-none"
          >
            ×
          </button>
        </div>

        {selectedTemplate ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-700">
              <button
                onClick={() => setSelectedTemplate(null)}
                className="text-gray-400 hover:text-white text-xs"
              >
                Back to gallery
              </button>
              <span className="text-xs text-gray-500">
                {selectedTemplate.icon} {selectedTemplate.name}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <p className="text-sm text-gray-400">{selectedTemplate.description}</p>

              <div className="flex flex-wrap gap-1">
                {selectedTemplate.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 text-xs bg-gray-700 text-gray-400 rounded"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <div>
                <h3 className="text-xs font-medium text-gray-400 mb-2">
                  Files ({selectedTemplate.files.length})
                </h3>
                <div className="space-y-1">
                  {selectedTemplate.files.map((file) => (
                    <div
                      key={file.path}
                      className="flex items-center gap-2 px-2 py-1 bg-gray-800 rounded text-xs"
                    >
                      <span className="text-gray-500">
                        {file.path.endsWith(".tex") ? "📝" : "📄"}
                      </span>
                      <span className="text-gray-300">{file.path}</span>
                    </div>
                  ))}
                </div>
              </div>

              {error && (
                <div className="px-3 py-2 bg-red-900/30 border border-red-700 rounded text-xs text-red-400">
                  {error}
                </div>
              )}

              <button
                onClick={handleCreate}
                disabled={isCreating || !projectPath}
                className={`w-full px-4 py-2 text-sm font-medium rounded transition-colors ${
                  !projectPath
                    ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                    : isCreating
                      ? "bg-blue-700 text-blue-300"
                      : "bg-blue-600 hover:bg-blue-500 text-white"
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
            <div className="px-4 py-2 border-b border-gray-700">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filter templates..."
                className="w-full bg-gray-700 text-gray-200 text-xs px-2 py-1.5 rounded border border-gray-600 outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-2 gap-3">
                {filtered.map((tmpl) => (
                  <div
                    key={tmpl.id}
                    onClick={() => setSelectedTemplate(tmpl)}
                    className="p-3 bg-gray-800 hover:bg-gray-750 border border-gray-700 rounded-lg cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">{tmpl.icon}</span>
                      <span className="text-sm font-medium text-gray-200">
                        {tmpl.name}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mb-2 leading-relaxed">
                      {tmpl.description}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {tmpl.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="px-1.5 py-0.5 text-xs bg-gray-700 text-gray-500 rounded"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {filtered.length === 0 && (
                <div className="text-center py-8 text-gray-500 text-sm">
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
