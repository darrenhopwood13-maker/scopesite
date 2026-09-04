// Server-only PDF reading. Never imported by browser code.
import {
  isAnnotationOnly,
  mergeHorizontal,
  mergeVertical,
  parseTitleblock,
  triage,
  type MergedItem,
  type Region,
  type Span,
  type Titleblock,
  type TriageClass,
} from "./pipeline";

export type ExtractResult = {
  spans: Span[];
  items: Array<{ item: MergedItem; region: Region }>;
  titleblock: Titleblock;
  triage_class: TriageClass;
  text_span_count: number;
  body_text_count: number;
  path_count: number;
  layers_present: string[];
  page_width: number;
  page_height: number;
  page_rotation: number;
  coordinate_frame_ok: boolean;
  notes_strip_source: "titleblock_border" | "fixed_28_percent";
  notes_strip_x: number;
};

function hex(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
}

export async function extractDrawing(data: Uint8Array): Promise<ExtractResult> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { getDocument, OPS, Util } = pdfjs as unknown as {
    getDocument: (args: Record<string, unknown>) => { promise: Promise<any> };
    OPS: Record<string, number>;
    Util: { transform: (a: number[], b: number[]) => number[]; applyTransform: (p: number[], m: number[]) => number[] };
  };

  const doc = await getDocument({
    data,
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
    useWorkerFetch: false,
  }).promise;

  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const pageWidth = viewport.width;
  const pageHeight = viewport.height;
  const rotation = page.rotate ?? 0;

  const ops = await page.getOperatorList();

  // Colour by text position: walk the operator list, tracking fill colour and
  // the text matrix, and record the colour at each show-text position.
  const colourAt = new Map<string, string>();
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack: number[][] = [];
  let tm = [1, 0, 0, 1, 0, 0];
  let fill = "000000";
  let pathCount = 0;
  const vLines: number[] = [];

  const key = (x: number, y: number) => `${x.toFixed(1)}:${y.toFixed(1)}`;

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i] as number;
    const args = ops.argsArray[i] as any;
    if (fn === OPS['save']) stack.push(ctm.slice());
    else if (fn === OPS['restore']) ctm = stack.pop() ?? ctm;
    else if (fn === OPS['transform']) ctm = Util.transform(ctm, args as number[]);
    else if (fn === OPS['setTextMatrix']) tm = (args as number[]).slice();
    else if (fn === OPS['setFillRGBColor']) fill = hex(args[0]) + hex(args[1]) + hex(args[2]);
    else if (fn === OPS['setFillGray']) {
      const v = hex(Number(args[0]) * 255);
      fill = v + v + v;
    } else if (fn === OPS['constructPath']) {
      pathCount++;
      collectVerticalLines(args, ctm, viewport.transform, Util, vLines, pageHeight);
    } else if (fn === OPS['showText'] || fn === OPS['showSpacedText']) {
      const p = Util.applyTransform([tm[4]!, tm[5]!], ctm);
      colourAt.set(key(p[0]!, p[1]!), fill);
    }
  }

  const textContent = await page.getTextContent();
  const rawItems: any[] = textContent.items.filter((it: any) => typeof it.str === "string");

  const spans: Span[] = [];
  let coordinateFrameOk = true;
  for (const it of rawItems) {
    const str = String(it.str).replace(/\s+/g, " ").trim();
    if (!str) continue;
    const t: number[] = it.transform;
    const colour = colourAt.get(key(t[4]!, t[5]!)) ?? "000000";
    const p = Util.applyTransform([t[4]!, t[5]!], viewport.transform);
    const fontSize = Math.hypot(t[2]!, t[3]!) || it.height || 8;
    const x = p[0]!;
    const y = p[1]!;
    if (x < -2 || y < -2 || x > pageWidth + 2 || y > pageHeight + 2) coordinateFrameOk = false;
    spans.push({
      str,
      x,
      y,
      width: it.width ?? str.length * fontSize * 0.5,
      height: fontSize,
      fontSize,
      colour,
    });
  }

  // Notes strip: prefer a titleblock border line, fall back to a fixed 28%.
  const border = vLines
    .filter((x) => x > pageWidth * 0.55 && x < pageWidth * 0.9)
    .sort((a, b) => a - b)[0];
  const notesStripX = border ?? pageWidth * 0.72;
  const notesStripSource: ExtractResult["notes_strip_source"] = border
    ? "titleblock_border"
    : "fixed_28_percent";

  const merged = mergeVertical(mergeHorizontal(spans));

  const items: Array<{ item: MergedItem; region: Region }> = merged.map((item) => {
    let region: Region = item.x >= notesStripX ? "notes" : "body";
    if (region === "notes" && item.y > pageHeight * 0.72) region = "titleblock";
    return { item, region };
  });

  const bodyTextCount = items.filter(
    (i) => i.region === "body" && !isAnnotationOnly(i.item.str),
  ).length;
  const notesTextCount = items.filter(
    (i) => i.region !== "body" && !isAnnotationOnly(i.item.str),
  ).length;

  const triageClass = triage({
    bodyTextCount,
    notesTextCount,
    totalTextCount: merged.length,
    pathCount,
  });

  let layers: string[] = [];
  try {
    const oc = await doc.getOptionalContentConfig();
    layers = (oc?.getGroups?.() ? Object.values(oc.getGroups()) : [])
      .map((g: any) => String(g?.name ?? ""))
      .filter(Boolean);
  } catch {
    layers = [];
  }

  const revisionScanLines = mergeHorizontal(spans).map((s) => ({
    str: s.str,
    x: s.x,
    y: s.y,
    fontSize: s.fontSize,
  }));

  const titleblockLines = items
    .filter((i) => i.region !== "body")
    .map((i) => ({
      str: i.item.str,
      x: i.item.x,
      y: i.item.y,
      fontSize: i.item.fontSize,
    }));

  return {
    spans,
    items,
    titleblock: parseTitleblock(titleblockLines, revisionScanLines),
    triage_class: triageClass,
    text_span_count: spans.length,
    body_text_count: bodyTextCount,
    path_count: pathCount,
    layers_present: layers,
    page_width: pageWidth,
    page_height: pageHeight,
    page_rotation: rotation,
    coordinate_frame_ok: coordinateFrameOk,
    notes_strip_source: notesStripSource,
    notes_strip_x: notesStripX,
  };
}

