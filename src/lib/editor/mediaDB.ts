// GalaxyCut — mídia persistente no IndexedDB (os arquivos sobrevivem ao F5)
// localStorage guardava só os metadados; os blobs morriam no reload ("mídia não carregada").
// Agora o arquivo em si fica no IndexedDB do navegador e é revinculado no boot.
"use client";

const DB_NAME = "galaxycut";
const DB_VERSION = 1;
const STORE = "media";
/** acima disso o navegador pode reclamar de cota — aceita o risco de perder no reload */
const MAX_PERSIST_BYTES = 600 * 1024 * 1024;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve) => {
        if (!db) return resolve(undefined);
        try {
          const t = db.transaction(STORE, mode);
          const req = run(t.objectStore(STORE));
          req.onsuccess = () => resolve(req.result as T);
          req.onerror = () => resolve(undefined);
        } catch {
          resolve(undefined);
        }
      })
  );
}

export function idbPut(id: string, blob: Blob): void {
  if (blob.size > MAX_PERSIST_BYTES) return;
  void tx("readwrite", (s) => s.put(blob, id));
}

export async function idbGet(id: string): Promise<Blob | undefined> {
  return (await tx<Blob>("readonly", (s) => s.get(id) as IDBRequest<Blob>)) ?? undefined;
}

export function idbDel(id: string): void {
  void tx("readwrite", (s) => s.delete(id));
}

export function idbClear(): void {
  void tx("readwrite", (s) => s.clear());
}
