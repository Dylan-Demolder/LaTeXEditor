import { useEffect, useRef, useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import type { RenderParameters } from "pdfjs-dist/types/src/display/api";
import { useAppStore } from "../../stores/useAppStore";
import { readPdf } from "../../hooks/useTauriCommands";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs";

export default function PDFPreview() {
  const { pdfPath, compileMessage, isCompiling, compileErrors } = useAppStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPdf = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await readPdf(path);
      const uint8 = new Uint8Array(data);
      const doc = await pdfjsLib.getDocument({ data: uint8 }).promise;
      setPdfDoc(doc);
      setNumPages(doc.numPages);
      setPageNum(1);
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
  }, [pdfPath, loadPdf]);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    const renderPage = async (num: number) => {
      const page = await pdfDoc.getPage(num);
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d")!;

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      const renderTask = page.render({
        canvasContext: ctx,
        viewport: viewport,
      } as RenderParameters);
      await renderTask.promise;
    };

    renderPage(pageNum);
  }, [pdfDoc, pageNum, scale]);

  const hasErrors = compileErrors.length > 0;

  return (
    <div className="h-full w-full flex flex-col bg-gray-900">
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800 border-b border-gray-700 text-gray-300 text-xs">
        <span>PDF Preview</span>
        <div className="flex items-center gap-3">
          {pdfDoc && (
            <>
              <button
                onClick={() => setPageNum((p) => Math.max(1, p - 1))}
                disabled={pageNum <= 1}
                className="px-1.5 py-0.5 text-gray-400 hover:text-white disabled:opacity-30"
              >
                Prev
              </button>
              <span>
                {pageNum} / {numPages}
              </span>
              <button
                onClick={() => setPageNum((p) => Math.min(numPages, p + 1))}
                disabled={pageNum >= numPages}
                className="px-1.5 py-0.5 text-gray-400 hover:text-white disabled:opacity-30"
              >
                Next
              </button>
              <select
                value={scale}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "fit") {
                    if (canvasRef.current && containerRef.current) {
                      const containerWidth = containerRef.current.clientWidth - 32;
                      if (canvasRef.current.width > 0) {
                        const fitScale = Math.round((containerWidth / canvasRef.current.width) * 100) / 100;
                        setScale(fitScale);
                      }
                    }
                  } else {
                    setScale(Number(val));
                  }
                }}
                className="bg-gray-700 text-gray-300 text-xs px-1 py-0.5 rounded"
              >
                <option value={0.75}>75%</option>
                <option value={1.0}>100%</option>
                <option value={1.2}>120%</option>
                <option value={1.5}>150%</option>
                <option value={2.0}>200%</option>
                <option value="fit">Fit Width</option>
              </select>
            </>
          )}
        </div>
      </div>
      <div
        ref={containerRef}
        className="flex-1 overflow-auto flex justify-center bg-gray-850 p-4"
      >
        {loading && (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            Loading PDF...
          </div>
        )}
        {isCompiling && (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm animate-pulse">
            Compiling...
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center h-full text-red-400 text-sm">
            {error}
          </div>
        )}
        {hasErrors && !pdfDoc && !loading && !isCompiling && (
          <div className="flex flex-col items-center justify-center h-full text-yellow-400 text-sm gap-2">
            <span>Compilation failed</span>
            <span className="text-gray-500 text-xs">{compileMessage}</span>
          </div>
        )}
        {!hasErrors && !pdfDoc && !loading && !isCompiling && !error && (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            Compile a document to see the PDF preview
          </div>
        )}
        {pdfDoc && (
          <canvas
            ref={canvasRef}
            className="shadow-lg"
            style={{ backgroundColor: "white" }}
          />
        )}
      </div>
    </div>
  );
}
