# LaTeXEditor

A desktop LaTeX editor built with Tauri, React, and Monaco. Edit, compile, and
preview LaTeX documents locally — with a local TeX toolchain, Git integration,
an AI assist panel, and an MCP server that exposes the open project to agents.

## Requirements

- **A LaTeX distribution** — TeX Live, MacTeX, or MiKTeX. The app detects
  `pdflatex`, `xelatex`, `lualatex`, and `latexmk` and lists whichever it finds
  in the compiler dropdown. Without one, editing works but compiling does not —
  and you get a banner with a Re-check button rather than silence.

  Discovery deliberately does **not** trust `PATH` alone. A macOS app launched
  from Finder or the Dock inherits roughly `/usr/bin:/bin:/usr/sbin:/sbin`, so a
  TeX install that works in your terminal is invisible to the bundled app.
  [compiler.rs](src-tauri/src/latex/compiler.rs) also checks
  `/Library/TeX/texbin`, Homebrew, MacPorts, `~/.local/bin`, and versioned TeX
  Live trees, and passes the compiler's own directory down to the child process
  since `latexmk` shells out to `pdflatex` in turn.
- **Node.js** and **Rust** (stable) to build from source.

## Running

```sh
npm install
npm run dev          # Tauri dev build (app window + HMR)
npm run dev:vite     # browser-only UI, no Tauri commands
npm run build        # typecheck + production web bundle
npm run tauri:build  # packaged desktop app
npm run install      # build, copy to /Applications, launch (macOS)
npm run lint
npm test             # assert-based checks (src/lib/*.check.ts) + cargo test
```

There is no test framework. Pure logic that is easy to get quietly wrong — the
line diff, code-fence stripping, context extraction, and SSE stream decoding —
has assert-based checks that run under plain `node` and `cargo test`.

`demo-project/` holds sample documents — including `broken.tex`, which fails to
compile on purpose so you can exercise the error panel.

**`demo-project/le-guide/` is the user guide, written as a LaTeXEditor
project.** Open that folder, press Typeset twice, and you have both the
documentation and a realistic multi-file project to try the editor on — it uses
`\input` across six section files, a `.bib` the AI reads for citation keys, a
TikZ diagram, `booktabs` tables and code listings. Start there.

## Features

**Editor** — Monaco with a LaTeX grammar defined in
[latex-language.ts](src/components/editor/latex-language.ts): syntax
highlighting, `\begin`/`\end` folding, `%` comment toggling, and ~20 snippets
(`figure`, `table`, `align`, `matrix`, …) on the completion list. Edits
autosave one second after you stop typing, and a pending save is flushed when
you switch files. Monaco and the pdf.js worker are bundled, so the app works
offline.

**Compile & preview** — ⌘↵ compiles. The backend locates the root `.tex` (the
one containing `\documentclass`) rather than compiling whichever file happens
to be open, writes to `<project>/build`, and parses the log into errors,
warnings, and badboxes. Clicking an issue opens the file and jumps to the line.
The PDF pane re-renders on every build and keeps your page position. "Auto"
recompiles after each save.

Pages render at the display's true pixel density (`devicePixelRatio`, capped at
3×) rather than being sized in CSS pixels and upscaled, so zooming in reveals
detail instead of magnifying blur. Zoom via the −/+ buttons (which step a ladder
of round numbers), ⌘+ / ⌘− / ⌘0 while the pointer is over the preview, or pinch
/ ctrl-scroll — which zooms continuously and keeps the point under the pointer
still. Fit width and Fit page are *modes*, not one-off calculations: a
`ResizeObserver` re-fits when you drag the splitter.

**Panels** — file tree (create, rename, delete, refresh), component library
(insert parameterized LaTeX blocks at the cursor), AI skills, Git (stage,
commit, push, pull, diff, branch), and document outline.

**Command palette** — ⌘⇧P; search it for "keyboard shortcuts" to list every
binding. (⌘K is not the palette — it opens the inline AI assistant.)

**Appearance** — a warm, paper-leaning palette with a terracotta accent, in dark
and light. Every colour is a semantic token in [index.css](src/index.css)
(`--surface-*`, `--text-*`, `--accent`), mapped to Tailwind utilities via
`@theme inline`, so a theme is a variable swap rather than a component sweep.
The Monaco theme is generated from those same tokens at runtime
([theme.ts](src/lib/theme.ts)) so the editor can't drift from the UI. Icons are
a small hand-drawn inline set ([icons.tsx](src/components/icons.tsx)) that
inherits `currentColor` — no icon font, nothing to load.

**AI** — configure a provider and key in Settings. OpenAI, Anthropic, DeepSeek,
OpenRouter, Grok, OpenCode Go, and Ollama are supported; keys are stored in
`~/.latex-editor/settings.json`.

The AI edits the document rather than just printing suggestions. There are two
surfaces, sharing one prompt builder ([ai-runner.ts](src/lib/ai-runner.ts)) so
the same skill can't behave differently depending on where you invoked it.

