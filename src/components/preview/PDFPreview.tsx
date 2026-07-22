import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import type { RenderParameters } from "pdfjs-dist/types/src/display/api";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useAppStore } from "../../stores/useAppStore";
import { readPdf, loadSettings, synctexInverse, readFile } from "../../hooks/useTauriCommands";
import { Icon } from "../icons";
import { goToLine } from "../editor/editor-bridge";

// Bundled worker, not a CDN one: the app must work offline, and pdf.js refuses
// to run a worker whose version differs from the library's.
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const MIN_SCALE = 0.25;
const MAX_SCALE = 5;

/**
 * Stops the +/- buttons on arbitrary values. Stepping by a fixed factor drifts
 * to things like 137%, which reads as broken; this lands on numbers a reader
 * recognises. Pinch zoom stays continuous and ignores the ladder.
 */
const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5];

function stepZoom(scale: number, direction: 1 | -1): number {
  if (direction === 1) {
    return ZOOM_STEPS.find((s) => s > scale + 0.001) ?? MAX_SCALE;
  }
  return [...ZOOM_STEPS].reverse().find((s) => s < scale - 0.001) ?? MIN_SCALE;
}

const clamp = (n: number) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, n));

/** Padding inside the scroll container, matching the p-6 on the page area. */
const PAGE_MARGIN = 48;

type FitMode = "none" | "width" | "page";

