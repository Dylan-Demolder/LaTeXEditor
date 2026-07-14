import Editor, { loader } from "@monaco-editor/react";
import { useCallback, useRef, useEffect } from "react";
import { useAppStore } from "../../stores/useAppStore";
import { writeFile } from "../../hooks/useTauriCommands";

loader.config({
  paths: {
    vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs",
  },
});

interface Props {
  onCompile?: () => void;
}

const LATEX_SNIPPETS = [
  { label: "begin", insertText: "\\begin{${1:env}}\n\t$0\n\\end{${1:env}}", description: "Begin environment" },
  { label: "frac", insertText: "\\frac{${1:num}}{${2:den}}", description: "Fraction" },
  { label: "sqrt", insertText: "\\sqrt{${1:x}}", description: "Square root" },
  { label: "sum", insertText: "\\sum_{${1:i=1}}^{${2:n}} ${0:x_i}", description: "Summation" },
  { label: "int", insertText: "\\int_{${1:a}}^{${2:b}} ${0:f(x)} dx", description: "Integral" },
  { label: "lim", insertText: "\\lim_{${1:x \\to \\infty}} ${0:f(x)}", description: "Limit" },
  { label: "prod", insertText: "\\prod_{${1:i=1}}^{${2:n}} ${0:x_i}", description: "Product" },
  { label: "section", insertText: "\\section{${1:Title}}\n\\label{${2:sec:label}}\n${0}", description: "Section" },
  { label: "subsection", insertText: "\\subsection{${1:Title}}\n${0}", description: "Subsection" },
  { label: "itemize", insertText: "\\begin{itemize}\n\t\\item ${0:item}\n\\end{itemize}", description: "Bullet list" },
  { label: "enumerate", insertText: "\\begin{enumerate}\n\t\\item ${0:item}\n\\end{enumerate}", description: "Numbered list" },
  { label: "figure", insertText: "\\begin{figure}[htbp]\n\t\\centering\n\t\\includegraphics[width=${1:0.8\\textwidth}]{${2:path}}\n\t\\caption{${3:caption}}\n\t\\label{${4:fig:label}}\n\\end{figure}", description: "Figure" },
  { label: "table", insertText: "\\begin{table}[htbp]\n\t\\centering\n\t\\caption{${1:caption}}\n\t\\label{${2:tab:label}}\n\t\\begin{tabular}{${3:lcr}}\n\t\t\\toprule\n\t\t${0}\n\t\t\\bottomrule\n\t\\end{tabular}\n\\end{table}", description: "Table" },
  { label: "align", insertText: "\\begin{align}\n\t${0:equation}\n\\end{align}", description: "Aligned equations" },
  { label: "matrix", insertText: "\\begin{pmatrix}\n\t${1:a} & ${2:b} \\\\\n\t${3:c} & ${4:d}\n\\end{pmatrix}", description: "Matrix" },
  { label: "cite", insertText: "\\cite{${1:ref}}", description: "Citation" },
  { label: "ref", insertText: "\\ref{${1:label}}", description: "Reference" },
  { label: "textbf", insertText: "\\textbf{${1:text}}", description: "Bold text" },
  { label: "textit", insertText: "\\textit{${1:text}}", description: "Italic text" },
  { label: "texttt", insertText: "\\texttt{${1:text}}", description: "Monospace text" },
];

export default function LaTeXEditor({ onCompile }: Props) {
  const { activeFilePath, activeFileContent, setActiveFileContent, setIsDirty, autoCompile } =
    useAppStore();
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const monacoRef = useRef<any>(null);

  const doSave = useCallback(async (content: string) => {
    if (!activeFilePath) return;
    try {
      await writeFile(activeFilePath, content);
      setIsDirty(false);
      if (autoCompile && onCompile) {
        setTimeout(() => onCompile(), 300);
      }
    } catch (e) {
      console.error("Failed to save:", e);
    }
  }, [activeFilePath, setIsDirty, autoCompile, onCompile]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        const editor = monacoRef.current;
        if (editor) {
          doSave(editor.getValue());
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [doSave]);

  const handleMount = useCallback((editor: any) => {
    monacoRef.current = editor;

    // Register snippets as completion items
    const monaco = (window as any).monaco;
    if (monaco) {
      monaco.languages.registerCompletionItemProvider("latex", {
        provideCompletionItems: () => {
          const suggestions = LATEX_SNIPPETS.map((s) => ({
            label: s.label,
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: s.insertText,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: s.description,
          }));
          return { suggestions };
        },
      });
    }
  }, []);

  const handleChange = useCallback(
    (value: string | undefined) => {
      const content = value || "";
      setActiveFileContent(content);
      setIsDirty(true);

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => doSave(content), 1000);
    },
    [setActiveFileContent, setIsDirty, doSave]
  );

  return (
    <div className="h-full w-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800 border-b border-gray-700 text-gray-300 text-xs">
        <span className="truncate">
          {activeFilePath
            ? activeFilePath.split("/").pop() || "Untitled"
            : "No file open"}
        </span>
        <span className="text-gray-500">LaTeX</span>
      </div>
      <div className="flex-1">
        <Editor
          height="100%"
          language="latex"
          theme="vs-dark"
          value={activeFileContent}
          onChange={handleChange}
          onMount={handleMount}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: "on",
            wordWrap: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            bracketPairColorization: { enabled: true },
            matchBrackets: "always",
            autoClosingBrackets: "always",
            suggest: { showWords: true, showSnippets: true },
          }}
        />
      </div>
    </div>
  );
}
