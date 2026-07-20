export type DiffOp = "+" | "-" | " ";

export interface DiffLine {
  op: DiffOp;
  text: string;
}

/**
 * Line-level diff via longest common subsequence.
 *
 * Not reusing the Git diff path on purpose: `git_diff_file` flattens everything
 * into one synthetic hunk with hardcoded line numbers, and it would mean a
 * round-trip to Rust for two strings we already hold in JS.
 *
 * ponytail: O(n*m) time and memory. That is fine for a selection or a section —
 * the guard below bails out on anything larger rather than freezing the UI.
 * Upgrade path if whole-thesis diffs are ever needed: Myers diff.
 */
export const DIFF_LINE_LIMIT = 2000;

export function lineDiff(before: string, after: string): DiffLine[] | null {
  const a = before.split("\n");
  const b = after.split("\n");

  if (a.length > DIFF_LINE_LIMIT || b.length > DIFF_LINE_LIMIT) return null;

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

  const out: DiffLine[] = [];
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

  return out;
}

/** True when the two texts are identical — used to say "no changes suggested". */
export function isUnchanged(diff: DiffLine[]): boolean {
  return diff.every((l) => l.op === " ");
}

/**
 * Collapse long runs of unchanged lines, keeping `context` lines either side of
 * each change. Returns the kept lines plus gap markers.
 */
export function collapseUnchanged(
  diff: DiffLine[],
  context = 2
): (DiffLine | { op: "gap"; count: number })[] {
  const keep = new Array<boolean>(diff.length).fill(false);

  diff.forEach((line, idx) => {
    if (line.op === " ") return;
    for (let k = Math.max(0, idx - context); k <= Math.min(diff.length - 1, idx + context); k++) {
      keep[k] = true;
    }
  });

  const out: (DiffLine | { op: "gap"; count: number })[] = [];
  let skipped = 0;

  diff.forEach((line, idx) => {
    if (keep[idx]) {
      if (skipped > 0) {
        out.push({ op: "gap", count: skipped });
        skipped = 0;
      }
      out.push(line);
    } else {
      skipped++;
    }
  });
  if (skipped > 0) out.push({ op: "gap", count: skipped });

  return out;
}
