import { useEffect, useRef } from "react";
import { useAppStore, isTabDirty } from "../../stores/useAppStore";
import { Icon } from "../icons";
import { fileIcon } from "../../lib/file-icons";

/**
 * The open-file tabs.
 *
 * Monaco already keeps one model per `path` and preserves each model's view
 * state and undo history, so switching tabs restores the cursor, the scroll
 * position and the undo stack without this component doing anything. All it
 * owns is which path is active and which are open.
 */

interface Props {
  /** Persist a file before its tab goes away. */
  onCloseTab: (path: string) => void | Promise<void>;
}

export default function EditorTabs({ onCloseTab }: Props) {
  const { tabs, activeFilePath, setActiveFile } = useAppStore();
  const stripRef = useRef<HTMLDivElement>(null);

  // Keep the active tab in view. Switching with the keyboard through a strip
  // wider than the pane is otherwise invisible.
  useEffect(() => {
    stripRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeFilePath]);

  if (tabs.length === 0) return null;

  const cycle = (delta: number) => {
    const index = tabs.findIndex((t) => t.path === activeFilePath);
    if (index === -1) return;
    // Wrap, so ⌘⇧] on the last tab returns to the first.
    const next = (index + delta + tabs.length) % tabs.length;
    setActiveFile(tabs[next].path);
  };

  return (
    <div
      ref={stripRef}
      role="tablist"
      className="flex items-stretch shrink-0 h-9 border-b border-edge bg-sunken overflow-x-auto"
      onKeyDown={(e) => {
        if (!(e.metaKey || e.ctrlKey) || !e.shiftKey) return;
        if (e.key === "[") { e.preventDefault(); cycle(-1); }
        if (e.key === "]") { e.preventDefault(); cycle(1); }
      }}
    >
      {tabs.map((tab) => {
        const name = tab.path.split("/").pop() ?? tab.path;
        const extension = name.includes(".") ? name.split(".").pop() : undefined;
        const isActive = tab.path === activeFilePath;
        const dirty = isTabDirty(tab);

        return (
          <div
            key={tab.path}
            role="tab"
            aria-selected={isActive}
            data-active={isActive}
            onClick={() => setActiveFile(tab.path)}
            // Middle-click closes, as in every browser and editor.
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                onCloseTab(tab.path);
              }
            }}
            title={tab.path}
            className={`group flex items-center gap-1.5 pl-2.5 pr-1.5 min-w-0 max-w-[13rem]
              cursor-pointer border-r border-edge transition-colors ${
                isActive
                  ? "bg-base text-ink"
                  : "text-ink-3 hover:text-ink-2 hover:bg-hover"
              }`}
          >
            <Icon name={fileIcon(extension, false)} size={13} className="shrink-0 opacity-70" />
            <span className="text-tiny truncate">{name}</span>

            {/* One slot holds either the dirty dot or the close button, so the
                tab does not change width on hover. */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(tab.path);
              }}
              aria-label={`Close ${name}`}
              className="grid place-items-center w-4 h-4 shrink-0 rounded-sm
                         hover:bg-edge-strong text-ink-3 hover:text-ink"
            >
              {dirty ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-accent group-hover:hidden" />
                  <Icon name="close" size={10} className="hidden group-hover:block" />
                </>
              ) : (
                <Icon
                  name="close"
                  size={10}
                  className={isActive ? "" : "opacity-0 group-hover:opacity-100"}
                />
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
