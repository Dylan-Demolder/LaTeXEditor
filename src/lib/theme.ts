import { monaco } from "../components/editor/editor-bridge";

export type ThemeName = "dark" | "light";

const MONACO_THEME = "latex-editor";

/**
 * Read a design token off the document.
 *
 * Monaco needs literal hex — it cannot consume CSS variables — so the editor
 * theme is built from the same tokens the rest of the UI uses rather than a
 * second hardcoded palette that would silently drift out of sync.
 */
function token(name: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || "#000000";
}

/** Monaco rejects 8-digit hex in most fields; drop any alpha channel. */
function opaque(hex: string): string {
  return hex.length === 9 ? hex.slice(0, 7) : hex;
}

function defineMonacoTheme(theme: ThemeName) {
  monaco.editor.defineTheme(MONACO_THEME, {
    base: theme === "dark" ? "vs-dark" : "vs",
    inherit: true,
    rules: [
      { token: "comment.latex", foreground: opaque(token("--text-muted")), fontStyle: "italic" },
      // Commands take the accent — the same terracotta as the UI's primary action.
      { token: "keyword.latex", foreground: opaque(token("--accent")) },
      { token: "keyword.control.latex", foreground: opaque(token("--accent-hover")), fontStyle: "bold" },
      { token: "type.latex", foreground: opaque(token("--success")) },
      { token: "string.latex", foreground: opaque(token("--info")) },
      { token: "delimiter.curly.latex", foreground: opaque(token("--text-secondary")) },
      { token: "delimiter.square.latex", foreground: opaque(token("--text-secondary")) },
      { token: "delimiter.latex", foreground: opaque(token("--text-muted")) },
    ],
    colors: {
      "editor.background": opaque(token("--surface-base")),
      "editor.foreground": opaque(token("--text-primary")),
      "editorLineNumber.foreground": opaque(token("--text-muted")),
      "editorLineNumber.activeForeground": opaque(token("--accent")),
      "editorCursor.foreground": opaque(token("--accent")),
      "editor.selectionBackground": opaque(token("--surface-hover")),
      "editor.lineHighlightBackground": opaque(token("--surface-raised")),
      "editorIndentGuide.background1": opaque(token("--border")),
      "editorIndentGuide.activeBackground1": opaque(token("--border-strong")),
      "editorWidget.background": opaque(token("--surface-overlay")),
      "editorWidget.border": opaque(token("--border-strong")),
      "editorSuggestWidget.background": opaque(token("--surface-overlay")),
      "editorSuggestWidget.selectedBackground": opaque(token("--surface-hover")),
      "editorSuggestWidget.border": opaque(token("--border-strong")),
      "input.background": opaque(token("--surface-raised")),
      "input.border": opaque(token("--border-strong")),
      "scrollbarSlider.background": opaque(token("--border-strong")),
      "scrollbarSlider.hoverBackground": opaque(token("--text-muted")),
    },
  });
  monaco.editor.setTheme(MONACO_THEME);
}

/**
 * Apply a theme to the whole app. Sets `data-theme` (which swaps every CSS
 * token) and rebuilds the Monaco theme from the newly-resolved values.
 */
export function applyTheme(theme: ThemeName): void {
  document.documentElement.setAttribute("data-theme", theme);
  // Read tokens only after the attribute lands, so we pick up the new values.
  defineMonacoTheme(theme);
}

export const MONACO_THEME_NAME = MONACO_THEME;
