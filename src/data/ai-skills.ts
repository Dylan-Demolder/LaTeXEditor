import type { AISkill } from "../types";

export const SKILL_CATEGORIES = {
  edit: "Edit & Improve",
  analyze: "Analyze",
  generate: "Generate",
  fix: "Fix & Debug",
} as const;

/**
 * The skill behind the inline Cmd+K bar, where the instruction is whatever the
 * user typed rather than a preset.
 *
 * Kept out of `aiSkills` on purpose: it has no meaning without an instruction,
 * so listing it in the panel would offer a button that does nothing useful. It
 * still carries the same line-preservation and scope rules as the preset
 * rewrite skills — a free-form instruction must not license a reflow.
 */
export const inlineEditSkill: AISkill = {
  id: "inline-edit",
  name: "Inline edit",
  icon: "sparkle",
  description: "Edit the selection according to a typed instruction",
  category: "edit",
  source: "document",
  output: "replace",
  context: ["preamble", "labels", "bib"],
  systemPrompt:
    "You are a LaTeX editing assistant. Apply the user's instruction to the LaTeX passage they provide. " +
    "Return ONLY the revised LaTeX for that passage — no commentary, no explanation, no code fences. " +
    "Preserve the existing line breaks and wrapping, and change nothing you were not asked to change " +
    "— a reflowed paragraph is a large diff with no visible effect on the output. " +
    "Where an instruction changes the length of the text, re-wrap it at roughly the same column width as " +
    "the input rather than joining the passage into one long line; source line breaks do not affect the " +
    "rendered output, but they are what makes the change reviewable. " +
    "Never alter \\label or \\cite keys, and never leave a \\begin without its matching \\end.",
  userPromptTemplate: "```latex\n$$content$$\n```",
  args: [{ key: "content", label: "Selection", placeholder: "" }],
};

