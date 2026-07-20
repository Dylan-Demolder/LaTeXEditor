// Runnable self-check for the diff — the smallest thing that fails if the LCS
// walk breaks. No framework: `node --experimental-strip-types src/lib/line-diff.check.ts`
import assert from "node:assert/strict";
import { lineDiff, isUnchanged, collapseUnchanged, DIFF_LINE_LIMIT } from "./line-diff.ts";

const render = (before: string, after: string) =>
  (lineDiff(before, after) ?? []).map((l) => l.op + l.text);

// Identical input produces no edits.
assert.deepEqual(render("a\nb\nc", "a\nb\nc"), [" a", " b", " c"]);
assert.equal(isUnchanged(lineDiff("a\nb", "a\nb")!), true);

// A replaced line shows as delete + insert, surrounding context untouched.
assert.deepEqual(render("a\nb\nc", "a\nB\nc"), [" a", "-b", "+B", " c"]);
assert.equal(isUnchanged(lineDiff("a\nb", "a\nB")!), false);

// Pure insertion and pure deletion.
assert.deepEqual(render("a\nc", "a\nb\nc"), [" a", "+b", " c"]);
assert.deepEqual(render("a\nb\nc", "a\nc"), [" a", "-b", " c"]);

// Append and prepend at the boundaries.
assert.deepEqual(render("a", "a\nb"), [" a", "+b"]);
assert.deepEqual(render("b", "a\nb"), ["+a", " b"]);

// Empty sides: everything is an insert / everything is a delete.
assert.deepEqual(render("", "a"), ["-", "+a"]);
assert.deepEqual(render("a", ""), ["-a", "+"]);
assert.deepEqual(render("", ""), [" "]);

// Rewriting everything keeps all deletes before the inserts of the same block.
assert.deepEqual(render("a\nb", "x\ny"), ["-a", "-b", "+x", "+y"]);

// Reconstructing each side from the diff must round-trip. This is the property
// that actually matters: Apply writes the "+" lines into the document.
for (const [before, after] of [
  ["a\nb\nc", "a\nB\nc"],
  ["one\ntwo\nthree\nfour", "one\nthree\nfour\nfive"],
  ["\\begin{itemize}\n\\item x\n\\end{itemize}", "\\begin{enumerate}\n\\item x\n\\end{enumerate}"],
]) {
  const diff = lineDiff(before, after)!;
  assert.equal(diff.filter((l) => l.op !== "+").map((l) => l.text).join("\n"), before);
  assert.equal(diff.filter((l) => l.op !== "-").map((l) => l.text).join("\n"), after);
}

// Oversized inputs bail out rather than freezing the UI.
const huge = new Array(DIFF_LINE_LIMIT + 1).fill("x").join("\n");
assert.equal(lineDiff(huge, "x"), null);

// Collapsing keeps context around changes and reports the skipped count.
const long = Array.from({ length: 20 }, (_, i) => `line${i}`).join("\n");
const edited = long.replace("line10", "CHANGED");
const collapsed = collapseUnchanged(lineDiff(long, edited)!, 2);
assert.ok(collapsed.some((l) => l.op === "gap"), "expected a gap marker");
assert.ok(collapsed.some((l) => l.op === "+" && l.text === "CHANGED"));
assert.ok(collapsed.length < 24, "collapsed output should be shorter than the full diff");
// Unchanged input collapses to a single gap — nothing worth showing.
assert.deepEqual(collapseUnchanged(lineDiff(long, long)!, 2), [{ op: "gap", count: 20 }]);

console.log("line-diff: all checks passed");