**⌘K, inline** ([InlineAssist.tsx](src/components/editor/InlineAssist.tsx)) — the
primary surface. Press ⌘K in a paragraph: a bar opens under the text with the
target range tinted behind it. With nothing selected it takes the paragraph the
cursor is in, bounded by blank lines *and* `\begin`/`\end`, so pressing it inside
a table body works on the row rather than swallowing the environment. Type an
instruction or click a preset; ⌘↵ accepts, Esc or the × discards, and Enter
refines — re-running against the *original* text, so refinements don't compound
edits on edits.

**The AI Skills panel** — 15 skills for work that isn't a single passage:
executive summaries, notes → prose, pasted CSV/TSV → table, consistency checks
across a document, structure suggestions.

Both share these properties:

- **Work on your selection.** Highlight a paragraph and the skill runs on that,
  not the whole file. The panel always states what it is about to send.
- **Stream.** Tokens appear as they generate, with an elapsed timer and a
  Cancel button that actually stops the request.
- **Show a diff, then apply.** Rewrites produce a line diff with unchanged
  regions collapsed, and where a line was reworded rather than replaced, a
  **word-level diff tints only the words that changed**
  ([word-diff.ts](src/lib/word-diff.ts)) — a line diff renders a one-word fix as
  a whole line deleted and a whole line added, leaving you to spot the
  difference. Pairing is applied only where it helps: lines sharing no wording,
  or with changes scattered across many runs, stay as plain line pairs, because
  a word diff there is confetti. Apply writes back into the exact range the text
  came from; switching files disables Apply rather than risking a write into the
  wrong document.
- **Know the project.** Skills declare what context they need and it is attached
  automatically: the preamble (so generated code only uses packages you load),
  existing `\label` and `.bib` keys (so references aren't invented), the file
  tree, and compile errors — "Fix Compilation Errors" reads them straight from
  the last build instead of asking you to paste a log.

Skills are typed by what they produce, so the UI matches: rewrites are diffed
and applied, generated snippets insert at the cursor, and explanations or
summaries are copy-only with no misleading Apply button. A missing API key is
caught before the request, not surfaced as a raw provider error afterwards.

**MCP server** — runs on `127.0.0.1:9876`, exposing the open project and active
file to external agents. The panel's status dot reflects the actual bind result,
so a port collision shows as "not running" instead of a green light.

**Plugins** — loaded from `~/.latex-editor/plugins/`; see `plugins/` for two
samples.

## Architecture

```
src/                        React UI
  components/editor/        Monaco setup, LaTeX grammar, editor-bridge
  components/…              one directory per panel or dialog
  stores/useAppStore.ts     Zustand store — the single source of app state
  hooks/useTauriCommands.ts typed wrappers over every Tauri command
  data/                     templates, components, AI skills, providers
src-tauri/src/
  commands/                 the Tauri command surface
  latex/                    compiler discovery, invocation, log parsing
  git/  synctex/  mcp/      feature modules
  app_config/               settings persistence
```

Panels never touch Monaco directly — they go through
[editor-bridge.ts](src/components/editor/editor-bridge.ts) (`goToLine`,
`runEditorAction`, `insertAtCursor`, `replaceRange`, `getSelectionOrParagraph`),
which owns the bundled Monaco instance.

Pure logic lives in `src/lib/` with a paired `.check.ts` — `line-diff`,
`word-diff`, `document-context`, `ai-output`. These are the parts that are easy
to get quietly wrong, so they're the parts with runnable assertions.

## Known gaps

- No editor tabs; one file is open at a time.
- SyncTeX is wired end to end in the backend but not bound to a click in the
  PDF pane yet.
- Plugins are listed and inspectable but not yet executed.
- AI context comes from the open file: `\label`s in other files of a multi-file
  project aren't collected yet (`.bib` keys are, across the project).
- One AI request at a time — Cancel targets the single in-flight call.
- Issues rows show `main.tex:0` for warnings whose line number the log parser
  doesn't extract, so clicking them jumps nowhere useful.
- `templates.ts` and `components.ts` still carry unused `icon` emoji fields;
  the UI now derives icons from category instead. Harmless, but dead.

## Gotchas worth knowing

**The base reset in [index.css](src/index.css) must stay inside `@layer base`.**
Unlayered CSS beats layered CSS in the cascade, so an unlayered
`* { padding: 0 }` silently defeats every Tailwind `p-*` / `m-*` utility in the
app — which is exactly what was happening, app-wide, until it was moved.

**Monaco consumes keystrokes before window listeners see them.** ⌘↵ was bound to
"insert line below" and swallowed, so Typeset did nothing from the editor;
shortcuts that must work while typing are registered with `editor.addCommand`,
not `window.addEventListener`. Escape is bound the same way but gated on an
`aiAssistOpen` context key, so it only closes the inline assistant when it's
open and leaves Monaco's own uses for Escape alone.

**`npm run install` is a no-op if the app is already running.** It copies to
`/Applications` and calls `open`, which just focuses the existing process — so
you keep testing the old binary. The process is named `latex-editor`, not
`LaTeXEditor`, which is also why `pkill -x LaTeXEditor` doesn't match it.
