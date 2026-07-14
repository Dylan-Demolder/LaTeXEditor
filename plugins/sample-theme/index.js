// Solarized Dark Theme Plugin
// Defines custom Monaco editor colors

module.exports = function activate(api) {
  api.events.on("editor:ready", () => {
    const theme = {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "586e75", fontStyle: "italic" },
        { token: "keyword", foreground: "859900" },
        { token: "string", foreground: "2aa198" },
        { token: "number", foreground: "d33682" },
        { token: "type", foreground: "b58900" },
        { token: "function", foreground: "268bd2" },
        { token: "variable", foreground: "93a1a1" },
        { token: "constant", foreground: "dc322f" },
        { token: "support", foreground: "6c71c4" },
      ],
      colors: {
        "editor.background": "#002b36",
        "editor.foreground": "#839496",
        "editor.lineHighlightBackground": "#073642",
        "editor.selectionBackground": "#073642",
        "editorCursor.foreground": "#839496",
        "editorLineNumber.foreground": "#586e75",
        "editorLineNumber.activeForeground": "#93a1a1",
      },
    };

    if (window.monaco) {
      window.monaco.editor.defineTheme("solarized-dark", theme);
    }
  });

  api.events.on("editor:theme-change", (themeName) => {
    if (themeName === "default") return;
    if (window.monaco) {
      window.monaco.editor.setTheme(themeName);
    }
  });
};
