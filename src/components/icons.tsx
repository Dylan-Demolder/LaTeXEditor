/**
 * Inline icon set.
 *
 * Hand-rolled rather than a dependency: this is a fixed, small set, and drawing
 * them here means they inherit `currentColor` and therefore theme automatically,
 * with no icon-font loading and nothing extra to ship.
 *
 * All icons are drawn on a 16x16 grid with a 1.5 stroke so they sit optically
 * level with 13px text.
 */
export type IconName =
  | "folder"
  | "folder-open"
  | "file"
  | "file-tex"
  | "file-pdf"
  | "file-image"
  | "file-log"
  | "file-bib"
  | "chevron-right"
  | "chevron-down"
  | "close"
  | "plus"
  | "minus"
  | "folder-plus"
  | "trash"
  | "pencil"
  | "refresh"
  | "search"
  | "play"
  | "settings"
  | "plug"
  | "sparkle"
  | "git-branch"
  | "list"
  | "grid"
  | "alert-triangle"
  | "alert-circle"
  | "info"
  | "check"
  | "copy"
  | "panel-left"
  | "template"
  | "eye"
  | "eye-off"
  | "stop"
  | "arrow-left"
  | "box"
  | "function"
  | "wrench";

interface Props {
  name: IconName;
  /** Pixel size; defaults to 16 to match the 13px text baseline. */
  size?: number;
  className?: string;
  title?: string;
}