export default function PDFPreview() {
  const {
    pdfPath,
    pdfVersion,
    compileMessage,
    isCompiling,
    compileErrors,
    projectPath,
    openFile,
  } = useAppStore();
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fit is a mode, not a one-off calculation. Computing a scale once and
  // forgetting meant the page stopped fitting the moment you dragged the
  // splitter — which is exactly when you were trying to make it fit.
  const [fitMode, setFitMode] = useState<FitMode>("none");
  /** The page at scale 1, in CSS pixels — what fit calculations divide into. */
  const [pageSize, setPageSize] = useState<{ w: number; h: number } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const hovering = useRef(false);
  /** Scroll position to restore after a cursor-anchored zoom. */
  const anchorRef = useRef<{ x: number; y: number; ratio: number } | null>(null);

  // Honour the saved default zoom on mount. Read once: changing it in Settings
  // is a statement about how the next document should open, not a command to
  // yank the zoom out from under someone mid-read.
  useEffect(() => {
    loadSettings()
      .then((s) => {
        const pref = s.defaultPreviewZoom;
        if (!pref || pref === "fit-width") return setFitMode("width");
        if (pref === "fit-page") return setFitMode("page");
        const percent = Number(pref);
        if (!Number.isNaN(percent) && percent > 0) setScale(clamp(percent / 100));
      })
      .catch(() => {});
  }, []);

  /** Which document is on screen, so a reload can tell a rebuild from a switch. */
  const loadedPathRef = useRef<string | null>(null);

  const loadPdf = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await readPdf(path);
      const uint8 = new Uint8Array(data);
      const doc = await pdfjsLib.getDocument({ data: uint8 }).promise;

      // Recompiling the document you are reading should keep your place;
      // opening a *different* document should not. Landing on page 8 of a new
      // paper because that is where you were in the last one reads as a bug.
      const isSameDocument = loadedPathRef.current === path;
      loadedPathRef.current = path;

      setPdfDoc(doc);
      setNumPages(doc.numPages);
      setPageNum((p) =>
        isSameDocument ? Math.min(Math.max(p, 1), doc.numPages) : 1
      );
    } catch (e) {
      setError(`Failed to load PDF: ${e}`);
      setPdfDoc(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (pdfPath) {
      loadPdf(pdfPath);
    } else {
      setPdfDoc(null);
    }
    // pdfVersion changes on every compile so a rebuild of the same path reloads.
  }, [pdfPath, pdfVersion, loadPdf]);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    // pdf.js throws if two render tasks share a canvas, which happens whenever
    // the user pages or zooms faster than a page renders.
    let cancelled = false;
    let task: pdfjsLib.RenderTask | null = null;

    (async () => {
      const page = await pdfDoc.getPage(pageNum);
      if (cancelled || !canvasRef.current) return;

      // Render at the display's true pixel density. Sizing the canvas in CSS
      // pixels means every rendered pixel is stretched across dpr^2 device
      // pixels on a Retina screen, which is why the text looked soft. Cap at 3
      // so a very high-DPI display doesn't allocate an enormous backing store.
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const viewport = page.getViewport({ scale: scale * dpr });
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d", { alpha: false })!;

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      // Backing store is dpr times larger; display it at the logical size.
      canvas.style.width = `${Math.round(viewport.width / dpr)}px`;
      canvas.style.height = `${Math.round(viewport.height / dpr)}px`;

      // Remember the unscaled page so fit modes have something to divide into.
      const natural = page.getViewport({ scale: 1 });
      setPageSize((prev) =>
        prev && prev.w === natural.width && prev.h === natural.height
          ? prev
          : { w: natural.width, h: natural.height }
      );

      task = page.render({ canvasContext: ctx, viewport } as RenderParameters);
      try {
        await task.promise;
      } catch {
        // Cancelled by a newer render; nothing to report.
      }
    })();

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdfDoc, pageNum, scale]);

  /** Recompute the scale a fit mode implies, from the live container size. */
  const applyFit = useCallback(
    (mode: FitMode) => {
      const container = containerRef.current;
      if (mode === "none" || !container || !pageSize) return;
      const availableW = container.clientWidth - PAGE_MARGIN;
      const availableH = container.clientHeight - PAGE_MARGIN;
      const next =
        mode === "width"
          ? availableW / pageSize.w
          : Math.min(availableW / pageSize.w, availableH / pageSize.h);
      if (next > 0) setScale(clamp(Math.round(next * 100) / 100));
    },
    [pageSize]
  );

  // Re-fit whenever the pane is resized or the page dimensions change.
  useEffect(() => {
    if (fitMode === "none") return;
    applyFit(fitMode);
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => applyFit(fitMode));
    observer.observe(container);
    return () => observer.disconnect();
  }, [fitMode, applyFit]);

  /**
   * Click-to-source. Convert the click from canvas pixels to PDF points and
   * ask SyncTeX which line produced that spot.
   *
   * The canvas backing store is `scale * dpr` times the PDF's natural size, so
   * dividing the offset within the canvas by `scale` recovers points. Using
   * getBoundingClientRect keeps this in CSS pixels and independent of dpr.
   */
  const handlePageClick = useCallback(
    async (e: React.MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas || !pdfPath || !projectPath) return;

      const rect = canvas.getBoundingClientRect();
      const xPt = (e.clientX - rect.left) / scale;
      const yPt = (e.clientY - rect.top) / scale;

      // The synctex file sits beside the PDF and is named for the root
      // document, which is what pdfPath points at.
      const outDir = pdfPath.slice(0, pdfPath.lastIndexOf("/"));

      try {
        const result = await synctexInverse(pdfPath, outDir, pageNum, xPt, yPt);
        if (!result?.successful || !result.file) {
          setSyncNote("No source position for that point.");
          setTimeout(() => setSyncNote(null), 2500);
          return;
        }
        openFile(result.file, await readFile(result.file));
        // Let the editor swap models before seeking, as the Issues panel does.
        setTimeout(() => goToLine(result.line ?? 1), 100);
      } catch {
        setSyncNote("Typeset again to enable click-to-source.");
        setTimeout(() => setSyncNote(null), 2500);
      }
    },
    [pdfPath, projectPath, scale, pageNum, openFile]
  );

  /** Any manual zoom leaves fit mode — otherwise the next resize undoes it. */
  const zoomTo = useCallback((next: number) => {
    setFitMode("none");
    setScale(clamp(next));
  }, []);

  /**
   * Pinch on a trackpad arrives as a wheel event with ctrlKey set. Zoom
   * continuously rather than through the ladder, and keep the point under the
   * pointer still — zooming toward the centre while you point at a figure is
   * the thing that makes a preview feel broken.
   */
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    setFitMode("none");
    setScale((prev) => {
      const next = clamp(prev * Math.exp(-e.deltaY / 200));
      anchorRef.current = {
        x: (container.scrollLeft + cx) * (next / prev) - cx,
        y: (container.scrollTop + cy) * (next / prev) - cy,
        ratio: next / prev,
      };
      return next;
    });
  }, []);

  // Restore the anchored scroll position after the canvas has resized. In a
  // layout effect so it lands before paint and the page does not visibly jump.
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const container = containerRef.current;
    anchorRef.current = null;
    if (!anchor || !container) return;
    container.scrollLeft = Math.max(0, anchor.x);
    container.scrollTop = Math.max(0, anchor.y);
  }, [scale]);

  /**
   * Cmd +/-/0 while the pointer is over the preview. Scoped to hover rather
   * than bound globally so it does not steal the editor's own zoom — two panes
   * are visible at once and the shortcut has to mean whichever one you are
   * looking at.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || !hovering.current || !pdfDoc) return;
      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        setFitMode("none");
        setScale((s) => stepZoom(s, 1));
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        setFitMode("none");
        setScale((s) => stepZoom(s, -1));
      } else if (e.key === "0") {
        e.preventDefault();
        setFitMode("none");
        setScale(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pdfDoc]);

  // Clicking anywhere else dismisses the zoom menu.
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuOpen]);

  const hasErrors = compileErrors.length > 0;

  return (
    <div className="h-full w-full flex flex-col bg-sunken">
      <div className="flex items-center justify-between pl-3 pr-1.5 h-8 shrink-0 border-b border-edge bg-base">
        <span className="panel-label">Preview</span>
        <div className="flex items-center gap-1">
          {pdfDoc && (
            <>
              <button
                onClick={() => setPageNum((p) => Math.max(1, p - 1))}
                disabled={pageNum <= 1}
                title="Previous page"
                className="grid place-items-center w-6 h-6 rounded text-ink-3 hover:text-ink hover:bg-hover disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              >
                <Icon name="chevron-right" size={14} className="rotate-180" />
              </button>
              <span className="text-tiny text-ink-2 tabular-nums px-1 select-none">
                {pageNum} / {numPages}
              </span>
              <button
                onClick={() => setPageNum((p) => Math.min(numPages, p + 1))}
                disabled={pageNum >= numPages}
                title="Next page"
                className="grid place-items-center w-6 h-6 rounded text-ink-3 hover:text-ink hover:bg-hover disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              >
                <Icon name="chevron-right" size={14} />
              </button>
              <div className="w-px h-4 bg-edge mx-1" />

              <button
                onClick={() => zoomTo(stepZoom(scale, -1))}
                disabled={scale <= MIN_SCALE}
                title="Zoom out (⌘−)"
                className="grid place-items-center w-6 h-6 rounded text-ink-3 hover:text-ink hover:bg-hover disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              >
                <Icon name="minus" size={14} />
              </button>

              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen((o) => !o);
                  }}
                  title="Zoom presets"
                  className="text-tiny text-ink-2 hover:text-ink tabular-nums px-1.5 h-6 rounded hover:bg-hover transition-colors min-w-[3.25rem]"
                >
                  {fitMode === "width" ? "Fit W" : fitMode === "page" ? "Fit" : `${Math.round(scale * 100)}%`}
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-7 z-30 py-1 rounded-md border border-edge-strong bg-raised shadow-xl min-w-[7.5rem]">
                    {[0.5, 0.75, 1, 1.5, 2, 3].map((preset) => (
                      <button
                        key={preset}
                        onClick={() => zoomTo(preset)}
                        className={`block w-full text-left text-tiny px-3 py-1 hover:bg-hover ${
                          fitMode === "none" && Math.abs(scale - preset) < 0.001
                            ? "text-accent"
                            : "text-ink-2"
                        }`}
                      >
                        {preset * 100}%
                      </button>
                    ))}
                    <div className="h-px bg-edge my-1" />
                    <button
                      onClick={() => setFitMode("width")}
                      className={`block w-full text-left text-tiny px-3 py-1 hover:bg-hover ${
                        fitMode === "width" ? "text-accent" : "text-ink-2"
                      }`}
                    >
                      Fit width
                    </button>
                    <button
                      onClick={() => setFitMode("page")}
                      className={`block w-full text-left text-tiny px-3 py-1 hover:bg-hover ${
                        fitMode === "page" ? "text-accent" : "text-ink-2"
                      }`}
                    >
                      Fit page
                    </button>
                  </div>
                )}
              </div>

              <button
                onClick={() => zoomTo(stepZoom(scale, 1))}
                disabled={scale >= MAX_SCALE}
                title="Zoom in (⌘+)"
                className="grid place-items-center w-6 h-6 rounded text-ink-3 hover:text-ink hover:bg-hover disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              >
                <Icon name="plus" size={14} />
              </button>
            </>
          )}
        </div>
      </div>
      <div
        ref={containerRef}
        onWheel={handleWheel}
        onMouseEnter={() => (hovering.current = true)}
        onMouseLeave={() => (hovering.current = false)}
        className="flex-1 overflow-auto flex justify-center p-6 relative"
      >
        {loading && (
          <div className="flex items-center justify-center h-full text-ink-3 text-tiny">
            Loading PDF…
          </div>
        )}
        {isCompiling && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-ink-3 text-tiny">
            <span className="animate-spin w-4 h-4 border-[1.5px] border-current/30 border-t-current rounded-full" />
            Typesetting…
          </div>
        )}
        {error && (
          <div className="flex flex-col items-center justify-center h-full gap-2 px-6 text-center">
            <Icon name="alert-circle" size={20} className="text-danger" />
            <span className="text-tiny text-danger">{error}</span>
          </div>
        )}
        {hasErrors && !pdfDoc && !loading && !isCompiling && (
          <div className="flex flex-col items-center justify-center h-full gap-2 px-6 text-center">
            <Icon name="alert-triangle" size={20} className="text-warning" />
            <span className="text-tiny text-ink-2">Typesetting failed</span>
            <span className="text-micro text-ink-3">{compileMessage}</span>
          </div>
        )}
        {!hasErrors && !pdfDoc && !loading && !isCompiling && !error && (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
            <Icon name="file-pdf" size={24} className="text-ink-3 opacity-60" />
            <span className="text-tiny text-ink-3">
              Typeset your document to see it here
            </span>
          </div>
        )}
        {pdfDoc && (
          <>
          {syncNote && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 px-2.5 py-1 rounded-md bg-raised border border-edge text-tiny text-ink-2 shadow-lg">
              {syncNote}
            </div>
          )}
          <canvas
            ref={canvasRef}
            onClick={handlePageClick}
            title="Click to jump to the source line"
            className="self-start rounded-sm cursor-text"
            style={{ backgroundColor: "white", boxShadow: "var(--pdf-page-shadow)" }}
          />
          </>
        )}
      </div>
    </div>
  );
}
