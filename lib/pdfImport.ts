import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

import type { NoteDoc } from "@/lib/notesStorage";
import { saveBackgroundAsset } from "@/lib/webBackgroundAssets";

const IMPORT_PAGE_W = 850;
const IMPORT_PAGE_H = 1100;
const MAX_IMPORT_PAGES = 25;
const PDFJS_CDN_BASE =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174";

type PdfJsApi = {
  getDocument: (args: any) => { promise: Promise<any> };
  GlobalWorkerOptions?: { workerSrc?: string };
};

export type ImportedPdfPayload = {
  pageCount: number;
  noteDoc: NoteDoc;
  warning: string | null;
  fileName: string;
};

async function pickPdfFileWeb(): Promise<File | null> {
  return new Promise((resolve) => {
    if (Platform.OS !== "web" || typeof document === "undefined") {
      resolve(null);
      return;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/pdf,.pdf";
    input.style.display = "none";

    input.onchange = () => {
      const file = input.files?.[0] ?? null;
      input.remove();
      resolve(file);
    };

    input.oncancel = () => {
      input.remove();
      resolve(null);
    };

    document.body.appendChild(input);
    input.click();
  });
}

async function renderPdfToPageBackgrounds(file: File): Promise<string[]> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("PDF import is only available in browser context.");
  }

  const webWindow = window as any;
  let pdfjs: PdfJsApi | null = webWindow.pdfjsLib ?? null;
  if (!pdfjs?.getDocument) {
    await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector(
        'script[data-pdfjs="cdn"]',
      ) as HTMLScriptElement | null;
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener(
          "error",
          () => reject(new Error("Failed to load PDF renderer.")),
          { once: true },
        );
        return;
      }

      const script = document.createElement("script");
      script.src = `${PDFJS_CDN_BASE}/pdf.min.js`;
      script.async = true;
      script.defer = true;
      script.setAttribute("data-pdfjs", "cdn");
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load PDF renderer."));
      document.head.appendChild(script);
    });
    pdfjs = webWindow.pdfjsLib ?? null;
  }
  if (!pdfjs?.getDocument) {
    throw new Error("PDF renderer failed to load.");
  }
  if (pdfjs.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN_BASE}/pdf.worker.min.js`;
  }

  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({
    data,
    disableWorker: true,
  });
  const doc = await loadingTask.promise;
  const pageCount = Math.min(doc.numPages, MAX_IMPORT_PAGES);
  const pageImages: string[] = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i);
    const baseViewport = page.getViewport({ scale: 1 });
    const fitScale = Math.min(
      IMPORT_PAGE_W / baseViewport.width,
      IMPORT_PAGE_H / baseViewport.height,
    );
    const viewport = page.getViewport({
      scale: Math.max(0.5, Math.min(2.5, fitScale)),
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;

    await page.render({ canvasContext: ctx as any, viewport }).promise;
    pageImages.push(canvas.toDataURL("image/jpeg", 0.9));
  }

  return pageImages;
}

async function renderPdfToWebAssetPages(
  file: File,
): Promise<{ assetId: string | null; dataUrl: string | null }[]> {
  const pageImages = await renderPdfToPageBackgrounds(file);
  const assetIds = await Promise.all(
    pageImages.map((dataUrl) => saveBackgroundAsset(dataUrl)),
  );

  return pageImages.map((dataUrl, index) => ({
    assetId: assetIds[index],
    dataUrl: assetIds[index] ? null : dataUrl,
  }));
}

async function copyPdfToLocalImports(sourceUri: string): Promise<string> {
  const documentDir = (FileSystem as any).documentDirectory;
  if (!documentDir) {
    throw new Error("Missing document directory");
  }
  const importDir = `${documentDir}notes/imports/`;
  await FileSystem.makeDirectoryAsync(importDir, { intermediates: true });
  const target = `${importDir}${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.pdf`;
  await FileSystem.copyAsync({ from: sourceUri, to: target });
  return target;
}

export async function importPdfAsNoteDoc(): Promise<ImportedPdfPayload | null> {
  if (Platform.OS === "web") {
    const file = await pickPdfFileWeb();
    if (!file) return null;

    const pages = await renderPdfToWebAssetPages(file);
    if (pages.length === 0) {
      throw new Error("This PDF could not be imported.");
    }

    let warning: string | null = null;
    if (file.size > 20 * 1024 * 1024) {
      warning = "Large PDF imported. Performance may be slower.";
    } else if (pages.length >= MAX_IMPORT_PAGES) {
      warning = `Imported first ${MAX_IMPORT_PAGES} pages.`;
    }

    return {
      fileName: file.name,
      pageCount: pages.length,
      warning,
      noteDoc: {
        version: 1,
        kind: "page",
        strokes: [],
        pages: pages.map((background, index) => ({
          id: `page-${index + 1}`,
          strokes: [],
          ...(background.assetId
            ? { backgroundAssetId: background.assetId }
            : {}),
          ...(background.dataUrl
            ? { backgroundDataUrl: background.dataUrl }
            : {}),
        })),
        currentPageIndex: 0,
      },
    };
  }

  const picked = await DocumentPicker.getDocumentAsync({
    type: "application/pdf",
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (picked.canceled) return null;

  const asset = picked.assets?.[0];
  if (!asset?.uri) {
    throw new Error("Could not read selected file.");
  }

  const bytes = await fetch(asset.uri).then((response) => response.arrayBuffer());
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const fullCount = pdf.getPageCount();
  const pageCount = Math.min(fullCount, MAX_IMPORT_PAGES);
  const localPdfUri = await copyPdfToLocalImports(asset.uri);

  return {
    fileName: asset.name ?? "Imported PDF",
    pageCount,
    warning:
      fullCount > MAX_IMPORT_PAGES
        ? `Imported first ${MAX_IMPORT_PAGES} pages.`
        : null,
    noteDoc: {
      version: 1,
      kind: "page",
      strokes: [],
      pages: Array.from({ length: pageCount }, (_, index) => ({
        id: `page-${index + 1}`,
        strokes: [],
        backgroundPdfUri: localPdfUri,
        backgroundPdfPageNumber: index + 1,
      })),
      currentPageIndex: 0,
    },
  };
}
