import type {
  InfiniteBoard,
  InfiniteBoardBackgroundStyle,
  NoteDoc,
  NoteKind,
  NoteMetadata,
  NoteTextItem,
  PageSizePreset,
  PageTemplate,
} from "./noteDocument";
import {
  EMPTY_PAGE_BACKGROUND,
  INFINITE_CANVAS_H,
  INFINITE_CANVAS_W,
  type PageBackground,
  type Point,
  type Stroke,
} from "./editorTypes";
import { buildSegmentBBoxes } from "./editorGeometry";

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

function sanitizeSegmentBBoxes(
  raw: unknown,
): { minX: number; minY: number; maxX: number; maxY: number }[] | null {
  if (!Array.isArray(raw)) return null;

  const safe = raw
    .map((bbox: any) => ({
      minX: Number(bbox?.minX),
      minY: Number(bbox?.minY),
      maxX: Number(bbox?.maxX),
      maxY: Number(bbox?.maxY),
    }))
    .filter(
      (bbox) =>
        Number.isFinite(bbox.minX) &&
        Number.isFinite(bbox.minY) &&
        Number.isFinite(bbox.maxX) &&
        Number.isFinite(bbox.maxY),
    );

  return safe.length > 0 ? safe : null;
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function sanitizeBoardBackgroundStyle(
  value: unknown,
): InfiniteBoardBackgroundStyle {
  return value === "dots" || value === "blank" ? value : "grid";
}

function sanitizePageTemplate(value: unknown): PageTemplate {
  return value === "ruled" ||
    value === "grid" ||
    value === "dots" ||
    value === "graph-fine" ||
    value === "graph-coarse" ||
    value === "polar" ||
    value === "isometric"
    ? value
    : "blank";
}

function sanitizePageSizePreset(value: unknown): PageSizePreset {
  return value === "a4" || value === "square" ? value : "letter";
}

function sanitizeMetadata(raw: any): NoteMetadata {
  const tags = Array.isArray(raw?.tags)
    ? raw.tags
        .map((tag: unknown) =>
          typeof tag === "string" ? tag.trim() : String(tag ?? "").trim(),
        )
        .filter(Boolean)
        .slice(0, 12)
    : [];
  const bookmarkedPages = Array.isArray(raw?.bookmarkedPages)
    ? raw.bookmarkedPages
        .map((value: unknown) => Number(value))
        .filter((value: number) => Number.isFinite(value) && value >= 0)
        .map((value: number) => Math.trunc(value))
    : [];

  return {
    description:
      typeof raw?.description === "string" ? raw.description.slice(0, 500) : "",
    tags,
    bookmarkedPages: Array.from(new Set<number>(bookmarkedPages)),
    pageTemplate: sanitizePageTemplate(raw?.pageTemplate),
    pageSizePreset: sanitizePageSizePreset(raw?.pageSizePreset),
  };
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
    segmentBBoxes:
      sanitizeSegmentBBoxes(raw.segmentBBoxes) ?? buildSegmentBBoxes(safePoints),
    d,
    w: Number.isFinite(raw.w) ? raw.w : 4,
    c: typeof raw.c === "string" ? raw.c : "#111111",
    a:
      Number.isFinite(raw.a) && raw.a >= 0 && raw.a <= 1
        ? Number(raw.a)
        : 1,
    dashed: raw.dashed === true,
    shapePreset:
      raw.shapePreset === "axis-2d" || raw.shapePreset === "axis-3d"
        ? raw.shapePreset
        : undefined,
    groupId: typeof raw.groupId === "string" && raw.groupId ? raw.groupId : undefined,
    axisRole:
      raw.axisRole === "x" || raw.axisRole === "y" || raw.axisRole === "z"
        ? raw.axisRole
        : undefined,
    axisOrigin:
      Number.isFinite(raw?.axisOrigin?.x) && Number.isFinite(raw?.axisOrigin?.y)
        ? { x: Number(raw.axisOrigin.x), y: Number(raw.axisOrigin.y) }
        : undefined,
    axisHandle:
      Number.isFinite(raw?.axisHandle?.x) && Number.isFinite(raw?.axisHandle?.y)
        ? { x: Number(raw.axisHandle.x), y: Number(raw.axisHandle.y) }
        : undefined,
    dx: Number.isFinite(raw.dx) ? raw.dx : 0,
    dy: Number.isFinite(raw.dy) ? raw.dy : 0,
    bbox,
  };
}

export function normalizeDocToPages(rawDoc: any): {
  kind: NoteKind;
  board: InfiniteBoard | null;
  pages: Stroke[][];
  pageTextItems: NoteTextItem[][];
  pageBackgrounds: PageBackground[];
  currentPageIndex: number;
  metadata: NoteMetadata;
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
  let pageTextItems: NoteTextItem[][] = [];
  let pageBackgrounds: PageBackground[] = [];

  if (rawPages && rawPages.length > 0) {
    pages = rawPages.map(
      (pg: any) =>
        (Array.isArray(pg?.strokes) ? pg.strokes : [])
          .map(sanitizeStroke)
          .filter(Boolean) as Stroke[],
    );
    pageTextItems = rawPages.map((pg: any) =>
      (Array.isArray(pg?.textItems) ? pg.textItems : [])
        .map((item: any) => ({
          id:
            typeof item?.id === "string" && item.id
              ? item.id
              : uid(),
          text: typeof item?.text === "string" ? item.text : "",
          x: Number.isFinite(item?.x) ? Number(item.x) : 24,
          y: Number.isFinite(item?.y) ? Number(item.y) : 24,
          color: typeof item?.color === "string" ? item.color : "#1E2329",
          fontSize: Number.isFinite(item?.fontSize)
            ? Number(item.fontSize)
            : 18,
        }))
        .filter((item: NoteTextItem) => item.text.trim().length > 0),
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
    pageTextItems = [[]];
    pageBackgrounds = [{ ...EMPTY_PAGE_BACKGROUND }];
  }

  if (pages.length === 0) {
    pages = [[]];
    pageTextItems = [[]];
    pageBackgrounds = [{ ...EMPTY_PAGE_BACKGROUND }];
  }

  if (pageTextItems.length !== pages.length) {
    pageTextItems = pages.map((_, i) => pageTextItems[i] ?? []);
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
  const metadata = sanitizeMetadata(rawDoc?.metadata);

  return {
    kind,
    board,
    pages,
    pageTextItems,
    pageBackgrounds,
    currentPageIndex,
    metadata,
  };
}

export function buildDocFromPages(
  pages: Stroke[][],
  pageTextItems: NoteTextItem[][],
  pageBackgrounds: PageBackground[],
  currentPageIndex: number,
  kind: NoteKind = "page",
  board: InfiniteBoard | null = null,
  metadata?: NoteMetadata,
): NoteDoc {
  const safePages = pages.length > 0 ? pages : [[]];
  const safeTextItems = safePages.map((_, i) => pageTextItems[i] ?? []);
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
    metadata: metadata ?? {
      description: "",
      tags: [],
      bookmarkedPages: [],
      pageTemplate: "blank",
      pageSizePreset: "letter",
    },
    strokes: safePages[clampedIndex] ?? [],
    pages: safePages.map((p, i) => ({
      id: `page-${i + 1}`,
      strokes: p,
      textItems: safeTextItems[i],
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
