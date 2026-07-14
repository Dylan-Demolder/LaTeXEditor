export interface ComponentField {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "textarea" | "toggle";
  default: string;
  options?: { label: string; value: string }[];
  placeholder?: string;
}

export interface LaTeXComponent {
  id: string;
  name: string;
  icon: string;
  category: ComponentCategory;
  description: string;
  fields: ComponentField[];
  generate: (values: Record<string, string>) => string;
}

export type ComponentCategory =
  | "math"
  | "tables"
  | "figures"
  | "lists"
  | "structure"
  | "code"
  | "bibliography";

export const CATEGORY_NAMES: Record<ComponentCategory, string> = {
  math: "Mathematics",
  tables: "Tables",
  figures: "Figures & Diagrams",
  lists: "Lists",
  structure: "Document Structure",
  code: "Code & Algorithms",
  bibliography: "Bibliography",
};

export const components: LaTeXComponent[] = [
  // --- Tables ---
  {
    id: "table-basic",
    name: "Basic Table",
    icon: "⊞",
    category: "tables",
    description: "A centering table with header row",
    fields: [
      { key: "cols", label: "Column spec", type: "select", default: "lcr", options: [
        { label: "Left-Center-Right (lcr)", value: "lcr" },
        { label: "Three centered (ccc)", value: "ccc" },
        { label: "Left-Left-Right (llr)", value: "llr" },
        { label: "Four centered (cccc)", value: "cccc" },
      ]},
      { key: "caption", label: "Caption", type: "text", default: "Table caption", placeholder: "Table caption" },
      { key: "label", label: "Label", type: "text", default: "tab:my-table", placeholder: "tab:label" },
      { key: "rows", label: "Rows (comma-separated cells, semicolon rows)", type: "textarea", default: "Header 1, Header 2, Header 3\nValue 1, Value 2, Value 3\nValue 4, Value 5, Value 6", placeholder: "" },
    ],
    generate: (v) => {
      const rows = v.rows.split("\n").filter((r) => r.trim());
      const header = rows[0];
      const body = rows.slice(1);
      let t = `\\begin{table}[htbp]\n  \\centering\n  \\caption{${v.caption}}\n  \\label{${v.label}}\n  \\begin{tabular}{@{}${v.cols}@{}}\n    \\toprule\n`;
      if (header) {
        t += `    ${header.split(",").join(" & ")} \\\\\n    \\midrule\n`;
      }
      body.forEach((row) => {
        t += `    ${row.split(",").join(" & ")} \\\\\n`;
      });
      t += `    \\bottomrule\n  \\end{tabular}\n\\end{table}\n`;
      return t;
    },
  },
  {
    id: "table-booktabs",
    name: "Publication Table",
    icon: "⊞",
    category: "tables",
    description: "Professional table with booktabs styling",
    fields: [
      { key: "cols", label: "Columns (e.g. lccc)", type: "text", default: "lccc", placeholder: "lccc" },
      { key: "caption", label: "Caption", type: "text", default: "Results", placeholder: "" },
      { key: "label", label: "Label", type: "text", default: "tab:results", placeholder: "" },
      { key: "header", label: "Header row (comma-separated)", type: "text", default: "Model, Accuracy, Precision, Recall", placeholder: "" },
      { key: "rows", label: "Data rows", type: "textarea", default: "BERT, 92.3, 91.8, 90.5\nGPT-2, 89.1, 88.4, 87.2\nT5, 94.2, 93.7, 93.1", placeholder: "" },
    ],
    generate: (v) => {
      const headerCols = v.header.split(",").map((h) => h.trim());
      const dataRows = v.rows.split("\n").filter((r) => r.trim());
      let t = `\\begin{table}[htbp]\n  \\centering\n  \\caption{${v.caption}}\n  \\label{${v.label}}\n  \\begin{tabular}{@{}${v.cols}@{}}\n    \\toprule\n`;
      t += `    ${headerCols.join(" & ")} \\\\\n    \\midrule\n`;
      dataRows.forEach((row) => {
        t += `    ${row.split(",").join(" & ")} \\\\\n`;
      });
      t += `    \\bottomrule\n  \\end{tabular}\n\\end{table}\n`;
      return t;
    },
  },

  // --- Math ---
  {
    id: "math-equation",
    name: "Numbered Equation",
    icon: "𝑓",
    category: "math",
    description: "Single numbered equation",
    fields: [
      { key: "label", label: "Label", type: "text", default: "eq:main", placeholder: "" },
      { key: "content", label: "Equation", type: "textarea", default: "E = mc^2", placeholder: "" },
    ],
    generate: (v) => `\\begin{equation}\n  ${v.content}\n  \\label{${v.label}}\n\\end{equation}\n`,
  },
  {
    id: "math-align",
    name: "Aligned Equations",
    icon: "𝑓",
    category: "math",
    description: "Multi-line aligned equations with & anchors",
    fields: [
      { key: "label", label: "Label", type: "text", default: "eq:system", placeholder: "" },
      { key: "lines", label: "Lines (one per line, use & for alignment)", type: "textarea", default: "x + y &= 5 \\\\\n2x - y &= 1", placeholder: "" },
    ],
    generate: (v) => `\\begin{align}\n  ${v.lines.split("\n").map((l) => l.trim()).join("\n  ")}\n  \\label{${v.label}}\n\\end{align}\n`,
  },
  {
    id: "math-matrix",
    name: "Matrix",
    icon: "𝑓",
    category: "math",
    description: "Matrix with configurable brackets",
    fields: [
      { key: "bracket", label: "Bracket type", type: "select", default: "pmatrix", options: [
        { label: "Parentheses (pmatrix)", value: "pmatrix" },
        { label: "Brackets (bmatrix)", value: "bmatrix" },
        { label: "Braces (Bmatrix)", value: "Bmatrix" },
        { label: "Pipes (vmatrix)", value: "vmatrix" },
      ]},
      { key: "rows", label: "Rows (comma-separated, semicolon-separated)", type: "textarea", default: "a_{11}, a_{12}, a_{13}\na_{21}, a_{22}, a_{23}\na_{31}, a_{32}, a_{33}", placeholder: "" },
    ],
    generate: (v) => {
      const rows = v.rows.split("\n").filter((r) => r.trim());
      let t = `\\begin{${v.bracket}}\n`;
      rows.forEach((row, i) => {
        t += `  ${row.split(",").join(" & ")}${i < rows.length - 1 ? " \\\\" : ""}\n`;
      });
      t += `\\end{${v.bracket}}\n`;
      return t;
    },
  },
  {
    id: "math-cases",
    name: "Cases (Piecewise)",
    icon: "𝑓",
    category: "math",
    description: "Piecewise function definition",
    fields: [
      { key: "cases", label: "Cases (value, condition per line)", type: "textarea", default: "0, x < 0\nx^2, 0 \\leq x < 1\n1, x \\geq 1", placeholder: "" },
    ],
    generate: (v) => {
      const cases = v.cases.split("\n").filter((r) => r.trim());
      let t = `f(x) = \\begin{cases}\n`;
      cases.forEach((c) => {
        const [val, cond] = c.split(",").map((s) => s.trim());
        t += `  ${val}, & ${cond} \\\\\n`;
      });
      t += `\\end{cases}\n`;
      return t;
    },
  },
  {
    id: "math-theorem",
    name: "Theorem Environment",
    icon: "𝑓",
    category: "math",
    description: "Theorem/proof block with amsthm",
    fields: [
      { key: "type", label: "Type", type: "select", default: "theorem", options: [
        { label: "Theorem", value: "theorem" },
        { label: "Lemma", value: "lemma" },
        { label: "Corollary", value: "corollary" },
        { label: "Definition", value: "definition" },
        { label: "Proposition", value: "proposition" },
      ]},
      { key: "title", label: "Title (optional)", type: "text", default: "", placeholder: "e.g. Mean Value Theorem" },
      { key: "content", label: "Content", type: "textarea", default: "Your theorem statement here.", placeholder: "" },
    ],
    generate: (v) => {
      const title = v.title ? `[${v.title}]` : "";
      return `\\begin{${v.type}}${title}\n  ${v.content}\n\\end{${v.type}}\n\n\\begin{proof}\n  Your proof here.\n\\end{proof}\n`;
    },
  },

  // --- Figures ---
  {
    id: "figure-single",
    name: "Single Figure",
    icon: "🖼",
    category: "figures",
    description: "A single centered figure with caption",
    fields: [
      { key: "path", label: "Image path", type: "text", default: "figures/diagram.pdf", placeholder: "" },
      { key: "width", label: "Width", type: "text", default: "0.8\\textwidth", placeholder: "0.8\\textwidth" },
      { key: "caption", label: "Caption", type: "text", default: "Figure caption", placeholder: "" },
      { key: "label", label: "Label", type: "text", default: "fig:my-figure", placeholder: "" },
    ],
    generate: (v) => `\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=${v.width}]{${v.path}}\n  \\caption{${v.caption}}\n  \\label{${v.label}}\n\\end{figure}\n`,
  },
  {
    id: "figure-subfigures",
    name: "Subfigures (2-up)",
    icon: "🖼",
    category: "figures",
    description: "Two subfigures side by side",
    fields: [
      { key: "path1", label: "Image 1 path", type: "text", default: "figures/a.pdf", placeholder: "" },
      { key: "cap1", label: "Subcaption 1", type: "text", default: "First", placeholder: "" },
      { key: "path2", label: "Image 2 path", type: "text", default: "figures/b.pdf", placeholder: "" },
      { key: "cap2", label: "Subcaption 2", type: "text", default: "Second", placeholder: "" },
      { key: "caption", label: "Main caption", type: "text", default: "Comparison", placeholder: "" },
      { key: "label", label: "Label", type: "text", default: "fig:subfigures", placeholder: "" },
    ],
    generate: (v) => `\\begin{figure}[htbp]\n  \\centering\n  \\begin{subfigure}{0.48\\textwidth}\n    \\centering\n    \\includegraphics[width=\\textwidth]{${v.path1}}\n    \\caption{${v.cap1}}\n  \\end{subfigure}\n  \\hfill\n  \\begin{subfigure}{0.48\\textwidth}\n    \\centering\n    \\includegraphics[width=\\textwidth]{${v.path2}}\n    \\caption{${v.cap2}}\n  \\end{subfigure}\n  \\caption{${v.caption}}\n  \\label{${v.label}}\n\\end{figure}\n`,
  },
  {
    id: "figure-tikz-basic",
    name: "TikZ Diagram",
    icon: "🖼",
    category: "figures",
    description: "Basic TikZ drawing scaffold",
    fields: [
      { key: "caption", label: "Caption", type: "text", default: "Diagram", placeholder: "" },
      { key: "label", label: "Label", type: "text", default: "fig:tikz", placeholder: "" },
      { key: "content", label: "TikZ commands", type: "textarea", default: "\\node[draw, circle, fill=blue!20] (A) at (0,0) {A};\n\\node[draw, circle, fill=red!20] (B) at (3,0) {B};\n\\draw[->, thick] (A) -- (B);", placeholder: "" },
    ],
    generate: (v) => `\\begin{figure}[htbp]\n  \\centering\n  \\begin{tikzpicture}\n    ${v.content}\n  \\end{tikzpicture}\n  \\caption{${v.caption}}\n  \\label{${v.label}}\n\\end{figure}\n`,
  },

  // --- Lists ---
  {
    id: "list-itemize",
    name: "Bullet List",
    icon: "•",
    category: "lists",
    description: "Itemized (bullet) list",
    fields: [
      { key: "items", label: "Items (one per line)", type: "textarea", default: "First item\nSecond item\nThird item", placeholder: "" },
    ],
    generate: (v) => {
      const items = v.items.split("\n").filter((i) => i.trim());
      let t = `\\begin{itemize}\n`;
      items.forEach((item) => { t += `  \\item ${item.trim()}\n`; });
      t += `\\end{itemize}\n`;
      return t;
    },
  },
  {
    id: "list-enumerate",
    name: "Numbered List",
    icon: "1.",
    category: "lists",
    description: "Enumerated (numbered) list",
    fields: [
      { key: "items", label: "Items (one per line)", type: "textarea", default: "Install dependencies\nConfigure settings\nRun the application", placeholder: "" },
    ],
    generate: (v) => {
      const items = v.items.split("\n").filter((i) => i.trim());
      let t = `\\begin{enumerate}\n`;
      items.forEach((item) => { t += `  \\item ${item.trim()}\n`; });
      t += `\\end{enumerate}\n`;
      return t;
    },
  },

  // --- Structure ---
  {
    id: "struct-section",
    name: "Section",
    icon: "§",
    category: "structure",
    description: "Document section with content",
    fields: [
      { key: "title", label: "Section title", type: "text", default: "Section Title", placeholder: "" },
      { key: "label", label: "Label (optional)", type: "text", default: "", placeholder: "sec:label" },
    ],
    generate: (v) => {
      const label = v.label ? `\\label{${v.label}}` : "";
      return `\\section{${v.title}}\n${label}\n\n`;
    },
  },
  {
    id: "struct-abstract",
    name: "Abstract",
    icon: "§",
    category: "structure",
    description: "Abstract environment",
    fields: [
      { key: "content", label: "Abstract text", type: "textarea", default: "This paper presents...", placeholder: "" },
    ],
    generate: (v) => `\\begin{abstract}\n  ${v.content}\n\\end{abstract}\n\n`,
  },

  // --- Code ---
  {
    id: "code-listing",
    name: "Code Listing",
    icon: "{ }",
    category: "code",
    description: "Source code listing with lstlisting",
    fields: [
      { key: "language", label: "Language", type: "select", default: "Python", options: [
        { label: "Python", value: "Python" },
        { label: "C++", value: "C++" },
        { label: "Java", value: "Java" },
        { label: "JavaScript", value: "JavaScript" },
        { label: "Rust", value: "Rust" },
        { label: "Bash", value: "Bash" },
      ]},
      { key: "caption", label: "Caption", type: "text", default: "Code example", placeholder: "" },
      { key: "label", label: "Label", type: "text", default: "lst:code", placeholder: "" },
      { key: "code", label: "Code", type: "textarea", default: "def hello():\n    print(\"Hello, World!\")", placeholder: "" },
    ],
    generate: (v) => `\\begin{lstlisting}[caption={${v.caption}}, label={${v.label}}, language=${v.language}]\n${v.code}\n\\end{lstlisting}\n`,
  },
  {
    id: "code-algorithm",
    name: "Algorithm Pseudocode",
    icon: "{ }",
    category: "code",
    description: "Algorithm environment with algpseudocode",
    fields: [
      { key: "name", label: "Algorithm name", type: "text", default: "Gradient Descent", placeholder: "" },
      { key: "label", label: "Label", type: "text", default: "alg:gd", placeholder: "" },
      { key: "code", label: "Pseudocode", type: "textarea", default: "\\State Initialize $\\theta_0$\n\\For{$t = 0, 1, \\ldots$}\n  \\State $g_t \\gets \\nabla f(\\theta_t)$\n  \\State $\\theta_{t+1} \\gets \\theta_t - \\eta g_t$\n\\EndFor", placeholder: "" },
    ],
    generate: (v) => `\\begin{algorithm}[htbp]\n  \\caption{${v.name}}\n  \\label{${v.label}}\n  \\begin{algorithmic}[1]\n    ${v.code}\n  \\end{algorithmic}\n\\end{algorithm}\n`,
  },

  // --- Bibliography ---
  {
    id: "bib-article",
    name: "Article Citation",
    icon: "📚",
    category: "bibliography",
    description: "BibTeX entry for a journal article",
    fields: [
      { key: "key", label: "Citation key", type: "text", default: "author2024", placeholder: "" },
      { key: "author", label: "Author(s)", type: "text", default: "J. Smith and M. Chen", placeholder: "" },
      { key: "title", label: "Title", type: "text", default: "A Novel Approach to X", placeholder: "" },
      { key: "journal", label: "Journal", type: "text", default: "Journal of Machine Learning Research", placeholder: "" },
      { key: "year", label: "Year", type: "text", default: "2024", placeholder: "" },
      { key: "volume", label: "Volume", type: "text", default: "25", placeholder: "" },
      { key: "pages", label: "Pages", type: "text", default: "1--30", placeholder: "" },
    ],
    generate: (v) => `@article{${v.key},\n  author  = {${v.author}},\n  title   = {${v.title}},\n  journal = {${v.journal}},\n  year    = {${v.year}},\n  volume  = {${v.volume}},\n  pages   = {${v.pages}},\n}\n`,
  },
  {
    id: "bib-book",
    name: "Book Citation",
    icon: "📚",
    category: "bibliography",
    description: "BibTeX entry for a book",
    fields: [
      { key: "key", label: "Citation key", type: "text", default: "author2024", placeholder: "" },
      { key: "author", label: "Author(s)", type: "text", default: "J. Smith", placeholder: "" },
      { key: "title", label: "Title", type: "text", default: "Deep Learning: Principles and Practice", placeholder: "" },
      { key: "publisher", label: "Publisher", type: "text", default: "MIT Press", placeholder: "" },
      { key: "year", label: "Year", type: "text", default: "2024", placeholder: "" },
    ],
    generate: (v) => `@book{${v.key},\n  author    = {${v.author}},\n  title     = {${v.title}},\n  publisher = {${v.publisher}},\n  year      = {${v.year}},\n}\n`,
  },
  {
    id: "bib-inproceedings",
    name: "Conference Paper",
    icon: "📚",
    category: "bibliography",
    description: "BibTeX entry for conference proceedings",
    fields: [
      { key: "key", label: "Citation key", type: "text", default: "smith2024conf", placeholder: "" },
      { key: "author", label: "Author(s)", type: "text", default: "J. Smith and M. Chen", placeholder: "" },
      { key: "title", label: "Title", type: "text", default: "Graph Neural Networks for X", placeholder: "" },
      { key: "booktitle", label: "Conference", type: "text", default: "Advances in Neural Information Processing Systems", placeholder: "" },
      { key: "year", label: "Year", type: "text", default: "2024", placeholder: "" },
    ],
    generate: (v) => `@inproceedings{${v.key},\n  author    = {${v.author}},\n  title     = {${v.title}},\n  booktitle = {${v.booktitle}},\n  year      = {${v.year}},\n}\n`,
  },
];
