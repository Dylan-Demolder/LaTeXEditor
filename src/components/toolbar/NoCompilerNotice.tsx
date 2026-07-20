import { useState } from "react";
import { useAppStore } from "../../stores/useAppStore";
import { checkCompilers } from "../../hooks/useTauriCommands";
import { Icon } from "../icons";

/**
 * Shown when startup detection found no LaTeX distribution.
 *
 * Without this the failure is silent until you press Typeset, and then arrives
 * as a compiler error in the Issues panel — which reads like a problem with
 * your document rather than a missing dependency.
 */
export default function NoCompilerNotice() {
  const { compilers, compilersChecked } = useAppStore();
  const [dismissed, setDismissed] = useState(false);
  const [rechecking, setRechecking] = useState(false);

  if (dismissed || !compilersChecked || compilers.length > 0) return null;

  const platform = navigator.platform.toLowerCase();
  const advice = platform.includes("mac")
    ? "brew install texlive, or MacTeX from tug.org/mactex"
    : platform.includes("win")
      ? "MiKTeX from miktex.org, or TeX Live"
      : "your package manager's texlive package";

  // Detection otherwise runs only at startup, so without this you would have
  // to restart the app after installing a distribution.
  const recheck = async () => {
    setRechecking(true);
    try {
      const found = await checkCompilers();
      const state = useAppStore.getState();
      state.setCompilers(found);
      if (found.length > 0 && !state.selectedCompiler) {
        state.setSelectedCompiler(found[0]);
      }
    } finally {
      setRechecking(false);
    }
  };

  return (
    <div className="flex items-start gap-2.5 px-3 py-2 shrink-0 bg-warning-subtle border-b border-edge">
      <Icon name="alert-triangle" size={15} className="text-warning mt-0.5" />
      <div className="flex-1 min-w-0 text-tiny leading-relaxed">
        <span className="text-ink font-medium">No LaTeX distribution found.</span>{" "}
        <span className="text-ink-2">
          Editing works, but Typeset needs one installed — {advice}. The editor
          checks your PATH plus the usual install locations, so no PATH setup is
          required.
        </span>
      </div>
      <button
        onClick={recheck}
        disabled={rechecking}
        className="flex items-center gap-1.5 h-6 px-2 rounded-md text-tiny text-ink-2 border border-edge hover:border-edge-strong hover:text-ink transition-colors shrink-0 disabled:opacity-50"
      >
        <Icon name="refresh" size={12} />
        {rechecking ? "Checking…" : "Re-check"}
      </button>
      <button
        onClick={() => setDismissed(true)}
        title="Dismiss"
        className="grid place-items-center w-6 h-6 rounded text-ink-3 hover:text-ink hover:bg-hover transition-colors shrink-0"
      >
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}
