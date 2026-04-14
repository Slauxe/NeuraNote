import { buildDocFromPages, normalizeDocToPages } from "../editorDocument";

describe("editorDocument", () => {
  it("normalizes malformed page documents into safe editor state", () => {
    const normalized = normalizeDocToPages({
      kind: "page",
      pages: [
        {
          strokes: [
            {
              points: [
                { x: 10, y: 20 },
                { x: "30", y: 40 },
              ],
              w: 6,
              c: "#123456",
              dx: 4,
              dy: -2,
            },
          ],
          backgroundDataUrl: "data:image/png;base64,abc",
        },
        {
          strokes: [{ points: [] }],
        },
      ],
      currentPageIndex: 99,
    });

    expect(normalized.kind).toBe("page");
    expect(normalized.pages).toHaveLength(2);
    expect(normalized.currentPageIndex).toBe(1);
    expect(normalized.pageBackgrounds).toEqual([
      {
        dataUrl: "data:image/png;base64,abc",
        assetId: null,
        pdfUri: null,
        pdfPageNumber: null,
      },
      {
        dataUrl: null,
        assetId: null,
        pdfUri: null,
        pdfPageNumber: null,
      },
    ]);

    expect(normalized.pages[0][0]).toMatchObject({
      w: 6,
      c: "#123456",
      dx: 4,
      dy: -2,
      points: [
        { x: 10, y: 20 },
        { x: 30, y: 40 },
      ],
    });
    expect(normalized.pages[1]).toEqual([]);
  });

  it("creates a default infinite board when board metadata is missing or invalid", () => {
    const normalized = normalizeDocToPages({
      kind: "infinite",
      board: { width: "bad", height: null, backgroundStyle: "weird" },
      strokes: [],
    });

    expect(normalized.kind).toBe("infinite");
    expect(normalized.board).toEqual({
      width: 2400,
      height: 1800,
      backgroundStyle: "grid",
    });
    expect(normalized.pages).toEqual([[]]);
    expect(normalized.pageBackgrounds).toEqual([
      { dataUrl: null, assetId: null, pdfUri: null, pdfPageNumber: null },
    ]);
  });

  it("builds versioned note docs with normalized backgrounds and board metadata", () => {
    const doc = buildDocFromPages(
      [
        [
          {
            id: "stroke-1",
            points: [
              { x: 1, y: 2 },
              { x: 3, y: 4 },
            ],
            segmentBBoxes: [{ minX: 1, minY: 2, maxX: 3, maxY: 4 }],
            d: "M 1 2 L 3 4",
            w: 5,
            c: "#111111",
            dx: 0,
            dy: 0,
            bbox: { minX: 1, minY: 2, maxX: 3, maxY: 4 },
          },
        ],
        [],
      ],
      [[], []],
      [
        {
          dataUrl: null,
          assetId: "bg-asset-1",
          pdfUri: "file:///tmp/doc.pdf",
          pdfPageNumber: 2,
        },
      ],
      0,
      "infinite",
      {
        width: 9000,
        height: 7000,
        backgroundStyle: "dots",
      },
    );

    expect(doc).toMatchObject({
      version: 1,
      kind: "infinite",
      currentPageIndex: 0,
      board: {
        width: 9000,
        height: 7000,
        backgroundStyle: "dots",
      },
    });
    expect(doc.pages).toEqual([
      {
        id: "page-1",
        strokes: [expect.objectContaining({ id: "stroke-1" })],
        textItems: [],
        backgroundAssetId: "bg-asset-1",
        backgroundPdfUri: "file:///tmp/doc.pdf",
        backgroundPdfPageNumber: 2,
      },
      {
        id: "page-2",
        strokes: [],
        textItems: [],
      },
    ]);
  });
});
