import { Icon } from "../icons";

/**
 * Shown once, on first launch.
 *
 * Previously the app simply opened the tutorial, which is the right default but
 * the wrong manners: someone who installed a LaTeX editor to work on a document
 * they already have should not have to close a tutorial first. Offering takes
 * one click either way and makes the default obvious rather than imposed.
 */

interface Props {
  onStartTutorial: () => void;
  onSkip: () => void;
  busy?: boolean;
}

export default function WelcomeDialog({ onStartTutorial, onSkip, busy }: Props) {
  return (
    <div className="fixed inset-0 bg-black/50 grid place-items-center z-50">
      <div className="bg-base border border-edge-strong rounded-xl w-[460px] shadow-[var(--shadow-overlay)] overflow-hidden">
        <div className="px-6 pt-6 pb-5">
          <div className="flex items-center gap-2.5 mb-3">
            <Icon name="sparkle" size={18} className="text-accent" />
            <h2 className="text-title text-ink">Welcome to LaTeXEditor</h2>
          </div>

          <p className="text-body text-ink-2 mb-4">
            There is a short tutorial that walks you through typesetting, fixing
            an error, and editing with AI. It takes about fifteen minutes and
            ends with a finished one-page report.
          </p>

          <p className="text-tiny text-ink-3">
            You can open it again at any time from Settings, or the command
            palette with {"⌘⇧P"}.
          </p>
        </div>

        <div className="flex items-center gap-2 px-6 py-4 bg-sunken border-t border-edge">
          <button
            onClick={onStartTutorial}
            disabled={busy}
            className="px-3 py-1.5 text-tiny rounded-md bg-accent hover:bg-accent-hover text-accent-fg disabled:opacity-50 transition-colors"
          >
            {busy ? "Opening…" : "Start the tutorial"}
          </button>
          <button
            onClick={onSkip}
            disabled={busy}
            className="px-3 py-1.5 text-tiny rounded-md bg-hover hover:bg-edge-strong text-ink-2 disabled:opacity-50 transition-colors"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