const PATHS: Record<IconName, React.ReactNode> = {
  folder: <path d="M1.75 4.25c0-.55.45-1 1-1h3.1c.33 0 .64.16.83.43l.74 1.07h5.83c.55 0 1 .45 1 1v6.5c0 .55-.45 1-1 1H2.75c-.55 0-1-.45-1-1z" />,
  "folder-open": (
    <>
      <path d="M1.75 12.25v-8c0-.55.45-1 1-1h3.1c.33 0 .64.16.83.43l.74 1.07h4.83c.55 0 1 .45 1 1v1" />
      <path d="M1.75 12.25 3.6 7.4a1 1 0 0 1 .94-.65h9.4a.6.6 0 0 1 .57.8l-1.6 4.7z" />
    </>
  ),
  file: (
    <>
      <path d="M9 1.75H4.25c-.55 0-1 .45-1 1v10.5c0 .55.45 1 1 1h7.5c.55 0 1-.45 1-1V5.5z" />
      <path d="M9 1.75V5.5h3.75" />
    </>
  ),
  "file-tex": (
    <>
      <path d="M9 1.75H4.25c-.55 0-1 .45-1 1v10.5c0 .55.45 1 1 1h7.5c.55 0 1-.45 1-1V5.5z" />
      <path d="M9 1.75V5.5h3.75" />
      <path d="M5.75 8.75h3M7.25 8.75v3.5" />
    </>
  ),
  "file-pdf": (
    <>
      <path d="M9 1.75H4.25c-.55 0-1 .45-1 1v10.5c0 .55.45 1 1 1h7.5c.55 0 1-.45 1-1V5.5z" />
      <path d="M9 1.75V5.5h3.75" />
      <path d="M5.75 12.25V8.5h1.1a1.1 1.1 0 0 1 0 2.2h-1.1" />
    </>
  ),
  "file-image": (
    <>
      <path d="M9 1.75H4.25c-.55 0-1 .45-1 1v10.5c0 .55.45 1 1 1h7.5c.55 0 1-.45 1-1V5.5z" />
      <path d="M9 1.75V5.5h3.75" />
      <circle cx="6.4" cy="9" r=".85" />
      <path d="M3.6 12.6 6.2 10.5l2.1 1.6 1.6-1.3 2.3 1.9" />
    </>
  ),
  "file-log": (
    <>
      <path d="M9 1.75H4.25c-.55 0-1 .45-1 1v10.5c0 .55.45 1 1 1h7.5c.55 0 1-.45 1-1V5.5z" />
      <path d="M9 1.75V5.5h3.75" />
      <path d="M5.75 8.5h4.5M5.75 10.5h4.5M5.75 12.5h2.5" />
    </>
  ),
  "file-bib": (
    <>
      <path d="M3.25 3.25c0-.83.67-1.5 1.5-1.5h7.5c.28 0 .5.22.5.5v9.5" />
      <path d="M3.25 3.25v9.25c0 .97.78 1.75 1.75 1.75h7.75" />
      <path d="M12.75 11.75H5a1.75 1.75 0 0 0 0 3.5" />
    </>
  ),
  "chevron-right": <path d="M6 3.5 10.5 8 6 12.5" />,
  "chevron-down": <path d="M3.5 6 8 10.5 12.5 6" />,
  close: <path d="M4 4l8 8M12 4l-8 8" />,
  plus: <path d="M8 3.5v9M3.5 8h9" />,
  minus: <path d="M3.5 8h9" />,
  "folder-plus": (
    <>
      <path d="M14.25 11.5v1.25c0 .55-.45 1-1 1H2.75c-.55 0-1-.45-1-1v-8.5c0-.55.45-1 1-1h3.1c.33 0 .64.16.83.43l.74 1.07h5.83c.55 0 1 .45 1 1V7" />
      <path d="M11.75 8v4M9.75 10h4" />
    </>
  ),
  trash: (
    <>
      <path d="M2.75 4.25h10.5" />
      <path d="M6.25 4.25V3a1 1 0 0 1 1-1h1.5a1 1 0 0 1 1 1v1.25" />
      <path d="M4 4.25v8.5a1.5 1.5 0 0 0 1.5 1.5h5a1.5 1.5 0 0 0 1.5-1.5v-8.5" />
      <path d="M6.75 7v4M9.25 7v4" />
    </>
  ),
  pencil: (
    <>
      <path d="M11.25 2.5a1.6 1.6 0 0 1 2.25 2.25L5.5 12.75l-3 .75.75-3z" />
      <path d="M10 3.75 12.25 6" />
    </>
  ),
  refresh: (
    <>
      <path d="M13.5 7A5.5 5.5 0 0 0 3.7 4.2M2.5 9A5.5 5.5 0 0 0 12.3 11.8" />
      <path d="M13.5 3v4h-4M2.5 13V9h4" />
    </>
  ),
  search: (
    <>
      <circle cx="7.25" cy="7.25" r="4.5" />
      <path d="M10.5 10.5 13.5 13.5" />
    </>
  ),
  play: <path d="M4.75 3.4a.5.5 0 0 1 .76-.43l7 4.6a.5.5 0 0 1 0 .86l-7 4.6a.5.5 0 0 1-.76-.43z" />,
  stop: <rect x="4" y="4" width="8" height="8" rx="1.25" />,
  settings: (
    <>
      <circle cx="8" cy="8" r="2.25" />
      <path d="M8 1.75v1.5M8 12.75v1.5M14.25 8h-1.5M3.25 8h-1.5M12.42 3.58l-1.06 1.06M4.64 11.36l-1.06 1.06M12.42 12.42l-1.06-1.06M4.64 4.64 3.58 3.58" />
    </>
  ),
  plug: (
    <>
      <path d="M6 2v3.5M10 2v3.5" />
      <path d="M4 5.5h8v2.25A3.75 3.75 0 0 1 8.25 11.5h-.5A3.75 3.75 0 0 1 4 7.75z" />
      <path d="M8 11.5V14" />
    </>
  ),
  sparkle: (
    <path d="M8 1.75 9.4 5.9a1 1 0 0 0 .7.7L14.25 8l-4.15 1.4a1 1 0 0 0-.7.7L8 14.25 6.6 10.1a1 1 0 0 0-.7-.7L1.75 8 5.9 6.6a1 1 0 0 0 .7-.7z" />
  ),
  "git-branch": (
    <>
      <circle cx="4.5" cy="3.5" r="1.75" />
      <circle cx="4.5" cy="12.5" r="1.75" />
      <circle cx="11.5" cy="6" r="1.75" />
      <path d="M4.5 5.25v5.5" />
      <path d="M11.5 7.75a3.5 3.5 0 0 1-3.5 3.5H6.25" />
    </>
  ),
  list: <path d="M3 4.25h10M3 8h10M3 11.75h6" />,
  grid: (
    <>
      <rect x="2.5" y="2.5" width="4.75" height="4.75" rx="1" />
      <rect x="8.75" y="2.5" width="4.75" height="4.75" rx="1" />
      <rect x="2.5" y="8.75" width="4.75" height="4.75" rx="1" />
      <rect x="8.75" y="8.75" width="4.75" height="4.75" rx="1" />
    </>
  ),
  "alert-triangle": (
    <>
      <path d="M7.13 2.6a1 1 0 0 1 1.74 0l5 8.65a1 1 0 0 1-.87 1.5H3a1 1 0 0 1-.87-1.5z" />
      <path d="M8 6.25v3M8 11.25v.01" />
    </>
  ),
  "alert-circle": (
    <>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 4.75v3.5M8 11.25v.01" />
    </>
  ),
  info: (
    <>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 7.5v3.75M8 4.75v.01" />
    </>
  ),
  check: <path d="M3 8.5 6.5 12 13 4.5" />,
  copy: (
    <>
      <rect x="5.75" y="5.75" width="8" height="8" rx="1.25" />
      <path d="M10.75 5.75v-2a1.25 1.25 0 0 0-1.25-1.25h-6A1.25 1.25 0 0 0 2.25 3.75v6A1.25 1.25 0 0 0 3.5 11h2" />
    </>
  ),
  "panel-left": (
    <>
      <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5" />
      <path d="M6.25 2.75v10.5" />
    </>
  ),
  template: (
    <>
      <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5" />
      <path d="M1.75 6.25h12.5M6.25 6.25v7" />
    </>
  ),
  eye: (
    <>
      <path d="M1.75 8S3.9 3.75 8 3.75 14.25 8 14.25 8 12.1 12.25 8 12.25 1.75 8 1.75 8" />
      <circle cx="8" cy="8" r="1.9" />
    </>
  ),
  "eye-off": (
    <>
      <path d="M6.4 4.05A5.7 5.7 0 0 1 8 3.85c4.1 0 6.25 4.15 6.25 4.15a11 11 0 0 1-1.85 2.4M4.2 5.3A10.8 10.8 0 0 0 1.75 8S3.9 12.15 8 12.15c.9 0 1.7-.2 2.4-.5" />
      <path d="M2.5 2.5l11 11" />
    </>
  ),
  "arrow-left": <path d="M12.5 8h-9M7 3.5 2.5 8 7 12.5" />,
  box: (
    <>
      <path d="M13.75 5.25 8 2.25 2.25 5.25v5.5L8 13.75l5.75-3z" />
      <path d="M2.25 5.25 8 8.25l5.75-3M8 8.25v5.5" />
    </>
  ),
  // An italic "f" — stands in for maths/equations.
  function: (
    <>
      <path d="M10.25 2.75h-.9a2.4 2.4 0 0 0-2.36 2l-1.4 8.5" />
      <path d="M4.25 6.5h5.5" />
    </>
  ),
  wrench: (
    <path d="M10.1 2.4a3.9 3.9 0 0 0-4.7 5.05L2.4 10.45a1.35 1.35 0 0 0 1.9 1.9l3-3a3.9 3.9 0 0 0 5.05-4.7L10.6 6.4 9 4.8z" />
  ),
};

/** Icons that read better filled than stroked. */
const FILLED = new Set<IconName>(["sparkle", "play", "stop", "folder"]);

export function Icon({ name, size = 16, className = "", title }: Props) {
  const filled = FILLED.has(name);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      focusable="false"
    >
      {title && <title>{title}</title>}
      {PATHS[name]}
    </svg>
  );
}