export const aiSkills: AISkill[] = [
  {
    id: "proofread-section",
    name: "Proofread Section",
    icon: "search",
    description: "Check grammar, clarity, and academic tone of selected text",
    category: "edit",
    source: "document",
    output: "replace",
    context: ["labels", "bib"],
    systemPrompt: "You are a LaTeX academic writing assistant. Review the provided LaTeX content. Check for grammar errors, unclear phrasing, missing citations, and academic tone. Return the corrected LaTeX with changes clearly indicated. Only fix issues; do not rewrite unnecessarily. Preserve the existing line breaks and wrapping exactly, and change nothing you were not asked to change \u2014 a reflowed paragraph is a large diff with no visible effect on the output.",
    userPromptTemplate: "Proofread the following LaTeX section and return the corrected version:\n\n```latex\n$$content$$\n```",
    args: [{ key: "content", label: "Content to proofread", placeholder: "Paste or select LaTeX content..." }],
  },
  {
    id: "improve-equation",
    name: "Improve Equation",
    icon: "function",
    description: "Optimize mathematical notation for clarity and correctness",
    category: "edit",
    source: "document",
    output: "replace",
    context: ["preamble"],
    systemPrompt: "You are a mathematical typesetting expert. Review the provided LaTeX equation(s). Improve notation for clarity, fix common LaTeX math errors, add missing braces, and ensure proper alignment. Return only the corrected LaTeX. Preserve the existing line breaks and wrapping exactly, and change nothing you were not asked to change \u2014 a reflowed paragraph is a large diff with no visible effect on the output.",
    userPromptTemplate: "Improve this LaTeX equation:\n\n```latex\n$$content$$\n```\n\nFix notation issues and return the corrected version.",
    args: [{ key: "content", label: "Equation(s)", placeholder: "Paste LaTeX equation..." }],
  },
  {
    id: "explain-equation",
    name: "Explain Equation",
    icon: "info",
    description: "Generate a plain-English explanation of a LaTeX equation",
    category: "analyze",
    source: "document",
    output: "text",
    systemPrompt: "You are a mathematics educator. Explain the provided LaTeX equation in clear, plain English. Define each variable and describe what the equation represents. Be pedagogical.",
    userPromptTemplate: "Explain this equation in plain English:\n\n```latex\n$$content$$\n```",
    args: [{ key: "content", label: "Equation to explain", placeholder: "Paste LaTeX equation..." }],
  },
  {
    id: "summarize-section",
    name: "Summarize Section",
    icon: "list",
    description: "Generate a concise summary of a LaTeX section",
    category: "analyze",
    source: "document",
    output: "text",
    systemPrompt: "Summarize the provided LaTeX section in 3-5 bullet points. Extract the key arguments, findings, and conclusions. Be concise and accurate.",
    userPromptTemplate: "Summarize this LaTeX section in bullet points:\n\n```latex\n$$content$$\n```",
    args: [{ key: "content", label: "Section content", placeholder: "Paste LaTeX section..." }],
  },
  {
    id: "generate-table",
    name: "Generate Table from Data",
    icon: "grid",
    description: "Generate a professional LaTeX table from data description",
    category: "generate",
    source: "input",
    output: "insert",
    context: ["preamble"],
    systemPrompt: "You are a LaTeX table expert. Given a data description, generate a well-formatted LaTeX table using booktabs and proper alignment. Include caption and label.",
    userPromptTemplate: "Create a LaTeX table from this description:\n\n$$content$$\n\nUse booktabs, proper column alignment, and include a caption and label.",
    args: [{ key: "content", label: "Table description / data", placeholder: "E.g.: '3 columns: Model, Accuracy, F1. Data: BERT 92.3 89.1, GPT 88.5 85.2, T5 94.2 91.8'" }],
  },
  {
    id: "generate-abstract",
    name: "Generate Abstract",
    icon: "file",
    description: "Generate an abstract from the paper content",
    category: "generate",
    source: "document",
    output: "insert",
    systemPrompt: "You write concise academic abstracts. Given paper content, write a 150-250 word abstract covering: problem, approach, key results, and implications.",
    userPromptTemplate: "Write an abstract based on this paper content:\n\n$$content$$\n\nKeep it 150-250 words.",
    args: [{ key: "content", label: "Paper content", placeholder: "Paste your paper or section content..." }],
  },
  {
    id: "plaintext-to-latex",
    name: "Plain Text → LaTeX",
    icon: "template",
    description: "Convert plain text into properly formatted LaTeX",
    category: "generate",
    source: "input",
    output: "insert",
    context: ["preamble", "labels", "bib"],
    systemPrompt: "Convert plain text into properly formatted LaTeX. Add section headers, figure/table environments, citations, math mode, and proper formatting. Be thorough and academic. Preserve the existing line breaks and wrapping exactly, and change nothing you were not asked to change \u2014 a reflowed paragraph is a large diff with no visible effect on the output.",
    userPromptTemplate: "Convert this plain text to LaTeX:\n\n$$content$$",
    args: [{ key: "content", label: "Plain text", placeholder: "Paste plain text..." }],
  },
  {
    id: "fix-errors",
    name: "Fix Compilation Errors",
    icon: "wrench",
    description: "Diagnose and fix LaTeX compilation errors",
    category: "fix",
    source: "document",
    output: "replace",
    context: ["errors", "preamble"],
    systemPrompt: "You are a LaTeX debugging expert. Given LaTeX code with compilation errors and the error messages, fix the code. Common fixes: unmatched braces, missing packages, undefined commands, math mode errors. Preserve the existing line breaks and wrapping exactly, and change nothing you were not asked to change \u2014 a reflowed paragraph is a large diff with no visible effect on the output.",
    // Errors arrive as context from the last compile — no pasting the log.
    userPromptTemplate:
      "Fix the compilation errors in this LaTeX. Return only the corrected LaTeX:\n\n```latex\n$$content$$\n```",
    args: [
      { key: "content", label: "LaTeX code with errors", placeholder: "Paste the LaTeX source..." },
    ],
  },
  {
    id: "fix-bibliography",
    name: "Fix Bibliography",
    icon: "file-bib",
    description: "Check and fix bibliography formatting",
    category: "fix",
    source: "document",
    output: "replace",
    context: ["bib"],
    systemPrompt: "You are a bibliography expert. Check the provided BibTeX entries or thebibliography for formatting issues. Fix missing fields, incorrect formatting, and ensure consistency. Preserve the existing line breaks and wrapping exactly, and change nothing you were not asked to change \u2014 a reflowed paragraph is a large diff with no visible effect on the output.",
    userPromptTemplate: "Fix these bibliography issues in the LaTeX source:\n\n```latex\n$$content$$\n```",
    args: [{ key: "content", label: "Bibliography section or .bib file", placeholder: "Paste bibliography content..." }],
  },
  {
    id: "executive-summary",
    name: "Executive Summary",
    icon: "list",
    description: "Summarise the document for a reader who will not read it",
    category: "generate",
    source: "document",
    output: "insert",
    systemPrompt:
      "You write executive summaries for professional reports. Given a document, write a summary of at most 200 words for a senior reader who will not read the body: lead with the conclusion and what it means for a decision, then the evidence, then any caveat. No preamble, no restating the title, no 'this report discusses'. Return LaTeX suitable for pasting into the document.",
    userPromptTemplate:
      "Write an executive summary of this report:\n\n$$content$$\n\nAt most 200 words. Conclusion first.",
    args: [{ key: "content", label: "Report content", placeholder: "Paste the report..." }],
  },
  {
    id: "notes-to-prose",
    name: "Notes → Prose",
    icon: "template",
    description: "Turn rough bullets or notes into written paragraphs",
    category: "generate",
    source: "input",
    output: "insert",
    context: ["preamble", "labels", "bib"],
    systemPrompt:
      "You turn rough notes into finished prose for a professional report. Expand bullets and fragments into connected paragraphs that carry the same claims — add no facts, figures, or conclusions that are not in the notes, and never invent a citation. Where a note is too vague to write from, leave the LaTeX comment % TODO: <what is missing> on its own line rather than inventing detail. Return LaTeX.",
    userPromptTemplate: "Turn these notes into prose:\n\n$$content$$",
    args: [
      {
        key: "content",
        label: "Notes / bullets",
        placeholder: "- q3 revenue up, mostly enterprise\n- churn still bad in SMB\n- hiring 2 more AEs",
      },
    ],
  },
  {
    id: "data-to-table",
    name: "Paste Data → Table",
    icon: "grid",
    description: "Turn pasted CSV, TSV or spreadsheet rows into a LaTeX table",
    category: "generate",
    source: "input",
    output: "insert",
    context: ["preamble"],
    systemPrompt:
      "You convert tabular data into LaTeX tables. The input is pasted directly from a spreadsheet or CSV file: comma-, tab- or whitespace-separated rows, with the first row usually a header. Infer the column count and alignment — numeric columns right-aligned, text left-aligned — and use the first row as the header. Reproduce every value exactly as given: do not round, reorder, recompute or omit rows. Escape LaTeX special characters in the data — % & _ # $ become \\% \\& \\_ \\# \\$ — since spreadsheet data routinely contains percentages and ampersands, and an unescaped % silently comments out the rest of the row while a bare & breaks the column count. Use booktabs rules only if the preamble loads booktabs; otherwise use \\hline. Include a caption and label. Return only the table environment.",
    userPromptTemplate: "Convert this data into a LaTeX table:\n\n$$content$$",
    args: [
      {
        key: "content",
        label: "Pasted data (CSV, TSV, or spreadsheet rows)",
        placeholder: "Region,Q3,Q4\nEMEA,1.2,1.8\nAPAC,0.9,1.1",
      },
    ],
  },
  {
    id: "tighten-to-length",
    name: "Tighten",
    icon: "search",
    description: "Cut length without losing content",
    category: "edit",
    source: "document",
    output: "replace",
    context: ["labels", "bib"],
    systemPrompt:
      "You are a ruthless but faithful copy-editor. Shorten the passage by roughly a third: cut hedging, redundancy and throat-clearing, and prefer the shorter construction. Every claim, figure and citation in the original must survive — you are cutting words, not content. Never drop or renumber a \\label, \\ref or \\cite. Preserve the existing line breaks and wrapping exactly. Return only the shortened LaTeX.",
    userPromptTemplate:
      "Tighten this passage, keeping every claim:\n\n```latex\n$$content$$\n```",
    args: [{ key: "content", label: "Passage", placeholder: "Select the text to tighten..." }],
  },
  {
    id: "consistency-pass",
    name: "Consistency Check",
    icon: "info",
    description: "Find terminology, tense and style that drift across the document",
    category: "analyze",
    source: "document",
    output: "text",
    context: ["labels"],
    systemPrompt:
      "You check professional reports for internal consistency. Report only genuine inconsistencies where the same document does the same thing two different ways: a term spelled or capitalised differently, a switch between past and present tense for the same kind of statement, mixed number and date formats, mixed British and American spelling, or a heading style that does not match its siblings. For each, give the two forms, where each appears, and which to standardise on. If the document is consistent, say so and stop — do not pad the list with style preferences that are already applied uniformly.",
    userPromptTemplate:
      "Check this document for internal inconsistencies:\n\n```latex\n$$content$$\n```",
    args: [{ key: "content", label: "Document", placeholder: "The whole document works best here..." }],
  },
  {
    id: "suggest-structure",
    name: "Suggest Paper Structure",
    icon: "box",
    description: "Get suggestions for paper section structure",
    category: "analyze",
    source: "input",
    output: "text",
    context: ["tree"],
    systemPrompt: "You are an academic writing coach. Given a paper topic, suggest a logical section structure (outline) for a LaTeX paper. Include recommended sections, subsections, and brief notes on what each should contain.",
    userPromptTemplate: "Suggest a paper structure for:\n\nTopic: $$content$$",
    args: [{ key: "content", label: "Paper topic / description", placeholder: "Describe your paper topic..." }],
  },
];
