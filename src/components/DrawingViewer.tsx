import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
// The browser worker, resolved by the bundler. The reader's server-side worker
// in extract.server.ts is configured separately and never shared with this.
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { signedDrawingUrl } from "@/lib/scopeguard/viewer.functions";
import {
  MAX_ZOOM,
  SEVERITY_COLOUR,
  clamp,
  containsPoint,
  fitPage,
  fitWidth,
  framingFor,
  isLocatable,
  itemRect,
  toPage,
  zoomAbout,
  type Rect,
} from "@/lib/scopeguard/viewer-transform";

export type ViewerItem = {
  id: string;
  severity: string | null;
  bbox: unknown;
  bbox_frame: string | null;
  font_size: number | null;
};

type View = { scale: number; offset: { x: number; y: number } };

export function DrawingViewer({
  drawingId,
  pageWidth,
  pageHeight,
  items,
  selectedId,
  hoveredId,
  showAll,
  onToggleShowAll,
  onSelect,
}: {
  drawingId: string;
  pageWidth: number | null;
  pageHeight: number | null;
  items: ViewerItem[];
  selectedId: string | null;
  hoveredId: string | null;
  showAll: boolean;
  onToggleShowAll: (next: boolean) => void;
  onSelect: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pdfRef = useRef<{ page: unknown; width: number; height: number } | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(1);
  const [page, setPage] = useState<{ width: number; height: number }>({
    width: pageWidth ?? 841,
    height: pageHeight ?? 594,
  });
  const [view, setView] = useState<View>({ scale: 1, offset: { x: 0, y: 0 } });
  const [pulse, setPulse] = useState(false);

  const getUrl = useServerFn(signedDrawingUrl);

  // Rectangles in page space, keyed by item, so the overlay never guesses.
  const rects = useMemo(() => {
    const map = new Map<string, Rect>();
    for (const i of items) {
      if (!isLocatable(i.bbox, i.bbox_frame)) continue;
      map.set(i.id, itemRect(i.bbox, i.font_size, page.width, page.height));
    }
    return map;
  }, [items, page.width, page.height]);

  /* ------------------------------------------------------------------ */
  /* Load the document                                                   */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatus("loading");
      try {
        // The browser build of pdf.js, with its own worker. The reader's
        // server-side worker is configured separately and never shared.
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

        const { url } = await getUrl({ data: { drawingId } });
        const doc = await pdfjs.getDocument({ url }).promise;
        if (cancelled) return;
        setPageCount(doc.numPages);
        const p = await doc.getPage(1);
        const vp = p.getViewport({ scale: 1 });
        if (cancelled) return;
        pdfRef.current = { page: p, width: vp.width, height: vp.height };
        setPage({ width: vp.width, height: vp.height });
        const el = containerRef.current;
        const box = { width: el?.clientWidth ?? 800, height: el?.clientHeight ?? 600 };
        setView(fitPage(box, { width: vp.width, height: vp.height }));
        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setMessage(e instanceof Error ? e.message : "The drawing could not be opened.");
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [drawingId, getUrl]);

  /* ------------------------------------------------------------------ */
  /* Render — on scale change only, never on pan                         */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    const pdf = pdfRef.current;
    const canvas = canvasRef.current;
    if (!pdf || !canvas || status !== "ready") return;
    const handle = window.setTimeout(async () => {
      const p = pdf.page as {
        getViewport: (o: { scale: number }) => { width: number; height: number };
        render: (o: unknown) => { promise: Promise<void>; cancel: () => void };
      };
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const vp = p.getViewport({ scale: view.scale * dpr });
      canvas.width = Math.max(1, Math.floor(vp.width));
      canvas.height = Math.max(1, Math.floor(vp.height));
      canvas.style.width = `${pdf.width * view.scale}px`;
      canvas.style.height = `${pdf.height * view.scale}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      renderTaskRef.current?.cancel();
      const task = p.render({ canvasContext: ctx, viewport: vp, canvas });
      renderTaskRef.current = task;
      try {
        await task.promise;
      } catch {
        /* superseded by a later render */
      }
    }, 60);
    return () => window.clearTimeout(handle);
  }, [view.scale, status]);

  /* ------------------------------------------------------------------ */
  /* Zoom, pan, keyboard                                                 */
  /* ------------------------------------------------------------------ */
  const viewRef = useRef(view);
  viewRef.current = view;

  const setZoom = useCallback((next: number, about?: { x: number; y: number }) => {
    const el = containerRef.current;
    const box = { width: el?.clientWidth ?? 800, height: el?.clientHeight ?? 600 };
    const anchor = about ?? { x: box.width / 2, y: box.height / 2 };
    setView((v) => zoomAbout(anchor, v, clamp(next, 0.05, MAX_ZOOM)));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      const rect = el.getBoundingClientRect();
      const v = viewRef.current;
      setZoom(v.scale * Math.exp(-dy * 0.0015), {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setZoom]);

  const drag = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      ox: view.offset.x,
      oy: view.offset.y,
      moved: false,
    };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) d.moved = true;
    setView((v) => ({ ...v, offset: { x: d.ox + dx, y: d.oy + dy } }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    // A click that did not drag: if it landed on a finding, select it.
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const p = toPage(
      { x: e.clientX - rect.left, y: e.clientY - rect.top },
      view.scale,
      view.offset,
    );
    for (const [id, r] of rects) {
      if (containsPoint(r, p)) {
        onSelect(id);
        return;
      }
    }
  };

  const doFit = (mode: "page" | "width") => {
    const el = containerRef.current;
    const box = { width: el?.clientWidth ?? 800, height: el?.clientHeight ?? 600 };
    setView(mode === "page" ? fitPage(box, page) : fitWidth(box, page));
  };

  /* Frame the selected finding. */
  useEffect(() => {
    if (!selectedId || status !== "ready") return;
    const r = rects.get(selectedId);
    if (!r) return;
    const el = containerRef.current;
    const box = { width: el?.clientWidth ?? 800, height: el?.clientHeight ?? 600 };
    setView(framingFor(r, box, page));
    setPulse(true);
    const t = window.setTimeout(() => setPulse(false), 900);
    return () => window.clearTimeout(t);
  }, [selectedId, rects, page, status]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "+" || e.key === "=") setZoom(view.scale * 1.25);
    else if (e.key === "-" || e.key === "_") setZoom(view.scale / 1.25);
    else if (e.key === "0") doFit("page");
  };

  const overlay: Array<{ id: string; rect: Rect; severity: string; kind: "selected" | "hover" | "all" }> =
    [];
  for (const i of items) {
    const r = rects.get(i.id);
    if (!r) continue;
    const severity = i.severity ?? "low";
    if (i.id === selectedId) overlay.push({ id: i.id, rect: r, severity, kind: "selected" });
    else if (i.id === hoveredId) overlay.push({ id: i.id, rect: r, severity, kind: "hover" });
    else if (showAll) overlay.push({ id: i.id, rect: r, severity, kind: "all" });
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button onClick={() => setZoom(view.scale * 1.25)} className="rounded-md border border-border px-2 py-1">
          Zoom in
        </button>
        <button onClick={() => setZoom(view.scale / 1.25)} className="rounded-md border border-border px-2 py-1">
          Zoom out
        </button>
        <button onClick={() => doFit("page")} className="rounded-md border border-border px-2 py-1">
          Fit page
        </button>
        <button onClick={() => doFit("width")} className="rounded-md border border-border px-2 py-1">
          Fit width
        </button>
        <label className="ml-auto flex items-center gap-2 text-muted-foreground">
          <input type="checkbox" checked={showAll} onChange={(e) => onToggleShowAll(e.target.checked)} />
          Mark every finding
        </label>
      </div>

      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="relative h-[70vh] min-h-[360px] w-full cursor-grab overflow-hidden rounded-lg border border-border bg-muted/30 outline-none"
      >
        {status === "loading" ? (
          <p className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
            Opening the sheet…
          </p>
        ) : null}
        {status === "error" ? (
          <p className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-destructive">
            {message}
          </p>
        ) : null}

        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{ transform: `translate(${view.offset.x}px, ${view.offset.y}px)` }}
        >
          <canvas ref={canvasRef} className="block bg-white shadow-sm" />
          <div
            className="absolute left-0 top-0"
            style={{ width: page.width * view.scale, height: page.height * view.scale }}
          >
            {overlay.map((o) => {
              const c = SEVERITY_COLOUR[o.severity] ?? SEVERITY_COLOUR['low']!;
              const selected = o.kind === "selected";
              return (
                <div
                  key={`${o.kind}-${o.id}`}
                  className={selected && pulse ? "animate-pulse" : undefined}
                  style={{
                    position: "absolute",
                    left: o.rect.x * view.scale,
                    top: o.rect.y * view.scale,
                    width: o.rect.w * view.scale,
                    height: o.rect.h * view.scale,
                    background: o.kind === "hover" ? "transparent" : c.fill,
                    border: `${selected ? 2 : 1}px solid ${c.stroke}`,
                    borderRadius: 2,
                    pointerEvents: "none",
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>

      {pageCount > 1 ? (
        <p className="text-xs text-muted-foreground">
          Showing page 1 of {pageCount}. Only the first page of a sheet is read.
        </p>
      ) : null}
    </div>
  );
}
