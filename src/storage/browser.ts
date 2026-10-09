import type { Journal, JournalCommit } from '../types.js';
export async function openBrowserJournal(name: string): Promise<Journal> {
  if (!globalThis.navigator?.locks) throw new Error('Web Locks requires a secure browser context (HTTPS or localhost)');
  let unlock!: () => void;
  let acquired!: () => void;
  let denied!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => { acquired = resolve; denied = reject; });
  const lock = navigator.locks.request(`pi-wasm-kit:${name}`, { ifAvailable: true }, async token => {
    if (!token) { denied(new Error('This journal is already open in another tab')); return; }
    await new Promise<void>(resolve => { unlock = resolve; acquired(); });
  });
  void lock.catch(denied);
  await ready;
  let db: IDBDatabase;
  try {
    db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(`pi-wasm-kit:${name}`, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('commits', { keyPath: 'seq' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (error) { unlock(); await lock; throw error; }
  let closed = false;
  let tail = Promise.resolve();
  return {
    async load() {
      if (closed) throw new Error('Journal is closed');
      return new Promise((resolve, reject) => {
        const tx = db.transaction('commits', 'readonly');
        const request = tx.objectStore('commits').getAll();
        tx.oncomplete = () => resolve(request.result);
        tx.onabort = () => reject(tx.error ?? new Error('Journal read aborted'));
      });
    },
    append(commit: JournalCommit) {
      if (closed) return Promise.reject(new Error('Journal is closed'));
      const snapshot = structuredClone(commit);
      const write = tail.then(() => new Promise<void>((resolve, reject) => {
        const tx = db.transaction('commits', 'readwrite', { durability: 'strict' });
        const store = tx.objectStore('commits');
        const count = store.count();
        count.onsuccess = () => {
          if (snapshot.seq !== count.result + 1) { tx.abort(); return; }
          store.add(snapshot);
        };
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error ?? new Error('Journal sequence conflict'));
      }));
      tail = write; return write;
    },
    async close() { if (closed) return; closed = true; try { await tail; } finally { db.close(); unlock(); await lock; } },
  };
}
