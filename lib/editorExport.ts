import { Platform } from "react-native";

import { PAGE_H, PAGE_W, type PageBackground, type Stroke } from "@/lib/editorTypes";
import type { NoteKind } from "@/lib/noteDocument";
import { getBackgroundAsset } from "@/lib/webBackgroundAssets";

const INFINITE_EXPORT_MARGIN = 64;

function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getInfiniteExportBounds(
  strokes: Stroke[],
  pageWidth: number,
  pageHeight: number,
) {
  if (strokes.length === 0) {
    return { minX: 0, minY: 0, width: pageWidth, height: pageHeight };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const stroke of strokes) {
    const pad = Math.max(1, stroke.w / 2);
    minX = Math.min(minX, stroke.bbox.minX + stroke.dx - pad);
    minY = Math.min(minY, stroke.bbox.minY + stroke.dy - pad);
    maxX = Math.max(maxX, stroke.bbox.maxX + stroke.dx + pad);
    maxY = Math.max(maxY, stroke.bbox.maxY + stroke.dy + pad);
  }

  const croppedMinX = Math.max(0, Math.floor(minX - INFINITE_EXPORT_MARGIN));
  const croppedMinY = Math.max(0, Math.floor(minY - INFINITE_EXPORT_MARGIN));
  const croppedMaxX = Math.min(
    pageWidth,
    Math.ceil(maxX + INFINITE_EXPORT_MARGIN),
  );
  const croppedMaxY = Math.min(
    pageHeight,
    Math.ceil(maxY + INFINITE_EXPORT_MARGIN),
  );

  return {
    minX: croppedMinX,
    minY: croppedMinY,
    width: Math.max(1, croppedMaxX - croppedMinX),
    height: Math.max(1, croppedMaxY - croppedMinY),
  };
}

function getInfinitePageStyle(width: number, height: number) {
  const ratio = width / Math.max(1, height);
  if (ratio >= 1) {
    return { widthIn: 11, heightIn: Math.max(1, 11 / ratio) };
  }
  return { widthIn: Math.max(1, 11 * ratio), heightIn: 11 };
}

export async function exportNoteAsPdf({
  pages,
  pageBackgrounds,
  currentPageIndex,
  activePageStrokes,
  noteKind = "page",
  pageWidth = PAGE_W,
  pageHeight = PAGE_H,
}: {
  pages: Stroke[][];
  pageBackgrounds: PageBackground[];
  currentPageIndex: number;
  activePageStrokes: Stroke[];
  noteKind?: NoteKind;
  pageWidth?: number;
  pageHeight?: number;
}) {
  const snapshotPages =
    pages.length > 0 ? pages.map((page) => page.slice()) : [[] as Stroke[]];
  const snapshotBackgrounds =
    snapshotPages.length > 0
      ? snapshotPages.map(
          (_, i) =>
            pageBackgrounds[i] ?? {
              dataUrl: null,
              assetId: null,
              pdfUri: null,
              pdfPageNumber: null,
            },
        )
      : [{ dataUrl: null, assetId: null, pdfUri: null, pdfPageNumber: null }];
  const idx = Math.max(
    0,
    Math.min(snapshotPages.length - 1, currentPageIndex),
  );
  snapshotPages[idx] = activePageStrokes.slice();

  if (Platform.OS !== "web") {
    return;
  }

  const resolvedBackgroundUrls = await Promise.all(
    snapshotBackgrounds.map(async (background) => {
      if (background?.dataUrl) return background.dataUrl;
      if (background?.assetId) return getBackgroundAsset(background.assetId);
      return null;
    }),
  );

  const pageSvgs = snapshotPages
    .map((pageStrokes, pageIndex) => {
      const resolvedBackgroundUrl = resolvedBackgroundUrls[pageIndex];
      const exportBounds =
        noteKind === "infinite"
          ? getInfiniteExportBounds(pageStrokes, pageWidth, pageHeight)
          : { minX: 0, minY: 0, width: pageWidth, height: pageHeight };
      const infinitePageStyle =
        noteKind === "infinite"
          ? getInfinitePageStyle(exportBounds.width, exportBounds.height)
          : null;
      const paths = pageStrokes
        .map((stroke) => {
          const d = escapeHtml(stroke.d);
          const c = escapeHtml(stroke.c);
          const opacity = Number.isFinite(stroke.a) ? stroke.a : 1;
          const dash = stroke.dashed ? ` stroke-dasharray="6 6"` : "";
          return `<path d="${d}" stroke="${c}" stroke-opacity="${opacity}" stroke-width="${stroke.w}" fill="none" stroke-linecap="round" stroke-linejoin="round"${dash} transform="translate(${stroke.dx} ${stroke.dy})" />`;
        })
        .join("");
      const bgImg = resolvedBackgroundUrl
        ? `<img class="page-bg" src="${escapeHtml(resolvedBackgroundUrl)}" alt="" />`
        : "";

      return `<div class="page"${
        infinitePageStyle
          ? ` style="width:${infinitePageStyle.widthIn}in;height:${infinitePageStyle.heightIn}in;"`
          : ""
      }>${bgImg}<svg viewBox="${exportBounds.minX} ${exportBounds.minY} ${exportBounds.width} ${exportBounds.height}" xmlns="http://www.w3.org/2000/svg">${paths}</svg></div>`;
    })
    .join("");

  const title = `NeuraNote ${new Date().toISOString().slice(0, 10)}`;
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      @page { size: ${noteKind === "infinite" ? "auto" : "Letter portrait"}; margin: 0; }
      html, body { margin: 0; padding: 0; background: #ddd; }
      .page {
        width: 8.5in;
        height: 11in;
        background: #fff;
        margin: 0 auto 12px auto;
        page-break-after: always;
        break-after: page;
        position: relative;
        overflow: hidden;
      }
      .page:last-child { page-break-after: auto; break-after: auto; }
      .page .page-bg {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        z-index: 0;
      }
      .page svg {
        position: relative;
        z-index: 2;
        width: 100%;
        height: 100%;
        display: block;
      }
      @media print {
        html, body { background: #fff; }
        .page { margin: 0; box-shadow: none; }
      }
    </style>
  </head>
  <body>${pageSvgs}</body>
</html>`;

  const popup = window.open("", "_blank");
  if (!popup) return;
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  setTimeout(() => popup.print(), 120);
}
