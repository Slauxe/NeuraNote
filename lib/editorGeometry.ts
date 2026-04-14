import {
  INFINITE_CANVAS_H,
  INFINITE_CANVAS_W,
  PAGE_H,
  PAGE_W,
  type Point,
  type Stroke,
} from "@/lib/editorTypes";
import type { NoteKind, PageSizePreset } from "@/lib/noteDocument";

export type BBox = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type StrokeSpatialIndex = {
  cellSize: number;
  cells: Map<string, Stroke[]>;
  strokes: Stroke[];
};

const DEFAULT_SPATIAL_INDEX_CELL_SIZE = 256;

export function getPagePresetSize(preset: PageSizePreset) {
  if (preset === "a4") {
    return { width: 827, height: 1169 };
  }
  if (preset === "square") {
    return { width: 1000, height: 1000 };
  }
  return { width: PAGE_W, height: PAGE_H };
}

export function getCanvasSize(noteKind: NoteKind) {
  return noteKind === "infinite"
    ? { width: INFINITE_CANVAS_W, height: INFINITE_CANVAS_H }
    : { width: PAGE_W, height: PAGE_H };
}

export function dist(a: Point, b: Point) {
  "worklet";
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function mid(a: Point, b: Point): Point {
  "worklet";
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function singlePointPath(point: Point) {
  "worklet";
  return `M ${point.x} ${point.y} L ${point.x + 0.01} ${point.y + 0.01}`;
}

export function linePath(from: Point, to: Point) {
  "worklet";
  return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
}

export function pointsToSmoothPath(points: Point[]) {
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
    const m = mid(p1, p2);
    d += `Q ${p1.x} ${p1.y} ${m.x} ${m.y} `;
  }

  const secondLast = points[points.length - 2];
  const last = points[points.length - 1];
  d += `Q ${secondLast.x} ${secondLast.y} ${last.x} ${last.y}`;

  return d;
}

export function computeBBox(points: Point[]) {
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

export function expandBBox(bbox: BBox, padding: number) {
  return {
    minX: bbox.minX - padding,
    minY: bbox.minY - padding,
    maxX: bbox.maxX + padding,
    maxY: bbox.maxY + padding,
  };
}

export function unionBBoxes(a: BBox | null, b: BBox | null) {
  if (!a) return b;
  if (!b) return a;
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

export function bboxArea(bbox: BBox) {
  return Math.max(0, bbox.maxX - bbox.minX) * Math.max(0, bbox.maxY - bbox.minY);
}

export function pointInPoly(pt: Point, poly: Point[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;

    const intersect =
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-9) + xi;

    if (intersect) inside = !inside;
  }
  return inside;
}

export function bboxOverlap(a: BBox, b: BBox) {
  return !(
    a.maxX < b.minX ||
    a.minX > b.maxX ||
    a.maxY < b.minY ||
    a.minY > b.maxY
  );
}

export function buildSegmentBBoxes(points: Point[]) {
  const segmentBBoxes: BBox[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    segmentBBoxes.push({
      minX: Math.min(a.x, b.x),
      minY: Math.min(a.y, b.y),
      maxX: Math.max(a.x, b.x),
      maxY: Math.max(a.y, b.y),
    });
  }
  return segmentBBoxes;
}

export function offsetBBox(bbox: BBox, dx: number, dy: number) {
  return {
    minX: bbox.minX + dx,
    minY: bbox.minY + dy,
    maxX: bbox.maxX + dx,
    maxY: bbox.maxY + dy,
  };
}

function spatialCellKey(col: number, row: number) {
  return `${col}:${row}`;
}

export function buildStrokeSpatialIndex(
  strokes: Stroke[],
  cellSize = DEFAULT_SPATIAL_INDEX_CELL_SIZE,
): StrokeSpatialIndex {
  const cells = new Map<string, Stroke[]>();

  for (const stroke of strokes) {
    const bounds = getStrokeBoundsOnPage(stroke);
    const minCol = Math.floor(bounds.minX / cellSize);
    const maxCol = Math.floor(bounds.maxX / cellSize);
    const minRow = Math.floor(bounds.minY / cellSize);
    const maxRow = Math.floor(bounds.maxY / cellSize);

    for (let col = minCol; col <= maxCol; col++) {
      for (let row = minRow; row <= maxRow; row++) {
        const key = spatialCellKey(col, row);
        const bucket = cells.get(key);
        if (bucket) bucket.push(stroke);
        else cells.set(key, [stroke]);
      }
    }
  }

  return { cellSize, cells, strokes };
}

export function queryStrokeSpatialIndex(
  index: StrokeSpatialIndex,
  bounds: BBox,
) {
  const minCol = Math.floor(bounds.minX / index.cellSize);
  const maxCol = Math.floor(bounds.maxX / index.cellSize);
  const minRow = Math.floor(bounds.minY / index.cellSize);
  const maxRow = Math.floor(bounds.maxY / index.cellSize);
  const seen = new Set<string>();
  const matches: Stroke[] = [];

  for (let col = minCol; col <= maxCol; col++) {
    for (let row = minRow; row <= maxRow; row++) {
      const bucket = index.cells.get(spatialCellKey(col, row));
      if (!bucket) continue;
      for (const stroke of bucket) {
        if (seen.has(stroke.id)) continue;
        seen.add(stroke.id);
        if (bboxOverlap(getStrokeBoundsOnPage(stroke), bounds)) {
          matches.push(stroke);
        }
      }
    }
  }

  return matches;
}

export function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function pointAt(a: Point, b: Point, t: number): Point {
  "worklet";
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function lerpPoint(a: Point, b: Point, t: number): Point {
  "worklet";
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function smoothTowards(prev: Point, next: Point, alpha: number): Point {
  "worklet";
  return {
    x: prev.x + (next.x - prev.x) * alpha,
    y: prev.y + (next.y - prev.y) * alpha,
  };
}

export function segmentCircleTs(
  a: Point,
  b: Point,
  center: Point,
  radius: number,
) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const fx = a.x - center.x;
  const fy = a.y - center.y;

  const A = dx * dx + dy * dy;
  if (A < 1e-9) return [] as number[];

  const B = 2 * (fx * dx + fy * dy);
  const C = fx * fx + fy * fy - radius * radius;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return [] as number[];

  const out: number[] = [];
  const root = Math.sqrt(Math.max(0, disc));
  const t1 = (-B - root) / (2 * A);
  const t2 = (-B + root) / (2 * A);
  if (t1 >= 0 && t1 <= 1) out.push(t1);
  if (t2 >= 0 && t2 <= 1) out.push(t2);
  out.sort((x, y) => x - y);

  if (out.length <= 1) return out;

  const deduped = [out[0]];
  for (let i = 1; i < out.length; i++) {
    if (Math.abs(out[i] - deduped[deduped.length - 1]) > 1e-5) {
      deduped.push(out[i]);
    }
  }
  return deduped;
}

function intersectIntervals(
  a: { t0: number; t1: number } | null,
  b: { t0: number; t1: number } | null,
) {
  if (!a || !b) return null;
  const t0 = Math.max(a.t0, b.t0);
  const t1 = Math.min(a.t1, b.t1);
  return t1 - t0 > 1e-6 ? { t0, t1 } : null;
}

function mergeIntervals(intervals: { t0: number; t1: number }[]) {
  if (intervals.length === 0) return [];
  const sorted = intervals
    .filter((interval) => interval.t1 - interval.t0 > 1e-6)
    .sort((left, right) => left.t0 - right.t0);
  if (sorted.length === 0) return [];

  const merged = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const previous = merged[merged.length - 1];
    if (current.t0 <= previous.t1 + 1e-6) {
      previous.t1 = Math.max(previous.t1, current.t1);
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

function linearRange(
  start: number,
  delta: number,
  min: number,
  max: number,
) {
  if (Math.abs(delta) < 1e-9) {
    return start >= min && start <= max ? { t0: 0, t1: 1 } : null;
  }

  const tA = (min - start) / delta;
  const tB = (max - start) / delta;
  const t0 = Math.max(0, Math.min(tA, tB));
  const t1 = Math.min(1, Math.max(tA, tB));
  return t1 - t0 > 1e-6 ? { t0, t1 } : null;
}

function circleInsideIntervals(
  a: Point,
  b: Point,
  center: Point,
  radius: number,
) {
  const roots = segmentCircleTs(a, b, center, radius);
  const cuts = [0, ...roots, 1];
  const intervals: { t0: number; t1: number }[] = [];

  for (let i = 0; i < cuts.length - 1; i++) {
    const t0 = cuts[i];
    const t1 = cuts[i + 1];
    if (t1 - t0 < 1e-6) continue;
    const midpoint = pointAt(a, b, (t0 + t1) / 2);
    const dx = midpoint.x - center.x;
    const dy = midpoint.y - center.y;
    if (dx * dx + dy * dy <= radius * radius) {
      intervals.push({ t0, t1 });
    }
  }

  return intervals;
}

function capsuleInsideIntervals(
  a: Point,
  b: Point,
  from: Point,
  to: Point,
  radius: number,
) {
  const eraserDx = to.x - from.x;
  const eraserDy = to.y - from.y;
  const eraserLength = Math.hypot(eraserDx, eraserDy);
  if (eraserLength < 1e-6) {
    return circleInsideIntervals(a, b, from, radius);
  }

  const ux = eraserDx / eraserLength;
  const uy = eraserDy / eraserLength;
  const vx = -uy;
  const vy = ux;

  const strokeDx = b.x - a.x;
  const strokeDy = b.y - a.y;
  const relAx = a.x - from.x;
  const relAy = a.y - from.y;

  const projectedStart = relAx * ux + relAy * uy;
  const projectedDelta = strokeDx * ux + strokeDy * uy;
  const perpStart = relAx * vx + relAy * vy;
  const perpDelta = strokeDx * vx + strokeDy * vy;

  const stripInterval = intersectIntervals(
    linearRange(projectedStart, projectedDelta, 0, eraserLength),
    linearRange(perpStart, perpDelta, -radius, radius),
  );

  const intervals = [
    ...circleInsideIntervals(a, b, from, radius),
    ...circleInsideIntervals(a, b, to, radius),
    ...(stripInterval ? [stripInterval] : []),
  ];

  return mergeIntervals(intervals);
}

export function splitStrokeByEraserCircle(
  stroke: Stroke,
  center: Point,
  radius: number,
  minPointsToSave: number,
) {
  const strokeBounds = {
    minX: stroke.bbox.minX + stroke.dx,
    minY: stroke.bbox.minY + stroke.dy,
    maxX: stroke.bbox.maxX + stroke.dx,
    maxY: stroke.bbox.maxY + stroke.dy,
  };
  const eraserBounds = {
    minX: center.x - radius,
    minY: center.y - radius,
    maxX: center.x + radius,
    maxY: center.y + radius,
  };
  if (!bboxOverlap(strokeBounds, eraserBounds)) return null;

  let anyErased = false;
  const runs: Point[][] = [];
  let currentRun: Point[] = [];

  if (stroke.points.length === 0) return null;

  const pagePoints = stroke.points.map((p) => ({
    x: p.x + stroke.dx,
    y: p.y + stroke.dy,
  }));

  for (let i = 0; i < pagePoints.length - 1; i++) {
    const segmentBounds = stroke.segmentBBoxes[i];
    if (
      segmentBounds &&
      !bboxOverlap(offsetBBox(segmentBounds, stroke.dx, stroke.dy), eraserBounds)
    ) {
      const startLocal = stroke.points[i];
      const endLocal = stroke.points[i + 1];
      if (currentRun.length === 0) currentRun.push({ ...startLocal });
      else if (dist(currentRun[currentRun.length - 1], startLocal) > 1e-4) {
        runs.push(currentRun);
        currentRun = [{ ...startLocal }];
      }
      if (dist(currentRun[currentRun.length - 1], endLocal) > 1e-4) {
        currentRun.push({ ...endLocal });
      }
      continue;
    }

    const a = pagePoints[i];
    const b = pagePoints[i + 1];
    const roots = segmentCircleTs(a, b, center, radius);
    const cuts = [0, ...roots, 1];

    const outsideIntervals: { t0: number; t1: number }[] = [];
    for (let j = 0; j < cuts.length - 1; j++) {
      const t0 = cuts[j];
      const t1 = cuts[j + 1];
      if (t1 - t0 < 1e-6) continue;
      const tm = (t0 + t1) / 2;
      const midpoint = pointAt(a, b, tm);
      const dx = midpoint.x - center.x;
      const dy = midpoint.y - center.y;
      const outside = dx * dx + dy * dy > radius * radius;
      if (outside) outsideIntervals.push({ t0, t1 });
      else anyErased = true;
    }

    if (outsideIntervals.length === 0) {
      if (currentRun.length > 0) {
        runs.push(currentRun);
        currentRun = [];
      }
      continue;
    }

    if (currentRun.length > 0 && outsideIntervals[0].t0 > 1e-6) {
      runs.push(currentRun);
      currentRun = [];
    }

    for (let j = 0; j < outsideIntervals.length; j++) {
      const { t0, t1 } = outsideIntervals[j];
      const start = pointAt(a, b, t0);
      const end = pointAt(a, b, t1);
      const startLocal = { x: start.x - stroke.dx, y: start.y - stroke.dy };
      const endLocal = { x: end.x - stroke.dx, y: end.y - stroke.dy };

      if (currentRun.length === 0) currentRun.push(startLocal);
      else if (dist(currentRun[currentRun.length - 1], startLocal) > 1e-4) {
        runs.push(currentRun);
        currentRun = [startLocal];
      }

      if (dist(currentRun[currentRun.length - 1], endLocal) > 1e-4) {
        currentRun.push(endLocal);
      }

      if (t1 < 1 - 1e-6) {
        runs.push(currentRun);
        currentRun = [];
      }
    }
  }

  const lastPagePoint = pagePoints[pagePoints.length - 1];
  const lastDx = lastPagePoint.x - center.x;
  const lastDy = lastPagePoint.y - center.y;
  const lastOutside = lastDx * lastDx + lastDy * lastDy > radius * radius;
  if (lastOutside) {
    const lastLocal = {
      x: lastPagePoint.x - stroke.dx,
      y: lastPagePoint.y - stroke.dy,
    };
    if (currentRun.length === 0) currentRun.push(lastLocal);
    else if (dist(currentRun[currentRun.length - 1], lastLocal) > 1e-4) {
      currentRun.push(lastLocal);
    }
  } else {
    anyErased = true;
    if (currentRun.length > 0) {
      runs.push(currentRun);
      currentRun = [];
    }
  }

  if (currentRun.length > 0) runs.push(currentRun);
  if (!anyErased) return null;

  const next: Stroke[] = [];
  for (const points of runs) {
    if (points.length < minPointsToSave) continue;

    const d = pointsToSmoothPath(points);
    if (!d.trim()) continue;

    next.push({
      ...stroke,
      id: uid(),
      points,
      segmentBBoxes: buildSegmentBBoxes(points),
      d,
      bbox: computeBBox(points),
    });
  }

  return next;
}

export function splitStrokeByEraserSegment(
  stroke: Stroke,
  from: Point,
  to: Point,
  radius: number,
  minPointsToSave: number,
) {
  const strokeBounds = getStrokeBoundsOnPage(stroke);
  const eraserBounds = expandBBox(computeBBox([from, to]), radius);
  if (!bboxOverlap(strokeBounds, eraserBounds)) return null;

  let anyErased = false;
  const runs: Point[][] = [];
  let currentRun: Point[] = [];

  if (stroke.points.length === 0) return null;

  const pagePoints = stroke.points.map((p) => ({
    x: p.x + stroke.dx,
    y: p.y + stroke.dy,
  }));

  for (let i = 0; i < pagePoints.length - 1; i++) {
    const segmentBounds = stroke.segmentBBoxes[i];
    if (
      segmentBounds &&
      !bboxOverlap(offsetBBox(segmentBounds, stroke.dx, stroke.dy), eraserBounds)
    ) {
      const startLocal = stroke.points[i];
      const endLocal = stroke.points[i + 1];
      if (currentRun.length === 0) currentRun.push({ ...startLocal });
      else if (dist(currentRun[currentRun.length - 1], startLocal) > 1e-4) {
        runs.push(currentRun);
        currentRun = [{ ...startLocal }];
      }
      if (dist(currentRun[currentRun.length - 1], endLocal) > 1e-4) {
        currentRun.push({ ...endLocal });
      }
      continue;
    }

    const a = pagePoints[i];
    const b = pagePoints[i + 1];
    const insideIntervals = capsuleInsideIntervals(a, b, from, to, radius);

    if (insideIntervals.length === 0) {
      const startLocal = { x: a.x - stroke.dx, y: a.y - stroke.dy };
      const endLocal = { x: b.x - stroke.dx, y: b.y - stroke.dy };
      if (currentRun.length === 0) currentRun.push(startLocal);
      else if (dist(currentRun[currentRun.length - 1], startLocal) > 1e-4) {
        runs.push(currentRun);
        currentRun = [startLocal];
      }
      if (dist(currentRun[currentRun.length - 1], endLocal) > 1e-4) {
        currentRun.push(endLocal);
      }
      continue;
    }

    anyErased = true;
    const outsideIntervals: { t0: number; t1: number }[] = [];
    let previousT = 0;
    for (const interval of insideIntervals) {
      if (interval.t0 - previousT > 1e-6) {
        outsideIntervals.push({ t0: previousT, t1: interval.t0 });
      }
      previousT = interval.t1;
    }
    if (1 - previousT > 1e-6) {
      outsideIntervals.push({ t0: previousT, t1: 1 });
    }

    if (outsideIntervals.length === 0) {
      if (currentRun.length > 0) {
        runs.push(currentRun);
        currentRun = [];
      }
      continue;
    }

    if (currentRun.length > 0 && outsideIntervals[0].t0 > 1e-6) {
      runs.push(currentRun);
      currentRun = [];
    }

    for (const interval of outsideIntervals) {
      const start = pointAt(a, b, interval.t0);
      const end = pointAt(a, b, interval.t1);
      const startLocal = { x: start.x - stroke.dx, y: start.y - stroke.dy };
      const endLocal = { x: end.x - stroke.dx, y: end.y - stroke.dy };

      if (currentRun.length === 0) currentRun.push(startLocal);
      else if (dist(currentRun[currentRun.length - 1], startLocal) > 1e-4) {
        runs.push(currentRun);
        currentRun = [startLocal];
      }

      if (dist(currentRun[currentRun.length - 1], endLocal) > 1e-4) {
        currentRun.push(endLocal);
      }

      if (interval.t1 < 1 - 1e-6) {
        runs.push(currentRun);
        currentRun = [];
      }
    }
  }

  if (currentRun.length > 0) runs.push(currentRun);
  if (!anyErased) return null;

  const next: Stroke[] = [];
  for (const points of runs) {
    if (points.length < minPointsToSave) continue;

    const d = pointsToSmoothPath(points);
    if (!d.trim()) continue;

    next.push({
      ...stroke,
      id: uid(),
      points,
      segmentBBoxes: buildSegmentBBoxes(points),
      d,
      bbox: computeBBox(points),
    });
  }

  return next;
}

export function splitStrokeByEraserPathPoints(
  stroke: Stroke,
  centers: Point[],
  radius: number,
  minPointsToSave: number,
) {
  if (centers.length === 0) return null;

  let parts: Stroke[] = [stroke];
  let changed = false;

  for (const center of centers) {
    if (parts.length === 0) break;

    const nextParts: Stroke[] = [];
    for (const part of parts) {
      const replaced = splitStrokeByEraserCircle(
        part,
        center,
        radius,
        minPointsToSave,
      );
      if (replaced === null) nextParts.push(part);
      else {
        changed = true;
        nextParts.push(...replaced);
      }
    }
    parts = nextParts;
  }

  return changed ? parts : null;
}

export function splitStrokeByEraserPathSegments(
  stroke: Stroke,
  pathPoints: Point[],
  radius: number,
  minPointsToSave: number,
) {
  if (pathPoints.length === 0) return null;
  if (pathPoints.length === 1) {
    return splitStrokeByEraserCircle(
      stroke,
      pathPoints[0],
      radius,
      minPointsToSave,
    );
  }

  let parts: Stroke[] = [stroke];
  let changed = false;

  for (let i = 0; i < pathPoints.length - 1; i++) {
    const from = pathPoints[i];
    const to = pathPoints[i + 1];
    if (parts.length === 0) break;

    const nextParts: Stroke[] = [];
    for (const part of parts) {
      const replaced =
        dist(from, to) < 1e-6
          ? splitStrokeByEraserCircle(part, from, radius, minPointsToSave)
          : splitStrokeByEraserSegment(part, from, to, radius, minPointsToSave);
      if (replaced === null) nextParts.push(part);
      else {
        changed = true;
        nextParts.push(...replaced);
      }
    }
    parts = nextParts;
  }

  return changed ? parts : null;
}

export function getStrokeBoundsOnPage(stroke: Stroke) {
  return {
    minX: stroke.bbox.minX + stroke.dx,
    minY: stroke.bbox.minY + stroke.dy,
    maxX: stroke.bbox.maxX + stroke.dx,
    maxY: stroke.bbox.maxY + stroke.dy,
  };
}

export function getStrokeBoundsAfterOffset(
  stroke: Stroke,
  offset: { dx: number; dy: number },
) {
  return {
    minX: stroke.bbox.minX + stroke.dx + offset.dx,
    minY: stroke.bbox.minY + stroke.dy + offset.dy,
    maxX: stroke.bbox.maxX + stroke.dx + offset.dx,
    maxY: stroke.bbox.maxY + stroke.dy + offset.dy,
  };
}

export function getSelectionBounds(strokes: Stroke[]) {
  if (strokes.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, centerX: 0, centerY: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const stroke of strokes) {
    const bounds = getStrokeBoundsOnPage(stroke);
    minX = Math.min(minX, bounds.minX);
    minY = Math.min(minY, bounds.minY);
    maxX = Math.max(maxX, bounds.maxX);
    maxY = Math.max(maxY, bounds.maxY);
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

export function transformStroke(
  stroke: Stroke,
  transform: (point: Point) => Point,
  nextId = uid(),
) {
  const translatedPoints = stroke.points.map((point) =>
    transform({ x: point.x + stroke.dx, y: point.y + stroke.dy }),
  );
  const points = translatedPoints.map((point) => ({ ...point }));
  const rebuiltAxisPath = (() => {
    if (
      (stroke.shapePreset !== "axis-2d" && stroke.shapePreset !== "axis-3d") ||
      points.length < 2
    ) {
      return null;
    }

    const from = points[0];
    const to = points[points.length - 1];
    const line = `M ${from.x} ${from.y} L ${to.x} ${to.y}`;

    if (stroke.dashed) return line;

    const vx = to.x - from.x;
    const vy = to.y - from.y;
    const len = Math.max(1, Math.hypot(vx, vy));
    const ux = vx / len;
    const uy = vy / len;
    const px = -uy;
    const py = ux;
    const size = 12;
    const leftPoint = {
      x: to.x - ux * size + px * (size * 0.45),
      y: to.y - uy * size + py * (size * 0.45),
    };
    const rightPoint = {
      x: to.x - ux * size - px * (size * 0.45),
      y: to.y - uy * size - py * (size * 0.45),
    };

    return `${line} M ${to.x} ${to.y} L ${leftPoint.x} ${leftPoint.y} M ${to.x} ${to.y} L ${rightPoint.x} ${rightPoint.y}`;
  })();

  return {
    ...stroke,
    id: nextId,
    points,
    segmentBBoxes: buildSegmentBBoxes(points),
    d: rebuiltAxisPath ?? pointsToSmoothPath(points),
    axisOrigin: stroke.axisOrigin ? transform(stroke.axisOrigin) : stroke.axisOrigin,
    axisHandle: stroke.axisHandle ? transform(stroke.axisHandle) : stroke.axisHandle,
    dx: 0,
    dy: 0,
    bbox: computeBBox(points),
  };
}
