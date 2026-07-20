// Runnable self-check for the word diff.
// `node --experimental-strip-types src/lib/word-diff.check.ts`
import assert from "node:assert/strict";
import {
  wordDiff,
  tokenize,
  countRuns,
  countAnchors,
  isReadablePair,
  annotate,
  WORD_LIMIT,
  type ChangedPair,
} from "./word-diff.ts";
import { lineDiff } from "./line-diff.ts";

const render = (before: string, after: string) =>
  (wordDiff(before, after) ?? []).map((p) => p.op + p.text);

// Tokenizing keeps whitespace, so the parts rejoin into the original exactly.
assert.deepEqual(tokenize("a b"), ["a", " ", "b"]);
assert.equal(tokenize("  leading and  double  ").join(""), "  leading and  double  ");

// Identical text produces one unchanged run, not one part per word.
assert.deepEqual(render("the cat sat", "the cat sat"), [" the cat sat"]);

// One changed word highlights that word alone — the whole point of this module.
// (the op character is prefixed by the renderer, so " " + " sat" reads "  sat")
assert.deepEqual(render("the cat sat", "the dog sat"), [" the ", "-cat", "+dog", "  sat"]);

// Adjacent changed words merge into a single run rather than per-word confetti.
const phrase = wordDiff("we ran the experiments today", "we performed the trials today")!;
assert.ok(
  phrase.filter((p) => p.op === "-").length === 2,
  `expected two removed runs, got ${JSON.stringify(phrase)}`
);

// Insertion and deletion at the edges.
assert.deepEqual(render("b c", "a b c"), ["+a ", " b c"]);
assert.deepEqual(render("a b c", "b c"), ["-a ", " b c"]);

// Empty sides.
assert.deepEqual(render("", "a"), ["+a"]);
assert.deepEqual(render("a", ""), ["-a"]);
assert.deepEqual(render("", ""), []);

// Round-trip: dropping "+" reproduces the before text, dropping "-" the after.
// This is the property that matters — the panel renders both sides from these.
for (const [before, after] of [
  ["the cat sat on the mat", "the dog sat on the rug"],
  ["\\textbf{bold} text here", "\\emph{italic} text here"],
  ["one two three", "three two one"],
  ["  spaced   out  ", " spaced out "],
]) {
  const parts = wordDiff(before, after)!;
  assert.equal(parts.filter((p) => p.op !== "+").map((p) => p.text).join(""), before);
  assert.equal(parts.filter((p) => p.op !== "-").map((p) => p.text).join(""), after);
}

// Oversized single lines bail out instead of running an O(n*m) walk in render.
const huge = new Array(WORD_LIMIT + 1).fill("word").join(" ");
assert.equal(wordDiff(huge, "word"), null);

// --- readability heuristic --------------------------------------------------

assert.equal(countRuns(wordDiff("a b c", "a b c")!), 0);
assert.equal(countRuns(wordDiff("the cat sat", "the dog sat")!), 2);
// Shared whitespace is not an anchor — only surviving words are.
assert.equal(countAnchors(wordDiff("a b c", "x y z")!), 0);
assert.equal(countAnchors(wordDiff("the cat sat", "the dog sat")!), 2);

// The two real-world edits that disproved a character-count metric. Both are
// regression guards: a volume-based rule gets each of them backwards.
//
// Heavily shortened, but only two clean deletion runs — must pair.
const shortened = wordDiff(
  "three of the datasets that we evaluated on.",
  "three datasets."
)!;
assert.ok(isReadablePair(shortened), "a big but unfragmented cut must still pair");
assert.equal(countRuns(shortened), 2);

// Changed less overall, but scattered across many runs — must not pair.
const scattered = wordDiff(
  "This report outlines findings from Q3.",
  "This report presents the Q3 findings."
)!;
assert.ok(!isReadablePair(scattered), "a fragmented rewrite must not pair");
assert.ok(countRuns(scattered) > countRuns(shortened));

// No surviving word at all: nothing for the eye to anchor on.
assert.ok(!isReadablePair(wordDiff("\\section{Results and Discussion}", "\\section{Results}")!));

// --- annotate ---------------------------------------------------------------

// A one-for-one line replacement fuses into a word-diffed pair.
const paired = annotate(lineDiff("the cat sat", "the dog sat")!);
assert.equal(paired.length, 1);
const pair = paired[0] as ChangedPair;
assert.equal(pair.kind, "pair");
assert.equal(pair.before.map((p) => p.text).join(""), "the cat sat");
assert.equal(pair.after.map((p) => p.text).join(""), "the dog sat");

// Unequal run lengths have no honest pairing, so they stay as plain lines.
const unequal = annotate(lineDiff("a\nb", "x")!);
assert.ok(
  unequal.every((l) => !("kind" in l)),
  "2-for-1 replacement must not be paired"
);

// Wholly different lines stay unpaired — a word diff there boxes every other
// word and reads worse than the two plain lines it replaced.
const confetti = annotate(lineDiff("alpha beta gamma", "zulu yankee xray")!);
assert.ok(
  confetti.every((l) => !("kind" in l)),
  `unrelated lines must not be paired: ${JSON.stringify(confetti)}`
);

// A mixed run: one line too rewritten to pair, one a clean one-word fix.
// Each is judged on its own. Judging the run as a unit meant a single
// unreadable line dragged its neighbours down with it, throwing away the
// pairing on lines that would have read perfectly well.
const mixed = annotate(
  lineDiff("alpha beta gamma\nthe cat sat on the mat", "zulu yankee xray\nthe dog sat on the mat")!
);
assert.equal(mixed.length, 3, `expected two plain lines and one pair: ${JSON.stringify(mixed)}`);
assert.equal((mixed[0] as { op: string }).op, "-");
assert.equal((mixed[1] as { op: string }).op, "+");
assert.equal((mixed[2] as ChangedPair).kind, "pair");
// The unpaired line keeps its before and after adjacent, so it still reads as
// one change rather than drifting apart from its counterpart.
assert.equal((mixed[0] as { text: string }).text, "alpha beta gamma");
assert.equal((mixed[1] as { text: string }).text, "zulu yankee xray");

// ...but a one-word fix inside an otherwise intact line always pairs. This is
// the everyday case: the whole feature exists for it.
const everyday = annotate(
  lineDiff(
    "It does not upload your documents anywhere and it does not",
    "It does not upload your documents anywhere, and it does not"
  )!
);
assert.equal((everyday[0] as ChangedPair).kind, "pair");

// Unchanged and gap markers pass through untouched.
assert.deepEqual(annotate([{ op: " ", text: "keep" }]), [{ op: " ", text: "keep" }]);
assert.deepEqual(annotate([{ op: "gap", count: 7 }]), [{ op: "gap", count: 7 }]);

// Pure insertions survive: no "-" run to pair them with.
assert.deepEqual(annotate([{ op: "+", text: "new" }]), [{ op: "+", text: "new" }]);

// Every line of a multi-line edit is accounted for — no line silently dropped.
const multi = lineDiff("one\ntwo cat\nthree", "one\ntwo dog\nthree")!;
const annotated = annotate(multi);
const beforeText = annotated
  .map((l) =>
    "kind" in l ? l.before.map((p) => p.text).join("") : l.op === "+" || l.op === "gap" ? null : l.text
  )
  .filter((t) => t !== null)
  .join("\n");
assert.equal(beforeText, "one\ntwo cat\nthree");

console.log("word-diff: all checks passed");
