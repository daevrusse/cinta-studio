// Persistencia local con IndexedDB: proyecto + archivos multimedia (autoguardado).
const DB_NAME = 'cinta-studio';
let dbp;

function db() {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('media')) d.createObjectStore('media');
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  return dbp;
}

async function run(store, mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => res(req?.result);
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error);
  });
}

export const putMedia = (id, rec) => run('media', 'readwrite', (s) => s.put(rec, id)).catch((e) => console.warn('IDB putMedia', e));
export const deleteMedia = (id) => run('media', 'readwrite', (s) => s.delete(id)).catch(() => {});
export const getAllMedia = () => run('media', 'readonly', (s) => s.getAll()).catch(() => []);
export const clearMedia = () => run('media', 'readwrite', (s) => s.clear()).catch(() => {});
export const setKV = (k, v) => run('kv', 'readwrite', (s) => s.put(v, k)).catch((e) => console.warn('IDB setKV', e));
export const getKV = (k) => run('kv', 'readonly', (s) => s.get(k)).catch(() => undefined);
