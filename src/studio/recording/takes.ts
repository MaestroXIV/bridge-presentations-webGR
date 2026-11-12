/**
 * Local storage of recorded takes in IndexedDB. One take per board per
 * session; a new take of the same board replaces the old one. Nothing here
 * ever leaves the browser.
 */
export interface Take {
  /** `${sessionKey}::${boardId}` */
  key: string;
  sessionKey: string;
  boardId: string;
  blob: Blob;
  mime: string;
  durationMs: number;
  createdAt: number;
}

const DB_NAME = "bridge-presenter";
const STORE = "takes";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: "key" });
        s.createIndex("session", "sessionKey");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        t.oncomplete = () => {
          db.close();
          resolve(req.result);
        };
        t.onerror = () => {
          db.close();
          reject(t.error);
        };
      }),
  );
}

export function takeKey(sessionKey: string, boardId: string): string {
  return `${sessionKey}::${boardId}`;
}

export function saveTake(take: Omit<Take, "key">): Promise<Take> {
  const t: Take = { ...take, key: takeKey(take.sessionKey, take.boardId) };
  return tx("readwrite", (s) => s.put(t)).then(() => t);
}

export function listTakes(sessionKey: string): Promise<Take[]> {
  return tx("readonly", (s) => s.index("session").getAll(sessionKey) as IDBRequest<Take[]>);
}

export function deleteTake(sessionKey: string, boardId: string): Promise<undefined> {
  return tx("readwrite", (s) => s.delete(takeKey(sessionKey, boardId)) as IDBRequest<undefined>);
}

/** A short stable key for a session, so takes survive a reload of the same file. */
export function sessionKeyOf(title: string, boardIds: string[], hands: string[]): string {
  const text = `${title}|${boardIds.join(",")}|${hands.join("|")}`;
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `s${(h >>> 0).toString(36)}`;
}
