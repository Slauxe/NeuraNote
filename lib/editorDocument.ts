import type {
  InfiniteBoard,
  InfiniteBoardBackgroundStyle,
  NoteDoc,
  NoteKind,
} from "./noteDocument";
import {
  EMPTY_PAGE_BACKGROUND,
  INFINITE_CANVAS_H,
  INFINITE_CANVAS_W,
  type PageBackground,
  type Point,
  type Stroke,
} from "./editorTypes";

function pointsToSmoothPath(points: Point[]) {
  if (points.length === 0) return "";
  if (points.length === 1) {
    const p = points[0];
    return `M ${p.x} ${p.y} L ${p.x + 0.01} ${p.y + 0.01}`;
  }
  if (points.length === 2) {
    const [p0, p1] = points;
    return `M ${p0.x} ${p0.y} L ${p1.x} ${p1.y}`;
  }

  let d = "";
  const p0 = points[0];
  d += `M ${p0.x} ${p0.y} `;

  for (let i = 1; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const m = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    d += `Q ${p1.x} ${p1.y} ${m.x} ${m.y} `;
  }

  const secondLast = points[points.length - 2];
  const last = points[points.length - 1];
  d += `Q ${secondLast.x} ${secondLast.y} ${last.x} ${last.y}`;

  return d;
}

function computeBBox(points: Point[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  if (!isFinite(minX)) minX = minY = maxX = maxY = 0;
  return { minX, minY, maxX, maxY };
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function sanitizeBoardBackgroundStyle(
  value: unknown,
): InfiniteBoardBackgroundStyle {
  return value === "dots" || value === "blank" ? value : "grid";
}

export function sanitizeStroke(raw: any): Stroke | null {
  if (!raw) return null;
  const points = Array.isArray(raw.points) ? raw.points : [];
  if (points.length < 1) return null;

  const safePoints: Point[] = points
    .map((p: any) => ({ x: Number(p?.x), y: Number(p?.y) }))
    .filter((p: Point) => Number.isFinite(p.x) && Number.isFinite(p.y));

  if (safePoints.length < 1) return null;

  const d =
    typeof raw.d === "string" && raw.d.trim().length > 0
      ? raw.d
      : pointsToSmoothPath(safePoints);

  const bbox =
    raw.bbox &&
    Number.isFinite(raw.bbox.minX) &&
    Number.isFinite(raw.bbox.minY) &&
    Number.isFinite(raw.bbox.maxX) &&
    Number.isFinite(raw.bbox.maxY)
      ? raw.bbox
      : computeBBox(safePoints);

  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : uid(),
    points: safePoints,
    d,
    w: Number.isFinite(raw.w) ? raw.w : 4,
    c: typeof raw.c === "string" ? raw.c : "#111111",
    dx: Number.isFinite(raw.dx) ? raw.dx : 0,
    dy: Number.isFinite(raw.dy) ? raw.dy : 0,
    bbox,
  };
}

export function normalizeDocToPages(rawDoc: any): {
  kind: NoteKind;
  board: InfiniteBoard | null;
  pages: Stroke[][];
  pageBackgrounds: PageBackground[];
  currentPageIndex: number;
} {
  const kind: NoteKind = rawDoc?.kind === "infinite" ? "infinite" : "page";
  const board: InfiniteBoard | null =
    kind === "infinite" &&
    Number.isFinite(rawDoc?.board?.width) &&
    Number.isFinite(rawDoc?.board?.height)
      ? {
          width: Math.max(INFINITE_CANVAS_W, Math.trunc(rawDoc.board.width)),
          height: Math.max(INFINITE_CANVAS_H, Math.trunc(rawDoc.board.height)),
          backgroundStyle: sanitizeBoardBackgroundStyle(
            rawDoc?.board?.backgroundStyle,
          ),
        }
      : kind === "infinite"
        ? {
            width: INFINITE_CANVAS_W,
            height: INFINITE_CANVAS_H,
            backgroundStyle: "grid",
          }
        : null;
  const rawPages = Array.isArray(rawDoc?.pages) ? rawDoc.pages : null;

  let pages: Stroke[][] = [];
  let pageBackgrounds: PageBackground[] = [];

  if (rawPages && rawPages.length > 0) {
    pages = rawPages.map(
      (pg: any) =>
        (Array.isArray(pg?.strokes) ? pg.strokes : [])
          .map(sanitizeStroke)
          .filter(Boolean) as Stroke[],
    );
    pageBackgrounds = rawPages.map((pg: any) => ({
      dataUrl:
        typeof pg?.backgroundDataUrl === "string" ? pg.backgroundDataUrl : null,
      assetId:
        typeof pg?.backgroundAssetId === "string" ? pg.backgroundAssetId : null,
      pdfUri:
        typeof pg?.backgroundPdfUri === "string" ? pg.backgroundPdfUri : null,
      pdfPageNumber: Number.isFinite(pg?.backgroundPdfPageNumber)
        ? Math.max(1, Math.trunc(pg.backgroundPdfPageNumber))
        : null,
    }));
  } else {
    const rawStrokes =
      (rawDoc && Array.isArray(rawDoc.strokes) && rawDoc.strokes) || [];
    pages = [rawStrokes.map(sanitizeStroke).filter(Boolean) as Stroke[]];
    pageBackgrounds = [{ ...EMPTY_PAGE_BACKGROUND }];
  }

  if (pages.length === 0) {
    pages = [[]];
    pageBackgrounds = [{ ...EMPTY_PAGE_BACKGROUND }];
  }

  if (pageBackgrounds.length !== pages.length) {
    pageBackgrounds = pages.map(
      (_, i) => pageBackgrounds[i] ?? { ...EMPTY_PAGE_BACKGROUND },
    );
  }

  const rawIndex = Number(rawDoc?.currentPageIndex);
  const currentPageIndex = Number.isFinite(rawIndex)
    ? Math.max(0, Math.min(pages.length - 1, Math.trunc(rawIndex)))
    : 0;

  return { kind, board, pages, pageBackgrounds, currentPageIndex };
}

export function buildDocFromPages(
  pages: Stroke[][],
  pageBackgrounds: PageBackground[],
  currentPageIndex: number,
  kind: NoteKind = "page",
  board: InfiniteBoard | null = null,
): NoteDoc {
  const safePages = pages.length > 0 ? pages : [[]];
  const safeBackgrounds = safePages.map(
    (_, i) => pageBackgrounds[i] ?? { ...EMPTY_PAGE_BACKGROUND },
  );
  const clampedIndex = Math.max(
    0,
    Math.min(safePages.length - 1, currentPageIndex),
  );

  return {
    version: 1,
    kind,
    ...(kind === "infinite" && board ? { board } : {}),
    strokes: safePages[clampedIndex] ?? [],
    pages: safePages.map((p, i) => ({
      id: `page-${i + 1}`,
      strokes: p,
      ...(safeBackgrounds[i].dataUrl
        ? { backgroundDataUrl: safeBackgrounds[i].dataUrl as string }
        : {}),
      ...(safeBackgrounds[i].assetId
        ? { backgroundAssetId: safeBackgrounds[i].assetId as string }
        : {}),
      ...(safeBackgrounds[i].pdfUri
        ? { backgroundPdfUri: safeBackgrounds[i].pdfUri as string }
        : {}),
      ...(safeBackgrounds[i].pdfPageNumber
        ? {
            backgroundPdfPageNumber: safeBackgrounds[i].pdfPageNumber as number,
          }
        : {}),
    })),
    currentPageIndex: clampedIndex,
  };
}
