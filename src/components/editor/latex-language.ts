import type * as Monaco from "monaco-editor";

// Monaco ships no LaTeX grammar (see monaco-editor/esm/vs/basic-languages), so
// without this the editor falls back to plaintext: no highlighting, and any
// completion provider registered for "latex" never fires.
export const LATEX_LANGUAGE_ID = "latex";

const SNIPPETS: { label: string; insertText: string; description: string }[] = [
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
  { label: "cases", insertText: "\\begin{cases}\n\t${1:a} & ${2:\\text{if } x > 0} \\\\\n\t${3:b} & ${4:\\text{otherwise}}\n\\end{cases}", description: "Cases" },
  { label: "cite", insertText: "\\cite{${1:ref}}", description: "Citation" },
  { label: "ref", insertText: "\\ref{${1:label}}", description: "Reference" },
  { label: "textbf", insertText: "\\textbf{${1:text}}", description: "Bold text" },
  { label: "textit", insertText: "\\textit{${1:text}}", description: "Italic text" },
  { label: "texttt", insertText: "\\texttt{${1:text}}", description: "Monospace text" },
];

let registered = false;

export function registerLatexLanguage(monaco: typeof Monaco): void {
  if (registered) return;
  registered = true;

  monaco.languages.register({
    id: LATEX_LANGUAGE_ID,
    extensions: [".tex", ".sty", ".cls", ".bib", ".bbl"],
    aliases: ["LaTeX", "latex", "TeX"],
  });

  monaco.languages.setLanguageConfiguration(LATEX_LANGUAGE_ID, {
    comments: { lineComment: "%" },
    brackets: [
      ["{", "}"],
      ["[", "]"],
      ["(", ")"],
    ],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: "$", close: "$" },
    ],
    surroundingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: "$", close: "$" },
    ],
    folding: {
      markers: {
        start: /\\begin\{[^}]*\}/,
        end: /\\end\{[^}]*\}/,
      },
    },
  });

  monaco.languages.setMonarchTokensProvider(LATEX_LANGUAGE_ID, {
    defaultToken: "",
    tokenizer: {
      root: [
        [/%.*$/, "comment"],
        // \begin{env} / \end{env} — highlight the environment name distinctly
        [/(\\(?:begin|end))(\s*)(\{)([^}]*)(\})/, ["keyword", "", "delimiter.curly", "type", "delimiter.curly"]],
        // Sectioning commands read as headings
        [/\\(?:chapter|section|subsection|subsubsection|paragraph|subparagraph|part)\*?/, "keyword.control"],
        [/\\[a-zA-Z@]+\*?/, "keyword"],
        [/\\[^a-zA-Z]/, "keyword"],
        [/\$\$/, { token: "string", next: "@displayMath" }],
        [/\$/, { token: "string", next: "@inlineMath" }],
        [/[{}]/, "delimiter.curly"],
        [/[[\]]/, "delimiter.square"],
        [/&/, "delimiter"],
        [/~/, "delimiter"],
      ],
      inlineMath: [
        [/\\[a-zA-Z@]+\*?/, "keyword"],
        [/\\./, "keyword"],
        [/\$/, { token: "string", next: "@pop" }],
        [/[^\\$]+/, "string"],
      ],
      displayMath: [
        [/\\[a-zA-Z@]+\*?/, "keyword"],
        [/\\./, "keyword"],
        [/\$\$/, { token: "string", next: "@pop" }],
        [/[^\\$]+/, "string"],
      ],
    },
  });

  monaco.languages.registerCompletionItemProvider(LATEX_LANGUAGE_ID, {
    // "\" triggers the list mid-word; Monaco otherwise waits for a word char.
    triggerCharacters: ["\\"],
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      return {
        suggestions: SNIPPETS.map((s) => ({
          label: s.label,
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: s.insertText,
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: s.description,
          detail: s.description,
          range,
        })),
      };
    },
  });
}

// Folding + outline both need the section structure; kept here so the editor and
// the outline panel cannot drift apart.
export const SECTION_LEVELS: Record<string, number> = {
  part: 0,
  chapter: 0,
  section: 1,
  subsection: 2,
  subsubsection: 3,
  paragraph: 4,
  subparagraph: 4,
};
