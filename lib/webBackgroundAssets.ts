import type { PageBackground } from "@/lib/editorTypes";

const DB_NAME = "neuranote-web-assets";
const DB_VERSION = 1;
const STORE_NAME = "pageBackgrounds";
const assetUrlCache = new Map<string, string>();

type BackgroundAssetRecord = {
  id: string;
  dataUrl: string;
  createdAt: number;
};

function isIndexedDbAvailable() {
  return typeof indexedDB !== "undefined";
}

async function openDb(): Promise<IDBDatabase | null> {
  if (!isIndexedDbAvailable()) return null;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Failed to open web asset database."));
  });
}

function runRequest<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function uid() {
  return `bg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export async function saveBackgroundAsset(dataUrl: string): Promise<string | null> {
  if (!dataUrl || !isIndexedDbAvailable()) return null;

  const db = await openDb();
  if (!db) return null;

  const id = uid();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  await runRequest(
    store.put({
      id,
      dataUrl,
      createdAt: Date.now(),
    } satisfies BackgroundAssetRecord),
  );
  assetUrlCache.set(id, dataUrl);
  return id;
}

export async function getBackgroundAsset(assetId: string): Promise<string | null> {
  if (!assetId) return null;
  const cached = assetUrlCache.get(assetId);
  if (cached) return cached;
  if (!isIndexedDbAvailable()) return null;

  const db = await openDb();
  if (!db) return null;

  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  const record = await runRequest(
    store.get(assetId) as IDBRequest<BackgroundAssetRecord | undefined>,
  );
  if (!record?.dataUrl) return null;

  assetUrlCache.set(assetId, record.dataUrl);
  return record.dataUrl;
}

export async function deleteBackgroundAsset(assetId: string): Promise<void> {
  if (!assetId || !isIndexedDbAvailable()) return;

  const db = await openDb();
  if (!db) return;

  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  await runRequest(store.delete(assetId));
  assetUrlCache.delete(assetId);
}

export async function migratePageBackgroundsToAssets(
  backgrounds: PageBackground[],
): Promise<{ backgrounds: PageBackground[]; changed: boolean }> {
  if (!isIndexedDbAvailable()) {
    return { backgrounds, changed: false };
  }

  let changed = false;
  const nextBackgrounds: PageBackground[] = [];

  for (const background of backgrounds) {
    if (!background?.dataUrl || background.assetId) {
      nextBackgrounds.push(background);
      continue;
    }

    const assetId = await saveBackgroundAsset(background.dataUrl);
    if (!assetId) {
      nextBackgrounds.push(background);
      continue;
    }

    changed = true;
    nextBackgrounds.push({
      ...background,
      dataUrl: null,
      assetId,
    });
  }

  return { backgrounds: nextBackgrounds, changed };
}
