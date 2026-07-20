import type { IconName } from "../components/icons";

/** Pick a file-tree icon from an extension. */
export function fileIcon(extension: string | undefined, isDir: boolean, open = false): IconName {
  if (isDir) return open ? "folder-open" : "folder";
  switch (extension) {
    case "tex":
    case "sty":
    case "cls":
      return "file-tex";
    case "pdf":
      return "file-pdf";
    case "png":
    case "jpg":
    case "jpeg":
    case "svg":
    case "eps":
      return "file-image";
    case "log":
    case "aux":
    case "toc":
    case "blg":
      return "file-log";
    case "bib":
    case "bst":
      return "file-bib";
    default:
      return "file";
  }
}