function collectVerticalLines(
  args: any,
  ctm: number[],
  vpTransform: number[],
  Util: { transform: (a: number[], b: number[]) => number[]; applyTransform: (p: number[], m: number[]) => number[] },
  out: number[],
  pageHeight: number,
): void {
  const opsList: number[] = args?.[0] ?? [];
  const coords: number[] = args?.[1] ?? [];
  if (!coords.length || out.length > 400) return;
  let idx = 0;
  let startX: number | null = null;
  let startY: number | null = null;
  const m = Util.transform(vpTransform, ctm);
  for (const op of opsList) {
    // 1 = moveTo, 2 = lineTo in pdf.js path op encoding; other ops consume
    // coordinates we can safely skip for line detection.
    const take = op === 1 || op === 2 ? 2 : op === 3 ? 4 : op === 4 ? 6 : 0;
    if (take === 2) {
      const p = Util.applyTransform([coords[idx]!, coords[idx + 1]!], m);
      if (op === 1) {
        startX = p[0]!;
        startY = p[1]!;
      } else if (startX !== null && startY !== null) {
        if (Math.abs(p[0]! - startX) < 1 && Math.abs(p[1]! - startY) > pageHeight * 0.5) {
          out.push(p[0]!);
        }
        startX = p[0]!;
        startY = p[1]!;
      }
    }
    idx += take;
  }
}
