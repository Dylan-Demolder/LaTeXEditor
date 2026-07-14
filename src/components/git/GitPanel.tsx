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
      <div className="h-full flex items-center justify-center text-gray-500 text-xs">
        Open a project to use Git
      </div>
    );
  }

  if (!info?.is_repo) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-gray-500 text-xs p-4">
        <span>Not a git repository</span>
        <button onClick={async () => { await gitInit(projectPath); refresh(); }} className="px-3 py-1 bg-blue-600 text-white rounded text-xs">
          Initialize Git Repository
        </button>
      </div>
    );
  }

  const status = info.status;
  const hasChanges = (status?.modified?.length || 0) + (status?.untracked?.length || 0) + (status?.staged?.length || 0) > 0;

  return (
    <div className="h-full flex flex-col bg-gray-850 overflow-hidden">
      <div className="px-3 py-1.5 bg-gray-800 border-b border-gray-700 text-gray-300 text-xs font-medium">Git</div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-500">Branch:</span>
          <span className="text-green-400 font-mono">{status?.branch || "main"}</span>
          {status?.ahead > 0 && <span className="text-yellow-400">↑{status.ahead}</span>}
          {status?.behind > 0 && <span className="text-yellow-400">↓{status.behind}</span>}
        </div>

        <div className="space-y-1">
          <div className="text-xs text-gray-500 font-medium">Staged ({status?.staged?.length || 0})</div>
          {status?.staged?.map((f: string) => <div key={f} className="text-xs text-green-400 font-mono truncate pl-2">{f}</div>)}
          <div className="text-xs text-gray-500 font-medium mt-2">Modified ({status?.modified?.length || 0})</div>
          {status?.modified?.map((f: string) => <div key={f} className="text-xs text-yellow-400 font-mono truncate pl-2">{f}</div>)}
          <div className="text-xs text-gray-500 font-medium mt-2">Untracked ({status?.untracked?.length || 0})</div>
          {status?.untracked?.map((f: string) => <div key={f} className="text-xs text-red-400 font-mono truncate pl-2">{f}</div>)}
        </div>

        <div className="space-y-2 pt-2 border-t border-gray-700">
          <div className="flex gap-1 flex-wrap">
            {hasChanges && <button onClick={async () => { await gitAdd(projectPath, []); refresh(); }} className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded">Stage All</button>}
            <button onClick={async () => { await gitPush(projectPath); refresh(); }} className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded">Push</button>
            <button onClick={async () => { await gitPull(projectPath); refresh(); }} className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded">Pull</button>
          </div>

          <div className="space-y-1">
            <textarea value={commitMessage} onChange={(e) => setCommitMessage(e.target.value)} placeholder="Commit message..."
              rows={2} className="w-full bg-gray-700 text-gray-200 text-xs px-2 py-1 rounded border border-gray-600 resize-none" />
            <button onClick={async () => { await gitCommit(projectPath, commitMessage); setCommitMessage(""); refresh(); }}
              disabled={!commitMessage}
              className={`w-full px-2 py-1 text-xs rounded ${commitMessage ? "bg-green-700 hover:bg-green-600 text-white" : "bg-gray-700 text-gray-500"}`}>
              Commit
            </button>
          </div>
        </div>

        <div className="pt-2 border-t border-gray-700">
          <div className="text-xs text-gray-500 font-medium mb-1">Recent Commits</div>
          {info.commits?.slice(0, 10).map((c: any) => (
            <div key={c.hash} className="text-xs text-gray-400 font-mono flex gap-2 py-0.5">
              <span className="text-yellow-500">{c.hash.slice(0, 7)}</span>
              <span className="truncate">{c.message}</span>
            </div>
          ))}
        </div>

        {activeFilePath && (
          <button onClick={async () => {
            const d = await gitDiffCmd(projectPath, activeFilePath); setDiff(d);
          }} className="w-full px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded">
            View Diff
          </button>
        )}

        {diff && (
          <div className="bg-gray-900 rounded p-2 font-mono text-xs max-h-60 overflow-auto">
            {diff.hunks?.map((h: any, hi: number) => (
              <div key={hi}>
                {h.lines?.map((l: any, li: number) => (
                  <div key={li} className={l.origin === "+" ? "text-green-400" : l.origin === "-" ? "text-red-400" : "text-gray-500"}>
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