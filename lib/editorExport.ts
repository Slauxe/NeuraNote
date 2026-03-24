import { Platform } from "react-native";

import { PAGE_H, PAGE_W, type PageBackground, type Stroke } from "@/lib/editorTypes";

function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function exportNoteAsPdf({
  pages,
  pageBackgrounds,
  currentPageIndex,
  activePageStrokes,
}: {
  pages: Stroke[][];
  pageBackgrounds: PageBackground[];
  currentPageIndex: number;
  activePageStrokes: Stroke[];
}) {
  const snapshotPages =
    pages.length > 0 ? pages.map((page) => page.slice()) : [[] as Stroke[]];
  const snapshotBackgrounds =
    snapshotPages.length > 0
      ? snapshotPages.map(
          (_, i) =>
            pageBackgrounds[i] ?? {
              dataUrl: null,
              pdfUri: null,
              pdfPageNumber: null,
            },
        )
      : [{ dataUrl: null, pdfUri: null, pdfPageNumber: null }];
  const idx = Math.max(
    0,
    Math.min(snapshotPages.length - 1, currentPageIndex),
  );
  snapshotPages[idx] = activePageStrokes.slice();

  if (Platform.OS !== "web") {
    return;
  }

  const pageSvgs = snapshotPages
    .map((pageStrokes, pageIndex) => {
      const bg = snapshotBackgrounds[pageIndex];
      const paths = pageStrokes
        .map((stroke) => {
          const d = escapeHtml(stroke.d);
          const c = escapeHtml(stroke.c);
          return `<path d="${d}" stroke="${c}" stroke-width="${stroke.w}" fill="none" stroke-linecap="round" stroke-linejoin="round" transform="translate(${stroke.dx} ${stroke.dy})" />`;
        })
        .join("");
      const bgImg = bg?.dataUrl
        ? `<img class="page-bg" src="${escapeHtml(bg.dataUrl)}" alt="" />`
        : "";

      return `<div class="page">${bgImg}<svg viewBox="0 0 ${PAGE_W} ${PAGE_H}" xmlns="http://www.w3.org/2000/svg">${paths}</svg></div>`;
    })
    .join("");

  const title = `NeuraNote ${new Date().toISOString().slice(0, 10)}`;
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      @page { size: Letter portrait; margin: 0; }
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
