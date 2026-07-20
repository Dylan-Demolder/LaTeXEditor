import type { DiffLine } from "./line-diff";

export type WordOp = "+" | "-" | " ";

export interface WordPart {
  op: WordOp;
  text: string;
}

/**
 * Word-level diff, for showing *which words* changed inside a rewritten line.
 *
 * A line diff is the right shape for code and the wrong shape for prose: change
 * one word in a sentence and you get a whole line removed and a whole line
 * added, leaving the reader to spot the difference themselves. This runs the
 * same LCS over words so the panel can highlight just the edit.
 *
 * ponytail: O(n*m) over words in a line pair. A line is short, so the guard is
 * generous — it exists only to stop a pathological single-line paste (a whole
 * document with no newlines) from freezing the render.
 */
export const WORD_LIMIT = 400;

/**
 * Split into words *and* the whitespace between them, so that joining the parts
 * back together reproduces the input exactly. Diffing on words alone would lose
 * the original spacing and quietly reformat what it displays.
 */
export function tokenize(text: string): string[] {
  return text.split(/(\s+)/).filter((t) => t !== "");
}

export function wordDiff(before: string, after: string): WordPart[] | null {
  const a = tokenize(before);
  const b = tokenize(after);

  if (a.length > WORD_LIMIT || b.length > WORD_LIMIT) return null;

  // lcs[i][j] = length of the LCS of a[i..] and b[j..]
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0)
  );

  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const out: WordPart[] = [];
  let i = 0;
  let j = 0;

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ op: " ", text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ op: "-", text: a[i] });
      i++;
    } else {
      out.push({ op: "+", text: b[j] });
      j++;
    }
  }
  while (i < a.length) out.push({ op: "-", text: a[i++] });
  while (j < b.length) out.push({ op: "+", text: b[j++] });

  return mergeRuns(out);
}

/**
 * Collapse adjacent parts with the same op into one. Without this, a rewritten
 * clause renders as a dozen separately-boxed words with visible seams between
 * them; merged, it reads as one highlighted phrase.
 */
function mergeRuns(parts: WordPart[]): WordPart[] {
  const out: WordPart[] = [];
  for (const part of parts) {
    const last = out[out.length - 1];
    if (last && last.op === part.op) last.text += part.text;
    else out.push({ ...part });
  }
  return out;
}

/**
 * Whether a word diff will read better than the two plain lines it replaces.
 *
 * The tempting metric is "how much changed", by character count. Measured
 * against real model edits, it is wrong in both directions:
 *
 *   "three of the datasets that we evaluated on." -> "three datasets."
 *       82% changed, but only two deletion runs — the clearest case there is.
 *   "This report outlines findings from Q3." -> "This report presents the Q3 findings."
 *       75% changed across eight alternating runs — unreadable confetti.
 *
 * Volume is not the signal. What makes a word diff readable is that the changes
 * come in few runs, and that enough unchanged text survives to anchor the eye.
 * A shared space is not an anchor, so only non-blank runs count.
 */
export const MAX_CHANGE_RUNS = 6;

export function countRuns(parts: WordPart[]): number {
  return parts.filter((p) => p.op !== " ").length;
}

export function countAnchors(parts: WordPart[]): number {
  return parts.filter((p) => p.op === " " && p.text.trim() !== "").length;
}

export function isReadablePair(parts: WordPart[]): boolean {
  return countAnchors(parts) >= 1 && countRuns(parts) <= MAX_CHANGE_RUNS;
}

export interface ChangedPair {
  kind: "pair";
  /** Parts to render on the removed line: unchanged plus "-" runs. */
  before: WordPart[];
  /** Parts to render on the added line: unchanged plus "+" runs. */
  after: WordPart[];
}

export type AnnotatedLine = DiffLine | { op: "gap"; count: number } | ChangedPair;

/**
 * Walk a (possibly collapsed) line diff and fuse each removed/added run of
 * equal length into word-diffed pairs.
 *
 * Only equal-length runs are paired. When a model deletes two lines and adds
 * one, there is no honest line-to-line correspondence to draw, so those stay as
 * plain +/- lines rather than inventing a pairing that misleads.
 */
export function annotate(
  lines: (DiffLine | { op: "gap"; count: number })[]
): AnnotatedLine[] {
  const out: AnnotatedLine[] = [];
  let idx = 0;

  while (idx < lines.length) {
    const line = lines[idx];

    if (line.op !== "-") {
      out.push(line);
      idx++;
      continue;
    }

    const removed: string[] = [];
    while (idx < lines.length && lines[idx].op === "-") {
      removed.push((lines[idx] as DiffLine).text);
      idx++;
    }

    const added: string[] = [];
    let scan = idx;
    while (scan < lines.length && lines[scan].op === "+") {
      added.push((lines[scan] as DiffLine).text);
      scan++;
    }

    if (removed.length > 0 && removed.length === added.length) {
      // Decide line by line, not for the whole run at once. Judging the group
      // as a unit meant one unreadable line dragged its neighbours down with
      // it: a two-line edit where the first was heavily reworked and the
      // second lost a single clause rendered *both* as plain lines, throwing
      // away the pairing on the one that would have read perfectly well.
      const pairs: AnnotatedLine[] = [];

      for (let k = 0; k < removed.length; k++) {
        const parts = wordDiff(removed[k], added[k]);
        if (parts && isReadablePair(parts)) {
          pairs.push({
            kind: "pair",
            before: parts.filter((p) => p.op !== "+"),
            after: parts.filter((p) => p.op !== "-"),
          });
        } else {
          // Keep this line's before and after adjacent, so it still reads as
          // one change rather than drifting apart from its counterpart.
          pairs.push({ op: "-", text: removed[k] });
          pairs.push({ op: "+", text: added[k] });
        }
      }
      out.push(...pairs);
      idx = scan;
      continue;
    }

    // Unequal run lengths: there is no honest line-to-line correspondence to
    // draw, so emit the removed run as-is and let the added run follow.
    removed.forEach((text) => out.push({ op: "-", text }));
  }

  return out;
}
