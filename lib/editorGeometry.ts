import {
  INFINITE_CANVAS_H,
  INFINITE_CANVAS_W,
  PAGE_H,
  PAGE_W,
  type Point,
  type Stroke,
} from "@/lib/editorTypes";
import type { NoteKind } from "@/lib/noteDocument";

export function getCanvasSize(noteKind: NoteKind) {
  return noteKind === "infinite"
    ? { width: INFINITE_CANVAS_W, height: INFINITE_CANVAS_H }
    : { width: PAGE_W, height: PAGE_H };
}

export function dist(a: Point, b: Point) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function mid(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
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

export function bboxOverlap(
  a: { minX: number; minY: number; maxX: number; maxY: number },
  b: { minX: number; minY: number; maxX: number; maxY: number },
) {
  return !(
    a.maxX < b.minX ||
    a.minX > b.maxX ||
    a.maxY < b.minY ||
    a.minY > b.maxY
  );
}

export function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function pointAt(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function lerpPoint(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function smoothTowards(prev: Point, next: Point, alpha: number): Point {
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
