// Runnable self-check: `node --experimental-strip-types src/lib/ai-output.check.ts`
import assert from "node:assert/strict";
import { stripCodeFence } from "./ai-output.ts";

// Unwraps a whole-response fence, with or without a language tag.
assert.equal(stripCodeFence("```latex\n\\section{A}\n```"), "\\section{A}");
assert.equal(stripCodeFence("```\n\\section{A}\n```"), "\\section{A}");
assert.equal(stripCodeFence("  ```latex\n\\section{A}\n```  "), "\\section{A}");

// Multi-line bodies keep their internal newlines and indentation.
assert.equal(
  stripCodeFence("```latex\n\\begin{itemize}\n  \\item x\n\\end{itemize}\n```"),
  "\\begin{itemize}\n  \\item x\n\\end{itemize}"
);

// Unfenced content is returned untouched.
assert.equal(stripCodeFence("\\section{A}"), "\\section{A}");
assert.equal(stripCodeFence(""), "");

// Prose wrapping a snippet is NOT unwrapped — we cannot tell which part to apply.
const prose = "Here is the fix:\n```latex\n\\section{A}\n```\nHope that helps.";
assert.equal(stripCodeFence(prose), prose);

// Two fenced blocks means prose; leave it alone.
const two = "```latex\n\\a\n```\n```latex\n\\b\n```";
assert.equal(stripCodeFence(two), two);

// Unterminated fence is left alone (a stream cut short mid-response).
assert.equal(stripCodeFence("```latex\n\\section{A}"), "```latex\n\\section{A}");

// An info string with spaces isn't a language tag — don't treat it as a fence.
const notAFence = "``` this is not a tag\nbody\n```";
assert.equal(stripCodeFence(notAFence), notAFence);

// LaTeX containing backticks (quotes!) survives unwrapping.
assert.equal(stripCodeFence("```latex\n``quoted''\n```"), "``quoted''");

console.log("ai-output: all checks passed");
