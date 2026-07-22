// Runnable self-check for the tab reducer logic.
// `node --experimental-strip-types src/lib/tabs.check.ts`
//
// The store's tab actions are pure functions of (tabs, activePath), so the
// logic is checked here directly rather than through a mounted editor. What
// matters is that the derived mirrors can never disagree with the tab list,
// and that closing a tab lands somewhere sensible.
import assert from "node:assert/strict";

interface Tab {
  path: string;
  content: string;
  savedContent: string;
}

const isTabDirty = (t: Tab) => t.content !== t.savedContent;

/** Mirror of the store helper: derive the active-file fields from the tabs. */
function mirror(tabs: Tab[], activePath: string | null) {
  const active = tabs.find((t) => t.path === activePath) ?? null;
  return {
    activeFilePath: active ? active.path : activePath,
    activeFileContent: active ? active.content : "",
    isDirty: active ? isTabDirty(active) : false,
  };
}

function openFile(tabs: Tab[], path: string, content: string) {
  const existing = tabs.find((t) => t.path === path);
  const next = existing ? tabs : [...tabs, { path, content, savedContent: content }];
  return { tabs: next, ...mirror(next, path) };
}

function closeTab(tabs: Tab[], activePath: string | null, path: string) {
  const index = tabs.findIndex((t) => t.path === path);
  if (index === -1) return { tabs, ...mirror(tabs, activePath) };
  const next = tabs.filter((t) => t.path !== path);
  let nextActive = activePath;
  if (activePath === path) {
    nextActive = next[index]?.path ?? next[index - 1]?.path ?? null;
  }
  return { tabs: next, ...mirror(next, nextActive) };
}

const tab = (p: string, c = "x", s = c): Tab => ({ path: p, content: c, savedContent: s });

// --- opening -----------------------------------------------------------

let state = openFile([], "/a.tex", "alpha");
assert.equal(state.tabs.length, 1);
assert.equal(state.activeFilePath, "/a.tex");
assert.equal(state.activeFileContent, "alpha");
assert.equal(state.isDirty, false);

state = openFile(state.tabs, "/b.tex", "beta");
assert.equal(state.tabs.length, 2);
assert.equal(state.activeFileContent, "beta", "opening focuses the new tab");

// Re-opening a file that is already open must focus it, never replace it —
// otherwise switching back to a file with unsaved edits would discard them.
const edited = [{ path: "/a.tex", content: "EDITED", savedContent: "alpha" }];
const reopened = openFile(edited, "/a.tex", "alpha");
assert.equal(reopened.tabs.length, 1);
assert.equal(reopened.activeFileContent, "EDITED", "unsaved edits must survive");
assert.equal(reopened.isDirty, true);

// --- the mirrors -------------------------------------------------------

// The mirror is the single place these are computed, so it must never report
// content belonging to a different tab than activeFilePath names.
const three = [tab("/a.tex", "A"), tab("/b.tex", "B"), tab("/c.tex", "C")];
for (const t of three) {
  const m = mirror(three, t.path);
  assert.equal(m.activeFilePath, t.path);
  assert.equal(m.activeFileContent, t.content);
}

// Dirtiness is derived, so a round-trip edit leaves the tab clean.
assert.equal(isTabDirty({ path: "/a", content: "x", savedContent: "x" }), false);
assert.equal(isTabDirty({ path: "/a", content: "y", savedContent: "x" }), true);

// --- closing -----------------------------------------------------------

// Closing the active tab selects its right-hand neighbour.
let closed = closeTab(three, "/b.tex", "/b.tex");
assert.deepEqual(closed.tabs.map((t) => t.path), ["/a.tex", "/c.tex"]);
assert.equal(closed.activeFilePath, "/c.tex");

// Closing the last tab falls back to the left.
closed = closeTab(three, "/c.tex", "/c.tex");
assert.equal(closed.activeFilePath, "/b.tex");

// Closing an inactive tab leaves the selection alone.
closed = closeTab(three, "/a.tex", "/c.tex");
assert.equal(closed.activeFilePath, "/a.tex");
assert.equal(closed.activeFileContent, "A");

// Closing the only tab clears everything, and the mirror must clear with it —
// leaving stale content behind would show one file's text under another's name.
closed = closeTab([tab("/a.tex", "A")], "/a.tex", "/a.tex");
assert.deepEqual(closed.tabs, []);
assert.equal(closed.activeFilePath, null);
assert.equal(closed.activeFileContent, "");
assert.equal(closed.isDirty, false);

// Closing something that is not open is a no-op rather than an error.
closed = closeTab(three, "/a.tex", "/nope.tex");
assert.equal(closed.tabs.length, 3);
assert.equal(closed.activeFilePath, "/a.tex");

// --- cycling -----------------------------------------------------------

const cycle = (tabs: Tab[], active: string, delta: number) => {
  const i = tabs.findIndex((t) => t.path === active);
  return tabs[(i + delta + tabs.length) % tabs.length].path;
};

assert.equal(cycle(three, "/a.tex", 1), "/b.tex");
assert.equal(cycle(three, "/c.tex", 1), "/a.tex", "forward wraps to the first");
assert.equal(cycle(three, "/a.tex", -1), "/c.tex", "back wraps to the last");

console.log("tabs: all checks passed");
