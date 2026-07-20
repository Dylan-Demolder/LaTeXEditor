// monaco-editor ships no .d.ts for its ESM sub-entries. edcore.main exposes the
// same API surface as the package root, minus the bundled grammars.
declare module "monaco-editor/esm/vs/editor/edcore.main" {
  export * from "monaco-editor";
}
