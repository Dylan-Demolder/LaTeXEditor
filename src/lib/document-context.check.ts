// Runnable self-check: `node --experimental-strip-types src/lib/document-context.check.ts`
import assert from "node:assert/strict";
import {
  extractPreamble,
  extractLabels,
  extractCiteKeys,
  formatProjectTree,
  formatErrors,
  renderContext,
  summarizeContext,
} from "./document-context.ts";

const DOC = `\\documentclass[11pt]{article}
\\usepackage{amsmath}
% \\usepackage{booktabs}
\\usepackage[utf8]{inputenc}
\\begin{document}
\\section{Intro}\\label{sec:intro}
See \\ref{sec:intro} and \\cite{knuth1984}.
% \\label{sec:commented}
\\usepackage{tikz}
\\end{document}`;

// Preamble: real packages only, and nothing after \begin{document}.
const preamble = extractPreamble(DOC);
assert.deepEqual(preamble, [
  "\\documentclass[11pt]{article}",
  "\\usepackage{amsmath}",
  "\\usepackage[utf8]{inputenc}",
]);
assert.ok(!preamble.some((l) => l.includes("booktabs")), "commented package must not count");
assert.ok(!preamble.some((l) => l.includes("tikz")), "post-\\begin{document} must be ignored");

// A document with no \begin{document} still yields its packages.
assert.deepEqual(extractPreamble("\\documentclass{book}\n\\usepackage{geometry}"), [
  "\\documentclass{book}",
  "\\usepackage{geometry}",
]);
assert.deepEqual(extractPreamble(""), []);

// Labels: real ones only, deduped.
assert.deepEqual(extractLabels(DOC), ["sec:intro"]);
assert.deepEqual(extractLabels("\\label{a}\\label{b}\\label{a}"), ["a", "b"]);
assert.deepEqual(extractLabels("no labels here"), []);

// An escaped percent is not a comment — the label after it is real.
assert.deepEqual(extractLabels("50\\% done \\label{sec:half}"), ["sec:half"]);

// Cite keys across entry types and spacing variants.
const BIB = `@article{knuth1984,
  title = {Literate Programming},
}
@book { lamport1994 ,
  title = {LaTeX},
}
@inproceedings{vaswani2017,title={Attention}}`;
assert.deepEqual(extractCiteKeys(BIB), ["knuth1984", "lamport1994", "vaswani2017"]);
assert.deepEqual(extractCiteKeys(""), []);

// Caps are honoured so a huge project can't blow the token budget.
const manyLabels = Array.from({ length: 200 }, (_, i) => `\\label{l${i}}`).join("\n");
assert.equal(extractLabels(manyLabels, 60).length, 60);
const manyKeys = Array.from({ length: 300 }, (_, i) => `@article{k${i},}`).join("\n");
assert.equal(extractCiteKeys(manyKeys, 100).length, 100);

// Tree flattens to project-relative paths, directories marked.
const tree = formatProjectTree(
  [
    {
      name: "chapters",
      path: "/proj/chapters",
      is_dir: true,
      children: [
        { name: "intro.tex", path: "/proj/chapters/intro.tex", is_dir: false, extension: "tex" },
      ],
    },
    { name: "main.tex", path: "/proj/main.tex", is_dir: false, extension: "tex" },
  ],
  "/proj"
);
assert.deepEqual(tree, ["chapters/", "chapters/intro.tex", "main.tex"]);

// Errors render with a short location, not an absolute path.
assert.deepEqual(
  formatErrors([
    { file: "/proj/main.tex", line: 12, column: 0, message: "Undefined control sequence", severity: "error" },
  ]),
  ["main.tex:12 — Undefined control sequence"]
);
assert.deepEqual(formatErrors([]), []);

// Empty sections produce no prompt text at all — never send a bare header.
assert.equal(renderContext([{ kind: "labels", title: "Labels", lines: [] }]), "");
assert.equal(renderContext([]), "");

const rendered = renderContext([
  { kind: "preamble", title: "Preamble", lines: ["\\usepackage{amsmath}"] },
  { kind: "labels", title: "Labels", lines: [] },
]);
assert.ok(rendered.includes("## Preamble"));
assert.ok(!rendered.includes("## Labels"), "empty section must be dropped");

// The UI summary only mentions what was actually sent.
assert.equal(
  summarizeContext([
    { kind: "preamble", title: "Preamble", lines: ["\\usepackage{amsmath}"] },
    { kind: "errors", title: "Errors", lines: ["a", "b", "c"] },
    { kind: "bib", title: "Citation keys", lines: [] },
  ]),
  "preamble, 3 errors"
);

console.log("document-context: all checks passed");
