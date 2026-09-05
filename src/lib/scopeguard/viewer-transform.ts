// Pure geometry for the drawing viewer.
//
// The reader records each item's position in pdf.js viewport space at scale 1,
// with rotation already applied and y growing downwards (bbox_frame
// "rotated"). The viewer renders with page.getViewport({ scale }) — the same
// frame, only scaled — so the conversion is a multiply, never a re-rotation.
// Anything recorded in another frame is treated as unlocatable rather than
// guessed at.

export type Bbox = { x: number; y: number; w: number; h: number };
export type Rect = { x: number; y: number; w: number; h: number };

export const VIEWER_FRAME = "rotated";

export function isLocatable(bbox: unknown, frame: string | null | undefined): bbox is Bbox {
  if (!bbox || typeof bbox !== "object") return false;
  const b = bbox as Bbox;
  if (![b.x, b.y, b.w, b.h].every((v) => typeof v === "number" && Number.isFinite(v))) return false;
  if (b.w <= 0) return false;
  return frame === VIEWER_FRAME;
}

/**
 * Item boxes are anchored on the first line's baseline, and merged items carry
 * a height running from that baseline to the last line. Turn that into a
 * rectangle covering the whole annotation, clamped inside the page.
 */
export function itemRect(
  bbox: Bbox,
  fontSize: number | null | undefined,
  pageWidth: number,
  pageHeight: number,
): Rect {
  const fs = fontSize && fontSize > 0 ? fontSize : bbox.h > 0 ? Math.min(bbox.h, 12) : 8;
  const top = bbox.y - fs;
  const bottom = bbox.y + Math.max(0, bbox.h - fs) + fs * 0.25;
  const pad = 1.5;
  const x0 = Math.max(0, bbox.x - pad);
  const y0 = Math.max(0, top - pad);
  const x1 = Math.min(pageWidth, bbox.x + bbox.w + pad);
  const y1 = Math.min(pageHeight, bottom + pad);
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}

/** Page point → on-screen point, given the render scale and pan offset. */
export function toScreen(rect: Rect, scale: number, offset: { x: number; y: number }): Rect {
  return {
    x: rect.x * scale + offset.x,
    y: rect.y * scale + offset.y,
    w: rect.w * scale,
    h: rect.h * scale,
  };
}

/** On-screen point → page point. Used for click-to-select on the sheet. */
export function toPage(
  point: { x: number; y: number },
  scale: number,
  offset: { x: number; y: number },
): { x: number; y: number } {
  return { x: (point.x - offset.x) / scale, y: (point.y - offset.y) / scale };
}

export function containsPoint(rect: Rect, p: { x: number; y: number }): boolean {
  return p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export const MAX_ZOOM = 8;

/**
 * Scale and offset that frame a rectangle at roughly a quarter of the viewport
 * width, clamped between fit-page and 4x, centred in the viewport.
 */
export function framingFor(
  rect: Rect,
  viewport: { width: number; height: number },
  page: { width: number; height: number },
): { scale: number; offset: { x: number; y: number } } {
  const fitScale = Math.min(viewport.width / page.width, viewport.height / page.height);
  const target = rect.w > 0 ? (viewport.width * 0.25) / rect.w : fitScale;
  const scale = clamp(target, fitScale, 4);
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  return {
    scale,
    offset: { x: viewport.width / 2 - cx * scale, y: viewport.height / 2 - cy * scale },
  };
}

export function fitPage(
  viewport: { width: number; height: number },
  page: { width: number; height: number },
): { scale: number; offset: { x: number; y: number } } {
  const scale = Math.min(viewport.width / page.width, viewport.height / page.height);
  return {
    scale,
    offset: {
      x: (viewport.width - page.width * scale) / 2,
      y: (viewport.height - page.height * scale) / 2,
    },
  };
}

export function fitWidth(
  viewport: { width: number; height: number },
  page: { width: number; height: number },
): { scale: number; offset: { x: number; y: number } } {
  const scale = viewport.width / page.width;
  return { scale, offset: { x: 0, y: 0 } };
}

/** Zoom about a point, keeping whatever sits under it stationary. */
export function zoomAbout(
  point: { x: number; y: number },
  current: { scale: number; offset: { x: number; y: number } },
  nextScale: number,
): { scale: number; offset: { x: number; y: number } } {
  const k = nextScale / current.scale;
  return {
    scale: nextScale,
    offset: {
      x: point.x - (point.x - current.offset.x) * k,
      y: point.y - (point.y - current.offset.y) * k,
    },
  };
}

export const SEVERITY_COLOUR: Record<string, { fill: string; stroke: string }> = {
  high: { fill: "rgba(220, 38, 38, 0.22)", stroke: "rgb(220, 38, 38)" },
  medium: { fill: "rgba(217, 119, 6, 0.22)", stroke: "rgb(217, 119, 6)" },
  low: { fill: "rgba(37, 99, 235, 0.20)", stroke: "rgb(37, 99, 235)" },
};
