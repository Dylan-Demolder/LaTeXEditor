// Runnable self-check for snippet escaping.
// `node --experimental-strip-types src/lib/snippet-escape.check.ts`
//
// The bug this exists to prevent: Monaco's snippet parser treats `\` as an
// escape character for `$`, `}` and `\`. A LaTeX row separator is `\\`, so the
// insertText has to carry FOUR backslashes for two to survive. Both `matrix`
// and `cases` shipped with two, and inserted `\` — silently producing a
// pmatrix that will not compile. Nothing about the source looked wrong.
import assert from "node:assert/strict";
import { SNIPPETS } from "../components/editor/latex-language.ts";

/** What Monaco actually writes into the document, minus placeholder handling. */
function unescape(insertText: string): string {
  return insertText.replace(/\\([$\\}])/g, "$1");
}

// Sanity: the helper models the escape rule we are asserting about.
assert.equal(unescape(String.raw`a \\ b`), String.raw`a \ b`);
assert.equal(unescape(String.raw`a \\\\ b`), String.raw`a \\ b`);
assert.equal(unescape(String.raw`\begin{align}`), String.raw`\begin{align}`);

const byLabel = new Map(SNIPPETS.map((s) => [s.label, s]));

// Every snippet that builds a multi-row maths environment must emit a real
// LaTeX row separator.
for (const label of ["matrix", "cases"]) {
  const snippet = byLabel.get(label);
  assert.ok(snippet, `expected a "${label}" snippet`);
  const rendered = unescape(snippet.insertText);
  assert.ok(
    rendered.includes("\\\\"),
    `${label} must insert a LaTeX row separator, got: ${JSON.stringify(rendered)}`
  );
}

// And no snippet should insert a lone trailing backslash, which is what the
// bug looked like from the outside: `a & b \` at the end of a line.
for (const s of SNIPPETS) {
  const rendered = unescape(s.insertText);
  for (const line of rendered.split("\n")) {
    const trailing = line.match(/(\\+)$/);
    if (!trailing) continue;
    assert.equal(
      trailing[1].length % 2,
      0,
      `${s.label} ends a line with an odd number of backslashes: ${JSON.stringify(line)}`
    );
  }
}

console.log("snippet-escape: all checks passed");
