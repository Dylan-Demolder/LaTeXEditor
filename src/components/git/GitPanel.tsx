import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "../../stores/useAppStore";
import {
  gitStatus,
  gitInit,
  gitAdd,
  gitCommit,
  gitPush,
  gitPull,
  gitDiff as gitDiffCmd,
} from "../../hooks/useTauriCommands";

export default function GitPanel() {
  const { projectPath, activeFilePath } = useAppStore();
  const [info, setInfo] = useState<any>(null);
  const [commitMessage, setCommitMessage] = useState("");
  const [diff, setDiff] = useState<any>(null);

  const refresh = useCallback(async () => {
    if (!projectPath) return;
    try {
      const s = await gitStatus(projectPath);
      setInfo(s);
    } catch {
      setInfo({ is_repo: false });
    }
  }, [projectPath]);

  useEffect(() => { refresh(); }, [refresh]);

  if (!projectPath) {
    return (
      <div className="h-full flex items-center justify-center text-ink-3 text-tiny">
        Open a project to use Git
      </div>
    );
  }

  if (!info?.is_repo) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-ink-3 text-tiny p-4">
        <span>Not a git repository</span>
        <button onClick={async () => { await gitInit(projectPath); refresh(); }} className="px-3 py-1 bg-accent text-accent-fg rounded text-tiny">
          Initialize Git Repository
        </button>
      </div>
    );
  }

  const status = info.status;
  const hasChanges = (status?.modified?.length || 0) + (status?.untracked?.length || 0) + (status?.staged?.length || 0) > 0;

  return (
    <div className="h-full flex flex-col bg-base overflow-hidden">
      <div className="flex items-center pl-3 pr-1.5 h-8 shrink-0 border-b border-edge">
        <span className="panel-label">Git</span></div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div className="flex items-center gap-2 text-tiny">
          <span className="text-ink-3">Branch:</span>
          <span className="text-success font-mono">{status?.branch || "main"}</span>
          {status?.ahead > 0 && <span className="text-warning">↑{status.ahead}</span>}
          {status?.behind > 0 && <span className="text-warning">↓{status.behind}</span>}
        </div>

        <div className="space-y-1">
          <div className="text-tiny text-ink-3 font-medium">Staged ({status?.staged?.length || 0})</div>
          {status?.staged?.map((f: string) => <div key={f} className="text-tiny text-success font-mono truncate pl-2">{f}</div>)}
          <div className="text-tiny text-ink-3 font-medium mt-2">Modified ({status?.modified?.length || 0})</div>
          {status?.modified?.map((f: string) => <div key={f} className="text-tiny text-warning font-mono truncate pl-2">{f}</div>)}
          <div className="text-tiny text-ink-3 font-medium mt-2">Untracked ({status?.untracked?.length || 0})</div>
          {status?.untracked?.map((f: string) => <div key={f} className="text-tiny text-danger font-mono truncate pl-2">{f}</div>)}
        </div>

        <div className="space-y-2 pt-2 border-t border-edge">
          <div className="flex gap-1 flex-wrap">
            {hasChanges && <button onClick={async () => { await gitAdd(projectPath, []); refresh(); }} className="px-2 py-1 text-tiny bg-hover hover:bg-edge-strong text-ink rounded">Stage All</button>}
            <button onClick={async () => { await gitPush(projectPath); refresh(); }} className="px-2 py-1 text-tiny bg-hover hover:bg-edge-strong text-ink rounded">Push</button>
            <button onClick={async () => { await gitPull(projectPath); refresh(); }} className="px-2 py-1 text-tiny bg-hover hover:bg-edge-strong text-ink rounded">Pull</button>
          </div>

          <div className="space-y-1">
            <textarea value={commitMessage} onChange={(e) => setCommitMessage(e.target.value)} placeholder="Commit message..."
              rows={2} className="w-full bg-hover text-ink text-tiny px-2 py-1 rounded border border-edge-strong resize-none" />
            <button onClick={async () => { await gitCommit(projectPath, commitMessage); setCommitMessage(""); refresh(); }}
              disabled={!commitMessage}
              className={`w-full px-2 py-1 text-tiny rounded ${commitMessage ? "bg-success hover:bg-success/80 text-accent-fg" : "bg-hover text-ink-3"}`}>
              Commit
            </button>
          </div>
        </div>

        <div className="pt-2 border-t border-edge">
          <div className="text-tiny text-ink-3 font-medium mb-1">Recent Commits</div>
          {info.commits?.slice(0, 10).map((c: any) => (
            <div key={c.hash} className="text-tiny text-ink-2 font-mono flex gap-2 py-0.5">
              <span className="text-warning">{c.hash.slice(0, 7)}</span>
              <span className="truncate">{c.message}</span>
            </div>
          ))}
        </div>

        {activeFilePath && (
          <button onClick={async () => {
            const d = await gitDiffCmd(projectPath, activeFilePath); setDiff(d);
          }} className="w-full px-2 py-1 text-tiny bg-hover hover:bg-edge-strong text-ink rounded">
            View Diff
          </button>
        )}

        {diff && (
          <div className="bg-sunken rounded p-2 font-mono text-tiny max-h-60 overflow-auto">
            {diff.hunks?.map((h: any, hi: number) => (
              <div key={hi}>
                {h.lines?.map((l: any, li: number) => (
                  <div key={li} className={l.origin === "+" ? "text-success" : l.origin === "-" ? "text-danger" : "text-ink-3"}>
                    {l.origin} {l.content}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}